// dramaView.ts — store(三层嵌套 Series)→ DramaCanvas 扁平视图模型的适配层
// 设计：单向派生。store 是数据真相，视图模型是 DramaCanvas 子组件的展示契约。
// status 不落库，按产物(image/voice/video job)派生。配色统一走熔铜鎏金暖域，无紫蓝。

import type { Series, StageShot, StageElement, Job } from "@/lib/store";
import type { CastShotType } from "@/lib/store";
import { shotImageUrl, shotVideoUrl, shotVoiceUrl } from "@/lib/stage/stageGen";

export type ShotStatus = "empty" | "scripted" | "storyboarded" | "voiced" | "generated" | "done";

export interface Character {
  id: string;
  name: string;
  role: string;
  color: string;
  initial: string;
  portrait?: string;
}

export interface SceneLoc {
  id: string;
  name: string;
  type: "INT" | "EXT";
  gradient: string;
  image?: string;
}

export interface Shot {
  id: string;
  index: number;
  sceneId: string;       // 指向 SceneLoc(地点)
  charIds: string[];
  camera: string;        // store 的运镜 shotType 映射成的中文标签
  action: string;        // imagePrompt || narration
  dialogue: string;      // dialogue[0].line || narration
  status: ShotStatus;
  durationSec: number;
  imageUrl?: string;
  videoUrl?: string;
  voiceUrl?: string;
  // store 定位(Round3 生成用):反查真实 epId/sceneId 调 stageGen
  _epId: string;
  _sceneId: string;      // store StageScene.id(容器，非地点)
  _shotType: CastShotType;
}

export interface DramaView {
  chars: Character[];
  scenes: SceneLoc[];
  shots: Shot[];
  charMap: Record<string, Character>;
  sceneMap: Record<string, SceneLoc>;
}

/** store 运镜枚举 → 中文标签(DramaCanvas 的 camera 槽位展示) */
export const SHOT_TYPE_LABEL: Record<CastShotType, string> = {
  still: "固定镜",
  "pan-lr": "横摇",
  "zoom-in": "推近",
  "zoom-out": "拉远",
  parallax: "视差",
  live: "实拍",
  ots: "过肩",
  pov: "主观",
  dutch: "斜角",
  hero: "英雄镜",
};

/** name/id 哈希 → 暖色相(20–160，避开紫蓝 220–360),生成场景缩略渐变 */
function warmGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 140;
  const hue = 20 + h;
  return `linear-gradient(160deg, oklch(0.22 0.03 ${hue}) 0%, oklch(0.14 0.02 ${hue}) 100%)`;
}

const FALLBACK_CHAR_COLOR = "oklch(0.68 0.14 50)";

/** 由产物派生镜头状态(参考 flowStages.deriveStageStatus 思路) */
function deriveStatus(shot: StageShot, jobById: Map<string, Job>): ShotStatus {
  if (shotVideoUrl(shot, jobById)) return "generated";
  if (shot.voiceJobId) return "voiced";
  if (shotImageUrl(shot, jobById)) return "storyboarded";
  if ((shot.dialogue && shot.dialogue.length > 0) || shot.narration?.trim()) return "scripted";
  return "empty";
}

/** Series → 扁平视图模型 */
export function seriesToView(series: Series, jobById: Map<string, Job>): DramaView {
  const charEls = series.bible.filter((e) => e.kind === "character");
  const locEls = series.bible.filter((e) => e.kind === "location");

  const chars: Character[] = charEls.map((e: StageElement) => ({
    id: e.id,
    name: e.name,
    role: e.description || "",
    color: e.color || FALLBACK_CHAR_COLOR,
    initial: e.name.slice(0, 1),
    portrait: e.refImages[0]?.url,
  }));

  const scenes: SceneLoc[] = locEls.map((e: StageElement) => ({
    id: e.id,
    name: e.name,
    type: e.description?.includes("EXT") ? "EXT" : "INT",
    gradient: warmGradient(e.id),
    image: e.refImages[0]?.url,
  }));

  const charIdSet = new Set(charEls.map((e) => e.id));
  const shots: Shot[] = [];
  // index 用全局连续序号(镜号应连续);store 的 s.idx 在删镜后会 scene 内局部重排,跨 scene 断档
  let seq = 0;
  for (const ep of series.episodes) {
    for (const scene of ep.scenes) {
      for (const s of scene.shots) {
        seq++;
        shots.push({
          id: s.id,
          index: seq,
          sceneId: scene.locationId || "",
          charIds: s.elementRefs.filter((id) => charIdSet.has(id)),
          camera: SHOT_TYPE_LABEL[s.shotType] || "镜头",
          action: s.imagePrompt || s.narration || "",
          dialogue: s.dialogue?.[0]?.line || s.narration || "",
          status: deriveStatus(s, jobById),
          durationSec: s.durationSec || 4,
          imageUrl: shotImageUrl(s, jobById),
          videoUrl: shotVideoUrl(s, jobById),
          voiceUrl: shotVoiceUrl(s),
          _epId: ep.id,
          _sceneId: scene.id,
          _shotType: s.shotType,
        });
      }
    }
  }

  const charMap = Object.fromEntries(chars.map((c) => [c.id, c]));
  const sceneMap = Object.fromEntries(scenes.map((s) => [s.id, s]));
  return { chars, scenes, shots, charMap, sceneMap };
}

