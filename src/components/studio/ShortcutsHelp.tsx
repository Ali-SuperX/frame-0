"use client";

type Shortcut = {
  keys: string[];
  label: { zh: string; en: string };
};

const SHORTCUTS: Shortcut[] = [
  {
    keys: ["⌘", "K"],
    label: { zh: "命令面板（全局搜索动作/页面/任务）", en: "Command palette" },
  },
  {
    keys: ["⌘", "↵"],
    label: { zh: "提交当前任务（Ctrl+Enter on Win）", en: "Submit current draft" },
  },
  { keys: ["⌘", "S"], label: { zh: "收藏当前 prompt", en: "Save prompt to library" } },
  { keys: ["⌘", "Z"], label: { zh: "撤销（删除/发布/清对比台）", en: "Undo last reversible action" } },
  { keys: ["/"], label: { zh: "打开灵感库", en: "Open prompt library" } },
  { keys: ["?"], label: { zh: "打开本帮助", en: "Toggle this help" } },
  { keys: ["Esc"], label: { zh: "关闭弹窗 / 对话框", en: "Close modal" } },
  {
    keys: ["Space"],
    label: { zh: "视频播放/暂停（播放器聚焦时）", en: "Play / pause (video)" },
  },
  {
    keys: [",", "."],
    label: { zh: "视频逐帧后退/前进", en: "Prev / next frame" },
  },
  {
    keys: ["←", "→"],
    label: { zh: "视频 ±1 秒", en: "Skip ±1 second" },
  },
  {
    keys: ["↑", "↓"],
    label: { zh: "视频速度加减档", en: "Video speed up/down" },
  },
  {
    keys: ["drag"],
    label: {
      zh: "拖拽 Jobs 缩略图到预览区 → 对比 / 剪辑",
      en: "Drag a job thumb into the preview zones to compare or edit",
    },
  },
  {
    keys: ["prompt", "{a|b}"],
    label: {
      zh: "prompt 里写 {red|blue} 自动 fan out 成多条",
      en: "`{red|blue}` in prompt → auto-expands into N jobs",
    },
  },
];

export default function ShortcutsHelp({
  open,
  zh,
  onClose,
}: {
  open: boolean;
  zh: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="kbd-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div className="kbd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-head">
          <div>
            <div className="kbd-kicker">
              {zh ? "快捷键总览" : "Keyboard shortcuts"}
            </div>
            <div className="kbd-sub">
              {zh
                ? "按 ? 随时打开这面板"
                : "Press ? any time to toggle this"}
            </div>
          </div>
          <button
            type="button"
            className="kbd-close"
            onClick={onClose}
            aria-label="close"
          >
            ×
          </button>
        </div>
        <div className="kbd-list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="kbd-row">
              <div className="kbd-keys">
                {s.keys.map((k, j) => (
                  <span key={j} className="kbd-key">
                    {k}
                  </span>
                ))}
              </div>
              <div className="kbd-label">{zh ? s.label.zh : s.label.en}</div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .kbd-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          z-index: 95;
          display: grid;
          place-items: center;
          padding: 40px 20px;
        }
        .kbd-panel {
          background: var(--ink);
          border: 1px solid var(--line);
          max-width: 640px;
          width: 100%;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
        }
        .kbd-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--line);
        }
        .kbd-kicker {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .kbd-sub {
          font-family: var(--serif);
          font-style: italic;
          font-size: 14px;
          color: var(--paper-dim);
        }
        .kbd-close {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          width: 32px;
          height: 32px;
          font-size: 20px;
          cursor: pointer;
          font-family: var(--mono);
        }
        .kbd-close:hover {
          color: var(--paper);
          border-color: var(--paper);
        }
        .kbd-list {
          padding: 10px 0;
        }
        .kbd-row {
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 20px;
          padding: 12px 20px;
          align-items: center;
          border-bottom: 1px solid var(--line);
        }
        .kbd-row:last-child {
          border-bottom: none;
        }
        .kbd-keys {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .kbd-key {
          display: inline-block;
          padding: 4px 9px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-bottom-width: 2px;
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--paper);
          border-radius: 3px;
          min-width: 24px;
          text-align: center;
        }
        .kbd-label {
          font-family: var(--serif);
          font-size: 14px;
          line-height: 1.45;
          color: var(--paper-dim);
        }
      `}</style>
    </div>
  );
}
