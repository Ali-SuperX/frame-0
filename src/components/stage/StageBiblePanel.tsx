"use client";

import { useCallback, useRef, useState } from "react";
import {
  useStudioStore,
  type Series,
  type ElementKind,
  type RefImage,
} from "@/lib/store";
import { storeLocalFile } from "@/lib/editor/localFiles";
import {
  listVoices,
  getVoice,
  type TTSVoice,
} from "@/lib/r2v/ttsVoices";

const KIND_META: Record<ElementKind, { zh: string; en: string; icon: string }> = {
  character: { zh: "角色", en: "Character", icon: "🧑" },
  location: { zh: "地点", en: "Location", icon: "📍" },
  prop: { zh: "道具", en: "Prop", icon: "🎒" },
  style: { zh: "风格", en: "Style", icon: "🎨" },
};

const KINDS: ElementKind[] = ["character", "location", "prop", "style"];

export default function StageBiblePanel({
  series,
  zh,
  onClose,
}: {
  series: Series;
  zh: boolean;
  onClose: () => void;
}) {
  const addElement = useStudioStore((s) => s.seriesAddElement);
  const updateElement = useStudioStore((s) => s.seriesUpdateElement);
  const removeElement = useStudioStore((s) => s.seriesRemoveElement);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ElementKind>>(new Set());
  const [voiceFilter, setVoiceFilter] = useState<"all" | "male" | "female">("all");
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const cloneInputRef = useRef<HTMLInputElement | null>(null);

  const editing = editingId ? series.bible.find((e) => e.id === editingId) : null;

  const allVoices = listVoices();
  const filteredVoices =
    voiceFilter === "all"
      ? allVoices
      : allVoices.filter((v) => v.gender === voiceFilter);

  function handleAdd(kind: ElementKind) {
    const id = addElement({
      kind,
      name: zh ? `新${KIND_META[kind].zh}` : `New ${KIND_META[kind].en}`,
      refImages: [],
    });
    setEditingId(id);
    setCollapsed((s) => { const n = new Set(s); n.delete(kind); return n; });
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

  const handleUploadCloneAudio = useCallback(async (file: File) => {
    if (!editing) return;
    const localKey = `voice-clone-${editing.id}-${Date.now()}`;
    await storeLocalFile(localKey, file);
    const url = URL.createObjectURL(file);
    updateElement(editing.id, {
      customVoiceUrl: url,
      customVoiceLocalKey: localKey,
    });
  }, [editing, updateElement]);

  const handlePreviewVoice = useCallback(async (voiceId: string, customUrl?: string) => {
    if (previewBusy) return;
    setPreviewBusy(true);
    try {
      const sampleText = zh ? "你好，这是一段语音试听。" : "Hello, this is a voice preview.";
      const res = await fetch("/api/bailian/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sampleText,
          voice: voiceId,
          languageType: "Auto",
          sampleAudioUrl: customUrl,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      if (previewRef.current) {
        previewRef.current.src = j.audioUrl;
        previewRef.current.play();
      }
    } catch { /* silent */ }
    finally { setPreviewBusy(false); }
  }, [previewBusy, zh]);

  function toggleKind(kind: ElementKind) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(kind)) n.delete(kind); else n.add(kind);
      return n;
    });
  }

  const currentVoice = editing?.voiceId ? getVoice(editing.voiceId) : undefined;
  const hasClone = !!editing?.customVoiceUrl;

  return (
    <div className="sb-panel">
      <div className="sb-head">
        <span className="sb-title">{zh ? "元素库" : "Bible"}</span>
        <button className="sc-btn-x" onClick={onClose}>×</button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={previewRef} hidden />

      <div className="sb-body">
        {KINDS.map((kind) => {
          const items = series.bible.filter((e) => e.kind === kind);
          const isCollapsed = collapsed.has(kind);
          return (
            <div key={kind} className="sb-group">
              <button className="sb-group-head" onClick={() => toggleKind(kind)}>
                <span>{KIND_META[kind].icon} {zh ? KIND_META[kind].zh : KIND_META[kind].en}</span>
                <span className="sb-count">{items.length}</span>
                <span className="sb-chevron">{isCollapsed ? "▸" : "▾"}</span>
              </button>

              {!isCollapsed && (
                <div className="sb-items">
                  {items.map((el) => (
                    <button
                      key={el.id}
                      className={`sb-item${editingId === el.id ? " on" : ""}`}
                      onClick={() => setEditingId(editingId === el.id ? null : el.id)}
                    >
                      {el.refImages[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={el.refImages[0].url} alt="" className="sb-item-img" />
                      ) : (
                        <span className="sb-item-ph">{KIND_META[kind].icon}</span>
                      )}
                      <span className="sb-item-name">{el.name}</span>
                    </button>
                  ))}
                  <button className="sb-item sb-item-add" onClick={() => handleAdd(kind)}>
                    <span className="sb-item-ph">+</span>
                    <span className="sb-item-name">{zh ? "添加" : "Add"}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {editing && (
          <div className="sb-editor">
            <div className="sb-editor-head">
              <input
                className="sb-name-input"
                value={editing.name}
                onChange={(e) => updateElement(editing.id, { name: e.target.value })}
              />
              <button
                className="sc-btn-x"
                onClick={() => { removeElement(editing.id); setEditingId(null); }}
              >
                ×
              </button>
            </div>

            <label className="sc-label">{zh ? "描述" : "Description"}</label>
            <textarea
              className="sc-textarea"
              value={editing.description ?? ""}
              onChange={(e) => updateElement(editing.id, { description: e.target.value })}
              placeholder={zh ? "外貌/性格/服装…" : "Appearance / personality…"}
              rows={2}
            />

            <label className="sc-label">
              {zh ? "一致性强度" : "Consistency"}{" "}
              <span style={{ color: "var(--paper-mute)", fontWeight: 400 }}>{editing.consistencyWeight ?? 70}%</span>
            </label>
            <input
              type="range"
              className="sb-range"
              min={0}
              max={100}
              step={5}
              value={editing.consistencyWeight ?? 70}
              onChange={(e) => updateElement(editing.id, { consistencyWeight: Number(e.target.value) })}
            />

            <label className="sc-label">{zh ? "参考图" : "Ref images"}</label>
            <div className="sb-refs">
              {(["front", "side", "back", "expr"] as const).map((angle) => {
                const ref = editing.refImages.find((r) => r.angle === angle);
                return (
                  <div key={angle} className="sb-ref-slot">
                    {ref ? (
                      <div className="sb-ref-filled">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ref.url} alt={angle} className="sb-ref-img" />
                        <button
                          className="sb-ref-x"
                          onClick={() => {
                            updateElement(editing.id, {
                              refImages: editing.refImages.filter((r) => r.angle !== angle),
                            });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="sb-ref-add">
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
                  </div>
                );
              })}
            </div>

            {editing.kind === "character" && (
              <>
                {/* ── 音色选择 ── */}
                <label className="sc-label">{zh ? "音色" : "Voice"}</label>

                <div className="sb-voice-tabs">
                  {(["all", "female", "male"] as const).map((g) => (
                    <button
                      key={g}
                      className={`sb-voice-tab${voiceFilter === g ? " on" : ""}`}
                      onClick={() => setVoiceFilter(g)}
                    >
                      {g === "all" ? (zh ? "全部" : "All")
                        : g === "female" ? (zh ? "女" : "F")
                        : (zh ? "男" : "M")}
                    </button>
                  ))}
                </div>

                <div className="sb-voice-list">
                  {filteredVoices.map((v) => (
                    <div
                      key={v.id}
                      className={`sb-voice-item${editing.voiceId === v.id ? " on" : ""}`}
                      onClick={() => updateElement(editing.id, { voiceId: v.id })}
                      title={v.bestFor}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="sb-voice-name">{v.zh}</span>
                      <span className="sb-voice-desc">{v.desc}</span>
                      <button
                        className="sb-voice-play"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewVoice(v.id);
                        }}
                        disabled={previewBusy}
                        title={zh ? "试听" : "Preview"}
                      >
                        {previewBusy ? "⟳" : "▶"}
                      </button>
                    </div>
                  ))}
                </div>

                {currentVoice && (
                  <div className="sb-voice-current">
                    {zh ? "当前: " : "Current: "}
                    <b>{currentVoice.zh}</b>
                    <span style={{ color: "var(--paper-mute)", marginLeft: 4, fontSize: 10 }}>
                      {currentVoice.desc}
                    </span>
                  </div>
                )}

                {/* ── 声音克隆 ── */}
                <label className="sc-label">{zh ? "声音克隆" : "Voice Clone"}</label>
                <div className="sb-clone-section">
                  {hasClone ? (
                    <div className="sb-clone-status">
                      <span className="sb-clone-badge">
                        {zh ? "已上传克隆音源" : "Clone audio uploaded"}
                      </span>
                      <button
                        className="sb-voice-play"
                        onClick={() => handlePreviewVoice("", editing.customVoiceUrl!)}
                        disabled={previewBusy}
                        title={zh ? "试听克隆音色" : "Preview cloned voice"}
                      >
                        {previewBusy ? "⟳" : "▶"}
                      </button>
                      <button
                        className="sc-btn-x"
                        onClick={() => updateElement(editing.id, {
                          customVoiceUrl: undefined,
                          customVoiceLocalKey: undefined,
                        })}
                        title={zh ? "移除克隆音源" : "Remove clone"}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="sb-clone-upload">
                      <span>{zh ? "+ 上传音频克隆音色" : "+ Upload audio to clone"}</span>
                      <span className="sb-clone-hint">
                        {zh ? "10-30秒清晰人声,MP3/WAV" : "10-30s clear speech, MP3/WAV"}
                      </span>
                      <input
                        ref={cloneInputRef}
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadCloneAudio(f);
                        }}
                      />
                    </label>
                  )}
                  <p className="sb-clone-tip">
                    {zh
                      ? "上传后,该角色配音将使用克隆音色(优先于预置音色)"
                      : "When set, this character uses the cloned voice (overrides preset)"}
                  </p>
                </div>

                <label className="sc-label">{zh ? "表演基线" : "Acting baseline"}</label>
                <textarea
                  className="sc-textarea"
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
    </div>
  );
}
