// flowStages.ts — 9 阶段生产流配置 + 真实数据派生（状态 / meta）
// 节点画布的「数据真相」层：从 store(series/jobs) 计算每个阶段的进度状态与摘要文字。
// 配色：鎏金暗房同源暖色（金 62° → 朱砂 33° → 青瓷 150°），无紫蓝。

import type { Series, Job, StageShot } from "@/lib/store";
import { shotImageUrl, shotVideoUrl, shotVoiceUrl } from "@/lib/stage/stageGen";

export type FlowStageId =
  | "idea" | "outline" | "episodes" | "character" | "scene"
  | "frames" | "audio" | "edit" | "export";

export type FlowStatus = "ready" | "generating" | "empty";

export type FlowStage = {
  id: FlowStageId;
  no: string;
  title: string;
  en: string;
  /** 节点图标渐变（oklch 同源暖色） */
  grad: string;
  pos: { x: number; y: number };
};

// 分组分区布局：故事 → 资产 → 生产 → 成片，4 个纵向区（组内紧凑、组间留白）
export const FLOW_STAGES: FlowStage[] = [
  { id: "idea",      no: "01", title: "创意 · 题材", en: "PREMISE",   grad: "linear-gradient(135deg,oklch(0.78 0.13 72),oklch(0.64 0.16 52))", pos: { x: 100,  y: 130 } },
  { id: "outline",   no: "02", title: "剧本大纲",    en: "OUTLINE",   grad: "linear-gradient(135deg,oklch(0.72 0.15 55),oklch(0.60 0.17 38))", pos: { x: 100,  y: 370 } },
  { id: "episodes",  no: "03", title: "分集 · 分镜", en: "EPISODES",  grad: "linear-gradient(135deg,oklch(0.68 0.17 40),oklch(0.58 0.19 28))", pos: { x: 100,  y: 610 } },
  { id: "character", no: "04", title: "角色设定",    en: "CAST",      grad: "linear-gradient(135deg,oklch(0.66 0.17 25),oklch(0.56 0.18 12))", pos: { x: 460,  y: 130 } },
  { id: "scene",     no: "05", title: "场景设定",    en: "SETTINGS",  grad: "linear-gradient(135deg,oklch(0.74 0.11 150),oklch(0.66 0.12 175))", pos: { x: 460,  y: 370 } },
  { id: "frames",    no: "06", title: "逐镜画面",    en: "FRAMES",    grad: "linear-gradient(135deg,oklch(0.72 0.13 95),oklch(0.62 0.15 68))", pos: { x: 820,  y: 130 } },
  { id: "audio",     no: "07", title: "配音 · 音乐", en: "AUDIO",     grad: "linear-gradient(135deg,oklch(0.76 0.11 160),oklch(0.66 0.12 185))", pos: { x: 820,  y: 370 } },
  { id: "edit",      no: "08", title: "剪辑 · 合成", en: "COMPOSITE", grad: "linear-gradient(135deg,oklch(0.72 0.15 58),oklch(0.60 0.17 42))", pos: { x: 1180, y: 130 } },
  { id: "export",    no: "09", title: "导出 · 发布", en: "PUBLISH",   grad: "linear-gradient(135deg,oklch(0.74 0.12 140),oklch(0.64 0.13 168))", pos: { x: 1180, y: 370 } },
];

export const FLOW_EDGES: [FlowStageId, FlowStageId][] = [
  ["idea", "outline"], ["outline", "episodes"], ["episodes", "character"],
  ["character", "scene"], ["scene", "frames"], ["frames", "audio"],
  ["audio", "edit"], ["edit", "export"],
];

// 阶段分组（4 区：故事 / 资产 / 生产 / 成片）
export const FLOW_GROUPS: { id: string; zh: string; en: string; stages: FlowStageId[] }[] = [
  { id: "story", zh: "故事", en: "STORY", stages: ["idea", "outline", "episodes"] },
  { id: "asset", zh: "资产", en: "ASSETS", stages: ["character", "scene"] },
  { id: "production", zh: "生产", en: "PRODUCTION", stages: ["frames", "audio"] },
  { id: "post", zh: "成片", en: "POST", stages: ["edit", "export"] },
];

// 节点尺寸（与 FlowNode 一致，用于分组框计算）
export const NODE_W = 236;
export const NODE_H = 210;

export type GroupBox = { id: string; zh: string; en: string; x: number; y: number; w: number; h: number };

