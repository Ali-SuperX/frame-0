"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import {
  STYLES,
  STYLE_GROUPS,
  EXCLUDES,
  lookupSellingPointAnchor,
} from "@/lib/r2v/presets";
import {
  CONTENT_DIRECTION_OPTIONS as CONTENT_DIRECTIONS,
  SCENE_TYPE_OPTIONS as SCENE_TYPES,
  ECOM_CATEGORY_OPTIONS as ECOM_CATEGORIES,
  TECH_DETAIL_OPTIONS as TECH_DETAILS,
  RATIO_OPTIONS as RATIOS,
} from "@/lib/r2v/labels";
import type {
  R2VProjectInput,
  Reference,
} from "@/lib/r2v/schema";
import type { JobMedia } from "@/lib/store";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { storeLocalFile, readLocalFile } from "@/lib/editor/localFiles";
import UGCFrameworkPicker from "./ugc/UGCFrameworkPicker";
import UGCGenerateHero from "./ugc/UGCGenerateHero";
import UniversalBlocksEditor from "./ugc/UniversalBlocksEditor";
import ChunksTimeline from "./ugc/ChunksTimeline";

type Props = { zh: boolean; onContinue: () => void };

/** Base64 preview image for R2V references.
 *  960px is large enough for a usable lightbox, ~30-60KB per image in JPEG. */
async function makeThumb(file: File, maxSize = 960, quality = 0.82): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/* ── static option lists ── */


const VL_MODELS = [
  { id: "qwen3.7-max", label: "Qwen 3.7 Max" },
  { id: "qwen3.7-plus", label: "Qwen 3.7 Plus" },
  { id: "qwen3-vl-plus", label: "Qwen 3 VL Plus" },
  { id: "qwen3-vl-flash", label: "Qwen 3 VL Flash" },
  { id: "qwen3.6-plus", label: "Qwen 3.6 Plus" },
];

/* ── component ── */

