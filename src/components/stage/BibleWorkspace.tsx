"use client";

import { useState } from "react";
import { useStudioStore, type Series, type StageElement, type ElementKind, type RefImage } from "@/lib/store";
import { storeLocalFile } from "@/lib/editor/localFiles";

type Props = { series: Series; zh: boolean };

const KIND_LABELS: Record<ElementKind, { zh: string; en: string; icon: string; hint: string; hintEn: string }> = {
  character: { zh: "角色", en: "Character", icon: "🧑", hint: "建立角色形象，保证跨集一致", hintEn: "Define characters for cross-episode consistency" },
  location: { zh: "地点", en: "Location", icon: "📍", hint: "场景/背景设定参考", hintEn: "Scene & background references" },
  prop: { zh: "道具", en: "Prop", icon: "🎒", hint: "关键道具的参考图", hintEn: "Key prop references" },
  style: { zh: "风格", en: "Style", icon: "🎨", hint: "画风/色调/氛围基准", hintEn: "Art style & mood baseline" },
};

const TTS_VOICES = [
  { id: "longxiaochun", label: "龙小淳(女)" },
  { id: "longlaotie", label: "龙老铁(男)" },
  { id: "longshu", label: "龙书(男)" },
  { id: "longmiao", label: "龙喵(女)" },
  { id: "longyue", label: "龙悦(女)" },
  { id: "longfei", label: "龙飞(男)" },
];

