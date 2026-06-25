/**
 * Bailian (Aliyun DashScope) video model catalog.
 * Each spec describes the model's mode, vendor, and its parameter schema —
 * used to (a) render the dynamic param form in Studio and (b) build the
 * server-side submit payload.
 *
 * Source of truth: bailian-multimodal-skills/scripts/run_multimodal.py.
 */

export type Mode = "t2v" | "i2v" | "r2v" | "t2i" | "i2i" | "ve";

export type Vendor = "wan" | "pixverse" | "kling" | "qwen" | "zimage";

export type ParamField =
  | {
      kind: "text";
      key: string;
      label: string;
      placeholder?: string;
      multiline?: boolean;
      maxLength?: number;
    }
  | {
      kind: "enum";
      key: string;
      label: string;
      options: { value: string; label: string }[];
    }
  | {
      kind: "int";
      key: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    }
  | { kind: "bool"; key: string; label: string }
  | {
      kind: "media";
      key: string;
      label: string;
      accept: "image" | "video" | "audio" | "image|video";
      multiple?: boolean;
      maxCount?: number;
      required?: boolean;
    };

export type ModelSpec = {
  id: string;
  displayName: string;
  vendor: Vendor;
  mode: Mode;
  /**
   * Protocol family — determines how we build the HTTP payload.
   *   - wan27:  new HTTP protocol (resolution + ratio)
   *   - wan26:  legacy SDK-style (size + shot_type)
   *   - pixverse: input.media + size
   *   - kling: aspect_ratio + mode
   */
  protocol: "wan27" | "wan26" | "pixverse" | "kling" | "image";
  /** Real DashScope model name, when it differs from `id` (internal variant). */
  apiModel?: string;
  fields: ParamField[];
  defaults: Record<string, unknown>;
  /** Estimated runtime, used for the "X used · ~Y left" ETA hint during polling. */
  etaSec: number;
  /**
   * Optional override of the DashScope base URL (e.g. POC endpoints).
   * Defaults to `https://dashscope.aliyuncs.com/api/v1`.
   * The matching task-polling endpoint is derived from the same origin.
   */
  apiBase?: string;
  /**
   * Optional override of the env var name holding the API key for this
   * model. Defaults to `DASHSCOPE_API_KEY`. Useful for POC endpoints that
   * require their own dedicated credentials (e.g. HappyHorse).
   */
  apiKeyEnv?: string;
  notes?: string;
};

/* ─────────── shared option sets ─────────── */

const RESOLUTION_27: ParamField = {
  kind: "enum",
  key: "resolution",
  label: "Resolution",
  options: [
    { value: "720P", label: "720P" },
    { value: "1080P", label: "1080P" },
  ],
};
const RESOLUTION_26: ParamField = {
  kind: "enum",
  key: "resolution",
  label: "Resolution",
  options: [
    { value: "480P", label: "480P" },
    { value: "720P", label: "720P" },
    { value: "1080P", label: "1080P" },
  ],
};
const RATIO: ParamField = {
  kind: "enum",
  key: "ratio",
  label: "Aspect",
  options: [
    { value: "16:9", label: "16:9  horizontal" },
    { value: "9:16", label: "9:16  vertical" },
    { value: "1:1", label: "1:1   square" },
  ],
};
const SIZE_26: ParamField = {
  kind: "enum",
  key: "size",
  label: "Size",
  options: [
    { value: "1280*720", label: "1280×720  (16:9)" },
    { value: "1920*1080", label: "1920×1080 (16:9)" },
    { value: "720*1280", label: "720×1280  (9:16)" },
    { value: "1080*1920", label: "1080×1920 (9:16)" },
    { value: "960*960", label: "960×960   (1:1)" },
    { value: "1280*1280", label: "1280×1280 (1:1)" },
  ],
};
/** Build a duration field. `step` controls slider granularity. */
function durationField(min: number, max: number, step = 1): ParamField {
  return {
    kind: "int",
    key: "duration",
    label: "Duration",
    min,
    max,
    step,
    unit: "s",
  };
}
/**
 * Unified 3–15s slider applied to every video model. Bailian's API does the
 * final validation per-model; a rejection surfaces as a task error rather than
 * a frozen UI, which is the more honest behavior.
 */
