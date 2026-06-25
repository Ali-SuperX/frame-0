"use client";

import { useEffect, useRef, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import VoiceoverButton from "../VoiceoverButton";
import {
  HOOK_TYPES,
  UGC_FRAMEWORKS,
  estimateRuntime,
  generateHookVariants,
  type HookType,
} from "@/lib/r2v/presets";
import type { R2VProjectInput } from "@/lib/r2v/schema";

type Props = { zh: boolean };

type Chunk = R2VProjectInput["chunks"][number];

const MAX_CHUNKS = 10;

export default function ChunksTimeline({ zh }: Props) {
  const cur = useR2VStore((s) => s.current);
  const updateInput = useR2VStore((s) => s.updateInput);

  const [selected, setSelected] = useState<number>(1);
  /** Hook variant generator modal state. Lives at parent so it can read
   *  current chunk + apply on click. */
  const [hookGen, setHookGen] = useState<{
    open: boolean;
    topic: string;
    painPoint: string;
  }>({ open: false, topic: "", painPoint: "" });
  const editorRef = useRef<HTMLDivElement>(null);

  /* ── selected editor scroll-into-view (must be unconditional) ── */
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  if (!cur) return null;
  const chunks: Chunk[] = cur.chunks ?? [];
  const fw = UGC_FRAMEWORKS.find((f) => f.id === (cur.ugcFramework ?? "midfunnel-punchy"));
  const productRefs = (cur.references ?? []).filter((r) => r.role === "product" && r.url);
  const hasProduct = productRefs.length > 0;

  /* ── helpers ── */
  function setChunks(next: Chunk[]) {
    void updateInput({
      chunks: next.map((c, i) => ({ ...c, index: i + 1 })),
    });
  }

  function addChunk() {
    if (chunks.length >= MAX_CHUNKS) return;
    const last = chunks[chunks.length - 1];
    const nextIdx = chunks.length + 1;
    const newChunk: Chunk = {
      index: nextIdx,
      voiceover: "",
      framing: "",
      includeProduct: false,
      runtime: last?.runtime ?? fw?.suggestedRuntime ?? 6,
      ...(nextIdx === 1 ? { hookType: "problem-aware" as const } : {}),
    };
    setChunks([...chunks, newChunk]);
    setSelected(nextIdx);
  }

  function removeChunk(idx: number) {
    if (chunks.length <= 1) return;
    const next = chunks.filter((c) => c.index !== idx);
    setChunks(next);
    setSelected(Math.max(1, Math.min(idx, next.length)));
  }

  function moveChunk(idx: number, dir: -1 | 1) {
    const i = chunks.findIndex((c) => c.index === idx);
    const swap = i + dir;
    if (i < 0 || swap < 0 || swap >= chunks.length) return;
    const next = [...chunks];
    [next[i], next[swap]] = [next[swap], next[i]];
    setChunks(next);
    setSelected(swap + 1); // index becomes 1-based after re-numbering
  }

  function updateChunk(idx: number, patch: Partial<Chunk>) {
    const next = chunks.map((c) => (c.index === idx ? { ...c, ...patch } : c));
    setChunks(next);
  }

  const totalRuntime = chunks.reduce((s, c) => s + (c.runtime ?? 0), 0);
  const sel = chunks.find((c) => c.index === selected) ?? chunks[0];

  return (
    <section className="r2v-ugc-section">
      <header className="r2v-ugc-section-head">
        <h3>
          {zh ? "🎞️ Chunks Timeline" : "🎞️ Chunks Timeline"}
          <span className="r2v-count">
            {chunks.length} · {totalRuntime}s
          </span>
        </h3>
        <span className="r2v-section-sub">
          {zh
            ? "每段独立 voiceover + framing — 跨段 universalBlocks 复用"
            : "Per-chunk voiceover + framing — universalBlocks reused across all"}
        </span>
      </header>

      {/* Timeline strip */}
      <div className="r2v-timeline" role="tablist">
        {chunks.map((c, i) => {
          const isSel = c.index === selected;
          const fillPct =
            (c.voiceover?.length || 0) > 0
              ? Math.min(100, ((c.voiceover?.length || 0) / 50) * 100)
              : 0;
          return (
            <button
              key={c.index}
              type="button"
              role="tab"
              aria-selected={isSel}
              className={`r2v-timeline-card ${isSel ? "r2v-timeline-card--on" : ""}`}
              onClick={() => setSelected(c.index)}
              style={{ width: `${Math.max(60, (c.runtime ?? 6) * 16)}px` }}
            >
              <div className="r2v-timeline-num">{c.index}</div>
              <div className="r2v-timeline-time">{c.runtime ?? 6}s</div>
              {c.includeProduct ? (
                <div className="r2v-timeline-badge" title={zh ? "含产品" : "with product"}>
                  📦
                </div>
              ) : null}
              {i === 0 && c.hookType ? (
                <div className="r2v-timeline-badge" title="hook">
                  🪝
                </div>
              ) : null}
              <div className="r2v-timeline-fill" style={{ width: `${fillPct}%` }} />
            </button>
          );
        })}
        {chunks.length < MAX_CHUNKS ? (
          <button
            type="button"
            className="r2v-timeline-add"
            onClick={addChunk}
            title={zh ? "新增段" : "Add chunk"}
          >
            +
          </button>
        ) : null}
      </div>

      {/* Editor for selected chunk */}
      {sel ? (
        <div ref={editorRef} className="r2v-chunk-editor">
          <div className="r2v-chunk-editor-head">
            <span className="r2v-chunk-editor-title">
              {zh ? `第 ${sel.index} 段` : `Chunk ${sel.index}`}
              {sel.index === 1 ? (
                <span className="r2v-chunk-tag">{zh ? "Hook" : "Hook"}</span>
              ) : null}
            </span>
            <div className="r2v-chunk-editor-actions">
              <button
                type="button"
                onClick={() => moveChunk(sel.index, -1)}
                disabled={sel.index === 1}
                title={zh ? "前移" : "Move up"}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => moveChunk(sel.index, 1)}
                disabled={sel.index === chunks.length}
                title={zh ? "后移" : "Move down"}
              >
                →
              </button>
              <button
                type="button"
                onClick={() => removeChunk(sel.index)}
                disabled={chunks.length <= 1}
                title={zh ? "删除" : "Remove"}
              >
                ×
              </button>
            </div>
          </div>

          <div className="r2v-chunk-editor-body">
            {/* Hook type (only on first chunk) */}
            {sel.index === 1 ? (
              <div className="r2v-chunk-row">
                <label className="r2v-block-field">
                  <div className="r2v-block-label">
                    <span>{zh ? "🪝 Hook 类型" : "🪝 Hook type"}</span>
                    <span className="r2v-block-hint">
                      {zh
                        ? "第 1 段决定 80% 完播率"
                        : "Chunk 1 = 80% of completion"}
                    </span>
                  </div>
                  <div className="r2v-hook-row">
                    <select
                      value={sel.hookType ?? "problem-aware"}
                      onChange={(e) =>
                        updateChunk(sel.index, {
                          hookType: e.target.value as Chunk["hookType"],
                        })
                      }
                      className="r2v-input"
                    >
                      {HOOK_TYPES.map((h) => {
                        const meta = zh ? h.zh : h.en;
                        return (
                          <option key={h.id} value={h.id}>
                            {meta.label} — {meta.example}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      className="r2v-btn r2v-btn--ghost r2v-btn--small"
                      onClick={() =>
                        setHookGen({ open: true, topic: "", painPoint: "" })
                      }
                      title={
                        zh
                          ? "用 10 个 hook 模板生成变体"
                          : "Generate 10 hook variants"
                      }
                    >
                      ⚡ {zh ? "10 变体" : "10 variants"}
                    </button>
                  </div>
                </label>
              </div>
            ) : null}

            {/* Voiceover */}
            <label className="r2v-block-field">
              <div className="r2v-block-label">
                <span>
                  {zh ? "🎤 Voiceover（这段说的话）" : "🎤 Voiceover (spoken line)"}
                </span>
                <VoiceoverHint
                  voiceover={sel.voiceover}
                  runtime={sel.runtime ?? 6}
                  zh={zh}
                />
              </div>
              <textarea
                value={sel.voiceover}
                onChange={(e) =>
                  updateChunk(sel.index, { voiceover: e.target.value })
                }
                placeholder={
                  zh
                    ? "这段她要说的台词"
                    : "What she says in this segment"
                }
                rows={2}
                className="r2v-input r2v-block-textarea"
              />
              {/* 🆕 AI 配音(基于百炼 TTS) */}
              <VoiceoverButton
                text={sel.voiceover}
                state={{
                  voiceoverVoiceId: sel.voiceoverVoiceId,
                  voiceoverAudioUrl: sel.voiceoverAudioUrl,
                  voiceoverAudioSha: sel.voiceoverAudioSha,
                  voiceoverAudioDuration: sel.voiceoverAudioDuration,
                  voiceoverManualUrl: sel.voiceoverManualUrl,
                }}
                onChange={(patch) => updateChunk(sel.index, patch)}
                zh={zh}
                compact
              />
            </label>

            {/* Framing + runtime + product */}
            <div className="r2v-chunk-meta">
              <label className="r2v-block-field r2v-block-field--grow">
                <div className="r2v-block-label">
                  <span>{zh ? "🎬 Framing" : "🎬 Framing"}</span>
                  <span className="r2v-block-hint">
                    {zh ? "镜头 / 距离 / 表情" : "Shot / distance / expression"}
                  </span>
                </div>
                <textarea
                  value={sel.framing ?? ""}
                  onChange={(e) =>
                    updateChunk(sel.index, { framing: e.target.value })
                  }
                  placeholder={
                    zh
                      ? "如：中近景，卧室窗边，confiding 语气"
                      : "e.g. medium close-up, bedroom window, confiding tone"
                  }
                  rows={2}
                  className="r2v-input r2v-block-textarea"
                />
              </label>

              <div className="r2v-chunk-controls">
                <label className="r2v-block-field">
                  <div className="r2v-block-label">
                    <span>{zh ? "⏱ 时长 (s)" : "⏱ Runtime (s)"}</span>
                  </div>
                  <input
                    type="number"
                    min={3}
                    max={12}
                    value={sel.runtime ?? 6}
                    onChange={(e) =>
                      updateChunk(sel.index, {
                        runtime: Math.max(3, Math.min(12, Number(e.target.value) || 6)),
                      })
                    }
                    className="r2v-input r2v-input--small"
                  />
                </label>

                <label
                  className={`r2v-product-toggle ${
                    !hasProduct ? "r2v-product-toggle--disabled" : ""
                  }`}
                  title={
                    !hasProduct
                      ? zh
                        ? "请在上方先上传一张 role=产品 的参考图"
                        : "Upload a role=product reference first"
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={!!sel.includeProduct}
                    disabled={!hasProduct}
                    onChange={(e) =>
                      updateChunk(sel.index, { includeProduct: e.target.checked })
                    }
                  />
                  <span>📦 {zh ? "含产品" : "Show product"}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hook variant generator modal */}
      {hookGen.open ? (
        <HookVariantModal
          zh={zh}
          topic={hookGen.topic}
          painPoint={hookGen.painPoint}
          onTopicChange={(v) => setHookGen((s) => ({ ...s, topic: v }))}
          onPainPointChange={(v) =>
            setHookGen((s) => ({ ...s, painPoint: v }))
          }
          onApply={(hookType, voiceover) => {
            updateChunk(1, { hookType, voiceover });
            setHookGen({ open: false, topic: "", painPoint: "" });
          }}
          onClose={() =>
            setHookGen({ open: false, topic: "", painPoint: "" })
          }
        />
      ) : null}
    </section>
  );
}

/** Modal: list 10 hook framework variants generated by template (no LLM).
 *  Lets the user paste their product topic + pain point, see variants,
 *  apply one to chunk 1 with a single click. */
function HookVariantModal({
  zh,
  topic,
  painPoint,
  onTopicChange,
  onPainPointChange,
  onApply,
  onClose,
}: {
  zh: boolean;
  topic: string;
  painPoint: string;
  onTopicChange: (v: string) => void;
  onPainPointChange: (v: string) => void;
  onApply: (hookType: HookType, voiceover: string) => void;
  onClose: () => void;
}) {
  const variants = generateHookVariants(topic, painPoint, zh ? "zh" : "en");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="r2v-hook-modal-backdrop" onClick={onClose}>
      <div
        className="r2v-hook-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Hook variants"
      >
        <header className="r2v-hook-modal-head">
          <h3>{zh ? "⚡ 一键生成 10 个 Hook 变体" : "⚡ Generate 10 Hook Variants"}</h3>
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost r2v-btn--small"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="r2v-hook-modal-inputs">
          <label className="r2v-block-field">
            <span className="r2v-block-label">
              {zh ? "产品 / 主题" : "Product / topic"}
            </span>
            <input
              type="text"
              autoFocus
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              placeholder={
                zh
                  ? "如：防脱发软胶囊 / 便携磨豆机"
                  : "e.g. anti-hair-loss capsule / portable grinder"
              }
              className="r2v-input"
            />
          </label>
          <label className="r2v-block-field">
            <span className="r2v-block-label">
              {zh ? "痛点（可选）" : "Pain point (optional)"}
            </span>
            <input
              type="text"
              value={painPoint}
              onChange={(e) => onPainPointChange(e.target.value)}
              placeholder={
                zh ? "如：掉发 / 起床困难" : "e.g. hair loss / morning fog"
              }
              className="r2v-input"
            />
          </label>
        </div>
        <div className="r2v-hook-modal-list">
          {variants.map((v) => (
            <button
              key={v.hookType}
              type="button"
              className="r2v-hook-variant"
              onClick={() => onApply(v.hookType, v.voiceover)}
            >
              <span className="r2v-hook-variant-tag">{v.hookType}</span>
              <span className="r2v-hook-variant-text">{v.voiceover}</span>
              <span className="r2v-hook-variant-apply">
                {zh ? "应用 →" : "Apply →"}
              </span>
            </button>
          ))}
        </div>
        <footer className="r2v-hook-modal-foot">
          <span className="r2v-block-hint">
            {zh
              ? "点击任意条目即应用到 Chunk 1（含 hookType + voiceover）"
              : "Click any to apply to Chunk 1 (hookType + voiceover)"}
          </span>
        </footer>
      </div>
    </div>
  );
}

/** Inline hint that compares user's runtime vs estimated runtime. */
function VoiceoverHint({
  voiceover,
  runtime,
  zh,
}: {
  voiceover: string;
  runtime: number;
  zh: boolean;
}) {
  const chars = voiceover?.trim().length || 0;
  const est = estimateRuntime(voiceover);
  if (chars === 0) {
    return (
      <span className="r2v-block-hint">
        {zh ? "0 字" : "0 chars"}
      </span>
    );
  }
  const verdict =
    est > runtime
      ? zh
        ? `偏长 — 推荐 ${est}s（你设了 ${runtime}s，可能 sped-up）`
        : `Too long — suggest ${est}s (set ${runtime}s, may be sped-up)`
      : est < runtime - 1
        ? zh
          ? `偏短 — 推荐 ${est}s（你设了 ${runtime}s）`
          : `Too short — suggest ${est}s (set ${runtime}s)`
        : zh
          ? `时长合适（推荐 ${est}s）`
          : `Pace OK (suggest ${est}s)`;
  const cls = est > runtime ? "r2v-block-hint--warn" : "r2v-block-hint";
  return (
    <span className={cls}>
      {chars} {zh ? "字" : "chars"} · {verdict}
    </span>
  );
}