/** 按当前节点坐标计算每个分组的包围盒（随拖拽实时变化） */
export function computeGroupBoxes(pos: Record<string, { x: number; y: number }>): GroupBox[] {
  const PAD = 24, TOP = 30;
  return FLOW_GROUPS.map((g) => {
    const ps = g.stages.map((id) => pos[id]).filter(Boolean);
    const minX = Math.min(...ps.map((p) => p.x)) - PAD;
    const minY = Math.min(...ps.map((p) => p.y)) - PAD - TOP;
    const maxX = Math.max(...ps.map((p) => p.x)) + NODE_W + PAD;
    const maxY = Math.max(...ps.map((p) => p.y)) + NODE_H + PAD;
    return { id: g.id, zh: g.zh, en: g.en, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  });
}

/** 上下文建议词 —— 读真实 store 数据，让跟随框建议「认识」当前剧的角色 / 集数 / 场景 */
export function contextualSuggestions(id: FlowStageId, series: Series): string[] {
  const chars = series.bible.filter((e) => e.kind === "character");
  const locs = series.bible.filter((e) => e.kind === "location");
  const c0 = chars[0]?.name;
  const eps = series.episodes;
  const curTitle = eps[0]?.title;
  switch (id) {
    case "idea": return ["换个题材方向", "强化开场钩子"];
    case "outline": return ["在高潮前加一次反转", "拆成分集梗概"];
    case "episodes": return [`续写 EP${String(eps.length + 1).padStart(2, "0")}`, "每集结尾加强钩子"];
    case "character": return c0 ? [`为「${c0}」生成立绘`, "补充人物关系"] : ["创建第一个角色", "生成主角立绘"];
    case "scene": return locs[0] ? [`为「${locs[0].name}」换个氛围`, "统一全部场景色调"] : ["新增核心场景", "统一场景色调"];
    case "frames": return [`续写${curTitle ? `「${curTitle}」` : "本集"}分镜`, "补一个环境空镜"];
    case "audio": return c0 ? [`为「${c0}」配音`, "推荐悬疑感 BGM"] : ["一键生成全部配音", "推荐 BGM"];
    case "edit": return ["自动卡点剪辑", "加字幕与片头"];
    case "export": return ["导出 1080p 竖屏", "一键分发到 3 个平台"];
    default: return [];
  }
}

const RUNNING = new Set(["running", "submitting"]);
const isJobRunning = (id: string | undefined, jobById: Map<string, Job>) => {
  const j = id ? jobById.get(id) : undefined;
  return !!j && RUNNING.has(j.status);
};

/** 摊平当前 series 的全部镜头 */
export function allShots(series: Series): StageShot[] {
  return series.episodes.flatMap((ep) => ep.scenes.flatMap((sc) => sc.shots));
}

/** 派生每个阶段的真实状态 */
export function deriveStageStatus(
  series: Series,
  jobById: Map<string, Job>,
  activeEpId?: string | null,
): Record<FlowStageId, FlowStatus> {
  const chars = series.bible.filter((e) => e.kind === "character");
  const locs = series.bible.filter((e) => e.kind === "location");
  const activeEp = series.episodes.find((e) => e.id === activeEpId) ?? series.episodes[0];
  const shots = activeEp ? activeEp.scenes.flatMap((sc) => sc.shots) : [];

  const imgRunning = shots.some((s) => isJobRunning(s.imageJobId, jobById) || isJobRunning(s.videoJobId, jobById));
  const hasImg = shots.some((s) => shotImageUrl(s, jobById));
  const hasVid = shots.some((s) => shotVideoUrl(s, jobById));
  const voiceRunning = shots.some((s) => isJobRunning(s.voiceJobId, jobById));
  const hasVoice = shots.some((s) => s.voiceJobId || shotVoiceUrl(s)) || !!series.bgm;

  const tri = (ready: boolean, gen = false): FlowStatus => (gen ? "generating" : ready ? "ready" : "empty");

  const editReady = hasVid || (hasImg && shots.length > 1);

  return {
    idea: tri(!!series.synopsis?.trim()),
    outline: tri(series.episodes.some((e) => e.synopsis?.trim())),
    episodes: tri(series.episodes.length > 0),
    character: tri(chars.length > 0),
    scene: tri(locs.length > 0),
    frames: tri(series.kind === "comic" ? hasImg : hasVid, imgRunning),
    audio: tri(hasVoice, voiceRunning),
    edit: tri(editReady),
    export: tri(hasVid),
  };
}

/** 派生每个阶段节点底部的 meta 摘要文字 */
export function deriveStageMeta(
  series: Series,
  jobById: Map<string, Job>,
  activeEpId?: string | null,
): Record<FlowStageId, string> {
  const chars = series.bible.filter((e) => e.kind === "character");
  const locs = series.bible.filter((e) => e.kind === "location");
  const eps = series.episodes;
  const cur = eps.find((e) => e.id === activeEpId) ?? eps[0];
  const shots = cur ? cur.scenes.flatMap((sc) => sc.shots) : [];
  const readyShots = shots.filter((s) => shotImageUrl(s, jobById)).length;
  const lines = shots.reduce((n, s) => n + (s.dialogue?.length ?? 0) + (s.narration?.trim() ? 1 : 0), 0);
  const totalDur = shots.reduce((n, s) => n + (s.durationSec || 0), 0);
  const fmtDur = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const kindLabel = series.kind === "comic" ? "短漫剧" : "短剧";

  return {
    idea: `${kindLabel} · ${eps.length}EP`,
    outline: eps.length ? `${eps.length} 集梗概` : "待拆解",
    episodes: `${eps.length} 集 · 就绪 ${eps.filter((e) => e.scenes.some((sc) => sc.shots.length)).length}`,
    character: `${chars.length} 角色`,
    scene: `${locs.length} 场景`,
    frames: cur ? `${shots.length} 镜 · 出图 ${readyShots}` : "待分镜",
    audio: lines ? `${lines} 句台词` : "待配音",
    edit: totalDur ? fmtDur(totalDur) : "待合成",
    export: `${series.aspect} · 5 平台`,
  };
}
