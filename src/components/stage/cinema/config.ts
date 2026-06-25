/**
 * Cinema 配置 —— 运镜映射、画幅、时长、媒体渲染分发集中在此。
 * 加新运镜 / 新画幅 / 新媒体类型，只改这里，视图与逻辑不动。
 */
import type { CSSProperties } from "react";
import type { CastShotType } from "@/lib/store";
import type { CineMedia } from "./types";

/** 镜头运动类型全集（编辑下拉用） */
export const SHOT_TYPES: CastShotType[] = [
  "still", "pan-lr", "zoom-in", "zoom-out", "parallax", "live", "ots", "pov", "dutch", "hero",
];

/** 运镜类型 → 中文场记板用语 */
export const MOVE_ZH: Record<CastShotType, string> = {
  still: "固定",
  "pan-lr": "横摇",
  "zoom-in": "推近",
  "zoom-out": "拉远",
  parallax: "视差",
  live: "动态",
  ots: "过肩",
  pov: "主观",
  dutch: "荷兰角",
  hero: "英雄镜",
};

/** 时长配置（秒）—— Ken Burns、转场、单镜最短停留 */
export const TIMING = { kenBurns: 6.5, crossfade: 0.6, minShot: 1.2 } as const;

export const STORYBOARD_SRC = "/assets/storyboard-strip.png";

/** storyboard 6 格（3×2）背景定位 */
const cellPos = (cell: number) => `${(cell % 3) * 50}% ${Math.floor(cell / 3) * 100}%`;

/** 画面渲染分发：按 media 类型给出背景样式 + 是否占位。加新媒体类型在此加分支。 */
export function mediaBackground(media: CineMedia): { style: CSSProperties; pending: boolean } {
  switch (media.kind) {
    case "image":
      return { style: { backgroundImage: `url("${media.url}")`, backgroundSize: "cover", backgroundPosition: "center" }, pending: false };
    case "video":
      return { style: media.poster ? { backgroundImage: `url("${media.poster}")`, backgroundSize: "cover", backgroundPosition: "center" } : {}, pending: false };
    case "storyboard":
      return { style: { backgroundImage: `url("${STORYBOARD_SRC}")`, backgroundSize: "300% 200%", backgroundPosition: cellPos(media.cell) }, pending: false };
    case "pending":
      return { style: {}, pending: true };
  }
}

/** mm:ss 时长格式 */
export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** 两位补零（镜号）*/
export const pad2 = (n: number) => String(n).padStart(2, "0");
