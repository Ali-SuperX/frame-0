/** LumenX 内联图标（无第三方依赖，统一 currentColor）。 */

type P = { size?: number };
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconScript = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></svg>
);
export const IconPalette = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 22a10 10 0 1 1 0-20c5.5 0 10 4 10 9 0 3-2.5 4-4 4h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.5" cy="10.5" r="1" /></svg>
);
export const IconCast = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5" /><path d="M18 14.5a6 6 0 0 1 3 5.5" /></svg>
);
export const IconStoryboard = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 4v5" /></svg>
);
export const IconVideo = ({ size }: P) => (
  <svg {...base(size)}><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 9 6-3v12l-6-3z" /></svg>
);
export const IconVoice = ({ size }: P) => (
  <svg {...base(size)}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
);
export const IconCompose = ({ size }: P) => (
  <svg {...base(size)}><path d="m4 8 16-4M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M4 8h16" /><path d="M9 12v5l4-2.5z" fill="currentColor" stroke="none" /></svg>
);

export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}><path d="m20 6-11 11-5-5" /></svg>
);
export const IconBack = ({ size }: P) => (
  <svg {...base(size)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
);
export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconSparkles = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
);
export const IconPlay = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" /></svg>
);
export const IconRefresh = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5" /></svg>
);
export const IconUpload = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
);
