"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { confirmDialog } from "@/components/ui/Dialog";
import { useLocale } from "next-intl";
import {
  useStudioStore,
  type EditorClip,
  type EditorTrack,
  type Job,
  DEFAULT_TRACKS,
} from "@/lib/store";
import LocaleSwitcher from "./LocaleSwitcher";
import {
  renderProject,
  probeDuration,
  dimsFor,
  formatCaptionText,
  type RenderProgress,
} from "@/lib/editor/renderProject";
import { usePlayback } from "@/lib/editor/playback";
import {
  storeLocalFile,
  readLocalFile,
  deleteLocalFile,
} from "@/lib/editor/localFiles";
import { useJobAutoBackup } from "@/lib/bailian/useJobAutoBackup";
import { useStateBackup } from "@/lib/bailian/useStateBackup";
import {
  IcoScissors, IcoBracketIn, IcoBracketOut, IcoUndo, IcoRedo,
  IcoSkipBack, IcoPlay, IcoPause, IcoFrameBack, IcoFrameFwd,
  IcoLock, IcoUnlock, IcoEye, IcoEyeOff, IcoVolOn, IcoVolOff,
  IcoSolo, IcoClose,
} from "./editor/icons";
import { TimelineClipBlock } from "./editor/TimelineClip";
import { ClipInspector } from "./editor/Inspector";
import TTSPanel from "./editor/TTSPanel";
import LazyVideoThumb from "./studio/LazyVideoThumb";
import "@/styles/frame.css";

function fmtTime(s: number): string {
  if (!isFinite(s)) return "00:00.0";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
}

function isWasmMemoryError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /memory access out of bounds|out of memory|wasm memory|abort/i.test(msg);
}

/** 快捷键面板的 group 容器 */
function SCGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sc-group">
      <div className="sc-group-title">{title}</div>
      <div className="sc-group-body">{children}</div>
      <style jsx>{`
        .sc-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sc-group-title {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--paper-mute);
          padding-bottom: 6px;
          border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
        }
        .sc-group-body {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
      `}</style>
    </div>
  );
}

