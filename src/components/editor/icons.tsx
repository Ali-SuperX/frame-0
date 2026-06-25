/* SVG Icon Components — inline, no external dependency. */

const ICO = { w: 16, h: 16, sw: 1.8, fill: "none", stroke: "currentColor" } as const;

export function IcoScissors() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>);
}
export function IcoBracketIn() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polyline points="8 4 4 4 4 20 8 20"/><line x1="4" y1="12" x2="20" y2="12"/><polyline points="16 8 20 12 16 16"/></svg>);
}
export function IcoBracketOut() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 4 20 4 20 20 16 20"/><line x1="4" y1="12" x2="20" y2="12"/><polyline points="8 8 4 12 8 16"/></svg>);
}
export function IcoUndo() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>);
}
export function IcoRedo() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>);
}
export function IcoSkipBack() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>);
}
export function IcoPlay() {
  return (<svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>);
}
export function IcoPause() {
  return (<svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/></svg>);
}
export function IcoFrameBack() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7"/><line x1="18" y1="6" x2="18" y2="18"/></svg>);
}
export function IcoFrameFwd() {
  return (<svg width={ICO.w} height={ICO.h} viewBox="0 0 24 24" fill={ICO.fill} stroke={ICO.stroke} strokeWidth={ICO.sw} strokeLinecap="round" strokeLinejoin="round"><polyline points="13 7 18 12 13 17"/><line x1="6" y1="6" x2="6" y2="18"/></svg>);
}

/* ─── 轨道头部按钮图标(紧凑 10px) ─── */
const TR = { w: 10, h: 10, sw: 1.8, fill: "none", stroke: "currentColor" } as const;

export function IcoLock() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="1.5"/><path d="M7 11 V7 a5 5 0 0 1 10 0 V11"/></svg>);
}
export function IcoUnlock() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="1.5"/><path d="M7 11 V7 a5 5 0 0 1 9.5 -2"/></svg>);
}
export function IcoEye() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12 C2 12 5 5 12 5 C19 5 22 12 22 12 C22 12 19 19 12 19 C5 19 2 12 2 12 Z"/><circle cx="12" cy="12" r="3"/></svg>);
}
export function IcoEyeOff() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12 C2 12 5 5 12 5 C14 5 15.8 5.6 17.3 6.5"/><path d="M22 12 C22 12 19 19 12 19 C10 19 8.2 18.4 6.7 17.5"/><path d="M9 9 L9 9 A3 3 0 0 0 15 15"/><line x1="3" y1="3" x2="21" y2="21"/></svg>);
}
export function IcoVolOn() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" fill="currentColor" fillOpacity="0.3"/><path d="M16 8 C18 9.5 18 14.5 16 16"/><path d="M19 5 C22 8 22 16 19 19"/></svg>);
}
export function IcoVolOff() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" fill="currentColor" fillOpacity="0.3"/><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/></svg>);
}
export function IcoSolo() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={TR.sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>);
}
export function IcoClose() {
  return (<svg width={TR.w} height={TR.h} viewBox="0 0 24 24" fill={TR.fill} stroke={TR.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>);
}
