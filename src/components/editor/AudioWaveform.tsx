"use client";

import { useEffect, useRef, useState } from "react";

/** 模块级波形缓存 —— 按 `${sourceUrl}|${inSec}|${outSec}|${barCount}` 索引
 *  normalized bars[]。命中后直接 redraw canvas,跳过 fetch + decodeAudioData
 *  (CPU 密集,一段几 MB 的音频 decode 100-500ms,在每次 re-render 都重跑就是
 *   timeline 卡顿的主因之一)。
 *
 *  容量上限 100 条(每条 ~120 floats ≈ 1KB),全局 ~100KB 内存,可接受。
 *  Cap 用 FIFO(JS Map 保留插入顺序),最早进入的先被驱逐。 */
const WAVEFORM_CACHE = new Map<string, number[]>();
const MAX_WAVEFORM_CACHE = 100;

function waveformKey(sourceUrl: string, inSec: number, outSec: number, barCount: number): string {
  return `${sourceUrl}|${inSec.toFixed(3)}|${outSec.toFixed(3)}|${barCount}`;
}

function drawBars(canvas: HTMLCanvasElement, normalized: number[]): void {
  const dpr = 2;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (W === 0 || H === 0) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const barW = W / normalized.length;
  const gap = Math.max(0.5, barW * 0.2);
  ctx.fillStyle = "rgba(78, 168, 247, 0.55)";

  for (let i = 0; i < normalized.length; i++) {
    const h = Math.max(2, normalized[i] * H * 0.9);
    const x = i * barW + gap / 2;
    const y = (H - h) / 2;
    ctx.fillRect(x, y, Math.max(1, barW - gap), h);
  }
}

/**
 * Renders a real audio waveform from a media source URL.
 * Falls back gracefully — if CORS blocks decoding, shows nothing
 * (parent CSS provides a static fallback pattern).
 *
 * Phase 1 perf: 命中模块级 cache 时直接 draw,避免 re-render 反复 decodeAudioData。
 */
export function AudioWaveform({
  sourceUrl,
  inSec,
  outSec,
}: {
  sourceUrl: string;
  inSec: number;
  outSec: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sourceUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // BAR_COUNT 依赖 canvas 视觉宽度 —— 在 effect 里读 clientWidth 才有真值
    const BAR_COUNT = Math.min(120, Math.max(30, Math.floor((canvas.clientWidth || 200) / 3)));
    const key = waveformKey(sourceUrl, inSec, outSec, BAR_COUNT);

    // 命中缓存:同步 draw,跳过 fetch + decode
    const cached = WAVEFORM_CACHE.get(key);
    if (cached) {
      drawBars(canvas, cached);
      setReady(true);
      return;
    }

    let cancelled = false;
    const ac = new AudioContext();

    (async () => {
      try {
        const res = await fetch(sourceUrl);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const audio = await ac.decodeAudioData(buf);
        if (cancelled) return;

        const sampleRate = audio.sampleRate;
        const startSample = Math.floor(inSec * sampleRate);
        const endSample = Math.min(Math.floor(outSec * sampleRate), audio.length);
        const data = audio.getChannelData(0); // mono or left channel

        // Compute RMS per bar
        const samplesPerBar = Math.max(1, Math.floor((endSample - startSample) / BAR_COUNT));
        const bars: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          const from = startSample + i * samplesPerBar;
          const to = Math.min(from + samplesPerBar, endSample);
          let sum = 0;
          for (let j = from; j < to; j++) {
            const v = data[j] ?? 0;
            sum += v * v;
          }
          bars.push(Math.sqrt(sum / Math.max(1, to - from)));
        }

        // Normalize
        const peak = Math.max(...bars, 0.001);
        const normalized = bars.map((v) => v / peak);

        // 存缓存 + FIFO 驱逐
        if (WAVEFORM_CACHE.size >= MAX_WAVEFORM_CACHE) {
          const oldest = WAVEFORM_CACHE.keys().next().value;
          if (oldest !== undefined) WAVEFORM_CACHE.delete(oldest);
        }
        WAVEFORM_CACHE.set(key, normalized);

        if (!cancelled) {
          drawBars(canvas, normalized);
          setReady(true);
        }
      } catch {
        // CORS or decode failure — silent, parent CSS has fallback
      }
    })();

    return () => {
      cancelled = true;
      ac.close().catch(() => {});
    };
  }, [sourceUrl, inSec, outSec]);

  return (
    <canvas
      ref={canvasRef}
      className="ed-audio-wave-canvas"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: ready ? 1 : 0,
        transition: "opacity 0.3s",
        pointerEvents: "none",
      }}
    />
  );
}
