/**
 * LumenX 右侧 AI 对话面板。
 *
 * 三段式布局：Header（上下文标签 + 新建聊天）/ Messages（流式渲染）/ Input（模型 + 输入 + 发送）。
 * 与左侧 4-Tab 联动：从 store.chatContext 读取当前选中的实体引用并随消息一起发给 /api/film/chat。
 * SSE 流式接收，逐 chunk 写入 store 中最近一条 assistant 消息。
 *
 * AI 回复文本里若包含 [ACTION:name(:param)?] 标记会被解析为可点击按钮，
 * 点击后调用对应 pipeline / gen 函数把结果写回 store。
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLumenStore, useCurrentProject } from "@/lib/lumenx/store";
import { useStudioStore } from "@/lib/store";
import type { LxTab, LxMessage, LxProject, LxVariant, LxInspectTarget } from "@/lib/lumenx/types";
import {
  extractEntities,
  polishScript,
  expandScript,
  buildStoryboard,
} from "@/lib/lumenx/pipeline";
import { genImage, genVideo } from "@/lib/lumenx/gen";
import { mergeVideos } from "@/lib/lumenx/videoMerge";
import { assetImagePrompt, assetAspect, shotImageInput, shotVideoPrompt } from "@/lib/lumenx/prompts";
import { getStyleById } from "@/lib/lumenx/presets";
import {
  LX_IMAGE_MODELS,
  LX_VIDEO_MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  findImageModel,
  findVideoModel,
} from "@/lib/lumenx/lxModels";

// ──────────────────────────────────────────────────────────────────────────
// Tab 元数据
// ──────────────────────────────────────────────────────────────────────────

const TAB_META: Record<LxTab, { title: string; subtitle: string; suggestions: string[] }> = {
  script: {
    title: "剧本助手",
    subtitle: "帮你润色对白、扩写情节、设计反转",
    suggestions: [
      "把这段台词改得更有张力",
      "为故事设计一个意想不到的反转",
      "提炼一句海报标语",
    ],
  },
  character: {
    title: "角色设计",
    subtitle: "为角色补全外貌、性格、视觉关键词",
    suggestions: [
      "为这个角色生成一段画面 prompt（英文）",
      "补充角色的性格弧光",
      "推荐配音音色风格",
    ],
  },
  storyboard: {
    title: "分镜创作",
    subtitle: "优化分镜节奏、运镜与画面 prompt",
    suggestions: [
      "把这一镜改成更有冲击力的特写",
      "建议下一镜的运镜方式",
      "把动作描述翻译成英文画面 prompt",
    ],
  },
  timeline: {
    title: "视频编辑",
    subtitle: "梳理整体节奏、转场与音画配合",
    suggestions: [
      "整体节奏哪里需要收紧？",
      "建议这两镜之间的转场方式",
      "评估当前总片长是否合适",
    ],
  },
};

const MODELS_BY_TAB: Record<LxTab, string[]> = {
  script: ["qwen3.7-max", "qwen3.7-plus", "qwen-plus", "qwen-max", "deepseek-v3"],
  character: ["qwen-plus", "qwen-vl-max"],
  storyboard: ["qwen-plus", "qwen-vl-max"],
  timeline: ["qwen-plus"],
};

// ──────────────────────────────────────────────────────────────────────────
// ACTION 标记 → 中文按钮文案
// ──────────────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  extract_entities: "🔍 提取角色/场景/道具",
  polish_script: "✨ 润色剧本",
  expand_script: "📝 扩写剧本",
  generate_image: "🎨 生成图片",
  generate_all_images: "🎨 批量生成所有图",
  build_storyboard: "🎬 AI 拆分镜",
  generate_shot_image: "🖼️ 生成分镜图",
  generate_all_shot_images: "🖼️ 批量生成分镜图",
  generate_video: "🎥 生成视频",
  generate_all_videos: "🎥 批量生成视频",
  render_final: "🎞️ 合成最终视频",
  go_storyboard: "🎬 前往「分镜」让 AI 自动拆镜头",
  gen_scene_images: "🏞️ 继续为场景生成概念图",
  gen_prop_images: "🎭 继续为道具生成图片",
  gen_character_images: "🎨 为角色生成形象图",
  go_timeline: "🎞️ 前往时间轴预览成片",
  generate_all_shot_videos: "🎥 批量生成分镜视频",
};

// 宽松版：允许英 / 中冒号、name 前后空白；ACTION_LABEL 单独再扫一遍兜底。
const ACTION_REGEX = /\[ACTION\s*[:：]\s*([a-zA-Z_]+)(?:\s*[:：]\s*([^\]]+?))?\s*\](?:\s*\[ACTION_LABEL\s*[:：]\s*([^\]]+?)\s*\])?/gi;
const LABEL_REGEX = /\[ACTION_LABEL\s*[:：]\s*([^\]]+?)\s*\]/gi;

type ParsedAction = { name: string; param?: string; label: string; key: string };

/** 解析 AI 回复中的 [META_RESULT]...[/META_RESULT] 标记，返回剂除标记后的文本和解析后的 meta。 */
type ParsedMeta = { genre?: string; audience?: string; logline?: string };
const META_RESULT_REGEX = /\[META_RESULT\]\s*([\s\S]*?)\s*\[\/META_RESULT\]/i;

function parseMetaResult(text: string): { cleanText: string; meta: ParsedMeta | null } {
  const match = text.match(META_RESULT_REGEX);
  if (!match) return { cleanText: text, meta: null };
  const jsonStr = match[1].trim();
  let meta: ParsedMeta | null = null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object") {
      meta = {
        genre: typeof parsed.genre === "string" ? parsed.genre : undefined,
        audience: typeof parsed.audience === "string" ? parsed.audience : undefined,
        logline: typeof parsed.logline === "string" ? parsed.logline : undefined,
      };
    }
  } catch {
    // JSON 解析失败则忽略
  }
  const cleanText = text.replace(META_RESULT_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanText, meta };
}

/** 把 AI 回复里的 [ACTION:...] 标记抽出，返回剔除标记后的纯文本和按钮列表。 */
function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const seen = new Set<string>();
  let cleanText = text.replace(ACTION_REGEX, (_full, name: string, param?: string, customLabel?: string) => {
    const n = String(name || "").trim().toLowerCase();
    const p = param ? String(param).trim() : undefined;
    const key = `${n}:${p ?? ""}`;
    if (seen.has(key)) return ""; // 同一动作重复出现只渲染一次
    seen.add(key);
    const fallback = ACTION_LABELS[n] ?? n;
    actions.push({
      name: n,
      param: p,
      label: customLabel?.trim() || fallback,
      key,
    });
    return "";
  });
  // 兜底清理：与任何 ACTION 都没配上的孤立 ACTION_LABEL 残留
  cleanText = cleanText.replace(LABEL_REGEX, "");
  return { cleanText: cleanText.replace(/\n{3,}/g, "\n\n").trim(), actions };
}

/**
 * 内容兜底：AI 没输出 [ACTION:...] 但文本里命中了关键词时，根据当前 Tab 推荐对应动作按钮。
 * 仅在 parseActions 返回空 actions 时由 MessageBubble 调用。
 */
function inferActionsFromContent(content: string, tab: LxTab): ParsedAction[] {
  const inferred: ParsedAction[] = [];
  const push = (name: string, label: string) => {
    const key = `${name}:`;
    if (inferred.some((a) => a.key === key)) return;
    inferred.push({ name, label, key });
  };
  if (tab === "script" || tab === "character") {
    if (/提取|抽取|实体|角色.*场景|场景.*道具/.test(content)) {
      push("extract_entities", ACTION_LABELS.extract_entities);
    }
  }
  if (/润色|优化(?!.*视频)|改写/.test(content) && tab === "script") {
    push("polish_script", ACTION_LABELS.polish_script);
  }
  if (/扩写|展开剧本|补充情节/.test(content) && tab === "script") {
    push("expand_script", ACTION_LABELS.expand_script);
  }
  if (/分镜|拆.*镜|拆解镜头|镜头列表/.test(content) && (tab === "script" || tab === "storyboard")) {
    push("build_storyboard", ACTION_LABELS.build_storyboard);
  }
  if (/(生成|画).{0,4}(图|形象|立绘)/.test(content) && (tab === "character" || tab === "script")) {
    push("generate_all_images", ACTION_LABELS.generate_all_images);
  }
  if (/(生成|批量).{0,4}(分镜图|首帧)/.test(content) && tab === "storyboard") {
    push("generate_all_shot_images", ACTION_LABELS.generate_all_shot_images);
  }
  if (/(生成|批量).{0,4}视频/.test(content) && (tab === "timeline" || tab === "storyboard")) {
    push("generate_all_videos", ACTION_LABELS.generate_all_videos);
  }
  if (/(合成|渲染|导出).{0,4}(成片|最终|视频)/.test(content) && tab === "timeline") {
    push("render_final", ACTION_LABELS.render_final);
  }
  return inferred;
}

