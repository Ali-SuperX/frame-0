"use client";

/**
 * CanvasComposer —— 画布底部「智能输入框」（flowith 式极简）。
 *
 * 一条胶囊 + 一个输入框 + 一个发送键，承载四种能力：
 *   💬 对话（LLM 流式问答，输出落成 answer 节点）
 *   🖼 图片 / 🎬 视频（按当前模型生成，输出节点落在输入节点下方）
 *   ✦ 智能体（一句话编排：创意节点图 / 整部短剧）
 *
 * 与画布联动：
 *   - 选中输入节点 → 这里直接编辑它（draft 桥接在 Canvas 完成），发送 = 运行该节点
 *   - 任意输出节点点「↩ 引用」→ 这里出现引用 chips，下一次发送自动连线作上下文
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useStudioStore, type Job, type JobMedia } from "@/lib/store";
import {
  MODELS,
  getModel,
  defaultModelForMode,
  isImageMode,
  type ParamField,
} from "@/lib/bailian/models";
import { ParamFieldInput } from "../studio/ParamField";
import RatioGlyph from "../studio/composer/RatioGlyph";
import { useComposerDrag } from "../studio/composer/useComposerDrag";
import { uploadMediaFile } from "../studio/uploadMedia";
import type { OrchMode } from "@/lib/canvas/orchestrate";
import { useCanvasStore, type CanvasNode } from "@/lib/canvasStore";
import { normalizeLocalUploadPath } from "@/lib/mediaPaths";

const ModelPicker = dynamic(() => import("../studio/ModelPicker"), { ssr: false });
const MediaPicker = dynamic(() => import("../studio/MediaPicker"), { ssr: false });
const MediaMultiPicker = dynamic(() => import("../studio/MediaMultiPicker"), { ssr: false });

export type ComposerMode = "chat" | "image" | "video" | "agent";

export type ComposerApi = {
  openAgent: (mode: OrchMode) => void;
  openMode: (mode: ComposerMode) => void;
  focus: () => void;
  /** 题材二段式冷启动：把 seed 灌进编排框 + 设镜数 + 开编排 + 聚焦，让作者改一句再开拍，不直接起剧。 */
  primeAgent: (mode: OrchMode, seed: string, shots: number) => void;
};

/** 题材卡片 —— 智能体模式的灵感快捷（点一下：预填剧情 + 镜头数） */
const GENRE_CARDS: {
  id: string; emoji: string; zh: string; en: string;
  seed: string; seedEn: string; shots: number; mode: OrchMode;
}[] = [
  { id: "suspense", emoji: "🔍", zh: "悬疑", en: "Suspense", seed: "雨夜便利店，女店员发现监控里有诡异身影，追踪真相", seedEn: "A clerk spots a ghostly figure on CCTV at a rainy-night store", shots: 12, mode: "drama" },
  { id: "romance", emoji: "💕", zh: "甜宠", en: "Romance", seed: "咖啡馆偶遇，高冷总裁为女主挡雨，日久生情", seedEn: "A cold CEO shields the heroine from rain after a café meet-cute", shots: 12, mode: "drama" },
  { id: "period", emoji: "🏯", zh: "古风", en: "Period", seed: "深宫夜雨，废后联手太子翻盘复位", seedEn: "A deposed empress plots her comeback in the rainy palace", shots: 12, mode: "drama" },
  { id: "underdog", emoji: "🔥", zh: "逆袭", en: "Underdog", seed: "落魄外卖员觉醒系统，逆袭成都市传说", seedEn: "A down-and-out courier awakens powers and rises to legend", shots: 12, mode: "drama" },
  { id: "urban", emoji: "🌃", zh: "都市", en: "Urban", seed: "职场新人被陷害，逆袭成为最年轻合伙人", seedEn: "A framed newcomer rises to become the youngest partner", shots: 12, mode: "drama" },
  { id: "comedy", emoji: "😂", zh: "喜剧", en: "Comedy", seed: "社恐程序员被迫当伴郎，闹出一连串笑话", seedEn: "An introverted coder forced to be best man causes hilarious chaos", shots: 12, mode: "drama" },
  { id: "ad", emoji: "🛍", zh: "广告", en: "Ad", seed: "新款香水，都市女性优雅的一天", seedEn: "A new perfume across an elegant urban day", shots: 3, mode: "creative" },
  { id: "mv", emoji: "🎨", zh: "MV", en: "MV", seed: "城市夜景，孤独歌手在天台弹唱", seedEn: "A lonely singer plays guitar on a rooftop at night", shots: 4, mode: "creative" },
  { id: "doc", emoji: "📖", zh: "纪录", en: "Doc", seed: "街头手艺人的一天", seedEn: "A day in the life of a street craftsman", shots: 3, mode: "creative" },
];

/* ── 参数值的图标化展示：比例解析成矩形 glyph，尺寸只留一个数字 ── */
function ratioOfOpt(opt: { value: string | number | boolean; label: string }): string | null {
  const m = opt.label.match(/(\d+)\s*[:：]\s*(\d+)/);
  if (m) return `${m[1]}:${m[2]}`;
  const dim = String(opt.value).match(/(\d+)\s*[*x×]\s*(\d+)/);
  if (dim) {
    const w = Number(dim[1]);
    const h = Number(dim[2]);
    let a = w, b = h;
    while (b) { const t = b; b = a % b; a = t; }
    const g = a || 1;
    return `${Math.round(w / g)}:${Math.round(h / g)}`;
  }
  return null;
}
/** 尺寸枚举的极简文字：取长边像素（比例交给 glyph 表达）。 */
function shortSize(opt: { value: string | number | boolean; label: string }): string {
  const dim = (String(opt.value).match(/(\d+)\s*[*x×]\s*(\d+)/) ?? opt.label.match(/(\d+)\s*[*x×]\s*(\d+)/));
  if (dim) return String(Math.max(Number(dim[1]), Number(dim[2])));
  return opt.label.replace(/\([^)]*\)/g, "").trim().slice(0, 8);
}

const MODE_DEFS: { key: ComposerMode; zh: string; en: string }[] = [
  { key: "chat", zh: "对话", en: "Chat" },
  { key: "image", zh: "图片", en: "Image" },
  { key: "video", zh: "视频", en: "Video" },
  { key: "agent", zh: "智能体", en: "Agent" },
];

