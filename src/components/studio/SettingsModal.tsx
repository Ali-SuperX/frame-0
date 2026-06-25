"use client";

import { useEffect, useState } from "react";
import { useStudioStore } from "@/lib/store";

type KeySpec = {
  envName: string;
  label: { zh: string; en: string };
  hint: { zh: string; en: string };
  placeholder: string;
  /** Sort first in UI. */
  primary?: boolean;
};

const KEYS: KeySpec[] = [
  {
    envName: "DASHSCOPE_API_KEY",
    label: { zh: "百炼 DashScope Key", en: "Bailian DashScope" },
    hint: {
      zh: "阿里云百炼控制台获取。驱动 Wan / Kling / PixVerse / 快乐马(HappyHorse) 等全部模型。",
      en: "From the Aliyun Bailian console. Drives Wan / Kling / PixVerse / HappyHorse and friends.",
    },
    placeholder: "sk-…",
    primary: true,
  },
];

/**
 * Settings modal — edit API keys from the UI instead of .env.local.
 * Keys are stored in localStorage (same-origin only) and sent via header
 * to our own API routes, never to Bailian directly.
 */
export default function SettingsModal({
  open,
  onClose,
  zh,
}: {
  open: boolean;
  onClose: () => void;
  zh: boolean;
}) {
  const apiKeys = useStudioStore((s) => s.apiKeys);
  const setApiKey = useStudioStore((s) => s.setApiKey);
  const removeApiKey = useStudioStore((s) => s.removeApiKey);

  // Local form state so we can edit without committing on every keystroke.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (open) setDraft({ ...apiKeys });
  }, [open, apiKeys]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1400);
  }

  function save(envName: string) {
    const val = (draft[envName] ?? "").trim();
    if (val) {
      setApiKey(envName, val);
      flash(zh ? "已保存" : "Saved");
    } else {
      removeApiKey(envName);
      flash(zh ? "已清空" : "Cleared");
    }
  }

  function mask(val: string): string {
    if (val.length <= 8) return "•".repeat(val.length);
    return val.slice(0, 3) + "•".repeat(Math.max(4, val.length - 7)) + val.slice(-4);
  }

  if (!open) return null;
  return (
    <div className="st-backdrop" onClick={onClose}>
      <div className="st-panel" onClick={(e) => e.stopPropagation()}>
        <div className="st-head">
          <div>
            <div className="st-kicker">
              {zh ? "设置 · API 密钥" : "Settings · API keys"}
            </div>
            <div className="st-sub">
              {zh
                ? "在浏览器本地存储，覆盖 .env.local 里的同名变量"
                : "Stored in your browser, overrides matching .env.local vars"}
            </div>
          </div>
          <button
            type="button"
            className="st-close"
            onClick={onClose}
            aria-label="close"
          >
            ×
          </button>
        </div>

        <div className="st-body">
          {KEYS.map((k) => {
            const stored = apiKeys[k.envName];
            const current = draft[k.envName] ?? "";
            const hasStored = !!stored;
            const shown = reveal[k.envName];
            return (
              <div key={k.envName} className="st-field">
                <div className="st-label-row">
                  <label>{zh ? k.label.zh : k.label.en}</label>
                  <span className={`st-pill${hasStored ? " ok" : " miss"}`}>
                    {hasStored
                      ? zh ? "已配置 · UI" : "set · UI"
                      : zh ? "未配置（回落 env）" : "empty · env fallback"}
                  </span>
                </div>
                <div className="st-hint">{zh ? k.hint.zh : k.hint.en}</div>
                <div className="st-input-row">
                  <input
                    type={shown ? "text" : "password"}
                    className="st-input"
                    placeholder={k.placeholder}
                    value={current}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [k.envName]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save(k.envName);
                    }}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="st-icon"
                    onClick={() =>
                      setReveal((r) => ({ ...r, [k.envName]: !r[k.envName] }))
                    }
                    title={shown ? "hide" : "show"}
                  >
                    {shown ? "🔒" : "👁"}
                  </button>
                  <button
                    type="button"
                    className="st-save"
                    onClick={() => save(k.envName)}
                  >
                    {zh ? "保存" : "Save"}
                  </button>
                </div>
                {hasStored && !shown && (
                  <div className="st-preview">
                    <span>{zh ? "当前：" : "Current: "}</span>
                    <code>{mask(stored)}</code>
                    <button
                      type="button"
                      className="st-del"
                      onClick={() => {
                        removeApiKey(k.envName);
                        setDraft((d) => ({ ...d, [k.envName]: "" }));
                        flash(zh ? "已删除" : "Deleted");
                      }}
                    >
                      {zh ? "删除" : "Delete"}
                    </button>
                  </div>
                )}
                <div className="st-env-note">
                  env: <code>{k.envName}</code>
                </div>
              </div>
            );
          })}

          <div className="st-footnote">
            {zh
              ? "⚠️ Key 存在浏览器 localStorage。共享机器 / 公开部署请用 env。发送时走同源 header，绝不直接上百炼。"
              : "⚠️ Keys live in browser localStorage. On shared machines or public deploys, use env. Sent via same-origin header — never directly to Bailian."}
          </div>
        </div>

        {toast && <div className="st-toast">{toast}</div>}
      </div>

      <style jsx>{`
        .st-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(3px);
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 40px 20px;
        }
        .st-panel {
          background: var(--ink);
          border: 1px solid var(--line);
          max-width: 620px;
          width: 100%;
          max-height: min(88vh, 820px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
          position: relative;
        }
        .st-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 18px 22px 14px;
          border-bottom: 1px solid var(--line);
        }
        .st-kicker {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .st-sub {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 13.5px;
          color: var(--paper-dim);
        }
        .st-close {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          width: 32px;
          height: 32px;
          font-size: 20px;
          cursor: pointer;
          font-family: var(--font-mono);
        }
        .st-close:hover {
          color: var(--paper);
          border-color: var(--paper);
        }
        .st-body {
          flex: 1;
          overflow-y: auto;
          padding: 18px 22px 22px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .st-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .st-label-row {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }
        .st-label-row label {
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--paper);
        }
        .st-pill {
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 1px 8px;
          border-radius: 12px;
        }
        .st-pill.ok {
          background: color-mix(in oklab, #6ba96b 30%, transparent);
          color: #8bc98b;
        }
        .st-pill.miss {
          background: color-mix(in oklab, var(--paper-mute) 20%, transparent);
          color: var(--paper-mute);
        }
        .st-hint {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 12.5px;
          color: var(--paper-dim);
          line-height: 1.5;
        }
        .st-input-row {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }
        .st-input {
          flex: 1;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 9px 12px;
          font-family: var(--font-mono);
          font-size: 13px;
          border-radius: 2px;
        }
        .st-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .st-icon,
        .st-save {
          padding: 0 14px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper);
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
          border-radius: 2px;
        }
        .st-save {
          background: var(--accent);
          color: var(--ink);
          border-color: var(--accent);
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .st-save:hover {
          filter: brightness(1.1);
        }
        .st-icon:hover {
          border-color: var(--paper);
        }
        .st-preview {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--paper-dim);
          margin-top: 2px;
        }
        .st-preview code {
          background: var(--ink-2);
          padding: 2px 8px;
          border-radius: 2px;
          color: var(--paper);
          letter-spacing: 0;
        }
        .st-del {
          background: transparent;
          border: none;
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 2px 6px;
          margin-left: auto;
        }
        .st-del:hover {
          color: #c44;
        }
        .st-env-note {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--paper-mute);
          opacity: 0.7;
          margin-top: 2px;
          letter-spacing: 0.04em;
        }
        .st-env-note code {
          background: transparent;
          color: var(--paper);
          letter-spacing: 0.06em;
        }
        .st-footnote {
          padding: 12px 14px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper-dim);
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 12.5px;
          line-height: 1.55;
        }
        .st-toast {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--paper);
          color: var(--ink);
          padding: 8px 16px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          animation: st-toast-in 0.18s ease-out;
        }
        @keyframes st-toast-in {
          from {
            opacity: 0;
            transform: translate(-50%, -6px);
          }
        }
      `}</style>
    </div>
  );
}
