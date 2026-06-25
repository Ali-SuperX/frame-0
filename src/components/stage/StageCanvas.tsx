"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useStudioStore,
  type Series,
  type StageEpisode,
  type StageShot,
  type Job,
} from "@/lib/store";
import {
  layoutEpisode,
  reflowPositions,
  SHOT_NODE_W,
  SHOT_NODE_H,
  type ShotPos,
  type SceneBox,
} from "@/lib/stage/canvasLayout";
import { shotImageUrl } from "@/lib/stage/stageGen";
import StageShotNode from "./StageShotNode";
import StageSceneGroup from "./StageSceneGroup";
import StageBiblePanel from "./StageBiblePanel";

const MIN_SCALE = 0.15;
const MAX_SCALE = 2.0;
const DEFAULT_SCALE = 0.75;

export default function StageCanvas({
  series,
  episode,
  jobById,
  selectedShotId,
  setSelectedShotId,
  expandedShotId,
  setExpandedShotId,
  batchProgress,
  panToShotRef,
  zh,
}: {
  series: Series;
  episode: StageEpisode;
  jobById: Map<string, Job>;
  selectedShotId: string | null;
  setSelectedShotId: (id: string | null) => void;
  expandedShotId: string | null;
  setExpandedShotId: (id: string | null) => void;
  batchProgress: { done: number; total: number; label: string } | null;
  panToShotRef: React.MutableRefObject<((id: string) => void) | null>;
  zh: boolean;
}) {
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const removeShot = useStudioStore((s) => s.seriesRemoveShot);

  // ── Canvas view ──
  const [view, setView] = useState({ x: 80, y: 80, scale: DEFAULT_SCALE });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 700 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const onStagePointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".sc-shot") || t.closest(".sc-scene-box") || t.closest(".sc-zoom-ctrl") || t.closest(".sc-minimap") || t.closest(".sc-empty-card")) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx + (e.clientX - p.sx), y: p.vy + (e.clientY - p.sy) }));
  };
  const onStagePointerUp = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (p) {
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        setSelectedShotId(null);
        setExpandedShotId(null);
      }
    }
    panRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const wx = (mx - v.x) / v.scale;
      const wy = (my - v.y) / v.scale;
      return { x: mx - wx * ns, y: my - wy * ns, scale: ns };
    });
  };

  // ── Shot dragging（流畅性：拖拽时直接改 DOM 的 left/top，绕过过渡与重渲，松手才落库一次）──
  const dragRef = useRef<{
    el: HTMLElement; shotId: string; epId: string; sceneId: string;
    sx: number; sy: number; ox: number; oy: number; moved: boolean;
  } | null>(null);

  const startShotDrag = (e: React.PointerEvent, shot: StageShot, sceneId: string) => {
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest(".sc-shot") as HTMLElement | null;
    if (!el) return;
    dragRef.current = {
      el, shotId: shot.id, epId: episode.id, sceneId,
      sx: e.clientX, sy: e.clientY,
      ox: shot._cx ?? 0, oy: shot._cy ?? 0, moved: false,
    };
    el.classList.add("dragging");
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / view.scale;
    const dy = (e.clientY - d.sy) / view.scale;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    d.el.style.left = `${d.ox + dx}px`;
    d.el.style.top = `${d.oy + dy}px`;
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      d.el.classList.remove("dragging");
      if (d.moved) {
        const dx = (e.clientX - d.sx) / view.scale;
        const dy = (e.clientY - d.sy) / view.scale;
        updateShot(d.epId, d.sceneId, d.shotId, { _cx: d.ox + dx, _cy: d.oy + dy });
      }
      dragRef.current = null;
    }
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  };

  // ── Bible panel ──
  const [bibleOpen, setBibleOpen] = useState(false);

  // ── Layout ──
  const layout = useMemo(() => {
    return layoutEpisode(episode.scenes);
  }, [episode]);

  useEffect(() => {
    for (const scene of episode.scenes) {
      for (const shot of scene.shots) {
        if (shot._cx == null || shot._cy == null) {
          const pos = layout.shots.find((s) => s.shotId === shot.id);
          if (pos) updateShot(episode.id, scene.id, shot.id, { _cx: pos.x, _cy: pos.y });
        }
      }
    }
  }, [episode.id, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan to shot ──
  const worldRef = useRef<HTMLDivElement | null>(null);
  const panToShot = useCallback((shotId: string) => {
    for (const scene of episode.scenes) {
      const shot = scene.shots.find((s) => s.id === shotId);
      if (shot && shot._cx != null && shot._cy != null) {
        const rect = stageRef.current?.getBoundingClientRect();
        const W = rect?.width ?? 1200;
        const H = rect?.height ?? 700;
        const cx = shot._cx + SHOT_NODE_W / 2;
        const cy = shot._cy + SHOT_NODE_H / 2;
        const el = worldRef.current;
        const edgesG = stageRef.current?.querySelector(".sc-edges-g");
        if (el) {
          el.classList.add("animating");
          edgesG?.classList.add("animating");
          setTimeout(() => { el.classList.remove("animating"); edgesG?.classList.remove("animating"); }, 350);
        }
        setView((v) => ({ ...v, x: W / 2 - cx * v.scale, y: H / 2 - cy * v.scale }));
        return;
      }
    }
  }, [episode]);

  // Expose panToShot to parent
  useEffect(() => {
    panToShotRef.current = panToShot;
  }, [panToShot, panToShotRef]);

  // ── Fit view ──
  const fitView = useCallback(() => {
    if (!layout.shots.length) { setView({ x: 80, y: 80, scale: DEFAULT_SCALE }); return; }
    const rect = stageRef.current?.getBoundingClientRect();
    const W = rect?.width ?? 1200;
    const H = rect?.height ?? 700;
    const xs = layout.shots.map((s) => s.x);
    const ys = layout.shots.map((s) => s.y);
    const minX = Math.min(...xs) - 80;
    const minY = Math.min(...ys) - 80;
    const maxX = Math.max(...xs) + SHOT_NODE_W + 80;
    const maxY = Math.max(...ys) + SHOT_NODE_H + 80;
    const scale = Math.min(0.9, Math.max(MIN_SCALE, Math.min(W / (maxX - minX), H / (maxY - minY))));
    setView({ x: W / 2 - ((minX + maxX) / 2) * scale, y: H / 2 - ((minY + maxY) / 2) * scale, scale });
  }, [layout]);

  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || !layout.shots.length) return;
    fittedRef.current = true;
    fitView();
  }, [layout, fitView]);

  const zoomIn = () => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.3) }));
  const zoomOut = () => setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.3) }));

  // 整理画布：按场景行重排所有镜头
  const organizeCanvas = useCallback(() => {
    const pos = reflowPositions(episode.scenes);
    for (const p of pos) {
      const sc = episode.scenes.find((s) => s.shots.some((sh) => sh.id === p.shotId));
      if (sc) updateShot(episode.id, sc.id, p.shotId, { _cx: p.x, _cy: p.y });
    }
    setTimeout(() => fitView(), 80);
  }, [episode, updateShot, fitView]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (inInput) (e.target as HTMLElement).blur();
        setExpandedShotId(null);
        setSelectedShotId(null);
        e.preventDefault();
        return;
      }
      if (inInput) return;
      if (e.key === "f" || e.key === "F") { fitView(); e.preventDefault(); }
      if (e.key === "b" || e.key === "B") { setBibleOpen((v) => !v); e.preventDefault(); }
      if (e.key === "s" || e.key === "S") {
        let sceneId = episode.scenes[episode.scenes.length - 1]?.id;
        if (!sceneId) sceneId = addScene(episode.id);
        addShot(episode.id, sceneId);
        e.preventDefault();
      }
      if (e.key === "=" || e.key === "+") { zoomIn(); e.preventDefault(); }
      if (e.key === "-") { zoomOut(); e.preventDefault(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShotId && !expandedShotId) {
        for (const scene of episode.scenes) {
          const shot = scene.shots.find((s) => s.id === selectedShotId);
          if (shot) {
            removeShot(episode.id, scene.id, shot.id);
            setSelectedShotId(null);
            e.preventDefault();
            break;
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [episode, fitView, addScene, addShot, selectedShotId, expandedShotId, removeShot, setSelectedShotId, setExpandedShotId]);

  // ── Edge paths ──
  const edgePaths = useMemo(() => {
    const paths: { id: string; d: string }[] = [];
    for (const scene of episode.scenes) {
      for (let i = 0; i < scene.shots.length - 1; i++) {
        const a = scene.shots[i];
        const b = scene.shots[i + 1];
        const ax = (a._cx ?? 0) + SHOT_NODE_W;
        const ay = (a._cy ?? 0) + SHOT_NODE_H / 2;
        const bx = b._cx ?? 0;
        const by = (b._cy ?? 0) + SHOT_NODE_H / 2;
        const dx = Math.max(30, Math.abs(bx - ax) * 0.4);
        paths.push({ id: `${a.id}-${b.id}`, d: `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}` });
      }
    }
    return paths;
  }, [episode]);

  // ── Minimap ──
  const minimapData = useMemo(() => {
    if (!layout.shots.length) return null;
    const xs = layout.shots.map((s) => s.x);
    const ys = layout.shots.map((s) => s.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + SHOT_NODE_W + 40;
    const maxY = Math.max(...ys) + SHOT_NODE_H + 40;
    return { minX, minY, ww: maxX - minX, wh: maxY - minY, shots: layout.shots };
  }, [layout]);

  const isEmpty = episode.scenes.every((s) => s.shots.length === 0);

  const handleQuickStart = (type: "ai" | "manual" | "bible") => {
    if (type === "bible") { setBibleOpen(true); return; }
    if (type === "ai") {
      const el = document.querySelector(".sc-box-ta") as HTMLTextAreaElement;
      el?.focus();
      return;
    }
    if (type === "manual") {
      let sceneId = episode.scenes[episode.scenes.length - 1]?.id;
      if (!sceneId) sceneId = addScene(episode.id);
      addShot(episode.id, sceneId);
    }
  };

  return (
    <div className="sc-body">
      {bibleOpen && (
        <StageBiblePanel series={series} zh={zh} onClose={() => setBibleOpen(false)} />
      )}

      <div
        className="sc-stage"
        ref={stageRef}
        onPointerDown={onStagePointerDown}
        onPointerMove={(e) => { onStagePointerMove(e); onDragMove(e); }}
        onPointerUp={(e) => { onStagePointerUp(e); endDrag(e); }}
        onWheel={onWheel}
      >
        {/* SVG edges */}
        <svg className="sc-edges" aria-hidden>
          <g className="sc-edges-g" transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`}>
            {edgePaths.map((p) => (
              <path key={p.id} d={p.d} className="sc-edge-path" />
            ))}
            <defs>
              <marker id="sc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--paper-mute)" fillOpacity="0.4" />
              </marker>
            </defs>
          </g>
        </svg>

        {/* World layer */}
        <div
          ref={worldRef}
          className="sc-world"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {episode.scenes.map((scene, si) => {
            const box = layout.boxes.find((b) => b.sceneId === scene.id);
            if (!box) return null;
            return <StageSceneGroup key={scene.id} scene={scene} box={box} series={series} sceneIdx={si} zh={zh} />;
          })}

          {episode.scenes.map((scene) =>
            scene.shots.map((shot) => (
              <StageShotNode
                key={shot.id}
                shot={shot}
                scene={scene}
                episode={episode}
                series={series}
                jobs={jobById}
                selected={selectedShotId === shot.id}
                expanded={expandedShotId === shot.id}
                onSelect={() => setSelectedShotId(shot.id)}
                onExpand={() => setExpandedShotId(expandedShotId === shot.id ? null : shot.id)}
                onDragHandle={(e) => startShotDrag(e, shot, scene.id)}
                zh={zh}
              />
            )),
          )}
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="sc-empty-hint">
            <div className="sc-empty-hero">
              <div className="sc-empty-hero-glow" />
              <div className="sc-empty-title">{zh ? "写故事，AI 出片" : "Write a story, AI delivers"}</div>
              <div className="sc-empty-sub">{zh ? "输入梗概 → 自动分镜 → 一键出图/视频/导出" : "Enter premise → auto storyboard → one-click images/video/export"}</div>
            </div>
            <div className="sc-empty-flow">
              <div className="sc-empty-step" onClick={() => handleQuickStart("ai")}>
                <div className="sc-empty-step-num">1</div>
                <div className="sc-empty-step-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                </div>
                <div className="sc-empty-step-title">{zh ? "写故事" : "Write"}</div>
                <div className="sc-empty-step-desc">{zh ? "AI 自动拆镜头" : "AI splits to shots"}</div>
              </div>
              <div className="sc-empty-step-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
              <div className="sc-empty-step" onClick={() => handleQuickStart("manual")}>
                <div className="sc-empty-step-num">2</div>
                <div className="sc-empty-step-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                </div>
                <div className="sc-empty-step-title">{zh ? "出图/视频" : "Generate"}</div>
                <div className="sc-empty-step-desc">{zh ? "一键批量生成" : "Batch generate all"}</div>
              </div>
              <div className="sc-empty-step-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
              <div className="sc-empty-step">
                <div className="sc-empty-step-num">3</div>
                <div className="sc-empty-step-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </div>
                <div className="sc-empty-step-title">{zh ? "导出" : "Export"}</div>
                <div className="sc-empty-step-desc">{zh ? "送入剪辑器" : "To timeline editor"}</div>
              </div>
            </div>
            <div className="sc-empty-inline-input">
              <input
                className="sc-empty-input"
                placeholder={zh ? "输入故事梗概，按回车开始…" : "Type your story premise, press Enter…"}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuickStart("ai"); } }}
                onFocus={() => handleQuickStart("ai")}
              />
              <button className="sc-empty-input-btn" onClick={() => handleQuickStart("ai")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
              </button>
            </div>
            <button className="sc-empty-secondary" onClick={() => handleQuickStart("bible")}>
              {zh ? "或先设定角色 →" : "or define characters first →"}
            </button>
          </div>
        )}

        {/* Minimap */}
        {!isEmpty && minimapData && (
          <div
            className="sc-minimap"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = (e.clientX - rect.left) / rect.width;
              const py = (e.clientY - rect.top) / rect.height;
              const worldX = minimapData.minX + px * minimapData.ww;
              const worldY = minimapData.minY + py * minimapData.wh;
              const stageRect = stageRef.current?.getBoundingClientRect();
              setView((v) => ({
                ...v,
                x: (stageRect?.width ?? 1200) / 2 - worldX * v.scale,
                y: (stageRect?.height ?? 700) / 2 - worldY * v.scale,
              }));
            }}
          >
            <div className="sc-minimap-inner">
              {minimapData.shots.map((s) => (
                <div
                  key={s.shotId}
                  className="sc-minimap-node"
                  style={{
                    left: `${((s.x - minimapData.minX) / minimapData.ww) * 100}%`,
                    top: `${((s.y - minimapData.minY) / minimapData.wh) * 100}%`,
                    width: `${(SHOT_NODE_W / minimapData.ww) * 100}%`,
                    height: `${(SHOT_NODE_H / minimapData.wh) * 100}%`,
                  }}
                />
              ))}
              {(() => {
                const vx = (-view.x / view.scale - minimapData.minX) / minimapData.ww;
                const vy = (-view.y / view.scale - minimapData.minY) / minimapData.wh;
                const vw = (containerSize.w / view.scale) / minimapData.ww;
                const vh = (containerSize.h / view.scale) / minimapData.wh;
                return (
                  <div className="sc-minimap-viewport" style={{
                    left: `${Math.max(0, vx * 100)}%`, top: `${Math.max(0, vy * 100)}%`,
                    width: `${Math.min(100, vw * 100)}%`, height: `${Math.min(100, vh * 100)}%`,
                  }} />
                );
              })()}
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="sc-zoom-ctrl">
          <button className="sc-zoom-btn" onClick={zoomOut} title={zh ? "缩小" : "Zoom out"}>−</button>
          <span className="sc-zoom-pct">{Math.round(view.scale * 100)}%</span>
          <button className="sc-zoom-btn" onClick={zoomIn} title={zh ? "放大" : "Zoom in"}>+</button>
          <button className="sc-zoom-btn" onClick={fitView} title={zh ? "适配" : "Fit"}>⊞</button>
          <button className="sc-zoom-btn" onClick={organizeCanvas} title={zh ? "整理画布" : "Organize"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          </button>
        </div>

        {/* Batch progress */}
        {batchProgress && (
          <div className="sc-batch-overlay">
            <span className="sc-batch-title">{batchProgress.label} — {zh ? "生成中" : "Generating"}</span>
            <div className="sc-batch-bar">
              <div className="sc-batch-fill" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
            </div>
            <span className="sc-batch-text">{batchProgress.done} / {batchProgress.total}</span>
          </div>
        )}
      </div>
    </div>
  );
}
