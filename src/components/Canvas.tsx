"use client";

/**
 * Canvas —— 工坊的「画布形态」(参考 flowith 等节点画布)。
 *
 * 无限画布上每个节点 = 一次生成：compose(写 prompt+选模型) → 生成 → 成片，
 * 再从成片分支(动画/编辑/变体)长出子节点，用连线显示创作血缘。
 * 与线性工坊共享同一份 jobs(主 store)，图布局存 canvasStore。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useStudioStore,
  DEFAULT_TRACKS,
  type Job,
  type JobMedia,
  type AssetCategory,
  type Draft,
  type SavedPrompt,
  type StageElement,
  type StageShot,
  type EditorProject,
  type EditorClip,
  type EditorAspect,
} from "@/lib/store";
import {
  getModel,
  defaultModelForMode,
  isImageMode,
  modelsByMode,
} from "@/lib/bailian/models";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { uploadMediaFile, uploadDataUrlAsMedia } from "./studio/uploadMedia";
import { useJobPolling } from "@/lib/bailian/useJobPolling";
import { useLocalJobRehydration } from "@/lib/bailian/useLocalJobRehydration";
import { useCanvasStore, type CanvasNode, type CanvasNodeKind, type CanvasGroup } from "@/lib/canvasStore";
import { orchestrateGraph, orchestrateScript, orchestrateNextEpisode, orchestrateShots, orchestrateAssets, rewriteScript, rewriteShotImagePrompt, setOrchestratorSignal, layoutByDepth, type OrchMode } from "@/lib/canvas/orchestrate";
import { streamChat, collectChatMessages } from "@/lib/canvas/chat";
import CanvasComposer, { type ComposerApi, type ComposerMode } from "./canvas/CanvasComposer";
import DramaDock, { type DockStage, type EditExportCfg } from "./canvas/DramaDock";
import { prepareDirectorFromJob } from "@/lib/r2v/sendToDirector";
import { extractKeyFrames } from "@/lib/r2v/videoUtils";
import { fmtClock } from "./studio/helpers";
import { pickVoiceByPersona, listVoices } from "@/lib/r2v/ttsVoices";
import type { Starter } from "@/lib/bailian/starters";
import { normalizeLocalUploadPath } from "@/lib/mediaPaths";
import LocaleSwitcher from "./LocaleSwitcher";
import SettingsModal from "./studio/SettingsModal";
import AssetPicker from "./studio/AssetPicker";
import "@/styles/frame.css";
import "@/styles/studio-composer.css"; // .cmp-* 基础控件（模型/参数/折扣…）
import "@/styles/omni-composer.css"; // 复用 .pf-/.mp-c- 参数与媒体控件样式
import "@/styles/canvas.css";

// 编排 LLM 清单(剧本/分镜/角色提取共用) —— 坞瘦身后由对话框「阶段操作区」承载
const ORCH_LLMS = [
  { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
  { id: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
  { id: "qwen3.6-plus", name: "Qwen 3.6 Plus" },
  { id: "qwen3.6-max", name: "Qwen 3.6 Max" },
  { id: "qwen-max", name: "Qwen Max" },
  { id: "qwen-plus", name: "Qwen Plus" },
  { id: "qwen-turbo", name: "Qwen Turbo" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
];

const PromptLibrary = dynamic(() => import("./studio/PromptLibrary"), { ssr: false });

const NODE_W = 264; // 基准节点宽度(世界坐标)，落点/居中用

function canvasMediaDisplaySrc(media: JobMedia | undefined): string | undefined {
  if (!media) return undefined;
  const localPath = normalizeLocalUploadPath(media.localPath);
  if (localPath && /^(https?:|\/)/.test(localPath)) return localPath;
  const preview =
    media.previewUrl && media.previewUrl.startsWith("blob:")
      ? media.previewUrl
      : undefined;
  if (preview) return preview;
  const thumb =
    media.thumbDataUrl && /^(data:|https?:)/.test(media.thumbDataUrl)
      ? media.thumbDataUrl
      : undefined;
  if (thumb) return thumb;
  const url = normalizeLocalUploadPath(media.url);
  if (url && /^(https?:|data:|\/)/.test(url)) return url;
  return undefined;
}

function canvasJobImageDisplaySrc(job: Job | undefined): string | undefined {
  if (!job) return undefined;
  const direct = normalizeLocalUploadPath(job.videoUrl);
  if (direct && /^(https?:|data:|\/|blob:)/.test(direct)) return direct;
  return canvasMediaDisplaySrc(job.media?.img_url);
}

function canvasJobImageMedia(job: Job | undefined, name: string): JobMedia | undefined {
  if (!job || job.status !== "done") return undefined;
  const media = job.media?.img_url;
  const url = media?.url || job.videoUrl;
  if (!url) return undefined;
  return {
    ...media,
    url,
    name: media?.name || name,
    mime: media?.mime || job.localMime,
    localKey: media?.localKey || job.localKey,
    localPath: media?.localPath || (job.videoUrl?.startsWith("/api/") ? job.videoUrl : undefined),
  };
}

/** 各类节点的卡片宽度 —— 输入/对话略宽，回答最宽（读字），与 CSS 对齐。 */
function nodeWidth(n: CanvasNode): number {
  if (n.w && n.w >= 220) return n.w; // 手动 resize 优先
  const k = n.kind ?? "generate";
  if (k === "answer") return 340;
  if (k === "chat") return 300;
  if (k === "generate") return n.jobId ? 280 : 300;
  return NODE_W;
}
/** 短剧阶段聚焦：当前阶段对应的节点亮、其余淡化。script→剧本note，assets→资产，其余(分镜/出图/视频/配音/成片)→分镜generate */
function stageDimsNode(stage: DockStage | null, n: CanvasNode): boolean {
  if (!stage) return false;
  const k = n.kind ?? "generate";
  if (stage === "script") return k !== "note";
  if (stage === "assets") return k !== "character" && k !== "scene" && k !== "prop";
  return k !== "generate";
}
const RSZ_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
/** 8 方向缩放把手(四边细条 + 四角小块),hover 显现 */
function ResizeHandles({ onResizeStart, zh }: { onResizeStart: (e: React.PointerEvent, dir: string) => void; zh: boolean }) {
  return (
    <>
      {RSZ_DIRS.map((d) => (
        <div key={d} className={`cv-rsz cv-rsz-${d}`} onPointerDown={(e) => onResizeStart(e, d)} title={zh ? "拖拽改大小" : "Resize"} aria-hidden />
      ))}
    </>
  );
}
/** 可新建的节点类型（万物皆节点）。 */
const NODE_KIND_DEFS: { kind: CanvasNodeKind; icon: string; zh: string; en: string }[] = [
  { kind: "chat", icon: "💬", zh: "对话", en: "Chat" },
  { kind: "generate", icon: "🎞", zh: "生成", en: "Generate" },
  { kind: "note", icon: "💡", zh: "创意/剧本", en: "Note" },
  { kind: "character", icon: "👤", zh: "角色", en: "Character" },
  { kind: "scene", icon: "🏞", zh: "场景", en: "Scene" },
  { kind: "prop", icon: "📦", zh: "道具", en: "Prop" },
];
/** 空态「开始」首屏的题材快捷 —— 点一下直接编排整部短剧（零输入冷启动）。 */
const EMPTY_GENRES: { id: string; emoji: string; zh: string; en: string; seed: string; seedEn: string; shots: number }[] = [
  { id: "suspense", emoji: "🔍", zh: "悬疑", en: "Suspense", seed: "雨夜便利店，女店员发现监控里有诡异身影，追踪真相", seedEn: "A clerk spots a ghostly figure on CCTV at a rainy-night store", shots: 12 },
  { id: "romance", emoji: "💕", zh: "甜宠", en: "Romance", seed: "咖啡馆偶遇，高冷总裁为女主挡雨，日久生情", seedEn: "A cold CEO shields the heroine from rain after a café meet-cute", shots: 12 },
  { id: "period", emoji: "🏯", zh: "古风", en: "Period", seed: "深宫夜雨，废后联手太子翻盘复位", seedEn: "A deposed empress plots her comeback in the rainy palace", shots: 12 },
  { id: "underdog", emoji: "🔥", zh: "逆袭", en: "Underdog", seed: "落魄外卖员觉醒系统，逆袭成都市传说", seedEn: "A down-and-out courier awakens powers and rises to legend", shots: 12 },
  { id: "urban", emoji: "🌃", zh: "都市", en: "Urban", seed: "职场新人被陷害，逆袭成为最年轻合伙人", seedEn: "A framed newcomer rises to the youngest partner", shots: 12 },
  { id: "comedy", emoji: "😂", zh: "喜剧", en: "Comedy", seed: "社恐程序员被迫当伴郎，闹出一连串笑话", seedEn: "An introverted coder forced to be best man causes chaos", shots: 12 },
];
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.2;
const DEFAULT_SCALE = 0.8; // 默认略缩，主打全局视角（不要一上来就糊脸）

function defaultDraft(modelId?: string): Draft {
  const model = modelId ? getModel(modelId) : defaultModelForMode("t2v");
  const spec = model ?? defaultModelForMode("t2v");
  return {
    mode: spec.mode,
    modelId: spec.id,
    params: { ...(spec.defaults ?? {}) },
    media: {},
    prompt: "",
    negativePrompt: "",
  };
}

/** 镜头类型 → i2v/r2v 运镜后缀（从 node.text 的 [shotType] 提取）。 */
function motionForText(text?: string): string {
  const shotType = text?.match(/\[(.+?)\]/)?.[1] || "";
  const m: Record<string, string> = {
    "zoom-in": ", slow push-in",
    "zoom-out": ", slow pull-out",
    "pan-lr": ", slow pan left to right",
    follow: ", tracking shot following the subject",
    whip: ", fast whip-pan transition",
    handheld: ", handheld shaky camera",
    "low-angle": ", low-angle upward tilt",
    aerial: ", aerial top-down dolly out",
    dutch: ", slow canted dutch-angle tilt",
    hero: ", low-angle heroic camera rise",
    pov: ", first-person POV slight head-bob",
    ots: ", locked over-the-shoulder",
  };
  return m[shotType] || ", subtle natural motion";
}

/** 角色名 → character1/2.. 占位符（确定性替换，比靠 LLM 写 characterN 可靠）。
 *  长名先替，避免子串误伤（"小雨" 先吃掉 "林小雨"）。 */
function replaceCharNames(prompt: string, charMap: Map<string, number>): string {
  let out = prompt;
  const names = [...charMap.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of names) out = out.split(name).join(`character${charMap.get(name)}`);
  return out;
}

/** 取片角标的相对时间。at=0(迁移的老 take)→「较早」。 */
function fmtAgo(at: number, zh: boolean): string {
  if (!at) return zh ? "较早" : "earlier";
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return zh ? "刚刚" : "now";
  if (s < 3600) return zh ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 60)}m`;
  if (s < 86400) return zh ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 3600)}h`;
  return zh ? `${Math.floor(s / 86400)} 天前` : `${Math.floor(s / 86400)}d`;
}

/** 出视频链路决策（不锁死）：沿连线收上游角色立绘 →
 *   有角色图 → happyhorse-1.1-r2v（character1..N 多参考锁脸，跨镜不漂）；
 *   无角色图 → i2v（静帧作首帧保构图，模型可由坞指定）。
 *  imageUrl=该镜静帧；basePrompt=已拼上游描述的画面词；aspect 默认竖屏 9:16。 */
/** 沿连线收集上游 character 节点的已出图立绘（按 charIdx 排序，≤9 张）+
 *  角色名→序号映射（含中文 title 与 anchor 里的英文 name，供 character1..N 替换，修中英不匹配漏替）。
 *  静帧出图(image-edit) 与 出视频(r2v) 共用，锁同一角色跨图一致。 */
function collectUpstreamCharRefs(nodeId: string): { refs: JobMedia[]; charMap: Map<string, number> } {
  const cs = useCanvasStore.getState();
  const liveJobs = useStudioStore.getState().jobs;
  const charNodes = cs.edges
    .filter((e) => e.target === nodeId)
    .map((e) => cs.nodes.find((n) => n.id === e.source))
    .filter((n): n is CanvasNode => !!n && n.kind === "character")
    .sort((a, b) => (a.charIdx ?? 99) - (b.charIdx ?? 99));
  const refs: JobMedia[] = [];
  const charMap = new Map<string, number>();
  for (const cn of charNodes) {
    const jid = cn.jobId || cn.imageJobId;
    const j = jid ? liveJobs.find((x) => x.id === jid) : undefined;
    const media = canvasJobImageMedia(j, `char-${refs.length + 1}.png`);
    if (media && refs.length < 9) {
      refs.push(media);
      if (cn.title?.trim()) charMap.set(cn.title.trim(), refs.length);
      const nameMatch = cn.text?.match(/name:\s*([^,，;；]+)/i);
      if (nameMatch) charMap.set(nameMatch[1].trim(), refs.length);
    }
  }
  return { refs, charMap };
}

/** 沿连线收上游「道具」已出静帧 —— 注入分镜出图，锁道具跨镜一致（同一信物/手机不漂）。 */
function collectUpstreamPropRefs(nodeId: string): JobMedia[] {
  const cs = useCanvasStore.getState();
  const liveJobs = useStudioStore.getState().jobs;
  const propNodes = cs.edges
    .filter((e) => e.target === nodeId)
    .map((e) => cs.nodes.find((n) => n.id === e.source))
    .filter((n): n is CanvasNode => !!n && n.kind === "prop");
  const refs: JobMedia[] = [];
  for (const pn of propNodes) {
    const jid = pn.jobId || pn.imageJobId;
    const j = jid ? liveJobs.find((x) => x.id === jid) : undefined;
    const media = canvasJobImageMedia(j, `prop-${refs.length + 1}.png`);
    if (media && refs.length < 3) refs.push(media);
  }
  return refs;
}

/** 沿连线收上游「场景」已出静帧 —— 注入分镜出图，锁场景跨镜一致（同一咖啡馆/房间不漂）。 */
function collectUpstreamSceneRefs(nodeId: string): JobMedia[] {
  const cs = useCanvasStore.getState();
  const liveJobs = useStudioStore.getState().jobs;
  const sceneNodes = cs.edges
    .filter((e) => e.target === nodeId)
    .map((e) => cs.nodes.find((n) => n.id === e.source))
    .filter((n): n is CanvasNode => !!n && n.kind === "scene");
  const refs: JobMedia[] = [];
  for (const sn of sceneNodes) {
    const jid = sn.jobId || sn.imageJobId;
    const j = jid ? liveJobs.find((x) => x.id === jid) : undefined;
    const media = canvasJobImageMedia(j, `scene-${refs.length + 1}.png`);
    if (media && refs.length < 2) refs.push(media);
  }
  return refs;
}

/** 解析上传的剧本文件为纯文本 —— txt/md 直读、docx 走 mammoth、pdf 走 pdfjs（均在浏览器端）。 */
async function extractScriptText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return out;
  }
  return file.text();
}

/** 把逐秒 segmentPlan 洗成「纯画面」视频 prompt：去时间码 / 〈音效〉 / (台词·旁白) / 标签括号，
 *  只留视觉描述 —— 既降绿网内容审核误拦，也让视频模型拿到干净构图词，不被拍记号/对白干扰。 */
function cleanShotPrompt(seg: string): string {
  return seg
    .replace(/\d+(?:\.\d+)?\s*[-~]\s*\d+(?:\.\d+)?\s*s/g, " ") // 时间码 0-3s / 4-7s
    .replace(/\[@?([^\]]+)\]/g, "$1")                          // [全景]/[@林晚] → 全景/林晚（名字交给 replaceCharNames）
    .replace(/[〈<][^〉>]*[〉>]/g, " ")                          // 〈刻刀沙沙声〉等音效
    .replace(/[（(][^）)]*[）)]/g, " ")                          // (台词 / 旁白 / 参考描述)
    .replace(/[\r\n]+/g, "，")
    .replace(/\s{2,}/g, " ")
    .replace(/[，、](?:\s*[，、])+/g, "，")
    .replace(/^[，、\s]+|[，、\s]+$/g, "")
    .trim();
}

function buildShotVideoJob(
  node: CanvasNode,
  imageUrl: string | undefined,
  duration: number,
  basePrompt: string,
  opts?: { aspect?: "9:16" | "16:9" | "1:1"; i2vModelId?: string; rawPrompt?: string; bridgeFrameUrl?: string },
): { mode: "r2v" | "i2v"; modelId: string; params: Record<string, unknown>; media: Draft["media"]; prompt: string } {
  const aspect = opts?.aspect ?? "9:16";
  const { refs: charRefs, charMap } = collectUpstreamCharRefs(node.id);
  const motionHint = motionForText(node.text);
  const dur = Math.max(3, Math.min(15, Math.round(duration || 5)));
  // 用户在视频阶段显式选了模型 → 尊重其 mode；没选(默认)则有角色参考图自动走 r2v 锁脸
  const chosenRaw = opts?.i2vModelId ? getModel(opts.i2vModelId) : undefined;
  // 首尾帧/视频续写需要分镜给不出的尾帧/现有视频 → 弃用，退回纯 i2v(否则缺输入、生成与配置都错乱)
  const chosen = chosenRaw && !chosenRaw.fields?.some((f) => f.key === "last_frame_url") ? chosenRaw : undefined;
  const useR2v = chosen ? chosen.mode === "r2v" : charRefs.length > 0;
  // 续写衔接(soft)：上一镜视频的实际尾帧 = 图1(本段第一帧)，角色/场景/道具参考整体退后一位，
  //   prompt 声明「以图1为第一帧承接上一镜」。复用工坊 ContinuationChainPanel 的 soft 衔接思路。
  if (opts?.bridgeFrameUrl) {
    const r2vSpec = (chosen?.mode === "r2v" ? chosen : null) ?? getModel("happyhorse-1.1-r2v") ?? defaultModelForMode("r2v");
    const r2vMax = (r2vSpec.fields?.find((f) => f.key === "reference_urls") as { maxCount?: number } | undefined)?.maxCount ?? 5;
    const bridge: JobMedia = { url: opts.bridgeFrameUrl, name: "prev-tail.jpg" };
    const refUrls = [bridge, ...charRefs, ...collectUpstreamSceneRefs(node.id), ...collectUpstreamPropRefs(node.id)].slice(0, r2vMax);
    // 图1 被尾帧占用 → 角色占位整体后移一位(character{idx} → character{idx+1})；截断后只留实际入槽的角色(图1 占了 1 个槽)
    const keptChars = Math.min(charRefs.length, r2vMax - 1);
    const shiftedMap = new Map<string, number>();
    charMap.forEach((idx, name) => { if (idx <= keptChars) shiftedMap.set(name, idx + 1); });
    // rawPrompt(重生成时取上次实发 prompt)可能已带本前缀 → 先剥掉再统一加，保证幂等(否则每次重生成叠一层)。
    //   注：不对 rawPrompt 里的 characterN 做 +1 移位——重复 bridge 重生成时它已是上次移好的值，再移会越叠越错；
    //   仅「关→开→单条重生成」那一次边角可能占位错位(rare)，重新走批量/再勾一次即恢复。
    const PFX = /^以【图1】为本段第一帧[^：]*：/;
    const core = opts?.rawPrompt != null
      ? opts.rawPrompt.replace(PFX, "")
      : (replaceCharNames(cleanShotPrompt(basePrompt), shiftedMap) + motionHint);
    return {
      mode: "r2v",
      modelId: r2vSpec.id,
      params: { ...r2vSpec.defaults, ratio: aspect, duration: dur, watermark: false },
      media: { reference_urls: refUrls },
      prompt: `以【图1】为本段第一帧，自然承接上一镜结尾画面继续演下去：${core}`,
    };
  }
  if (useR2v && charRefs.length > 0) {
    const r2vSpec = (chosen?.mode === "r2v" ? chosen : null) ?? getModel("happyhorse-1.1-r2v") ?? defaultModelForMode("r2v");
    const r2vMax = (r2vSpec.fields?.find((f) => f.key === "reference_urls") as { maxCount?: number } | undefined)?.maxCount ?? 5; // 模型参考图上限(如 5)，超了百炼会拒 → 截断保护(角色按 charIdx 已排序，留主次最高的几位)
    // 角色优先(对应 prompt 里 character1/2 占位)，再补场景、道具参考图 —— r2v 不吃首帧，
    //   场景/道具的视觉锁定全靠这里(否则只剩文字描述、跨镜会漂)。截断到模型上限(超了百炼拒收)。
    const refUrls = [...charRefs, ...collectUpstreamSceneRefs(node.id), ...collectUpstreamPropRefs(node.id)].slice(0, r2vMax);
    // 截断后只保留实际进了 reference_urls 的角色(charRefs 排最前)重建占位映射 —— 否则被截掉的第 r2vMax+1 个起的
    //   角色仍在 prompt 留 characterN 占位、却无对应参考槽 → 百炼拒收 / 锁脸失效。仅 >r2vMax 角色密集镜触发。
    const keptChars = Math.min(charRefs.length, r2vMax);
    const charMapKept = keptChars >= charRefs.length ? charMap : new Map([...charMap].filter(([, idx]) => idx <= keptChars));
    return {
      mode: "r2v",
      modelId: r2vSpec.id,
      params: { ...r2vSpec.defaults, ratio: aspect, duration: dur, watermark: false },
      media: { reference_urls: refUrls },
      // rawPrompt(用户在对话框逐字编辑的完整 prompt)优先：不清洗、不替换角色名、不加运镜，所见即所发
      prompt: opts?.rawPrompt ?? replaceCharNames(cleanShotPrompt(basePrompt), charMapKept) + motionHint,
    };
  }
  const i2vSpec = (chosen?.mode === "i2v" ? chosen : null) ?? getModel("happyhorse-1.1-i2v") ?? defaultModelForMode("i2v");
  return {
    mode: "i2v",
    modelId: i2vSpec.id,
    params: { ...i2vSpec.defaults, ratio: aspect, duration: dur, watermark: false },
    media: imageUrl ? { img_url: { url: imageUrl, name: "frame.png" } } : {},
    prompt: opts?.rawPrompt ?? cleanShotPrompt(basePrompt) + motionHint,
  };
}

// 删项目/删组时停掉将被删节点的在途 job 轮询 —— 百炼无法取消已提交算力，但能停 4s 轮询、不让孤儿任务最终落进 Archive。
//   只删 running/submitting(在途)；done 的是用户资产保留；voiceJobId 存的是 audioUrl 非 job id(见 step3 配音)故不含。
//   模块级：主组件(删组)与 CanvasProjectMenu(删项目)两处共用，只依赖 store getState。
function killRunningJobs(nodeList: CanvasNode[]) {
  const ss = useStudioStore.getState();
  const ids = new Set<string>();
  nodeList.forEach((n) => { if (n.imageJobId) ids.add(n.imageJobId); if (n.videoJobId) ids.add(n.videoJobId); });
  ids.forEach((jid) => {
    const j = ss.jobs.find((x) => x.id === jid);
    if (j && (j.status === "running" || j.status === "submitting")) ss.deleteJob(jid);
  });
}

