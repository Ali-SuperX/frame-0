"use client";

/**
 * DramaDock —— 画布顶部「剧组六步导航」。
 *
 * 短剧自定义分步：剧本 → 分镜 → 角色场景(含出图) → 视频 → 配音 → 成片。
 * 每一步显示状态(done / n·m)，当前该做的步高亮引导；点开一步的迷你面板，既能让
 * AI 辅助生成、也能调参数手动介入。平台把六个环节衔接好，用户逐步输入、逐步把控。
 */

import { useEffect, useMemo, useRef } from "react";
import { useStudioStore } from "@/lib/store";
import type { CanvasNode } from "@/lib/canvasStore";

export type DockStage = "script" | "shots" | "assets" | "i2v" | "voice" | "edit";

export type EditExportCfg = {
  aspect: "16:9" | "9:16" | "1:1";
  transition: "fade" | "fadeblack" | "wipeleft" | "circleopen";
  crossfadeSec: number;
  subtitle: boolean;
};

type Props = {
  zh: boolean;
  /** 活跃剧集的剧本节点（note）。 */
  scriptNode: CanvasNode | null;
  /** 短剧分镜节点（orchMode=drama 且 kind=generate，输入；不含视频输出节点）。 */
  shots: CanvasNode[];
  /** 分镜的视频输出节点（dramaVideoOf）—— 视频/配音进度从这读。 */
  videoNodes: CanvasNode[];
  /** 短剧资产节点（character/scene）。 */
  assets: CanvasNode[];
  /** 分步编排忙（写剧本/拆分镜/提资产）。 */
  orchBusy: boolean;
  /** 批量阶段忙（出图/视频/配音）。 */
  busy: { stage: DockStage; done: number; total: number } | null;
  /** 短剧模式但还没起草 → 显示引导条而非整条进度坞。 */
  guide?: boolean;
  /** 当前展开/聚焦的阶段(受控,单一数据源,驱动画布聚焦与对话框形态)。 */
  activeStage: DockStage | null;
  onStageChange: (s: DockStage | null) => void;
  onWriteScript?: () => void;
  /** 片场监视器：一键串看 dailies(按序串播所有已出视频，缺镜跳过)。 */
  onPlayDailies?: () => void;
};

