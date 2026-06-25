/**
 * LumenX 精选模型清单 —— 适合短剧/动态漫的图像 / 视频模型子集。
 *
 * 字段对齐 src/lib/bailian/models.ts 中的真实 ModelSpec，但只暴露 LumenX UI 真正会用到的几个旋钮：
 * 图像：size / n / prompt_extend / watermark
 * 视频：resolution / ratio / duration / prompt_extend / watermark
 *
 * 使用方：
 *  - ChatPanel.GenConfig 据此渲染下拉选择。
 *  - lumenx/store 持久化用户选择到 LxProject.imageModel / videoModel / imageParams / videoParams。
 *  - lumenx/gen 在调用 /api/bailian/submit 时把 modelId + params 透传给 submitJobRequest。
 */

export interface LxImageModel {
  id: string;
  name: string;
  type: "t2i" | "i2i";
  /** 真实可选画面尺寸（与 models.ts 对齐，避免后端拒绝）。 */
  sizes: string[];
  /** 单次最多出图张数。 */
  maxCount?: number;
  /** i2i 最多接受多少张参考图。 */
  maxRefImages?: number;
  /** 默认参数。size 缺省时 LumenX 会根据 aspect 自动派生。 */
  defaultParams: Record<string, unknown>;
  /** 期望耗时（秒），用于 UI 提示。 */
  etaSec: number;
}

export interface LxVideoModel {
  id: string;
  name: string;
  type: "t2v" | "i2v" | "r2v";
  resolutions: string[];
  /** 画幅比例可选项（部分模型固定按 aspect 推 size）。 */
  ratios?: string[];
  /** 时长允许区间（秒）。 */
  durationRange: [number, number];
  /** r2v 最多接受多少张面部参考。 */
  maxRefImages?: number;
  defaultParams: Record<string, unknown>;
  etaSec: number;
}

export const LX_IMAGE_MODELS: LxImageModel[] = [
  {
    id: "qwen-image-2.0-pro",
    name: "千问图像 Pro",
    type: "t2i",
    sizes: ["1024*1024", "1280*720", "720*1280", "1664*928"],
    maxCount: 4,
    defaultParams: { size: "1024*1024", n: 1, prompt_extend: true, watermark: false },
    etaSec: 15,
  },
  {
    id: "wan2.7-image-pro",
    name: "万相 2.7 Pro",
    type: "t2i",
    sizes: ["1024*1024", "1280*720", "720*1280", "1664*928", "2048*2048"],
    maxCount: 4,
    defaultParams: { size: "1024*1024", n: 1, prompt_extend: true, watermark: false },
    etaSec: 20,
  },
  {
    id: "z-image-turbo",
    name: "Z-Image 极速",
    type: "t2i",
    sizes: ["1024*1024", "1280*720", "720*1280"],
    maxCount: 4,
    defaultParams: { size: "1024*1024", n: 1, prompt_extend: true, watermark: false },
    etaSec: 5,
  },
  {
    id: "qwen-image-edit",
    name: "千问图像编辑",
    type: "i2i",
    sizes: ["1024*1024", "1280*720", "720*1280", "1664*928"],
    maxRefImages: 3,
    defaultParams: { size: "1024*1024", prompt_extend: true, watermark: false },
    etaSec: 15,
  },
  {
    id: "wan2.7-image-pro-edit",
    name: "万相 2.7 编辑",
    type: "i2i",
    sizes: ["1024*1024", "1280*720", "720*1280", "1664*928"],
    maxRefImages: 3,
    defaultParams: { size: "1024*1024", prompt_extend: true, watermark: false },
    etaSec: 20,
  },
];

export const LX_VIDEO_MODELS: LxVideoModel[] = [
  {
    id: "happyhorse-1.1-i2v",
    name: "快乐马 1.1 图生视频",
    type: "i2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [5, 10],
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 8, watermark: false, prompt_extend: true },
    etaSec: 180,
  },
  {
    id: "happyhorse-1.1-r2v",
    name: "快乐马 1.1 多角色",
    type: "r2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [5, 10],
    maxRefImages: 9,
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 8, watermark: false, prompt_extend: true },
    etaSec: 180,
  },
  {
    id: "happyhorse-1.0-i2v",
    name: "快乐马 1.0 图生视频",
    type: "i2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [5, 10],
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 8, watermark: false, prompt_extend: true },
    etaSec: 180,
  },
  {
    id: "happyhorse-1.0-r2v",
    name: "快乐马 1.0 多角色",
    type: "r2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [5, 10],
    maxRefImages: 9,
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 8, watermark: false, prompt_extend: true },
    etaSec: 180,
  },
  {
    id: "wan2.7-i2v",
    name: "万相 2.7 图生视频",
    type: "i2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [3, 10],
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 5, watermark: false, prompt_extend: true },
    etaSec: 200,
  },
  {
    id: "happyhorse-1.1-t2v",
    name: "快乐马 1.1 文生视频",
    type: "t2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [5, 10],
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 8, watermark: false, prompt_extend: true },
    etaSec: 180,
  },
  {
    id: "happyhorse-1.0-t2v",
    name: "快乐马 1.0 文生视频",
    type: "t2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [5, 10],
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 8, watermark: false, prompt_extend: true },
    etaSec: 180,
  },
  {
    id: "wan2.7-t2v",
    name: "万相 2.7 文生视频",
    type: "t2v",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1"],
    durationRange: [3, 15],
    defaultParams: { resolution: "720P", ratio: "16:9", duration: 5, watermark: false, prompt_extend: true },
    etaSec: 200,
  },
];

export const DEFAULT_IMAGE_MODEL = "qwen-image-2.0-pro";
export const DEFAULT_VIDEO_MODEL = "happyhorse-1.1-i2v";

export function findImageModel(id?: string): LxImageModel | undefined {
  if (!id) return undefined;
  return LX_IMAGE_MODELS.find((m) => m.id === id);
}

export function findVideoModel(id?: string): LxVideoModel | undefined {
  if (!id) return undefined;
  return LX_VIDEO_MODELS.find((m) => m.id === id);
}
