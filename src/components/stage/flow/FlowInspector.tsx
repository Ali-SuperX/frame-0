"use client";

// FlowInspector — 右侧阶段编辑抽屉（头部状态 + StageBody + 底部 AI 共创）
import { useRef } from "react";
import type { Series, Job } from "@/lib/store";
import type { FlowStage, FlowStageId, FlowStatus } from "@/lib/stage/flowStages";
import { FlowIcon } from "./FlowIcon";
import FlowStageBody from "./FlowStageBody";

const DESC: Record<FlowStageId, string> = {
  idea: "定义题材、基调与世界观——AI 据此驱动全流程创作。",
  outline: "三幕结构与关键节拍，决定整部短剧的叙事骨架。",
  episodes: "将大纲拆解为分集与单集分镜，逐集填充钩子。",
  character: "主要角色的人设、立绘与人物关系。",
  scene: "核心场景的概念图与统一的美术氛围。",
  frames: "逐镜画面生成——运镜、构图、时长与渲染风格。",
  audio: "AI 情感语音配音、旁白与背景音乐匹配。",
  edit: "按分镜自动卡点剪辑、套转场，合成成片。",
  export: "选择规格导出母版，一键分发到各平台。",
};

export default function FlowInspector({
  stage, status, series, jobById, onClose, onGenerate, onOpenFull,
}: {
  stage: FlowStage | null;
  status: FlowStatus | null;
  series: Series;
  jobById: Map<string, Job>;
  onClose: () => void;
  onGenerate?: (id: FlowStageId) => void;
  onOpenFull?: (id: FlowStageId) => void;
}) {
  const lastRef = useRef<FlowStage | null>(null);
  if (stage) lastRef.current = stage;
  const s = stage ?? lastRef.current;
  const open = !!stage;
  if (!s) return null;

  const statusChip = status === "ready"
    ? <span className="sf-chip ok"><FlowIcon n="check" s={11} sw={2.5} />已就绪</span>
    : status === "generating"
      ? <span className="sf-chip gen"><span className="sf-chip-dot" />生成中</span>
      : <span className="sf-chip empty">待生成</span>;

  return (
    <>
      <div className={`sf-scrim${open ? " show" : ""}`} onClick={onClose} />
      <aside className={`sf-inspector${open ? " open" : ""}`}>
        <div className="sf-insp-head">
          <div className="sf-insp-top">
            <div className="sf-insp-ico" style={{ background: s.grad }}><FlowIcon n={s.id} s={20} sw={1.8} /></div>
            <div className="sf-insp-tt">
              <div className="sf-insp-kicker">STAGE {s.no} · {s.en}</div>
              <div className="sf-insp-title">{s.title}</div>
            </div>
            <button className="sf-icon-btn" onClick={onClose}><FlowIcon n="close" s={18} /></button>
          </div>
          <p className="sf-insp-desc">{DESC[s.id]}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            {statusChip}
            <div style={{ flex: 1 }} />
            {onOpenFull && (status === "ready") && (s.id === "frames" || s.id === "episodes") && (
              <button className="btn ghost sm" onClick={() => onOpenFull(s.id)}><FlowIcon n="layers" s={13} sw={2} />完整编辑</button>
            )}
            {status === "ready"
              ? <button className="btn ghost sm" onClick={() => onGenerate?.(s.id)}><FlowIcon n="refresh" s={13} sw={2} />重新生成</button>
              : status === "empty"
                ? <button className="btn primary sm" onClick={() => onGenerate?.(s.id)}><FlowIcon n="bolt" s={13} sw={2} />AI 生成</button>
                : null}
          </div>
        </div>

        <div className="sf-insp-body">
          {status && <FlowStageBody stage={s} status={status} series={series} jobById={jobById} />}
        </div>

        <div className="sf-insp-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px" }}>
            <div className="sf-ai-cta-ic"><FlowIcon n="sparkles" s={13} sw={2} /></div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>AI 共创</div>
            <div className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--t3)" }}>本阶段 · 上下文已加载</div>
          </div>
        </div>
      </aside>
    </>
  );
}
