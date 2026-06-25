"use client";

// DramaCanvas —「导演监视器」版 AI 短剧工作台
// 布局:chrome / 流水线轨 / [角色谱 | 监视器 | 控制台] / 胶片条
// 内核:store 派生视图(dramaView) + stageGen 三步生成 + GenConfigPanel 模型配置
// 联动:hover 角色⇄胶片聚光;选帧⇄监视器/控制台/角色谱;阶段⇄控制台 tab+pip 呼吸;空格连播

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import LocaleSwitcher from "../LocaleSwitcher";
import { useStudioStore, type Job, type StageShot, type StageScene, type StageEpisode, type GenStep, type GenSlot, type CastShotType } from "@/lib/store";
import { modelsByMode } from "@/lib/bailian/models";
import { aiWriteBeats } from "@/lib/stage/aiWriter";
import {
  seriesToView,
  buildDemoSeries,
  SHOT_TYPE_LABEL,
  type Character,
  type SceneLoc,
  type Shot,
  type ShotStatus,
} from "./dramaView";
import { genShotImage, genShotVoice, genShotVideo, genElementImage, buildElementPrompt, shotImageUrl } from "@/lib/stage/stageGen";
import { uploadMediaFile } from "../studio/uploadMedia";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";
import { useJobPolling } from "@/lib/bailian/useJobPolling";
import { useLocalJobRehydration } from "@/lib/bailian/useLocalJobRehydration";
import GenConfigPanel from "./GenConfigPanel";
import "@/styles/frame.css";
import "@/styles/drama.css";

type StageId = "script" | "character" | "storyboard" | "voice" | "synthesis" | "export";

const STATUS_LABEL: Record<ShotStatus, string> = {
  empty: "待创作", scripted: "已编剧", storyboarded: "已分镜",
  voiced: "已配音", generated: "已生成", done: "完成",
};
const STATUS_TO_CLASS: Record<ShotStatus, string> = {
  empty: "empty", scripted: "scripted", storyboarded: "storyboarded",
  voiced: "voiced", generated: "generated", done: "generated",
};

const STAGE_TO_STEP: Partial<Record<StageId, GenStep>> = {
  storyboard: "image",
  voice: "voice",
  synthesis: "video",
};

const pad3 = (n: number) => String(n).padStart(3, "0");
const fmtDur = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/* ── 流水线轨:六阶段 = 活的生产管线(进度 + ⚡批量) ─────────── */

// 导出不是阶段而是动作(顶栏「导出全集」),流水线纯五站
const PIPE_STAGES: { id: StageId; label: string; icon: string; step?: GenStep }[] = [
  { id: "script",     label: "剧本", icon: "✍" },
  { id: "character",  label: "角色", icon: "◎" },
  { id: "storyboard", label: "分镜", icon: "⊞", step: "image" },
  { id: "voice",      label: "配音", icon: "◉", step: "voice" },
  { id: "synthesis",  label: "合成", icon: "▷", step: "video" },
];

