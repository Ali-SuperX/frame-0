/**
 * LumenX 生成层 —— 全部接 frame-0 现有百炼后端，结果落入共享 useStudioStore.jobs（资产库）。
 *  - 图片：同步返回 imageUrls（qwen-image-2.0-pro / qwen-image-edit）
 *  - 视频：异步返回 taskId，由调用方挂载的 useJobPolling 推进状态
 *  - 配音：/api/bailian/tts 同步返回 audioUrl
 * 模型 id / 参数取值对齐 src/lib/stage/stageGen.ts（生产已验证）。
 */

import { useStudioStore, type AssetCategory } from "@/lib/store";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { TTS_VOICES, DEFAULT_TTS_MODEL } from "@/lib/r2v/ttsVoices";
import type { LxAspect, GenerationMeta } from "./types";
import { aspectToImgSize } from "./presets";
import { findImageModel, findVideoModel } from "./lxModels";

const IMG_T2I_MODEL = "qwen-image-2.0-pro";
const IMG_EDIT_MODEL = "qwen-image-edit";
const VIDEO_I2V_MODEL = "happyhorse-1.1-i2v";
const VIDEO_R2V_MODEL = "happyhorse-1.1-r2v";
const VIDEO_T2V_MODEL = "happyhorse-1.1-t2v";