export default function Card1Inputs({ zh, onContinue }: Props) {
  const cur = useR2VStore((s) => s.current);
  const updateInput = useR2VStore((s) => s.updateInput);
  const persistDraft = useR2VStore((s) => s.persistDraft);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local mirror for the title input so the user can transiently clear it
  // without zod validation snapping it back (schema requires title.min(1)).
  const [titleInput, setTitleInput] = useState(cur?.title ?? "");
  useEffect(() => {
    if (cur?.title !== undefined) setTitleInput(cur.title);
  }, [cur?.projectId, cur?.title]);
  useEffect(() => () => {
    if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
  }, []);

  const [newSellingPoint, setNewSellingPoint] = useState("");
  const [newCustomExclude, setNewCustomExclude] = useState("");
  const batchInputRef = useRef<HTMLInputElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const uploadSlotRef = useRef<number>(0);
  const [batchUploading, setBatchUploading] = useState(false);
  /** Cache full JobMedia per oss URL so MediaPicker can show preview/lightbox. */
  const [mediaCache, setMediaCache] = useState<Record<string, JobMedia>>({});
  /** Full-res blob URLs rehydrated from IndexedDB after page reload. */
  const [idbPreviews, setIdbPreviews] = useState<Record<string, string>>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Slots currently being described by VL model. */
  const [vlLoading, setVlLoading] = useState<Set<number>>(new Set());
  /** Snapshot of notes before AI describe, for undo. */
  const [savedNotes, setSavedNotes] = useState<Record<number, string> | null>(null);
  /** VL model for image description. */
  const [vlModel, setVlModel] = useState("qwen3-vl-plus");
  const [vlCustomPrompt, setVlCustomPrompt] = useState("");
  const [vlSettingsOpen, setVlSettingsOpen] = useState(false);
  const vlDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside → close VL model picker
  useEffect(() => {
    if (!vlSettingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (vlDropdownRef.current && !vlDropdownRef.current.contains(e.target as Node)) {
        setVlSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [vlSettingsOpen]);

  /* ── rehydrate full-res previews from IDB on mount ── */
  const refs = cur?.references;
  useEffect(() => {
    if (!refs) return;
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const result: Record<string, string> = {};
      for (const r of refs) {
        if (!r.url || !r.localKey) continue;
        // skip if we already have a live blob in mediaCache
        try {
          const blob = await readLocalFile(r.localKey);
          if (cancelled || !blob) continue;
          const url = URL.createObjectURL(blob);
          created.push(url);
          result[r.url] = url;
        } catch { /* ignore */ }
      }
      if (!cancelled && Object.keys(result).length) {
        setIdbPreviews((prev) => ({ ...prev, ...result }));
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // only re-run when the set of localKeys changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs?.map((r) => r.localKey).join(",")]);

  const sellingPoints = cur?.sellingPoints;
  const autoTranslate = cur?.autoTranslateSellingPoints;
  const sellingPointHints = useMemo(
    () =>
      sellingPoints
        ? sellingPoints.map((sp) =>
            autoTranslate ? lookupSellingPointAnchor(sp) : null
          )
        : [],
    [sellingPoints, autoTranslate]
  );

  if (!cur) return null;

  const refsCount = cur.references.length;
  const canContinue = cur.references.some((r) => !!r.url);

  /* ── reference helpers ── */
  function setRef(slot: number, patch: Partial<Reference>) {
    // Always read fresh state — parallel VL calls would race on stale `cur`
    const current = useR2VStore.getState().current;
    if (!current) return;
    void updateInput({
      references: current.references.map((r) =>
        r.slot === slot ? { ...r, ...patch } : r
      ),
    });
  }
  function addRef() {
    if (cur!.references.length >= 9) return;
    void updateInput({
      references: [
        ...cur!.references,
        { slot: cur!.references.length + 1, url: "", role: "character" },
      ],
    });
  }
  function removeRef(slot: number) {
    if (cur!.references.length <= 1) return;
    const next = cur!
      .references.filter((r) => r.slot !== slot)
      .map((r, idx) => ({ ...r, slot: idx + 1 }));
    void updateInput({ references: next });
  }
  function clearAllRefs() {
    void updateInput({
      references: [{ slot: 1, url: "", role: "character" as const }],
    });
    setMediaCache({});
  }

  /* ── VL image description ── */
  async function describeWithVL(slot: number) {
    // Read fresh state — closure `cur` may be stale after batch upload
    const fresh = useR2VStore.getState().current;
    const ref = fresh?.references.find((r) => r.slot === slot);
    if (!ref) return;

    // Get the best available image data (thumb base64 or IDB blob)
    const imgSrc = ref.thumbDataUrl || idbPreviews[ref.url] || null;
    if (!imgSrc) return;

    // If it's a blob URL from IDB, we need to convert to base64
    let base64Url = imgSrc;
    if (imgSrc.startsWith("blob:")) {
      try {
        const blob = await fetch(imgSrc).then((r) => r.blob());
        base64Url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch {
        return;
      }
    }

    const existingNote = ref.note?.trim() || "";
    setVlLoading((prev) => new Set(prev).add(slot));

    // Build system prompt: base + custom + enhance mode
    const baseSys = existingNote
      ? "你是视觉分析专家，为AI视频制作提供图片描述。用户已提供关键描述，请结合图片内容对其进行强化扩写，必须保留用户原始关键词和核心意图。输出不超过60字，不加标点结尾。"
      : "你是视觉分析专家，为AI视频制作提供图片描述。用简洁精确的中文描述图片内容，重点关注：主体外观、材质质感、颜色、拍摄角度、关键细节。不超过40字，不加标点结尾。";
    const sysContent = baseSys + (vlCustomPrompt.trim() ? `\n\n用户补充要求：${vlCustomPrompt.trim()}` : "");

    // Build user message: with or without existing note context
    const userContent = existingNote
      ? [
          { type: "image_url", image_url: { url: base64Url } },
          { type: "text", text: `用户描述：「${existingNote}」\n请基于图片强化扩写这段描述` },
        ]
      : [
          { type: "image_url", image_url: { url: base64Url } },
          { type: "text", text: "描述这张图片" },
        ];

    try {
      const res = await fetch("/api/bailian/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeysHeader() },
        body: JSON.stringify({
          model: vlModel,
          stream: false,
          messages: [
            { role: "system", content: sysContent },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (!res.ok) throw new Error(`VL API ${res.status}`);
      const data = await res.json();
      const desc =
        data.choices?.[0]?.message?.content?.trim() ?? "";
      if (desc) {
        setRef(slot, { note: desc });
      }
    } catch (err) {
      console.error("VL describe failed:", err);
    } finally {
      setVlLoading((prev) => {
        const next = new Set(prev);
        next.delete(slot);
        return next;
      });
    }
  }

  /** Describe ALL images that have image data available. Overwrites existing notes (undo available). */
  async function describeAllWithVL() {
    // Read fresh state
    const fresh = useR2VStore.getState().current;
    if (!fresh) return;
    // Save current notes for undo
    const snapshot: Record<number, string> = {};
    fresh.references.forEach((r) => { snapshot[r.slot] = r.note ?? ""; });
    setSavedNotes(snapshot);

    const targets = fresh.references.filter(
      (r) => r.url && (r.thumbDataUrl || idbPreviews[r.url])
    );
    if (!targets.length) return;
    await Promise.all(targets.map((r) => describeWithVL(r.slot)));
  }

  /** Undo all AI-generated descriptions, restoring previous notes. */
  function undoDescriptions() {
    if (!savedNotes || !cur) return;
    void updateInput({
      references: cur.references.map((r) => ({
        ...r,
        note: savedNotes[r.slot] ?? r.note,
      })),
    });
    setSavedNotes(null);
  }

  /* ── single-slot upload ── */
  function triggerSingleUpload(slot: number) {
    uploadSlotRef.current = slot;
    singleInputRef.current?.click();
  }
  async function handleSingleUpload(files: FileList | null) {
    if (!files?.[0] || !cur) return;
    const file = files[0];
    const slot = uploadSlotRef.current;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("model", "happyhorse-1.1-r2v");
    const res = await fetch("/api/bailian/upload", {
      method: "POST",
      headers: apiKeysHeader(),
      body: fd,
    });
    if (!res.ok) return;
    const j = await res.json();
    const previewUrl = URL.createObjectURL(file);
    const thumb = await makeThumb(file);
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    const localKey = `r2v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    try { await storeLocalFile(localKey, file); } catch { /* IDB unavailable */ }
    setRef(slot, {
      url: j.ossUrl,
      name: file.name,
      thumbDataUrl: thumb ?? undefined,
      localKey,
      localPath: j.localPath,
    });
    setMediaCache((prev) => ({
      ...prev,
      [j.ossUrl]: { url: j.ossUrl, name: file.name, previewUrl, mime: file.type, localKey, localPath: j.localPath },
    }));
    if (singleInputRef.current) singleInputRef.current.value = "";
  }

  /** Resolve best preview src for a reference — prefer full-res blob. */
  function refPreviewSrc(r: Reference): { thumb: string | null; full: string | null } {
    const cached = mediaCache[r.url];
    const full = cached?.previewUrl || idbPreviews[r.url] || null;
    // Fallback chain (best → worst):
    //   1. live blob URL from this session (full-res)
    //   2. IDB blob URL rebuilt on mount (full-res)
    //   3. base64 thumb persisted in input.json (instant)
    //   4. server-mirrored localPath /api/uploads/<sha>.<ext> (永不过期)
    //   5. OSS URL — only loadable if http(s); oss:// returns null → shows "OSS" placeholder
    const thumb =
      full
      || r.thumbDataUrl
      || r.localPath
      || (r.url && /^https?:/i.test(r.url) ? r.url : null);
    return { thumb, full };
  }

  /** Build clean config text with [Image N] references for agent consumption. */
  function buildConfigText(): string {
    const lines: string[] = ["# R2V 项目配置", ""];
    const filledRefs = cur!.references.filter((r) => !!r.url);

    // References
    if (filledRefs.length) {
      lines.push("## 参考图（media 数组顺序）");
      filledRefs.forEach((r, i) => {
        const desc = r.note ? ` — ${r.note}` : "";
        lines.push(`${i + 1}. [Image ${i + 1}]${desc}`);
        lines.push(`   URL: ${r.url}`);
      });
      lines.push("");
    }

    // Output settings
    lines.push("## 输出设置");
    lines.push(`- 比例: ${cur!.output.ratio}`);
    lines.push(`- 时长: ${cur!.output.duration}s`);
    lines.push(`- 分辨率: ${cur!.output.resolution}`);
    lines.push("");

    // Core need
    if (cur!.coreNeed) {
      lines.push(`## 核心需求`);
      lines.push(cur!.coreNeed);
      lines.push("");
    }

    // Content direction
    if (cur!.contentDirection) {
      const dir = CONTENT_DIRECTIONS.find((d) => d.id === cur!.contentDirection);
      lines.push(`## 内容方向: ${zh ? dir?.zh : dir?.en}`);
      if (cur!.contentDirection === "ecommerce" && cur!.category !== "general") {
        const cat = ECOM_CATEGORIES.find((c) => c.id === cur!.category);
        lines.push(`电商子类: ${zh ? cat?.zh : cat?.en}`);
      }
      lines.push("");
    }

    // Scene type
    if (cur!.sceneType) {
      const st = SCENE_TYPES.find((s) => s.id === cur!.sceneType);
      lines.push(`## 场景类型: ${zh ? st?.zh : st?.en}`);
      lines.push("");
    }

    // Platform
    if (cur!.platform) {
      lines.push(`## 投放平台: ${cur!.platform}`);
      lines.push("");
    }

    // Brand
    if (cur!.brand) {
      lines.push(`## 品牌: ${cur!.brand}`);
      lines.push("");
    }

    // Selling points
    if (cur!.sellingPoints.length) {
      lines.push("## 卖点");
      cur!.sellingPoints.forEach((sp) => lines.push(`- ${sp}`));
      lines.push("");
    }

    // Must-keep
    if (cur!.mustKeep) {
      lines.push("## 必保留步骤");
      lines.push(cur!.mustKeep);
      lines.push("");
    }

    // Style
    if (cur!.style) {
      const s = STYLES.find((st) => st.id === cur!.style);
      lines.push(`## 风格: ${s ? (zh ? s.zh : s.en) : cur!.style}`);
      lines.push("");
    }

    // Excludes
    const allExcludes = [
      ...cur!.excludes.map((id) => { const e = EXCLUDES.find((e) => e.id === id); return e ? (zh ? e.zh : e.en) : id; }),
      ...cur!.excludesCustom,
    ];
    if (allExcludes.length) {
      lines.push("## 要避开");
      allExcludes.forEach((e) => lines.push(`- ${e}`));
      lines.push("");
    }

    // Tech details
    if (cur!.techDetails?.length) {
      lines.push("## 技术细节");
      cur!.techDetails.forEach((id) => {
        const td = TECH_DETAILS.find((t) => t.id === id);
        lines.push(`- ${zh ? td?.zh : td?.en}`);
      });
      lines.push("");
    }

    // Notes
    if (cur!.notes) {
      lines.push("## 备注");
      lines.push(cur!.notes);
    }

    return lines.join("\n");
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(buildConfigText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

  /* ── chip helpers ── */
  function toggleExclude(id: string) {
    const has = cur!.excludes.includes(id);
    void updateInput({
      excludes: has
        ? cur!.excludes.filter((e) => e !== id)
        : [...cur!.excludes, id],
    });
  }
  function addSellingPoint() {
    const v = newSellingPoint.trim();
    if (!v) return;
    void updateInput({ sellingPoints: [...cur!.sellingPoints, v] });
    setNewSellingPoint("");
  }
  function removeSellingPoint(i: number) {
    void updateInput({
      sellingPoints: cur!.sellingPoints.filter((_, idx) => idx !== i),
    });
  }
  function addCustomExclude() {
    const v = newCustomExclude.trim();
    if (!v) return;
    void updateInput({ excludesCustom: [...cur!.excludesCustom, v] });
    setNewCustomExclude("");
  }
  function removeCustomExclude(i: number) {
    void updateInput({
      excludesCustom: cur!.excludesCustom.filter((_, idx) => idx !== i),
    });
  }
  function toggleTechDetail(id: string) {
    const td = cur!.techDetails ?? [];
    const has = td.includes(id);
    void updateInput({
      techDetails: has ? td.filter((t) => t !== id) : [...td, id],
    });
  }

  /* ── batch upload (parallel) ── */
  async function handleBatchUpload(files: FileList | null) {
    if (!files || !files.length || !cur) return;
    setBatchUploading(true);
    try {
      const fileArr = Array.from(files).slice(0, 9 - cur.references.filter((r) => !!r.url).length || 9);
      const newCache: Record<string, JobMedia> = {};

      // Upload all files in parallel
      const results = await Promise.allSettled(
        fileArr.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("model", "happyhorse-1.1-r2v");
          const res = await fetch("/api/bailian/upload", {
            method: "POST",
            headers: apiKeysHeader(),
            body: fd,
          });
          if (!res.ok) return null;
          const j = await res.json();
          const previewUrl = URL.createObjectURL(file);
          const thumb = await makeThumb(file);
          const localKey = `r2v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          try { await storeLocalFile(localKey, file); } catch { /* IDB unavailable */ }
          return { file, ossUrl: j.ossUrl as string, localPath: j.localPath as string | undefined, previewUrl, thumb, localKey };
        })
      );

      let refs = [...cur.references];
      for (const r of results) {
        if (r.status !== "fulfilled" || !r.value) continue;
        const { file, ossUrl, localPath, previewUrl, thumb, localKey } = r.value;

        newCache[ossUrl] = { url: ossUrl, name: file.name, previewUrl, mime: file.type, localKey, localPath };
        const refPatch = { url: ossUrl, name: file.name, thumbDataUrl: thumb ?? undefined, localKey, localPath };

        const emptyIdx = refs.findIndex((ref) => !ref.url);
        if (emptyIdx >= 0) {
          refs[emptyIdx] = { ...refs[emptyIdx], ...refPatch };
        } else if (refs.length < 9) {
          refs.push({ slot: refs.length + 1, ...refPatch, role: "character" as const });
        }
      }
      refs = refs.map((r, i) => ({ ...r, slot: i + 1 }));
      void updateInput({ references: refs });
      setMediaCache((prev) => ({ ...prev, ...newCache }));
    } finally {
      setBatchUploading(false);
      if (batchInputRef.current) batchInputRef.current.value = "";
    }
  }

  const ugcMode = cur.mode === "ugc";

  return (
    <div className="r2v-card r2v-card--levels">
      {/* Mode toggle now lives in R2VWorkspace topbar (segmented control). */}
      <div className={`r2v-levels-grid ${ugcMode ? "r2v-levels-grid--ugc" : ""}`}>
        {/* ═══════════ Level 1：必填 ═══════════ */}
        <section className="r2v-level r2v-level--1">
          <div className="r2v-level-head">
            <span className="r2v-level-dot r2v-level-dot--1" />
            <span className="r2v-level-title">
              {zh ? "必填" : "Required"}
            </span>
          </div>

          {/* Reference images — compact rows */}
          <div className="r2v-lv-field">
            <div className="r2v-lv-label r2v-lv-label--row">
              <span>
                📷{" "}
                {zh
                  ? `参考图（${refsCount}/9）`
                  : `Refs (${refsCount}/9)`}
              </span>
              <input
                ref={batchInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void handleBatchUpload(e.target.files)}
              />
              <input
                ref={singleInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void handleSingleUpload(e.target.files)}
              />
              <span className="r2v-lv-label-actions">
                <button
                  type="button"
                  className="r2v-btn r2v-btn--xs"
                  disabled={batchUploading || refsCount >= 9}
                  onClick={() => batchInputRef.current?.click()}
                >
                  {batchUploading
                    ? zh ? "上传中…" : "…"
                    : zh ? "📤 批量" : "📤 Batch"}
                </button>
                {cur.references.some((r) => !!r.url) && (
                  <>
                    <button
                      type="button"
                      className="r2v-btn r2v-btn--xs"
                      onClick={describeAllWithVL}
                      disabled={vlLoading.size > 0}
                      title={zh ? "AI 一键描述所有图片" : "AI describe all"}
                    >
                      {vlLoading.size > 0
                        ? zh ? "⏳ 描述中…" : "⏳ …"
                        : zh ? "✨ AI描述" : "✨ AI desc"}
                    </button>
                    <div className="r2v-vl-settings-wrap" ref={vlDropdownRef}>
                      <button
                        type="button"
                        className="r2v-btn r2v-btn--xs r2v-btn--icon"
                        onClick={() => setVlSettingsOpen((v) => !v)}
                        title={zh ? "VL 模型设置" : "VL model settings"}
                      >
                        ⚙️
                      </button>
                      {vlSettingsOpen && (
                        <div className="r2v-vl-settings-dropdown">
                          {VL_MODELS.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className={`r2v-vl-opt ${vlModel === m.id ? "r2v-vl-opt--active" : ""}`}
                              onClick={() => {
                                setVlModel(m.id);
                                setVlSettingsOpen(false);
                              }}
                            >
                              {vlModel === m.id ? "● " : "○ "}{m.label}
                            </button>
                          ))}
                          <div className="r2v-vl-custom-prompt">
                            <textarea
                              className="r2v-vl-custom-prompt-area"
                              rows={2}
                              placeholder={zh ? "自定义提示词，如「侧重描述材质」「用英文输出」..." : "Custom prompt, e.g. \"focus on texture\"..."}
                              value={vlCustomPrompt}
                              onChange={(e) => setVlCustomPrompt(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {savedNotes && (
                      <button
                        type="button"
                        className="r2v-btn r2v-btn--xs r2v-btn--warn"
                        onClick={undoDescriptions}
                        title={zh ? "撤回 AI 描述，恢复之前的内容" : "Undo AI descriptions"}
                      >
                        {zh ? "↩ 撤回" : "↩ Undo"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="r2v-btn r2v-btn--xs r2v-btn--danger"
                      onClick={clearAllRefs}
                    >
                      {zh ? "清空" : "Clear"}
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="r2v-ref-table">
              {cur.references.map((r) => {
                const { thumb, full } = refPreviewSrc(r);
                return (
                  <div key={r.slot} className="r2v-ref-c">
                    {/* thumbnail or upload placeholder */}
                    {r.url ? (
                      <button
                        type="button"
                        className="r2v-ref-c-thumb"
                        onClick={() => (full || thumb) && setLightboxSrc(full || thumb)}
                        title={r.name || (zh ? "点击放大" : "Zoom")}
                      >
                        {thumb ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={thumb} alt={r.name || ""} />
                        ) : (
                          <span className="r2v-ref-c-oss">OSS</span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="r2v-ref-c-thumb r2v-ref-c-thumb--empty"
                        onClick={() => triggerSingleUpload(r.slot)}
                        title={zh ? "上传" : "Upload"}
                      >
                        +
                      </button>
                    )}
                    {/* description + VL button */}
                    <div className="r2v-ref-c-desc-wrap">
                      <input
                        type="text"
                        value={r.note ?? ""}
                        onChange={(e) =>
                          setRef(r.slot, { note: e.target.value })
                        }
                        className="r2v-input r2v-input--xs r2v-ref-c-desc"
                        placeholder={zh ? "描述…" : "desc…"}
                      />
                      {r.url && (r.thumbDataUrl || idbPreviews[r.url]) ? (
                        <button
                          type="button"
                          className="r2v-ref-c-vl"
                          onClick={() => describeWithVL(r.slot)}
                          disabled={vlLoading.has(r.slot)}
                          title={zh ? "AI 看图写描述" : "AI describe image"}
                        >
                          {vlLoading.has(r.slot) ? "⏳" : "✨"}
                        </button>
                      ) : null}
                    </div>
                    {/* remove */}
                    <button
                      type="button"
                      className="r2v-ref-c-rm"
                      onClick={() => removeRef(r.slot)}
                      disabled={refsCount <= 1}
                      aria-label={zh ? "移除" : "Remove"}
                    >
                      ×
                    </button>
                    {/* full description preview — visible when text overflows the input */}
                    {r.note && r.note.length > 15 ? (
                      <div className="r2v-ref-c-note-full">{r.note}</div>
                    ) : null}
                  </div>
                );
              })}
              {refsCount < 9 && (
                <button
                  type="button"
                  className="r2v-ref-c-add"
                  onClick={addRef}
                >
                  +
                </button>
              )}
            </div>
          </div>

          {/* Core need */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              💡 {zh ? "一句话核心需求" : "Core requirement"}
            </span>
            <input
              type="text"
              value={cur.coreNeed ?? ""}
              onChange={(e) =>
                void updateInput({ coreNeed: e.target.value })
              }
              className="r2v-input"
              placeholder={
                zh
                  ? "如：跑鞋电商广告，突出缓震科技"
                  : "e.g. Running shoe ad, highlight cushion tech"
              }
            />
          </div>

          {/* Duration + Ratio */}
          <div className="r2v-lv-row-2">
            <div className="r2v-lv-field">
              <span className="r2v-lv-label">
                ⏱ {zh ? "时长" : "Duration"}
              </span>
              <select
                value={cur.output.duration}
                onChange={(e) =>
                  void updateInput({
                    output: {
                      ...cur.output,
                      duration: Number(e.target.value) || 10,
                    },
                  })
                }
                className="r2v-input"
              >
                <option value={5}>5 {zh ? "秒" : "s"}</option>
                <option value={8}>8 {zh ? "秒" : "s"}</option>
                <option value={10}>10 {zh ? "秒" : "s"}</option>
                <option value={13}>13 {zh ? "秒" : "s"}</option>
                <option value={15}>15 {zh ? "秒" : "s"}</option>
              </select>
            </div>
            <div className="r2v-lv-field">
              <span className="r2v-lv-label">
                📐 {zh ? "比例" : "Ratio"}
              </span>
              <select
                value={cur.output.ratio}
                onChange={(e) =>
                  void updateInput({
                    output: {
                      ...cur.output,
                      ratio: e.target
                        .value as R2VProjectInput["output"]["ratio"],
                    },
                  })
                }
                className="r2v-input"
              >
                {RATIOS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {zh ? o.zh : o.en}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* UGC mode — progressive disclosure: framework → generate → review.
         *
         *   Step 1: UGCFrameworkPicker (always visible in UGC mode)
         *   Step 2: UGCGenerateHero    (revealed after framework picked)
         *   Step 3: ChunksTimeline     (revealed after chunks generated)
         *   Step 4: UniversalBlocksEditor (collapsed by default, advanced)
         *
         * Hides all the heavy "fill 4 textareas + pick 3 cards + edit
         * 5 chunks" load until the user has actually taken a step. */}
        {ugcMode ? (
          <>
            <UGCFrameworkPicker zh={zh} />
            {cur.ugcFramework ? <UGCGenerateHero zh={zh} /> : null}
            {(cur.chunks?.length ?? 0) > 0 ? (
              <>
                <ChunksTimeline zh={zh} />
                <UniversalBlocksEditor zh={zh} />
              </>
            ) : null}
          </>
        ) : null}

        {/* Cinematic mode: keep Level 2/3 (style / advanced) */}
        {!ugcMode ? (
          <>
        {/* ═══════════ Level 2：推荐 ═══════════ */}
        <section className="r2v-level r2v-level--2">
          <div className="r2v-level-head">
            <span className="r2v-level-dot r2v-level-dot--2" />
            <span className="r2v-level-title">
              {zh ? "推荐" : "Recommended"}
            </span>
          </div>

          {/* Content direction */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              📺 {zh ? "内容方向" : "Content direction"}
            </span>
            <select
              value={cur.contentDirection ?? ""}
              onChange={(e) =>
                void updateInput({
                  contentDirection: (e.target.value ||
                    undefined) as R2VProjectInput["contentDirection"],
                })
              }
              className="r2v-input"
            >
              <option value="">
                {zh ? "-- 请选择 --" : "-- Select --"}
              </option>
              {CONTENT_DIRECTIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {zh ? d.zh : d.en}
                </option>
              ))}
            </select>
          </div>

          {/* E-commerce sub-category (conditional) */}
          {cur.contentDirection === "ecommerce" ? (
            <div className="r2v-lv-field">
              <span className="r2v-lv-label">
                🛒 {zh ? "电商品类" : "E-commerce category"}
              </span>
              <select
                value={cur.category}
                onChange={(e) =>
                  void updateInput({
                    category: e.target.value as NonNullable<
                      R2VProjectInput["category"]
                    >,
                  })
                }
                className="r2v-input"
              >
                <option value="general">
                  {zh ? "-- 请选择 --" : "-- Select --"}
                </option>
                {ECOM_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {zh ? c.zh : c.en}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Scene type (radio) */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              🎬 {zh ? "场景类型（4 选 1）" : "Scene type"}
            </span>
            <div className="r2v-check-group">
              {SCENE_TYPES.map((st) => (
                <label key={st.id} className="r2v-check-item">
                  <input
                    type="radio"
                    name="r2v-sceneType"
                    checked={cur.sceneType === st.id}
                    onChange={() =>
                      void updateInput({
                        sceneType:
                          st.id as R2VProjectInput["sceneType"],
                      })
                    }
                  />
                  <span>{zh ? st.zh : st.en}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              📲 {zh ? "投放平台" : "Platform"}
            </span>
            <input
              type="text"
              value={cur.platform ?? ""}
              onChange={(e) =>
                void updateInput({ platform: e.target.value })
              }
              className="r2v-input"
              placeholder={
                zh
                  ? "如：YouTube + 抖音 / 小红书"
                  : "e.g. YouTube + TikTok"
              }
            />
          </div>
        </section>

        {/* ═══════════ Level 3：进阶 ═══════════ */}
        <section className="r2v-level r2v-level--3">
          <div className="r2v-level-head">
            <span className="r2v-level-dot r2v-level-dot--3" />
            <span className="r2v-level-title">
              {zh ? "进阶" : "Advanced"}
            </span>
          </div>

          {/* Brand + USP */}
          <div className="r2v-lv-row-2">
            <div className="r2v-lv-field">
              <span className="r2v-lv-label">
                🏷 {zh ? "品牌名" : "Brand"}
              </span>
              <input
                type="text"
                value={cur.brand ?? ""}
                onChange={(e) =>
                  void updateInput({ brand: e.target.value })
                }
                className="r2v-input"
                placeholder={zh ? "如：LUMINANCE" : "e.g. LUMINANCE"}
              />
            </div>
            <div className="r2v-lv-field">
              <span className="r2v-lv-label">
                💎 {zh ? "卖点" : "Selling point"}
              </span>
              <input
                type="text"
                value={newSellingPoint}
                onChange={(e) => setNewSellingPoint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSellingPoint();
                  }
                }}
                className="r2v-input"
                placeholder={
                  zh ? "输入后回车添加" : "Enter to add"
                }
              />
            </div>
          </div>
          {cur.sellingPoints.length > 0 ? (
            <ul className="r2v-chips r2v-chips--vertical">
              {cur.sellingPoints.map((sp, i) => (
                <li key={i} className="r2v-chip-row">
                  <span className="r2v-chip">
                    {sp}
                    <button
                      type="button"
                      onClick={() => removeSellingPoint(i)}
                      aria-label="remove"
                    >
                      ×
                    </button>
                  </span>
                  {sellingPointHints[i] ? (
                    <span className="r2v-chip-hint">
                      → {sellingPointHints[i]}
                    </span>
                  ) : cur.autoTranslateSellingPoints ? (
                    <span className="r2v-chip-hint r2v-chip-hint--miss">
                      {zh
                        ? "由 Qoder 自由发挥"
                        : "Agent will improvise"}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Must-keep steps */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              ⚠️{" "}
              {zh
                ? "必保留步骤（防 AI 删减）"
                : "Must-keep steps (anti-AI-deletion)"}
            </span>
            <textarea
              value={cur.mustKeep ?? ""}
              onChange={(e) =>
                void updateInput({ mustKeep: e.target.value })
              }
              className="r2v-input r2v-textarea-sm"
              placeholder={
                zh
                  ? '如：必须有"打开盖 → 滴管 → 滴在脸侧"'
                  : 'e.g. Must include "open cap → dropper → apply"'
              }
            />
          </div>

          {/* Abstract → visual (selling point auto-translate hint) */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              🔍{" "}
              {zh
                ? "抽象卖点 → 视觉锚点"
                : "Abstract → visual anchors"}
            </span>
            <textarea
              value={cur.notes ?? ""}
              onChange={(e) =>
                void updateInput({ notes: e.target.value })
              }
              className="r2v-input r2v-textarea-sm"
              placeholder={
                zh
                  ? '如："显瘦" → 想要什么物理表现？'
                  : 'e.g. "slimming" → what physical expression?'
              }
            />
          </div>

          {/* Style preset */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              🎥 {zh ? "风格参考" : "Style reference"}
            </span>
            <select
              value={cur.style ?? ""}
              onChange={(e) =>
                void updateInput({
                  style: e.target.value || undefined,
                })
              }
              className="r2v-input"
            >
              <option value="">
                {zh
                  ? "-- 让 Qoder 自动判断 --"
                  : "-- Let Qoder decide --"}
              </option>
              {STYLE_GROUPS.map((g) => (
                <optgroup key={g.id} label={zh ? g.zh : g.en}>
                  {STYLES.filter((s) => s.group === g.id).map(
                    (s) => (
                      <option key={s.id} value={s.id}>
                        {zh ? s.zh : s.en} — {s.hint}
                      </option>
                    )
                  )}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Avoid presets */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              🚫 {zh ? "要避开（多选）" : "Avoid (multi-select)"}
            </span>
            <div className="r2v-check-group">
              {EXCLUDES.map((ex) => {
                const on = cur.excludes.includes(ex.id);
                return (
                  <label
                    key={ex.id}
                    className="r2v-check-item"
                    title={ex.cue}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleExclude(ex.id)}
                    />
                    <span>{zh ? ex.zh : ex.en}</span>
                  </label>
                );
              })}
            </div>
            <input
              type="text"
              value={newCustomExclude}
              onChange={(e) => setNewCustomExclude(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomExclude();
                }
              }}
              className="r2v-input r2v-input--small"
              placeholder={
                zh
                  ? "还想避开什么？回车添加"
                  : "What else to avoid? Enter to add"
              }
              style={{ marginTop: 4 }}
            />
            {cur.excludesCustom.length > 0 ? (
              <ul className="r2v-chips" style={{ marginTop: 4 }}>
                {cur.excludesCustom.map((e, i) => (
                  <li key={i}>
                    <span className="r2v-chip">
                      {e}
                      <button
                        type="button"
                        onClick={() => removeCustomExclude(i)}
                        aria-label="remove"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Tech details */}
          <div className="r2v-lv-field">
            <span className="r2v-lv-label">
              🔧 {zh ? "技术细节" : "Technical details"}
            </span>
            <div className="r2v-check-group">
              {TECH_DETAILS.map((td) => (
                <label key={td.id} className="r2v-check-item">
                  <input
                    type="checkbox"
                    checked={(cur.techDetails ?? []).includes(
                      td.id
                    )}
                    onChange={() => toggleTechDetail(td.id)}
                  />
                  <span>{zh ? td.zh : td.en}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
          </>
        ) : null}
      </div>

      {/* ── footer ── */}
      <footer className="r2v-card-footer">
        <div className="r2v-project-name-row">
          <input
            className="r2v-project-name-input"
            type="text"
            placeholder={zh ? "输入项目名称…" : "Project name…"}
            value={titleInput}
            onChange={(e) => {
              const v = e.target.value;
              setTitleInput(v);
              // Only commit to store when non-empty (schema requires min(1)).
              if (v.trim()) void updateInput({ title: v });
            }}
            onBlur={() => {
              // Restore last-valid title if user left it empty/whitespace.
              if (!titleInput.trim()) setTitleInput(cur.title);
            }}
          />
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost r2v-btn--save"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await persistDraft();
                setSavedFlash(true);
                if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
                savedFlashTimerRef.current = setTimeout(() => setSavedFlash(false), 2500);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving
              ? (zh ? "保存中…" : "Saving…")
              : savedFlash
                ? (zh ? "✓ 已保存" : "✓ Saved")
                : (zh ? "💾 保存项目" : "💾 Save")}
          </button>
        </div>
        <div className="r2v-card-footer-actions">
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost"
            onClick={copyConfig}
            disabled={!canContinue}
          >
            {copied
              ? zh ? "已复制 ✓" : "Copied ✓"
              : zh ? "📋 复制配置" : "📋 Copy config"}
          </button>
          <button
            type="button"
            className="r2v-btn r2v-btn--primary"
            onClick={onContinue}
            disabled={!canContinue}
          >
            {zh ? "下一步：生成 Prompt →" : "Next: Generate Prompt →"}
          </button>
        </div>
      </footer>

      {/* ── lightbox ── */}
      {lightboxSrc && (
        <div
          className="r2v-lightbox"
          onClick={() => setLightboxSrc(null)}
          role="dialog"
          aria-label="Image preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="preview"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="r2v-lightbox-close"
            onClick={() => setLightboxSrc(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