export default function BibleWorkspace({ series, zh }: Props) {
  const addElement = useStudioStore((s) => s.seriesAddElement);
  const updateElement = useStudioStore((s) => s.seriesUpdateElement);
  const removeElement = useStudioStore((s) => s.seriesRemoveElement);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = editingId ? series.bible.find((e) => e.id === editingId) : null;
  const grouped = (kind: ElementKind) => series.bible.filter((e) => e.kind === kind);
  const isEmpty = series.bible.length === 0;

  function handleAdd(kind: ElementKind) {
    const id = addElement({
      kind,
      name: zh ? `新${KIND_LABELS[kind].zh}` : `New ${KIND_LABELS[kind].en}`,
      refImages: [],
    });
    setEditingId(id);
  }

  async function handleUploadRef(elId: string, file: File, angle: RefImage["angle"]) {
    const el = series.bible.find((e) => e.id === elId);
    if (!el) return;
    const localKey = `bible-${elId}-${angle}-${Date.now()}`;
    await storeLocalFile(localKey, file);
    const url = URL.createObjectURL(file);
    const next = [...el.refImages];
    const idx = next.findIndex((r) => r.angle === angle);
    if (idx >= 0) next[idx] = { url, localKey, angle };
    else next.push({ url, localKey, angle });
    updateElement(elId, { refImages: next });
  }

  function handleRemoveRef(elId: string, angle: RefImage["angle"]) {
    const el = series.bible.find((e) => e.id === elId);
    if (!el) return;
    updateElement(elId, { refImages: el.refImages.filter((r) => r.angle !== angle) });
  }

  return (
    <div className="bible">
      {/* ── 空态引导 ── */}
      {isEmpty && (
        <div className="bible-empty-hero">
          <div className="bible-empty-kicker">FRAME/0 · BIBLE</div>
          <h2 className="bible-empty-title">
            {zh ? "先建角色，" : "Characters first, "}
            <em>{zh ? "再写剧。" : "then script."}</em>
          </h2>
          <p className="bible-empty-desc">
            {zh
              ? "连载的一致性地基是先锁定角色与画风。元素库是入口，不是附属。"
              : "Lock characters & style first — the foundation of serial consistency."}
          </p>
          <div className="bible-empty-grid">
            {(["character", "location", "prop", "style"] as ElementKind[]).map((kind) => (
              <button
                key={kind}
                className="bible-empty-card"
                onClick={() => handleAdd(kind)}
              >
                <span className="bible-empty-icon">{KIND_LABELS[kind].icon}</span>
                <span className="bible-empty-label">{zh ? KIND_LABELS[kind].zh : KIND_LABELS[kind].en}</span>
                <span className="bible-empty-hint">{zh ? KIND_LABELS[kind].hint : KIND_LABELS[kind].hintEn}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 有内容时的正常网格 ── */}
      {!isEmpty && (
        <div className="bible-content">
          <div className="bible-grid">
            {(["character", "location", "prop", "style"] as ElementKind[]).map((kind) => (
              <div key={kind} className="bible-group">
                <div className="bible-group-head">
                  <span>{KIND_LABELS[kind].icon} {zh ? KIND_LABELS[kind].zh : KIND_LABELS[kind].en}</span>
                  <span className="bible-group-count">{grouped(kind).length}</span>
                  <button className="bible-add-btn" onClick={() => handleAdd(kind)}>+</button>
                </div>
                <div className="bible-cards">
                  {grouped(kind).map((el) => (
                    <button
                      key={el.id}
                      className={`bible-card${editingId === el.id ? " on" : ""}`}
                      onClick={() => setEditingId(editingId === el.id ? null : el.id)}
                      style={el.color ? { borderColor: el.color } : undefined}
                    >
                      {el.refImages[0] ? (
                        <img src={el.refImages[0].url} alt={el.name} className="bible-card-img" />
                      ) : (
                        <div className="bible-card-ph">{KIND_LABELS[kind].icon}</div>
                      )}
                      <span className="bible-card-name">{el.name}</span>
                    </button>
                  ))}
                  <button className="bible-card bible-card-add" onClick={() => handleAdd(kind)}>
                    <span className="bible-card-ph">+</span>
                    <span className="bible-card-name">{zh ? "添加" : "Add"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ── 右侧编辑面板 ── */}
          {editing && (
            <div className="bible-editor">
              <div className="bible-editor-head">
                <input
                  className="bible-name-input"
                  value={editing.name}
                  onChange={(e) => updateElement(editing.id, { name: e.target.value })}
                />
                <button className="bible-del" onClick={() => { removeElement(editing.id); setEditingId(null); }}>
                  {zh ? "删除" : "Delete"}
                </button>
              </div>

              <label className="bible-label">{zh ? "描述" : "Description"}</label>
              <textarea
                className="bible-desc"
                value={editing.description ?? ""}
                onChange={(e) => updateElement(editing.id, { description: e.target.value })}
                placeholder={zh ? "外貌/性格/服装…" : "Appearance / personality…"}
                rows={3}
              />

              <label className="bible-label">{zh ? "参考图（多角度）" : "Reference images"}</label>
              <div className="bible-refs">
                {(["front", "side", "back", "expr"] as const).map((angle) => {
                  const ref = editing.refImages.find((r) => r.angle === angle);
                  return (
                    <div key={angle} className="bible-ref-slot">
                      {ref ? (
                        <div className="bible-ref-filled">
                          <img src={ref.url} alt={angle} className="bible-ref-img" />
                          <button className="bible-ref-x" onClick={() => handleRemoveRef(editing.id, angle)}>×</button>
                        </div>
                      ) : (
                        <label className="bible-ref-add">
                          <span>+</span>
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadRef(editing.id, f, angle);
                            }}
                          />
                        </label>
                      )}
                      <span className="bible-ref-label">
                        {{ front: zh ? "正面" : "Front", side: zh ? "侧面" : "Side", back: zh ? "背面" : "Back", expr: zh ? "表情" : "Expr" }[angle]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {editing.kind === "character" && (
                <>
                  <label className="bible-label">{zh ? "一致性强度" : "Consistency"}</label>
                  <div className="bible-slider-row">
                    <input
                      type="range" min={0} max={100}
                      value={editing.consistencyWeight ?? 80}
                      onChange={(e) => updateElement(editing.id, { consistencyWeight: +e.target.value })}
                      className="bible-slider"
                    />
                    <span className="bible-slider-val">{editing.consistencyWeight ?? 80}%</span>
                  </div>

                  <label className="bible-label">{zh ? "音色" : "Voice"}</label>
                  <select
                    className="bible-voice-select"
                    value={editing.voiceId ?? ""}
                    onChange={(e) => updateElement(editing.id, { voiceId: e.target.value || undefined })}
                  >
                    <option value="">{zh ? "未绑定" : "None"}</option>
                    {TTS_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>

                  <label className="bible-label">{zh ? "表演基线" : "Acting baseline"}</label>
                  <textarea
                    className="bible-desc"
                    value={editing.actingBaseline ?? ""}
                    onChange={(e) => updateElement(editing.id, { actingBaseline: e.target.value })}
                    placeholder={zh ? "性格/口癖/默认情绪…" : "Personality / verbal tics…"}
                    rows={2}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
