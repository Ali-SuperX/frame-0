"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  MODELS,
  defaultModelForMode,
  getModel,
  type Mode,
} from "./bailian/models";
import {
  relayoutAllTracks,
  trackEndSec,
  endSec as clipEndSec,
  renderDuration as clipRenderDur,
  trackOf,
} from "./editor/timeline";

/* ─────────── types ─────────── */

export type JobStatus =
  | "draft"
  | "submitting"
  | "running"
  | "done"
  | "error"
  | "canceled";

export type JobMedia = {
  /** Human-readable name (for local file uploads). */
  name?: string;
  /** URL as submitted to DashScope — either http(s)://, oss://, or data:. */
  url: string;
  /** If the user uploaded a local file, the preview blob URL (local-only). */
  previewUrl?: string;
  /** Mime type hint. */
  mime?: string;
  /**
   * Stable IndexedDB key for the original uploaded file. When previewUrl
   * (a blob: URL) becomes invalid after reload, the picker reads the file
   * back from IDB and rebuilds a fresh blob URL — so user-uploaded images
   * stay visible across page reloads.
   */
  localKey?: string;
  /**
   * Tiny base64 thumbnail (≤200px JPEG) generated at upload time. Persisted
   * in localStorage so the preview is visible immediately on reload — no
   * async IDB read required. Cheap (~5–30 KB per image).
   */
  thumbDataUrl?: string;
  /**
   * Server-side path served by `/api/uploads/<sha>.<ext>`. The bytes are
   * mirrored to disk on upload, so this URL works after IDB / browser data
   * is cleared, and across origin/port changes.
   */
  localPath?: string;
};

export type JobSource = "bailian" | "manual" | "imported";

/** 资产分类 —— 资产库五大类 */
export type AssetCategory = "footage" | "character" | "scene" | "prop" | "output" | "audio";

/* ─────────── Editor ─────────── */

export type EditorTextOverlay = {
  content: string;
  position: "top" | "bottom" | "center";
  /** Hex or CSS color (e.g. "#fff" / "rgba(...)"). */
  color: string;
  /** Font size in px. */
  sizePx: number;
};

/** Color filter presets — applied via CSS filters in preview + FFmpeg eq/lut in export. */
export type EditorFilterPreset =
  | "none"
  | "warm"
  | "cool"
  | "cinematic"
  | "bw"
  | "vintage"
  | "vivid"
  | "dramatic"
  | "pastel";

/** Transition types between clips (subset of FFmpeg xfade). */
export type EditorTransitionType =
  | "none"
  | "fade"
  | "fadeblack"
  | "fadewhite"
  | "wipeleft"
  | "wiperight"
  | "slideleft"
  | "slideright"
  | "circleopen"
  | "circleclose"
  | "dissolve";

/** Speed curve presets for variable-speed ramping. */
export type EditorSpeedCurve =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ramp-up"
  | "ramp-down";

export type EditorClip = {
  id: string;
  /**
   * Playable URL — HTTP(S) for remote, or a blob: URL rebuilt from the
   * IndexedDB-persisted file on mount. Blob URLs are ephemeral per session;
   * `localKey` drives rehydration.
   */
  sourceUrl: string;
  /** Human title shown in timeline + inspector. */
  sourceTitle: string;
  /** Full source duration in seconds, discovered via metadata. */
  duration: number;
  /** Trim start / end in seconds, both within [0, duration]. */
  in: number;
  out: number;
  /** 0..1. 0 mutes the audio track for this clip. */
  volume: number;
  /** When true, clip audio is force-muted regardless of `volume`. */
  muted?: boolean;
  /** When true, plays this clip backwards (video + audio). */
  reversed?: boolean;
  /** 0.25..4 playback speed. */
  speed: number;
  /**
   * Color / exposure adjustments applied via FFmpeg eq filter.
   * Defaults: brightness 0, contrast 1, saturation 1.
   *   brightness ∈ [-1, 1]  (0 = unchanged)
   *   contrast   ∈ [0, 2]   (1 = unchanged)
   *   saturation ∈ [0, 3]   (1 = unchanged)
   */
  adjust?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
  };
  /** Optional caption rendered into the final video at export. */
  text?: EditorTextOverlay;
  /**
   * When set, the clip's video data lives in IndexedDB under this key.
   * On editor mount we re-read the blob and mint a fresh `sourceUrl`.
   * Stored so reloading the page doesn't break local uploads.
   */
  localKey?: string;
  /** Mime type hint for re-created blobs. */
  localMime?: string;
  /** "image" for static image clips, "audio" for audio-only clips. Default "video". */
  mediaType?: "video" | "image" | "audio";
  /**
   * Which track this clip lives on. Default behavior assumes "v1" if absent.
   * Video tracks: "v1" | "v2" | "v3"; audio tracks: "a1" | "a2".
   */
  trackId?: string;
  /**
   * Absolute position on the project timeline, in seconds.
   * The clip occupies [startSec, startSec + renderDuration] on its track,
   * where renderDuration = (out - in) / speed.
   *
   * Migration: when missing, derived from clip order within its track
   * (legacy "sequential queue" behavior). After migration, every clip has
   * an explicit startSec and ordering is purely positional.
   */
  startSec?: number;
  /**
   * When true, if the source media is shorter than (out - in), export holds
   * (freezes) the last frame to fill the full clip length instead of ending
   * early. Used by the drama "成片" builder when a shot's voice-over is longer
   * than its video, so a1 voice clips don't overlap and a/v stay in sync.
   */
  holdLastFrame?: boolean;
  /** Audio fade-in duration in seconds (0 = instant). */
  fadeIn?: number;
  /** Audio fade-out duration in seconds (0 = instant). */
  fadeOut?: number;
  /** Visual opacity 0..1, for overlay compositing on V2/V3. Default 1. */
  opacity?: number;
  /** Color filter preset applied during playback + export. */
  filter?: EditorFilterPreset;
  /** Picture-in-picture transform for overlay tracks (V2/V3). */
  pip?: {
    /** X position as fraction of canvas width (0=left, 1=right). Default 0.5. */
    x: number;
    /** Y position as fraction of canvas height (0=top, 1=bottom). Default 0.5. */
    y: number;
    /** Scale factor (0.1..2). Default 0.3 for PiP. */
    scale: number;
  };
  /** Transition applied at the END of this clip (into the next clip on same track). */
  transition?: {
    type: EditorTransitionType;
    /** Duration in seconds. */
    duration: number;
  };
  /** Speed curve for variable speed ramping. */
  speedCurve?: EditorSpeedCurve;
  /** Audio pitch shift in semitones (-12..12). 0 = no change. */
  pitchShift?: number;
};

export type EditorTrackKind = "video" | "audio";

export type EditorTrack = {
  id: string;
  kind: EditorTrackKind;
  /** Display label (V1, V2, A1, ...). */
  label: string;
  /** Track is locked — clips on it can't be moved/edited. */
  locked?: boolean;
  /** Track is hidden from output (video) / muted from mix (audio). */
  hidden?: boolean;
  /** Audio track is muted (audio only). */
  muted?: boolean;
  /** Solo mode: when any track has solo=true, only solo tracks are heard. */
  solo?: boolean;
};

export const DEFAULT_TRACKS: EditorTrack[] = [
  { id: "v1", kind: "video", label: "V1" },
  { id: "v2", kind: "video", label: "V2" },
  { id: "v3", kind: "video", label: "V3" },
  { id: "a1", kind: "audio", label: "A1" },
  { id: "a2", kind: "audio", label: "A2" },
];

export type EditorAspect = "16:9" | "9:16" | "1:1" | "4:3";

export type EditorProject = {
  id: string;
  name: string;
  clips: EditorClip[];
  /** Output aspect ratio. Affects preview letterbox and export dimensions. */
  aspect: EditorAspect;
  /**
   * Crossfade duration (seconds) between every adjacent clip pair.
   * 0 = hard cut. Kept at project level for simplicity; future: per-pair.
   */
  crossfadeSec: number;
  /** Transition type used between adjacent clips (FFmpeg xfade name).
   * Defaults to "fade". */
  transitionType?:
    | "fade"
    | "fadeblack"
    | "fadewhite"
    | "wipeleft"
    | "wiperight"
    | "slideleft"
    | "slideright"
    | "circleopen"
    | "circleclose";
  /**
   * Composition layout for the final canvas.
   *   - "single"  : timeline only (default)
   *   - "vsplit"  : video on top, static image below
   *   - "hsplit"  : video on left, static image on right
   * Used to combine a generated video with a character sheet / reference
   * image / poster into a single deliverable. */
  layout?: "single" | "vsplit" | "hsplit";
  /** Static image shown on the secondary half when layout != single. */
  splitImage?: {
    sourceUrl: string;
    sourceTitle: string;
    localKey?: string;
    mime?: string;
  };
  /** 0.2..0.8 — fraction of the canvas allocated to the video track.
   *  Default 0.5. Only used when layout != single. */
  splitRatio?: number;
  /** Optional background music — single audio track mixed under all clips. */
  bgm?: {
    sourceUrl: string;
    sourceTitle: string;
    /** 0..1 — relative to clip audio. Default 0.5. */
    volume: number;
    /** IndexedDB key for re-hydrating after reload. */
    localKey?: string;
    mime?: string;
  };
  /** Output height in pixels for export (auto-derived width via aspect).
   *  720 / 1080 / 2160. Defaults to 1080. */
  exportHeight?: number;
  /** Timeline zoom factor — px per second. Default auto-fit. */
  timelineZoom?: number;
  /**
   * Available tracks. Defaults to DEFAULT_TRACKS (v1/v2/v3/a1/a2) when missing.
   * Order here is the rendering order top→bottom.
   */
  tracks?: EditorTrack[];
  updatedAt: number;
};

/* ─────────── 片场 (Stage / Cast) — 剧本 → 拍 → 集 → 剧 ───────────
   一个 CastProject 是一部完整的剧(漫剧 or 短剧):
     - cast: 角色册(头像 + 音色),跨集复用
     - style: 风格 preset(影响所有 beat 的 imagegen prompt)
     - bgm:  单条背景音乐(整剧)
     - episodes[]: 多集,每集多 beats
   每个 beat = "一拍" = 一段旁白 + 一个画面 + 时长 2-6s。
   漫剧:beat.kind='comic',画面是 image + 假运动(Ken Burns/视差)。
   短剧:beat.kind='short',画面是 video。
   同集内可混用(某拍特殊用 video,其余用 image)。 */

export type CastBeatKind = "comic" | "short";

/** 镜头语言 —— 行业标准 10 档,前 6 个是运动(漫剧把静态图变"会动"),
 *  后 4 个是构图(影响 imagegen prompt 的视角/取景):
 *  ===== 运动类(漫剧用,影响 Ken Burns CSS / editor 关键帧) =====
 *  - still:    完全静止 / 沉静时刻
 *  - pan-lr:   横向缓慢平移(横摇)—— 展示环境/群像
 *  - zoom-in:  Ken Burns 缓推 —— 情感聚焦
 *  - zoom-out: 缓拉 —— 揭示更大场景
 *  - parallax: 视差(前景慢、背景快)—— 复杂,PiP 两层
 *  - live:     真视频(短剧/漫剧高潮拍)
 *  ===== 构图类(影响 imagegen prompt 的视角语言) =====
 *  - ots:      Over-the-Shoulder 过肩镜头 —— 对话场景,带视点感
 *  - pov:      Point-of-View 主观视角 —— 第一人称代入
 *  - dutch:    Dutch angle 荷兰角(倾斜)—— 紧张/失衡情绪
 *  - hero:     Hero shot 英雄镜(低角度仰拍)—— 高光时刻 */
