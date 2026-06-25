"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  VideoSegment,
  AnchorStrategy,
  SegmentRunState,
  Reference,
} from "@/lib/r2v/schema";
import { segmentId, suggestSegments } from "@/lib/r2v/videoUtils";

type Props = {
  zh: boolean;
  segments: VideoSegment[];
  anchorStrategy: AnchorStrategy;
  segmentStates: Record<string, SegmentRunState>;
  refs: Reference[];
  onUpdate: (segments: VideoSegment[]) => void;
  onStrategyChange: (s: AnchorStrategy) => void;
  onGenerate: () => void;
  onCancel: () => void;
  generating: boolean;
};

const STRATEGY_LABELS: Record<AnchorStrategy, { zh: string; en: string; desc: string; descEn: string }> = {
  "r2v-chain": {
    zh: "蒙太奇模式（武戏）",
    en: "Montage (Action)",
    desc: "适合快剪 / 动作 / 转场。每段独立 R2V，共享锚点参考图，靠剪辑节奏制造视觉冲击。",
    descEn: "Best for action/cuts/transitions. Each segment independent R2V with shared anchor refs.",
  },
  "i2v-bridge": {
    zh: "长镜头模式（文戏）",
    en: "Long Take (Drama)",
    desc: "适合对话 / 情绪 / 慢推。首段 R2V，后续段用 I2V 从尾帧延续，营造一镜到底的沉浸感。",
    descEn: "Best for dialogue/emotion/slow push. First R2V, then I2V chains for immersive one-take feel.",
  },
  hybrid: {
    zh: "混合模式",
    en: "Hybrid",
    desc: "关键转场用 R2V 重锚定，过渡段用 I2V 平滑续写。文戏武戏混搭场景适用。",
    descEn: "R2V re-anchors at key transitions, I2V smooths transitions in between.",
  },
};

const STATUS_ICONS: Record<string, string> = {
  pending: "⏸",
  submitting: "⏳",
  running: "⚙️",
  done: "✅",
  error: "❌",
};

