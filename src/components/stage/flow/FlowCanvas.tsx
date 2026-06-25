"use client";

// FlowCanvas — 无限平移缩放节点流画布（节点拖拽 / 贝塞尔连线 / minimap / 工具栏）
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Series, Job } from "@/lib/store";
import {
  FLOW_STAGES, FLOW_EDGES, computeGroupBoxes, contextualSuggestions, type FlowStage, type FlowStageId, type FlowStatus,
} from "@/lib/stage/flowStages";
import FlowNode, { NODE_W, NODE_H } from "./FlowNode";
import FlowCard from "./FlowCard";
import { FlowIcon } from "./FlowIcon";

type View = { x: number; y: number; k: number };
type Pos = Record<string, { x: number; y: number }>;
type Drag =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "node"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | null;

const initialPos = (): Pos => {
  const p: Pos = {};
  FLOW_STAGES.forEach((s) => { p[s.id] = { ...s.pos }; });
  return p;
};

// 贝塞尔锚点：依据两节点相对位置选水平/垂直出入口
function anchors(a: { x: number; y: number }, b: { x: number; y: number }) {
  const A = { cx: a.x + NODE_W / 2, cy: a.y + NODE_H / 2 };
  const B = { cx: b.x + NODE_W / 2, cy: b.y + NODE_H / 2 };
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  let s, e, c1, c2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const d = dx > 0 ? 1 : -1;
    s = { x: A.cx + d * NODE_W / 2, y: A.cy }; e = { x: B.cx - d * NODE_W / 2, y: B.cy };
    const h = Math.max(40, Math.abs(e.x - s.x) * 0.5);
    c1 = { x: s.x + d * h, y: s.y }; c2 = { x: e.x - d * h, y: e.y };
  } else {
    const d = dy > 0 ? 1 : -1;
    s = { x: A.cx, y: A.cy + d * NODE_H / 2 }; e = { x: B.cx, y: B.cy - d * NODE_H / 2 };
    const v = Math.max(40, Math.abs(e.y - s.y) * 0.5);
    c1 = { x: s.x, y: s.y + d * v }; c2 = { x: e.x, y: e.y - d * v };
  }
  return { s, e, c1, c2 };
}

