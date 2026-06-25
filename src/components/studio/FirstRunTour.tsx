"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "frame-0:tour-dismissed-v1";

/**
 * One-time welcome card shown on first visit. Dismisses permanently on
 * close (tracked in localStorage). Kept deliberately minimal — 3 key
 * shortcuts + a pointer to the command palette.
 */
export default function FirstRunTour({ zh }: { zh: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Tiny delay so it doesn't feel like a popup ad.
        window.setTimeout(() => setOpen(true), 600);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="ft-card" role="dialog" aria-label="Welcome tour">
      <button
        type="button"
        className="ft-close"
        onClick={dismiss}
        aria-label="close"
      >
        ×
      </button>
      <div className="ft-kicker">FRAME/0 · welcome</div>
      <div className="ft-title">
        {zh ? (
          <>
            按 <kbd>⌘</kbd> <kbd>K</kbd> <em>随时找东西。</em>
          </>
        ) : (
          <>
            Press <kbd>⌘</kbd> <kbd>K</kbd> <em>to find anything.</em>
          </>
        )}
      </div>
      <ul className="ft-list">
        <li>
          <kbd>⌘</kbd> <kbd>↵</kbd>{" "}
          {zh ? "提交当前 prompt" : "submit current prompt"}
        </li>
        <li>
          <kbd>/</kbd>{" "}
          {zh ? "打开灵感库（53 款精选 prompt）" : "open the prompt library"}
        </li>
        <li>
          <kbd>?</kbd>{" "}
          {zh ? "查看所有快捷键" : "see all shortcuts"}
        </li>
      </ul>
      <div className="ft-hint">
        {zh
          ? "试试在 prompt 里写 “一只 {red|blue} 猫” —— 自动 fan out 两个任务。"
          : "Try writing “a {red|blue} cat” — auto-fans out two jobs."}
      </div>
      <button type="button" className="ft-ok" onClick={dismiss}>
        {zh ? "开始 →" : "Got it →"}
      </button>

      <style jsx>{`
        .ft-card {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 360px;
          background: var(--ink-2);
          border: 1px solid var(--accent);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          padding: 18px 22px 20px;
          z-index: 85;
          animation: ft-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes ft-in {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
        }
        .ft-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          color: var(--paper-mute);
          font-size: 18px;
          cursor: pointer;
          line-height: 1;
        }
        .ft-close:hover {
          color: var(--paper);
        }
        .ft-kicker {
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 8px;
        }
        .ft-title {
          font-family: var(--font-serif);
          font-size: 22px;
          line-height: 1.3;
          color: var(--paper);
          font-weight: 400;
          margin-bottom: 14px;
        }
        .ft-title em {
          color: var(--accent);
          font-style: italic;
        }
        .ft-list {
          list-style: none;
          padding: 0;
          margin: 0 0 12px;
          font-family: var(--font-serif);
          font-size: 13.5px;
          color: var(--paper-dim);
          line-height: 1.7;
        }
        .ft-list li {
          padding: 2px 0;
        }
        .ft-hint {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 12.5px;
          color: var(--paper-mute);
          line-height: 1.5;
          padding: 10px 12px;
          background: var(--ink);
          border: 1px solid var(--line);
          margin-bottom: 14px;
        }
        .ft-ok {
          width: 100%;
          padding: 9px 14px;
          background: var(--accent);
          color: var(--ink);
          border: none;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .ft-ok:hover {
          filter: brightness(1.1);
        }
        kbd {
          display: inline-block;
          padding: 1px 6px;
          background: var(--ink);
          border: 1px solid var(--line);
          border-bottom-width: 2px;
          border-radius: 2px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          color: var(--paper);
          min-width: 18px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
