/**
 * R2V Project Workspace — input.json schema.
 *
 * This is the structured payload frame-0 writes to disk for an external agent
 * (Claude Code via the video-prompt-generator skill) to consume. The agent
 * writes back a `prompt.md` next to it; frame-0 watches and ingests.
 *
 * The schema deliberately mirrors the optimization_checklist.md vocabulary
 * (5 elements, abstract selling points, style presets, negative excludes) so
 * the agent can build a high-quality Happy Horse R2V prompt without guessing.
 */

import { z } from "zod";

/* ─────────── primitives ─────────── */

export const RoleKindSchema = z.enum([
  "character",
  "product",
  "product-detail",
  "product-inuse",
  "effect",
  "texture",
  "scene",
  "prop",
  "logo",
  "style",
  "outfit",
  "packaging",
  "other",
]);
export type RoleKind = z.infer<typeof RoleKindSchema>;

/** Reference image entry (mirrors the order of the OSS upload).
 *  `url` is allowed to be empty: a slot may exist as a placeholder before the
 *  user has uploaded the image. The agent / video submitter must filter empty
 *  urls out before sending. */
export const ReferenceSchema = z.object({
  /** 1-based slot index. */
  slot: z.number().int().min(1).max(9),
  /** Public URL fed to the agent (oss://, http(s)://, or a relative path).
   *  Empty string while the slot is unfilled. */
  url: z.string().default(""),
  /** Display name (file name or user-edited label). */
  name: z.string().optional(),
  /** What this image represents in the final video. */
  role: RoleKindSchema.default("character"),
  /** Free-form note ("front view", "logo close-up", etc.). */
  note: z.string().optional(),
  /**
   * 🔒 PERSISTENCE-CRITICAL — DO NOT STRIP ON WRITE.
   * Base64 thumbnail for instant preview after reload (no network/IDB needed).
   * Not consumed by the agent, but UI-essential. Loss → "OSS 点击重传" placeholder.
   */
  thumbDataUrl: z.string().optional(),
  /**
   * 🔒 PERSISTENCE-CRITICAL — DO NOT STRIP ON WRITE.
   * IndexedDB key for full-res blob rehydration. Loss → can never recover full-res
   * preview from IDB, even though the bytes are still there.
   */
  localKey: z.string().optional(),
  /**
   * 🔒 PERSISTENCE-CRITICAL — DO NOT STRIP ON WRITE.
   * Server-mirrored path (/api/uploads/<sha>.<ext>). Survives IDB clears, cache
   * clears, browser changes, OSS URL expiry. Most resilient preview source.
   */
  localPath: z.string().optional(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

/** Five elements lock — Verum framework. */
export const FiveElementsSchema = z.object({
  character: z.string().optional(),
  identity: z.string().optional(),
  outfit: z.string().optional(),
  environment: z.string().optional(),
  vibe: z.string().optional(),
});
export type FiveElements = z.infer<typeof FiveElementsSchema>;

/** Multi-shot rhythm spec (Adrian's 4-shot template). */
export const RhythmSchema = z.enum([
  "single",
  "3-3-3-4",
  "2-3-3-2",
  "5",
  "10",
  "15",
  "custom",
]);
export type Rhythm = z.infer<typeof RhythmSchema>;

/* ─────────── full project ─────────── */

export const R2VProjectInputSchema = z.object({
  /** Schema version — bump when fields change in incompatible ways. */
  schemaVersion: z.literal(1).default(1),

  /** Stable id — usually slug-of-title + timestamp. */
  projectId: z.string().min(1),
  /** Human title shown in the UI. */
  title: z.string().min(1),
  /** ISO timestamp of last edit. */
  updatedAt: z.string(),

  /** Target model — only happyhorse-1.1-r2v supported in v1, but kept open. */
  modelId: z.string().default("happyhorse-1.1-r2v"),
  /** Output settings echoed back into the final prompt. */
  output: z.object({
    resolution: z.enum(["720P", "1080P"]).default("720P"),
    ratio: z.enum(["16:9", "9:16", "1:1", "4:3"]).default("16:9"),
    duration: z.number().int().min(3).max(15).default(10),
    watermark: z.boolean().default(true),
  }),

  /** Reference images, ordered. Index = character N in the prompt. */
  references: z.array(ReferenceSchema).min(1).max(9),

  /** Locked subject details. */
  fiveElements: FiveElementsSchema.default({}),

  /** Free-form abstract selling points the agent should translate to visual anchors. */
  sellingPoints: z.array(z.string()).default([]),
  /** When true, agent uses the built-in dictionary to translate phrases like
   *  "显瘦" into specific visual anchors. */
  autoTranslateSellingPoints: z.boolean().default(true),

  /** Category — drives e-commerce-style structure (美妆/服装/数码/食品/家居/运动). */
  category: z
    .enum([
      "beauty",
      "apparel",
      "digital",
      "food",
      "home",
      "sports",
      "luxury",
      "ugc",
      "general",
    ])
    .default("general"),

  /** Style preset id (matches presets.ts). */
  style: z.string().optional(),
  /** Multi-shot rhythm. */
  rhythm: RhythmSchema.default("single"),
  /** When set, custom rhythm string in seconds, e.g. "3-4-3". */
  rhythmCustom: z.string().optional(),

  /** Negative preset ids (matches presets.ts). */
  excludes: z.array(z.string()).default([]),
  /** Free-form additional negative items. */
  excludesCustom: z.array(z.string()).default([]),

  /** Anchor details to keep consistency across shots. */
  anchors: z.array(z.string()).default([]),

  /** Locale of the field labels — used by the agent to choose ZH vs EN prompt. */
  locale: z.enum(["zh", "en"]).default("zh"),

  /** One-line core requirement ("跑鞋电商广告，突出缓震科技"). */
  coreNeed: z.string().optional(),
  /** Content direction / video type. */
  contentDirection: z
    .enum(["luxury", "ecommerce", "emotional", "ugc", "cartoon", "landscape", "action"])
    .optional(),
  /** Scene composition type. */
  sceneType: z
    .enum(["single-multi-angle", "subject-scene", "multi-subject", "storyboard"])
    .optional(),
  /** Target platform (e.g. "YouTube + 抖音"). */
  platform: z.string().optional(),
  /** Brand name. */
  brand: z.string().optional(),
  /** Must-keep steps — anti-AI-deletion safeguard. */
  mustKeep: z.string().optional(),
  /** Technical detail flags (voice, text-overlay, pack-shot, real-person). */
  techDetails: z.array(z.string()).default([]),

  /** Free-form extra notes the agent should weigh. */
  notes: z.string().optional(),

  /* ─────────── UGC mode (volumetric ad pipeline) ───────────
   * When `mode === "ugc"`, the project produces a chunked UGC ad — multiple
   * short voiceover-driven clips that get stitched in post (Cap Cut / ffmpeg).
   * This is a different production model from cinematic R2V (single hero
   * video). Skill detects `mode === "ugc"` and switches to a multi-chunk
   * prompt template (see references/ugc_playbook.md). */
  mode: z.enum(["cinematic", "ugc"]).default("cinematic"),

  /** Universal direction blocks — same text reused across every chunk so the
   *  AI maintains character / style / realism consistency. Critical for UGC
   *  to avoid "different person every cut" failure. */
  universalBlocks: z
    .object({
      /** Locks the model identity ("character1 = the woman, mid-40s, candid"). */
      characterLock: z.string().optional(),
      /** Action style across cuts ("she speaks naturally, no theatrical gestures"). */
      actionDirection: z.string().optional(),
      /** UGC realism cues ("phone-cam quality, slight handheld wobble, natural light"). */
      realismBlock: z.string().optional(),
      /** Per-project negative directions on top of preset excludes. */
      excludeBlock: z.string().optional(),
    })
    .default({}),

  /** UGC chunks — ordered list of short voiceover clips. Each becomes one
   *  Seedance / Happy Horse generate call. Empty for cinematic mode. */
  chunks: z
    .array(
      z.object({
        /** 1-based segment index. */
        index: z.number().int().min(1).max(20),
        /** Spoken VO line for this segment. Drives lip-sync. */
        voiceover: z.string(),
        /** Camera/scene direction unique to this segment. */
        framing: z.string().optional(),
        /** Whether the product (@-tag) should appear in this segment. */
        includeProduct: z.boolean().default(false),
        /** Recommended runtime in seconds (5-7 typical, 3-12 valid). */
        runtime: z.number().int().min(3).max(12).default(6),
        /** Hook framework type — only meaningful on the first chunk. */
        hookType: z
          .enum([
            "problem-aware",
            "problem-unaware",
            "social-proof",
            "shock",
            "question",
            "comparison",
            "transformation",
            "myth-bust",
            "story",
            "demo",
          ])
          .optional(),
        /* ── 🆕 AI 配音(基于百炼 TTS) ── */
        /** Voice id used to generate the audio(matches ttsVoices.ts id). */
        voiceoverVoiceId: z.string().optional(),
        /** Permanent audio URL `/api/uploads/<sha>.mp3` after TTS + mirror. */
        voiceoverAudioUrl: z.string().optional(),
        /** Content-hash of (text + voiceId) — change either → re-generate. */
        voiceoverAudioSha: z.string().optional(),
        /** Audio duration in seconds(用来同步 chunk runtime). */
        voiceoverAudioDuration: z.number().optional(),
        /** User-uploaded external mp3 — overrides TTS when set. */
        voiceoverManualUrl: z.string().optional(),
      })
    )
    .default([]),

  /** UGC voiceover framework — determines script density. */
  ugcFramework: z
    .enum(["midfunnel-punchy", "full-stack", "raw-testimonial"])
    .optional(),
});
export type R2VProjectInput = z.infer<typeof R2VProjectInputSchema>;

/* ─────────── prompt.md frontmatter ─────────── */

/**
 * What we expect the agent to write back. Frontmatter is YAML; body is the
 * Happy Horse–ready prompt.
 *
 *   ---
 *   projectId: oligth-2025-05-07
 *   model: happyhorse-1.1-r2v
 *   generatedAt: 2025-05-07T12:34:56Z
 *   negativePrompt: |
 *     no autumn leaves clichés
 *   ---
 *
 *   character1 walks in...
 */
export const R2VPromptOutputSchema = z.object({
  projectId: z.string(),
  model: z.string().optional(),
  generatedAt: z.string().optional(),
  negativePrompt: z.string().optional(),
  prompt: z.string().min(1),
});
export type R2VPromptOutput = z.infer<typeof R2VPromptOutputSchema>;

/* ─────────── long video (chained segments) ─────────── */

export const VideoSegmentSchema = z.object({
  id: z.string(),
  order: z.number().int().min(0),
  duration: z.number().int().min(3).max(15).default(10),
  prompt: z.string().default(""),
  negativePrompt: z.string().optional(),
  cameraMove: z.string().optional(),
  /** Override which reference slots to use (subset of project refs). */
  overrideRefSlots: z.array(z.number().int()).optional(),
});
export type VideoSegment = z.infer<typeof VideoSegmentSchema>;

export const AnchorStrategySchema = z.enum([
  "r2v-chain",   // every segment uses R2V with shared refs + prev last frame
  "i2v-bridge",  // first segment R2V, subsequent use I2V from last frame
  "hybrid",      // key transitions R2V, smooth transitions I2V
]);
export type AnchorStrategy = z.infer<typeof AnchorStrategySchema>;

export const LongVideoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  anchorStrategy: AnchorStrategySchema.default("r2v-chain"),
  segments: z.array(VideoSegmentSchema).default([]),
});
export type LongVideoConfig = z.infer<typeof LongVideoConfigSchema>;

/** Runtime state for a segment during chain generation (NOT persisted). */
export type SegmentRunState = {
  segId: string;
  status: "pending" | "submitting" | "running" | "done" | "error";
  taskId?: string;
  videoUrl?: string;
  /** Key frames extracted from this segment's video (first/mid/last). */
  keyFrames?: { label: string; dataUrl: string; time: number }[];
  /** Shortcut: last frame data URL (always the final keyFrame). */
  lastFrameDataUrl?: string;
  error?: string;
  startedAt?: number;
  elapsed?: number;
};

/* ─────────── helpers ─────────── */

/** Slugify a title into a filesystem-safe project id. */
export function slugifyProjectId(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\w一-鿿-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return base ? `${base}-${stamp}` : `r2v-${stamp}-${Date.now().toString(36).slice(-4)}`;
}

/** A blank, valid-by-default project (one empty character slot to start). */
export function emptyProjectInput(opts?: {
  title?: string;
  locale?: "zh" | "en";
}): R2VProjectInput {
  const title = opts?.title?.trim() || (opts?.locale === "en" ? "Untitled" : "未命名项目");
  return R2VProjectInputSchema.parse({
    projectId: slugifyProjectId(title),
    title,
    updatedAt: new Date().toISOString(),
    output: {
      resolution: "720P",
      ratio: "16:9",
      duration: 10,
      watermark: true,
    },
    references: [
      { slot: 1, url: "", role: "character" },
    ],
    locale: opts?.locale ?? "zh",
  });
}
