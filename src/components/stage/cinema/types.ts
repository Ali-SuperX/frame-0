/**
 * Cinema 数据模型 —— 视图层只认这里的中间模型，与底层 Series/StageShot 解耦。
 * 接真实数据 / 换数据源 / 加字段，只改 useCinema.ts 的适配逻辑，视图组件不动。
 */
import type { CastShotType } from "@/lib/store";

/** 画面来源 —— 判别联合。未来接新媒体（真视频/Live2D/3D）只需加一个分支。 */
export type CineMedia =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string; poster?: string }
  | { kind: "storyboard"; cell: number } // 示例片：storyboard-strip 6 格切片
  | { kind: "pending"; prompt?: string }; // 真实分镜尚未出图

export type CineCast = {
  id: string;
  name: string;
  role?: string;
  color: string;
};

export type CineShot = {
  id: string;
  idx: number;
  media: CineMedia;
  /** 原始镜头运动类型（真实数据），demo 为空 */
  shotType?: CastShotType;
  /** 运镜显示名（中文） */
  move: string;
  /** 景别（demo 有，真实数据暂无） */
  size?: string;
  durSec: number;
  speaker?: string;
  speakerColor?: string;
  line: string;
  /** 原始旁白（行内编辑用） */
  narration?: string;
  /** imagePrompt 出图提示（行内编辑用） */
  prompt?: string;
};

/** 一部可放映的片子（真实剧集或示例片）—— 视图的唯一数据入口 */
export type CineFilm = {
  title: string;
  epLabel: string;
  shots: CineShot[];
  cast: CineCast[];
  isDemo: boolean;
  totalDurSec: number;
};
