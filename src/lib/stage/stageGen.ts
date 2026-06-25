/**
 * 片场生成逻辑（v2）—— 出图/出视频/配音
 * 从 StageLegacy.tsx 提取的核心 gen 函数，适配 Series/StageShot 数据模型。
 * Board 工作区和批量生成共用。
 */

import {
  useStudioStore,
  type Series,
  type StageShot,
  type StageElement,
  type Job,
  type JobMedia,
  type GenSlot,
} from "@/lib/store";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { getModel } from "@/lib/bailian/models";

const IMG_T2I_MODEL = "qwen-image-2.0-pro";
const IMG_EDIT_MODEL = "qwen-image-edit";
const VIDEO_I2V_MODEL = "happyhorse-1.1-i2v";
const DEFAULT_TTS_MODEL = "qwen3-tts-flash";

function aspectToImgSize(aspect: string): string {
  if (aspect === "9:16") return "720*1280";
  if (aspect === "1:1") return "1024*1024";
  return "1280*720";
}

/** 拼 prompt：shot.imagePrompt > narration + 元素描述 + 风格 */
export function synthPromptV2(
  shot: StageShot,
  bible: StageElement[],
): string {
  const parts: string[] = [];
  if (shot.imagePrompt?.trim()) parts.push(shot.imagePrompt.trim());
  if (shot.narration?.trim()) parts.push(shot.narration.trim());
  if (shot.dialogue?.length) {
    const dialogue = shot.dialogue.map((d) => d.line).filter(Boolean).join(" ");
    if (dialogue) parts.push(dialogue);
  }

  const characterAnchors: string[] = [];
  const locationAnchors: string[] = [];

  for (const refId of shot.elementRefs) {
    const el = bible.find((e) => e.id === refId);
    if (!el) continue;
    const weight = el.consistencyWeight ? ` consistency weight ${el.consistencyWeight}/100` : "";
    if (el.kind === "character") {
      characterAnchors.push(`${el.name}: ${[el.description, el.actingBaseline].filter(Boolean).join(", ")}${weight}`);
    } else if (el.kind === "location") {
      locationAnchors.push(`${el.name}: ${el.description || "keep the same spatial layout, color palette and lighting"}${weight}`);
    } else if (el.description) {
      parts.push(`${el.name}: ${el.description}`);
    }
  }

  if (characterAnchors.length) {
    parts.push(`Character identity anchors: ${characterAnchors.join(" | ")}. Preserve each referenced character's face, hairstyle, outfit, body proportion and role identity across shots. Do not merge characters.`);
  }
  if (locationAnchors.length) {
    parts.push(`Location continuity anchors: ${locationAnchors.join(" | ")}. Preserve recognisable set layout, props, lighting direction and color continuity.`);
  }

  const style = bible.find((e) => e.kind === "style");
  if (style?.description) parts.push(style.description);

  return parts.join(". ") || "";
}

/** 收集参考图：elementRefs 对应元素的 refImages + 风格 ref */
export function collectRefImagesV2(
  shot: StageShot,
  bible: StageElement[],
): string[] {
  const primary: string[] = [];
  const secondary: string[] = [];

  for (const refId of shot.elementRefs) {
    const el = bible.find((e) => e.id === refId);
    if (!el) continue;
    const refs = el.refImages.filter((ri) => ri.url);
    const front = refs.find((ri) => ri.angle === "front") ?? refs[0];
    if (front?.url) primary.push(front.url);
    for (const ri of refs) {
      if (ri !== front) secondary.push(ri.url);
    }
  }

  const style = bible.find((e) => e.kind === "style");
  if (style) {
    for (const ri of style.refImages) {
      if (ri.url) secondary.push(ri.url);
    }
  }

  return [...primary, ...secondary];
}

function collectCharacterRefMediaV2(
  shot: StageShot,
  bible: StageElement[],
): { url: string; name: string }[] {
  const refs: { url: string; name: string }[] = [];
  let n = 1;
  for (const refId of shot.elementRefs) {
    const el = bible.find((e) => e.id === refId);
    if (!el || el.kind !== "character") continue;
    const ri = el.refImages.find((r) => r.angle === "front" && r.url) ?? el.refImages.find((r) => r.url);
    if (!ri?.url) continue;
    refs.push({ url: ri.url, name: `character${n}.png` });
    n += 1;
  }
  return refs.slice(0, 9);
}

function characterAliasPrompt(shot: StageShot, bible: StageElement[]): string {
  let n = 1;
  const parts: string[] = [];
  for (const refId of shot.elementRefs) {
    const el = bible.find((e) => e.id === refId);
    if (!el || el.kind !== "character" || !el.refImages.some((r) => r.url)) continue;
    parts.push(`character${n} is ${el.name}`);
    n += 1;
  }
  return parts.join(", ");
}

