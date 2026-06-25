/**
 * 示例片《霓虹猎手》—— 无真实分镜时放映，承担"空态电影化 + 创作引导"。
 * 与主逻辑解耦：删除本文件只影响空态展示，不影响真实数据流程。
 */
import type { CineCast, CineShot } from "./types";

export const DEMO_CAST: CineCast[] = [
  { id: "lin", name: "林夜", role: "线人", color: "var(--accent)" },
  { id: "tan", name: "老探长", role: "探长", color: "#2dd4bf" },
  { id: "chi", name: "赤", role: "猎手", color: "var(--red)" },
];

export const DEMO_SHOTS: CineShot[] = [
  { id: "d1", idx: 1, media: { kind: "storyboard", cell: 0 }, size: "CU 特写", move: "推近", durSec: 3.2, line: "他最后看了一眼这座吞噬一切的城市" },
  { id: "d2", idx: 2, media: { kind: "storyboard", cell: 1 }, size: "WS 大远景", move: "固定", durSec: 4.0, line: "信号塔亮起的那一刻，规则被改写了" },
  { id: "d3", idx: 3, media: { kind: "storyboard", cell: 2 }, size: "FS 全景", move: "英雄镜", durSec: 2.4, line: "没有退路，只有向前" },
  { id: "d4", idx: 4, media: { kind: "storyboard", cell: 3 }, size: "MS 中景", move: "横摇", durSec: 5.1, line: "老探长盯着那面墙，三夜未眠" },
  { id: "d5", idx: 5, media: { kind: "storyboard", cell: 4 }, size: "OTS 过肩", move: "过肩", durSec: 3.6, speaker: "赤", speakerColor: "var(--red)", line: "你早就知道了，对吗？" },
  { id: "d6", idx: 6, media: { kind: "storyboard", cell: 5 }, size: "ECU 大特写", move: "推近", durSec: 2.8, line: "她笑了——猎杀，开始了" },
];
