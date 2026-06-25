"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { EditorClip } from "@/lib/store";

/** 模块级缩略图条带缓存 —— 按 `${sourceUrl}|${in}|${out}|${count}` 存 dataURL。
 *  抽帧成本很高:创建 video element + N 次 seek + drawImage + toDataURL,
 *  一个 10s clip 大约 200-500ms。如果不缓存,每次 clip 在 timeline 上重 mount
 *  (例如多选/缩放/拖动后)都会重抽,体感卡顿明显。
 *
 *  容量上限 200 条 dataURL,每条 ~50KB JPEG,全局 ~10MB,可接受。FIFO 驱逐。 */
const THUMB_CACHE = new Map<string, string>();
const MAX_THUMB_CACHE = 200;

function thumbKey(sourceUrl: string, inSec: number, outSec: number, count: number): string {
  return `${sourceUrl}|${inSec.toFixed(3)}|${outSec.toFixed(3)}|${count}`;
}

type ClipBlockProps = {
  clip: EditorClip;
  totalDuration: number;
  isSelected: boolean;
  isPlaying: boolean;
  /** click 选中。参数 `meta.shiftKey=true` 表示用户按住 Shift,调用方应做
   *  "加入/移出 multi-selection" 处理(单选时 setSelected,多选时 toggle)。 */
  onSelect: (meta?: { shiftKey?: boolean }) => void;
  onTrim: (patch: Partial<EditorClip>) => void;
  /** Called when another clip is dropped onto this block; arg is dragged clip id. */
  onReorderDrop?: (fromId: string) => void;
  pxPerSec: number;
  /** Called while dragging the clip body horizontally to update startSec. */
  onMove?: (newStartSec: number) => void;
  /** Sec values to snap toward when dragging (other clip edges, playhead, 0). */
  snapTargets?: number[];
  snapEnabled?: boolean;
  /** Called during drag with the snap target sec, or null when no snap. */
  onSnapIndicator?: (snapSec: number | null) => void;
  /** Right-click context menu on the clip. */
  onContextMenu?: (e: React.MouseEvent) => void;
};

/** memo 的 propsEqual —— 只比影响视觉的字段,故意忽略 callback 引用和
 *  `snapTargets`(它在 drag 中频繁变化,如果加进比较 memo 几乎总失效;
 *  callback 内部读 store 最新值,引用变化不影响行为)。
 *
 *  这个 memo 是 Phase 1 性能急救的核心 —— 配合 `playback.refFor()` 稳定 ref,
 *  播放循环 30Hz 触发 Editor 整树 re-render 时,N 个 clip block 不再 N 次重 render。 */
function arePropsEqual(a: ClipBlockProps, b: ClipBlockProps): boolean {
  const ca = a.clip;
  const cb = b.clip;
  if (ca !== cb) {
    if (
      ca.id !== cb.id ||
      ca.startSec !== cb.startSec ||
      ca.in !== cb.in ||
      ca.out !== cb.out ||
      ca.speed !== cb.speed ||
      ca.duration !== cb.duration ||
      ca.muted !== cb.muted ||
      ca.sourceUrl !== cb.sourceUrl ||
      ca.mediaType !== cb.mediaType ||
      ca.sourceTitle !== cb.sourceTitle ||
      ca.transition !== cb.transition ||
      ca.speedCurve !== cb.speedCurve ||
      ca.filter !== cb.filter
    ) {
      return false;
    }
  }
  return (
    a.isSelected === b.isSelected &&
    a.isPlaying === b.isPlaying &&
    a.pxPerSec === b.pxPerSec &&
    a.snapEnabled === b.snapEnabled
  );
}

/**
 * A single clip block on a track lane. Handles:
 *   - Absolute positioning by startSec * pxPerSec
 *   - Trim handles (left/right) with pointer-drag
 *   - Body drag-to-move with snap
 *   - Cross-track HTML5 drag (vertical movement)
 *   - Frame-thumbnail filmstrip background
 */
