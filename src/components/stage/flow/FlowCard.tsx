"use client";

// FlowCard — 节点展开式大创作卡（头部 + 阶段内容 + AI 创作区，一体工作台）
// 替代旧的「跟随小气泡 + 二级抽屉」。定位由 FlowCanvas 通过 style 传入（锚定节点屏幕坐标）。
import { type CSSProperties } from "react";
import type { Series, Job } from "@/lib/store";
import type { FlowStage, FlowStageId, FlowStatus } from "@/lib/stage/flowStages";
import { FlowIcon } from "./FlowIcon";
import FlowComposer from "./FlowComposer";
import FlowStageBody from "./FlowStageBody";

const DESC: Record<FlowStageId, string> = {
  idea: "定义题材、基调与世界观，AI 据此驱动全流程。",
  outline: "三幕结构与关键节拍，决定叙事骨架。",
  episodes: "把大纲拆成分集与单集分镜。",
  character: "主要角色的人设、立绘与关系。",
  scene: "核心场景的概念图与统一美术氛围。",
  frames: "逐镜生成画面：出图，短剧再图生视频。",
  audio: "AI 情感语音配音、旁白与 BGM。",
  edit: "按分镜卡点剪辑、合成，导入剪辑器精修。",
  export: "选规格导出母版，分发各平台。",
};

export default function FlowCard({
  stage, status, series, jobById, suggestions: _suggestions, style, flip, stemTop, onClose, onSend, onGenerate, onOpenFull: _onOpenFull,
}: {
  stage: FlowStage;
  status: FlowStatus;
  series: Series;
  jobById: Map<string, Job>;
  suggestions?: string[];
  style?: CSSProperties;
  flip?: boolean;
  stemTop?: number;
  onClose: () => void;
  onSend?: (text: string) => Promise<string>;
  onGenerate?: (id: FlowStageId) => void;
  onOpenFull?: () => void;
}) {
  const chip = status === "ready"
    ? <span className="sf-chip ok"><FlowIcon n="check" s={11} sw={2.5} />已就绪</span>
    : status === "generating"
      ? <span className="sf-chip gen"><span className="sf-chip-dot" />生成中</span>
      : <span className="sf-chip empty">待生成</span>;

  return (
    <div className={`sf-card${flip ? " flip" : ""}`} style={style}>
      {stemTop != null && <div className="sf-card-stem" style={{ top: stemTop }} />}
      <div className="sf-card-head">
        <div className="sf-card-ico" style={{ background: stage.grad }}><FlowIcon n={stage.id} s={20} sw={1.8} /></div>
        <div className="sf-card-tt">
          <div className="sf-card-kicker">STAGE {stage.no} · {stage.en}</div>
          <div className="sf-card-title">{stage.title}</div>
        </div>
        {chip}
        <button className="sf-card-gen" disabled={status === "generating"} onClick={() => onGenerate?.(stage.id)} title="执行本步骤生成">
          <FlowIcon n="bolt" s={13} sw={2.2} />
          {status === "ready" ? "重生成" : "生成"}
        </button>
        <button className="sf-card-x" onClick={onClose} title="收起（Esc）"><FlowIcon n="close" s={18} /></button>
      </div>

      <p className="sf-card-desc">{DESC[stage.id]}</p>

      <div className="sf-card-main">
        <div className="sf-card-body">
          <FlowStageBody stage={stage} status={status} series={series} jobById={jobById} />
        </div>

        <div className="sf-card-ai">
          <FlowComposer stage={stage} status={status} series={series} jobById={jobById}
            threadKeyPrefix={`${series.id}:`} onSend={onSend} onGenerate={onGenerate} />
        </div>
      </div>
    </div>
  );
}
