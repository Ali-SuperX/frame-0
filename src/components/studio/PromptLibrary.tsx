"use client";

import { useMemo, useState } from "react";
import { STARTERS, type Starter } from "@/lib/bailian/starters";
import type { Mode } from "@/lib/bailian/models";
import { useStudioStore, type SavedPrompt } from "@/lib/store";
import { confirmDialog } from "@/components/ui/Dialog";

type Scope = "prompt" | "params" | "all";

type Props = {
  open: boolean;
  onClose: () => void;
  currentMode: Mode;
  zh: boolean;
  /** Called when user picks a starter with a scope. */
  onApply: (starter: Starter, scope: Scope) => void;
  /** Called when user picks one of their saved prompts. */
  onApplySaved: (saved: SavedPrompt, scope: Scope) => void;
};

const MODES: Array<Mode | "all"> = ["all", "t2v", "i2v", "r2v"];
const MODE_ZH: Record<Mode | "all", string> = {
  all: "全部",
  t2v: "T2V",
  i2v: "I2V",
  r2v: "R2V",
  t2i: "T2I",
  i2i: "I2I",
  ve: "VE",
};
const MODE_EN: Record<Mode | "all", string> = {
  all: "All",
  t2v: "T2V",
  i2v: "I2V",
  r2v: "R2V",
  t2i: "T2I",
  i2i: "I2I",
  ve: "VE",
};

