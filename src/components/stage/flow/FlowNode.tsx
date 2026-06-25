"use client";

// FlowNode — 流程节点卡 + 各阶段缩略图（接真实 store 数据）
import type { PointerEvent } from "react";
import { useStudioStore, type Series, type Job } from "@/lib/store";
import { shotImageUrl } from "@/lib/stage/stageGen";
import { NODE_W, NODE_H, type FlowStage, type FlowStatus, type FlowStageId } from "@/lib/stage/flowStages";
import { FlowIcon, Placeholder, GRADS, portraitGrad } from "./FlowIcon";

export { NODE_W, NODE_H };

// ready 态默认渐变 + 标签（按阶段）
const DEFAULT_THUMB: Record<string, { g: string; l: string }> = {
  idea: { g: "gold", l: "题材 · 世界观" },
  outline: { g: "noir", l: "起 · 承 · 转 · 合" },
  episodes: { g: "ember", l: "竖屏短剧" },
  audio: { g: "jade", l: "配音 + BGM" },
  edit: { g: "dusk", l: "竖屏成片" },
  export: { g: "teal", l: "母版 · 多平台" },
};

function NodeThumb({
  stage, status, series, jobById,
}: { stage: FlowStage; status: FlowStatus; series: Series; jobById: Map<string, Job> }) {
  const comic = series.kind === "comic";
  const badge = comic ? "AI 漫画" : "AI 实拍";

  if (status === "empty") {
    return (
      <div className="sf-node-empty">
        <div className="sf-node-add"><FlowIcon n="sparkles" s={15} sw={1.8} /></div>
        <span>点击 · 让 AI 生成</span>
      </div>
    );
  }

  if (status === "generating") {
    return (
      <div className="sf-node-thumb" style={{ background: "var(--bg-1)" }}>
        <Placeholder grad={GRADS.gold} badge={badge} comic={comic} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(7,8,12,.5)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 9 }}>
          <div style={{ fontSize: 10.5, color: "#fff", fontWeight: 600, marginBottom: 4 }}>AI 生成中…</div>
          <div className="sf-gen-bar"><i /></div>
        </div>
      </div>
    );
  }

  // ── ready：按阶段用真实数据 ──
  if (stage.id === "character") {
    const chars = series.bible.filter((e) => e.kind === "character").slice(0, 4);
    return (
      <div className="sf-node-thumb" style={{ background: "var(--bg-1)", display: "flex", gap: 5, padding: 8, alignItems: "center" }}>
        {chars.map((c, i) => (
          <div key={c.id} style={{ flex: 1, aspectRatio: "3/4", borderRadius: 7, position: "relative", overflow: "hidden", border: "1px solid var(--line)" }}>
            {c.refImages[0]?.url
              ? <img src={c.refImages[0].url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div className="sf-ph" style={{ background: portraitGrad(i + 3) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (stage.id === "scene") {
    const locs = series.bible.filter((e) => e.kind === "location").slice(0, 4);
    return (
      <div className="sf-node-thumb" style={{ background: "var(--bg-1)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 6 }}>
        {locs.map((s, i) => (
          <div key={s.id} style={{ aspectRatio: "16/9", borderRadius: 6, position: "relative", overflow: "hidden" }}>
            {s.refImages[0]?.url
              ? <img src={s.refImages[0].url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div className="sf-ph" style={{ background: portraitGrad(i + 5) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (stage.id === "frames") {
    // 缩略图与标题取自当前活动集（与节点状态一致；切集即变）
    const activeEpId = useStudioStore.getState().activeEpId;
    const aep = series.episodes.find((e) => e.id === activeEpId) ?? series.episodes[0];
    const firstImg = aep?.scenes.flatMap((sc) => sc.shots).map((s) => shotImageUrl(s, jobById)).find(Boolean);
    return (
      <div className="sf-node-thumb">
        {firstImg
          ? <img src={firstImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <Placeholder grad={GRADS.dusk} comic={comic} />}
        <div className="sf-ph-lbl">{aep?.title ?? "逐镜画面"}</div>
        <div className="sf-ph-badge"><FlowIcon n={comic ? "image" : "film"} s={9} sw={2} />{badge}</div>
      </div>
    );
  }

  const d = DEFAULT_THUMB[stage.id] ?? { g: "gold", l: stage.title };
  return (
    <div className="sf-node-thumb">
      <Placeholder grad={GRADS[d.g]} label={d.l} badge={badge} comic={comic} />
    </div>
  );
}

export default function FlowNode({
  stage, pos, status, meta, selected, dimmed, hl, series, jobById, onClick, onPointerDown, onHover,
}: {
  stage: FlowStage;
  pos: { x: number; y: number };
  status: FlowStatus;
  meta: string;
  selected: boolean;
  dimmed?: boolean;
  hl?: boolean;
  series: Series;
  jobById: Map<string, Job>;
  onClick: (id: string) => void;
  onPointerDown: (e: PointerEvent, id: string) => void;
  onHover?: (id: FlowStageId | null) => void;
}) {
  const chip = status === "ready"
    ? <span className="sf-chip ok"><span className="sf-chip-dot" />就绪</span>
    : status === "generating"
      ? <span className="sf-chip gen"><span className="sf-chip-dot" />生成中</span>
      : <span className="sf-chip empty">待生成</span>;

  return (
    <div
      className={`sf-node ${status}${selected ? " sel" : ""}${dimmed ? " dimmed" : ""}${hl ? " hl" : ""}`}
      style={{ left: pos.x, top: pos.y, width: NODE_W }}
      onPointerDown={(e) => onPointerDown(e, stage.id)}
      onClick={() => onClick(stage.id)}
      onMouseEnter={() => onHover?.(stage.id)} onMouseLeave={() => onHover?.(null)}
    >
      <div className="sf-node-head">
        <div className="sf-node-ico" style={status === "ready" ? { background: stage.grad, borderColor: "transparent" } : undefined}>
          <FlowIcon n={stage.id} s={16} sw={1.8} />
        </div>
        <div className="sf-node-tt">
          <div className="sf-node-name">{stage.title}</div>
          <div className="sf-node-no">STAGE {stage.no} · {stage.en}</div>
        </div>
      </div>
      <div className="sf-node-body"><NodeThumb stage={stage} status={status} series={series} jobById={jobById} /></div>
      <div className="sf-node-foot">
        {chip}
        <span className="sf-node-meta">{meta}</span>
      </div>
    </div>
  );
}
