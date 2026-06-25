/**
 * LumenX —— 阿里 alibaba/lumenx「短剧/动态漫」生产流水线在 frame-0 的落地数据模型。
 *
 * 设计原则（对齐 frame-0 既有约定）：
 *  - 生成结果不直接存在实体上，实体只持有 jobId + 一份展示用 url；
 *    真正的结果走共享 useStudioStore.jobs（资产库），由 useJobPolling 推进视频状态。
 *  - 全流程一份 LxProject 文档，持久化在 localStorage（key: frame-0:lumenx）。
 *
 * 架构说明（4-Tab + 右侧 AI 对话面板）：
 *  - 4 个 Tab：剧本(script) → 角色(character) → 分镜(storyboard) → 时间轴(timeline)
 *  - 每个 Tab 拥有独立的 AI 对话线程（LxThread）
 */

// ============================================================================
// 基础枚举
// ============================================================================

export type LxAspect = "16:9" | "9:16" | "1:1";

export type LxStatus = "idle" | "pending" | "running" | "done" | "error";

/** 4 个主 Tab：剧本 / 角色 / 分镜 / 时间轴。 */
export type LxTab = "script" | "character" | "storyboard" | "timeline";

/**
 * 一次生成的完整上下文 —— 用于「点击资产 → 回填参数 → 重新生成」。
 * 结构精简，方便直接喂回 gen.ts；任何字段缺失都视为旧资产，UI 只做大图查看不做编辑。
 */
export type GenerationMeta = {
  /** 生成时使用的 prompt（已经拼接过风格/锚定）。 */
  prompt: string;
  /** 模型 id，对齐 lxModels 中的 LxImageModel/LxVideoModel.id。 */
  modelId: string;
  /** 透传到 submitJobRequest 的覆盖参数（size/ratio/duration/seed 等）。 */
  params: Record<string, unknown>;
  /** 参考图 URL 列表（i2i / r2v 用）。 */
  refImages?: string[];
  /** 反向词。 */
  negativePrompt?: string;
  /** 'image' 或 'video'。 */
  kind: "image" | "video";
  createdAt: number;
};

// ============================================================================
// 资产 / 实体
// ============================================================================

/** 一张生成出来的图片变体（角色/场景/道具/分镜帧共用） */
export type LxVariant = {
  url: string;
  jobId?: string;
  prompt?: string;
  createdAt: number;
};

export type LxCharacter = {
  id: string;
  name: string;
  /** 永久性外貌特征（中文，供出图）。 */
  description: string;
  gender?: "male" | "female";
  age?: string;
  /** 性格基调（中文，配音挑音色用）。 */
  voiceTone?: string;
  /** 1=群演 3=配角 5=核心主角，戏份权重。 */
  visualWeight: number;
  /** 当前选中的形象图。 */
  imageUrl?: string;
  imageJobId?: string;
  variants: LxVariant[];
  /** 绑定的 TTS 音色 id（qwen3 系）。 */
  voiceId?: string;
  /** 声音克隆样本（可选）。 */
  customVoiceUrl?: string;
  status: LxStatus;
  /** 当前形象图的生成上下文（点击检视/重新生成用）。 */
  imageGen?: GenerationMeta;
};

export type LxScene = {
  id: string;
  name: string;
  description: string;
  timeOfDay?: string;
  mood?: string;
  imageUrl?: string;
  imageJobId?: string;
  variants: LxVariant[];
  status: LxStatus;
  imageGen?: GenerationMeta;
};

export type LxProp = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  imageJobId?: string;
  variants: LxVariant[];
  status: LxStatus;
  imageGen?: GenerationMeta;
};

/** 一镜（storyboard frame） */
export type LxShot = {
  id: string;
  idx: number;
  sceneId?: string;
  characterIds: string[];
  propIds: string[];
  /** 画面动作描述（中文，给用户看 / 给模型补全）。 */
  action: string;
  /** 景别：特写 / 近景 / 中景 / 全景 / 远景。 */
  shotSize: string;
  /** 运镜：still / zoom-in / zoom-out / pan-lr / orbit / handheld ... */
  camera: string;
  /** 直灌模型的英文画面 prompt。 */
  imagePrompt: string;
  /** 台词文本（不含说话人）。 */
  dialogue?: string;
  /** 说话角色 id。 */
  speakerId?: string;
  durationSec: number;
  /** 配音音频时长（秒）—— 与 durationSec（画面/视频时长）分开，避免被配音覆盖。 */
  audioDurationSec?: number;
  /** 渲染出来的分镜帧。 */
  imageUrl?: string;
  imageJobId?: string;
  imageVariants: LxVariant[];
  /** 视频片段。 */
  videoUrl?: string;
  videoJobId?: string;
  /** 配音。 */
  audioUrl?: string;
  status: LxStatus;
  /** 首帧画面的生成上下文。 */
  imageGen?: GenerationMeta;
  /** 视频的生成上下文。 */
  videoGen?: GenerationMeta;
};

