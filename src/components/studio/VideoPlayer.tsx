"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  autoPlay?: boolean;
  loop?: boolean;
  zh?: boolean;
  /** Pass ref up so parent (Compare) can sync. */
  videoRef?: (el: HTMLVideoElement | null) => void;
};

const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
const FRAME_STEP = 1 / 24; // seconds — most video-gen outputs are 24fps

/**
 * Enhanced video player with speed control + frame-accurate stepping.
 * Keyboard shortcuts (when the player has focus):
 *   Space   — play / pause
 *   , / .   — step back / forward one frame (≈ 1/24 s)
 *   ← / →   — skip ±1 second
 *   ↑ / ↓   — speed up / slow down
 */
export default function VideoPlayer({
  src,
  autoPlay = false,
  loop = true,
  zh = true,
  videoRef,
}: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(!autoPlay);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  function setRate(r: number) {
    setSpeed(r);
    if (ref.current) ref.current.playbackRate = r;
  }

  function step(dir: 1 | -1) {
    const v = ref.current;
    if (!v) return;
    v.pause();
    setPaused(true);
    v.currentTime = Math.max(0, (v.currentTime || 0) + dir * FRAME_STEP);
  }

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const v = ref.current;
    if (!v) return;
    if (e.key === " ") {
      e.preventDefault();
      if (v.paused) {
        // .catch 吞掉 AbortError —— React re-render 切 src 时 play() 的 Promise
        // 会被新 load 中断（goo.gl/LdLk22），不 catch 会冒到 Next dev error overlay
        void v.play().catch(() => {});
        setPaused(false);
      } else {
        v.pause();
        setPaused(true);
      }
    } else if (e.key === "," || e.key === "[") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "." || e.key === "]") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      v.currentTime = Math.max(0, v.currentTime - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1)];
      if (next) setRate(next);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = SPEEDS[Math.max(0, SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) - 1)];
      if (next) setRate(next);
    }
  }

  return (
    <div className="vp-wrap" tabIndex={0} onKeyDown={onKey} role="group">
      <video
        ref={(el) => {
          ref.current = el;
          videoRef?.(el);
        }}
        src={src}
        controls
        autoPlay={autoPlay}
        loop={loop}
        playsInline
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
      />
      <div className="vp-controls">
        <button
          type="button"
          className="vp-btn"
          onClick={() => step(-1)}
          title={zh ? "上一帧 (,)" : "Prev frame (,)"}
        >
          ⏮
        </button>
        <button
          type="button"
          className="vp-btn"
          onClick={() => {
            const v = ref.current;
            if (!v) return;
            if (v.paused) void v.play().catch(() => {});
            else v.pause();
          }}
          title={zh ? "播放/暂停 (空格)" : "Play/Pause (space)"}
        >
          {paused ? "▶" : "⏸"}
        </button>
        <button
          type="button"
          className="vp-btn"
          onClick={() => step(1)}
          title={zh ? "下一帧 (.)" : "Next frame (.)"}
        >
          ⏭
        </button>
        <div className="vp-speeds">
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              className={`vp-speed${speed === r ? " on" : ""}`}
              onClick={() => setRate(r)}
            >
              {r}x
            </button>
          ))}
        </div>
        <div className="vp-kbd-hint" title="keyboard shortcuts">
          {zh ? "键盘: space , . ← → ↑ ↓" : "keys: space , . ← → ↑ ↓"}
        </div>
      </div>

      <style jsx>{`
        .vp-wrap {
          width: 100%;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          outline: none;
        }
        .vp-wrap:focus-within {
          outline: 1px solid var(--accent);
          outline-offset: -1px;
        }
        video {
          width: 100%;
          flex: 1;
          min-height: 0;
          object-fit: contain;
          background: black;
        }
        .vp-controls {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: var(--ink-2);
          border-top: 1px solid var(--line);
          flex-wrap: wrap;
        }
        .vp-btn {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper);
          width: 30px;
          height: 28px;
          padding: 0;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 13px;
          line-height: 1;
          border-radius: 2px;
        }
        .vp-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .vp-speeds {
          display: flex;
          gap: 2px;
          margin-left: 4px;
        }
        .vp-speed {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          padding: 4px 8px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 2px;
        }
        .vp-speed.on {
          background: var(--accent);
          color: var(--ink);
          border-color: var(--accent);
        }
        .vp-kbd-hint {
          margin-left: auto;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--paper-mute);
          opacity: 0.7;
          letter-spacing: 0.06em;
        }
      `}</style>
    </div>
  );
}