export function shotImageUrl(shot: StageShot, jobById: Map<string, Job>): string | undefined {
  if (!shot.imageJobId) return undefined;
  const j = jobById.get(shot.imageJobId);
  return mediaDisplayUrl(j?.media?.img_url) || mediaDisplayUrl(j?.media?.ref_images?.[0]);
}

export function shotImageSubmitUrl(shot: StageShot, jobById: Map<string, Job>): string | undefined {
  if (!shot.imageJobId) return undefined;
  const j = jobById.get(shot.imageJobId);
  return j?.media?.img_url?.url || j?.media?.ref_images?.[0]?.url;
}

export function shotVideoUrl(shot: StageShot, jobById: Map<string, Job>): string | undefined {
  if (!shot.videoJobId) return undefined;
  return jobById.get(shot.videoJobId)?.videoUrl;
}

export function shotVoiceUrl(shot: StageShot): string | undefined {
  if (shot.voiceJobId?.startsWith("/api/")) return shot.voiceJobId;
  return undefined;
}

function mediaDisplayUrl(media: JobMedia | undefined): string | undefined {
  return media?.previewUrl || media?.localPath || media?.thumbDataUrl || media?.url;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/** 出静帧 */
export async function genShotImage(
  shot: StageShot,
  series: Series,
  epId: string,
  sceneId: string,
  config?: GenSlot,
): Promise<void> {
  const prompt = synthPromptV2(shot, series.bible);
  if (!prompt) throw new Error("请先填旁白或画面提示");

  const refImages = collectRefImagesV2(shot, series.bible);
  const hasRef = refImages.length > 0;
  const modelId = config?.modelId ?? (hasRef ? IMG_EDIT_MODEL : IMG_T2I_MODEL);
  const size = aspectToImgSize(series.aspect);

  const refs = uniqueUrls(refImages).slice(0, 8).map((url, i) => ({
    url,
    name: `ref-${i}.png`,
  }));

  const res = await submitJobRequest({
    modelId,
    params: { size, n: 1, prompt_extend: true, watermark: false, ...config?.params },
    media: hasRef ? { ref_images: refs } : {},
    prompt,
  });

  const url = res.imageUrls?.[0];
  if (url) {
    const store = useStudioStore.getState();
    const jobId = store.createJobFromPayload({
      modelId,
      mode: hasRef ? "i2i" : "t2i",
      params: { size, n: 1 },
      media: { img_url: { url, name: `shot-${shot.idx}.png` } },
      prompt,
      title: `[Stage] #${shot.idx}${hasRef ? " (ref)" : ""}`,
    });
    store.setJobStatus(jobId, { status: "done", completedAt: Date.now() });
    store.seriesUpdateShot(epId, sceneId, shot.id, { imageJobId: jobId });
  }
}

/** 立绘/场景图的完整提示词拼装(UI 预览与生成共用同一来源) */
export function buildElementPrompt(element: StageElement, series: Series): string {
  const styleHint = series.bible.filter((e) => e.kind === "style").map((s) => s.description).filter(Boolean).join("，");
  const kindHint = element.kind === "character" ? "角色立绘，半身，清晰面部，纯色背景" : "场景概念图，电影质感氛围，无人物";
  const styleLabel = series.kind === "comic" ? "漫画插画风格" : "写实电影质感";
  return [element.name, element.description, styleHint, kindHint, styleLabel].filter(Boolean).join("，");
}

/** 角色立绘 / 场景概念图 —— 文生图，写入 element.refImages（复用 genShotImage 机制） */
export async function genElementImage(element: StageElement, series: Series, config?: GenSlot, promptOverride?: string): Promise<void> {
  const prompt = promptOverride?.trim() || buildElementPrompt(element, series);
  if (!prompt.trim()) throw new Error("请先填角色 / 场景的名称或描述");
  const size = aspectToImgSize(series.aspect);
  const portraitModelId = config?.modelId ?? IMG_T2I_MODEL;
  const res = await submitJobRequest({
    modelId: portraitModelId,
    params: { size, n: 1, prompt_extend: true, watermark: false, ...config?.params },
    media: {},
    prompt,
  });
  const url = res.imageUrls?.[0];
  if (url) {
    const store = useStudioStore.getState();
    const freshElement = store.series.bible.find((el) => el.id === element.id);
    const currentRefs = freshElement?.refImages ?? element.refImages;
    const jobId = store.createJobFromPayload({
      modelId: portraitModelId,
      mode: "t2i",
      params: { size, n: 1 },
      media: { img_url: { url, name: `${element.kind}-${element.name}.png` } },
      prompt,
      title: `[Stage] ${element.kind === "character" ? "角色" : "场景"}·${element.name}`,
    });
    store.setJobStatus(jobId, { status: "done", completedAt: Date.now() });
    store.seriesUpdateElement(element.id, { refImages: [...currentRefs, { url, angle: "front" }] });
  }
}

/** 配音 */
export async function genShotVoice(
  shot: StageShot,
  series: Series,
  epId: string,
  sceneId: string,
  config?: GenSlot,
): Promise<void> {
  const text = shot.narration?.trim() || shot.dialogue?.[0]?.line?.trim();
  if (!text) throw new Error("请先写旁白或对白");

  const speakerId = shot.dialogue?.[0]?.speakerId;
  const character = speakerId ? series.bible.find((e) => e.id === speakerId) : undefined;
  // 默认音色必须是 Qwen3 系(芊悦)—— qwen3-tts-flash 不接受 cosyvoice 系音色(如 longxiaochun),DashScope 会拒绝
  const voice = (config?.params?.voice as string) || character?.voiceId || "Cherry";
  const sampleAudioUrl = character?.customVoiceUrl || undefined;

  const res = await fetch("/api/bailian/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice,
      model: config?.modelId ?? (sampleAudioUrl ? undefined : DEFAULT_TTS_MODEL),
      languageType: "Auto",
      sampleAudioUrl,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "TTS failed");

  const audioUrl: string = j.audioUrl;
  const store = useStudioStore.getState();

  const audio = new Audio(audioUrl);
  audio.addEventListener("loadedmetadata", () => {
    const dur = Number.isFinite(audio.duration) ? audio.duration + 0.5 : 4;
    store.seriesUpdateShot(epId, sceneId, shot.id, {
      voiceJobId: audioUrl,
      durationSec: Math.max(2, Math.min(20, dur)),
    });
  });
  store.seriesUpdateShot(epId, sceneId, shot.id, { voiceJobId: audioUrl });
}

/** 静帧 → i2v */
export async function genShotVideo(
  shot: StageShot,
  series: Series,
  epId: string,
  sceneId: string,
  imageUrl: string,
  config?: GenSlot,
): Promise<void> {
  const motionHint =
    shot.shotType === "zoom-in" ? ", slow push-in" :
    shot.shotType === "zoom-out" ? ", slow pull-out" :
    shot.shotType === "pan-lr" ? ", slow pan left to right" :
    shot.shotType === "parallax" ? ", subtle parallax motion" :
    ", subtle natural motion";

  const videoPrompt = (shot.narration || synthPromptV2(shot, series.bible)) + motionHint;
  const aspectRatio = series.aspect === "9:16" ? "9:16" : series.aspect === "1:1" ? "1:1" : "16:9";
  const duration = Math.max(5, Math.min(10, Math.round(shot.durationSec)));

  const requestedModelId = config?.modelId;
  const requestedSpec = requestedModelId ? getModel(requestedModelId) : undefined;
  const characterRefs = collectCharacterRefMediaV2(shot, series.bible);
  const useR2V = requestedSpec?.mode === "r2v" && characterRefs.length > 0;
  const videoModelId = useR2V ? requestedModelId! : requestedSpec?.mode === "r2v" ? VIDEO_I2V_MODEL : (requestedModelId ?? VIDEO_I2V_MODEL);
  const spec = getModel(videoModelId);
  const params: Record<string, unknown> = { ...(spec?.defaults ?? {}), ...config?.params };
  const hasField = (key: string) => spec?.fields.some((f) => f.key === key);
  if (hasField("ratio")) params.ratio = config?.params?.ratio ?? aspectRatio;
  if (hasField("size")) params.size = config?.params?.size ?? aspectToImgSize(series.aspect);
  if (hasField("resolution")) params.resolution = config?.params?.resolution ?? params.resolution ?? "720P";
  if (hasField("duration")) params.duration = config?.params?.duration ?? duration;
  params.watermark = params.watermark ?? false;
  const finalDuration = Math.max(3, Math.min(15, Number(params.duration) || duration));
  const alias = useR2V ? characterAliasPrompt(shot, series.bible) : "";
  const prompt = [alias, videoPrompt].filter(Boolean).join(". ");
  const media = useR2V
    ? { reference_urls: characterRefs }
    : { img_url: { url: imageUrl, name: `shot-${shot.idx}.png` } };
  const res = await submitJobRequest({
    modelId: videoModelId,
    params,
    media,
    prompt,
  });

  if (res.taskId) {
    const store = useStudioStore.getState();
    const jobId = store.createJobFromPayload({
      modelId: videoModelId,
      mode: useR2V ? "r2v" : "i2v",
      params,
      media,
      prompt,
      title: `[Stage] #${shot.idx} → video`,
    });
    store.setJobStatus(jobId, { status: "running", taskId: res.taskId });
    store.seriesUpdateShot(epId, sceneId, shot.id, { videoJobId: jobId, durationSec: finalDuration });
  }
}