/** Floating, dismissible library panel. Can be opened any time. */
export default function PromptLibrary({
  open,
  onClose,
  currentMode,
  zh,
  onApply,
  onApplySaved,
}: Props) {
  const [tab, setTab] = useState<"builtin" | "saved">("builtin");
  const [filter, setFilter] = useState<Mode | "all">(currentMode);
  const [query, setQuery] = useState("");

  const savedPrompts = useStudioStore((s) => s.savedPrompts);
  const removeSaved = useStudioStore((s) => s.removeSavedPrompt);
  const renameSaved = useStudioStore((s) => s.renameSavedPrompt);

  const builtinList = useMemo(() => {
    const mode = filter === "all" ? null : filter;
    const q = query.trim().toLowerCase();
    return STARTERS.filter((s) => {
      if (mode && s.mode !== mode) return false;
      if (!q) return true;
      const blob = `${s.title.zh} ${s.title.en} ${s.prompt} ${s.tags.join(" ")} ${s.modelId}`.toLowerCase();
      return blob.includes(q);
    });
  }, [filter, query]);

  const savedList = useMemo(() => {
    const mode = filter === "all" ? null : filter;
    const q = query.trim().toLowerCase();
    return savedPrompts.filter((p) => {
      if (mode && p.mode && p.mode !== mode) return false;
      if (!q) return true;
      const blob = `${p.title} ${p.prompt} ${p.modelId ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [savedPrompts, filter, query]);

  if (!open) return null;

  return (
    <div className="lib-backdrop" onClick={onClose}>
      <div
        className="lib-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Prompt library"
      >
        <div className="lib-head">
          <div>
            <div className="lib-kicker">
              {zh ? "灵感库" : "Prompt library"}
            </div>
            <div className="lib-sub">
              {zh
                ? "挑一个 · 可以只拿 prompt、只拿参数，或全套加载"
                : "Pick one — insert prompt only, swap params, or load it all"}
            </div>
          </div>
          <button
            type="button"
            className="lib-close"
            onClick={onClose}
            aria-label="close"
          >
            ×
          </button>
        </div>

        {/* Source tabs — built-in vs saved */}
        <div className="lib-source-tabs">
          <button
            type="button"
            className={`lib-source-tab${tab === "builtin" ? " on" : ""}`}
            onClick={() => setTab("builtin")}
          >
            {zh ? "内置" : "Built-in"}
            <span className="lib-count">{STARTERS.length}</span>
          </button>
          <button
            type="button"
            className={`lib-source-tab${tab === "saved" ? " on" : ""}`}
            onClick={() => setTab("saved")}
          >
            ⭐ {zh ? "我的收藏" : "My saved"}
            <span className="lib-count">{savedPrompts.length}</span>
          </button>
        </div>

        <div className="lib-controls">
          <div className="lib-filter">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`lib-chip${filter === m ? " on" : ""}`}
                onClick={() => setFilter(m)}
              >
                {zh ? MODE_ZH[m] : MODE_EN[m]}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="lib-search"
            placeholder={zh ? "搜索 prompt / 模型 / 标签" : "search prompt / model / tag"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="lib-list">
          {tab === "builtin" ? (
            builtinList.length === 0 ? (
              <div className="lib-empty">{zh ? "没有匹配项" : "No matches."}</div>
            ) : (
              builtinList.map((s) => (
                <LibRow
                  key={s.id}
                  starter={s}
                  zh={zh}
                  onApply={(scope) => {
                    onApply(s, scope);
                    onClose();
                  }}
                />
              ))
            )
          ) : savedList.length === 0 ? (
            <div className="lib-empty">
              {savedPrompts.length === 0
                ? zh
                  ? "还没有收藏。写完 prompt 后点参数面板顶部的 ⭐ 收藏按钮。"
                  : "Nothing saved yet. Hit the ⭐ Save button above the prompt."
                : zh
                  ? "当前筛选无匹配"
                  : "No matches in current filter."}
            </div>
          ) : (
            savedList.map((s) => (
              <SavedRow
                key={s.id}
                saved={s}
                zh={zh}
                onApply={(scope) => {
                  onApplySaved(s, scope);
                  onClose();
                }}
                onRename={(title) => renameSaved(s.id, title)}
                onRemove={() => removeSaved(s.id)}
              />
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .lib-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          z-index: 80;
          display: grid;
          place-items: center;
          padding: 40px 20px;
        }
        .lib-panel {
          background: var(--ink);
          border: 1px solid var(--line);
          max-width: 820px;
          width: 100%;
          max-height: min(86vh, 780px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
        }
        .lib-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--line);
        }
        .lib-kicker {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .lib-sub {
          font-family: var(--serif);
          font-style: italic;
          font-size: 14px;
          color: var(--paper-dim);
        }
        .lib-close {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          width: 32px;
          height: 32px;
          font-size: 20px;
          cursor: pointer;
          font-family: var(--mono);
        }
        .lib-close:hover {
          color: var(--paper);
          border-color: var(--paper);
        }
        /* Built-in vs saved source tabs */
        .lib-source-tabs {
          display: flex;
          border-bottom: 1px solid var(--line);
        }
        .lib-source-tab {
          flex: 1;
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--line);
          color: var(--paper-mute);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .lib-source-tab:last-child {
          border-right: none;
        }
        .lib-source-tab.on {
          color: var(--accent);
          background: var(--ink-2);
          box-shadow: inset 0 -2px 0 var(--accent);
        }
        .lib-count {
          padding: 1px 6px;
          background: color-mix(in oklab, var(--paper) 10%, transparent);
          color: var(--paper-dim);
          border-radius: 8px;
          font-size: 9px;
        }
        .lib-source-tab.on .lib-count {
          background: color-mix(in oklab, var(--accent) 24%, transparent);
          color: var(--accent);
        }

        .lib-controls {
          display: flex;
          gap: 12px;
          padding: 12px 20px;
          border-bottom: 1px solid var(--line);
          align-items: center;
        }
        .lib-filter {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .lib-chip {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          padding: 5px 10px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .lib-chip.on {
          background: var(--paper);
          color: var(--ink);
          border-color: var(--paper);
        }
        .lib-search {
          flex: 1;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 7px 10px;
          font-family: var(--mono);
          font-size: 11.5px;
        }
        .lib-search:focus {
          outline: none;
          border-color: var(--accent);
        }
        .lib-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0;
        }
        .lib-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--paper-mute);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
        }
      `}</style>
    </div>
  );
}

/* ─────────── Row ─────────── */

/* ─────────── Saved row (user's curated prompt) ─────────── */

function SavedRow({
  saved,
  zh,
  onApply,
  onRename,
  onRemove,
}: {
  saved: SavedPrompt;
  zh: boolean;
  onApply: (scope: Scope) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const hasParams = !!saved.params;
  return (
    <div className="lib-row saved">
      <div className="lib-bg" style={{ background: "var(--ink-3)" }}>
        <span>⭐</span>
      </div>
      <div className="lib-body">
        <div className="lib-row-head">
          <input
            className="saved-title-input"
            defaultValue={saved.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== saved.title) onRename(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <span className="lib-tags">
            {saved.mode && (
              <span className="tag-mode">{saved.mode.toUpperCase()}</span>
            )}
            {saved.modelId && (
              <span className="tag-model">
                {saved.modelId.split("/").pop()}
              </span>
            )}
            <span className="tag-eta">
              {hasParams
                ? zh ? "含参数" : "w/ params"
                : zh ? "仅 prompt" : "prompt only"}
            </span>
          </span>
        </div>
        <div className="lib-prompt">“{saved.prompt}”</div>
        <div className="lib-actions">
          <button
            type="button"
            className="lib-act"
            onClick={() => onApply("prompt")}
            title={zh ? "只插入 prompt" : "Insert prompt only"}
          >
            {zh ? "只要 Prompt" : "Prompt only"}
          </button>
          {hasParams && (
            <button
              type="button"
              className="lib-act"
              onClick={() => onApply("params")}
              title={zh ? "载入保存时的模型和参数" : "Load stored model + params"}
            >
              {zh ? "只换参数" : "Params only"}
            </button>
          )}
          <button
            type="button"
            className="lib-act primary"
            onClick={() => onApply("all")}
          >
            {hasParams
              ? zh ? "全套加载 →" : "Load all →"
              : zh ? "插入 →" : "Insert →"}
          </button>
          <button
            type="button"
            className="lib-act danger"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: zh ? "删除这条收藏？" : "Delete this saved prompt?",
                  danger: true,
                })
              )
                onRemove();
            }}
            title={zh ? "删除" : "Delete"}
          >
            ×
          </button>
        </div>
      </div>

      <style jsx>{`
        .lib-row.saved {
          background: color-mix(in oklab, var(--accent) 4%, transparent);
        }
        .saved-title-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: 1px solid transparent;
          color: var(--paper);
          font-family: var(--serif);
          font-size: 16px;
          padding: 2px 6px;
        }
        .saved-title-input:hover {
          border-color: var(--line);
        }
        .saved-title-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .lib-act.danger:hover {
          color: #c44;
          border-color: #c44;
        }
      `}</style>
    </div>
  );
}

