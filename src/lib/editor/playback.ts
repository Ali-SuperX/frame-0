"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorClip, EditorProject, EditorTrack } from "@/lib/store";
import { DEFAULT_TRACKS } from "@/lib/store";
import { clipAt, projectEndSec } from "./timeline";

/**
 * Multi-track playback engine.
 *
 * Architecture:
 *   - rAF loop advances `currentTime` while playing.
 *   - For each video track, the consumer renders a <video> element and
 *     registers its ref via `registerVideoEl`. The engine then syncs
 *     each element's src + currentTime + playbackRate to match the
 *     active clip on that track at the current project time.
 *   - For each audio track (a1/a2), the engine drives a single <audio>
 *     element similarly. Audio mixing is "play in parallel" — multiple
 *     tracks play simultaneously through their own elements.
 *   - Solo: if any track has `solo: true`, only solo tracks emit audio.
 *
 * The engine doesn't compose video frames — it just keeps elements in sync.
 * The Preview component stacks them with z-index for picture-in-picture.
 */

const SYNC_THRESHOLD_SEC = 0.15; // re-sync video.currentTime if drift exceeds this

/**
 * Compute instantaneous speed multiplier for a speed curve at a given
 * progress point (0..1 within clip render duration).
 * Returns a factor relative to the base speed (e.g. 1.0 = no change).
 */
function speedCurveMultiplier(curve: string | undefined, progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (curve) {
    case "ease-in":
      // Slow start, accelerate: speed = 2t (average 1.0)
      return 0.4 + 1.2 * t;
    case "ease-out":
      // Fast start, decelerate: speed = 2(1-t) (average 1.0)
      return 1.6 - 1.2 * t;
    case "ease-in-out":
      // Slow-fast-slow (sine curve, average ≈ 1.0)
      return 0.5 + Math.sin(t * Math.PI) * 0.5 + 0.5;
    case "ramp-up":
      // Steady acceleration from 0.5x to 1.5x
      return 0.5 + t;
    case "ramp-down":
      // Steady deceleration from 1.5x to 0.5x
      return 1.5 - t;
    default: // "linear" or undefined
      return 1.0;
  }
}

/** Map filter presets to CSS filter strings for live preview. */
function filterToCss(filter: string | undefined): string {
  switch (filter) {
    case "warm":
      return "sepia(0.2) saturate(1.3) brightness(1.05)";
    case "cool":
      return "saturate(0.9) hue-rotate(15deg) brightness(1.02)";
    case "cinematic":
      return "contrast(1.15) saturate(0.85) brightness(0.95)";
    case "bw":
      return "grayscale(1)";
    case "vintage":
      return "sepia(0.35) contrast(1.1) brightness(0.95) saturate(0.8)";
    case "vivid":
      return "saturate(1.6) contrast(1.1)";
    case "dramatic":
      return "contrast(1.3) brightness(0.9) saturate(1.2)";
    case "pastel":
      return "saturate(0.6) brightness(1.1) contrast(0.9)";
    default:
      return "";
  }
}

export interface ActiveClipInfo {
  trackId: string;
  clip: EditorClip | undefined;
  /** Time within the source file (after applying clip.in + speed). */
  sourceTime: number;
}

export interface PlaybackController {
  currentTime: number;
  isPlaying: boolean;
  totalDuration: number;
  /** All tracks (deduped) ordered as project specifies. */
  tracks: EditorTrack[];
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (sec: number) => void;
  /** Active clip per track at the current time. */
  activeByTrack: Record<string, EditorClip | undefined>;
  /** Register a video/audio element so the engine can sync it. */
  registerEl: (trackId: string, el: HTMLMediaElement | null) => void;
  /** Returns a **stable** ref callback per trackId — use this in JSX
   *  (`ref={playback.refFor(t.id)}`) instead of `ref={(el) => registerEl(t.id, el)}`.
   *  The inline arrow form creates a new callback every render, which makes
   *  React call ref(null) + ref(el) on every reconcile, triggering registerEl's
   *  cache-clearing logic → next sync effect re-runs `el.src=...; el.load()` →
   *  black flash. See `refFor` impl below. */
  refFor: (trackId: string) => (el: HTMLMediaElement | null) => void;
  /** 全局播放速度倍率 —— 在 clip.speed 之上再乘一层。JKL 速度环用它:
   *  L 加速 / J 减速 / K 复位 1。默认 1。范围 [0.1, 16]。
   *  写入后 sync effect 会立刻 propagate 到所有 video/audio 元素。 */
  setRateMultiplier: (rate: number) => void;
  getRateMultiplier: () => number;
}