// ──────────────────────────────────────────────────────────────────────────
// 极简 Markdown：换行 / **粗体** / `inline code` / ```code block```
// ──────────────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split(/```/g);
  return blocks.map((block, i) => {
    // 奇数索引为代码块
    if (i % 2 === 1) {
      const newline = block.indexOf("\n");
      const lang = newline > -1 ? block.slice(0, newline).trim() : "";
      const code = newline > -1 ? block.slice(newline + 1) : block;
      return (
        <pre key={i} className="lx-chat-code" data-lang={lang || undefined}>
          <code>{code}</code>
        </pre>
      );
    }
    return (
      <span key={i}>
        {block.split("\n").map((line, j, arr) => (
          <span key={j}>
            {renderInline(line)}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </span>
    );
  });
}

function renderInline(line: string): React.ReactNode {
  // 先处理 inline code，再处理 **bold**。
  const tokens: Array<{ kind: "text" | "code" | "bold"; value: string }> = [];
  let rest = line;
  while (rest.length) {
    const code = rest.match(/`([^`]+)`/);
    const bold = rest.match(/\*\*([^*]+)\*\*/);
    let m: { i: number; len: number; kind: "code" | "bold"; value: string } | null = null;
    if (code && (!bold || (code.index ?? 0) <= (bold.index ?? 0))) {
      m = { i: code.index ?? 0, len: code[0].length, kind: "code", value: code[1] };
    } else if (bold) {
      m = { i: bold.index ?? 0, len: bold[0].length, kind: "bold", value: bold[1] };
    }
    if (!m) {
      tokens.push({ kind: "text", value: rest });
      break;
    }
    if (m.i > 0) tokens.push({ kind: "text", value: rest.slice(0, m.i) });
    tokens.push({ kind: m.kind, value: m.value });
    rest = rest.slice(m.i + m.len);
  }
  return tokens.map((t, idx) => {
    if (t.kind === "code") return <code key={idx} className="lx-chat-inline-code">{t.value}</code>;
    if (t.kind === "bold") return <b key={idx}>{t.value}</b>;
    return <span key={idx}>{t.value}</span>;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 流程步骤指示条
// ──────────────────────────────────────────────────────────────────────────

type WfStepState = "idle" | "active" | "done";

function getWorkflowSteps(tab: LxTab, p: LxProject): { label: string; state: WfStepState }[] {
  const hasScript = (p.sourceText?.trim().length ?? 0) >= 30;
  const hasEntities = p.characters.length > 0 || p.scenes.length > 0;
  const charsDescribed = p.characters.length > 0 && p.characters.every((c) => c.description.trim().length > 0);
  const charsImaged = p.characters.length > 0 && p.characters.every((c) => !!c.imageUrl);
  const hasShots = p.shots.length > 0;
  const shotsImaged = hasShots && p.shots.every((s) => !!s.imageUrl);
  const shotsVideoed = hasShots && p.shots.every((s) => !!s.videoUrl);
  const merged = !!p.mergedVideoUrl;

  const flag = (raw: { label: string; done: boolean }[]): { label: string; state: WfStepState }[] => {
    const firstUndone = raw.findIndex((s) => !s.done);
    return raw.map((s, i) => ({
      label: s.label,
      state: s.done ? "done" : i === firstUndone ? "active" : "idle",
    }));
  };

  switch (tab) {
    case "script":
      return flag([
        { label: "编写剧本", done: hasScript },
        { label: "润色优化", done: hasScript && p.sourceText.length > 200 },
        { label: "提取实体", done: hasEntities },
      ]);
    case "character":
      return flag([
        { label: "提取实体", done: hasEntities },
        { label: "完善描述", done: charsDescribed },
        { label: "生成形象", done: charsImaged },
      ]);
    case "storyboard":
      return flag([
        { label: "AI拆分镜", done: hasShots },
        { label: "调整优化", done: hasShots && p.shots.every((s) => s.action.trim().length > 0) },
        { label: "生成帧图", done: shotsImaged },
      ]);
    case "timeline":
      return flag([
        { label: "生成视频", done: shotsVideoed },
        { label: "调整节奏", done: shotsVideoed },
        { label: "合成导出", done: merged },
      ]);
  }
}

// ───────────────────────────────────────────────────────────────────────
// 常驻快捷操作区：不依赖 AI 输出 ACTION，根据当前 Tab + 项目状态始终呈现下一步
// ───────────────────────────────────────────────────────────────────────

type QuickAction = { name: string; param?: string; label: string; disabled?: boolean };

function QuickActions({
  tab,
  project,
  onAction,
  processingAction,
  onCancel,
  batchProgress,
}: {
  tab: LxTab;
  project: LxProject;
  onAction: (name: string, param?: string) => void;
  processingAction: string | null;
  onCancel: () => void;
  batchProgress: { current: number; total: number } | null;
}) {
  const [completedAction, setCompletedAction] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const prevProcessing = useRef<string | null>(null);

  // 监听 processingAction 从非空变为 null，触发成功状态
  useEffect(() => {
    if (prevProcessing.current && !processingAction) {
      setCompletedAction(prevProcessing.current);
      const timer = setTimeout(() => setCompletedAction(null), 2000);
      return () => clearTimeout(timer);
    }
    prevProcessing.current = processingAction;
  }, [processingAction]);

  const hasScript = !!project.sourceText?.trim();
  const hasEntities = project.characters.length > 0 || project.scenes.length > 0;
  const hasShots = project.shots.length > 0;
  const hasShotImages = hasShots && project.shots.every((s) => !!s.imageUrl);
  const hasVideos = project.shots.some((s) => !!s.videoUrl);
  const allVideos = hasShots && project.shots.every((s) => !!s.videoUrl);

  let actions: QuickAction[] = [];

  switch (tab) {
    case "script":
      if (!hasScript) {
        actions = [{ name: "hint", label: "📝 请先在上方输入或粘贴剧本", disabled: true }];
      } else if (!hasEntities) {
        actions = [
          { name: "extract_entities", label: "🔍 提取角色/场景/道具" },
          { name: "polish_script", label: "✨ 润色剧本" },
          { name: "expand_script", label: "📝 扩写剧本" },
        ];
      } else if (!hasShots) {
        actions = [
          { name: "build_storyboard", label: "🎬 AI 拆分镜" },
          { name: "polish_script", label: "✨ 再润色一次" },
          { name: "expand_script", label: "📝 扩写剧本" },
        ];
      } else {
        actions = [
          { name: "polish_script", label: "✨ 润色剧本" },
          { name: "expand_script", label: "📝 扩写剧本" },
        ];
      }
      break;
    case "character":
      if (!hasScript) {
        actions = [{ name: "hint", label: "📝 请先在「剧本」Tab 输入内容", disabled: true }];
      } else if (!hasEntities) {
        actions = [{ name: "extract_entities", label: "🔍 从剧本提取实体" }];
      } else {
        actions = [{ name: "generate_all_images", label: "🎨 批量生成形象图" }];
      }
      break;
    case "storyboard":
      if (!hasScript) {
        actions = [{ name: "hint", label: "📝 请先在「剧本」Tab 输入内容", disabled: true }];
      } else if (!hasShots) {
        actions = [{ name: "build_storyboard", label: "🎬 AI 拆分镜" }];
      } else if (!hasShotImages) {
        actions = [
          { name: "generate_all_shot_images", label: "🖼️ 批量生成分镜图" },
          { name: "generate_all_shot_videos", label: "🎥 直接批量生视频" },
        ];
      } else {
        actions = [{ name: "generate_all_videos", label: "🎥 批量生成视频" }];
      }
      break;
    case "timeline":
      if (!hasShots) {
        actions = [{ name: "hint", label: "🎬 请先在「分镜」Tab 生成分镜", disabled: true }];
      } else if (!hasVideos) {
        actions = [{ name: "generate_all_videos", label: "🎥 批量生成视频" }];
      } else if (!allVideos) {
        actions = [
          { name: "generate_all_videos", label: "🎥 补全剩余视频" },
          { name: "render_final", label: "🎞️ 合成成片" },
        ];
      } else {
        actions = [{ name: "render_final", label: "🎞️ 合成成片" }];
      }
      break;
  }

  if (actions.length === 0 && !processingAction) return null;

  const isBusy = !!processingAction;
  const MAX_VISIBLE = 4;
  const visibleActions = showAllActions ? actions : actions.slice(0, MAX_VISIBLE);
  const hasMore = actions.length > MAX_VISIBLE;

  return (
    <div className="lx-quick-actions" role="toolbar" aria-label="快捷操作">
      <span className="lx-quick-actions__label">下一步</span>
      {isBusy && (
        <button
          type="button"
          className="lx-stop-btn lx-stop-btn--inline"
          onClick={onCancel}
          title="终止当前操作"
        >
          <span className="lx-stop-icon" />
          <span>终止</span>
        </button>
      )}
      {visibleActions.map((a) => {
        const actionKey = a.name + (a.param ? `:${a.param}` : "");
        const loadingThis = processingAction === actionKey;
        const loadingThisName = processingAction === a.name;
        const isLoading = loadingThis || loadingThisName;
        const isSuccess = completedAction === actionKey || completedAction === a.name;
        const disabled = a.disabled || (isBusy && !isLoading) || isLoading;
        return (
          <button
            key={a.name + (a.param ?? "")}
            type="button"
            className={`lx-quick-action-btn${a.disabled ? " disabled" : ""}${isLoading ? " is-loading" : ""}${isSuccess ? " is-success" : ""}`}
            disabled={disabled}
            onClick={() => {
              if (a.disabled || a.name === "hint") return;
              onAction(a.name, a.param);
            }}
          >
            {isLoading && <span className="spinner" aria-hidden />}
            <span>{isLoading ? loadingLabel(a.name, a.label) : isSuccess ? "✓ 完成" : a.label}</span>
          </button>
        );
      })}
      {hasMore && !showAllActions && (
        <button
          type="button"
          className="lx-quick-actions-more"
          onClick={() => setShowAllActions(true)}
        >
          更多 ▾
        </button>
      )}
      {hasMore && showAllActions && (
        <button
          type="button"
          className="lx-quick-actions-more"
          onClick={() => setShowAllActions(false)}
        >
          收起 ▴
        </button>
      )}
      {batchProgress && (
        <div className="lx-batch-progress">
          <span>{batchProgress.current}/{batchProgress.total}</span>
          <div className="lx-batch-progress-bar">
            <div
              className="lx-batch-progress-fill"
              style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** 把按钮原文案换成「执行中」语态，保持原 emoji 提示。 */
function loadingLabel(name: string, original: string): string {
  const map: Record<string, string> = {
    extract_entities: "提取中…",
    polish_script: "润色中…",
    expand_script: "扩写中…",
    build_storyboard: "拆分镜中…",
    generate_image: "生成中…",
    generate_all_images: "批量生图中…",
    generate_shot_image: "生成首帧中…",
    generate_all_shot_images: "批量生图中…",
    generate_video: "生成视频中…",
    generate_all_videos: "批量生视频中…",
    generate_all_shot_videos: "批量生视频中…",
    render_final: "合成中…",
  };
  const text = map[name] ?? "执行中…";
  // 保留原始 emoji 前缀（如 🔍/✨/📝），观感更连贯
  const m = original.match(/^([\p{Extended_Pictographic}\u200d]+\s*)/u);
  return (m ? m[1] : "") + text;
}

// ─────────────────────────────────────────────────────────────────────────
// 生成模型/参数选择区（仅在角色/分镜/时间轴 Tab 可见）
// ─────────────────────────────────────────────────────────────────────────

function GenConfig({ tab, project }: { tab: LxTab; project: LxProject }) {
  const setImageModel = useLumenStore((s) => s.setImageModel);
  const setVideoModel = useLumenStore((s) => s.setVideoModel);
  const setImageParams = useLumenStore((s) => s.setImageParams);
  const setVideoParams = useLumenStore((s) => s.setVideoParams);

  // 只在需要生图/生视频的 Tab 上出现。
  const showImage = tab === "character" || tab === "storyboard";
  const showVideo = tab === "storyboard" || tab === "timeline";
  if (!showImage && !showVideo) return null;

  const imageModelId = project.imageModel ?? DEFAULT_IMAGE_MODEL;
  const videoModelId = project.videoModel ?? DEFAULT_VIDEO_MODEL;
  const imageModel = findImageModel(imageModelId);
  const videoModel = findVideoModel(videoModelId);
  const imageParams = project.imageParams ?? {};
  const videoParams = project.videoParams ?? {};

  const currentSize =
    (imageParams.size as string) ||
    (imageModel?.defaultParams.size as string) ||
    "1024*1024";
  const currentResolution =
    (videoParams.resolution as string) ||
    (videoModel?.defaultParams.resolution as string) ||
    "720P";
  const currentRatio = (videoParams.ratio as string) || project.aspect;
  const currentDuration =
    (videoParams.duration as number) ??
    (videoModel?.defaultParams.duration as number) ??
    5;
  const durationRange = videoModel?.durationRange ?? ([5, 10] as [number, number]);

  return (
    <div className="lx-gen-config" role="toolbar" aria-label="生成模型与参数">
      {showImage && (
        <div className="lx-gen-config-row" title="图像生成模型与尺寸">
          <span className="lx-gen-config-label">图</span>
          <select
            className="lx-gen-config-select"
            value={imageModelId}
            onChange={(e) => setImageModel(e.target.value)}
            aria-label="图像模型"
          >
            {LX_IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="lx-gen-config-select"
            value={currentSize}
            onChange={(e) => setImageParams({ size: e.target.value })}
            aria-label="图像尺寸"
          >
            {(imageModel?.sizes ?? []).map((s) => (
              <option key={s} value={s}>
                {s.replace("*", "×")}
              </option>
            ))}
          </select>
        </div>
      )}
      {showVideo && (
        <div className="lx-gen-config-row" title="视频生成模型与参数">
          <span className="lx-gen-config-label">视频</span>
          <select
            className="lx-gen-config-select"
            value={videoModelId}
            onChange={(e) => setVideoModel(e.target.value)}
            aria-label="视频模型"
          >
            {LX_VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="lx-gen-config-select"
            value={currentResolution}
            onChange={(e) => setVideoParams({ resolution: e.target.value })}
            aria-label="分辨率"
          >
            {(videoModel?.resolutions ?? ["720P", "1080P"]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="lx-gen-config-select"
            value={currentRatio}
            onChange={(e) => setVideoParams({ ratio: e.target.value })}
            aria-label="画幅比"
          >
            <option value="16:9">横 16:9</option>
            <option value="9:16">竖 9:16</option>
            <option value="1:1">方 1:1</option>
          </select>
          <select
            className="lx-gen-config-select"
            value={String(currentDuration)}
            onChange={(e) => setVideoParams({ duration: Number(e.target.value) })}
            aria-label="时长(秒)"
            title="时长（秒）"
          >
            {durationRangeOptions(durationRange[0], durationRange[1]).map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function durationRangeOptions(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

function WorkflowBar({ tab, project }: { tab: LxTab; project: LxProject }) {
  const steps = getWorkflowSteps(tab, project);
  return (
    <div className="lx-workflow-bar" role="progressbar">
      {steps.map((s, i) => (
        <span key={s.label} className="lx-workflow-step-wrap">
          <span className={`lx-workflow-step ${s.state}`}>
            <span className="lx-workflow-dot" />
            <span>{s.label}</span>
          </span>
          {i < steps.length - 1 && <span className="lx-workflow-line" />}
        </span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 组件
// ──────────────────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const project = useCurrentProject();
  const tab = (project?.tab ?? "script") as LxTab;
  const meta = TAB_META[tab];

  const chatContext = useLumenStore((s) => s.chatContext);
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const sendMessage = useLumenStore((s) => s.sendMessage);
  const appendAssistantMessage = useLumenStore((s) => s.appendAssistantMessage);
  const updateLastAssistantMessage = useLumenStore((s) => s.updateLastAssistantMessage);
  const clearThread = useLumenStore((s) => s.clearThread);
  const setModel = useLumenStore((s) => s.setModel);
  const setTabAction = useLumenStore((s) => s.setTab);
  const pendingPrompt = useLumenStore((s) => s.pendingPrompt);
  const clearPendingPrompt = useLumenStore((s) => s.clearPendingPrompt);

  const inspect = chatContext?.inspect;

  const thread = useMemo(
    () => project?.threads.find((t) => t.tab === tab),
    [project?.threads, tab],
  );
  const messages: LxMessage[] = useMemo(
    () => (thread?.messages ?? []).filter((m) => m.role !== "system"),
    [thread?.messages],
  );

  const models = MODELS_BY_TAB[tab];
  const currentModel = thread?.model ?? models[0];

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  /** 当前正在执行的 QuickAction / ACTION 名称（加可选参数）。非空表示有后台任务进行中。 */
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  /** 批量操作进度（当前/总数） */
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  /** 用于中断流式请求的 AbortController */
  const abortRef = useRef<AbortController | null>(null);
  /** 用于标记 executeAction 已被用户取消（生图/生视频等无法真正中止的任务忽略结果） */
  const cancelledRef = useRef(false);

  // 进入检视模式时自动把原 prompt 填到输入框（允许用户编辑后重生）。
  // 仅在 inspect 身份变化时触发，避免走错覆盖用户已输入的内容。
  const inspectId = inspect ? `${inspect.type}:${inspect.id}:${inspect.media}:${inspect.meta.createdAt}` : "";
  useEffect(() => {
    if (!inspect) return;
    setInput(inspect.meta.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectId]);

  const [regenerating, setRegenerating] = useState(false);

  /** 退出检视模式 + 清空输入。 */
  function exitInspect() {
    setChatContext(null);
    setInput("");
  }

  /**
   * 重新生成当前检视资产：
   * - 用最新 input 作为 prompt；
   * - 使用项目当前的 imageModel/videoModel + imageParams/videoParams（已被 inspectAsset 同步并允许用户改）；
   * - 复用 meta 中的 refImages / negativePrompt（无法在面板里改的部分按原样透传）。
   * 完成后更新对应资产的 imageGen/videoGen，并退出检视模式。
   */
  async function regenerate() {
    if (!inspect || regenerating) return;
    const prompt = input.trim();
    if (!prompt) return;
    const store = useLumenStore.getState();
    const proj = store.projects.find((p) => p.id === store.currentId);
    if (!proj) return;

    setRegenerating(true);
    try {
      if (inspect.media === "image") {
        const refImages = inspect.meta.refImages;
        const { jobId, imageUrl, meta } = await genImage({
          prompt,
          aspect: proj.aspect,
          refImages,
          negativePrompt: inspect.meta.negativePrompt,
          title: `${inspect.type}·regen`,
          category: inspect.type === "shot" ? "footage" : (inspect.type as "character" | "scene" | "prop"),
          tags: [`regen-${inspect.id}`],
          modelId: proj.imageModel,
          params: proj.imageParams,
        });
        const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
        if (inspect.type === "character") {
          const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.characters.find((c) => c.id === inspect.id);
          store.updateCharacter(inspect.id, {
            imageUrl,
            imageJobId: jobId,
            variants: [...(fresh?.variants ?? []), variant].slice(-10),
            status: "done",
            imageGen: meta,
          });
        } else if (inspect.type === "scene") {
          const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.scenes.find((s) => s.id === inspect.id);
          store.updateScene(inspect.id, {
            imageUrl,
            imageJobId: jobId,
            variants: [...(fresh?.variants ?? []), variant].slice(-10),
            status: "done",
            imageGen: meta,
          });
        } else if (inspect.type === "prop") {
          const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.props.find((p) => p.id === inspect.id);
          store.updateProp(inspect.id, {
            imageUrl,
            imageJobId: jobId,
            variants: [...(fresh?.variants ?? []), variant].slice(-10),
            status: "done",
            imageGen: meta,
          });
        } else if (inspect.type === "shot") {
          const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.shots.find((s) => s.id === inspect.id);
          store.updateShot(inspect.id, {
            imageUrl,
            imageJobId: jobId,
            imageVariants: [...(fresh?.imageVariants ?? []), variant].slice(-10),
            status: "done",
            imageGen: meta,
          });
        }
        appendAssistantMessage(tab, `🎨 已重新生成${inspect.type === "shot" ? "分镜首帧" : "形象图"}。`);
      } else {
        // 视频：仅 shot 支持
        if (inspect.type !== "shot") throw new Error("仅分镜支持视频重生");
        const shotNow = proj.shots.find((s) => s.id === inspect.id);
        const imageUrl = shotNow?.imageUrl ?? inspect.meta.refImages?.[0];
        if (!imageUrl) throw new Error("分镜尚无首帧图，无法重生视频");
        const { jobId, taskId, meta } = await genVideo({
          prompt,
          aspect: proj.aspect,
          imageUrl,
          duration: shotNow?.durationSec ?? 5,
          title: `shot·${shotNow?.idx ?? ""}·regen`,
          tags: [`regen-${inspect.id}`],
          modelId: proj.videoModel,
          params: proj.videoParams,
        });
        store.updateShot(inspect.id, {
          videoJobId: jobId,
          status: "running",
          videoGen: meta,
        });
        void taskId;
        appendAssistantMessage(tab, `🎥 已重新提交视频生成任务，稍候轮询完成。`);
      }
      exitInspect();
    } catch (err) {
      const m = err instanceof Error ? err.message : "未知错误";
      appendAssistantMessage(tab, `⚠️ 重新生成失败：${m}`);
    } finally {
      setRegenerating(false);
    }
  }

  const listRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动滚到底部
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // textarea 自适应高度
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  // ── 发送 ────────────────────────────────────────────────────────────────
  /**
   * 真正执行一次对话发送。
   * - 不传 override 时取输入框内容（用户手动点击发送）；
   * - 传 override 时直接使用该字符串（如 ScriptTab 的「让 AI 从零起稿」按钮）。
   */
  async function handleSend(override?: string) {
    const content = (override ?? input).trim();
    if (!content || loading || !project) return;

    if (override === undefined) setInput("");
    setLoading(true);

    // 创建 AbortController 以支持用户中断流式输出
    const controller = new AbortController();
    abortRef.current = controller;

    // 1. 写入用户消息（携带当前上下文引用）
    sendMessage(tab, {
      role: "user",
      content,
      ...(chatContext?.refType ? { refType: chatContext.refType } : {}),
      ...(chatContext?.refId ? { refId: chatContext.refId } : {}),
    });

    // 2. 预创建空的 assistant 消息（占位）
    appendAssistantMessage(tab, "");

    // 3. 收集本次发送的对话历史（包含刚写入的 user 消息）
    const fresh = useLumenStore
      .getState()
      .projects.find((p) => p.id === project.id)
      ?.threads.find((t) => t.tab === tab);
    const apiMessages = (fresh?.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      // 构建项目剧本摘要 + 实体摘要，确保所有 Tab 的 AI 对话都能获取项目上下文
      const freshProj = useLumenStore.getState().projects.find((p) => p.id === project.id);
      const scriptContent = freshProj?.sourceText ?? "";
      let entitiesSummary = "";
      if (freshProj) {
        const parts: string[] = [];
        if (freshProj.characters.length > 0) {
          parts.push(`角色：${freshProj.characters.map((c) => `${c.name}${c.description ? `（${c.description.slice(0, 40)}）` : ""}`).join("、")}`);
        }
        if (freshProj.scenes.length > 0) {
          parts.push(`场景：${freshProj.scenes.map((s) => s.name).join("、")}`);
        }
        if (freshProj.props.length > 0) {
          parts.push(`道具：${freshProj.props.map((p) => p.name).join("、")}`);
        }
        entitiesSummary = parts.join("\n");
      }

      const res = await fetch("/api/film/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: apiMessages,
          tab,
          model: currentModel,
          context: chatContext
            ? {
                refType: chatContext.refType,
                refId: chatContext.refId,
                refLabel: chatContext.refLabel,
                refContent: chatContext.refContent,
              }
            : undefined,
          stream: true,
          scriptContent,
          entitiesSummary,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        updateLastAssistantMessage(tab, `⚠️ 请求失败：${res.status} ${errText}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let reasoningText = "";
      let buffer = "";
      let done = false;
      
      // 思考型模型在首个 content 到达前，用 reasoning 拼接为「💭 思考中···」可见预览，
      // 发生首个 content 后丢弃 reasoning，仅呈现正式回复。
      const renderProgress = () => {
        if (accumulated) {
          updateLastAssistantMessage(tab, accumulated);
        } else if (reasoningText) {
          updateLastAssistantMessage(tab, `💭 思考中···\n\n${reasoningText}`);
        }
      };
      
      while (!done) {
        const r = await reader.read();
        if (r.done) break;
        buffer += decoder.decode(r.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
      
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          if (data === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              reasoning?: string;
              error?: string;
            };
            if (parsed.error) {
              accumulated += `\n\u26a0\ufe0f ${parsed.error}`;
              updateLastAssistantMessage(tab, accumulated);
              continue;
            }
            if (parsed.content) {
              accumulated += parsed.content;
              renderProgress();
            } else if (parsed.reasoning) {
              reasoningText += parsed.reasoning;
              renderProgress();
            }
          } catch {
            // 忽略非 JSON 行
          }
        }
      }
      
      // 上游流结束但全程都是 reasoning、未产出任何 content 的占底提示
      if (!accumulated && reasoningText) {
        updateLastAssistantMessage(
          tab,
          `⚠\ufe0f 模型仅返回了思考过程，没有输出正式回复。请重试或更换模型。`,
        );
      } else if (!accumulated) {
        updateLastAssistantMessage(tab, `⚠\ufe0f 模型未返回任何内容，请重试。`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // 用户主动停止，保留已经收到的部分回复，不显示错误
      } else {
        const msg = err instanceof Error ? err.message : "未知错误";
        updateLastAssistantMessage(tab, `⚠️ 网络错误：${msg}`);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (inspect) void regenerate();
      else void handleSend();
    }
  }

  /** 停止流式输出 */
  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
  }

  /** 取消当前正在执行的 action */
  function handleCancelAction() {
    cancelledRef.current = true;
    // 如果是走 AI 对话类 action，同时 abort
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setProcessingAction(null);
    setBatchProgress(null);
    setLoading(false);
    appendAssistantMessage(tab, "❌ 已终止当前操作。");

    // —— 终止时重置所有 running 状态的 shot / 角色 / 场景 / 道具 ——
    const proj = useLumenStore.getState().projects.find(
      (p) => p.id === useLumenStore.getState().currentId,
    );
    if (proj) {
      const store = useLumenStore.getState();
      // 收集需要取消的 jobId
      const jobIdsToCancel: string[] = [];

      for (const shot of proj.shots) {
        if (shot.status === "running") {
          store.updateShot(shot.id, { status: "idle" });
          if (shot.imageJobId) jobIdsToCancel.push(shot.imageJobId);
          if (shot.videoJobId) jobIdsToCancel.push(shot.videoJobId);
        }
      }
      for (const ch of proj.characters) {
        if (ch.status === "running") {
          store.updateCharacter(ch.id, { status: "idle" });
          if (ch.imageJobId) jobIdsToCancel.push(ch.imageJobId);
        }
      }
      for (const sc of proj.scenes) {
        if (sc.status === "running") {
          store.updateScene(sc.id, { status: "idle" });
          if (sc.imageJobId) jobIdsToCancel.push(sc.imageJobId);
        }
      }
      for (const pr of proj.props) {
        if (pr.status === "running") {
          store.updateProp(pr.id, { status: "idle" });
          if (pr.imageJobId) jobIdsToCancel.push(pr.imageJobId);
        }
      }

      // 把相关的 jobs 标记为 canceled，useJobPolling 会自动停止轮询
      if (jobIdsToCancel.length > 0) {
        const studioStore = useStudioStore.getState();
        for (const jid of jobIdsToCancel) {
          studioStore.setJobStatus(jid, { status: "canceled" });
        }
      }
    }
  }

  // 外部组件通过 store.requestAssistant 推入 pendingPrompt 时，自动触发一次发送。
  // 监听 nonce 确保即便内容相同也能再次触发；loading 中则等待解锁后再发。
  useEffect(() => {
    if (!pendingPrompt) return;
    if (pendingPrompt.tab !== tab) return;
    if (loading) return;
    const content = pendingPrompt.content;
    clearPendingPrompt();
    void handleSend(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt?.nonce, tab, loading]);

 // ── ACTION 执行 ─────────────────────────────────────────────────────────

  /**
   * 根据完成的 action 写入"下一步引导"消息到对话中。
   * 包含可点击的 [ACTION:...] 按钮供用户快捷进入下一步。
   */
  function appendNextStepGuide(actionName: string) {
    let guide = "";
    switch (actionName) {
      case "extract_entities":
        guide = [
          "",
          "**下一步建议：**",
          "[ACTION:gen_character_images] 为角色生成形象图",
          "[ACTION:go_storyboard] 前往「分镜」让 AI 自动拆镜头",
        ].join("\n");
        break;
      case "generate_all_images":
      case "generate_image":
        guide = [
          "",
          "✅ 角色形象生成完毕！",
          "",
          "**下一步建议：**",
          "[ACTION:go_storyboard] 前往「分镜」让 AI 自动拆镜头",
          "[ACTION:gen_scene_images] 继续为场景生成概念图",
          "[ACTION:gen_prop_images] 继续为道具生成图片",
        ].join("\n");
        break;
      case "build_storyboard":
        guide = [
          "",
          "**下一步建议：**",
          "[ACTION:generate_all_shot_images] 批量生成分镜图",
          "[ACTION:generate_all_videos] 批量生成分镜视频",
        ].join("\n");
        break;
      case "generate_all_shot_images":
        guide = [
          "",
          "**下一步建议：**",
          "[ACTION:generate_all_videos] 批量生成分镜视频",
          "[ACTION:go_timeline] 前往时间轴预览",
        ].join("\n");
        break;
      case "generate_all_videos":
        guide = [
          "",
          "**下一步建议：**",
          "[ACTION:go_timeline] 前往时间轴预览成片",
          "[ACTION:render_final] 合成最终视频",
        ].join("\n");
        break;
      default:
        return; // 无引导
    }
    if (guide) {
      appendAssistantMessage(tab, guide);
    }
  }

  /**
   * 执行 ACTION 按钮对应的 pipeline / gen。
   * 总是从 store.getState() 取最新 project 状态，避免闭包陈旧。
   * 开始时先写一条「🔄 正在…」占位 assistant 消息（同时设置 processingAction
   * 让按钮变 loading），完成后用 updateLastAssistantMessage 改写为成功/失败
   * 文案；这样既给用户即时反馈，又不会把对话区刷屏。
   */
  async function executeAction(actionName: string, param?: string) {
    if (processingAction) return; // 防止重复点击/并发
    cancelledRef.current = false;
    const store = useLumenStore.getState();
    const proj = store.projects.find((p) => p.id === store.currentId);
    if (!proj) {
      appendAssistantMessage(tab, "⚠️ 请先打开一个项目再执行该操作");
      return;
    }

    // 前置检查：避免用户点了之后才报错
    const needsScript = ["extract_entities", "polish_script", "expand_script", "build_storyboard"];
    if (needsScript.includes(actionName) && !proj.sourceText?.trim()) {
      appendAssistantMessage(
        tab,
        "⚠️ 请先在「剧本」Tab 输入或粘贴剧本内容，然后再执行此操作。",
      );
      setTabAction("script");
      return;
    }
    const needsEntities = ["generate_all_images"];
    if (needsEntities.includes(actionName) && proj.characters.length + proj.scenes.length + proj.props.length === 0) {
      appendAssistantMessage(tab, "⚠️ 尚未提取任何实体，请先点击「提取角色/场景/道具」。");
      return;
    }
    const needsShots = [
      "generate_shot_image",
      "generate_all_shot_images",
      "generate_video",
      "generate_all_videos",
      "generate_all_shot_videos",
    ];
    if (needsShots.includes(actionName) && proj.shots.length === 0) {
      appendAssistantMessage(tab, "⚠️ 还没有分镜，请先在「分镜」Tab 点击「AI 拆分镜」。");
      setTabAction("storyboard");
      return;
    }

    // 一进来先写「正在…」占位 + 标记 loading，让用户立刻看到反馈
    const loadingMap: Record<string, string> = {
      extract_entities: "🔄 正在提取角色/场景/道具…",
      polish_script: "🔄 正在润色剧本…",
      expand_script: "🔄 正在扩写剧本…",
      build_storyboard: "🔄 正在 AI 拆分镜…",
      generate_image: "🔄 正在生成形象图…",
      generate_all_images: "🔄 正在批量生成形象图…",
      generate_shot_image: "🔄 正在生成分镜首帧…",
      generate_all_shot_images: "🔄 正在批量生成分镜首帧…",
      generate_video: "🔄 正在提交视频任务…",
      generate_all_videos: "🔄 正在批量提交视频任务…",
      generate_all_shot_videos: "🔄 正在批量提交视频任务…",
      render_final: "🔄 正在合成成片…",
    };
    const procKey = actionName + (param ? `:${param}` : "");
    setProcessingAction(procKey);
    appendAssistantMessage(tab, loadingMap[actionName] ?? `🔄 正在执行 ${actionName}…`);

    try {
      switch (actionName) {
        case "extract_entities": {
          const result = await extractEntities(proj.sourceText);
          if (cancelledRef.current) break;
          store.setEntities({
            title: result.title,
            characters: result.characters,
            scenes: result.scenes,
            props: result.props,
          });
          setTabAction("character");
          updateLastAssistantMessage(
            tab,
            `✅ 已提取 ${result.characters.length} 个角色、${result.scenes.length} 个场景、${result.props.length} 个道具，已切换到「角色」Tab。`,
          );
          appendNextStepGuide("extract_entities");
          break;
        }
        case "polish_script": {
          const out = await polishScript(proj.sourceText);
          store.patch({ sourceText: out });
          updateLastAssistantMessage(tab, `✨ 剧本已润色，共 ${out.length} 字。`);
          break;
        }
        case "expand_script": {
          const out = await expandScript(proj.sourceText);
          store.patch({ sourceText: out });
          updateLastAssistantMessage(tab, `📝 剧本已扩写为 ${out.length} 字的完整剧本。`);
          break;
        }
        case "generate_image": {
          if (!param) throw new Error("缺少实体 ID");
          await runGenEntityImage(proj, param);
          updateLastAssistantMessage(tab, `🎨 已生成形象图。`);
          break;
        }
        case "generate_all_images": {
          const targets = [
            ...proj.characters.map((c) => ({ kind: "character" as const, id: c.id, name: c.name })),
            ...proj.scenes.map((s) => ({ kind: "scene" as const, id: s.id, name: s.name })),
            ...proj.props.map((p) => ({ kind: "prop" as const, id: p.id, name: p.name })),
          ];
          if (!targets.length) throw new Error("尚无任何实体可生成");
          let ok = 0;
          let fail = 0;
          setBatchProgress({ current: 0, total: targets.length });
          for (const t of targets) {
            if (cancelledRef.current) break;
            try {
              await runGenEntityImage(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, t.id);
              ok += 1;
            } catch (e) {
              fail += 1;
              console.error("[lumenx action] gen image failed", t, e);
            }
            setBatchProgress({ current: ok + fail, total: targets.length });
          }
          setBatchProgress(null);
          if (!cancelledRef.current) {
            updateLastAssistantMessage(tab, `🎨 批量生图完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ""}。`);
            appendNextStepGuide("generate_all_images");
          }
          break;
        }
        case "build_storyboard": {
          const shots = await buildStoryboard(
            proj.sourceText,
            proj.characters,
            proj.scenes,
            proj.props,
          );
          if (cancelledRef.current) break;
          store.setShots(shots);
          setTabAction("storyboard");
          updateLastAssistantMessage(tab, `🎬 已生成 ${shots.length} 个分镜，已切换到「分镜」Tab。`);
          appendNextStepGuide("build_storyboard");
          break;
        }
        case "generate_shot_image": {
          if (!param) throw new Error("缺少分镜 ID");
          await runGenShotImage(proj, param);
          updateLastAssistantMessage(tab, `🖼️ 分镜首帧图已生成。`);
          break;
        }
        case "generate_all_shot_images": {
          if (!proj.shots.length) throw new Error("尚未生成分镜");
          let ok = 0;
          let fail = 0;
          setBatchProgress({ current: 0, total: proj.shots.length });
          for (const s of proj.shots) {
            if (cancelledRef.current) break;
            try {
              await runGenShotImage(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, s.id);
              ok += 1;
            } catch (e) {
              fail += 1;
              console.error("[lumenx action] gen shot image failed", s.id, e);
            }
            setBatchProgress({ current: ok + fail, total: proj.shots.length });
          }
          setBatchProgress(null);
          if (!cancelledRef.current) {
            updateLastAssistantMessage(tab, `🖼️ 批量分镜图：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ""}。`);
            appendNextStepGuide("generate_all_shot_images");
          }
          break;
        }
        case "generate_video": {
          if (!param) throw new Error("缺少分镜 ID");
          await runGenShotVideo(proj, param);
          updateLastAssistantMessage(tab, `🎥 视频任务已提交，稍候轮询完成。`);
          break;
        }
        case "generate_all_videos": {
          if (!proj.shots.length) throw new Error("尚未生成分镜");
          let ok = 0;
          let fail = 0;
          setBatchProgress({ current: 0, total: proj.shots.length });
          for (const s of proj.shots) {
            if (cancelledRef.current) break;
            try {
              await runGenShotVideo(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, s.id);
              ok += 1;
            } catch (e) {
              fail += 1;
              console.error("[lumenx action] gen video failed", s.id, e);
            }
            setBatchProgress({ current: ok + fail, total: proj.shots.length });
          }
          setBatchProgress(null);
          if (!cancelledRef.current) {
            updateLastAssistantMessage(tab, `🎥 批量视频已提交：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ""}。`);
            appendNextStepGuide("generate_all_videos");
          }
          break;
        }
        case "render_final": {
          const urls = proj.shots
            .filter((s) => !!s.videoUrl)
            .map((s) => s.videoUrl as string);
          if (!urls.length) {
            updateLastAssistantMessage(
              tab,
              "⚠️ 还没有任何分镜视频可供合成，请先生成。",
            );
            break;
          }
          const missing = proj.shots.length - urls.length;
          updateLastAssistantMessage(
            tab,
            `🎞️ 开始合成成片（共 ${urls.length} 个分镜${missing > 0 ? `，跳过未生成的 ${missing} 个` : ""}）…`,
          );
          // 释放上一次 blob URL
          const prevUrl = proj.mergedVideoUrl;
          if (prevUrl && prevUrl.startsWith("blob:")) {
            try { URL.revokeObjectURL(prevUrl); } catch { /* ignore */ }
          }
          let lastPhase = "";
          const { blobUrl, strategy } = await mergeVideos(urls, (p) => {
            // 节流：只在 phase 切换时追加一条进度消息，避免刷屏
            if (p.phase !== lastPhase) {
              lastPhase = p.phase;
              if (p.phase === "loading" || p.phase === "merging" || p.phase === "encoding") {
                console.log(`[render_final] ${p.message}`);
              }
            }
          });
          store.patch({ mergedVideoUrl: blobUrl });
          setTabAction("timeline");
          updateLastAssistantMessage(
            tab,
            `✅ 成片已合成（${strategy === "copy" ? "无损拼接" : "重新编码"}），可在「时间轴」Tab 预览和下载。`,
          );
          break;
        }
        default:
          // 处理引导类 action（不需要后台任务，立即执行）
          if (actionName === "go_storyboard") {
            setTabAction("storyboard");
            updateLastAssistantMessage(tab, "🎬 已切换到「分镜」Tab。");
          } else if (actionName === "go_timeline") {
            setTabAction("timeline");
            updateLastAssistantMessage(tab, "🎞️ 已切换到「时间轴」Tab。");
          } else if (actionName === "gen_scene_images") {
            // 触发场景批量生图：重入 executeAction 为 generate_all_images，但只处理场景
            const sceneTargets = proj.scenes;
            if (!sceneTargets.length) {
              updateLastAssistantMessage(tab, "⚠️ 尚无场景实体可生成。");
            } else {
              let ok2 = 0, fail2 = 0;
              for (const s of sceneTargets) {
                if (cancelledRef.current) break;
                try {
                  await runGenEntityImage(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, s.id);
                  ok2 += 1;
                } catch (e) {
                  fail2 += 1;
                  console.error("[lumenx action] gen scene image failed", s.id, e);
                }
              }
              updateLastAssistantMessage(tab, `🏞️ 场景生图完成：成功 ${ok2} 个${fail2 ? `，失败 ${fail2} 个` : ""}。`);
            }
          } else if (actionName === "gen_prop_images") {
            const propTargets = proj.props;
            if (!propTargets.length) {
              updateLastAssistantMessage(tab, "⚠️ 尚无道具实体可生成。");
            } else {
              let ok2 = 0, fail2 = 0;
              for (const p2 of propTargets) {
                if (cancelledRef.current) break;
                try {
                  await runGenEntityImage(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, p2.id);
                  ok2 += 1;
                } catch (e) {
                  fail2 += 1;
                  console.error("[lumenx action] gen prop image failed", p2.id, e);
                }
              }
              updateLastAssistantMessage(tab, `🎭 道具生图完成：成功 ${ok2} 个${fail2 ? `，失败 ${fail2} 个` : ""}。`);
            }
          } else if (actionName === "gen_character_images") {
            const charTargets = proj.characters;
            if (!charTargets.length) {
              updateLastAssistantMessage(tab, "⚠️ 尚无角色实体可生成。");
            } else {
              let ok2 = 0, fail2 = 0;
              for (const c of charTargets) {
                if (cancelledRef.current) break;
                try {
                  await runGenEntityImage(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, c.id);
                  ok2 += 1;
                } catch (e) {
                  fail2 += 1;
                  console.error("[lumenx action] gen character image failed", c.id, e);
                }
              }
              updateLastAssistantMessage(tab, `🎨 角色生图完成：成功 ${ok2} 个${fail2 ? `，失败 ${fail2} 个` : ""}。`);
              appendNextStepGuide("generate_all_images");
            }
          } else if (actionName === "generate_all_shot_videos") {
            // alias for generate_all_videos
            if (!proj.shots.length) throw new Error("尚未生成分镜");
            let ok2 = 0, fail2 = 0;
            for (const s of proj.shots) {
              if (cancelledRef.current) break;
              try {
                await runGenShotVideo(useLumenStore.getState().projects.find((p) => p.id === proj.id) ?? proj, s.id);
                ok2 += 1;
              } catch (e) {
                fail2 += 1;
                console.error("[lumenx action] gen video failed", s.id, e);
              }
            }
            if (!cancelledRef.current) {
              updateLastAssistantMessage(tab, `🎥 批量视频已提交：成功 ${ok2} 个${fail2 ? `，失败 ${fail2} 个` : ""}。`);
              appendNextStepGuide("generate_all_videos");
            }
          } else {
            updateLastAssistantMessage(tab, `⚠️ 未知动作：${actionName}`);
          }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      updateLastAssistantMessage(tab, `⚠️ 执行 ${actionName} 失败：${msg}`);
    } finally {
      setProcessingAction(null);
      setBatchProgress(null);
    }
  }

  // ── 渲染 ────────────────────────────────────────────────────────────────
  if (!project) {
    return (
      <aside className="lx-chat">
        <div className="lx-chat-header">
          <span className="lx-chat-context-tag muted">AI 助手</span>
        </div>
        <div className="lx-chat-messages">
          <div className="lx-chat-empty">
            <div className="big">尚未打开项目</div>
            <div className="sub">先在左侧创建或选择一个项目，AI 将随你切换的 Tab 提供对应能力。</div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="lx-chat">
      {/* Header */}
      <div className="lx-chat-header">
        {chatContext?.refLabel ? (
          <span className="lx-chat-context-tag" title={chatContext.refContent}>
            <i className="dot" /> {chatContext.refLabel}
            <button
              type="button"
              className="x"
              onClick={() => setChatContext(null)}
              aria-label="取消当前上下文"
              title="取消当前上下文"
            >
              ×
            </button>
          </span>
        ) : (
          <span className="lx-chat-context-tag muted">{meta.title}</span>
        )}
        <button
          type="button"
          className="lx-chat-new"
          onClick={() => clearThread(tab)}
          title="清空当前 Tab 的对话"
        >
          🔄 新建聊天
        </button>
      </div>

      {/* 流程步骤指示条 */}
      <WorkflowBar tab={tab} project={project} />

      {/* 检视模式头：展示资产缩略图 + 原始 prompt + 退出 */}
      {inspect && (
        <InspectHeader inspect={inspect} onExit={exitInspect} />
      )}

      {/* Messages */}
      <div className="lx-chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="lx-chat-empty">
            <div className="big">{meta.title}</div>
            <div className="sub">{meta.subtitle}</div>
            <div className="lx-chat-suggestions">
              {meta.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="lx-chat-suggestion"
                  onClick={() => setInput(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => {
              // 标记最后一条 assistant 消息处于流式状态（loading 期间）
              const isLastAssistant =
                i === messages.length - 1 && m.role === "assistant";
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  tab={tab}
                  onAction={executeAction}
                  isStreaming={loading && isLastAssistant}
                />
              );
            })}
          </>
        )}
      </div>

      {/* 常驻快捷操作区 */}
      <QuickActions
        tab={tab}
        project={project}
        onAction={executeAction}
        processingAction={processingAction}
        onCancel={handleCancelAction}
        batchProgress={batchProgress}
      />

      {/* 生成模型与参数选择 */}
      <GenConfig tab={tab} project={project} />

      {/* Input Area */}
      <div className="lx-chat-input-area">
        <div className="row">
          <select
            className="lx-chat-model-select"
            value={currentModel}
            onChange={(e) => setModel(tab, e.target.value)}
            disabled={loading}
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {chatContext?.refLabel && (
            <span className="lx-chat-ref-chip" title={chatContext.refContent}>
              上下文：@ {chatContext.refLabel}
              <button
                type="button"
                className="x"
                onClick={() => setChatContext(null)}
                aria-label="取消当前上下文"
                title="取消当前上下文"
              >
                ×
              </button>
            </span>
          )}
        </div>
        <div className="row input-row lx-chat-input-row-wrap">
          <textarea
            ref={taRef}
            className="lx-chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onInput={(e) => {
              const target = e.currentTarget;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
            placeholder={loading ? "AI 正在回复…" : `跟「${meta.title}」聊点什么（Enter 发送，Shift+Enter 换行）`}
            rows={1}
            disabled={loading}
          />
          {input.length > 0 && (
            <span className="lx-chat-char-count">{input.length}</span>
          )}
          {inspect ? (
            <button
              type="button"
              className="lx-chat-regen-btn"
              onClick={() => void regenerate()}
              disabled={regenerating || !input.trim()}
              title="使用当前参数重新生成此资产"
              aria-label="重新生成"
            >
              {regenerating ? (
                <span className="spinner" />
              ) : (
                <span>✨ 重新生成</span>
              )}
            </button>
          ) : loading ? (
            <button
              type="button"
              className="lx-stop-btn"
              onClick={handleStop}
              title="停止生成"
              aria-label="停止"
            >
              <span className="lx-stop-icon" />
            </button>
          ) : (
            <button
              type="button"
              className="lx-chat-send-btn"
              onClick={() => void handleSend()}
              disabled={!input.trim()}
              title="发送 (Enter)"
              aria-label="发送"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 实体 / 分镜生成的内部 helper（供 executeAction 调用）
// ──────────────────────────────────────────────────────────────────────────

async function runGenEntityImage(proj: LxProject, entityId: string): Promise<void> {
  const store = useLumenStore.getState();
  const style = getStyleById(proj.selectedStyleId, proj.aiStyles, proj.customStyles);
  // 调用方选的图像模型/参数。t2i 接不了参考图，需退回默认。
  const userImageModel = findImageModel(proj.imageModel);
  const imageParams = proj.imageParams;

  const ch = proj.characters.find((c) => c.id === entityId);
  if (ch) {
    const prompt = assetImagePrompt("character", ch.name, ch.description, style?.positivePrompt);
    store.updateCharacter(ch.id, { status: "running" });
    try {
      const { jobId, imageUrl, meta } = await genImage({
        prompt,
        aspect: assetAspect("character", proj.aspect),
        negativePrompt: style?.negativePrompt,
        title: `character·${ch.name}`,
        category: "character",
        tags: [ch.name],
        // 实体首轮生图不带参考图 → 只能上 t2i 模型。
        modelId: userImageModel?.type === "t2i" ? userImageModel.id : undefined,
        params: imageParams,
      });
      const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
      const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.characters.find((c) => c.id === ch.id);
      store.updateCharacter(ch.id, {
        imageUrl,
        imageJobId: jobId,
        variants: [...(fresh?.variants ?? []), variant].slice(-10),
        status: "done",
        imageGen: meta,
      });
    } catch (e) {
      store.updateCharacter(ch.id, { status: "error" });
      throw e;
    }
    return;
  }

  const sc = proj.scenes.find((s) => s.id === entityId);
  if (sc) {
    const prompt = assetImagePrompt("scene", sc.name, sc.description, style?.positivePrompt);
    store.updateScene(sc.id, { status: "running" });
    try {
      const { jobId, imageUrl, meta } = await genImage({
        prompt,
        aspect: assetAspect("scene", proj.aspect),
        negativePrompt: style?.negativePrompt,
        title: `scene·${sc.name}`,
        category: "scene",
        tags: [sc.name],
        modelId: userImageModel?.type === "t2i" ? userImageModel.id : undefined,
        params: imageParams,
      });
      const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
      const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.scenes.find((s) => s.id === sc.id);
      store.updateScene(sc.id, {
        imageUrl,
        imageJobId: jobId,
        variants: [...(fresh?.variants ?? []), variant].slice(-10),
        status: "done",
        imageGen: meta,
      });
    } catch (e) {
      store.updateScene(sc.id, { status: "error" });
      throw e;
    }
    return;
  }

  const pr = proj.props.find((p) => p.id === entityId);
  if (pr) {
    const prompt = assetImagePrompt("prop", pr.name, pr.description, style?.positivePrompt);
    store.updateProp(pr.id, { status: "running" });
    try {
      const { jobId, imageUrl, meta } = await genImage({
        prompt,
        aspect: assetAspect("prop", proj.aspect),
        negativePrompt: style?.negativePrompt,
        title: `prop·${pr.name}`,
        category: "prop",
        tags: [pr.name],
        modelId: userImageModel?.type === "t2i" ? userImageModel.id : undefined,
        params: imageParams,
      });
      const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
      const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.props.find((p) => p.id === pr.id);
      store.updateProp(pr.id, {
        imageUrl,
        imageJobId: jobId,
        variants: [...(fresh?.variants ?? []), variant].slice(-10),
        status: "done",
        imageGen: meta,
      });
    } catch (e) {
      store.updateProp(pr.id, { status: "error" });
      throw e;
    }
    return;
  }

  throw new Error(`找不到实体：${entityId}`);
}

async function runGenShotImage(proj: LxProject, shotId: string): Promise<void> {
  const store = useLumenStore.getState();
  const shot = proj.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error(`找不到分镜：${shotId}`);
  const style = getStyleById(proj.selectedStyleId, proj.aiStyles, proj.customStyles);
  const { prompt, refImages } = shotImageInput(shot, proj, style);
  // 分镜首帧可能携带多张参考图：有参考图 → 需 i2i 模型；无参考图 → t2i 模型。
  const userImageModel = findImageModel(proj.imageModel);
  const needI2i = (refImages?.length ?? 0) > 0;
  const compatible = userImageModel && (needI2i ? userImageModel.type === "i2i" : userImageModel.type === "t2i");
  store.updateShot(shot.id, { status: "running" });
  try {
    const { jobId, imageUrl, meta } = await genImage({
      prompt,
      aspect: proj.aspect,
      refImages,
      negativePrompt: style?.negativePrompt,
      title: `shot·${shot.idx}`,
      category: "footage",
      tags: [`shot-${shot.idx}`],
      modelId: compatible ? userImageModel!.id : undefined,
      params: proj.imageParams,
    });
    const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
    const fresh = useLumenStore.getState().projects.find((p) => p.id === proj.id)?.shots.find((s) => s.id === shot.id);
    store.updateShot(shot.id, {
      imageUrl,
      imageJobId: jobId,
      imageVariants: [...(fresh?.imageVariants ?? []), variant].slice(-10),
      status: "done",
      imageGen: meta,
    });
  } catch (e) {
    store.updateShot(shot.id, { status: "error" });
    throw e;
  }
}

async function runGenShotVideo(proj: LxProject, shotId: string): Promise<void> {
  const store = useLumenStore.getState();
  const shot = proj.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error(`找不到分镜：${shotId}`);
  const prompt = shotVideoPrompt(shot);
  const userVideoModel = findVideoModel(proj.videoModel);

  // 决定视频生成策略：
  // 1. 有分镜首帧图 → I2V（最佳效果）
  // 2. 无首帧但有主体参考图（角色/场景/道具）→ R2V（多角色参考）或 I2V（取第一张参考作首帧）
  // 3. 都没有 → T2V（纯文生视频）
  let imageUrl: string | undefined = shot.imageUrl;
  let refImages: string[] | undefined;
  let modelId: string | undefined;

  if (imageUrl) {
    // 策略 1：I2V
    modelId = userVideoModel?.type === "i2v" ? userVideoModel.id : undefined;
  } else {
    // 收集主体参考图（与 shotImageInput 相同逻辑）
    const entityRefs: string[] = [];
    for (const cid of shot.characterIds) {
      const c = proj.characters.find((x) => x.id === cid);
      if (c?.imageUrl) entityRefs.push(c.imageUrl);
    }
    if (shot.sceneId) {
      const sc = proj.scenes.find((x) => x.id === shot.sceneId);
      if (sc?.imageUrl) entityRefs.push(sc.imageUrl);
    }
    for (const pid of shot.propIds) {
      const p = proj.props.find((x) => x.id === pid);
      if (p?.imageUrl) entityRefs.push(p.imageUrl);
    }

    if (entityRefs.length > 0) {
      // 策略 2：有主体参考图
      // 如果用户选了 r2v 模型 → 走 R2V（面部锁定，传 refImages）
      // 否则取第一张参考图作为首帧走 I2V
      if (userVideoModel?.type === "r2v") {
        refImages = entityRefs;
        modelId = userVideoModel.id;
      } else {
        imageUrl = entityRefs[0];
        modelId = userVideoModel?.type === "i2v" ? userVideoModel.id : undefined;
      }
    } else {
      // 策略 3：T2V，无任何图片
      modelId = userVideoModel?.type === "t2v" ? userVideoModel.id : undefined;
    }
  }

  store.updateShot(shot.id, { status: "running" });
  try {
    const { jobId, taskId, meta } = await genVideo({
      prompt,
      aspect: proj.aspect,
      imageUrl,
      refImages,
      duration: shot.durationSec,
      title: `shot·${shot.idx}`,
      tags: [`shot-${shot.idx}`],
      modelId,
      params: proj.videoParams,
    });
    store.updateShot(shot.id, {
      videoJobId: jobId,
      status: "running",
      videoGen: meta,
    });
    // taskId 后续由 useJobPolling 推到 done；这里仅记录
    void taskId;
  } catch (e) {
    store.updateShot(shot.id, { status: "error" });
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 子组件
// ──────────────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  tab,
  onAction,
  isStreaming = false,
}: {
  message: LxMessage;
  tab: LxTab;
  onAction: (name: string, param?: string) => Promise<void>;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [metaApplied, setMetaApplied] = useState(false);
  const patch = useLumenStore((s) => s.patch);

  // 解析 META_RESULT + ACTION 标记
  const { cleanText, actions, metaResult } = useMemo(() => {
    if (isUser) return { cleanText: message.content || "", actions: [] as ParsedAction[], metaResult: null as ParsedMeta | null };
    // 先解析 META_RESULT
    const { cleanText: textAfterMeta, meta: metaResult } = parseMetaResult(message.content || "");
    // 再解析 ACTION
    const parsed = parseActions(textAfterMeta);
    // 流式期间不渲染 ACTION 按钮，避免半截标签触发误识别
    if (isStreaming) {
      return { cleanText: parsed.cleanText, actions: [] as ParsedAction[], metaResult: null as ParsedMeta | null };
    }
    // 兆底：AI 未输出 ACTION 但命中关键词时，根据 Tab 推荐动作
    if (parsed.actions.length === 0 && parsed.cleanText) {
      const inferred = inferActionsFromContent(parsed.cleanText, tab);
      if (inferred.length) return { cleanText: parsed.cleanText, actions: inferred, metaResult };
    }
    return { cleanText: parsed.cleanText, actions: parsed.actions, metaResult };
  }, [message.content, isUser, tab, isStreaming]);

  // 空内容 + 流式中 → 显示 typing 动画占位（如刚发送、模型尚未吐字）
  const showTyping = !isUser && isStreaming && !cleanText;
  // 有文字 + 流式中 → 文末挂闪烁光标
  const showCursor = !isUser && isStreaming && !!cleanText;

  async function handleClick(a: ParsedAction) {
    if (pending.has(a.key)) return;
    setPending((prev) => new Set(prev).add(a.key));
    try {
      await onAction(a.name, a.param);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(a.key);
        return next;
      });
    }
  }

  function applyMeta() {
    if (!metaResult || metaApplied) return;
    const store = useLumenStore.getState();
    const proj = store.projects.find((p) => p.id === store.currentId);
    if (!proj) return;
    // 将 meta 写入 sourceText 头部
    const lines = proj.sourceText.split(/\r?\n/);
    // 先移除已有的 meta 行（前 8 行内）
    const metaLabels = [/^题材\s*[:：]/, /^类型\s*[:：]/, /^受众\s*[:：]/, /^目标受众\s*[:：]/, /^简介\s*[:：]/, /^一句话简介\s*[:：]/, /^Genre\s*[:：]/i, /^Audience\s*[:：]/i, /^Logline\s*[:：]/i];
    const bodyLines: string[] = [];
    let headerConsumed = 0;
    for (let i = 0; i < lines.length; i++) {
      const trim = lines[i].trim();
      if (i < 8 && (metaLabels.some((re) => re.test(trim)) || !trim)) {
        headerConsumed = i + 1;
        continue;
      }
      bodyLines.push(lines[i]);
    }
    // 如果 headerConsumed 为 0，意味着没有找到任何已有 meta，保留原始 body
    const body = headerConsumed > 0 ? bodyLines.join("\n").replace(/^\s+/, "") : proj.sourceText;
    const head: string[] = [];
    if (metaResult.genre) head.push(`题材：${metaResult.genre}`);
    if (metaResult.audience) head.push(`受众：${metaResult.audience}`);
    if (metaResult.logline) head.push(`简介：${metaResult.logline}`);
    const newSource = head.length ? `${head.join("\n")}\n\n${body.replace(/^\s+/, "")}` : body;
    patch({ sourceText: newSource });
    setMetaApplied(true);
  }

  return (
    <div className={`lx-chat-msg ${isUser ? "lx-chat-msg-user" : "lx-chat-msg-ai"}`}>
      <div className={`bubble${showTyping ? " typing" : ""}`}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="lx-chat-attachments">
            {message.attachments.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="attachment" />
            ))}
          </div>
        )}
        {showTyping ? (
          <span className="lx-typing-indicator" aria-label="AI 正在思考">
            <span /><span /><span />
          </span>
        ) : (
          <div className={`content${showCursor ? " lx-streaming-cursor" : ""}`}>
            {renderMarkdown(cleanText)}
          </div>
        )}
        {/* META_RESULT “应用到档案”按钮 */}
        {metaResult && !isStreaming && (
          <div className="lx-meta-apply">
            {metaApplied ? (
              <span className="lx-meta-apply__done">✓ 已应用到剧本档案</span>
            ) : (
              <button
                type="button"
                className="lx-meta-apply__btn"
                onClick={applyMeta}
              >
                ✦ 应用到档案
              </button>
            )}
          </div>
        )}
        {actions.length > 0 && (
          <div className="lx-action-btns">
            {actions.map((a) => {
              const isPending = pending.has(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  className={`lx-action-btn${isPending ? " loading" : ""}`}
                  onClick={() => handleClick(a)}
                  disabled={isPending}
                  title={a.param ? `${a.name}:${a.param}` : a.name}
                >
                  {isPending && <span className="spinner" />}
                  <span>{a.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

/**
 * 检视模式头部面板：展示被点击资产的缩略图 / 原 prompt / 参考图，并提供退出检视按钮。
 * 其余参数（模型 / size / ratio / duration）复用下方 GenConfig，不在这里重复展示。
 */
function InspectHeader({ inspect, onExit }: { inspect: LxInspectTarget; onExit: () => void }) {
  const { meta, url, media } = inspect;
  const params = meta.params ?? {};
  const paramItems: Array<[string, string]> = [];
  const push = (k: string, label?: string) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    paramItems.push([label ?? k, String(v)]);
  };
  push("size", "尺寸");
  push("resolution", "分辨率");
  push("ratio", "画幅");
  push("duration", "时长(s)");
  push("seed", "seed");
  return (
    <div className="lx-inspect-header" role="region" aria-label="检视模式">
      <div className="lx-inspect-header-row">
        <div className="lx-inspect-thumb">
          {media === "video" ? (
            <video src={url} muted loop autoPlay playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="被检视资产" />
          )}
        </div>
        <div className="lx-inspect-meta">
          <div className="lx-inspect-meta-top">
            <span className="lx-inspect-badge">
              {media === "video" ? "🎥 检视视频" : "🎨 检视图片"}
            </span>
            <span className="lx-inspect-model" title={meta.modelId}>{meta.modelId}</span>
            <button
              type="button"
              className="lx-inspect-exit"
              onClick={onExit}
              title="退出检视模式"
              aria-label="退出检视模式"
            >
              ×
            </button>
          </div>
          {paramItems.length > 0 && (
            <div className="lx-inspect-params">
              {paramItems.map(([k, v]) => (
                <span key={k} className="lx-inspect-param"><b>{k}</b> {v}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="lx-inspect-prompt" title={meta.prompt}>{meta.prompt}</div>
      {meta.refImages && meta.refImages.length > 0 && (
        <div className="lx-inspect-refs">
          <span className="lx-inspect-refs-label">参考图</span>
          {meta.refImages.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt={`ref-${i}`} />
          ))}
        </div>
      )}
      <div className="lx-inspect-tip">可在下方修改提示词、选择不同模型/参数，点击「重新生成」覆盖当前资产。</div>
    </div>
  );
}