export default function DramaDock({
  zh,
  scriptNode,
  shots,
  videoNodes,
  assets,
  orchBusy,
  busy,
  guide,
  activeStage,
  onStageChange,
  onWriteScript,
  onPlayDailies,
}: Props) {
  const jobs = useStudioStore((s) => s.jobs);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /* 各站完成数（实时读 jobs） */
  const stat = useMemo(() => {
    const done = (jid?: string) => !!jid && jobs.find((j) => j.id === jid)?.status === "done";
    const vc = (s: CanvasNode) => videoNodes.find((v) => v.dramaVideoOf === s.id) ?? s; // 视频/静帧/配音承载体(兼容旧数据回落分镜)
    const imgDone = shots.filter((n) => done(vc(n).imageJobId)).length + assets.filter((n) => done(n.jobId)).length;
    const imgTotal = shots.length + assets.length;
    const vidDone = shots.filter((n) => done(vc(n).videoJobId)).length;
    const voiced = shots.filter((n) => !!vc(n).voiceJobId).length;
    const withLines = shots.filter((n) => n.text?.split(" · ")[0]?.trim()).length;
    return { imgDone, imgTotal, vidDone, voiced, withLines };
  }, [shots, assets, videoNodes, jobs]);

  /* 点外面 / Esc 收起弹层 */
  useEffect(() => {
    if (!activeStage) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (rootRef.current?.contains(t)) return; // 点坞内不收起
      if (t?.closest(".cvc-dock")) return; // 阶段操作区在对话框(cvc-dock)里 —— 点它是在操作当前阶段，绝不能收起 activeStage
      onStageChange(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onStageChange(null); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [activeStage]);

  const hasScriptNode = !!scriptNode; // 剧本节点存在 → 显示完整七步导航（而非引导条）
  const hasScript = !!scriptNode?.text?.trim(); // 剧本写了内容 → 「剧本」步才算完成
  const hasShots = shots.length > 0;
  const hasAssets = assets.length > 0;

  // 完全没开始（无剧本节点、无分镜）→ 引导条；有空剧本就显示完整七步（剧本步引导写）
  if (!hasScriptNode && !hasShots) {
    if (!guide) return null;
    return (
      <div className="cv-dock cv-dock-guide" ref={rootRef}>
        <span className="cv-dock-title"><DockIcon kind="shots" /> <b>{zh ? "短剧 · 第一步" : "Drama · Step 1"}</b></span>
        <span className="cv-dock-guide-text">{zh ? "下方一句话 AI 起草，或" : "AI draft below, or"}</span>
        {onWriteScript && <button type="button" className="cv-dock-go cv-dock-go-ghost" onClick={onWriteScript}>✎ {zh ? "自己写剧本" : "Write own"}</button>}
        <span className="cv-dock-guide-arrow">↓</span>
      </div>
    );
  }

  const i2vComplete = shots.length > 0 && stat.vidDone >= shots.length;
  const voiceComplete = stat.withLines > 0 && stat.voiced >= stat.withLines;

  type Stg = { key: DockStage; zh: string; en: string; done: boolean; n?: number; total?: number };
  const stages: Stg[] = [
    { key: "script", zh: "剧本", en: "Script", done: hasScript },
    { key: "shots", zh: "分镜", en: "Shots", done: hasShots, n: shots.length },
    { key: "assets", zh: "角色场景", en: "Cast", done: hasAssets, n: assets.length },
    { key: "i2v", zh: "视频", en: "Video", done: i2vComplete, n: stat.vidDone, total: shots.length },
    { key: "voice", zh: "配音", en: "Voice", done: voiceComplete, n: stat.voiced, total: stat.withLines },
    { key: "edit", zh: "成片", en: "Cut", done: false },
  ];

  // 当前该做的「必经步」（assets 可选，不计入）→ 高亮引导
  const necessary: DockStage[] = ["script", "shots", "assets", "i2v", "voice", "edit"];
  const current = necessary.find((k) => !stages.find((s) => s.key === k)!.done) ?? "edit";

  return (
    <div className="cv-dock cv-dock-steps" ref={rootRef}>
      <span className="cv-dock-title" title={zh ? `${assets.length} 资产 · ${shots.length} 分镜` : `${assets.length} assets · ${shots.length} shots`}>
        <DockIcon kind="shots" /> <b>{scriptNode?.title || (zh ? "短剧" : "Drama")}</b>
      </span>
      {stages.map((s, i) => {
        const stageBusy = busy?.stage === s.key;
        const stepBusy = false; // 去掉「编排忙就让分镜/角色转圈」的自动化暗示——手动点各步，靠 flash 反馈
        const isBusy = stageBusy || stepBusy;
        const isCur = current === s.key;
        const cnt = s.total && s.total > 0 ? `${s.n}/${s.total}` : s.n ? `${s.n}` : "";
        // 分步(shots/assets)受 orchBusy 控；批量(design…)受 busy 控
        const disabled = (!!busy && busy.stage !== s.key) || (orchBusy && s.key !== "shots" && s.key !== "assets");
        return (
          <div key={s.key} className="cv-dock-stage-wrap">
            {i > 0 && <span className="cv-dock-arrow" aria-hidden>›</span>}
            <button
              type="button"
              className={`cv-dock-stage${activeStage === s.key ? " open" : ""}${s.done ? " done" : ""}${isCur ? " cur" : ""}${isBusy ? " busy" : ""}`}
              onClick={() => onStageChange(activeStage === s.key ? null : s.key)}
              disabled={disabled}
              title={zh ? s.zh : s.en}
            >
              <span className="cv-dock-ic">{isBusy ? <span className="cv-spinner cv-spinner-sm" /> : s.done ? "✓" : <DockIcon kind={s.key} />}</span>
              <span className="cv-dock-lbl">{zh ? s.zh : s.en}</span>
              {stageBusy && busy ? (
                <span className="cv-dock-n">{busy.done}/{busy.total}</span>
              ) : cnt ? (
                <span className="cv-dock-n">{cnt}</span>
              ) : null}
            </button>

          </div>
        );
      })}
      {onPlayDailies && stat.vidDone > 0 && (
        <button type="button" className="cv-dock-dailies" onClick={onPlayDailies} title={zh ? "串看样片 —— 按序连播所有已出视频，缺镜跳过" : "Play dailies — sequential preview of all shot videos"}>
          <DockIcon kind="i2v" />
          <span>{zh ? "看样片" : "Dailies"}</span>
        </button>
      )}
    </div>
  );
}

// 短剧坞六步的线性图标 —— 与画布节点徽标(NodeKindIcon)同款风格(viewBox 16 / currentColor / 1.5)，
//   取代原 emoji(📝🎬👤▶🔊✂)，避免两套图标语言并存 + emoji 跨平台字形抖动
function DockIcon({ kind, size = 14 }: { kind: DockStage; size?: number }) {
  const c = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "script": return <svg {...c} aria-hidden><path d="M4 2.5h5.5l3.5 3.5v8H4z" /><path d="M9.5 2.5v3.5h3.5M6 9h4M6 11h3" /></svg>;
    case "shots": return <svg {...c} aria-hidden><rect x="2" y="6" width="12" height="7" rx="1.2" /><path d="M2.4 6 13.2 3.3l.5 2L3 8.1 2.4 6Z" /></svg>;
    case "assets": return <svg {...c} aria-hidden><circle cx="8" cy="5.2" r="2.6" /><path d="M3.4 13c0-2.6 2-4.2 4.6-4.2s4.6 1.6 4.6 4.2" /></svg>;
    case "i2v": return <svg {...c} aria-hidden><rect x="2.5" y="3.8" width="11" height="8.4" rx="1.7" /><path d="M7 6.6v2.8L9.6 8 7 6.6Z" fill="currentColor" stroke="none" /></svg>;
    case "voice": return <svg {...c} aria-hidden><path d="M3 6.2h2.2L8 4v8L5.2 9.8H3z" /><path d="M10.4 6.2a2.4 2.4 0 0 1 0 3.6M12 4.8a4.4 4.4 0 0 1 0 6.4" /></svg>;
    case "edit": return <svg {...c} aria-hidden><circle cx="4.4" cy="4.4" r="1.7" /><circle cx="4.4" cy="11.6" r="1.7" /><path d="M5.9 5.6 13 11M5.9 10.4 13 5" /></svg>;
    default: return null;
  }
}
