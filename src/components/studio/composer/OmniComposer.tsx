"use client";

/**
 * OmniComposer —— 工坊「全能对话框」。
 *
 * 底部浮动、毛玻璃、四角布局：
 *   左上 = 模型选择 + 生视频/生图片
 *   右上 = 预设 + 设置
 *   中央 = prompt 文本框 + 内联媒体上传
 *   左下 = 参数 chips（常用平铺 + 更多▾）
 *   右下 = 价格 + 折扣 + 清空 + 生成
 *
 * 数据：draft / actions / discount 直接读 store；派生值
 * (currentSpec / missingFields / modelsForMode / cost) 由 Studio 透传。
 * 内层控件复用既有 .cmp- / .pf- / .mmt- 样式，外壳是新的 .oc- 前缀。
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
// Link removed — director banner removed
import dynamic from "next/dynamic";
import {
  useStudioStore,
  type Job,
  type JobMedia,
} from "@/lib/store";
import {
  MODELS,
  defaultModelForMode,
  modelsByMode,
  getModel,
  type Mode,
  type ModelSpec,
  type ParamField,
} from "@/lib/bailian/models";
import { formatFen } from "@/lib/bailian/cost";
import { ParamFieldInput } from "../ParamField";
import { uploadMediaFile } from "../uploadMedia";
import RatioGlyph from "./RatioGlyph";
import { useComposerDrag } from "./useComposerDrag";
import { streamDirectorExpand } from "@/lib/r2v/directorExpand";
import DirectorPresetPicker from "../DirectorPresetPicker";
import { orchestrateGraph, type OrchestratedGraph, type OrchestratedNode } from "@/lib/canvas/orchestrate";
import { useCanvasStore } from "@/lib/canvasStore";
import { listVoices, getVoice, type TTSVoice } from "@/lib/r2v/ttsVoices";
import "@/styles/omni-composer.css";

const ModelPicker = dynamic(() => import("../ModelPicker"), { ssr: false });
const MediaPicker = dynamic(() => import("../MediaPicker"), { ssr: false });
const MediaMultiPicker = dynamic(() => import("../MediaMultiPicker"), {
  ssr: false,
});

/** Prompt 输入框占位语 —— 跟随当前模式（从 Studio 搬来，仅 composer 用）。 */
const PROMPT_PLACEHOLDER: Record<Mode, { zh: string; en: string }> = {
  t2v: {
    zh: "描述你想要的画面、镜头运动、节奏与氛围…",
    en: "Describe the scene, camera moves, pacing and mood…",
  },
  i2v: {
    zh: "描述首帧之后会发生什么 —— 动作、表情、镜头运动…",
    en: "What happens after the first frame — motion, camera…",
  },
  r2v: {
    zh: "用 character1 / character2 引用上传的角色，描述他们的动作与场景…",
    en: "Reference roles with character1 / character2; describe the scene…",
  },
  ve: {
    zh: "描述要做的编辑 —— 风格转换 / 局部替换 / 替换服装…",
    en: "Describe the edit — style transfer, replacement, restyling…",
  },
  t2i: {
    zh: "描述你想生成的图片 —— 主体、风格、光线、构图…",
    en: "Describe the image — subject, style, lighting, composition…",
  },
  i2i: {
    zh: "描述要怎么改这张图 —— 具体的编辑指令…",
    en: "Describe how to edit the image — the instruction…",
  },
};

/** 运镜建议 chip —— 点一下把运镜词插进 prompt，省得手打、也教用户写专业镜头语言。
 *  仅生视频的模式（t2v/i2v/r2v）出现。 */
const CAMERA_CHIPS: { zh: string; en: string; phrase: string; phraseEn: string }[] = [
  { zh: "推近", en: "Push in", phrase: "镜头缓慢推近", phraseEn: "slow push-in" },
  { zh: "拉远", en: "Pull out", phrase: "镜头缓慢拉远", phraseEn: "slow pull-out" },
  { zh: "平移", en: "Pan", phrase: "镜头横向平移", phraseEn: "lateral pan" },
  { zh: "环绕", en: "Orbit", phrase: "镜头环绕主体", phraseEn: "orbit around subject" },
  { zh: "俯拍", en: "Top-down", phrase: "俯拍视角", phraseEn: "top-down angle" },
  { zh: "手持", en: "Handheld", phrase: "手持镜头微晃", phraseEn: "handheld slight shake" },
  { zh: "跟拍", en: "Follow", phrase: "镜头跟随主体", phraseEn: "follow the subject" },
];

/** 短剧 Pipeline 六步定义 */
export const PIPELINE_STEPS = [
  { key: "script",  icon: "📝", zh: "剧本", en: "Script" },
  { key: "storyboard", icon: "🎬", zh: "分镜", en: "Storyboard" },
  { key: "design",  icon: "🎨", zh: "出图", en: "Design" },
  { key: "i2v",     icon: "▶",  zh: "视频", en: "I2V" },
  { key: "voice",   icon: "🔊", zh: "配音", en: "Voice" },
  { key: "edit",    icon: "✂",  zh: "剪辑", en: "Edit" },
] as const;
export type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["key"];

const SHOT_TYPES = [
  { value: "still",    label: "静 still" },
  { value: "zoom-in",  label: "推 zoom-in" },
  { value: "zoom-out", label: "拉 zoom-out" },
  { value: "pan-lr",   label: "横移 pan" },
  { value: "live",     label: "动态 live" },
  { value: "ots",      label: "过肩 ots" },
  { value: "pov",      label: "主观 pov" },
  { value: "dutch",    label: "斜角 dutch" },
  { value: "hero",     label: "英雄 hero" },
] as const;

/** Pipeline 步骤动作回调 */
export type PipelineAction =
  | { step: "script"; action: "generate"; data: { genre?: string; outline: string; shots: number; style: string } }
  | { step: "storyboard"; action: "confirm"; data: { graph: OrchestratedGraph } }
  | { step: "design"; action: "generate"; data: { modelId: string } }
  | { step: "i2v"; action: "generate"; data: { modelId: string; params: Record<string, unknown> } }
  | { step: "voice"; action: "generate"; data: { voice: string } }
  | { step: "edit"; action: "export"; data: {
      aspect: "16:9" | "9:16" | "1:1";
      transition: "fade" | "fadeblack" | "wipeleft" | "circleopen";
      crossfadeSec: number;
      subtitle: boolean;
      bgmFile?: File;
      bgmVolume: number;
    }};

const ALL_VOICES = listVoices();
type VoiceFilter = "all" | "female" | "male";

type Props = {
  zh: boolean;
  directorHref: string;
  currentSpec: ModelSpec | undefined;
  missingFields: string[];
  costRawFen: number;
  costFinalFen: number;
  costDiscounted: boolean;
  onSubmit: () => void;
  onSave: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  flashToast: (msg: string) => void;
  /** 短剧 Pipeline 模式开关（由外部控制是否显示 pipeline tab） */
  enablePipeline?: boolean;
  /** Pipeline 步骤动作回调（返回 Promise 让 OmniComposer 跟踪 busy 态） */
  onPipelineAction?: (action: PipelineAction) => Promise<void>;
  /** 外部控制当前 pipeline 进度（如正在出图中） */
  pipelineProgress?: { step: PipelineStepKey; done: number; total: number; label?: string } | null;
};

