/** Cinema 内联图标 */
export function PlayIcon() {
  return (<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>);
}
export function ExportIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15V3M7 8l5-5 5 5M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></svg>);
}
export function PlusIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>);
}
export function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} /></svg>);
}