/** 模式小图标 —— 单色线性 SVG（跟随 currentColor，选中态染 accent 发光） */
function ModeIcon({ kind }: { kind: ComposerMode }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "chat") {
    return (
      <svg {...common} aria-hidden>
        <path d="M13.5 8.2c0 2.32-2.46 4.2-5.5 4.2-.62 0-1.22-.08-1.77-.22L3.5 13.5l.9-2.2C3.28 10.52 2.5 9.43 2.5 8.2 2.5 5.88 4.96 4 8 4s5.5 1.88 5.5 4.2Z" />
      </svg>
    );
  }
  if (kind === "image") {
    return (
      <svg {...common} aria-hidden>
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.6" />
        <circle cx="6" cy="6.8" r="1" fill="currentColor" stroke="none" />
        <path d="M4.5 11.2l2.6-2.6 1.9 1.9 2.2-2.2 1.6 1.6" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg {...common} aria-hidden>
        <rect x="2.5" y="3.8" width="11" height="8.4" rx="1.8" />
        <path d="M7 6.6v2.8L9.6 8 7 6.6Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // agent —— 四角星火花
  return (
    <svg {...common} aria-hidden>
      <path d="M8 2.6l1.15 3.1 3.1 1.15-3.1 1.15L8 11.1 6.85 8 3.75 6.85 6.85 5.7 8 2.6Z" />
      <path d="M12.2 10.6l.5 1.35 1.35.5-1.35.5-.5 1.35-.5-1.35-1.35-.5 1.35-.5.5-1.35Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 配置项迷你图标 —— 与 ModeIcon 同一笔触（13px / stroke 1.5 / currentColor） */
function MiniIcon({ kind }: { kind: "clip" | "clock" | "res" | "film" | "style" | "clapper" | "spark" | "ban" | "tune" }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "clip": // 回形针（附件）
      return (
        <svg {...common} aria-hidden>
          <path d="M12.6 7.1 8 11.7a3.1 3.1 0 0 1-4.4-4.4l4.9-4.9a2.1 2.1 0 0 1 3 3L6.7 10.2a1.1 1.1 0 0 1-1.6-1.6l4.3-4.3" />
        </svg>
      );
    case "clock": // 时长
      return (
        <svg {...common} aria-hidden>
          <circle cx="8" cy="8" r="5.6" />
          <path d="M8 5.2V8l2 1.4" />
        </svg>
      );
    case "res": // 分辨率（清晰度阶梯）
      return (
        <svg {...common} aria-hidden>
          <rect x="2.6" y="3.6" width="10.8" height="8.8" rx="1.5" />
          <path d="M5.2 9.8v-2M8 9.8V6.4M10.8 9.8V5" />
        </svg>
      );
    case "film": // 镜头数（胶片条）
      return (
        <svg {...common} aria-hidden>
          <rect x="2.6" y="4" width="10.8" height="8" rx="1.3" />
          <path d="M5.4 4v8M10.6 4v8" opacity="0.6" />
          <path d="M2.6 6.6h2.8M2.6 9.4h2.8M10.6 6.6h2.8M10.6 9.4h2.8" opacity="0.6" />
        </svg>
      );
    case "style": // 风格（画笔）
      return (
        <svg {...common} aria-hidden>
          <path d="M12.8 3.2a1.6 1.6 0 0 1 0 2.3L7.6 10.7l-2.9.6.6-2.9 5.2-5.2a1.6 1.6 0 0 1 2.3 0Z" />
          <path d="M4.7 11.3c-.8.2-1.4 1-1.5 1.9 1-.1 1.7-.7 1.9-1.5" opacity="0.7" />
        </svg>
      );
    case "clapper": // 短剧（场记板）
      return (
        <svg {...common} aria-hidden>
          <rect x="2.6" y="6" width="10.8" height="6.4" rx="1.2" />
          <path d="M2.8 6 12.6 3.4l.5 1.9L3.3 7.9 2.8 6Z" />
          <path d="M5.6 5.3l1.3 1.9M8.4 4.5l1.3 1.9" opacity="0.7" />
        </svg>
      );
    case "ban": // 负向词（禁止圈）
      return (
        <svg {...common} aria-hidden>
          <circle cx="8" cy="8" r="5.4" />
          <path d="M4.3 4.3l7.4 7.4" />
        </svg>
      );
    case "tune": // 通用参数（单旋钮）
      return (
        <svg {...common} aria-hidden>
          <path d="M3 8h2.2M10.8 8H13" opacity="0.55" />
          <circle cx="8" cy="8" r="2.3" fill="var(--ink-2, #111)" />
          <path d="M3 4.4h4.2M11 4.4h2M3 11.6h2M8.8 11.6h4.2" opacity="0.55" />
          <circle cx="9.2" cy="4.4" r="1.5" fill="var(--ink-2, #111)" />
          <circle cx="6.4" cy="11.6" r="1.5" fill="var(--ink-2, #111)" />
        </svg>
      );
    default: // spark —— 创意
      return (
        <svg {...common} aria-hidden>
          <path d="M8 3l1 2.7L11.7 7 9 8 8 10.7 7 8 4.3 7 7 5.7 8 3Z" />
          <circle cx="12.1" cy="11.6" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

const PLACEHOLDER: Record<ComposerMode | "drama", { zh: string; en: string }> = {
  chat: { zh: "每个伟大的想法都始于一个念头…（Enter 发送）", en: "Every great idea starts with a thought… (Enter to send)" },
  image: { zh: "描述要生成的图片 —— 主体、风格、光线、构图…", en: "Describe the image — subject, style, lighting…" },
  video: { zh: "描述画面、镜头运动、节奏与氛围…", en: "Describe the scene, camera moves, pacing…" },
  agent: { zh: "一句话需求，智能体编排出整张创作节点图…", en: "One line — the agent plans the whole graph…" },
  drama: { zh: "一句话剧情，先起草剧本梗概（可改），再逐步拆分镜 / 定角色场景…", en: "One line of story — draft a script first, then shots & cast…" },
};

const KIND_ICON: Record<string, string> = {
  generate: "🎞", note: "💡", character: "👤", scene: "🏞", chat: "💬", answer: "✦",
};

type RefMediaCandidate = {
  nodeId: string;
  kind: "image" | "video" | "audio";
  media: JobMedia;
};
type MediaAccept = Extract<ParamField, { kind: "media" }>["accept"];

function mediaIdentity(media: JobMedia | undefined): string {
  if (!media) return "";
  return media.localKey || media.localPath || media.url || media.previewUrl || media.name || "";
}

function sameMedia(a: JobMedia, b: JobMedia): boolean {
  const ai = mediaIdentity(a);
  const bi = mediaIdentity(b);
  return !!ai && !!bi && ai === bi;
}

function acceptMedia(kind: RefMediaCandidate["kind"], accept: MediaAccept): boolean {
  if (accept === "image|video") return kind === "image" || kind === "video";
  return accept === kind;
}

function jobResultMedia(job: Job | undefined, fallbackName: string): RefMediaCandidate | null {
  if (!job || job.status !== "done") return null;
  const resultUrl = normalizeLocalUploadPath(job.videoUrl);
  if (isImageMode(job.mode)) {
    const media = job.media?.img_url;
    const url = media?.url || resultUrl;
    if (!url) return null;
    return {
      nodeId: job.id,
      kind: "image",
      media: {
        ...media,
        url,
        name: media?.name || fallbackName,
        mime: media?.mime || job.localMime,
        localKey: media?.localKey || job.localKey,
        localPath: media?.localPath || (resultUrl?.startsWith("/api/") ? resultUrl : undefined),
      },
    };
  }
  if (resultUrl) {
    return {
      nodeId: job.id,
      kind: "video",
      media: {
        url: resultUrl,
        name: job.title || fallbackName,
        mime: job.localMime,
        localKey: job.localKey,
        localPath: resultUrl.startsWith("/api/") ? resultUrl : undefined,
      },
    };
  }
  return null;
}

function draftMediaCandidates(node: CanvasNode): RefMediaCandidate[] {
  const out: RefMediaCandidate[] = [];
  const add = (kind: RefMediaCandidate["kind"], media: JobMedia | undefined) => {
    if (!media?.url || out.some((x) => sameMedia(x.media, media))) return;
    out.push({ nodeId: node.id, kind, media });
  };
  add("image", node.draft.media.img_url);
  add("image", node.draft.media.last_frame_url);
  add("video", node.draft.media.first_clip_url);
  add("video", node.draft.media.video_url);
  (node.draft.media.reference_urls ?? []).forEach((m) => add(m.mime?.startsWith("video/") ? "video" : "image", m));
  (node.draft.media.ref_images ?? []).forEach((m) => add("image", m));
  return out;
}

function refMediaCandidates(refNodes: CanvasNode[], jobs: Job[]): RefMediaCandidate[] {
  const out: RefMediaCandidate[] = [];
  const add = (candidate: RefMediaCandidate | null) => {
    if (!candidate || out.some((x) => sameMedia(x.media, candidate.media))) return;
    out.push(candidate);
  };
  for (const node of refNodes) {
    const label = (node.title || node.text || node.draft.prompt || "reference").trim().slice(0, 40) || "reference";
    const ids = [node.jobId, node.imageJobId, node.videoJobId].filter(Boolean) as string[];
    for (const id of ids) add(jobResultMedia(jobs.find((j) => j.id === id), `${label}.png`));
    for (const candidate of draftMediaCandidates(node)) add(candidate);
  }
  return out;
}

type Props = {
  zh: boolean;
  /** 当前选中的可编辑输入节点（draft 已桥接到全局 store） */
  selectedNode: CanvasNode | null;
  /** 已点「↩ 引用」待连线的上游节点 */
  refNodes: CanvasNode[];
  /** 对话流式中 / 编排中 —— 禁发送 */
  busy: boolean;
  onRemoveRef: (id: string) => void;
  onClearSelection: () => void;
  onSubmitChat: (text: string, model?: string) => void;
  onSubmitMedia: () => void;
  onSubmitAgent: (brief: string, cfg: { mode: OrchMode; shots: number; style: string }) => void;
  /** 分镜数 —— 与坞「镜头数」共用同一来源(dramaShotCount)，单一数据源，避免「选了4还出12」。 */
  shotCount: number;
  onShotCount: (n: number) => void;
  /** 剧本节点(note)选中时：AI 改写 / 上传剧本文件。 */
  onRewriteScript?: (instruction: string, style?: string) => void;
  onUploadScript?: (file: File) => void;
  /** 短剧空态：建空白剧本自己写整篇 */
  onWriteOwn?: () => void;
  flash: (msg: string) => void;
  apiRef?: RefObject<ComposerApi | null>;
  /** 画布为空 —— 收起对话框，把「开始」首屏让成主角 */
  canvasEmpty?: boolean;
  /** 当前短剧阶段 —— 驱动对话框顶部阶段指示，每阶段不同。 */
  dramaStage?: string | null;
  /** 短剧模式 —— 隐藏「对话」段控，避免误入普通问答而非起草。 */
  isDramaMode?: boolean;
  /** 报告当前模式给画布（输入即联动草稿节点用）。 */
  onModeChange?: (m: ComposerMode) => void;
  /** drama 模式：Canvas 按 activeStage 构造的「阶段操作区」(配置 + 主批量按钮)，渲染在对话框顶部 */
  stageOps?: ReactNode;
};

const DRAMA_STAGE_HINT: Record<string, { zh: string; en: string; tip: string; tipEn: string }> = {
  script: { zh: "剧本", en: "Script", tip: "一句话起草，或自己写整篇", tipEn: "Draft from one line, or write your own" },
  shots: { zh: "分镜", en: "Shots", tip: "从剧本拆出可拍镜头", tipEn: "Break the script into shots" },
  assets: { zh: "角色场景", en: "Cast", tip: "提取并锁定角色一致性", tipEn: "Extract & lock character consistency" },
  design: { zh: "出图", en: "Image", tip: "顶部坞批量为分镜/资产出静帧", tipEn: "Batch images via the top dock" },
  i2v: { zh: "视频", en: "Video", tip: "已出图的分镜逐个转视频", tipEn: "Turn stills into video" },
  voice: { zh: "配音", en: "Voice", tip: "有台词的镜头批量配音", tipEn: "Batch voiceover for lines" },
  edit: { zh: "成片", en: "Cut", tip: "按顺序合成导出成片", tipEn: "Compose & export the cut" },
};
const CHAT_LLMS = [
  { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
  { id: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
  { id: "qwen3.6-plus", name: "Qwen 3.6 Plus" },
  { id: "qwen3.6-max", name: "Qwen 3.6 Max" },
  { id: "qwen-max", name: "Qwen Max" },
  { id: "qwen-plus", name: "Qwen Plus" },
  { id: "qwen-turbo", name: "Qwen Turbo" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
];
export default function CanvasComposer({
  zh,
  selectedNode,
  refNodes,
  busy,
  onRemoveRef,
  onClearSelection,
  onSubmitChat,
  onSubmitMedia,
  onSubmitAgent,
  shotCount,
  onShotCount,
  onRewriteScript,
  onUploadScript,
  onWriteOwn,
  flash,
  apiRef,
  canvasEmpty,
  dramaStage,
  isDramaMode,
  onModeChange,
  stageOps,
}: Props) {
  const draft = useStudioStore((s) => s.draft);
  const jobs = useStudioStore((s) => s.jobs);
  const setMode = useStudioStore((s) => s.setMode);
  const setModelId = useStudioStore((s) => s.setModelId);
  const setParam = useStudioStore((s) => s.setParam);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const setNegativePrompt = useStudioStore((s) => s.setNegativePrompt);
  const setMedia = useStudioStore((s) => s.setMedia);

  const [mode, setUiMode] = useState<ComposerMode>("chat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatModelId, setChatModelId] = useState("qwen3.6-plus"); // 对话 LLM 选择
  const [collapsed, setCollapsed] = useState(false);
  // 智能体配置
  const [agentMode, setAgentMode] = useState<OrchMode>("drama");
  // 分镜数与坞「镜头数」共用单一来源(dramaShotCount)，杜绝两个控件各记一份导致「选了4还出12」
  const agentShots = shotCount;
  const setAgentShots = onShotCount;
  const [agentStyle, setAgentStyle] = useState("");
  const [scriptStyle, setScriptStyle] = useState(""); // 剧本节点 AI 改写的风格
  const scriptFileRef = useRef<HTMLInputElement | null>(null);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 选中节点变化 → 跟随它的形态 + 展开（点节点即进入编辑）
  useEffect(() => {
    if (!selectedNode) return;
    setCollapsed(false);
    const k = selectedNode.kind ?? "generate";
    if (k === "chat" || k === "note") setUiMode("chat"); // note=剧本→文本编辑(走剧本面板)，绝不进视频模式
    else if (selectedNode.orchMode === "drama" && k === "generate") setUiMode("video"); // 短剧分镜/视频节点 → 默认视频模式(管线已是「分镜直接转视频」，不是出图)
    else setUiMode(isImageMode(selectedNode.draft.mode) ? "image" : "video");
  }, [selectedNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 画布为空 → 收起对话框，让「开始」首屏当主角（点首屏按钮会经 switchMode 展开）
  useEffect(() => {
    if (canvasEmpty && mode !== "agent") setCollapsed(true); // agent(短剧起草)态空画布也保持展开
  }, [canvasEmpty, mode]);
  // 把当前模式报告给画布 —— 输入即联动草稿节点要按模式定 kind
  useEffect(() => { onModeChange?.(mode); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  // 进短剧「首次且无选中节点」默认起草态(只一次)；之后可自由切 对话/图/视频；
  // 编辑某节点(尤其剧本 note)时绝不强切，否则剧本改写面板/节点联动会被冲掉。
  const dramaInitRef = useRef(false);
  useEffect(() => {
    if (!isDramaMode) { dramaInitRef.current = false; return; }
    if (dramaInitRef.current || selectedNode) return;
    setAgentMode("drama"); switchMode("agent");
    dramaInitRef.current = true;
  }, [isDramaMode, selectedNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点画布空白 → 收起对话框（点 dock / 节点 / 浮层不收）
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || rootRef.current?.contains(t)) return;
      if (t.closest(".cv-node")) { setCollapsed(false); return; } // 点节点 → 展开继续操作
      // 短剧坞 / 右键菜单 / 各类浮层内的点击都不算「点空白」
      if (t.closest(".cv-dock, .cv-ctxmenu, [role='dialog'], .st-backdrop, .dp-backdrop, .mp-lightbox")) return;
      if (t.closest(".cv-stage")) setCollapsed(true);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  // 暴露给画布的 api（空态按钮 / 工具栏）。每次渲染重赋值，闭包始终新鲜。
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      openAgent: (m) => {
        setAgentMode(m);
        switchMode("agent");
      },
      openMode: (m) => switchMode(m),
      focus: () => taRef.current?.focus(),
      primeAgent: (m, seed, shots) => {
        setPrompt(seed);
        setAgentShots(shots);
        setAgentMode(m);
        switchMode("agent");
        requestAnimationFrame(() => taRef.current?.focus());
      },
    };
  });

  // 切模式：图片/视频保证 draft 模型在轨；智能体/对话与选中的生成节点无关 → 先取消选中，
  // 防止 draft 桥接把题材 seed / 问题文本写进那个节点的 prompt。
  function switchMode(next: ComposerMode) {
    setUiMode(next);
    setPickerOpen(false);
    setCollapsed(false);
    if (next === "agent") onClearSelection();
    // 对话态【不再取消选中】：选中的节点要留着当「引用输入」(runChat 用它作锚点，往下连答案，不新建 chat 节点)。
    // 覆盖隐患已由「对话态不桥接载入 / 不反写回节点」堵死，无需靠取消选中来防。
    if (next === "image" && !isImageMode(draft.mode)) setMode("t2i");
    if (next === "video" && isImageMode(draft.mode)) setMode("t2v");
    requestAnimationFrame(() => taRef.current?.focus());
  }

  const spec = getModel(draft.modelId);
  const isScriptEdit = (selectedNode?.kind ?? "") === "note"; // 剧本节点编辑态 → 显示剧本操作面板
  // 视频节点：完整展示「真正发给百炼的那次生成」—— 提示词/模型/参数/参考图全部取自该视频的 job(实际调用记录，所见即后端真实调用)
  const backendJob = useStudioStore((s) =>
    selectedNode?.dramaVideoOf && selectedNode?.videoJobId
      ? s.jobs.find((j) => j.id === selectedNode.videoJobId) ?? null
      : null
  );
  const backendMeta = useMemo(() => {
    if (!backendJob) return null;
    const p = backendJob.params as Record<string, unknown>;
    const paramsText = [
      String(backendJob.mode).toUpperCase(),
      p.duration ? `${String(p.duration)}s` : null,
      typeof p.resolution === "string" ? p.resolution : null,
      typeof p.ratio === "string" ? p.ratio : null,
      p.watermark === false ? (zh ? "无水印" : "no watermark") : null,
    ].filter(Boolean).join(" · ");
    const refs = (backendJob.media?.reference_urls ?? []) as JobMedia[];
    const first = backendJob.media?.img_url as JobMedia | undefined;
    const thumbs = refs.length ? refs : first ? [first] : [];
    return { paramsText, thumbs, modelName: getModel(backendJob.modelId)?.displayName ?? backendJob.modelId };
  }, [backendJob, zh]);
  const isMediaMode = mode === "image" || mode === "video";
  const canPickModel = isMediaMode || mode === "chat"; // 图/视频选生成模型，对话选 LLM

  /* spec.fields 分区（仅媒体模式用） */
  const fields = useMemo(() => {
    const all = (isMediaMode ? spec?.fields : undefined) ?? [];
    const PRIMARY = new Set(["resolution", "ratio", "duration", "size"]);
    const params = all.filter((f) => f.kind !== "media" && f.key !== "prompt" && f.key !== "negative_prompt");
    return {
      media: all.filter((f) => f.kind === "media"),
      primary: params.filter((f) => PRIMARY.has(f.key)),
      advanced: params.filter((f) => !PRIMARY.has(f.key)),
      neg: all.find((f) => f.key === "negative_prompt"),
    };
  }, [spec, isMediaMode]);

  const referencedMedia = useMemo(
    () => refMediaCandidates(refNodes, jobs),
    [refNodes, jobs]
  );
  const refMediaKey = useMemo(
    () => referencedMedia.map((item) => `${item.kind}:${mediaIdentity(item.media)}`).join("|"),
    [referencedMedia]
  );
  const mediaFieldKey = useMemo(
    () => fields.media
      .filter((f): f is Extract<ParamField, { kind: "media" }> => f.kind === "media")
      .map((f) => `${f.key}:${f.accept}:${f.multiple ? "m" : "1"}:${f.maxCount ?? ""}`)
      .join("|"),
    [fields.media]
  );
  const autoApplyRefKey = `${mode}:${draft.modelId}:${mediaFieldKey}:${refMediaKey}`;
  const appliedRefKey = useRef("");
  useEffect(() => {
    if (!isMediaMode || !referencedMedia.length || !fields.media.length) return;
    if (appliedRefKey.current === autoApplyRefKey) return;
    appliedRefKey.current = autoApplyRefKey;

    const currentMedia = useStudioStore.getState().draft.media;
    const patch: Partial<Job["media"]> = {};
    let added = 0;
    const used = new Set<string>();
    const mediaFields = fields.media.filter((f): f is Extract<ParamField, { kind: "media" }> => f.kind === "media");

    for (const f of mediaFields.filter((item) => item.multiple)) {
      const candidates = referencedMedia.filter((item) => acceptMedia(item.kind, f.accept));
      if (!candidates.length) continue;
      const existing = (currentMedia[f.key as keyof typeof currentMedia] as JobMedia[] | undefined) ?? [];
      const room = Math.max(0, (f.maxCount ?? 9) - existing.length);
      if (!room) continue;
      const next = candidates
        .filter((item) => !existing.some((m) => sameMedia(m, item.media)))
        .slice(0, room)
        .map((item) => {
          used.add(mediaIdentity(item.media));
          return item.media;
        });
      if (next.length) {
        (patch as Record<string, JobMedia[]>)[f.key] = [...existing, ...next];
        added += next.length;
      }
    }

    const singleFields = mediaFields.filter((item) => !item.multiple);
    const singleCandidates = referencedMedia.filter((item) => !used.has(mediaIdentity(item.media)));
    let singleIdx = 0;
    for (const f of singleFields) {
      const existing = currentMedia[f.key as keyof typeof currentMedia] as JobMedia | undefined;
      if (existing) continue;
      const foundAt = singleCandidates.findIndex((item, idx) => idx >= singleIdx && acceptMedia(item.kind, f.accept));
      if (foundAt < 0) continue;
      const candidate = singleCandidates[foundAt];
      singleIdx = foundAt + 1;
      (patch as Record<string, JobMedia>)[f.key] = candidate.media;
      added += 1;
    }

    if (!added) return;
    setMedia(patch);
    flash(zh ? `已把 ${added} 个引用媒体填入输入槽 ✦` : `Filled ${added} referenced media`);
  }, [autoApplyRefKey, fields.media, flash, isMediaMode, referencedMedia, setMedia, zh]);

  const missing = useMemo(
    () =>
      fields.media
        .filter((f) => f.kind === "media" && f.required)
        .filter((f) => {
          const v = draft.media[f.key as keyof typeof draft.media];
          return !v || (Array.isArray(v) && !v.length);
        })
        .map((f) => f.label),
    [fields.media, draft]
  );

  const text = draft.prompt;
  const canSend =
    !busy &&
    (isScriptEdit
      ? true // 剧本改写：空指令 = 润色增强，允许直接发
      : mode === "chat" || mode === "agent"
        ? !!text.trim()
        : !missing.length && (!!text.trim() || draft.mode === "i2v" || draft.mode === "ve"));

  function submit() {
    if (!canSend) return;
    if (isScriptEdit) {
      onRewriteScript?.(text.trim(), scriptStyle.trim() || undefined);
      setPrompt("");
      return;
    }
    if (mode === "chat") {
      onSubmitChat(text.trim(), chatModelId);
      if (!selectedNode) setPrompt("");
    } else if (mode === "agent") {
      onSubmitAgent(text.trim(), { mode: agentMode, shots: agentShots, style: agentStyle.trim() });
      setPrompt("");
    } else {
      onSubmitMedia();
    }
  }

  /* 输入框自增高（上限 30vh） */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.3)}px`;
  }, [text, mode]);

  /* 浮层：点外面 / Esc 关 */
  useEffect(() => {
    if (!pickerOpen) return;
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [pickerOpen]);

  /* 拖图进框 → 落进当前模型的图片槽；对话/无槽时切到合适的模型 */
  async function handleImageDrop(files: File[]) {
    let targetModelId = draft.modelId;
    let target: ParamField | undefined = fields.media.find(
      (f) => f.kind === "media" && (f.accept === "image" || f.accept === "image|video")
    );
    if (!target || !isMediaMode) {
      const next = mode === "video" ? defaultModelForMode("i2v") : defaultModelForMode("i2i");
      targetModelId = next.id;
      setModelId(next.id);
      setUiMode(isImageMode(next.mode) ? "image" : "video");
      target = next.fields.find((f) => f.kind === "media" && (f.accept === "image" || f.accept === "image|video"));
      flash(zh ? `已切到${isImageMode(next.mode) ? "图生图" : "图生视频"}` : "Switched model for image input");
    }
    if (!target || target.kind !== "media") return;
    try {
      if (target.multiple) {
        const uploaded: JobMedia[] = [];
        for (const f of files.slice(0, target.maxCount ?? 5)) uploaded.push(await uploadMediaFile(f, targetModelId));
        const existing = (draft.media[target.key as keyof typeof draft.media] as JobMedia[] | undefined) ?? [];
        setMedia({ [target.key]: [...existing, ...uploaded] } as Partial<Job["media"]>);
      } else {
        const media = await uploadMediaFile(files[0], targetModelId);
        setMedia({ [target.key]: media } as Partial<Job["media"]>);
      }
      flash(zh ? "已上传 ✓" : "Uploaded ✓");
    } catch (e) {
      flash((zh ? "上传失败：" : "Upload failed: ") + (e instanceof Error ? e.message : String(e)).slice(0, 80));
    }
  }
  const { dragActive, dragHandlers } = useComposerDrag({ onImageDrop: handleImageDrop, ignoreSelector: ".mmt, .mp" });

  /* 隐藏 file input —— 📎 附件按钮（自动按需切模型，与拖拽同路） */
  const fileRef = useRef<HTMLInputElement | null>(null);

  const modeDef = MODE_DEFS.find((m) => m.key === mode)!;
  const pillModel =
    mode === "chat" ? (CHAT_LLMS.find((m) => m.id === chatModelId)?.name ?? "Qwen 3.6 Plus")
      : mode === "agent" ? (agentMode === "drama" ? (zh ? "短剧" : "Drama") : (zh ? "创意" : "Creative"))
        : spec?.displayName ?? draft.modelId;

  const selKind = selectedNode?.kind ?? "generate";
  const selLabel =
    selectedNode &&
    (selectedNode.title?.trim() ||
      selectedNode.draft.prompt.trim().slice(0, 18) ||
      (zh ? "未命名节点" : "untitled"));

  const visibleModes = MODE_DEFS; // 四模式全开(对话/图片/视频/智能体)——短剧也保留「对话」用于讨论/改写
  const modeIdx = visibleModes.findIndex((m) => m.key === mode);
  const isDramaAgent = mode === "agent" && agentMode === "drama";

  return (
    <div ref={rootRef} className={`cvc-dock${dragActive ? " cvc-dragging" : ""}${collapsed ? " cvc-collapsed" : ""}`} {...dragHandlers}>
      {/* 收起态：一条还原把手（点击 / 点节点 / 切模式即展开） */}
      <button
        type="button"
        className="cvc-restore"
        onClick={() => { setCollapsed(false); requestAnimationFrame(() => taRef.current?.focus()); }}
        title={zh ? "展开对话框" : "Expand"}
      >
        <ModeIcon kind={mode} />
        <span>{zh ? "继续创作" : "Compose"}</span>
        <em>↑</em>
      </button>

      {stageOps}

      {dramaStage && DRAMA_STAGE_HINT[dramaStage] && (
        <div className="cvc-stage-hint">
          <span className="cvc-stage-hint-step">{zh ? "短剧" : "Drama"} · {zh ? DRAMA_STAGE_HINT[dramaStage].zh : DRAMA_STAGE_HINT[dramaStage].en}</span>
          <span className="cvc-stage-hint-tip">{zh ? DRAMA_STAGE_HINT[dramaStage].tip : DRAMA_STAGE_HINT[dramaStage].tipEn}</span>
        </div>
      )}
      {/* ── 框沿外侧：左 = 四模式段控（原子能力）+ 标签；右 = 短剧工作流专属入口 ── */}
      <div className="cvc-top">
        <div className="cvc-top-l">
          <div className="cvc-modes" role="tablist" style={{ "--i": modeIdx } as CSSProperties}>
            <span className="cvc-modes-slider" aria-hidden />
            {visibleModes.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={mode === m.key}
                className={`cvc-mode-btn${mode === m.key ? " on" : ""}`}
                title={zh ? m.zh : m.en}
                onClick={() => {
                  if (m.key === "agent") setAgentMode("creative"); // ✦ = 创意编排；短剧走右侧入口
                  switchMode(m.key);
                }}
              >
                <ModeIcon kind={m.key} />
              </button>
            ))}
          </div>
          <button
            key={`${mode}-${isDramaAgent ? "d" : "c"}`}
            type="button"
            className={`cvc-top-label${canPickModel ? " is-btn" : ""}${pickerOpen ? " on" : ""}`}
            onClick={() => canPickModel && setPickerOpen((o) => !o)}
            title={canPickModel ? (zh ? "切换模型" : "Switch model") : undefined}
            tabIndex={canPickModel ? 0 : -1}
          >
            <b>{isScriptEdit ? (zh ? "剧本" : "Script") : isDramaAgent ? (zh ? "短剧" : "Drama") : zh ? modeDef.zh : modeDef.en}</b>
            <i>·</i>
            <span>{isScriptEdit ? (zh ? "AI 改写" : "Rewrite") : isDramaAgent ? (zh ? "智能编排" : "Agent") : pillModel}</span>
            {canPickModel && <em className="cvc-top-caret">{pickerOpen ? "▴" : "▾"}</em>}
          </button>
        </div>
      </div>

      {/* ── 引用上下文 chips ── */}
      {(refNodes.length > 0 || selectedNode) && (
        <div className="cvc-refs">
          {selectedNode && (
            <span className="cvc-ref cvc-ref-editing" title={zh ? "正在编辑此节点 —— 发送即运行它" : "Editing this node — send to run it"}>
              ✎ {KIND_ICON[selKind]} {selLabel}
              <button type="button" onClick={onClearSelection} title={zh ? "取消选中（回到新建模式）" : "Deselect"}>×</button>
            </span>
          )}
          {refNodes.map((n) => (
            <span key={n.id} className="cvc-ref" title={zh ? "已引用为上下文 —— 发送时自动连线" : "Referenced as context"}>
              ↩ {KIND_ICON[n.kind ?? "generate"]} {(n.title || n.text || n.draft.prompt || "").trim().slice(0, 14) || (zh ? "输出" : "output")}
              <button type="button" onClick={() => onRemoveRef(n.id)} title={zh ? "移除引用" : "Remove"}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* ── 智能体配置行（短剧/创意由框沿两个入口决定，这里只剩参数） ── */}
      {mode === "agent" && (
        <div className="cvc-agent">
          <label className="cvc-agent-opt" title={zh ? "镜头数" : "Shots"}>
            <MiniIcon kind="film" />
            <input type="number" min={1} max={40} step={1} value={agentShots > 0 ? agentShots : ""} disabled={agentShots === 0} placeholder={agentShots === 0 ? (zh ? "自动" : "Auto") : ""} title={zh ? "自定义 1–40 镜，或点「AI 自动」交给模型判断" : "Custom 1–40, or AI auto"} onChange={(e) => setAgentShots(Math.max(1, Math.min(40, Math.round(Number(e.target.value)) || 1)))} />
            <button type="button" className={`cv-shots-auto${agentShots === 0 ? " on" : ""}`} onClick={(e) => { e.preventDefault(); setAgentShots(agentShots === 0 ? 12 : 0); }} title={zh ? "让模型根据剧本自己判断分几镜、分多少" : "Let AI decide shot count"}>✦ {zh ? "AI 自动" : "Auto"}</button>
          </label>
          <label className="cvc-agent-opt cvc-agent-stylebox" title={zh ? "风格" : "Style"}>
            <MiniIcon kind="style" />
            <input
              className="cvc-agent-style"
              type="text"
              value={agentStyle}
              onChange={(e) => setAgentStyle(e.target.value)}
              placeholder={zh ? "胶片感…" : "style…"}
            />
          </label>
          <div className="cvc-agent-cards">
            {onWriteOwn && (
              <button type="button" className="cvc-agent-card cvc-agent-own" title={zh ? "建一张空剧本，自己写或粘贴整篇" : "Blank script — write your own"} onClick={onWriteOwn}>
                ✎ {zh ? "自己写" : "Write"}
              </button>
            )}
            {onUploadScript && (
              <label className="cvc-agent-card cvc-agent-own" title={zh ? "上传剧本文件（.txt / .md / .docx / .pdf），自动建剧本节点" : "Upload script (txt/md/docx/pdf)"}>
                📎 {zh ? "传剧本" : "Upload"}
                <input type="file" accept=".txt,.md,.docx,.pdf,text/plain,text/markdown" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadScript(f); e.target.value = ""; }} />
              </label>
            )}
            {GENRE_CARDS.filter((c) => c.mode === agentMode).map((c) => (
              <button
                key={c.id}
                type="button"
                className="cvc-agent-card"
                title={zh ? c.seed : c.seedEn}
                onClick={() => {
                  setPrompt(zh ? c.seed : c.seedEn);
                  setAgentShots(c.shots);
                  taRef.current?.focus();
                }}
              >
                {c.emoji} {zh ? c.zh : c.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 媒体槽（图片/视频模式且模型有媒体位） ── */}
      {isMediaMode && fields.media.length > 0 && (
        <div className="cvc-media">
          {fields.media.map((f) =>
            f.kind === "media" && f.multiple ? (
              <MediaMultiPicker
                key={f.key}
                label={f.label}
                accept={f.accept}
                maxCount={f.maxCount ?? 5}
                modelName={draft.modelId}
                value={draft.media[f.key as keyof typeof draft.media] as JobMedia[] | undefined}
                onChange={(m) => setMedia({ [f.key]: m } as Partial<typeof draft.media>)}
              />
            ) : f.kind === "media" ? (
              <MediaPicker
                key={f.key}
                label={f.label}
                accept={f.accept}
                modelName={draft.modelId}
                compact
                optional={!f.required}
                value={draft.media[f.key as keyof typeof draft.media] as JobMedia | undefined}
                onChange={(m) => setMedia({ [f.key]: m } as Partial<typeof draft.media>)}
              />
            ) : null
          )}
        </div>
      )}

      {/* ── 输入框 ── */}
      <textarea
        ref={taRef}
        className="cvc-input"
        value={text}
        placeholder={isScriptEdit ? (zh ? "改写指令：如「扩写到 200 字」「加一个反转」「换都市背景」——留空＝润色增强；也可 📎 上传或直接在卡片里改" : "Rewrite instruction… (blank = polish; or 📎 upload / edit the card)") : zh ? PLACEHOLDER[isDramaAgent ? "drama" : mode].zh : PLACEHOLDER[isDramaAgent ? "drama" : mode].en}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />

      {/* 短剧分镜/视频节点：「接上一镜」续写衔接开关 —— 分镜上预勾(首次出整组前)或视频节点上勾，
          出视频时取上一镜实际尾帧当第一帧、接续画面继续演 */}
      {isDramaMode && selectedNode && (selectedNode.kind ?? "generate") === "generate" && (
        <label className="cvc-continue" title={zh ? "出视频时取上一镜（按位置序）视频的实际尾帧当本段第一帧，接续上一镜画面继续演。首镜/上一镜还没视频则回退普通生成。适合连续动作，跳切镜建议关。可在分镜上预先勾选。" : "Use the previous shot's real tail frame as this clip's first frame, continuing the motion. Falls back to normal generation for the first shot or when the previous video isn't ready."}>
          <input
            type="checkbox"
            checked={!!selectedNode.continuePrev}
            onChange={(e) => useCanvasStore.getState().updateNode(selectedNode.id, { continuePrev: e.target.checked })}
          />
          <span>{zh ? "接上一镜（续写衔接）" : "Continue from previous shot"}</span>
        </label>
      )}

      {/* 视频节点：折叠对照「上次实际发的」模型/参数/参考图(prompt 已在上方主输入，不重复) */}
      {backendJob && backendMeta && (
        <details className="cvc-backend">
          <summary>{zh ? "上次生成的配置 · 对照" : "Last generation · reference"}</summary>
          <div className="cvc-backend-body">
            <div className="cvc-bk-grid">
              <span className="cvc-bk-k">{zh ? "模型" : "Model"}</span>
              <span className="cvc-bk-v">{backendMeta.modelName}</span>
              <span className="cvc-bk-k">{zh ? "参数" : "Params"}</span>
              <span className="cvc-bk-v">{backendMeta.paramsText || "—"}</span>
              {backendMeta.thumbs.length > 0 && (
                <>
                  <span className="cvc-bk-k">{backendJob.mode === "r2v" ? (zh ? "参考图" : "Refs") : (zh ? "首帧" : "Frame")}</span>
                  <span className="cvc-bk-thumbs">
                    {backendMeta.thumbs.map((m, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={m.previewUrl || m.url} alt="" title={m.name || ""} />
                    ))}
                  </span>
                </>
              )}
            </div>
          </div>
        </details>
      )}

      {/* ── 底栏：附件 + 参数 | 发送 ── */}
      <div className="cvc-bar">
        <div className="cvc-bar-l">
          {isScriptEdit && (
            <>
              <button type="button" className="cvc-ico" onClick={() => scriptFileRef.current?.click()} title={zh ? "上传剧本（.txt / .md / .docx / .pdf）" : "Upload script"}>
                <MiniIcon kind="clip" />
              </button>
              <input ref={scriptFileRef} type="file" accept=".txt,.md,.docx,.pdf,text/plain,text/markdown" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadScript?.(f); e.target.value = ""; }} />
              <details className="cvc-chip">
                <summary title={zh ? "改写风格" : "Style"}>
                  <MiniIcon kind="style" />
                  <span className={`cvc-chip-v${scriptStyle ? " on" : ""}`}>{scriptStyle || (zh ? "风格" : "Style")}</span>
                </summary>
                <div className="cvc-chip-pop">
                  <div className="cvc-chip-k">{zh ? "改写风格" : "Rewrite style"}</div>
                  <div className="cvc-style-grid">
                    {(zh ? ["写实", "悬疑", "甜宠", "古风", "搞笑", "热血", "治愈", "脑洞"] : ["Realistic", "Thriller", "Romance", "Period", "Comedy", "Action", "Healing", "Wild"]).map((s) => (
                      <button key={s} type="button" className={`cvc-style-opt${scriptStyle === s ? " on" : ""}`} onClick={(e) => { setScriptStyle(scriptStyle === s ? "" : s); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}>{s}</button>
                    ))}
                  </div>
                </div>
              </details>
              <span className="cvc-script-hint">{zh ? "✦ 发送＝AI 改写" : "✦ send = rewrite"}</span>
            </>
          )}
          {isMediaMode && (
            <>
              <button
                type="button"
                className="cvc-ico"
                onClick={() => fileRef.current?.click()}
                title={zh ? "上传图片（也可直接拖进来）" : "Attach image (or drop)"}
              >
                <MiniIcon kind="clip" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                multiple
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  if (fs.length) void handleImageDrop(fs);
                  e.target.value = "";
                }}
              />
              {/* 所有参数全平铺（能点一下就不点两下）：bool=直接开关，
                  比例/尺寸=glyph 网格，其余=图标 chip 点开就调；不再藏 ⚙ */}
              {[...fields.primary, ...fields.advanced].map((f) => {
                const raw = draft.params[f.key];
                // bool —— chip 本身就是开关，点一下直接切，不开弹层
                if (f.kind === "bool") {
                  return (
                    <button
                      key={f.key}
                      type="button"
                      className={`cvc-chip cvc-chip-toggle${raw ? " on" : ""}`}
                      title={`${f.label} · ${raw ? (zh ? "开" : "On") : zh ? "关" : "Off"}`}
                      onClick={() => setParam(f.key, !raw)}
                    >
                      <span className="cvc-tg"><span className="cvc-tg-dot" /></span>
                      <span className="cvc-chip-v">{f.label}</span>
                    </button>
                  );
                }
                const opt = f.kind === "enum" ? f.options.find((o) => o.value === raw) ?? f.options[0] : undefined;
                const optRatio = opt ? ratioOfOpt(opt) : null;
                const allRatio = f.kind === "enum" && f.options.length > 0 && f.options.every((o) => ratioOfOpt(o));
                const iconKind = f.key === "duration" ? "clock"
                  : f.key === "resolution" || f.key === "size" ? "res"
                    : "tune";
                return (
                  <details key={f.key} className="cvc-chip">
                    <summary title={`${f.label}${opt ? ` · ${opt.label}` : ""}`}>
                      {f.key === "ratio" ? (
                        <RatioGlyph ratio={String(raw ?? "16:9")} base={12} />
                      ) : optRatio ? (
                        <>
                          <RatioGlyph ratio={optRatio} base={12} />
                          <span className="cvc-chip-v">{shortSize(opt!)}</span>
                        </>
                      ) : (
                        <>
                          <MiniIcon kind={iconKind} />
                          <span className="cvc-chip-v">
                            {f.kind === "enum"
                              ? opt?.label ?? "—"
                              : `${raw ?? "—"}${f.kind === "int" ? f.unit ?? "" : ""}`}
                          </span>
                        </>
                      )}
                    </summary>
                    <div className="cvc-chip-pop">
                      <div className="cvc-chip-k">{f.label}</div>
                      {allRatio && f.kind === "enum" ? (
                        <div className="cvc-ratio-grid">
                          {f.options.map((o) => (
                            <button
                              key={String(o.value)}
                              type="button"
                              className={`cvc-ratio-opt${raw === o.value ? " on" : ""}`}
                              title={o.label}
                              onClick={(e) => {
                                setParam(f.key, o.value);
                                (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                              }}
                            >
                              <RatioGlyph ratio={ratioOfOpt(o)!} base={22} />
                              <span>{f.key === "ratio" ? ratioOfOpt(o) : shortSize(o)}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <ParamFieldInput
                          field={f}
                          value={raw}
                          onChange={(v) => setParam(f.key, v)}
                        />
                      )}
                    </div>
                  </details>
                );
              })}
              {fields.neg && (
                <details className="cvc-chip">
                  <summary title={`${zh ? "负向词" : "Negative"}${draft.negativePrompt ? ` · ${draft.negativePrompt.slice(0, 30)}` : ""}`}>
                    <MiniIcon kind="ban" />
                    <span className={`cvc-chip-v${draft.negativePrompt ? " on" : ""}`}>{zh ? "负向" : "Neg"}</span>
                  </summary>
                  <div className="cvc-chip-pop cvc-chip-pop-wide">
                    <div className="cvc-chip-k">{zh ? "负向词 —— 不想出现的内容" : "Negative prompt"}</div>
                    <ParamFieldInput field={fields.neg} value={draft.negativePrompt} onChange={(v) => setNegativePrompt((v as string) ?? "")} />
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <div className="cvc-bar-r">
          {isMediaMode && missing.length > 0 && (
            <span className="cvc-missing" title={zh ? "缺少必填媒体" : "Missing required media"}>
              {zh ? "还缺 " : "Need "}{missing.join(" / ")}
            </span>
          )}
          <button
            type="button"
            className={`cvc-send${busy ? " busy" : ""}`}
            disabled={!canSend}
            onClick={submit}
            title={
              busy
                ? (zh ? "处理中…" : "Working…")
                : mode === "agent"
                  ? (zh ? "开始编排（Enter）" : "Orchestrate (Enter)")
                  : selectedNode
                    ? (zh ? "运行选中节点（Enter）" : "Run node (Enter)")
                    : (zh ? "发送（Enter）" : "Send (Enter)")
            }
          >
            {busy ? <span className="cvc-send-spin" /> : "↑"}
          </button>
        </div>
      </div>

      {/* ── 模型选择浮层（仅图片/视频，自左上标签呼出） ── */}
      {pickerOpen && mode === "chat" && (
        <div className="cvc-pop">
          <div className="cvc-pop-llms">
            {CHAT_LLMS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`cvc-llm-item${chatModelId === m.id ? " on" : ""}`}
                onClick={() => { setChatModelId(m.id); setPickerOpen(false); }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {pickerOpen && isMediaMode && (
        <div className="cvc-pop">
          <div className="cvc-pop-models">
            <ModelPicker
              models={MODELS.filter((m) => (mode === "image" ? isImageMode(m.mode) : !isImageMode(m.mode)))}
              selectedId={draft.modelId}
              onSelect={(id) => {
                setModelId(id);
                setPickerOpen(false);
              }}
              zh={zh}
            />
          </div>
        </div>
      )}
    </div>
  );
}