export function usePlayback(project: EditorProject): PlaybackController {
  const tracks: EditorTrack[] = project.tracks ?? DEFAULT_TRACKS;
  const clips = project.clips ?? [];
  const totalDuration = useMemo(() => projectEndSec(clips), [clips]);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for play loop without re-running the tick effect on every step.
  const playStartWallRef = useRef(0);
  const playStartTimeRef = useRef(0);
  const tickIntervalRef = useRef<number | null>(null);

  // Per-track media elements, keyed by trackId.
  const elsRef = useRef<Record<string, HTMLMediaElement | null>>({});

  // Per-track last intentionally set source URL — prevents repeated load()
  // on dead blob: URLs where el.src reverts on error causing an infinite loop.
  const lastSetSrcRef = useRef<Record<string, string>>({});

  // 全局速度倍率 —— 在 clip.speed 之上再乘一层,JKL 速度环改它。
  // 用 ref 而非 state 因为 sync effect 不需要 react render(直接在 30Hz 心跳读)。
  const rateMultiplierRef = useRef<number>(1);

  // Compute active clip per track at currentTime. Returns a stable
  // map for render, recomputed every time `currentTime` changes.
  const activeByTrack = useMemo(() => {
    const out: Record<string, EditorClip | undefined> = {};
    for (const t of tracks) out[t.id] = clipAt(clips, t.id, currentTime);
    return out;
  }, [tracks, clips, currentTime]);

  // Solo gating: if any track has solo=true, only solo tracks emit audio.
  const anySolo = tracks.some((t) => t.solo);
  const audibleTrack = useCallback(
    (track: EditorTrack): boolean => {
      if (track.muted) return false;
      if (track.hidden && track.kind === "audio") return false;
      if (anySolo && !track.solo) return false;
      return true;
    },
    [anySolo]
  );

  // ── Tick loop (setInterval ~30 Hz) ───────────────────────────────
  // setInterval rather than rAF: continues to fire when the tab is hidden,
  // and 30 Hz is plenty for UI state sync — the actual <video> elements
  // play at their native frame rate independently.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - playStartWallRef.current) / 1000;
      const t = playStartTimeRef.current + elapsed;
      if (t >= totalDuration) {
        setCurrentTime(totalDuration);
        setIsPlaying(false);
        return;
      }
      setCurrentTime(t);
    }, 33);
    tickIntervalRef.current = id;
    return () => window.clearInterval(id);
  }, [isPlaying, totalDuration]);

  // ── Sync media elements every frame ──────────────────────────────
  useEffect(() => {
    for (const track of tracks) {
      const el = elsRef.current[track.id];
      if (!el) continue;
      const active = activeByTrack[track.id];

      if (!active) {
        if (!el.paused) el.pause();
        continue;
      }

      try {
        const startSec = active.startSec ?? 0;
        const within = currentTime - startSec;
        const sourceTime = active.in + within * (active.speed || 1);

        // Switch source if changed
        if (active.sourceUrl && lastSetSrcRef.current[track.id] !== active.sourceUrl) {
          lastSetSrcRef.current[track.id] = active.sourceUrl;
          el.src = active.sourceUrl;
          el.load();
        }

        // Sync currentTime if drift exceeds threshold.
        if (
          Number.isFinite(sourceTime) &&
          Math.abs(el.currentTime - sourceTime) > SYNC_THRESHOLD_SEC
        ) {
          try { el.currentTime = sourceTime; } catch { /* not yet ready */ }
        }

        const renderDur = Math.max(0.01, (active.out - active.in) / (active.speed || 1));

        // Speed curve · 乘上全局 JKL 速度倍率
        const baseSpeed = active.speed || 1;
        const globalRate = rateMultiplierRef.current;
        if (active.speedCurve && active.speedCurve !== "linear") {
          const progress = Math.max(0, Math.min(1, within / renderDur));
          const mult = speedCurveMultiplier(active.speedCurve, progress);
          el.playbackRate = Math.max(0.1, Math.min(16, baseSpeed * mult * globalRate));
        } else {
          el.playbackRate = Math.max(0.1, Math.min(16, baseSpeed * globalRate));
        }

        // Audio gating + fade envelope.
        const audible = audibleTrack(track);
        const clipMuted = active.muted || active.volume === 0;
        el.muted = !audible || clipMuted;
        let vol = active.volume ?? 1;
        if (active.fadeIn && active.fadeIn > 0 && within < active.fadeIn) {
          vol *= within / active.fadeIn;
        }
        if (active.fadeOut && active.fadeOut > 0 && (renderDur - within) < active.fadeOut) {
          vol *= (renderDur - within) / active.fadeOut;
        }
        el.volume = Math.max(0, Math.min(1, vol));

        // Opacity + Color adjustments (video elements only) —— 实时预览
        // Inspector 里改的画面效果(亮度/对比度/饱和度/滤镜)立刻在预览生效,
        // 不必等导出。CSS filter 是 GPU 加速,不影响性能。
        if (el instanceof HTMLVideoElement) {
          const opacity = active.opacity ?? 1;
          let visualOpacity = opacity;
          if (active.fadeIn && active.fadeIn > 0 && within < active.fadeIn) {
            visualOpacity *= within / active.fadeIn;
          }
          if (active.fadeOut && active.fadeOut > 0 && (renderDur - within) < active.fadeOut) {
            visualOpacity *= (renderDur - within) / active.fadeOut;
          }
          const opStr = visualOpacity < 1 ? String(Math.max(0, Math.min(1, visualOpacity))) : "";
          if (el.style.opacity !== opStr) el.style.opacity = opStr;

          // 调色 + 滤镜 —— 拼接 CSS filter
          const parts: string[] = [];
          const adjBright = active.adjust?.brightness ?? 0;
          const adjContrast = active.adjust?.contrast ?? 1;
          const adjSaturation = active.adjust?.saturation ?? 1;
          if (adjBright !== 0) parts.push(`brightness(${1 + adjBright})`);
          if (adjContrast !== 1) parts.push(`contrast(${adjContrast})`);
          if (adjSaturation !== 1) parts.push(`saturate(${adjSaturation})`);
          const presetCss = filterToCss(active.filter);
          if (presetCss) parts.push(presetCss);
          const filterStr = parts.join(" ");
          if (el.style.filter !== filterStr) el.style.filter = filterStr;
        }
      } catch {
        // Prevent a single track sync error from breaking all tracks
      }

      // Play/pause state — outside try/catch so it always runs.
      if (isPlaying && el.paused) {
        el.play().catch(() => { /* autoplay may block until user gesture */ });
      } else if (!isPlaying && !el.paused) {
        el.pause();
      }
    }
  }, [activeByTrack, isPlaying, currentTime, tracks, audibleTrack]);

  // ── Public API ───────────────────────────────────────────────────
  const play = useCallback(() => {
    setCurrentTime((t) => {
      const start = t >= totalDuration ? 0 : t;
      playStartWallRef.current = performance.now();
      playStartTimeRef.current = start;
      return start;
    });
    setIsPlaying(true);
  }, [totalDuration]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(totalDuration, sec));
      setCurrentTime(clamped);
      if (isPlaying) {
        playStartWallRef.current = performance.now();
        playStartTimeRef.current = clamped;
      }
    },
    [totalDuration, isPlaying]
  );

  const registerEl = useCallback(
    (trackId: string, el: HTMLMediaElement | null) => {
      const prev = elsRef.current[trackId];
      elsRef.current[trackId] = el;
      // 清 src 缓存的判定 —— 之前是 `el && el !== prev`,但有个坑:
      // 调用者写 `ref={(el) => registerEl(t.id, el)}`(inline arrow)时,
      // React 每次 render 都 call 旧 ref(null) + 新 ref(realEl) —— 哪怕 DOM 没变。
      // 旧逻辑会把 `realEl !== null` 判成"新挂载",清缓存 → sync effect 重新
      // `el.src=...; el.load()` → 黑屏闪烁。
      //
      // 真正的"新挂载"特征:新 el 的 `.src` 是空字符串(浏览器初始态)。
      // 老 el 重新被 ref 调一次时 `.src` 已经有值,不该清缓存。
      // 调用方应该用 `playback.refFor(trackId)` 拿稳定 callback,避免这种重复 ref 调用;
      // 这里的 `!el.src` 检查是兜底,以防其它代码路径出现 inline ref。
      if (el && el !== prev && !el.src) {
        delete lastSetSrcRef.current[trackId];
      }
    },
    []
  );

  // Stable ref-callback factory: same trackId → same function reference.
  // Cached in a ref Map so it survives re-renders and never invalidates memo.
  const refCallbacksRef = useRef<
    Record<string, (el: HTMLMediaElement | null) => void>
  >({});
  const refFor = useCallback(
    (trackId: string) => {
      let cb = refCallbacksRef.current[trackId];
      if (!cb) {
        cb = (el: HTMLMediaElement | null) => registerEl(trackId, el);
        refCallbacksRef.current[trackId] = cb;
      }
      return cb;
    },
    [registerEl]
  );

  const setRateMultiplier = useCallback((rate: number) => {
    const clamped = Math.max(0.1, Math.min(16, rate));
    rateMultiplierRef.current = clamped;
    // 立即写入当前活跃的 el,不等下一帧 sync(让用户连按 JKL 时反馈即时)
    for (const trackId in elsRef.current) {
      const el = elsRef.current[trackId];
      if (el) {
        try { el.playbackRate = clamped; } catch { /* ignore */ }
      }
    }
  }, []);
  const getRateMultiplier = useCallback(() => rateMultiplierRef.current, []);

  return {
    currentTime,
    isPlaying,
    totalDuration,
    tracks,
    play,
    pause,
    togglePlay,
    seek,
    activeByTrack,
    registerEl,
    refFor,
    setRateMultiplier,
    getRateMultiplier,
  };
}