export default function OmniComposer({
  zh,
  currentSpec,
  enablePipeline,
  onPipelineAction,
  pipelineProgress,
  missingFields,
  costRawFen,
  costFinalFen,
  costDiscounted,
  onSubmit,
  onSave,
  onOpenLibrary,
  onOpenSettings,
  flashToast,
}: Props) {
  const draft = useStudioStore((s) => s.draft);
  const setMode = useStudioStore((s) => s.setMode);
  const setModelId = useStudioStore((s) => s.setModelId);
  const setParam = useStudioStore((s) => s.setParam);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const setNegativePrompt = useStudioStore((s) => s.setNegativePrompt);
  const setMedia = useStudioStore((s) => s.setMedia);
  const resetDraft = useStudioStore((s) => s.resetDraft);
  const discount = useStudioStore((s) => s.discount);
  const setDiscount = useStudioStore((s) => s.setDiscount);
  const activeJobId = useStudioStore((s) => s.activeJobId);
  const draftLoadedAt = useStudioStore((s) => s.draftLoadedAt);
  const activeJobStatus = useStudioStore(
    (s) => s.jobs.find((j) => j.id === s.activeJobId)?.status
  );

  /* ── Pipeline 模式 ── */
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0); // 0-5 对应六步
  const [plScript, setPlScript] = useState(""); // Step 1: 大纲文本
  const [plGenre, setPlGenre] = useState<string | null>(null);
  const [plShots, setPlShots] = useState(6);
  const [plStyle, setPlStyle] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const [plOrcResult, setPlOrcResult] = useState<OrchestratedGraph | null>(null);
  // Pipeline 模型/参数选择
  const [plDesignModel, setPlDesignModel] = useState(() => defaultModelForMode("t2i").id);
  const [plI2vModel, setPlI2vModel] = useState(() => defaultModelForMode("i2v").id);
  const [plI2vParams, setPlI2vParams] = useState<Record<string, unknown>>(() => ({ ...defaultModelForMode("i2v").defaults }));
  const [plVoice, setPlVoice] = useState("Ethan");
  const [plVoiceFilter, setPlVoiceFilter] = useState<VoiceFilter>("all");
  // Step 5 合成配置
  const [plAspect, setPlAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [plTransition, setPlTransition] = useState<"fade" | "fadeblack" | "wipeleft" | "circleopen">("fade");
  const [plCrossfade, setPlCrossfade] = useState(0.5);
  const [plSubtitle, setPlSubtitle] = useState(true);
  const [plBgmFile, setPlBgmFile] = useState<File | null>(null);
  const [plBgmVolume, setPlBgmVolume] = useState(0.3);

  const plDesignSpec = getModel(plDesignModel);
  const plI2vSpec = getModel(plI2vModel);
  const t2iModels = useMemo(() => modelsByMode("t2i"), []);
  const i2vModels = useMemo(() => modelsByMode("i2v"), []);

  const updateOrcNode = (ref: string, patch: Partial<OrchestratedNode>) => {
    setPlOrcResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map((n) => (n.ref === ref ? { ...n, ...patch } : n)),
      };
    });
  };

  // 读画布节点（用于 pipeline steps 3-6 显示进度）
  const canvasNodes = useCanvasStore((s) => s.nodes);
  const dramaGenNodes = useMemo(
    () => canvasNodes.filter((n) => n.orchMode === "drama" && (n.kind ?? "generate") === "generate"),
    [canvasNodes]
  );
  const dramaAssetNodes = useMemo(
    () => canvasNodes.filter((n) => n.orchMode === "drama" && (n.kind === "character" || n.kind === "scene")),
    [canvasNodes]
  );
  const jobs = useStudioStore((s) => s.jobs);
  const nodeImageDone = useMemo(
    () => dramaGenNodes.filter((n) => { const j = n.imageJobId ? jobs.find((jj) => jj.id === n.imageJobId) : undefined; return j?.status === "done"; }).length,
    [dramaGenNodes, jobs]
  );
  const nodeVideoDone = useMemo(
    () => dramaGenNodes.filter((n) => { const j = n.videoJobId ? jobs.find((jj) => jj.id === n.videoJobId) : undefined; return j?.status === "done"; }).length,
    [dramaGenNodes, jobs]
  );
  const nodeVoiceDone = useMemo(
    () => dramaGenNodes.filter((n) => !!n.voiceJobId).length,
    [dramaGenNodes]
  );

  type NodeJobStatus = "pending" | "running" | "done" | "error";
  const getImgStatus = (n: { imageJobId?: string }): NodeJobStatus => {
    if (!n.imageJobId) return "pending";
    const j = jobs.find((jj) => jj.id === n.imageJobId);
    if (!j) return "pending";
    if (j.status === "done") return "done";
    if (j.status === "error") return "error";
    return "running";
  };
  const getVidStatus = (n: { videoJobId?: string }): NodeJobStatus => {
    if (!n.videoJobId) return "pending";
    const j = jobs.find((jj) => jj.id === n.videoJobId);
    if (!j) return "pending";
    if (j.status === "done") return "done";
    if (j.status === "error") return "error";
    return "running";
  };
  const STATUS_ICON: Record<NodeJobStatus, string> = { pending: "○", running: "◌", done: "●", error: "✕" };
  const STATUS_LABEL: Record<NodeJobStatus, { zh: string; en: string }> = {
    pending: { zh: "待处理", en: "Pending" },
    running: { zh: "处理中", en: "Running" },
    done:    { zh: "完成", en: "Done" },
    error:   { zh: "失败", en: "Error" },
  };

  /* 导演 AI 流式扩写态：null=未触发 / streaming(逐字回写中) / 出结果 / 出错。 */
  const [dir, setDir] = useState<{ streaming: boolean; result?: string; error?: string } | null>(null);
  const dirAbort = useRef<AbortController | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);

  /* 收起态：看生成结果时把对话框缩成细条，让预览区视频撑大（持久化）。 */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("oc-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      const nv = !v;
      try {
        localStorage.setItem("oc-collapsed", nv ? "1" : "0");
      } catch {
        /* ignore */
      }
      return nv;
    });
  }

  /* 情境化自动收起：成片就位时把对话框收成细条，让视频成为绝对焦点撑满舞台；
     空态（没有可看的结果）则展开，方便直接创作；用户点 prompt 输入框时也展开。
     点选任务=看(收)、点输入/空态=写(展)，互不乒乓；不写 localStorage（情境态≠用户偏好）。 */
  const prevJobIdRef = useRef(activeJobId);
  useEffect(() => {
    const jobChanged = prevJobIdRef.current !== activeJobId;
    prevJobIdRef.current = activeJobId;
    if (activeJobStatus === "done") {
      // 切到「另一个」成片 → 一律收起看大图。
      // 但「同一个」任务异步刚完成、而用户正在输入框写下一条时，别收起打断他。
      if (!jobChanged) {
        const ae = document.activeElement;
        if (ae instanceof HTMLElement && ae.classList.contains("oc-input")) return;
      }
      setCollapsed(true);
    } else if (!activeJobId) {
      setCollapsed(false);
    }
  }, [activeJobId, activeJobStatus]);

  const isImageTrack = draft.mode === "t2i" || draft.mode === "i2i";

  /* spec.fields → 分区（仅 composer 用，故就地算） */
  const cmpFields = useMemo(() => {
    const fields = currentSpec?.fields ?? [];
    const PRIMARY = new Set(["resolution", "ratio", "duration", "size"]);
    const allParams = fields.filter(
      (f) =>
        f.kind !== "media" &&
        f.key !== "prompt" &&
        f.key !== "negative_prompt"
    );
    return {
      media: fields.filter((f) => f.kind === "media"),
      prompt: fields.find((f) => f.key === "prompt"),
      negPrompt: fields.find((f) => f.key === "negative_prompt"),
      primaryParams: allParams.filter((f) => PRIMARY.has(f.key)),
      advancedParams: allParams.filter((f) => !PRIMARY.has(f.key)),
    };
  }, [currentSpec]);

  /* chip / 模型 / 折扣浮层 —— 点击外部 + ESC 关闭，统一类 .oc-pop-host */
  useEffect(() => {
    const SEL = "details.oc-pop-host[open]";
    function closeOnOutside(e: PointerEvent) {
      document.querySelectorAll<HTMLDetailsElement>(SEL).forEach((d) => {
        if (!d.contains(e.target as Node)) d.open = false;
      });
    }
    function closeOnEsc(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      document
        .querySelectorAll<HTMLDetailsElement>(SEL)
        .forEach((d) => (d.open = false));
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEsc);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEsc);
    };
  }, []);

  /* 浮框实测高度写 --oc-height，让预览区底部留白跟随（prompt/参数撑高时不遮内容） */
  const dockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        "--oc-height",
        `${el.offsetHeight}px`
      );
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--oc-height");
    };
  }, []);

  /* 点对话框以外的空白（视频 / 预览区 / 其它）→ 自动收起，把舞台让给视频。
     与「聚焦 prompt 自动展开」成闭环：点进去写、点出来看。只在展开态挂监听。 */
  useEffect(() => {
    if (collapsed) return;
    function onDown(e: PointerEvent) {
      const dock = dockRef.current;
      const target = e.target as HTMLElement | null;
      if (!dock || !target) return;
      if (dock.contains(target)) return; // 点在对话框内（含向上弹的浮层）→ 不收
      // 设置 / 灵感库 / 灯箱 / 导演套路选择器等独立浮层内的点击不算「点空白」
      if (target.closest(".st-backdrop, [role='dialog'], .mp-lightbox, .dp-backdrop")) return;
      setCollapsed(true);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [collapsed]);

  /* 实测预览区（.preview-pane）左缘 → --oc-pad-left，让对话框居中在预览区内、
     永不压到左侧任务栏（任务栏显示 / 隐藏 / 拖宽 / 窗口缩放都自适应）。 */
  useEffect(() => {
    const pane = document.querySelector<HTMLElement>(".preview-pane");
    if (!pane) return;
    const update = () => {
      const left = Math.round(pane.getBoundingClientRect().left);
      document.documentElement.style.setProperty("--oc-pad-left", `${left}px`);
    };
    update();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(pane);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--oc-pad-left");
    };
  }, []);

  /* prompt 文本框随内容自增高（上限 30vh） */
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (collapsed) {
      ta.style.height = ""; // 收起态高度交给 CSS（单行）
      return;
    }
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.3)}px`;
  }, [draft.prompt, draft.modelId, collapsed]);

  /* loadJobIntoDraft 触发时展开 composer 并聚焦 prompt，让用户直观看到参数已载入。 */
  useEffect(() => {
    if (!draftLoadedAt) return;
    setCollapsed(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [draftLoadedAt]);

  /* 拖图进框 → 落到当前模型的图片槽；没有图片槽则自动切 i2v 首帧 */
  async function handleImageDrop(files: File[]) {
    const imgField = cmpFields.media.find(
      (f) =>
        f.kind === "media" &&
        (f.accept === "image" || f.accept === "image|video")
    );
    let targetModelId = draft.modelId;
    let target: ParamField | undefined = imgField;
    if (!target) {
      const i2v = defaultModelForMode("i2v");
      targetModelId = i2v.id;
      setModelId(i2v.id); // 切到 i2v（会清空旧 media），下面显式用 i2v.id 上传
      target = i2v.fields.find(
        (f) => f.kind === "media" && f.key === "img_url"
      );
      flashToast(zh ? "切到图生视频…" : "Switching to I2V…");
    }
    if (!target || target.kind !== "media") return;
    try {
      if (target.multiple) {
        const uploaded: JobMedia[] = [];
        for (const f of files.slice(0, target.maxCount ?? 5)) {
          uploaded.push(await uploadMediaFile(f, targetModelId));
        }
        const existing =
          (draft.media[target.key as keyof typeof draft.media] as
            | JobMedia[]
            | undefined) ?? [];
        setMedia({
          [target.key]: [...existing, ...uploaded],
        } as Partial<Job["media"]>);
      } else {
        const media = await uploadMediaFile(files[0], targetModelId);
        setMedia({ [target.key]: media } as Partial<Job["media"]>);
      }
      flashToast(zh ? "已上传 ✓" : "Uploaded ✓");
    } catch (e) {
      flashToast(
        (zh ? "上传失败：" : "Upload failed: ") +
          (e instanceof Error ? e.message : String(e)).slice(0, 80)
      );
    }
  }

  const { dragActive, dragHandlers } = useComposerDrag({
    onImageDrop: handleImageDrop,
    ignoreSelector: ".mmt, .mp",
  });

  /* 点运镜 chip → 把运镜词拼进 prompt 末尾，并把光标移回输入框 */
  function addCameraMove(phrase: string) {
    const cur = draft.prompt.trim();
    setPrompt(cur ? `${cur}，${phrase}` : phrase);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }

  /* 🎬 导演扩写：先选场景套路(presetId)，再按套路流式逐字进预览，确认后替换 prompt。 */
  async function runDirector(presetId?: string) {
    const base = draft.prompt.trim();
    dirAbort.current?.abort();
    const ctrl = new AbortController();
    dirAbort.current = ctrl;
    setDir({ streaming: true, result: "" });
    try {
      const full = await streamDirectorExpand(base, {
        zh,
        presetId,
        signal: ctrl.signal,
        onToken: (txt) => setDir({ streaming: true, result: txt }),
      });
      setDir({ streaming: false, result: full });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setDir({ streaming: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div
      ref={dockRef}
      className={`oc-dock${dragActive ? " oc-dragging" : ""}${collapsed ? " oc-collapsed" : ""}`}
      {...dragHandlers}
    >
      {/* ── 左上：模式切换 + 模型/pipeline 进度 ── */}
      <div className="oc-tl">
        {pipelineActive ? (
          /* Pipeline 模式：六步进度条 */
          <div className="oc-pl-bar">
            {PIPELINE_STEPS.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 && <span className={`oc-pl-wire${i <= pipelineStep ? " done" : ""}`} />}
                <button
                  type="button"
                  className={`oc-pl-dot${i === pipelineStep ? " on" : ""}${i < pipelineStep ? " done" : ""}`}
                  onClick={() => !plBusy && setPipelineStep(i)}
                  title={`${i + 1}. ${zh ? s.zh : s.en}`}
                >
                  <span className="oc-pl-dot-icon">{i < pipelineStep ? "✓" : s.icon}</span>
                  <span className="oc-pl-dot-label">{zh ? s.zh : s.en}</span>
                </button>
              </Fragment>
            ))}
          </div>
        ) : (
          /* 单镜模式：模型选择器 */
          <details className="oc-model cmp-model oc-pop-host">
            <summary>
              <span className="cmp-model-k">{zh ? "模型" : "Model"}</span>
              <span className="cmp-model-v">
                {currentSpec?.displayName ?? draft.modelId}
              </span>
              <span className="cmp-model-caret">▾</span>
            </summary>
            <div className="cmp-model-pop">
              <ModelPicker
                models={MODELS}
                selectedId={draft.modelId}
                onSelect={(id) => {
                  setModelId(id);
                  document
                    .querySelector<HTMLDetailsElement>("details.oc-model")
                    ?.removeAttribute("open");
                }}
                zh={zh}
              />
            </div>
          </details>
        )}
        <div className="oc-seg" role="tablist">
          <button
            type="button"
            className={`oc-seg-btn${!isImageTrack && !pipelineActive ? " on" : ""}`}
            onClick={() => {
              setPipelineActive(false);
              if (isImageTrack) setMode("t2v");
            }}
          >
            {zh ? "生视频" : "Video"}
          </button>
          <button
            type="button"
            className={`oc-seg-btn${isImageTrack && !pipelineActive ? " on" : ""}`}
            onClick={() => {
              setPipelineActive(false);
              if (!isImageTrack) setMode("t2i");
            }}
          >
            {zh ? "生图片" : "Image"}
          </button>
          {enablePipeline && (
            <button
              type="button"
              className={`oc-seg-btn oc-seg-drama${pipelineActive ? " on" : ""}`}
              onClick={() => {
                setPipelineActive(true);
                setCollapsed(false);
              }}
            >
              🎬 {zh ? "短剧" : "Drama"}
            </button>
          )}
        </div>
      </div>

      {/* ── 右上 ── */}
      <div className="oc-tr">
        {pipelineActive ? (
          /* Pipeline 模式：步骤导航 */
          <>
            <button
              type="button"
              className="cmp-ico-btn"
              disabled={pipelineStep <= 0 || plBusy}
              onClick={() => setPipelineStep((s) => Math.max(0, s - 1))}
              title={zh ? "上一步" : "Previous"}
            >
              ← {zh ? "上一步" : "Back"}
            </button>
            <button
              type="button"
              className="cmp-ico-btn"
              disabled={pipelineStep >= 5 || plBusy}
              onClick={() => setPipelineStep((s) => Math.min(5, s + 1))}
              title={zh ? "下一步" : "Next"}
            >
              {zh ? "下一步" : "Next"} →
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="cmp-ico-btn"
              onClick={onOpenLibrary}
              title={zh ? "场景预设 / 灵感库" : "Presets / library"}
            >
              ✦ {zh ? "预设" : "Presets"}
            </button>
            <button
              type="button"
              className="cmp-ico-btn"
              onClick={onOpenSettings}
              title={zh ? "API 密钥设置" : "API key settings"}
            >
              ⚙
            </button>
          </>
        )}
      </div>

      {/* ── 中央 ── */}
      <div className="oc-mid">
      {pipelineActive ? (
        /* ====== Pipeline 步骤面板 ====== */
        <div className="oc-step-panel">
          {pipelineStep === 0 && (
            <div className="oc-step oc-step-script">
              <div className="oc-step-title">📝 {zh ? "剧本 — 描述你的短剧故事" : "Script — Describe your story"}</div>
              <textarea
                className="oc-step-input"
                value={plScript}
                onChange={(e) => setPlScript(e.target.value)}
                placeholder={zh ? "一句话描述故事：雨夜便利店，女店员发现监控里有诡异身影…" : "Describe the story in one sentence…"}
                rows={3}
              />
              <div className="oc-step-config">
                <label>
                  <span className="oc-step-config-k">{zh ? "镜头数" : "Shots"}</span>
                  <select value={plShots} onChange={(e) => setPlShots(Number(e.target.value))}>
                    {[3, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label>
                  <span className="oc-step-config-k">{zh ? "风格" : "Style"}</span>
                  <input type="text" value={plStyle} onChange={(e) => setPlStyle(e.target.value)} placeholder={zh ? "胶片感" : "cinematic"} />
                </label>
              </div>
            </div>
          )}
          {pipelineStep === 1 && (
            <div className="oc-step oc-step-storyboard">
              <div className="oc-step-title">🎬 {zh ? "分镜 — 点击编辑镜头参数" : "Storyboard — Click to edit shot params"}</div>
              {!plOrcResult ? (
                <div className="oc-step-hint">{zh ? "请先在「剧本」步骤生成故事，AI 会自动拆分镜头" : "Generate a script first, then AI will break down shots"}</div>
              ) : (
                <div className="oc-step-shots">
                  {plOrcResult.nodes.filter((n) => n.kind === "character" || n.kind === "scene").length > 0 && (
                    <div className="oc-step-assets">
                      {plOrcResult.nodes.filter((n) => n.kind === "character").map((n) => (
                        <span key={n.ref} className="oc-step-asset-tag oc-step-asset-char">👤 {n.title}</span>
                      ))}
                      {plOrcResult.nodes.filter((n) => n.kind === "scene").map((n) => (
                        <span key={n.ref} className="oc-step-asset-tag oc-step-asset-scene">🏞 {n.title}</span>
                      ))}
                    </div>
                  )}
                  <div className="oc-step-shot-list">
                    {plOrcResult.nodes.filter((n) => n.kind === "generate").map((n, i) => (
                      <div key={n.ref} className="oc-step-shot-row oc-step-shot-row--edit">
                        <span className="oc-step-shot-idx">{i + 1}</span>
                        <input
                          className="oc-shot-input oc-shot-title"
                          value={n.title}
                          onChange={(e) => updateOrcNode(n.ref, { title: e.target.value })}
                          title={zh ? "镜头标题" : "Shot title"}
                        />
                        <select
                          className="oc-shot-select"
                          value={n.shotType || "still"}
                          onChange={(e) => updateOrcNode(n.ref, { shotType: e.target.value })}
                          title={zh ? "景别/运镜" : "Shot type"}
                        >
                          {SHOT_TYPES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                        </select>
                        <input
                          className="oc-shot-input oc-shot-dur"
                          type="number"
                          min={2}
                          max={8}
                          value={n.durationSec ?? 3}
                          onChange={(e) => updateOrcNode(n.ref, { durationSec: Math.max(2, Math.min(8, Number(e.target.value) || 3)) })}
                          title={zh ? "时长(秒)" : "Duration (s)"}
                        />
                        <span className="oc-shot-dur-unit">s</span>
                        <input
                          className="oc-shot-input oc-shot-dialogue"
                          value={n.dialogue || ""}
                          onChange={(e) => updateOrcNode(n.ref, { dialogue: e.target.value })}
                          placeholder={zh ? "台词…" : "Dialogue…"}
                          title={zh ? "台词" : "Dialogue"}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="oc-step-hint">
                    {zh
                      ? `${plOrcResult.nodes.filter((n) => n.kind === "generate").length} 个镜头 · 可编辑后确认写入画布`
                      : `${plOrcResult.nodes.filter((n) => n.kind === "generate").length} shots · Edit then confirm to create canvas nodes`}
                  </div>
                </div>
              )}
            </div>
          )}
          {pipelineStep === 2 && (
            <div className="oc-step oc-step-design">
              <div className="oc-step-title">🎨 {zh ? "设定出图" : "Design"}</div>
              {dramaGenNodes.length === 0 ? (
                <div className="oc-step-hint">{zh ? "请先完成分镜步骤，生成画布节点" : "Complete storyboard step first"}</div>
              ) : (
                <>
                  <div className="oc-step-model">
                    <label className="oc-step-model-label">{zh ? "出图模型" : "T2I Model"}</label>
                    <select
                      className="oc-step-model-select"
                      value={plDesignModel}
                      onChange={(e) => setPlDesignModel(e.target.value)}
                    >
                      {t2iModels.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                    </select>
                  </div>
                  <div className="oc-step-progress">
                    <div className="oc-step-progress-bar" style={{ width: `${dramaGenNodes.length ? (nodeImageDone / dramaGenNodes.length) * 100 : 0}%` }} />
                    <span>{nodeImageDone}/{dramaGenNodes.length}</span>
                  </div>
                  <div className="oc-node-list">
                    {dramaAssetNodes.map((n) => {
                      const s = getImgStatus(n);
                      return (
                        <div key={n.id} className="oc-node-row">
                          <span className="oc-node-status">{STATUS_ICON[s]}</span>
                          <span className="oc-node-name">{n.kind === "character" ? "👤" : "🏞"} {n.title || (zh ? "资产" : "Asset")}</span>
                          <span className={`oc-node-tag oc-node-tag--${s}`}>{zh ? STATUS_LABEL[s].zh : STATUS_LABEL[s].en}</span>
                          <span className="oc-node-model">{plDesignSpec?.displayName}</span>
                        </div>
                      );
                    })}
                    {dramaGenNodes.map((n, i) => {
                      const s = getImgStatus(n);
                      return (
                        <div key={n.id} className="oc-node-row">
                          <span className="oc-node-status">{STATUS_ICON[s]}</span>
                          <span className="oc-node-name">{i + 1}. {n.title || (zh ? "镜头" : "Shot")}</span>
                          <span className={`oc-node-tag oc-node-tag--${s}`}>{zh ? STATUS_LABEL[s].zh : STATUS_LABEL[s].en}</span>
                          <span className="oc-node-model">{plDesignSpec?.displayName}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          {pipelineStep === 3 && (() => {
            const i2vFields = plI2vSpec?.fields ?? [];
            const PRIMARY_KEYS = new Set(["resolution", "ratio", "duration"]);
            const i2vPrimaryParams = i2vFields.filter((f) => f.kind !== "media" && f.key !== "prompt" && f.key !== "negative_prompt" && PRIMARY_KEYS.has(f.key));
            return (
            <div className="oc-step oc-step-i2v">
              <div className="oc-step-title">▶ {zh ? "图生视频" : "I2V"}</div>
              {dramaGenNodes.length === 0 ? (
                <div className="oc-step-hint">{zh ? "请先完成出图步骤" : "Complete design step first"}</div>
              ) : (
                <>
                  <div className="oc-step-model">
                    <label className="oc-step-model-label">{zh ? "I2V 模型" : "I2V Model"}</label>
                    <select
                      className="oc-step-model-select"
                      value={plI2vModel}
                      onChange={(e) => {
                        const id = e.target.value;
                        setPlI2vModel(id);
                        const spec = getModel(id);
                        if (spec) setPlI2vParams({ ...spec.defaults });
                      }}
                    >
                      {i2vModels.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                    </select>
                  </div>
                  {i2vPrimaryParams.length > 0 && (
                    <div className="oc-step-params">
                      {i2vPrimaryParams.map((f) => (
                        <label key={f.key} className="oc-step-param">
                          <span className="oc-step-param-k">{f.label}</span>
                          {f.kind === "enum" ? (
                            <select
                              className="oc-step-param-v"
                              value={String(plI2vParams[f.key] ?? f.options?.[0]?.value ?? "")}
                              onChange={(e) => setPlI2vParams((p) => ({ ...p, [f.key]: e.target.value }))}
                            >
                              {f.options?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                            </select>
                          ) : f.kind === "int" ? (
                            <input
                              type="number"
                              className="oc-step-param-v"
                              value={Number(plI2vParams[f.key] ?? f.min ?? 5)}
                              min={f.min} max={f.max} step={f.step ?? 1}
                              onChange={(e) => setPlI2vParams((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
                            />
                          ) : null}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="oc-step-progress">
                    <div className="oc-step-progress-bar" style={{ width: `${dramaGenNodes.length ? (nodeVideoDone / dramaGenNodes.length) * 100 : 0}%` }} />
                    <span>{nodeVideoDone}/{dramaGenNodes.length}</span>
                  </div>
                  <div className="oc-node-list">
                    {dramaGenNodes.map((n, i) => {
                      const imgS = getImgStatus(n);
                      const vidS = getVidStatus(n);
                      const shotTag = n.text?.match(/\[(.+?)\]/)?.[1];
                      return (
                        <div key={n.id} className="oc-node-row">
                          <span className="oc-node-status">{STATUS_ICON[vidS]}</span>
                          <span className="oc-node-name">{i + 1}. {n.title || (zh ? "镜头" : "Shot")}</span>
                          {shotTag && <span className="oc-node-tag oc-node-tag--done">{shotTag}</span>}
                          <span className={`oc-node-tag oc-node-tag--${imgS}`}>{zh ? "图" : "Img"}:{zh ? STATUS_LABEL[imgS].zh : STATUS_LABEL[imgS].en}</span>
                          <span className={`oc-node-tag oc-node-tag--${vidS}`}>{zh ? "视频" : "Vid"}:{zh ? STATUS_LABEL[vidS].zh : STATUS_LABEL[vidS].en}</span>
                          <span className="oc-node-model">{plI2vSpec?.displayName}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            );
          })()}
          {pipelineStep === 4 && (
            <div className="oc-step oc-step-voice">
              <div className="oc-step-title">🔊 {zh ? "配音" : "Voice"}</div>
              {dramaGenNodes.length === 0 ? (
                <div className="oc-step-hint">{zh ? "请先完成前置步骤" : "Complete previous steps first"}</div>
              ) : (() => {
                const withDialogue = dramaGenNodes.filter((n) => n.text?.split(" · ")[0]?.trim());
                const filteredVoices = plVoiceFilter === "all" ? ALL_VOICES : ALL_VOICES.filter((v) => v.gender === plVoiceFilter);
                const selectedVoice = getVoice(plVoice);
                return (
                  <>
                    {/* 性别 tab */}
                    <div className="oc-voice-tabs">
                      {(["all", "female", "male"] as VoiceFilter[]).map((f) => (
                        <button key={f} type="button" className={`oc-voice-tab${plVoiceFilter === f ? " on" : ""}`} onClick={() => setPlVoiceFilter(f)}>
                          {f === "all" ? (zh ? "全部" : "All") : f === "female" ? (zh ? "女声" : "Female") : (zh ? "男声" : "Male")}
                        </button>
                      ))}
                    </div>
                    {/* 语音卡片网格 */}
                    <div className="oc-voice-grid">
                      {filteredVoices.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={`oc-voice-card${plVoice === v.id ? " on" : ""}`}
                          onClick={() => setPlVoice(v.id)}
                          title={v.desc}
                        >
                          <span className="oc-voice-card-name">{v.zh}</span>
                          <span className="oc-voice-card-desc">{v.bestFor}</span>
                          {v.group === "qwen3" && <span className="oc-voice-card-badge">{zh ? "推荐" : "Pro"}</span>}
                        </button>
                      ))}
                    </div>
                    {/* 当前选中 */}
                    {selectedVoice && (
                      <div className="oc-step-hint">
                        {zh ? `当前: ${selectedVoice.zh} — ${selectedVoice.desc}` : `Current: ${selectedVoice.zh} — ${selectedVoice.desc}`}
                      </div>
                    )}
                    {/* Lip-sync hint */}
                    <div className="oc-lipsync-hint">{zh ? "⏳ 对口型 · 即将上线" : "⏳ Lip-sync · Coming soon"}</div>
                    {/* 进度 */}
                    <div className="oc-step-progress">
                      <div className="oc-step-progress-bar" style={{ width: `${withDialogue.length ? (nodeVoiceDone / withDialogue.length) * 100 : 0}%` }} />
                      <span>{nodeVoiceDone}/{withDialogue.length}</span>
                    </div>
                    <div className="oc-node-list">
                      {dramaGenNodes.map((n, i) => {
                        const dialogue = n.text?.split(" · ")[0]?.trim() || "";
                        const hasVoice = !!n.voiceJobId;
                        return (
                          <div key={n.id} className="oc-node-row">
                            <span className="oc-node-status">{hasVoice ? "●" : dialogue ? "○" : "—"}</span>
                            <span className="oc-node-name">{i + 1}. {n.title || (zh ? "镜头" : "Shot")}</span>
                            {dialogue ? (
                              <span className="oc-node-dialogue">{dialogue.length > 20 ? dialogue.slice(0, 20) + "…" : dialogue}</span>
                            ) : (
                              <span className="oc-node-tag oc-node-tag--pending">{zh ? "无台词" : "No lines"}</span>
                            )}
                            <span className={`oc-node-tag oc-node-tag--${hasVoice ? "done" : dialogue ? "pending" : "pending"}`}>
                              {hasVoice ? (zh ? "已配音" : "Voiced") : dialogue ? (zh ? "待配音" : "Pending") : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {pipelineStep === 5 && (
            <div className="oc-step oc-step-edit">
              <div className="oc-step-title">✂ {zh ? "剪辑合成" : "Edit & Compose"}</div>
              {dramaGenNodes.length === 0 ? (
                <div className="oc-step-hint">{zh ? "请先完成前置步骤" : "Complete previous steps first"}</div>
              ) : (
                <>
                  {/* 素材统计 */}
                  <div className="oc-node-list">
                    <div className="oc-node-row">
                      <span className="oc-node-status">🎬</span>
                      <span className="oc-node-name">{zh ? "镜头" : "Shots"}</span>
                      <span className="oc-node-tag oc-node-tag--done">{dramaGenNodes.length}</span>
                    </div>
                    <div className="oc-node-row">
                      <span className="oc-node-status">🖼</span>
                      <span className="oc-node-name">{zh ? "出图" : "Images"}</span>
                      <span className={`oc-node-tag oc-node-tag--${nodeImageDone === dramaGenNodes.length ? "done" : "pending"}`}>{nodeImageDone}/{dramaGenNodes.length}</span>
                    </div>
                    <div className="oc-node-row">
                      <span className="oc-node-status">▶</span>
                      <span className="oc-node-name">{zh ? "视频" : "Videos"}</span>
                      <span className={`oc-node-tag oc-node-tag--${nodeVideoDone === dramaGenNodes.length ? "done" : "pending"}`}>{nodeVideoDone}/{dramaGenNodes.length}</span>
                    </div>
                    <div className="oc-node-row">
                      <span className="oc-node-status">🔊</span>
                      <span className="oc-node-name">{zh ? "配音" : "Voice"}</span>
                      <span className={`oc-node-tag oc-node-tag--${nodeVoiceDone > 0 ? "done" : "pending"}`}>{nodeVoiceDone}</span>
                    </div>
                  </div>
                  {/* 合成配置 */}
                  <div className="oc-compose-config">
                    <div className="oc-compose-row">
                      <span className="oc-compose-label">{zh ? "画幅" : "Aspect"}</span>
                      <select className="oc-compose-select" value={plAspect} onChange={(e) => setPlAspect(e.target.value as typeof plAspect)}>
                        <option value="16:9">16:9 {zh ? "横屏" : "Landscape"}</option>
                        <option value="9:16">9:16 {zh ? "竖屏" : "Portrait"}</option>
                        <option value="1:1">1:1 {zh ? "方形" : "Square"}</option>
                      </select>
                    </div>
                    <div className="oc-compose-row">
                      <span className="oc-compose-label">{zh ? "转场" : "Transition"}</span>
                      <select className="oc-compose-select" value={plTransition} onChange={(e) => setPlTransition(e.target.value as typeof plTransition)}>
                        <option value="fade">{zh ? "淡入淡出" : "Fade"}</option>
                        <option value="fadeblack">{zh ? "过黑" : "Fade Black"}</option>
                        <option value="wipeleft">{zh ? "左划" : "Wipe Left"}</option>
                        <option value="circleopen">{zh ? "圆形展开" : "Circle Open"}</option>
                      </select>
                      <span className="oc-compose-label">{zh ? "时长" : "Dur"}</span>
                      <select className="oc-compose-select oc-compose-select--sm" value={plCrossfade} onChange={(e) => setPlCrossfade(Number(e.target.value))}>
                        <option value={0.3}>0.3s</option>
                        <option value={0.5}>0.5s</option>
                        <option value={0.8}>0.8s</option>
                        <option value={1.0}>1.0s</option>
                      </select>
                    </div>
                    <div className="oc-compose-row">
                      <span className="oc-compose-label">{zh ? "字幕" : "Subtitle"}</span>
                      <label className="oc-compose-check">
                        <input type="checkbox" checked={plSubtitle} onChange={(e) => setPlSubtitle(e.target.checked)} />
                        <span>{zh ? "自动从台词提取" : "Auto from dialogue"}</span>
                      </label>
                    </div>
                    <div className="oc-compose-row">
                      <span className="oc-compose-label">{zh ? "配乐" : "BGM"}</span>
                      {plBgmFile ? (
                        <span className="oc-bgm-name">
                          ♪ {plBgmFile.name.slice(0, 20)}
                          <button type="button" className="oc-bgm-x" onClick={() => setPlBgmFile(null)}>×</button>
                        </span>
                      ) : (
                        <label className="oc-bgm-upload">
                          <input type="file" accept="audio/*" hidden onChange={(e) => { if (e.target.files?.[0]) setPlBgmFile(e.target.files[0]); }} />
                          <span>+ {zh ? "上传" : "Upload"}</span>
                        </label>
                      )}
                      {plBgmFile && (
                        <input type="range" className="oc-bgm-slider" min={0} max={100} value={Math.round(plBgmVolume * 100)} onChange={(e) => setPlBgmVolume(Number(e.target.value) / 100)} title={`${Math.round(plBgmVolume * 100)}%`} />
                      )}
                    </div>
                  </div>
                  <div className="oc-step-hint">{zh ? "导出后进入剪辑器可预览渲染 →" : "Export to Editor for preview & render →"}</div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ====== 单镜模式（原始 UI） ====== */
        <>
        {cmpFields.prompt && (
          <textarea
            ref={taRef}
            className="oc-input"
            value={draft.prompt}
            placeholder={
              zh
                ? PROMPT_PLACEHOLDER[draft.mode].zh
                : PROMPT_PLACEHOLDER[draft.mode].en
            }
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => collapsed && setCollapsed(false)}
          />
        )}

        {cmpFields.prompt && (
          <DirectorPresetPicker
            open={presetOpen}
            zh={zh}
            hasIdea={!!draft.prompt.trim()}
            onClose={() => setPresetOpen(false)}
            onPick={(pid) => {
              setPresetOpen(false);
              setCollapsed(false); // 选完套路保持展开，扩写直接在框内逐字展示
              void runDirector(pid);
            }}
          />
        )}

        {dir && (dir.result || dir.error || dir.streaming) && (
          <div className="oc-dir">
            <div className="oc-dir-head">
              <span>
                🎬 {zh ? "AI 导演" : "Director"}
                {dir.streaming && (
                  <em className="oc-dir-live">{zh ? " · 生成中" : " · live"}</em>
                )}
              </span>
              <button
                type="button"
                className="oc-dir-x"
                onClick={() => {
                  dirAbort.current?.abort();
                  setDir(null);
                }}
                title={zh ? "关闭" : "Close"}
              >
                ✕
              </button>
            </div>
            {dir.error ? (
              <div className="oc-dir-err">{dir.error}</div>
            ) : (
              <div className="oc-dir-body">
                {dir.result}
                {dir.streaming && <span className="oc-dir-caret" />}
              </div>
            )}
            {!dir.streaming && !dir.error && dir.result && (
              <div className="oc-dir-acts">
                <button
                  type="button"
                  className="oc-dir-apply"
                  onClick={() => {
                    setPrompt(dir.result!);
                    setDir(null);
                    flashToast(zh ? "已采用 AI 导演脚本 🎬" : "Applied 🎬");
                  }}
                >
                  ✓ {zh ? "采用" : "Use it"}
                </button>
                <button
                  type="button"
                  className="oc-dir-retry"
                  onClick={() => void runDirector()}
                >
                  ↻ {zh ? "重试" : "Retry"}
                </button>
              </div>
            )}
          </div>
        )}
        {cmpFields.prompt &&
          (draft.mode === "t2v" ||
            draft.mode === "i2v" ||
            draft.mode === "r2v") && (
            <div className="oc-suggest">
              {CAMERA_CHIPS.map((c) => (
                <button
                  key={c.zh}
                  type="button"
                  className="oc-suggest-chip"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addCameraMove(zh ? c.phrase : c.phraseEn)}
                  title={zh ? "插入运镜词" : "Insert camera move"}
                >
                  {zh ? c.zh : c.en}
                </button>
              ))}
            </div>
          )}
        {cmpFields.media.length > 0 && (
          <div className="oc-refs">
            {cmpFields.media.map((f) =>
              f.kind === "media" && f.multiple ? (
                <MediaMultiPicker
                  key={f.key}
                  label={f.label}
                  accept={f.accept}
                  maxCount={f.maxCount ?? 5}
                  modelName={draft.modelId}
                  value={
                    draft.media[f.key as keyof typeof draft.media] as
                      | JobMedia[]
                      | undefined
                  }
                  onChange={(m) =>
                    setMedia({ [f.key]: m } as Partial<typeof draft.media>)
                  }
                />
              ) : (
                <MediaPicker
                  key={f.key}
                  label={f.label}
                  accept={f.kind === "media" ? f.accept : "image"}
                  modelName={draft.modelId}
                  compact
                  optional={f.kind === "media" ? !f.required : false}
                  value={
                    draft.media[f.key as keyof typeof draft.media] as
                      | JobMedia
                      | undefined
                  }
                  onChange={(m) =>
                    setMedia({ [f.key]: m } as Partial<typeof draft.media>)
                  }
                />
              )
            )}
          </div>
        )}
        {draft.mode === "ve" && (
          <p className="oc-ve-hint">
            {zh
              ? "视频限制：MP4/MOV, 3-60s, 长边≤4096 短边≥360, ≤100MB。输出最长 15s。"
              : "Video: MP4/MOV, 3-60s, long≤4096 short≥360, ≤100MB. Output max 15s."}
          </p>
        )}
        </>
      )}
      </div>

      {/* ── 左下：参数 chips / pipeline 配置 ── */}
      <div className="oc-bl">
        {pipelineActive ? (
          <div className="oc-pl-info">
            <span className="oc-pl-info-step">
              {PIPELINE_STEPS[pipelineStep].icon} {zh ? PIPELINE_STEPS[pipelineStep].zh : PIPELINE_STEPS[pipelineStep].en}
            </span>
            <span className="oc-pl-info-hint">
              {zh ? `第 ${pipelineStep + 1} / 6 步` : `Step ${pipelineStep + 1} of 6`}
              {pipelineStep === 2 && ` · ${plDesignSpec?.displayName ?? ""}`}
              {pipelineStep === 3 && ` · ${plI2vSpec?.displayName ?? ""}`}
              {pipelineStep === 4 && ` · ${getVoice(plVoice)?.zh ?? ""}`}
            </span>
          </div>
        ) : (
        <>
        {cmpFields.primaryParams.map((f) => {
          const raw = draft.params[f.key];
          const isRatio = f.key === "ratio";
          let display = "";
          if (f.kind === "enum") {
            display = f.options.find((o) => o.value === raw)?.label ?? "—";
          } else if (f.kind === "int") {
            display = `${raw ?? "—"}${f.unit ?? ""}`;
          } else if (f.kind === "bool") {
            display = raw ? "ON" : "OFF";
          } else {
            display = String(raw ?? "");
          }
          return (
            <details key={f.key} className="cmp-chip oc-pop-host">
              <summary>
                <span className="cmp-chip-k">{f.label}</span>
                {isRatio ? (
                  <RatioGlyph ratio={String(raw ?? "16:9")} base={13} />
                ) : (
                  <span className="cmp-chip-v">{display}</span>
                )}
              </summary>
              <div className="cmp-chip-pop">
                {isRatio && f.kind === "enum" ? (
                  <div className="ratio-opts">
                    {f.options.map((o) => (
                      <button
                        key={String(o.value)}
                        type="button"
                        className={`ratio-opt${raw === o.value ? " on" : ""}`}
                        onClick={() => setParam(f.key, o.value)}
                      >
                        <RatioGlyph ratio={String(o.value)} base={26} />
                        <span className="ratio-opt-label">
                          {String(o.value)}
                        </span>
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
        {(cmpFields.advancedParams.length > 0 || cmpFields.negPrompt) && (
          <details className="cmp-chip cmp-chip--more oc-pop-host">
            <summary>
              <span className="cmp-chip-k">{zh ? "更多" : "More"}</span>
              <span className="cmp-chip-v">⚙</span>
            </summary>
            <div className="cmp-chip-pop cmp-chip-pop--wide cmp-chip-pop--stack">
              {cmpFields.advancedParams.map((f) => (
                <div key={f.key} className="cmp-adv-row">
                  <span className="cmp-adv-label">{f.label}</span>
                  <ParamFieldInput
                    field={f}
                    value={draft.params[f.key]}
                    onChange={(v) => setParam(f.key, v)}
                  />
                </div>
              ))}
              {cmpFields.negPrompt && (
                <div className="cmp-adv-row">
                  <span className="cmp-adv-label">
                    {zh ? "负向提示词" : "Negative prompt"}
                  </span>
                  <ParamFieldInput
                    field={cmpFields.negPrompt}
                    value={draft.negativePrompt}
                    onChange={(v) => setNegativePrompt(String(v ?? ""))}
                  />
                </div>
              )}
            </div>
          </details>
        )}
        </>
        )}
      </div>

      {/* ── 右下：价格+生成 / pipeline 执行按钮 ── */}
      <div className="oc-br">
        <button
          type="button"
          className="oc-collapse-btn"
          onClick={toggleCollapsed}
          title={
            collapsed
              ? zh
                ? "展开对话框"
                : "Expand"
              : zh
                ? "收起，腾出预览空间"
                : "Collapse for more preview"
          }
          aria-label={collapsed ? "expand composer" : "collapse composer"}
        >
          {collapsed ? "▴" : "▾"}
        </button>
        {pipelineActive ? (
          /* Pipeline 模式：步骤执行按钮 */
          <button
            type="button"
            className={`cmp-send oc-pl-action${plBusy ? " oc-pl-busy" : ""}`}
            disabled={plBusy || (pipelineStep === 0 && !plScript.trim()) || (pipelineStep === 1 && !plOrcResult)}
            onClick={async () => {
              const step = PIPELINE_STEPS[pipelineStep].key;
              setPlBusy(true);
              try {
                if (step === "script") {
                  // Step 1: 调用 LLM 编排 → 存结果 → 自动跳到 Step 2
                  const brief = [plStyle && `风格：${plStyle}`, plScript, `镜头数约${plShots}个`].filter(Boolean).join("。");
                  const graph = await orchestrateGraph(brief, "drama");
                  setPlOrcResult(graph);
                  flashToast(zh
                    ? `已生成 ${graph.nodes.filter((n) => n.kind === "generate").length} 个镜头 ✦`
                    : `Generated ${graph.nodes.filter((n) => n.kind === "generate").length} shots ✦`);
                  setPipelineStep(1);
                } else if (step === "storyboard") {
                  if (plOrcResult && onPipelineAction) {
                    await onPipelineAction({ step: "storyboard", action: "confirm", data: { graph: plOrcResult } });
                    setPipelineStep(2);
                  }
                } else if (step === "design") {
                  if (onPipelineAction) await onPipelineAction({ step: "design", action: "generate", data: { modelId: plDesignModel } });
                } else if (step === "i2v") {
                  if (onPipelineAction) await onPipelineAction({ step: "i2v", action: "generate", data: { modelId: plI2vModel, params: plI2vParams } });
                } else if (step === "voice") {
                  if (onPipelineAction) await onPipelineAction({ step: "voice", action: "generate", data: { voice: plVoice } });
                } else if (step === "edit") {
                  if (onPipelineAction) await onPipelineAction({ step: "edit", action: "export", data: {
                    aspect: plAspect,
                    transition: plTransition,
                    crossfadeSec: plCrossfade,
                    subtitle: plSubtitle,
                    bgmFile: plBgmFile ?? undefined,
                    bgmVolume: plBgmVolume,
                  }});
                }
              } catch (e) {
                flashToast((zh ? "执行失败：" : "Failed: ") + (e instanceof Error ? e.message : String(e)));
              } finally {
                setPlBusy(false);
              }
            }}
            title={zh
              ? ["生成剧本", "确认分镜", "批量出图", "批量出视频", "批量配音", "导出成片"][pipelineStep]
              : ["Generate Script", "Confirm Shots", "Batch Generate", "Batch I2V", "Batch Voice", "Export"][pipelineStep]
            }
          >
            {plBusy && <span className="oc-pl-spin" />}
            {pipelineStep === 2
              ? `🎨 ${zh ? "批量出图" : "Generate"} · ${plDesignSpec?.displayName ?? plDesignModel}`
              : pipelineStep === 3
              ? `▶ ${zh ? "批量出视频" : "I2V"} · ${plI2vSpec?.displayName ?? plI2vModel}`
              : pipelineStep === 4
              ? `🔊 ${zh ? "批量配音" : "Voice"} · ${getVoice(plVoice)?.zh ?? plVoice}`
              : zh
              ? ["✦ 生成剧本", "✓ 确认分镜", "", "", "", "✂ 导出成片"][pipelineStep]
              : ["✦ Generate", "✓ Confirm", "", "", "", "✂ Export"][pipelineStep]
            }
            <span className="cmp-send-arrow">↑</span>
          </button>
        ) : (
          /* 单镜模式：原始右下控件 */
          <>
        {cmpFields.prompt && (
          <button
            type="button"
            className="oc-dir-btn"
            onClick={() => setPresetOpen(true)}
            disabled={dir?.streaming}
            title={zh ? "AI 导演 —— 选场景套路扩写（流式）" : "AI Director — pick a style (streaming)"}
          >
            {dir?.streaming ? (
              <>
                <span className="oc-dir-spin" />
                {zh ? "导演中…" : "Directing…"}
              </>
            ) : (
              <>🎬 {zh ? "AI 导演" : "Director"}</>
            )}
          </button>
        )}
        <span className="cmp-box-cost">
          {costDiscounted && (
            <s className="cmp-cost-orig">{formatFen(costRawFen)}</s>
          )}
          {formatFen(costFinalFen)}
        </span>
        <details className="cmp-discount oc-pop-host">
          <summary
            className={costDiscounted ? "on" : ""}
            title={zh ? "设置促销折扣" : "Set promo discount"}
          >
            {costDiscounted
              ? zh
                ? `${discount}折`
                : `${discount * 10}%`
              : zh
                ? "加折扣"
                : "Discount"}
          </summary>
          <div className="cmp-chip-pop cmp-discount-pop">
            <div className="cmp-discount-head">
              {zh ? "促销折扣" : "Promo discount"}
            </div>
            <div className="cmp-discount-presets">
              {[10, 9, 8.8, 8, 5].map((z) => (
                <button
                  key={z}
                  type="button"
                  className={`cmp-discount-preset${discount === z ? " on" : ""}`}
                  onClick={() => setDiscount(z)}
                >
                  {z >= 10
                    ? zh
                      ? "无"
                      : "None"
                    : zh
                      ? `${z}折`
                      : `${z * 10}%`}
                </button>
              ))}
            </div>
            <label className="cmp-discount-custom">
              {zh ? "自定义" : "Custom"}
              <input
                type="number"
                min={1}
                max={10}
                step={0.1}
                value={discount}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) setDiscount(v);
                }}
              />
              {zh ? "折" : "/ 10"}
            </label>
          </div>
        </details>
        <button
          type="button"
          className="cmp-ico-btn"
          onClick={onSave}
          disabled={!draft.prompt.trim()}
          title={zh ? "收藏 prompt + 参数" : "Save prompt + params"}
        >
          ⭐
        </button>
        <button
          type="button"
          className="cmp-ico-btn"
          onClick={resetDraft}
          title={zh ? "清空" : "Clear"}
        >
          ⟲
        </button>
        <button
          type="button"
          className={`cmp-send${missingFields.length ? " cmp-send-blocked" : ""}`}
          onClick={() => {
            if (missingFields.length) {
              flashToast(
                (zh ? "还缺：" : "Missing: ") +
                  missingFields.join(zh ? "、" : ", ")
              );
              return;
            }
            onSubmit();
          }}
          title={
            missingFields.length
              ? (zh ? "还缺：" : "Missing: ") +
                missingFields.join(zh ? "、" : ", ")
              : zh
                ? "生成（⌘/Ctrl+Enter）"
                : "Generate (⌘/Ctrl+Enter)"
          }
        >
          {zh ? "生成" : "Generate"}
          <span className="cmp-send-arrow">↑</span>
        </button>
          </>
        )}
      </div>

      {/* 导演台入口已移除 —— 用户通过顶部导航或 AI 导演按钮进入 */}

      {/* 拖拽遮罩 */}
      {dragActive && (
        <div className="oc-drop-mask">
          {zh ? "松手 → 设为图生视频首帧" : "Drop → I2V first frame"}
        </div>
      )}
    </div>
  );
}
