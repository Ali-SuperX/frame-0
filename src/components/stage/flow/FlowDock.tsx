"use client";

// FlowDock — 底部全局 AI 副驾对话条（始终 global scope；节点上下文由画布跟随框承载）
import { useState } from "react";
import type { FlowStageId } from "@/lib/stage/flowStages";
import FlowChat from "./FlowChat";

export default function FlowDock({ onGenerate, dimmed, onSend, seriesId }: { onGenerate?: (id: FlowStageId) => void; dimmed?: boolean; onSend?: (text: string) => Promise<string>; seriesId?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`sf-dock-bottom${dimmed ? " sf-dock-dim" : ""}`}>
      <FlowChat scope={{ id: "global", title: "全局" }} status={null} threadKeyPrefix={seriesId ? `${seriesId}:` : undefined}
        onSend={onSend} onGenerate={onGenerate} expanded={expanded} setExpanded={setExpanded} />
    </div>
  );
}