export const TimelineClipBlock = memo(function TimelineClipBlock({
  clip,
  isSelected,
  isPlaying,
  onSelect,
  onTrim,
  onReorderDrop,
  pxPerSec,
  onMove,
  snapTargets,
  snapEnabled,
  onSnapIndicator,
  onContextMenu,
}: ClipBlockProps) {
  const [dragOver, setDragOver] = useState(false);
  const [thumbStrip, setThumbStrip] = useState<string | null>(null);
  const mediaType = clip.mediaType ?? "video";
  const isAudio = mediaType === "audio";
  const isImage = mediaType === "image";
  const renderDur = Math.max(0.1, (clip.out - clip.in) / (clip.speed || 1));
  const widthPx = Math.max(40, renderDur * pxPerSec);
  const leftPx = (clip.startSec ?? 0) * pxPerSec;
  // Extract frame thumbnails for filmstrip background.
  useEffect(() => {
    let cancelled = false;
    const src = clip.sourceUrl;
    if (!src) return;

    if (isAudio) {
      return;
    }

    if (isImage) {
      const img = new Image();
      // No crossOrigin — blob URLs are same-origin, remote URLs may lack
      // CORS headers. Tainted canvas is caught below.
      img.onload = () => {
        if (cancelled) return;
        try { setThumbStrip(src); } catch { /* ignore */ }
      };
      img.src = src;
      return () => { cancelled = true; };
    }

    const THUMB_H = 40;
    const THUMB_W = Math.round((THUMB_H * 16) / 9);
    const COUNT = Math.min(12, Math.max(3, Math.ceil((clip.out - clip.in) / 1)));

    // 命中缓存:直接走,不重抽帧
    const cacheKey = thumbKey(src, clip.in, clip.out, COUNT);
    const cached = THUMB_CACHE.get(cacheKey);
    if (cached) {
      setThumbStrip(cached);
      return;
    }

    const v = document.createElement("video");
    // No crossOrigin — remote sources (DashScope OSS) often lack CORS
    // headers. Without it, video loads but canvas becomes tainted;
    // toDataURL catch block handles that gracefully.
    v.muted = true;
    v.preload = "auto";
    v.src = src;

    v.addEventListener("loadeddata", async () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_W * COUNT;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      for (let i = 0; i < COUNT; i++) {
        if (cancelled) break;
        const t = clip.in + (clip.out - clip.in) * (i / COUNT) + 0.01;
        v.currentTime = Math.min(t, clip.duration - 0.01);
        await new Promise<void>((res) => {
          const onSeek = () => { v.removeEventListener("seeked", onSeek); res(); };
          v.addEventListener("seeked", onSeek);
        });
        if (cancelled) break;
        ctx.drawImage(v, THUMB_W * i, 0, THUMB_W, THUMB_H);
      }
      if (!cancelled) {
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
          // 存缓存(FIFO 驱逐)
          if (THUMB_CACHE.size >= MAX_THUMB_CACHE) {
            const oldest = THUMB_CACHE.keys().next().value;
            if (oldest !== undefined) THUMB_CACHE.delete(oldest);
          }
          THUMB_CACHE.set(cacheKey, dataUrl);
          setThumbStrip(dataUrl);
        } catch { /* CORS — tainted canvas, fallback gracefully */ }
      }
    });
    return () => { cancelled = true; v.src = ""; };
  }, [clip.sourceUrl, clip.in, clip.out, clip.duration, isAudio, isImage]);

  // ── Trim handles (drag start / end) ──
  const dragRef = useRef<{
    side: "in" | "out";
    startX: number;
    startIn: number;
    startOut: number;
    pxPerSec: number;
  } | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);

  function startDrag(e: React.PointerEvent<HTMLDivElement>, side: "in" | "out") {
    e.stopPropagation();
    e.preventDefault();
    const el = blockRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ppsHandle = rect.width / Math.max(0.01, renderDur);
    dragRef.current = {
      side,
      startX: e.clientX,
      startIn: clip.in,
      startOut: clip.out,
      pxPerSec: ppsHandle,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "ew-resize";
    onSelect();
  }
  function onTrimMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const deltaPx = e.clientX - d.startX;
    const deltaSourceSec = (deltaPx / d.pxPerSec) * (clip.speed || 1);
    if (d.side === "in") {
      // 图片没有"入点"概念(静态帧),禁掉左手柄拖
      if (isImage) return;
      const next = Math.max(0, Math.min(d.startOut - 0.1, d.startIn + deltaSourceSec));
      onTrim({ in: next });
    } else {
      // 图片可以拖右手柄**延长显示时长**(同步 duration);视频/音频不超源时长
      const maxOut = isImage ? 120 : clip.duration;
      const next = Math.max(d.startIn + 0.1, Math.min(maxOut, d.startOut + deltaSourceSec));
      if (isImage) {
        // 图片:out 和 duration 同步变,clip 在时间线上视觉跟着拉长
        onTrim({ out: next, duration: next });
      } else {
        onTrim({ out: next });
      }
    }
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    document.body.style.cursor = "";
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  // ── Body drag (within-track move with snap) ──
  const moveRef = useRef<{
    startX: number;
    startY: number;
    startSec: number;
    captured: boolean;
  } | null>(null);
  const MOVE_THRESHOLD_PX = 5;

  function onBodyPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest(".ed-clip-handle")) return;
    onSelect({ shiftKey: e.shiftKey });
    moveRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSec: clip.startSec ?? 0,
      captured: false,
    };
    // Temporarily disable native drag so pointer events aren't hijacked
    // during horizontal move. Re-enabled on pointerup/cancel.
    const el = blockRef.current;
    if (el) el.setAttribute("draggable", "false");
  }

  function onBodyPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const m = moveRef.current;
    if (!m || !onMove) return;
    const dx = e.clientX - m.startX;
    const dy = e.clientY - m.startY;
    if (!m.captured) {
      if (Math.abs(dx) < MOVE_THRESHOLD_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      m.captured = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      document.body.style.cursor = "grabbing";
      e.preventDefault();
    }
    if (m.captured) {
      const deltaSec = dx / Math.max(1, pxPerSec);
      let next = Math.max(0, m.startSec + deltaSec);
      if (snapEnabled && snapTargets) {
        const SNAP_PX = 8;
        const snapTolSec = SNAP_PX / Math.max(1, pxPerSec);
        const candidates = [next, next + renderDur];
        let best: { value: number; targetType: "start" | "end" } | null = null;
        let bestDist = snapTolSec;
        for (const target of snapTargets) {
          for (let i = 0; i < candidates.length; i++) {
            const d = Math.abs(target - candidates[i]);
            if (d < bestDist) {
              bestDist = d;
              best = { value: target, targetType: i === 0 ? "start" : "end" };
            }
          }
        }
        if (best) {
          next = best.targetType === "start" ? best.value : best.value - renderDur;
          next = Math.max(0, next);
          onSnapIndicator?.(best.value);
        } else {
          onSnapIndicator?.(null);
        }
      }
      onMove(next);
    }
  }

  function onBodyPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    onSnapIndicator?.(null);
    const m = moveRef.current;
    moveRef.current = null;
    document.body.style.cursor = "";
    if (m?.captured) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    // Re-enable native drag for cross-track drops
    const el = blockRef.current;
    if (el) el.setAttribute("draggable", "true");
  }

  return (
    <div
      ref={blockRef}
      data-clip-id={clip.id}
      className={`ed-clip ed-clip-${mediaType}${clip.muted ? " muted" : ""}${isSelected ? " on" : ""}${isPlaying ? " playing" : ""}${dragOver ? " drop-target" : ""}`}
      style={{ position: "absolute", left: `${leftPx}px`, width: `${widthPx}px`, top: 0, bottom: 0 }}
      onPointerDown={onBodyPointerDown}
      onPointerMove={onBodyPointerMove}
      onPointerUp={onBodyPointerUp}
      onPointerCancel={onBodyPointerUp}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-frame0-clip", clip.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-frame0-clip")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const fromId = e.dataTransfer.getData("application/x-frame0-clip");
        if (fromId && fromId !== clip.id) onReorderDrop?.(fromId);
      }}
    >
      <div
        className="ed-clip-handle ed-clip-handle-l"
        onPointerDown={(e) => startDrag(e, "in")}
        onPointerMove={onTrimMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Drag to trim start"
      />
      <div
        className="ed-clip-handle ed-clip-handle-r"
        onPointerDown={(e) => startDrag(e, "out")}
        onPointerMove={onTrimMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Drag to trim end"
      />
      {!isAudio && thumbStrip && (
        <div className="ed-clip-thumbs" style={{ backgroundImage: `url(${thumbStrip})` }} />
      )}
      {isAudio && <div className="ed-clip-waveform" aria-hidden="true" />}
      <div className="ed-clip-title">
        <span className="ed-clip-kind">{isAudio ? "AUDIO" : isImage ? "IMG" : "VIDEO"}</span>
        <span className="ed-clip-title-text">{clip.sourceTitle}</span>
      </div>
      <div className="ed-clip-dur">
        {renderDur.toFixed(1)}s
        {clip.speed !== 1 && <> / {clip.speed}x</>}
        {(clip.in > 0.05 || clip.out < clip.duration - 0.05) && (
          <> / {clip.in.toFixed(1)} to {clip.out.toFixed(1)}</>
        )}
      </div>
      {/* Transition badge on clip's right edge */}
      {clip.transition && clip.transition.type !== "none" && (
        <div className="ed-clip-transition-badge" title={`${clip.transition.type} ${clip.transition.duration}s`}>
          ⟿
        </div>
      )}
      {/* Speed curve indicator */}
      {clip.speedCurve && clip.speedCurve !== "linear" && (
        <div className="ed-clip-curve-badge" title={clip.speedCurve}>
          〰
        </div>
      )}
      {/* Filter indicator */}
      {clip.filter && clip.filter !== "none" && (
        <div className="ed-clip-filter-badge" title={clip.filter}>
          ◐
        </div>
      )}
    </div>
  );
}, arePropsEqual);
