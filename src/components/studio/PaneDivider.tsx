"use client";

import { useRef } from "react";

type Props = {
  /**
   * `"left"` divider sits between jobs-pane (left) and preview (center).
   * `"right"` divider sits between preview (center) and params-pane (right).
   * The side determines which direction an "increase" in cursor X grows the pane.
   */
  side: "left" | "right";
  /** Current pane width in px (jobs or params). */
  value: number;
  /** Commit a final width to the store after pointerup. */
  onCommit: (px: number) => void;
  /** Live visual preview during drag (sets inline style without re-rendering React). */
  onPreview?: (px: number) => void;
  min?: number;
  max?: number;
  /** ARIA label for the handle. */
  ariaLabel?: string;
};

const DEFAULT_LEFT = 280;
const DEFAULT_RIGHT = 400;

/**
 * Vertical drag handle between two Studio panes.
 *  - 6px visible bar, +10px invisible hit area each side ⇒ 26px clickable width
 *  - Permanent grip dots (always visible) so users see "this is draggable"
 *  - Drag to resize, double-click to toggle min ↔ default
 *  - Pointer capture: drag continues even if cursor leaves the handle
 */
export default function PaneDivider({
  side,
  value,
  onCommit,
  onPreview,
  min = 200,
  max = 560,
  ariaLabel,
}: Props) {
  const startRef = useRef<{ x: number; w: number; moved: boolean } | null>(null);

  function clamp(n: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Use legacy MouseEvent + window-level capture-phase listeners. This
    // bypasses two common extension hijacks:
    //   1. extensions that only intercept PointerEvent / Touch on the body
    //   2. extensions that stopImmediatePropagation on the bubble phase
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, w: value, moved: false };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = ev.clientX - start.x;
      if (Math.abs(dx) > 2) start.moved = true;
      // Left divider: moving right grows the left pane.
      // Right divider: moving right shrinks the right pane.
      const delta = side === "left" ? dx : -dx;
      const next = clamp(start.w + delta);
      onPreview?.(next);
    };

    const onUp = (ev: MouseEvent) => {
      const start = startRef.current;
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (!start) return;
      const dx = ev.clientX - start.x;
      const delta = side === "left" ? dx : -dx;
      const next = clamp(start.w + delta);
      startRef.current = null;
      if (start.moved) onCommit(next);
    };

    // Capture-phase = runs before any document/body bubble-phase listener
    // an extension might have installed.
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  }

  function onDoubleClick() {
    // Toggle: default ↔ minimum collapsed width.
    const def = side === "left" ? DEFAULT_LEFT : DEFAULT_RIGHT;
    const isCollapsed = value <= min + 4;
    onCommit(isCollapsed ? def : min);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keyboard nudge — focus the divider (Tab) then press ←/→ to resize 20px.
    // Hold Shift for 80px steps. This is the rescue path when mouse drag is
    // blocked by browser extensions hijacking pointer events.
    const step = e.shiftKey ? 80 : 20;
    let dir = 0;
    if (e.key === "ArrowLeft") dir = -1;
    else if (e.key === "ArrowRight") dir = 1;
    else return;
    e.preventDefault();
    const delta = side === "left" ? dir : -dir;
    onCommit(clamp(value + delta * step));
  }

  return (
    <div
      className={`pane-divider pd-${side}`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      role="separator"
      aria-label={ariaLabel || `resize ${side} pane`}
      aria-orientation="vertical"
      tabIndex={0}
      title="拖动 · 双击折叠/展开 · Tab 聚焦后 ←→ 调整 (Shift+←→ 大步)"
    >
      <div className="pd-grip" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <style jsx>{`
        .pane-divider {
          position: relative;
          width: 6px;
          background: var(--line);
          cursor: col-resize;
          flex-shrink: 0;
          z-index: 5;
          transition: background 0.12s;
        }
        /* Wider invisible hit area so the cursor doesn't have to be pixel-precise. */
        .pane-divider::before {
          content: "";
          position: absolute;
          inset: 0 -10px;
        }
        .pane-divider:hover,
        .pane-divider:active,
        .pane-divider:focus-visible {
          background: var(--accent);
          outline: none;
        }
        .pane-divider:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent);
        }
        /* Grip — three small dots, always visible so the affordance is obvious. */
        .pd-grip {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          gap: 4px;
          pointer-events: none;
        }
        .pd-grip span {
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--paper-mute);
          opacity: 0.55;
          transition: background 0.12s, opacity 0.12s;
        }
        .pane-divider:hover .pd-grip span,
        .pane-divider:active .pd-grip span {
          background: var(--ink);
          opacity: 1;
        }
        @media (max-width: 1100px) {
          .pane-divider {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
