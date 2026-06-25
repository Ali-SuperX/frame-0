"use client";

/**
 * DirectorPresetPicker —— 导演台「场景套路」选择面板（工坊 / 画布共用）。
 * 内置预设 + 用户自定义模版，分组标签 + 多标签交叉筛选 + 搜索。
 * 支持新建/编辑/删除自定义模版。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PROMPT_PRESETS, PRESET_TAGS, type PromptPreset } from "@/lib/r2v/promptPresets";
import { useStudioStore } from "@/lib/store";

const TAG_GROUPS: { label: { zh: string; en: string }; ids: string[] }[] = [
  {
    label: { zh: "类型", en: "Type" },
    ids: ["ecommerce", "narrative", "stylized", "utility", "generic", "official", "hh-tuned"],
  },
  {
    label: { zh: "风格", en: "Style" },
    ids: ["cinematic", "mystery", "cyberpunk", "retro", "steampunk", "minimal", "artistic"],
  },
  {
    label: { zh: "属性", en: "Attr" },
    ids: ["fast-paced", "slow-paced", "high-saturation", "low-saturation", "macro", "real-person", "no-human", "voice-over", "ugc"],
  },
  {
    label: { zh: "行业", en: "Industry" },
    ids: ["beauty", "apparel", "food", "digital", "home", "baby", "automotive", "vlog", "travel", "fitness", "healing", "festival", "urgency"],
  },
];

type Props = {
  open: boolean;
  zh: boolean;
  hasIdea: boolean;
  onClose: () => void;
  onPick: (presetId: string) => void;
};

type EditorState = {
  emoji: string;
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
  tags: string[];
  style: "detailed" | "concise";
  ecommerce: boolean;
};

const EMPTY_EDITOR: EditorState = {
  emoji: "⭐",
  label: "",
  labelEn: "",
  desc: "",
  descEn: "",
  tags: [],
  style: "detailed",
  ecommerce: false,
};

export default function DirectorPresetPicker({
  open,
  zh,
  hasIdea,
  onClose,
  onPick,
}: Props) {
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const customPresets = useStudioStore((s) => s.customPresets);
  const addCustomPreset = useStudioStore((s) => s.addCustomPreset);
  const updateCustomPreset = useStudioStore((s) => s.updateCustomPreset);
  const removeCustomPreset = useStudioStore((s) => s.removeCustomPreset);

  const [editing, setEditing] = useState<string | null>(null);
  const [editorForm, setEditorForm] = useState<EditorState>(EMPTY_EDITOR);

  const customIds = useMemo(() => new Set(customPresets.map((p) => p.id)), [customPresets]);

  const toggleTag = (id: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allPresets = useMemo(() => [...customPresets, ...PROMPT_PRESETS], [customPresets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPresets.filter((p) => {
      if (tags.size && !Array.from(tags).every((t) => p.tags.includes(t)))
        return false;
      if (q) {
        const haystack = `${p.label} ${p.labelEn} ${p.desc} ${p.descEn} ${p.tags.join(" ")}`.toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }, [tags, query, allPresets]);

  function startNew() {
    setEditorForm(EMPTY_EDITOR);
    setEditing("__new__");
  }

  function startEdit(p: PromptPreset) {
    setEditorForm({
      emoji: p.emoji,
      label: p.label,
      labelEn: p.labelEn,
      desc: p.desc,
      descEn: p.descEn,
      tags: [...p.tags],
      style: p.style,
      ecommerce: !!p.ecommerce,
    });
    setEditing(p.id);
  }

  function handleSave() {
    if (!editorForm.label.trim()) return;
    const data: Omit<PromptPreset, "id"> = {
      emoji: editorForm.emoji || "⭐",
      label: editorForm.label.trim(),
      labelEn: editorForm.labelEn.trim() || editorForm.label.trim(),
      desc: editorForm.desc.trim(),
      descEn: editorForm.descEn.trim() || editorForm.desc.trim(),
      tags: editorForm.tags,
      style: editorForm.style,
      ecommerce: editorForm.ecommerce || undefined,
    };
    if (editing === "__new__") {
      addCustomPreset(data);
    } else if (editing) {
      updateCustomPreset(editing, data);
    }
    setEditing(null);
  }

  function handleDelete() {
    if (editing && editing !== "__new__") {
      removeCustomPreset(editing);
    }
    setEditing(null);
  }

  function toggleEditorTag(tagId: string) {
    setEditorForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter((t) => t !== tagId)
        : [...prev.tags, tagId],
    }));
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="dp-backdrop" onClick={onClose}>
      <div className="dp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dp-head">
          <span className="dp-title">🎬 {zh ? "选个导演套路" : "Pick a style"}</span>
          <input
            ref={searchRef}
            type="text"
            className="dp-search"
            placeholder={zh ? "搜索套路…" : "Search…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="dp-x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div className="dp-tags">
          {TAG_GROUPS.map((g) => (
            <div key={g.label.en} className="dp-tag-group">
              <span className="dp-tag-label">{zh ? g.label.zh : g.label.en}</span>
              {g.ids.map((id) => {
                const t = PRESET_TAGS[id];
                if (!t) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`dp-tag${tags.has(id) ? " on" : ""}`}
                    onClick={() => toggleTag(id)}
                  >
                    {zh ? t.zh : t.en}
                  </button>
                );
              })}
            </div>
          ))}
          {tags.size > 0 && (
            <button
              type="button"
              className="dp-tag dp-tag-clear"
              onClick={() => setTags(new Set())}
            >
              {zh ? "清除筛选" : "Clear"}
            </button>
          )}
        </div>

        {editing ? (
          /* ── 编辑面板 ── */
          <div className="dp-editor">
            <div className="dp-editor-head">
              <span className="dp-editor-title">
                {editing === "__new__"
                  ? (zh ? "新建模版" : "New template")
                  : (zh ? "编辑模版" : "Edit template")}
              </span>
              <div className="dp-editor-acts">
                {editing !== "__new__" && (
                  <button type="button" className="dp-editor-del" onClick={handleDelete}>
                    {zh ? "删除" : "Delete"}
                  </button>
                )}
                <button type="button" className="dp-editor-cancel" onClick={() => setEditing(null)}>
                  {zh ? "取消" : "Cancel"}
                </button>
                <button type="button" className="dp-editor-save" onClick={handleSave} disabled={!editorForm.label.trim()}>
                  {zh ? "保存" : "Save"}
                </button>
              </div>
            </div>
            <div className="dp-editor-body">
              <div className="dp-editor-row">
                <label className="dp-editor-label">Emoji</label>
                <input
                  className="dp-editor-input dp-editor-emoji"
                  value={editorForm.emoji}
                  onChange={(e) => setEditorForm((f) => ({ ...f, emoji: e.target.value.slice(0, 2) }))}
                  maxLength={2}
                />
              </div>
              <div className="dp-editor-row">
                <label className="dp-editor-label">{zh ? "名称" : "Label"}</label>
                <input
                  className="dp-editor-input"
                  value={editorForm.label}
                  onChange={(e) => setEditorForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={zh ? "模版名称" : "Template name"}
                />
              </div>
              <div className="dp-editor-row">
                <label className="dp-editor-label">{zh ? "英文名" : "Label EN"}</label>
                <input
                  className="dp-editor-input"
                  value={editorForm.labelEn}
                  onChange={(e) => setEditorForm((f) => ({ ...f, labelEn: e.target.value }))}
                  placeholder="English name"
                />
              </div>
              <div className="dp-editor-row">
                <label className="dp-editor-label">{zh ? "描述" : "Description"}</label>
                <input
                  className="dp-editor-input"
                  value={editorForm.desc}
                  onChange={(e) => setEditorForm((f) => ({ ...f, desc: e.target.value }))}
                  placeholder={zh ? "一句话描述风格/用法" : "One-line description"}
                />
              </div>
              <div className="dp-editor-row">
                <label className="dp-editor-label">{zh ? "英文描述" : "Desc EN"}</label>
                <input
                  className="dp-editor-input"
                  value={editorForm.descEn}
                  onChange={(e) => setEditorForm((f) => ({ ...f, descEn: e.target.value }))}
                  placeholder="English description"
                />
              </div>
              <div className="dp-editor-row">
                <label className="dp-editor-label">{zh ? "风格" : "Style"}</label>
                <select
                  className="dp-editor-select"
                  value={editorForm.style}
                  onChange={(e) => setEditorForm((f) => ({ ...f, style: e.target.value as "detailed" | "concise" }))}
                >
                  <option value="detailed">{zh ? "详细" : "Detailed"}</option>
                  <option value="concise">{zh ? "精简" : "Concise"}</option>
                </select>
              </div>
              <div className="dp-editor-row">
                <label className="dp-editor-label">{zh ? "标签" : "Tags"}</label>
                <div className="dp-editor-tags">
                  {Object.entries(PRESET_TAGS).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      className={`dp-tag${editorForm.tags.includes(id) ? " on" : ""}`}
                      onClick={() => toggleEditorTag(id)}
                    >
                      {zh ? lbl.zh : lbl.en}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── 预设网格 ── */
          <div className="dp-grid">
            {/* 新建模版卡 */}
            <button
              type="button"
              className="dp-card dp-card-auto"
              onClick={startNew}
            >
              <span className="dp-emoji">✏</span>
              <span className="dp-label">{zh ? "新建模版" : "New template"}</span>
              <span className="dp-desc">
                {zh ? "创建自己的导演套路" : "Create your own style"}
              </span>
            </button>

            {/* 自由发挥 */}
            <button
              type="button"
              className="dp-card dp-card-auto"
              disabled={!hasIdea}
              onClick={() => onPick("auto")}
              title={hasIdea ? "" : zh ? "自由发挥需要先写点想法" : "Write an idea first"}
            >
              <span className="dp-emoji">✦</span>
              <span className="dp-label">{zh ? "自由发挥" : "Free"}</span>
              <span className="dp-desc">
                {zh ? "不套套路，按你的想法直接专业扩写" : "No style — expand directly"}
              </span>
            </button>

            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`dp-card${customIds.has(p.id) ? " dp-card-custom" : ""}`}
                onClick={() => onPick(p.id)}
                title={zh ? p.desc : p.descEn}
              >
                {customIds.has(p.id) && (
                  <span
                    className="dp-card-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(p);
                    }}
                    title={zh ? "编辑" : "Edit"}
                  >
                    ✎
                  </span>
                )}
                <span className="dp-emoji">{p.emoji}</span>
                <span className="dp-label">{zh ? p.label : p.labelEn}</span>
                <span className="dp-desc">{zh ? p.desc : p.descEn}</span>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="dp-empty">
                {zh ? "没有匹配的套路" : "No matches"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