export type CastShotType =
  | "still"
  | "pan-lr"
  | "zoom-in"
  | "zoom-out"
  | "parallax"
  | "live"
  | "ots"
  | "pov"
  | "dutch"
  | "hero";

export type CastCharacter = {
  id: string;
  name: string;
  /** 角色参考图 —— imagegen 时自动注入,保证跨集形象稳定 */
  refImageUrl?: string;
  /** IDB 本地 key,跨 session 重新水合 */
  refLocalKey?: string;
  /** 绑定的百炼 TTS 音色 id —— dialogue 自动按 speakerId 调对应音色 */
  voiceId?: string;
  /** UI 显示色(头像 chip 边框 / 时间线染色),默认按 cast 顺序选 */
  color?: string;
  /** 角色描述(身高/年龄/服装/性格)—— imagegen prompt 注入,
   *  让 LLM/扩散模型有更稳定的形象基线 */
  description?: string;
};

export type CastStyle = {
  /** 风格 preset id(日漫/水彩/赛博朋克/古风等),空 = 无预设 */
  presetId?: string;
  /** 风格参考图 —— img2img / ref 注入用 */
  refImageUrl?: string;
  refLocalKey?: string;
  /** 自动追加到所有 beat prompt 末尾的风格短语 */
  promptSuffix?: string;
};

export type CastBeat = {
  id: string;
  /** 在所属 episode 内的序号(1-based),拼集和 UI 排序用 */
  idx: number;
  /** 漫剧/短剧 —— 决定默认走 imagegen 还是 R2V */
  kind: CastBeatKind;
  /** 旁白/台词文本 —— 真相,所有派生物从它生成 */
  text: string;
  /** 多角色对白时指定说话角色(用于自动选 TTS 音色 + 字幕样式) */
  speakerId?: string;
  /** 镜头运动 —— 漫剧用 pan/zoom/parallax,短剧通常 live */
  shotType: CastShotType;
  /** imagegen prompt —— 可选,空则 UI 用 text+style 自动拼 */
  imagePrompt?: string;
  /** —— 派生产物(由现有 jobsStore 跟踪,beat 只存 id) —— */
  imageJobId?: string;
  videoJobId?: string;
  voiceJobId?: string;
  /** 这一拍最终时长(秒)。TTS 完成后自动回写为旁白音频长度 + 0.5s 留白。
   *  无旁白时用 4s 默认。 */
  durationSec: number;
};

export type CastEpisode = {
  id: string;
  /** 集号(1-based) */
  num: number;
  title: string;
  beats: CastBeat[];
};

export type CastProject = {
  id: string;
  name: string;
  /** 项目默认创作模式 —— 新加 beat 时继承此值。同集内每 beat 可单独覆盖。 */
  kind: CastBeatKind;
  cast: CastCharacter[];
  style: CastStyle;
  bgm?: {
    sourceUrl: string;
    sourceTitle: string;
    volume: number;
    localKey?: string;
    mime?: string;
  };
  episodes: CastEpisode[];
  /** 输出画幅 —— 漫剧通常 9:16(竖版),短剧也常 9:16 */
  aspect: EditorAspect;
  updatedAt: number;
};

/* ─────────── 片场 v2 (Series) —— 四工作区单文档工作站 ───────────
   PRD: "一部剧的单文档工作站"，组织成 Bible / Script / Board / Cut。
   数据模型向短漫剧领域术语靠拢。底层 jobsStore 复用。 */

export type ElementKind = "character" | "location" | "prop" | "style";

export type RefImage = {
  /** Cloud URL passed to generation APIs. */
  url: string;
  /** Browser preview URL rebuilt from IndexedDB after reload. */
  previewUrl?: string;
  /** Server-side mirror path for fallback preview. */
  localPath?: string;
  /** Tiny persisted thumbnail for immediate reload preview. */
  thumbDataUrl?: string;
  name?: string;
  mime?: string;
  localKey?: string;
  angle?: "front" | "side" | "back" | "expr";
};

export type StageElement = {
  id: string;
  kind: ElementKind;
  name: string;
  refImages: RefImage[];
  description?: string;
  /** 一致性强度 0-100，出图/出视频时映射到参考强度 */
  consistencyWeight?: number;
  /** 角色专属：TTS 音色 id */
  voiceId?: string;
  /** 角色专属：克隆音色 — 用户上传的参考音频 URL */
  customVoiceUrl?: string;
  /** 克隆音色本地存储 key */
  customVoiceLocalKey?: string;
  /** 角色专属：表演基线（性格/口癖 → 默认表演标签） */
  actingBaseline?: string;
  /** UI 显示色（头像 chip 边框 / 时间线染色） */
  color?: string;
};

export type DialogueLine = {
  speakerId?: string;
  line: string;
  /** 表演标签：情绪/节奏/打断 */
  tags?: string[];
};

export type KFrame = { scale?: number; x?: number; y?: number };

export type StageShotType = CastShotType;

/** 单步生成配置：可只换模型、只调参数、或两者都改 */
export type GenSlot = { modelId?: string; params?: Record<string, unknown> };
export type GenStep = "script" | "portrait" | "image" | "video" | "voice";
/** 出图/视频/配音三步的生成配置集 */
export type GenConfig = Partial<Record<GenStep, GenSlot>>;

export type StageShot = {
  id: string;
  idx: number;
  shotType: StageShotType;
  narration?: string;
  dialogue?: DialogueLine[];
  imagePrompt?: string;
  /** 本拍引用的元素 id（角色/地点/道具） */
  elementRefs: string[];
  kenBurns?: { from: KFrame; to: KFrame };
  imageJobId?: string;
  videoJobId?: string;
  voiceJobId?: string;
  durationSec: number;
  /** 单镜模型/参数覆盖（覆盖全剧 series.genConfig 默认） */
  genOverride?: GenConfig;
  _cx?: number;
  _cy?: number;
};

export type StageScene = {
  id: string;
  locationId?: string;
  castIds: string[];
  shots: StageShot[];
};

export type StageEpisode = {
  id: string;
  num: number;
  title: string;
  synopsis?: string;
  scenes: StageScene[];
};

export type Series = {
  id: string;
  name: string;
  kind: CastBeatKind;
  bible: StageElement[];
  synopsis?: string;
  /** 全剧分步生成配置默认（出图/视频/配音）—— 单镜可用 shot.genOverride 覆盖 */
  genConfig?: GenConfig;
  bgm?: {
    sourceUrl: string;
    sourceTitle: string;
    volume: number;
    localKey?: string;
    mime?: string;
  };
  episodes: StageEpisode[];
  aspect: EditorAspect;
  /** Stage compositing defaults used when importing a series episode into the editor. */
  editConfig?: {
    crossfadeSec?: number;
    transitionType?: NonNullable<EditorProject["transitionType"]>;
    captionPosition?: EditorTextOverlay["position"];
    captionSizePx?: number;
  };
  /** Stage publish settings surfaced in the export step. */
  exportConfig?: {
    height?: 720 | 1080 | 2160;
    platforms?: string[];
  };
  updatedAt: number;
  /** v2 标记，区分旧 CastProject */
  _v: 2;
};

/** v1 CastProject → v2 Series 一次性迁移 */
export function migrateCastToSeries(old: CastProject): Series {
  const bible: StageElement[] = [];
  // 暖色系(全局设计约束:禁电光紫/蓝)
  const PALETTE = ["#ff8a4c", "#ffd460", "#a3e635", "#3ddc97", "#e8a87c", "#ff5d8f", "#d4a24c", "#2dd4bf"];

  for (const c of old.cast) {
    bible.push({
      id: c.id,
      kind: "character",
      name: c.name,
      refImages: c.refImageUrl
        ? [{ url: c.refImageUrl, localKey: c.refLocalKey, angle: "front" }]
        : [],
      description: c.description,
      voiceId: c.voiceId,
      color: c.color ?? PALETTE[bible.length % PALETTE.length],
    });
  }

  if (old.style.presetId || old.style.refImageUrl || old.style.promptSuffix) {
    bible.push({
      id: `style-${old.id}`,
      kind: "style",
      name: old.style.presetId || "默认风格",
      refImages: old.style.refImageUrl
        ? [{ url: old.style.refImageUrl, localKey: old.style.refLocalKey, angle: "front" }]
        : [],
      description: old.style.promptSuffix,
    });
  }

  const episodes: StageEpisode[] = old.episodes.map((ep) => {
    const shots: StageShot[] = ep.beats.map((b) => ({
      id: b.id,
      idx: b.idx,
      shotType: b.shotType,
      narration: b.text,
      dialogue: b.speakerId
        ? [{ speakerId: b.speakerId, line: b.text }]
        : undefined,
      imagePrompt: b.imagePrompt,
      elementRefs: b.speakerId ? [b.speakerId] : [],
      imageJobId: b.imageJobId,
      videoJobId: b.videoJobId,
      voiceJobId: b.voiceJobId,
      durationSec: b.durationSec,
    }));

    const scene: StageScene = {
      id: `scene-${ep.id}`,
      shots,
      castIds: [...new Set(shots.flatMap((s) => s.elementRefs))],
    };

    return {
      id: ep.id,
      num: ep.num,
      title: ep.title,
      scenes: [scene],
    };
  });

  return {
    id: old.id,
    name: old.name,
    kind: old.kind,
    bible,
    bgm: old.bgm,
    episodes,
    aspect: old.aspect,
    updatedAt: old.updatedAt,
    _v: 2,
  };
}

/** 检测存储数据是否为旧格式，需要迁移 */
export function needsMigration(data: unknown): data is CastProject {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d._v !== 2 && Array.isArray(d.episodes) && !Array.isArray(d.bible);
}

/* ─────────── Discover cache ─────────── */

export type DiscoverCacheEntry = {
  /** Raw items array — left `unknown[]` here to avoid importing the source
   *  type (which is a server-only module). Discover.tsx casts to DiscoverItem[]. */
  items: unknown[];
  errors?: Record<string, string>;
  redditConfigured?: boolean;
  /** Unix ms fetched at. */
  fetchedAt: number;
};

/**
 * Reversible operations — lightweight, tracked in-memory (not persisted).
 * We only capture enough state to rebuild the deleted/mutated object.
 */
export type UndoEntry =
  | { kind: "delete-job"; job: Job; ts: number }
  | { kind: "toggle-publish"; jobId: string; wasPublished: boolean; ts: number }
  | { kind: "clear-compare"; prev: string[]; ts: number };

