"use client";

// FlowIcon — 线性图标集 + 渐变占位（鎏金暖色同源）
import type { CSSProperties, ReactNode } from "react";

const P: Record<string, ReactNode> = {
  idea:      <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.2 1 2.5h6c0-1.3.2-1.8 1-2.5A6 6 0 0 0 12 3Z" /></>,
  outline:   <><path d="M5 4h14M5 9h14M5 14h9M5 19h6" /></>,
  episodes:  <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 4v16" /></>,
  character: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  scene:     <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.6" /><path d="m4 17 4.5-4 3.5 3 3-2.5L20 17" /></>,
  frames:    <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  audio:     <><path d="M3 12h2l1.5-5 3 14 3-19 3 14L18 12h3" /></>,
  edit:      <><rect x="2.5" y="6" width="19" height="5" rx="1.5" /><rect x="2.5" y="13" width="13" height="5" rx="1.5" /><path d="M8 4v16" /></>,
  export:    <><path d="M12 15V3m0 0 4 4m-4-4L8 7" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>,
  plus:      <><path d="M12 5v14M5 12h14" /></>,
  sparkles:  <><path d="M12 3l1.6 4.7L18 9l-4.4 1.3L12 15l-1.6-4.7L6 9l4.4-1.3L12 3Z" /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /></>,
  wand:      <><path d="M15 4V2M15 10V8M19 6h2M11 6h2" /><path d="m6.5 17.5 9-9 1.5 1.5-9 9-2 .5.5-2Z" /></>,
  send:      <><path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" /></>,
  close:     <><path d="M6 6l12 12M18 6 6 18" /></>,
  zin:       <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></>,
  zout:      <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></>,
  fit:       <><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" /></>,
  hand:      <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-1.6-3a1.5 1.5 0 0 1 2.5-1.6L8 14" /></>,
  cursor:    <><path d="M5 3l6 16 2.2-6.3L19 10.5 5 3Z" /></>,
  comment:   <><path d="M21 11.5a8 8 0 0 1-11.5 7L4 20l1.5-5.5A8 8 0 1 1 21 11.5Z" /></>,
  play:      <><path d="M7 4l13 8-13 8V4Z" /></>,
  pause:     <><path d="M8 5v14M16 5v14" /></>,
  refresh:   <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></>,
  check:     <><path d="M5 12.5l4.5 4.5L19 7" /></>,
  chevd:     <><path d="m6 9 6 6 6-6" /></>,
  chevr:     <><path d="m9 6 6 6-6 6" /></>,
  users:     <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 6M21 19a5.5 5.5 0 0 0-3.5-5" /></>,
  share:     <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" /></>,
  bell:      <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.5 21a2 2 0 0 0 3 0" /></>,
  layers:    <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" /></>,
  mic:       <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  music:     <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><path d="M9 18V5l12-2v13" /></>,
  film:      <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  type:      <><path d="M5 6h14M5 6V4h14v2M12 4v16M9 20h6" /></>,
  image:     <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="1.8" /><path d="m4 17 5-4.5 4 3.5 3-2.5L20 17" /></>,
  grid:      <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></>,
  bolt:      <><path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" /></>,
  target:    <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
  arrowr:    <><path d="M5 12h14m0 0-6-6m6 6-6 6" /></>,
};

export function FlowIcon({
  n, s = 18, sw = 1.7, style,
}: { n: string; s?: number; sw?: number; style?: CSSProperties }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {P[n] || null}
    </svg>
  );
}

// ── 渐变占位色板（鎏金暖色同源：金 / 朱砂 / 琥珀 / 青瓷，无紫蓝）──
export const GRADS: Record<string, string> = {
  gold:   "linear-gradient(140deg,oklch(0.5 0.08 60),oklch(0.62 0.14 62) 55%,oklch(0.78 0.13 72))",
  ember:  "linear-gradient(150deg,oklch(0.4 0.1 30),oklch(0.55 0.17 33) 55%,oklch(0.7 0.15 45))",
  rose:   "linear-gradient(150deg,oklch(0.4 0.12 18),oklch(0.56 0.16 14) 50%,oklch(0.7 0.14 25))",
  amber:  "linear-gradient(150deg,oklch(0.45 0.1 70),oklch(0.62 0.14 78) 50%,oklch(0.8 0.13 88))",
  jade:   "linear-gradient(150deg,oklch(0.4 0.07 160),oklch(0.58 0.1 158) 55%,oklch(0.76 0.11 155))",
  teal:   "linear-gradient(145deg,oklch(0.4 0.06 185),oklch(0.58 0.09 178) 55%,oklch(0.76 0.1 168))",
  noir:   "linear-gradient(140deg,oklch(0.22 0.015 55),oklch(0.32 0.02 52) 60%,oklch(0.45 0.025 50))",
  dusk:   "linear-gradient(150deg,oklch(0.38 0.06 50),oklch(0.55 0.12 55) 50%,oklch(0.74 0.12 70))",
};
const GRAD_KEYS = Object.keys(GRADS);
export const portraitGrad = (seed: number) => GRADS[GRAD_KEYS[seed % GRAD_KEYS.length]];

export function Placeholder({
  grad, label, badge, regen, comic,
}: { grad: string; label?: string; badge?: string; regen?: boolean; comic?: boolean }) {
  return (
    <>
      <div className="sf-ph" style={{ background: grad }} />
      <div className="sf-ph" style={{ background: "radial-gradient(120% 80% at 25% 15%, rgba(255,255,255,.22), transparent 55%)", mixBlendMode: "screen", opacity: 0.7 }} />
      <div className="sf-ph" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.5) .5px, transparent .6px)", backgroundSize: "3px 3px", opacity: 0.06 }} />
      {badge && <div className="sf-ph-badge"><FlowIcon n={comic ? "image" : "film"} s={9} sw={2} />{badge}</div>}
      {label && <div className="sf-ph-lbl">{label}</div>}
      {regen && (
        <div className="sf-regen">
          <button className="sf-regen-btn"><FlowIcon n="refresh" s={12} sw={2} />重新生成</button>
        </div>
      )}
    </>
  );
}
