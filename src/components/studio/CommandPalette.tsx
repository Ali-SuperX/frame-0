"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useStudioStore } from "@/lib/store";

type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  hint?: string;
  group: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  zh: boolean;
  onAction?: (
    kind: "submit" | "fanout" | "seed" | "save" | "reset" | "settings"
  ) => void;
};

/**
 * ⌘+K palette — type-to-find across pages, actions, jobs, and saved prompts.
 * Keyboard-only navigation: ↑/↓ moves, Enter runs, Esc closes.
 */
export default function CommandPalette({ open, onClose, zh, onAction }: Props) {
  const router = useRouter();
  const jobs = useStudioStore((s) => s.jobs);
  const savedPrompts = useStudioStore((s) => s.savedPrompts);
  const selectJob = useStudioStore((s) => s.selectJob);
  const loadExternalPromptIntoDraft = useStudioStore(
    (s) => s.loadExternalPromptIntoDraft
  );

  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = [
      {
        id: "go-studio",
        title: zh ? "工坊" : "Studio",
        subtitle: "/studio",
        hint: zh ? "视频生成工坊" : "video generation studio",
        group: zh ? "页面" : "Pages",
        run: () => router.push("/studio"),
      },
      {
        id: "go-editor",
        title: zh ? "剪辑" : "Editor",
        subtitle: "/editor",
        hint: zh ? "多轨剪辑器" : "multi-track editor",
        group: zh ? "页面" : "Pages",
        run: () => router.push("/editor"),
      },
      {
        id: "go-home",
        title: zh ? "主页" : "Home (Landing)",
        subtitle: "/",
        hint: zh ? "主战页 / 介绍" : "marketing landing",
        group: zh ? "页面" : "Pages",
        run: () => router.push("/"),
      },
      {
        id: "go-archive",
        title: zh ? "资产库" : "Assets",
        subtitle: "/archive",
        group: zh ? "页面" : "Pages",
        run: () => router.push("/archive"),
      },
      {
        id: "go-manifest",
        title: zh ? "宣言" : "Manifest",
        subtitle: "/manifest",
        group: zh ? "页面" : "Pages",
        run: () => router.push("/manifest"),
      },
      {
        id: "go-press",
        title: "Press Deck",
        subtitle: "/press",
        group: zh ? "页面" : "Pages",
        run: () => router.push("/press"),
      },
    ];

    const actions: CommandItem[] = [
      {
        id: "act-submit",
        title: zh ? "提交当前草稿" : "Submit current draft",
        hint: "⌘↵",
        group: zh ? "动作" : "Actions",
        run: () => onAction?.("submit"),
      },
      {
        id: "act-save",
        title: zh ? "收藏当前 prompt" : "Save current prompt",
        hint: "⌘S",
        group: zh ? "动作" : "Actions",
        run: () => onAction?.("save"),
      },
      {
        id: "act-reset",
        title: zh ? "重置 draft" : "Reset draft",
        group: zh ? "动作" : "Actions",
        run: () => onAction?.("reset"),
      },
      {
        id: "act-settings",
        title: zh ? "打开设置 (API 密钥)" : "Open settings (API keys)",
        hint: "⚙",
        group: zh ? "动作" : "Actions",
        run: () => onAction?.("settings"),
      },
    ];

    const recentJobs: CommandItem[] = jobs.slice(0, 8).map((j) => ({
      id: `job-${j.id}`,
      title: j.title || j.modelId,
      subtitle: `${j.status} · ${j.modelId.split("/").pop()}`,
      group: zh ? "最近任务" : "Recent jobs",
      run: () => {
        selectJob(j.id);
        router.push("/studio"); // 选任务后进工坊查看,不是 Landing
      },
    }));

    const saved: CommandItem[] = savedPrompts.slice(0, 8).map((p) => ({
      id: `saved-${p.id}`,
      title: p.title,
      subtitle: p.prompt.slice(0, 80),
      group: zh ? "我的收藏" : "Saved prompts",
      run: () => {
        loadExternalPromptIntoDraft(p.prompt, p.negativePrompt);
        router.push("/studio"); // 载入收藏后进工坊编辑,不是 Landing
      },
    }));

    return [...pages, ...actions, ...recentJobs, ...saved];
  }, [jobs, savedPrompts, zh, router, selectJob, loadExternalPromptIntoDraft, onAction]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((it) =>
      `${it.title} ${it.subtitle ?? ""} ${it.group}`
        .toLowerCase()
        .includes(query)
    );
  }, [items, q]);

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1));
  }, [filtered.length, cursor]);

  // Group by group for rendering
  const grouped = useMemo(() => {
    const g = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      const arr = g.get(it.group) ?? [];
      arr.push(it);
      g.set(it.group, arr);
    }
    return [...g.entries()];
  }, [filtered]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[cursor];
      if (it) {
        it.run();
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;
  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div
        className="cp-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="cp-input"
          placeholder={zh ? "输入命令、页面或任务…" : "Type a command, page, or job…"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
        />
        <div className="cp-list">
          {grouped.length === 0 ? (
            <div className="cp-empty">
              {zh ? "没有匹配" : "No matches"}
            </div>
          ) : (
            grouped.map(([group, rows]) => (
              <div key={group} className="cp-group">
                <div className="cp-group-head">{group}</div>
                {rows.map((it) => {
                  const flatIdx = filtered.indexOf(it);
                  const active = flatIdx === cursor;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`cp-row${active ? " on" : ""}`}
                      onMouseEnter={() => setCursor(flatIdx)}
                      onClick={() => {
                        it.run();
                        onClose();
                      }}
                    >
                      <div className="cp-row-main">
                        <div className="cp-title">{it.title}</div>
                        {it.subtitle && (
                          <div className="cp-sub">{it.subtitle}</div>
                        )}
                      </div>
                      {it.hint && <div className="cp-hint">{it.hint}</div>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cp-foot">
          <span>
            <kbd>↑↓</kbd> {zh ? "移动" : "move"}
          </span>
          <span>
            <kbd>↵</kbd> {zh ? "执行" : "run"}
          </span>
          <span>
            <kbd>Esc</kbd> {zh ? "关闭" : "close"}
          </span>
        </div>
      </div>

      <style jsx>{`
        .cp-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          z-index: 110;
          display: grid;
          place-items: start center;
          padding: 12vh 20px 20px;
        }
        .cp-panel {
          background: var(--ink);
          border: 1px solid var(--line);
          max-width: 640px;
          width: 100%;
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
          max-height: 70vh;
        }
        .cp-input {
          background: var(--ink-2);
          border: none;
          border-bottom: 1px solid var(--line);
          color: var(--paper);
          padding: 18px 20px;
          font-family: var(--font-mono);
          font-size: 15px;
          outline: none;
        }
        .cp-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0;
        }
        .cp-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.12em;
        }
        .cp-group-head {
          padding: 10px 20px 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .cp-row {
          width: 100%;
          background: transparent;
          border: none;
          color: var(--paper);
          padding: 10px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          cursor: pointer;
          text-align: left;
        }
        .cp-row.on {
          background: color-mix(in oklab, var(--accent) 14%, transparent);
        }
        .cp-row-main {
          flex: 1;
          min-width: 0;
        }
        .cp-title {
          font-family: var(--font-serif);
          font-size: 15px;
          line-height: 1.3;
        }
        .cp-sub {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--paper-mute);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cp-hint {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--paper-dim);
          padding: 2px 8px;
          border: 1px solid var(--line);
          border-radius: 2px;
          flex-shrink: 0;
        }
        .cp-foot {
          display: flex;
          gap: 18px;
          padding: 10px 20px;
          border-top: 1px solid var(--line);
          background: var(--ink-2);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        kbd {
          padding: 1px 6px;
          background: var(--ink-3);
          border: 1px solid var(--line);
          border-radius: 2px;
          font-size: 9.5px;
          color: var(--paper);
          margin-right: 4px;
        }
      `}</style>
    </div>
  );
}