const DURATION_3_15 = durationField(3, 15, 1);
/**
 * Aliases kept for backward compatibility with the spec references below.
 * All point at the same slider now.
 */
const DURATION_5_8 = DURATION_3_15;
const DURATION_5_ONLY = DURATION_3_15;
const DURATION = DURATION_3_15;
const SHOT_TYPE: ParamField = {
  kind: "enum",
  key: "shot_type",
  label: "Shots",
  options: [
    { value: "single", label: "Single shot" },
    { value: "multi", label: "Multiple shots" },
  ],
};
const NEG_PROMPT: ParamField = {
  kind: "text",
  key: "negative_prompt",
  label: "Negative prompt",
  multiline: true,
  placeholder: "things to avoid",
};
const PROMPT_EXTEND: ParamField = {
  kind: "bool",
  key: "prompt_extend",
  label: "Prompt extend (smart rewrite)",
};
const AUDIO: ParamField = {
  kind: "bool",
  key: "audio",
  label: "Generate audio",
};
const AUDIO_URL: ParamField = {
  kind: "text",
  key: "audio_url",
  label: "Audio URL (optional)",
  placeholder: "https://... .mp3/.wav",
};
const AUDIO_INPUT: ParamField = {
  kind: "media",
  key: "audio_url",
  label: "Driving audio · 驱动音频（可选，2-30s）",
  accept: "audio",
  required: false,
};
const WATERMARK: ParamField = {
  kind: "bool",
  key: "watermark",
  label: "AI watermark",
};
const AUDIO_SETTING: ParamField = {
  kind: "enum",
  key: "audio_setting",
  label: "Audio",
  options: [
    { value: "auto", label: "Auto" },
    { value: "origin", label: "Keep original" },
  ],
};
const SEED: ParamField = {
  kind: "int",
  key: "seed",
  label: "Seed (blank = random)",
};
const PROMPT: ParamField = {
  kind: "text",
  key: "prompt",
  label: "Prompt",
  multiline: true,
  placeholder:
    "一只小猫在月光下奔跑，宽镜头，35mm 电影感，暖色调  / A cat runs under moonlight…",
};
const IMG_INPUT: ParamField = {
  kind: "media",
  key: "img_url",
  label: "First frame · 首帧",
  accept: "image",
  required: true,
};
const REF_URLS: ParamField = {
  kind: "media",
  key: "reference_urls",
  label: "Characters (use character1, character2 in prompt)",
  accept: "image|video",
  multiple: true,
  maxCount: 5,
  required: true,
};

/* ─── wan2.7 multimodal i2v new fields ─── */
const LAST_FRAME_INPUT: ParamField = {
  kind: "media",
  key: "last_frame_url",
  label: "Last frame · 尾帧",
  accept: "image",
  required: true,
};
const FIRST_CLIP_INPUT: ParamField = {
  kind: "media",
  key: "first_clip_url",
  label: "First clip · 首段视频（2-10s）",
  accept: "video",
  required: true,
};

/* ─── image-generation shared fields ─── */
const IMG_PROMPT: ParamField = {
  kind: "text",
  key: "prompt",
  label: "Prompt",
  multiline: true,
  placeholder: "描述想生成的画面 —— 主体、风格、光线、构图…",
};
const IMG_SIZE: ParamField = {
  kind: "enum",
  key: "size",
  label: "Size",
  options: [
    { value: "1024*1024", label: "1024×1024 (1:1)" },
    { value: "1280*720", label: "1280×720  (16:9)" },
    { value: "720*1280", label: "720×1280  (9:16)" },
    { value: "1664*928", label: "1664×928  (16:9 wide)" },
    { value: "2048*2048", label: "2048×2048 (2K)" },
  ],
};
const IMG_N: ParamField = {
  kind: "int",
  key: "n",
  label: "Image count",
  min: 1,
  max: 6,
  step: 1,
};
const IMG_INPUTS: ParamField = {
  kind: "media",
  key: "ref_images",
  label: "Input images · 待编辑图（1-3 张）",
  accept: "image",
  multiple: true,
  maxCount: 3,
  required: true,
};

