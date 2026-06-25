"use client";

// FlowComposer — 大卡的「全能创作对话框」（对话框里有乾坤）
// 参考工坊 OmniComposer + StageAIComposer：友好大输入 + 阶段配置 + 分类提示词 chips + 流式对话 + 生成。
// 取代大卡里单薄的 FlowChat embedded。底部全局 dock 仍用 FlowChat。
import { useState, useRef, useEffect, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useStudioStore, type Series, type Job } from "@/lib/store";
import type { FlowStage, FlowStageId, FlowStatus } from "@/lib/stage/flowStages";
import { FlowIcon } from "./FlowIcon";

type Msg = { who: "ai" | "me"; text?: string; typing?: boolean; anim?: boolean };
const threadStore = new Map<string, Msg[]>();
const TEXT_UPLOAD_ACCEPT = ".txt,.md,.markdown,.json,.csv,.srt,text/*";

/** 打字机逐字回写（与 FlowChat 同款手感） */
function TypeText({ text, onTick }: { text: string; onTick?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1; setN(i); onTick?.();
      if (i >= text.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{text.slice(0, n)}{n < text.length && <span className="sf-cm-caret" />}</>;
}

/** 每阶段的分类提示词 chips（带 emoji 图标）——点一下填进输入框，可改了再发 */
const STAGE_CHIPS: Record<FlowStageId, { ic: string; label: string; text: string }[]> = {
  idea: [
    { ic: "🔍", label: "悬疑", text: "悬疑反转，层层揭开真相" },
    { ic: "💕", label: "浪漫", text: "双向奔赴的浪漫爱情" },
    { ic: "🚀", label: "科幻", text: "近未来科幻设定" },
    { ic: "🏯", label: "古风", text: "古装权谋，家国情仇" },
    { ic: "🏙", label: "都市", text: "都市职场，逆袭翻盘" },
    { ic: "🔥", label: "热血", text: "热血逆袭，爽感拉满" },
    { ic: "😂", label: "喜剧", text: "轻松搞笑的喜剧风格" },
    { ic: "🌙", label: "治愈", text: "温暖治愈的日常情感" },
  ],
  outline: [
    { ic: "🎭", label: "三幕", text: "用经典三幕结构铺排" },
    { ic: "↩", label: "反转", text: "在高潮前埋一次大反转" },
    { ic: "🪝", label: "钩子", text: "每段结尾留强钩子" },
    { ic: "🌿", label: "支线", text: "加一条情感支线" },
  ],
  episodes: [
    { ic: "➕", label: "续写", text: "继续续写下一集分镜" },
    { ic: "🪝", label: "强钩子", text: "每集结尾加强悬念钩子" },
    { ic: "⚡", label: "快节奏", text: "压缩冗余，加快节奏" },
  ],
  character: [
    { ic: "🎨", label: "写实", text: "写实电影质感的人物" },
    { ic: "🌸", label: "动漫", text: "日系动漫风格立绘" },
    { ic: "🏯", label: "古风", text: "古风国潮造型" },
    { ic: "💢", label: "性格", text: "补充鲜明的性格标签" },
    { ic: "🔗", label: "关系", text: "梳理人物关系网" },
  ],
  scene: [
    { ic: "☀", label: "白天", text: "明亮的白天外景" },
    { ic: "🌃", label: "夜晚", text: "霓虹夜色都市" },
    { ic: "🌧", label: "雨天", text: "阴郁的雨夜氛围" },
    { ic: "🤖", label: "赛博", text: "赛博朋克废土" },
    { ic: "🏚", label: "废墟", text: "末世废墟场景" },
  ],
  frames: [
    { ic: "⤴", label: "推近", text: "镜头缓慢推近主角面部" },
    { ic: "⤵", label: "拉远", text: "镜头拉远展现全景" },
    { ic: "◎", label: "特写", text: "特写表情变化" },
    { ic: "🔄", label: "环绕", text: "镜头环绕主体" },
    { ic: "📐", label: "俯拍", text: "高空俯拍视角" },
    { ic: "📳", label: "手持", text: "手持镜头微晃跟拍" },
  ],
  audio: [
    { ic: "🕊", label: "温柔", text: "温柔细腻的女声配音" },
    { ic: "🎙", label: "磁性", text: "低沉磁性的男声旁白" },
    { ic: "⚡", label: "活力", text: "活力轻快的配音" },
    { ic: "🎵", label: "悬疑BGM", text: "推荐悬疑紧张的 BGM" },
  ],
  edit: [
    { ic: "🎚", label: "卡点", text: "按音乐节拍自动卡点" },
    { ic: "🎬", label: "转场", text: "加入流畅的转场" },
    { ic: "💬", label: "字幕", text: "生成台词字幕" },
  ],
  export: [
    { ic: "📱", label: "竖屏", text: "导出 1080p 竖屏 9:16" },
    { ic: "📡", label: "分发", text: "一键分发到各平台" },
  ],
};

/** 灵感卡图标的渐变色板（鎏金同源暖色：金→朱砂→青瓷，无紫蓝），让 chips 有图片设计感 */
const CHIP_GRADS = [
  "linear-gradient(135deg,oklch(0.80 0.13 75),oklch(0.66 0.16 52))",
  "linear-gradient(135deg,oklch(0.74 0.15 55),oklch(0.62 0.17 38))",
  "linear-gradient(135deg,oklch(0.70 0.17 40),oklch(0.60 0.18 26))",
  "linear-gradient(135deg,oklch(0.68 0.17 22),oklch(0.58 0.18 10))",
  "linear-gradient(135deg,oklch(0.76 0.12 150),oklch(0.68 0.13 172))",
  "linear-gradient(135deg,oklch(0.74 0.13 95),oklch(0.64 0.15 68))",
  "linear-gradient(135deg,oklch(0.78 0.11 162),oklch(0.68 0.12 185))",
  "linear-gradient(135deg,oklch(0.72 0.14 48),oklch(0.62 0.16 32))",
];

function greet(stage: FlowStage, status: FlowStatus): string {
  if (status === "empty") return `「${stage.title}」还是空的 ✦ 在下面描述你想要的，或选个方向开始。`;
  if (status === "generating") return `「${stage.title}」正在生成中 ✦ 完成后我们继续打磨。`;
  return `「${stage.title}」已就绪 ✦ 想怎么调整？随时告诉我。`;
}

export default function FlowComposer({
  stage, status, series, threadKeyPrefix, onSend, onGenerate,
}: {
  stage: FlowStage;
  status: FlowStatus;
  series: Series;
  jobById?: Map<string, Job>;
  threadKeyPrefix?: string;
  onSend?: (text: string) => Promise<string>;
  onGenerate?: (id: FlowStageId) => void;
}) {
  const setSeries = useStudioStore((s) => s.setSeries);

  const threadKey = `${threadKeyPrefix ?? ""}${stage.id}`;
  const hi = greet(stage, status);
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "ai", text: hi }]);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!threadStore.has(threadKey)) threadStore.set(threadKey, [{ who: "ai", text: hi }]);
    setMsgs(threadStore.get(threadKey)!);
    setVal(""); setBusy(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [threadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  // 点配置 chip 以外的空白 → 收起所有展开的配置浮层（仿工坊：点进去配、点出来看）
  useEffect(() => {
    function onDown(e: globalThis.PointerEvent) {
      const root = rootRef.current; const t = e.target as HTMLElement | null;
      if (!root || !t || t.closest("details.sf-cm-pop")) return;
      root.querySelectorAll<HTMLDetailsElement>("details.sf-cm-pop[open]").forEach((d) => d.removeAttribute("open"));
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const chips = STAGE_CHIPS[stage.id] ?? [];
  const isText = ["idea", "outline", "episodes"].includes(stage.id);
  const hasGen = true;

  function fillInput(text: string) {
    setVal((v) => (v.trim() ? `${v.trim()}，${text}` : text));
    requestAnimationFrame(() => {
      const ta = taRef.current; if (!ta) return;
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    });
  }
  function insertUploadedText(text: string) {
    const cleaned = text.replace(/^\uFEFF/, "").trim();
    if (!cleaned) return;
    setVal((v) => (v.trim() ? `${v.trim()}\n\n${cleaned}` : cleaned));
    requestAnimationFrame(() => {
      const ta = taRef.current; if (!ta) return;
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
    });
  }
  async function onTextUpload(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      insertUploadedText(await file.text());
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "文本读取失败");
    } finally {
      input.value = "";
    }
  }
  const grow = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 220) + "px";
  };
  // 选完某个配置项 → 执行并收起浮层
  function pick(fn: () => void) {
    fn();
    rootRef.current?.querySelectorAll<HTMLDetailsElement>("details.sf-cm-pop[open]").forEach((d) => d.removeAttribute("open"));
  }
  // 展开某个 chip 时互斥收起其它
  function onSummary(e: ReactMouseEvent<HTMLElement>) {
    const me = e.currentTarget.parentElement;
    rootRef.current?.querySelectorAll<HTMLDetailsElement>("details.sf-cm-pop[open]").forEach((d) => { if (d !== me) d.removeAttribute("open"); });
  }

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return;
    setVal(""); setBusy(true);
    if (taRef.current) taRef.current.style.height = "auto";
    const base: Msg[] = [...(threadStore.get(threadKey) ?? []), { who: "me", text: t }, { who: "ai", typing: true }];
    threadStore.set(threadKey, base); setMsgs(base);
    let reply: string;
    if (onSend) {
      try { reply = await onSend(t); }
      catch (e) { reply = "出错了 ✦ " + (e instanceof Error ? e.message : String(e)); }
    } else {
      await new Promise((r) => setTimeout(r, 700));
      reply = `收到 ✦ 我来处理「${stage.title}」。`;
    }
    const next: Msg[] = [...base.slice(0, -1), { who: "ai", text: reply, anim: true }];
    threadStore.set(threadKey, next); setMsgs(next);
    setBusy(false);
  }

  return (
    <div className="sf-cm" ref={rootRef}>
      {/* 对话区（流式回复，紧凑） */}
      <div className="sf-cm-log" ref={logRef}>
        {msgs.map((m, i) => (
          <div className={`sf-cm-msg ${m.who}`} key={i}>
            <div className={`sf-cm-av ${m.who}`}>{m.who === "ai" ? <FlowIcon n="sparkles" s={12} sw={2} /> : "我"}</div>
            <div className="sf-cm-bubble">
              {m.typing ? <span className="sf-cm-typing"><i /><i /><i /></span>
                : m.anim ? <TypeText text={m.text ?? ""} onTick={() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }} />
                  : m.text}
            </div>
          </div>
        ))}
      </div>

      {/* 一个大框：中央大输入（主体）+ 底栏小配置 chip（点 summary 弹浮层）+ 生成/发送 */}
      <div className="sf-cm-box">
        <textarea ref={taRef} className="sf-cm-input" value={val}
          placeholder={`与 AI 共创「${stage.title}」… 描述你想要的画面与情节`}
          onChange={(e) => { setVal(e.target.value); grow(e); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); send(val); }
          }} />

        <div className="sf-cm-bar">
          {isText && (
            <details className="sf-cm-pop">
              <summary onClick={onSummary}><span className="sf-cm-pk">类型</span><span className="sf-cm-pv">{series.kind === "comic" ? "漫剧" : "短剧"}</span><span className="sf-cm-cv">▾</span></summary>
              <div className="sf-cm-panel">
                <button className={`sf-cm-opt${series.kind !== "comic" ? " on" : ""}`} onClick={() => pick(() => setSeries({ kind: "short" }))}>短剧</button>
                <button className={`sf-cm-opt${series.kind === "comic" ? " on" : ""}`} onClick={() => pick(() => setSeries({ kind: "comic" }))}>漫剧</button>
              </div>
            </details>
          )}
          {(isText || stage.id === "frames") && (
            <details className="sf-cm-pop">
              <summary onClick={onSummary}><span className="sf-cm-pk">画幅</span><span className="sf-cm-pv">{series.aspect}</span><span className="sf-cm-cv">▾</span></summary>
              <div className="sf-cm-panel sf-cm-panel--row">
                {(["9:16", "16:9", "1:1"] as const).map((a) => (
                  <button key={a} className={`sf-cm-opt${series.aspect === a ? " on" : ""}`} onClick={() => pick(() => setSeries({ aspect: a }))}>{a}</button>
                ))}
              </div>
            </details>
          )}
          {chips.length > 0 && (
            <details className="sf-cm-pop">
              <summary onClick={onSummary}><FlowIcon n="wand" s={12} sw={1.8} /><span className="sf-cm-pv">灵感</span><span className="sf-cm-cv">▾</span></summary>
              <div className="sf-cm-panel sf-cm-panel--grid">
                {chips.map((c, i) => (
                  <button key={c.label} className="sf-cm-chip" onClick={() => pick(() => fillInput(c.text))} title={c.text}>
                    <span className="sf-cm-chip-ic" style={{ background: CHIP_GRADS[i % CHIP_GRADS.length] }}>{c.ic}</span>{c.label}
                  </button>
                ))}
              </div>
            </details>
          )}
          <label className="sf-cm-upload" title="上传文本">
            <input type="file" accept={TEXT_UPLOAD_ACCEPT} onChange={(e) => { void onTextUpload(e); }} />
            <FlowIcon n="export" s={12} sw={2} />
            <span>上传</span>
          </label>
          <span className="sf-cm-spacer" />
          {hasGen && (
            <button className="sf-cm-gen" disabled={status === "generating"} onClick={() => onGenerate?.(stage.id)} title="直接生成">
              <FlowIcon n="bolt" s={13} sw={2} />{status === "generating" ? "生成中…" : status === "ready" ? "重新生成" : "AI 生成"}
            </button>
          )}
          <button className="sf-cm-send" disabled={!val.trim() || busy} onClick={() => send(val)} title="发送（⌘/Ctrl+Enter）">
            {busy ? <span className="sf-cm-spin" /> : <FlowIcon n="send" s={16} sw={2} />}
          </button>
        </div>
      </div>
    </div>
  );
}
