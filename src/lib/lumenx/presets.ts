/**
 * LumenX 美术风格预设 + 镜头/运镜词表 + 默认模型。
 * 8 个内置风格对齐 lumenx style_presets.json（ghibli/pixar/cinematic/noir/
 * cyberpunk/anime/watercolor/comic），positive/negative 为英文 SD 关键词。
 */

import type { LxStyle, LxAspect } from "./types";

export const STYLE_PRESETS: LxStyle[] = [
  {
    id: "cinematic",
    name: "电影写实",
    description: "电影级真实质感，柔和光影，35mm 胶片颗粒",
    positivePrompt:
      "cinematic film still, photorealistic, soft volumetric lighting, shallow depth of field, 35mm film grain, color graded, highly detailed, 8k",
    negativePrompt: "cartoon, anime, illustration, low quality, deformed, text, watermark",
  },
  {
    id: "anime",
    name: "日系动画",
    description: "干净线条、鲜明色块的日本动画风",
    positivePrompt:
      "anime style, clean line art, vibrant cel shading, expressive eyes, detailed background, key visual, studio quality",
    negativePrompt: "photorealistic, 3d render, low quality, deformed, extra fingers, text, watermark",
  },
  {
    id: "ghibli",
    name: "吉卜力",
    description: "手绘水彩背景、温暖怀旧的童话氛围",
    positivePrompt:
      "studio ghibli style, hand-painted watercolor background, soft warm lighting, whimsical, nostalgic, lush nature, gentle color palette",
    negativePrompt: "photorealistic, harsh shadows, low quality, deformed, text, watermark",
  },
  {
    id: "pixar",
    name: "皮克斯 3D",
    description: "圆润可爱的 3D 渲染、明亮通透打光",
    positivePrompt:
      "pixar style 3d render, subsurface scattering, soft global illumination, expressive character, bright clean colors, octane render, highly detailed",
    negativePrompt: "2d, flat, photorealistic, low quality, deformed, text, watermark",
  },
  {
    id: "noir",
    name: "黑色电影",
    description: "高反差黑白、硬光与浓重阴影",
    positivePrompt:
      "film noir, high contrast black and white, dramatic chiaroscuro lighting, deep shadows, moody atmosphere, vintage 1940s, cinematic",
    negativePrompt: "colorful, bright, flat lighting, low quality, deformed, text, watermark",
  },
  {
    id: "cyberpunk",
    name: "赛博朋克",
    description: "霓虹灯、雨夜湿滑街道、高科技低生活",
    positivePrompt:
      "cyberpunk, neon lights, rain-soaked streets, holographic signage, moody blue and magenta glow, dystopian megacity, cinematic, highly detailed",
    negativePrompt: "daylight, rural, low quality, deformed, text, watermark",
  },
  {
    id: "watercolor",
    name: "水彩",
    description: "通透水彩晕染、柔和纸张质感",
    positivePrompt:
      "watercolor painting, soft wet-on-wet washes, delicate color bleeds, textured paper, light and airy, artistic, hand-painted",
    negativePrompt: "photorealistic, 3d, harsh lines, low quality, deformed, text, watermark",
  },
  {
    id: "comic",
    name: "美式漫画",
    description: "粗描边、网点阴影、强烈分镜张力",
    positivePrompt:
      "american comic book style, bold ink outlines, halftone shading, dynamic composition, dramatic perspective, vivid colors, graphic novel",
    negativePrompt: "photorealistic, soft, low quality, deformed, text, watermark",
  },
];

export function getStyleById(
  id: string | undefined,
  ai: LxStyle[] = [],
  custom: LxStyle[] = [],
): LxStyle | undefined {
  if (!id) return undefined;
  return [...STYLE_PRESETS, ...ai, ...custom].find((s) => s.id === id);
}

/** 景别（中文 → 英文提示词片段） */
export const SHOT_SIZES: { id: string; zh: string; en: string }[] = [
  { id: "特写", zh: "特写", en: "extreme close-up shot" },
  { id: "近景", zh: "近景", en: "close-up shot" },
  { id: "中景", zh: "中景", en: "medium shot" },
  { id: "全景", zh: "全景", en: "full shot, wide angle" },
  { id: "远景", zh: "远景", en: "extreme long shot, establishing shot" },
];

/** 运镜（id → 中文标签 + 视频生成时附加的英文运动提示） */
export const CAMERA_MOVES: { id: string; zh: string; motion: string }[] = [
  { id: "still", zh: "固定", motion: ", static camera, subtle natural motion" },
  { id: "zoom-in", zh: "推近", motion: ", slow push-in" },
  { id: "zoom-out", zh: "拉远", motion: ", slow pull-out" },
  { id: "pan-lr", zh: "横移", motion: ", slow pan left to right" },
  { id: "orbit", zh: "环绕", motion: ", slow orbit around subject" },
  { id: "handheld", zh: "手持", motion: ", handheld camera shake, documentary feel" },
  { id: "follow", zh: "跟拍", motion: ", tracking shot following the subject" },
];

export function cameraMotion(id: string): string {
  return CAMERA_MOVES.find((c) => c.id === id)?.motion || ", subtle natural motion";
}

export function shotSizeEn(zh: string): string {
  return SHOT_SIZES.find((s) => s.id === zh)?.en || "medium shot";
}

/** aspect → 图像 size（沿用 stageGen 验证过的取值） */
export function aspectToImgSize(aspect: LxAspect): string {
  if (aspect === "9:16") return "720*1280";
  if (aspect === "1:1") return "1024*1024";
  return "1280*720";
}

export const ASPECTS: { id: LxAspect; zh: string }[] = [
  { id: "16:9", zh: "横屏 16:9" },
  { id: "9:16", zh: "竖屏 9:16" },
  { id: "1:1", zh: "方形 1:1" },
];
