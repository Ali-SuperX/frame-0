"use client";

import { useEffect, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import { REALISM_PRESETS } from "@/lib/r2v/presets";
import type { R2VProjectInput } from "@/lib/r2v/schema";

type Props = { zh: boolean };

type BlockKey = keyof NonNullable<R2VProjectInput["universalBlocks"]>;

const BLOCK_FIELDS: {
  key: BlockKey;
  zh: { label: string; placeholder: string; hint: string };
  en: { label: string; placeholder: string; hint: string };
}[] = [
  {
    key: "characterLock",
    zh: {
      label: "Character Lock",
      placeholder:
        "如：character1 是同一位 40 岁亚裔女性贯穿所有 chunk，自然马尾、米白 T 恤。每段镜头里她的脸型、发色、衣服必须完全一致。",
      hint: "锁住模特身份 — 防止跨段变脸",
    },
    en: {
      label: "Character Lock",
      placeholder:
        "e.g. character1 = same woman, mid-40s, casual ponytail, white T. Same face shape / hair / outfit across every chunk.",
      hint: "Locks model identity — prevents face drift between cuts",
    },
  },
  {
    key: "actionDirection",
    zh: {
      label: "Action Direction",
      placeholder:
        "如：她以聊天的语气说话，像跟闺蜜爆料。不要戏剧化手势、不要广告腔。允许轻微的手持镜头晃动和自然眨眼。",
      hint: "动作风格 — 决定「像真人」还是「像演员」",
    },
    en: {
      label: "Action Direction",
      placeholder:
        "e.g. She speaks conversationally like sharing a secret with a friend. No theatrical gestures, no commercial cadence.",
      hint: "Performance style — determines real-feel vs actor-feel",
    },
  },
  {
    key: "realismBlock",
    zh: {
      label: "Realism Block",
      placeholder: "选下方预设，或自由写：手机自拍 / Vlog / 影棚...",
      hint: "画质风格 — 决定 UGC 真实感强度",
    },
    en: {
      label: "Realism Block",
      placeholder: "Pick a preset below, or write your own: phone selfie / vlog / studio…",
      hint: "Image quality style — drives UGC authenticity",
    },
  },
  {
    key: "excludeBlock",
    zh: {
      label: "Exclude Block",
      placeholder:
        "如：不要影棚灯光、不要专业广告打光、不要光滑无毛孔皮肤、不要朗诵腔。",
      hint: "项目级反向词 — 在 8 个反向预设之上叠加",
    },
    en: {
      label: "Exclude Block",
      placeholder:
        "e.g. No studio lighting, no commercial cinematography, no glossy skin smoothing, no script-recital.",
      hint: "Project-level negatives — stacks on top of preset excludes",
    },
  },
];

export default function UniversalBlocksEditor({ zh }: Props) {
  const cur = useR2VStore((s) => s.current);
  const updateInput = useR2VStore((s) => s.updateInput);

  /* Default collapsed — 90% of users never need to touch these fields after
   * the smart-prefill below fires. Power users expand via the chevron. */
  const [expanded, setExpanded] = useState(false);

  /* ── Auto-prefill characterLock from fiveElements on first UGC entry ── */
  /** ── Reactive auto-prefill ──
   *  Two effects:
   *    (a) `realismBlock` — fills once on mode→ugc if empty (one-shot).
   *    (b) `characterLock` — fills any time fiveElements changes AND the
   *        characterLock is still empty. So the user can fill 5 要素 first
   *        OR after switching to UGC; either flow works.
   */
  const feChar = cur?.fiveElements?.character;
  const feId = cur?.fiveElements?.identity;
  const feOutfit = cur?.fiveElements?.outfit;
  const characterLockFilled = !!cur?.universalBlocks?.characterLock?.trim();
  const realismBlockFilled = !!cur?.universalBlocks?.realismBlock?.trim();
  const isUgc = cur?.mode === "ugc";

  // (a) Realism default — one-shot on entering UGC.
  useEffect(() => {
    if (!cur || !isUgc || realismBlockFilled) return;
    const def = REALISM_PRESETS.find((p) => p.id === "phone-cam-indoor");
    if (!def) return;
    void updateInput({
      universalBlocks: {
        ...(cur.universalBlocks ?? {}),
        realismBlock: zh ? def.zh.cue : def.en.cue,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUgc]);

  // (b) Character lock — re-fires whenever fiveElements change (only if user
  //     hasn't manually filled characterLock yet).
  useEffect(() => {
    if (!cur || !isUgc || characterLockFilled) return;
    if (!feChar && !feId && !feOutfit) return;
    const parts = [feChar, feId, feOutfit].filter(Boolean).join("，");
    if (!parts) return;
    void updateInput({
      universalBlocks: {
        ...(cur.universalBlocks ?? {}),
        characterLock: zh
          ? `character1 = ${parts}。每段镜头里这个人的外观、发型、衣服必须完全一致。`
          : `character1 = ${parts}. Same appearance, hair, outfit across every chunk.`,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUgc, feChar, feId, feOutfit, characterLockFilled]);

  if (!cur) return null;
  const blocks = cur.universalBlocks ?? {};

  function setBlock(key: BlockKey, value: string) {
    void updateInput({
      universalBlocks: { ...(cur!.universalBlocks ?? {}), [key]: value },
    });
  }

  function applyRealismPreset(presetId: string) {
    const p = REALISM_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setBlock("realismBlock", zh ? p.zh.cue : p.en.cue);
  }

  const filledCount = BLOCK_FIELDS.filter(
    (f) => !!blocks[f.key]?.trim()
  ).length;

  return (
    <section className={`r2v-ugc-section r2v-blocks-collapsible ${expanded ? "r2v-blocks-collapsible--open" : ""}`}>
      <button
        type="button"
        className="r2v-blocks-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="r2v-blocks-toggle-chevron" aria-hidden>
          {expanded ? "▼" : "▶"}
        </span>
        <span className="r2v-blocks-toggle-label">
          ⚙️ {zh ? "高级：跨段一致性微调" : "Advanced: cross-chunk consistency"}
        </span>
        <span className="r2v-blocks-toggle-meta">
          {filledCount > 0
            ? zh
              ? `已智能预填 ${filledCount}/4`
              : `Smart-prefilled ${filledCount}/4`
            : zh
              ? "默认即可，按需展开"
              : "Defaults work — expand to tune"}
        </span>
      </button>

      {expanded ? (
      <div className="r2v-blocks-grid">
        {BLOCK_FIELDS.map((field) => {
          const meta = zh ? field.zh : field.en;
          return (
            <label key={field.key} className="r2v-block-field">
              <div className="r2v-block-label">
                <span>{meta.label}</span>
                <span className="r2v-block-hint">{meta.hint}</span>
              </div>
              <textarea
                value={blocks[field.key] ?? ""}
                onChange={(e) => setBlock(field.key, e.target.value)}
                placeholder={meta.placeholder}
                rows={field.key === "realismBlock" ? 3 : 2}
                className="r2v-input r2v-block-textarea"
              />
              {/* Realism presets */}
              {field.key === "realismBlock" ? (
                <div className="r2v-realism-presets">
                  {REALISM_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="r2v-chip"
                      onClick={() => applyRealismPreset(p.id)}
                      title={zh ? p.zh.cue : p.en.cue}
                    >
                      {zh ? p.zh.name : p.en.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          );
        })}
      </div>
      ) : null}
    </section>
  );
}