export default function Canvas({ initialProjectId }: { initialProjectId?: string }) {
  const locale = useLocale();
  const zh = locale === "zh";

  // 主 store：jobs(共享) + 生成动作 + draft 桥接
  const jobs = useStudioStore((s) => s.jobs);
  const draft = useStudioStore((s) => s.draft);
  const createJobFromPayload = useStudioStore((s) => s.createJobFromPayload);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const setJobCategory = useStudioStore((s) => s.setJobCategory);
  const setJobTags = useStudioStore((s) => s.setJobTags);
  const loadJobIntoDraft = useStudioStore((s) => s.loadJobIntoDraft);
  const router = useRouter();

  // 画布 store：节点 + 边
  const nodes = useCanvasStore((s) => s.nodes);
  const hasHydrated = useCanvasStore((s) => s.hasHydrated);
  const edges = useCanvasStore((s) => s.edges);
  const groups = useCanvasStore((s) => s.groups);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const updateDraft = useCanvasStore((s) => s.updateDraft);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const restore = useCanvasStore((s) => s.restore);
  const addGroup = useCanvasStore((s) => s.addGroup);
  const updateGroup = useCanvasStore((s) => s.updateGroup);
  const removeGroup = useCanvasStore((s) => s.removeGroup);
  const moveGroup = useCanvasStore((s) => s.moveGroup);
  const activeId = useCanvasStore((s) => s.activeId);

  // 让画布也能轮询 running job + 复活本地 blob 结果(与工坊同源)
  useJobPolling();
  useLocalJobRehydration();

  const switchProject = useCanvasStore((s) => s.switchProject);
  /* ── URL ↔ activeId 双向同步：每个画布独立 path /canvas/<id>（照 studio，用 history API 不触发 SSR / 重渲）── */
  const suppressUrlSync = useRef(false);
  const urlInitConsumed = useRef(false);
  const prevActiveRef = useRef(activeId);
  // mount：URL 带 projectId → hydrate 后切到对应画布；无 id / id 不存在 → 规范化 URL 到当前活跃画布
  useEffect(() => {
    if (urlInitConsumed.current) return;
    const apply = () => {
      if (urlInitConsumed.current) return;
      urlInitConsumed.current = true;
      const st = useCanvasStore.getState();
      const base = locale === "zh" ? "/canvas" : "/en/canvas";
      if (initialProjectId && st.projects.some((p) => p.id === initialProjectId)) {
        if (initialProjectId !== st.activeId) { suppressUrlSync.current = true; switchProject(initialProjectId); }
      } else {
        window.history.replaceState(null, "", `${base}/${st.activeId}`);
      }
    };
    if (useCanvasStore.persist.hasHydrated()) apply();
    else return useCanvasStore.persist.onFinishHydration(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // activeId 变（切画布/新建）→ pushState 更新 URL（支持浏览器后退）；popstate / 初始化触发的变化跳过避免死循环
  useEffect(() => {
    if (prevActiveRef.current === activeId) return;
    prevActiveRef.current = activeId;
    if (suppressUrlSync.current) { suppressUrlSync.current = false; return; }
    const base = locale === "zh" ? "/canvas" : "/en/canvas";
    const target = `${base}/${activeId}`;
    if (window.location.pathname !== target) window.history.pushState(null, "", target);
  }, [activeId, locale]);
  // 浏览器前进/后退 → 从 pathname 解析 projectId 并切换
  useEffect(() => {
    const onPop = () => {
      const seg = window.location.pathname.split("/canvas/")[1];
      const id = seg?.split("/")[0];
      const st = useCanvasStore.getState();
      if (!id || id === st.activeId) return;
      if (st.projects.some((p) => p.id === id)) {
        suppressUrlSync.current = true; switchProject(id);
      } else {
        // 后退到已删画布的 URL → switchProject 会静默 no-op，这里改成纠正地址栏到当前活跃画布，
        //   既不留死 URL，也不会把 suppressUrlSync 残留成 true 吞掉下一次正常切换的 pushState
        const base = locale === "zh" ? "/canvas" : "/en/canvas";
        window.history.replaceState(null, "", `${base}/${st.activeId}`);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [switchProject, locale]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // 节点媒体灯箱：点节点上的图/视频放大查看；点空白处或按 Esc 关闭复原
  const [zoomMedia, setZoomMedia] = useState<{ url: string; video: boolean; playlist?: string[]; idx?: number } | null>(null);
  const [castOpen, setCastOpen] = useState(false); // 班底独立抽屉开合
  useEffect(() => {
    if (!zoomMedia) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setZoomMedia(null); } };
    window.addEventListener("keydown", onKey, true); // capture：先于其它 Esc 处理(取消选中等)关灯箱
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomMedia]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // 手动连线拖拽态（linking 存屏幕坐标的临时终点，linkRef 存源节点）
  const [linking, setLinking] = useState<{ sourceId: string; x: number; y: number; targetId?: string | null; valid?: boolean } | null>(null);
  const linkRef = useRef<{ sourceId: string } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ s: string; t: string } | null>(null); // hover 边 → 高亮其两端节点
  // 右键菜单（nodeId 有值=节点菜单，否则画布空白菜单；坐标为相对舞台）
  const [menu, setMenu] = useState<{ x: number; y: number; wx: number; wy: number; nodeId?: string } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [assetLibOpen, setAssetLibOpen] = useState(false); // 资产库复用面板
  const [allSelected, setAllSelected] = useState(false);
  const [running, setRunning] = useState(false);
  const [runInfo, setRunInfo] = useState<{ done: number; total: number; current?: string; step?: string } | null>(null);
  const [orchBusy, setOrchBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false); // 剧本 AI 改写进行中 —— 与拆分镜区分,卡片显示准确的「改写中」而非误导的「拆分镜中」
  const [dramaShotCount, setDramaShotCount] = useState(12); // 短剧目标镜头数（拆分镜用，坞里可调）
  const [orchModel, setOrchModel] = useState("qwen3.6-plus"); // 编排 LLM（剧本/分镜/角色提取共用，坞里可选）
  // 角色/场景批量出图配置 —— 单一数据源：坞「角色场景」阶段与 note「下一步·出图」按钮共用，杜绝两条路径不一致
  const [designModel, setDesignModel] = useState(() => defaultModelForMode("t2i")?.id ?? "");
  const [designStyle, setDesignStyle] = useState("");
  const [designSize, setDesignSize] = useState("720*1280"); // 默认竖屏 9:16(与分镜一致)，可选方/横
  // 视频/配音/成片阶段配置 —— 同提升为单一数据源，供「坞=进度条 + 对话框=操作台」融合后由对话框读写
  const [i2vModel, setI2vModel] = useState(() => defaultModelForMode("r2v")?.id ?? defaultModelForMode("i2v")?.id ?? ""); // 默认 r2v：短剧分镜几乎都连了角色/场景/道具(多参考)，r2v 直接多参考锁脸不漂；i2v(单帧)留作可选
  const [i2vDuration, setI2vDuration] = useState(0); // 0 = 跟随分镜各自时长(13s 分镜→13s 视频)；>0 = 统一覆盖所有分镜
  const [voiceId, setVoiceId] = useState("Ethan");
  const [editAspect, setEditAspect] = useState<EditExportCfg["aspect"]>("9:16");
  const [editTransition, setEditTransition] = useState<EditExportCfg["transition"]>("fade");
  const [editCrossfade, setEditCrossfade] = useState(0.5);
  const [editSubtitle, setEditSubtitle] = useState(true);
  // 阶段操作区(对话框承载坞配置)用的模型/音色清单
  const t2iModelList = useMemo(() => modelsByMode("t2i"), []);
  const i2vModelList = useMemo(() => { // 视频阶段含 r2v(参考图生视频，如 happyhorse r2v 多参考锁脸)，按 id 去重
    const seen = new Set<string>();
    return [...modelsByMode("i2v"), ...modelsByMode("r2v")].filter((m) => {
      if (m.fields?.some((f) => f.key === "last_frame_url")) return false; // 排除「首尾帧/视频续写」——分镜只有单张静帧，给不出尾帧/现有视频，选了必缺图、配置错乱
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, []);
  const voiceList = useMemo(() => listVoices(), []);
  // 持久化镜头数：这台机器页面反复自动重载，不持久化会被打回默认 12（「选了4还出12」元凶之一）
  const setShotCount = useCallback((n: number) => {
    setDramaShotCount(n);
    try { localStorage.setItem("frame-0:drama-shots", String(n)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { const raw = localStorage.getItem("frame-0:drama-shots"); if (raw != null) { const v = Number(raw); if (Number.isFinite(v) && v >= 0 && v <= 40) setDramaShotCount(v); } } catch { /* ignore */ }
  }, []);
  const [activeStage, setActiveStage] = useState<DockStage | null>(null); // 当前聚焦的短剧阶段（坞↔对话框↔画布单一数据源）
  // 「↩ 引用」队列：输出节点点引用 → 进 composer chips，下次发送自动连线作上下文
  const [pendingRefs, setPendingRefs] = useState<string[]>([]);
  // 流式回答中的 answer 节点（卡片显示打字光标）
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const [chatBusy, setChatBusy] = useState(false);
  // 短剧进度坞的批量执行态
  const [dockBusy, setDockBusy] = useState<{ stage: DockStage; done: number; total: number } | null>(null);
  const composerApi = useRef<ComposerApi | null>(null);
  // 画布双模式：free=自由创作（对话/图/视频自由生长）；drama=短剧（一句话编排整部 + 进度坞）
  const [canvasMode, setCanvasMode] = useState<"free" | "drama">("free");
  const [modeHydrated, setModeHydrated] = useState(false); // canvasMode 读完 localStorage —— 与 hasHydrated 共同守卫空态卡，杜绝 free→drama 闪烁
  const [guideOpen, setGuideOpen] = useState(false); // 短剧「怎么用」引导浮层（首次进短剧弹一次）
  useEffect(() => {
    try {
      const m = localStorage.getItem("frame-0:canvas-mode");
      if (m === "drama" || m === "free") {
        setCanvasMode(m);
        // 恢复成短剧时补发 openAgent，否则刷新/首次进入对话框停在 chat 收起态、不展开到剧本阶段
        if (m === "drama") {
          requestAnimationFrame(() => composerApi.current?.openAgent("drama"));
          if (!localStorage.getItem("frame-0:drama-guide-seen")) setGuideOpen(true);
        }
      }
    } catch { /* ignore */ }
    setModeHydrated(true);
  }, []);
  const switchCanvasMode = useCallback((m: "free" | "drama", composerMode?: ComposerMode) => {
    setCanvasMode(m);
    try { localStorage.setItem("frame-0:canvas-mode", m); } catch { /* ignore */ }
    if (m === "drama") {
      composerApi.current?.openAgent("drama");
      try { if (!localStorage.getItem("frame-0:drama-guide-seen")) setGuideOpen(true); } catch { /* ignore */ }
    } else composerApi.current?.openMode(composerMode ?? "chat"); // 单一调用：调用方指定 composer 模式，杜绝双重切换打架
  }, []);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    try { localStorage.setItem("frame-0:drama-guide-seen", "1"); } catch { /* ignore */ }
  }, []);
  // composer 只编辑「显式选中」的输入位节点：未生成的 generate / chat / 资产卡
  const selectedComposeNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((x) => x.id === selectedNodeId);
    if (!n) return null;
    const k = n.kind ?? "generate";
    if (k === "generate" && (!n.jobId || n.dramaVideoOf)) return n; // 视频输出节点(有 job)也联动对话框 → 点它看完整生成配置
    if (k === "chat" || k === "note" || k === "character" || k === "scene" || k === "prop") return n;
    return null;
  }, [nodes, selectedNodeId]);

  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  // ── 桥接：选中 compose 节点 → 同步其 draft 到全局 store。
  //   chat 态例外：选中节点当「引用输入」，不载入其内容、也不写回覆盖它（用户多次要求：点节点别覆盖，往下连新输出）──
  const bridgeRef = useRef(false);
  const bridgedIdRef = useRef<string | null>(null); // 当前已桥接到对话框的节点 id —— 节点一换就完整重载全部配置(消除残留参数),同节点不重载(不覆盖正在编辑的内容)
  const bridgedJobRef = useRef<string | null>(null); // 当前已桥接的 videoJobId —— 重生成/重转换了 job 就强制重载主输入，避免显示旧 prompt
  const videoRegenInflight = useRef<Set<string>>(new Set()); // 视频节点单条重生成 in-flight —— 防狂点产生并行重复任务、白耗额度
  const prevComposerModeRef = useRef<ComposerMode>(composerMode); // 上一次的对话框模式 —— 用于「仅在切回 chat 那一刻清一次输入」
  useEffect(() => {
    if (!selectedComposeNode) { bridgedIdRef.current = null; bridgedJobRef.current = null; return; }
    if (composerMode === "chat") {
      // chat 态：选中节点当「引用输入」—— 不载入节点内容，也不清空输入(保留用户手敲的指令：先打字再点节点设锚点不丢字)；
      //   清空只在「刚切回 chat 模式」那一刻做一次(见下方 prevComposerMode effect)。发送时连成输入边、新输出落其下方
      bridgedIdRef.current = null; bridgedJobRef.current = null; // chat 态当引用，不算桥接
      return;
    }
    const s = useStudioStore.getState();
    const nd = selectedComposeNode.draft;
    // 视频输出节点:生成配置(模型/模式/参数)以实际 job 为准 —— 现有视频在 draft 里没记配置,从 job 读才完整。
    const vjob = selectedComposeNode.dramaVideoOf && selectedComposeNode.videoJobId
      ? s.jobs.find((j) => j.id === selectedComposeNode.videoJobId)
      : undefined;
    // 视频节点有 videoJobId 但其 job 还没就绪(刷新后 jobs 从 IDB 异步 hydrate) → 先不桥接、不标记，
    //   待 jobs 到位本 effect(依赖 jobs)重跑再载真实 prompt；否则会把分镜剧本当 prompt 永久显示，还被 submitMedia 当 rawVideoPrompt 重生成。
    if (selectedComposeNode.dramaVideoOf && selectedComposeNode.videoJobId && !vjob) return;
    const isDramaGenerate = selectedComposeNode.orchMode === "drama" && (selectedComposeNode.kind ?? "generate") === "generate";
    const stagedVideoKey = !vjob && composerMode === "video" && isDramaGenerate ? `stage-video:${i2vModel}` : null;
    // 同节点 + 同 job 已桥接 → 不重载(避免覆盖正在编辑)；重生成/重转换了 videoJobId → 强制重载新 prompt
    const curJob = selectedComposeNode.videoJobId ?? stagedVideoKey;
    if (bridgedIdRef.current === selectedComposeNode.id && bridgedJobRef.current === curJob) return;
    bridgeRef.current = true;
    const stagedVideoSpec =
      !vjob && composerMode === "video" && isDramaGenerate
        ? (() => {
            const chosen = getModel(i2vModel);
            return chosen && !isImageMode(chosen.mode) ? chosen : defaultModelForMode("r2v");
          })()
        : null;
    const stagedParams = stagedVideoSpec
      ? {
          ...stagedVideoSpec.defaults,
          ...(typeof nd.params.duration === "number" ? { duration: nd.params.duration } : {}),
        }
      : null;
    const cMode = vjob?.mode ?? stagedVideoSpec?.mode ?? nd.mode;
    const cModel = vjob?.modelId ?? stagedVideoSpec?.id ?? nd.modelId;
    const cParams = vjob?.params ?? stagedParams ?? nd.params;
    const cMedia = vjob?.media ?? (stagedVideoSpec ? {} : nd.media); // 媒体(首帧/参考图)同样以实际 job 为准 —— 写回 draft 时没存 media，只有 job 里有真实喂进去的首帧/角色参考图
    const cPrompt = (selectedComposeNode.dramaVideoOf && vjob?.prompt != null) ? vjob.prompt : nd.prompt; // 视频节点：主输入 = 真正发给百炼的完整 prompt(可逐字编辑后直发重生成)；其它节点保持各自 draft.prompt
    s.setMode(cMode);
    s.setModelId(cModel);
    s.setPrompt(cPrompt);
    s.setNegativePrompt(nd.negativePrompt ?? "");
    s.setMedia(cMedia);
    Object.entries(cParams).forEach(([k, v]) => s.setParam(k, v));
    bridgedIdRef.current = selectedComposeNode.id;
    bridgedJobRef.current = curJob;
    bridgeRef.current = false;
  }, [selectedNodeId, composerMode, selectedComposeNode?.videoJobId, jobs, i2vModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // 仅在「从图/视频模式切回 chat」那一刻清一次输入(丢掉上个模式残留的 prompt)；chat 态内切换选中节点不再清 → 保留用户手敲的指令
  useEffect(() => {
    if (composerMode === "chat" && prevComposerModeRef.current !== "chat") {
      const sc = useStudioStore.getState();
      if (sc.draft.prompt) sc.setPrompt("");
    }
    prevComposerModeRef.current = composerMode;
  }, [composerMode]);

  // 切换画布项目 → 清掉上个项目残留的选中态(选中节点/边/桥接标记)，避免空画布对话框残留旧节点上下文
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    bridgedIdRef.current = null;
    bridgedJobRef.current = null;
  }, [activeId]);

  // ── 视频节点「分镜剧本」镜像同步：视频输出节点的 draft.prompt 本应等于其分镜节点的分镜剧本
  //   (ensureVideoNode 从分镜复制而来)。早前版本(已回退)曾把它污染成雷同的场景/道具参考描述。
  //   只要与分镜节点不一致就从分镜恢复(结构性判断，不靠脆弱的字符串前缀；恢复后一致，自然收敛)。──
  useEffect(() => {
    nodes.forEach((v) => {
      if (!v.dramaVideoOf) return;
      const shot = nodes.find((n) => n.id === v.dramaVideoOf);
      if (shot?.draft?.prompt && v.draft?.prompt !== shot.draft.prompt) {
        updateDraft(v.id, { prompt: shot.draft.prompt });
      }
    });
  }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 反向桥接：全局 draft 变化 → 写回画布节点（chat 态不写回，杜绝「打字覆盖节点内容」）──
  useEffect(() => {
    if (!selectedComposeNode || bridgeRef.current || composerMode === "chat") return;
    const isDramaShotVideoEdit =
      composerMode === "video" &&
      selectedComposeNode.orchMode === "drama" &&
      (selectedComposeNode.kind ?? "generate") === "generate" &&
      !selectedComposeNode.dramaVideoOf;
    if (isDramaShotVideoEdit) {
      updateDraft(selectedComposeNode.id, {
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
      });
      return;
    }
    // 视频输出节点(dramaVideoOf)的生成配置 = 已跑完的结果，只读：composer 只回写 prompt(segmentPlan)，
    // 绝不回写 modelId/mode/params —— 否则「点进去看一眼配置」或自动切 video 模式触发的 setMode，
    // 会把真实的 r2v/i2v 配置覆盖成默认 t2v 写回节点(用户报「看不到完整配置」的根因)。
    if (selectedComposeNode.dramaVideoOf) return; // 视频输出节点 = 已生成结果的只读快照(展示后端实际调用)，composer 任何编辑都不回写，杜绝把刚显示的真实 prompt/配置覆盖回节点
    updateDraft(selectedComposeNode.id, {
      prompt: draft.prompt,
      modelId: draft.modelId,
      mode: draft.mode,
      params: draft.params,
      media: draft.media,
      negativePrompt: draft.negativePrompt,
    });
  }, [draft.prompt, draft.modelId, draft.mode, draft.params, draft.media, draft.negativePrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 输入即联动：对话框一有输入但没绑定节点 → 自动冒一个草稿节点实时同步；清空则撤掉 ──
  const draftNodeRef = useRef<string | null>(null);
  useEffect(() => {
    const text = (draft.prompt || "").trim();
    const draftId = draftNodeRef.current;
    // 短剧用题材/自己写/智能编排起草，不走"输入即草稿节点"——否则 agent 态有残留输入就冒重复草稿 note
    if (canvasMode === "drama") {
      if (draftId) { const n0 = useCanvasStore.getState().nodes.find((x) => x.id === draftId); if (n0 && !n0.jobId) removeNode(draftId); draftNodeRef.current = null; }
      return;
    }
    // 选中的是「真实存在的」别的节点 → 不干预手动编辑（清空后 selectedNodeId 可能残留指向已删节点，不能据此 return）
    const selExists = selectedNodeId ? useCanvasStore.getState().nodes.some((n) => n.id === selectedNodeId) : false;
    if (selExists && selectedNodeId !== draftId) return;
    if (text.length > 0) {
      // 用节点真实存在性判断，而非 ref —— clearCanvas 后 ref 可能残留指向已删草稿
      const cur = draftId ? useCanvasStore.getState().nodes.find((x) => x.id === draftId) : null;
      if (!cur) {
        const kind = composerMode === "chat" ? "chat" : composerMode === "agent" ? "note" : "generate";
        const at = spawnPoint([], 280);
        const sd = useStudioStore.getState().draft;
        const id = addNode({
          x: at.x, y: at.y,
          draft: { ...sd },
          kind,
          orchMode: "creative", // 此处 canvasMode 必为 free(drama 已在顶部 return)
        });
        draftNodeRef.current = id;
        setSelectedNodeId(id);
      } else {
        const n = cur;
        if (n && !n.jobId) {
          // composerMode 异步同步后修正草稿 kind（图/视频→generate、对话→chat、短剧→note）
          const wantKind = composerMode === "chat" ? "chat" : composerMode === "agent" ? "note" : "generate";
          if ((n.kind ?? "generate") !== wantKind) updateNode(n.id, { kind: wantKind });
          // note 草稿展示 node.text（非 draft.prompt），单独同步
          if (wantKind === "note" && n.text !== draft.prompt) updateNode(n.id, { text: draft.prompt });
        }
      }
    } else if (draftId) {
      const n = useCanvasStore.getState().nodes.find((x) => x.id === draftId);
      if (n && !n.jobId) removeNode(draftId); // 未生成的空草稿 → 撤掉
      if (selectedNodeId === draftId) setSelectedNodeId(null);
      draftNodeRef.current = null;
    }
  }, [draft.prompt, composerMode, selectedNodeId, canvasMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryForNode, setLibraryForNode] = useState<string | null>(null);
  // toast 带 show 标志 —— 先挂载淡入，到点先淡出再卸载，得到完整入场/退场动画。
  const [toast, setToast] = useState<{ msg: string; show: boolean; action?: { label: string; run: () => void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((msg: string, action?: { label: string; run: () => void }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (toastHideTimer.current) clearTimeout(toastHideTimer.current);
    setToast({ msg, show: true, action });
    toastTimer.current = setTimeout(() => {
      setToast((t) => (t ? { ...t, show: false } : null)); // 触发淡出
      toastHideTimer.current = setTimeout(() => setToast(null), 240); // 淡出结束后卸载
    }, action ? 5200 : 2400); // 带「撤销」的 toast 停留更久，给用户反悔时间
  }, []);

  // ── 流程终止：编排(SSE) / 批量生成(出图·视频·配音) / 串联执行 进行中可一键中止 ──
  // 一次只跑一个长流程(orchBusy/dockBusy/running 互斥)，单个 controller 足够；beginFlow 每次入口都重置成新的未中止 signal。
  const flowAbort = useRef<AbortController | null>(null);
  const beginFlow = useCallback(() => {
    const ac = new AbortController();
    flowAbort.current = ac;
    setOrchestratorSignal(ac.signal); // 编排 fetch 随之可被终止
    return ac;
  }, []);
  const cancelFlow = useCallback(() => {
    if (!flowAbort.current || flowAbort.current.signal.aborted) return;
    flowAbort.current.abort();
    flash(zh ? "已终止 ✕ 当前步完成后停止" : "Stopping ✕");
  }, [zh, flash]);

  /* ── 节点实测尺寸（世界坐标 = DOM layout 尺寸，transform 不影响 offsetWH）──
     连线锚点(底部中心→顶部中心)与「输出落下方」都依赖高度；ResizeObserver 喂进来。 */
  const sizesRef = useRef(new Map<string, { w: number; h: number }>());
  const relayoutTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [sizeTick, setSizeTick] = useState(0);
  const onMeasureNode = useCallback((id: string, size: { w: number; h: number } | null) => {
    if (!size) {
      sizesRef.current.delete(id);
      return;
    }
    const prev = sizesRef.current.get(id);
    if (prev && Math.abs(prev.w - size.w) < 1.5 && Math.abs(prev.h - size.h) < 1.5) return;
    const grewALot = !prev || Math.abs(prev.h - size.h) >= 40; // 首次测量(reload 恢复)或出图/出视频后显著长高 → 重排该组防重叠
    sizesRef.current.set(id, size);
    setSizeTick((t) => t + 1);
    // 短剧组节点长高后防抖重排该组，避免出图/视频撑高后与相邻层重叠（用户拖拽/连线时不打断）
    if (grewALot) {
      const n = useCanvasStore.getState().nodes.find((x) => x.id === id);
      if (n?.orchMode === "drama" && n.groupId) {
        const gid = n.groupId;
        const timers = relayoutTimersRef.current;
        if (timers.has(gid)) clearTimeout(timers.get(gid)!);
        timers.set(gid, setTimeout(() => {
          timers.delete(gid);
          if (dragRef.current || linkRef.current) return;
          relayoutGroup(gid);
        }, 350));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sizeOf = useCallback(
    (n: CanvasNode) => sizesRef.current.get(n.id) ?? { w: nodeWidth(n), h: n.h ?? 170 },
    []
  );

  /* ── 视图 pan / zoom ── */
  const [view, setView] = useState({ x: 0, y: 0, scale: DEFAULT_SCALE });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const spaceRef = useRef(false); // 空格抓手平移模式（按住空格 → 任意处拖拽都平移）

  const onStagePointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    // 中键 / 空格抓手：任意位置(含节点)都可平移；左键：仅背景(非节点)
    const forcePan = e.button === 1 || spaceRef.current;
    if (!forcePan && t.closest(".cv-node")) return;
    setAllSelected(false); // 点空白/开始平移 → 退出「全选」态，避免随后 Delete 误清空整画布
    if (forcePan) e.preventDefault();
    if (!forcePan && !t.closest(".cv-edge-hit") && !t.closest(".cv-edge-del")) setSelectedEdgeId(null);
    document.body.classList.add("cv-grabbing"); // 平移期间全局 grabbing 光标
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件 / 已释放的 pointer 不可捕获 —— 忽略，拖拽逻辑靠 panRef 仍生效 */
    }
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    // 捕获到局部 p —— setView 的 updater 是异步执行的，那时 panRef.current 可能
    // 已被 pointerup 置 null（点两下就崩的根因），不能在 updater 里再读 panRef。
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    setView((v) => ({ ...v, x: p.vx + dx, y: p.vy + dy }));
  };
  const onStagePointerUp = (e: React.PointerEvent) => {
    panRef.current = null;
    document.body.classList.remove("cv-grabbing"); // 平移/拖动结束 —— 统一清光标
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  // 滚轮：原生非 passive 监听 —— 唯有如此才能 preventDefault 拦截浏览器页面缩放。
  // 触控板/鼠标惯例：Ctrl/⌘+滚轮(含 pinch) = 缩放(锚定光标)；纯滚动 = 平移。
  // 节点内滚动(.cv-node)交给节点自身(模型面板等)，不触发画布。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheelNative = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest(".cv-node")) return;
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        setView((v) => {
          const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
          const wx = (mx - v.x) / v.scale;
          const wy = (my - v.y) / v.scale;
          return { x: mx - wx * ns, y: my - wy * ns, scale: ns };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    stage.addEventListener("wheel", onWheelNative, { passive: false });
    return () => stage.removeEventListener("wheel", onWheelNative);
  }, []);

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      const ox = rect?.left ?? 0;
      const oy = rect?.top ?? 0;
      return {
        x: (sx - ox - view.x) / view.scale,
        y: (sy - oy - view.y) / view.scale,
      };
    },
    [view]
  );

  /* ── 节点拖动 ——「拖拽零写库」：位移走内存 overlay（dragDelta），松手才一次性
        moveNode 提交。否则每帧 persist 序列化整张图进 localStorage + 全卡重渲，
        重画布上拖拽（尤其斜向连续小位移）直接糊掉。 ── */
  const dragRef = useRef<{ id: string; sx: number; sy: number; nx: number; ny: number } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragDeltaRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const clipboardRef = useRef<(Pick<CanvasNode, "kind" | "title" | "text" | "orchMode" | "draft"> & { x: number; y: number; count: number }) | null>(null); // ⌘C 复制的节点
  const voiceInFlightRef = useRef<Set<string>>(new Set()); // 配音进行中的节点 id（幂等守卫，防 TTS 双调用）
  /* ── 节点 resize：右下角把手拖拽改宽（高度随内容自适应） ── */
  const resizeRef = useRef<{ id: string; dir: string; sx: number; sy: number; x0: number; y0: number; w0: number; h0: number } | null>(null);
  const startResize = (e: React.PointerEvent, n: CanvasNode, dir: string) => {
    e.stopPropagation();
    setSelectedNodeId(n.id);
    document.body.classList.add("cv-grabbing");
    const s = sizeOf(n);
    resizeRef.current = { id: n.id, dir, sx: e.clientX, sy: e.clientY, x0: n.x, y0: n.y, w0: s.w, h0: s.h };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = (e.clientX - r.sx) / view.scale;
    const dy = (e.clientY - r.sy) / view.scale;
    const patch: { w?: number; h?: number; x?: number; y?: number } = {};
    if (r.dir.includes("e")) patch.w = Math.round(Math.max(220, Math.min(760, r.w0 + dx)));
    if (r.dir.includes("w")) { const w = Math.max(220, Math.min(760, r.w0 - dx)); patch.w = Math.round(w); patch.x = Math.round(r.x0 + (r.w0 - w)); }
    if (r.dir.includes("s")) patch.h = Math.round(Math.max(120, Math.min(900, r.h0 + dy)));
    if (r.dir.includes("n")) { const h = Math.max(120, Math.min(900, r.h0 - dy)); patch.h = Math.round(h); patch.y = Math.round(r.y0 + (r.h0 - h)); }
    updateNode(r.id, patch);
  };
  const endResize = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    document.body.classList.remove("cv-grabbing");
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const startNodeDrag = (e: React.PointerEvent, n: CanvasNode) => {
    if (e.button === 1 || spaceRef.current) return; // 中键/空格 → 让位给画布平移（不 stopPropagation，冒泡到 stage）
    e.stopPropagation();
    setSelectedNodeId(n.id); // 拖动即选中 —— 顺带借 .cv-node-sel 的 z-index 浮顶
    setAllSelected(false); // 单选某节点 → 退出「全选」态，避免 Delete 误清空整画布
    document.body.classList.add("cv-grabbing"); // 全局 grabbing 光标（pointer capture 下也一致）
    dragRef.current = { id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 同上 —— 忽略 */
    }
  };
  const onNodeDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    let nx = d.nx + (e.clientX - d.sx) / view.scale;
    let ny = d.ny + (e.clientY - d.sy) / view.scale;
    if (e.shiftKey) { const G = 20; nx = Math.round(nx / G) * G; ny = Math.round(ny / G) * G; } // Shift 吸附网格
    const delta = { id: d.id, dx: nx - d.nx, dy: ny - d.ny };
    dragDeltaRef.current = delta;
    setDragDelta(delta);
  };
  const endNodeDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const delta = dragDeltaRef.current;
    if (d && delta && delta.id === d.id && (delta.dx !== 0 || delta.dy !== 0)) {
      moveNode(d.id, d.nx + delta.dx, d.ny + delta.dy); // 仅此一次写 store
    }
    dragRef.current = null;
    dragDeltaRef.current = null;
    setDragDelta(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  /* ── 整组拖动 —— 同「拖拽零写库」：overlay 平移，松手才 moveGroup 一次 ── */
  const groupDragRef = useRef<{ id: string; sx: number; sy: number } | null>(null);
  const [groupDrag, setGroupDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const groupDragRefDelta = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const startGroupDrag = (e: React.PointerEvent, gid: string) => {
    if (e.button === 1 || spaceRef.current) return;
    e.stopPropagation();
    document.body.classList.add("cv-grabbing");
    groupDragRef.current = { id: gid, sx: e.clientX, sy: e.clientY };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onGroupDragMove = (e: React.PointerEvent) => {
    const d = groupDragRef.current;
    if (!d) return;
    const delta = { id: d.id, dx: (e.clientX - d.sx) / view.scale, dy: (e.clientY - d.sy) / view.scale };
    groupDragRefDelta.current = delta;
    setGroupDrag(delta);
  };
  const endGroupDrag = (e: React.PointerEvent) => {
    const d = groupDragRef.current;
    const delta = groupDragRefDelta.current;
    if (d && delta && delta.id === d.id && (delta.dx !== 0 || delta.dy !== 0)) {
      moveGroup(d.id, delta.dx, delta.dy); // 仅此一次写 store
    }
    groupDragRef.current = null;
    groupDragRefDelta.current = null;
    setGroupDrag(null);
    document.body.classList.remove("cv-grabbing");
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  /* ── 手动连线：从节点右锚拖出 → 落到目标节点（解决"不能随意连接"） ── */
  const startLink = (e: React.PointerEvent, sourceId: string) => {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    linkRef.current = { sourceId };
    setLinking({ sourceId, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onLinkMove = (e: React.PointerEvent) => {
    if (!linkRef.current) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const src = linkRef.current.sourceId;
    // 实时探测光标下的落点节点 —— 合法目标(非源、非重复)绿，重复红，空白/源不提示
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const tid = (hit?.closest(".cv-node") as HTMLElement | null)?.getAttribute("data-node-id") ?? null;
    let targetId: string | null = null;
    let valid: boolean | undefined;
    if (tid && tid !== src) {
      targetId = tid;
      valid = !edges.some((ed) => ed.source === src && ed.target === tid);
    }
    setLinking((l) => (l ? { ...l, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0), targetId, valid } : l));
  };
  const flashNode = useCallback((id: string) => {
    const el = document.querySelector(`.cv-node[data-node-id="${id}"]`);
    if (!el) return;
    el.classList.add("cv-node-reject");
    setTimeout(() => el.classList.remove("cv-node-reject"), 500);
  }, []);
  const endLink = (e: React.PointerEvent) => {
    if (!linkRef.current) return;
    const src = linkRef.current.sourceId;
    linkRef.current = null;
    setLinking(null);
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const el = hit?.closest(".cv-node") as HTMLElement | null;
    const targetId = el?.getAttribute("data-node-id");
    if (!targetId) { flash(zh ? "拖到目标节点上才能连接 ⇢" : "Drop on a node to link ⇢"); return; }
    if (targetId === src) {
      flashNode(src);
      flash(zh ? "不能连接自身" : "Can't link to self");
      return;
    }
    if (edges.some((ed) => ed.source === src && ed.target === targetId)) {
      flashNode(targetId);
      flash(zh ? "已有相同连线" : "Already linked");
      return;
    }
    addEdge(src, targetId);
    flash(zh ? "已连接 ⇢" : "Linked ⇢");
  };

  // 复制节点（不带 jobId，偏移落点，便于在它基础上改）
  const duplicateNode = useCallback((id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    const nid = addNode({ x: n.x + 40, y: n.y + 40, draft: { ...n.draft, media: { ...n.draft.media } }, kind: n.kind, title: n.title, text: n.text, orchMode: n.orchMode });
    setSelectedNodeId(nid);
  }, [nodes, addNode]);

  // 删除可撤销 —— 捕获被删数据(节点连同关联边)，flash 带「撤销」按钮恢复
  // ── 撤销栈:删节点/边/组/清空都入栈,Cmd+Z 多步回退(toast「撤销」按钮仍保留) ──
  const undoStackRef = useRef<Array<() => void>>([]);
  const pushUndo = useCallback((fn: () => void) => {
    undoStackRef.current.push(fn);
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
  }, []);
  const runUndo = useCallback(() => {
    const fn = undoStackRef.current.pop();
    if (fn) { fn(); flash(zh ? "↩ 已撤销" : "↩ Undone"); }
    else flash(zh ? "没有可撤销的操作了" : "Nothing to undo");
  }, [flash, zh]);
  const deleteNodeWithUndo = useCallback((id: string) => {
    const st = useCanvasStore.getState();
    const node = st.nodes.find((n) => n.id === id);
    if (!node) return;
    // 级联：分镜节点的视频输出子节点(dramaVideoOf===id)随之删除——否则留下挂着 videoJobId/imageJobId
    //   的孤儿节点(videoNodeFor 永不命中、relayout 不重排、导出按分镜遍历静默丢镜、撤销不还原)。
    //   关联 job 不删：留着才能撤销还原(节点回来仍指向存在的 job)；孤儿 job 的清理见删项目/删组路径。
    const childVideoNodes = st.nodes.filter((n) => n.dramaVideoOf === id);
    const killIds = new Set<string>([id, ...childVideoNodes.map((n) => n.id)]);
    const removedNodes = [node, ...childVideoNodes];
    const relEdges = st.edges.filter((e) => killIds.has(e.source) || killIds.has(e.target));
    killIds.forEach((kid) => removeNode(kid));
    setSelectedNodeId((cur) => (cur && killIds.has(cur) ? null : cur));
    const undo = () => restore(removedNodes, relEdges);
    pushUndo(undo);
    flash(zh ? "已删除节点" : "Node deleted", { label: zh ? "撤销" : "Undo", run: undo });
  }, [removeNode, restore, flash, zh, pushUndo]);
  const deleteEdgeWithUndo = useCallback((id: string) => {
    const edge = useCanvasStore.getState().edges.find((e) => e.id === id);
    if (!edge) return;
    removeEdge(id);
    setSelectedEdgeId((cur) => (cur === id ? null : cur));
    const undo = () => restore([], [edge]);
    pushUndo(undo);
    flash(zh ? "已删除连线" : "Edge deleted", { label: zh ? "撤销" : "Undo", run: undo });
  }, [removeEdge, restore, flash, zh, pushUndo]);
  // 清空整张画布 —— 可撤销（捕获全部节点+边，flash 带「撤销」一键还原）
  const clearCanvasWithUndo = useCallback(() => {
    const st = useCanvasStore.getState();
    const snapNodes = st.nodes.slice();
    const snapEdges = st.edges.slice();
    const snapGroups = st.groups.slice();
    if (!snapNodes.length) return;
    clearCanvas();
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setAllSelected(false);
    const undo = () => restore(snapNodes, snapEdges, snapGroups);
    pushUndo(undo);
    flash(zh ? `已清空 ${snapNodes.length} 个节点` : `Cleared ${snapNodes.length} nodes`, { label: zh ? "撤销" : "Undo", run: undo });
  }, [clearCanvas, restore, flash, zh, pushUndo]);

  // 右键菜单：落在节点上 → 节点菜单；落在空白 → 画布菜单
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = (e.target as HTMLElement)?.closest(".cv-node") as HTMLElement | null;
    const rect = stageRef.current?.getBoundingClientRect();
    const w = screenToWorld(e.clientX, e.clientY);
    setMenu({
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      wx: w.x, wy: w.y,
      nodeId: el?.getAttribute("data-node-id") ?? undefined,
    });
  };
  // 双击空白 → 在该处直接落一个新节点
  const onStageDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement)?.closest(".cv-node")) return;
    const w = screenToWorld(e.clientX, e.clientY);
    addComposeAtCenter(undefined, { x: w.x - NODE_W / 2, y: w.y - 90 });
  };

  /* ── 快捷键：Delete/Backspace 删选中的边或节点；Esc 取消选中 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (allSelected) { clearCanvasWithUndo(); setView({ x: 0, y: 0, scale: DEFAULT_SCALE }); e.preventDefault(); }
        else if (selectedEdgeId) { deleteEdgeWithUndo(selectedEdgeId); e.preventDefault(); }
        else if (selectedNodeId) { deleteNodeWithUndo(selectedNodeId); e.preventDefault(); }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        runUndo(); e.preventDefault();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
        if (selectedNodeId) { duplicateNode(selectedNodeId); e.preventDefault(); }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) {
        if (selectedNodeId) {
          const n = useCanvasStore.getState().nodes.find((x) => x.id === selectedNodeId);
          if (n) { clipboardRef.current = { kind: n.kind, title: n.title, text: n.text, orchMode: n.orchMode, draft: { ...n.draft, media: { ...n.draft.media } }, x: n.x, y: n.y, count: 0 }; flash(zh ? "已复制节点 · ⌘V 粘贴" : "Copied · ⌘V to paste"); e.preventDefault(); }
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V")) {
        const c = clipboardRef.current;
        if (c) {
          c.count += 1;
          const id = addNode({ x: c.x + 28 * c.count, y: c.y + 28 * c.count, draft: { ...c.draft, media: { ...c.draft.media } }, kind: c.kind, title: c.title, text: c.text, orchMode: c.orchMode });
          setSelectedNodeId(id);
          e.preventDefault();
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        if (nodes.length) {
          setAllSelected(true);
          flash(zh ? `已全选 ${nodes.length} 个节点 · Delete 清空` : `Selected all ${nodes.length} nodes · Delete to clear`);
          e.preventDefault();
        }
      } else if (e.key === "Escape") {
        if (allSelected) { setAllSelected(false); }
        else if (linkRef.current) { linkRef.current = null; setLinking(null); } // 放弃正在拖的连线
        else if (dragRef.current) { dragRef.current = null; dragDeltaRef.current = null; setDragDelta(null); document.body.classList.remove("cv-grabbing"); } // 节点回弹起点（store 未动，清 overlay 即可）
        else { setSelectedNodeId(null); setSelectedEdgeId(null); setMenu(null); }
      } else if (selectedNodeId && e.key.startsWith("Arrow")) {
        // 方向键微调选中节点 —— 读 store 最新坐标避免闭包陈旧；Shift 大步
        const n = useCanvasStore.getState().nodes.find((x) => x.id === selectedNodeId);
        if (n) {
          const step = e.shiftKey ? 20 : 2;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          moveNode(n.id, n.x + dx, n.y + dy);
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedEdgeId, selectedNodeId, allSelected, deleteEdgeWithUndo, deleteNodeWithUndo, duplicateNode, moveNode, addNode, clearCanvasWithUndo, zh, runUndo]);

  // 右键菜单：点菜单外的任意处关闭（延迟挂监听，避免开菜单的同一次点击即关）
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest(".cv-ctxmenu")) setMenu(null);
    };
    const t = window.setTimeout(() => document.addEventListener("pointerdown", close), 0);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", close); };
  }, [menu]);

  // 工具栏「新建」类型菜单：点外部关闭
  useEffect(() => {
    if (!addMenuOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest(".cv-add-wrap")) setAddMenuOpen(false);
    };
    const t = window.setTimeout(() => document.addEventListener("pointerdown", close), 0);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", close); };
  }, [addMenuOpen]);

  /* ── 新建 compose 节点(放在当前视图中心) ── */
  const addComposeAtCenter = useCallback(
    (draftOverride?: Partial<Draft>, at?: { x: number; y: number }) => {
      const rect = stageRef.current?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : 400;
      const cy = rect ? rect.height / 2 : 300;
      const world = at ?? {
        x: (cx - view.x) / view.scale - NODE_W / 2,
        y: (cy - view.y) / view.scale - 90,
      };
      const draft = { ...defaultDraft(), ...draftOverride } as Draft;
      const id = addNode({ x: world.x, y: world.y, draft });
      setSelectedNodeId(id);
      return id;
    },
    [addNode, view]
  );

  // 新建指定类型的节点（generate 复用 compose；note/character/scene 是新类型）
  const addNodeOfKind = useCallback(
    (kind: CanvasNodeKind, at?: { x: number; y: number }) => {
      const rect = stageRef.current?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : 400;
      const cy = rect ? rect.height / 2 : 300;
      const world = at ?? {
        x: (cx - view.x) / view.scale - NODE_W / 2,
        y: (cy - view.y) / view.scale - 90,
      };
      if (kind === "generate") return addComposeAtCenter(undefined, world);
      // character/scene 预置文生图模型（立绘/场景图）；note/chat 纯文本
      const imgModel = defaultModelForMode("t2i");
      const draft = kind === "note" || kind === "chat" ? defaultDraft() : defaultDraft(imgModel?.id);
      const title =
        kind === "note" ? (zh ? "创意" : "Idea")
          : kind === "chat" ? ""
            : kind === "character" ? (zh ? "新角色" : "Character")
              : kind === "prop" ? (zh ? "新道具" : "Prop")
                : (zh ? "新场景" : "Scene");
      const id = addNode({ x: world.x, y: world.y, draft, kind, title, text: "" });
      setSelectedNodeId(id);
      return id;
    },
    [addNode, view, zh, addComposeAtCenter]
  );

  // 等某个 job 完成（轮询实时 store）—— 串联执行靠它在上游成片后再跑下游。
  //   signal：续写衔接等上一镜渲染时可被「终止」中断，避免卡满超时还白等。
  function waitForJob(jobId: string, timeoutMs = 180000, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (signal?.aborted) return resolve();
        const job = useStudioStore.getState().jobs.find((j) => j.id === jobId);
        if (job && (job.status === "done" || job.status === "error")) return resolve();
        if (Date.now() - start > timeoutMs) return resolve();
        window.setTimeout(tick, 1500);
      };
      tick();
    });
  }

  // ── 一键串联执行：拓扑排序待生成节点 → 按连线顺序依次生成（上游成片注入下游） ──
  const runGraph = useCallback(async () => {
    if (running) return;
    const snap = useCanvasStore.getState();
    const allNodes = snap.nodes;
    const allEdges = snap.edges;
    const liveJobs = useStudioStore.getState().jobs;
    const pending = allNodes.filter((n) => {
      const k = n.kind ?? "generate";
      if (n.dramaVideoOf) return false; // 视频输出节点不直接进生成链（由其来源分镜重定向生成，避免重复）
      if (k === "note" || k === "chat" || k === "answer") return false; // 文本节点不进生成链
      if (k === "generate") return !n.jobId; // compose 生成节点
      const job = n.jobId ? liveJobs.find((j) => j.id === n.jobId) : undefined;
      return !job || job.status !== "done"; // 未出图的资产节点
    });
    if (!pending.length) { flash(zh ? "没有待生成的节点" : "Nothing to run"); return; }
    // Kahn 拓扑排序（只在 pending 子图内，上游优先）
    const ids = new Set(pending.map((n) => n.id));
    const indeg = new Map<string, number>();
    pending.forEach((n) => indeg.set(n.id, 0));
    allEdges.forEach((e) => {
      if (ids.has(e.source) && ids.has(e.target)) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    });
    const queue = pending.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
    const ordered: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      ordered.push(id);
      allEdges.forEach((e) => {
        if (e.source === id && ids.has(e.target)) {
          const left = (indeg.get(e.target) ?? 1) - 1;
          indeg.set(e.target, left);
          if (left === 0) queue.push(e.target);
        }
      });
    }
    pending.forEach((n) => { if (!ordered.includes(n.id)) ordered.push(n.id); }); // 有环兜底
    beginFlow(); setRunning(true);
    setRunInfo({ done: 0, total: ordered.length });
    let failed = 0; // 出图/出视频失败镜数 —— 收尾据此告警，否则下游 collectUpstreamCharRefs 只收 done、静默漂移
    try {
      for (let i = 0; i < ordered.length; i++) {
        if (flowAbort.current?.signal.aborted) break; // 用户终止 → 不再启动后续节点
        const node = useCanvasStore.getState().nodes.find((n) => n.id === ordered[i]);
        if (!node) continue;
        const label = node.title || node.draft.prompt.slice(0, 20);
        const isDrama = node.orchMode === "drama" && (node.kind ?? "generate") === "generate";
        setRunInfo({ done: i, total: ordered.length, current: label, step: isDrama ? (zh ? "出图" : "Image") : undefined });
        const jobId = await generateNode(node, { signal: flowAbort.current?.signal });
        if (jobId) {
          if (isDrama) setRunInfo({ done: i, total: ordered.length, current: label, step: zh ? "出视频" : "Video" });
          await waitForJob(jobId);
          if (useStudioStore.getState().jobs.find((j) => j.id === jobId)?.status === "error") failed++;
          if (isDrama) {
            setRunInfo({ done: i, total: ordered.length, current: label, step: zh ? "配音" : "Voice" });
            // 配音挂在【视频输出节点】(generateNode 已自动配它)；读视频节点状态决定是否补配，
            // 避免对分镜节点重复 TTS(费用×2)+ 配音落到分镜成孤儿(导出从视频节点读)。
            const vc = videoNodeFor(ordered[i]) ?? useCanvasStore.getState().nodes.find((n) => n.id === ordered[i]);
            if (vc && !vc.voiceJobId) await canvasGenVoice(vc);
          }
        }
      }
      setRunInfo({ done: ordered.length, total: ordered.length });
      flash(
        failed > 0
          ? (zh ? `串联完成 · ${ordered.length} 节点，${failed} 个失败(下游可能未锁脸，重跑可自愈)` : `Ran ${ordered.length} nodes · ${failed} failed`)
          : (zh ? `串联执行完成 · ${ordered.length} 个节点 ✓` : `Ran ${ordered.length} nodes ✓`)
      );
    } finally {
      setRunning(false);
      window.setTimeout(() => setRunInfo(null), 1600);
    }
  }, [running, zh]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas → Stage 导出：将活跃组节点转为 Series 数据（普通函数，闭包随渲染新鲜）──
  function exportToStage() {
    const snap = useCanvasStore.getState();
    const allNodes = snap.nodes;
    const allEdges = snap.edges;
    const liveJobs = useStudioStore.getState().jobs;

    const hasDrama = allNodes.some((n) => inActiveGroup(n));
    if (!hasDrama) { flash(zh ? "画布上没有短剧节点，无法导出" : "No drama nodes to export"); return; }

    const cid = () => crypto.randomUUID();

    const bible: StageElement[] = [];
    const nodeToElementId = new Map<string, string>();

    // 资产节点 → bible elements（限活跃组）
    for (const n of allNodes) {
      if (!inActiveGroup(n) || (n.kind !== "character" && n.kind !== "scene" && n.kind !== "prop")) continue;
      const elId = cid();
      const job = n.jobId ? liveJobs.find((j) => j.id === n.jobId) : undefined;
      const imgUrl = job?.media?.img_url?.url || job?.media?.ref_images?.[0]?.url;
      bible.push({
        id: elId,
        kind: n.kind === "character" ? "character" : n.kind === "prop" ? "prop" : "location",
        name: n.title || (n.kind === "character" ? "角色" : n.kind === "prop" ? "道具" : "场景"),
        refImages: imgUrl ? [{ url: imgUrl, angle: "front" }] : [],
        description: n.text || undefined,
        color: undefined,
      });
      nodeToElementId.set(n.id, elId);
    }

    // generate drama 节点 → shots（限活跃组，按 y 排序）
    const dramaNodes = allNodes
      .filter((n) => inActiveGroup(n) && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf)
      .sort((a, b) => a.y - b.y);

    const shots: StageShot[] = dramaNodes.map((n, i) => {
      const textParts = n.text?.split(" · ") || [];
      const narration = textParts[0]?.trim() || undefined;
      const shotTypeMatch = n.text?.match(/\[([\w-]+)\]/);
      const shotType = (shotTypeMatch?.[1] || "still") as import("@/lib/store").StageShotType;
      const durMatch = n.text?.match(/(\d+(?:\.\d+)?)s/);
      const durationSec = durMatch ? parseFloat(durMatch[1]) : 5;

      // 从连线找上游资产节点
      const upstreamAssetIds = allEdges
        .filter((e) => e.target === n.id)
        .map((e) => nodeToElementId.get(e.source))
        .filter(Boolean) as string[];

      return {
        id: cid(),
        idx: i + 1,
        shotType,
        narration,
        imagePrompt: n.draft.prompt || undefined,
        elementRefs: upstreamAssetIds,
        imageJobId: n.imageJobId || undefined,
        videoJobId: n.videoJobId || undefined,
        voiceJobId: n.voiceJobId || undefined,
        durationSec,
      };
    });

    if (shots.length === 0) { flash(zh ? "没有可导出的镜头节点" : "No shots to export"); return; }

    const sceneId = cid();
    const epId = cid();
    const seriesId = cid();
    const projName = useCanvasStore.getState().projects.find((p) => p.id === snap.activeId)?.name || "画布导出";

    const newSeries = {
      id: seriesId,
      name: projName,
      kind: "short" as const,
      bible,
      episodes: [{
        id: epId,
        num: 1,
        title: "第 1 集",
        scenes: [{ id: sceneId, shots, castIds: bible.filter((e) => e.kind === "character").map((e) => e.id) }],
      }],
      aspect: "16:9" as const,
      updatedAt: Date.now(),
      _v: 2 as const,
    };

    useStudioStore.getState().setSeries(newSeries);
    useStudioStore.getState().setActiveEp(epId);
    flash(zh ? `已导出 ${shots.length} 个镜头到导演台 ✦` : `Exported ${shots.length} shots to Stage ✦`);
    router.push("/stage");
  }

  // ── AI 编排：一句话 → LLM 产出节点图 → 落成真实节点 + 连线 + 拓扑层布局 ──
  // 画布已有内容时一律向右追加成新簇（不打断、不弹窗；要清空走右键菜单）。
  const runOrchestrate = useCallback(async (brief: string, mode: OrchMode) => {
    if (orchBusy || !brief.trim()) return;
    beginFlow(); setOrchBusy(true);
    flash(zh ? "智能体编排中… 约 10–20 秒 ✦" : "Orchestrating… ~10–20s ✦");
    try {
      const graph = await orchestrateGraph(brief.trim(), mode, orchModel);
      // 短剧 → 自动成组（剧集框）：组名优先用剧情 note 标题，否则截取 brief
      const groupId = mode === "drama"
        ? addGroup(
            graph.nodes.find((n) => n.kind === "note")?.title?.trim() ||
            brief.trim().replace(/^\d+\s*镜.*?[。.]/, "").trim().slice(0, 14) ||
            (zh ? "短剧" : "Drama")
          )
        : undefined;
      const imgModel = defaultModelForMode("t2i");
      const refToId = new Map<string, string>();
      const created: string[] = [];
      for (const n of graph.nodes) {
        const isGen = n.kind === "generate";
        const isNote = n.kind === "note";
        const useImg = !isNote && (!isGen || mode === "drama");
        const draft = useImg ? defaultDraft(imgModel?.id) : defaultDraft();
        if (isGen) {
          draft.prompt = n.imagePrompt || n.text;
          if (n.durationSec) draft.params.duration = n.durationSec;
        } else if (!isNote) {
          draft.prompt = n.text;
        }
        const textForNode = isGen
          ? [n.dialogue || n.text, n.shotType && `[${n.shotType}]`, n.durationSec && `${n.durationSec}s`].filter(Boolean).join(" · ")
          : n.text;
        const id = addNode({
          x: 0,
          y: 0,
          draft,
          kind: n.kind,
          title: n.title,
          text: isGen ? textForNode : n.text,
          orchMode: mode,
          groupId,
        });
        refToId.set(n.ref, id);
        created.push(id);
      }
      const realEdges = graph.edges
        .map(([s, t]) => [refToId.get(s), refToId.get(t)] as [string | undefined, string | undefined])
        .filter((e): e is [string, string] => !!e[0] && !!e[1]);
      realEdges.forEach(([s, t]) => addEdge(s, t));
      const existing = useCanvasStore.getState().nodes.filter((n) => !created.includes(n.id));
      const originX = existing.length ? Math.max(...existing.map((n) => n.x)) + NODE_W + 200 : 0;
      const pos = layoutByDepth(
        created,
        realEdges.map(([source, target]) => ({ source, target })),
        { nodeW: 300, colGap: 44, originX, originY: 0, dir: "v" }
      );
      created.forEach((id) => { const p = pos.get(id); if (p) moveNode(id, p.x, p.y); });
      requestAnimationFrame(() => fitView());
      const genCount = graph.nodes.filter((n) => n.kind === "generate").length;
      const charCount = graph.nodes.filter((n) => n.kind === "character").length;
      const sceneCount = graph.nodes.filter((n) => n.kind === "scene").length;
      const breakdown = zh
        ? [charCount && `${charCount}角色`, sceneCount && `${sceneCount}场景`, `${genCount}分镜`].filter(Boolean).join(" + ")
        : [charCount && `${charCount} char`, sceneCount && `${sceneCount} scene`, `${genCount} shots`].filter(Boolean).join(" + ");
      flash(zh
        ? `已编排 ${created.length} 个节点（${breakdown}）${mode === "drama" ? " ✦ 顶部进度坞一键出图" : " ✦"}`
        : `Orchestrated ${created.length} nodes (${breakdown}) ✦`);
    } catch (e) {
      flash((zh ? "编排失败：" : "Failed: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOrchBusy(false);
    }
  }, [orchBusy, addNode, addEdge, moveNode, zh]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动整理：按拓扑层重排现有节点（纵向创作树，上游在上）
  const autoLayout = useCallback(() => {
    const snap = useCanvasStore.getState();
    if (!snap.nodes.length) return;
    const pos = layoutByDepth(
      snap.nodes.map((n) => n.id),
      snap.edges.map((e) => ({ source: e.source, target: e.target })),
      { nodeW: 300, colGap: 44, rowGap: Math.max(...snap.nodes.map((n) => sizeOf(n).h), 240) + 48, dir: "v" }
    );
    snap.nodes.forEach((n) => { const p = pos.get(n.id); if (p) moveNode(n.id, p.x, p.y); });
    requestAnimationFrame(() => fitView());
    flash(zh ? "已整理布局 ✦" : "Tidied ✦");
  }, [moveNode, zh]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 把「本地代理 / blob」媒体重传到 OSS —— 百炼远程只抓公网 URL；分支带入的成片
     结果常是 /api/uploads 这类本地 URL，不重传会「Failed to download」。 */
  async function ensureMediaUploaded(
    media: Draft["media"],
    modelId: string
  ): Promise<Draft["media"]> {
    const needs = (u?: string) =>
      !!u && (u.startsWith("/api/") || u.startsWith("blob:"));
    const uploadOne = async (m: JobMedia | undefined): Promise<JobMedia | undefined> => {
      if (!m || !needs(m.url)) return m;
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`源不可读 (${res.status})`);
      const blob = await res.blob();
      const mime = m.mime || blob.type || "application/octet-stream";
      const ext = mime.split("/")[1]?.split("+")[0] || "bin";
      const file = new File([blob], m.name || `canvas_src.${ext}`, { type: mime });
      return uploadMediaFile(file, modelId);
    };
    const out: Draft["media"] = { ...media };
    const keys = ["img_url", "video_url", "last_frame_url", "first_clip_url"] as const;
    for (const key of keys) {
      const m = out[key];
      if (m) out[key] = await uploadOne(m);
    }
    const arrayKeys = ["reference_urls", "ref_images"] as const;
    for (const key of arrayKeys) {
      const arr = out[key];
      if (arr) out[key] = (await Promise.all(arr.map((m) => uploadOne(m)))).filter(Boolean) as JobMedia[];
    }
    return out;
  }

  /* ── 生成(每节点独立) ── */
  async function generateNode(node: CanvasNode, opts?: { imageOnly?: boolean; styleSuffix?: string; i2vModelId?: string; draftOverride?: Partial<Draft>; rawVideoPrompt?: string; signal?: AbortSignal }): Promise<string | null> {
    // 节点原则【一处守住所有入口】：对「分镜输入节点」发起生成 → 自动转到它的「视频输出节点」(新建/复用)，
    // 视频/静帧/配音全落在视频节点，分镜永不被产物占据。assets(character/scene/prop) 与已是视频节点(带 dramaVideoOf) 的不转。
    if ((node.kind ?? "generate") === "generate" && node.orchMode === "drama" && !node.dramaVideoOf) {
      node = ensureVideoNode(node);
    }
    // 视频节点「逐字编辑实际 prompt 重生成」：draftOverride = 用户在对话框临时编辑的完整配置，
    //   只服务本次生成、不写回 read-only 视频节点（持久性由重生成后的新 job 承载）。
    const d = opts?.draftOverride ? { ...node.draft, ...opts.draftOverride } : node.draft;
    // 🔒 锁定的资产(已上传/复用参考图)不参与 AI 重生成 —— 否则会静默覆盖锁定立绘
    if (node.locked && (node.kind === "character" || node.kind === "scene" || node.kind === "prop")) {
      flash(zh ? "🔒 已锁定的资产不会被重新生成 —— 点卡片 🔒 可替换参考图" : "🔒 Locked asset won't regenerate — click 🔒 on the card to replace");
      return null;
    }
    if (!d.prompt.trim() && d.mode !== "i2v" && d.mode !== "ve") {
      flash(zh ? "先写点 prompt 再生成" : "Write a prompt first");
      return null;
    }
    // 必填媒体校验：i2v 需首帧图 / ve 需视频 / r2v 需参考图 —— 缺了拦在提交前，
    // 别让百炼服务端报「Field required: input.img_url」这种看不懂的错。
    const missingMedia = (getModel(d.modelId)?.fields ?? [])
      .filter((f) => f.kind === "media" && f.required)
      .filter((f) => {
        const v = d.media[f.key as keyof typeof d.media];
        return !v || (Array.isArray(v) && !v.length);
      })
      .map((f) => f.label);
    if (missingMedia.length) {
      flash((zh ? "还缺：" : "Missing: ") + missingMedia.join(zh ? "、" : ", "));
      return null;
    }
    const hasLocalSrc = [d.media.img_url, d.media.video_url].some(
      (m) => m && (m.url.startsWith("/api/") || m.url.startsWith("blob:"))
    );
    if (hasLocalSrc) flash(zh ? "正在准备源…" : "Preparing source…");
    let media = d.media;
    try {
      media = await ensureMediaUploaded(d.media, d.modelId);
    } catch (e) {
      flash(
        (zh ? "源准备失败：" : "Source failed: ") +
          (e instanceof Error ? e.message : String(e))
      );
      return null;
    }
    if (!opts?.draftOverride) updateDraft(node.id, { media }); // 存成 OSS 版，重试/刷新不再失效（override 路径不回写 read-only 视频节点）
    // ── 连线注入：上游节点 = 上下文 ──
    //   · 已出图的节点（资产 / 成片输出 / 短剧静帧）→ 参考图
    //   · 文本节点（创意 note / AI 回答 answer / 对话 chat）→ 拼进 prompt
    let genMedia = media;
    const cs = useCanvasStore.getState();
    const liveJobs = useStudioStore.getState().jobs;
    const upstream = cs.edges
      .filter((e) => e.target === node.id)
      .map((e) => cs.nodes.find((n) => n.id === e.source))
      .filter((n): n is CanvasNode => !!n);
    const doneImageMedia = (n: CanvasNode): JobMedia | undefined => {
      const ids = [n.jobId, n.imageJobId].filter(Boolean) as string[];
      for (const id of ids) {
        const j = liveJobs.find((x) => x.id === id);
        if (j && j.status === "done" && isImageMode(j.mode)) {
          const media = canvasJobImageMedia(j, j.title || "ref.png");
          if (media) return media;
        }
      }
      return undefined;
    };
    const upstreamRefs = upstream
      .map((n) => doneImageMedia(n))
      .filter((u): u is JobMedia => !!u);
    // 上游描述文本拼入 genPrompt（仅用于 API 调用，不修改存储的 prompt）
    const refDescs = upstream
      .map((n) => {
        const k = n.kind ?? "generate";
        if (k === "character") return ["角色", n.title, n.draft.prompt].filter(Boolean).join("·");
        if (k === "scene") return ["场景", n.title, n.draft.prompt].filter(Boolean).join("·");
        if (k === "prop") return ["道具", n.title, n.draft.prompt].filter(Boolean).join("·");
        if (k === "note") return [n.title, n.text].filter(Boolean).join("：").slice(0, 160);
        if (k === "answer") return (n.text || "").trim().slice(0, 300);
        if (k === "chat") return n.draft.prompt.trim().slice(0, 120);
        return "";
      })
      .filter(Boolean);
    const baseGenPrompt = opts?.draftOverride
      ? node.draft.prompt // override 重生成：step1 出静帧用纯分镜剧本(node.draft，不含用户在对话框编辑的运镜/措辞)，避免运镜词污染首帧构图；step2 视频侧才用 rawVideoPrompt 逐字直发
      : (refDescs.length ? `(参考：${refDescs.join("；")}) ${d.prompt}` : d.prompt);
    // 出图画风后缀(坞「画风」选项)——只在出图注入，i2v 基于静帧生成故风格自然贯通全链路
    const genPrompt = opts?.styleSuffix ? `${baseGenPrompt}, ${opts.styleSuffix}` : baseGenPrompt;
    if (upstreamRefs.length) {
      const mfields = getModel(d.modelId)?.fields ?? [];
      const refField = mfields.find((f) => f.kind === "media" && (f.key === "reference_urls" || f.key === "ref_images"));
      const frameField = mfields.find((f) => f.kind === "media" && (f.key === "img_url" || f.key === "first_frame_url"));
      if (refField) {
        const existing = (media[refField.key as keyof typeof media] as JobMedia[] | undefined) ?? [];
        const refMax = (refField as { maxCount?: number }).maxCount ?? 9; // 出图模型参考图上限 → 截断保护，否则角色+场景+道具一多就超限被百炼拒
        const merged = [...existing, ...upstreamRefs].slice(0, refMax);
        genMedia = { ...media, [refField.key]: merged };
        flash(zh ? `已注入 ${Math.max(0, merged.length - existing.length)} 张上游参考图 ✦` : `Injected refs ✦`);
      } else if (frameField && !media[frameField.key as keyof typeof media]) {
        genMedia = { ...media, [frameField.key]: upstreamRefs[0] };
        flash(zh ? "已用上游图作首帧 ✦" : "Used upstream as first frame ✦");
      }
    }
    if (genMedia !== media) {
      try {
        genMedia = await ensureMediaUploaded(genMedia, d.modelId);
      } catch (e) {
        flash(
          (zh ? "参考图准备失败：" : "Reference failed: ") +
            (e instanceof Error ? e.message : String(e))
        );
        return null;
      }
    }
    // ── drama 编排生成节点：出图 → I2V 两步 pipeline ──
    const isDramaGen = node.orchMode === "drama" && (node.kind ?? "generate") === "generate";
    if (isDramaGen) {
      // Step 1: 出静帧（有上游角色立绘 → qwen-image-edit 注入立绘锁脸，否则 t2i）
      const { refs: imgCharRefs, charMap: imgCharMap } = collectUpstreamCharRefs(node.id);
      const imgSceneRefs = collectUpstreamSceneRefs(node.id); // 上游场景立绘 —— 锁场景跨镜一致
      const imgPropRefs = collectUpstreamPropRefs(node.id); // 上游道具立绘 —— 锁道具跨镜一致
      const imgRefs = [...imgCharRefs, ...imgSceneRefs, ...imgPropRefs]; // 角色优先、场景、道具补充（锁脸+锁景+锁物，按模型上限截断）
      const imgEditSpec = imgRefs.length > 0 ? getModel("qwen-image-edit") : undefined;
      const imgModelId = imgEditSpec ? imgEditSpec.id : d.modelId;
      const imgMode = imgEditSpec ? ("i2i" as const) : d.mode;
      const imgParams = imgEditSpec ? { ...imgEditSpec.defaults, size: (d.params.size as string) || "720*1280" } : d.params;
      const editMax = (imgEditSpec?.fields?.find((f) => f.key === "ref_images") as { maxCount?: number } | undefined)?.maxCount ?? 3;
      const rawImgMedia = imgEditSpec ? { ...genMedia, ref_images: [...((genMedia.ref_images as JobMedia[] | undefined) ?? []), ...imgRefs].slice(0, editMax) } : genMedia; // 合并节点预置的手动参考图，不被上游立绘整体覆盖丢失
      let imgMedia = rawImgMedia;
      try {
        imgMedia = await ensureMediaUploaded(rawImgMedia, imgModelId);
      } catch (e) {
        flash(
          (zh ? "参考图准备失败：" : "Reference failed: ") +
            (e instanceof Error ? e.message : String(e))
        );
        return null;
      }
      const imgPrompt = imgEditSpec ? replaceCharNames(genPrompt, imgCharMap) : genPrompt;
      const imgJobId = createJobFromPayload({
        mode: imgMode,
        modelId: imgModelId,
        params: imgParams,
        media: imgMedia,
        prompt: imgPrompt,
        negativePrompt: d.negativePrompt,
        title: `🎬 ${(d.prompt || "Drama").slice(0, 40)} · 静帧`,
      });
      updateNode(node.id, { imageJobId: imgJobId, jobId: imgJobId });
      let imageUrl: string | undefined;
      try {
        const { taskId, imageUrls } = await submitJobRequest({
          modelId: imgModelId,
          params: imgParams,
          media: imgMedia,
          prompt: imgPrompt,
          negativePrompt: d.negativePrompt,
        });
        if (imageUrls?.length) {
          imageUrl = imageUrls[0];
          setJobStatus(imgJobId, { status: "done", videoUrl: imageUrl, completedAt: Date.now() });
        } else if (taskId) {
          setJobStatus(imgJobId, { taskId, status: "running" });
          await waitForJob(imgJobId);
          const imgJob = useStudioStore.getState().jobs.find((j) => j.id === imgJobId);
          imageUrl = imgJob?.videoUrl;
        }
        // drama 静帧归入 Archive
        setJobCategory(imgJobId, "footage");
        if (node.title) setJobTags(imgJobId, [node.title]);
      } catch (e) {
        setJobStatus(imgJobId, { status: "error", errorMessage: e instanceof Error ? e.message : String(e) });
        return imgJobId;
      }
      if (!imageUrl) return imgJobId;
      if (opts?.imageOnly) return imgJobId;
      // 用户中途终止 → 停在已出好的静帧(node.jobId 已是 imgJobId)，不再提交贵的 step2 视频(尤其 r2v 烧额度)。
      //   仅批量循环传 signal，单节点调用不传(避免上一轮 flow 的 stale aborted controller 误伤单条生成)。
      if (opts?.signal?.aborted) return imgJobId;

      // 续写衔接：本视频节点开了「接上一镜」→ 取上一镜(按 x/y 序)视频的实际尾帧当本段第一帧(soft r2v)。
      //   串行：上一镜视频没生成完则 await 等它；首镜/上一镜无视频/抽帧失败 → 留空回退普通生成 + 提示。
      let bridgeFrameUrl: string | undefined;
      if (node.continuePrev && node.dramaVideoOf) {
        const cs = useCanvasStore.getState();
        const shot = cs.nodes.find((n) => n.id === node.dramaVideoOf);
        const groupShots = shot
          ? cs.nodes.filter((n) => n.groupId === shot.groupId && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf)
              .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
          : [];
        const idx = shot ? groupShots.findIndex((n) => n.id === shot.id) : -1;
        const prevShot = idx > 0 ? groupShots[idx - 1] : undefined;
        const prevVideoJobId = prevShot ? videoNodeFor(prevShot.id)?.videoJobId : undefined;
        let stillRendering = false;
        if (prevVideoJobId) {
          let pj = useStudioStore.getState().jobs.find((j) => j.id === prevVideoJobId);
          // 上一镜还在渲染 → 等它(r2v 常 >3min，给 10min；可被「终止」中断)
          if (pj && pj.status !== "done" && pj.status !== "error") { await waitForJob(prevVideoJobId, 600000, opts?.signal); pj = useStudioStore.getState().jobs.find((j) => j.id === prevVideoJobId); }
          const prevVideoUrl = pj?.status === "done" ? pj.videoUrl : undefined;
          stillRendering = !!pj && pj.status !== "done" && pj.status !== "error";
          if (prevVideoUrl) {
            let blobUrl: string | undefined;
            try {
              // 百炼视频是 DashScope OSS 裸 http URL；extractKeyFrames 用 crossOrigin+toDataURL 直接喂会 tainted-canvas、
              //   toDataURL 抛 SecurityError。先 fetch 成同源 blob: URL 再抽帧(同工坊 Card3Video/续写链范式)，blob 同源不污染。
              const blob = await fetch(prevVideoUrl).then((r) => r.blob());
              blobUrl = URL.createObjectURL(blob);
              const dataUrl = (await extractKeyFrames(blobUrl, 1))[0]?.dataUrl;
              if (dataUrl) bridgeFrameUrl = (await uploadDataUrlAsMedia(dataUrl, `chain_${node.id}_${Date.now()}.jpg`, "happyhorse-1.1-r2v")).ossUrl;
            } catch { /* 抽帧/上传失败 → 回退普通生成 */ }
            finally { if (blobUrl) URL.revokeObjectURL(blobUrl); }
          }
        }
        if (!bridgeFrameUrl) flash(stillRendering
          ? (zh ? "接上一镜：上一镜还在渲染，本镜先按普通生成，稍后重生成可接续" : "Continue: previous shot still rendering — generating normally; regenerate later to chain")
          : (zh ? "接上一镜：上一镜暂无视频（或为首镜），本镜按普通生成" : "Continue: no previous video (or first shot) — generating normally"));
      }
      // 续写的等待/抽帧/上传可能耗时 —— 期间用户终止则不再提交付费视频 job
      if (node.continuePrev && opts?.signal?.aborted) return imgJobId;

      // Step 2: 出视频（多链路：续写→soft r2v 接尾帧；有上游角色图→r2v 锁脸；否则 i2v 保构图）
      // 视频 prompt 用【纯分镜剧本】(各镜不同)而非含参考前缀的 genPrompt —— 参考靠 reference_urls(角色/场景/道具图)锁定。
      //   否则 cleanShotPrompt 对含括号的参考描述清洗不净 → 各镜开头残留同一段角色/场景/道具描述、看着全一样。
      const vid = buildShotVideoJob(node, imageUrl, Number(d.params.duration) || 5, d.prompt || "", { ...(opts?.i2vModelId ? { i2vModelId: opts.i2vModelId } : {}), ...(opts?.rawVideoPrompt ? { rawPrompt: opts.rawVideoPrompt } : {}), ...(bridgeFrameUrl ? { bridgeFrameUrl } : {}) });
      let vidMedia = vid.media;
      try {
        vidMedia = await ensureMediaUploaded(vid.media, vid.modelId);
      } catch (e) {
        flash(
          (zh ? "参考图准备失败：" : "Reference failed: ") +
            (e instanceof Error ? e.message : String(e))
        );
        return imgJobId;
      }
      const vidJobId = createJobFromPayload({
        mode: vid.mode,
        modelId: vid.modelId,
        params: vid.params,
        media: vidMedia,
        prompt: vid.prompt,
        title: `🎬 ${(d.prompt || "Drama").slice(0, 40)} · 视频`,
      });
      // takes 取片：出视频不覆盖旧的，而是 push 一条 take(老节点的单 videoJobId 迁成第一条)；
      //   videoJobId 始终镜像「采用的那条」(=刚出的) → 所有读 videoJobId 的地方零改动。
      {
        const liveNode = useCanvasStore.getState().nodes.find((n) => n.id === node.id) ?? node;
        const prevTakes = liveNode.takes ?? (liveNode.videoJobId ? [{ jobId: liveNode.videoJobId, at: 0 }] : []);
        const takes = [...prevTakes, { jobId: vidJobId, at: Date.now() }];
        updateNode(node.id, { takes, activeTakeIdx: takes.length - 1, videoJobId: vidJobId, jobId: vidJobId });
      }
      // 只写回模型/模式/参数 —— 绝不写 prompt/media：视频节点 draft.prompt 是「分镜剧本」
      //   (各镜不同，ensureVideoNode 从分镜复制而来)，写成 vid.prompt(cleanShotPrompt+运镜，各镜雷同)会污染分镜剧本。
      if (!opts?.draftOverride) updateDraft(node.id, { modelId: vid.modelId, mode: vid.mode, params: vid.params }); // override 路径不回写 read-only 视频节点
      try {
        const { taskId } = await submitJobRequest({
          modelId: vid.modelId,
          params: vid.params,
          media: vidMedia,
          prompt: vid.prompt,
        });
        if (taskId) {
          setJobStatus(vidJobId, { status: "running", taskId });
        }
        setJobCategory(vidJobId, "output");
        if (node.title) setJobTags(vidJobId, [node.title]);
      } catch (e) {
        setJobStatus(vidJobId, { status: "error", errorMessage: e instanceof Error ? e.message : String(e) });
        // 视频提交失败 → 移除这条废 take，采用回退到上一条(有则)，否则回退付费静帧；别让通用「生成失败」卡盖住它。
        const back = (useCanvasStore.getState().nodes.find((n) => n.id === node.id)?.takes ?? []).filter((t) => t.jobId !== vidJobId);
        if (back.length) updateNode(node.id, { takes: back, activeTakeIdx: back.length - 1, videoJobId: back[back.length - 1].jobId, jobId: back[back.length - 1].jobId });
        else updateNode(node.id, { takes: [], activeTakeIdx: undefined, videoJobId: undefined, jobId: imgJobId });
      }

      // Step 3: TTS 配音（与 I2V 并行，不阻塞）；用户已终止则跳过，不白跑配音
      if (!opts?.signal?.aborted) canvasGenVoice(node).catch(() => {});

      return vidJobId;
    }

    // ── 常规节点（非 drama generate）──
    const jobId = createJobFromPayload({
      mode: d.mode,
      modelId: d.modelId,
      params: d.params,
      media: genMedia,
      prompt: genPrompt,
      negativePrompt: d.negativePrompt,
      title: (d.prompt || getModel(d.modelId)?.displayName || "Canvas").slice(0, 60),
    });
    const isAsset = node.kind === "character" || node.kind === "scene" || node.kind === "prop";
    if (isAsset) {
      updateNode(node.id, { jobId });
    } else {
      // 输出节点落在输入节点正下方；多个输出向右排开（flowith 式扇出）
      const resultCount = cs.edges.filter((e) => e.source === node.id).length;
      const inH = sizeOf(node).h;
      const resultId = addNode({
        x: node.x + resultCount * (280 + 28),
        y: node.y + inH + 110,
        draft: { ...node.draft, media: genMedia },
        jobId,
      });
      addEdge(node.id, resultId);
      ensureVisible(resultId);
    }
    try {
      const { taskId, imageUrls } = await submitJobRequest({
        modelId: d.modelId,
        params: d.params,
        media: genMedia,
        prompt: genPrompt,
        negativePrompt: d.negativePrompt,
      });
      if (imageUrls?.length) {
        setJobStatus(jobId, {
          status: "done",
          videoUrl: imageUrls[0],
          completedAt: Date.now(),
        });
      } else if (taskId) {
        setJobStatus(jobId, { taskId, status: "running" });
      }
      // 资产节点自动写入 Archive 分类 + 标签
      if (isAsset) {
        setJobCategory(jobId, node.kind === "character" ? "character" : node.kind === "prop" ? "prop" : "scene");
        if (node.title) setJobTags(jobId, [node.title]);
      }
    } catch (e) {
      setJobStatus(jobId, {
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
    return jobId;
  }

  /* ── drama 配音：按说话人匹配角色音色，调 TTS 获取音频 URL ── */
  async function canvasGenVoice(node: CanvasNode, narratorVoice = "longxiaochun"): Promise<string | null> {
    // 从 node.text 提取台词（格式："角色名：台词 · [shotType] · 3s"）
    const raw = node.text?.split(" · ")[0]?.trim();
    if (!raw) {
      flash(zh ? "该节点没有台词/旁白" : "No dialogue found");
      return null;
    }
    // 拆出说话人 + 纯台词（"角色名：台词"）
    const colon = raw.indexOf("：") >= 0 ? raw.indexOf("：") : raw.indexOf(":");
    const hasSpeaker = colon > 0 && colon < 12;
    const speaker = hasSpeaker ? raw.slice(0, colon).trim() : "";
    const text = hasSpeaker ? raw.slice(colon + 1).trim() : raw;
    if (!text) return null;
    // 幂等守卫：同节点已配音 / 配音进行中则跳过，消除 runGraph 与 generateNode 的 TTS 双调用竞态
    const existedVoice = useCanvasStore.getState().nodes.find((n) => n.id === node.id)?.voiceJobId;
    if (existedVoice) return existedVoice;
    if (voiceInFlightRef.current.has(node.id)) return null;
    voiceInFlightRef.current.add(node.id);
    // 选音色：有说话人→同组 character 回查性别/预选音；旁白/无匹配→坞旁白音
    let voice = narratorVoice;
    const isNarration = !speaker || /旁白|画外|独白|字幕|os|v\.?o/i.test(speaker);
    if (!isNarration) {
      const chars = useCanvasStore
        .getState()
        .nodes.filter((n) => n.kind === "character" && (!node.groupId || n.groupId === node.groupId));
      const hit = chars.find(
        (c) => c.title && (c.title === speaker || c.title.includes(speaker) || speaker.includes(c.title))
      );
      if (hit) voice = hit.voicePreset || pickVoiceByPersona(hit.gender ?? "female", hit.voiceTone);
      else voice = pickVoiceByPersona(/女|姐|妈|娘|妹|婶|嫂|奶|姑|她/.test(speaker) ? "female" : "male");
    }
    try {
      const res = await fetch("/api/bailian/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, model: "qwen3-tts-flash", languageType: "Auto" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "TTS failed");
      const audioUrl: string = j.audioUrl;
      // 读音频实际时长，供成片卡点对齐（失败回退 0）
      const voiceDur = await new Promise<number>((resolve) => {
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
        a.onerror = () => resolve(0);
        a.src = audioUrl;
      });
      // ⚠ voiceJobId 字段这里存的是 audioUrl(配音直接出音频 URL，非异步 job id)；DramaDock voiced 步用 truthy 判定，
      //   切勿改成 done(voiceJobId) 那种与 imgDone/vidDone 同构的「查 job 状态」写法，否则恒显未完成
      updateNode(node.id, { voiceJobId: audioUrl, voiceDur });
      // 归入 Archive
      const voiceJobId = createJobFromPayload({
        mode: "t2i" as const,
        modelId: "qwen3-tts-flash",
        params: {},
        media: {},
        prompt: text,
        title: `🔊 ${(node.title || text).slice(0, 40)}`,
      });
      setJobStatus(voiceJobId, { status: "done", videoUrl: audioUrl, completedAt: Date.now() });
      setJobCategory(voiceJobId, "audio");
      if (node.title) setJobTags(voiceJobId, [node.title]);
      return audioUrl;
    } catch (e) {
      flash((zh ? "配音失败：" : "TTS failed: ") + (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      voiceInFlightRef.current.delete(node.id);
    }
  }

  /* ════════ 对话 / 发送 / 引用（flowith 式输入→输出） ════════ */

  // 引用：输出节点点「↩」进队列，下次发送自动连线作上下文
  const addPendingRef = useCallback((id: string) => {
    setPendingRefs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    flash(zh ? "已引用 ↩ 下次发送自动连线作上下文" : "Referenced ↩ — linked on next send");
  }, [flash, zh]);
  const removePendingRef = useCallback((id: string) => {
    setPendingRefs((prev) => prev.filter((x) => x !== id));
  }, []);

  /** 新节点若落在视口外/被底部输入框遮挡 → 轻平移视图把它带回可视区。 */
  const ensureVisible = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const n = useCanvasStore.getState().nodes.find((x) => x.id === id);
      const rect = stageRef.current?.getBoundingClientRect();
      if (!n || !rect) return;
      setView((v) => {
        const sx = n.x * v.scale + v.x;
        const sy = n.y * v.scale + v.y;
        const safeBottom = rect.height - 330; // 给底部输入框留出余量
        let dx = 0;
        let dy = 0;
        if (sy > safeBottom) dy = safeBottom - sy;
        else if (sy < 70) dy = 70 - sy;
        if (sx < 40) dx = 40 - sx;
        else if (sx > rect.width - 360) dx = rect.width - 360 - sx;
        if (!dx && !dy) return v;
        return { ...v, x: v.x + dx, y: v.y + dy };
      });
    });
  }, []);

  /** 聚焦某节点：放大居中(默认 0.95)+ 自动 focus 文本框，供「改写剧本」「剧本刚生成」
   *  等需要立刻舒服编辑的场景 —— 否则节点在缩略视图里太小没法输入。 */
  const focusNode = useCallback((id: string, scale = 0.95) => {
    const n = useCanvasStore.getState().nodes.find((x) => x.id === id);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!n || !rect) return;
    setSelectedNodeId(id);
    const sz = sizeOf(n);
    setView({
      x: rect.width / 2 - (n.x + sz.w / 2) * scale,
      y: 248 - n.y * scale, // 节点顶部落在进度坞(top108~底158)+模型标签下方，留足安全区杜绝重叠
      scale,
    });
    requestAnimationFrame(() => {
      const el = stageRef.current?.querySelector(`[data-node-id="${id}"] textarea`) as HTMLTextAreaElement | null;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }, [sizeOf]);

  /** 新节点落点：有引用 → 最下面那个引用节点的正下方；否则视口上 1/3 中心。 */
  function spawnPoint(refIds: string[], w = 300): { x: number; y: number } {
    const cs = useCanvasStore.getState();
    const refs = refIds.map((id) => cs.nodes.find((n) => n.id === id)).filter((n): n is CanvasNode => !!n);
    if (refs.length) {
      const lowest = refs.reduce((a, b) => (a.y + sizeOf(a).h > b.y + sizeOf(b).h ? a : b));
      return { x: lowest.x, y: lowest.y + sizeOf(lowest).h + 110 };
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 1000) / 2;
    const cy = (rect?.height ?? 700) / 3;
    return {
      x: (cx - view.x) / view.scale - w / 2,
      y: (cy - view.y) / view.scale,
    };
  }

  /* ── 对话：问题节点 → 流式回答节点（输出落输入下方，可再被引用） ── */
  const chatAbort = useRef<AbortController | null>(null);
  async function runChat(text: string, opts?: { chatNodeId?: string; model?: string }) {
    const q = text.trim();
    if (chatBusy || !q) return;
    // 短剧大脑（仅短剧模式生效，避免劫持自由模式的普通对话）：「第N镜/镜头N」定位改写、「角色X」定位
    if (canvasMode === "drama") {
    const shotM = q.match(/第\s*(\d+)\s*镜|镜头\s*(\d+)/);
    if (shotM) {
      const idx = Number(shotM[1] || shotM[2]);
      const shots = useCanvasStore.getState().nodes
        .filter((n) => n.orchMode === "drama" && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf)
        .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
      const target = shots[idx - 1];
      if (target) {
        setSelectedNodeId(target.id);
        focusNode(target.id);
        const instr = q.replace(/(看一?下|定位|找)?\s*(第\s*\d+\s*镜|镜头\s*\d+)/g, "").trim();
        if (instr && /改|换|变|加|调|成|去掉|删|让|把/.test(instr)) {
          flash(zh ? `✦ 正在改写第 ${idx} 镜：${instr}…` : `Rewriting shot ${idx}…`);
          try {
            const oldPrompt = target.draft.prompt || "";
            const np = await rewriteShotImagePrompt(oldPrompt, instr, orchModel);
            if (np) {
              updateDraft(target.id, { prompt: np });
              const undo = () => updateDraft(target.id, { prompt: oldPrompt }); // AI 改写可撤销，保住手写原文
              pushUndo(undo);
              flash(zh ? `✓ 第 ${idx} 镜已改写 —— 点节点 ▶ 重出图` : `Shot ${idx} rewritten`, { label: zh ? "撤销" : "Undo", run: undo });
            }
          } catch (e) {
            flash((zh ? "改写失败：" : "Rewrite failed: ") + (e instanceof Error ? e.message : String(e)));
          }
        } else {
          flash(zh ? `🎯 已定位第 ${idx} 镜「${target.title || ""}」—— 在卡片里改提示词 / 选模型重出图` : `Focused shot ${idx}`);
        }
        return;
      }
      // 没找到该镜 → 不吞消息，降级回普通对话
      flash(zh ? `没找到第 ${idx} 镜（当前共 ${shots.length} 镜），按普通对话处理` : `Shot ${idx} not found — treating as chat`);
    }
    // 短剧大脑：听懂「角色X / 定位X」→ 定位该角色/场景资产节点并聚焦
    const charM = q.match(/(?:角色|定位|找)\s*([\u4e00-\u9fa5A-Za-z]{1,8})/);
    if (charM) {
      const name = charM[1].trim();
      const asset = useCanvasStore.getState().nodes.find(
        (n) => (n.kind === "character" || n.kind === "scene" || n.kind === "prop") && (n.title || "").includes(name)
      );
      if (asset) {
        setSelectedNodeId(asset.id);
        focusNode(asset.id);
        flash(zh ? `🎯 已定位「${asset.title}」—— 改外貌描述后可重出立绘锁脸` : `Focused ${asset.title}`);
        return;
      }
    }
    } // 关闭短剧大脑（drama-only）
    setChatBusy(true);
    try {
      // 1. 问题节点：复用指定/选中的 chat 节点，否则新建
      let chatId: string;
      let promptForLLM = q; // 喂 LLM 的「当前消息」
      // 选中的【非 chat 节点】(分镜/资产/笔记/答案) → 直接当输入锚点：
      //   不新建 chat 节点、不复制其内容、不覆盖它；答案直接挂它【下方】。
      //   (用户反复强调：点节点=输入，往下只长一个新输出，别再造输入节点、别重叠)
      const inputNode = selectedComposeNode && (selectedComposeNode.kind ?? "generate") !== "chat" ? selectedComposeNode : null;
      const reuseId =
        opts?.chatNodeId ??
        (selectedComposeNode && (selectedComposeNode.kind ?? "generate") === "chat"
          ? selectedComposeNode.id
          : undefined);
      if (reuseId) {
        chatId = reuseId;
        updateDraft(chatId, { prompt: q });
        updateNode(chatId, { title: q.slice(0, 24) });
      } else if (inputNode) {
        chatId = inputNode.id; // 锚点 = 选中节点本身，不另建节点
        const ctx = (inputNode.draft.prompt || inputNode.text || "").trim();
        promptForLLM = ctx ? `${ctx}\n\n【修改要求】${q}` : q; // 节点内容 + 指令一起喂 LLM → 产出新答案
      } else {
        const at = spawnPoint(pendingRefs, 300);
        chatId = addNode({
          x: at.x,
          y: at.y,
          draft: { ...defaultDraft(), prompt: q },
          kind: "chat",
          title: q.slice(0, 24),
          text: "",
        });
        pendingRefs.forEach((rid) => addEdge(rid, chatId));
        setPendingRefs([]);
      }
      // 2. 回答节点：chat 正下方；重答时向右排开
      const snap = useCanvasStore.getState();
      const me = snap.nodes.find((n) => n.id === chatId);
      if (!me) return;
      // 只数已有的「答案」子节点(锚点是选中节点时它还连着分镜等其它出边,不能一起算,否则答案被推太右)
      const answerCount = snap.edges.filter((e) => e.source === chatId && (snap.nodes.find((n) => n.id === e.target)?.kind ?? "") === "answer").length;
      const ansId = addNode({
        x: me.x + answerCount * (340 + 28),
        y: me.y + sizeOf(me).h + 110,
        draft: defaultDraft(),
        kind: "answer",
        title: "",
        text: "",
      });
      addEdge(chatId, ansId);
      setSelectedNodeId(null);
      ensureVisible(ansId);
      setStreamingIds((prev) => new Set(prev).add(ansId));
      // 3. 组上下文（血缘祖先：对话线程 + 引用的输出/资产/笔记）
      const fresh = useCanvasStore.getState();
      const msgs = collectChatMessages(
        { ...me, draft: { ...me.draft, prompt: promptForLLM } },
        fresh.nodes,
        fresh.edges,
        useStudioStore.getState().jobs,
        zh
      );
      // 4. 流式写回（节流 ~8次/s，避免 persist 抖动）
      chatAbort.current?.abort();
      const ctrl = new AbortController();
      chatAbort.current = ctrl;
      let latest = "";
      let timer: number | null = null;
      try {
        const full = await streamChat(msgs, {
          signal: ctrl.signal,
          model: opts?.model,
          onToken: (t) => {
            latest = t;
            if (timer == null) {
              timer = window.setTimeout(() => {
                timer = null;
                updateNode(ansId, { text: latest });
              }, 120);
            }
          },
        });
        if (timer != null) window.clearTimeout(timer);
        const final = full || latest;
        updateNode(ansId, { text: final, title: final.split("\n")[0].slice(0, 20) });
      } catch (e) {
        if (timer != null) window.clearTimeout(timer);
        if (!ctrl.signal.aborted) {
          updateNode(ansId, { text: `⚠ ${zh ? "回答失败：" : "Failed: "}${e instanceof Error ? e.message : String(e)}` });
        }
      } finally {
        setStreamingIds((prev) => {
          const s = new Set(prev);
          s.delete(ansId);
          return s;
        });
      }
    } finally {
      setChatBusy(false);
    }
  }

  /* ── 图片/视频发送：选中节点 = 运行它；否则用当前 draft 落新输入节点再运行 ── */
  function submitMedia() {
    const refIds = pendingRefs;
    if (selectedComposeNode && (selectedComposeNode.kind ?? "generate") !== "chat") {
      refIds.forEach((rid) => { if (rid !== selectedComposeNode.id) addEdge(rid, selectedComposeNode.id); });
      setPendingRefs([]);
      const live = useCanvasStore.getState().nodes.find((n) => n.id === selectedComposeNode.id);
      if (live?.dramaVideoOf) {
        // 视频节点：用对话框里编辑后的完整 prompt + 模型/参数/参考图作本次 override，逐字直发重生成这一条
        if (videoRegenInflight.current.has(live.id)) { flash(zh ? "这条视频还在重生成中…" : "Still regenerating this clip…"); return; }
        const gd = useStudioStore.getState().draft;
        const picked = getModel(gd.modelId);
        videoRegenInflight.current.add(live.id);
        void generateNode(live, {
          draftOverride: { prompt: gd.prompt, modelId: gd.modelId, mode: gd.mode, params: gd.params, media: gd.media, negativePrompt: gd.negativePrompt },
          rawVideoPrompt: gd.prompt.trim() || undefined,
          ...(picked && !isImageMode(picked.mode) ? { i2vModelId: gd.modelId } : {}), // ★ 让 buildShotVideoJob 尊重用户选的视频模型(否则它按默认/角色参考决策)
        }).finally(() => videoRegenInflight.current.delete(live.id));
        flash(zh ? "已用当前配置重生成这一条 ✦" : "Regenerating this clip ✦");
      } else if (live?.orchMode === "drama" && (live.kind ?? "generate") === "generate" && composerMode === "video") {
        const gd = useStudioStore.getState().draft;
        const picked = getModel(gd.modelId);
        void generateNode(live, {
          rawVideoPrompt: gd.prompt.trim() || undefined,
          ...(picked && !isImageMode(picked.mode) ? { i2vModelId: gd.modelId } : {}),
        });
        flash(zh ? "正在生成这一镜视频 ✦" : "Generating this shot ✦");
      } else if (live) void generateNode(live);
      return;
    }
    const at = spawnPoint(refIds, 300);
    const d = useStudioStore.getState().draft;
    const id = addComposeAtCenter({ ...d, params: { ...d.params }, media: { ...d.media } }, at);
    // 短剧模式下手动出图/视频归入当前剧集 —— 不再游离、计入坞进度与三层网格
    if (canvasMode === "drama" && activeGroupId) updateNode(id, { orchMode: "drama", groupId: activeGroupId });
    refIds.forEach((rid) => addEdge(rid, id));
    setPendingRefs([]);
    ensureVisible(id);
    const node = useCanvasStore.getState().nodes.find((n) => n.id === id);
    if (node) void generateNode(node);
  }

  /* ── 智能体发送：短剧 → 分步起草剧本（第一步）；创意 → 一次性编排 ── */
  function submitAgent(brief: string, cfg: { mode: OrchMode; shots: number; style: string }) {
    if (cfg.mode === "drama") {
      setShotCount(cfg.shots);
      void runScript(brief, cfg.style);
      return;
    }
    const prefix = cfg.style ? `${cfg.style}风格。` : "";
    void runOrchestrate(prefix + brief, cfg.mode);
  }

  /* ── 回答 → 用作提示词：派生一个图片输入节点（文字成果转生产） ── */
  // 把对话回答(剧本文本)转成正式短剧剧本 note —— 救回"走成普通对话"的剧本
  function answerToScript(node: CanvasNode) {
    const text = (node.text ?? "").trim();
    if (!text) { flash(zh ? "回答还没内容" : "Empty answer"); return; }
    const gid = addGroup(zh ? "新短剧" : "New drama");
    const at = spawnPoint([], 300);
    const nid = addNode({
      x: at.x, y: at.y,
      draft: defaultDraft(),
      kind: "note", title: zh ? "剧本" : "Script", text: text.slice(0, 12000),
      orchMode: "drama", groupId: gid,
    });
    switchCanvasMode("drama");
    setSelectedNodeId(nid);
    requestAnimationFrame(() => focusNode(nid));
    flash(zh ? "✦ 已转成短剧剧本 —— 点节点底部「下一步·拆分镜」继续" : "Converted to drama script ✦");
  }
  function answerToGenerateNode(node: CanvasNode) {
    const body = (node.text || "").trim();
    if (!body) return;
    const imgModel = defaultModelForMode("t2i");
    const childCount = useCanvasStore.getState().edges.filter((e) => e.source === node.id).length;
    const id = addNode({
      x: node.x + childCount * (300 + 28),
      y: node.y + sizeOf(node).h + 110,
      draft: { ...defaultDraft(imgModel?.id), prompt: body.slice(0, 800) },
    });
    addEdge(node.id, id);
    setSelectedNodeId(id);
    ensureVisible(id);
    flash(zh ? "已转成生成节点 —— 在下方输入框可调模型参数" : "Turned into a generate node");
  }

  /* ── 重答：从 answer 找上游 chat，原问题再生成一个回答 ── */
  function rerunAnswer(node: CanvasNode) {
    const cs = useCanvasStore.getState();
    const srcEdge = cs.edges.find((e) => e.target === node.id && (cs.nodes.find((n) => n.id === e.source)?.kind ?? "") === "chat");
    const chatNode = srcEdge ? cs.nodes.find((n) => n.id === srcEdge.source) : undefined;
    if (!chatNode) { flash(zh ? "找不到上游问题节点" : "No upstream question"); return; }
    void runChat(chatNode.draft.prompt, { chatNodeId: chatNode.id });
  }

  /* ════════ 短剧进度坞：批量阶段执行（绑定「活跃组」，多部剧互不干扰） ════════ */

  // 活跃组：选中节点所属组优先，否则最近建的组；无组时回退到「无组的 drama 节点」（兼容旧数据）
  const activeGroupId = useMemo(() => {
    if (selectedNodeId) {
      const sn = nodes.find((n) => n.id === selectedNodeId);
      if (sn?.groupId && groups.some((g) => g.id === sn.groupId)) return sn.groupId;
    }
    return groups.length ? groups[groups.length - 1].id : null;
  }, [selectedNodeId, nodes, groups]);
  const inActiveGroup = useCallback(
    (n: CanvasNode) => (activeGroupId ? n.groupId === activeGroupId : n.orchMode === "drama" && !n.groupId),
    [activeGroupId]
  );
  const dramaShots = useMemo(
    () => nodes.filter((n) => inActiveGroup(n) && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf),
    [nodes, inActiveGroup]
  );
  // 视频输出节点（dramaVideoOf）—— 坞进度/导出顺这读视频/配音(分镜恒为输入、不承载产物)
  const dramaVideoNodes = useMemo(
    () => nodes.filter((n) => inActiveGroup(n) && !!n.dramaVideoOf),
    [nodes, inActiveGroup]
  );
  const dramaAssets = useMemo(
    () => nodes.filter((n) => inActiveGroup(n) && (n.kind === "character" || n.kind === "scene" || n.kind === "prop")),
    [nodes, inActiveGroup]
  );
  /** 活跃剧集的剧本节点（note）—— 分步②③的源。 */
  const dramaScript = useMemo(
    () => nodes.find((n) => inActiveGroup(n) && (n.kind ?? "generate") === "note") ?? null,
    [nodes, inActiveGroup]
  );
  // 对话框「阶段操作区」：drama 模式按 activeStage 在对话框顶部渲染该阶段的配置 + 主批量按钮。
  // 坞瘦身为纯进度条后，所有「做什么」收归这里 —— 对话框成为唯一操作中枢。
  const renderDramaStageOps = () => {
    if (canvasMode !== "drama" || !activeStage) return null;
    if (selectedComposeNode?.dramaVideoOf) return null; // 仅「视频输出节点」让位给完整配置展示；剧本/角色/场景/分镜选中时阶段操作区照常
    const busy = orchBusy || !!dockBusy;
    const META: Record<DockStage, { ic: string; name: string }> = {
      script: { ic: "📝", name: zh ? "剧本" : "Script" },
      shots: { ic: "🎬", name: zh ? "分镜" : "Shots" },
      assets: { ic: "👤", name: zh ? "角色场景" : "Cast" },
      i2v: { ic: "▶", name: zh ? "视频" : "Video" },
      voice: { ic: "🔊", name: zh ? "配音" : "Voice" },
      edit: { ic: "✂", name: zh ? "成片" : "Cut" },
    };
    const m = META[activeStage];
    return (
      <div className="cvc-stageops">
        <span className="cvc-so-name">{m.ic} {m.name}</span>
        <div className="cvc-so-body">
          {activeStage === "script" && (
            <button type="button" className="cvc-so-go" disabled={busy || !dramaScript} onClick={() => { if (dramaScript) { setSelectedNodeId(dramaScript.id); requestAnimationFrame(() => focusNode(dramaScript.id)); } }}>✎ {zh ? "在画布改写剧本" : "Edit script"}</button>
          )}
          {activeStage === "shots" && (<>
            <label className="cvc-so-field"><span>{zh ? "镜数" : "Shots"}</span>
              <input type="number" min={1} max={40} value={dramaShotCount > 0 ? dramaShotCount : ""} disabled={dramaShotCount === 0} placeholder={dramaShotCount === 0 ? (zh ? "自动" : "Auto") : ""} onChange={(e) => setShotCount(Math.max(1, Math.min(40, Math.round(Number(e.target.value)) || 1)))} />
              <button type="button" className={`cv-shots-auto${dramaShotCount === 0 ? " on" : ""}`} onClick={(e) => { e.preventDefault(); setShotCount(dramaShotCount === 0 ? 12 : 0); }} title={zh ? "让模型自己判断分几镜" : "AI decides"}>✦ {zh ? "自动" : "Auto"}</button>
            </label>
            <label className="cvc-so-field"><span>{zh ? "编排" : "LLM"}</span>
              <select value={orchModel} onChange={(e) => setOrchModel(e.target.value)}>{ORCH_LLMS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </label>
            <button type="button" className="cvc-so-go" disabled={busy || !dramaScript} onClick={() => { setActiveStage(null); void runShots(); }}>✦ {zh ? "拆分镜" : "Break"}</button>
            <button type="button" className="cvc-so-add" onClick={addDramaShot} title={zh ? "手动加一个镜" : "Add shot"}>＋</button>
          </>)}
          {activeStage === "assets" && (dramaAssets.length === 0 ? (
            <button type="button" className="cvc-so-go" disabled={busy || dramaShots.length === 0} onClick={() => { setActiveStage(null); void runAssets(); }}>✦ {zh ? "AI 提角色 / 场景" : "Extract cast"}</button>
          ) : (<>
            <label className="cvc-so-field"><span>{zh ? "模型" : "Model"}</span>
              <select value={designModel} onChange={(e) => setDesignModel(e.target.value)}>{t2iModelList.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select>
            </label>
            <label className="cvc-so-field"><span>{zh ? "画风" : "Style"}</span>
              <select value={designStyle} onChange={(e) => setDesignStyle(e.target.value)}>
                <option value="">{zh ? "默认" : "Default"}</option>
                <option value="cinematic film still, dramatic lighting, film grain">{zh ? "电影感" : "Cinematic"}</option>
                <option value="photorealistic, ultra detailed, natural lighting">{zh ? "写实" : "Photoreal"}</option>
                <option value="anime style, cel shading, vibrant colors">{zh ? "动漫" : "Anime"}</option>
                <option value="chinese ink wash painting, elegant brushwork">{zh ? "水墨" : "Ink"}</option>
                <option value="cyberpunk, neon lights, futuristic">{zh ? "赛博" : "Cyber"}</option>
              </select>
            </label>
            <label className="cvc-so-field"><span>{zh ? "尺寸" : "Size"}</span>
              <select value={designSize} onChange={(e) => setDesignSize(e.target.value)}>
                <option value="720*1280">{zh ? "竖 9:16" : "9:16"}</option>
                <option value="1024*1024">{zh ? "方 1:1" : "1:1"}</option>
                <option value="1280*720">{zh ? "横 16:9" : "16:9"}</option>
              </select>
            </label>
            <button type="button" className="cvc-so-go" disabled={busy} onClick={() => { setActiveStage(null); void runDesignStage(designModel, undefined, designStyle); }}>🎨 {zh ? "出图" : "Render"}</button>
            <button type="button" className="cvc-so-add" onClick={() => addDramaAsset("character")} title={zh ? "加角色" : "Add character"}>👤+</button>
            <button type="button" className="cvc-so-add" onClick={() => addDramaAsset("scene")} title={zh ? "加场景" : "Add scene"}>🏞+</button>
            <button type="button" className="cvc-so-add" onClick={() => addDramaAsset("prop")} title={zh ? "加道具" : "Add prop"}>📦+</button>
          </>))}
          {activeStage === "i2v" && (<>
            <label className="cvc-so-field"><span>{zh ? "模型" : "Model"}</span>
              <select value={i2vModel} onChange={(e) => setI2vModel(e.target.value)}>{i2vModelList.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select>
            </label>
            <label className="cvc-so-field"><span>{zh ? "时长" : "Dur"}</span>
              <select value={i2vDuration} onChange={(e) => setI2vDuration(Number(e.target.value))}><option value={0}>{zh ? "跟随分镜" : "Per shot"}</option><option value={3}>3s</option><option value={5}>5s</option><option value={8}>8s</option><option value={10}>10s</option><option value={15}>15s</option></select>
            </label>
            <button type="button" className="cvc-so-go" disabled={busy || dramaShots.length === 0} onClick={() => { setActiveStage(null); void runI2VStage(i2vModel, i2vDuration); }}>▶ {zh ? "转视频" : "Animate"}</button>
            <button type="button" className="cvc-so-add" disabled={busy} onClick={() => { setActiveStage(null); void reanimateAllVideos(); }} title={zh ? "清掉已生成视频，用新逻辑(默认 r2v 锁脸 + 跟随分镜 + 角色场景道具参考)整组重跑" : "Re-run all videos with new logic"}>♻ {zh ? "重转全部" : "Redo all"}</button>
          </>)}
          {activeStage === "voice" && (<>
            <label className="cvc-so-field"><span>{zh ? "音色" : "Voice"}</span>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>{voiceList.map((v) => <option key={v.id} value={v.id}>{v.zh} · {v.desc}</option>)}</select>
            </label>
            <button type="button" className="cvc-so-go" disabled={busy} onClick={() => { setActiveStage(null); void runVoiceStage(voiceId); }}>▶ {zh ? "配音" : "Voice"}</button>
          </>)}
          {activeStage === "edit" && (<>
            <label className="cvc-so-field"><span>{zh ? "画幅" : "Aspect"}</span>
              <select value={editAspect} onChange={(e) => setEditAspect(e.target.value as EditExportCfg["aspect"])}><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option></select>
            </label>
            <label className="cvc-so-field"><span>{zh ? "转场" : "Trans"}</span>
              <select value={editTransition} onChange={(e) => setEditTransition(e.target.value as EditExportCfg["transition"])}>
                <option value="fade">{zh ? "淡入" : "Fade"}</option>
                <option value="fadeblack">{zh ? "过黑" : "Black"}</option>
                <option value="wipeleft">{zh ? "左划" : "Wipe"}</option>
                <option value="circleopen">{zh ? "圆开" : "Circle"}</option>
              </select>
            </label>
            <label className="cvc-so-check"><input type="checkbox" checked={editSubtitle} onChange={(e) => setEditSubtitle(e.target.checked)} /><span>{zh ? "字幕" : "Subs"}</span></label>
            <button type="button" className="cvc-so-go" disabled={busy} onClick={() => { setActiveStage(null); exportToEditor({ aspect: editAspect, transition: editTransition, crossfadeSec: editCrossfade, subtitle: editSubtitle }); }}>✂ {zh ? "合成" : "Compose"}</button>
          </>)}
        </div>
      </div>
    );
  };
  const openStagePanelForNote = useCallback((note: CanvasNode, stage: DockStage) => {
    setSelectedNodeId(note.id);
    setAllSelected(false);
    requestAnimationFrame(() => composerApi.current?.focus());
    setActiveStage(stage);
  }, []);

  // 短剧「下一步」按节点自身剧本计算(用 note.groupId 调度,避免多剧集拆错组);run 时先选中该剧本,活跃组随之同步。
  const nextStepFor = useCallback((note: CanvasNode) => {
    if (canvasMode !== "drama" || (note.kind ?? "") !== "note" || !note.text?.trim()) return null;
    const gid = note.groupId;
    const focus = () => setSelectedNodeId(note.id);
    const shots = nodes.filter((n) => n.groupId === gid && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf); // 只算【分镜】(输入)，排除视频输出节点
    if (!shots.length) return { label: zh ? "拆分镜" : "Break shots", run: () => openStagePanelForNote(note, "shots") };
    const assets = nodes.filter((n) => n.groupId === gid && (n.kind === "character" || n.kind === "scene" || n.kind === "prop"));
    if (!assets.length) return { label: zh ? "提取角色场景" : "Extract cast", run: () => { focus(); void runAssets(note); } };
    const needsRedo = (id?: string) => { if (!id) return true; return useStudioStore.getState().jobs.find((x) => x.id === id)?.status === "error"; };
    const isRunning = (id?: string) => { if (!id) return false; const st = useStudioStore.getState().jobs.find((x) => x.id === id)?.status; return st === "running" || st === "submitting"; };
    if (assets.some((a) => needsRedo(a.jobId))) return { label: zh ? "角色场景出图" : "Render assets", run: () => { focus(); void runDesignStage(designModel, gid, designStyle); } };
    if (shots.some((s) => needsRedo(videoCarrier(s).videoJobId))) return { label: zh ? "分镜转视频" : "Shots to video", run: () => { focus(); void runI2VStage(i2vModel, i2vDuration, gid); } }; // 一键转视频用坞同款配置(默认 r2v 锁脸 + 跟随分镜时长)
    // 视频仍在渲染 → 不放行合成，避免导出缺镜/降级静帧（用户以为做完了）
    if (shots.some((s) => isRunning(videoCarrier(s).videoJobId))) return { label: zh ? "视频渲染中…" : "Rendering…", run: () => flash(zh ? "还有分镜在渲染视频，完成后再合成" : "Some shots are still rendering") };
    // 配音（合成前）：有台词且未配音的分镜 → 先配音，杜绝顺「下一步」一路点出无声成片
    const hasLine = (n: CanvasNode) => !!n.text?.split(" · ")[0]?.trim();
    if (shots.some((s) => hasLine(s) && !videoCarrier(s).voiceJobId)) return { label: zh ? "配音" : "Voice", run: () => { focus(); void runVoiceStage(voiceId, gid); } }; // 用坞同款音色 + 本组 gid(不配错集)
    return { label: zh ? "合成成片" : "Compose cut", run: () => { focus(); exportToEditor({ aspect: "9:16", transition: "fade", crossfadeSec: 0.5, subtitle: true }, gid); } };
  }, [canvasMode, nodes, zh, dramaShotCount, orchModel, designModel, designStyle, designSize, i2vModel, i2vDuration, voiceId, openStagePanelForNote]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 整组重排：剧本 note 置顶居中，其余(资产/分镜)按拓扑层在其下方纵向展开。
     每加一层(分镜/资产)后调用，让剧集组始终是一棵清爽的纵向树。 */
  function relayoutGroup(gid: string) {
    const snap = useCanvasStore.getState();
    const gNodes = snap.nodes.filter((n) => n.groupId === gid);
    if (!gNodes.length) return;
    // 三层网格:剧本(基准) → 角色场景层(横排) → 分镜层(横排),每层居中对齐到剧本中心,层内不乱
    const note = gNodes.find((n) => (n.kind ?? "generate") === "note") ?? null;
    const assets = gNodes.filter((n) => n.kind === "character" || n.kind === "scene" || n.kind === "prop");
    const shots = gNodes.filter((n) => (n.kind ?? "generate") === "generate" && n.id !== note?.id && !n.dramaVideoOf); // 排除视频输出节点：它锚定在来源分镜下方，不进分镜横排
    const cx = note ? note.x + sizeOf(note).w / 2 : (gNodes[0]?.x ?? 0) + 150;
    let y = note ? note.y + sizeOf(note).h + 56 : (gNodes[0]?.y ?? 0);
    const COL_GAP = 28;
    const ROW_GAP = 56;
    const layoutRow = (rows: CanvasNode[]) => {
      if (!rows.length) return;
      const ws = rows.map((n) => sizeOf(n).w);
      const totalW = ws.reduce((a, b) => a + b, 0) + COL_GAP * (rows.length - 1);
      let x = cx - totalW / 2;
      rows.forEach((n, i) => { moveNode(n.id, Math.round(x), Math.round(y)); x += ws[i] + COL_GAP; });
      y += Math.max(...rows.map((n) => sizeOf(n).h)) + ROW_GAP;
    };
    layoutRow(assets); // 角色场景层
    layoutRow(shots);  // 分镜层
    // 视频输出节点：锚定在各自来源分镜的正下方（分镜=输入恒在上，视频=产物在其下）
    shots.forEach((s) => {
      const v = gNodes.find((n) => n.dramaVideoOf === s.id);
      if (!v) return;
      const cur = useCanvasStore.getState().nodes.find((n) => n.id === s.id);
      if (cur) moveNode(v.id, cur.x, Math.round(cur.y + sizeOf(cur).h + 40));
    });
  }

  /* 取某分镜的「视频输出节点」（dramaVideoOf 标记）；无则 undefined。 */
  const videoNodeFor = (shotId: string) =>
    useCanvasStore.getState().nodes.find((n) => n.dramaVideoOf === shotId);

  /* 读取兜底：某分镜的视频/配音承载体 —— 新模型在视频输出节点上，旧数据仍在分镜身上。 */
  const videoCarrier = (shot: CanvasNode) => videoNodeFor(shot.id) ?? shot;

  /* 逐镜接力：一镜出片后，从「本镜之后、按 (x,y) 序、还没出视频」的分镜里挑下一镜，选中并飞过去，
     让作者顺势精修下一镜、心流不断。没有下一镜则交棒去成片(打开成片阶段，门禁由其自带)。 */
  const goNextShot = (videoNode: CanvasNode) => {
    const cs = useCanvasStore.getState();
    const shot = cs.nodes.find((n) => n.id === videoNode.dramaVideoOf);
    if (!shot) return;
    const shots = cs.nodes
      .filter((n) => n.groupId === shot.groupId && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf)
      .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const idx = shots.findIndex((n) => n.id === shot.id);
    const next = shots.slice(idx + 1).find((n) => !videoNodeFor(n.id)?.videoJobId);
    if (next) {
      setSelectedNodeId(next.id);
      focusNode(next.id);
    } else {
      flash(zh ? "已是最后一镜 —— 去成片吧" : "Last shot — on to assembly");
      setActiveStage("edit");
    }
  };

  /* 取片：切换「采用」哪条 take —— videoJobId 同步镜像它，读取方(导出/续写/显示)零改。 */
  const selectTake = (videoNode: CanvasNode, idx: number) => {
    const t = videoNode.takes?.[idx];
    if (!t || idx === videoNode.activeTakeIdx) return;
    updateNode(videoNode.id, { activeTakeIdx: idx, videoJobId: t.jobId, jobId: t.jobId });
  };
  /* 取片：删一条 take(可撤销) —— 至少留一条；删后重算采用指针 + 同步 videoJobId。 */
  const deleteTake = (videoNode: CanvasNode, idx: number) => {
    const takes = videoNode.takes ?? [];
    if (takes.length <= 1 || !takes[idx]) return; // 只剩一条就别删了(要清整节点用删节点)
    const snap = { takes, activeTakeIdx: videoNode.activeTakeIdx, videoJobId: videoNode.videoJobId };
    const next = takes.filter((_, i) => i !== idx);
    const oldActive = videoNode.activeTakeIdx ?? takes.length - 1;
    const newActive = idx < oldActive ? oldActive - 1 : Math.min(oldActive, next.length - 1);
    updateNode(videoNode.id, { takes: next, activeTakeIdx: newActive, videoJobId: next[newActive].jobId, jobId: next[newActive].jobId });
    const undo = () => updateNode(videoNode.id, { takes: snap.takes, activeTakeIdx: snap.activeTakeIdx, videoJobId: snap.videoJobId, jobId: snap.videoJobId });
    pushUndo(undo);
    flash(zh ? "已删除一条 take" : "Take deleted", { label: zh ? "撤销" : "Undo", run: undo });
  };

  /* 片场监视器：按分镜(x,y)序收集所有【已出视频】，在灯箱里串播(缺镜跳过)，看导演自己的样片(dailies)。 */
  const playDailies = () => {
    const cs = useCanvasStore.getState();
    const js = useStudioStore.getState().jobs;
    const shotPos = (v: CanvasNode) => cs.nodes.find((n) => n.id === v.dramaVideoOf) ?? v;
    const urls = cs.nodes
      .filter((n) => !!n.dramaVideoOf)
      .sort((a, b) => { const pa = shotPos(a), pb = shotPos(b); return pa.x === pb.x ? pa.y - pb.y : pa.x - pb.x; })
      .map((v) => { const j = v.videoJobId ? js.find((x) => x.id === v.videoJobId) : undefined; return j?.status === "done" ? j.videoUrl : undefined; })
      .filter((u): u is string => !!u);
    if (!urls.length) { flash(zh ? "还没有可看的视频" : "No videos yet"); return; }
    setZoomMedia({ url: urls[0], video: true, playlist: urls, idx: 0 });
  };

  /* 尾帧延续：抽这条视频的【实际尾帧】→ 传 OSS → 在其下方建一个连线的新生成节点，
     i2v 把尾帧塞 img_url(首帧)，r2v 塞 reference_urls(参考图)；默认模型走 1.1。填提示词即可生成下一段。
     抽帧复用续写那套(fetch→blob→extractKeyFrames，避 tainted-canvas)。 */
  async function continueFromTail(videoNode: CanvasNode, mode: "i2v" | "r2v") {
    const jid = videoNode.videoJobId ?? videoNode.jobId;
    const job = jid ? useStudioStore.getState().jobs.find((j) => j.id === jid) : undefined;
    const url = job?.status === "done" ? job.videoUrl : undefined;
    if (!url) { flash(zh ? "这条还没出视频，先生成再延续尾帧" : "Generate the video first"); return; }
    flash(zh ? "抽尾帧中…" : "Extracting tail frame…");
    let blobUrl: string | undefined;
    let tailOss: string | undefined;
    try {
      const blob = await fetch(url).then((r) => r.blob());
      blobUrl = URL.createObjectURL(blob);
      const dataUrl = (await extractKeyFrames(blobUrl, 1))[0]?.dataUrl;
      if (dataUrl) tailOss = (await uploadDataUrlAsMedia(dataUrl, `tail_${videoNode.id}_${Date.now()}.jpg`, mode === "r2v" ? "happyhorse-1.1-r2v" : "happyhorse-1.1-i2v")).ossUrl;
    } catch { /* 抽帧/上传失败 */ }
    finally { if (blobUrl) URL.revokeObjectURL(blobUrl); }
    if (!tailOss) { flash(zh ? "抽尾帧失败，重试一下" : "Tail extraction failed"); return; }
    const m = defaultModelForMode(mode);
    const tail: JobMedia = { url: tailOss, name: "tail-frame.jpg" };
    const draft: Draft = {
      ...defaultDraft(m.id),
      media: mode === "r2v" ? { reference_urls: [tail] } : { img_url: tail },
      prompt: "",
    };
    const childCount = useCanvasStore.getState().edges.filter((e) => e.source === videoNode.id).length;
    const childId = addComposeAtCenter(draft, { x: videoNode.x + childCount * (300 + 28), y: videoNode.y + sizeOf(videoNode).h + 110 });
    addEdge(videoNode.id, childId);
    setSelectedNodeId(childId);
    flash(zh ? `已抽尾帧 → 新节点(${mode === "r2v" ? "r2v 参考" : "i2v 首帧"}已设)，填提示词即可生成下一段` : "Tail → new node ready, write a prompt to generate");
  }

  /* 节点原则核心：生视频不写回分镜，而是在分镜【下方】新建独立「视频输出节点」，
     连分镜 + 上游角色/场景/道具（出静帧锁脸用）。已有则复用。返回该视频节点。 */
  function ensureVideoNode(shot: CanvasNode): CanvasNode {
    const existing = videoNodeFor(shot.id);
    if (existing) return existing;
    const sh = sizeOf(shot);
    const vId = addNode({
      x: shot.x,
      y: Math.round(shot.y + sh.h + 40), // 落在分镜正下方（relayoutGroup 会再校正）
      draft: { ...shot.draft, media: { ...shot.draft.media } }, // 复制画面词/参数/媒体，出图/i2v 用
      kind: "generate",
      orchMode: "drama",
      groupId: shot.groupId,
      dramaVideoOf: shot.id,
      continuePrev: shot.continuePrev, // 复制分镜上预勾的「接上一镜」开关 —— 首次出整组前就能在分镜上开
      title: `▶ ${(shot.title || "").slice(0, 38)}`,
      text: shot.text, // 复制 台词·镜头·时长 —— 导出切片/字幕/配音都读它
    });
    addEdge(shot.id, vId); // 分镜 → 视频（血缘）
    // 分镜的上游 角色/场景/道具 也连到视频节点 → collectUpstreamCharRefs(视频) 能锁脸/锁道具
    const snap = useCanvasStore.getState();
    snap.edges
      .filter((e) => e.target === shot.id)
      .forEach((e) => {
        const src = snap.nodes.find((n) => n.id === e.source);
        if (src && (src.kind === "character" || src.kind === "scene" || src.kind === "prop")) addEdge(src.id, vId);
      });
    return useCanvasStore.getState().nodes.find((n) => n.id === vId)!;
  }

  /* 分步①剧本：一句话 → 剧本梗概 note（自动成组），秒回、可改。 */
  async function runScript(brief: string, style?: string) {
    if (orchBusy || !brief.trim()) return;
    beginFlow(); setOrchBusy(true);
    flash(zh ? "编剧中… 正在写剧本梗概 ✦" : "Writing the script… ✦");
    try {
      const sc = await orchestrateScript(style ? `${style}风格。${brief}` : brief, orchModel);
      const gid = addGroup(sc.title);
      const body = sc.logline ? `【${sc.logline}】\n\n${sc.synopsis}` : sc.synopsis;
      const at = spawnPoint([], 300);
      const id = addNode({
        x: at.x, y: at.y,
        draft: defaultDraft(),
        kind: "note", title: sc.title, text: body,
        orchMode: "drama", groupId: gid,
      });
      requestAnimationFrame(() => focusNode(id));
      flash(zh ? "剧本好了 ✦ 可直接在卡片里改写，或顶部坞 → 拆分镜" : "Script ready ✦ edit inline or Dock → Shots");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const net = /fetch failed|500|timeout|超时|ECONN|network/i.test(msg);
      flash(net ? (zh ? "网络忙 / 模型超时，请再点一次题材 ↻" : "Network busy — tap a genre again ↻") : (zh ? "写剧本失败：" : "Failed: ") + msg);
    } finally {
      setOrchBusy(false);
    }
  }

  /* 续下一集：在上一集组【下方】新建一集组（共用班底 —— 拆分镜时跨组自动连到已有角色/场景）。
     mode=ai → AI 续写承接剧情；mode=blank → 空白剧本用户自己写。 */
  async function continueNextEpisode(prevNote: CanvasNode, mode: "ai" | "blank" | "clone") {
    if (orchBusy) return;
    const snap = useCanvasStore.getState();
    const castNames = snap.nodes
      .filter((n) => (n.kind === "character" || n.kind === "scene") && n.orchMode === "drama")
      .map((n) => (n.title || "").trim())
      .filter(Boolean);
    const baseTitle = (prevNote.title || (zh ? "短剧" : "Drama")).replace(/\s*·\s*(?:续集|Next).*$/i, "").trim() || (zh ? "短剧" : "Drama");
    const gid = addGroup(`${baseTitle} · ${zh ? "续集" : "Next"}`);
    const prevNodes = snap.nodes.filter((n) => n.groupId === prevNote.groupId);
    const maxY = prevNodes.length ? Math.max(...prevNodes.map((n) => n.y + sizeOf(n).h)) : prevNote.y + 240;
    const x = prevNote.x;
    const y = Math.round(maxY + 160); // 落在上一集组下方

    // 复刻：把本集用到的整套角色场景(组内 + 被本集分镜引用的，按 title 去重)复制进新组 —— 每集自带一套班底、自成一体
    if (mode === "clone") {
      const prevShots = snap.nodes.filter((n) => n.groupId === prevNote.groupId && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf);
      const castMap = new Map<string, CanvasNode>();
      const addCast = (n?: CanvasNode) => {
        if (n && (n.kind === "character" || n.kind === "scene" || n.kind === "prop")) {
          const t = (n.title || "").trim();
          if (t && !castMap.has(t)) castMap.set(t, n);
        }
      };
      snap.nodes.forEach((n) => { if (n.groupId === prevNote.groupId) addCast(n); });
      snap.edges.forEach((e) => { if (prevShots.some((s) => s.id === e.target)) addCast(snap.nodes.find((n) => n.id === e.source)); });
      castMap.forEach((c) => {
        const cnid = addNode({ x, y, draft: { ...c.draft, media: { ...c.draft.media } }, kind: c.kind, title: c.title, text: c.text, jobId: c.jobId, orchMode: "drama", groupId: gid });
        updateNode(cnid, { charIdx: c.charIdx, gender: c.gender, voiceTone: c.voiceTone, voicePreset: c.voicePreset, locked: c.locked });
      });
    }

    let title = `${baseTitle} · ${zh ? "续集" : "Next"}`;
    let body = "";
    if (mode === "ai") {
      beginFlow(); setOrchBusy(true);
      flash(zh ? "续写下一集中… 带着班底承接剧情 ✦" : "Writing next episode… ✦");
      try {
        const sc = await orchestrateNextEpisode(prevNote.text || "", castNames, undefined, orchModel);
        title = sc.title;
        body = sc.logline ? `【${sc.logline}】\n\n${sc.synopsis}` : sc.synopsis;
      } catch (e) {
        flash((zh ? "续写失败：" : "Failed: ") + (e instanceof Error ? e.message : String(e)));
        setOrchBusy(false);
        return;
      }
      setOrchBusy(false);
    } else if (mode === "clone") {
      body = prevNote.text || ""; // 复制上一集剧本当起点，你再改成下一集（或点 AI 改写续写）
    }
    const noteId = addNode({ x, y, draft: defaultDraft(), kind: "note", title: mode === "blank" ? "" : title, text: body, orchMode: "drama", groupId: gid });
    addEdge(prevNote.id, noteId); // 续集血缘：上一集剧本 → 下一集剧本
    if (gid) relayoutGroup(gid); // 排好 note + 复制进来的班底
    switchCanvasMode("drama");
    requestAnimationFrame(() => focusNode(noteId));
    flash(mode === "ai"
      ? (zh ? "下一集剧本好了 ✦ 直接拆分镜，班底自动延续" : "Next episode ready ✦ cast carries over")
      : mode === "clone"
      ? (zh ? "已复刻 ✦ 班底+剧本已复制进新框，改剧本 / 拆分镜即可" : "Cloned ✦ cast + script copied")
      : (zh ? "空白下一集已就位 ✦ 写剧本，拆分镜时班底自动延续" : "Blank next episode ready ✦"));
  }

  /* 自己写剧本：建一个空剧本 note(成组) + 放大聚焦，用户直接在卡片里写 / 粘贴整篇。 */
  function startBlankScript() {
    if (orchBusy) return;
    const gid = addGroup(zh ? "新短剧" : "New drama");
    const at = spawnPoint([], 300);
    const id = addNode({
      x: at.x, y: at.y,
      draft: defaultDraft(),
      kind: "note", title: "", text: "",
      orchMode: "drama", groupId: gid,
    });
    switchCanvasMode("drama");
    requestAnimationFrame(() => focusNode(id));
    flash(zh ? "空白剧本已就位 ✦ 直接写 / 粘贴，再去顶部坞拆分镜" : "Blank script ready ✦ write or paste, then break down");
  }

  /* 自定义步骤流：手动加一个空分镜到活跃剧集(连剧本)，聚焦让用户自己写画面/台词。 */
  function addDramaShot() {
    const note = dramaScript;
    if (!note) { flash(zh ? "先写剧本再加分镜" : "Write a script first"); return; }
    const id = addNode({
      x: note.x, y: note.y,
      draft: defaultDraft(defaultModelForMode("t2i")?.id),
      kind: "generate", title: "", text: "",
      orchMode: "drama", groupId: note.groupId,
    });
    addEdge(note.id, id);
    if (note.groupId) relayoutGroup(note.groupId);
    requestAnimationFrame(() => focusNode(id));
    flash(zh ? "加了一个空分镜 ✦ 写画面 / 台词" : "Blank shot added ✦");
  }

  /* 自定义步骤流：手动加一个空角色/场景/道具到活跃剧集，聚焦让用户自己写描述。 */
  function addDramaAsset(kind: "character" | "scene" | "prop") {
    const note = dramaScript;
    if (!note) { flash(zh ? "先写剧本" : "Write a script first"); return; }
    const id = addNode({
      x: note.x, y: note.y,
      draft: defaultDraft(defaultModelForMode("t2i")?.id),
      kind, title: "", text: "",
      orchMode: "drama", groupId: note.groupId,
    });
    if (note.groupId) relayoutGroup(note.groupId);
    requestAnimationFrame(() => focusNode(id));
    const label = kind === "character" ? (zh ? "角色" : "character") : kind === "prop" ? (zh ? "道具" : "prop") : (zh ? "场景" : "scene");
    flash(zh ? `加了一个空${label} ✦ 写描述` : `Blank ${label} added ✦`);
  }

  /* 剧本节点·AI 改写：基于当前剧本 + 指令(+风格) 改写，写回 note 并聚焦。 */
  async function rewriteScriptNode(instruction: string, style?: string, noteOverride?: CanvasNode) {
    if (orchBusy) { flash(zh ? "正在处理中，请稍候…" : "Busy, please wait…"); return; }
    const note = noteOverride ?? dramaScript ?? nodes.find((n) => n.id === selectedNodeId && (n.kind ?? "") === "note") ?? null;
    if (!note) { flash(zh ? "先选中 / 写一个剧本" : "Select a script first"); return; }
    beginFlow(); setOrchBusy(true);
    setRewriting(true);
    flash(zh ? "AI 改写剧本中…" : "Rewriting script…");
    try {
      const oldText = note.text || "";
      const next = await rewriteScript(oldText, instruction, style, orchModel);
      if (next) {
        updateNode(note.id, { text: next });
        requestAnimationFrame(() => focusNode(note.id));
        const undo = () => updateNode(note.id, { text: oldText }); // AI 改写可撤销，保住手写剧本
        pushUndo(undo);
        flash(zh ? "剧本已改写 ✦ 可继续调，或去顶部坞拆分镜" : "Script rewritten ✦", { label: zh ? "撤销" : "Undo", run: undo });
      } else {
        flash(zh ? "改写无结果" : "No change");
      }
    } catch (e) {
      flash((zh ? "改写失败：" : "Failed: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOrchBusy(false);
      setRewriting(false);
    }
  }

  /* 剧本节点·上传：导入 .txt/.md 剧本文件 → 填入 note 并聚焦。 */
  async function uploadScriptFile(file: File) {
    try {
      flash(zh ? "解析剧本中…" : "Parsing…");
      const raw = (await extractScriptText(file)).trim();
      if (!raw) { flash(zh ? "没读到文本内容（可能是扫描件 / 空白文件）" : "No text found"); return; }
      const truncated = raw.length > 12000;
      const text = truncated ? raw.slice(0, 12000) : raw;
      const tip = truncated ? (zh ? `（剧本超长，已截取前 12000 字 / 共 ${raw.length} 字）` : ` (kept first 12000 of ${raw.length})`) : "";
      const title = file.name.replace(/\.[^.]+$/, "");
      const note = dramaScript ?? nodes.find((n) => n.id === selectedNodeId && (n.kind ?? "") === "note") ?? null;
      if (!note) {
        // 起草阶段(空画布)直接上传 → 新建剧本 note 装上传内容，不再报错
        const gid = addGroup(title || (zh ? "上传剧本" : "Uploaded"));
        const at = spawnPoint([], 300);
        const nid = addNode({
          x: at.x, y: at.y,
          draft: defaultDraft(),
          kind: "note", title, text,
          orchMode: "drama", groupId: gid,
        });
        switchCanvasMode("drama");
        setSelectedNodeId(nid);
        requestAnimationFrame(() => focusNode(nid));
        flash((zh ? "剧本已上传 ✦ 去顶部坞拆分镜" : "Script uploaded ✦") + tip);
        return;
      }
      updateNode(note.id, { text, title: note.title || title });
      requestAnimationFrame(() => focusNode(note.id));
      flash((zh ? "剧本已导入 ✦ 可直接改，或去拆分镜" : "Script imported ✦") + tip);
    } catch (e) {
      flash((zh ? "导入失败：" : "Import failed: ") + (e instanceof Error ? e.message : String(e)));
    }
  }

  /* 资产卡上传参考图 → 建 done job 作锁定立绘，下游出图/视频按它保持一致（道具/角色都适用）。 */
  async function uploadAssetRef(node: CanvasNode, file: File) {
    try {
      flash(zh ? "上传参考图…" : "Uploading…");
      const m = await uploadMediaFile(file, node.draft.modelId);
      const jid = createJobFromPayload({
        mode: "t2i" as const,
        modelId: node.draft.modelId,
        params: {},
        media: { img_url: m },
        prompt: node.text || node.title || "",
        title: `🔒 ${node.title || (zh ? "参考图" : "ref")}`,
      });
      setJobStatus(jid, { status: "done", videoUrl: canvasMediaDisplaySrc(m), completedAt: Date.now() });
      setJobCategory(jid, node.kind === "character" ? "character" : node.kind === "prop" ? "prop" : "scene");
      if (node.title) setJobTags(jid, [node.title]);
      updateNode(node.id, { imageJobId: jid, jobId: jid, locked: true });
      flash(zh ? "参考图已锁定 ✦ 下游出图将保持一致" : "Reference locked ✦");
    } catch (e) {
      flash((zh ? "上传失败：" : "Upload failed: ") + (e instanceof Error ? e.message : String(e)));
    }
  }

  /* 分镜节点就地改写画面词 → rewriteShotImagePrompt → 更新 draft.prompt（点 ▶ 重出图生效）。 */
  async function rewriteNodePrompt(node: CanvasNode, instruction: string) {
    if (!instruction.trim()) return;
    try {
      flash(zh ? "改写画面词…" : "Rewriting…");
      const oldPrompt = node.draft.prompt || "";
      const np = await rewriteShotImagePrompt(oldPrompt, instruction, orchModel);
      if (np) {
        updateDraft(node.id, { prompt: np });
        const undo = () => updateDraft(node.id, { prompt: oldPrompt }); // AI 改写可撤销
        pushUndo(undo);
        flash(zh ? "画面已改写 ✦ 点节点 ▶ 重出图生效" : "Rewritten ✦ re-render to apply", { label: zh ? "撤销" : "Undo", run: undo });
      }
    } catch (e) {
      flash((zh ? "改写失败：" : "Rewrite failed: ") + (e instanceof Error ? e.message : String(e)));
    }
  }

  /* 从资产库复用已有角色/场景/道具 → 落对应资产节点，复用其图并锁定一致性。 */
  function reuseAssetToCanvas(job: Job) {
    const kind: CanvasNodeKind = job.category === "character" ? "character" : job.category === "prop" ? "prop" : "scene";
    const at = spawnPoint([], 300);
    const draft = defaultDraft(defaultModelForMode("t2i")?.id);
    draft.prompt = job.prompt || "";
    const nid = addNode({
      x: at.x, y: at.y, draft, kind,
      title: job.tags?.[0] || job.title || "",
      text: job.prompt || "",
      imageJobId: job.id, jobId: job.id,
      orchMode: canvasMode === "drama" ? "drama" : undefined,
      groupId: canvasMode === "drama" ? (activeGroupId ?? undefined) : undefined,
    });
    updateNode(nid, { locked: true });
    if (canvasMode === "drama" && activeGroupId) relayoutGroup(activeGroupId);
    setSelectedNodeId(nid);
    setAssetLibOpen(false);
    flash(zh ? "已复用资产到画布 ✦ 参考图已锁定一致性" : "Asset reused ✦ reference locked");
  }

  /* 分步②分镜：取活跃剧本 → 拆 N 个分镜(同组)，整组重排。 */
  async function runShots(noteOverride?: CanvasNode) {
    if (orchBusy) return;
    const note = noteOverride ?? dramaScript;
    if (!note?.text?.trim()) { flash(zh ? "先写剧本再拆分镜" : "Write a script first"); return; }
    const gid = note.groupId;
    beginFlow(); setOrchBusy(true);
    flash(zh ? (dramaShotCount > 0 ? `拆分镜中… 约 ${dramaShotCount} 镜 ✦` : "拆分镜中… AI 自动判断镜数 ✦") : "Breaking down shots… ✦");
    try {
      const shots = await orchestrateShots(note.text, dramaShotCount, orchModel);
      const imgModel = defaultModelForMode("t2i");
      const created: { id: string; title: string }[] = [];
      shots.forEach((s) => {
        const draft = defaultDraft(imgModel?.id);
        // 逐秒分镜调度(segmentPlan)落进画面词：卡片文本框直接显示+可编辑，出图/出视频(genPrompt)都用它。
        // 修复「segmentPlan 被丢弃 + draft.prompt 落空」——以前用不存在的 imagePrompt，导致出图 prompt 为空。
        draft.prompt = s.segmentPlan || s.imagePrompt || s.dialogue || s.text;
        draft.params = { ...draft.params, size: "720*1280" }; // 竖屏 9:16 出图
        if (s.durationSec) draft.params.duration = s.durationSec;
        const textForNode = [s.dialogue || s.text, s.shotType && `[${s.shotType}]`, s.durationSec && `${s.durationSec}s`]
          .filter(Boolean).join(" · ");
        const sid = addNode({
          x: note.x, y: note.y, // 临时落点，relayoutGroup 会重排
          draft, kind: "generate", title: s.title, text: textForNode,
          orchMode: "drama", groupId: gid,
        });
        addEdge(note.id, sid); // 剧本 → 分镜 血缘连线
        created.push({ id: sid, title: s.title || "" });
      });
      // 遍历新建的 generate 节点，根据 entities 匹配上游 character/scene/prop 节点 → 自动建边
      for (let i = 0; i < created.length; i++) {
        const genNode = created[i];
        const orchNode = shots[i];
        if (orchNode?.entities?.length) {
          const cs = useCanvasStore.getState();
          for (const entityName of orchNode.entities) {
            const sg = cs.nodes.find((n) => n.id === genNode.id)?.groupId; // 优先连本组班底(复刻集连自己的副本),无则跨组回落(续写/共用集)
            const assetNode = cs.nodes.find(n =>
              (n.kind === "character" || n.kind === "scene" || n.kind === "prop") && n.title === entityName && n.groupId === sg
            ) ?? cs.nodes.find(n =>
              (n.kind === "character" || n.kind === "scene" || n.kind === "prop") && n.title === entityName
            );
            if (assetNode) {
              const edgeExists = cs.edges.some(e => e.source === assetNode.id && e.target === genNode.id);
              if (!edgeExists) {
                useCanvasStore.getState().addEdge(assetNode.id, genNode.id);
              }
            }
          }
        }
      }
      if (gid) relayoutGroup(gid);
      setSelectedNodeId(null); // 拆完分镜取消剧本选中：对话框退出改写态、画布不被糊住
      setTimeout(() => fitView(), 150); // 等组重排+节点尺寸稳定，再 fit 看全
      // 不再自动提资产（用户反对自动化）——需要角色一致时手动点坞「角色场景」
      flash(zh ? `拆出 ${shots.length} 镜 ✦ 需要锁角色就到顶部坞「角色场景」手动提取` : `${shots.length} shots ✦ tap Cast to extract (manual)`);
    } catch (e) {
      flash((zh ? "拆分镜失败：" : "Failed: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOrchBusy(false);
    }
  }

  /* 提取角色/场景资产 + 按镜号连到分镜（runShots 自动调用；也供坞单独重做）。返回资产数。 */
  async function doAssets(note: CanvasNode, shotList: { id: string; title: string }[], gid?: string): Promise<number> {
    if (!note.text?.trim() || !shotList.length) return 0;
    const specs = await orchestrateAssets(note.text, shotList.map((s) => s.title), orchModel);
    const imgModel = defaultModelForMode("t2i");
    const shotIdByIndex = new Map<number, string>();
    shotList.forEach((s, i) => shotIdByIndex.set(i + 1, s.id));
    let charSeq = 0;
    specs.forEach((spec) => {
      // 去重：优先复用【本组】同名班底(复刻集连自己的副本)，无则跨组回落(共用集) —— 都只补连线、不重复建。
      const csAll = useCanvasStore.getState().nodes;
      const existed = csAll.find(
        (n) => (n.kind === "character" || n.kind === "scene" || n.kind === "prop") && (n.title || "") === spec.node.title && n.groupId === gid,
      ) ?? csAll.find(
        (n) => (n.kind === "character" || n.kind === "scene" || n.kind === "prop") && (n.title || "") === spec.node.title,
      );
      if (existed) {
        spec.appearsIn.forEach((mi) => { const sid = shotIdByIndex.get(mi); if (sid) addEdge(existed.id, sid); });
        return;
      }
      const draft = defaultDraft(imgModel?.id);
      draft.prompt = spec.node.text;
      draft.params = { ...draft.params, size: "720*1280" }; // 竖屏 9:16 出图（短剧默认竖屏）
      const aid = addNode({
        x: note.x, y: note.y,
        draft, kind: spec.node.kind, title: spec.node.title, text: spec.node.text,
        orchMode: "drama", groupId: gid,
      });
      if (spec.node.kind === "character") {
        const gender = spec.node.gender ?? "female";
        const voiceTone = spec.node.voiceTone;
        updateNode(aid, { charIdx: ++charSeq, gender, voiceTone, voicePreset: pickVoiceByPersona(gender, voiceTone) });
      }
      spec.appearsIn.forEach((mi) => { const sid = shotIdByIndex.get(mi); if (sid) addEdge(aid, sid); });
    });
    if (gid) relayoutGroup(gid);
    return specs.length;
  }

  /* 角色场景（坞按钮）：拆分镜已自动提取，这里供单独补充 / 重做。 */
  async function runAssets(noteOverride?: CanvasNode) {
    if (orchBusy) return;
    const note = noteOverride ?? dramaScript;
    if (!note?.text?.trim()) { flash(zh ? "先写剧本" : "Write a script first"); return; }
    const shots = useCanvasStore.getState().nodes.filter((n) => n.groupId === note.groupId && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf);
    if (!shots.length) { flash(zh ? "先拆分镜再定角色场景" : "Break down shots first"); return; }
    beginFlow(); setOrchBusy(true);
    flash(zh ? "提炼角色 / 场景中… ✦" : "Extracting cast & scenes… ✦");
    try {
      const n = await doAssets(note, shots.map((s) => ({ id: s.id, title: s.title || "" })), note.groupId);
      requestAnimationFrame(() => fitView());
      flash(zh ? `补充了 ${n} 个角色/场景 ✦ 顶部坞 → 批量出图` : `${n} assets ✦`);
    } catch (e) {
      flash((zh ? "提资产失败：" : "Failed: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOrchBusy(false);
    }
  }

  /* 出图：所有未出静帧的短剧节点（资产 + 分镜）批量 T2I */
  async function runDesignStage(modelId: string, gid?: string, style?: string) {
    const belongs = (n: CanvasNode) => (gid ? n.groupId === gid : inActiveGroup(n));
    const designSpec = getModel(modelId);
    const snap = useCanvasStore.getState();
    const liveJobs = useStudioStore.getState().jobs;
    for (const n of snap.nodes) {
      if (!belongs(n) || (n.kind !== "character" && n.kind !== "scene" && n.kind !== "prop")) continue;
      // 模型变了就切模型+默认参数；尺寸恒按批量配置统一(竖屏/方/横)，避免角色场景沿用模型默认尺寸
      if (n.draft.modelId !== modelId && designSpec) {
        updateDraft(n.id, { modelId: designSpec.id, mode: designSpec.mode, params: { ...n.draft.params, ...designSpec.defaults, size: designSize } });
      } else {
        updateDraft(n.id, { params: { ...n.draft.params, size: designSize } });
      }
    }
    const pending = useCanvasStore.getState().nodes.filter((n) => {
      if (!belongs(n)) return false;
      // 只给资产(角色/场景/道具)出图 —— 分镜的帧在「视频」步自动出，不在这里(不覆盖分镜输出)
      if (n.kind !== "character" && n.kind !== "scene" && n.kind !== "prop") return false;
      const job = n.jobId ? liveJobs.find((j) => j.id === n.jobId) : undefined;
      return !job || job.status === "error";
    });
    if (!pending.length) { flash(zh ? "没有待出图的角色 / 场景 / 道具" : "No assets need imaging"); return; }
    beginFlow(); setDockBusy({ stage: "assets", done: 0, total: pending.length });
    try {
      for (let i = 0; i < pending.length; i++) {
        if (flowAbort.current?.signal.aborted) break; // 用户终止 → 不再启动后续出图
        const node = useCanvasStore.getState().nodes.find((n) => n.id === pending[i].id);
        if (!node) continue;
        await generateNode(node, { imageOnly: true, styleSuffix: style });
        setDockBusy({ stage: "assets", done: i + 1, total: pending.length });
      }
      flash(zh ? "角色 / 场景出图完成 ✦ 下一步分镜转视频" : "Assets rendered ✦");
    } finally {
      setDockBusy(null);
    }
  }

  /* 视频：已出图的分镜逐个 I2V（按镜头类型自动加运镜词） */
  async function runI2VStage(modelId: string, duration: number, gid?: string) {
    const belongs = (n: CanvasNode) => (gid ? n.groupId === gid : inActiveGroup(n));
    const i2vSpec = getModel(modelId) ?? defaultModelForMode("i2v");
    const snap = useCanvasStore.getState();
    // 待出视频的【分镜】(输入节点；排除视频输出节点自身)：其承载体还没视频(兼容旧 videoJobId 仍在分镜上的数据)
    const ready = snap.nodes.filter((n) => {
      if (!belongs(n) || (n.kind ?? "generate") !== "generate" || n.dramaVideoOf) return false;
      return !videoCarrier(n).videoJobId;
    }).sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x)); // 按 (x,y) 镜序处理 —— 续写衔接靠它保证「上一镜先生成」，否则取不到尾帧静默回退
    if (!ready.length) { flash(zh ? "没有可出视频的分镜" : "No shots to animate"); return; }
    if (i2vSpec.id === "wan2.7-flf") flash(zh ? "首尾帧模型批量按首帧出视频（尾帧可逐镜在工坊指定）" : "FLF runs from first frame in batch");
    beginFlow(); setDockBusy({ stage: "i2v", done: 0, total: ready.length });
    const gid2 = gid ?? ready[0]?.groupId;
    try {
      for (let i = 0; i < ready.length; i++) {
        if (flowAbort.current?.signal.aborted) break; // 用户终止 → 不再启动后续镜
        const shot = useCanvasStore.getState().nodes.find((n) => n.id === ready[i].id);
        if (!shot) continue;
        // 节点原则：在分镜【下方】新建/复用「视频输出节点」，出静帧 + I2V 都挂它身上，分镜恒为输入、原样不动
        const vnode = ensureVideoNode(shot);
        if (duration > 0) updateDraft(vnode.id, { params: { ...vnode.draft.params, duration } }); // 用户选了固定时长 → 统一覆盖；duration=0(跟随分镜) → 保留分镜各自的 durationSec
        await generateNode(vnode, { i2vModelId: i2vSpec.id, signal: flowAbort.current?.signal }); // 内部：出静帧(上游角色锁脸) → I2V 两步 pipeline；终止信号可在 step2/step3 前短路
        setDockBusy({ stage: "i2v", done: i + 1, total: ready.length });
      }
      if (gid2) relayoutGroup(gid2); // 收尾：所有视频节点落到各自分镜正下方、不重叠
      flash(zh ? "批量出视频完成 ✦ 视频已作为独立节点连在各分镜下方" : "Batch I2V done ✦");
    } finally {
      setDockBusy(null);
    }
  }

  /* 一键重转全部视频：清掉当前剧组已生成视频的 videoJobId(分镜随之变「未转」) →
     runI2VStage 用新逻辑(默认 r2v 锁脸 + 跟随分镜 + 角色/场景/道具参考注入)整组重跑。 */
  async function reanimateAllVideos(gid?: string) {
    if (orchBusy || dockBusy) { flash(zh ? "正在处理中，请稍候…" : "Busy…"); return; }
    const snap = useCanvasStore.getState();
    const belongs = (n: CanvasNode) => (gid ? n.groupId === gid : inActiveGroup(n));
    const vnodes = snap.nodes.filter((n) => belongs(n) && !!n.dramaVideoOf && !!n.videoJobId);
    if (!vnodes.length) { flash(zh ? "没有已生成的视频可重转" : "No videos to re-run"); return; }
    // 只清 videoJobId(分镜随之变「未转」→ runI2VStage 重跑)；保留 imageJobId(静帧回退显示)与 voiceJobId
    // (配音只取决于台词、重转不改台词 → 复用旧配音、不重跑 TTS。这是有意的，勿删。)
    vnodes.forEach((vn) => updateNode(vn.id, { videoJobId: undefined, jobId: vn.imageJobId }));
    flash(zh ? `♻ 重转 ${vnodes.length} 条视频…(默认 r2v 锁脸 + 跟随分镜)` : `Re-running ${vnodes.length} videos…`);
    await runI2VStage(i2vModel, i2vDuration, gid);
  }

  /* 配音：有台词且未配音的分镜批量 TTS */
  async function runVoiceStage(voiceId: string, gid?: string) {
    const snap = useCanvasStore.getState();
    const belongs = (n: CanvasNode) => (gid ? n.groupId === gid : inActiveGroup(n)); // 多剧集：按目标组而非「活跃组」配音，杜绝配错集
    // 待配音的【分镜】(输入；排除视频输出节点)：有台词、其承载体还没配音
    const pending = snap.nodes.filter((n) => {
      if (!belongs(n) || (n.kind ?? "generate") !== "generate" || n.dramaVideoOf) return false;
      if (videoCarrier(n).voiceJobId) return false;
      return !!n.text?.split(" · ")[0]?.trim();
    });
    if (!pending.length) { flash(zh ? "没有需要配音的镜头" : "No shots need voicing"); return; }
    beginFlow(); setDockBusy({ stage: "voice", done: 0, total: pending.length });
    try {
      for (let i = 0; i < pending.length; i++) {
        if (flowAbort.current?.signal.aborted) break; // 用户终止 → 不再启动后续配音
        const shot = useCanvasStore.getState().nodes.find((n) => n.id === pending[i].id);
        if (!shot) continue;
        // 配音挂到该分镜的【视频输出节点】(成片从那读)；视频节点在生视频后已存在，无则回落分镜自身
        const target = videoNodeFor(shot.id) ?? shot;
        await canvasGenVoice(target, voiceId);
        setDockBusy({ stage: "voice", done: i + 1, total: pending.length });
      }
      flash(zh ? "批量配音完成 ✦" : "Batch TTS done ✦");
    } finally {
      setDockBusy(null);
    }
  }

  /* 成片：镜头按 y 排序 → EditorProject → /editor */
  function exportToEditor(cfg: EditExportCfg, gid?: string) {
    const belongs = (n: CanvasNode) => (gid ? n.groupId === gid : inActiveGroup(n));
    const snap = useCanvasStore.getState();
    const liveJobs = useStudioStore.getState().jobs;
    const ordered = snap.nodes
      .filter((n) => belongs(n) && (n.kind ?? "generate") === "generate" && !n.dramaVideoOf) // 只遍历【分镜】(输入)；画面/配音从其视频输出节点读
      .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    if (!ordered.length) { flash(zh ? "画布无短剧镜头" : "No drama shots"); return; }

    const clips: EditorClip[] = [];
    let cursorSec = 0;
    let skipped = 0;        // 缺画面被跳过的镜
    let droppedVoice = 0;   // 跳过的镜里本已配好音、被一并丢弃的段数
    let stillFrame = 0;     // 视频未就绪、降级用静帧的镜
    for (const n of ordered) {
      const durMatch = n.text?.match(/(\d+(?:\.\d+)?)s/);
      const dur = durMatch ? parseFloat(durMatch[1]) : 5;
      const dialogue = n.text?.split(" · ")[0]?.trim() || "";
      // 画面/配音从该分镜的【视频输出节点】读；无则兼容旧数据回落到分镜自身
      const vc = videoNodeFor(n.id) ?? n;

      const videoJob = vc.videoJobId ? liveJobs.find((j) => j.id === vc.videoJobId) : undefined;
      const imageJob = vc.imageJobId ? liveJobs.find((j) => j.id === vc.imageJobId) : undefined;
      const videoUrl = videoJob?.status === "done" ? videoJob.videoUrl : undefined;
      const imageUrl = imageJob?.status === "done" ? canvasJobImageDisplaySrc(imageJob) : undefined;

      // 缺画面(视频+静帧都没有) → 跳过且【不推进游标】，保持 a1 配音与 v1 拼接对齐；计数防静默丢
      if (!videoUrl && !imageUrl) { skipped++; if (vc.voiceJobId) droppedVoice++; continue; }
      if (!videoUrl && imageUrl) stillFrame++;

      // 镜头 slot：有配音且配音(adur)长于画面(dur)时取 adur —— 让每条 a1 配音各占独立时间窗、不叠播串音，
      //   v1 画面定格末帧补满 slot(holdLastFrame)，音画都按 slot 推进游标保持同步。无配音/配音更短则 slot=dur(行为不变)。
      const adur = vc.voiceJobId ? (vc.voiceDur && vc.voiceDur > 0 ? vc.voiceDur : dur) : dur;
      const slot = Math.max(dur, adur);

      clips.push({
        id: `pl-v1-${n.id}`,
        sourceUrl: (videoUrl || imageUrl)!,
        sourceTitle: n.title || `镜头 ${clips.length + 1}`,
        duration: slot,
        in: 0,
        out: slot,
        holdLastFrame: slot > dur, // 画面短于 slot(配音更长) → 导出定格末帧补满，不留黑帧、不截断配音
        volume: videoUrl ? 0.6 : 0,
        muted: !videoUrl,
        speed: 1,
        mediaType: videoUrl ? "video" : "image",
        trackId: "v1",
        startSec: cursorSec,
        text: cfg.subtitle && dialogue ? { content: dialogue, position: "bottom" as const, color: "#fff", sizePx: 26 } : undefined,
      });

      if (vc.voiceJobId) {
        clips.push({
          id: `pl-a1-${n.id}`,
          sourceUrl: vc.voiceJobId,
          sourceTitle: `${n.title || "镜头"} 配音`,
          duration: adur,
          in: 0,
          out: adur,
          volume: 1.0,
          speed: 1,
          mediaType: "audio",
          trackId: "a1",
          startSec: cursorSec,
        });
      }
      cursorSec += slot;
    }

    if (!clips.length) { flash(zh ? "无可用素材（需先出图/视频）" : "No media available"); return; }

    const projName = snap.projects.find((p) => p.id === snap.activeId)?.name || "Pipeline 成片";
    // 自适应分辨率：>6 镜降到 720 避免 ffmpeg.wasm 浏览器端导出 OOM(显存减半,9:16 短剧 720 足够)；
    // ≤6 镜保 1080 画质。剪辑器里仍可手动改回 1080(自行承担多镜 OOM 风险)。
    const vCount = clips.filter((c) => c.trackId === "v1").length;
    const editorProject: EditorProject = {
      id: `pl-edit-${Date.now()}`,
      name: projName,
      clips,
      aspect: cfg.aspect as EditorAspect,
      crossfadeSec: cfg.crossfadeSec,
      transitionType: cfg.transition,
      exportHeight: vCount > 6 ? 720 : 1080,
      tracks: DEFAULT_TRACKS,
      bgm: undefined,
      updatedAt: Date.now(),
    };

    useStudioStore.getState().editorLoadProject(editorProject);
    const warn: string[] = [];
    if (skipped > 0) warn.push(zh ? `${skipped} 镜缺画面已跳过${droppedVoice ? `（含 ${droppedVoice} 段配音）` : ""}` : `${skipped} skipped${droppedVoice ? `, ${droppedVoice} voice lost` : ""}`);
    if (stillFrame > 0) warn.push(zh ? `${stillFrame} 镜视频未就绪用了静帧` : `${stillFrame} still-frame`);
    flash(
      (zh ? `已导出 ${vCount} 个镜头到剪辑器 ✦` : `Exported ${vCount} shot(s) ✦`) +
        (warn.length ? (zh ? `（${warn.join("；")}）` : ` (${warn.join("; ")})`) : "")
    );
    router.push("/editor");
  }

  /* ── 节点继承：从任意节点派生子节点（延续 / 参考 / 延伸） ──
     延续 = 接下一镜(图→i2v / 视频→ve 续写)；参考 = 成片当参考图喂新生成(r2v 保主体换场景)；
     延伸 = 复制本节点配方开同源兄弟。延续/参考需要成片，延伸任意节点皆可。 */
  function deriveNode(
    node: CanvasNode,
    mode: "continue" | "reference" | "extend"
  ) {
    const job = node.jobId ? jobs.find((j) => j.id === node.jobId) : undefined;
    const done = job && job.status === "done" && job.videoUrl ? job : undefined;
    let draft: Draft;
    if (mode === "extend") {
      draft = { ...node.draft, media: { ...node.draft.media } };
    } else if (mode === "continue") {
      if (!done) {
        flash(zh ? "先生成出成片，再延续下一镜" : "Generate a result first");
        return;
      }
      if (isImageMode(done.mode)) {
        const m = defaultModelForMode("i2v");
        draft = {
          ...defaultDraft(m.id),
          media: { img_url: { url: done.videoUrl!, name: done.title } },
          prompt: "",
        };
      } else {
        const m = defaultModelForMode("ve");
        draft = {
          ...defaultDraft(m.id),
          media: { video_url: { url: done.videoUrl!, name: done.title } },
          prompt: "",
        };
      }
    } else {
      // reference
      if (!done) {
        flash(zh ? "先生成出成片，再作参考" : "Generate a result first");
        return;
      }
      if (!isImageMode(done.mode)) {
        flash(zh ? "「参考」目前支持图片成片" : "Reference supports image results");
        return;
      }
      const m = defaultModelForMode("r2v");
      draft = {
        ...defaultDraft(m.id),
        media: { reference_urls: [{ url: done.videoUrl!, name: done.title }] },
        prompt: "",
      };
    }
    // 子节点放在父节点下方，按已有子节点数横向错开避免重叠
    const childCount = edges.filter((e) => e.source === node.id).length;
    const childId = addComposeAtCenter(draft, {
      x: node.x + childCount * (300 + 28),
      y: node.y + sizeOf(node).h + 110,
    });
    addEdge(node.id, childId);
    return childId;
  }

  /* 成片节点内联快捷（🎞动画 / ✂编辑 / ⟳变体）→ 统一走 deriveNode */
  function branch(parent: CanvasNode, _job: Job, kind: "animate" | "edit" | "vary") {
    deriveNode(parent, kind === "vary" ? "extend" : "continue");
  }

  /* ── 适配视图：把所有节点框进「安全视口」（顶部让短剧坞，底部让输入框） ── */
  const fitView = useCallback(() => {
    const nodes = useCanvasStore.getState().nodes; // 用 store 最新节点：避免 setTimeout/异步闭包拿到旧值导致 fit 不全
    if (!nodes.length) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const W = rect?.width ?? 1200;
    const H = rect?.height ?? 700;
    // 顶部安全区：模式 Tab 常驻(~96)，短剧坞再加一截(~160)
    const hasDock = canvasMode === "drama"; // 坞只属于短剧模式：自由创作绝不留坞安全区
    const TOP_SAFE = hasDock ? 160 : 96;
    // 底部让出展开的智能输入框(composer ~280px)；空画布它自动收起，故仅有节点时才让足。
    const BOT_SAFE = nodes.length ? 280 : 96;
    const availH = Math.max(200, H - TOP_SAFE - BOT_SAFE);
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 60;
    const minY = Math.min(...ys) - 60;
    const maxX = Math.max(...nodes.map((n) => n.x + sizeOf(n).w)) + 60;
    const maxY = Math.max(...nodes.map((n) => n.y + sizeOf(n).h)) + 90;
    // 适配时只缩小、不放大过头 —— 上限 0.9，保持「全局视角」的克制感。
    const FIT_MAX = 0.9;
    const scale = Math.min(
      FIT_MAX,
      Math.max(MIN_SCALE, Math.min(W / (maxX - minX), availH / (maxY - minY)))
    );
    setView({
      x: W / 2 - ((minX + maxX) / 2) * scale,
      y: TOP_SAFE + availH / 2 - ((minY + maxY) / 2) * scale,
      scale,
    });
  }, [nodes, canvasMode]);

  /* 自动整理画布：每组内部重排 → 剧集组竖向堆叠不重叠 → 游离节点排成网格 → 适配视图。只挪位、不删任何节点(功能不阉割)。 */
  function tidyCanvas() {
    const snap = useCanvasStore.getState();
    const fresh = () => useCanvasStore.getState().nodes;
    const x0 = 160;
    let y = 80;
    // 剧集组：逐组内部重排 + 竖向堆叠
    snap.groups.forEach((g) => {
      relayoutGroup(g.id);
      const gNodes = fresh().filter((n) => n.groupId === g.id);
      if (!gNodes.length) return;
      const minX = Math.min(...gNodes.map((n) => n.x));
      const minY = Math.min(...gNodes.map((n) => n.y));
      moveGroup(g.id, Math.round(x0 - minX), Math.round(y - minY));
      const after = fresh().filter((n) => n.groupId === g.id);
      y = Math.max(...after.map((n) => n.y + sizeOf(n).h)) + 140;
    });
    // 游离节点(无组)：排成 3 列网格，放在剧集组右侧
    const loose = fresh().filter((n) => !n.groupId);
    if (loose.length) {
      const colX = x0 + 920;
      let lx = colX, ly = 80, rowH = 0, cnt = 0;
      loose.forEach((n) => {
        moveNode(n.id, Math.round(lx), Math.round(ly));
        const sz = sizeOf(n);
        rowH = Math.max(rowH, sz.h);
        lx += sz.w + 36;
        if (++cnt % 3 === 0) { lx = colX; ly += rowH + 36; rowH = 0; }
      });
    }
    requestAnimationFrame(() => fitView());
    flash(zh ? "已整理画布 ✦ 剧集竖排、班底分镜归位" : "Tidied ✦");
  }

  // 切到某项目、其节点首次就位时自动适配一次（每个项目独立记忆，换项目重新适配）
  const fittedProject = useRef<string | null>(null);
  useEffect(() => {
    if (fittedProject.current === activeId || !nodes.length) return;
    fittedProject.current = activeId;
    fitView();
  }, [activeId, nodes, fitView]);

  /* ── 视图快捷键：F 适配全部、0 重置缩放（不在输入框时） ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key === "f" || e.key === "F") { fitView(); e.preventDefault(); }
      else if (e.key === "0") { setView((v) => ({ ...v, scale: 1 })); e.preventDefault(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fitView]);

  /* ── 空格抓手：按住空格 → 任意处拖拽都平移画布（Figma 惯例） ── */
  useEffect(() => {
    const editable = (el: HTMLElement | null) =>
      el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || !!el?.isContentEditable;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spaceRef.current && !editable(e.target as HTMLElement)) {
        spaceRef.current = true;
        stageRef.current?.classList.add("cv-grab");
        e.preventDefault(); // 阻止空格滚动页面
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        stageRef.current?.classList.remove("cv-grab");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ── 连线(屏幕空间贝塞尔)：上游底部中心 → 下游顶部中心，纵向血缘流 ── */
  const worldToScreen = (wx: number, wy: number) => ({
    x: wx * view.scale + view.x,
    y: wy * view.scale + view.y,
  });
  // 折叠组的 id 集 —— 组内节点/边隐藏，组框收成封面卡
  const collapsedGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.collapsed).map((g) => g.id)),
    [groups]
  );
  const isHidden = useCallback(
    (n: CanvasNode) => !!n.groupId && collapsedGroupIds.has(n.groupId),
    [collapsedGroupIds]
  );
  // 每个组的世界坐标外框（含拖动 overlay 偏移）
  const groupBoxes = useMemo(() => {
    return groups
      .map((g) => {
        const gn = nodes.filter((n) => n.groupId === g.id);
        if (!gn.length) return null;
        // 刚起草(组内只有一个剧本节点、还没拆分镜)→ 不画组框，避免单节点套框的视觉噪音；折叠态仍显示封面卡
        if (gn.length <= 1 && !g.collapsed) return null;
        const gd = groupDrag && groupDrag.id === g.id ? groupDrag : null;
        const ox = gd ? gd.dx : 0;
        const oy = gd ? gd.dy : 0;
        const minX = Math.min(...gn.map((n) => n.x)) + ox;
        const minY = Math.min(...gn.map((n) => n.y)) + oy;
        const maxX = Math.max(...gn.map((n) => n.x + sizeOf(n).w)) + ox;
        const maxY = Math.max(...gn.map((n) => n.y + sizeOf(n).h)) + oy;
        return { group: g, minX, minY, maxX, maxY, count: gn.length, nodes: gn };
      })
      .filter(Boolean) as { group: CanvasGroup; minX: number; minY: number; maxX: number; maxY: number; count: number; nodes: CanvasNode[] }[];
  }, [groups, nodes, groupDrag, sizeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const edgePaths = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // 节点有效位移 = 自身拖动 delta，或所属组的拖动 delta
    const off = (n: CanvasNode): { dx: number; dy: number } => {
      if (dragDelta && dragDelta.id === n.id) return dragDelta;
      if (groupDrag && n.groupId === groupDrag.id) return { dx: groupDrag.dx, dy: groupDrag.dy };
      return { dx: 0, dy: 0 };
    };
    const offX = (n: CanvasNode) => off(n).dx;
    const offY = (n: CanvasNode) => off(n).dy;
    return edges
      .map((e) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        if (isHidden(s) || isHidden(t)) return null; // 折叠组内的边不画
        const ss = sizeOf(s);
        const ts = sizeOf(t);
        const a = worldToScreen(s.x + offX(s) + ss.w / 2, s.y + offY(s) + ss.h);
        const b = worldToScreen(t.x + offX(t) + ts.w / 2, t.y + offY(t));
        const dy = Math.max(24, Math.abs(b.y - a.y) * 0.38);
        return { id: e.id, source: e.source, target: e.target, kind: (s.kind ?? "generate") as string, d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      })
      .filter(Boolean) as { id: string; source: string; target: string; kind: string; d: string; mx: number; my: number }[];
  }, [edges, nodes, view, sizeTick, dragDelta, groupDrag, isHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const homeHref = zh ? "/" : "/en";
  const studioHref = zh ? "/studio" : "/en/studio";
  const directorHref = zh ? "/director" : "/en/director";

  // 反向联动：把画布节点的成片送回线性工坊 / 导演台，闭合「画布⇄工坊⇄导演台」。
  function openInStudio(job: Job) {
    loadJobIntoDraft(job.id);
    flash(zh ? "已载入工坊 ✎" : "Loaded into Studio ✎");
    router.push(studioHref);
  }
  async function sendNodeToDirector(job: Job) {
    const ok = await prepareDirectorFromJob(job, { zh, flash });
    if (ok) {
      flash(zh ? "已刷入导演台 🎬" : "Sent to Director 🎬");
      router.push(directorHref);
    }
  }

  // 提示库就地套用到指定节点（复用工坊 STARTERS / 用户保存的 prompt，三种范围）
  function applyStarterToNode(
    nodeId: string,
    starter: Starter,
    scope: "prompt" | "params" | "all"
  ) {
    if (scope === "prompt") {
      updateDraft(nodeId, {
        prompt: starter.prompt,
        ...(starter.negativePrompt ? { negativePrompt: starter.negativePrompt } : {}),
      });
      return;
    }
    const patch: Partial<Draft> = {
      mode: starter.mode,
      modelId: starter.modelId,
      params: { ...starter.params },
      media: {}, // 换模式/模型时清掉旧媒体，与工坊一致
    };
    if (scope === "all") {
      patch.prompt = starter.prompt;
      if (starter.negativePrompt) patch.negativePrompt = starter.negativePrompt;
    }
    updateDraft(nodeId, patch);
  }
  function applySavedToNode(
    nodeId: string,
    saved: SavedPrompt,
    scope: "prompt" | "params" | "all"
  ) {
    if (scope === "prompt") {
      updateDraft(nodeId, {
        prompt: saved.prompt,
        ...(saved.negativePrompt ? { negativePrompt: saved.negativePrompt } : {}),
      });
      return;
    }
    const patch: Partial<Draft> = {};
    const mode = saved.mode ?? (saved.modelId ? getModel(saved.modelId)?.mode : undefined);
    if (mode) patch.mode = mode;
    if (saved.modelId) patch.modelId = saved.modelId;
    if (saved.params) patch.params = { ...saved.params };
    if (scope === "all") {
      patch.prompt = saved.prompt;
      if (saved.negativePrompt) patch.negativePrompt = saved.negativePrompt;
    }
    updateDraft(nodeId, patch);
  }
  const libraryNode = nodes.find((n) => n.id === libraryForNode);
  const helpHref = zh ? "/help" : "/en/help";

  return (
    <div className="canvas-app">
      <div className="studio-safelight" aria-hidden />

      <header className="chrome">
        <div className="left">
          <Link href={homeHref} className="logo-link">
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0 <b>CANVAS</b>
            </div>
          </Link>
          <CanvasProjectMenu zh={zh} busy={running || !!dockBusy || orchBusy} />
        </div>
        <TopNav current="canvas" />
        <div className="right">
          <Link
            prefetch={false}
            href={helpHref}
            className="chrome-icon"
            title={zh ? "帮助" : "Help"}
            style={{ textDecoration: "none" }}
          >
            ?
          </Link>
          <button
            type="button"
            className="chrome-icon"
            onClick={() => setSettingsOpen(true)}
            title={zh ? "API 密钥设置" : "API key settings"}
            aria-label="settings"
          >
            ⚙
          </button>
          <LocaleSwitcher />
        </div>
      </header>

      <div
        className="cv-stage"
        ref={stageRef}
        style={{
          backgroundSize: `${30 * view.scale}px ${30 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onStagePointerDown}
        onClickCapture={(e) => {
          // 用指针坐标重新 hit-test(拖拽 setPointerCapture 会把 click target 改写成 article)。
          const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const nodeEl = hit?.closest(".cv-node") as HTMLElement | null;
          // 兜底选中:点节点内任意处(含视频画面 / 配音播放器 controls)都选中该节点 → 对话框同步它的配置。
          // 否则视频/音频 controls 会吃掉 pointerdown 让 startNodeDrag 不触发、节点选不中，
          // 点不同视频对话框就一直停在上一个(用户报「点哪个都一样」的根因)。
          if (nodeEl) { const nid = nodeEl.getAttribute("data-node-id"); if (nid) setSelectedNodeId(nid); }
          // 点图/视频再额外放大灯箱。
          if (hit && (hit.tagName === "IMG" || hit.tagName === "VIDEO") && nodeEl) {
            const src = (hit.getAttribute("src") || "").split("#")[0];
            if (src) { e.stopPropagation(); setZoomMedia({ url: src, video: hit.tagName === "VIDEO" }); }
          }
        }}
        onPointerMove={(e) => {
          onStagePointerMove(e);
          onNodeDragMove(e);
          onGroupDragMove(e);
          onLinkMove(e);
          onResizeMove(e);
        }}
        onPointerUp={(e) => {
          onStagePointerUp(e);
          endNodeDrag(e);
          endGroupDrag(e);
          endLink(e);
          endResize(e);
        }}
        onContextMenu={onContextMenu}
        onDoubleClick={onStageDoubleClick}
      >
        <svg className={`cv-edges${selectedNodeId ? " focus" : ""}`}>
          <defs>
            {/* 方向箭头 —— context-stroke 跟随边色(含选中态变色)；userSpaceOnUse 固定屏幕尺寸 */}
            <marker id="cv-arrow" markerWidth="10" markerHeight="10" refX="6.5" refY="4.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M 1.5 1.5 L 7 4.5 L 1.5 7.5" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {edgePaths.map((p) => (
            <g key={p.id} data-edge-kind={p.kind} className={`cv-edge-g${selectedEdgeId === p.id ? " sel" : ""}${selectedNodeId === p.source || selectedNodeId === p.target ? " active" : ""}`}>
              <path d={p.d} className="cv-edge-hit" onClick={(ev) => { ev.stopPropagation(); setSelectedEdgeId(p.id); }}
                onPointerEnter={() => setHoverEdge({ s: p.source, t: p.target })}
                onPointerLeave={() => setHoverEdge((h) => (h && h.s === p.source && h.t === p.target ? null : h))} />
              <path d={p.d} className="cv-edge-path" markerEnd="url(#cv-arrow)" />
              <g className="cv-edge-del" transform={`translate(${p.mx} ${p.my})`}
                onClick={(ev) => { ev.stopPropagation(); deleteEdgeWithUndo(p.id); }}>
                <circle r="9" />
                <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" />
              </g>
            </g>
          ))}
          {linking && (() => {
            const s = nodes.find((n) => n.id === linking.sourceId);
            if (!s) return null;
            const ss = sizeOf(s);
            const a = worldToScreen(s.x + ss.w / 2, s.y + ss.h);
            const b = { x: linking.x, y: linking.y };
            const dy = Math.max(24, Math.abs(b.y - a.y) * 0.38);
            return <path d={`M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`} className="cv-edge-temp" />;
          })()}
        </svg>

        <div
          className="cv-world"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {/* 剧集组框（在节点下层）：边界 + 标题栏（剧名/镜数/折叠）；折叠时收成封面卡 */}
          {groupBoxes.map((gb) => (
            <GroupFrame
              key={gb.group.id}
              box={gb}
              zh={zh}
              jobs={jobs}
              active={!!selectedNodeId && nodes.find((n) => n.id === selectedNodeId)?.groupId === gb.group.id}
              onTitleDown={(e) => startGroupDrag(e, gb.group.id)}
              onToggleCollapse={() => updateGroup(gb.group.id, { collapsed: !gb.group.collapsed })}
              onRename={(t) => updateGroup(gb.group.id, { title: t })}
              onRemove={() => {
                const g = gb.group;
                const killed = nodes.filter((n) => n.groupId === g.id);
                const killedEdges = edges.filter((e) => killed.some((k) => k.id === e.source || k.id === e.target));
                killRunningJobs(killed); // 停在途 job 轮询(撤销不还原 job——已提交无法取消，本就该停)
                removeGroup(g.id, true);
                const undoG = () => { restore(killed, killedEdges, [g]); };
                pushUndo(undoG);
                flash(zh ? `已删除「${g.title}」` : `Removed "${g.title}"`, {
                  label: zh ? "撤销" : "Undo",
                  run: undoG,
                });
              }}
            />
          ))}
          {nodes.filter((n) => !isHidden(n)).map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              selected={allSelected || selectedNodeId === n.id}
              linkHint={linking && linking.targetId === n.id ? (linking.valid ? "ok" : "bad") : undefined}
              isLinkSrc={linking?.sourceId === n.id}
              edgeHi={hoverEdge ? hoverEdge.s === n.id || hoverEdge.t === n.id : false}
              job={n.jobId ? jobs.find((j) => j.id === n.jobId) : undefined}
              imageJob={n.imageJobId ? jobs.find((j) => j.id === n.imageJobId) : undefined}
              videoJob={n.videoJobId ? jobs.find((j) => j.id === n.videoJobId) : undefined}
              zh={zh}
              width={nodeWidth(n)}
              streaming={streamingIds.has(n.id)}
              dimmed={canvasMode === "drama" && stageDimsNode(activeStage, n)}
              dragOffset={dragDelta?.id === n.id ? dragDelta : (groupDrag && n.groupId === groupDrag.id ? { dx: groupDrag.dx, dy: groupDrag.dy } : undefined)}
              onMeasure={onMeasureNode}
              onSelect={() => setSelectedNodeId(n.id)}
              onDragHandle={(e) => startNodeDrag(e, n)}
              onResizeStart={(e, dir) => startResize(e, n, dir)}
              onPromptChange={(v) => updateDraft(n.id, { prompt: v })}
              onGenerate={
                (n.kind ?? "generate") === "chat"
                  ? () => runChat(n.draft.prompt, { chatNodeId: n.id })
                  : () => generateNode(n)
              }
              onRemove={() => deleteNodeWithUndo(n.id)}
              onNextStep={nextStepFor(n)?.run}
              nextStepLabel={nextStepFor(n)?.label}
              nextStepBusy={orchBusy || !!dockBusy}
              rewriting={rewriting}
              onBranch={(kind, job) => branch(n, job, kind)}
              onOpenInStudio={openInStudio}
              onSendToDirector={sendNodeToDirector}
              onDerive={(mode) => deriveNode(n, mode)}
              onStartLink={(e) => startLink(e, n.id)}
              onUpdateNode={(patch) => updateNode(n.id, patch)}
              onGenVoice={n.orchMode === "drama" ? () => void canvasGenVoice(n) : undefined}
              onAddRef={() => addPendingRef(n.id)}
              onUseAsPrompt={(n.kind ?? "") === "answer" ? () => answerToGenerateNode(n) : undefined}
              onUseAsScript={(n.kind ?? "") === "answer" ? () => answerToScript(n) : undefined}
              onRerun={(n.kind ?? "") === "answer" ? () => rerunAnswer(n) : undefined}
              onUploadRef={(file) => uploadAssetRef(n, file)}
              onRewrite={(n.kind ?? "") === "note" ? (instr) => void rewriteScriptNode(instr, undefined, n) : n.orchMode === "drama" && (n.kind ?? "generate") === "generate" ? (instr) => rewriteNodePrompt(n, instr) : undefined}
              onContinueEpisode={(n.kind ?? "") === "note" && n.orchMode === "drama" ? (mode) => void continueNextEpisode(n, mode) : undefined}
              onNextShot={n.dramaVideoOf ? () => goNextShot(n) : undefined}
              takeList={n.takes && n.takes.length > 1 ? n.takes.map((t, i) => ({ at: t.at, url: jobs.find((j) => j.id === t.jobId)?.videoUrl, active: i === (n.activeTakeIdx ?? n.takes!.length - 1) })) : undefined}
              onSelectTake={n.dramaVideoOf ? (i) => selectTake(n, i) : undefined}
              onDeleteTake={n.dramaVideoOf ? (i) => deleteTake(n, i) : undefined}
              onTailContinue={(mode) => continueFromTail(n, mode)}
            />
          ))}
        </div>


        {hasHydrated && modeHydrated && nodes.length === 0 && (
          <div className="cv-empty cv-empty-solo">
            {canvasMode === "drama" ? (
              /* 短剧首屏：选题材一键起草 / 自己写，并指引"之后一路点下一步" */
              <div className="cv-empty-card cv-empty-card-hero">
                <div className="cv-empty-card-h"><span className="cv-empty-card-ic">🎬</span>{zh ? "开一部短剧" : "Start a drama"}</div>
                <p className="cv-empty-card-d">{zh ? "选个题材 → 填好一句话剧情，改成你的故事再开拍 —— 之后顺着卡片底部「下一步」一路点：拆分镜 → 出图 → 视频 → 成片" : "Pick a genre → a one-line premise is filled in — tweak it to your story, then start; later follow the Next button: shots → images → video → cut"}</p>
                <div className="cv-empty-genres">
                  {EMPTY_GENRES.map((g) => (
                    <button key={g.id} type="button" className="cv-empty-genre" disabled={orchBusy} title={zh ? g.seed : g.seedEn} onClick={() => { switchCanvasMode("drama"); composerApi.current?.primeAgent("drama", zh ? g.seed : g.seedEn, g.shots); }}>
                      <span className="cv-empty-genre-ic">{g.emoji}</span>{zh ? g.zh : g.en}
                    </button>
                  ))}
                </div>
                <div className="cv-empty-card-acts">
                  <button type="button" className="cv-empty-btn" disabled={orchBusy} onClick={startBlankScript}>✎ {zh ? "自己写剧本" : "Write own"}</button>
                </div>
                {orchBusy && <div className="cv-empty-busy">{zh ? "✦ 正在起草剧本…" : "✦ Drafting…"}</div>}
              </div>
            ) : (
              /* 自由创作：对话 / 直接生成 */
              <div className="cv-empty-card">
                <div className="cv-empty-card-h"><span className="cv-empty-card-ic">✦</span>{zh ? "自由创作" : "Free creation"}</div>
                <p className="cv-empty-card-d">{zh ? "对话 / 图片 / 视频，节点自由生长、连线引用" : "Chat / image / video — nodes grow and reference freely"}</p>
                <div className="cv-empty-card-acts">
                  <button type="button" className="cv-empty-btn" onClick={() => switchCanvasMode("free", "chat")}>💬 {zh ? "聊个想法" : "Chat"}</button>
                  <button type="button" className="cv-empty-btn" onClick={() => switchCanvasMode("free", "image")}>🖼 {zh ? "直接生成" : "Generate"}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {menu && (
          <div className="cv-ctxmenu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
            {menu.nodeId ? (
              <>
                {(() => {
                  const n = nodes.find((x) => x.id === menu.nodeId);
                  if (!n) return null;
                  const k = n.kind ?? "generate";
                  const runnable = (k === "generate" && !n.jobId) || k === "chat" || k === "character" || k === "scene" || k === "prop";
                  return runnable ? (
                    <button onClick={() => {
                      if (k === "chat") void runChat(n.draft.prompt, { chatNodeId: n.id });
                      else void generateNode(n);
                      setMenu(null);
                    }}>✦ {zh ? "运行节点" : "Run node"}</button>
                  ) : null;
                })()}
                <button onClick={() => { addPendingRef(menu.nodeId!); setMenu(null); }}>↩ {zh ? "引用为上下文" : "Reference"}</button>
                <button onClick={() => { duplicateNode(menu.nodeId!); setMenu(null); }}>⎘ {zh ? "复制节点" : "Duplicate"}<kbd className="cv-ctxmenu-kbd">⌘D</kbd></button>
                <button onClick={() => { const n = nodes.find((x) => x.id === menu.nodeId); if (n) deriveNode(n, "extend"); setMenu(null); }}>⤩ {zh ? "延伸变体" : "Extend"}</button>
                <button onClick={() => { const n = nodes.find((x) => x.id === menu.nodeId); if (n) deriveNode(n, "reference"); setMenu(null); }}>⇲ {zh ? "作为参考" : "As reference"}</button>
                {(() => {
                  const n = nodes.find((x) => x.id === menu.nodeId);
                  return n && (n.kind ?? "generate") === "generate" && !n.jobId ? (
                    <button onClick={() => { setLibraryForNode(menu.nodeId!); setMenu(null); }}>✨ {zh ? "提示库" : "Library"}</button>
                  ) : null;
                })()}
                <div className="cv-ctxmenu-sep" />
                <button className="danger" onClick={() => { deleteNodeWithUndo(menu.nodeId!); setMenu(null); }}>✕ {zh ? "删除节点" : "Delete"}<kbd className="cv-ctxmenu-kbd">Del</kbd></button>
              </>
            ) : (
              <>
                {NODE_KIND_DEFS.map((k) => (
                  <button key={k.kind} onClick={() => { addNodeOfKind(k.kind, { x: menu.wx - NODE_W / 2, y: menu.wy - 90 }); setMenu(null); }}>
                    <span className="cv-add-ic">{k.icon}</span>{zh ? `新建${k.zh}` : `New ${k.en}`}
                  </button>
                ))}
                <div className="cv-ctxmenu-sep" />
                <button onClick={() => { fitView(); setMenu(null); }}>⊡ {zh ? "适配视图" : "Fit view"}<kbd className="cv-ctxmenu-kbd">F</kbd></button>
                {canvasMode === "drama" && nodes.length > 0 && (
                  <>
                    <div className="cv-ctxmenu-sep" />
                    <button onClick={() => { setActiveStage(activeStage === "script" ? null : "script"); setMenu(null); }}>📝 {zh ? "聚焦剧本层" : "Focus script"}{activeStage === "script" ? " ✓" : ""}</button>
                    <button onClick={() => { setActiveStage(activeStage === "assets" ? null : "assets"); setMenu(null); }}>🎭 {zh ? "聚焦角色 / 场景 / 道具" : "Focus cast & props"}{activeStage === "assets" ? " ✓" : ""}</button>
                    <button onClick={() => { setActiveStage(activeStage === "shots" ? null : "shots"); setMenu(null); }}>🎞 {zh ? "聚焦分镜 / 画面" : "Focus shots"}{activeStage === "shots" ? " ✓" : ""}</button>
                  </>
                )}
                {nodes.length > 0 && (
                  <>
                    <button onClick={() => { setAllSelected(true); flash(zh ? `已全选 ${nodes.length} 个节点` : `Selected all ${nodes.length}`); setMenu(null); }}>◻ {zh ? "全选" : "Select all"}<kbd className="cv-ctxmenu-kbd">⌘A</kbd></button>
                    <button className="danger" onClick={() => { clearCanvasWithUndo(); setMenu(null); }}>⌫ {zh ? "清空画布" : "Clear all"}</button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 浮动工具栏 —— 竖排贴右缘（图标优先），底部中央让给智能输入框 */}
      <div className="cv-toolbar">
        <div className="cv-add-wrap">
          <button
            type="button"
            className={`cv-tool cv-tool-primary${addMenuOpen ? " on" : ""}`}
            onClick={() => setAddMenuOpen((o) => !o)}
            title={zh ? "新建节点（双击空白同样可建）" : "New node"}
          >
            ＋
          </button>
          {addMenuOpen && (
            <div className="cv-add-menu">
              {NODE_KIND_DEFS.map((k) => (
                <button key={k.kind} type="button" onClick={() => { addNodeOfKind(k.kind); setAddMenuOpen(false); }}>
                  <span className="cv-add-ic">{k.icon}</span>{zh ? k.zh : k.en}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`cv-tool cv-tool-run${running ? " cv-tool-running" : ""}`}
          onClick={() => (running ? cancelFlow() : void runGraph())}
          title={
            running && runInfo
              ? `${runInfo.done}/${runInfo.total}${runInfo.current ? ` · ${runInfo.current.slice(0, 16)}` : ""}${runInfo.step ? ` · ${runInfo.step}` : ""} —— ${zh ? "点击终止" : "click to stop"}`
              : zh ? "一键串联执行 —— 按连线顺序依次生成（上游成片自动喂下游）" : "Run chain in order"
          }
        >
          {running && runInfo ? <span className="cv-zoom-label">{runInfo.done}/{runInfo.total}</span> : "▶"}
        </button>
        <button
          type="button"
          className="cv-tool"
          onClick={autoLayout}
          title={zh ? "整理布局 —— 按连线自动排成纵向创作树" : "Tidy layout"}
        >
          ⊹
        </button>
        <div className="cv-tool-sep" />
        <button
          type="button"
          className="cv-tool"
          onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale + 0.15) }))}
          disabled={view.scale >= MAX_SCALE - 0.001}
          title={zh ? "放大" : "Zoom in"}
        >
          ＋
        </button>
        <button
          type="button"
          className="cv-tool cv-zoom-label"
          onClick={() => setView((v) => ({ ...v, scale: 1 }))}
          title={zh ? "重置缩放（按 0）" : "Reset zoom (0)"}
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button
          type="button"
          className="cv-tool"
          onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale - 0.15) }))}
          disabled={view.scale <= MIN_SCALE + 0.001}
          title={zh ? "缩小" : "Zoom out"}
        >
          −
        </button>
        <button type="button" className="cv-tool" onClick={fitView} title={zh ? "适配全部（按 F · 空格/中键拖拽平移 · 画布自动保存）" : "Fit view (F)"}>
          ⊡
        </button>
        <button type="button" className="cv-tool" onClick={tidyCanvas} title={zh ? "整理画布 —— 剧集竖向归位、班底/分镜重排、游离节点网格化（只挪位不删）" : "Tidy canvas"}>
          ⊞
        </button>
        <button type="button" className="cv-tool" onClick={() => setAssetLibOpen(true)} title={zh ? "资产库 —— 复用已有角色 / 场景 / 道具" : "Asset library — reuse cast / props"}>
          📚
        </button>
        {canvasMode === "drama" && (
          <button type="button" className="cv-tool" onClick={() => setGuideOpen(true)} title={zh ? "短剧怎么用 —— 重看引导" : "How drama works"}>
            ?
          </button>
        )}
        {nodes.length > 0 && (
          <>
            <div className="cv-tool-sep" />
            <button type="button" className="cv-tool cv-tool-danger" onClick={clearCanvasWithUndo} title={zh ? "清空画布（可撤销）" : "Clear canvas (undoable)"}>
              🗑
            </button>
          </>
        )}
      </div>

      <SettingsModal open={settingsOpen} zh={zh} onClose={() => setSettingsOpen(false)} />
      <AssetPicker open={assetLibOpen} accept="image" zh={zh} categories={["character", "prop", "scene"] as AssetCategory[]} onClose={() => setAssetLibOpen(false)} onPick={reuseAssetToCanvas} />
      {guideOpen && (
        <div className="cv-guide-backdrop" onClick={closeGuide}>
          <div className="cv-guide" onClick={(e) => e.stopPropagation()}>
            <div className="cv-guide-h"><span className="cv-guide-ic">🎬</span>{zh ? "短剧怎么玩 · 30 秒看懂" : "How drama works · 30s"}</div>
            <ol className="cv-guide-steps">
              <li><b>{zh ? "连线 = 拼接开关。" : "Edges are the switch. "}</b>{zh ? "从节点底部圆点拖一条线到另一个节点 ——「角色 → 分镜」就是告诉系统这镜用这个角色；出图时自动把参考图 + 台词组合成画面，让同一角色 / 道具 " : "Drag from a node's bottom dot to another — cast & props stay "}<em>{zh ? "跨镜保持一致" : "consistent across shots"}</em>{zh ? "。" : "."}</li>
              <li><b>{zh ? "最快路径：" : "Fastest path: "}</b>{zh ? "选题材 → AI 起草剧本 → 顺着剧本卡「下一步」一路点：拆分镜 → 出图 → 视频 → 成片。" : "pick a genre, then keep clicking Next on the script card."}</li>
              <li><b>{zh ? "想精细控制：" : "Fine control: "}</b>{zh ? "每步都能手动 —— 顶部进度坞手动加镜 / 角色 / 道具，分镜卡 ✦ 改画面、🔊 配音。" : "every step has a manual entry in the top dock."}</li>
            </ol>
            <div className="cv-guide-flow">{zh ? "剧本 → 分镜 → 角色 / 场景 / 道具 → 出图 → 视频 → 配音 → 成片" : "Script → Shots → Cast → Image → Video → Voice → Cut"}</div>
            <button type="button" className="cv-guide-btn" onClick={closeGuide}>{zh ? "知道了，开始创作 ✦" : "Got it ✦"}</button>
          </div>
        </div>
      )}
      <PromptLibrary
        open={!!libraryForNode}
        onClose={() => setLibraryForNode(null)}
        currentMode={libraryNode?.draft.mode ?? "t2v"}
        zh={zh}
        onApply={(starter, scope) => {
          if (libraryForNode) applyStarterToNode(libraryForNode, starter, scope);
          setLibraryForNode(null);
        }}
        onApplySaved={(saved, scope) => {
          if (libraryForNode) applySavedToNode(libraryForNode, saved, scope);
          setLibraryForNode(null);
        }}
      />
      {toast && (
        <div className={`cv-toast${toast.show ? " show" : ""}`}>
          <span>{toast.msg}</span>
          {toast.action && (
            <button
              type="button"
              className="cv-toast-undo"
              onClick={() => {
                toast.action!.run();
                if (toastTimer.current) clearTimeout(toastTimer.current);
                if (toastHideTimer.current) clearTimeout(toastHideTimer.current);
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {(orchBusy || dockBusy) && (
        <div className="cv-busy-banner" role="status" aria-live="polite">
          <span className="cv-spinner cv-spinner-sm" />
          {dockBusy ? (
            <>
              <span className="cv-busy-txt">{(zh ? ({ assets: "出图", i2v: "转视频", voice: "配音" } as Record<string, string>) : ({ assets: "Image", i2v: "Video", voice: "Voice" } as Record<string, string>))[dockBusy.stage] ?? (zh ? "处理" : "Working")}{zh ? "中 " : " "}{dockBusy.done}/{dockBusy.total}</span>
              <span className="cv-busy-bar"><i style={{ width: `${Math.round((dockBusy.done / Math.max(1, dockBusy.total)) * 100)}%` }} /></span>
            </>
          ) : (
            <span className="cv-busy-txt">{zh ? "✦ AI 处理中，约 10–30 秒，请稍候…" : "✦ Working… 10–30s"}</span>
          )}
          <button type="button" className="cv-busy-stop" onClick={cancelFlow} title={zh ? "终止当前流程（当前步完成后停止）" : "Stop current flow"}>{zh ? "终止" : "Stop"}</button>
        </div>
      )}

      {/* 画布双模式切换 —— 顶部中央：自由创作 / 短剧 */}
      <div className="cv-mode" role="tablist" style={{ "--cm": canvasMode === "drama" ? 1 : 0 } as React.CSSProperties}>
        <span className="cv-mode-slider" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={canvasMode === "free"}
          className={`cv-mode-tab${canvasMode === "free" ? " on" : ""}`}
          onClick={() => switchCanvasMode("free")}
        >
          <span className="cv-mode-ic">✦</span>{zh ? "自由创作" : "Free"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={canvasMode === "drama"}
          className={`cv-mode-tab${canvasMode === "drama" ? " on" : ""}`}
          onClick={() => switchCanvasMode("drama")}
        >
          <span className="cv-mode-ic">🎬</span>{zh ? "短剧" : "Drama"}
        </button>
      </div>

      {/* 短剧进度坞 —— 短剧模式常驻（无镜头给引导），自由模式仅当画布已有短剧节点 */}
      {canvasMode === "drama" && ( // 自由创作模式绝不挂短剧坞（旧剧本残留也不糊画布）
        <DramaDock
          zh={zh}
          scriptNode={dramaScript}
          shots={dramaShots}
          videoNodes={dramaVideoNodes}
          assets={dramaAssets}
          orchBusy={orchBusy}
          busy={dockBusy}
          guide={canvasMode === "drama" && !dramaScript && dramaShots.length === 0 && nodes.length > 0}
          activeStage={activeStage}
          onStageChange={setActiveStage}
          onWriteScript={startBlankScript}
          onPlayDailies={playDailies}
        />
      )}

      {/* 班底独立抽屉 —— 当前剧集的角色/场景/道具，收起式，点击聚焦到画布 */}
      {canvasMode === "drama" && dramaAssets.length > 0 && (
        <div className={`cv-cast-drawer${castOpen ? " open" : ""}`}>
          <button type="button" className="cv-cast-toggle" onClick={() => setCastOpen((o) => !o)} title={zh ? "班底 —— 角色 / 场景 / 道具" : "Cast"}>
            🎭<span className="cv-cast-toggle-n">{dramaAssets.length}</span>
          </button>
          {castOpen && (
            <div className="cv-cast-panel" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
              <div className="cv-cast-panel-h">{zh ? "班底" : "Cast"}</div>
              {[...dramaAssets]
                .sort((a, b) => (a.kind === "character" ? 0 : a.kind === "scene" ? 1 : 2) - (b.kind === "character" ? 0 : b.kind === "scene" ? 1 : 2))
                .map((a) => {
                  const aJob = a.jobId ? jobs.find((j) => j.id === a.jobId) : undefined;
                  const img = aJob?.status === "done" ? aJob.videoUrl : undefined;
                  return (
                    <button key={a.id} type="button" className={`cv-cast-item${selectedNodeId === a.id ? " on" : ""}`} data-kind={a.kind} onClick={() => { setSelectedNodeId(a.id); focusNode(a.id); }}>
                      <span className="cv-cast-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {img ? <img src={img} alt="" /> : <NodeKindIcon kind={a.kind ?? "character"} size={18} />}
                      </span>
                      <span className="cv-cast-name">{a.title || (zh ? "未命名" : "—")}</span>
                      {a.locked && <span className="cv-cast-lock">🔒</span>}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* 底部智能输入框 —— 对话/图片/视频/智能体，选中输入节点即联动编辑 */}
      <CanvasComposer
        zh={zh}
        apiRef={composerApi}
        selectedNode={selectedComposeNode}
        refNodes={pendingRefs
          .map((id) => nodes.find((n) => n.id === id))
          .filter((n): n is CanvasNode => !!n)}
        busy={chatBusy || orchBusy}
        onRemoveRef={removePendingRef}
        onClearSelection={() => setSelectedNodeId(null)}
        onSubmitChat={(text, model) => void runChat(text, { model })}
        onSubmitMedia={submitMedia}
        onSubmitAgent={submitAgent}
        shotCount={dramaShotCount}
        onShotCount={setShotCount}
        onRewriteScript={(instruction, style) => void rewriteScriptNode(instruction, style)}
        onUploadScript={(file) => void uploadScriptFile(file)}
        onWriteOwn={startBlankScript}
        flash={flash}
        canvasEmpty={nodes.length === 0}
        dramaStage={canvasMode === "drama" ? activeStage : null}
        isDramaMode={canvasMode === "drama"}
        onModeChange={setComposerMode}
        stageOps={renderDramaStageOps()}
      />

      {/* 节点媒体灯箱 —— 点节点上的图/视频放大；点空白处或 Esc 关闭复原 */}
      {zoomMedia && (
        <div className="cv-lightbox" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomMedia(null)}>
          {zoomMedia.video ? (
            <video key={zoomMedia.idx ?? 0} className="cv-lightbox-media" src={zoomMedia.url} controls autoPlay loop={!zoomMedia.playlist} playsInline onClick={(e) => e.stopPropagation()}
              onEnded={() => {
                // 串看样片(dailies)：本条放完自动接下一条，缺镜已在收集时跳过；最后一条放完关闭
                if (!zoomMedia.playlist) return;
                const next = (zoomMedia.idx ?? 0) + 1;
                if (next < zoomMedia.playlist.length) setZoomMedia({ ...zoomMedia, url: zoomMedia.playlist[next], idx: next });
                else setZoomMedia(null);
              }}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="cv-lightbox-media" src={zoomMedia.url} alt="" onClick={(e) => e.stopPropagation()} />
          )}
          {zoomMedia.playlist && (
            <div className="cv-lightbox-counter" onClick={(e) => e.stopPropagation()}>{zh ? "样片" : "Dailies"} {(zoomMedia.idx ?? 0) + 1} / {zoomMedia.playlist.length}</div>
          )}
          <button type="button" className="cv-lightbox-close" onClick={() => setZoomMedia(null)} title={zh ? "关闭 (Esc)" : "Close (Esc)"}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── 节点卡片 ─────────────── */

/* ── 顶部项目切换器：切换 / 新建 / 重命名 / 删除画布项目 ── */
function CanvasProjectMenu({ zh, busy }: { zh: boolean; busy: boolean }) {
  const projects = useCanvasStore((s) => s.projects);
  const activeId = useCanvasStore((s) => s.activeId);
  const newProject = useCanvasStore((s) => s.newProject);
  const switchProject = useCanvasStore((s) => s.switchProject);
  const renameProject = useCanvasStore((s) => s.renameProject);
  const deleteProject = useCanvasStore((s) => s.deleteProject);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = projects.find((p) => p.id === activeId) || projects[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
        setConfirmId(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="cv-proj" ref={rootRef}>
      <button
        type="button"
        className="cv-proj-btn"
        onClick={() => setOpen((o) => !o)}
        title={zh ? "切换 / 管理画布项目" : "Switch / manage projects"}
      >
        <span className="cv-proj-dot" aria-hidden />
        <span className="cv-proj-name">{active?.name}</span>
        <span className="cv-proj-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="cv-proj-panel">
          <div className="cv-proj-head">{zh ? "画布项目" : "Canvas projects"}</div>
          <div className="cv-proj-list">
            {projects.map((p) => (
              <div key={p.id} className={`cv-proj-item${p.id === activeId ? " on" : ""}`}>
                {editingId === p.id ? (
                  <input
                    className="cv-proj-rename"
                    autoFocus
                    defaultValue={p.name}
                    onBlur={(e) => {
                      renameProject(p.id, e.target.value);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renameProject(p.id, e.currentTarget.value);
                        setEditingId(null);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="cv-proj-pick"
                    disabled={busy && p.id !== activeId}
                    title={busy && p.id !== activeId ? (zh ? "生成中，完成后再切换画布（避免产物写错项目）" : "Busy — finish before switching") : undefined}
                    onClick={() => {
                      if (busy && p.id !== activeId) return; // 批量跑期间禁止切项目：mutateActive 跟实时 activeId，切了产物会落到新项目、原项目丢失
                      switchProject(p.id);
                      setOpen(false);
                    }}
                  >
                    <span className="cv-proj-pick-name">{p.name}</span>
                    <span className="cv-proj-pick-meta">
                      {p.nodes.length} {zh ? "节点" : "nodes"}
                    </span>
                  </button>
                )}

                {editingId !== p.id && (
                  <span className="cv-proj-ops">
                    <button type="button" title={zh ? "重命名" : "Rename"} onClick={() => setEditingId(p.id)}>
                      ✎
                    </button>
                    {projects.length > 1 &&
                      (confirmId === p.id ? (
                        <button
                          type="button"
                          className="cv-proj-confirm"
                          title={zh ? "确认删除" : "Confirm delete"}
                          onClick={() => {
                            const cst = useCanvasStore.getState();
                            killRunningJobs(p.id === cst.activeId ? cst.nodes : (p.nodes ?? [])); // active 项目 nodes 在顶层、inactive 在 p.nodes
                            deleteProject(p.id);
                            setConfirmId(null);
                          }}
                        >
                          {zh ? "删?" : "del?"}
                        </button>
                      ) : (
                        <button type="button" disabled={busy} title={busy ? (zh ? "生成中不可删" : "Busy") : (zh ? "删除项目" : "Delete project")} onClick={() => setConfirmId(p.id)}>
                          🗑
                        </button>
                      ))}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="cv-proj-new"
            disabled={busy}
            title={busy ? (zh ? "生成中，完成后再新建" : "Busy — finish generating first") : undefined}
            onClick={() => {
              if (busy) return; // 新建会切 activeId，批量跑期间禁止，避免后续产物落到新项目
              newProject(zh ? `画布 ${projects.length + 1}` : `Canvas ${projects.length + 1}`);
              setOpen(false);
            }}
          >
            ＋ {zh ? "新建画布" : "New canvas"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── 节点卡片（flowith 式：输入是一个框，输出是另一个框） ───────────────
   memo + 自定义比较：拖拽/平移时只有数据真变的卡重渲（13 卡全量重渲是拖拽糊的另一半根因）。
   函数 props 每渲染都是新引用 —— 比较时忽略；它们的闭包随 node 引用变化一起更新，无陈旧风险。 */

const NodeCard = memo(NodeCardImpl, (prev, next) =>
  prev.node === next.node &&
  prev.selected === next.selected &&
  prev.linkHint === next.linkHint &&
  prev.isLinkSrc === next.isLinkSrc &&
  prev.edgeHi === next.edgeHi &&
  prev.job === next.job &&
  prev.imageJob === next.imageJob &&
  prev.videoJob === next.videoJob &&
  prev.streaming === next.streaming &&
  prev.dimmed === next.dimmed &&
  prev.width === next.width &&
  prev.zh === next.zh &&
  prev.dragOffset?.dx === next.dragOffset?.dx &&
  prev.dragOffset?.dy === next.dragOffset?.dy &&
  prev.nextStepLabel === next.nextStepLabel &&
  prev.nextStepBusy === next.nextStepBusy &&
  prev.rewriting === next.rewriting
);

/** 节点类型线性图标（替代 emoji，单色描边跟随 currentColor，符合「图标优先、禁 emoji」设计）。 */
function NodeKindIcon({ kind, size = 15 }: { kind: string; size?: number }) {
  const c = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "character": return <svg {...c} aria-hidden><circle cx="8" cy="5.2" r="2.6" /><path d="M3.4 13c0-2.6 2-4.2 4.6-4.2s4.6 1.6 4.6 4.2" /></svg>;
    case "scene": return <svg {...c} aria-hidden><rect x="2" y="3" width="12" height="10" rx="1.6" /><path d="M2.3 11.2l3.4-3.4 2.3 2.3 3-3 2.7 2.7" /><circle cx="11" cy="6" r="1.1" /></svg>;
    case "prop": return <svg {...c} aria-hidden><path d="M8 2.2l5.4 3v5.6L8 13.8l-5.4-3V5.2L8 2.2Z" /><path d="M8 2.2v11.6M2.6 5.2 8 8.2l5.4-3" /></svg>;
    case "drama": return <svg {...c} aria-hidden><rect x="2" y="6" width="12" height="7" rx="1.2" /><path d="M2.4 6 13.2 3.3l.5 2L3 8.1 2.4 6Z" /></svg>;
    case "image": return <svg {...c} aria-hidden><rect x="2.5" y="3.5" width="11" height="9" rx="1.6" /><circle cx="6" cy="6.8" r="1" fill="currentColor" stroke="none" /><path d="M4.5 11.2l2.6-2.6 1.9 1.9 2.2-2.2 1.6 1.6" /></svg>;
    case "video": return <svg {...c} aria-hidden><rect x="2.5" y="3.8" width="11" height="8.4" rx="1.7" /><path d="M7 6.6v2.8L9.6 8 7 6.6Z" fill="currentColor" stroke="none" /></svg>;
    default: return <svg {...c} aria-hidden><path d="M4 2.5h5.5l3.5 3.5v8H4z" /><path d="M9.5 2.5v3.5h3.5M6 9h4M6 11h3" /></svg>;
  }
}

function NodeCardImpl({
  node,
  selected,
  linkHint,
  isLinkSrc,
  edgeHi,
  job,
  imageJob,
  videoJob,
  zh,
  width,
  streaming,
  dimmed,
  dragOffset,
  onMeasure,
  onSelect,
  onDragHandle,
  onResizeStart,
  onPromptChange,
  onGenerate,
  onNextStep,
  nextStepLabel,
  nextStepBusy,
  rewriting,
  onRemove,
  onBranch,
  onOpenInStudio,
  onSendToDirector,
  onDerive,
  onStartLink,
  onUpdateNode,
  onGenVoice,
  onAddRef,
  onUseAsPrompt,
  onUseAsScript,
  onRerun,
  onUploadRef,
  onRewrite,
  onContinueEpisode,
  onNextShot,
  takeList,
  onSelectTake,
  onDeleteTake,
  onTailContinue,
}: {
  node: CanvasNode;
  selected?: boolean;
  linkHint?: "ok" | "bad";
  isLinkSrc?: boolean;
  edgeHi?: boolean;
  job: Job | undefined;
  imageJob?: Job;
  videoJob?: Job;
  zh: boolean;
  width: number;
  streaming?: boolean;
  /** 短剧阶段聚焦：非当前阶段节点淡化 */
  dimmed?: boolean;
  /** 拖拽中的内存位移（不写 store，松手才提交） */
  dragOffset?: { dx: number; dy: number };
  onMeasure?: (id: string, size: { w: number; h: number } | null) => void;
  onSelect?: () => void;
  onDragHandle: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent, dir: string) => void;
  onPromptChange: (v: string) => void;
  onGenerate: () => void | Promise<unknown>;
  /** 短剧剧本节点的「下一步」(跟随进度:拆分镜/批量出图/转视频/成片) */
  onNextStep?: () => void;
  nextStepLabel?: string;
  /** 短剧「下一步」对应的 AI 操作正在后台跑(拆分镜/出图/视频/配音) —— 按钮显示进行中并禁用 */
  nextStepBusy?: boolean;
  /** 剧本 AI 改写进行中 —— 让卡片显示准确的「改写中」而非误导的「拆分镜中」 */
  rewriting?: boolean;
  onRemove: () => void;
  onBranch: (kind: "animate" | "edit" | "vary", job: Job) => void;
  onOpenInStudio: (job: Job) => void;
  onSendToDirector: (job: Job) => void;
  onDerive: (mode: "continue" | "reference" | "extend") => void;
  onStartLink?: (e: React.PointerEvent) => void;
  onUpdateNode?: (patch: { title?: string; text?: string }) => void;
  onGenVoice?: () => void;
  onAddRef?: () => void;
  onUseAsPrompt?: () => void;
  /** answer→短剧剧本 note */
  onUseAsScript?: () => void;
  onRerun?: () => void;
  /** 资产卡(character/prop/scene)上传参考图锁定一致性 */
  onUploadRef?: (file: File) => void;
  /** 短剧分镜：就地改写画面 prompt（rewriteShotImagePrompt） */
  onRewrite?: (instruction: string) => void;
  /** 短剧剧本：续下一集（ai=AI续写 / blank=自己写 / clone=复刻整框复制班底+剧本） */
  onContinueEpisode?: (mode: "ai" | "blank" | "clone") => void;
  /** 视频节点出片后：跳到下一镜继续(逐镜接力) */
  onNextShot?: () => void;
  /** 取片：同一镜的多条 take(>1 时渲染胶片带)；active=当前采用 */
  takeList?: { at: number; url?: string; active: boolean }[];
  onSelectTake?: (idx: number) => void;
  onDeleteTake?: (idx: number) => void;
  /** 尾帧延续：抽这条视频的尾帧，做下一段的首帧(i2v)或参考(r2v) */
  onTailContinue?: (mode: "i2v" | "r2v") => void;
}) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteText, setRewriteText] = useState("");
  const [nextEpOpen, setNextEpOpen] = useState(false); // 续下一集二选一展开
  const [tailOpen, setTailOpen] = useState(false); // 尾帧延续 i2v/r2v 二选一展开
  const rootRef = useRef<HTMLElement | null>(null);

  // 等待秒表：出图/出视频/生成在途时每秒刷新「已拍 X:XX · 约还需 Y:YY」——诚实 ETA(模型 etaSec + job.createdAt)，
  //   不用假百分比，把 >3min 的视频黑盒变成有时间感的等待。仅在途节点起 interval，其余卡不空转。
  const devJob = [videoJob, imageJob, job].find((j) => j && (j.status === "running" || j.status === "submitting"));
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!devJob) return;
    setNowTs(Date.now());
    const t = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [devJob?.id]);
  const devTimer = devJob ? (() => {
    const elapsed = Math.max(0, Math.floor((nowTs - devJob.createdAt) / 1000));
    const left = (getModel(devJob.modelId)?.etaSec ?? 120) - elapsed;
    return left > 0
      ? (zh ? `已拍 ${fmtClock(elapsed)} · 约还需 ${fmtClock(left)}` : `${fmtClock(elapsed)} · ~${fmtClock(left)} left`)
      : (zh ? `已拍 ${fmtClock(elapsed)} · 即将完成` : `${fmtClock(elapsed)} · almost there`);
  })() : null;

  /* 实测尺寸 → 父级 sizes（连线锚点 = 底部中心，落点 = 高度 + 间距） */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined" || !onMeasure) return;
    const update = () => onMeasure(node.id, { w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onMeasure(node.id, null);
    };
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = node.draft;
  const spec = getModel(d.modelId);
  const status = job?.status;
  const isDone = status === "done" && !!job?.videoUrl;
  const kind = node.kind ?? "generate";
  const isDrama = node.orchMode === "drama";
  const retryKey = `${node.id}:${job?.id ?? "no-job"}:${job?.status ?? "no-status"}`;
  const retrying = retryingKey === retryKey;

  async function retryGenerate() {
    if (retrying) return;
    setRetryingKey(retryKey);
    try {
      await onGenerate();
    } finally {
      setRetryingKey(null);
    }
  }

  // 拖拽中的实际渲染坐标 = store 坐标 + 内存位移
  const px = node.x + (dragOffset?.dx ?? 0);
  const py = node.y + (dragOffset?.dy ?? 0);
  // 连线落点高亮（ok 绿/bad 红）+ 边 hover 关联高亮
  const linkCls = linkHint === "ok" ? " cv-node-linkok" : linkHint === "bad" ? " cv-node-linkbad" : "";
  const nodeExtraCls = linkCls + (edgeHi ? " cv-node-edgehi" : "") + (dimmed ? " cv-node-dim" : "");
  const portActiveCls = isLinkSrc ? " cv-port-active" : "";

  /* 上=输入端口（被连入），下=输出端口（拖出连线） */
  const ports = (
    <>
      <div className="cv-port cv-port-in" title={zh ? "输入" : "in"} />
      <div
        className={`cv-port cv-port-out${portActiveCls}`}
        title={zh ? "拖我连到其它节点" : "drag to link"}
        onPointerDown={(e) => onStartLink?.(e)}
      />
    </>
  );

  /* ── note：创意 / 剧本 文本节点 ── */
  if (kind === "note") {
    return (
      <article ref={rootRef as React.Ref<HTMLElement>} className={`cv-node cv-node-note${selected ? " cv-node-sel" : ""}${nodeExtraCls}`} data-kind="note" style={{ left: px, top: py, width, height: node.h }} data-node-id={node.id} data-h={node.h ? "1" : undefined} onPointerDown={onDragHandle} onClick={onSelect} onWheel={(e) => e.stopPropagation()}>
        {ports}
        <header className="cv-node-head" onPointerDown={onDragHandle}>
          <span className="cv-node-mode">💡</span>
          <input className="cv-asset-title" value={node.title ?? ""} placeholder={zh ? "标题" : "Title"} onChange={(e) => onUpdateNode?.({ title: e.target.value })} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.currentTarget.select()} />
          {onAddRef && <button type="button" className="cv-node-ref" onPointerDown={(e) => e.stopPropagation()} onClick={onAddRef} title={zh ? "引用为上下文 —— 下次发送自动连线" : "Reference as context"}>↩</button>}
          <button type="button" className="cv-node-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除" : "Remove"}>×</button>
        </header>
        <textarea className="cv-note-text" value={node.text ?? ""} placeholder={zh ? "写下创意、剧本、大纲…" : "Idea, script, outline…"} onChange={(e) => onUpdateNode?.({ text: e.target.value })} onPointerDown={(e) => e.stopPropagation()} />
        {(node.text ?? "").trim().length > 10 && (onRewrite || (onNextStep && nextStepLabel) || onContinueEpisode) && (
          <div className="cv-node-next" onPointerDown={(e) => e.stopPropagation()}>
            {onRewrite && (
              <button type="button" className={`cv-node-rewrite-btn${rewriteOpen ? " on" : ""}`} disabled={!!nextStepBusy && !rewriting} onClick={() => setRewriteOpen((o) => !o)} title={zh ? "AI 改写这份剧本（可输入指令，留空＝润色）" : "AI rewrite this script"}>
                {rewriting
                  ? <><span className="cv-spinner cv-spinner-sm" />{zh ? "改写中…" : "Rewriting…"}</>
                  : <>✦ {zh ? "AI 改写" : "Rewrite"}</>}
              </button>
            )}
            {onNextStep && nextStepLabel && (
              <button type="button" className={`cv-node-next-btn${nextStepBusy && !rewriting ? " busy" : ""}`} onClick={onNextStep} disabled={nextStepBusy} title={zh ? "进入下一步" : "Next step"}>
                {nextStepBusy && !rewriting
                  ? <><span className="cv-spinner cv-spinner-sm" />{nextStepLabel}{zh ? " 中…" : "…"}</>
                  : <>▶ {zh ? "下一步 · " : "Next · "}{nextStepLabel}</>}
              </button>
            )}
            {onContinueEpisode && (
              <button type="button" className={`cv-node-nextep-btn${nextEpOpen ? " on" : ""}`} onClick={() => setNextEpOpen((o) => !o)} title={zh ? "续下一集 —— 班底自动延续" : "Next episode (cast carries over)"}>
                ⊕ {zh ? "续集" : "Next ep"}
              </button>
            )}
          </div>
        )}
        {onRewrite && rewriteOpen && (
          <div className="cv-rewrite cv-rewrite-note" onPointerDown={(e) => e.stopPropagation()}>
            <input className="cv-rewrite-in" value={rewriteText} autoFocus placeholder={zh ? "改写指令：如「扩写到 200 字」「加个反转」—— 留空＝润色增强" : "Rewrite… (blank = polish)"} onChange={(e) => setRewriteText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onRewrite(rewriteText.trim()); setRewriteText(""); setRewriteOpen(false); } }} />
            <button type="button" className="cv-rewrite-go" onClick={() => { onRewrite(rewriteText.trim()); setRewriteText(""); setRewriteOpen(false); }}>✦</button>
          </div>
        )}
        {onContinueEpisode && nextEpOpen && (
          <div className="cv-nextep-choice" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setNextEpOpen(false); onContinueEpisode("ai"); }} title={zh ? "AI 带着上一集剧情+班底续写承接剧情" : "AI continues with cast"}>✦ {zh ? "AI 续写" : "AI continue"}</button>
            <button type="button" onClick={() => { setNextEpOpen(false); onContinueEpisode("blank"); }} title={zh ? "建空白下一集，你自己写（班底照样自动延续）" : "Blank, write yourself"}>✎ {zh ? "自己写" : "Write myself"}</button>
            <button type="button" onClick={() => { setNextEpOpen(false); onContinueEpisode("clone"); }} title={zh ? "复刻整框 —— 把角色场景+剧本复制进下方新框，每集自成一套" : "Clone — copy cast + script into a new box"}>⎘ {zh ? "复刻" : "Clone"}</button>
          </div>
        )}
        <ResizeHandles onResizeStart={onResizeStart} zh={zh} />
      </article>
    );
  }

  /* ── chat：对话输入框（问题） ── */
  if (kind === "chat") {
    return (
      <article ref={rootRef as React.Ref<HTMLElement>} className={`cv-node cv-node-chat${selected ? " cv-node-sel" : ""}${nodeExtraCls}`} data-kind="chat" style={{ left: px, top: py, width, height: node.h }} data-node-id={node.id} data-h={node.h ? "1" : undefined} onPointerDown={onDragHandle} onClick={onSelect} onWheel={(e) => e.stopPropagation()}>
        {ports}
        <header className="cv-node-head" onPointerDown={onDragHandle}>
          <span className="cv-node-mode">💬</span>
          <span className="cv-node-title">{zh ? "对话" : "Chat"}</span>
          <button type="button" className="cv-node-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除" : "Remove"}>×</button>
        </header>
        <textarea
          className="cv-chat-text"
          value={d.prompt}
          placeholder={zh ? "问题内容 —— 点选后在下方对话框发送…" : "Question — select & send below…"}
          onChange={(e) => onPromptChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <ResizeHandles onResizeStart={onResizeStart} zh={zh} />
      </article>
    );
  }

  /* ── answer：对话输出框（AI 回答，流式） ── */
  if (kind === "answer") {
    const body = node.text ?? "";
    const failed = body.startsWith("⚠");
    return (
      <article ref={rootRef as React.Ref<HTMLElement>} className={`cv-node cv-node-answer${selected ? " cv-node-sel" : ""}${failed ? " cv-node-error" : ""}${nodeExtraCls}`} data-kind="answer" style={{ left: px, top: py, width, height: node.h }} data-node-id={node.id} data-h={node.h ? "1" : undefined} onPointerDown={onDragHandle} onClick={onSelect} onWheel={(e) => e.stopPropagation()}>
        {ports}
        <header className="cv-node-head" onPointerDown={onDragHandle}>
          <span className="cv-node-mode">✦</span>
          <span className="cv-node-title">
            {zh ? "回答" : "Answer"}
            {streaming && <em className="cv-ans-live">{zh ? " · 生成中" : " · live"}</em>}
          </span>
          <button type="button" className="cv-node-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除" : "Remove"}>×</button>
        </header>
        <div className="cv-ans-body" onPointerDown={(e) => e.stopPropagation()}>
          {body || (streaming ? "" : zh ? "（空）" : "(empty)")}
          {streaming && <span className="cv-ans-caret" />}
        </div>
        {!streaming && (
          <div className="cv-node-branch" onPointerDown={(e) => e.stopPropagation()}>
            {!failed && (
              <button type="button" className="cv-br" onClick={onAddRef} title={zh ? "引用为上下文 —— 下次发送自动连线" : "Reference as context"}>
                ↩ {zh ? "引用" : "Ref"}
              </button>
            )}
            {!failed && onUseAsScript && (
              <button type="button" className="cv-br" onClick={onUseAsScript} title={zh ? "把这段当短剧剧本 —— 建剧本节点接着拆分镜" : "Use as drama script"}>
                🎬 {zh ? "用作剧本" : "As script"}
              </button>
            )}
            {!failed && onUseAsPrompt && (
              <button type="button" className="cv-br" onClick={onUseAsPrompt} title={zh ? "把这段文字变成生成节点的提示词" : "Use as prompt"}>
                🎞 {zh ? "去生成" : "To gen"}
              </button>
            )}
            {!failed && (
              <button
                type="button"
                className="cv-br cv-br-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(body).catch(() => {});
                }}
                title={zh ? "复制全文" : "Copy"}
              >
                ⎘
              </button>
            )}
            {onRerun && (
              <button type="button" className="cv-br cv-br-ghost" onClick={onRerun} title={zh ? "用原问题再答一版（向右排开）" : "Regenerate"}>
                ↻
              </button>
            )}
          </div>
        )}
        <ResizeHandles onResizeStart={onResizeStart} zh={zh} />
      </article>
    );
  }

  /* ── character / scene：可复用资产卡（纯内容 —— 生成/重画在底部对话框） ── */
  if (kind === "character" || kind === "scene" || kind === "prop") {
    const busy = status === "running" || status === "submitting";
    const assetSrc = canvasJobImageDisplaySrc(job);
    return (
      <article ref={rootRef as React.Ref<HTMLElement>} className={`cv-node cv-node-asset${selected ? " cv-node-sel" : ""}${isDone ? " done" : ""}${status === "error" ? " cv-node-error" : ""}${nodeExtraCls}`} data-kind={kind} style={{ left: px, top: py, width, height: node.h }} data-node-id={node.id} data-h={node.h ? "1" : undefined} onPointerDown={onDragHandle} onClick={onSelect} onWheel={(e) => e.stopPropagation()}>
        {ports}
        <header className="cv-node-head cv-asset-head" onPointerDown={onDragHandle}>
          <span className="cv-asset-badge"><NodeKindIcon kind={kind} size={12} /><em>{kind === "character" ? (zh ? "角色" : "Cast") : kind === "prop" ? (zh ? "道具" : "Prop") : (zh ? "场景" : "Scene")}</em></span>
          <input className="cv-asset-title" value={node.title ?? ""} placeholder={kind === "character" ? (zh ? "角色名" : "Name") : kind === "prop" ? (zh ? "道具名" : "Prop") : (zh ? "场景名" : "Place")} onChange={(e) => onUpdateNode?.({ title: e.target.value })} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.currentTarget.select()} />
          {onAddRef && <button type="button" className="cv-node-ref" onPointerDown={(e) => e.stopPropagation()} onClick={onAddRef} title={zh ? "引用为上下文 —— 下次发送自动连线（带立绘+描述）" : "Reference as context"}>↩</button>}
          <button type="button" className="cv-node-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除" : "Remove"}>×</button>
        </header>
        <div className="cv-asset-body">
          <div className="cv-asset-img">
            {isDone && assetSrc ? <img src={assetSrc} alt={node.title ?? ""} />
              : busy ? <div className="cv-asset-ph">{zh ? "生成中…" : "…"}</div>
                : <div className="cv-asset-ph"><NodeKindIcon kind={kind} size={40} /></div>}
            {onUploadRef && (
              <label className={`cv-asset-upload${node.locked ? " locked" : ""}`} title={node.locked ? (zh ? "参考图已锁定 · 点击替换" : "Locked · click to replace") : (zh ? "上传参考图，锁定一致性" : "Upload reference to lock")} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                {node.locked ? "🔒" : "📎"}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadRef(f); e.currentTarget.value = ""; }} />
              </label>
            )}
          </div>
          <textarea className="cv-asset-desc" value={d.prompt} placeholder={kind === "character" ? (zh ? "外貌、气质、服装…" : "Look, outfit, vibe…") : kind === "prop" ? (zh ? "外观、材质、特征…" : "Look, material…") : (zh ? "环境、光线、氛围…" : "Setting, light, mood…")} onChange={(e) => onPromptChange(e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
        </div>
        <ResizeHandles onResizeStart={onResizeStart} zh={zh} />
      </article>
    );
  }

  /* ── generate + job：输出框（成片 / 显影 / 废片 / 短剧流水线） ── */
  if (job) {
    return (
      <article
        ref={rootRef as React.Ref<HTMLElement>}
        className={`cv-node cv-node-output${status === "done" ? " done" : ""}${status === "error" ? " cv-node-error" : ""}${selected ? " cv-node-sel" : ""}${nodeExtraCls}`}
        data-kind="generate"
        style={{ left: px, top: py, width, height: node.h }}
        data-node-id={node.id} data-h={node.h ? "1" : undefined}
        onPointerDown={onDragHandle}
        onClick={onSelect}
        onWheel={(e) => e.stopPropagation()}
      >
        {ports}
        {/* 继承「＋」：派生延续 / 参考 / 延伸子节点（落在下方） */}
        <div className="cv-plus-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={`cv-plus${plusOpen ? " on" : ""}`} onClick={() => setPlusOpen((o) => !o)} title={zh ? "继承延伸 —— 派生子节点" : "Derive a child node"}>＋</button>
          {plusOpen && (
            <div className="cv-plus-menu">
              {isDone && (
                <button type="button" onClick={() => { onDerive("continue"); setPlusOpen(false); }}>
                  <span className="cv-plus-ic">⤳</span>
                  <span className="cv-plus-tx">{zh ? "延续" : "Continue"}<em>{zh ? "接下一镜" : "next shot"}</em></span>
                </button>
              )}
              {isDone && (
                <button type="button" onClick={() => { onDerive("reference"); setPlusOpen(false); }}>
                  <span className="cv-plus-ic">◎</span>
                  <span className="cv-plus-tx">{zh ? "参考" : "Reference"}<em>{zh ? "当参考图" : "as reference"}</em></span>
                </button>
              )}
              <button type="button" onClick={() => { onDerive("extend"); setPlusOpen(false); }}>
                <span className="cv-plus-ic">⎘</span>
                <span className="cv-plus-tx">{zh ? "延伸" : "Extend"}<em>{zh ? "同源变体" : "variation"}</em></span>
              </button>
            </div>
          )}
        </div>

        <header className="cv-node-head" onPointerDown={onDragHandle}>
          <span className="cv-node-mode"><NodeKindIcon kind={isDrama ? "drama" : isImageMode(job.mode) ? "image" : "video"} /></span>
          <span className="cv-node-title" title={node.title || job.title}>
            {(node.title || job.title || "").slice(0, 28) || "—"}
          </span>
          <button type="button" className="cv-node-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除节点" : "Remove"}>×</button>
        </header>

        <div className="cv-node-body">
          {/* 分镜剧本【置顶·主体】：这一镜的分镜描述是主角(输入)，下方的视频是它的产物(输出)。
              转视频/出片后描述永不消失、不被视频占据，可就地改后重生成。 */}
          {isDrama && d.prompt && (
            <div className="cv-shot-keep" onPointerDown={(e) => e.stopPropagation()}>
              <span className="cv-shot-keep-tag">{zh ? "分镜剧本" : "Shot script"}</span>
              <textarea
                className="cv-node-prompt cv-shot-keep-ta"
                value={d.prompt}
                readOnly={!!node.dramaVideoOf}
                title={node.dramaVideoOf ? (zh ? "分镜剧本镜像 —— 要改请到上方的分镜节点" : "Mirror of the shot script — edit on the shot node above") : undefined}
                onChange={(e) => onPromptChange(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {status === "done" && job.videoUrl ? (
            <>
              <div className="cv-node-result">
                {isImageMode(job.mode) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={canvasJobImageDisplaySrc(job) || job.videoUrl} alt={job.title} />
                ) : (
                  <video
                    src={`${job.videoUrl}#t=0.1`}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => {
                      e.currentTarget.preload = "auto";
                      void e.currentTarget.play().catch(() => {});
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0.1;
                    }}
                  />
                )}
              </div>
              {isDrama && node.text && (
                <div className="cv-out-caption">{node.text.split(" · ")[0]}</div>
              )}
              {takeList && takeList.length > 1 && (
                <div className="cv-takes" onPointerDown={(e) => e.stopPropagation()}>
                  <div className="cv-takes-h">
                    <NodeKindIcon kind="video" size={12} />
                    <span>{zh ? `取片 · ${takeList.length} 条` : `Takes · ${takeList.length}`}</span>
                    <span className="cv-takes-hint">{zh ? "点格切换采用" : "tap to use"}</span>
                  </div>
                  <div className="cv-takes-strip" onWheel={(e) => e.stopPropagation()}>
                    {takeList.map((t, i) => (
                      <button key={i} type="button" className={`cv-take${t.active ? " on" : ""}`} onClick={() => onSelectTake?.(i)} title={t.active ? (zh ? "采用中" : "In use") : (zh ? "切换采用这条" : "Use this take")}>
                        {t.url ? (
                          <video src={`${t.url}#t=0.1`} muted preload="metadata" />
                        ) : <span className="cv-take-ph" />}
                        <span className="cv-take-tag">{zh ? `第${i + 1}条` : `#${i + 1}`} · {fmtAgo(t.at, zh)}</span>
                        {onDeleteTake && (
                          <span className="cv-take-del" title={zh ? "删除这条" : "Delete"} onClick={(e) => { e.stopPropagation(); onDeleteTake(i); }}>×</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="cv-node-branch" onPointerDown={(e) => e.stopPropagation()}>
                {node.dramaVideoOf && onNextShot && (
                  <button type="button" className="cv-br cv-br-go" onClick={onNextShot} title={zh ? "继续下一镜 —— 跳到下个还没出视频的分镜，没有了就去成片" : "Next shot — jump to the next shot without video"}>
                    {zh ? "下一镜 →" : "Next →"}
                  </button>
                )}
                <button type="button" className="cv-br" onClick={onAddRef} title={zh ? "引用为上下文 —— 下次发送自动连线" : "Reference as context"}>
                  ↩ {zh ? "引用" : "Ref"}
                </button>
                {isImageMode(job.mode) ? (
                  <button type="button" className="cv-br" onClick={() => onBranch("animate", job)} title={zh ? "用此图生成视频" : "Animate"}>
                    🎞 {zh ? "动画" : "Animate"}
                  </button>
                ) : (
                  <button type="button" className="cv-br" onClick={() => onBranch("edit", job)} title={zh ? "编辑此视频" : "Edit"}>
                    ✂ {zh ? "编辑" : "Edit"}
                  </button>
                )}
                {!isImageMode(job.mode) && onTailContinue && (
                  <button type="button" className={`cv-br${tailOpen ? " cv-br-ok" : ""}`} onClick={() => setTailOpen((o) => !o)} title={zh ? "尾帧延续 —— 抽这条视频的尾帧，做下一段视频的首帧/参考" : "Continue from tail frame"}>
                    {zh ? "尾帧延续" : "Tail →"}
                  </button>
                )}
                <button type="button" className="cv-br" onClick={() => onBranch("vary", job)} title={zh ? "同参数变体" : "Variation"}>
                  ⟳
                </button>
                {isDrama && onGenVoice && (
                  <button type="button" className={`cv-br${node.voiceJobId ? " cv-br-ok" : ""}`} onClick={onGenVoice} title={zh ? (node.voiceJobId ? "重新配音" : "生成配音") : "Voice"}>
                    🔊
                  </button>
                )}
                <span className="cv-br-div" />
                <button type="button" className="cv-br cv-br-ghost" onClick={() => onOpenInStudio(job)} title={zh ? "在工坊打开 —— 线性精修" : "Open in Studio"}>
                  ⤢
                </button>
                <button type="button" className="cv-br cv-br-ghost" onClick={() => onSendToDirector(job)} title={zh ? "送去导演台 —— 作角色参考" : "Send to Director"}>
                  🎭
                </button>
                {isDrama && onRewrite && (
                  <button type="button" className={`cv-br${rewriteOpen ? " cv-br-ok" : ""}`} onClick={() => setRewriteOpen((o) => !o)} title={zh ? "改写画面词 —— 就地改这镜" : "Rewrite shot prompt"}>✦</button>
                )}
              </div>
              {!isImageMode(job.mode) && onTailContinue && tailOpen && (
                <div className="cv-tail" onPointerDown={(e) => e.stopPropagation()}>
                  <span className="cv-tail-tip">{zh ? "抽尾帧做下一段起点 ——" : "Tail frame as next clip's start —"}</span>
                  <button type="button" className="cv-tail-opt" onClick={() => { setTailOpen(false); onTailContinue("i2v"); }} title={zh ? "尾帧当首帧，i2v 从这一帧继续运动" : "Tail as first frame (i2v)"}>{zh ? "i2v · 当首帧" : "i2v · first frame"}</button>
                  <button type="button" className="cv-tail-opt" onClick={() => { setTailOpen(false); onTailContinue("r2v"); }} title={zh ? "尾帧当参考图，r2v 锁主体换运镜/场景" : "Tail as reference (r2v)"}>{zh ? "r2v · 当参考" : "r2v · reference"}</button>
                </div>
              )}
              {isDrama && onRewrite && rewriteOpen && (
                <div className="cv-rewrite" onPointerDown={(e) => e.stopPropagation()}>
                  <input
                    className="cv-rewrite-in"
                    value={rewriteText}
                    autoFocus
                    placeholder={zh ? "改成…如「换黄昏」「加场雨」「拉近景」" : "Change to… e.g. dusk / add rain"}
                    onChange={(e) => setRewriteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && rewriteText.trim()) { onRewrite(rewriteText.trim()); setRewriteText(""); setRewriteOpen(false); } }}
                  />
                  <button type="button" className="cv-rewrite-go" onClick={() => { if (rewriteText.trim()) { onRewrite(rewriteText.trim()); setRewriteText(""); setRewriteOpen(false); } }}>✦</button>
                </div>
              )}
              {isDrama && node.voiceJobId && (
                <audio className="cv-drama-audio" src={node.voiceJobId} controls preload="none" />
              )}
            </>
          ) : status === "error" ? (
            <>
              <div className="cv-node-error-pop" role="status" aria-live="polite" title={job.errorMessage || ""} onPointerDown={(e) => e.stopPropagation()}>
                <strong>✗ {zh ? "生成失败" : "Failed"}</strong>
                {job.errorMessage && <span>{job.errorMessage}</span>}
              </div>
              <div className="cv-node-err">
                <button type="button" className="cv-br" disabled={retrying} onClick={() => void retryGenerate()} onPointerDown={(e) => e.stopPropagation()}>
                  {retrying ? (
                    <>
                      <span className="cv-spinner cv-spinner-sm" />
                      {zh ? "重试中…" : "Retrying…"}
                    </>
                  ) : (
                    <>↻ {zh ? "重试" : "Retry"}</>
                  )}
                </button>
              </div>
            </>
          ) : isDrama && (imageJob || videoJob) ? (
            /* 短剧三段流水线：出图 → 出视频 → 配音 */
            <div className="cv-node-developing cv-drama-pipeline">
              {imageJob?.status === "done" && canvasJobImageDisplaySrc(imageJob) && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className="cv-drama-thumb" src={canvasJobImageDisplaySrc(imageJob)} alt="" />
              )}
              <div className="cv-drama-steps">
                <span className={`cv-ds${imageJob?.status === "done" ? " ok" : imageJob?.status === "error" ? " err" : ""}`}>
                  {imageJob?.status === "done" ? "✓" : imageJob?.status === "error" ? "✗" : <span className="cv-spinner cv-spinner-sm" />}
                  {zh ? " 出图" : " Image"}
                </span>
                <span className="cv-ds-arrow">→</span>
                <span className={`cv-ds${videoJob?.status === "done" ? " ok" : videoJob?.status === "error" ? " err" : ""}`}>
                  {videoJob?.status === "done" ? "✓" : videoJob?.status === "error" ? "✗" : videoJob ? <span className="cv-spinner cv-spinner-sm" /> : "○"}
                  {zh ? " 出视频" : " Video"}
                </span>
                <span className="cv-ds-arrow">→</span>
                <span className={`cv-ds${node.voiceJobId ? " ok" : ""}`}>
                  {node.voiceJobId ? "✓" : "○"}
                  {zh ? " 配音" : " Voice"}
                </span>
              </div>
              {devTimer && <div className="cv-dev-timer">{devTimer}</div>}
              {node.voiceJobId && (
                <audio className="cv-drama-audio" src={node.voiceJobId} controls preload="none" />
              )}
            </div>
          ) : (
            <div className="cv-node-developing">
              <span className="cv-spinner" />
              <span>{status === "submitting" ? (zh ? "入槽…" : "Loading…") : zh ? "生成中…" : "Generating…"}</span>
              {devTimer && <span className="cv-dev-timer">{devTimer}</span>}
            </div>
          )}
        </div>
        <ResizeHandles onResizeStart={onResizeStart} zh={zh} />
      </article>
    );
  }

  /* ── generate 无 job：输入框 —— 纯内容（prompt/台词/媒体缩略），零按钮；
        模型/参数/媒体/运行 全在底部对话框（点选即联动） ── */
  const hasPromptField = (spec?.fields ?? []).some((f) => f.key === "prompt");
  const mediaThumbs: { url?: string; label: string }[] = [];
  if (d.media.img_url?.url) mediaThumbs.push({ url: canvasMediaDisplaySrc(d.media.img_url), label: zh ? "首帧" : "frame" });
  if (d.media.video_url?.url) mediaThumbs.push({ label: zh ? "视频" : "video" });
  (d.media.reference_urls ?? d.media.ref_images ?? []).forEach((r, i) =>
    mediaThumbs.push({ url: canvasMediaDisplaySrc(r), label: `${zh ? "参考" : "ref"}${i + 1}` })
  );

  return (
    <article
      ref={rootRef as React.Ref<HTMLElement>}
      className={`cv-node cv-node-input${selected ? " cv-node-sel" : ""}${nodeExtraCls}`}
      data-kind="generate"
      style={{ left: px, top: py, width, height: node.h }}
      data-node-id={node.id} data-h={node.h ? "1" : undefined}
      onPointerDown={onDragHandle}
      onClick={onSelect}
      onWheel={(e) => e.stopPropagation()}
    >
      {ports}
      <header className="cv-node-head" onPointerDown={onDragHandle}>
        <span className="cv-node-mode"><NodeKindIcon kind={isDrama ? "drama" : isImageMode(d.mode) ? "image" : "video"} /></span>
        <span className="cv-node-title" title={node.title || spec?.displayName}>
          {node.title?.slice(0, 26) || spec?.displayName || "—"}
        </span>
        <button type="button" className="cv-node-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除节点" : "Remove"}>×</button>
      </header>

      <div className="cv-node-body">
        {/* 短剧分镜信息：台词 · [镜头类型] · 时长 */}
        {node.text && node.text !== d.prompt && (isDrama || (/\[.+?\]/.test(node.text) && /\d+s/.test(node.text))) && (
          <div className="cv-drama-info" onPointerDown={(e) => e.stopPropagation()}>
            {node.text.split(" · ").map((seg, i) => {
              if (seg.startsWith("[") && seg.endsWith("]")) return <span key={i} className="cv-di-shot">{seg.slice(1, -1)}</span>;
              if (/^\d+s$/.test(seg)) return <span key={i} className="cv-di-dur">{seg}</span>;
              const colon = seg.indexOf("：") >= 0 ? seg.indexOf("：") : seg.indexOf(":");
              if (colon > 0 && colon < 12) {
                return <span key={i} className="cv-di-line"><span className="cv-di-role">{seg.slice(0, colon)}</span>{seg.slice(colon)}</span>;
              }
              return <span key={i} className="cv-di-line">{seg}</span>;
            })}
          </div>
        )}

        {/* 已挂媒体 —— 只读缩略（上传/更换在底部对话框的媒体槽） */}
        {mediaThumbs.length > 0 && (
          <div className="cv-input-media" title={zh ? "媒体在下方对话框中更换" : "Manage media in the composer"}>
            {mediaThumbs.map((t, i) =>
              t.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={t.url} alt={t.label} />
              ) : (
                <span key={i} className="cv-input-media-ph">▶</span>
              )
            )}
          </div>
        )}

        {hasPromptField && (
          <textarea
            className="cv-node-prompt"
            value={d.prompt}
            placeholder={
              isImageMode(d.mode)
                ? zh ? "描述要生成的图片…" : "Describe the image…"
                : zh ? "描述画面、镜头、节奏…" : "Describe the scene, camera…"
            }
            onChange={(e) => onPromptChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
      </div>
      <ResizeHandles onResizeStart={onResizeStart} zh={zh} />
    </article>
  );
}

/* ─────────────── 剧集组框（短剧节点组：边界 + 标题栏 / 折叠封面卡） ─────────────── */

const GROUP_PAD = 26;
const GROUP_HEAD = 40;

function GroupFrame({
  box,
  zh,
  jobs,
  active,
  onTitleDown,
  onToggleCollapse,
  onRename,
  onRemove,
}: {
  box: { group: CanvasGroup; minX: number; minY: number; maxX: number; maxY: number; count: number; nodes: CanvasNode[] };
  zh: boolean;
  jobs: Job[];
  active: boolean;
  onTitleDown: (e: React.PointerEvent) => void;
  onToggleCollapse: () => void;
  onRename: (t: string) => void;
  onRemove: () => void;
}) {
  const { group, minX, minY, maxX, maxY, nodes } = box;
  const shots = nodes.filter((n) => (n.kind ?? "generate") === "generate");
  const doneImg = (n: CanvasNode): string | undefined => {
    for (const id of [n.imageJobId, n.jobId].filter(Boolean) as string[]) {
      const j = jobs.find((x) => x.id === id);
      if (j?.status === "done" && j.videoUrl && isImageMode(j.mode)) return j.videoUrl;
    }
    return undefined;
  };
  const thumbs = shots.map(doneImg).filter((u): u is string => !!u).slice(0, 4);
  const imgDone = shots.filter((n) => doneImg(n)).length;

  const head = (
    <header className="cv-group-head" onPointerDown={onTitleDown}>
      <button type="button" className="cv-group-fold" onPointerDown={(e) => e.stopPropagation()} onClick={onToggleCollapse} title={group.collapsed ? (zh ? "展开" : "Expand") : (zh ? "折叠" : "Collapse")}>
        {group.collapsed ? "▸" : "▾"}
      </button>
      <span className="cv-group-ic">🎬</span>
      <input className="cv-group-title" value={group.title} onChange={(e) => onRename(e.target.value)} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.currentTarget.select()} />
      <span className="cv-group-meta">{shots.length}{zh ? "镜" : ""}</span>
      <button type="button" className="cv-group-x" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title={zh ? "删除整部（可撤销）" : "Remove (undoable)"}>×</button>
    </header>
  );

  if (group.collapsed) {
    return (
      <div className={`cv-group cv-group-collapsed${active ? " active" : ""}`} style={{ left: minX, top: minY, width: 264 }} data-group-id={group.id}>
        {head}
        <div className="cv-group-cover">
          {thumbs.length ? thumbs.map((u, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={i} src={u} alt="" />
          )) : <div className="cv-group-cover-ph">🎬</div>}
        </div>
        <div className="cv-group-foot">{zh ? `出图 ${imgDone}/${shots.length}` : `Images ${imgDone}/${shots.length}`}</div>
      </div>
    );
  }

  return (
    <div
      className={`cv-group${active ? " active" : ""}`}
      style={{ left: minX - GROUP_PAD, top: minY - GROUP_PAD - GROUP_HEAD, width: maxX - minX + GROUP_PAD * 2, height: maxY - minY + GROUP_PAD * 2 + GROUP_HEAD }}
      data-group-id={group.id}
    >
      {head}
    </div>
  );
}
