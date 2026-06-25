"use client";

import { ReactNode, useEffect, useRef, useState, Children, isValidElement, cloneElement } from "react";

type Props = {
  width?: number;
  height?: number;
  children: ReactNode;
};

/**
 * DeckStage — React port of deck-stage.js.
 *
 * Responsibilities:
 *  - Scale an authored canvas (default 1920x1080) to fit viewport with letterboxing
 *  - Keyboard nav: ←/→, PgUp/PgDn, Space, Home/End, digits 1–9 jump, R reset
 *  - Touch nav: left/right tap zones on coarse pointers
 *  - Persist index to localStorage keyed by pathname
 *  - Stacks children absolutely; non-active slides hidden (DOM preserved)
 *  - Print: @media print rules in globals.css lay each slide out 1-per-page
 */
export default function DeckStage({ width = 1920, height = 1080, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children).filter(isValidElement);
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);

  // Load persisted index once.
  useEffect(() => {
    const key = "deck-stage:slide:" + (typeof location !== "undefined" ? location.pathname : "/");
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= 0 && n < total) setIndex(n);
    }
  }, [total]);

  // Persist index on change.
  useEffect(() => {
    const key = "deck-stage:slide:" + location.pathname;
    try {
      localStorage.setItem(key, String(index));
    } catch {}
  }, [index]);

  // Fit-to-viewport.
  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setScale(Math.min(vw / width, vh / height));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width, height]);

  // Keyboard nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;

      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          setIndex((i) => Math.min(total - 1, i + 1));
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          setIndex((i) => Math.max(0, i - 1));
          break;
        case "Home":
          e.preventDefault();
          setIndex(0);
          break;
        case "End":
          e.preventDefault();
          setIndex(total - 1);
          break;
        case "r":
        case "R":
          e.preventDefault();
          setIndex(0);
          break;
        default:
          if (/^[1-9]$/.test(e.key)) {
            const n = parseInt(e.key, 10) - 1;
            if (n < total) setIndex(n);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Touch zones — only active on coarse pointers via CSS media query in deck.css */}
      <div className="deck-tapzones" aria-hidden>
        <div className="deck-tapzone" onClick={() => setIndex((i) => Math.max(0, i - 1))} />
        <div className="deck-tapzone" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))} />
      </div>

      <div
        ref={wrapRef}
        className="deck-stage-wrap"
        style={{
          position: "relative",
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        {slides.map((child, i) => {
          const active = i === index;
          const el = child as React.ReactElement<{ style?: React.CSSProperties }>;
          return cloneElement(el, {
            key: i,
            style: {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: active ? 1 : 0,
              visibility: active ? "visible" : "hidden",
              pointerEvents: active ? "auto" : "none",
              overflow: "hidden",
              ...(el.props.style || {}),
            } as React.CSSProperties,
          });
        })}
      </div>

      {/* Count + reset pill */}
      <div className="deck-overlay">
        <button className="deck-btn" aria-label="Previous" onClick={() => setIndex((i) => Math.max(0, i - 1))}>‹</button>
        <span className="deck-count">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <span className="sep">/</span>
          <span className="total">{String(total).padStart(2, "0")}</span>
        </span>
        <button className="deck-btn" aria-label="Next" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>›</button>
        <span className="deck-divider" />
        <button className="deck-btn reset" onClick={() => setIndex(0)}>
          Reset <span className="kbd">R</span>
        </button>
      </div>
    </div>
  );
}
