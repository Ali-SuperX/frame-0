"use client";

/**
 * UGC Step 2 — the "🚀 生成 N 段" hero CTA.
 *
 * Composes inputs from elsewhere in the form:
 *   - framework  → `cur.ugcFramework` (set by UGCFrameworkPicker)
 *   - brief      → `cur.coreNeed` (the "💡 一句话核心需求" field above)
 *   - productHint → `cur.references` first product-role reference name
 *
 * On click: calls generateChunksFromBrief() (pure template fill) and writes
 * chunks to the store. Smart-prefills UniversalBlocks if still empty. The
 * page auto-scrolls to the timeline below.
 *
 * Disabled if framework or brief is missing — tells the user exactly what
 * to fill in rather than silently doing nothing.
 */

import { useR2VStore } from "@/lib/r2v/projectStore";
import { confirmDialog } from "@/components/ui/Dialog";
import {
  UGC_FRAMEWORKS,
  REALISM_PRESETS,
  generateChunksFromBrief,
} from "@/lib/r2v/presets";

type Props = { zh: boolean };

export default function UGCGenerateHero({ zh }: Props) {
  const cur = useR2VStore((s) => s.current);
  const updateInput = useR2VStore((s) => s.updateInput);

  if (!cur || !cur.ugcFramework) return null;

  const fw = UGC_FRAMEWORKS.find((f) => f.id === cur.ugcFramework);
  if (!fw) return null;
  const fwMeta = zh ? fw.zh : fw.en;

  const brief = cur.coreNeed?.trim() ?? "";
  const productRef = cur.references.find((r) => r.role === "product" && r.url);
  const productHint = productRef?.name;
  const hasChunks = (cur.chunks?.length ?? 0) > 0;

  const briefMissing = !brief;
  const disabled = briefMissing;

  async function handleGenerate() {
    if (!cur || !cur.ugcFramework) return;
    if (briefMissing) return;
    if (hasChunks) {
      const ok = await confirmDialog({
        title: zh
          ? `已有 ${cur.chunks.length} 段 chunks，覆盖重新生成？`
          : `${cur.chunks.length} chunks already exist. Regenerate?`,
        message: zh
          ? "手工编辑过的内容将丢失。"
          : "Manual edits will be lost.",
        danger: true,
      });
      if (!ok) return;
    }

    const chunks = generateChunksFromBrief(cur.ugcFramework, brief, {
      productHint,
      locale: zh ? "zh" : "en",
    });

    // Also smart-prefill any blank UniversalBlocks so the user doesn't
    // see empty fields when they expand the advanced section.
    const blocks = cur.universalBlocks ?? {};
    const updates: Parameters<typeof updateInput>[0] = { chunks };
    const nextBlocks = { ...blocks };
    let blocksChanged = false;
    if (!nextBlocks.realismBlock?.trim()) {
      const def = REALISM_PRESETS.find((p) => p.id === "phone-cam-indoor");
      if (def) {
        nextBlocks.realismBlock = zh ? def.zh.cue : def.en.cue;
        blocksChanged = true;
      }
    }
    if (!nextBlocks.actionDirection?.trim()) {
      nextBlocks.actionDirection = zh
        ? "她以聊天的语气说话，像跟闺蜜爆料。不要戏剧化手势、不要广告腔。允许轻微的手持镜头晃动和自然眨眼。"
        : "She speaks conversationally like sharing a secret. No theatrical gestures, no commercial cadence. Slight handheld wobble + natural blinks allowed.";
      blocksChanged = true;
    }
    if (!nextBlocks.excludeBlock?.trim()) {
      nextBlocks.excludeBlock = zh
        ? "不要影棚灯光、不要专业广告打光、不要光滑无毛孔皮肤、不要朗诵腔。"
        : "No studio lighting, no commercial cinematography, no glossy smoothed skin, no script-recital cadence.";
      blocksChanged = true;
    }
    if (blocksChanged) updates.universalBlocks = nextBlocks;

    void updateInput(updates);

    // Smooth-scroll to timeline once the DOM updates.
    window.setTimeout(() => {
      const el = document.querySelector(".r2v-timeline");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }

  return (
    <section className="r2v-ugc-section r2v-ugc-step2">
      <header className="r2v-ugc-section-head">
        <h3>
          <span className="r2v-step-num">2</span>
          {zh ? "一键生成脚本" : "Generate the script"}
        </h3>
        <span className="r2v-section-sub">
          {zh
            ? "基于框架 + 核心需求 → 自动写出每段台词和镜头建议"
            : "Framework + brief → auto-fills voiceover + framing per chunk"}
        </span>
      </header>

      <div className="r2v-generate-hero">
        {/* Brief — editable inline so the user doesn't have to scroll back
            to the "必填" section to tweak it before regenerating. Bound
            to cur.coreNeed; lives there so Cinematic mode also picks it up. */}
        <label className="r2v-generate-brief">
          <span className="r2v-generate-brief-label">
            💬 {zh ? "一句话核心需求" : "One-line brief"}
            {briefMissing ? (
              <span className="r2v-generate-brief-required">
                {zh ? " · 必填" : " · required"}
              </span>
            ) : null}
          </span>
          <textarea
            value={brief}
            onChange={(e) =>
              void updateInput({ coreNeed: e.target.value })
            }
            placeholder={
              zh
                ? "如：跑鞋电商广告，突出缓震科技 / 抗皱面霜 35+ 女性"
                : "e.g. running-shoe ad, emphasize cushioning / anti-wrinkle cream 35+"
            }
            rows={2}
            className="r2v-input r2v-generate-brief-input"
          />
        </label>

        <div className="r2v-generate-summary">
          <div className="r2v-generate-summary-row">
            <span className="r2v-generate-summary-label">
              📋 {zh ? "框架" : "Framework"}
            </span>
            <span className="r2v-generate-summary-value">
              {fwMeta.name} · {fw.suggestedChunks} {zh ? "段" : "chunks"} · {zh ? "时长自动适配字数" : "runtime auto-fitted"}
            </span>
          </div>
          <div className="r2v-generate-summary-row">
            <span className="r2v-generate-summary-label">
              📦 {zh ? "产品参考" : "Product ref"}
            </span>
            <span className={`r2v-generate-summary-value ${!productHint ? "r2v-generate-summary-value--missing" : ""}`}>
              {productHint || (zh
                ? "（无 — 将用通用占位词，建议先上传一张 role=产品的图）"
                : "(None — generic placeholder used; upload a role=product ref for better results)")}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="r2v-btn r2v-btn--primary r2v-btn--hero"
          onClick={handleGenerate}
          disabled={disabled}
          title={
            disabled
              ? zh
                ? "请先填写上方的「一句话核心需求」"
                : "Fill in the brief above first"
              : undefined
          }
        >
          {hasChunks
            ? zh
              ? `🔄 重新生成 ${fw.suggestedChunks} 段（覆盖当前）`
              : `🔄 Regenerate ${fw.suggestedChunks} chunks (overwrite)`
            : zh
              ? `🚀 一键生成 ${fw.suggestedChunks} 段`
              : `🚀 Generate ${fw.suggestedChunks} chunks`}
        </button>

        <div className="r2v-generate-foot">
          {hasChunks
            ? zh
              ? "✅ 已生成 — 下方可逐段微调"
              : "✅ Generated — fine-tune each chunk below"
            : zh
              ? "生成后会出现 Chunks Timeline，可逐段微调；不爽可换 brief 重跑。"
              : "Timeline appears after generation. Tune chunks or change brief and re-run anytime."}
        </div>
      </div>
    </section>
  );
}