export type Job = {
  id: string;
  title: string;
  modelId: string;
  mode: Mode;
  /** All user-supplied params (schema-driven, see ParamField.key). */
  params: Record<string, unknown>;
  /** Resolved media inputs (after local upload → OSS). */
  media: {
    img_url?: JobMedia;
    last_frame_url?: JobMedia;
    first_clip_url?: JobMedia;
    audio_url?: JobMedia;
    reference_urls?: JobMedia[];
    video_url?: JobMedia;
    ref_images?: JobMedia[];
  };
  /** Prompts pulled out so they're easy to list. */
  prompt?: string;
  negativePrompt?: string;
  status: JobStatus;
  taskId?: string;
  videoUrl?: string;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
  published?: boolean;
  /** 资产库收藏标记 —— 用户主动收藏，可在资产库「收藏」筛选里快速找回。 */
  favorite?: boolean;
  /**
   * Where this entry came from.
   *   - "bailian"  = generated via the app's Bailian API flow (default)
   *   - "manual"   = hand-entered by the user (external URL + metadata)
   *   - "imported" = bulk-imported from a JSON manifest
   */
  source?: JobSource;
  /** Free-text origin label for manual entries (e.g. "Kling web", "Runway"). */
  sourceLabel?: string;
  /**
   * Free-text annotation the user attaches during Compare review
   * (e.g. "great lighting", "weak composition"). Survives across sessions.
   */
  note?: string;
  /** 资产分类 —— 素材/角色/场景/成片/音频 */
  category?: AssetCategory;
  /** 资产库手动标签 —— 用户给资产打标，便于按标签筛选 / 整理。 */
  tags?: string[];
  /**
   * When the video was uploaded from the user's device, the file bytes live
   * in IndexedDB under this key. `videoUrl` is then a blob: URL that's
   * ephemeral per session — rehydration on mount rebuilds it.
   */
  localKey?: string;
  /** Original mime type, used to re-create typed blobs on rehydration. */
  localMime?: string;
  /**
   * When this job was submitted as part of a batch (fan-out, seed variation,
   * prompt template expansion), all siblings share the same groupId and
   * render with a color accent bar in the jobs list.
   */
  groupId?: string;
  /** Human label for the group (e.g. "Fan-out · 3 models", "Seeds ×4"). */
  groupLabel?: string;
  /** Estimated cost in RMB fen (0.01 元); displayed in meta strip. */
  costFen?: number;
};

export type Draft = {
  mode: Mode;
  modelId: string;
  params: Record<string, unknown>;
  media: Job["media"];
  prompt: string;
  negativePrompt: string;
};

/** User-curated prompt + optional params snapshot, stored in localStorage. */
export type SavedPrompt = {
  id: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  mode?: Mode;
  modelId?: string;
  params?: Record<string, unknown>;
  savedAt: number;
};

/* ─────────── helpers ─────────── */

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function newDraft(mode: Mode = "t2v", modelId?: string): Draft {
  const spec = modelId ? getModel(modelId) : defaultModelForMode(mode);
  if (!spec) throw new Error("No spec");
  return {
    mode: spec.mode,
    modelId: spec.id,
    params: { ...spec.defaults },
    media: {},
    prompt: "",
    negativePrompt: "",
  };
}

function stripPreviewUrls(media: Job["media"]): Job["media"] {
  // Drop ephemeral blob: URL but keep localKey + thumbDataUrl so MediaPicker
  // can show a preview without depending on the live blob URL.
  // 历史 bug：曾把 createObjectURL(blob) 写到 thumbDataUrl 里，reload 后死掉。
  // 这里再做一道闸 —— 任何 blob: 字面值一律剥离，避免污染再次落盘。
  const clean = (m?: JobMedia): JobMedia | undefined => {
    if (!m) return undefined;
    const safeThumb =
      m.thumbDataUrl && !m.thumbDataUrl.startsWith("blob:")
        ? m.thumbDataUrl
        : undefined;
    return {
      name: m.name,
      url: m.url,
      mime: m.mime,
      localKey: m.localKey,
      thumbDataUrl: safeThumb,
      localPath: m.localPath,
    };
  };
  const cleanArr = (arr?: JobMedia[]) =>
    arr ? arr.map((m) => clean(m)!).filter(Boolean) : undefined;
  return {
    img_url: clean(media.img_url),
    last_frame_url: clean(media.last_frame_url),
    first_clip_url: clean(media.first_clip_url),
    audio_url: clean(media.audio_url),
    reference_urls: cleanArr(media.reference_urls),
    video_url: clean(media.video_url),
    ref_images: cleanArr(media.ref_images),
  };
}

/**
 * @deprecated 历史遗留——之前为了 5MB localStorage 配额而 strip thumbDataUrl，
 * 现在 jobs 已迁移到 IDB（无配额），直接用 stripPreviewUrls 保留 thumb 即可。
 * 保留此别名仅为兼容旧引用，新代码请用 stripPreviewUrls。
 */
const stripForStorage = stripPreviewUrls;

/* ─────────── Jobs IndexedDB (no size cap) ─────────── */

const JOBS_IDB_NAME = "frame-0-jobs-v1";
const JOBS_IDB_STORE = "data";

