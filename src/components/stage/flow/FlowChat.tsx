"use client";

// FlowChat — 横版 AI 对话核心（底部全局 dock 与节点跟随框共用）
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { FlowStageId, FlowStatus } from "@/lib/stage/flowStages";
import { FlowIcon } from "./FlowIcon";

type Msg = { who: "ai" | "me"; text?: string; typing?: boolean; anim?: boolean };

// 打字机逐字回写 + 闪烁光标（复刻原型 chat.jsx TypeText，给 AI 回复「活的」观感）
function TypeText({ text, onTick }: { text: string; onTick?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const step = Math.max(1, Math.round(text.length / 50));
    const id = setInterval(() => {
      i += step;
      if (i >= text.length) { i = text.length; clearInterval(id); }
      setN(i);
      onTick?.();
    }, 24);
    return () => clearInterval(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{text.slice(0, n)}{n < text.length && <span style={{ opacity: 0.5 }}>▍</span>}</>;
}
export type ChatScope = { id: string; title: string; grad?: string };

const CFG: Record<string, { hi: string; sug: string[] }> = {
  global: { hi: "我是镜流 AI 副驾 ✦ 描述你的故事，我来帮你从剧本、分镜、角色一路搭到成片。", sug: ["帮我写一个都市悬疑短剧", "把整部剧一键生成分镜"] },
  idea: { hi: "用一句话告诉我灵感，我来扩展成完整的题材设定与世界观。", sug: ["换成古风仙侠题材", "女主加入重生设定"] },
  outline: { hi: "想调整叙事节奏、加强反转，还是细化某一幕？", sug: ["在第三幕加一次反转", "按集拆成分集梗概"] },
  episodes: { hi: "我可以续写后续分集，或调整单集钩子。", sug: ["续写后续分集", "每集结尾加强钩子"] },
  character: { hi: "需要细化人设、生成立绘，还是补充人物关系？", sug: ["生成主角 3 版立绘", "生成人物关系图"] },
  scene: { hi: "我可以新增场景、统一色调，或为某场景换氛围。", sug: ["新增一个赛博花房", "所有场景统一冷蓝调"] },
  frames: { hi: "我可以调整运镜、补空镜，或为整集切换渲染风格。", sug: ["补一个城市环境空镜", "整集换成漫画分格"] },
  audio: { hi: "要我用 AI 语音配音并自动匹配 BGM 吗？", sug: ["一键生成全部配音", "推荐悬疑感 BGM"] },
  edit: { hi: "我可按分镜自动套转场、卡点剪辑，合成竖屏成片。", sug: ["自动卡点剪辑", "加字幕与片头"] },
  export: { hi: "选择规格后，我来导出并一键分发到各平台。", sug: ["导出 1080p 竖屏", "一键分发到 3 个平台"] },
};

// 问候语随节点真实状态定制 —— 让对话框「读懂」它服务的节点
function greet(scope: ChatScope, status: FlowStatus | null, isNode: boolean): string {
  if (!isNode) return CFG.global.hi;
  const base = CFG[scope.id]?.hi ?? "我能帮你做什么？";
  if (status === "empty") return `「${scope.title}」还是空的 ✦ ${base}`;
  if (status === "generating") return `「${scope.title}」正在生成中 ✦ 完成后我们继续打磨。`;
  return base;
}

// 各上下文独立的持久对话线程（切走再回来对话还在，参考工坊 useThread）
const threadStore = new Map<string, Msg[]>();

export default function FlowChat({
  scope, status, anchored, barFirst, embedded, suggestions, onSend, onGenerate, onOpenFull, onClose, expanded, setExpanded, threadKeyPrefix,
}: {
  scope: ChatScope;
  status: FlowStatus | null;
  anchored?: boolean;
  barFirst?: boolean;
  embedded?: boolean;
  suggestions?: string[];
  onSend?: (text: string) => Promise<string>;
  threadKeyPrefix?: string;
  onGenerate?: (id: FlowStageId) => void;
  onOpenFull?: () => void;
  onClose?: () => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const isNode = scope.id !== "global";
  const cfg = CFG[scope.id] ?? CFG.global;
  const hi = greet(scope, status, isNode);
  const threadKey = `${threadKeyPrefix ?? ""}${scope.id}`;
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "ai", text: hi }]);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!threadStore.has(threadKey)) threadStore.set(threadKey, [{ who: "ai", text: hi }]);
    setMsgs(threadStore.get(threadKey)!);
    setVal(""); setBusy(false);
  }, [threadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, expanded]);
  // 跟随框弹出即聚焦输入框（点节点立刻能打字）
  useEffect(() => { if (anchored) requestAnimationFrame(() => taRef.current?.focus()); }, [scope.id, anchored]);

  // 点建议 → 填入输入框可编辑（而非直接发送），更友好
  const fillInput = (text: string) => {
    setVal(text);
    requestAnimationFrame(() => {
      const ta = taRef.current; if (!ta) return;
      ta.focus(); ta.setSelectionRange(text.length, text.length);
      ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 78) + "px";
    });
  };

  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setVal(""); setExpanded(true); setBusy(true);
    const base: Msg[] = [...(threadStore.get(threadKey) ?? []), { who: "me", text: t }, { who: "ai", typing: true }];
    threadStore.set(threadKey, base); setMsgs(base);
    let reply: string;
    if (onSend) {
      try { reply = await onSend(t); }
      catch (e) { reply = "出错了 ✦ " + (e instanceof Error ? e.message : String(e)); }
    } else {
      await new Promise((r) => setTimeout(r, 760 + Math.random() * 400));
      reply = isNode ? `收到 ✦ 我来处理「${scope.title}」相关的修改。` : "好的 ✦ 我已把这个想法拆进画布。";
    }
    const next: Msg[] = [...base.slice(0, -1), { who: "ai", text: reply, anim: true }];
    threadStore.set(threadKey, next); setMsgs(next);
    setBusy(false);
  };
  const grow = (e: ChangeEvent<HTMLTextAreaElement>) => { const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 78) + "px"; };
  // 文本类（创意/大纲/分集）靠对话框写剧本，不显示「生成」按钮，避免空操作误导
  const showGen = !embedded && isNode && status === "empty" && !["idea", "outline", "episodes"].includes(scope.id);

  const panel = (msgs.length > 1 || expanded || embedded) ? (
    <div className="sf-hchat-panel" key="panel">
      <div className="sf-hchat-phead">
        <div className="sf-hchat-av" style={{ width: 24, height: 24, borderRadius: 8 }}><FlowIcon n="sparkles" s={12} sw={2} /></div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>AI 副驾 {isNode && <span style={{ color: "var(--t3)" }}>· {scope.title}</span>}</div>
        {!embedded && <button className="sf-hchat-act" style={{ width: 26, height: 26 }} onClick={() => setExpanded(false)} title="收起"><FlowIcon n="chevd" s={15} /></button>}
      </div>
      <div className="sf-hchat-plog" ref={logRef}>
        {msgs.map((m, i) => (
          <div className={`sf-msg ${m.who}`} key={i}>
            <div className={`sf-msg-av ${m.who}`}>{m.who === "ai" ? <FlowIcon n="sparkles" s={13} sw={2} /> : "我"}</div>
            <div className="sf-msg-bubble">{m.typing ? <div className="sf-typing"><i /><i /><i /></div> : m.anim ? <TypeText text={m.text ?? ""} onTick={() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }} /> : m.text}</div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const bar = (
    <div className="sf-hchat-bar" key="bar">
      {isNode ? (
        <div className="sf-hchat-ctx">
          <span className="ctx-ico" style={{ background: scope.grad }}><FlowIcon n={scope.id} s={11} sw={2} /></span>
          <span style={{ whiteSpace: "nowrap" }}>{scope.title}</span>
          {onClose && <button className="sf-hchat-ctx-x" onClick={onClose}><FlowIcon n="close" s={11} sw={2.4} /></button>}
        </div>
      ) : (
        <div className="sf-hchat-av"><FlowIcon n="sparkles" s={15} sw={2} /></div>
      )}

      <textarea ref={taRef} className="sf-hchat-input" rows={1} value={val}
        placeholder={isNode ? `与 AI 共创「${scope.title}」…` : "与 AI 副驾对话，驱动整部短剧创作…"}
        onChange={(e) => { setVal(e.target.value); grow(e); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); send(val); }
          else if (e.key === "Escape" && anchored) { e.preventDefault(); e.currentTarget.blur(); onClose?.(); }
        }} />

      {!val && (
        <div className="sf-hchat-chips">
          {(suggestions ?? cfg.sug).slice(0, embedded ? 4 : anchored ? 1 : 2).map((s, i) => (
            <button className="sf-hchat-chip" key={i} onClick={() => fillInput(s)} title="填入输入框，可编辑后发送"><FlowIcon n="wand" s={11} sw={1.8} />{s}</button>
          ))}
        </div>
      )}

      {showGen && (
        <button className="sf-hchat-gen" onClick={() => onGenerate?.(scope.id as FlowStageId)}><FlowIcon n="bolt" s={13} sw={2} />生成</button>
      )}
      {isNode && onOpenFull && (
        <button className="sf-hchat-act" onClick={onOpenFull} title="详细编辑面板"><FlowIcon n="layers" s={16} /></button>
      )}
      <button className="sf-hchat-act" onClick={() => setExpanded(!expanded)} title={expanded ? "收起" : "展开对话"}><FlowIcon n={expanded ? "chevd" : "chevr"} s={16} /></button>
      <button className="sf-send-btn" disabled={!val.trim() || busy} onClick={() => send(val)}><FlowIcon n="send" s={16} sw={2} /></button>
    </div>
  );

  const order = barFirst ?? false;
  return <div className={`sf-hchat${embedded ? " sf-hchat--embedded" : ""}`}>{embedded ? [panel, bar] : order ? [bar, panel] : [panel, bar]}</div>;
}