function PipelineRail({
  active, shots, charsCount, epCount, batchRunning, onSelect, onBatchStage,
}: {
  active: StageId;
  shots: Shot[];
  charsCount: number;
  epCount: number;
  batchRunning: boolean;
  onSelect: (id: StageId) => void;
  onBatchStage: (step: GenStep) => void;
}) {
  const total = shots.length;
  const img = shots.filter((s) => s.imageUrl).length;
  const vid = shots.filter((s) => s.videoUrl).length;
  const voc = shots.filter((s) => s.voiceUrl).length;
  const meta: Partial<Record<StageId, { count: string; pct: number }>> = {
    script:     { count: `${epCount}集 ${total}镜`, pct: total ? 100 : 0 },
    character:  { count: `${charsCount} 角色`, pct: charsCount ? 100 : 0 },
    storyboard: { count: `${img}/${total}`, pct: total ? (img / total) * 100 : 0 },
    voice:      { count: `${voc}/${total}`, pct: total ? (voc / total) * 100 : 0 },
    synthesis:  { count: `${vid}/${total}`, pct: total ? (vid / total) * 100 : 0 },
  };
  return (
    <div className="drama-pipe">
      {PIPE_STAGES.map((s, i) => (
        <div key={s.id} className="drama-pipe-seg">
          {i > 0 && <span className="drama-pipe-link" aria-hidden />}
          <button className={`drama-pipe-node${active === s.id ? " active" : ""}`} onClick={() => onSelect(s.id)}>
            <span className="drama-pipe-icon">{s.icon}</span>
            <span className="drama-pipe-label">{s.label}</span>
            <span className="drama-pipe-count">{meta[s.id]!.count}</span>
            <span className="drama-pipe-bar"><span style={{ width: `${meta[s.id]!.pct}%` }} /></span>
          </button>
          {s.step && (
            <button
              className="drama-pipe-zap"
              disabled={batchRunning}
              title={`批量${s.label} — 为所有缺这一步的镜头生成`}
              onClick={() => onBatchStage(s.step!)}
            >
              ⚡
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 角色谱 + 场景库(联动源头 · 全 CRUD) ─────────────────── */

const NEW_CHAR_COLORS = [
  "oklch(0.68 0.16 28)", "oklch(0.73 0.14 62)", "oklch(0.65 0.13 155)",
  "oklch(0.72 0.13 95)", "oklch(0.56 0.07 200)", "oklch(0.60 0.04 55)",
];

type ElementEditing = { id: string | null; kind: "character" | "location"; name: string; desc: string };


function ScriptBoard({
  seriesName, synopsis, shots, charMap, sceneMap, writing, onSelectShot, onWrite,
}: {
  seriesName: string;
  synopsis: string;
  shots: Shot[];
  charMap: Record<string, Character>;
  sceneMap: Record<string, SceneLoc>;
  writing: boolean;
  onSelectShot: (id: string) => void;
  onWrite: () => void;
}) {
  return (
    <div className="drama-board">
      <div className="drama-board-scroll">
        <div className="drama-script-title">{seriesName}</div>
        <div className="drama-script-synopsis">{synopsis || "—— 在右侧写下一句话梗概 ——"}</div>
        {shots.length === 0 ? (
          <div className="drama-board-empty">
            <span className="drama-screen-empty-icon">✍</span>
            <p>还没有分镜。右侧写好梗概与风格,一键让 AI 编剧。</p>
            <button className="drama-gen-btn" style={{ width: "auto", padding: "8px 22px" }} disabled={writing} onClick={onWrite}>
              {writing ? <><span className="drama-spin">⟳</span><span>AI 编剧中…</span></> : <><span>✦</span><span>AI 生成分镜剧本</span></>}
            </button>
          </div>
        ) : (
          <div className="drama-script-list">
            {shots.map((shot) => {
              const speaker = shot.charIds[0] ? charMap[shot.charIds[0]] : undefined;
              return (
                <button key={shot.id} className="drama-script-row" onClick={() => onSelectShot(shot.id)} title="点击进入该镜">
                  <span className="drama-script-row-bar" style={{ background: speaker?.color ?? "var(--line)" }} />
                  <span className="drama-script-row-idx">{String(shot.index).padStart(2, "0")}</span>
                  <span className="drama-script-row-main">
                    <span className="drama-script-row-line">
                      {speaker && <b>{speaker.name}:</b>}
                      {shot.dialogue || <i>(空镜)</i>}
                    </span>
                    <span className="drama-script-row-action">{shot.action}</span>
                  </span>
                  <span className="drama-script-row-meta">
                    {sceneMap[shot.sceneId]?.name ?? "—"} · {shot.camera} · {shot.durationSec}s
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 阵容墙(角色阶段的中央视图):立绘大卡 + 场景带,操作就在脸上 ── */

function CastBoard({
  chars, scenes, genElementId, hoveredCharId, selectedCharIds,
  onGenElement, onUploadElement, onHoverChar,
}: {
  chars: Character[];
  scenes: SceneLoc[];
  genElementId: string | null;
  hoveredCharId: string | null;
  selectedCharIds: Set<string>;
  onGenElement: (id: string, promptOverride?: string) => void;
  onUploadElement: (id: string, file: File) => void;
  onHoverChar: (id: string | null) => void;
}) {
  const series = useStudioStore((s) => s.series);
  const seriesAddElement = useStudioStore((s) => s.seriesAddElement);
  const seriesUpdateElement = useStudioStore((s) => s.seriesUpdateElement);
  const seriesRemoveElement = useStudioStore((s) => s.seriesRemoveElement);

  // 增/改内联表单 + 删除二击确认(原左栏 CRUD 全量并入)
  const [elemEdit, setElemEdit] = useState<ElementEditing | null>(null);
  const [confirmDelElem, setConfirmDelElem] = useState<string | null>(null);
  const saveElem = () => {
    if (!elemEdit || !elemEdit.name.trim()) return;
    if (elemEdit.id) {
      seriesUpdateElement(elemEdit.id, { name: elemEdit.name.trim(), description: elemEdit.desc.trim() || undefined });
    } else {
      seriesAddElement({
        kind: elemEdit.kind,
        name: elemEdit.name.trim(),
        description: elemEdit.desc.trim() || undefined,
        refImages: [],
        color: elemEdit.kind === "character" ? NEW_CHAR_COLORS[chars.length % NEW_CHAR_COLORS.length] : undefined,
      });
    }
    setElemEdit(null);
  };
  const startEditElem = (id: string, kind: ElementEditing["kind"], name: string) => {
    const el = series.bible.find((e) => e.id === id);
    setElemEdit({ id, kind, name, desc: el?.description ?? "" });
  };
  const removeElem = (id: string) => {
    if (confirmDelElem === id) {
      seriesRemoveElement(id);
      setConfirmDelElem(null);
    } else {
      setConfirmDelElem(id);
      setTimeout(() => setConfirmDelElem((x) => (x === id ? null : x)), 3000);
    }
  };
  const elemForm = elemEdit && (
    <div
      className="drama-castwall-form"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") saveElem();
        if (e.key === "Escape") setElemEdit(null);
      }}
    >
      <input
        autoFocus
        className="drama-field-input"
        placeholder={elemEdit.kind === "character" ? "角色名" : "场景名"}
        value={elemEdit.name}
        onChange={(e) => setElemEdit({ ...elemEdit, name: e.target.value })}
      />
      <textarea
        className="drama-field-textarea"
        rows={3}
        placeholder={elemEdit.kind === "character" ? "外貌/性格 —— 进编剧与立绘提示词" : "环境/氛围 —— 进编剧与场景图提示词"}
        value={elemEdit.desc}
        onChange={(e) => setElemEdit({ ...elemEdit, desc: e.target.value })}
      />
      <div style={{ display: "flex", gap: 5 }}>
        <button className="drama-gen-btn" style={{ flex: 1, width: "auto", padding: "5px 8px", fontSize: 12 }} disabled={!elemEdit.name.trim()} onClick={saveElem}>
          保存
        </button>
        <button className="drama-sec-btn" onClick={() => setElemEdit(null)}>取消</button>
      </div>
    </div>
  );

  // ✎ 提示词预览/编辑(预填与生成同源的完整拼装提示词,可改后生成,一次性不落库)
  const [promptEdit, setPromptEdit] = useState<{ id: string; prompt: string } | null>(null);
  const defaultPromptOf = (id: string) => {
    const el = series.bible.find((e) => e.id === id);
    return el ? buildElementPrompt(el, series) : "";
  };
  const togglePrompt = (id: string) =>
    setPromptEdit((p) => (p?.id === id ? null : { id, prompt: defaultPromptOf(id) }));

  const promptEditor = (id: string) =>
    promptEdit?.id === id && (
      <div className="drama-prompt-editor">
        <div className="drama-field-label" style={{ marginBottom: 4 }}>生成提示词(可编辑,仅本次生效)</div>
        <textarea
          className="drama-field-textarea"
          rows={4}
          value={promptEdit.prompt}
          onChange={(e) => setPromptEdit({ id, prompt: e.target.value })}
        />
        <div className="drama-prompt-editor-ops">
          <button
            className="drama-gen-btn"
            style={{ padding: "6px 10px", fontSize: 12 }}
            disabled={genElementId === id || !promptEdit.prompt.trim()}
            onClick={() => {
              onGenElement(id, promptEdit.prompt);
              setPromptEdit(null);
            }}
          >
            ✦ 用此提示词生成
          </button>
          <button className="drama-sec-btn" title="恢复默认拼装" onClick={() => setPromptEdit({ id, prompt: defaultPromptOf(id) })}>↺</button>
          <button className="drama-sec-btn" onClick={() => setPromptEdit(null)}>✕</button>
        </div>
      </div>
    );

  return (
    <div className="drama-board">
      <div className="drama-board-scroll">
        <div className="drama-board-label">阵容 · 立绘锁脸,跨镜一致</div>
        <div className="drama-castwall">
          {chars.map((c) => (
            <div
              key={c.id}
              className={`drama-castwall-card${hoveredCharId === c.id ? " hover" : ""}${selectedCharIds.has(c.id) ? " sel" : ""}`}
              onMouseEnter={() => onHoverChar(c.id)}
              onMouseLeave={() => onHoverChar(null)}
            >
              <div className="drama-castwall-float">
                <button className="drama-float-btn" title="编辑名字与描述" onClick={() => startEditElem(c.id, "character", c.name)}>✏</button>
                <button
                  className={`drama-float-btn${confirmDelElem === c.id ? " danger" : ""}`}
                  title={confirmDelElem === c.id ? "再点一次确认删除" : "删除角色"}
                  onClick={() => removeElem(c.id)}
                >
                  {confirmDelElem === c.id ? "确认?" : "✕"}
                </button>
              </div>
              <div className="drama-castwall-portrait" style={{ background: c.color }}>
                {c.portrait ? <img src={c.portrait} alt={c.name} /> : <span>{c.initial}</span>}
                {genElementId === c.id && <span className="drama-castwall-loading"><span className="drama-spin">⟳</span></span>}
              </div>
              {elemEdit?.id === c.id ? (
                elemForm
              ) : (
                <>
              <div className="drama-castwall-name">{c.name}</div>
              <div className="drama-castwall-role">{c.role || " "}</div>
              <div className="drama-castwall-ops">
                <button className="drama-sec-btn" disabled={genElementId === c.id} onClick={() => onGenElement(c.id)}>
                  ✦ {c.portrait ? "重生成" : "生成立绘"}
                </button>
                <button
                  className={`drama-sec-btn${promptEdit?.id === c.id ? " on" : ""}`}
                  title="查看/编辑生成提示词"
                  onClick={() => togglePrompt(c.id)}
                  style={{ flex: "0 0 30px" }}
                >
                  ✎
                </button>
                <label className="drama-sec-btn" title="上传定妆照" style={{ flex: "0 0 30px" }}>
                  ⬆
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadElement(c.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {promptEditor(c.id)}
                </>
              )}
            </div>
          ))}
          {/* 添加角色:虚线卡 ↔ 内联表单 */}
          {elemEdit && elemEdit.id === null && elemEdit.kind === "character" ? (
            <div className="drama-castwall-card adding">{elemForm}</div>
          ) : (
            <button className="drama-castwall-add" onClick={() => setElemEdit({ id: null, kind: "character", name: "", desc: "" })}>
              <span style={{ fontSize: 22 }}>+</span>
              <span>添加角色</span>
            </button>
          )}
        </div>
        <div className="drama-board-label" style={{ marginTop: 22 }}>场景 · 场景图锁背景</div>
        <div className="drama-scenewall">
          {scenes.map((sc) => (
            <div key={sc.id} className="drama-scenewall-card">
              <div className="drama-castwall-float">
                <button className="drama-float-btn" title="编辑名字与描述" onClick={() => startEditElem(sc.id, "location", sc.name)}>✏</button>
                <button
                  className={`drama-float-btn${confirmDelElem === sc.id ? " danger" : ""}`}
                  title={confirmDelElem === sc.id ? "再点一次确认删除" : "删除场景"}
                  onClick={() => removeElem(sc.id)}
                >
                  {confirmDelElem === sc.id ? "确认?" : "✕"}
                </button>
              </div>
              <div className="drama-scenewall-thumb" style={{ background: sc.gradient }}>
                {sc.image && <img src={sc.image} alt={sc.name} />}
                {genElementId === sc.id && <span className="drama-castwall-loading"><span className="drama-spin">⟳</span></span>}
                <span className="drama-scenewall-type">{sc.type}</span>
              </div>
              {elemEdit?.id === sc.id ? (
                elemForm
              ) : (
                <>
              <div className="drama-scenewall-name">{sc.name}</div>
              <div style={{ display: "flex", gap: 5 }}>
                <button className="drama-sec-btn drama-scenewall-gen" disabled={genElementId === sc.id} onClick={() => onGenElement(sc.id)}>
                  ✦ {sc.image ? "重生成" : "生成场景图"}
                </button>
                <button
                  className={`drama-sec-btn${promptEdit?.id === sc.id ? " on" : ""}`}
                  title="查看/编辑生成提示词"
                  style={{ flex: "0 0 30px" }}
                  onClick={() => togglePrompt(sc.id)}
                >
                  ✎
                </button>
              </div>
              {promptEditor(sc.id)}
                </>
              )}
            </div>
          ))}
          {/* 添加场景:虚线卡 ↔ 内联表单 */}
          {elemEdit && elemEdit.id === null && elemEdit.kind === "location" ? (
            <div className="drama-scenewall-card adding">{elemForm}</div>
          ) : (
            <button className="drama-scenewall-add" onClick={() => setElemEdit({ id: null, kind: "location", name: "", desc: "" })}>
              + 添加场景
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 监视器:大银幕 + OSD + 字幕 + 连播 ────────────────────── */

function Monitor({
  shot, index, total, aspect, sceneMap, playing, onTogglePlay, onPrev, onNext,
}: {
  shot: Shot | null;
  index: number;
  total: number;
  aspect: string;
  sceneMap: Record<string, SceneLoc>;
  playing: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const scene = shot ? sceneMap[shot.sceneId] : undefined;
  const ratio = aspect === "9:16" ? "9 / 16" : aspect === "1:1" ? "1 / 1" : aspect === "4:3" ? "4 / 3" : "16 / 9";
  const portrait = aspect === "9:16";
  return (
    <div className="drama-monitor">
      <div className="drama-screen-wrap">
        <div
          className={`drama-screen ${portrait ? "portrait" : "landscape"}`}
          style={{ aspectRatio: ratio, background: scene?.gradient || "var(--ink-2)" }}
        >
          {shot?.videoUrl ? (
            <video key={shot.videoUrl} className="drama-screen-media" src={shot.videoUrl} autoPlay muted loop playsInline />
          ) : shot?.imageUrl ? (
            <img key={shot.imageUrl} className="drama-screen-media" src={shot.imageUrl} alt="" />
          ) : (
            <div className="drama-screen-empty">
              <span className="drama-screen-empty-icon">✦</span>
              <span className="drama-screen-empty-text">{shot ? shot.action || "这一镜还没有画面" : "选择镜头"}</span>
              {shot && <em>在右侧「AI 生成分镜图」点亮这一镜</em>}
            </div>
          )}
          {shot && (
            <div className="drama-screen-osd">
              <span className="drama-osd-id">SHOT-{pad3(shot.index)}</span>
              <span className={`drama-shot-badge ${STATUS_TO_CLASS[shot.status]}`}>{STATUS_LABEL[shot.status]}</span>
            </div>
          )}
          {shot?.dialogue && (shot.videoUrl || shot.imageUrl) && (
            <div className="drama-screen-sub">{shot.dialogue}</div>
          )}
        </div>
      </div>
      <div className="drama-monitor-bar">
        <div className="drama-mon-group">
          <button className="drama-mon-btn" onClick={onPrev} title="上一镜 ←">⟨</button>
          <button className={`drama-mon-btn play${playing ? " on" : ""}`} onClick={onTogglePlay} title="连播(空格)">
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="drama-mon-btn" onClick={onNext} title="下一镜 →">⟩</button>
        </div>
        <span className="drama-mon-meta">
          {total ? `${index + 1} / ${total}` : "0 / 0"}
          {shot ? ` · ${shot.camera} · ${scene?.name ?? "—"} · ${shot.durationSec}s` : ""}
        </span>
        <span className="drama-mon-hint">← → 切镜 · 空格连播</span>
      </div>
    </div>
  );
}

/* ── 剧本面板:风格预设 + LLM 配置 + AI 编剧 ─────────────────── */

const STYLE_PRESETS = [
  { label: "都市豪门", hint: "现代都市豪门恩怨,写实电影质感,冷暖对比强烈" },
  { label: "古风仙侠", hint: "古装仙侠,国风水墨意境,飘逸唯美" },
  { label: "悬疑惊悚", hint: "悬疑惊悚,低饱和冷调,阴影浓重,压迫感" },
  { label: "甜宠喜剧", hint: "甜宠轻喜剧,明亮暖调,清新糖系" },
  { label: "赛博科幻", hint: "近未来赛博都市,霓虹夜景,高对比科技感" },
];

const SCRIPT_LLMS = [
  { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
  { id: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
  { id: "qwen3.6-plus", name: "Qwen 3.6 Plus" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
];

function ScriptPanel({ onWrite, writing, onNewSeries }: {
  onWrite: () => void;
  writing: boolean;
  onNewSeries: () => void;
}) {
  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const seriesAddElement = useStudioStore((s) => s.seriesAddElement);
  const seriesUpdateElement = useStudioStore((s) => s.seriesUpdateElement);

  const styleEl = series.bible.find((e) => e.kind === "style");
  const cfg = series.genConfig?.script;
  const numBeats = Number(cfg?.params?.numBeats) || 8;
  const shotsN = series.episodes.reduce((n, ep) => n + ep.scenes.reduce((m, sc) => m + sc.shots.length, 0), 0);

  const setStyle = (text: string) => {
    if (styleEl) seriesUpdateElement(styleEl.id, { description: text });
    else seriesAddElement({ kind: "style", name: "全剧风格", refImages: [], description: text });
  };
  const patchCfg = (slot: GenSlot) =>
    setSeries({
      genConfig: {
        ...series.genConfig,
        script: { modelId: slot.modelId ?? cfg?.modelId, params: { ...cfg?.params, ...slot.params } },
      },
    });

  return (
    <div className="drama-console">
      <div className="drama-console-head">
        <span className="drama-console-title">SCRIPT · 剧本</span>
        <button className="drama-sec-btn" style={{ padding: "3px 10px", fontSize: 11 }} title="当前剧自动存入剧库,开一部新剧(顶栏剧名可切换)" onClick={onNewSeries}>
          + 新建剧本
        </button>
      </div>
      <div className="drama-console-body">
        <div>
          <div className="drama-field-label">剧名</div>
          <input
            key={`name-${series.name}`}
            name="series-name"
            className="drama-field-input"
            defaultValue={series.name}
            onBlur={(e) => setSeries({ name: e.target.value })}
          />
        </div>
        <div>
          <div className="drama-field-label">故事梗概(AI 编剧的依据)</div>
          <textarea
            key={`syn-${series.id}`}
            name="series-synopsis"
            className="drama-field-textarea"
            rows={4}
            defaultValue={series.synopsis ?? ""}
            placeholder="一句话讲清这部剧:谁、要什么、被什么拦住…"
            onBlur={(e) => setSeries({ synopsis: e.target.value })}
          />
        </div>
        <div>
          <div className="drama-field-label">全剧设置</div>
          <div className="drama-gen-config">
            <div className="drama-cfg-row">
              <span className="drama-cfg-label">画幅</span>
              <div className="drama-seg">
                {(["9:16", "16:9", "1:1"] as const).map((a) => (
                  <button
                    key={a}
                    className={`drama-seg-btn${series.aspect === a ? " on" : ""}`}
                    onClick={() => setSeries({ aspect: a })}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="drama-field-label">风格基调(贯穿编剧与出图)</div>
          <div className="drama-style-chips">
            {STYLE_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`drama-style-chip${styleEl?.description === p.hint ? " on" : ""}`}
                onClick={() => setStyle(p.hint)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            key={`style-${styleEl?.id ?? "none"}-${styleEl?.description ?? ""}`}
            name="series-style"
            className="drama-field-textarea"
            rows={2}
            defaultValue={styleEl?.description ?? ""}
            placeholder="或自定义:画面质感、色调、氛围…"
            onBlur={(e) => setStyle(e.target.value)}
          />
        </div>
        <div>
          <div className="drama-field-label">AI 编剧</div>
          <div className="drama-gen-config">
            <div className="drama-cfg-row">
              <span className="drama-cfg-label">模型</span>
              <select
                className="drama-cfg-select"
                value={cfg?.modelId ?? "qwen3.6-plus"}
                onChange={(e) => patchCfg({ modelId: e.target.value })}
              >
                {SCRIPT_LLMS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="drama-cfg-row">
              <span className="drama-cfg-label">拍数</span>
              <select
                className="drama-cfg-select"
                value={numBeats}
                onChange={(e) => patchCfg({ params: { numBeats: Number(e.target.value) } })}
              >
                {[6, 8, 10, 12, 16].map((n) => (
                  <option key={n} value={n}>{n} 镜</option>
                ))}
              </select>
            </div>
          </div>
          <button className="drama-gen-btn" disabled={writing} onClick={onWrite}>
            {writing ? (
              <><span className="drama-spin">⟳</span><span>AI 编剧中…</span></>
            ) : (
              <><span>✦</span><span>AI 生成分镜剧本</span></>
            )}
          </button>
          <p className="drama-console-hint dim" style={{ marginTop: 8 }}>
            按梗概 + 角色册 + 场景库 + 风格,生成整集 {numBeats} 镜分镜(台词/画面/运镜/时长)。
            {shotsN > 0 && " 替换当前镜头,生成后可一键撤销。"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── 角色面板:立绘模型配置 ──────────────────────────────────── */

function CharacterPanel() {
  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const models = modelsByMode("t2i");
  const cur = series.genConfig?.portrait?.modelId ?? "qwen-image-2.0-pro";
  return (
    <div className="drama-console">
      <div className="drama-console-head"><span className="drama-console-title">CAST · 角色</span></div>
      <div className="drama-console-body">
        <p className="drama-console-hint">
          立绘/场景图自动注入出场镜头作参考——长相与背景跨镜锁定。
        </p>
        <div>
          <div className="drama-field-label">立绘生成配置</div>
          <div className="drama-gen-config">
            <div className="drama-cfg-row">
              <span className="drama-cfg-label">模型</span>
              <select
                className="drama-cfg-select"
                value={cur}
                onChange={(e) =>
                  setSeries({ genConfig: { ...series.genConfig, portrait: { modelId: e.target.value } } })
                }
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="drama-console-hint dim" style={{ marginTop: 6 }}>
            画风跟随「剧本」页的风格基调;悬停角色卡,胶片条聚光 TA 的镜头。
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── 控制台:阶段感知(剧本面板 / 角色指引 / 镜头工作区) ──────── */

const GEN_TABS: { id: StageId; label: string }[] = [
  { id: "storyboard", label: "分镜图" },
  { id: "voice",      label: "配音" },
  { id: "synthesis",  label: "视频" },
];

function Console({
  shot, charMap, sceneMap, generating, activeStage,
  onGenerate, onGenerateAll, onEditShot,
  onWriteScript, writingScript, onNewSeries,
  allChars, onToggleChar, onRemoveShot,
}: {
  shot: Shot | null;
  charMap: Record<string, Character>;
  sceneMap: Record<string, SceneLoc>;
  generating: boolean;
  activeStage: StageId;
  onGenerate: (id: string, stage: StageId) => void;
  onGenerateAll: (shotId: string) => void;
  onEditShot: (shotId: string, patch: { dialogue?: string; action?: string; shotType?: CastShotType; durationSec?: number }) => void;
  onWriteScript: () => void;
  writingScript: boolean;
  onNewSeries: () => void;
  allChars: Character[];
  onToggleChar: (shotId: string, charId: string) => void;
  onRemoveShot: (shotId: string) => void;
}) {
  const [genTab, setGenTab] = useState<StageId>("storyboard");
  // 阶段轨 → 控制台 tab 联动
  useEffect(() => {
    if (activeStage === "storyboard" || activeStage === "voice" || activeStage === "synthesis") {
      setGenTab(activeStage);
    }
  }, [activeStage]);

  // key 区分三种面板:强制重建 DOM,避免 React 复用 .drama-console 残留上个面板的 scrollTop
  if (activeStage === "script") {
    return <ScriptPanel key="p-script" onWrite={onWriteScript} writing={writingScript} onNewSeries={onNewSeries} />;
  }

  if (activeStage === "character") {
    return <CharacterPanel key="p-cast" />;
  }

  if (!shot) {
    return (
      <div className="drama-console" key="p-empty">
        <div className="drama-console-empty">
          <div className="drama-console-empty-icon">⊞</div>
          <div>选择一个镜头开始创作</div>
        </div>
      </div>
    );
  }

  const scene = sceneMap[shot.sceneId];
  const chars = shot.charIds.map((id) => charMap[id]).filter(Boolean);

  return (
    <div className="drama-console" key="p-shot">
      <div className="drama-console-head">
        <span className="drama-console-title">SHOT-{pad3(shot.index)}</span>
        <span className={`drama-shot-badge ${STATUS_TO_CLASS[shot.status]}`}>{STATUS_LABEL[shot.status]}</span>
      </div>
      <div className="drama-console-body">
        <div className="drama-meta-chips">
          <div className="drama-meta-chip">
            <div className="drama-meta-chip-label">运镜</div>
            <select
              className="drama-chip-select"
              value={shot._shotType}
              onChange={(e) => onEditShot(shot.id, { shotType: e.target.value as CastShotType })}
            >
              {Object.entries(SHOT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="drama-meta-chip">
            <div className="drama-meta-chip-label">时长 s</div>
            <input
              key={`dur-${shot.id}-${shot.durationSec}`}
              className="drama-chip-input"
              type="number"
              min={1}
              max={20}
              step={0.5}
              defaultValue={shot.durationSec}
              onBlur={(e) => {
                const v = Math.max(1, Math.min(20, Number(e.target.value) || 4));
                if (v !== shot.durationSec) onEditShot(shot.id, { durationSec: v });
              }}
            />
          </div>
          <div className="drama-meta-chip">
            <div className="drama-meta-chip-label">场景</div>
            <div className="drama-meta-chip-value">{scene?.name ?? "-"}</div>
          </div>
        </div>

        <div>
          <div className="drama-field-label">台词</div>
          <textarea
            key={`dlg-${shot.id}`}
            name={`dialogue-${shot.id}`}
            className="drama-field-textarea"
            defaultValue={shot.dialogue}
            rows={2}
            onBlur={(e) => onEditShot(shot.id, { dialogue: e.target.value })}
          />
        </div>

        <div>
          <div className="drama-field-label">画面 · 动作</div>
          <textarea
            key={`act-${shot.id}`}
            name={`action-${shot.id}`}
            className="drama-field-textarea"
            defaultValue={shot.action}
            rows={3}
            onBlur={(e) => onEditShot(shot.id, { action: e.target.value })}
          />
        </div>

        <div>
          <div className="drama-field-label">出场角色(点击绑定/解绑,影响一致性参考)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {allChars.map((c) => {
              const inShot = shot.charIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  className={`drama-char-chip toggle${inShot ? " in" : ""}`}
                  style={inShot ? { borderLeft: `3px solid ${c.color}` } : undefined}
                  onClick={() => onToggleChar(shot.id, c.id)}
                  title={inShot ? "点击移出本镜" : "点击加入本镜"}
                >
                  <div className="drama-char-chip-dot" style={{ background: c.color, opacity: inShot ? 1 : 0.4 }}>
                    {c.initial}
                  </div>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="drama-field-label">AI 生成</div>
          <div className="drama-gen-tabs" style={{ marginBottom: 8 }}>
            {GEN_TABS.map((t) => (
              <button
                key={t.id}
                className={`drama-gen-tab ${genTab === t.id ? "active" : ""}`}
                onClick={() => setGenTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <GenConfigPanel step={STAGE_TO_STEP[genTab] ?? "image"} shotId={shot.id} />
          <button
            className="drama-gen-btn"
            disabled={generating}
            onClick={() => !generating && onGenerate(shot.id, genTab)}
          >
            {generating ? (
              <><span className="drama-spin">⟳</span><span>生成中…</span></>
            ) : (
              <><span>✦</span><span>AI 生成{genTab === "storyboard" ? "分镜图" : genTab === "voice" ? "配音" : "视频"}</span></>
            )}
          </button>
          <button
            className="drama-gen-btn drama-gen-all"
            disabled={generating}
            onClick={() => !generating && onGenerateAll(shot.id)}
            title="出图 → 视频 → 配音 一键完成"
          >
            <span>⚡</span>
            <span>一键三步</span>
          </button>
        </div>

        <button className="drama-danger-btn" onClick={() => onRemoveShot(shot.id)}>
          ✕ 删除此镜
        </button>
      </div>
    </div>
  );
}

/* ── 胶片条:序列 + 三产物 pip + 角色聚光 ─────────────────────── */

function Filmstrip({
  shots, charMap, sceneMap, selectedId, hoveredCharId, activeStep,
  batchRunning, onSelect, onAdd, onBatchAll,
}: {
  shots: Shot[];
  charMap: Record<string, Character>;
  sceneMap: Record<string, SceneLoc>;
  selectedId: string | null;
  hoveredCharId: string | null;
  activeStep?: GenStep;
  batchRunning: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onBatchAll: () => void;
}) {
  const selRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);
  return (
    <div className="drama-strip">
      <div className="drama-strip-track">
        {shots.map((shot) => {
          const selected = shot.id === selectedId;
          const hasChar = hoveredCharId ? shot.charIds.includes(hoveredCharId) : false;
          const dim = hoveredCharId ? !hasChar : false;
          return (
            <button
              key={shot.id}
              ref={selected ? selRef : undefined}
              className={`drama-frame${selected ? " selected" : ""}${dim ? " dim" : ""}`}
              style={{ background: sceneMap[shot.sceneId]?.gradient || "var(--ink-3)" }}
              onClick={() => onSelect(shot.id)}
            >
              {shot.videoUrl ? (
                <video className="drama-frame-media" src={shot.videoUrl} muted playsInline preload="metadata" />
              ) : shot.imageUrl ? (
                <img className="drama-frame-media" src={shot.imageUrl} alt="" />
              ) : null}
              <span className="drama-frame-idx">{String(shot.index).padStart(2, "0")}</span>
              {hasChar && (
                <span className="drama-frame-charbar" style={{ background: charMap[hoveredCharId!]?.color }} />
              )}
              <span className="drama-frame-pips">
                <i className={`drama-pip${shot.imageUrl ? " on" : ""}${activeStep === "image" && !shot.imageUrl ? " want" : ""}`} title="分镜图" />
                <i className={`drama-pip${shot.videoUrl ? " on" : ""}${activeStep === "video" && !shot.videoUrl ? " want" : ""}`} title="视频" />
                <i className={`drama-pip${shot.voiceUrl ? " on" : ""}${activeStep === "voice" && !shot.voiceUrl ? " want" : ""}`} title="配音" />
              </span>
            </button>
          );
        })}
        <button className="drama-frame add" onClick={onAdd} title="添加镜头">+</button>
      </div>
      <div className="drama-strip-actions">
        <button className="drama-sec-btn" onClick={onBatchAll} disabled={batchRunning}>
          {batchRunning ? <span className="drama-spin">⟳</span> : <span>⚡</span>}
          一键全集
        </button>
      </div>
    </div>
  );
}

/* ── 主组件 ──────────────────────────────────────────────────── */

export default function DramaCanvas() {
  const [activeStage, setActiveStage] = useState<StageId>("storyboard");
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genCharId, setGenCharId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  type ToastAction = { label: string; onClick: () => void };
  const [toastState, setToastState] = useState<{ text: string; actions?: ToastAction[] } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [writingScript, setWritingScript] = useState(false);
  // AI 重写前的剧本备份 —— toast「撤销」一键恢复(替代二次确认,零摩擦防误毁)
  const undoScriptRef = useRef<{ episodes: StageEpisode[]; synopsis?: string } | null>(null);

  // 兼容原 setToast(string) 调用;带 action(单个或数组)时 toast 显示操作按钮 —— 撤销/下一步引导共用
  const setToast = useCallback(
    (text: string | null, action?: ToastAction | ToastAction[]) => {
      setToastState(text ? { text, actions: action ? (Array.isArray(action) ? action : [action]) : undefined } : null);
    },
    [],
  );
  const toast = toastState;

  const router = useRouter();
  const locale = useLocale();
  const zh = locale === "zh";
  const homeHref = zh ? "/" : "/en";

  // ── store 接入 ──
  const series = useStudioStore((s) => s.series);
  const jobs = useStudioStore((s) => s.jobs);
  const setSeries = useStudioStore((s) => s.setSeries);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);
  const seriesUpdateShot = useStudioStore((s) => s.seriesUpdateShot);
  const seriesUpdateElement = useStudioStore((s) => s.seriesUpdateElement);
  const seriesAddShot = useStudioStore((s) => s.seriesAddShot);
  const seriesRemoveShot = useStudioStore((s) => s.seriesRemoveShot);

  useJobPolling();
  useLocalJobRehydration();

  useEffect(() => {
    if (!toast) return;
    // 带操作按钮的 toast(如「撤销」「下一步」)停留更久
    const t = setTimeout(() => setToastState(null), toast.actions?.length ? 8000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // 必须等 persist 水合完成再判断;只在出厂态(id==="default")灌 demo —— 用户「新建」的空白剧不被覆盖
  useEffect(() => {
    const seedIfEmpty = () => {
      const s = useStudioStore.getState().series;
      const hasShots = s.episodes.some((ep) => ep.scenes.some((sc) => sc.shots.length > 0));
      if (s.id === "default" && !hasShots) setSeries(buildDemoSeries());
    };
    if (useStudioStore.persist.hasHydrated()) seedIfEmpty();
    else return useStudioStore.persist.onFinishHydration(seedIfEmpty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => {
    const jobById = new Map<string, Job>(jobs.map((j) => [j.id, j]));
    return seriesToView(series, jobById);
  }, [series, jobs]);
  const { chars, scenes, shots, charMap, sceneMap } = view;

  const selectedShot = shots.find((s) => s.id === selectedShotId) ?? null;
  const selectedIndex = selectedShot ? shots.findIndex((s) => s.id === selectedShot.id) : -1;
  const selectedCharIds = useMemo(() => new Set(selectedShot?.charIds ?? []), [selectedShot]);
  const totalSec = useMemo(() => shots.reduce((n, s) => n + s.durationSec, 0), [shots]);

  // 初始/失效兜底选中
  useEffect(() => {
    if (shots.length && (!selectedShotId || !shots.some((s) => s.id === selectedShotId))) {
      setSelectedShotId(shots[0].id);
    }
  }, [shots, selectedShotId]);

  // ── 镜头定位(view → store 真实对象)──
  const locateShot = useCallback(
    (shotId: string) => {
      for (const ep of series.episodes)
        for (const scene of ep.scenes)
          for (const s of scene.shots)
            if (s.id === shotId) return { shot: s, epId: ep.id, sceneId: scene.id };
      return null;
    },
    [series],
  );

  // ── 单步生成 ──
  const handleGenerate = useCallback(
    async (shotId: string, stage: StageId) => {
      if (generatingId) return;
      const loc = locateShot(shotId);
      if (!loc) return;
      const { shot, epId, sceneId } = loc;
      setGeneratingId(shotId);
      try {
        if (stage === "voice") {
          await genShotVoice(shot, series, epId, sceneId, shot.genOverride?.voice ?? series.genConfig?.voice);
          setToast(`#${shot.idx} 配音完成`);
        } else if (stage === "synthesis") {
          const jobById = new Map<string, Job>(jobs.map((j) => [j.id, j]));
          const imgUrl = shotImageUrl(shot, jobById);
          if (!imgUrl) { setToast("请先生成分镜图"); return; }
          await genShotVideo(shot, series, epId, sceneId, imgUrl, shot.genOverride?.video ?? series.genConfig?.video);
          setToast(`#${shot.idx} 视频已提交，生成中…`);
        } else {
          await genShotImage(shot, series, epId, sceneId, shot.genOverride?.image ?? series.genConfig?.image);
          setToast(`#${shot.idx} 出图完成`);
        }
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err));
      } finally {
        setGeneratingId(null);
      }
    },
    [generatingId, locateShot, series, jobs],
  );

  // ── 单镜一键三步(每步从最新 store 取,避免闭包陈旧)──
  const handleGenerateAll = useCallback(async (shotId: string) => {
    if (generatingId) return;
    const get = () => {
      const s = useStudioStore.getState().series;
      for (const ep of s.episodes)
        for (const sc of ep.scenes)
          for (const sh of sc.shots)
            if (sh.id === shotId) return { shot: sh, series: s, epId: ep.id, sceneId: sc.id };
      return null;
    };
    let loc = get();
    if (!loc) return;
    const idx = loc.shot.idx;
    setGeneratingId(shotId);
    try {
      setToast(`#${idx} ① 出图中…`);
      await genShotImage(loc.shot, loc.series, loc.epId, loc.sceneId, loc.shot.genOverride?.image ?? loc.series.genConfig?.image);
      loc = get();
      if (loc) {
        const imgUrl = shotImageUrl(loc.shot, new Map<string, Job>(useStudioStore.getState().jobs.map((j) => [j.id, j])));
        if (imgUrl) {
          setToast(`#${idx} ② 出视频中…`);
          await genShotVideo(loc.shot, loc.series, loc.epId, loc.sceneId, imgUrl, loc.shot.genOverride?.video ?? loc.series.genConfig?.video);
        }
      }
      loc = get();
      if (loc && (loc.shot.dialogue?.length || loc.shot.narration?.trim())) {
        setToast(`#${idx} ③ 配音中…`);
        await genShotVoice(loc.shot, loc.series, loc.epId, loc.sceneId, loc.shot.genOverride?.voice ?? loc.series.genConfig?.voice);
      }
      setToast(`#${idx} 一键三步完成 ✓`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingId(null);
    }
  }, [generatingId]);

  // ── 阶段批量(流水线 ⚡ / 一键全集复用)──
  const runStage = useCallback(async (step: GenStep) => {
    const getSeries = () => useStudioStore.getState().series;
    const jobMap = () => new Map<string, Job>(useStudioStore.getState().jobs.map((j) => [j.id, j]));
    const collect = () => {
      const out: { shot: StageShot; epId: string; sceneId: string }[] = [];
      const ep = getSeries().episodes[0];
      if (ep) for (const sc of ep.scenes) for (const sh of sc.shots) out.push({ shot: sh, epId: ep.id, sceneId: sc.id });
      return out;
    };
    const label = step === "image" ? "出图" : step === "video" ? "出视频" : "配音";
    const targets = collect().filter(({ shot }) => {
      if (step === "image") return !shot.imageJobId && !!(shot.narration || shot.imagePrompt);
      if (step === "video") return !shot.videoJobId && !!shotImageUrl(shot, jobMap());
      return !shot.voiceJobId && !!(shot.dialogue?.length || shot.narration?.trim());
    });
    if (!targets.length) { setToast(`没有待${label}的镜头`); return; }
    for (let i = 0; i < targets.length; i++) {
      const { shot, epId, sceneId } = targets[i];
      setToast(`${label} ${i + 1}/${targets.length}`);
      const cfg = shot.genOverride?.[step] ?? getSeries().genConfig?.[step];
      try {
        if (step === "image") await genShotImage(shot, getSeries(), epId, sceneId, cfg);
        else if (step === "voice") await genShotVoice(shot, getSeries(), epId, sceneId, cfg);
        else {
          const u = shotImageUrl(shot, jobMap());
          if (u) await genShotVideo(shot, getSeries(), epId, sceneId, u, cfg);
        }
      } catch { /* skip & continue */ }
    }
  }, []);

  const handleBatchStage = useCallback(async (step: GenStep) => {
    if (batchRunning) return;
    setBatchRunning(true);
    try { await runStage(step); setToast("批量完成 ✓"); }
    finally { setBatchRunning(false); }
  }, [batchRunning, runStage]);

  const handleBatchAll = useCallback(async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    try {
      await runStage("image");
      await runStage("video");
      await runStage("voice");
      setToast("一键全集完成 ✓", { label: "去导出 ↗", onClick: () => handleExportRef.current?.() });
    } finally { setBatchRunning(false); }
  }, [batchRunning, runStage, setToast]);

  // handleExport 定义在后,用 ref 转发给批量完成 toast 的「去导出」
  const handleExportRef = useRef<(() => void) | null>(null);

  // ── 导出剪辑器 ──
  const handleExport = useCallback(() => {
    const ep = series.episodes[0];
    if (!ep) return;
    const jobById = new Map<string, Job>(jobs.map((j) => [j.id, j]));
    const { project, stats } = seriesToEditorProject(ep, series, jobById);
    if (stats.ok === 0) { setToast("没有可导出的素材，请先生成"); return; }
    editorLoadProject(project);
    setToast(`导出 ${stats.ok} 条到剪辑器`);
    // editorProject 不持久化(设计如此),必须 SPA 导航保住内存 store —— 整页跳转会丢
    setTimeout(() => { router.push(zh ? "/editor" : "/en/editor"); }, 900);
  }, [series, jobs, editorLoadProject, zh, router]);
  useEffect(() => { handleExportRef.current = handleExport; }, [handleExport]);

  // ── 编辑写回(失焦才落库;运镜/时长即选即落)──
  const handleEditShot = useCallback(
    (shotId: string, patch: { dialogue?: string; action?: string; shotType?: CastShotType; durationSec?: number }) => {
      const loc = locateShot(shotId);
      if (!loc) return;
      const { shot, epId, sceneId } = loc;
      const update: Partial<StageShot> = {};
      if (patch.dialogue !== undefined)
        update.dialogue = [{ speakerId: shot.dialogue?.[0]?.speakerId, line: patch.dialogue }];
      if (patch.action !== undefined) update.imagePrompt = patch.action;
      if (patch.shotType !== undefined) update.shotType = patch.shotType;
      if (patch.durationSec !== undefined) update.durationSec = patch.durationSec;
      seriesUpdateShot(epId, sceneId, shotId, update);
    },
    [locateShot, seriesUpdateShot],
  );

  // ── 出场角色绑定/解绑(影响一致性参考注入)──
  const handleToggleChar = useCallback(
    (shotId: string, charId: string) => {
      const loc = locateShot(shotId);
      if (!loc) return;
      const { shot, epId, sceneId } = loc;
      const has = shot.elementRefs.includes(charId);
      seriesUpdateShot(epId, sceneId, shotId, {
        elementRefs: has ? shot.elementRefs.filter((id) => id !== charId) : [...shot.elementRefs, charId],
      });
    },
    [locateShot, seriesUpdateShot],
  );

  // ── 删除镜头 ──
  const handleRemoveShot = useCallback(
    (shotId: string) => {
      const loc = locateShot(shotId);
      if (!loc) return;
      seriesRemoveShot(loc.epId, loc.sceneId, shotId);
      setSelectedShotId(null);
      setToast("已删除镜头");
    },
    [locateShot, seriesRemoveShot],
  );

  // ── 剧库(云端多剧本):新建不顶旧剧,旧剧自动入库,可切换/删除;未登录降级本地重开(可撤销) ──
  const undoSeriesRef = useRef<typeof series | null>(null);
  const currentProjectId = useStudioStore((s) => s.currentProjectId);
  const projectList = useStudioStore((s) => s.projectList);
  const orgList = useStudioStore((s) => s.orgList);
  const [libOpen, setLibOpen] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  // 进页加载组织与项目列表(未登录静默失败,菜单内给引导)。
  // 必须等 persist 水合完成:水合是异步的,若 loadOrgs 先 set 了 currentOrgId,
  // 随后的水合会用持久化旧值(null)把它盖掉 → 入库判定失败。
  useEffect(() => {
    const load = () => {
      (async () => {
        const st = useStudioStore.getState();
        await st.loadOrgs();
        await st.loadProjects();
      })().catch(() => {});
    };
    if (useStudioStore.persist.hasHydrated()) load();
    else return useStudioStore.persist.onFinishHydration(load);
  }, []);

  // 自动保存:打开着云端项目时,剧本任何变化 1.5s 后静默落库
  useEffect(() => {
    if (!currentProjectId) return;
    const t = setTimeout(() => {
      useStudioStore.getState().saveCurrentProject().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [series, currentProjectId]);

  // 确保当前剧已在剧库(未入库则现场建项目落库);false=未登录/无组织
  const ensureInLibrary = useCallback(async (): Promise<boolean> => {
    const st = useStudioStore.getState();
    if (st.currentProjectId) {
      await st.saveCurrentProject();
      return true;
    }
    if (!st.currentOrgId) return false;
    const pid = await st.newProject(st.series.name);
    if (!pid) return false;
    useStudioStore.setState({ currentProjectId: pid });
    await useStudioStore.getState().saveCurrentProject();
    return true;
  }, []);

  const handleNewSeries = useCallback(async () => {
    const st = useStudioStore.getState();
    const prev = st.series;
    if (await ensureInLibrary()) {
      const nid = await useStudioStore.getState().newProject("未命名剧本");
      if (!nid) { setToast("新建失败,请重试"); return; }
      await useStudioStore.getState().openProject(nid);
      // openProject 对空项目走 resetSeries(kind 默认 comic)→ 矫正为短剧并找回用户偏好
      setSeries({ name: "未命名剧本", kind: "short", aspect: prev.aspect, genConfig: prev.genConfig });
      await useStudioStore.getState().saveCurrentProject();
      setToast(`已新建 ——「${prev.name}」在剧库,点顶栏剧名可切回`);
    } else {
      // 未登录:本地重开,toast 撤销恢复整部旧剧
      undoSeriesRef.current = prev;
      setSeries({
        id: `drama-${Date.now().toString(36)}`,
        name: "未命名剧本",
        kind: "short",
        synopsis: "",
        bible: [],
        bgm: undefined,
        episodes: [{ id: "ep-1", num: 1, title: "第 1 集", scenes: [{ id: "scene-ep-1", shots: [], castIds: [] }] }],
      });
      setToast("已新建空白剧本(登录后可多剧并存)", {
        label: "撤销",
        onClick: () => {
          const u = undoSeriesRef.current;
          if (!u) return;
          setSeries(u);
          setSelectedShotId(null);
          setToast(`已恢复「${u.name}」`);
        },
      });
    }
    setSelectedShotId(null);
    setActiveStage("script");
  }, [ensureInLibrary, setSeries, setToast]);

  const handleSwitchProject = useCallback(async (pid: string) => {
    if (pid === useStudioStore.getState().currentProjectId) return;
    await ensureInLibrary(); // 当前剧改动先落库
    await useStudioStore.getState().openProject(pid);
    setSelectedShotId(null);
    setToast(`已切换到「${useStudioStore.getState().series.name}」`);
  }, [ensureInLibrary, setToast]);

  const handleDeleteProject = useCallback(async (pid: string) => {
    const name = useStudioStore.getState().projectList.find((p) => p.id === pid)?.name ?? "";
    await useStudioStore.getState().deleteProject(pid);
    setToast(`已删除「${name}」`);
  }, [setToast]);

  // ── AI 编剧:梗概+角色+场景+风格 → 整集分镜(写入 store,替换第一集) ──
  const handleWriteScript = useCallback(async () => {
    if (writingScript) return;
    const s = useStudioStore.getState().series;
    const premise = s.synopsis?.trim();
    if (!premise) { setToast("先在「故事梗概」写一句话剧情"); return; }

    // 单击直发;旧剧本(含产物引用)先备份,完成后 toast 可一键撤销
    undoScriptRef.current = { episodes: s.episodes, synopsis: s.synopsis };
    setWritingScript(true);
    setToast("AI 编剧中…");
    try {
      const cfg = s.genConfig?.script;
      const styleEl = s.bible.find((e) => e.kind === "style");
      const result = await aiWriteBeats({
        premise,
        kind: s.kind,
        numBeats: Number(cfg?.params?.numBeats) || 8,
        cast: s.bible.filter((e) => e.kind === "character").map((c) => ({ name: c.name, description: c.description })),
        styleHint: styleEl?.description,
        locations: s.bible.filter((e) => e.kind === "location").map((l) => ({ name: l.name, description: l.description })),
        model: cfg?.modelId,
      });
      if (!result.beats.length) throw new Error("LLM 没有返回分镜");

      // beats → scenes(连续同场景归组,角色/场景名 lookup 成 id 进 elementRefs)
      const charByName = new Map(s.bible.filter((e) => e.kind === "character").map((c) => [c.name, c.id]));
      const locByName = new Map(s.bible.filter((e) => e.kind === "location").map((l) => [l.name, l.id]));
      const stamp = Date.now().toString(36);
      const scenes: StageScene[] = [];
      result.beats.forEach((b, i) => {
        const locId = b.sceneName ? locByName.get(b.sceneName) : undefined;
        let cur = scenes[scenes.length - 1];
        if (!cur || cur.locationId !== locId) {
          cur = { id: `scn-${stamp}-${scenes.length}`, locationId: locId, castIds: [], shots: [] };
          scenes.push(cur);
        }
        const spkId = b.speakerName ? charByName.get(b.speakerName) : undefined;
        cur.shots.push({
          id: `sh-${stamp}-${i}`,
          idx: i + 1,
          shotType: b.shotType,
          narration: spkId ? undefined : b.text,
          dialogue: spkId ? [{ speakerId: spkId, line: b.text }] : undefined,
          imagePrompt: b.imagePrompt,
          elementRefs: [spkId, locId].filter(Boolean) as string[],
          durationSec: b.durationSec || 4,
        });
        if (spkId && !cur.castIds.includes(spkId)) cur.castIds.push(spkId);
      });

      const ep = s.episodes[0];
      setSeries({
        synopsis: result.synopsis?.trim() || premise,
        episodes: [{ id: ep?.id ?? "ep-1", num: ep?.num ?? 1, title: ep?.title ?? "第 1 集", synopsis: ep?.synopsis, scenes }],
      });
      setSelectedShotId(null);
      setToast(`AI 编剧完成:${result.beats.length} 镜 ✓`, [
        {
          label: "撤销",
          onClick: () => {
            const u = undoScriptRef.current;
            if (!u) return;
            setSeries({ episodes: u.episodes, synopsis: u.synopsis });
            setSelectedShotId(null);
            setToast("已恢复原剧本");
          },
        },
        { label: "下一步:角色 →", onClick: () => { setActiveStage("character"); setToast(null); } },
      ]);
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setWritingScript(false);
    }
  }, [writingScript, setSeries, setToast]);

  // ── 立绘/场景图:生成 / 上传(一致性源头);promptOverride=✎ 里用户改过的提示词 ──
  const handleGenPortrait = useCallback(
    async (charId: string, promptOverride?: string) => {
      if (genCharId) return;
      const el = series.bible.find((e) => e.id === charId);
      if (!el) return;
      setGenCharId(charId);
      try {
        await genElementImage(el, series, series.genConfig?.portrait, promptOverride);
        setToast(`${el.name} ${el.kind === "location" ? "场景图" : "立绘"}已生成`);
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err));
      } finally {
        setGenCharId(null);
      }
    },
    [genCharId, series],
  );

  const handleUploadPortrait = useCallback(
    async (charId: string, file: File) => {
      const el = series.bible.find((e) => e.id === charId);
      if (!el) return;
      setGenCharId(charId);
      try {
        const media = await uploadMediaFile(file, "qwen-image-edit");
        if (!media.url) throw new Error("上传失败");
        seriesUpdateElement(charId, {
          refImages: [...el.refImages, { url: media.url, localKey: media.localKey, angle: "front" }],
        });
        setToast(`${el.name} 立绘已上传`);
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err));
      } finally {
        setGenCharId(null);
      }
    },
    [series, seriesUpdateElement],
  );

  // ── 添加镜头 ──
  const handleAddShot = useCallback(() => {
    const ep = useStudioStore.getState().series.episodes[0];
    if (!ep) return;
    const sc = ep.scenes[ep.scenes.length - 1];
    if (!sc) return;
    const id = seriesAddShot(ep.id, sc.id, {});
    setSelectedShotId(id);
    setToast("已添加镜头");
  }, [seriesAddShot]);

  // ── 选帧 / 阶段切换 ──
  const handleSelectShot = useCallback((id: string) => {
    setSelectedShotId(id);
    setActiveStage((st) => (st === "script" || st === "character" ? "storyboard" : st));
  }, []);

  const handlePipeSelect = useCallback((id: StageId) => {
    setActiveStage(id);
  }, []);

  const stepShot = useCallback((d: number) => {
    if (!shots.length) return;
    const i = shots.findIndex((s) => s.id === selectedShotId);
    const n = Math.min(shots.length - 1, Math.max(0, (i < 0 ? 0 : i) + d));
    setSelectedShotId(shots[n].id);
  }, [shots, selectedShotId]);

  // ── 连播(动态分镜):画面 + 旁白音轨,按时长步进 ──
  const playAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!playing) {
      playAudioRef.current?.pause();
      playAudioRef.current = null;
      return;
    }
    const shot = shots.find((s) => s.id === selectedShotId);
    if (!shot) { setPlaying(false); return; }
    if (shot.voiceUrl) {
      const a = new Audio(shot.voiceUrl);
      a.play().catch(() => {});
      playAudioRef.current = a;
    }
    const t = setTimeout(() => {
      const i = shots.findIndex((s) => s.id === shot.id);
      if (i >= 0 && i < shots.length - 1) setSelectedShotId(shots[i + 1].id);
      else setPlaying(false);
    }, (shot.durationSec || 4) * 1000);
    return () => {
      clearTimeout(t);
      playAudioRef.current?.pause();
      playAudioRef.current = null;
    };
  }, [playing, selectedShotId, shots]);

  // ── 键盘:←→ 切镜 · 空格连播 · Esc 停 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); stepShot(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepShot(1); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "Escape") setPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepShot]);

  const imgDone = shots.filter((s) => s.imageUrl).length;
  const vidDone = shots.filter((s) => s.videoUrl).length;
  const vocDone = shots.filter((s) => s.voiceUrl).length;

  return (
    <div className="drama-root">
      {/* ── 全站统一 chrome ── */}
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} className="logo-link">
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0 <b>DRAMA</b>
            </div>
          </Link>
          <span className="drama-proj-wrap">
            <button
              type="button"
              className="drama-proj-name asbtn"
              title="剧库:切换 / 新建剧本"
              onClick={() => {
                // 打开时顺带拉最新列表(改名/他端变更同步进来)
                if (!libOpen) useStudioStore.getState().loadProjects().catch(() => {});
                setLibOpen(!libOpen);
              }}
            >
              {series.name}<span className="drama-proj-caret">▾</span>
            </button>
            {libOpen && (
              <>
                <span className="drama-lib-overlay" onClick={() => setLibOpen(false)} />
                <span className="drama-lib-menu">
                  <span className="drama-lib-head">剧库{orgList[0] ? ` · ${orgList[0].name}` : ""}</span>
                  {projectList.length === 0 && (
                    <span className="drama-lib-empty">{orgList.length ? "还没有其他剧本" : "登录后启用云端剧库(多剧并存)"}</span>
                  )}
                  {projectList.map((p) => (
                    <span key={p.id} className={`drama-lib-item${p.id === currentProjectId ? " on" : ""}`}>
                      <button
                        type="button"
                        className="drama-lib-item-main"
                        onClick={async () => { setLibOpen(false); await handleSwitchProject(p.id); }}
                      >
                        <span className="drama-lib-item-name">{p.id === currentProjectId ? "✓ " : ""}{p.name}</span>
                        <span className="drama-lib-item-meta">
                          {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                        </span>
                      </button>
                      {p.id !== currentProjectId && (
                        confirmDelId === p.id ? (
                          <button type="button" className="drama-lib-del confirm" onClick={async () => { setConfirmDelId(null); await handleDeleteProject(p.id); }}>
                            确认删除
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="drama-lib-del"
                            title="删除该剧(再点一次确认)"
                            onClick={() => {
                              setConfirmDelId(p.id);
                              setTimeout(() => setConfirmDelId((c) => (c === p.id ? null : c)), 3000);
                            }}
                          >
                            ✕
                          </button>
                        )
                      )}
                    </span>
                  ))}
                  <button type="button" className="drama-lib-new" onClick={async () => { setLibOpen(false); await handleNewSeries(); }}>
                    + 新建剧本
                  </button>
                </span>
              </>
            )}
          </span>
          <span className="drama-proj-meta">
            {series.episodes.length} 集 · {shots.length} 镜 · {fmtDur(totalSec)}
          </span>
        </div>
        <TopNav />
        <div className="right">
          <button type="button" className="drama-gen-btn" style={{ width: "auto", padding: "5px 14px", fontSize: 12 }} onClick={handleExport}>
            <span style={{ fontSize: 11 }}>↗</span>
            <span>{zh ? "导出全集" : "Export"}</span>
          </button>
          <LocaleSwitcher />
        </div>
      </header>

      {/* ── 流水线轨 ── */}
      <PipelineRail
        active={activeStage}
        shots={shots}
        charsCount={chars.length}
        epCount={series.episodes.length}
        batchRunning={batchRunning}
        onSelect={handlePipeSelect}
        onBatchStage={handleBatchStage}
      />

      {/* ── 两栏:中央舞台 | 控制台(角色/场景 CRUD 已全量并入阵容墙) ── */}
      <div className="drama-body">
        {/* 中央区随阶段变形:剧本=剧本稿 · 角色=阵容墙 · 其余=监视器 */}
        {activeStage === "script" ? (
          <ScriptBoard
            seriesName={series.name}
            synopsis={series.synopsis ?? ""}
            shots={shots}
            charMap={charMap}
            sceneMap={sceneMap}
            writing={writingScript}
            onSelectShot={handleSelectShot}
            onWrite={handleWriteScript}
          />
        ) : activeStage === "character" ? (
          <CastBoard
            chars={chars}
            scenes={scenes}
            genElementId={genCharId}
            hoveredCharId={hoveredCharId}
            selectedCharIds={selectedCharIds}
            onGenElement={handleGenPortrait}
            onUploadElement={handleUploadPortrait}
            onHoverChar={setHoveredCharId}
          />
        ) : (
          <Monitor
            shot={selectedShot}
            index={selectedIndex}
            total={shots.length}
            aspect={series.aspect}
            sceneMap={sceneMap}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onPrev={() => stepShot(-1)}
            onNext={() => stepShot(1)}
          />
        )}
        <Console
          shot={selectedShot}
          charMap={charMap}
          sceneMap={sceneMap}
          generating={!!generatingId && generatingId === selectedShotId}
          activeStage={activeStage}
          onGenerate={handleGenerate}
          onGenerateAll={handleGenerateAll}
          onEditShot={handleEditShot}
          onWriteScript={handleWriteScript}
          writingScript={writingScript}
          onNewSeries={handleNewSeries}
          allChars={chars}
          onToggleChar={handleToggleChar}
          onRemoveShot={handleRemoveShot}
        />
      </div>

      {/* ── 胶片条 ── */}
      <Filmstrip
        shots={shots}
        charMap={charMap}
        sceneMap={sceneMap}
        selectedId={selectedShotId}
        hoveredCharId={hoveredCharId}
        activeStep={STAGE_TO_STEP[activeStage]}
        batchRunning={batchRunning}
        onSelect={handleSelectShot}
        onAdd={handleAddShot}
        onBatchAll={handleBatchAll}
      />

      {toast && (
        <div className="drama-toast">
          <span>{toast.text}</span>
          {toast.actions?.map((a) => (
            <button key={a.label} className="drama-toast-action" onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
