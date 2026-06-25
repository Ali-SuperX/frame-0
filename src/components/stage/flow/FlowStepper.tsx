"use client";

// FlowStepper — 顶部 9 步生产流程条（真实状态 + 进度）
import { Fragment } from "react";
import { FLOW_STAGES, type FlowStageId, type FlowStatus } from "@/lib/stage/flowStages";
import { FlowIcon } from "./FlowIcon";

export default function FlowStepper({
  status, selectedId, onSelect, onHover, hoveredId, progress,
}: {
  status: Record<FlowStageId, FlowStatus>;
  selectedId: FlowStageId | null;
  onSelect: (id: FlowStageId) => void;
  onHover?: (id: FlowStageId | null) => void;
  hoveredId?: FlowStageId | null;
  progress: number;
}) {
  return (
    <div className="sf-stepper">
      {FLOW_STAGES.map((st, i) => {
        const stt = status[st.id];
        const cls = `sf-step${selectedId === st.id ? " active" : ""}${hoveredId === st.id && selectedId !== st.id ? " hl" : ""}${stt === "ready" ? " done" : ""}${stt === "generating" ? " gen" : ""}`;
        return (
          <Fragment key={st.id}>
            <div className={cls} onClick={() => onSelect(st.id)} onMouseEnter={() => onHover?.(st.id)} onMouseLeave={() => onHover?.(null)}>
              <div className="sf-step-no">{stt === "ready" ? <FlowIcon n="check" s={11} sw={3} /> : st.no}</div>
              <div className="sf-step-label">{st.title}</div>
            </div>
            {i < FLOW_STAGES.length - 1 && <div className={`sf-step-sep${stt === "ready" ? " done" : ""}`} />}
          </Fragment>
        );
      })}
      <div className="sf-prog-pill">
        <div className="sf-prog-track"><div className="sf-prog-fill" style={{ width: `${progress * 100}%` }} /></div>
        <span className="mono">{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}