export default function TimelineEditor({
  zh,
  segments,
  anchorStrategy,
  segmentStates,
  refs,
  onUpdate,
  onStrategyChange,
  onGenerate,
  onCancel,
  generating,
}: Props) {
  const [expandedSeg, setExpandedSeg] = useState<string | null>(
    segments[0]?.id ?? null
  );
  // Per-segment anchor frame selections (segment id → Set of selected frame labels)
  const [anchorSelections, setAnchorSelections] = useState<Record<string, Set<string>>>({});

  const totalDuration = useMemo(
    () => segments.reduce((sum, s) => sum + s.duration, 0),
    [segments]
  );

  const addSegment = useCallback(() => {
    const next: VideoSegment = {
      id: segmentId(),
      order: segments.length,
      duration: 10,
      prompt: "",
    };
    onUpdate([...segments, next]);
    setExpandedSeg(next.id);
  }, [segments, onUpdate]);

  const removeSegment = useCallback(
    (id: string) => {
      const updated = segments
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i }));
      onUpdate(updated);
      if (expandedSeg === id) {
        setExpandedSeg(updated[0]?.id ?? null);
      }
    },
    [segments, onUpdate, expandedSeg]
  );

  const updateSegment = useCallback(
    (id: string, patch: Partial<VideoSegment>) => {
      onUpdate(
        segments.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    [segments, onUpdate]
  );

  const moveSegment = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = segments.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const target = idx + dir;
      if (target < 0 || target >= segments.length) return;
      const copy = [...segments];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      onUpdate(copy.map((s, i) => ({ ...s, order: i })));
    },
    [segments, onUpdate]
  );

  const autoSplit = useCallback(
    (total: number) => {
      const durations = suggestSegments(total);
      const newSegs: VideoSegment[] = durations.map((d, i) => ({
        id: segmentId(),
        order: i,
        duration: d,
        prompt: "",
      }));
      onUpdate(newSegs);
      setExpandedSeg(newSegs[0]?.id ?? null);
    },
    [onUpdate]
  );

  // ── quick total duration input ──
  const [totalInput, setTotalInput] = useState("45");

  const allDone = segments.length > 0 && segments.every((s) => segmentStates[s.id]?.status === "done");
  const hasError = segments.some((s) => segmentStates[s.id]?.status === "error");

  return (
    <div className="r2v-timeline">
      {/* ── header: strategy + total ── */}
      <div className="r2v-tl-header">
        <div className="r2v-tl-strategies">
          {(Object.keys(STRATEGY_LABELS) as AnchorStrategy[]).map((key) => {
            const s = STRATEGY_LABELS[key];
            const active = anchorStrategy === key;
            return (
              <button
                key={key}
                type="button"
                className={`r2v-tl-strategy ${active ? "r2v-tl-strategy--active" : ""}`}
                onClick={() => onStrategyChange(key)}
                title={zh ? s.desc : s.descEn}
                disabled={generating}
              >
                {active ? "●" : "○"} {zh ? s.zh : s.en}
              </button>
            );
          })}
        </div>

        <div className="r2v-tl-total">
          <span className="r2v-tl-total-label">
            {zh ? "目标总时长" : "Target duration"}
          </span>
          <input
            type="number"
            className="r2v-input r2v-tl-total-input"
            value={totalInput}
            min={6}
            max={300}
            step={5}
            onChange={(e) => setTotalInput(e.target.value)}
            disabled={generating}
          />
          <span className="r2v-tl-total-unit">s</span>
          <button
            type="button"
            className="r2v-btn r2v-btn--xs"
            onClick={() => autoSplit(parseInt(totalInput, 10) || 45)}
            disabled={generating}
          >
            {zh ? "自动拆段" : "Auto split"}
          </button>
        </div>
      </div>

      {/* ── visual timeline bar ── */}
      {segments.length > 0 && (
        <div className="r2v-tl-bar">
          {segments.map((seg, i) => {
            const pct = totalDuration > 0 ? (seg.duration / totalDuration) * 100 : 0;
            const state = segmentStates[seg.id];
            const statusCls = state?.status ? `r2v-tl-block--${state.status}` : "";
            return (
              <div
                key={seg.id}
                className={`r2v-tl-block ${statusCls} ${expandedSeg === seg.id ? "r2v-tl-block--selected" : ""}`}
                style={{ width: `${Math.max(pct, 4)}%` }}
                onClick={() => setExpandedSeg(seg.id)}
                title={`${zh ? "镜头" : "Seg"} ${i + 1} · ${seg.duration}s`}
              >
                <span className="r2v-tl-block-label">
                  {STATUS_ICONS[state?.status ?? "pending"]} {i + 1}
                </span>
              </div>
            );
          })}
          <span className="r2v-tl-bar-total">{totalDuration}s</span>
        </div>
      )}

      {/* ── segment cards ── */}
      <div className="r2v-tl-segments">
        {segments.map((seg, i) => {
          const expanded = expandedSeg === seg.id;
          const state = segmentStates[seg.id];
          return (
            <div
              key={seg.id}
              className={`r2v-tl-seg ${expanded ? "r2v-tl-seg--expanded" : ""}`}
            >
              {/* collapsed header */}
              <div
                className="r2v-tl-seg-header"
                onClick={() => setExpandedSeg(expanded ? null : seg.id)}
              >
                <span className="r2v-tl-seg-num">
                  {STATUS_ICONS[state?.status ?? "pending"]}{" "}
                  {zh ? `镜头 ${i + 1}` : `Seg ${i + 1}`}
                </span>
                <span className="r2v-tl-seg-dur">{seg.duration}s</span>
                {seg.prompt && (
                  <span className="r2v-tl-seg-preview">
                    {seg.prompt.slice(0, 40)}
                    {seg.prompt.length > 40 ? "…" : ""}
                  </span>
                )}
                <span className="r2v-tl-seg-actions">
                  <button
                    type="button"
                    className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                    onClick={(e) => { e.stopPropagation(); moveSegment(seg.id, -1); }}
                    disabled={i === 0 || generating}
                    title="▲"
                  >▲</button>
                  <button
                    type="button"
                    className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                    onClick={(e) => { e.stopPropagation(); moveSegment(seg.id, 1); }}
                    disabled={i === segments.length - 1 || generating}
                    title="▼"
                  >▼</button>
                  <button
                    type="button"
                    className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                    onClick={(e) => { e.stopPropagation(); removeSegment(seg.id); }}
                    disabled={generating}
                    title={zh ? "删除" : "Remove"}
                  >✕</button>
                </span>
              </div>

              {/* expanded body */}
              {expanded && (
                <div className="r2v-tl-seg-body">
                  <div className="r2v-tl-seg-row">
                    <label className="r2v-tl-seg-label">
                      {zh ? "时长" : "Duration"}
                    </label>
                    <input
                      type="range"
                      min={3}
                      max={15}
                      step={1}
                      value={seg.duration}
                      onChange={(e) =>
                        updateSegment(seg.id, {
                          duration: parseInt(e.target.value, 10),
                        })
                      }
                      disabled={generating}
                      className="r2v-tl-slider"
                    />
                    <span className="r2v-tl-seg-dur-val">{seg.duration}s</span>
                  </div>

                  <div className="r2v-tl-seg-row">
                    <label className="r2v-tl-seg-label">
                      {zh ? "运镜" : "Camera"}
                    </label>
                    <input
                      type="text"
                      className="r2v-input r2v-tl-cam-input"
                      placeholder={zh ? "推镜、环绕、固定..." : "push, orbit, static..."}
                      value={seg.cameraMove ?? ""}
                      onChange={(e) =>
                        updateSegment(seg.id, { cameraMove: e.target.value })
                      }
                      disabled={generating}
                    />
                  </div>

                  <div className="r2v-tl-seg-row r2v-tl-seg-row--full">
                    <label className="r2v-tl-seg-label">Prompt</label>
                    <textarea
                      className="r2v-tl-prompt-area"
                      rows={4}
                      placeholder={
                        zh
                          ? `【镜头${i + 1}】描述该段画面、动作、光线...\ncharacter1 出现在...`
                          : `[Shot ${i + 1}] Describe scene, action, lighting...\ncharacter1 appears...`
                      }
                      value={seg.prompt}
                      onChange={(e) =>
                        updateSegment(seg.id, { prompt: e.target.value })
                      }
                      disabled={generating}
                    />
                  </div>

                  {/* inherited anchor frames from previous segment — user-selectable */}
                  {i > 0 && (() => {
                    const prevSeg = segments[i - 1];
                    const prevState = segmentStates[prevSeg?.id];
                    const prevFrames = prevState?.keyFrames;
                    const selSet = anchorSelections[seg.id] ?? new Set(prevFrames?.map((kf) => kf.label) ?? []);
                    const selCount = prevFrames ? prevFrames.filter((kf) => selSet.has(kf.label)).length : 0;
                    return (
                      <div className="r2v-tl-seg-row r2v-tl-seg-row--full">
                        <div className="r2v-cont-frames-header">
                          <label className="r2v-tl-seg-label">
                            {zh
                              ? `🔗 上段锚定帧（${selCount}/${prevFrames?.length ?? 0} 帧已选）`
                              : `🔗 Prev anchor frames (${selCount}/${prevFrames?.length ?? 0} selected)`}
                          </label>
                          {prevFrames && prevFrames.length > 0 && (
                            <button
                              type="button"
                              className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                              onClick={() => {
                                if (selCount === prevFrames.length) {
                                  setAnchorSelections((prev) => ({ ...prev, [seg.id]: new Set() }));
                                } else {
                                  setAnchorSelections((prev) => ({
                                    ...prev,
                                    [seg.id]: new Set(prevFrames.map((kf) => kf.label)),
                                  }));
                                }
                              }}
                              disabled={generating}
                            >
                              {selCount === prevFrames.length ? (zh ? "清除" : "Clear") : (zh ? "全选" : "All")}
                            </button>
                          )}
                        </div>
                        {prevFrames && prevFrames.length > 0 ? (
                          <div className="r2v-tl-keyframes">
                            {prevFrames.map((kf) => {
                              const on = selSet.has(kf.label);
                              return (
                                <div
                                  key={kf.label}
                                  className={`r2v-tl-keyframe r2v-tl-keyframe--pick ${on ? "r2v-tl-keyframe--on" : ""}`}
                                  onClick={() => {
                                    if (generating) return;
                                    setAnchorSelections((prev) => {
                                      const cur = prev[seg.id] ?? new Set(prevFrames.map((f) => f.label));
                                      const next = new Set(cur);
                                      if (next.has(kf.label)) next.delete(kf.label);
                                      else next.add(kf.label);
                                      return { ...prev, [seg.id]: next };
                                    });
                                  }}
                                >
                                  <img src={kf.dataUrl} alt={kf.label} className="r2v-tl-lastframe-img" />
                                  <span className="r2v-tl-keyframe-label">{kf.label} · {kf.time}s</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="r2v-tl-anchor-hint">
                            {prevState?.status === "done"
                              ? (zh ? "⚠️ 未提取到帧" : "⚠️ No frames extracted")
                              : (zh ? "⏳ 等待上段完成后提取" : "⏳ Waiting for prev segment")}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* per-segment reference override */}
                  {refs.length > 1 && (
                    <div className="r2v-tl-seg-row">
                      <label className="r2v-tl-seg-label">
                        {zh ? "参考图" : "Refs"}
                      </label>
                      <div className="r2v-tl-ref-picks">
                        {refs.map((r, ri) => {
                          const active =
                            !seg.overrideRefSlots ||
                            seg.overrideRefSlots.includes(r.slot);
                          return (
                            <button
                              key={r.slot}
                              type="button"
                              className={`r2v-tl-ref-pick ${active ? "r2v-tl-ref-pick--on" : ""}`}
                              onClick={() => {
                                if (!seg.overrideRefSlots) {
                                  // First click: select only this one
                                  updateSegment(seg.id, {
                                    overrideRefSlots: [r.slot],
                                  });
                                } else if (active) {
                                  const next = seg.overrideRefSlots.filter(
                                    (s) => s !== r.slot
                                  );
                                  updateSegment(seg.id, {
                                    overrideRefSlots: next.length > 0 ? next : undefined,
                                  });
                                } else {
                                  updateSegment(seg.id, {
                                    overrideRefSlots: [...seg.overrideRefSlots, r.slot],
                                  });
                                }
                              }}
                              disabled={generating}
                              title={r.note || r.name || `character${ri + 1}`}
                            >
                              {r.thumbDataUrl ? (
                                <img
                                  src={r.thumbDataUrl}
                                  alt={`c${ri + 1}`}
                                  className="r2v-tl-ref-thumb"
                                />
                              ) : (
                                <span>{ri + 1}</span>
                              )}
                            </button>
                          );
                        })}
                        {seg.overrideRefSlots && (
                          <button
                            type="button"
                            className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                            onClick={() =>
                              updateSegment(seg.id, { overrideRefSlots: undefined })
                            }
                            disabled={generating}
                          >
                            {zh ? "全选" : "All"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* segment run status */}
                  {state && state.status !== "pending" && (
                    <div className={`r2v-tl-seg-status r2v-tl-seg-status--${state.status}`}>
                      {state.status === "running" && state.elapsed != null
                        ? `${zh ? "渲染中" : "Running"} · ${state.elapsed}s`
                        : state.status === "done"
                          ? (zh ? "已完成" : "Done")
                          : state.status === "error"
                            ? `${zh ? "失败" : "Error"}: ${state.error ?? ""}`
                            : zh ? "提交中..." : "Submitting..."}
                    </div>
                  )}

                  {/* preview key frames extracted from this segment */}
                  {state?.keyFrames && state.keyFrames.length > 0 && (
                    <div className="r2v-tl-seg-lastframe">
                      <span className="r2v-tl-seg-label">
                        {zh
                          ? `关键帧（${state.keyFrames.length} 帧 → 下段参考）`
                          : `Key frames (${state.keyFrames.length} → next ref)`}
                      </span>
                      <div className="r2v-tl-keyframes">
                        {state.keyFrames.map((kf) => (
                          <div key={kf.label} className="r2v-tl-keyframe">
                            <img
                              src={kf.dataUrl}
                              alt={kf.label}
                              className="r2v-tl-lastframe-img"
                            />
                            <span className="r2v-tl-keyframe-label">
                              {kf.label} · {kf.time}s
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── bottom actions ── */}
      <div className="r2v-tl-actions">
        {!generating && (
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost"
            onClick={addSegment}
          >
            {zh ? "＋ 添加镜头" : "＋ Add segment"}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {generating ? (
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost"
            onClick={onCancel}
          >
            {zh ? "■ 停止" : "■ Stop"}
          </button>
        ) : (
          <button
            type="button"
            className="r2v-btn r2v-btn--primary r2v-btn--lg"
            onClick={onGenerate}
            disabled={segments.length === 0 || segments.some((s) => !s.prompt.trim())}
          >
            {zh
              ? `🎬 链式生成（${segments.length} 段 · ${totalDuration}s）`
              : `🎬 Chain generate (${segments.length} segs · ${totalDuration}s)`}
          </button>
        )}
      </div>

      {/* generation summary */}
      {allDone && (
        <div className="r2v-tl-summary r2v-tl-summary--done">
          {zh
            ? `✅ 全部 ${segments.length} 段已完成 · 总时长 ${totalDuration}s`
            : `✅ All ${segments.length} segments done · ${totalDuration}s total`}
        </div>
      )}
      {hasError && !generating && (
        <div className="r2v-tl-summary r2v-tl-summary--error">
          {zh ? "部分段生成失败，可修改后重新生成" : "Some segments failed. Edit and retry."}
        </div>
      )}
    </div>
  );
}