export default function FlowCanvas({
  series, jobById, status, meta, selectedId, onSelect, onGenerate, onOpenFull, onSend, inspectorOpen, hoveredId, onHover,
}: {
  series: Series;
  jobById: Map<string, Job>;
  status: Record<FlowStageId, FlowStatus>;
  meta: Record<FlowStageId, string>;
  selectedId: FlowStageId | null;
  onSelect: (id: FlowStageId | null) => void;
  onGenerate?: (id: FlowStageId) => void;
  onOpenFull?: () => void;
  onSend?: (scopeId: FlowStageId, text: string) => Promise<string>;
  inspectorOpen?: boolean;
  hoveredId?: FlowStageId | null;
  onHover?: (id: FlowStageId | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 60, y: 30, k: 0.82 });
  const [pos, setPos] = useState<Pos>(initialPos);
  const drag = useRef<Drag>(null);
  const moved = useRef(false);
  const [panning, setPanning] = useState(false);
  const [smoothPan, setSmoothPan] = useState(false); // panToNode 聚焦时给画布加平滑过渡

  // fit to content
  const fit = useCallback(() => {
    const el = wrapRef.current; if (!el) return;
    const xs = Object.values(pos);
    const minX = Math.min(...xs.map((p) => p.x)) - 60, minY = Math.min(...xs.map((p) => p.y)) - 60;
    const maxX = Math.max(...xs.map((p) => p.x)) + NODE_W + 60, maxY = Math.max(...xs.map((p) => p.y)) + NODE_H + 60;
    const w = el.clientWidth, h = el.clientHeight;
    const k = Math.min(w / (maxX - minX), h / (maxY - minY), 1.1);
    setView({ k, x: (w - (maxX - minX) * k) / 2 - minX * k, y: (h - (maxY - minY) * k) / 2 - minY * k });
  }, [pos]);

  useEffect(() => { fit(); /* 初次居中 */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // wheel zoom toward cursor（native listener 确保可 preventDefault）
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(2, Math.max(0.3, v.k * (1 - e.deltaY * 0.0012)));
        const s = k / v.k;
        return { k, x: mx - (mx - v.x) * s, y: my - (my - v.y) * s };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".sf-node, .sf-tools, .sf-foot, .sf-minimap, .sf-card")) return;
    moved.current = false; setSmoothPan(false);
    drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    setPanning(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const startNodeDrag = (e: PointerEvent, id: string) => {
    moved.current = false;
    const start = pos[id];
    drag.current = { type: "node", id, sx: e.clientX, sy: e.clientY, ox: start.x, oy: start.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (d.type === "pan") {
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) moved.current = true;
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
    } else {
      const dx = (e.clientX - d.sx) / view.k, dy = (e.clientY - d.sy) / view.k;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) { d.moved = true; moved.current = true; }
      setPos((p) => ({ ...p, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    setPanning(false);
    drag.current = null;
    if (d?.type === "pan" && !moved.current) onSelect(null); // 点空白取消选中
  };
  // 指针被系统手势/来电打断 → 清拖拽态，避免下次 move 从错误基点跳变
  const onPointerCancel = () => { drag.current = null; setPanning(false); };
  // 点节点 → 平滑聚焦：让节点落在视口左中，右侧留出大卡空间（位置「智能」、不飘忽）
  const panToNode = (id: string) => {
    const el = wrapRef.current; const p = pos[id]; if (!el || !p) return;
    const k = Math.min(Math.max(view.k, 0.75), 1);
    const w = el.clientWidth, h = el.clientHeight;
    const cx = p.x + NODE_W / 2, cy = p.y + NODE_H / 2;
    setSmoothPan(true);
    setView({ k, x: w * 0.3 - cx * k, y: h * 0.4 - cy * k });
    window.setTimeout(() => setSmoothPan(false), 400);
  };
  const onNodeClick = (id: string) => { if (!moved.current) onSelect(id as FlowStageId); };
  // 选中变化（点节点 / 键盘 1-9 / Stepper）统一聚焦到该节点，保证大卡始终定位在视口内
  useEffect(() => { if (selectedId) panToNode(selectedId); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // minimap 包围盒 + 分组框：useMemo 缓存，仅节点坐标变化时重算（平移/缩放不触发全量扫描）
  const { bx, by, mmK } = useMemo(() => {
    const xs = Object.values(pos);
    const minX = Math.min(...xs.map((p) => p.x)) - 80, minY = Math.min(...xs.map((p) => p.y)) - 80;
    const w = (Math.max(...xs.map((p) => p.x)) + NODE_W + 80) - minX;
    const h = (Math.max(...xs.map((p) => p.y)) + NODE_H + 80) - minY;
    return { bx: minX, by: minY, mmK: Math.min(180 / w, 120 / h) };
  }, [pos]);
  const groupBoxes = useMemo(() => computeGroupBoxes(pos), [pos]);
  const el = wrapRef.current;
  const vp = el ? { x: (-view.x / view.k - bx) * mmK, y: (-view.y / view.k - by) * mmK, w: (el.clientWidth / view.k) * mmK, h: (el.clientHeight / view.k) * mmK } : null;

  const edgeStyle = (from: FlowStageId, to: FlowStageId) => {
    const sf = status[from], st = status[to];
    if (st === "generating") return { stroke: "var(--cy)", dash: true, w: 2, soft: false };
    if (st === "empty" || sf === "empty") return { stroke: "color-mix(in oklab, var(--paper) 13%, transparent)", dash: false, w: 1.6, soft: true };
    return { stroke: "var(--ac-line)", dash: false, w: 2, soft: false };
  };

  const stageById = (id: FlowStageId): FlowStage => FLOW_STAGES.find((s) => s.id === id)!;

  return (
    <div ref={wrapRef} className={`sf-canvas-wrap${panning ? " panning" : ""}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel}>
      <div className="sf-grid-bg" style={{ transform: `translate(${view.x % (26 * view.k)}px,${view.y % (26 * view.k)}px)`, backgroundSize: `${26 * view.k}px ${26 * view.k}px` }} />

      <div className={`sf-canvas-content${smoothPan ? " sf-smooth" : ""}`} style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` }}>
        {groupBoxes.map((g) => (
          <div key={g.id} className="sf-group" style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
            <span className="sf-group-label">{g.zh}<i>{g.en}</i></span>
          </div>
        ))}
        <svg className="sf-edges-svg" width="4000" height="3000">
          <defs>
            <marker id="sf-arrow" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto">
              <path d="M1,1 L7,4.5 L1,8" fill="none" stroke="var(--ac-line)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {FLOW_EDGES.map(([f, t]) => {
            const a = anchors(pos[f], pos[t]); const es = edgeStyle(f, t);
            const dPath = `M${a.s.x},${a.s.y} C${a.c1.x},${a.c1.y} ${a.c2.x},${a.c2.y} ${a.e.x},${a.e.y}`;
            return (
              <g key={f + t}>
                <path d={dPath} fill="none" stroke={es.stroke} strokeWidth={es.w}
                  strokeDasharray={es.dash ? "6 7" : es.soft ? "2 8" : "1 9"}
                  style={{ animation: `sf-dash ${es.dash ? ".7s" : "1.5s"} linear infinite` }}
                  markerEnd={es.soft ? undefined : "url(#sf-arrow)"} strokeLinecap="round" />
                <circle cx={a.s.x} cy={a.s.y} r="3.5" fill={es.soft ? "var(--t4)" : "var(--ac-2)"} />
              </g>
            );
          })}
        </svg>

        {FLOW_STAGES.map((st) => (
          <FlowNode key={st.id} stage={st} pos={pos[st.id]} status={status[st.id]} meta={meta[st.id]}
            selected={selectedId === st.id} dimmed={selectedId !== null && selectedId !== st.id} hl={hoveredId === st.id} onHover={onHover}
            series={series} jobById={jobById}
            onClick={onNodeClick} onPointerDown={startNodeDrag} />
        ))}
      </div>

      {/* 节点展开式大创作卡（选中节点时，从节点位置展开为完整工作台） */}
      {selectedId && (() => {
        const node = pos[selectedId]; const st = stageById(selectedId);
        if (!node) return null;
        const k = view.k;
        const sx = view.x + node.x * k, sy = view.y + node.y * k, sw = NODE_W * k, sh = NODE_H * k;
        const wrapW = wrapRef.current?.clientWidth ?? 1200;
        const wrapH = wrapRef.current?.clientHeight ?? 700;
        const W = Math.min(860, Math.max(340, wrapW - 32));
        const cardMaxH = Math.max(420, wrapH - 32);
        const left = Math.max(16, wrapW - W - 16);
        const top = 16;
        return (
          <>
            <div className="sf-follow-ring" style={{ left: sx - 4, top: sy - 4, width: sw + 8, height: sh + 8, opacity: panning ? 0 : 1 }} />
            <FlowCard key={st.id} stage={st} status={status[selectedId]} series={series} jobById={jobById}
              suggestions={contextualSuggestions(st.id, series)} style={{ left, top, maxHeight: cardMaxH }}
              onClose={() => onSelect(null)}
              onSend={onSend ? (text) => onSend(st.id, text) : undefined}
              onGenerate={onGenerate} />
          </>
        );
      })()}

      <div className="sf-hint">
        <FlowIcon n="hand" s={14} /> 拖拽平移 · 滚轮缩放 · <span className="sf-kbd">点击节点</span> 唤起 AI 对话
      </div>

      <div className="sf-tools">
        <button className="sf-tool on" title="选择 · 点节点编辑、拖空白平移"><FlowIcon n="cursor" s={18} /></button>
        <button className="sf-tool" title="整理布局 · 复位居中" onClick={fit}><FlowIcon n="grid" s={17} /></button>
      </div>

      <div className="sf-foot">
        <button className="sf-zbtn" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k - 0.15) }))}><FlowIcon n="zout" s={16} /></button>
        <div className="sf-zlevel">{Math.round(view.k * 100)}%</div>
        <button className="sf-zbtn" onClick={() => setView((v) => ({ ...v, k: Math.min(2, v.k + 0.15) }))}><FlowIcon n="zin" s={16} /></button>
        <div style={{ width: 1, height: 20, background: "var(--line-2)", margin: "0 2px" }} />
        <button className="sf-zbtn" onClick={fit} title="适应画布"><FlowIcon n="fit" s={16} /></button>
      </div>

      <div className="sf-minimap" style={{ cursor: "pointer" }}
        onPointerDown={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const cxC = bx + (e.clientX - r.left) / mmK;
          const cyC = by + (e.clientY - r.top) / mmK;
          const w = wrapRef.current?.clientWidth ?? 1200, h = wrapRef.current?.clientHeight ?? 700;
          setView((v) => ({ ...v, x: w / 2 - cxC * v.k, y: h / 2 - cyC * v.k }));
        }}>
        {FLOW_STAGES.map((st) => (
          <div key={st.id} className={`sf-mm-node ${status[st.id] === "ready" ? "ready" : status[st.id] === "generating" ? "gen" : ""}`}
            style={{ left: (pos[st.id].x - bx) * mmK, top: (pos[st.id].y - by) * mmK, width: NODE_W * mmK, height: NODE_H * mmK }} />
        ))}
        {vp && <div className="sf-mm-vp" style={{ left: vp.x, top: vp.y, width: vp.w, height: vp.h }} />}
      </div>
    </div>
  );
}
