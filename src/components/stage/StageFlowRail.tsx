"use client";

/**
 * 左侧阶段轨 —— 线性生产流导航：立项 → 剧本 → 选角 → 出图 → 成片 → 导出
 * 仅负责导航与进度展示；具体动作在中央 bar / Inspector 里。
 */

import type { ReactElement } from "react";

export type StageStep =
  | "setup"
  | "script"
  | "cast"
  | "shots"
  | "animate"
  | "export";

export type StepState = "done" | "active" | "pending";

type IconProps = { className?: string };
const I = {
  setup: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  script: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  ),
  cast: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  shots: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  animate: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" /><line x1="7" y1="3" x2="7" y2="21" /><line x1="17" y1="3" x2="17" y2="21" /><line x1="2" y1="9" x2="7" y2="9" /><line x1="2" y1="15" x2="7" y2="15" /><line x1="17" y1="9" x2="22" y2="9" /><line x1="17" y1="15" x2="22" y2="15" />
    </svg>
  ),
  export: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
};

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

export const STAGES: { id: StageStep; zh: string; en: string; subZh: string; subEn: string; Icon: (p: IconProps) => ReactElement }[] = [
  { id: "setup", zh: "立项", en: "Setup", subZh: "题材·画幅", subEn: "Genre·Ratio", Icon: I.setup },
  { id: "script", zh: "剧本分镜", en: "Script", subZh: "拆镜头", subEn: "Breakdown", Icon: I.script },
  { id: "cast", zh: "选角设定", en: "Cast", subZh: "角色·场景", subEn: "Bible", Icon: I.cast },
  { id: "shots", zh: "逐镜出图", en: "Shots", subZh: "首帧画面", subEn: "Key frames", Icon: I.shots },
  { id: "animate", zh: "镜头成片", en: "Animate", subZh: "视频·配音", subEn: "Video·Voice", Icon: I.animate },
  { id: "export", zh: "拼接导出", en: "Export", subZh: "成片", subEn: "Final cut", Icon: I.export },
];

export default function StageFlowRail({
  active,
  onSelect,
  stateOf,
  collapsed,
  onToggleCollapse,
  seriesName,
  onRename,
  stats,
  zh,
}: {
  active: StageStep;
  onSelect: (id: StageStep) => void;
  stateOf: (id: StageStep) => StepState;
  collapsed: boolean;
  onToggleCollapse: () => void;
  seriesName: string;
  onRename: (name: string) => void;
  stats: { scenes: number; shots: number; duration: number };
  zh: boolean;
}) {
  return (
    <div className={`sw-rail${collapsed ? " collapsed" : ""}`}>
      <div className="sw-rail-head">
        <input
          className="sw-rail-title"
          value={seriesName}
          onChange={(e) => onRename(e.target.value)}
          placeholder={zh ? "剧名…" : "Title…"}
        />
        <button
          className="sw-rail-collapse"
          onClick={onToggleCollapse}
          title={collapsed ? (zh ? "展开" : "Expand") : (zh ? "收起" : "Collapse")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
          </svg>
        </button>
      </div>

      <div className="sw-rail-steps">
        {STAGES.map((s) => {
          const st = stateOf(s.id);
          const Icon = s.Icon;
          return (
            <button
              key={s.id}
              className={`sw-step ${st}${active === s.id ? " on" : ""}`}
              onClick={() => onSelect(s.id)}
              title={collapsed ? (zh ? s.zh : s.en) : undefined}
            >
              <span className="sw-step-ico">
                <Icon />
                {st === "done" && (
                  <span className="sw-step-done-dot"><Check /></span>
                )}
              </span>
              <span className="sw-step-body">
                <span className="sw-step-label">{zh ? s.zh : s.en}</span>
                <span className="sw-step-sub">{zh ? s.subZh : s.subEn}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sw-rail-foot">
        <span><b>{stats.scenes}</b> {zh ? "场" : "sc"}</span>
        <span><b>{stats.shots}</b> {zh ? "镜" : "sh"}</span>
        <span><b>{Math.round(stats.duration)}</b>s</span>
      </div>
    </div>
  );
}
