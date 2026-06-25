"use client";

/**
 * AssetEditModal —— 编辑一个资产(job)的 名称 / 标签 / 备注。
 * 标签纯手动增删；「已有标签」当建议点选，省手打(不累手的智能在交互，不靠 AI)。
 * portal 到 body，避免被祖先 transform 困住。
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Job, AssetCategory } from "@/lib/store";

const CATEGORIES: { id: AssetCategory; zh: string; en: string; icon: string }[] = [
  { id: "output", zh: "成片", en: "Output", icon: "🎬" },
  { id: "character", zh: "角色", en: "Character", icon: "🧑" },
  { id: "scene", zh: "场景", en: "Scene", icon: "🏞" },
  { id: "footage", zh: "素材", en: "Footage", icon: "📁" },
  { id: "audio", zh: "音频", en: "Audio", icon: "🎵" },
];

type Props = {
  job: Job | null;
  zh: boolean;
  allTags: string[];
  onClose: () => void;
  onSave: (patch: { title: string; tags: string[]; note: string; category?: AssetCategory }) => void;
};

export default function AssetEditModal({
  job,
  zh,
  allTags,
  onClose,
  onSave,
}: Props) {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<AssetCategory>("output");
  const [tagInput, setTagInput] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (job) {
      setTitle(job.title || "");
      setTags(job.tags ?? []);
      setNote(job.note ?? "");
      setCategory(job.category ?? "output");
      setTagInput("");
    }
  }, [job]);

  if (!job || !mounted) return null;

  function addTag(t: string) {
    const clean = t.trim();
    if (!clean) return;
    setTags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }
  const suggestions = allTags.filter((t) => !tags.includes(t)).slice(0, 14);

  return createPortal(
    <div className="aem-backdrop" onClick={onClose}>
      <div className="aem-panel" onClick={(e) => e.stopPropagation()}>
        <div className="aem-head">
          <span className="aem-title">{zh ? "编辑资产" : "Edit asset"}</span>
          <button type="button" className="aem-x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div className="aem-field">
          <span className="aem-label">{zh ? "分类" : "Category"}</span>
          <div className="aem-cat-row">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`aem-cat-btn${category === c.id ? " on" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                {c.icon} {zh ? c.zh : c.en}
              </button>
            ))}
          </div>
        </div>

        <label className="aem-field">
          <span className="aem-label">{zh ? "名称" : "Title"}</span>
          <input
            className="aem-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>

        <div className="aem-field">
          <span className="aem-label">{zh ? "标签" : "Tags"}</span>
          <div className="aem-tags">
            {tags.map((t) => (
              <span key={t} className="aem-tag">
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label="remove">
                  ×
                </button>
              </span>
            ))}
            <input
              className="aem-tag-input"
              value={tagInput}
              placeholder={zh ? "加标签，回车确认" : "Add tag, Enter"}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && !tagInput && tags.length) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="aem-suggest">
              <span className="aem-suggest-lbl">{zh ? "已有标签：" : "Used: "}</span>
              {suggestions.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="aem-suggest-chip"
                  onClick={() => addTag(t)}
                >
                  + {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="aem-field">
          <span className="aem-label">{zh ? "备注" : "Note"}</span>
          <textarea
            className="aem-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={zh ? "给这个资产写点备注…" : "Notes…"}
          />
        </label>

        <div className="aem-acts">
          <button type="button" className="aem-cancel" onClick={onClose}>
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            className="aem-save"
            onClick={() => onSave({ title, tags, note, category })}
          >
            {zh ? "保存" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