function LibRow({
  starter,
  zh,
  onApply,
}: {
  starter: Starter;
  zh: boolean;
  onApply: (scope: Scope) => void;
}) {
  return (
    <div className="lib-row">
      <div className="lib-bg" style={{ background: starter.bg }}>
        <span>{starter.glyph}</span>
      </div>
      <div className="lib-body">
        <div className="lib-row-head">
          <span className="lib-title">
            {zh ? starter.title.zh : starter.title.en}
          </span>
          <span className="lib-tags">
            <span className="tag-mode">{starter.mode.toUpperCase()}</span>
            <span className="tag-model">
              {starter.modelId.split("/").pop()}
            </span>
            <span className="tag-eta">~{Math.round(starter.etaSec / 60)}m</span>
          </span>
        </div>
        <div className="lib-prompt">“{starter.prompt}”</div>
        <div className="lib-actions">
          <button
            type="button"
            className="lib-act"
            onClick={() => onApply("prompt")}
            title={zh ? "只插入 prompt，保留当前模型和参数" : "Insert prompt only"}
          >
            {zh ? "只要 Prompt" : "Prompt only"}
          </button>
          <button
            type="button"
            className="lib-act"
            onClick={() => onApply("params")}
            title={zh ? "只换模型和参数，保留当前 prompt" : "Swap model + params"}
          >
            {zh ? "只换参数" : "Params only"}
          </button>
          <button
            type="button"
            className="lib-act primary"
            onClick={() => onApply("all")}
          >
            {zh ? "全套加载 →" : "Load all →"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .lib-row {
          display: grid;
          grid-template-columns: 72px 1fr;
          gap: 14px;
          padding: 12px 20px;
          border-bottom: 1px solid var(--line);
          align-items: center;
        }
        .lib-row:last-child {
          border-bottom: none;
        }
        .lib-bg {
          width: 72px;
          height: 72px;
          display: grid;
          place-items: center;
          font-size: 30px;
          filter: saturate(1.05);
        }
        .lib-body {
          min-width: 0;
        }
        .lib-row-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 6px;
        }
        .lib-title {
          font-family: var(--serif);
          font-size: 16px;
          color: var(--paper);
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .lib-tags {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .lib-tags span {
          padding: 2px 6px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border: 1px solid var(--line);
        }
        .tag-mode {
          color: var(--accent);
          border-color: var(--accent) !important;
        }
        .tag-model {
          color: var(--paper-mute);
        }
        .tag-eta {
          color: var(--paper-dim);
        }
        .lib-prompt {
          font-family: var(--serif);
          font-style: italic;
          font-size: 12.5px;
          line-height: 1.45;
          color: var(--paper-dim);
          margin-bottom: 10px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .lib-actions {
          display: flex;
          gap: 6px;
        }
        .lib-act {
          padding: 5px 11px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-dim);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .lib-act:hover {
          color: var(--paper);
          border-color: var(--paper-mute);
        }
        .lib-act.primary {
          background: var(--accent);
          color: var(--ink);
          border-color: var(--accent);
        }
        .lib-act.primary:hover {
          filter: brightness(1.1);
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}