/** 快捷键面板的 单条 item:左侧 kbd chips + 右侧 desc */
function SCItem({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="sc-item">
      <div className="sc-keys">
        {keys.map((k, i) => (
          <kbd key={i} className="sc-kbd">{k}</kbd>
        ))}
      </div>
      <div className="sc-desc">{desc}</div>
      <style jsx>{`
        .sc-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 0;
        }
        .sc-keys {
          display: inline-flex;
          gap: 3px;
          flex-shrink: 0;
          min-width: 88px;
        }
        :global(.sc-kbd) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--ink-3) 60%, var(--ink-2)) 0%,
            var(--ink-2) 100%);
          border: 1px solid color-mix(in oklab, var(--paper) 12%, var(--line));
          border-bottom-width: 2px;
          border-radius: 5px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 700;
          color: var(--paper);
          letter-spacing: 0;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .sc-desc {
          font-family: var(--font-sans);
          font-size: 12.5px;
          color: var(--paper-dim);
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}

/** NLE 标准 JKL 速度环 —— L 升一档,J 降一档,K 复位 1。
 *  ladder 设计:正常 1x 在中间,左侧慢速 / 右侧快速。
 *  Index 3 是 1x(LADDER_NORMAL_IDX)。 */
const SPEED_LADDER = [0.1, 0.25, 0.5, 1, 1.5, 2, 4, 8] as const;
const LADDER_NORMAL_IDX = 3; // SPEED_LADDER[3] === 1

/** 多素材布局快捷预设 —— 一键把 V1/V2/V3 active clip 摆到常见拼接位置。
 *  null = 清掉这条轨的 pip(回到默认行为:V1 占满 / V2-V3 隐藏除非有 active)
 *  undefined = 不动这条轨。
 *
 *  pip 坐标:`x,y` 是 wrap 中心在父画布的归一化位置(0-1);
 *  `scale` 是 wrap 宽度占父画布宽度的比例(aspectRatio 自动算 height)。 */
type LayoutPipState = { x: number; y: number; scale: number };
type LayoutPresetSpec = {
  id: string;
  labelZh: string;
  labelEn: string;
  v1?: LayoutPipState | null;
  v2?: LayoutPipState | null;
  v3?: LayoutPipState | null;
};
const LAYOUT_PRESETS: LayoutPresetSpec[] = [
  {
    id: "reset",
    labelZh: "复位 · V1 占满",
    labelEn: "Reset · V1 fullscreen",
    v1: null,
    v2: null,
    v3: null,
  },
  {
    id: "pip-tr",
    labelZh: "经典 PiP · 右上小窗",
    labelEn: "Classic PiP · top-right",
    v1: null,
    v2: { x: 0.78, y: 0.22, scale: 0.28 },
  },
  {
    id: "pip-bl",
    labelZh: "PiP · 左下小窗",
    labelEn: "PiP · bottom-left",
    v1: null,
    v2: { x: 0.22, y: 0.78, scale: 0.28 },
  },
  {
    id: "split-h",
    labelZh: "左右分屏 · V1 左 / V2 右",
    labelEn: "Split L/R · V1 left / V2 right",
    v1: { x: 0.25, y: 0.5, scale: 0.5 },
    v2: { x: 0.75, y: 0.5, scale: 0.5 },
  },
  {
    id: "split-v",
    labelZh: "上下分屏 · V1 上 / V2 下",
    labelEn: "Split T/B · V1 top / V2 bottom",
    v1: { x: 0.5, y: 0.25, scale: 0.6 },
    v2: { x: 0.5, y: 0.75, scale: 0.6 },
  },
  {
    id: "triple-right",
    labelZh: "三分屏 · V1 大主 + V2 V3 侧栏",
    labelEn: "Triple · V1 main + V2/V3 sidebar",
    v1: { x: 0.25, y: 0.5, scale: 0.5 },
    v2: { x: 0.75, y: 0.25, scale: 0.5 },
    v3: { x: 0.75, y: 0.75, scale: 0.5 },
  },
  {
    id: "grid-3",
    labelZh: "四宫格(三视频 + 一空格)",
    labelEn: "Grid 2×2 (3 videos)",
    v1: { x: 0.25, y: 0.25, scale: 0.5 },
    v2: { x: 0.75, y: 0.25, scale: 0.5 },
    v3: { x: 0.25, y: 0.75, scale: 0.5 },
  },
  {
    id: "center-overlay",
    labelZh: "居中覆盖 · V1 背景 + V2 中央卡片",
    labelEn: "Center card · V1 BG + V2 centered",
    v1: null,
    v2: { x: 0.5, y: 0.5, scale: 0.55 },
  },
];

/** 两个 pip 是否近似相等 —— 0.02 容差(2%),让微小拖拽偏离也能识别为同 preset。 */
function pipEqual(
  a: LayoutPipState | null | undefined,
  b: LayoutPipState | null | undefined
): boolean {
  const aDef = a ?? undefined;
  const bDef = b ?? undefined;
  if (!aDef && !bDef) return true;
  if (!aDef || !bDef) return false;
  return (
    Math.abs(aDef.x - bDef.x) < 0.02 &&
    Math.abs(aDef.y - bDef.y) < 0.02 &&
    Math.abs(aDef.scale - bDef.scale) < 0.02
  );
}

/** 检测当前 V1/V2/V3 pip 状态匹配哪个 preset。
 *  匹配:返回 preset id;不匹配任何 preset(用户手动拖拽过):返回 "custom"。 */
function detectCurrentLayout(
  v1Pip: LayoutPipState | undefined,
  v2Pip: LayoutPipState | undefined,
  v3Pip: LayoutPipState | undefined
): string {
  for (const preset of LAYOUT_PRESETS) {
    if (
      pipEqual(preset.v1, v1Pip) &&
      pipEqual(preset.v2, v2Pip) &&
      pipEqual(preset.v3, v3Pip)
    ) {
      return preset.id;
    }
  }
  return "custom";
}

/** 找当前 rate 在 ladder 中的最近 idx —— 处理用户用 Inspector 设了非 ladder 值
 *  后再按 JKL 的情况。 */
function SPEED_LADDER_IDX(rate: number): number {
  let best = LADDER_NORMAL_IDX;
  let bestDist = Infinity;
  for (let i = 0; i < SPEED_LADDER.length; i++) {
    const d = Math.abs(SPEED_LADDER[i] - rate);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** 轨道角色信息 —— 把抽象的 V1/V2/A1 翻译成新手能懂的角色名 + 用途说明。
 *  新手看到 "V1/V2/V3/A1/A2" 完全不知道每条干嘛,所以:
 *    - badge 显示语义名("主视频"/"覆盖 1"/"原声"/"配乐")
 *    - 边上小字保留 V1/V2 代号做参考
 *    - 头部 title 显示一句话用途
 *    - 空轨 dropzone 显示具体能放什么 */
function trackRoleInfo(
  track: EditorTrack,
  zh: boolean
): { code: string; name: string; desc: string; dropHint: string } {
  const ZH: Record<string, { name: string; desc: string; dropHint: string }> = {
    v1: {
      name: "主视频",
      desc: "主轨 · 视频/图片按时间顺序排列,占满画面",
      dropHint: "拖入视频或图片开始剪辑",
    },
    v2: {
      name: "覆盖 1",
      desc: "覆盖轨 · 叠加在主视频上方(画中画 / 贴片 / Logo)",
      dropHint: "拖入素材叠加到主视频上方,可在右侧设位置和缩放",
    },
    v3: {
      name: "覆盖 2",
      desc: "再叠一层 · 在覆盖 1 之上,层级最高",
      dropHint: "再叠一层素材(在覆盖 1 上方)",
    },
    a1: {
      name: "原声",
      desc: "音频轨 1 · 通常放视频原声 / 配音 / 旁白",
      dropHint: "拖入音频文件 / 视频原声会自动放这里",
    },
    a2: {
      name: "配乐",
      desc: "音频轨 2 · 通常放 BGM / 音效",
      dropHint: "拖入背景音乐或音效",
    },
  };
  const EN: Record<string, { name: string; desc: string; dropHint: string }> = {
    v1: {
      name: "Main",
      desc: "Main track · video sequential, fills frame",
      dropHint: "Drop video or image to start",
    },
    v2: {
      name: "Overlay 1",
      desc: "Overlay · layered above Main (PiP / stickers / logo)",
      dropHint: "Drop to overlay on Main · adjust position / scale on the right",
    },
    v3: {
      name: "Overlay 2",
      desc: "Top overlay · above Overlay 1",
      dropHint: "Drop on top layer",
    },
    a1: {
      name: "Voice",
      desc: "Audio 1 · typically voiceover / dialog",
      dropHint: "Drop audio file (video's native audio lands here)",
    },
    a2: {
      name: "BGM",
      desc: "Audio 2 · typically background music / SFX",
      dropHint: "Drop background music or sound effects",
    },
  };
  const dict = zh ? ZH : EN;
  const found = dict[track.id];
  if (found) return { code: track.label, ...found };
  // 兜底:用户自定义轨道(未来扩展)
  return {
    code: track.label,
    name: track.label,
    desc: "",
    dropHint: zh ? "拖入素材" : "Drop media",
  };
}

/** 轨道工具图标的 hover 说明 —— title 属性比起 "锁定" / "Lock",
 *  写"动作 · 效果"两段式更教育性。新手 hover 时直接看到能做什么。 */
function trackIconHint(
  kind: "lock" | "hide" | "mute" | "solo",
  active: boolean,
  isAudio: boolean,
  zh: boolean
): string {
  if (zh) {
    switch (kind) {
      case "lock":
        return active
          ? "已锁定 · 点击解锁(锁定时本轨片段不能移动 / 裁剪 / 删除)"
          : "锁定 · 防止本轨片段被误编辑";
      case "hide":
        if (isAudio) {
          return active
            ? "已从输出剔除 · 点击恢复(预览仍可听,导出不含此轨)"
            : "从输出剔除 · 预览仍可听,但导出时不包含此轨";
        }
        return active
          ? "已隐藏 · 点击显示(预览和导出都看不见)"
          : "隐藏 · 预览和导出都不显示此轨";
      case "mute":
        return active
          ? "已静音 · 点击恢复(预览不出声,导出仍包含)"
          : "静音 · 预览时不出声(导出仍包含;要从导出剔除用 👁)";
      case "solo":
        return active
          ? "独奏中 · 点击退出(只播此轨,其它轨静音)"
          : "独奏 · 只播此轨,其它静音(快速对比单轨效果)";
    }
  } else {
    switch (kind) {
      case "lock":
        return active
          ? "Locked · click to unlock (clips can't be moved/trimmed/deleted)"
          : "Lock · prevent clips on this track from being edited";
      case "hide":
        if (isAudio) {
          return active
            ? "Excluded from output · click to restore (still audible in preview, omitted from export)"
            : "Exclude from output · preview still plays, export omits this track";
        }
        return active
          ? "Hidden · click to show (invisible in preview and export)"
          : "Hide · don't show in preview or export";
      case "mute":
        return active
          ? "Muted · click to unmute (silent in preview, still included in export)"
          : "Mute · silence in preview only (export still includes; for export use 👁)";
      case "solo":
        return active
          ? "Solo on · click to exit (only this track plays)"
          : "Solo · play only this track (silence the rest, useful for A/B)";
    }
  }
  return "";
}

function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      if (duration > 0) resolve(duration);
      else reject(new Error("Could not read audio duration"));
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Could not load audio"));
    };
    audio.src = url;
  });
}

export default function Editor() {
  // Auto-back-up done jobs to IndexedDB so OSS-expired videos still play.
  useJobAutoBackup();
  useStateBackup();
  const locale = useLocale();
  const zh = locale === "zh";
  const homeHref = zh ? "/" : "/en";
  const helpHref = zh ? "/help" : "/en/help";

  const jobs = useStudioStore((s) => s.jobs);
  const project = useStudioStore((s) => s.editorProject);
  const addClip = useStudioStore((s) => s.editorAddClip);
  const splitClip = useStudioStore((s) => s.editorSplitClip);
  const setAspect = useStudioStore((s) => s.editorSetAspect);
  const setCrossfade = useStudioStore((s) => s.editorSetCrossfade);
  const removeClip = useStudioStore((s) => s.editorRemoveClip);
  const rippleDeleteClip = useStudioStore((s) => s.editorRippleDelete);
  const editorBatch = useStudioStore((s) => s.editorBatch);
  const moveClip = useStudioStore((s) => s.editorMoveClip);
  const reorderClip = useStudioStore((s) => s.editorReorderClip);
  const updateClip = useStudioStore((s) => s.editorUpdateClip);
  const clearClips = useStudioStore((s) => s.editorClearClips);
  const renameProject = useStudioStore((s) => s.editorRenameProject);
  const setExportHeight = useStudioStore((s) => s.editorSetExportHeight);
  const setTimelineZoom = useStudioStore((s) => s.editorSetTimelineZoom);
  const setTransitionType = useStudioStore((s) => s.editorSetTransitionType);
  const setBgm = useStudioStore((s) => s.editorSetBgm);
  const setLayout = useStudioStore((s) => s.editorSetLayout);
  const setSplitImage = useStudioStore((s) => s.editorSetSplitImage);
  const setSplitRatio = useStudioStore((s) => s.editorSetSplitRatio);
  const setClipStart = useStudioStore((s) => s.editorSetClipStart);
  const updateTrack = useStudioStore((s) => s.editorUpdateTrack);
  const addTrack = useStudioStore((s) => s.editorAddTrack);
  const removeTrack = useStudioStore((s) => s.editorRemoveTrack);
  const moveClipToTrack = useStudioStore((s) => s.editorMoveClipToTrack);
  const duplicateClip = useStudioStore((s) => s.editorDuplicateClip);
  const editorUndo = useStudioStore((s) => s.editorUndo);
  const editorRedo = useStudioStore((s) => s.editorRedo);
  const undoStackLen = useStudioStore((s) => s.editorUndoStack.length);
  const redoStackLen = useStudioStore((s) => s.editorRedoStack.length);

  // Defensive defaults — Zustand persisted state may lack newly-added fields
  const pAspect = project.aspect ?? "16:9";
  const pCrossfade = project.crossfadeSec ?? 0;
  const pExportH = project.exportHeight ?? 1080;
  const pTransition = project.transitionType ?? "fade";
  const pLayout = project.layout ?? "single";
  const pZoom = project.timelineZoom ?? 80;
  const pName = project.name || "Untitled Reel";
  const pSplitRatio = project.splitRatio ?? 0.5;
  const pTracks: EditorTrack[] = project.tracks ?? DEFAULT_TRACKS;
  const pTrackById = useMemo(() => new Map(pTracks.map((track) => [track.id, track])), [pTracks]);
  const firstVideoTrackId = pTracks.find((track) => track.kind === "video")?.id ?? "v1";
  const firstAudioTrackId = pTracks.find((track) => track.kind === "audio")?.id ?? "a1";
  /** Width of the sticky track-head column (V1/V2/A1 labels). */
  const TH = 96;

  const allClips = project.clips;
  const captionCount = useMemo(
    () => allClips.filter((c) => c.text?.content?.trim()).length,
    [allClips]
  );
  // V1 = primary playable track. Other tracks store clips visually but
  // current playback engine is sequential single-track.
  const clips = allClips.filter((c) => (c.trackId ?? "v1") === "v1");
  const videoClips = allClips.filter((c) => {
    const track = pTrackById.get(c.trackId ?? "v1");
    return (track?.kind ?? "video") === "video";
  });

  /**
   * 渐进式 UI 等级:
   *   L0 - 空时间线,仅展示中央 dropzone(introDismissed=false)
   *   L2 - 一旦进入工作态,默认全功能展开(多轨 + 转场 + 比例切换 + Inspector
   *        全部控件 + BGM 等)。专业剪辑器 CapCut/DaVinci 都是功能默认全在,
   *        通过 Inspector 分组折叠 + 工具栏快捷入口控制视觉密度,而不是用
   *        "切档"开关藏起来。
   *
   * 历史:之前有 L1/L2 分级 + 顶部 "⚙ 高级" 开关,用户反馈"高级功能藏在
   *      开关后不直觉",删掉了。`editorLevel` 变量保留(组件仍按它分支),
   *      永远 = 2。
   *
   * introDismissed:每次进入 /editor 默认为 false → 即使 store 里残留上次
   * 项目,UI 也强制 L0 显示中央 dropzone(专业剪辑器都是这样的"新建/打开"
   * 心智模型)。dropzone 顶部给个"恢复 N 条 · 总时长 X"按钮,让用户显式
   * 选择是否回到老工作;任何拖入 / 点击素材都会自动 dismiss + 清空开新项目。
   */
  const editorLevel = 2 as const;

  // Tool bar state — pointer is default; split mode turns clip click into split-at-playhead.
  const [tool, setTool] = useState<"pointer" | "split" | "blade">("pointer");
  const [snapEnabled, setSnapEnabled] = useState(true);

  /** Per-track clip lists, ordered by index in project.clips. */
  const clipsByTrack = pTracks.reduce<Record<string, EditorClip[]>>((acc, t) => {
    acc[t.id] = allClips.filter((c) => (c.trackId ?? "v1") === t.id);
    return acc;
  }, {});

  const [selectedId, setSelectedId] = useState<string | undefined>(
    allClips[0]?.id
  );
  /** 多选集合 —— `selectedId` 是"primary"(Inspector 显示它的属性 / 上下移
   *  锚点),`selectedIds` 是全部选中(包括 primary)。
   *
   *  单选场景(普通 click):selectedIds = { primaryId }
   *  多选场景(Shift+click / 橡皮筋):selectedIds 含多个,primary 是 last clicked
   *  批量操作(Del / Cmd+D / Shift+Del):若 size>1 用 editorBatch 合并 undo */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => (allClips[0] ? new Set([allClips[0].id]) : new Set())
  );

  /** 普通 click —— 单选:替换整个 selectedIds + 同步 primary */
  const selectSingle = useCallback((id: string | undefined) => {
    setSelectedId(id);
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);

  /** Shift+click —— 多选 toggle:已在则移除,不在则加入。primary 跟着 last clicked。
   *  若 toggle 后变空,保留这个 id(避免误操作清空) */
  const toggleMultiSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) next.add(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectedId(id);
  }, []);

  /** 橡皮筋框选状态 —— 在 .ed-tl-content 空白处 pointerdown 启动,
   *  pointermove 更新当前位置,pointerup 时 bbox 测试覆盖的 clip → 更新 selectedIds。
   *  Shift+drag 累加(保留 marqueeStartIds);普通 drag 替换。 */
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const marqueeStartIdsRef = useRef<Set<string>>(new Set());

  /** 快捷键面板 —— `?` 键弹出,Esc / 点 backdrop 关闭。专业产品标配 */
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);

  /** Blade 工具 hover 状态 —— 实时跟随鼠标显示"这里下刀"竖线;切完后短暂 flash */
  const [bladeHoverSec, setBladeHoverSec] = useState<number | null>(null);
  const [bladeFlashSec, setBladeFlashSec] = useState<number | null>(null);
  const bladeFlashTimerRef = useRef<number | null>(null);
  /** Blade hover 缩略图预览 —— 独立 video 元素 seek 到 hover 时间点,显示帧 */
  const bladePreviewRef = useRef<HTMLVideoElement>(null);

  /** 预览 vs 时间线 高度比 —— 默认 3.2(预览 ~76% / 时间线 ~24%)。
   *  视频是主角,底部剪辑区只够展示轨道、不抢戏。
   *  用户可拖 splitter 改;localStorage 持久化(v3 key,避免旧默认值卡住)。 */
  const [previewFlex, setPreviewFlex] = useState<number>(() => {
    if (typeof window === "undefined") return 3.2;
    const saved = window.localStorage.getItem("ed-preview-flex-v3");
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n > 0.3 && n < 10 ? n : 3.2;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ed-preview-flex-v3", String(previewFlex));
  }, [previewFlex]);

  /** Blade hover scrubbing preview —— 在 blade 模式下,当鼠标移到 timeline,
   *  独立 video 元素 seek 到对应源时间,显示该帧。让用户在切之前就看到"切在哪一帧"。 */
  useEffect(() => {
    if (tool !== "blade" || bladeHoverSec === null) return;
    const el = bladePreviewRef.current;
    if (!el) return;
    // 找 hoverSec 时 V1 主轨上的 active clip
    const v1Clips = allClips.filter((c) => (c.trackId ?? "v1") === "v1");
    const target = v1Clips.find((c) => {
      const s = c.startSec ?? 0;
      const e2 = s + Math.max(0.1, (c.out - c.in) / (c.speed || 1));
      return bladeHoverSec >= s && bladeHoverSec <= e2;
    });
    if (!target || target.mediaType !== "video") {
      el.removeAttribute("src");
      return;
    }
    // src 不同才重设(避免反复 reload 闪烁)
    if (el.src !== target.sourceUrl) {
      el.src = target.sourceUrl;
    }
    const within = bladeHoverSec - (target.startSec ?? 0);
    const sourceT = target.in + within * (target.speed || 1);
    // seek 到目标帧 —— 静默 set currentTime,video 自动 update poster
    try { el.currentTime = sourceT; } catch { /* ignore */ }
  }, [tool, bladeHoverSec, allClips]);

  /** 历史数据清理 —— 旧的 pLayout="hsplit"/"vsplit" 是配合 splitImage 用的特殊场景,
   *  没设 splitImage 时却保留 hsplit 会让 V1 缩到一半,加上新的 PiP 拼接体系就
   *  视觉上"残疾"(用户截图反馈)。mount 时检测并自动重置。 */
  useEffect(() => {
    if (pLayout !== "single" && !project.splitImage) {
      setLayout("single");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let nextSelectedId: string | undefined;
    // Auto-select the first clip when clips go from none → some.
    if (!selectedId && allClips.length > 0) {
      nextSelectedId = allClips[0].id;
    }
    // If the currently-selected id points at a removed clip, fall back.
    if (selectedId && !allClips.find((c) => c.id === selectedId)) {
      nextSelectedId = allClips[0]?.id;
    }
    if (!nextSelectedId) return;
    const captured = nextSelectedId;
    const timer = window.setTimeout(() => selectSingle(captured), 0);
    return () => window.clearTimeout(timer);
  }, [allClips, selectedId, selectSingle]);
  const selected = allClips.find((c) => c.id === selectedId);

  /* ─── Add from Archive / Job / URL / Local file ─── */
  const [addUrl, setAddUrl] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tlScrollRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<boolean>(false);
  const archiveCandidates = useMemo(
    () => jobs.filter((j) => j.status === "done" && j.videoUrl),
    [jobs]
  );

  /** Card that's currently selected in the library (visual highlight only). */
  const [selectedLibId, setSelectedLibId] = useState<string | undefined>();
  /** 中央预览区拖入态 —— 高亮虚线边框反馈"可以放在这里" */
  const [previewDragOver, setPreviewDragOver] = useState(false);

  /** 选中并滚动到 clip —— 在添加 / 拖入后给视觉反馈，避免静默 append 让人觉得没工作 */
  function focusClip(clipId: string) {
    selectSingle(clipId);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `.ed-clip[data-clip-id="${clipId}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, 50);
  }

  async function addByUrl(
    url: string,
    title?: string,
    opts?: { append?: boolean; trackId?: string; startSec?: number }
  ) {
    setAddErr(null);
    try {
      const requestedTrack = opts?.trackId ? pTrackById.get(opts.trackId) : undefined;
      if (requestedTrack?.kind === "audio") {
        setAddErr(zh ? "视频 URL 请拖到视频轨" : "Video URL should go on a video track");
        return;
      }
      const targetTrackId = requestedTrack?.kind === "video" ? requestedTrack.id : opts?.trackId;
      const duration = await probeDuration(url);
      // Drop on a specific track / position: don't use insertAfter; let the
      // store action assign startSec, then if caller passed an explicit
      // startSec, override it via setClipStart.
      const insertAfter = opts?.append || targetTrackId ? undefined : selectedId;
      const newId = addClip({
        sourceUrl: url,
        sourceTitle: title || url.split("/").pop() || "clip",
        duration,
        in: 0,
        out: duration,
        volume: 1,
        speed: 1,
        trackId: targetTrackId,
      }, insertAfter);
      if (typeof opts?.startSec === "number") {
        setClipStart(newId, opts.startSec);
      }
      focusClip(newId); // 选中 + 滚到位，避免静默 append
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // DashScope OSS 临时签名 URL 1 小时即过期 — 几乎所有 archive 视频
      // 隔了一段时间后都会跑这条分支。给个具体的中文提示。
      const looksDashscope = /dashscope.*\.aliyuncs\.com/.test(url);
      const looksMetadataFail = /metadata|load video/i.test(raw);
      if (looksDashscope && looksMetadataFail) {
        setAddErr(
          zh
            ? "该视频源已过期（百炼 OSS 临时签名 1 小时失效）。请回工坊重新生成同样 prompt，或在上方上传本地副本。"
            : "Source expired (DashScope OSS signed URL lasts 1h). Re-run the prompt in Studio, or upload a local copy above."
        );
      } else {
        setAddErr(
          zh
            ? `加载失败：${raw}。如果是远端视频，可能是 URL 过期或跨域受限。`
            : `Load failed: ${raw}. If remote, the URL may have expired or be CORS-blocked.`
        );
      }
    }
  }

  /** Resolve the best playable URL for a job (prefers local backup). */
  async function resolveJobUrl(j: Job): Promise<string | null> {
    if (!j.videoUrl) return null;
    if (j.localKey && !j.localKey.startsWith("disk:")) {
      try {
        const blob = await readLocalFile(j.localKey);
        if (blob) {
          const typed = j.localMime ? new Blob([blob], { type: j.localMime }) : blob;
          return URL.createObjectURL(typed);
        }
      } catch { /* fall through */ }
    }
    return j.videoUrl;
  }

  /** Add a job's video to a specified track + position (or default V1 end). */
  async function addFromJob(
    j: Job,
    opts: { append?: boolean; trackId?: string; startSec?: number } = {}
  ) {
    if (!j.videoUrl) {
      setAddErr(zh ? "该任务没有视频" : "Job has no video");
      return;
    }
    const url = await resolveJobUrl(j);
    if (!url) return;
    void addByUrl(url, j.title, opts);
  }

  /** Single-click on a library card: append to V1 end + highlight card.
   *  Always appends (never inserts after selected) so the user gets a
   *  predictable "add to the end of the queue" outcome. To place at a
   *  specific position, drag the card onto the timeline instead. */
  async function previewJob(j: Job) {
    setSelectedLibId(j.id);
    await addFromJob(j, { append: true });
  }

  async function addLocalFile(
    file: File,
    opts?: { trackId?: string; startSec?: number }
  ) {
    setAddErr(null);
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");
    if (!isVideo && !isImage && !isAudio) {
      setAddErr(zh ? "仅支持视频、图片或音频文件" : "Video, image, or audio files only");
      return;
    }
    const requestedTrack = opts?.trackId ? pTrackById.get(opts.trackId) : undefined;
    // 智能轨道选择优先级:
    //   1) 显式 opts.trackId(拖到具体 lane 上)
    //   2) 当前选中 clip 所在轨(同 kind)—— 让"先点 V2 一个素材,再上传 = 进 V2"成立
    //   3) 兜底:第一个匹配 kind 的轨(V1 / A1)
    const selectedTrackEarly = selected ? pTrackById.get(selected.trackId ?? "v1") : undefined;
    const targetTrackId = isAudio
      ? (requestedTrack?.kind === "audio"
          ? requestedTrack.id
          : (selectedTrackEarly?.kind === "audio" ? selectedTrackEarly.id : firstAudioTrackId))
      : (requestedTrack?.kind === "video"
          ? requestedTrack.id
          : (selectedTrackEarly?.kind === "video" ? selectedTrackEarly.id : firstVideoTrackId));
    if (opts?.trackId && requestedTrack && requestedTrack.id !== targetTrackId) {
      flash(
        isAudio
          ? (zh ? "音频已放入音频轨" : "Audio placed on an audio track")
          : (zh ? "画面素材已放入视频轨" : "Visual media placed on a video track")
      );
    }
    const key = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const blobUrl = URL.createObjectURL(file);
    try {
      let duration: number;
      if (isImage) {
        duration = 5; // default 5s for images, adjustable via trim OUT
      } else if (isAudio) {
        duration = await probeAudioDuration(blobUrl);
      } else {
        duration = await probeDuration(blobUrl);
      }
      await storeLocalFile(key, file);
      const selectedTrack = selected ? pTrackById.get(selected.trackId ?? "v1") : undefined;
      const targetKind = isAudio ? "audio" : "video";
      const canInsertAfterSelected = selected && (selectedTrack?.kind ?? "video") === targetKind;
      const insertAfter = opts?.trackId ? undefined : canInsertAfterSelected ? selectedId : undefined;
      const newId = addClip({
        sourceUrl: blobUrl,
        sourceTitle: file.name,
        duration,
        in: 0,
        out: duration,
        volume: isImage ? 0 : 1,
        speed: 1,
        localKey: key,
        localMime: file.type,
        mediaType: isImage ? "image" : isAudio ? "audio" : "video",
        trackId: targetTrackId,
      }, insertAfter);
      if (typeof opts?.startSec === "number") {
        setClipStart(newId, opts.startSec);
      }
      focusClip(newId);
    } catch (e) {
      URL.revokeObjectURL(blobUrl);
      setAddErr(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * On mount: rehydrate any clip with `localKey` but a dead blob URL
   * (e.g. after page reload, session-scoped blob URLs are gone).
   * We re-read the blob from IndexedDB and mint a new URL.
   */
  useEffect(() => {
    let cancelled = false;
    // blob: URL 跨 session 必然失效 —— 不需要逐个 HEAD 验证（N 个 clip 就是 N
    // 个并发请求，dev HTTP/1.1 6 连接限制下会排队几十秒）。直接从 IDB 重建即可。
    const rehydrate = async () => {
      for (const c of allClips) {
        if (cancelled) return;
        if (!c.localKey) continue;
        if (!c.sourceUrl.startsWith("blob:")) continue;
        try {
          const blob = await readLocalFile(c.localKey);
          if (!blob || cancelled) continue;
          const typed = c.localMime
            ? new Blob([blob], { type: c.localMime })
            : blob;
          const url = URL.createObjectURL(typed);
          updateClip(c.id, { sourceUrl: url });
        } catch {
          /* ignore — user can re-upload */
        }
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(() => void rehydrate());
      return () => { cancelled = true; cancelIdleCallback(id); };
    }
    const timer = window.setTimeout(() => void rehydrate(), 80);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Playback engine (multi-track) ─────────────────────────────
   *  All time / play / seek state lives in the engine. */
  const playback = usePlayback(project);
  const playheadSec = playback.currentTime;
  const playing = playback.isPlaying;
  const activeTextClips = pTracks
    .filter((track) => track.kind === "video" && !track.hidden)
    .map((track) => playback.activeByTrack[track.id])
    .filter((clip): clip is EditorClip => !!clip?.text?.content);
  const activeTextClip = activeTextClips[activeTextClips.length - 1];
  const activeCaptionText = activeTextClip?.text?.content
    ? formatCaptionText(
        activeTextClip.text.content,
        activeTextClip.text.sizePx,
        dimsFor(pAspect, pExportH).w
      )
    : "";

  /** Pre-computed snap targets: every clip start+end + playhead + 0.
   *  Per-clip filtering (exclude own edges) is done inline in the JSX. */
  const baseSnapTargets = useMemo(() => {
    if (!snapEnabled) return null;
    const set = new Set([0, playheadSec]);
    for (const c of allClips) {
      const s = c.startSec ?? 0;
      set.add(s);
      set.add(s + Math.max(0.1, (c.out - c.in) / (c.speed || 1)));
    }
    return [...set].sort((a, b) => a - b);
  }, [snapEnabled, allClips, playheadSec]);

  // Refs for keyboard handler — avoids stale closures during playback.
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pbRef = useRef(playback);
  pbRef.current = playback;
  // Refs for closure-captured state in the keydown handler.
  // Why ref-only deps: the keydown effect deliberately keeps a minimal
  // dependency array so the handler isn't re-registered every render
  // (playback ticks rerender 30×/s). Anything the handler reads needs ref.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const allClipsRef = useRef(allClips);
  allClipsRef.current = allClips;

  function playAll() {
    if (allClips.length === 0) return;
    playback.seek(0);
    playback.play();
  }
  function togglePlay() { playback.togglePlay(); }
  /** Step one frame (~1/30s). */
  function stepBack() { playback.pause(); playback.seek(Math.max(0, playheadSec - 1 / 30)); }
  function stepFwd()  { playback.pause(); playback.seek(playheadSec + 1 / 30); }
  function seekTo(projectSec: number) { playback.pause(); playback.seek(projectSec); }

  /** Compute source time within `clip` at the current playhead. */
  function sourceTimeAt(clip: EditorClip, projSec: number): number {
    const within = projSec - (clip.startSec ?? 0);
    return clip.in + within * (clip.speed || 1);
  }

  /** Split the currently-selected clip at the playhead position. */
  function splitClipAtPlayhead(target: EditorClip) {
    const t = sourceTimeAt(target, playheadSec);
    if (t <= target.in + 0.05 || t >= target.out - 0.05) {
      flash(zh ? "播放头不在这条 clip 范围内" : "Playhead not inside this clip");
      return;
    }
    const newId = splitClip(target.id, t);
    if (newId) flash(zh ? "已分割 ✂" : "Split ✂");
    else flash(zh ? "分割失败" : "Split failed");
  }
  function handleSplit() {
    if (!selected) return;
    splitClipAtPlayhead(selected);
  }

  /** Set IN/OUT to the current playhead on the active clip. */
  function setInAtPlayhead() {
    if (!selected) return;
    const t = sourceTimeAt(selected, playheadSec);
    const clamped = Math.min(Math.max(0, t), selected.out - 0.1);
    updateClip(selected.id, { in: clamped });
    flash(zh ? "已设 IN" : "IN set");
  }
  function setOutAtPlayhead() {
    if (!selected) return;
    const t = sourceTimeAt(selected, playheadSec);
    const clamped = Math.max(Math.min(selected.duration, t), selected.in + 0.1);
    updateClip(selected.id, { out: clamped });
    flash(zh ? "已设 OUT" : "OUT set");
  }

  /* J/K/L + I/O + Delete keyboard shortcuts (NLE muscle memory).
   * Uses refs so closures stay current during playback without
   * re-registering the handler 30×/sec. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const pb = pbRef.current;
      const head = playheadRef.current;
      const sel = selectedRef.current;

      if (e.key === " ") {
        e.preventDefault();
        pb.togglePlay();
      } else if (e.key.toLowerCase() === "j") {
        // J · NLE 速度环 · 降一档(连按减速)。1 → 0.5 → 0.25 → 0.1
        // 当前 > 1 时跳回 1 再降,避免从 8x 一路降不到 0.25
        e.preventDefault();
        const curIdx = SPEED_LADDER_IDX(pb.getRateMultiplier());
        const nextIdx = curIdx > LADDER_NORMAL_IDX ? LADDER_NORMAL_IDX : Math.max(0, curIdx - 1);
        const nextRate = SPEED_LADDER[nextIdx];
        pb.setRateMultiplier(nextRate);
        if (!pb.isPlaying) pb.play();
        flash(zh ? `播放速度 ${nextRate}x` : `Speed ${nextRate}x`);
      } else if (e.key.toLowerCase() === "k") {
        // K · 暂停 + 速度复位 1x(NLE 标准)
        e.preventDefault();
        pb.setRateMultiplier(1);
        pb.pause();
      } else if (e.key.toLowerCase() === "l") {
        // L · NLE 速度环 · 升一档(连按加速)。1 → 1.5 → 2 → 4 → 8
        // 当前 < 1 时跳回 1 再升,避免从 0.25 一路升不上去
        e.preventDefault();
        const curIdx = SPEED_LADDER_IDX(pb.getRateMultiplier());
        const nextIdx = curIdx < LADDER_NORMAL_IDX ? LADDER_NORMAL_IDX : Math.min(SPEED_LADDER.length - 1, curIdx + 1);
        const nextRate = SPEED_LADDER[nextIdx];
        pb.setRateMultiplier(nextRate);
        if (!pb.isPlaying) pb.play();
        flash(zh ? `播放速度 ${nextRate}x` : `Speed ${nextRate}x`);
      } else if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (sel) {
          const t = sel.in + (head - (sel.startSec ?? 0)) * (sel.speed || 1);
          const clamped = Math.min(Math.max(0, t), sel.out - 0.1);
          updateClip(sel.id, { in: clamped });
          flash(zh ? "已设 IN" : "IN set");
        }
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (sel) {
          const t = sel.in + (head - (sel.startSec ?? 0)) * (sel.speed || 1);
          const clamped = Math.max(Math.min(sel.duration, t), sel.in + 0.1);
          updateClip(sel.id, { out: clamped });
          flash(zh ? "已设 OUT" : "OUT set");
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        pb.pause();
        pb.seek(Math.max(0, head - 1 / 30));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        pb.pause();
        pb.seek(head + 1 / 30);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (sel) {
          const t = sel.in + (head - (sel.startSec ?? 0)) * (sel.speed || 1);
          if (t > sel.in + 0.05 && t < sel.out - 0.05) {
            const newId = splitClip(sel.id, t);
            if (newId) flash(zh ? "已分割 ✂" : "Split ✂");
            else flash(zh ? "分割失败" : "Split failed");
          } else {
            flash(zh ? "播放头不在这条 clip 范围内" : "Playhead not inside this clip");
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editorRedo();
        else editorUndo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const ids = [...selectedIdsRef.current];
        if (ids.length === 0) return;
        e.preventDefault();
        const shouldRipple = e.shiftKey;
        const clipsToDelete = allClipsRef.current.filter((c) => ids.includes(c.id));
        // blob: URL / IDB 大文件清理
        for (const c of clipsToDelete) {
          if (c.sourceUrl.startsWith("blob:")) URL.revokeObjectURL(c.sourceUrl);
          if (c.localKey) void deleteLocalFile(c.localKey);
        }
        if (ids.length > 1) {
          // 批量删除 —— editorBatch 合并成 1 个 undo step
          // ripple 时按 startSec 倒序删,避免前一次 ripple 影响后一个 clip 的位置基准
          const sorted = clipsToDelete
            .slice()
            .sort((a, b) => (b.startSec ?? 0) - (a.startSec ?? 0));
          editorBatch(() => {
            for (const c of sorted) {
              if (shouldRipple) rippleDeleteClip(c.id);
              else removeClip(c.id);
            }
          });
          flash(
            zh
              ? `已删除 ${ids.length} 段${shouldRipple ? " · 合拢" : ""}`
              : `Removed ${ids.length}${shouldRipple ? " · gap closed" : ""}`
          );
        } else {
          // 单删
          if (shouldRipple) {
            rippleDeleteClip(ids[0]);
            flash(zh ? "已 Ripple 删除 · 合拢" : "Ripple deleted · gap closed");
          } else {
            removeClip(ids[0]);
            flash(zh ? "已删除(留空)" : "Removed (gap kept)");
          }
        }
        setSelectedIds(new Set());
        setSelectedId(undefined);
      } else if (e.key.toLowerCase() === "v") {
        e.preventDefault();
        setTool("pointer");
      } else if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setTool("split");
      } else if (e.key.toLowerCase() === "b" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setTool("blade");
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        // ? 键(Shift+/)弹出/关闭快捷键面板
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (sel) {
          const newId = duplicateClip(sel.id);
          if (newId) {
            selectSingle(newId);
            flash(zh ? "已复制片段" : "Duplicated");
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // All mutable state accessed via refs — deps intentionally minimal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zh]);

  /* ─── Auto-scroll timeline to follow playhead during playback ─── */
  useEffect(() => {
    if (!playing) return;
    const el = tlScrollRef.current;
    if (!el || playback.totalDuration <= 0) return;
    const headPx = TH + playheadSec * pZoom;
    const scrollL = el.scrollLeft;
    const viewW = el.clientWidth;
    // Scroll when playhead leaves the visible area (with margin)
    if (headPx < scrollL + TH + 20 || headPx > scrollL + viewW - 40) {
      el.scrollLeft = Math.max(0, headPx - viewW * 0.25);
    }
  }, [playing, playheadSec, pZoom, playback.totalDuration]);

  /* ─── Scroll-wheel on timeline: Ctrl/⌘ = zoom, plain = horizontal scroll ─── */
  const zoomRef = useRef(pZoom);
  zoomRef.current = pZoom;
  useEffect(() => {
    const el = tlScrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const cur = zoomRef.current;
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        setTimelineZoom(Math.max(20, Math.min(400, cur * factor)));
      } else if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        // Convert vertical scroll to horizontal on the timeline
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Auto fit-to-view when first clip is added ─── */
  const prevClipCountRef = useRef(0);
  useEffect(() => {
    if (prevClipCountRef.current === 0 && allClips.length > 0 && playback.totalDuration > 0) {
      const el = tlScrollRef.current;
      if (el) {
        const visW = el.clientWidth - TH - 16;
        setTimelineZoom(Math.max(20, Math.min(400, visW / playback.totalDuration)));
      }
    }
    prevClipCountRef.current = allClips.length;
  }, [allClips.length, playback.totalDuration, setTimelineZoom]);

  /* ─── Snap indicator line ─── */
  const [snapIndicatorSec, setSnapIndicatorSec] = useState<number | null>(null);

  /* ─── Right-click context menu ─── */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onEsc); };
  }, [ctxMenu]);

  /* ─── Minimap scroll tracking ─── */
  const [minimapScrollPct, setMinimapScrollPct] = useState(0);
  const [minimapViewPct, setMinimapViewPct] = useState(100);
  useEffect(() => {
    const el = tlScrollRef.current;
    if (!el) return;
    function onScroll() {
      const total = el!.scrollWidth - el!.clientWidth;
      setMinimapScrollPct(total > 0 ? el!.scrollLeft / el!.scrollWidth * 100 : 0);
      setMinimapViewPct(el!.scrollWidth > 0 ? el!.clientWidth / el!.scrollWidth * 100 : 100);
    }
    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [allClips.length, pZoom]);

  /* ─── Export ─── */
  const [exportProgress, setExportProgress] = useState<RenderProgress | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);
  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }
  function clearAllCaptions() {
    if (captionCount === 0) return;
    editorBatch(() => {
      allClips.forEach((clip) => {
        if (clip.text) updateClip(clip.id, { text: undefined });
      });
    });
    flash(zh ? "字幕已清除" : "Captions cleared");
  }
  async function handleExport() {
    const allClips = clips.length > 0 ? clips : videoClips;
    const exportClips = allClips
      .filter((clip) => clip.mediaType !== "audio")
      .slice()
      .sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));
    const voiceClips = allClips.filter((clip) => clip.mediaType === "audio" && clip.sourceUrl);
    if (exportClips.length === 0) {
      flash(zh ? "没有可导出的视频或图片素材" : "No video or image clips to export");
      return;
    }
    setExportProgress({ stage: "loading", pct: 0 });
    try {
      const renderOptions = {
        aspect: pAspect,
        crossfadeSec: pCrossfade,
        exportHeight: pExportH,
        transitionType: pTransition,
        bgm: project.bgm,
        voiceClips,
        layout: pLayout,
        splitImage: project.splitImage,
        splitRatio: pSplitRatio,
      };
      let usedFallback = false;
      let blob: Blob;
      try {
        blob = await renderProject(exportClips, (p) => setExportProgress(p), renderOptions);
      } catch (e) {
        if (!isWasmMemoryError(e)) throw e;
        usedFallback = true;
        setExportProgress({
          stage: "loading",
          pct: 0.02,
          message: zh ? "内存不足，切到轻量导出重试..." : "Memory fallback, retrying...",
        });
        blob = await renderProject(exportClips, (p) => setExportProgress(p), {
          ...renderOptions,
          crossfadeSec: 0,
          exportHeight: Math.min(pExportH, 720),
        });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pName.replace(/\s+/g, "_")}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flash(
        usedFallback
          ? (zh ? "已用轻量模式导出 ✓" : "Exported with safe mode ✓")
          : (zh ? "已导出 ✓" : "Exported ✓")
      );
    } catch (e) {
      flash(
        (zh ? "导出失败：" : "Export failed: ") +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      window.setTimeout(() => setExportProgress(null), 1500);
    }
  }

  const totalDuration = playback.totalDuration;

  return (
    <div
      className="app editor-app"
      data-editor-level={editorLevel}
      data-tool={tool}
      onPaste={(e) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const file = e.clipboardData.files?.[0];
        if (!file) return;
        e.preventDefault();
        void addLocalFile(file);
        flash(zh ? "已从剪贴板加入素材" : "Added media from clipboard");
      }}
    >
      {/* 全局隐藏文件选择器 —— 必须在条件块外，L0 状态也需要用 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addLocalFile(f);
          e.target.value = "";
        }}
      />
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>EDITOR</b>
            </div>
          </Link>
        </div>
        <TopNav current="editor" />
        <div className="right">
          <Link prefetch={false} href={helpHref} className="chrome-icon" title={zh ? "帮助" : "Help"} style={{ textDecoration: "none" }}>?</Link>
          <LocaleSwitcher />
          {/* 新建空项目 —— 一键回到 L0 干净状态（看到中央 dropzone 引导） */}
          {allClips.length > 0 && (
            <button
              type="button"
              className="ed-adv-toggle"
              onClick={async () => {
                if (
                  !(await confirmDialog({
                    title: zh ? "新建空项目？将清空当前时间线" : "New empty project?",
                    danger: true,
                  }))
                )
                  return;
                clearClips();
                flash(zh ? "已新建空项目" : "New project");
              }}
              title={
                zh
                  ? "清空当前时间线，回到欢迎页（拖入或点击添加视频）"
                  : "Clear timeline and return to welcome screen"
              }
            >
              {zh ? "＋ 新项目" : "＋ New"}
            </button>
          )}
          <span className="tag">
            <span className="dot" />
            {allClips.length} {zh ? "条 · 总时长" : "clips ·"} {fmtTime(totalDuration)}
          </span>
        </div>
      </header>

      <section className="ed-grid">
        {/* LEFT: library —— L0 时整个隐藏（中央 dropzone 已能完成所有添加路径）*/}
        {editorLevel > 0 && (
        <aside className="ed-lib">
          <div className="ed-lib-head">
            <span>{zh ? "素材库" : "Sources"}</span>
          </div>

          <div className="ed-lib-addurl">
            <input
              className="ed-input"
              type="url"
              placeholder="https://…/clip.mp4"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addUrl.trim()) {
                  void addByUrl(addUrl.trim());
                  setAddUrl("");
                }
              }}
            />
            <button
              type="button"
              className="ed-btn"
              onClick={() => {
                if (addUrl.trim()) {
                  void addByUrl(addUrl.trim());
                  setAddUrl("");
                }
              }}
              disabled={!addUrl.trim()}
            >
              + URL
            </button>
          </div>

          <div
            className="ed-lib-upload"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("drag");
            }}
            onDragLeave={(e) =>
              e.currentTarget.classList.remove("drag")
            }
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("drag");
              const f = e.dataTransfer.files?.[0];
              if (f) void addLocalFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="ed-lib-upload-glyph">⬆</div>
            <div className="ed-lib-upload-text">
              {zh ? "上传视频 / 图片 / 音频" : "Upload video / image / audio"}
            </div>
            <div className="ed-lib-upload-hint">
              {zh
                ? "拖放或点击 · 存在浏览器 IndexedDB"
                : "Drag & drop or click · cached in IndexedDB"}
            </div>
          </div>
          {addErr && (
            <div className="ed-err" role="alert">
              <strong>!</strong> {addErr}
              <button
                type="button"
                className="ed-err-close"
                onClick={() => setAddErr(null)}
                aria-label="dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* 🆕 AI 配音(可选)—— 文本 → 百炼 TTS → 自动作为 audio clip 落到时间线 */}
          <TTSPanel
            audioTracks={pTracks
              .filter((t) => t.kind === "audio")
              .map((t) => ({ id: t.id, label: t.label }))}
            zh={zh}
            onCreated={({ sourceUrl, sourceTitle, duration, trackId }) => {
              const newId = addClip({
                sourceUrl,
                sourceTitle,
                duration,
                in: 0,
                out: duration,
                volume: 1,
                speed: 1,
                trackId,
              });
              focusClip(newId);
              flash(zh ? "🎙 配音已落到时间线" : "🎙 Voiceover added to timeline");
            }}
          />


          {/* 档案/工坊区域 —— 没有已完成任务时整段隐藏，保持 L1 干净 */}
          {archiveCandidates.length > 0 && (
          <>
          <div className="ed-lib-section">
            {zh ? "来自档案 / 工坊" : "From archive / studio"}
          </div>
          <div className="ed-lib-grid">
            {archiveCandidates.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={`ed-lib-card${selectedLibId === j.id ? " sel" : ""}`}
                  onClick={() => void previewJob(j)}
                  onDoubleClick={() => void addFromJob(j, { append: true })}
                  title={zh ? "单击预览 · 双击追加 · 拖入时间线放置" : "Click to preview · double-click to append · drag to place"}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-frame0-job", j.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <div className="ed-lib-thumb">
                    {j.videoUrl && <LazyVideoThumb src={j.videoUrl} />}
                    <span className="ed-lib-play">▶</span>
                  </div>
                  <div className="ed-lib-title">{j.title}</div>
                </button>
              ))}
          </div>
          </>
          )}

          {/* Split image — companion image for the layout (vsplit/hsplit). */}
          {(pLayout) !== "single" && (
            <>
              <div className="ed-lib-section">
                {zh ? "分屏图片" : "Split image"}
              </div>
              <div className="ed-bgm-row">
                {project.splitImage ? (
                  <>
                    <div
                      className="ed-bgm-name"
                      title={project.splitImage.sourceTitle}
                    >
                      🖼 {project.splitImage.sourceTitle}
                    </div>
                    <button
                      type="button"
                      className="ed-btn danger"
                      onClick={() => setSplitImage(undefined)}
                      title={zh ? "移除分屏图" : "Remove image"}
                    >
                      ×
                    </button>
                    <div className="ed-bgm-name" style={{ flex: "1 1 100%" }}>
                      {zh ? "比例（视频占）" : "Video share"} ·{" "}
                      {Math.round(pSplitRatio * 100)}%
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={0.8}
                      step={0.05}
                      value={pSplitRatio}
                      onChange={(e) => setSplitRatio(Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                  </>
                ) : (
                  <label className="ed-bgm-add">
                    <span className="ed-bgm-glyph">+</span>
                    <span>
                      {zh
                        ? "上传分屏图（jpg / png）"
                        : "Add image (jpg / png)"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const key = `splitimg_${Date.now().toString(36)}`;
                        const blobUrl = URL.createObjectURL(file);
                        try {
                          await storeLocalFile(key, file);
                        } catch {
                          /* IDB unavailable */
                        }
                        setSplitImage({
                          sourceUrl: blobUrl,
                          sourceTitle: file.name,
                          localKey: key,
                          mime: file.type,
                        });
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </>
          )}

          {/* BGM (background music) —— 仅 L2 或已经设过 BGM 才出现 */}
          {(editorLevel >= 2 || project.bgm) && (
          <>
          <div className="ed-lib-section">
            {zh ? "背景音乐 (BGM)" : "Background music"}
          </div>
          <div className="ed-bgm-row">
            {project.bgm ? (
              <>
                <div className="ed-bgm-name" title={project.bgm.sourceTitle}>
                  ♪ {project.bgm.sourceTitle}
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={project.bgm.volume}
                  onChange={(e) =>
                    setBgm({
                      ...project.bgm!,
                      volume: Number(e.target.value),
                    })
                  }
                  title={zh ? "BGM 音量" : "BGM volume"}
                />
                <button
                  type="button"
                  className="ed-btn danger"
                  onClick={() => setBgm(undefined)}
                  title={zh ? "移除 BGM" : "Remove BGM"}
                >
                  ×
                </button>
              </>
            ) : (
              <label className="ed-bgm-add">
                <span className="ed-bgm-glyph">+</span>
                <span>
                  {zh ? "上传背景音乐 (mp3 / m4a)" : "Add music (mp3 / m4a)"}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const key = `bgm_${Date.now().toString(36)}`;
                    const blobUrl = URL.createObjectURL(file);
                    try {
                      await storeLocalFile(key, file);
                    } catch {
                      /* IDB unavailable */
                    }
                    setBgm({
                      sourceUrl: blobUrl,
                      sourceTitle: file.name,
                      volume: 0.5,
                      localKey: key,
                      mime: file.type,
                    });
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          </>
          )}
        </aside>
        )}

        {/* CENTER: preview + timeline */}
        <main className="ed-main">
          {/* 项目头 —— L0 时整段隐藏，L1 仅显示标题 + 清空 + 导出，比例/合成/分辨率
              这些"高级"控件等到 L2 再出现。*/}
          {editorLevel > 0 && (
          <div className="ed-project-head">
            <input
              className="ed-project-name"
              value={pName}
              onChange={(e) => renameProject(e.target.value)}
              placeholder={zh ? "项目名称" : "Project name"}
            />
            <div className="ed-project-actions">
              {editorLevel >= 2 && (
                <>
                  <div className="ed-aspect-group" title={zh ? "画幅" : "Aspect"}>
                    {(["16:9", "9:16", "1:1", "4:3"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={`ed-aspect${pAspect === a ? " on" : ""}`}
                        onClick={() => setAspect(a)}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  {/* 旧的 splitImage hsplit/vsplit 体系 —— 只在用户**确实有** splitImage
                      时显示;日常工作流统一走右边的"拼接布局"快捷预设(基于 PiP),避免
                      两套体系打架。 */}
                  {project.splitImage && (
                    <select
                      className="ed-select"
                      value={pLayout}
                      onChange={(e) => setLayout(e.target.value as typeof pLayout)}
                      title={zh ? "splitImage 与 V1 的合成方式" : "splitImage layout"}
                    >
                      <option value="single">{zh ? "单画面" : "Single"}</option>
                      <option value="vsplit">{zh ? "上下分屏" : "Top/Btm"}</option>
                      <option value="hsplit">{zh ? "左右分屏" : "Left/Right"}</option>
                    </select>
                  )}
                  {/* 多素材布局快捷预设 —— select value 反映**当前实际匹配的布局**,
                      让用户始终知道"我现在用的是哪个"。手动拖拽偏离 preset → 显示"自定义"。 */}
                  <select
                    className="ed-select"
                    value={detectCurrentLayout(
                      playback.activeByTrack["v1"]?.pip,
                      playback.activeByTrack["v2"]?.pip,
                      playback.activeByTrack["v3"]?.pip,
                    )}
                    onChange={(e) => {
                      const presetId = e.target.value;
                      if (presetId === "custom") return; // "自定义" 不可主动选,只是显示
                      const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
                      if (!preset) return;
                      editorBatch(() => {
                        // 关掉旧的 splitImage hsplit/vsplit 体系 —— 跟新的 PiP 拼接打架
                        if (pLayout !== "single") setLayout("single");
                        const v1A = playback.activeByTrack["v1"];
                        const v2A = playback.activeByTrack["v2"];
                        const v3A = playback.activeByTrack["v3"];
                        if ("v1" in preset && v1A) updateClip(v1A.id, { pip: preset.v1 ?? undefined });
                        if ("v2" in preset && v2A) updateClip(v2A.id, { pip: preset.v2 ?? undefined });
                        if ("v3" in preset && v3A) updateClip(v3A.id, { pip: preset.v3 ?? undefined });
                      });
                      flash(zh ? `已应用:${preset.labelZh}` : `Applied: ${preset.labelEn}`);
                    }}
                    title={zh ? "一键拼接布局 · 把 V1/V2/V3 active 片段摆到常见位置" : "Quick multi-clip layout · arrange V1/V2/V3 active clips"}
                  >
                    <option value="custom" disabled>
                      {zh ? "🔧 自定义布局(已手动调整)" : "🔧 Custom (manually tweaked)"}
                    </option>
                    {LAYOUT_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {zh ? p.labelZh : p.labelEn}
                      </option>
                    ))}
                  </select>
                  <select
                    className="ed-select"
                    value={String(pExportH)}
                    onChange={(e) => setExportHeight(Number(e.target.value))}
                    title={zh ? "导出分辨率（短边）" : "Export resolution (short edge)"}
                  >
                    <option value="540">540p</option>
                    <option value="720">720p</option>
                    <option value="1080">1080p</option>
                    <option value="1440">1440p</option>
                    <option value="2160">4K</option>
                  </select>
                </>
              )}
              <button
                type="button"
                className="ed-btn"
                onClick={clearAllCaptions}
                disabled={captionCount === 0}
                title={zh ? "清除所有片段字幕" : "Clear all captions"}
              >
                {zh ? "清字幕" : "Clear captions"}
              </button>
              <button
                type="button"
                className="ed-btn danger"
                onClick={async () => {
                  if (
                    allClips.length > 0 &&
                    !(await confirmDialog({
                      title: zh ? "清空时间线？" : "Clear timeline?",
                      danger: true,
                    }))
                  )
                    return;
                  clearClips();
                }}
                disabled={allClips.length === 0}
              >
                {zh ? "清空" : "Clear"}
              </button>
              <button
                type="button"
                className="ed-btn primary"
                onClick={handleExport}
                disabled={videoClips.length === 0 || !!exportProgress}
              >
                {exportProgress
                  ? `${Math.round((exportProgress.pct ?? 0) * 100)}%`
                  : zh
                    ? "导出 MP4 →"
                    : "Export MP4 →"}
              </button>
            </div>
          </div>
          )}

          <div
            className={`ed-preview-region${previewDragOver ? " drop-target" : ""}`}
            onClick={(e) => {
              if (allClips.length === 0) return;
              if ((e.target as HTMLElement).closest(".ed-overlay")) return;
              togglePlay();
            }}
            // 让中央预览区也能接拖放 —— 不再需要去时间线 lane 找位置。
            // 接受 OS 文件 / 工坊 job / 时间线 clip 移动。drop 后 append 到 V1
            // 末尾 + focusClip 给视觉反馈。
            onDragOver={(e) => {
              const types = Array.from(e.dataTransfer.types);
              if (
                !types.includes("Files") &&
                !types.includes("application/x-frame0-job") &&
                !types.includes("application/x-frame0-clip")
              )
                return;
              e.preventDefault();
              setPreviewDragOver(true);
            }}
            onDragLeave={() => setPreviewDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setPreviewDragOver(false);
              const jobId = e.dataTransfer.getData("application/x-frame0-job");
              if (jobId) {
                const j = jobs.find((x) => x.id === jobId);
                if (j) {
                  void addFromJob(j, { append: true });
                  flash(zh ? "已加入时间线" : "Added to timeline");
                }
                return;
              }
              const file = e.dataTransfer.files?.[0];
              if (file) {
                void addLocalFile(file);
                flash(zh ? "已加入时间线" : "Added to timeline");
              }
            }}
            style={{
              cursor: allClips.length > 0 ? "pointer" : "default",
              flex: `${previewFlex} 1 0`,
            }}
          >
            {pTracks.filter((track) => track.kind === "audio").map((track) => (
              <audio
                key={track.id}
                ref={playback.refFor(track.id)}
                preload="auto"
                className="ed-hidden-audio"
              />
            ))}
            <div
              className="ed-preview"
              style={{
                aspectRatio: (pAspect ?? "16:9").replace(":", " / "),
                display:
                  (pLayout) !== "single" && project.splitImage
                    ? "flex"
                    : undefined,
                flexDirection:
                  pLayout === "vsplit"
                    ? "column"
                    : pLayout === "hsplit"
                      ? "row"
                      : undefined,
              }}
            >
              {videoClips.length === 0 ? (
                <div className="ed-preview-empty">
                  <div className="ed-preview-empty-icon" aria-hidden>
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2.5" y="5" width="19" height="14" rx="2" />
                      <line x1="2.5" y1="9" x2="21.5" y2="9" />
                      <line x1="6" y1="5" x2="6" y2="19" />
                      <line x1="18" y1="5" x2="18" y2="19" />
                      <polygon points="11 12 15 14 11 16" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="ed-preview-empty-title">
                    {zh ? "等待第一帧" : "Awaiting first frame"}
                  </div>
                  <div className="ed-preview-empty-sub">
                    {zh
                      ? "拖入视频或图片 · 或从左侧素材库添加"
                      : "Drop a video or image — or pick from Sources"}
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="ed-preview-vid-wrap"
                    style={
                      (pLayout) !== "single" &&
                      project.splitImage
                        ? { flex: pSplitRatio, position: "relative", minHeight: 0, minWidth: 0 }
                        : { width: "100%", height: "100%", position: "relative" }
                    }
                  >
                    {/* Multi-track video stack: V1 always renders, V2/V3 only when active.
                        V2/V3 是"覆盖层":读 clip.pip {x, y, scale} 自由定位 / 缩放,
                        默认 x=0.75 y=0.25(右上),scale=0.3(占画布 30% 宽)。
                        预览区直接拖拽 wrap 改 x/y;滚轮改 scale。 */}
                    {pTracks.filter((t) => t.kind === "video").map((track) => {
                      const active = playback.activeByTrack[track.id];
                      const isV1 = track.id === "v1";
                      // V1 always renders to keep playback engine in sync;
                      // V2/V3 only render when they have an active clip.
                      if (!isV1 && !active) return null;
                      if (track.hidden) return null;
                      const pip = active?.pip;
                      // V1 没 pip → 占满(默认);有 pip → 进入自由布局模式(分屏 / 拼接)
                      // V2/V3 → 总是自由布局,默认右上小窗
                      const freeLayout = !!pip || !isV1;
                      const defaultPip = isV1
                        ? { x: 0.5, y: 0.5, scale: 1 }
                        : { x: 0.75, y: 0.25, scale: 0.3 };
                      const p = pip ?? defaultPip;
                      const wrapStyle: React.CSSProperties = {
                        position: "absolute",
                        zIndex: isV1 ? 0 : (track.id === "v2" ? 1 : 2),
                        ...(freeLayout
                          ? {
                              left: `${p.x * 100}%`,
                              top: `${p.y * 100}%`,
                              // 关键:wrap 用 scale × 父 width / height(父是画布,本身是 16:9 等),
                              // 不用 aspectRatio。aspectRatio 在 absolute + max-height 父里
                              // 经常打架,导致 V1 width 缩了 height 没缩 → 看起来"残疾"。
                              // video / img 元素内部 object-fit:contain 会自动 letterbox 显示。
                              width: `${p.scale * 100}%`,
                              height: `${p.scale * 100}%`,
                              transform: "translate(-50%, -50%)",
                              // V1 占满时不画边框/阴影(干扰画面);其它情况画
                              ...(isV1 && p.scale >= 0.99
                                ? {}
                                : {
                                    boxShadow: "0 4px 18px rgba(0,0,0,0.5)",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                  }),
                              cursor: "move",
                              touchAction: "none",
                            }
                          : { inset: 0 }),
                      };
                      const draggable = freeLayout && !!active;
                      // For image clips, show <img>; otherwise always show <video>
                      const showImage = active?.mediaType === "image";
                      return (
                        <div
                          key={track.id}
                          style={wrapStyle}
                          onPointerDown={draggable ? (e) => {
                            // V2/V3 自由拖拽 —— 直接在预览画面里改 pip 位置
                            // 阻止冒泡到 ed-preview-clickcatch 否则会触发 togglePlay
                            e.preventDefault();
                            e.stopPropagation();
                            const wrap = e.currentTarget as HTMLElement;
                            const canvas = wrap.parentElement;
                            if (!canvas) return;
                            const canvasRect = canvas.getBoundingClientRect();
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startPip = active.pip ?? { x: 0.75, y: 0.25, scale: 0.3 };
                            try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
                            const onMove = (ev: PointerEvent) => {
                              const dx = (ev.clientX - startX) / canvasRect.width;
                              const dy = (ev.clientY - startY) / canvasRect.height;
                              const nx = Math.max(0, Math.min(1, startPip.x + dx));
                              const ny = Math.max(0, Math.min(1, startPip.y + dy));
                              updateClip(active.id, { pip: { ...startPip, x: nx, y: ny } });
                            };
                            const onUp = () => {
                              document.removeEventListener("pointermove", onMove);
                              document.removeEventListener("pointerup", onUp);
                            };
                            document.addEventListener("pointermove", onMove);
                            document.addEventListener("pointerup", onUp);
                          } : undefined}
                          onWheel={draggable ? (e) => {
                            // 滚轮缩放 PiP —— 上滚放大,下滚缩小。范围 0.1~1.0
                            e.preventDefault();
                            e.stopPropagation();
                            const startPip = active.pip ?? { x: 0.75, y: 0.25, scale: 0.3 };
                            const delta = -e.deltaY * 0.001;
                            const nextScale = Math.max(0.1, Math.min(1, startPip.scale + delta));
                            updateClip(active.id, { pip: { ...startPip, scale: nextScale } });
                          } : undefined}
                          onDoubleClick={draggable ? (e) => {
                            // 双击 —— V1 复位为占满(清 pip);V2/V3 复位到右上默认位
                            e.stopPropagation();
                            if (isV1) {
                              updateClip(active!.id, { pip: undefined });
                            } else {
                              updateClip(active!.id, { pip: { x: 0.75, y: 0.25, scale: 0.3 } });
                            }
                          } : undefined}
                          title={draggable ? (zh ? "拖动 = 移位 · 滚轮 = 缩放 · 双击 = 复位" : "Drag = move · Wheel = scale · Double-click = reset") : undefined}
                        >
                          {showImage ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={active!.sourceUrl}
                              alt={active!.sourceTitle}
                              style={{ width: "100%", height: "100%", objectFit: "contain", background: isV1 ? "transparent" : "black", pointerEvents: "none" }}
                            />
                          ) : (
                            <video
                              ref={playback.refFor(track.id)}
                              playsInline
                              preload="auto"
                              muted={!isV1}
                              style={{ width: "100%", height: "100%", objectFit: "contain", background: isV1 ? "transparent" : "black", pointerEvents: "none" }}
                            />
                          )}
                        </div>
                      );
                    })}
                    {/* Click-catch overlay for play/pause toggle (above all videos). */}
                    <button
                      type="button"
                      aria-label="Play/Pause"
                      onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                      className="ed-preview-clickcatch"
                      style={{ zIndex: 5 }}
                    />
                    {activeCaptionText && activeTextClip?.text && (
                      <div
                        className={`ed-overlay ed-overlay-${activeTextClip.text.position}`}
                        style={{
                          color: activeTextClip.text.color,
                          fontSize: activeTextClip.text.sizePx,
                        }}
                      >
                        {activeCaptionText.split("\n").map((line, idx) => (
                          <span key={`${idx}-${line}`}>{line}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(pLayout) !== "single" &&
                    project.splitImage && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={project.splitImage.sourceUrl}
                        alt={project.splitImage.sourceTitle}
                        style={{
                          flex: 1 - pSplitRatio,
                          width:
                            pLayout === "hsplit" ? "auto" : "100%",
                          height:
                            pLayout === "vsplit" ? "auto" : "100%",
                          objectFit: "contain",
                          minWidth: 0,
                          minHeight: 0,
                          background: "black",
                        }}
                      />
                    )}
                </>
              )}
            </div>
          </div>

          {/* 预览/时间线 高度分隔条 —— 拖拽改 previewFlex,双击复位为 2 */}
          {editorLevel > 0 && allClips.length > 0 && (
            <div
              className="ed-h-splitter"
              onPointerDown={(e) => {
                e.preventDefault();
                const startY = e.clientY;
                const startFlex = previewFlex;
                const main = (e.currentTarget as HTMLElement).closest(".ed-main") as HTMLElement | null;
                if (!main) return;
                const mainHeight = main.getBoundingClientRect().height;
                try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
                const onMove = (ev: PointerEvent) => {
                  const dy = ev.clientY - startY;
                  const startRatio = startFlex / (startFlex + 1);
                  const newPrevH = startRatio * mainHeight + dy;
                  const clamp = Math.max(0.25, Math.min(0.85, newPrevH / mainHeight));
                  const newFlex = clamp / (1 - clamp);
                  setPreviewFlex(newFlex);
                };
                const onUp = () => {
                  document.removeEventListener("pointermove", onMove);
                  document.removeEventListener("pointerup", onUp);
                };
                document.addEventListener("pointermove", onMove);
                document.addEventListener("pointerup", onUp);
              }}
              onDoubleClick={() => setPreviewFlex(2)}
              title={zh ? "拖动调整预览/时间线比例 · 双击复位" : "Drag to resize · double-click to reset"}
              role="separator"
              aria-label={zh ? "高度分隔" : "Resize divider"}
              aria-orientation="horizontal"
            >
              <div className="ed-h-splitter-grip" aria-hidden />
            </div>
          )}

          {/* ═══ Transport bar ═══ —— L0 整段不渲染 */}
          {editorLevel > 0 && (
          <div className="ed-transport">
            <div className="ed-tr-group">
              <button className="ed-tr-btn" onClick={handleSplit} disabled={!selected} title={zh ? "分割 ⌘K" : "Split ⌘K"}><IcoScissors /></button>
              <button className="ed-tr-btn" onClick={() => setInAtPlayhead()} disabled={!selected} title={zh ? "入点 I" : "IN I"}><IcoBracketIn /></button>
              <button className="ed-tr-btn" onClick={() => setOutAtPlayhead()} disabled={!selected} title={zh ? "出点 O" : "OUT O"}><IcoBracketOut /></button>
            </div>
            <div className="ed-bar-sep" />
            <div className="ed-tr-group">
              <button className="ed-tr-btn" onClick={editorUndo} disabled={undoStackLen === 0} title={zh ? "撤销 ⌘Z" : "Undo ⌘Z"}><IcoUndo /></button>
              <button className="ed-tr-btn" onClick={editorRedo} disabled={redoStackLen === 0} title={zh ? "重做 ⌘⇧Z" : "Redo ⌘⇧Z"}><IcoRedo /></button>
            </div>
            <div className="ed-bar-sep" />
            <div className="ed-tr-center">
              <button className="ed-tr-btn" onClick={playAll} disabled={allClips.length === 0} title={zh ? "从头播放" : "Play from start"}><IcoSkipBack /></button>
              <button className="ed-tr-btn" onClick={stepBack} disabled={allClips.length === 0} title={zh ? "上一帧 ←" : "Prev frame ←"}><IcoFrameBack /></button>
              <button className="ed-tr-play" onClick={togglePlay} disabled={allClips.length === 0} title="Space">
                {playing ? <IcoPause /> : <IcoPlay />}
              </button>
              <button className="ed-tr-btn" onClick={stepFwd} disabled={allClips.length === 0} title={zh ? "下一帧 →" : "Next frame →"}><IcoFrameFwd /></button>
            </div>
            <div className="ed-tr-tc">
              <span className="ed-tc-cur">{fmtTime(playheadSec)}</span>
              <span className="ed-tc-sep">/</span>
              <span className="ed-tc-tot">{fmtTime(totalDuration)}</span>
            </div>
            <div className="ed-tr-spacer" />
            {/* 转场只有 L2 才显示——L1 单素材时根本不需要转场 */}
            {editorLevel >= 2 && (
              <>
                <label className="ed-xfade" title={zh ? "转场时长" : "Crossfade"}>
                  {zh ? "转场" : "Xfade"}
                  <input type="range" min={0} max={2} step={0.1} value={pCrossfade} onChange={(e) => setCrossfade(Number(e.target.value))} />
                  <span className="ed-xfade-val">{pCrossfade.toFixed(1)}s</span>
                </label>
                <select className="ed-select" value={pTransition} onChange={(e) => setTransitionType(e.target.value as typeof pTransition)} disabled={pCrossfade === 0} title={zh ? "转场类型" : "Transition"}>
                  <option value="fade">{zh ? "淡化" : "Fade"}</option>
                  <option value="fadeblack">{zh ? "黑场" : "Black"}</option>
                  <option value="fadewhite">{zh ? "白场" : "White"}</option>
                  <option value="wipeleft">{zh ? "左划" : "Wipe←"}</option>
                  <option value="wiperight">{zh ? "右划" : "Wipe→"}</option>
                  <option value="slideleft">{zh ? "左滑" : "Slide←"}</option>
                  <option value="slideright">{zh ? "右滑" : "Slide→"}</option>
                  <option value="circleopen">{zh ? "圆展" : "⊙Open"}</option>
                  <option value="circleclose">{zh ? "圆收" : "⊙Close"}</option>
                </select>
              </>
            )}
          </div>
          )}

          {/* ═══ Timeline area ═══ —— L0 整段不渲染 */}
          {editorLevel > 0 && (
          <div className="ed-tl-area">
            <div className="ed-tl-head">
              <div className="ed-tl-info">
                <div className="ed-tools" role="toolbar" aria-label={zh ? "时间线工具" : "Timeline tools"}>
                  <button
                    className={`ed-tool-btn${tool === "pointer" ? " on" : ""}`}
                    onClick={() => setTool("pointer")}
                    title={zh ? "选择 (V)" : "Pointer (V)"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3 L19 12 L12 14 L9 21 Z" /></svg>
                  </button>
                  <button
                    className={`ed-tool-btn${tool === "split" ? " on" : ""}`}
                    onClick={() => setTool("split")}
                    title={zh ? "分割 (C) · 点击选中片段分割,需先把播放头移到分割点" : "Split (C) · click a clip to cut at the playhead"}
                  >
                    <IcoScissors />
                  </button>
                  <button
                    className={`ed-tool-btn${tool === "blade" ? " on" : ""}`}
                    onClick={() => setTool("blade")}
                    title={zh ? "Blade (B) · 点击时间线任意位置,所有轨道上的活跃片段一刀切开" : "Blade (B) · click anywhere on the timeline to slice all tracks at once"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 4 L20 8 L8 20 L2 14 Z" />
                      <line x1="10" y1="10" x2="14" y2="14" />
                    </svg>
                  </button>
                  <button
                    className={`ed-tool-btn${snapEnabled ? " on" : ""}`}
                    onClick={() => setSnapEnabled((v) => !v)}
                    title={zh ? "吸附磁铁" : "Snap"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4 v8 a6 6 0 0 0 12 0 V4 M6 4 h4 M14 4 h4" /></svg>
                  </button>
                </div>
                <span className="ed-tl-divider" />
                {allClips.length > 0 && <span className="ed-tl-stats">{allClips.length} {zh ? "段" : "clips"} · {fmtTime(totalDuration)}</span>}
              </div>
              <div className="ed-tl-zoom">
                <button className="ed-tr-btn" onClick={() => setTimelineZoom(Math.max(20, (pZoom) / 1.4))} title="−">−</button>
                <span className="ed-tl-zoom-val">{Math.round(pZoom)}px/s</span>
                <button className="ed-tr-btn" onClick={() => setTimelineZoom(Math.min(400, (pZoom) * 1.4))} title="+">+</button>
                <button className="ed-tr-btn" onClick={() => {
                  const el = tlScrollRef.current;
                  if (!el || totalDuration <= 0) { setTimelineZoom(80); return; }
                  const visW = el.clientWidth - TH - 16; // track heads + breathing room
                  setTimelineZoom(Math.max(20, Math.min(400, visW / totalDuration)));
                }} title={zh ? "适配视图" : "Fit"}>⤢</button>
              </div>
            </div>
            <div className="ed-timeline-scroll" ref={tlScrollRef}>
              <div
                className="ed-tl-content"
                data-tool={tool}
                style={allClips.length > 0 ? { width: `${Math.max(100, totalDuration * pZoom + TH)}px`, position: "relative" as const } : undefined}
                onPointerDown={(e) => {
                  // 橡皮筋框选 —— 只在 timeline lanes 空白区启动
                  const t = e.target as HTMLElement;
                  if (
                    t.closest(".ed-clip") ||
                    t.closest(".ed-track-head") ||
                    t.closest(".ed-ruler") ||
                    t.closest(".ed-playhead") ||
                    t.closest("button") ||
                    t.closest("input")
                  ) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  if (x < TH) return; // 头部 96px 是轨道工具栏区,不启动
                  e.preventDefault();
                  marqueeStartIdsRef.current = e.shiftKey ? new Set(selectedIdsRef.current) : new Set();
                  setMarquee({ startX: x, startY: y, curX: x, curY: y });
                  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
                }}
                onPointerMove={(e) => {
                  // Blade 模式 —— 实时跟随鼠标更新 hover 竖线位置
                  if (tool === "blade" && totalDuration > 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    if (x >= TH) {
                      const sec = Math.max(0, Math.min(totalDuration, (x - TH) / pZoom));
                      setBladeHoverSec(sec);
                    } else {
                      setBladeHoverSec(null);
                    }
                  }
                  if (!marquee) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  setMarquee((m) => (m ? { ...m, curX: x, curY: y } : null));
                }}
                onPointerLeave={() => setBladeHoverSec(null)}
                onPointerUp={(e) => {
                  if (!marquee) return;
                  const left = Math.min(marquee.startX, marquee.curX);
                  const right = Math.max(marquee.startX, marquee.curX);
                  const top = Math.min(marquee.startY, marquee.curY);
                  const bottom = Math.max(marquee.startY, marquee.curY);
                  const moved = (right - left) > 4 || (bottom - top) > 4;
                  if (moved) {
                    // bbox hit-test:遍历所有 .ed-clip,看是否与矩形相交
                    const content = e.currentTarget as HTMLElement;
                    const contentRect = content.getBoundingClientRect();
                    const clipEls = content.querySelectorAll<HTMLElement>(".ed-clip[data-clip-id]");
                    const hit: string[] = [];
                    clipEls.forEach((el) => {
                      const r = el.getBoundingClientRect();
                      const elL = r.left - contentRect.left;
                      const elT = r.top - contentRect.top;
                      const elR = elL + r.width;
                      const elB = elT + r.height;
                      if (elR >= left && elL <= right && elB >= top && elT <= bottom) {
                        const id = el.getAttribute("data-clip-id");
                        if (id) hit.push(id);
                      }
                    });
                    const newSet = new Set(marqueeStartIdsRef.current);
                    for (const id of hit) newSet.add(id);
                    if (newSet.size > 0) {
                      setSelectedIds(newSet);
                      setSelectedId(hit[hit.length - 1] ?? [...newSet][0]);
                    } else {
                      // 空选 —— 用户在空白处拖了个矩形但没命中任何 clip → 清空选择
                      if (!marqueeStartIdsRef.current.size) {
                        setSelectedIds(new Set());
                        setSelectedId(undefined);
                      }
                    }
                  }
                  setMarquee(null);
                  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                }}
                onPointerCancel={() => setMarquee(null)}
              >
                {/* Time ruler — click + drag to scrub */}
                <div className="ed-ruler"
                  onPointerDown={(e) => {
                    if (totalDuration <= 0) return;
                    e.preventDefault();
                    scrubRef.current = true;
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seekTo(pct * totalDuration);
                  }}
                  onPointerMove={(e) => {
                    if (!scrubRef.current || totalDuration <= 0) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seekTo(pct * totalDuration);
                  }}
                  onPointerUp={(e) => {
                    scrubRef.current = false;
                    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                  }}
                  onPointerCancel={() => { scrubRef.current = false; }}
                >
                  {totalDuration > 0 && (() => {
                    // 主刻度 / 次刻度双层 —— 像视频播放器进度条 / Final Cut ruler
                    // zoom 决定密度:zoomed in 时主刻 1s,zoomed out 时主刻 5s/10s/30s
                    const zoom = pZoom;
                    const major = zoom >= 200 ? 1 : zoom >= 100 ? 2 : zoom >= 50 ? 5 : zoom >= 25 ? 10 : 30;
                    const minor = major / 5;
                    const ticks: React.ReactNode[] = [];
                    // 次刻度(短线、无 label)— 提供精度参照但不抢视觉
                    for (let t = 0; t <= totalDuration + 0.01; t += minor) {
                      // 跳过跟主刻度重合的位置
                      if (Math.abs((t % major)) < 0.001 || Math.abs((t % major) - major) < 0.001) continue;
                      ticks.push(
                        <div key={`minor-${t}`} className="ed-ruler-tick ed-ruler-tick-minor" style={{ left: `${(t / Math.max(0.01, totalDuration)) * 100}%` }} />
                      );
                    }
                    // 主刻度(长线 + 时间 label)
                    for (let t = 0; t <= totalDuration + 0.01; t += major) {
                      ticks.push(
                        <div key={`major-${t}`} className="ed-ruler-tick ed-ruler-tick-major" style={{ left: `${(t / Math.max(0.01, totalDuration)) * 100}%` }}>
                          <span className="ed-ruler-label">{fmtTime(t)}</span>
                        </div>
                      );
                    }
                    return ticks;
                  })()}
                </div>
                {/* Multi-track lanes —— 默认全显示,通过角色名 + 空态文案让新手懂每条干嘛 */}
                {pTracks.map((track) => {
                  const trackClips = clipsByTrack[track.id] ?? [];
                  const isAudio = track.kind === "audio";
                  const isPrimaryV1 = track.id === "v1";
                  const role = trackRoleInfo(track, zh);
                  return (
                    <div key={track.id} className={`ed-track ed-track-${track.kind}${track.locked ? " locked" : ""}${track.hidden ? " hidden" : ""}`}>
                      <div className={`ed-track-head${isAudio ? " ed-track-head-a" : " ed-track-head-v"}`} title={role.desc}>
                        <div className="ed-tl-meta">
                          <span className={`ed-tl-name${isAudio ? " ed-tl-name-a" : ""}`} title={role.desc}>
                            {role.name}
                          </span>
                          <span className={`ed-tl-code${isAudio ? " ed-tl-code-a" : ""}`}>{role.code}</span>
                        </div>
                        <div className="ed-tl-icons">
                          <button
                            className={`ed-track-ico${track.locked ? " on" : ""}`}
                            title={trackIconHint("lock", !!track.locked, isAudio, zh)}
                            aria-label={trackIconHint("lock", !!track.locked, isAudio, zh)}
                            onClick={() => updateTrack(track.id, { locked: !track.locked })}
                          >
                            {track.locked ? <IcoLock /> : <IcoUnlock />}
                          </button>
                          <button
                            className={`ed-track-ico${track.hidden ? " on" : ""}`}
                            title={trackIconHint("hide", !!track.hidden, isAudio, zh)}
                            aria-label={trackIconHint("hide", !!track.hidden, isAudio, zh)}
                            onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
                          >
                            {track.hidden ? <IcoEyeOff /> : <IcoEye />}
                          </button>
                          {isAudio && (
                            <button
                              className={`ed-track-ico${track.muted ? " on" : ""}`}
                              title={trackIconHint("mute", !!track.muted, isAudio, zh)}
                              aria-label={trackIconHint("mute", !!track.muted, isAudio, zh)}
                              onClick={() => updateTrack(track.id, { muted: !track.muted })}
                            >
                              {track.muted ? <IcoVolOff /> : <IcoVolOn />}
                            </button>
                          )}
                          <button
                            className={`ed-track-ico${track.solo ? " on" : ""}`}
                            title={trackIconHint("solo", !!track.solo, isAudio, zh)}
                            aria-label={trackIconHint("solo", !!track.solo, isAudio, zh)}
                            onClick={() => updateTrack(track.id, { solo: !track.solo })}
                          >
                            <IcoSolo />
                          </button>
                          {/* 删除轨道 —— v1 主轨锁住,其它都可删(连带清空轨上的 clip,所以前置 confirm) */}
                          {!isPrimaryV1 && (
                            <button
                              className="ed-track-ico ed-track-del"
                              title={
                                trackClips.length > 0
                                  ? zh
                                    ? `删除整条 ${role.name} 轨 · 连带删除轨上 ${trackClips.length} 段素材`
                                    : `Delete ${role.name} · also removes ${trackClips.length} clip(s) on it`
                                  : zh
                                    ? `删除整条 ${role.name} 轨(当前为空)`
                                    : `Delete ${role.name} (empty)`
                              }
                              aria-label={zh ? "删除轨道" : "Delete track"}
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: zh ? `删除"${role.name}"轨?` : `Delete "${role.name}" track?`,
                                  message:
                                    trackClips.length > 0
                                      ? zh
                                        ? `这条轨道上有 ${trackClips.length} 段素材,删除会一起清除(可 Cmd+Z 撤销)。`
                                        : `This track has ${trackClips.length} clip(s) on it. Deleting will remove them too (Cmd+Z to undo).`
                                      : zh
                                        ? "这条轨道当前为空,确定删除?"
                                        : "This track is empty. Delete it?",
                                  confirmText: zh ? "删除" : "Delete",
                                  cancelText: zh ? "取消" : "Cancel",
                                  danger: true,
                                });
                                if (ok) removeTrack(track.id);
                              }}
                            >
                              <IcoClose />
                            </button>
                          )}
                        </div>
                      </div>
                      <div
                        className={`ed-timeline ed-timeline-${track.kind}${isPrimaryV1 ? "" : " ed-timeline-secondary"}`}
                        onClick={(e) => {
                          if (totalDuration <= 0) return;
                          if ((e.target as HTMLElement).closest('.ed-clip')) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const sec = Math.max(0, Math.min(totalDuration, (e.clientX - rect.left) / pZoom));
                          // Blade 模式 —— 点击时间线 = 对所有轨道上覆盖该时间点的 clip 一刀切
                          if (tool === "blade") {
                            const targets = allClips.filter((c) => {
                              const cStart = c.startSec ?? 0;
                              const cEnd = cStart + Math.max(0.1, (c.out - c.in) / (c.speed || 1));
                              return sec > cStart + 0.05 && sec < cEnd - 0.05;
                            });
                            if (targets.length === 0) {
                              flash(zh ? "此处无可切分片段" : "No clips to slice here");
                              return;
                            }
                            editorBatch(() => {
                              for (const c of targets) {
                                const within = sec - (c.startSec ?? 0);
                                const sourceT = c.in + within * (c.speed || 1);
                                splitClip(c.id, sourceT);
                              }
                            });
                            // 切完动画 —— 切点 flash 一道金色亮线,420ms 后消失
                            if (bladeFlashTimerRef.current !== null) {
                              window.clearTimeout(bladeFlashTimerRef.current);
                            }
                            setBladeFlashSec(sec);
                            bladeFlashTimerRef.current = window.setTimeout(() => {
                              setBladeFlashSec(null);
                              bladeFlashTimerRef.current = null;
                            }, 420);
                            flash(
                              zh
                                ? `✂ 切分 ${targets.length} 段 @ ${sec.toFixed(2)}s`
                                : `✂ Sliced ${targets.length} clip(s) @ ${sec.toFixed(2)}s`
                            );
                            return;
                          }
                          seekTo(sec);
                        }}
                        onDragOver={(e) => {
                          if (track.locked) return;
                          const types = e.dataTransfer.types;
                          if (
                            types.includes("application/x-frame0-job") ||
                            types.includes("application/x-frame0-clip") ||
                            types.includes("Files")
                          ) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = types.includes("application/x-frame0-clip") ? "move" : "copy";
                            e.currentTarget.classList.add("drop-here");
                          }
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove("drop-here");
                        }}
                        onDrop={(e) => {
                          e.currentTarget.classList.remove("drop-here");
                          if (track.locked) return;
                          const movingClipId = e.dataTransfer.getData("application/x-frame0-clip");
                          if (movingClipId) {
                            e.preventDefault();
                            const movingClip = allClips.find((clip) => clip.id === movingClipId);
                            const movingIsAudio = movingClip?.mediaType === "audio";
                            if (movingClip && ((isAudio && !movingIsAudio) || (!isAudio && movingIsAudio))) {
                              flash(
                                isAudio
                                  ? (zh ? "音频轨只接收音频片段" : "Audio tracks accept audio clips")
                                  : (zh ? "视频轨只接收视频或图片片段" : "Video tracks accept video or image clips")
                              );
                              return;
                            }
                            // Compute drop time from X coordinate (absolute model),
                            // then move + reposition.
                            const rectMove = e.currentTarget.getBoundingClientRect();
                            const dropSec = Math.max(0, (e.clientX - rectMove.left) / pZoom);
                            moveClipToTrack(movingClipId, track.id);
                            setClipStart(movingClipId, dropSec);
                            return;
                          }
                          // 新增 clip(非"移动现有"):**自动 append 到本轨末尾**,
                          // 不管鼠标 X 坐标。空轨 → 0s,有 clip → 紧贴最后一个 clip 之后。
                          // 这是 CapCut/Final Cut 的默认行为 —— 用户不必精确瞄准时间点,
                          // 拖进来直接对齐,事后可拖拽手柄微调。
                          const appendSec = (() => {
                            const clipsOnTrack = trackClips;
                            if (clipsOnTrack.length === 0) return 0;
                            let maxEnd = 0;
                            for (const c of clipsOnTrack) {
                              const s = c.startSec ?? 0;
                              const ren = Math.max(0.1, (c.out - c.in) / (c.speed || 1));
                              if (s + ren > maxEnd) maxEnd = s + ren;
                            }
                            return maxEnd;
                          })();
                          const jobId = e.dataTransfer.getData("application/x-frame0-job");
                          if (jobId) {
                            e.preventDefault();
                            if (isAudio) {
                              flash(zh ? "工坊视频请拖到视频轨" : "Studio videos should go on a video track");
                              return;
                            }
                            const j = jobs.find((x) => x.id === jobId);
                            if (j) void addFromJob(j, { trackId: track.id, startSec: appendSec });
                            return;
                          }
                          const f = e.dataTransfer.files?.[0];
                          if (f) {
                            e.preventDefault();
                            void addLocalFile(f, { trackId: track.id, startSec: appendSec });
                          }
                        }}
                      >
                        {trackClips.length === 0 ? (
                          <div className="ed-timeline-hint">
                            <span className="ed-timeline-hint-role">{role.name}</span>
                            <span className="ed-timeline-hint-desc">
                              {isPrimaryV1 && allClips.length === 0
                                ? (zh ? "拖入素材或从左侧添加 · 这是主视频轨" : "Drop media or add from panel · this is the main video track")
                                : role.dropHint}
                            </span>
                          </div>
                        ) : (
                          trackClips.map((c) => {
                            // Filter out clip's own edges from pre-computed targets
                            const cStart = c.startSec ?? 0;
                            const cEnd = cStart + Math.max(0.1, (c.out - c.in) / (c.speed || 1));
                            const snapTargetsForClip = baseSnapTargets
                              ? baseSnapTargets.filter((t) => Math.abs(t - cStart) > 0.001 && Math.abs(t - cEnd) > 0.001)
                              : undefined;
                            return (
                              <TimelineClipBlock
                                key={c.id}
                                clip={c}
                                totalDuration={totalDuration}
                                pxPerSec={pZoom}
                                snapEnabled={snapEnabled}
                                snapTargets={snapTargetsForClip}
                                isSelected={selectedIds.has(c.id)}
                                isPlaying={c.id === playback.activeByTrack[track.id]?.id && playing}
                                onSelect={(meta) => {
                                  if (meta?.shiftKey) {
                                    toggleMultiSelect(c.id);
                                  } else {
                                    selectSingle(c.id);
                                  }
                                  if (tool === "split") {
                                    splitClipAtPlayhead(c);
                                    return;
                                  }
                                  if (typeof c.startSec === "number" && !meta?.shiftKey) {
                                    playback.seek(c.startSec);
                                  }
                                }}
                                onMove={(newStart) => setClipStart(c.id, newStart)}
                                onTrim={(patch) => updateClip(c.id, patch)}
                                onReorderDrop={(fromId) => reorderClip(fromId, c.id)}
                                onSnapIndicator={setSnapIndicatorSec}
                                onContextMenu={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, clipId: c.id })}
                              />
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* 加轨入口 —— 默认 5 条够 95% 场景,真有需要再加 */}
                <div className="ed-add-track-row">
                  <div className="ed-track-head" style={{ justifyContent: "flex-start", gap: 6 }}>
                    <button
                      className="ed-add-track-btn"
                      onClick={() => { addTrack("video"); flash(zh ? "已添加视频轨" : "Video track added"); }}
                      title={zh ? "新增一条视频轨(用于更多覆盖层 / 多机位)" : "Add a video track (more overlay layers / multi-cam)"}
                    >
                      + {zh ? "视频轨" : "Video"}
                    </button>
                    <button
                      className="ed-add-track-btn"
                      onClick={() => { addTrack("audio"); flash(zh ? "已添加音频轨" : "Audio track added"); }}
                      title={zh ? "新增一条音频轨(用于更多 BGM / 音效层)" : "Add an audio track (more BGM / SFX layers)"}
                    >
                      + {zh ? "音频轨" : "Audio"}
                    </button>
                  </div>
                  <div className="ed-timeline" style={{ minHeight: 28 }} />
                </div>
                {/* Snap indicator line */}
                {snapIndicatorSec !== null && totalDuration > 0 && (
                  <div className="ed-snap-line" style={{ left: `${TH + snapIndicatorSec * pZoom}px` }} />
                )}
                {/* Playhead —— 顶部 flag 内嵌时间码,跟 Final Cut / Resolve 一致 */}
                {totalDuration > 0 && (
                  <div className={`ed-playhead${playing ? " playing" : ""}`} style={{ left: `${TH + playheadSec * pZoom}px` }}>
                    <div className="ed-playhead-flag">
                      <span className="ed-playhead-tc">{fmtTime(playheadSec)}</span>
                    </div>
                    <div className="ed-playhead-line" />
                  </div>
                )}
                {/* Blade 模式 · hover 时显示金色虚线 + ✂ 标签 + scrubbing 缩略图 */}
                {tool === "blade" && bladeHoverSec !== null && totalDuration > 0 && (
                  <div className="ed-blade-hover" style={{ left: `${TH + bladeHoverSec * pZoom}px` }}>
                    <div className="ed-blade-hover-preview">
                      <video
                        ref={bladePreviewRef}
                        className="ed-blade-hover-thumb"
                        muted
                        playsInline
                        preload="auto"
                      />
                      <div className="ed-blade-hover-tag">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="6" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <line x1="20" y1="4" x2="8.12" y2="15.88" />
                          <line x1="14.47" y1="14.48" x2="20" y2="20" />
                          <line x1="8.12" y1="8.12" x2="12" y2="12" />
                        </svg>
                        <span>{bladeHoverSec.toFixed(2)}s</span>
                      </div>
                    </div>
                    <div className="ed-blade-hover-line" />
                  </div>
                )}
                {/* Blade 切完动画 · 在切点位置闪一道金色亮线,420ms 后消失 */}
                {bladeFlashSec !== null && totalDuration > 0 && (
                  <div className="ed-blade-flash" style={{ left: `${TH + bladeFlashSec * pZoom}px` }} />
                )}
                {/* 橡皮筋框选矩形 —— 在用户拖拽期间显示半透明蓝色矩形 */}
                {marquee && (
                  <div
                    className="ed-marquee"
                    style={{
                      left: Math.min(marquee.startX, marquee.curX),
                      top: Math.min(marquee.startY, marquee.curY),
                      width: Math.abs(marquee.curX - marquee.startX),
                      height: Math.abs(marquee.curY - marquee.startY),
                    }}
                  />
                )}
              </div>
            </div>
            {/* ─── Minimap ─── */}
            {totalDuration > 0 && allClips.length > 0 && (
              <div className="ed-minimap" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seekTo(pct * totalDuration);
                if (tlScrollRef.current) {
                  const targetPx = pct * tlScrollRef.current.scrollWidth;
                  tlScrollRef.current.scrollLeft = targetPx - tlScrollRef.current.clientWidth / 2;
                }
              }}>
                {allClips.map((c) => {
                  const rd = Math.max(0.1, (c.out - c.in) / (c.speed || 1));
                  const l = ((c.startSec ?? 0) / totalDuration) * 100;
                  const w = (rd / totalDuration) * 100;
                  const isA = (c.trackId ?? "v1").startsWith("a");
                  const row = c.trackId === "v2" ? 1 : c.trackId === "v3" ? 2 : isA ? 3 : 0;
                  return <div key={c.id} className={`ed-mm-blk${isA ? " a" : ""}${c.id === selectedId ? " sel" : ""}`} style={{ left: `${l}%`, width: `${Math.max(0.5, w)}%`, top: `${row * 25}%`, height: "25%" }} />;
                })}
                <div className="ed-mm-head" style={{ left: `${(playheadSec / totalDuration) * 100}%` }} />
                <div className="ed-mm-vp" style={{ left: `${minimapScrollPct}%`, width: `${Math.min(100, minimapViewPct)}%` }} />
              </div>
            )}
          </div>
          )}
        </main>

        {/* RIGHT: inspector —— L0 整列隐藏 */}
        {editorLevel > 0 && (
        <aside className="ed-inspect">
          {selected ? (
            <ClipInspector
              clip={selected}
              zh={zh}
              editorLevel={editorLevel as 1 | 2}
              onUpdate={(patch) => updateClip(selected.id, patch)}
              onMove={(dir) => moveClip(selected.id, dir)}
              onRemove={() => {
                // Revoke blob URL + delete IDB blob so local files don't leak
                if (selected.sourceUrl.startsWith("blob:")) {
                  URL.revokeObjectURL(selected.sourceUrl);
                }
                if (selected.localKey) {
                  void deleteLocalFile(selected.localKey);
                }
                removeClip(selected.id);
                flash(zh ? "已删除" : "Removed");
              }}
              isFirst={(() => { const tc = allClips.filter((c) => (c.trackId ?? "v1") === (selected.trackId ?? "v1")); return tc[0]?.id === selected.id; })()}
              isLast={(() => { const tc = allClips.filter((c) => (c.trackId ?? "v1") === (selected.trackId ?? "v1")); return tc[tc.length - 1]?.id === selected.id; })()}
            />
          ) : (
            <div className="ed-empty">
              {zh ? (
                <>
                  <div className="ed-empty-big">从左侧加素材</div>
                  <div className="ed-empty-hint">
                    URL 粘贴 · 档案/工坊拖入 · 本地文件上传
                  </div>
                  <div className="ed-empty-hint">
                    然后时间线上点击任一 clip → 这里就会出现剪辑面板
                  </div>
                </>
              ) : (
                <>
                  <div className="ed-empty-big">Add a clip on the left</div>
                  <div className="ed-empty-hint">
                    Paste URL · pick from archive · upload local
                  </div>
                  <div className="ed-empty-hint">
                    Then click a clip on the timeline to open its editor.
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
        )}
      </section>

      {/* Enhanced export progress panel */}
      {exportProgress && (() => {
        const pct = Math.round((exportProgress.pct ?? 0) * 100);
        const stageLabels: Record<string, string> = zh
          ? { loading: "加载引擎", downloading: "下载素材", processing: "编码处理", concat: "合并输出", done: "完成", error: "失败" }
          : { loading: "Loading engine", downloading: "Fetching clips", processing: "Encoding", concat: "Stitching", done: "Done", error: "Failed" };
        return (
          <div className="ed-export-panel">
            <div className="ed-export-panel-head">
              <span className="ed-export-panel-stage">{stageLabels[exportProgress.stage] ?? exportProgress.stage}</span>
              <span className="ed-export-panel-pct">{pct}%</span>
            </div>
            <div className="ed-export-panel-track">
              <div className="ed-export-panel-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="ed-export-panel-msg">{exportProgress.message}</div>
          </div>
        );
      })()}

      {/* Right-click context menu */}
      {ctxMenu && (() => {
        const mc = allClips.find((c) => c.id === ctxMenu.clipId);
        if (!mc) return null;
        return (
          <div className="ed-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ed-ctx-item" onClick={() => { selectSingle(mc.id); handleSplit(); setCtxMenu(null); }}>
              {zh ? "✂ 分割" : "✂ Split"}
            </button>
            <button type="button" className="ed-ctx-item" onClick={() => {
              const { id: clipId, ...rest } = mc;
              void clipId;
              const dur = (mc.out - mc.in) / (mc.speed || 1);
              addClip({ ...rest, startSec: (mc.startSec ?? 0) + dur });
              setCtxMenu(null); flash(zh ? "已复制" : "Duplicated");
            }}>
              {zh ? "📋 复制" : "📋 Duplicate"}
            </button>
            <button type="button" className="ed-ctx-item" onClick={() => { updateClip(mc.id, { muted: !mc.muted }); setCtxMenu(null); }}>
              {mc.muted ? (zh ? "🔊 取消静音" : "🔊 Unmute") : (zh ? "🔇 静音" : "🔇 Mute")}
            </button>
            <button type="button" className="ed-ctx-item" onClick={() => { updateClip(mc.id, { speed: mc.speed === 1 ? 2 : mc.speed === 2 ? 0.5 : 1 }); setCtxMenu(null); }}>
              {zh ? `⚡ 速度 → ${mc.speed === 1 ? "2x" : mc.speed === 2 ? "0.5x" : "1x"}` : `⚡ Speed → ${mc.speed === 1 ? "2x" : mc.speed === 2 ? "0.5x" : "1x"}`}
            </button>
            <div className="ed-ctx-sep" />
            <button type="button" className="ed-ctx-item" onClick={() => {
              if (mc.sourceUrl.startsWith("blob:")) URL.revokeObjectURL(mc.sourceUrl);
              if (mc.localKey) void deleteLocalFile(mc.localKey);
              rippleDeleteClip(mc.id); setCtxMenu(null);
              flash(zh ? "已 Ripple 删除 · 合拢" : "Ripple deleted · gap closed");
            }}
              title={zh ? "删除此段,同轨后续自动左移补位(Shift+Del)" : "Delete & close gap on the same track (Shift+Del)"}
            >
              {zh ? "🌊 删除并合拢" : "🌊 Ripple delete"}
            </button>
            <button type="button" className="ed-ctx-item danger" onClick={() => {
              if (mc.sourceUrl.startsWith("blob:")) URL.revokeObjectURL(mc.sourceUrl);
              if (mc.localKey) void deleteLocalFile(mc.localKey);
              removeClip(mc.id); setCtxMenu(null); flash(zh ? "已删除(留空)" : "Removed (gap kept)");
            }}
              title={zh ? "删除此段,保留时间线空洞(Del)" : "Delete, keep timeline gap (Del)"}
            >
              {zh ? "🗑 删除(留空)" : "🗑 Delete (keep gap)"}
            </button>
          </div>
        );
      })()}

      {toast && <div className="ed-toast">{toast}</div>}

      {/* 右下角悬浮 `?` —— 提示快捷键面板入口,1 秒发现 */}
      <button
        type="button"
        className="ed-help-btn"
        onClick={() => setShortcutsOpen(true)}
        title={zh ? "键盘快捷键 (按 ? 键)" : "Keyboard shortcuts (press ?)"}
        aria-label={zh ? "键盘快捷键" : "Keyboard shortcuts"}
      >
        ?
      </button>

      {/* 快捷键面板 —— `?` 弹出 / Esc / backdrop click 关闭 */}
      {shortcutsOpen && (
        <div className="ed-sc-backdrop" onClick={() => setShortcutsOpen(false)}>
          <div className="ed-sc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={zh ? "键盘快捷键" : "Keyboard shortcuts"}>
            <div className="ed-sc-head">
              <div>
                <div className="ed-sc-eyebrow">{zh ? "键盘速查" : "Keyboard"}</div>
                <div className="ed-sc-title">{zh ? "快捷键" : "Shortcuts"}</div>
              </div>
              <button type="button" className="ed-sc-close" onClick={() => setShortcutsOpen(false)} aria-label={zh ? "关闭" : "Close"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
              </button>
            </div>
            <div className="ed-sc-grid">
              <SCGroup title={zh ? "播放" : "Playback"}>
                <SCItem keys={["Space"]} desc={zh ? "播放 / 暂停" : "Play / Pause"} />
                <SCItem keys={["J", "K", "L"]} desc={zh ? "速度环(降 / 暂停 / 升)" : "Shuttle (down / pause / up)"} />
                <SCItem keys={["I"]} desc={zh ? "设入点" : "Set IN"} />
                <SCItem keys={["O"]} desc={zh ? "设出点" : "Set OUT"} />
                <SCItem keys={["←", "→"]} desc={zh ? "帧步进" : "Frame step"} />
              </SCGroup>
              <SCGroup title={zh ? "工具" : "Tools"}>
                <SCItem keys={["V"]} desc={zh ? "选择工具" : "Select"} />
                <SCItem keys={["C"]} desc={zh ? "分割工具" : "Split"} />
                <SCItem keys={["B"]} desc={zh ? "Blade(任意点切多轨)" : "Blade (cut all tracks)"} />
              </SCGroup>
              <SCGroup title={zh ? "编辑" : "Edit"}>
                <SCItem keys={["⌘", "Z"]} desc={zh ? "撤销" : "Undo"} />
                <SCItem keys={["⌘", "⇧", "Z"]} desc={zh ? "重做" : "Redo"} />
                <SCItem keys={["⌘", "D"]} desc={zh ? "复制片段" : "Duplicate clip"} />
                <SCItem keys={["Del"]} desc={zh ? "删除(留空)" : "Delete (keep gap)"} />
                <SCItem keys={["⇧", "Del"]} desc={zh ? "Ripple 删除(合拢)" : "Ripple delete (close gap)"} />
              </SCGroup>
              <SCGroup title={zh ? "选择" : "Selection"}>
                <SCItem keys={["⇧", zh ? "点击" : "Click"]} desc={zh ? "多选 toggle" : "Multi-select toggle"} />
                <SCItem keys={[zh ? "拖空白" : "Drag blank"]} desc={zh ? "橡皮筋框选" : "Marquee box select"} />
              </SCGroup>
              <SCGroup title={zh ? "面板" : "Panel"}>
                <SCItem keys={["?"]} desc={zh ? "显示/关闭此面板" : "Toggle this panel"} />
                <SCItem keys={["Esc"]} desc={zh ? "关闭弹层" : "Close overlays"} />
              </SCGroup>
            </div>
            <div className="ed-sc-foot">
              {zh ? "提示:鼠标拖时间线空白处可框选 · 滚轮 + ⌘ 可缩放时间线" : "Tip: drag blank timeline for marquee · ⌘+wheel to zoom"}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* —— 快捷键面板(从 modal 内 styled-jsx 合并到 global,避免 nested 报错) —— */
        .ed-sc-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: color-mix(in oklab, var(--ink) 80%, transparent);
          backdrop-filter: blur(12px) saturate(120%);
          -webkit-backdrop-filter: blur(12px) saturate(120%);
          display: grid;
          place-items: center;
          animation: ed-sc-fade 0.18s ease;
        }
        @keyframes ed-sc-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ed-sc-rise {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ed-sc-modal {
          width: min(720px, 90vw);
          max-height: 80vh;
          overflow-y: auto;
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--ink-2) 92%, transparent) 0%,
            color-mix(in oklab, var(--ink) 88%, transparent) 100%);
          border: 1px solid color-mix(in oklab, var(--paper) 8%, var(--line));
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-3);
          padding: 28px 32px 24px;
          animation: ed-sc-rise 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .ed-sc-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }
        .ed-sc-eyebrow {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
          line-height: 1;
        }
        .ed-sc-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          font-size: 32px;
          color: var(--paper);
          letter-spacing: -0.01em;
          line-height: 1.1;
          margin-top: 6px;
        }
        .ed-sc-close {
          width: 32px; height: 32px;
          background: transparent;
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          color: var(--paper-mute);
          cursor: pointer;
          display: grid; place-items: center;
          transition: all var(--ease-quick);
          flex-shrink: 0;
        }
        .ed-sc-close:hover {
          color: var(--paper);
          border-color: color-mix(in oklab, var(--paper) 22%, transparent);
          background: color-mix(in oklab, var(--paper) 5%, transparent);
        }
        .ed-sc-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px 28px;
        }
        @media (max-width: 640px) {
          .ed-sc-grid { grid-template-columns: 1fr; }
        }
        .ed-sc-foot {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid var(--line);
          font-family: var(--font-sans);
          font-size: 12px;
          color: var(--paper-mute);
          font-style: italic;
          text-align: center;
        }

        /* 右下角悬浮 "?" 帮助按钮 */
        .ed-help-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 36px; height: 36px;
          background: color-mix(in oklab, var(--ink-2) 88%, transparent);
          backdrop-filter: blur(8px);
          border: 1px solid color-mix(in oklab, var(--paper) 10%, var(--line));
          color: color-mix(in oklab, var(--paper) 70%, transparent);
          border-radius: 50%;
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 17px;
          font-weight: 500;
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: all var(--ease-spring);
          z-index: 50;
          box-shadow: var(--shadow-2);
          line-height: 1;
          padding-bottom: 2px;
        }
        .ed-help-btn:hover {
          color: var(--accent);
          border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
          background: color-mix(in oklab, var(--accent) 10%, var(--ink-2));
          transform: translateY(-2px);
          box-shadow:
            var(--shadow-2),
            0 0 0 4px color-mix(in oklab, var(--accent) 10%, transparent);
        }
        .ed-help-btn:active {
          transform: translateY(0) scale(0.94);
        }

        .editor-app {
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .ed-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 280px 1fr 340px;
          gap: 1px;
          background: var(--line);
          /* Leave room for fixed top chrome (~65px) so the project header
             & preview don't get hidden under the language switcher. */
          margin-top: 65px;
          height: calc(100vh - 65px);
          min-height: 0;
        }
        /* 预览区拖入高亮 —— 让"任何状态都能往中间一拖"显得直观 */
        .ed-preview-region.drop-target {
          outline: 2px dashed var(--accent);
          outline-offset: -8px;
          background: color-mix(in oklab, var(--accent) 8%, transparent);
        }

        /* 高级模式开关 */
        .ed-adv-toggle {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: 0.06em;
          cursor: pointer;
          margin-right: 8px;
          transition: border-color 0.15s, color 0.15s;
        }
        .ed-adv-toggle:hover { border-color: var(--paper-dim); color: var(--paper); }
        .ed-adv-toggle.on {
          border-color: var(--accent);
          color: var(--accent);
        }
        .ed-lib,
        .ed-main,
        .ed-inspect {
          background: var(--ink);
          overflow-y: auto;
        }
        .ed-main {
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow-y: hidden;
        }

        /* Library */
        .ed-lib-head {
          padding: 16px 16px 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper);
        }
        .ed-lib-addurl {
          padding: 4px 14px 12px;
          display: flex;
          gap: 6px;
        }
        .ed-input {
          flex: 1;
          background: var(--ink-3);
          border: 1px solid transparent;
          color: var(--paper);
          padding: 7px 10px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          border-radius: 6px;
          min-width: 0;
          transition: box-shadow 0.15s ease;
        }
        .ed-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 50%, transparent);
        }
        .ed-err {
          margin: 8px 14px;
          padding: 10px 12px;
          color: #ffb3aa;
          background: color-mix(in oklab, #ff5a4d 22%, transparent);
          border: 1px solid #ff5a4d;
          border-radius: 6px;
          font-family: var(--font-sans);
          font-size: 12.5px;
          line-height: 1.5;
          position: relative;
          padding-right: 32px;
        }
        .ed-err strong {
          display: inline-block;
          width: 18px;
          height: 18px;
          line-height: 18px;
          text-align: center;
          background: #ff5a4d;
          color: white;
          border-radius: 50%;
          font-family: var(--font-mono);
          font-size: 12px;
          margin-right: 6px;
        }
        .ed-err-close {
          position: absolute;
          top: 6px;
          right: 8px;
          background: transparent;
          border: none;
          color: #ffb3aa;
          font-size: 16px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
        }
        .ed-err-close:hover {
          color: white;
        }
        .ed-lib-upload {
          margin: 10px 14px;
          padding: 18px 12px;
          border: 1.5px dashed var(--line);
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
          border-radius: 6px;
        }
        .ed-lib-upload:hover,
        .ed-lib-upload.drag {
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 8%, transparent);
        }
        .ed-lib-upload-glyph {
          font-size: 20px;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .ed-lib-upload-text {
          font-family: var(--font-mono);
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--paper);
        }
        .ed-lib-upload-hint {
          margin-top: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--paper-mute);
        }
        .ed-lib-section {
          padding: 12px 16px 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .ed-lib-grid {
          padding: 6px 10px 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .ed-empty-small {
          grid-column: 1 / -1;
          padding: 20px 12px;
          text-align: center;
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 10.5px;
          line-height: 1.5;
        }
        .ed-lib-card {
          background: var(--ink-2);
          border: 1px solid transparent;
          border-radius: 8px;
          padding: 0;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          color: inherit;
          text-align: left;
          font: inherit;
          overflow: hidden;
          transition: all 0.15s;
        }
        .ed-lib-card:hover {
          background: var(--ink-3);
        }
        .ed-lib-card.sel {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent);
        }
        .ed-libpreview-banner {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 11;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0));
          color: var(--paper);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          pointer-events: auto;
        }
        .ed-libpreview-close {
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
          color: var(--paper);
          width: 22px;
          height: 22px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0;
        }
        .ed-libpreview-close:hover { background: rgba(255,255,255,0.2); }
        .ed-lib-thumb {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 10;
          background: #111;
          overflow: hidden;
        }
        .ed-lib-thumb video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .ed-lib-play {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: var(--paper-mute);
          font-size: 22px;
          pointer-events: none;
          opacity: 0.7;
          transition: opacity 0.15s;
        }
        .ed-lib-card:hover .ed-lib-play {
          opacity: 0;
        }
        .ed-lib-title {
          padding: 6px 8px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--paper);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Project head */
        .ed-project-head {
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 14px 20px 10px;
        }
        .ed-project-name {
          flex: 1;
          background: transparent;
          border: 1px solid transparent;
          color: var(--paper);
          padding: 4px 10px;
          font-family: var(--font-serif);
          font-size: 26px;
          font-weight: 400;
          font-style: italic;
          letter-spacing: -0.005em;
          line-height: 1.1;
          border-radius: 6px;
          transition: border-color 0.15s, background 0.15s;
        }
        .ed-project-name:hover {
          border-color: color-mix(in oklab, var(--paper) 18%, transparent);
          background: color-mix(in oklab, var(--paper) 3%, transparent);
        }
        .ed-project-name:focus {
          outline: none;
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 6%, transparent);
        }
        .ed-project-name::placeholder {
          color: var(--paper-mute);
          font-style: italic;
        }
        .ed-project-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        /* Aspect 选择器 —— 跟 Tools bar 同一套 token */
        .ed-aspect-group {
          display: flex;
          gap: 1px;
          background: var(--bg-sunken);
          padding: 2px;
          border: 1px solid color-mix(in oklab, var(--paper) 5%, var(--line));
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sunken);
        }
        .ed-aspect {
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          color: var(--paper-mute);
          padding: 5px 11px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all var(--ease-smooth);
        }
        .ed-aspect:hover:not(.on) {
          color: var(--paper);
          background: color-mix(in oklab, var(--paper) 6%, transparent);
        }
        .ed-aspect.on {
          background: var(--gradient-cta);
          color: var(--cta-ink);
          box-shadow: var(--shadow-cta);
        }
        .ed-xfade {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: var(--ink-2);
          border-radius: 6px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .ed-xfade input[type="range"] {
          width: 90px;
          accent-color: var(--accent);
        }
        .ed-xfade-val {
          color: var(--accent);
          min-width: 30px;
          text-align: right;
        }
        .ed-btn {
          background: var(--ink-3);
          border: 1px solid transparent;
          color: var(--paper);
          padding: 7px 14px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.15s;
        }
        .ed-btn:hover:not(:disabled):not(.primary):not(.danger) {
          background: color-mix(in oklab, var(--accent) 16%, var(--ink-3));
          color: var(--accent);
        }
        .ed-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        /* Primary CTA(导出 MP4)—— 用 design token 跟 play/aspect.on/tool.on 共享同套视觉 */
        .ed-btn.primary {
          background: var(--gradient-cta);
          border: none;
          color: var(--cta-ink);
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 9px 18px;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-cta);
          transition: transform var(--ease-spring), box-shadow var(--ease-quick), filter var(--ease-quick);
        }
        .ed-btn.primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: var(--shadow-cta-hover);
          filter: brightness(1.06);
        }
        .ed-btn.primary:active:not(:disabled) {
          transform: translateY(0) scale(0.97);
          transition-duration: 0.08s;
        }
        .ed-btn.danger:hover:not(:disabled) {
          border-color: #c44;
          color: #c44;
        }

        /* Preview — flex 由 inline style 控制(可拖 splitter),默认 2(预览 2/3,时间线 1/3) */
        .ed-preview-region {
          flex: 2 1 0;
          min-height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          overflow: hidden;
        }

        /* 水平分隔条 —— 拖拽改预览/时间线比例。grip 是中间小条让用户知道这里能拖 */
        .ed-h-splitter {
          flex: 0 0 auto;
          height: 8px;
          background: transparent;
          cursor: row-resize;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: none;
          transition: background 0.15s;
        }
        .ed-h-splitter::before {
          content: "";
          position: absolute;
          left: 0; right: 0; top: 50%;
          height: 1px;
          background: var(--line);
          transform: translateY(-50%);
        }
        .ed-h-splitter-grip {
          width: 44px;
          height: 4px;
          background: color-mix(in oklab, var(--paper) 18%, transparent);
          border-radius: 2px;
          transition: background 0.15s, transform 0.15s;
          z-index: 1;
        }
        .ed-h-splitter:hover .ed-h-splitter-grip {
          background: var(--accent);
          transform: scaleX(1.4);
        }
        .ed-h-splitter:active .ed-h-splitter-grip {
          background: var(--accent);
          transform: scaleX(1.6);
        }
        /* 预览画布 —— "专业取景框"感
           - 微 inner shadow + 浅 outer shadow,让画布像悬浮卡片而非贴底
           - 4 角 corner brackets(像电影取景框 / 监视器画面定位标记)
           - 整体 radius 4px,跟系统精修语言一致 */
        .ed-preview {
          width: 100%;
          max-width: 100%;
          max-height: 100%;
          background: black;
          border: 1px solid color-mix(in oklab, var(--paper) 6%, var(--line));
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          display: grid;
          place-items: center;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            inset 0 0 0 1px rgba(255, 255, 255, 0.02),
            inset 0 1px 2px rgba(0, 0, 0, 0.6);
        }
        /* 4 角 corner bracket —— 取景框标记,8px 长 L 形 */
        .ed-preview::before,
        .ed-preview::after {
          content: "";
          position: absolute;
          width: 14px; height: 14px;
          border-style: solid;
          border-color: color-mix(in oklab, var(--paper) 25%, transparent);
          pointer-events: none;
          z-index: 4;
          transition: border-color 0.25s;
        }
        .ed-preview::before {
          top: 8px; left: 8px;
          border-width: 1.5px 0 0 1.5px;
          border-radius: 2px 0 0 0;
        }
        .ed-preview::after {
          bottom: 8px; right: 8px;
          border-width: 0 1.5px 1.5px 0;
          border-radius: 0 0 2px 0;
        }
        .ed-preview:hover::before,
        .ed-preview:hover::after {
          border-color: color-mix(in oklab, var(--accent) 55%, transparent);
        }
        .ed-preview video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .ed-hidden-audio {
          display: none;
        }
        .ed-preview-clickcatch {
          position: absolute;
          inset: 0;
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
          cursor: pointer;
          z-index: 5;
        }
        .ed-preview-clickcatch:focus { outline: none; }
        /* 空状态 —— 大图标 + serif italic 标题 + sans 引导 */
        .ed-preview-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 20px;
        }
        .ed-preview-empty-icon {
          width: 88px; height: 88px;
          border-radius: 18px;
          background: linear-gradient(135deg,
            color-mix(in oklab, var(--accent) 14%, transparent) 0%,
            color-mix(in oklab, var(--ink-3) 50%, transparent) 100%);
          border: 1px solid color-mix(in oklab, var(--accent) 24%, var(--line));
          display: grid; place-items: center;
          color: color-mix(in oklab, var(--accent) 80%, var(--paper));
          box-shadow:
            0 4px 24px color-mix(in oklab, var(--accent) 15%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .ed-preview-empty-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 26px;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--paper);
          line-height: 1.1;
        }
        .ed-preview-empty-sub {
          font-family: var(--font-sans);
          font-size: 12.5px;
          color: var(--paper-mute);
          letter-spacing: 0.01em;
        }
        /* ═══ Transport bar ═══ */
        /* Transport bar —— 中央大圆 play 按钮,辅助按钮安静低调
           顶部 1px highlight + 底部 1px shadow 制造"精修面板"分层感 */
        .ed-transport {
          position: relative;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-top: 1px solid color-mix(in oklab, var(--paper) 4%, var(--line));
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--ink) 92%, var(--ink-2)) 0%,
              color-mix(in oklab, var(--ink) 96%, var(--ink-2)) 100%);
          flex-shrink: 0;
        }
        /* 底部 1px shadow 增加分层 */
        .ed-transport::after {
          content: "";
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 10%, transparent), transparent);
        }
        .ed-tr-group { display: flex; gap: 1px; }
        /* 辅助按钮 —— 收紧、低对比,hover 才显气质 */
        .ed-tr-btn {
          width: 26px; height: 26px;
          display: grid; place-items: center;
          background: transparent;
          border: 1px solid transparent;
          color: color-mix(in oklab, var(--paper-dim) 90%, transparent);
          font-size: 12px; cursor: pointer;
          border-radius: 6px;
          transition: all 0.14s ease;
          padding: 0;
          font-family: var(--font-mono);
        }
        .ed-tr-btn:hover:not(:disabled) {
          background: color-mix(in oklab, var(--paper) 6%, transparent);
          color: var(--paper);
          border-color: color-mix(in oklab, var(--paper) 12%, transparent);
          transform: translateY(-1px);
        }
        .ed-tr-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.96);
        }
        .ed-tr-btn:disabled { opacity: 0.22; cursor: default; }

        /* 中央播放按钮 —— Apple-grade,圆形 + 同套 CTA token */
        .ed-tr-play {
          width: 34px; height: 34px;
          display: grid; place-items: center;
          background: var(--gradient-cta);
          border: none;
          color: var(--cta-ink);
          font-size: 14px;
          cursor: pointer;
          border-radius: 50%;
          padding: 0;
          transition: transform var(--ease-spring), box-shadow var(--ease-quick), filter var(--ease-quick);
          box-shadow: var(--shadow-cta);
        }
        .ed-tr-play:hover:not(:disabled) {
          transform: scale(1.06);
          box-shadow: var(--shadow-cta-hover);
          filter: brightness(1.06);
        }
        .ed-tr-play:active:not(:disabled) {
          transform: scale(0.94);
          transition-duration: 0.08s;
        }
        .ed-tr-play:disabled {
          opacity: 0.35;
          cursor: default;
          box-shadow: none;
          background: var(--ink-3);
          color: var(--paper-mute);
        }

        .ed-tr-center { display: flex; align-items: center; gap: 2px; }
        /* 时间码 —— 当前时间用 mono 中字突出,总时长更轻 */
        .ed-tr-tc {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          margin-left: 10px;
          padding: 3px 10px;
          background: color-mix(in oklab, var(--ink-2) 60%, transparent);
          border-radius: 6px;
          border: 1px solid color-mix(in oklab, var(--paper) 5%, var(--line));
          font-variant-numeric: tabular-nums;
        }
        .ed-tc-cur {
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1;
        }
        .ed-tc-sep {
          color: color-mix(in oklab, var(--paper-mute) 60%, transparent);
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 11px;
          line-height: 1;
        }
        .ed-tc-tot {
          color: var(--paper-dim);
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.04em;
          line-height: 1;
        }
        .ed-tr-spacer { flex: 1; }
        .ed-bar-sep {
          width: 1px; height: 18px;
          background: color-mix(in oklab, var(--line) 50%, transparent);
          margin: 0 8px; flex-shrink: 0;
        }
        .ed-overlay {
          position: absolute;
          left: 50%;
          width: max-content;
          max-width: min(92%, 960px);
          text-align: center;
          font-family: var(--font-sans);
          font-weight: 600;
          line-height: 1.25;
          white-space: pre-line;
          overflow-wrap: anywhere;
          padding: 8px 14px;
          transform: translateX(-50%);
          text-shadow:
            0 2px 4px rgba(0, 0, 0, 0.8),
            0 0 8px rgba(0, 0, 0, 0.4);
          pointer-events: none;
        }
        .ed-overlay span {
          display: block;
        }
        .ed-overlay-top {
          top: 6%;
        }
        .ed-overlay-center {
          top: 50%;
          transform: translate(-50%, -50%);
        }
        .ed-overlay-bottom {
          bottom: 6%;
        }

        /* ═══ Timeline area ═══
           min-height 设得很小,让 splitter 真能把底部压到只剩轨道。
           max-height 取消,完全跟随 previewFlex 决定。 */
        .ed-tl-area {
          flex: 0 1 auto;
          display: flex;
          flex-direction: column;
          min-height: 140px;
          border-top: 1px solid var(--line);
        }
        .ed-tl-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 12px;
          background: color-mix(in oklab, var(--ink-2) 70%, var(--ink));
          border-bottom: 1px solid var(--line);
          flex-shrink: 0;
        }
        .ed-tl-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .ed-tl-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 6px;
          background: color-mix(in oklab, var(--accent) 18%, transparent);
          color: var(--accent);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          border-radius: 6px;
          border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
        }
        /* 轨道角色名(主视频 / 覆盖 1 / 原声 / 配乐)—— serif italic 高级,
           跟项目名顶栏字体语言呼应 */
        .ed-tl-name {
          font-family: var(--font-serif);
          font-size: 11px;
          font-weight: 500;
          font-style: italic;
          letter-spacing: -0.005em;
          color: color-mix(in oklab, var(--paper) 88%, transparent);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
          cursor: help;
          line-height: 1.1;
        }
        .ed-tl-name-a { color: #4ea8f7; }
        /* 旁边的 V1/V2/A1 代号小字 —— 给熟练用户做参考 */
        .ed-tl-code {
          font-family: var(--font-mono);
          font-size: 7.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--paper-mute);
          padding: 0 3px;
          background: color-mix(in oklab, var(--paper) 5%, transparent);
          border-radius: 2px;
          flex-shrink: 0;
          line-height: 1.4;
        }
        .ed-tl-code-a {
          color: color-mix(in oklab, #4ea8f7 80%, var(--paper-mute));
          background: color-mix(in oklab, #4ea8f7 12%, transparent);
        }
        .ed-tl-zoom {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .ed-tl-zoom-val {
          min-width: 50px;
          text-align: center;
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--paper-dim);
          letter-spacing: 0.08em;
        }
        .ed-timeline-scroll {
          flex: 1;
          overflow-x: auto;
          overflow-y: auto;
          position: relative;
        }
        .ed-timeline-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .ed-timeline-scroll::-webkit-scrollbar-track { background: var(--ink); }
        .ed-timeline-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 6px; }
        .ed-tl-content { min-height: 100%; min-width: 100%; }
        /* Blade 工具激活时 —— timeline 区显示十字光标,提示"点击下刀" */
        /* Blade 工具 —— 竖向 ✂ cursor,刀尖朝下,hotspot 在刀尖 (12, 28)
           对应屏幕上"实际下刀位置" —— 跟时间线 X 坐标精准对齐 */
        .ed-tl-content[data-tool="blade"] .ed-timeline {
          cursor: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='32' viewBox='0 0 24 30' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='7' cy='5' r='3' fill='%23ffd54a' stroke='%23000'/%3E%3Ccircle cx='17' cy='5' r='3' fill='%23ffd54a' stroke='%23000'/%3E%3Cline x1='9' y1='8' x2='12' y2='14' stroke='%23ffd54a' stroke-width='2.4'/%3E%3Cline x1='15' y1='8' x2='12' y2='14' stroke='%23ffd54a' stroke-width='2.4'/%3E%3Cline x1='12' y1='14' x2='12' y2='28' stroke='%23ffd54a' stroke-width='2.4'/%3E%3Ccircle cx='12' cy='28' r='1' fill='%23ffd54a'/%3E%3C/svg%3E") 12 28, crosshair;
        }

        /* Blade hover 竖线 + 缩略图预览 —— hover 时显示"这里下刀 + 该帧画面" */
        .ed-blade-hover {
          position: absolute;
          top: 0; bottom: 0;
          z-index: 9;
          pointer-events: none;
          transform: translateX(-1px);
        }
        .ed-blade-hover-line {
          position: absolute;
          top: 80px; bottom: 0;
          left: 0; width: 2px;
          background: repeating-linear-gradient(
            to bottom,
            #ffd54a 0,
            #ffd54a 4px,
            transparent 4px,
            transparent 8px
          );
          box-shadow: 0 0 6px rgba(255, 213, 74, 0.7);
        }
        /* 缩略图 + 时间 tag 一组,top 偏移让它们不跟时间轴 ruler 重叠 */
        .ed-blade-hover-preview {
          position: absolute;
          top: 4px;
          left: 0;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
        }
        /* scrubbing 缩略图 —— 跟随 hover 时间点显示对应帧,80×45 (16:9) */
        .ed-blade-hover-thumb {
          width: 96px;
          height: 54px;
          object-fit: cover;
          background: #000;
          border: 2px solid #ffd54a;
          border-radius: 4px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 213, 74, 0.4);
        }
        .ed-blade-hover-tag {
          margin-top: -1px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          background: #ffd54a;
          color: #000;
          border-radius: 0 0 4px 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .ed-blade-hover-tag::after {
          content: "";
          position: absolute;
          bottom: -3px; left: 50%;
          transform: translateX(-50%);
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 4px solid #ffd54a;
        }

        /* Blade 切完动画 —— 切点闪一道金色亮线,420ms 衰减消失 */
        @keyframes blade-flash {
          0%   { opacity: 1;  transform: translateX(-50%) scaleX(1);   filter: blur(0px); }
          40%  { opacity: 0.9; transform: translateX(-50%) scaleX(2.5); filter: blur(2px); }
          100% { opacity: 0;  transform: translateX(-50%) scaleX(6);   filter: blur(4px); }
        }
        .ed-blade-flash {
          position: absolute;
          top: 28px; bottom: 0;
          width: 3px;
          z-index: 11;
          pointer-events: none;
          background: linear-gradient(180deg,
            rgba(255, 213, 74, 0) 0%,
            rgba(255, 213, 74, 1) 12%,
            rgba(255, 235, 130, 1) 50%,
            rgba(255, 213, 74, 1) 88%,
            rgba(255, 213, 74, 0) 100%);
          box-shadow:
            0 0 12px 2px rgba(255, 213, 74, 0.9),
            0 0 28px 8px rgba(255, 213, 74, 0.45);
          animation: blade-flash 420ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        }
        /* 橡皮筋框选矩形 —— 半透明蓝色,虚线边框,不接收 pointer 事件 */
        .ed-marquee {
          position: absolute;
          z-index: 99;
          background: color-mix(in oklab, var(--accent) 12%, transparent);
          border: 1px dashed var(--accent);
          pointer-events: none;
          border-radius: 2px;
        }
        /* Time ruler */
        .ed-ruler {
          position: relative;
          height: 24px;
          margin-left: 96px;
          border-bottom: 1px solid var(--line);
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--ink-2) 60%, var(--ink)) 0%,
            color-mix(in oklab, var(--ink-2) 40%, var(--ink)) 100%);
          cursor: col-resize;
          user-select: none;
        }
        .ed-ruler:active {
          cursor: col-resize;
        }
        .ed-ruler::after {
          content: "";
          position: absolute;
          bottom: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 20%, transparent), transparent);
        }
        /* 次刻度 —— 短线条,无 label,提供精度参照不抢视觉 */
        .ed-ruler-tick-minor {
          position: absolute;
          top: auto; bottom: 0;
          height: 4px;
          width: 1px;
          background: color-mix(in oklab, var(--paper) 8%, transparent);
        }
        /* 主刻度 —— 全高竖线 + 底部加粗短线 + 时间 label */
        .ed-ruler-tick-major {
          position: absolute;
          top: 0; bottom: 0;
          width: 1px;
          background: color-mix(in oklab, var(--paper) 8%, transparent);
        }
        .ed-ruler-tick-major::after {
          content: "";
          position: absolute;
          bottom: 0; left: -1px;
          width: 1px; height: 8px;
          background: color-mix(in oklab, var(--accent) 50%, var(--paper-mute));
        }
        .ed-ruler-label {
          position: absolute;
          top: 5px; left: 5px;
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 600;
          color: color-mix(in oklab, var(--paper) 75%, transparent);
          white-space: nowrap;
          pointer-events: none;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
        }
        /* Playhead —— flag 顶部内嵌时间码 + 倒锥指针 + 红色光线
           跟 Final Cut Pro / DaVinci Resolve / Premiere 视觉对齐 */
        .ed-playhead {
          position: absolute;
          top: 0; bottom: 0;
          z-index: 10;
          pointer-events: none;
        }
        /* flag —— pill 形容器顶部内嵌时间码,底部锥形指针 */
        .ed-playhead-flag {
          position: absolute;
          top: 2px;
          left: 0;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          height: 16px;
          padding: 0 7px;
          background: #ff3b3b;
          border-radius: 3px 3px 3px 0;
          box-shadow:
            0 2px 6px rgba(255, 59, 59, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          z-index: 2;
        }
        /* 时间码 mono tabular,白色高对比 */
        .ed-playhead-tc {
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.04em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
        }
        /* flag 底部倒锥 —— ::after 画小三角指向 line */
        .ed-playhead-flag::after {
          content: "";
          position: absolute;
          left: 0; bottom: -4px;
          width: 0; height: 0;
          border-top: 4px solid #ff3b3b;
          border-right: 5px solid transparent;
        }
        /* 红色光线 —— 主线 2px + 双层光晕,playing 时强化光晕 */
        .ed-playhead-line {
          position: absolute;
          top: 18px; bottom: 0;
          left: -1px; width: 2px;
          background: #ff3b3b;
          box-shadow:
            0 0 6px rgba(255, 59, 59, 0.65),
            0 0 14px rgba(255, 59, 59, 0.25);
          transition: box-shadow var(--ease-quick);
        }
        /* 播放中 —— line 光晕加强,呼应"正在前进"的动感 */
        .ed-playhead.playing .ed-playhead-line {
          box-shadow:
            0 0 10px rgba(255, 59, 59, 0.85),
            0 0 22px rgba(255, 59, 59, 0.4),
            0 0 38px rgba(255, 59, 59, 0.15);
        }
        .ed-timeline {
          /* Absolute positioning: clips are placed by left/width based on
             their startSec * pxPerSec. */
          position: relative;
          padding: 2px 0;
          min-height: 30px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .ed-timeline-secondary {
          min-height: 24px;
          opacity: 0.85;
        }
        .ed-timeline-audio {
          min-height: 20px;
        }
        .ed-clip {
          cursor: grab;
        }
        .ed-clip:active { cursor: grabbing; }
        /* Split tool: scissors cursor on clips */
        .editor-app[data-tool="split"] .ed-clip {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ff3b3b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='6' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cline x1='20' y1='4' x2='8.12' y2='15.88'/%3E%3Cline x1='14.47' y1='14.48' x2='20' y2='20'/%3E%3Cline x1='8.12' y1='8.12' x2='12' y2='12'/%3E%3C/svg%3E") 12 12, crosshair;
        }
        .editor-app[data-tool="split"] .ed-clip:active {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ff3b3b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='6' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cline x1='20' y1='4' x2='8.12' y2='15.88'/%3E%3Cline x1='14.47' y1='14.48' x2='20' y2='20'/%3E%3Cline x1='8.12' y1='8.12' x2='12' y2='12'/%3E%3C/svg%3E") 12 12, crosshair;
        }
        /* Split tool: crosshair on timeline background */
        .editor-app[data-tool="split"] .ed-timeline {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ff3b3b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='6' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cline x1='20' y1='4' x2='8.12' y2='15.88'/%3E%3Cline x1='14.47' y1='14.48' x2='20' y2='20'/%3E%3Cline x1='8.12' y1='8.12' x2='12' y2='12'/%3E%3C/svg%3E") 12 12, crosshair;
        }
        .ed-track {
          display: flex;
          flex-direction: row;
          border-bottom: 1px solid color-mix(in oklab, var(--line) 50%, transparent);
        }
        .ed-track:last-child { border-bottom: none; }
        .ed-track.locked .ed-timeline { cursor: not-allowed; opacity: 0.6; }
        .ed-track.hidden .ed-timeline { opacity: 0.4; }
        /* 紧凑模式 —— 头部宽 84,padding 极薄,把焦点留给预览/视频 */
        .ed-track-head {
          position: sticky;
          left: 0;
          z-index: 6;
          width: 84px;
          flex: 0 0 84px;
          padding: 2px 5px 2px 7px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 1px;
          background: color-mix(in oklab, var(--ink) 96%, var(--ink-2));
          border-right: 1px solid var(--line);
        }
        /* 左侧色条:video 用 accent 橙,audio 用蓝色 —— 1 秒分辨轨道类型 */
        .ed-track-head::before {
          content: "";
          position: absolute;
          left: 0; top: 4px; bottom: 4px;
          width: 2px;
          border-radius: 0 2px 2px 0;
        }
        .ed-track-head-v::before { background: var(--accent); }
        .ed-track-head-a::before { background: #4ea8f7; }
        /* meta = 名字 + 代号 一行 */
        .ed-tl-meta {
          display: flex;
          align-items: baseline;
          gap: 4px;
          min-width: 0;
        }
        /* icons 一行 —— gap 收到 1px,挤但仍能点 */
        .ed-tl-icons {
          display: flex;
          align-items: center;
          gap: 1px;
        }
        .ed-track-ico {
          width: 14px;
          height: 14px;
          font-size: 9px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--paper-mute);
          padding: 0;
          cursor: pointer;
          border-radius: 3px;
          display: grid;
          place-items: center;
          transition: all 0.15s ease;
        }
        .ed-track-ico:hover {
          color: var(--paper);
          border-color: var(--line);
          background: color-mix(in oklab, var(--paper) 5%, transparent);
        }
        .ed-track-ico.on {
          color: var(--accent);
          border-color: color-mix(in oklab, var(--accent) 40%, transparent);
          background: color-mix(in oklab, var(--accent) 10%, transparent);
        }
        /* 删除按钮 hover 时变红 —— 视觉警告这是不可恢复(虽然能撤销) */
        .ed-track-ico.ed-track-del { color: color-mix(in oklab, var(--paper-mute) 50%, transparent); }
        .ed-track-ico.ed-track-del:hover {
          color: #ff5a5a;
          border-color: color-mix(in oklab, #ff5a5a 40%, transparent);
          background: color-mix(in oklab, #ff5a5a 10%, transparent);
        }
        .ed-track .ed-timeline { flex: 1; }
        .ed-add-track-row {
          display: flex;
          flex-direction: row;
          border-bottom: 1px solid color-mix(in oklab, var(--line) 50%, transparent);
        }
        .ed-add-track-btn {
          background: transparent;
          border: 1px dashed var(--line);
          color: var(--paper-mute);
          padding: 1px 6px;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ed-add-track-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: color-mix(in oklab, var(--accent) 8%, transparent);
        }
        /* Tools bar —— segmented control 容器 + token 化的 .on 状态 */
        .ed-tools {
          display: inline-flex;
          gap: 1px;
          padding: 2px;
          background: var(--bg-sunken);
          border: 1px solid color-mix(in oklab, var(--paper) 5%, var(--line));
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sunken);
        }
        .ed-tool-btn {
          width: 24px;
          height: 22px;
          background: transparent;
          border: none;
          color: color-mix(in oklab, var(--paper-mute) 90%, transparent);
          cursor: pointer;
          padding: 0;
          display: grid;
          place-items: center;
          border-radius: var(--radius-sm);
          transition: all var(--ease-smooth);
        }
        .ed-tool-btn:hover:not(.on) {
          color: var(--paper);
          background: color-mix(in oklab, var(--paper) 8%, transparent);
        }
        .ed-tool-btn.on {
          background: var(--gradient-cta);
          color: var(--cta-ink);
          box-shadow: var(--shadow-cta);
        }
        .ed-tool-btn:active {
          transform: scale(0.92);
        }
        .ed-tl-divider {
          display: inline-block;
          width: 1px;
          height: 16px;
          background: var(--line);
          margin: 0 8px;
        }
        .ed-tl-stats {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--paper-mute);
        }
        .ed-timeline.drop-here {
          background: color-mix(in oklab, var(--accent) 12%, transparent);
          outline: 2px dashed var(--accent);
          outline-offset: -2px;
          animation: ed-drop-pulse 1s ease-in-out infinite;
        }
        @keyframes ed-drop-pulse {
          0%, 100% { background: color-mix(in oklab, var(--accent) 8%, transparent); }
          50% { background: color-mix(in oklab, var(--accent) 16%, transparent); }
        }
        .ed-clip.drop-target {
          box-shadow: -3px 0 0 var(--accent), 0 0 0 2px var(--accent);
        }
        .ed-lib-card[draggable="true"] { cursor: grab; }
        .ed-lib-card[draggable="true"]:active { cursor: grabbing; }
        /* A1 audio lane */
        .ed-audio-lane {
          display: flex;
          gap: 2px;
          padding: 2px 0 6px;
          min-height: 28px;
          align-items: stretch;
          border-top: 1px solid color-mix(in oklab, var(--line) 50%, transparent);
        }
        .ed-tl-badge-a {
          background: color-mix(in oklab, #4ea8f7 18%, transparent) !important;
          color: #4ea8f7 !important;
          border-color: color-mix(in oklab, #4ea8f7 30%, transparent) !important;
          align-self: center;
          margin-right: 4px;
          flex-shrink: 0;
        }
        .ed-audio-block {
          flex-grow: 1; flex-shrink: 1;
          min-width: 20px;
          background: color-mix(in oklab, #4ea8f7 10%, var(--ink-2));
          border: 1px solid color-mix(in oklab, #4ea8f7 20%, var(--line));
          border-top: 2px solid #4ea8f7;
          border-radius: 6px;
          overflow: hidden;
          position: relative;
        }
        .ed-audio-block.muted {
          opacity: 0.3;
          border-top-color: var(--paper-mute);
        }
        .ed-audio-wave {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            90deg,
            transparent 0px,
            color-mix(in oklab, #4ea8f7 14%, transparent) 1px,
            color-mix(in oklab, #4ea8f7 22%, transparent) 2px,
            transparent 3px,
            transparent 4px
          );
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='24'%3E%3Cpath d='M0,12 Q5,4 10,12 Q15,20 20,12 Q25,6 30,12 Q35,18 40,12 Q45,3 50,12 Q55,21 60,12 Q65,5 70,12 Q75,19 80,12 Q85,7 90,12 Q95,17 100,12 Q105,4 110,12 Q115,20 120,12' fill='none' stroke='white' stroke-width='8'/%3E%3C/svg%3E");
          mask-size: 120px 100%;
          mask-repeat: repeat-x;
          -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='24'%3E%3Cpath d='M0,12 Q5,4 10,12 Q15,20 20,12 Q25,6 30,12 Q35,18 40,12 Q45,3 50,12 Q55,21 60,12 Q65,5 70,12 Q75,19 80,12 Q85,7 90,12 Q95,17 100,12 Q105,4 110,12 Q115,20 120,12' fill='none' stroke='white' stroke-width='8'/%3E%3C/svg%3E");
          -webkit-mask-size: 120px 100%;
          -webkit-mask-repeat: repeat-x;
        }
        .ed-audio-empty {
          flex: 1;
        }
        /* BGM row in library sidebar. */
        .ed-bgm-row {
          margin: 8px 14px 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ed-bgm-row input[type="range"] {
          flex: 1;
          min-width: 80px;
        }
        .ed-bgm-name {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--accent);
          flex: 1 1 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ed-bgm-add {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          width: 100%;
          background: transparent;
          border: 1.5px dashed var(--line);
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ed-bgm-add:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .ed-bgm-glyph {
          font-size: 16px;
          line-height: 1;
          color: var(--accent);
        }
        /* Reused select styling for export resolution. */
        .ed-select {
          background: var(--ink-3);
          border: 1px solid transparent;
          color: var(--paper);
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 6px 10px;
          cursor: pointer;
          border-radius: 6px;
          height: 30px;
          transition: box-shadow 0.15s ease;
        }
        .ed-select:hover {
          box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent);
        }
        .ed-select:focus {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 50%, transparent);
        }
        .ed-timeline-hint {
          flex: 1;
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          gap: 8px;
          min-height: 22px;
          border: 1px dashed color-mix(in oklab, var(--line) 50%, transparent);
          padding: 2px 10px;
          color: var(--paper-mute);
        }
        /* 角色名 —— serif italic,跟轨道头部呼应,缩到 11px */
        .ed-timeline-hint-role {
          font-family: var(--font-serif);
          font-size: 11px;
          font-weight: 500;
          font-style: italic;
          letter-spacing: -0.005em;
          color: color-mix(in oklab, var(--paper) 65%, transparent);
          flex-shrink: 0;
        }
        /* 用途说明 —— 跟角色名同行,9px,接近"隐身" */
        .ed-timeline-hint-desc {
          font-family: var(--font-sans);
          font-size: 9.5px;
          letter-spacing: 0;
          text-transform: none;
          line-height: 1.25;
          color: color-mix(in oklab, var(--paper-mute) 75%, transparent);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ed-clip {
          position: relative;
          flex-grow: 1;
          flex-shrink: 1;
          min-width: 60px;
          padding: 3px 8px;
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--accent) 12%, var(--ink-2)) 0%,
            var(--ink-2) 100%);
          border: 1px solid color-mix(in oklab, var(--accent) 20%, var(--line));
          border-top: 2px solid var(--accent);
          border-radius: 5px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          transition: border-color 0.15s ease, background 0.18s ease, box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s ease, opacity 0.25s ease;
        }
        .ed-clip-image {
          background: linear-gradient(180deg,
            color-mix(in oklab, #f6c75f 18%, var(--ink-2)) 0%,
            color-mix(in oklab, var(--accent) 5%, var(--ink-2)) 100%);
          border-color: color-mix(in oklab, #f6c75f 28%, var(--line));
          border-top-color: #f6c75f;
        }
        .ed-clip-audio {
          background:
            linear-gradient(180deg,
              color-mix(in oklab, #62b6ff 18%, var(--ink-2)) 0%,
              color-mix(in oklab, #62b6ff 5%, var(--ink-2)) 100%);
          border-color: color-mix(in oklab, #62b6ff 28%, var(--line));
          border-top-color: #62b6ff;
        }
        .ed-clip-audio.muted {
          opacity: 0.55;
        }
        .ed-clip-waveform {
          position: absolute;
          inset: 8px 10px 8px 10px;
          opacity: 0.36;
          pointer-events: none;
          background:
            repeating-linear-gradient(
              90deg,
              transparent 0,
              transparent 5px,
              color-mix(in oklab, #62b6ff 46%, transparent) 5px,
              color-mix(in oklab, #62b6ff 46%, transparent) 7px,
              transparent 7px,
              transparent 12px
            );
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='48' viewBox='0 0 144 48'%3E%3Cpath d='M0 24 C4 6 8 6 12 24 C16 42 20 42 24 24 C28 10 32 10 36 24 C40 38 44 38 48 24 C52 3 56 3 60 24 C64 45 68 45 72 24 C76 9 80 9 84 24 C88 39 92 39 96 24 C100 5 104 5 108 24 C112 43 116 43 120 24 C124 12 128 12 132 24 C136 36 140 36 144 24' fill='none' stroke='white' stroke-width='12' stroke-linecap='round'/%3E%3C/svg%3E");
          mask-size: 144px 100%;
          mask-repeat: repeat-x;
          -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='48' viewBox='0 0 144 48'%3E%3Cpath d='M0 24 C4 6 8 6 12 24 C16 42 20 42 24 24 C28 10 32 10 36 24 C40 38 44 38 48 24 C52 3 56 3 60 24 C64 45 68 45 72 24 C76 9 80 9 84 24 C88 39 92 39 96 24 C100 5 104 5 108 24 C112 43 116 43 120 24 C124 12 128 12 132 24 C136 36 140 36 144 24' fill='none' stroke='white' stroke-width='12' stroke-linecap='round'/%3E%3C/svg%3E");
          -webkit-mask-size: 144px 100%;
          -webkit-mask-repeat: repeat-x;
        }
        /* Thumbnail filmstrip on clips */
        .ed-clip-thumbs {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          opacity: 0.35;
          pointer-events: none;
          z-index: 0;
        }
        .ed-clip:hover .ed-clip-thumbs,
        .ed-clip.on .ed-clip-thumbs {
          opacity: 0.45;
        }
        .ed-clip-title, .ed-clip-dur {
          position: relative; z-index: 1;
        }
        .ed-clip:hover {
          border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--accent) 18%, var(--ink-2)) 0%,
            var(--ink-2) 100%);
          transform: translateY(-1px);
        }
        .ed-clip.on {
          border-color: var(--accent);
          background: linear-gradient(180deg,
            color-mix(in oklab, var(--accent) 22%, var(--ink-2)) 0%,
            color-mix(in oklab, var(--accent) 8%, var(--ink-2)) 100%);
          box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent),
            0 4px 12px color-mix(in oklab, var(--accent) 15%, transparent);
        }
        .ed-clip.playing {
          box-shadow: inset 0 -3px 0 var(--accent),
            0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent),
            0 0 12px color-mix(in oklab, var(--accent) 25%, transparent);
          animation: ed-clip-pulse 2s ease-in-out infinite;
        }
        @keyframes ed-clip-pulse {
          0%, 100% { box-shadow: inset 0 -3px 0 var(--accent), 0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent), 0 0 12px color-mix(in oklab, var(--accent) 25%, transparent); }
          50% { box-shadow: inset 0 -3px 0 var(--accent), 0 0 0 2px color-mix(in oklab, var(--accent) 50%, transparent), 0 0 18px color-mix(in oklab, var(--accent) 35%, transparent); }
        }
        .ed-clip-handle {
          position: absolute;
          top: 0; bottom: 0; width: 14px;
          cursor: ew-resize;
          background: transparent;
          z-index: 2; touch-action: none;
        }
        .ed-clip-handle-l { left: -3px; }
        .ed-clip-handle-r { right: -3px; }
        .ed-clip-handle::before {
          content: "";
          position: absolute;
          top: 15%; bottom: 15%;
          left: 4px; right: 4px;
          background: var(--paper-mute);
          border-radius: 6px;
          opacity: 0;
          transition: opacity 0.12s, background 0.12s;
        }
        .ed-clip-handle::after {
          content: "";
          position: absolute;
          top: 35%; bottom: 35%;
          left: 5px; right: 5px;
          border-top: 1px solid rgba(255,255,255,0.4);
          border-bottom: 1px solid rgba(255,255,255,0.4);
          opacity: 0;
          transition: opacity 0.15s;
        }
        .ed-clip:hover .ed-clip-handle::before,
        .ed-clip.on .ed-clip-handle::before { opacity: 0.6; }
        .ed-clip:hover .ed-clip-handle::after,
        .ed-clip.on .ed-clip-handle::after { opacity: 0.5; }
        .ed-clip-handle:hover::before,
        .ed-clip-handle:active::before {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          opacity: 1;
        }
        .ed-clip-handle:hover::after,
        .ed-clip-handle:active::after {
          border-color: rgba(0,0,0,0.5);
          opacity: 1;
        }
        .ed-clip-title {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          color: var(--paper);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 5px;
          line-height: 1.2;
        }
        .ed-clip-kind {
          flex: 0 0 auto;
          padding: 1px 3px;
          border: 1px solid color-mix(in oklab, var(--paper) 18%, transparent);
          border-radius: 3px;
          color: color-mix(in oklab, var(--paper) 74%, transparent);
          background: rgba(0,0,0,0.18);
          font-size: 7px;
          letter-spacing: 0.08em;
          line-height: 1;
        }
        .ed-clip-title-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ed-clip-dur {
          font-family: var(--font-mono);
          font-size: 8.5px;
          color: var(--paper-mute);
          letter-spacing: 0.04em;
          margin-top: 1px;
          line-height: 1.2;
        }
        .ed-clip-transition-badge,
        .ed-clip-curve-badge,
        .ed-clip-filter-badge {
          position: absolute;
          font-size: 10px;
          line-height: 1;
          padding: 2px 3px;
          border-radius: 3px;
          background: color-mix(in oklab, var(--accent) 30%, transparent);
          color: var(--accent);
          pointer-events: none;
        }
        .ed-clip-transition-badge { top: 2px; right: 2px; }
        .ed-clip-curve-badge { bottom: 2px; right: 2px; }
        .ed-clip-filter-badge { top: 2px; right: 18px; }

        /* Inspector */
        .ed-empty {
          padding: 48px 22px;
          text-align: center;
          color: var(--paper-dim);
          font-family: var(--font-serif);
          font-size: 14px;
          line-height: 1.6;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ed-empty-big {
          font-size: 20px;
          font-style: italic;
          color: var(--paper);
          margin-bottom: 6px;
        }
        .ed-empty-hint {
          font-family: var(--font-mono);
          font-size: 11.5px;
          letter-spacing: 0.06em;
          color: var(--paper-mute);
          line-height: 1.5;
        }

        /* ── Snap indicator line ── */
        .ed-snap-line {
          position: absolute;
          top: 0; bottom: 0; width: 1px;
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
          z-index: 18;
          pointer-events: none;
          opacity: 0.85;
        }

        /* ── Timeline minimap ── */
        .ed-minimap {
          position: relative;
          height: 28px;
          background: var(--ink-2);
          border-top: 1px solid var(--line);
          cursor: pointer;
          overflow: hidden;
          flex-shrink: 0;
        }
        .ed-mm-blk {
          position: absolute;
          background: color-mix(in oklab, var(--accent) 45%, var(--ink-2));
          border-radius: 1px;
          min-width: 2px;
        }
        .ed-mm-blk.a {
          background: color-mix(in oklab, var(--accent) 25%, var(--ink-2));
        }
        .ed-mm-blk.sel {
          background: var(--accent);
          box-shadow: 0 0 4px var(--accent);
        }
        .ed-mm-head {
          position: absolute;
          top: 0; bottom: 0; width: 1px;
          background: var(--accent);
          z-index: 2;
          pointer-events: none;
        }
        .ed-mm-vp {
          position: absolute;
          top: 0; bottom: 0;
          border: 1px solid color-mix(in oklab, var(--paper) 35%, transparent);
          border-radius: 6px;
          background: color-mix(in oklab, var(--paper) 6%, transparent);
          pointer-events: none;
          z-index: 1;
        }

        /* ── Right-click context menu ── */
        .ed-ctx {
          position: fixed;
          z-index: 100;
          background: var(--ink-3);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 4px 0;
          min-width: 160px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25);
          backdrop-filter: blur(12px);
        }
        .ed-ctx-item {
          display: block; width: 100%;
          padding: 7px 14px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          color: var(--paper);
          background: none; border: none;
          text-align: left; cursor: pointer;
          letter-spacing: 0.03em;
          transition: background 0.1s;
        }
        .ed-ctx-item:hover {
          background: color-mix(in oklab, var(--paper) 10%, transparent);
        }
        .ed-ctx-item.danger { color: #f55; }
        .ed-ctx-item.danger:hover {
          background: color-mix(in oklab, #f55 15%, transparent);
        }
        .ed-ctx-sep {
          height: 1px;
          background: var(--line);
          margin: 4px 8px;
        }

        /* ── Export progress panel ── */
        .ed-export-panel {
          position: fixed;
          bottom: 16px; right: 16px;
          width: 280px;
          background: var(--ink-3);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 12px 14px;
          z-index: 90;
          box-shadow: 0 8px 28px rgba(0,0,0,0.4);
        }
        .ed-export-panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .ed-export-panel-stage {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          color: var(--paper);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .ed-export-panel-pct {
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 700;
          color: var(--accent);
        }
        .ed-export-panel-track {
          height: 4px;
          background: var(--ink-2);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 6px;
        }
        .ed-export-panel-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 6px;
          transition: width 0.3s ease;
        }
        .ed-export-panel-msg {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--paper-mute);
          letter-spacing: 0.04em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--paper);
          color: var(--ink);
          padding: 10px 20px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          z-index: 95;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          border-radius: 8px;
          animation: ed-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes ed-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }

        @media (max-width: 1100px) {
          .ed-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto auto;
          }
          .ed-lib {
            max-height: 280px;
          }
          .ed-inspect {
            max-height: 360px;
          }
        }
      `}</style>
    </div>
  );
}
