/**
 * Prompt & template library for Studio.
 * Each entry can be applied as (a) prompt-only, (b) params-only, or (c) full.
 */

import type { Mode } from "./models";

export type Starter = {
  id: string;
  mode: Mode;
  modelId: string;
  title: { zh: string; en: string };
  blurb: { zh: string; en: string };
  prompt: string;
  negativePrompt?: string;
  params: Record<string, unknown>;
  /** Gradient for the card thumbnail. */
  bg: string;
  glyph: string;
  /** Rough ETA hint — shown as a pill. */
  etaSec: number;
  /** Searchable tags (mood/genre/quality). */
  tags: string[];
};

export const STARTERS: Starter[] = [
  /* ─── T2V ─── */
  {
    id: "t2v-cat-moonlight",
    mode: "t2v",
    modelId: "wan2.6-t2v",
    title: { zh: "月光下的小猫", en: "Cat under moonlight" },
    blurb: {
      zh: "5s 宽镜头 · 温暖电影感",
      en: "5s wide shot · warm cinematic",
    },
    prompt:
      "一只银灰色的小猫在月光下奔跑，背景是空旷的郊外小路，35mm 电影镜头，温暖的侧逆光，自然景深，慢动作",
    params: {
      size: "1280*720",
      duration: 5,
      shot_type: "single",
      prompt_extend: true,
      watermark: false,
    },
    bg: "radial-gradient(ellipse at 40% 60%, #d4a574 0%, #6b3a1f 40%, #0a0505 85%)",
    glyph: "🌙",
    etaSec: 60,
    tags: ["animal", "night", "cinematic"],
  },
  {
    id: "t2v-wan27-rainy",
    mode: "t2v",
    modelId: "wan2.7-t2v",
    title: { zh: "雨后街道 · 1080P", en: "Rainy street · 1080P" },
    blurb: {
      zh: "Wan 2.7 新协议 · 16:9 HD",
      en: "Wan 2.7 · 16:9 HD",
    },
    prompt:
      "雨后的东京街道，霓虹灯倒影在湿润的柏油路上，一个撑伞的身影缓缓走过，蒸汽升腾，35mm 胶片质感",
    params: {
      resolution: "1080P",
      ratio: "16:9",
      duration: 5,
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    bg: "linear-gradient(160deg, #1a1028 0%, #3a2045 40%, #a8506a 100%)",
    glyph: "🌆",
    etaSec: 120,
    tags: ["street", "neon", "atmospheric"],
  },
  {
    id: "t2v-kling-ocean",
    mode: "t2v",
    modelId: "kling/kling-v3-video-generation",
    title: { zh: "Kling · 海浪", en: "Kling · ocean waves" },
    blurb: {
      zh: "Kling v3 Pro 画质",
      en: "Kling v3 Pro quality",
    },
    prompt:
      "日出时分的海浪在黑色礁石上碎开，航拍俯视镜头，慢动作，金色光斑，电影宽银幕",
    params: {
      ratio: "16:9",
      quality_mode: "pro",
      duration: 5,
      audio: false,
      watermark: false,
    },
    bg: "linear-gradient(180deg, #0a1a3a 0%, #2a4070 40%, #f0b060 100%)",
    glyph: "🌊",
    etaSec: 180,
    tags: ["nature", "aerial", "slow-motion"],
  },
  {
    id: "t2v-vertical-dance",
    mode: "t2v",
    modelId: "wan2.7-t2v",
    title: { zh: "竖屏 · 城市舞者", en: "Vertical · city dancer" },
    blurb: {
      zh: "9:16 竖构图，社交平台友好",
      en: "9:16 vertical, social-ready",
    },
    prompt:
      "夜晚的都市天台，一个舞者在霓虹灯下自由舞动，风吹动头发，逆光剪影，60fps 慢动作",
    params: {
      resolution: "1080P",
      ratio: "9:16",
      duration: 5,
      prompt_extend: true,
      audio: true,
      watermark: false,
    },
    bg: "linear-gradient(200deg, #202040 0%, #702040 50%, #f08040 100%)",
    glyph: "💃",
    etaSec: 150,
    tags: ["portrait", "urban", "vertical"],
  },
  {
    id: "t2v-multi-shot",
    mode: "t2v",
    modelId: "wan2.6-t2v",
    title: { zh: "多镜头 · 咖啡馆", en: "Multi-shot · cafe" },
    blurb: {
      zh: "Wan 2.6 multi shot_type",
      en: "Wan 2.6 multi-shot mode",
    },
    prompt:
      "先是咖啡杯特写，蒸汽升腾；切到手推门进入；再切到窗边坐下的全景；再切到对视的两人正反打",
    params: {
      size: "1280*720",
      duration: 10,
      shot_type: "multi",
      prompt_extend: true,
      watermark: false,
    },
    bg: "linear-gradient(160deg, #2a1810 0%, #6b3a20 50%, #d8a060 100%)",
    glyph: "☕",
    etaSec: 180,
    tags: ["interior", "narrative", "multi-shot"],
  },
  {
    id: "t2v-pixverse-doodle",
    mode: "t2v",
    modelId: "pixverse/pixverse-v5.6-t2v",
    title: { zh: "PixVerse · 涂鸦动画", en: "PixVerse · doodle" },
    blurb: {
      zh: "PixVerse 风格化",
      en: "PixVerse stylized",
    },
    prompt:
      "手绘涂鸦风格的小人在白纸上跑步，穿过画面，线条简单，黑白配色，2D 动画质感",
    params: {
      size: "1280*720",
      duration: 5,
      audio: false,
      watermark: false,
    },
    bg: "linear-gradient(135deg, #f0ede4 0%, #cfc6b0 60%, #4a453a 100%)",
    glyph: "✏️",
    etaSec: 120,
    tags: ["stylized", "2d", "animation"],
  },

  /* ─── I2V ─── */
  {
    id: "i2v-portrait-breath",
    mode: "i2v",
    modelId: "wan2.7-i2v",
    title: { zh: "肖像 · 自然微笑", en: "Portrait · subtle smile" },
    blurb: {
      zh: "上传人像照，让她眨眼浅笑",
      en: "Upload portrait · blink + smile",
    },
    prompt: "人物微微歪头，自然眨眼，嘴角浅笑，眼神温柔，微风拂过发丝",
    params: {
      resolution: "1080P",
      ratio: "9:16",
      duration: 5,
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    bg: "radial-gradient(ellipse at 50% 40%, #e8c090 0%, #8b5a3c 50%, #1a0f08 90%)",
    glyph: "🖼️",
    etaSec: 90,
    tags: ["portrait", "needs-upload"],
  },
  {
    id: "i2v-landscape-zoom",
    mode: "i2v",
    modelId: "wan2.6-i2v-flash",
    title: { zh: "风景 · 慢推镜", en: "Landscape · slow push-in" },
    blurb: {
      zh: "上传一张风景照，生成推进镜头",
      en: "Upload landscape · slow push",
    },
    prompt: "相机缓慢推进，云层流动，光影变化，景物细节逐渐清晰",
    params: {
      resolution: "720P",
      duration: 5,
      shot_type: "single",
      prompt_extend: true,
      audio: false,
      watermark: false,
    },
    bg: "linear-gradient(180deg, #4a6080 0%, #80a8c0 50%, #e0c080 100%)",
    glyph: "🏞️",
    etaSec: 60,
    tags: ["landscape", "needs-upload", "flash"],
  },

  /* ─── R2V ─── */
  {
    id: "r2v-two-characters",
    mode: "r2v",
    modelId: "wan2.6-r2v-flash",
    title: { zh: "两个角色相遇", en: "Two characters meet" },
    blurb: {
      zh: "上传 1-2 张角色照",
      en: "Upload 1-2 character refs",
    },
    prompt:
      "character1 走进咖啡厅，character2 从桌旁站起来微笑着打招呼，温暖的午后光线，35mm 镜头",
    params: {
      size: "1280*720",
      duration: 5,
      shot_type: "single",
      audio: false,
      watermark: false,
    },
    bg: "linear-gradient(160deg, #3a2a1a 0%, #8b5a3c 40%, #d4a574 100%)",
    glyph: "🎭",
    etaSec: 90,
    tags: ["characters", "needs-upload"],
  },
  {
    id: "r2v-hero-walk",
    mode: "r2v",
    modelId: "wan2.6-r2v",
    title: { zh: "主角出场", en: "Hero entrance" },
    blurb: {
      zh: "上传 1 张角色照，英雄式出场",
      en: "Upload 1 ref · hero entrance",
    },
    prompt:
      "character1 穿着长风衣，从烟雾中缓慢走出，背景是废弃仓库，逆光剪影，慢动作，电影质感",
    params: {
      size: "1920*1080",
      duration: 5,
      shot_type: "single",
      audio: false,
      watermark: false,
    },
    bg: "linear-gradient(160deg, #0a0a10 0%, #2a2030 40%, #c86040 100%)",
    glyph: "🦸",
    etaSec: 150,
    tags: ["character", "cinematic", "needs-upload"],
  },

];

export function startersForMode(mode: Mode): Starter[] {
  return STARTERS.filter((s) => s.mode === mode);
}

export const MODE_DESCRIPTIONS: Record<
  Mode,
  { zh: string; en: string }
> = {
  t2v: {
    zh: "只写文字，AI 给你视频。最快上手。",
    en: "Write text, get video. The fastest way.",
  },
  i2v: {
    zh: "上传一张图作为首帧，让它动起来。",
    en: "Upload an image as the first frame.",
  },
  r2v: {
    zh: "上传 1-5 张角色照，prompt 里用 character1/character2 指人。",
    en: "Upload 1-5 character refs. Use character1/character2 in prompt.",
  },
  t2i: {
    zh: "只写文字，AI 给你图片。最快上手。",
    en: "Write text, get an image. The fastest way.",
  },
  i2i: {
    zh: "上传图片 + 编辑指令，AI 改图 / 局部修改。",
    en: "Upload images + an instruction to edit them.",
  },
  ve: {
    zh: "上传视频 + 参考图 + 指令，AI 改视频（风格变换 / 局部替换）。",
    en: "Upload a video + refs + instruction to edit it.",
  },
};