let _jobsDbP: Promise<IDBDatabase> | null = null;
function jobsDb(): Promise<IDBDatabase> {
  if (!_jobsDbP) {
    _jobsDbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(JOBS_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(JOBS_IDB_STORE))
          req.result.createObjectStore(JOBS_IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return _jobsDbP;
}

async function idbGetJobs(): Promise<Job[] | null> {
  try {
    const db = await jobsDb();
    return new Promise((resolve) => {
      const req = db
        .transaction(JOBS_IDB_STORE, "readonly")
        .objectStore(JOBS_IDB_STORE)
        .get("jobs");
      req.onsuccess = () => {
        const raw = req.result ?? null;
        resolve(Array.isArray(raw) ? raw.map(sanitizeStoredJob) : raw);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 旧版本曾把 createObjectURL(blob) 错误写入 thumbDataUrl，这些 URL 跨 session
 *  即失效。读 IDB 时一次性把它们剥掉，渲染层会自动从 IDB rehydrate 出新的
 *  本会话 blob URL —— 任何 reload 后都不会再裂图。 */
function sanitizeStoredJob(job: Job): Job {
  const m = job.media;
  if (!m) return job;
  const cleanOne = (x?: JobMedia): JobMedia | undefined => {
    if (!x) return undefined;
    if (x.thumbDataUrl?.startsWith("blob:"))
      return { ...x, thumbDataUrl: undefined };
    return x;
  };
  const cleanArr = (arr?: JobMedia[]) =>
    arr ? arr.map((x) => cleanOne(x)!).filter(Boolean) : undefined;
  return {
    ...job,
    media: {
      img_url: cleanOne(m.img_url),
      last_frame_url: cleanOne(m.last_frame_url),
      first_clip_url: cleanOne(m.first_clip_url),
      audio_url: cleanOne(m.audio_url),
      reference_urls: cleanArr(m.reference_urls),
      video_url: cleanOne(m.video_url),
      ref_images: cleanArr(m.ref_images),
    },
  };
}

async function idbPutJobs(jobs: unknown[]): Promise<void> {
  try {
    const db = await jobsDb();
    return new Promise<void>((resolve) => {
      const tx = db.transaction(JOBS_IDB_STORE, "readwrite");
      tx.objectStore(JOBS_IDB_STORE).put(jobs, "jobs");
      tx.oncomplete = () => {
        pruneDeletedLog(new Set((jobs as Job[]).map((j) => j.id)));
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch {
    /* IndexedDB unavailable — silent */
  }
}

/* ── Deletion log ──
   deleteJob 同步写 localStorage 标记已删 ID，防止 IDB 异步写入未完成就刷新
   导致旧数据"复活"。hydration 时用此日志过滤 IDB 数据，IDB 写入成功后清除。 */
const DELETED_LOG_KEY = "frame-0:deleted-jobs";

function getDeletedLog(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_LOG_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function addToDeletedLog(id: string) {
  const log = getDeletedLog();
  log.add(id);
  try {
    localStorage.setItem(DELETED_LOG_KEY, JSON.stringify([...log]));
  } catch { /* quota — best effort */ }
}

function clearDeletedLog() {
  try {
    localStorage.removeItem(DELETED_LOG_KEY);
  } catch { /* ignore */ }
}

function pruneDeletedLog(writtenIds: Set<string>) {
  const log = getDeletedLog();
  if (log.size === 0) return;
  const stale = [...log].filter((id) => writtenIds.has(id));
  if (stale.length === 0) {
    clearDeletedLog();
  } else {
    try {
      localStorage.setItem(DELETED_LOG_KEY, JSON.stringify(stale));
    } catch { /* quota — best effort */ }
  }
}

/**
 * Hybrid storage: jobs → IndexedDB (unlimited), everything else → localStorage.
 * On first load, migrates any jobs still in localStorage into IDB automatically.
 */
/**
 * Flag flipped to true once getItem has completed — i.e. zustand persist has
 * finished hydrating. Before this, an empty-jobs write is the *initial empty
 * state* and must NOT clobber IDB. After this, an empty-jobs write means the
 * user legitimately deleted everything and MUST reach IDB.
 */
let hasHydratedFromIDB = false;

function hybridStorage() {
  return {
    getItem: async (key: string): Promise<string | null> => {
      const raw = localStorage.getItem(key);
      const idbJobs = await idbGetJobs();

      try {
        const deletedLog = getDeletedLog();
        const filteredIdbJobs =
          idbJobs !== null && deletedLog.size > 0
            ? idbJobs.filter((j) => !deletedLog.has((j as Job).id))
            : idbJobs;

        // Case 1: localStorage exists — merge IDB jobs in
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (filteredIdbJobs !== null && data.state) {
              data.state.jobs = filteredIdbJobs;
            }
            return JSON.stringify(data);
          } catch {
            return raw;
          }
        }

        // Case 2: localStorage empty but IDB has jobs — rebuild minimal envelope
        if (filteredIdbJobs !== null && filteredIdbJobs.length > 0) {
          console.info("[frame-0] localStorage empty, recovering %d jobs from IDB", filteredIdbJobs.length);
          return JSON.stringify({ state: { jobs: filteredIdbJobs }, version: 3 });
        }

        return null;
      } finally {
        // Mark hydration complete so future empty writes are allowed through.
        hasHydratedFromIDB = true;
      }
    },
    setItem: (key: string, value: string) => {
      try {
        const data = JSON.parse(value);
        if (Array.isArray(data.state?.jobs)) {
          // Skip empty-array writes only BEFORE hydration completes —
          // the initial empty state shouldn't clobber persisted IDB data.
          // After hydration, an empty array means the user deleted everything
          // and MUST be written so the deletion survives reload.
          if (data.state.jobs.length > 0 || hasHydratedFromIDB) {
            void idbPutJobs(data.state.jobs);
          }
          data.state = { ...data.state, jobs: [] };
        }
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {
        if (
          err instanceof DOMException &&
          (err.name === "QuotaExceededError" ||
            (err as { code?: number }).code === 22)
        ) {
          console.warn("[frame-0] localStorage quota exceeded (non-job data)");
          return;
        }
      }
    },
    removeItem: (key: string) => localStorage.removeItem(key),
  };
}

/* ─────────── store ─────────── */

export type PaneWidths = {
  /** Left "Jobs" sidebar width in px. */
  jobs: number;
  /** Right "Params" sidebar width in px. */
  params: number;
};

type State = {
  jobs: Job[];
  draft: Draft;
  activeJobId?: string;
  /** jobIds selected for the Compare page. */
  compareSet: string[];
  /** User-curated prompt library (persisted in localStorage). */
  savedPrompts: SavedPrompt[];
  /** 用户自定义导演模版（持久化） */
  customPresets: import("@/lib/r2v/promptPresets").PromptPreset[];
  /** 已删除任务的 taskId 黑名单 —— 防止 useLocalVideoRecovery 重新恢复 */
  deletedTaskIds: string[];
  /** Persisted sidebar widths for the Studio 3-col layout. */
  paneWidths: PaneWidths;
  /** Persistent editor project (single project for MVP; multi later). */
  editorProject: EditorProject;
  /** 片场 —— 旧格式,保留做迁移兼容 */
  castProject: CastProject;
  /** 片场 v2 —— 四工作区单文档工作站 */
  series: Series;
  /** Client-side cache for /api/discover responses keyed by "source:period".
   *  10-min TTL. Lives in the persisted store so switching tabs / navigating
   *  away and back doesn't re-hit the network. */
  discoverCache: Record<string, DiscoverCacheEntry>;
  /**
   * User-entered API keys, keyed by env var name (e.g. `DASHSCOPE_API_KEY`,
   * `HAPPYHORSE_API_KEY`). Persisted in localStorage; sent to our own
   * /api/bailian/* routes as a same-origin header (never directly to Bailian).
   * When present, takes precedence over the server-side env var.
   */
  apiKeys: Record<string, string>;
  /**
   * Promo discount applied to the displayed cost estimate, in 折 (1–10).
   * 10 = no discount (full price); 8.5 = 8.5折 = pay 85%. Persisted.
   */
  discount: number;
  /** Timestamp signal — set when loadJobIntoDraft fires so the composer can react (expand + focus). */
  draftLoadedAt: number;

  /* draft mutations */
  setMode: (mode: Mode) => void;
  setModelId: (modelId: string) => void;
  setParam: (key: string, value: unknown) => void;
  setPrompt: (v: string) => void;
  setNegativePrompt: (v: string) => void;
  setMedia: (patch: Partial<Job["media"]>) => void;
  resetDraft: () => void;
  loadJobIntoDraft: (jobId: string) => void;

  /* job lifecycle */
  createJobFromDraft: () => string;
  /**
   * Seed a new job row from explicit params (used by Fan-out + Retry).
   * Returns the new job id. Starts in `submitting` status.
   */
  createJobFromPayload: (payload: {
    modelId: string;
    mode: Mode;
    params: Record<string, unknown>;
    media: Job["media"];
    prompt?: string;
    negativePrompt?: string;
    title?: string;
  }) => string;
  setJobStatus: (id: string, patch: Partial<Job>) => void;
  setJobNote: (id: string, note: string) => void;
  setJobTags: (id: string, tags: string[]) => void;
  setJobTitle: (id: string, title: string) => void;
  setJobCategory: (id: string, category: AssetCategory) => void;
  deleteJob: (id: string) => void;
  selectJob: (id: string | undefined) => void;
  togglePublish: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  /** 资产库 →工坊「送去复用」的一次性信号：跳转到 /studio 后由 Studio 执行对应 handler。 */
  pendingReuse?: { jobId: string; action: "i2v" | "ve" | "rerun" };
  setPendingReuse: (r: State["pendingReuse"]) => void;

  /* saved prompts */
  /** Save current draft's prompt + (optionally) params into the library. */
  savePromptFromDraft: (opts?: { withParams?: boolean; title?: string }) => string;
  /**
   * Save a prompt from outside the draft (e.g. Discover item). Used so users
   * can stash external inspiration without going through the right-pane.
   */
  saveExternalPrompt: (input: {
    prompt: string;
    title?: string;
    negativePrompt?: string;
    modelId?: string;
    mode?: Mode;
  }) => string;
  removeSavedPrompt: (id: string) => void;
  renameSavedPrompt: (id: string, title: string) => void;

  /* custom director presets */
  addCustomPreset: (p: Omit<import("@/lib/r2v/promptPresets").PromptPreset, "id">) => string;
  updateCustomPreset: (id: string, patch: Partial<import("@/lib/r2v/promptPresets").PromptPreset>) => void;
  removeCustomPreset: (id: string) => void;

  /* pane widths (Studio resizable sidebars) */
  setPaneWidth: (side: "jobs" | "params", px: number) => void;

  /* web-entered API keys */
  setApiKey: (envName: string, value: string) => void;
  removeApiKey: (envName: string) => void;
  clearApiKeys: () => void;

  /** Set the promo discount (折, 1–10; 10 = no discount). */
  setDiscount: (zhe: number) => void;

  /* discover cache */
  setDiscoverCache: (key: string, entry: DiscoverCacheEntry) => void;
  clearDiscoverCache: () => void;

  /* editor project */
  editorAddClip: (clip: Omit<EditorClip, "id">, insertAfterId?: string) => string;
  editorRemoveClip: (clipId: string) => void;
  editorMoveClip: (clipId: string, direction: -1 | 1) => void;
  /** Drag-drop reorder: move clip with `fromId` to position currently
   *  occupied by `toId` (drop **before** that target). */
  editorReorderClip: (fromId: string, toId: string) => void;
  editorUpdateClip: (clipId: string, patch: Partial<EditorClip>) => void;
  editorClearClips: () => void;
  editorRenameProject: (name: string) => void;
  /** 整体替换 editorProject —— 用于"从片场导入剧本"等批量装载场景。
   *  snapshot 一次以便 ⌘Z 回到加载前。 */
  editorLoadProject: (project: EditorProject) => void;
  editorSetAspect: (aspect: EditorAspect) => void;
  editorSetCrossfade: (sec: number) => void;
  editorSetExportHeight: (h: number) => void;
  editorSetTimelineZoom: (pxPerSec: number) => void;
  editorSetTransitionType: (t: NonNullable<EditorProject["transitionType"]>) => void;
  editorSetBgm: (bgm: EditorProject["bgm"]) => void;
  editorSetLayout: (l: NonNullable<EditorProject["layout"]>) => void;
  editorSetSplitImage: (img: EditorProject["splitImage"]) => void;
  editorSetSplitRatio: (r: number) => void;
  /** Set a clip's absolute startSec on the timeline. Doesn't relayout other
   *  clips — used by drag-to-move on the timeline. */
  editorSetClipStart: (clipId: string, startSec: number) => void;
  /* Track ops */
  editorUpdateTrack: (trackId: string, patch: Partial<EditorTrack>) => void;
  /** Add a new track of the given kind. Returns the new track id. */
  editorAddTrack: (kind: EditorTrackKind) => string;
  /** Remove a track by id (clips on it are also removed). */
  editorRemoveTrack: (trackId: string) => void;
  /** Move a clip to a different track (also lets cross-track drop reorder
   *  by inserting after `insertAfterClipId` if provided). */
  editorMoveClipToTrack: (clipId: string, trackId: string, insertAfterClipId?: string) => void;
  /** Duplicate a clip, placing the copy right after the original. */
  editorDuplicateClip: (clipId: string) => string | undefined;
  /** 删除 clip,**同轨后续 clip 的 startSec 自动前移**,消除留空洞。
   *  专业剪辑器 ripple delete 心智:删完一段后整条轨自动收紧,符合"剪辑"的
   *  日常预期(不是"留洞") */
  editorRippleDelete: (clipId: string) => void;
  /** 把多个 mutation 合并成一个 undo step。开头 snapshot 一次,fn 内
   *  mutation 跳过 snapshot,结束后恢复。用于多选删除 / blade 一刀多
   *  split / 拖拽组合操作等场景,Cmd+Z 一次撤销整批。 */
  editorBatch: (fn: () => void) => void;
  /* Editor-only undo/redo (snapshots of full editorProject). */
  editorUndoStack: EditorProject[];
  editorRedoStack: EditorProject[];
  editorUndo: () => void;
  editorRedo: () => void;
  /**
   * Split a clip into two at the given source time (absolute seconds into
   * source file). First part keeps the original id; second part gets a new
   * id and is inserted right after. Returns the new clip id.
   */
  editorSplitClip: (clipId: string, atSec: number) => string | undefined;

  /* —— 片场 actions ——
     最少 actions 集 —— 浅 merge 模式,UI 自己 compose 复杂 mutation。 */
  setCastProject: (patch: Partial<CastProject>) => void;
  resetCastProject: () => void;
  /** 加新一集,自动续号,空 beats。返回新 ep id。 */
  castAddEpisode: (title?: string) => string;
  castRemoveEpisode: (epId: string) => void;
  castUpdateEpisode: (epId: string, patch: Partial<CastEpisode>) => void;
  /** 加新拍 —— 默认继承 project.kind,idx 自动续。返回新 beat id。
   *  init 用于 AI 写剧本场景:传入 text/shotType 一次性建好。 */
  castAddBeat: (epId: string, init?: Partial<CastBeat>) => string;
  castRemoveBeat: (epId: string, beatId: string) => void;
  castUpdateBeat: (epId: string, beatId: string, patch: Partial<CastBeat>) => void;
  /** 拖拽重排 beat。同一 ep 内交换 idx。 */
  castMoveBeat: (epId: string, fromIdx: number, toIdx: number) => void;
  /* 角色册 + 风格 */
  castAddCharacter: (c: Omit<CastCharacter, "id">) => string;
  castRemoveCharacter: (id: string) => void;
  castUpdateCharacter: (id: string, patch: Partial<CastCharacter>) => void;
  castSetStyle: (patch: Partial<CastStyle>) => void;
  castSetBgm: (bgm: CastProject["bgm"]) => void;

  /* ─── Series v2 actions ─── */
  setSeries: (patch: Partial<Series>) => void;
  resetSeries: () => void;
  // ── 多租户项目层 ──
  currentOrgId: string | null;
  currentProjectId: string | null;
  orgList: { id: string; name: string }[];
  projectList: { id: string; name: string; kind: string; updatedAt: number }[];
  loadOrgs: () => Promise<void>;
  loadProjects: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  newProject: (name: string) => Promise<string | null>;
  saveCurrentProject: () => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  /** 当前活动集（多集：对话/生成落到这一集） */
  activeEpId: string | null;
  setActiveEp: (id: string | null) => void;
  /** 检测旧数据并自动迁移 */
  migrateIfNeeded: () => void;
  seriesAddEpisode: (title?: string) => string;
  seriesRemoveEpisode: (epId: string) => void;
  seriesUpdateEpisode: (epId: string, patch: Partial<StageEpisode>) => void;
  seriesAddScene: (epId: string, init?: Partial<StageScene>) => string;
  seriesRemoveScene: (epId: string, sceneId: string) => void;
  seriesUpdateScene: (epId: string, sceneId: string, patch: Partial<StageScene>) => void;
  seriesAddShot: (epId: string, sceneId: string, init?: Partial<StageShot>) => string;
  seriesRemoveShot: (epId: string, sceneId: string, shotId: string) => void;
  seriesUpdateShot: (epId: string, sceneId: string, shotId: string, patch: Partial<StageShot>) => void;
  seriesMoveShot: (epId: string, sceneId: string, fromIdx: number, toIdx: number) => void;
  seriesAddElement: (e: Omit<StageElement, "id">) => string;
  seriesRemoveElement: (id: string) => void;
  seriesUpdateElement: (id: string, patch: Partial<StageElement>) => void;
  seriesSetBgm: (bgm: Series["bgm"]) => void;

  /* undo stack (bounded, in-memory only) */
  undoStack: UndoEntry[];
  pushUndo: (entry: UndoEntry) => void;
  popUndo: () => UndoEntry | undefined;

  /**
   * Drop an external prompt (from Discover) into the current draft, then
   * Studio can be navigated to for submission.
   */
  loadExternalPromptIntoDraft: (prompt: string, negativePrompt?: string) => void;

  /* manual / imported archive entries */
  /**
   * Create a done-state Job from hand-entered data. Returns new id.
   * Intentionally permissive — skips model schema validation so external
   * URLs (Kling web, Runway exports, own S3 clips) can live alongside
   * Bailian-generated work in the Archive.
   */
  createManualWork: (input: {
    title: string;
    videoUrl: string;
    prompt?: string;
    sourceLabel?: string;
    modelId?: string;
    mode?: Mode;
    durationSec?: number;
    publish?: boolean;
    /** For locally-uploaded files: key into IndexedDB + mime for rehydration. */
    localKey?: string;
    localMime?: string;
  }) => string;
  /** Bulk-import entries from a JSON manifest (the one exported by Archive). */
  importWorksFromJson: (
    raw: string
  ) => { added: number; skipped: number; error?: string };

  resetAll: () => void;
};

export const useStudioStore = create<State>()(
  persist(
    (set, get) => {
      // Editor undo helper — snapshot full editorProject before any mutation
      // so the user can ⌘Z back. Clears redo stack (any new edit invalidates
      // forward history). Bounded at 50 to avoid unbounded growth.
      //
      // `_inEditorBatch`:editorBatch() 内的 mutation 共用一个 undo step。
      // closure 局部变量,store 单例只创建一次,跨 set 共享。
      let _inEditorBatch = false;
      const snapshotEditor = () => {
        if (_inEditorBatch) return;
        const s = get();
        set({
          editorUndoStack: [s.editorProject, ...s.editorUndoStack].slice(0, 50),
          editorRedoStack: [],
        });
      };
      return {
      jobs: [],
      draft: newDraft("t2v"),
      activeJobId: undefined,
      compareSet: [],
      savedPrompts: [],
      customPresets: [],
      deletedTaskIds: [],
      paneWidths: { jobs: 280, params: 400 },
      apiKeys: {},
      discount: 10,
      draftLoadedAt: 0,
      editorProject: {
        id: "default",
        name: "Untitled Reel",
        clips: [],
        aspect: "16:9",
        crossfadeSec: 0,
        exportHeight: 1080,
        tracks: DEFAULT_TRACKS,
        updatedAt: Date.now(),
      },
      castProject: {
        id: "default",
        name: "未命名剧本",
        kind: "comic",
        cast: [],
        style: {},
        episodes: [
          {
            id: "ep-1",
            num: 1,
            title: "第 1 集",
            beats: [],
          },
        ],
        aspect: "9:16",
        updatedAt: Date.now(),
      },
      series: {
        id: "default",
        name: "未命名剧本",
        kind: "comic",
        bible: [],
        episodes: [
          {
            id: "ep-1",
            num: 1,
            title: "第 1 集",
            scenes: [{ id: "scene-ep-1", shots: [], castIds: [] }],
          },
        ],
        aspect: "9:16",
        updatedAt: Date.now(),
        _v: 2,
      },
      discoverCache: {},
      undoStack: [],
      editorUndoStack: [],
      editorRedoStack: [],

      setMode: (mode) => {
        const spec = defaultModelForMode(mode);
        set({
          draft: {
            mode,
            modelId: spec.id,
            params: { ...spec.defaults },
            media: {},
            prompt: get().draft.prompt,
            negativePrompt: get().draft.negativePrompt,
          },
        });
      },

      setModelId: (modelId) => {
        const spec = getModel(modelId);
        if (!spec) return;
        const current = get().draft;
        set({
          draft: {
            ...current,
            mode: spec.mode,
            modelId: spec.id,
            // 切到不同 mode 时清空 media —— 各 mode 媒体字段不通用，
            // 残留会导致「选了 I2V 还显示上次的媒体」。
            media: spec.mode === current.mode ? current.media : {},
            params: {
              ...spec.defaults,
              ...Object.fromEntries(
                Object.entries(current.params).filter(([k]) =>
                  spec.fields.some((f) => f.key === k)
                )
              ),
            },
          },
        });
      },

      setParam: (key, value) =>
        set((s) => ({
          draft: { ...s.draft, params: { ...s.draft.params, [key]: value } },
        })),

      setPrompt: (v) => set((s) => ({ draft: { ...s.draft, prompt: v } })),

      setNegativePrompt: (v) =>
        set((s) => ({ draft: { ...s.draft, negativePrompt: v } })),

      setMedia: (patch) =>
        set((s) => ({
          draft: { ...s.draft, media: { ...s.draft.media, ...patch } },
        })),

      resetDraft: () =>
        set({ draft: newDraft(get().draft.mode, get().draft.modelId) }),

      loadJobIntoDraft: (jobId) => {
        const job = get().jobs.find((j) => j.id === jobId);
        if (!job) return;
        set({
          draft: {
            mode: job.mode,
            modelId: job.modelId,
            params: { ...job.params },
            media: { ...job.media },
            prompt: job.prompt ?? "",
            negativePrompt: job.negativePrompt ?? "",
          },
          draftLoadedAt: Date.now(),
        });
      },

      createJobFromDraft: () => {
        const d = get().draft;
        const spec = getModel(d.modelId);
        const id = uid();
        const job: Job = {
          id,
          title: (d.prompt || spec?.displayName || "Untitled").slice(0, 60),
          modelId: d.modelId,
          mode: d.mode,
          params: { ...d.params },
          media: { ...d.media },
          prompt: d.prompt || undefined,
          negativePrompt: d.negativePrompt || undefined,
          status: "submitting",
          createdAt: Date.now(),
        };
        set({
          jobs: [job, ...get().jobs],
          activeJobId: id,
        });
        return id;
      },

      createJobFromPayload: (payload) => {
        const id = uid();
        const spec = getModel(payload.modelId);
        const job: Job = {
          id,
          title: (payload.title || payload.prompt || spec?.displayName || "Untitled").slice(0, 60),
          modelId: payload.modelId,
          mode: payload.mode,
          params: { ...payload.params },
          media: { ...payload.media },
          prompt: payload.prompt || undefined,
          negativePrompt: payload.negativePrompt || undefined,
          status: "submitting",
          createdAt: Date.now(),
        };
        set({ jobs: [job, ...get().jobs] });
        return id;
      },

      setJobStatus: (id, patch) =>
        set({
          jobs: get().jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        }),

      setJobNote: (id, note) =>
        set({
          jobs: get().jobs.map((j) => (j.id === id ? { ...j, note } : j)),
        }),

      setJobTags: (id, tags) =>
        set({
          jobs: get().jobs.map((j) =>
            j.id === id
              ? { ...j, tags: tags.length ? Array.from(new Set(tags)) : undefined }
              : j
          ),
        }),

      setJobCategory: (id, category) =>
        set({
          jobs: get().jobs.map((j) => (j.id === id ? { ...j, category } : j)),
        }),

      setJobTitle: (id, title) =>
        set({
          jobs: get().jobs.map((j) =>
            j.id === id ? { ...j, title: title.trim() || j.title } : j
          ),
        }),

      deleteJob: (id) => {
        addToDeletedLog(id);
        const snapshot = get().jobs.find((j) => j.id === id);
        const jobs = get().jobs.filter((j) => j.id !== id);
        const activeJobId =
          get().activeJobId === id ? jobs[0]?.id : get().activeJobId;
        const deletedTaskIds = snapshot?.taskId
          ? [...get().deletedTaskIds, snapshot.taskId]
          : get().deletedTaskIds;
        if (snapshot) {
          const undo: UndoEntry = { kind: "delete-job", job: snapshot, ts: Date.now() };
          set({
            jobs,
            activeJobId,
            deletedTaskIds,
            compareSet: get().compareSet.filter((x) => x !== id),
            undoStack: [undo, ...get().undoStack].slice(0, 10),
          });
        } else {
          set({
            jobs,
            activeJobId,
            deletedTaskIds,
            compareSet: get().compareSet.filter((x) => x !== id),
          });
        }
      },

      selectJob: (id) => set({ activeJobId: id }),

      togglePublish: (id) => {
        const job = get().jobs.find((j) => j.id === id);
        if (!job) return;
        const undo: UndoEntry = {
          kind: "toggle-publish",
          jobId: id,
          wasPublished: !!job.published,
          ts: Date.now(),
        };
        set({
          jobs: get().jobs.map((j) =>
            j.id === id ? { ...j, published: !j.published } : j
          ),
          undoStack: [undo, ...get().undoStack].slice(0, 10),
        });
      },

      toggleFavorite: (id) => {
        set({
          jobs: get().jobs.map((j) =>
            j.id === id ? { ...j, favorite: !j.favorite } : j
          ),
        });
      },

      setPendingReuse: (r) => set({ pendingReuse: r }),

      toggleCompare: (id) => {
        const cs = get().compareSet;
        set({
          compareSet: cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id],
        });
      },

      clearCompare: () => {
        const prev = get().compareSet;
        if (prev.length === 0) {
          set({ compareSet: [] });
          return;
        }
        const undo: UndoEntry = { kind: "clear-compare", prev, ts: Date.now() };
        set({
          compareSet: [],
          undoStack: [undo, ...get().undoStack].slice(0, 10),
        });
      },

      savePromptFromDraft: ({ withParams = false, title } = {}) => {
        const d = get().draft;
        const text = d.prompt.trim();
        if (!text) return "";
        const id = uid();
        const entry: SavedPrompt = {
          id,
          title: (title || text).slice(0, 60),
          prompt: text,
          negativePrompt: d.negativePrompt || undefined,
          mode: d.mode,
          modelId: d.modelId,
          params: withParams ? { ...d.params } : undefined,
          savedAt: Date.now(),
        };
        set({ savedPrompts: [entry, ...get().savedPrompts] });
        return id;
      },

      saveExternalPrompt: (input) => {
        const text = input.prompt.trim();
        if (!text) return "";
        const id = uid();
        const entry: SavedPrompt = {
          id,
          title: (input.title || text).slice(0, 60),
          prompt: text,
          negativePrompt: input.negativePrompt || undefined,
          mode: input.mode,
          modelId: input.modelId,
          savedAt: Date.now(),
        };
        set({ savedPrompts: [entry, ...get().savedPrompts] });
        return id;
      },

      removeSavedPrompt: (id) =>
        set({ savedPrompts: get().savedPrompts.filter((p) => p.id !== id) }),

      renameSavedPrompt: (id, title) =>
        set({
          savedPrompts: get().savedPrompts.map((p) =>
            p.id === id ? { ...p, title } : p
          ),
        }),

      addCustomPreset: (p) => {
        const id = `custom-${uid()}`;
        set({ customPresets: [...get().customPresets, { ...p, id }] });
        return id;
      },
      updateCustomPreset: (id, patch) =>
        set({ customPresets: get().customPresets.map((p) => p.id === id ? { ...p, ...patch } : p) }),
      removeCustomPreset: (id) =>
        set({ customPresets: get().customPresets.filter((p) => p.id !== id) }),

      setPaneWidth: (side, px) =>
        set({ paneWidths: { ...get().paneWidths, [side]: px } }),

      setApiKey: (envName, value) => {
        const trimmed = value.trim();
        const next = { ...get().apiKeys };
        if (trimmed) next[envName] = trimmed;
        else delete next[envName];
        set({ apiKeys: next });
      },
      removeApiKey: (envName) => {
        const next = { ...get().apiKeys };
        delete next[envName];
        set({ apiKeys: next });
      },
      clearApiKeys: () => set({ apiKeys: {} }),

      setDiscount: (zhe) =>
        set({
          discount: Number.isFinite(zhe)
            ? Math.max(1, Math.min(10, Math.round(zhe * 10) / 10))
            : 10,
        }),

      setDiscoverCache: (key, entry) =>
        set({ discoverCache: { ...get().discoverCache, [key]: entry } }),
      clearDiscoverCache: () => set({ discoverCache: {} }),

      editorAddClip: (clip, insertAfterId) => {
        snapshotEditor();
        const id = uid();
        const p = get().editorProject;
        const targetTrack = clip.trackId ?? "v1";
        // Compute absolute startSec without relayouting other clips:
        //   - insertAfterId: place right after that clip's end
        //   - else: append at the end of the target track
        let startSec: number;
        if (insertAfterId) {
          const after = p.clips.find((c) => c.id === insertAfterId);
          startSec = after ? clipEndSec(after) : trackEndSec(p.clips, targetTrack);
        } else {
          startSec = trackEndSec(p.clips, targetTrack);
        }
        const full: EditorClip = { id, ...clip, startSec };
        let nextClips: EditorClip[];
        if (insertAfterId) {
          const idx = p.clips.findIndex((c) => c.id === insertAfterId);
          if (idx >= 0) {
            nextClips = [
              ...p.clips.slice(0, idx + 1),
              full,
              ...p.clips.slice(idx + 1),
            ];
          } else {
            nextClips = [...p.clips, full];
          }
        } else {
          nextClips = [...p.clips, full];
        }
        set({
          editorProject: { ...p, clips: nextClips, updatedAt: Date.now() },
        });
        return id;
      },
      editorRemoveClip: (clipId) => {
        snapshotEditor();
        const p = get().editorProject;
        set({
          editorProject: {
            ...p,
            clips: p.clips.filter((c) => c.id !== clipId),
            updatedAt: Date.now(),
          },
        });
      },
      editorMoveClip: (clipId, direction) => {
        // In the absolute-position model, "move 1 step" means: swap startSec
        // with the next/previous clip on the same track, ordered by startSec.
        const p = get().editorProject;
        const me = p.clips.find((c) => c.id === clipId);
        if (!me) return;
        const sameTrack = p.clips
          .filter((c) => trackOf(c) === trackOf(me))
          .sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));
        const sortedIdx = sameTrack.findIndex((c) => c.id === clipId);
        const swapWith = sameTrack[sortedIdx + direction];
        if (!swapWith) return;
        snapshotEditor();
        const meEnd = clipEndSec(me);
        const swapEnd = clipEndSec(swapWith);
        const meDur = clipRenderDur(me);
        const swapDur = clipRenderDur(swapWith);
        // After swap, `me` starts where `swapWith` started, and vice-versa,
        // adjusted so that the gap between them is preserved.
        const newSwapStart = me.startSec ?? 0;
        const newMeStart = (swapWith.startSec ?? 0) + swapDur - meDur;
        void meEnd; void swapEnd;
        const next = p.clips.map((c) => {
          if (c.id === me.id) return { ...c, startSec: Math.max(0, newMeStart) };
          if (c.id === swapWith.id) return { ...c, startSec: Math.max(0, newSwapStart) };
          return c;
        });
        set({
          editorProject: { ...p, clips: next, updatedAt: Date.now() },
        });
      },
      editorReorderClip: (fromId, toId) => {
        // Absolute model: dropping `fromId` "before" `toId` means setting
        // fromId's startSec to toId's startSec (no array reordering needed).
        const p = get().editorProject;
        if (fromId === toId) return;
        const to = p.clips.find((c) => c.id === toId);
        if (!to) return;
        snapshotEditor();
        const newStart = to.startSec ?? 0;
        const next = p.clips.map((c) =>
          c.id === fromId ? { ...c, startSec: newStart, trackId: trackOf(to) } : c
        );
        set({
          editorProject: { ...p, clips: next, updatedAt: Date.now() },
        });
      },
      editorUpdateClip: (clipId, patch) => {
        snapshotEditor();
        const p = get().editorProject;
        const updated = p.clips.map((c) =>
          c.id === clipId ? { ...c, ...patch } : c
        );
        set({
          editorProject: { ...p, clips: updated, updatedAt: Date.now() },
        });
      },
      editorClearClips: () => {
        snapshotEditor();
        const p = get().editorProject;
        set({
          editorProject: { ...p, clips: [], updatedAt: Date.now() },
        });
      },
      editorRenameProject: (name) => {
        // Renames are too noisy to be in the undo stack — skip snapshot.
        const p = get().editorProject;
        set({
          editorProject: { ...p, name, updatedAt: Date.now() },
        });
      },
      editorLoadProject: (project) => {
        // 全替换 —— 用于从片场导入剧本。先 snapshot 当前 project,
        // 让用户能 Cmd+Z 回到加载前的空白 editor。
        snapshotEditor();
        set({
          editorProject: { ...project, updatedAt: Date.now() },
        });
      },
      editorSetAspect: (aspect) => {
        snapshotEditor();
        const p = get().editorProject;
        set({ editorProject: { ...p, aspect, updatedAt: Date.now() } });
      },
      editorSetCrossfade: (sec) => {
        // Slider-driven; snapshot only on the leading edge to avoid stack spam.
        const p = get().editorProject;
        const clamped = Math.max(0, Math.min(2, sec));
        set({
          editorProject: {
            ...p,
            crossfadeSec: clamped,
            updatedAt: Date.now(),
          },
        });
      },
      editorSetExportHeight: (h) => {
        const p = get().editorProject;
        set({
          editorProject: {
            ...p,
            exportHeight: Math.max(360, Math.min(2160, Math.round(h))),
            updatedAt: Date.now(),
          },
        });
      },
      editorSetTimelineZoom: (pxPerSec) => {
        const p = get().editorProject;
        set({
          editorProject: {
            ...p,
            timelineZoom: Math.max(8, Math.min(400, pxPerSec)),
            updatedAt: Date.now(),
          },
        });
      },
      editorSetTransitionType: (t) => {
        snapshotEditor();
        const p = get().editorProject;
        set({
          editorProject: { ...p, transitionType: t, updatedAt: Date.now() },
        });
      },
      editorSetBgm: (bgm) => {
        snapshotEditor();
        const p = get().editorProject;
        set({
          editorProject: { ...p, bgm, updatedAt: Date.now() },
        });
      },
      editorSetLayout: (l) => {
        snapshotEditor();
        const p = get().editorProject;
        set({
          editorProject: { ...p, layout: l, updatedAt: Date.now() },
        });
      },
      editorSetSplitImage: (img) => {
        snapshotEditor();
        const p = get().editorProject;
        set({
          editorProject: { ...p, splitImage: img, updatedAt: Date.now() },
        });
      },
      editorSetSplitRatio: (r) => {
        const p = get().editorProject;
        set({
          editorProject: {
            ...p,
            splitRatio: Math.max(0.2, Math.min(0.8, r)),
            updatedAt: Date.now(),
          },
        });
      },
      editorSetClipStart: (clipId, startSec) => {
        const p = get().editorProject;
        const clamped = Math.max(0, startSec);
        const next = p.clips.map((c) =>
          c.id === clipId ? { ...c, startSec: clamped } : c
        );
        // No relayout — preserves absolute positioning of other clips.
        set({
          editorProject: { ...p, clips: next, updatedAt: Date.now() },
        });
      },
      editorUpdateTrack: (trackId, patch) => {
        snapshotEditor();
        const p = get().editorProject;
        const tracks = (p.tracks ?? DEFAULT_TRACKS).map((t) =>
          t.id === trackId ? { ...t, ...patch } : t
        );
        set({
          editorProject: { ...p, tracks, updatedAt: Date.now() },
        });
      },
      editorAddTrack: (kind) => {
        snapshotEditor();
        const p = get().editorProject;
        const tracks = p.tracks ?? [...DEFAULT_TRACKS];
        const existing = tracks.filter((t) => t.kind === kind);
        const prefix = kind === "video" ? "v" : "a";
        const nextNum = existing.length + 1;
        const newId = `${prefix}${nextNum}`;
        const label = `${prefix.toUpperCase()}${nextNum}`;
        const newTrack: EditorTrack = { id: newId, kind, label };
        set({
          editorProject: { ...p, tracks: [...tracks, newTrack], updatedAt: Date.now() },
        });
        return newId;
      },
      editorRemoveTrack: (trackId) => {
        snapshotEditor();
        const p = get().editorProject;
        const tracks = (p.tracks ?? [...DEFAULT_TRACKS]).filter((t) => t.id !== trackId);
        const clips = p.clips.filter((c) => (c.trackId ?? "v1") !== trackId);
        set({
          editorProject: { ...p, tracks, clips, updatedAt: Date.now() },
        });
      },
      editorRippleDelete: (clipId) => {
        const p = get().editorProject;
        const clip = p.clips.find((c) => c.id === clipId);
        if (!clip) return;
        const trackId = clip.trackId ?? "v1";
        const renderDur = Math.max(0.1, (clip.out - clip.in) / (clip.speed || 1));
        const removeAt = clip.startSec ?? 0;
        snapshotEditor();
        // 同轨 startSec > 被删 clip 起点的所有 clip 前移 renderDur
        // (跨轨不动 —— 多轨剪辑器的 ripple 默认只影响同轨;真要全轨 ripple
        // 是 "Ripple All Tracks" 一个独立操作,留给后续)
        const nextClips = p.clips
          .filter((c) => c.id !== clipId)
          .map((c) => {
            if ((c.trackId ?? "v1") !== trackId) return c;
            const cStart = c.startSec ?? 0;
            if (cStart > removeAt) {
              return { ...c, startSec: Math.max(0, cStart - renderDur) };
            }
            return c;
          });
        set({
          editorProject: { ...p, clips: nextClips, updatedAt: Date.now() },
        });
      },
      editorBatch: (fn) => {
        // 开头 snapshot 一次(把 batch 前的状态存进 undo stack),
        // fn 内的所有 mutation 跳过自己的 snapshotEditor,
        // 结束后清 flag。Cmd+Z 一次性回到 batch 前。
        snapshotEditor();
        _inEditorBatch = true;
        try {
          fn();
        } finally {
          _inEditorBatch = false;
        }
      },
      editorDuplicateClip: (clipId) => {
        const p = get().editorProject;
        const src = p.clips.find((c) => c.id === clipId);
        if (!src) return undefined;
        snapshotEditor();
        const newId = uid();
        const renderDur = (src.out - src.in) / (src.speed || 1);
        const duplicate: EditorClip = {
          ...src,
          id: newId,
          startSec: (src.startSec ?? 0) + renderDur,
        };
        const idx = p.clips.findIndex((c) => c.id === clipId);
        const next = [...p.clips];
        next.splice(idx + 1, 0, duplicate);
        set({ editorProject: { ...p, clips: next, updatedAt: Date.now() } });
        return newId;
      },
      editorMoveClipToTrack: (clipId, trackId, insertAfterClipId) => {
        snapshotEditor();
        const p = get().editorProject;
        const moving = p.clips.find((c) => c.id === clipId);
        if (!moving) return;
        // In absolute model: keep startSec when moving cross-track, unless
        // an insertAfter target is specified (then snap right after it).
        let nextStart = moving.startSec ?? 0;
        if (insertAfterClipId) {
          const after = p.clips.find((c) => c.id === insertAfterClipId);
          if (after && trackOf(after) === trackId) {
            nextStart = clipEndSec(after);
          }
        }
        const updated: EditorClip = { ...moving, trackId, startSec: nextStart };
        const next = p.clips.map((c) => (c.id === clipId ? updated : c));
        set({
          editorProject: { ...p, clips: next, updatedAt: Date.now() },
        });
      },
      editorUndo: () => {
        const s = get();
        const [prev, ...rest] = s.editorUndoStack;
        if (!prev) return;
        set({
          editorUndoStack: rest,
          editorRedoStack: [s.editorProject, ...s.editorRedoStack].slice(0, 50),
          editorProject: prev,
        });
      },
      editorRedo: () => {
        const s = get();
        const [next, ...rest] = s.editorRedoStack;
        if (!next) return;
        set({
          editorRedoStack: rest,
          editorUndoStack: [s.editorProject, ...s.editorUndoStack].slice(0, 50),
          editorProject: next,
        });
      },
      editorSplitClip: (clipId, atSec) => {
        const p = get().editorProject;
        const idx = p.clips.findIndex((c) => c.id === clipId);
        if (idx < 0) return undefined;
        const c = p.clips[idx];
        // Reject split at boundaries — needs both halves to have real content.
        if (atSec <= c.in + 0.05 || atSec >= c.out - 0.05) return undefined;
        snapshotEditor();
        const newId = uid();
        const first: EditorClip = { ...c, out: atSec };
        const second: EditorClip = {
          ...c,
          id: newId,
          in: atSec,
        };
        // Compute startSec for the second half so it begins exactly where
        // the first half ends (no gap).
        const firstStartSec = c.startSec ?? 0;
        const firstRenderDur = (atSec - c.in) / (c.speed || 1);
        const secondWithStart: EditorClip = {
          ...second,
          startSec: firstStartSec + firstRenderDur,
        };
        const firstWithStart: EditorClip = { ...first, startSec: firstStartSec };
        const next = [...p.clips];
        next.splice(idx, 1, firstWithStart, secondWithStart);
        set({ editorProject: { ...p, clips: next, updatedAt: Date.now() } });
        return newId;
      },

      /* ─────────── 片场 actions ─────────── */
      setCastProject: (patch) => {
        const p = get().castProject;
        set({ castProject: { ...p, ...patch, updatedAt: Date.now() } });
      },
      resetCastProject: () => {
        set({
          castProject: {
            id: "default",
            name: "未命名剧本",
            kind: "comic",
            cast: [],
            style: {},
            episodes: [
              { id: "ep-1", num: 1, title: "第 1 集", beats: [] },
            ],
            aspect: "9:16",
            updatedAt: Date.now(),
          },
        });
      },
      castAddEpisode: (title) => {
        const p = get().castProject;
        const maxNum = p.episodes.reduce((m, e) => Math.max(m, e.num), 0);
        const num = maxNum + 1;
        const id = `ep-${uid()}`;
        const ep: CastEpisode = {
          id,
          num,
          title: title ?? `第 ${num} 集`,
          beats: [],
        };
        set({
          castProject: { ...p, episodes: [...p.episodes, ep], updatedAt: Date.now() },
        });
        return id;
      },
      castRemoveEpisode: (epId) => {
        const p = get().castProject;
        // 保留至少一集 —— 删空状态会让 UI 没地方加 beat
        if (p.episodes.length <= 1) return;
        set({
          castProject: {
            ...p,
            episodes: p.episodes.filter((e) => e.id !== epId),
            updatedAt: Date.now(),
          },
        });
      },
      castUpdateEpisode: (epId, patch) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            episodes: p.episodes.map((e) =>
              e.id === epId ? { ...e, ...patch } : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      castAddBeat: (epId, init) => {
        const p = get().castProject;
        const ep = p.episodes.find((e) => e.id === epId);
        if (!ep) return "";
        const maxIdx = ep.beats.reduce((m, b) => Math.max(m, b.idx), 0);
        const id = `beat-${uid()}`;
        const beat: CastBeat = {
          id,
          idx: maxIdx + 1,
          kind: init?.kind ?? p.kind,
          text: init?.text ?? "",
          shotType: init?.shotType ?? (p.kind === "comic" ? "zoom-in" : "live"),
          imagePrompt: init?.imagePrompt,
          speakerId: init?.speakerId,
          durationSec: init?.durationSec ?? 4,
        };
        set({
          castProject: {
            ...p,
            episodes: p.episodes.map((e) =>
              e.id === epId ? { ...e, beats: [...e.beats, beat] } : e
            ),
            updatedAt: Date.now(),
          },
        });
        return id;
      },
      castRemoveBeat: (epId, beatId) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            episodes: p.episodes.map((e) =>
              e.id === epId
                ? {
                    ...e,
                    // 删除后重新编号,避免 idx 出现空洞
                    beats: e.beats
                      .filter((b) => b.id !== beatId)
                      .map((b, i) => ({ ...b, idx: i + 1 })),
                  }
                : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      castUpdateBeat: (epId, beatId, patch) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            episodes: p.episodes.map((e) =>
              e.id === epId
                ? {
                    ...e,
                    beats: e.beats.map((b) =>
                      b.id === beatId ? { ...b, ...patch } : b
                    ),
                  }
                : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      castMoveBeat: (epId, fromIdx, toIdx) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            episodes: p.episodes.map((e) => {
              if (e.id !== epId) return e;
              if (fromIdx < 1 || fromIdx > e.beats.length) return e;
              if (toIdx < 1 || toIdx > e.beats.length) return e;
              const arr = [...e.beats];
              const [moved] = arr.splice(fromIdx - 1, 1);
              arr.splice(toIdx - 1, 0, moved);
              // 重新编号
              return {
                ...e,
                beats: arr.map((b, i) => ({ ...b, idx: i + 1 })),
              };
            }),
            updatedAt: Date.now(),
          },
        });
      },
      castAddCharacter: (c) => {
        const p = get().castProject;
        const id = `char-${uid()}`;
        // 自动选个颜色 —— 8 色循环,UI 头像 chip 用
        // 暖色系(全局设计约束:禁电光紫/蓝)
  const PALETTE = ["#ff8a4c", "#ffd460", "#a3e635", "#3ddc97", "#e8a87c", "#ff5d8f", "#d4a24c", "#2dd4bf"];
        const color = c.color ?? PALETTE[p.cast.length % PALETTE.length];
        set({
          castProject: {
            ...p,
            cast: [...p.cast, { ...c, id, color }],
            updatedAt: Date.now(),
          },
        });
        return id;
      },
      castRemoveCharacter: (id) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            cast: p.cast.filter((c) => c.id !== id),
            // 清空所有 beat 上对此 character 的 speakerId 引用
            episodes: p.episodes.map((e) => ({
              ...e,
              beats: e.beats.map((b) =>
                b.speakerId === id ? { ...b, speakerId: undefined } : b
              ),
            })),
            updatedAt: Date.now(),
          },
        });
      },
      castUpdateCharacter: (id, patch) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            cast: p.cast.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            updatedAt: Date.now(),
          },
        });
      },
      castSetStyle: (patch) => {
        const p = get().castProject;
        set({
          castProject: {
            ...p,
            style: { ...p.style, ...patch },
            updatedAt: Date.now(),
          },
        });
      },
      castSetBgm: (bgm) => {
        const p = get().castProject;
        set({ castProject: { ...p, bgm, updatedAt: Date.now() } });
      },

      /* ─── Series v2 action implementations ─── */
      setSeries: (patch) => {
        const s = get().series;
        set({ series: { ...s, ...patch, updatedAt: Date.now() } });
      },
      // ── 多租户项目层 ──
      currentOrgId: null,
      currentProjectId: null,
      orgList: [],
      projectList: [],
      loadOrgs: async () => {
        const r = await fetch("/api/orgs");
        if (!r.ok) return;
        const orgs = (await r.json()) as { id: string; name: string }[];
        set({ orgList: orgs, currentOrgId: get().currentOrgId ?? orgs[0]?.id ?? null });
      },
      loadProjects: async () => {
        const orgId = get().currentOrgId;
        if (!orgId) return;
        const r = await fetch(`/api/projects?orgId=${encodeURIComponent(orgId)}`);
        if (!r.ok) return;
        set({ projectList: await r.json() });
      },
      openProject: async (id) => {
        const r = await fetch(`/api/projects/${id}`);
        if (!r.ok) return;
        const proj = await r.json();
        if (proj?.data?.series) {
          set({ series: proj.data.series, currentProjectId: id, activeEpId: proj.data.series.episodes?.[0]?.id ?? null });
        } else {
          // 空项目（新建）→ 全新空白剧本，不继承上个项目的内容
          get().resetSeries();
          set({ currentProjectId: id, activeEpId: get().series.episodes[0]?.id ?? null });
        }
      },
      newProject: async (name) => {
        const orgId = get().currentOrgId;
        if (!orgId) return null;
        const r = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, name }),
        });
        if (!r.ok) return null;
        const { id } = await r.json();
        await get().loadProjects();
        return id as string;
      },
      saveCurrentProject: async () => {
        const id = get().currentProjectId;
        if (!id) return;
        const series = get().series;
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { series }, name: series.name, kind: series.kind }),
        });
      },
      renameProject: async (id, name) => {
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        await get().loadProjects();
      },
      deleteProject: async (id) => {
        await fetch(`/api/projects/${id}`, { method: "DELETE" });
        if (get().currentProjectId === id) set({ currentProjectId: null });
        await get().loadProjects();
      },
      activeEpId: null,
      setActiveEp: (id) => set({ activeEpId: id }),
      resetSeries: () => {
        set({
          series: {
            id: `series-${uid()}`,
            name: "未命名剧本",
            kind: "comic",
            bible: [],
            episodes: [
              { id: `ep-${uid()}`, num: 1, title: "第 1 集", scenes: [{ id: `scene-${uid()}`, shots: [], castIds: [] }] },
            ],
            aspect: "9:16",
            updatedAt: Date.now(),
            _v: 2,
          },
        });
      },
      migrateIfNeeded: () => {
        const s = get().series;
        if (s._v === 2) return;
        const cp = get().castProject;
        if (cp.episodes.length > 0 || cp.cast.length > 0) {
          set({ series: migrateCastToSeries(cp) });
        }
      },
      seriesAddEpisode: (title) => {
        const s = get().series;
        const maxNum = s.episodes.reduce((m, e) => Math.max(m, e.num), 0);
        const num = maxNum + 1;
        const id = `ep-${uid()}`;
        const ep: StageEpisode = {
          id, num, title: title ?? `第 ${num} 集`,
          scenes: [{ id: `scene-${uid()}`, shots: [], castIds: [] }],
        };
        set({ series: { ...s, episodes: [...s.episodes, ep], updatedAt: Date.now() } });
        return id;
      },
      seriesRemoveEpisode: (epId) => {
        const s = get().series;
        if (s.episodes.length <= 1) return;
        const eps = s.episodes.filter((e) => e.id !== epId);
        set({
          series: { ...s, episodes: eps, updatedAt: Date.now() },
          // 删掉的若是当前活动集，重置到剩余第 1 集，避免 activeEpId 指向已删集
          activeEpId: get().activeEpId === epId ? (eps[0]?.id ?? null) : get().activeEpId,
        });
      },
      seriesUpdateEpisode: (epId, patch) => {
        const s = get().series;
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) => e.id === epId ? { ...e, ...patch } : e),
            updatedAt: Date.now(),
          },
        });
      },
      seriesAddScene: (epId, init) => {
        const s = get().series;
        const id = `scene-${uid()}`;
        const scene: StageScene = { id, shots: [], castIds: [], ...init };
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) =>
              e.id === epId ? { ...e, scenes: [...e.scenes, scene] } : e
            ),
            updatedAt: Date.now(),
          },
        });
        return id;
      },
      seriesRemoveScene: (epId, sceneId) => {
        const s = get().series;
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) =>
              e.id === epId ? { ...e, scenes: e.scenes.filter((sc) => sc.id !== sceneId) } : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      seriesUpdateScene: (epId, sceneId, patch) => {
        const s = get().series;
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) =>
              e.id === epId
                ? { ...e, scenes: e.scenes.map((sc) => sc.id === sceneId ? { ...sc, ...patch } : sc) }
                : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      seriesAddShot: (epId, sceneId, init) => {
        const s = get().series;
        const ep = s.episodes.find((e) => e.id === epId);
        const scene = ep?.scenes.find((sc) => sc.id === sceneId);
        if (!scene) return "";
        const maxIdx = scene.shots.reduce((m, sh) => Math.max(m, sh.idx), 0);
        const id = `shot-${uid()}`;
        const shot: StageShot = {
          shotType: init?.shotType ?? (s.kind === "comic" ? "zoom-in" : "live"),
          narration: init?.narration ?? "",
          elementRefs: init?.elementRefs ?? [],
          durationSec: init?.durationSec ?? 4,
          ...init,
          id,
          idx: maxIdx + 1,
        };
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) =>
              e.id === epId
                ? { ...e, scenes: e.scenes.map((sc) =>
                    sc.id === sceneId ? { ...sc, shots: [...sc.shots, shot] } : sc
                  ) }
                : e
            ),
            updatedAt: Date.now(),
          },
        });
        return id;
      },
      seriesRemoveShot: (epId, sceneId, shotId) => {
        const s = get().series;
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) =>
              e.id === epId
                ? { ...e, scenes: e.scenes.map((sc) =>
                    sc.id === sceneId
                      ? { ...sc, shots: sc.shots.filter((sh) => sh.id !== shotId).map((sh, i) => ({ ...sh, idx: i + 1 })) }
                      : sc
                  ) }
                : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      seriesUpdateShot: (epId, sceneId, shotId, patch) => {
        const s = get().series;
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) =>
              e.id === epId
                ? { ...e, scenes: e.scenes.map((sc) =>
                    sc.id === sceneId
                      ? { ...sc, shots: sc.shots.map((sh) => sh.id === shotId ? { ...sh, ...patch } : sh) }
                      : sc
                  ) }
                : e
            ),
            updatedAt: Date.now(),
          },
        });
      },
      seriesMoveShot: (epId, sceneId, fromIdx, toIdx) => {
        const s = get().series;
        set({
          series: {
            ...s,
            episodes: s.episodes.map((e) => {
              if (e.id !== epId) return e;
              return {
                ...e,
                scenes: e.scenes.map((sc) => {
                  if (sc.id !== sceneId) return sc;
                  if (fromIdx < 1 || fromIdx > sc.shots.length) return sc;
                  if (toIdx < 1 || toIdx > sc.shots.length) return sc;
                  const arr = [...sc.shots];
                  const [moved] = arr.splice(fromIdx - 1, 1);
                  arr.splice(toIdx - 1, 0, moved);
                  return { ...sc, shots: arr.map((sh, i) => ({ ...sh, idx: i + 1 })) };
                }),
              };
            }),
            updatedAt: Date.now(),
          },
        });
      },
      seriesAddElement: (e) => {
        const s = get().series;
        const id = `${e.kind}-${uid()}`;
        // 暖色系(全局设计约束:禁电光紫/蓝)
  const PALETTE = ["#ff8a4c", "#ffd460", "#a3e635", "#3ddc97", "#e8a87c", "#ff5d8f", "#d4a24c", "#2dd4bf"];
        const color = e.color ?? PALETTE[s.bible.length % PALETTE.length];
        set({
          series: { ...s, bible: [...s.bible, { ...e, id, color }], updatedAt: Date.now() },
        });
        return id;
      },
      seriesRemoveElement: (id) => {
        const s = get().series;
        set({
          series: {
            ...s,
            bible: s.bible.filter((el) => el.id !== id),
            episodes: s.episodes.map((ep) => ({
              ...ep,
              scenes: ep.scenes.map((sc) => ({
                ...sc,
                castIds: sc.castIds.filter((cid) => cid !== id),
                shots: sc.shots.map((sh) => ({
                  ...sh,
                  elementRefs: sh.elementRefs.filter((r) => r !== id),
                  dialogue: sh.dialogue?.map((d) =>
                    d.speakerId === id ? { ...d, speakerId: undefined } : d
                  ),
                })),
              })),
            })),
            updatedAt: Date.now(),
          },
        });
      },
      seriesUpdateElement: (id, patch) => {
        const s = get().series;
        set({
          series: {
            ...s,
            bible: s.bible.map((el) => el.id === id ? { ...el, ...patch } : el),
            updatedAt: Date.now(),
          },
        });
      },
      seriesSetBgm: (bgm) => {
        const s = get().series;
        set({ series: { ...s, bgm, updatedAt: Date.now() } });
      },

      pushUndo: (entry) => {
        // Bounded to last 10 so the array can't balloon forever.
        const next = [entry, ...get().undoStack].slice(0, 10);
        set({ undoStack: next });
      },
      popUndo: () => {
        const s = get().undoStack;
        if (s.length === 0) return undefined;
        const [top, ...rest] = s;
        set({ undoStack: rest });
        return top;
      },

      createManualWork: (input) => {
        const id = uid();
        const now = Date.now();
        const job: Job = {
          id,
          title: input.title.trim() || "Untitled import",
          modelId: input.modelId?.trim() || "external",
          mode: input.mode ?? "t2v",
          params: input.durationSec
            ? { duration: input.durationSec }
            : {},
          media: {},
          prompt: input.prompt?.trim() || undefined,
          status: "done",
          videoUrl: input.videoUrl.trim(),
          createdAt: now,
          completedAt: now,
          published: input.publish ?? true,
          source: "manual",
          sourceLabel: input.sourceLabel?.trim() || undefined,
          localKey: input.localKey,
          localMime: input.localMime,
        };
        set({ jobs: [job, ...get().jobs] });
        return id;
      },

      importWorksFromJson: (raw) => {
        try {
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr))
            return { added: 0, skipped: 0, error: "Expected JSON array" };
          const existingIds = new Set(get().jobs.map((j) => j.id));
          let added = 0;
          let skipped = 0;
          const incoming: Job[] = [];
          for (const raw of arr as Array<Record<string, unknown>>) {
            const videoUrl =
              typeof raw.videoUrl === "string" ? raw.videoUrl : undefined;
            if (!videoUrl) {
              skipped++;
              continue;
            }
            const id =
              typeof raw.id === "string" && !existingIds.has(raw.id)
                ? raw.id
                : uid();
            if (existingIds.has(id)) {
              skipped++;
              continue;
            }
            existingIds.add(id);
            const createdAt =
              typeof raw.createdAt === "string"
                ? new Date(raw.createdAt).getTime() || Date.now()
                : typeof raw.createdAt === "number"
                  ? raw.createdAt
                  : Date.now();
            const completedAt =
              typeof raw.completedAt === "string"
                ? new Date(raw.completedAt).getTime() || undefined
                : typeof raw.completedAt === "number"
                  ? raw.completedAt
                  : undefined;
            incoming.push({
              id,
              title:
                typeof raw.title === "string" ? raw.title : "Imported entry",
              modelId:
                typeof raw.modelId === "string" ? raw.modelId : "external",
              mode: (raw.mode as Mode) || "t2v",
              params:
                typeof raw.params === "object" && raw.params
                  ? (raw.params as Record<string, unknown>)
                  : {},
              media: {},
              prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
              negativePrompt:
                typeof raw.negativePrompt === "string"
                  ? raw.negativePrompt
                  : undefined,
              status: "done",
              videoUrl,
              createdAt,
              completedAt,
              published: raw.published === true,
              source: "imported",
            });
            added++;
          }
          set({ jobs: [...incoming, ...get().jobs] });
          return { added, skipped };
        } catch (e) {
          return {
            added: 0,
            skipped: 0,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      },

      loadExternalPromptIntoDraft: (prompt, negativePrompt) => {
        const d = get().draft;
        set({
          draft: {
            ...d,
            prompt: prompt.trim(),
            negativePrompt: negativePrompt?.trim() || d.negativePrompt,
          },
        });
      },

      resetAll: () =>
        set({
          jobs: [],
          draft: newDraft("t2v"),
          activeJobId: undefined,
          compareSet: [],
          savedPrompts: [],
          paneWidths: { jobs: 280, params: 400 },
          castProject: {
            id: "default",
            name: "未命名剧本",
            kind: "comic",
            cast: [],
            style: {},
            episodes: [
              { id: "ep-1", num: 1, title: "第 1 集", beats: [] },
            ],
            aspect: "9:16",
            updatedAt: Date.now(),
          },
        }),
      };
    },
    {
      name: "frame-0:bailian",
      version: 5,
      // v3: removed `videoedit` mode — migrate any persisted draft/job back to t2v.
      // v4: added `startSec` to clips. Sequential layout backfill on first load.
      // v5: stop persisting editorProject — blob: URLs die across sessions.
      migrate: (persisted: unknown, fromVersion: number) => {
        const s = persisted as {
          draft?: { mode?: string };
          jobs?: Array<{ mode?: string }>;
          editorProject?: { clips?: EditorClip[] };
        } | null;
        if (!s) return s;
        if (fromVersion < 3) {
          if (s.draft?.mode === "videoedit") s.draft.mode = "t2v";
          if (Array.isArray(s.jobs)) {
            for (const j of s.jobs) {
              if (j.mode === "videoedit") j.mode = "t2v";
            }
          }
        }
        if (fromVersion < 4) {
          if (s.editorProject?.clips && Array.isArray(s.editorProject.clips)) {
            s.editorProject.clips = relayoutAllTracks(s.editorProject.clips);
          }
        }
        if (fromVersion < 5) {
          // editorProject is ephemeral — blob: URLs die across sessions.
          // Drop it so editor opens clean.
          delete s.editorProject;
        }
        return s;
      },
      storage: createJSONStorage(() => hybridStorage()),
      partialize: (s) =>
        ({
          jobs: s.jobs.map((j) => ({
            ...j,
            media: stripForStorage(j.media),
          })),
          draft: { ...s.draft, media: stripForStorage(s.draft.media) },
          activeJobId: s.activeJobId,
          compareSet: s.compareSet,
          savedPrompts: s.savedPrompts,
          customPresets: s.customPresets,
          deletedTaskIds: s.deletedTaskIds,
          paneWidths: s.paneWidths,
          apiKeys: s.apiKeys,
          discount: s.discount,
          discoverCache: s.discoverCache,
          // castProject 持久化 —— 剧本文字 / 角色册 / jobId 引用都很轻,
          // 媒体 URL 不存在 beat 上(只存 jobId,从 persist 的 jobs 反查),
          // 跨 session 安全。用户的剧本不能丢。
          castProject: s.castProject,
          // series (片场 v2) 同理 —— 场景/镜头/角色册都是文字级数据
          series: s.series,
          // 多租户：记住上次打开的组织/项目（登录后据此恢复）
          currentOrgId: s.currentOrgId,
          currentProjectId: s.currentProjectId,
          activeEpId: s.activeEpId,
          // editorProject 是 ephemeral session 工具，不持久化 ——
          // blob: URL 跨 session 失效会残留 dead clips，每次打开 editor 应从空白开始。
          // undoStack / editorUndoStack / editorRedoStack 是内存态，不持久化。
        }) as Partial<State>,
    }
  )
);

/* ─────────── re-exports ─────────── */

export { MODELS };