/* ─── Demo seed:误入豪门 → 真实 Series 结构(仅当 store 为空时灌入)─── */

const DEMO_CHARS: StageElement[] = [
  { id: "c1", kind: "character", name: "苏晴",   refImages: [], description: "女主", color: "oklch(0.68 0.16 28)" },
  { id: "c2", kind: "character", name: "陆修远", refImages: [], description: "男主", color: "oklch(0.73 0.14 62)" },
  { id: "c3", kind: "character", name: "孟雪",   refImages: [], description: "女反", color: "oklch(0.56 0.07 200)" },
  { id: "c4", kind: "character", name: "陈涛",   refImages: [], description: "闺蜜", color: "oklch(0.65 0.13 155)" },
  { id: "c5", kind: "character", name: "管家李", refImages: [], description: "配角", color: "oklch(0.60 0.04 55)" },
];

const DEMO_LOCS: StageElement[] = [
  { id: "loc-office",     kind: "location", name: "总裁办公室", refImages: [], description: "INT" },
  { id: "loc-lobby",      kind: "location", name: "公司大厅",   refImages: [], description: "INT" },
  { id: "loc-mansion",    kind: "location", name: "陆家豪宅",   refImages: [], description: "EXT" },
  { id: "loc-cafe",       kind: "location", name: "咖啡馆",     refImages: [], description: "INT" },
  { id: "loc-roadside",   kind: "location", name: "路边",       refImages: [], description: "EXT" },
  { id: "loc-livingroom", kind: "location", name: "豪宅客厅",   refImages: [], description: "INT" },
];

type DemoShot = {
  id: string; idx: number; shotType: CastShotType;
  speaker: string; line: string; action: string; chars: string[]; dur: number;
};

// 地点 → 该地点的镜头(store 模型:一个 StageScene 绑一个 locationId)
const DEMO_SCENE_PLAN: { loc: string; shots: DemoShot[] }[] = [
  { loc: "loc-roadside", shots: [
    { id: "sh1", idx: 1, shotType: "still",   speaker: "c1", line: "等等！我的文件！",                 action: "苏晴抱着文件夹急匆匆地走，文件散落一地",           chars: ["c1"],       dur: 4 },
    { id: "sh2", idx: 2, shotType: "zoom-in", speaker: "c2", line: "你不知道看路吗！",                 action: "陆修远的豪车急刹，两人惊愕对视",                   chars: ["c1", "c2"], dur: 4 },
  ]},
  { loc: "loc-office", shots: [
    { id: "sh3", idx: 3, shotType: "pan-lr",  speaker: "c2", line: "你就是那个撞到我车的人？",         action: "苏晴坐在面试椅上，陆修远翻着她的简历，冷漠地审视", chars: ["c1", "c2"],       dur: 5 },
    { id: "sh4", idx: 4, shotType: "zoom-in", speaker: "c2", line: "从明天起，你是我的私人秘书。",     action: "陆修远放下简历，管家老李站在旁边记录",             chars: ["c2", "c1", "c5"], dur: 5 },
  ]},
  { loc: "loc-lobby", shots: [
    { id: "sh5", idx: 5, shotType: "still",   speaker: "c3", line: "你以为爬上去，你就赢了？",         action: "孟雪在大厅拦住苏晴，挡住去路，语气强硬",           chars: ["c1", "c3"], dur: 4 },
  ]},
  { loc: "loc-cafe", shots: [
    { id: "sh6", idx: 6, shotType: "zoom-in", speaker: "c4", line: "晴晴，那个陆修远不简单，你要小心。", action: "陈涛担忧地压低声音，看了看四周后才开口",           chars: ["c1", "c4"], dur: 4 },
  ]},
  { loc: "loc-mansion", shots: [
    { id: "sh7", idx: 7, shotType: "hero",    speaker: "c1", line: "这…这就是他住的地方？",           action: "苏晴第一次来到豪宅大门，震惊地仰望这座建筑",       chars: ["c1", "c5"], dur: 5 },
  ]},
  { loc: "loc-livingroom", shots: [
    { id: "sh8", idx: 8, shotType: "still",   speaker: "c2", line: "规则一：从今天起，你住这里。",     action: "陆修远靠在沙发上，冷漠地盯着苏晴，语气不容置疑",   chars: ["c1", "c2"], dur: 4 },
  ]},
];

export function buildDemoSeries(): Series {
  const scenes = DEMO_SCENE_PLAN.map((plan, i) => ({
    id: `scene-${i + 1}`,
    locationId: plan.loc,
    castIds: [...new Set(plan.shots.flatMap((s) => s.chars))],
    shots: plan.shots.map((s) => ({
      id: s.id,
      idx: s.idx,
      shotType: s.shotType,
      dialogue: [{ speakerId: s.speaker, line: s.line }],
      imagePrompt: s.action,
      elementRefs: [...s.chars, plan.loc],
      durationSec: s.dur,
    })),
  }));

  return {
    id: "demo-haomen",
    name: "误入豪门",
    kind: "short",
    bible: [...DEMO_CHARS, ...DEMO_LOCS],
    synopsis: "普通女孩苏晴误撞冷面总裁陆修远，被迫成为其私人秘书，卷入豪门恩怨。",
    episodes: [
      { id: "ep-1", num: 1, title: "第 1 集", scenes },
    ],
    aspect: "9:16",
    updatedAt: 0,
    _v: 2,
  };
}