export type LxStyle = {
  id: string;
  name: string;
  /** 中文说明。 */
  description: string;
  positivePrompt: string;
  negativePrompt: string;
  isCustom?: boolean;
  /** AI 推荐时给的理由。 */
  reason?: string;
};

// ============================================================================
// AI 对话面板（右侧）
// ============================================================================

/** 单条对话消息。 */
export type LxMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** 关联的实体类型（用于联动选中卡片）。 */
  refType?: "character" | "scene" | "prop" | "shot";
  /** 关联实体 id。 */
  refId?: string;
  /** 附件（图片 URL 等）。 */
  attachments?: string[];
  createdAt: number;
};

/** 对话线程（每个 Tab 一条独立线程）。 */
export type LxThread = {
  id: string;
  tab: LxTab;
  messages: LxMessage[];
  /** AI 模型 id。 */
  model?: string;
  /** 采样温度。 */
  temperature?: number;
};

/** 对话面板的当前上下文引用（驱动「@提到的实体」的输入区）。 */
export type LxChatContext = {
  tab: LxTab;
  /** 当前选中的实体类型。 */
  refType?: "character" | "scene" | "prop" | "shot";
  /** 当前选中的实体 id。 */
  refId?: string;
  /** 显示名（用于 UI 上的 chip）。 */
  refLabel?: string;
  /** 传递给 AI 的上下文摘要。 */
  refContent?: string;
  /**
   * 检视模式：被点击的资产生成上下文。
   * 一旦设置，ChatPanel 进入「编辑参数 → 重新生成」模式。
   */
  inspect?: LxInspectTarget;
};

/** 被检视的资产坐标 + 生成元数据。 */
export type LxInspectTarget = {
  type: "character" | "scene" | "prop" | "shot";
  id: string;
  /** shot 时区分图片/视频；其它实体固定 'image'。 */
  media: "image" | "video";
  /** 当前展示的资产 URL（缩略图 / 视频源）。 */
  url: string;
  /** 该资产对应的 generationMeta。 */
  meta: GenerationMeta;
};

/** 全屏 Lightbox 状态（瞬时 UI，不持久化）。 */
export type LxLightboxState = {
  url: string;
  mediaType: "image" | "video";
  /** 若可定位到资产，则携带 inspect 信息，Lightbox 中显示「在对话中编辑」按钮。 */
  target?: { type: LxInspectTarget["type"]; id: string; media: LxInspectTarget["media"] };
  /** 标题（资产名 / 分镜编号），用于 Lightbox 顶部展示。 */
  title?: string;
};

// ============================================================================
// 顶层项目文档
// ============================================================================

export type LxProject = {
  id: string;
  title: string;
  /** 原始小说 / 剧本文本。 */
  sourceText: string;
  aspect: LxAspect;
  /** 当前激活的 Tab，默认 "script"。 */
  tab: LxTab;
  /** 选中的美术风格 id（指向预设 / aiStyles / customStyles）。 */
  selectedStyleId?: string;
  aiStyles: LxStyle[];
  customStyles: LxStyle[];
  characters: LxCharacter[];
  scenes: LxScene[];
  props: LxProp[];
  shots: LxShot[];
  /** 4 个 Tab 各自的对话历史。 */
  threads: LxThread[];
  /** 当前选用的图像生成模型 id（对齐 lxModels.LX_IMAGE_MODELS）。 */
  imageModel?: string;
  /** 当前选用的视频生成模型 id（对齐 lxModels.LX_VIDEO_MODELS）。 */
  videoModel?: string;
  /** 图像生成的覆盖参数（size / n / prompt_extend / watermark）。 */
  imageParams?: Record<string, unknown>;
  /** 视频生成的覆盖参数（resolution / ratio / duration / prompt_extend / watermark）。 */
  videoParams?: Record<string, unknown>;
  mergedVideoUrl?: string;
  createdAt: number;
  updatedAt: number;
};