/** qwen3-tts-flash 只接受 qwen3 系音色，cosyvoice 系会被 DashScope 拒绝。 */
export function pickQwen3Voice(gender?: "male" | "female", tone?: string): string {
  const pool = TTS_VOICES.filter(
    (v) => v.group === "qwen3" && (!gender || v.gender === gender),
  ).sort((a, b) => b.weight - a.weight);
  if (!pool.length) return "Cherry";
  const t = (tone || "").trim();
  if (t) {
    let best = pool[0];
    let bestScore = 0;
    for (const v of pool) {
      const hay = `${v.bestFor} ${v.desc} ${v.zh}`;
      let score = 0;
      for (const ch of t) if (hay.includes(ch)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best.id;
  }
  return pool[0].id;
}

export type GenImageResult = { jobId: string; imageUrl: string; meta: GenerationMeta };

/**
 * 生成一张图（角色/场景/道具/分镜帧通用）。
 * 有参考图 → 图生图（qwen-image-edit），否则文生图（qwen-image-2.0-pro）。
 */
export async function genImage(opts: {
  prompt: string;
  aspect: LxAspect;
  refImages?: string[];
  negativePrompt?: string;
  title: string;
  category: AssetCategory;
  tags?: string[];
  /** 可选：覆盖模型 id。不传时按是否有参考图选默认 t2i / i2i。 */
  modelId?: string;
  /** 可选：覆盖参数（如 size / n / prompt_extend / watermark）。 */
  params?: Record<string, unknown>;
}): Promise<GenImageResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("缺少画面提示词");

  const refs = (opts.refImages || []).filter(Boolean).slice(0, 3);
  const hasRef = refs.length > 0;
  // 优先用调用方指定的模型，否则按是否有参考图选 t2i / i2i。
  // 调用方传了 i2i 模型却没参考图 → 在用户设置上是合法的（后端会报错），这里不增加额外判断。
  const modelId = opts.modelId || (hasRef ? IMG_EDIT_MODEL : IMG_T2I_MODEL);
  const sizeFromAspect = aspectToImgSize(opts.aspect);
  const baseParams: Record<string, unknown> = {
    size: sizeFromAspect,
    n: 1,
    prompt_extend: true,
    watermark: false,
  };
  // 可选模型默认参数 → 调用方覆盖。调用方未选 size 时 fallback 到 aspect 推导。
  const lxModel = findImageModel(modelId);
  const params: Record<string, unknown> = {
    ...baseParams,
    ...(lxModel?.defaultParams ?? {}),
    ...(opts.params ?? {}),
  };
  // 覆盖参数里的 size 不在模型 sizes 里 → 退回默认，避免后端拒接。
  if (lxModel && typeof params.size === "string" && !lxModel.sizes.includes(params.size as string)) {
    params.size = lxModel.sizes[0] ?? sizeFromAspect;
  }

  const res = await submitJobRequest({
    modelId,
    params,
    media: hasRef
      ? { ref_images: refs.map((url, i) => ({ url, name: `ref-${i}.png` })) }
      : {},
    prompt,
    negativePrompt: opts.negativePrompt,
  });

  const url = res.imageUrls?.[0];
  if (!url) throw new Error("出图失败：未返回图片");

  const store = useStudioStore.getState();
  const jobId = store.createJobFromPayload({
    modelId,
    mode: hasRef ? "i2i" : "t2i",
    params: { size: params.size as string, n: (params.n as number) ?? 1 },
    media: { img_url: { url, name: `${opts.title}.png` } },
    prompt,
    negativePrompt: opts.negativePrompt,
    title: `[LumenX] ${opts.title}`,
  });
  store.setJobStatus(jobId, { status: "done", completedAt: Date.now() });
  store.setJobCategory(jobId, opts.category);
  if (opts.tags?.length) store.setJobTags(jobId, opts.tags);

  const meta: GenerationMeta = {
    prompt,
    modelId,
    params: { ...params },
    refImages: hasRef ? refs : undefined,
    negativePrompt: opts.negativePrompt,
    kind: "image",
    createdAt: Date.now(),
  };

  return { jobId, imageUrl: url, meta };
}

export type GenVideoResult = { jobId: string; taskId: string; meta: GenerationMeta };

/**
 * 静帧 → 视频（i2v）；若给了多张角色参考图且无首帧，则走 r2v（面部锁定）。
 * 异步：返回 taskId，由 useJobPolling 把 job 推到 done 并填 videoUrl。
 */
export async function genVideo(opts: {
  prompt: string;
  aspect: LxAspect;
  imageUrl?: string;
  refImages?: string[];
  duration: number;
  title: string;
  tags?: string[];
  /** 可选：覆盖模型 id。不传时按是否有首帧/参考图选 i2v / r2v。 */
  modelId?: string;
  /** 可选：覆盖参数（如 resolution / ratio / duration / prompt_extend / watermark）。 */
  params?: Record<string, unknown>;
}): Promise<GenVideoResult> {
  // 选择模型与 mode
  let modelId: string;
  let mode: "t2v" | "i2v" | "r2v";
  if (opts.modelId) {
    modelId = opts.modelId;
    const lxModel = findVideoModel(modelId);
    mode =
      lxModel?.type ??
      (opts.imageUrl ? "i2v" : (opts.refImages?.length ?? 0) > 0 ? "r2v" : "t2v");
  } else {
    if (opts.imageUrl) {
      modelId = VIDEO_I2V_MODEL;
      mode = "i2v";
    } else if ((opts.refImages?.length || 0) > 0) {
      modelId = VIDEO_R2V_MODEL;
      mode = "r2v";
    } else {
      modelId = VIDEO_T2V_MODEL;
      mode = "t2v";
    }
  }

  // 根据 mode 构造媒体负载。t2v 不需媒体；i2v 需首帧；r2v 取参考图。
  let media: Parameters<typeof submitJobRequest>[0]["media"];
  if (mode === "t2v") {
    media = {};
  } else if (mode === "r2v") {
    const refs = (opts.refImages || []).slice(0, 9);
    if (!refs.length) throw new Error(`多角色视频需要至少一张参考图：${modelId}`);
    media = { reference_urls: refs.map((url, i) => ({ url, name: `char-${i}.png` })) };
  } else {
    if (!opts.imageUrl) throw new Error(`图生视频需要首帧图：${modelId}`);
    media = { img_url: { url: opts.imageUrl, name: `${opts.title}.png` } };
  }

  // 按模型的 durationRange clamp；UI 项覆盖后仍以调用方最后传入的 opts.duration 为主。
  const lxVideo = findVideoModel(modelId);
  const [dMin, dMax] = lxVideo?.durationRange ?? [5, 10];
  const duration = Math.max(dMin, Math.min(dMax, Math.round(opts.duration || dMin)));

  const baseParams: Record<string, unknown> = {
    resolution: "720P",
    ratio: opts.aspect,
    duration,
    prompt_extend: true,
    watermark: false,
  };
  const params: Record<string, unknown> = {
    ...baseParams,
    ...(lxVideo?.defaultParams ?? {}),
    ...(opts.params ?? {}),
    // duration 以上下文 (clamp 后的 opts.duration) 为准，避免被 UI 默认覆盖为初始值。
    duration,
    // ratio 默认跟随项目 aspect；若 UI params 明确推了 ratio 则以 UI 为准。
    ratio: (opts.params?.ratio as string) ?? opts.aspect,
  };

  const res = await submitJobRequest({ modelId, params, media, prompt: opts.prompt });
  if (!res.taskId) throw new Error("视频任务提交失败：未返回 taskId");

  const store = useStudioStore.getState();
  const jobId = store.createJobFromPayload({
    modelId,
    mode,
    params,
    media,
    prompt: opts.prompt,
    title: `[LumenX] ${opts.title} → 视频`,
  });
  store.setJobStatus(jobId, { status: "running", taskId: res.taskId });
  store.setJobCategory(jobId, "output");
  if (opts.tags?.length) store.setJobTags(jobId, opts.tags);

  const meta: GenerationMeta = {
    prompt: opts.prompt,
    modelId,
    params: { ...params },
    refImages: mode === "r2v" ? (opts.refImages || []).slice(0, 9) : undefined,
    kind: "video",
    createdAt: Date.now(),
  };

  return { jobId, taskId: res.taskId, meta };
}

export type GenVoiceResult = { audioUrl: string; durationSec: number };

/** 文本 → 配音。同步返回 audioUrl，并读取音频时长。 */
export async function genVoice(opts: {
  text: string;
  voice: string;
  sampleAudioUrl?: string;
}): Promise<GenVoiceResult> {
  const text = opts.text.trim();
  if (!text) throw new Error("缺少配音文本");

  const res = await fetch("/api/bailian/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: opts.voice || "Cherry",
      model: opts.sampleAudioUrl ? undefined : DEFAULT_TTS_MODEL,
      languageType: "Auto",
      sampleAudioUrl: opts.sampleAudioUrl,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "配音失败");

  const audioUrl: string = j.audioUrl;
  const durationSec = await audioDuration(audioUrl).catch(() => 4);

  // 也登记到资产库（音频分类）
  try {
    const store = useStudioStore.getState();
    const jobId = store.createJobFromPayload({
      modelId: DEFAULT_TTS_MODEL,
      mode: "t2i", // 占位：Job.mode 无 tts 类型，资产库按 category=audio 筛选
      params: { voice: opts.voice },
      media: { audio_url: { url: audioUrl, name: "voice.mp3" } },
      prompt: text,
      title: `[LumenX] 配音`,
    });
    store.setJobStatus(jobId, { status: "done", completedAt: Date.now(), videoUrl: audioUrl });
    store.setJobCategory(jobId, "audio");
  } catch {
    /* 登记失败不影响主流程 */
  }

  return { audioUrl, durationSec: Math.max(2, Math.min(20, durationSec)) };
}

function audioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration + 0.4 : 4);
    });
    audio.addEventListener("error", () => reject(new Error("audio load error")));
  });
}

/** 上传用户本地图片/音频到 OSS + 本地缓存。返回可直接喂给生成的 url。 */
export async function uploadMedia(file: File): Promise<{ ossUrl: string; localPath: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/bailian/upload", { method: "POST", body: fd });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "上传失败");
  return { ossUrl: j.ossUrl, localPath: j.localPath };
}
