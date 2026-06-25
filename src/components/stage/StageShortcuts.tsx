"use client";

type Props = { zh: boolean; onClose: () => void };

const SHORTCUTS = [
  { key: "← →", zh: "上/下一镜", en: "Prev / Next shot" },
  { key: "N", zh: "加一个空镜头", en: "Add blank shot" },
  { key: "F", zh: "全屏放映", en: "Fullscreen play" },
  { key: "Esc", zh: "退出放映/关闭面板", en: "Exit / Close" },
  { key: "1–4", zh: "切换 Tab", en: "Switch tab" },
  { key: "?", zh: "快捷键帮助", en: "Toggle this panel" },
];

export default function StageShortcuts({ zh, onClose }: Props) {
  return (
    <div className="ss-shortcuts-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ss-shortcuts-panel">
        <h3>{zh ? "键盘快捷键" : "Keyboard Shortcuts"}</h3>
        <div className="ss-shortcuts-list">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="ss-shortcut-row">
              <kbd>{s.key}</kbd>
              <span>{zh ? s.zh : s.en}</span>
            </div>
          ))}
        </div>
        <button className="ss-btn" onClick={onClose}>{zh ? "关闭" : "Close"}</button>
      </div>
    </div>
  );
}