/* ─────────── model specs ─────────── */

export const MODELS: ModelSpec[] = [
  /* ── T2V ── */
  {
    id: "wan2.7-t2v",
    displayName: "Wan 2.7 · T2V",
    vendor: "wan",
    mode: "t2v",
    protocol: "wan27",
    fields: [
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_27,
      RATIO,
      DURATION_5_ONLY,
      PROMPT_EXTEND,
      AUDIO,
      AUDIO_INPUT,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "1080P",
      ratio: "16:9",
      duration: 5,
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    etaSec: 120,
    notes:
      "New HTTP protocol. Use natural language for shot structure (multi-shot).",
  },
  {
    id: "wan2.6-t2v",
    displayName: "Wan 2.6 · T2V",
    vendor: "wan",
    mode: "t2v",
    protocol: "wan26",
    fields: [
      PROMPT,
      NEG_PROMPT,
      SIZE_26,
      DURATION,
      SHOT_TYPE,
      PROMPT_EXTEND,
      AUDIO,
      AUDIO_URL,
      WATERMARK,
      SEED,
    ],
    defaults: {
      size: "1280*720",
      duration: 5,
      shot_type: "single",
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    etaSec: 60,
  },
  {
    id: "pixverse/pixverse-v5.6-t2v",
    displayName: "PixVerse v5.6 · T2V",
    vendor: "pixverse",
    mode: "t2v",
    protocol: "pixverse",
    fields: [PROMPT, SIZE_26, DURATION_5_8, AUDIO, WATERMARK, SEED],
    defaults: {
      size: "1280*720",
      duration: 5,
      audio: false,
      watermark: false,
    },
    etaSec: 120,
  },
  {
    id: "kling/kling-v3-video-generation",
    displayName: "Kling v3 · T2V",
    vendor: "kling",
    mode: "t2v",
    protocol: "kling",
    fields: [
      PROMPT,
      RATIO,
      {
        kind: "enum",
        key: "quality_mode",
        label: "Quality",
        options: [
          { value: "std", label: "Standard" },
          { value: "pro", label: "Pro" },
        ],
      },
      DURATION,
      AUDIO,
      WATERMARK,
    ],
    defaults: {
      ratio: "16:9",
      quality_mode: "std",
      duration: 5,
      audio: false,
      watermark: false,
    },
    etaSec: 180,
  },

  /* ── I2V ── */
  {
    id: "wan2.7-i2v",
    displayName: "Wan 2.7 · I2V",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan27",
    apiModel: "wan2.7-i2v-2026-04-25",
    fields: [
      IMG_INPUT,
      AUDIO_INPUT,
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_27,
      RATIO,
      DURATION_5_ONLY,
      PROMPT_EXTEND,
      AUDIO,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "1080P",
      ratio: "9:16",
      duration: 5,
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    etaSec: 90,
  },
  {
    id: "wan2.7-flf",
    displayName: "Wan 2.7 · 首尾帧生视频",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan27",
    apiModel: "wan2.7-i2v-2026-04-25",
    fields: [
      IMG_INPUT,
      LAST_FRAME_INPUT,
      AUDIO_INPUT,
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_27,
      DURATION_5_ONLY,
      PROMPT_EXTEND,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      duration: 10,
      prompt_extend: false,
      watermark: false,
    },
    etaSec: 120,
    notes:
      "万相 2.7 首尾帧生视频 · 传入首帧 + 尾帧图像，模型生成过渡视频。比例跟随首帧图。",
  },
  {
    id: "wan2.7-video-extend",
    displayName: "Wan 2.7 · 视频续写",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan27",
    apiModel: "wan2.7-i2v-2026-04-25",
    fields: [
      FIRST_CLIP_INPUT,
      {
        ...LAST_FRAME_INPUT,
        required: false,
        label: "Last frame · 尾帧（可选）",
      },
      AUDIO_INPUT,
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_27,
      DURATION_5_ONLY,
      PROMPT_EXTEND,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      duration: 15,
      prompt_extend: true,
      watermark: false,
    },
    etaSec: 150,
    notes:
      "万相 2.7 视频续写 · 上传首段视频片段（2-10s），模型生成后续内容。可选尾帧约束结尾。总时长由 duration 控制。",
  },
  {
    id: "wan2.6-i2v-flash",
    displayName: "Wan 2.6 · I2V Flash",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan26",
    fields: [
      IMG_INPUT,
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_26,
      DURATION,
      SHOT_TYPE,
      PROMPT_EXTEND,
      AUDIO,
      AUDIO_URL,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      duration: 5,
      shot_type: "single",
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    etaSec: 60,
  },
  {
    id: "wan2.6-i2v",
    displayName: "Wan 2.6 · I2V",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan26",
    fields: [
      IMG_INPUT,
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_26,
      DURATION,
      SHOT_TYPE,
      PROMPT_EXTEND,
      AUDIO,
      AUDIO_URL,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      duration: 5,
      shot_type: "single",
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    etaSec: 90,
  },
  {
    id: "pixverse/pixverse-v5.6-it2v",
    displayName: "PixVerse v5.6 · I2V",
    vendor: "pixverse",
    mode: "i2v",
    protocol: "pixverse",
    fields: [
      IMG_INPUT,
      PROMPT,
      {
        kind: "enum",
        key: "resolution",
        label: "Resolution",
        options: [
          { value: "360P", label: "360P" },
          { value: "540P", label: "540P" },
          { value: "720P", label: "720P" },
          { value: "1080P", label: "1080P" },
        ],
      },
      DURATION_5_8,
      AUDIO,
      WATERMARK,
      SEED,
    ],
    defaults: { resolution: "720P", duration: 5, audio: false, watermark: false },
    etaSec: 120,
  },
  {
    id: "kling/kling-v3-video-generation-i2v",
    displayName: "Kling v3 · I2V",
    vendor: "kling",
    mode: "i2v",
    protocol: "kling",
    // kling uses the same model id; we tag with -i2v to differentiate in UI
    fields: [
      IMG_INPUT,
      PROMPT,
      {
        kind: "enum",
        key: "quality_mode",
        label: "Quality",
        options: [
          { value: "std", label: "Standard" },
          { value: "pro", label: "Pro" },
        ],
      },
      DURATION,
      AUDIO,
      WATERMARK,
    ],
    defaults: { quality_mode: "std", duration: 5, audio: false, watermark: false },
    etaSec: 180,
    notes: "Kling shares one model id for T2V/I2V; mode is inferred from inputs.",
  },

  /* ── HappyHorse / 快乐马 (standard dashscope, wan2.7-style protocol) ── */
  {
    id: "happyhorse-1.0-t2v",
    displayName: "HappyHorse 1.0 · T2V",
    vendor: "wan",
    mode: "t2v",
    protocol: "wan27",
    fields: [
      PROMPT,
      RESOLUTION_27,
      RATIO,
      DURATION,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      ratio: "16:9",
      duration: 10,
      watermark: true,
    },
    etaSec: 180,
    notes:
      "快乐马 1.0 · 走主 dashscope 域 + 主 DASHSCOPE_API_KEY。支持 resolution / duration / watermark。",
  },
  {
    id: "happyhorse-1.0-i2v",
    displayName: "HappyHorse 1.0 · I2V",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan27",
    fields: [
      IMG_INPUT,
      PROMPT,
      NEG_PROMPT,
      RESOLUTION_27,
      RATIO,
      DURATION,
      PROMPT_EXTEND,
      AUDIO,
      AUDIO_URL,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      ratio: "16:9",
      duration: 10,
      prompt_extend: true,
      audio: false,
      watermark: true,
    },
    etaSec: 180,
    notes:
      "快乐马 1.0 图生视频 · 上传首帧 + prompt。比例默认跟随首帧图；显式选择会覆盖。",
  },
  {
    id: "happyhorse-1.0-r2v",
    displayName: "HappyHorse 1.0 · R2V",
    vendor: "wan",
    mode: "r2v",
    protocol: "wan27",
    fields: [
      REF_URLS,
      { ...PROMPT, placeholder: "character1 在咖啡馆桌前刻字，character2 望向她" },
      NEG_PROMPT,
      RESOLUTION_27,
      RATIO,
      DURATION,
      PROMPT_EXTEND,
      AUDIO,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      ratio: "9:16",
      duration: 10,
      prompt_extend: true,
      audio: false,
      watermark: true,
    },
    etaSec: 180,
    notes:
      "快乐马 1.0 参考生视频 · 多参考锁脸跨镜一致(character1..N)。wan2.7 协议(reference_image)，走主 dashscope 域。",
  },

  /* ── HappyHorse 1.1（镜像 1.0 四变体，id 即百炼模型名；纯版本升级，参数/字段与 1.0 一致）── */
  {
    id: "happyhorse-1.1-t2v",
    displayName: "HappyHorse 1.1 · T2V",
    vendor: "wan",
    mode: "t2v",
    protocol: "wan27",
    fields: [PROMPT, RESOLUTION_27, RATIO, DURATION, WATERMARK, SEED],
    defaults: { resolution: "720P", ratio: "16:9", duration: 10, watermark: true },
    etaSec: 180,
    notes: "快乐马 1.1 · 走主 dashscope 域 + 主 DASHSCOPE_API_KEY。支持 resolution / duration / watermark。",
  },
  {
    id: "happyhorse-1.1-i2v",
    displayName: "HappyHorse 1.1 · I2V",
    vendor: "wan",
    mode: "i2v",
    protocol: "wan27",
    fields: [IMG_INPUT, PROMPT, NEG_PROMPT, RESOLUTION_27, RATIO, DURATION, PROMPT_EXTEND, AUDIO, AUDIO_URL, WATERMARK, SEED],
    defaults: { resolution: "720P", ratio: "16:9", duration: 10, prompt_extend: true, audio: false, watermark: true },
    etaSec: 180,
    notes: "快乐马 1.1 图生视频 · 上传首帧 + prompt。比例默认跟随首帧图；显式选择会覆盖。",
  },
  {
    id: "happyhorse-1.1-r2v",
    displayName: "HappyHorse 1.1 · R2V",
    vendor: "wan",
    mode: "r2v",
    protocol: "wan27",
    fields: [REF_URLS, { ...PROMPT, placeholder: "character1 在咖啡馆桌前刻字，character2 望向她" }, NEG_PROMPT, RESOLUTION_27, RATIO, DURATION, PROMPT_EXTEND, AUDIO, WATERMARK, SEED],
    defaults: { resolution: "720P", ratio: "9:16", duration: 10, prompt_extend: true, audio: false, watermark: true },
    etaSec: 180,
    notes: "快乐马 1.1 参考生视频 · 多参考锁脸跨镜一致(character1..N)。wan2.7 协议(reference_image)，走主 dashscope 域。",
  },
  {
    id: "happyhorse-1.1-video-edit",
    displayName: "HappyHorse 1.1 · Video Edit",
    vendor: "wan",
    mode: "ve",
    protocol: "wan27",
    fields: [
      { kind: "media", key: "video_url", label: "源视频 · Source video（3-60s）", accept: "video", required: true },
      { kind: "media", key: "ref_images", label: "参考图 · Reference（可选 0-5 张）", accept: "image", multiple: true, maxCount: 5 },
      { ...PROMPT, label: "编辑指令", placeholder: "描述要做的编辑 —— 风格变换 / 局部替换 / 换装…" },
      RESOLUTION_27, AUDIO_SETTING, WATERMARK, SEED,
    ],
    defaults: { resolution: "1080P", audio_setting: "auto", watermark: true },
    etaSec: 180,
    notes: "快乐马 1.1 · 视频编辑。上传源视频 + 可选参考图 + 文本指令，做风格变换 / 局部替换。计费 = 输入视频时长 + 输出视频时长。\n限制：MP4/MOV，3-60s，长边≤4096px 短边≥360px，宽高比 1:2.5~2.5:1，≤100MB，>8fps。输出最长 15s（超 15s 自动截取前 15s）。",
  },

  /* ── R2V ── */
  {
    id: "wan2.6-r2v-flash",
    displayName: "Wan 2.6 · R2V Flash",
    vendor: "wan",
    mode: "r2v",
    protocol: "wan26",
    fields: [
      REF_URLS,
      {
        ...PROMPT,
        placeholder:
          "character1 在公园里散步, character2 靠在长椅上看她",
      },
      NEG_PROMPT,
      SIZE_26,
      DURATION_5_ONLY,
      SHOT_TYPE,
      AUDIO,
      WATERMARK,
      SEED,
    ],
    defaults: {
      size: "1280*720",
      duration: 5,
      shot_type: "single",
      audio: false,
      watermark: false,
    },
    etaSec: 90,
  },
  {
    id: "wan2.6-r2v",
    displayName: "Wan 2.6 · R2V",
    vendor: "wan",
    mode: "r2v",
    protocol: "wan26",
    fields: [
      REF_URLS,
      {
        ...PROMPT,
        placeholder: "character1 …, character2 …",
      },
      NEG_PROMPT,
      SIZE_26,
      DURATION_5_ONLY,
      SHOT_TYPE,
      AUDIO,
      WATERMARK,
      SEED,
    ],
    defaults: {
      size: "1280*720",
      duration: 5,
      shot_type: "single",
      audio: false,
      watermark: false,
    },
    etaSec: 150,
  },
  {
    id: "pixverse/pixverse-v5.6-r2v",
    displayName: "PixVerse v5.6 · R2V",
    vendor: "pixverse",
    mode: "r2v",
    protocol: "pixverse",
    fields: [
      REF_URLS,
      { ...PROMPT, placeholder: "character1 …, character2 …" },
      SIZE_26,
      DURATION_5_8,
      AUDIO,
      WATERMARK,
      SEED,
    ],
    defaults: {
      size: "1280*720",
      duration: 5,
      audio: false,
      watermark: false,
    },
    etaSec: 120,
  },
  {
    id: "happyhorse-1.0-video-edit",
    displayName: "HappyHorse 1.0 · Video Edit",
    vendor: "wan",
    mode: "ve",
    protocol: "wan27",
    fields: [
      {
        kind: "media",
        key: "video_url",
        label: "源视频 · Source video（3-60s）",
        accept: "video",
        required: true,
      },
      {
        kind: "media",
        key: "ref_images",
        label: "参考图 · Reference（可选 0-5 张）",
        accept: "image",
        multiple: true,
        maxCount: 5,
      },
      {
        ...PROMPT,
        label: "编辑指令",
        placeholder:
          "描述要做的编辑 —— 风格变换 / 局部替换 / 换装…",
      },
      RESOLUTION_27,
      AUDIO_SETTING,
      WATERMARK,
      SEED,
    ],
    defaults: { resolution: "1080P", audio_setting: "auto", watermark: true },
    etaSec: 180,
    notes:
      "快乐马 1.0 · 视频编辑。上传源视频 + 可选参考图 + 文本指令，做风格变换 / 局部替换。计费 = 输入视频时长 + 输出视频时长。\n限制：MP4/MOV，3-60s，长边≤4096px 短边≥360px，宽高比 1:2.5~2.5:1，≤100MB，>8fps。输出最长 15s（超 15s 自动截取前 15s）。",
  },
  {
    id: "wan2.7-videoedit",
    displayName: "Wan 2.7 · Video Edit",
    vendor: "wan",
    mode: "ve",
    protocol: "wan27",
    fields: [
      {
        kind: "media",
        key: "video_url",
        label: "源视频 · Source video",
        accept: "video",
        required: true,
      },
      {
        kind: "media",
        key: "ref_images",
        label: "参考图 · Reference（可选 0-5 张）",
        accept: "image",
        multiple: true,
        maxCount: 5,
      },
      {
        ...PROMPT,
        label: "编辑指令",
        placeholder:
          "描述要做的编辑 —— 风格变换 / 局部替换 / 换装…",
      },
      RESOLUTION_27,
      PROMPT_EXTEND,
      WATERMARK,
      SEED,
    ],
    defaults: {
      resolution: "720P",
      prompt_extend: true,
      watermark: true,
    },
    etaSec: 180,
    notes:
      "万相 2.7 · 视频编辑。上传源视频 + 可选参考图 + 文本指令，做风格变换 / 局部重绘。计费 = 输入视频时长 + 输出视频时长。",
  },

  /* ── Image generation · 同步生图（multimodal-generation/generation）── */
  {
    id: "z-image-turbo",
    displayName: "Z-Image · Turbo",
    vendor: "zimage",
    mode: "t2i",
    protocol: "image",
    fields: [IMG_PROMPT, IMG_SIZE],
    defaults: { size: "1024*1024" },
    etaSec: 8,
    notes: "Z-Image Turbo 文生图 · 极速出图。",
  },
  {
    id: "wan2.7-image-pro",
    displayName: "Wan 2.7 · Image Pro",
    vendor: "wan",
    mode: "t2i",
    protocol: "image",
    fields: [IMG_PROMPT, IMG_SIZE, IMG_N, WATERMARK],
    defaults: { size: "2048*2048", n: 1, watermark: false },
    etaSec: 15,
    notes: "万相 2.7 文生图 · 支持多图序列、2K 分辨率。",
  },
  {
    id: "qwen-image-2.0-pro",
    displayName: "Qwen-Image 2.0 · Pro",
    vendor: "qwen",
    mode: "t2i",
    protocol: "image",
    fields: [IMG_PROMPT, NEG_PROMPT, IMG_SIZE, IMG_N, PROMPT_EXTEND, WATERMARK],
    defaults: { size: "1664*928", n: 1, prompt_extend: true, watermark: false },
    etaSec: 12,
    notes: "千问图像 2.0 Pro · 中英文字渲染最强，单次可出 1-6 张。",
  },
  {
    id: "wan2.7-image-pro-edit",
    apiModel: "wan2.7-image-pro",
    displayName: "Wan 2.7 · Image Edit",
    vendor: "wan",
    mode: "i2i",
    protocol: "image",
    fields: [IMG_INPUTS, IMG_PROMPT, IMG_SIZE, IMG_N, WATERMARK],
    defaults: { size: "2048*2048", n: 1, watermark: false },
    etaSec: 15,
    notes: "万相 2.7 图像编辑 · 多图输入 + 指令编辑。",
  },
  {
    id: "qwen-image-edit",
    displayName: "Qwen-Image · Edit",
    vendor: "qwen",
    mode: "i2i",
    protocol: "image",
    fields: [IMG_INPUTS, IMG_PROMPT, NEG_PROMPT, IMG_SIZE, PROMPT_EXTEND, WATERMARK],
    defaults: { size: "1664*928", prompt_extend: true, watermark: false },
    etaSec: 12,
    notes: "千问图像编辑 · 图生图 / 局部修改。",
  },
];

/* ─────────── lookups ─────────── */

export const MODE_LABELS: Record<Mode, { en: string; zh: string }> = {
  t2v: { en: "Text → Video", zh: "文生视频" },
  i2v: { en: "Image → Video", zh: "图生视频" },
  r2v: { en: "Reference → Video", zh: "参考生视频" },
  t2i: { en: "Text → Image", zh: "文生图" },
  i2i: { en: "Image → Image", zh: "图生图" },
  ve: { en: "Video Edit", zh: "视频编辑" },
};

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelsByMode(mode: Mode): ModelSpec[] {
  return MODELS.filter((m) => m.mode === mode);
}

/** True for image-generation modes (t2i / i2i) — result is an image, not a video. */
export function isImageMode(mode: Mode): boolean {
  return mode === "t2i" || mode === "i2i";
}

export function defaultModelForMode(mode: Mode): ModelSpec {
  const list = modelsByMode(mode);
  if (!list.length) throw new Error(`No models for mode ${mode}`);
  // 平台主打 HappyHorse —— 默认优先最新 1.1 变体，无则回退任意 happyhorse，再无则列表首个
  return list.find((m) => m.id.startsWith("happyhorse-1.1-")) ?? list.find((m) => m.id.startsWith("happyhorse-")) ?? list[0];
}

/**
 * 给定一个模型 id，返回同厂商同代的 I2V（首帧生视频）变体 id。
 * 用于"视频延续"场景：从 r2v/t2v 任务衍生出 i2v 续写。
 * 已是 i2v 时返回自身；找不到映射返回 null。
 */
export function getI2VVariant(modelId: string): string | null {
  const map: Record<string, string> = {
    // HappyHorse
    "happyhorse-1.0-r2v": "happyhorse-1.0-i2v",
    "happyhorse-1.0-t2v": "happyhorse-1.0-i2v",
    "happyhorse-1.0-i2v": "happyhorse-1.0-i2v",
    "happyhorse-1.0-video-edit": "happyhorse-1.0-i2v",
    "happyhorse-1.1-r2v": "happyhorse-1.1-i2v",
    "happyhorse-1.1-t2v": "happyhorse-1.1-i2v",
    "happyhorse-1.1-i2v": "happyhorse-1.1-i2v",
    "happyhorse-1.1-video-edit": "happyhorse-1.1-i2v",
    // Wan 2.6
    "wan2.6-r2v": "wan2.6-i2v",
    "wan2.6-r2v-flash": "wan2.6-i2v-flash",
    "wan2.6-i2v": "wan2.6-i2v",
    "wan2.6-i2v-flash": "wan2.6-i2v-flash",
    // Wan 2.7
    "wan2.7-i2v": "wan2.7-i2v",
    "wan2.7-flf": "wan2.7-i2v",
    "wan2.7-video-extend": "wan2.7-i2v",
    "wan2.7-videoedit": "wan2.7-i2v",
    // Pixverse
    "pixverse/pixverse-v5.6-r2v": "pixverse/pixverse-v5.6-it2v",
    "pixverse/pixverse-v5.6-it2v": "pixverse/pixverse-v5.6-it2v",
    // Kling
    "kling/kling-v3-video-generation-i2v": "kling/kling-v3-video-generation-i2v",
  };
  return map[modelId] ?? null;
}

/**
 * 给定模型 id，返回同厂商同代的 R2V（多参考图）变体 id。
 * 链式生成段 2+ 用：参考图 = 角色锚点 + 上段尾帧。
 * 已是 r2v 时返回自身；找不到映射返回 null。
 */
export function getR2VVariant(modelId: string): string | null {
  const map: Record<string, string> = {
    "happyhorse-1.0-r2v": "happyhorse-1.0-r2v",
    "happyhorse-1.0-t2v": "happyhorse-1.0-r2v",
    "happyhorse-1.0-i2v": "happyhorse-1.0-r2v",
    "happyhorse-1.0-video-edit": "happyhorse-1.0-r2v",
    "happyhorse-1.1-r2v": "happyhorse-1.1-r2v",
    "happyhorse-1.1-t2v": "happyhorse-1.1-r2v",
    "happyhorse-1.1-i2v": "happyhorse-1.1-r2v",
    "happyhorse-1.1-video-edit": "happyhorse-1.1-r2v",
    "wan2.6-r2v": "wan2.6-r2v",
    "wan2.6-r2v-flash": "wan2.6-r2v-flash",
    "wan2.6-i2v": "wan2.6-r2v",
    "wan2.6-i2v-flash": "wan2.6-r2v-flash",
    // Wan 2.7 系列暂无独立 R2V 模型 —— 跨家族借用 happyhorse-1.0-r2v 不合适，
    // 干脆不映射；ContinuationPanel 拿到 null 时 r2v 延续按钮会被禁用。
    "pixverse/pixverse-v5.6-r2v": "pixverse/pixverse-v5.6-r2v",
    "pixverse/pixverse-v5.6-it2v": "pixverse/pixverse-v5.6-r2v",
  };
  return map[modelId] ?? null;
}
