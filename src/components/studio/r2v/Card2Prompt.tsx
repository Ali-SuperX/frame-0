"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useR2VStore, type PromptHistoryEntry } from "@/lib/r2v/projectStore";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { confirmDialog } from "@/components/ui/Dialog";
import {
  getModulesMeta,
  formatConfigAsUserMessage,
  type SkillModule,
  type R2VConfig,
} from "@/lib/r2v/chatSystemPrompt";
import {
  PROMPT_PRESETS,
  PRESET_TAGS,
  getPresetById,
  recommendPresetId,
  guideAnchorForPreset,
} from "@/lib/r2v/promptPresets";
import {
  directionLabel,
  sceneTypeLabel,
  categoryLabel,
} from "@/lib/r2v/labels";
import { lintPromptOutput, issuesToFollowUp, guideAnchorForIssue, type LintIssue } from "@/lib/r2v/promptLint";

type Props = { zh: boolean; onContinue: () => void };

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
};

type InputMode = "ai" | "paste";

/* ── helpers ── */

// ROLES/DIRECTIONS/SCENE_TYPES/CATEGORIES 的中英文映射统一在 lib/r2v/labels.ts，
// 通过 roleLabel/directionLabel/sceneTypeLabel/categoryLabel 访问。

/** 稳定的空数组引用——派生 history 时用它避免每次产生新 [] 引发 zustand 选择器告警 */
const EMPTY_HISTORY: PromptHistoryEntry[] = [];

/**
 * 从编辑后的配置文本里提取「核心需求」段内容。
 * 匹配 buildConfigSummary 输出格式：## ⚠️ 核心需求... 下面一段。
 */
function extractCoreNeedFromText(text: string): string | undefined {
  if (!text) return undefined;
  // 中文版："## ⚠️ 核心需求（必须体现在最终提示词中）"
  // 英文版："## ⚠️ Core need (MUST be reflected in the final prompt)"
  const re = /##\s*⚠️?\s*(?:核心需求|Core need)[^\n]*\n([\s\S]*?)(?=\n\s*##|\n\s*---|$)/i;
  const m = text.match(re);
  return m ? m[1].trim() || undefined : undefined;
}

/** Strip Qwen-3 `<think>` blocks (reasoning_content sometimes leaks into content).
 *  Also strips unclosed `<think>` tags during streaming. */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/g, "")
    .trim();
}

/** Try multiple patterns to extract negative prompt from AI output. */
function extractNegative(text: string): { prompt: string; neg?: string } {
  const patterns = [
    /\[Negative\]\s*\n([\s\S]*?)(?:\n\n|\n(?=\[)|$)/i,
    /(?:Negative\s*(?:prompt)?|负面词|负提示)\s*[:：]\s*\n?([\s\S]*?)(?:\n\n|$)/i,
    /##\s*Negative\s*(?:prompt)?\s*\n([\s\S]*?)(?:\n##|\n\n|$)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]?.trim()) {
      return { prompt: text.replace(m[0], "").trim(), neg: m[1].trim() };
    }
  }
  return { prompt: text };
}

/** Build the full config text sent to the AI model for prompt generation. */
function buildConfigSummary(zh: boolean): string {
  const cur = useR2VStore.getState().current;
  if (!cur) return "";

  const lines: string[] = [];

  // ── Title ──
  lines.push(`# ${cur.title}`);

  // ── Core need (top priority — AI must address this) ──
  if (cur.coreNeed) {
    lines.push("");
    lines.push(`## ${zh ? "⚠️ 核心需求（必须体现在最终提示词中）" : "⚠️ Core need (MUST be reflected in the final prompt)"}`);
    lines.push(cur.coreNeed);
  }

  // ── Content direction + category ──
  if (cur.contentDirection || cur.category !== "general") {
    lines.push("");
    lines.push(`## ${zh ? "内容方向" : "Content direction"}`);
    if (cur.contentDirection) {
      lines.push(`- ${zh ? "类型" : "Type"}: ${directionLabel(cur.contentDirection, zh)}`);
    }
    if (cur.category && cur.category !== "general") {
      lines.push(`- ${zh ? "行业" : "Category"}: ${categoryLabel(cur.category, zh)}`);
    }
  }

  // ── Scene type ──
  if (cur.sceneType) {
    lines.push(`- ${zh ? "场景构成" : "Scene"}: ${sceneTypeLabel(cur.sceneType, zh)}`);
  }

  // ── Brand ──
  if (cur.brand) lines.push(`- ${zh ? "品牌" : "Brand"}: ${cur.brand}`);

  // ── Platform ──
  if (cur.platform) lines.push(`- ${zh ? "目标平台" : "Platform"}: ${cur.platform}`);

  // ── Reference images (directive language) ──
  const refs = cur.references.filter((r) => r.url || r.localKey);
  if (refs.length) {
    lines.push("");
    lines.push(`## ${zh ? "参考图引用规则（强约束）" : "Reference image rules (strict)"}`);
    lines.push(zh
      ? "以下每张图的描述都是**强制使用要求**，不是元数据。每张图必须在最终提示词中有专属聚焦镜头，并在该镜头里展示对应的物理细节。"
      : "Each image description below is a STRICT usage requirement, not metadata. Each image must own its own focus shot showing the described physical detail.");
    refs.forEach((r, i) => {
      const desc = (r.note || r.name || "").trim();
      const n = i + 1;
      if (zh) {
        lines.push("");
        lines.push(`**【图${n}】**`);
        if (desc) {
          lines.push(`  📌 引用规则：当此图出现在任何镜头时，**必须可见**「${desc}」对应的物理细节。`);
          lines.push(`     仅作背景 / 一闪而过 / 微距掠过 = 违规。`);
        } else {
          lines.push(`  📌 引用规则：必须有 ≥1 个专属聚焦镜头展示此图。`);
        }
      } else {
        lines.push("");
        lines.push(`**[Image ${n}]**`);
        if (desc) {
          lines.push(`  📌 Usage rule: when this image appears in any shot, the physical detail of "${desc}" MUST be visible.`);
          lines.push(`     Background-only / passing-by / sweep = violation.`);
        } else {
          lines.push(`  📌 Usage rule: must have ≥1 dedicated focus shot showing this image.`);
        }
      }
    });
  }

  // ── Five elements (subject lock) ──
  const fe = cur.fiveElements;
  const feEntries = Object.entries(fe || {}).filter(([, v]) => v);
  if (feEntries.length) {
    lines.push("");
    lines.push(`## ${zh ? "主体锁定" : "Subject lock"}`);
    const feLabels: Record<string, [string, string]> = {
      character: ["角色", "Character"],
      identity: ["身份", "Identity"],
      outfit: ["服装", "Outfit"],
      environment: ["环境", "Environment"],
      vibe: ["氛围", "Vibe"],
    };
    for (const [k, v] of feEntries) {
      const label = zh ? feLabels[k]?.[0] || k : feLabels[k]?.[1] || k;
      lines.push(`- ${label}: ${v}`);
    }
  }

  // ── Selling points ──
  if (cur.sellingPoints?.length) {
    lines.push("");
    lines.push(`## ${zh ? "核心卖点（请转化为视觉锚点）" : "Selling points (translate to visual anchors)"}`);
    cur.sellingPoints.forEach((sp) => lines.push(`- ${sp}`));
  }

  // ── Anchors ──
  if (cur.anchors?.length) {
    lines.push("");
    lines.push(`## ${zh ? "一致性锚点（全程保持）" : "Consistency anchors (maintain throughout)"}`);
    cur.anchors.forEach((a) => lines.push(`- ${a}`));
  }

  // ── Output settings ──
  lines.push("");
  lines.push(`## ${zh ? "输出设置" : "Output settings"}`);
  lines.push(`- ${zh ? "比例" : "Ratio"}: ${cur.output.ratio}`);
  lines.push(`- ${zh ? "时长" : "Duration"}: ${cur.output.duration}s`);
  lines.push(`- ${zh ? "分辨率" : "Resolution"}: ${cur.output.resolution}`);

  // ── Rhythm ──
  if (cur.rhythm && cur.rhythm !== "single") {
    const rhythmVal = cur.rhythm === "custom" ? (cur.rhythmCustom || "custom") : cur.rhythm;
    lines.push(`- ${zh ? "节奏" : "Rhythm"}: ${rhythmVal}`);
  }

  // ── Must-keep ──
  if (cur.mustKeep) {
    lines.push("");
    lines.push(`## ${zh ? "⚠️ 必须保留（不可删减）" : "⚠️ Must keep (do NOT remove)"}`);
    lines.push(cur.mustKeep);
  }

  // ── Excludes ──
  const allExcludes = [...(cur.excludes || []), ...(cur.excludesCustom || [])];
  if (allExcludes.length) {
    lines.push("");
    lines.push(`## ${zh ? "禁止出现" : "Avoid"}`);
    allExcludes.forEach((e) => lines.push(`- ${e}`));
  }

  // ── Tech details ──
  if (cur.techDetails?.length) {
    lines.push("");
    lines.push(`## ${zh ? "技术要求" : "Technical requirements"}`);
    cur.techDetails.forEach((t) => lines.push(`- ${t}`));
  }

  // ── UGC universal blocks ──
  if (cur.mode === "ugc") {
    const ub = cur.universalBlocks;
    if (ub?.characterLock || ub?.actionDirection || ub?.realismBlock || ub?.excludeBlock) {
      lines.push("");
      lines.push(`## ${zh ? "UGC 通用方向" : "UGC universal direction"}`);
      if (ub.characterLock) lines.push(`- ${zh ? "角色锁定" : "Character lock"}: ${ub.characterLock}`);
      if (ub.actionDirection) lines.push(`- ${zh ? "动作风格" : "Action style"}: ${ub.actionDirection}`);
      if (ub.realismBlock) lines.push(`- ${zh ? "真实感" : "Realism"}: ${ub.realismBlock}`);
      if (ub.excludeBlock) lines.push(`- ${zh ? "排除" : "Exclude"}: ${ub.excludeBlock}`);
    }
  }

  // ── Notes ──
  if (cur.notes) {
    lines.push("");
    lines.push(`## ${zh ? "备注" : "Notes"}`);
    lines.push(cur.notes);
  }

  return lines.join("\n");
}

/* ── component ── */

export default function Card2Prompt({ zh, onContinue }: Props) {
  const cur = useR2VStore((s) => s.current);
  const promptOutput = useR2VStore((s) => s.promptOutput);
  const setPromptManual = useR2VStore((s) => s.setPromptManual);
  // 直接选 record；history 数组在组件层 useMemo 派生，避免选择器每次返回新 [] 触发死循环
  const promptHistoryByProject = useR2VStore((s) => s.promptHistoryByProject);
  const promptHistory = useMemo<PromptHistoryEntry[]>(
    () => (cur ? (promptHistoryByProject[cur.projectId] || EMPTY_HISTORY) : EMPTY_HISTORY),
    [cur, promptHistoryByProject]
  );
  const addPromptHistory = useR2VStore((s) => s.addPromptHistory);
  const togglePromptHistoryFavorite = useR2VStore((s) => s.togglePromptHistoryFavorite);
  const removePromptHistory = useR2VStore((s) => s.removePromptHistory);
  const restorePromptHistory = useR2VStore((s) => s.restorePromptHistory);
  const clearPromptHistory = useR2VStore((s) => s.clearPromptHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const unsavedDraft = useR2VStore((s) => s.unsavedDraft);
  const persistDraft = useR2VStore((s) => s.persistDraft);

  const [mode, setMode] = useState<InputMode>("ai");

  // ── paste mode state ──
  const [pasteText, setPasteText] = useState("");
  const [pasteNeg, setPasteNeg] = useState("");

  // ── AI chat state ──
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [aiModel, setAiModel] = useState("qwen3.6-plus");
  const aiModelRef = useRef(aiModel);
  aiModelRef.current = aiModel;
  const [justApplied, setJustApplied] = useState(false);
  const [loadedModules, setLoadedModules] = useState<SkillModule[]>([]);
  const [disabledModules, setDisabledModules] = useState<Set<string>>(new Set());
  const [customInstructions, setCustomInstructions] = useState("");
  /** 当前选中的场景预设 id —— Card2 是最终选择阶段，由用户在本卡手动决定，
   *  不被 Card1 内容方向影响。默认 "auto"：不应用任何预设规则，AI 完全自由。 */
  const [presetId, setPresetId] = useState<string>("auto");
  /** 选中的标签 — 用于筛选预设网格 */
  const [activeTag, setActiveTag] = useState<string | null>(null);
  /** 预设明细预览模态 */
  const [presetPreview, setPresetPreview] = useState<{ id: string; title: string; content: string; fullLen: number } | null>(null);
  const [presetPreviewLoading, setPresetPreviewLoading] = useState(false);
  const [r2vConfig, setR2vConfig] = useState<R2VConfig | undefined>();
  /** Config text at the time of last generation — used to detect changes */
  const [lastGenConfig, setLastGenConfig] = useState<string | null>(null);
  const [previewModule, setPreviewModule] = useState<{ id: string; title: string; content: string; fullLen: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const promptPreviewRef = useRef<HTMLElement>(null);
  const applyBtnRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasPrompt = !!promptOutput?.prompt;

  // Memoize the full config text — avoids rebuilding on every render
  const configSummary = useMemo(() => buildConfigSummary(zh), [zh, cur]);

  /**
   * 用户在 Card2 直接编辑的配置文本（不污染 Card1 store）。
   * null = 未编辑，与 Card1 配置同步；string = 已编辑，本次生成用这个版本。
   */
  const [configEdited, setConfigEdited] = useState<string | null>(null);
  const effectiveConfig = configEdited ?? configSummary;

  // 根据 Card1 配置算"推荐预设"
  // recommendedPresetId 仅用于在卡片角落显示「✨ 推荐」徽章——不自动应用，
  // 选不选还是用户在 Card2 自己决定（Card2 = 最终选择阶段）。
  const recommendedPresetId = useMemo(
    () => recommendPresetId({
      contentDirection: cur?.contentDirection,
      category: cur?.category,
      sceneType: cur?.sceneType,
    }),
    [cur?.contentDirection, cur?.category, cur?.sceneType]
  );

  // 对当前 prompt 输出做 lint 校验
  const promptLintIssues = useMemo<LintIssue[]>(() => {
    const p = promptOutput?.prompt;
    if (!p) return [];
    return lintPromptOutput({
      text: p + (promptOutput?.negativePrompt ? `\n[Negative]\n${promptOutput.negativePrompt}` : ""),
      expectedDuration: cur?.output?.duration,
      refCount: cur?.references.filter((r) => r.url || r.localKey).length,
      excludes: cur?.excludes,
      coreNeed: cur?.coreNeed,
    });
  }, [promptOutput, cur?.output?.duration, cur?.references, cur?.excludes, cur?.coreNeed]);

  // Abort streaming when component unmounts (user switches card)
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Eagerly load modules so config bar shows them before first generation
  useEffect(() => {
    if (loadedModules.length === 0 && cur) {
      const isEcom = cur.contentDirection === "ecommerce";
      const cfg: R2VConfig = { isEcommerce: isEcom, includeTemplates: true };
      setLoadedModules(getModulesMeta(cfg));
    }
  }, [cur, loadedModules.length]);

  // Auto-start AI chat on first Card2 entry if config is ready
  const autoStartedRef = useRef(false);
  // Reset per-project state when the active project changes
  const projectIdRef = useRef<string | undefined>(cur?.projectId);
  useEffect(() => {
    if (cur?.projectId !== projectIdRef.current) {
      projectIdRef.current = cur?.projectId;
      autoStartedRef.current = false;
      setLastGenConfig(null);
      setMessages([]);
      setConfigEdited(null); // 切项目时清掉编辑覆盖
      // Abort any in-flight streaming for the previous project
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
    }
  }, [cur?.projectId]);
  useEffect(() => {
    if (mode === "ai" && messages.length === 0 && cur && !autoStartedRef.current) {
      if (configSummary) {
        autoStartedRef.current = true;
        startChat();
      }
    }
  }, [mode, cur]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Flash "applied" state + scroll into view. */
  const flashApplied = useCallback(() => {
    setJustApplied(true);
    window.setTimeout(() => setJustApplied(false), 1800);
    window.setTimeout(() => {
      promptPreviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 100);
  }, []);

  // ── apply paste ──
  const applyPaste = useCallback(() => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    setPromptManual(trimmed, pasteNeg.trim() || undefined);
    flashApplied();
  }, [pasteText, pasteNeg, setPromptManual, flashApplied]);

  // ── start AI conversation (dynamic skill knowledge loading) ──
  const startChat = useCallback(() => {
    if (!effectiveConfig) return;

    // Detect context from Card1 config to determine which skill modules to load
    const state = useR2VStore.getState().current;
    const isEcom = state?.contentDirection === "ecommerce";
    const disArr = Array.from(disabledModules);
    const customIns = customInstructions.trim();
    // Preset 决定写作风格与电商模块（覆盖 Card1 内容方向的电商判定）
    const preset = getPresetById(presetId);
    // 用户在 Card2 编辑过配置 → 从编辑后的文本里重新提取 coreNeed；
    // 否则用 Card1 store 里的原值
    const effectiveCoreNeed = configEdited
      ? extractCoreNeedFromText(configEdited)
      : state?.coreNeed?.trim();
    const cfg: R2VConfig = {
      isEcommerce: preset?.ecommerce ?? isEcom,
      includeTemplates: true,
      promptStyle: preset?.style ?? "concise",
      preset: presetId,
      // 用户核心需求 → system prompt 顶部硬约束（最高优先级，不被预设/知识库淹没）
      ...(effectiveCoreNeed ? { coreNeed: effectiveCoreNeed } : {}),
      ...(disArr.length > 0 ? { disabledModules: disArr } : {}),
      ...(customIns ? { customInstructions: customIns } : {}),
    };
    setR2vConfig(cfg);
    setLoadedModules(getModulesMeta(cfg));

    setLastGenConfig(effectiveConfig);
    const userMsg = formatConfigAsUserMessage(effectiveConfig);
    const msgs: ChatMsg[] = [{ role: "user", content: userMsg }];
    setMessages(msgs);
    void streamChat(msgs, cfg);
  }, [effectiveConfig, configEdited, disabledModules, customInstructions, presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── send follow-up ──
  const sendFollowUp = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    // 用 streamChat 直接返回的 fullContent；事后调 applyAiResult() 会从 callback
    // 闭包里的旧 messages 读到上一版 assistant，把 prompt 错误地回写成「原始」版本。
    const fullContent = await streamChat(next);
    if (fullContent) applyAiResult(fullContent);
  }, [input, streaming, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── streaming fetch (rAF-batched) ──
  async function streamChat(msgs: ChatMsg[], cfgOverride?: R2VConfig): Promise<string | null> {
    const effectiveConfig = cfgOverride ?? r2vConfig;
    setStreaming(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const assistantIdx = msgs.length;
    setMessages([...msgs, { role: "assistant", content: "" }]);

    let fullContent = "";
    let rafId = 0;

    /** Flush accumulated content to React state (at most once per frame). */
    function scheduleFlush() {
      if (rafId) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (ctrl.signal.aborted) return;
        const snapshot = fullContent;
        setMessages((prev) => {
          // Guard: state was reset (e.g. project switch) — drop the flush.
          if (!prev[assistantIdx]) return prev;
          const copy = [...prev];
          copy[assistantIdx] = { ...copy[assistantIdx], content: snapshot };
          return copy;
        });
      });
    }

    // dev-only：在 console 打印实际发出去的 r2vConfig，方便排查"配置没传到 API"类问题
    if (process.env.NODE_ENV !== "production") {
      console.info("[r2v/chat] r2vConfig sent →", {
        coreNeed: effectiveConfig?.coreNeed ?? "(empty)",
        preset: effectiveConfig?.preset,
        promptStyle: effectiveConfig?.promptStyle,
        isEcommerce: effectiveConfig?.isEcommerce,
      });
    }

    try {
      const res = await fetch("/api/bailian/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeysHeader(),
        },
        body: JSON.stringify({ messages: msgs, model: aiModelRef.current, r2vConfig: effectiveConfig }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        if (ctrl.signal.aborted) { setStreaming(false); return null; }
        setMessages((prev) => {
          if (!prev[assistantIdx]) return prev;
          const copy = [...prev];
          copy[assistantIdx] = {
            role: "assistant",
            content: `❌ ${err.error || "请求失败"}${err.detail ? `\n${err.detail}` : ""}`,
          };
          return copy;
        });
        setStreaming(false);
        return null;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return null;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              scheduleFlush();
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          if (!prev[assistantIdx]) return prev;
          const copy = [...prev];
          copy[assistantIdx] = {
            role: "assistant",
            content: `❌ ${(err as Error).message}`,
          };
          return copy;
        });
      }
    }

    // Final flush — cancel pending rAF and push latest content
    if (rafId) cancelAnimationFrame(rafId);
    // Skip flush if this stream was aborted (e.g. project switched mid-stream) —
    // otherwise the partial content would corrupt the new project's messages.
    if (ctrl.signal.aborted) {
      setStreaming(false);
      return null;
    }
    if (fullContent) {
      setMessages((prev) => {
        // Guard against state being reset (project switch with delayed flush)
        if (!prev[assistantIdx]) return prev;
        const copy = [...prev];
        copy[assistantIdx] = { ...copy[assistantIdx], content: fullContent };
        return copy;
      });
    }
    setStreaming(false);

    // Auto-scroll to Apply button after streaming completes
    window.setTimeout(() => {
      applyBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);

    return fullContent || null;
  }

  // ── extract prompt from last assistant message ──
  // override：streamChat 完成时由调用方直接传入 fullContent，绕开 React state
  // 的 stale-closure 陷阱——await 之后 messages 闭包还是「点击那一刻」的旧值，
  // find(...) 会拿到上一版 assistant，把 textarea 错误地回写成「原始 prompt」。
  // auto-apply effect 不传 override，沿用 messages 路径（effect 每次跑都读最新值，没有 stale）。
  const applyAiResult = useCallback((override?: string) => {
    let content: string;
    if (typeof override === "string") {
      content = override;
    } else {
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === "assistant" && m.content.trim());
      if (!lastAssistant) return;
      content = lastAssistant.content;
    }

    const cleaned = stripThinking(content);
    const { prompt, neg } = extractNegative(cleaned);
    if (!prompt) return; // 防御：内容全是 thinking / 空白，不要把已有 prompt 清掉
    setPromptManual(prompt, neg || undefined);
    // 入历史——同一次生成只入一次（避免修正按钮重复入）
    addPromptHistory({
      prompt,
      negativePrompt: neg || undefined,
      presetId,
      model: aiModelRef.current,
    });
    flashApplied();
  }, [messages, setPromptManual, addPromptHistory, presetId, flashApplied]);

  // ── Auto-apply: whenever we have a finished assistant message and no prompt yet, apply it ──
  useEffect(() => {
    if (streaming || hasPrompt) return;
    if (messages.length === 0) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim());
    if (!lastAssistant || lastAssistant.content.startsWith("❌")) return;
    const cleaned = stripThinking(lastAssistant.content);
    const { prompt, neg } = extractNegative(cleaned);
    if (prompt) {
      setPromptManual(prompt, neg || undefined);
    } else {
      // Content was all <think> tags or empty — reset to show generate button
      setMessages([]);
      autoStartedRef.current = false;
    }
  }, [streaming, messages, hasPrompt, setPromptManual]);

  // ── stop streaming ──
  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  // ── fetch module preview ──
  const fetchPreview = useCallback(async (moduleId: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/bailian/skill-preview?id=${encodeURIComponent(moduleId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPreviewModule({ id: moduleId, ...data });
    } catch {
      setPreviewModule({ id: moduleId, title: moduleId, content: "加载失败", fullLen: 0 });
    }
    setPreviewLoading(false);
  }, []);

  /** 拉取场景预设的明细规则 */
  const fetchPresetPreview = useCallback(async (id: string) => {
    setPresetPreviewLoading(true);
    try {
      const res = await fetch(`/api/bailian/preset-preview?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPresetPreview({ id, ...data });
    } catch {
      setPresetPreview({ id, title: id, content: "加载失败", fullLen: 0 });
    }
    setPresetPreviewLoading(false);
  }, []);

  // ── file bridge state (must be before any early return) ──
  const [copied, setCopied] = useState(false);

  // resetGeneration 必须在 early return 之前声明 —— React hooks 顺序铁律
  const resetGeneration = useCallback(() => {
    setMessages([]);
    setInput("");
    autoStartedRef.current = false;
    setLoadedModules([]);
    setR2vConfig(undefined);
    // Clear the store prompt so hasPrompt becomes false and auto-apply can run
    useR2VStore.setState({ promptOutput: null });
  }, []);

  if (!cur) return null;

  const command = `/r2v ${cur.projectId}`;
  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

  // Compute visible AI content for State C detection
  const aiVisibleContent = messages
    .filter((m) => m.role === "assistant")
    .map((m) => stripThinking(m.content))
    .join("")
    .trim();

  return (
    <div className="r2v-card r2v-card--prompt">

      {/* ━━ 1. Config Bar — always at top ━━ */}
      <div className="r2v-config-bar">
        <div className="r2v-config-row">
          <div className="r2v-ai-toolbar">
            <label className="r2v-label">{zh ? "模型" : "Model"}</label>
            <select
              className="r2v-select r2v-select--sm"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            >
              <option value="qwen3.7-max">Qwen 3.7 Max</option>
              <option value="qwen3.7-plus">Qwen 3.7 Plus</option>
              <option value="qwen3.6-plus">Qwen 3.6 Plus</option>
              <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
            </select>

            <span className="r2v-label r2v-label--inline">
              {zh ? "场景：" : "Preset:"}
              <strong style={{ marginLeft: 4, color: "var(--paper, #e7e7ea)" }}>
                {(() => {
                  const p = getPresetById(presetId);
                  return p ? `${p.emoji} ${zh ? p.label : p.labelEn}` : presetId;
                })()}
              </strong>
            </span>
          </div>
          {!streaming && !hasPrompt && (
            <button
              type="button"
              className="r2v-btn r2v-btn--primary r2v-btn--sm"
              onClick={() => { resetGeneration(); startChat(); }}
            >
              {messages.length > 0
                ? (zh ? "🔄 重新生成" : "🔄 Regenerate")
                : (zh ? "🚀 生成 Prompt" : "🚀 Generate")}
            </button>
          )}
        </div>
        {loadedModules.length > 0 && (
          <div className="r2v-skill-modules">
            <span className="r2v-skill-modules-label">
              {zh ? "📚 知识库" : "📚 Knowledge"}
            </span>
            {loadedModules.map((m) => {
              const off = disabledModules.has(m.id);
              return (
                <span
                  key={m.id}
                  className={`r2v-skill-badge ${off ? "r2v-skill-badge--off" : ""}`}
                  title={off ? (zh ? "已禁用，点击启用" : "Disabled, click to enable") : (zh ? m.desc : m.descEn)}
                  onClick={() => {
                    setDisabledModules((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      return next;
                    });
                  }}
                >
                  {off ? "○" : "●"} {zh ? m.label : m.labelEn}
                  <span
                    className="r2v-skill-badge-eye"
                    title={zh ? "预览内容" : "Preview"}
                    onClick={(e) => { e.stopPropagation(); void fetchPreview(m.id); }}
                  >
                    👁
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ━━ 2. Preset Kaleidoscope ━━ */}
      <details className="r2v-preset-section" open>
        <summary className="r2v-preset-summary">
          <span>{zh ? "🎯 场景预设（万花筒）" : "🎯 Scene Preset"}</span>
          <a
            href="/hh-guide.html"
            target="_blank"
            rel="noopener"
            className="r2v-guide-link"
            onClick={(e) => e.stopPropagation()}
            title={zh ? "查看 HH 官方提示词指南（38 个最佳实践案例 + 11 条电商原则）" : "Open HH Prompt Guide"}
          >
            📖 {zh ? "HH 指南" : "HH Guide"}
          </a>
          <span className="r2v-preset-current">
            {(() => {
              const p = getPresetById(presetId);
              return p ? `${p.emoji} ${zh ? p.label : p.labelEn}` : "";
            })()}
          </span>
        </summary>

        {/* Tag filter row */}
        <div className="r2v-preset-tags">
          <button
            type="button"
            className={`r2v-preset-tag ${activeTag === null ? "r2v-preset-tag--active" : ""}`}
            onClick={() => setActiveTag(null)}
          >
            {zh ? "全部" : "All"}
          </button>
          {Object.entries(PRESET_TAGS).map(([tagId, label]) => (
            <button
              key={tagId}
              type="button"
              className={`r2v-preset-tag ${activeTag === tagId ? "r2v-preset-tag--active" : ""}`}
              onClick={() => setActiveTag(activeTag === tagId ? null : tagId)}
            >
              {zh ? label.zh : label.en}
            </button>
          ))}
        </div>

        {/* Preset cards grid */}
        <div className="r2v-preset-grid">
          {PROMPT_PRESETS
            .filter((p) => !activeTag || p.tags.includes(activeTag))
            .map((p) => {
              const selected = p.id === presetId;
              const recommended = p.id === recommendedPresetId && !selected;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`r2v-preset-card ${selected ? "r2v-preset-card--active" : ""} ${recommended ? "r2v-preset-card--recommended" : ""}`}
                  onClick={() => {
                    setPresetId(p.id);
                    // 改 preset 时同步刷新 r2vConfig —— sendFollowUp / AI 合成 / 调整
                    // 不传 cfgOverride，会用 r2vConfig（store state）。r2vConfig 只在
                    // startChat 时设一次，不同步刷新这里，改完 preset 仍会跑旧版。
                    setR2vConfig((prev) => {
                      if (!prev) return prev;
                      const meta = getPresetById(p.id);
                      return {
                        ...prev,
                        preset: p.id,
                        promptStyle: meta?.style ?? prev.promptStyle,
                        isEcommerce: meta?.ecommerce ?? prev.isEcommerce,
                      };
                    });
                  }}
                  title={zh ? (recommended ? `根据你的配置推荐：${p.desc}` : p.desc) : p.descEn}
                >
                  {recommended && (
                    <span className="r2v-preset-card-badge">
                      {zh ? "✨ 推荐" : "✨ Recommended"}
                    </span>
                  )}
                  <div className="r2v-preset-card-head">
                    <span className="r2v-preset-card-emoji">{p.emoji}</span>
                    <span className="r2v-preset-card-label">{zh ? p.label : p.labelEn}</span>
                    <span
                      className="r2v-preset-card-eye"
                      title={zh ? "查看规则明细" : "View rule details"}
                      onClick={(e) => { e.stopPropagation(); void fetchPresetPreview(p.id); }}
                    >
                      👁
                    </span>
                  </div>
                  <div className="r2v-preset-card-desc">{zh ? p.desc : p.descEn}</div>
                  <div className="r2v-preset-card-tags">
                    {p.tags.slice(0, 3).map((t) => (
                      <span key={t} className="r2v-preset-card-tag">
                        {zh ? (PRESET_TAGS[t]?.zh ?? t) : (PRESET_TAGS[t]?.en ?? t)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
        </div>
      </details>

      {/* ━━ 3. Config preview/editor — always visible, editable ━━ */}
      {(() => {
        const configChanged = lastGenConfig !== null && effectiveConfig !== lastGenConfig;
        const isEmptyState = !streaming && !hasPrompt && !aiVisibleContent;
        const isEdited = configEdited !== null;
        return (
          <details className="r2v-config-preview" open={isEmptyState}>
            <summary className="r2v-config-preview-summary">
              <span>
                {zh ? "📋 Step 1 配置（可直接编辑）" : "📋 Step 1 Config (editable)"}
              </span>
              {isEdited && (
                <span className="r2v-config-edited-badge">
                  {zh ? "✏️ 已在本卡编辑" : "✏️ Edited here"}
                </span>
              )}
              {configChanged && (
                <span className="r2v-config-changed-badge">
                  {zh ? "⚠ 与已生成版本不同" : "⚠ Differs from generated"}
                </span>
              )}
            </summary>
            <textarea
              className="r2v-context-full-body r2v-config-edit-area"
              value={effectiveConfig}
              spellCheck={false}
              placeholder={zh ? "（Step 1 尚未填写内容）" : "(Step 1 is empty)"}
              onChange={(e) => {
                const v = e.target.value;
                // 与原始 configSummary 完全相同时回到"未编辑"状态
                setConfigEdited(v === configSummary ? null : v);
              }}
            />
            {isEdited && (
              <div className="r2v-config-edit-footer">
                <span className="r2v-config-edit-hint">
                  {zh
                    ? "💡 编辑仅对本次生成生效，不影响 Card 1 原配置"
                    : "💡 Edits only affect this generation, not Card 1"}
                </span>
                <button
                  type="button"
                  className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                  onClick={() => setConfigEdited(null)}
                >
                  {zh ? "↺ 恢复 Card 1 同步" : "↺ Restore Card 1"}
                </button>
              </div>
            )}
          </details>
        );
      })()}

      {/* ━━ 3. Main Content Area ━━ */}

      {/* ── Streaming ── */}
      {streaming ? (
        <section className="r2v-prompt-main">
          <div className="r2v-gen-indicator">
            <div className="r2v-gen-spinner" />
            <span>{zh ? "正在生成..." : "Generating..."}</span>
            <button type="button" className="r2v-btn r2v-btn--ghost r2v-btn--xs" onClick={stopStream}>
              {zh ? "■ 停止" : "■ Stop"}
            </button>
          </div>
          {messages.length > 0 && (
            <div className="r2v-gen-live" ref={scrollRef}>
              <pre className="r2v-chat-pre">
                {stripThinking(messages[messages.length - 1]?.content ?? "")}
                <span className="r2v-typing-cursor" />
              </pre>
            </div>
          )}
        </section>

      /* ── Prompt ready — review / edit / continue ── */
      ) : hasPrompt ? (
        <section className="r2v-prompt-main">
          {/* 配置过期大 banner —— 配置改了但 prompt 是基于旧配置生成的 */}
          {lastGenConfig !== null && effectiveConfig !== lastGenConfig && (
            <div className="r2v-stale-banner">
              <div className="r2v-stale-banner-icon">⚠️</div>
              <div className="r2v-stale-banner-body">
                <div className="r2v-stale-banner-title">
                  {zh ? "下方 Prompt 已过期" : "Prompt is stale"}
                </div>
                <div className="r2v-stale-banner-desc">
                  {zh
                    ? "你修改了 Step 1 配置（或在本卡编辑了文本），但下方 Prompt 仍是基于旧配置生成的。直接使用会导致视频与最新需求不符。"
                    : "You changed the Step 1 config (or edited it here), but the prompt below was generated from the previous version."}
                </div>
              </div>
              <button
                type="button"
                className="r2v-btn r2v-btn--primary r2v-btn--sm"
                disabled={streaming}
                onClick={() => { resetGeneration(); startChat(); }}
              >
                🔄 {zh ? "用最新配置重生成" : "Regenerate with latest"}
              </button>
            </div>
          )}
          {/* Lint 报告条 —— 检测 AI 是否真的遵守了所有约束 */}
          {promptLintIssues.length > 0 && (
            <div className={`r2v-lint-bar r2v-lint-bar--${promptLintIssues.some((i) => i.severity === "error") ? "error" : "warn"}`}>
              <div className="r2v-lint-bar-head">
                <span className="r2v-lint-bar-icon">⚠️</span>
                <span className="r2v-lint-bar-title">
                  {zh
                    ? `发现 ${promptLintIssues.length} 个问题`
                    : `${promptLintIssues.length} issue(s) found`}
                </span>
                <button
                  type="button"
                  className="r2v-btn r2v-btn--primary r2v-btn--xs"
                  disabled={streaming}
                  onClick={async () => {
                    const followUp = issuesToFollowUp(promptLintIssues);
                    if (!followUp) return;
                    const next: ChatMsg[] = [...messages, { role: "user", content: followUp }];
                    setMessages(next);
                    // 同 sendFollowUp：用 streamChat 的返回值，避免闭包读到旧 messages 把 prompt 回写成上一版
                    const fullContent = await streamChat(next);
                    if (fullContent) applyAiResult(fullContent);
                  }}
                >
                  ✨ {zh ? "AI 合成" : "Synthesize"}
                </button>
              </div>
              <ul className="r2v-lint-bar-list">
                {promptLintIssues.map((iss) => (
                  <li key={iss.id} className={`r2v-lint-item r2v-lint-item--${iss.severity}`}>
                    <span className="r2v-lint-item-dot">{iss.severity === "error" ? "✕" : "!"}</span>
                    <span className="r2v-lint-item-msg">{iss.message}</span>
                    <a
                      href={`/hh-guide.html#${guideAnchorForIssue(iss.id)}`}
                      target="_blank"
                      rel="noopener"
                      className="r2v-lint-item-help"
                      title={zh ? "在 HH 指南中查看相关章节" : "Look up in HH Guide"}
                    >
                      📖
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="r2v-prompt-header">
            <span className={`r2v-prompt-status ${promptLintIssues.some((i) => i.severity === "error") ? "r2v-prompt-status--warn" : "r2v-prompt-status--done"}`}>
              {promptLintIssues.some((i) => i.severity === "error")
                ? (zh ? "⚠ Prompt 有问题" : "⚠ Prompt has issues")
                : `✓ ${zh ? "Prompt 已就绪" : "Prompt ready"}`}
            </span>
            {promptHistory.length > 0 && (
              <button
                type="button"
                className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                onClick={() => setHistoryOpen(true)}
                title={zh ? "查看生成历史" : "View history"}
              >
                📚 {zh ? `历史 (${promptHistory.length})` : `History (${promptHistory.length})`}
              </button>
            )}
            {lastGenConfig !== null && configSummary !== lastGenConfig ? (
              <button
                type="button"
                className="r2v-btn r2v-btn--ghost r2v-btn--xs r2v-btn--warn"
                onClick={() => { resetGeneration(); startChat(); }}
                title={zh ? "配置已变更，使用最新配置重新生成" : "Config changed, regenerate with latest"}
              >
                🔄 {zh ? "配置已变更 — 重新生成" : "Config changed — Regenerate"}
              </button>
            ) : (
              <button
                type="button"
                className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                onClick={() => { resetGeneration(); startChat(); }}
                title={zh ? "重新生成" : "Regenerate"}
              >
                🔄 {zh ? "重新生成" : "Regenerate"}
              </button>
            )}
          </div>
          <textarea
            className="r2v-prompt-edit"
            value={promptOutput!.prompt}
            onChange={(e) => {
              setPromptManual(e.target.value, promptOutput!.negativePrompt);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            rows={6}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }}
          />
          <details className="r2v-neg-input">
            <summary>{zh ? "▸ 负面词" : "▸ Negative prompt"}</summary>
            <textarea
              className="r2v-prompt-edit r2v-prompt-edit--neg"
              value={promptOutput!.negativePrompt ?? ""}
              onChange={(e) =>
                setPromptManual(promptOutput!.prompt, e.target.value || undefined)
              }
              rows={3}
              placeholder={zh ? "不希望出现的元素..." : "Elements to avoid..."}
            />
          </details>

          <div className="r2v-refine-row">
            <input
              type="text"
              className="r2v-input r2v-chat-textfield"
              placeholder={zh ? "让 AI 调整：「镜头3缩短」「加电影感」..." : '"Shorten shot 3", "more cinematic"...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendFollowUp();
                }
              }}
            />
            <button type="button" className="r2v-btn r2v-btn--ghost" onClick={sendFollowUp} disabled={!input.trim()}>
              {zh ? "调整" : "Refine"}
            </button>
          </div>

          <button
            type="button"
            className="r2v-btn r2v-btn--primary r2v-btn--lg r2v-btn--glow"
            onClick={onContinue}
            disabled={lastGenConfig !== null && effectiveConfig !== lastGenConfig}
            style={{ width: "100%", marginTop: 16 }}
          >
            {lastGenConfig !== null && effectiveConfig !== lastGenConfig
              ? (zh ? "⚠ Prompt 已过期 — 先重生成" : "⚠ Stale — Regenerate first")
              : (zh ? "应用配置到工坊 →" : "Apply to Workshop →")}
          </button>
        </section>

      /* ── Has AI content but not yet applied ── */
      ) : aiVisibleContent ? (
        <section className="r2v-prompt-main">
          <div className="r2v-prompt-header">
            <span className="r2v-prompt-status">
              {zh ? "AI 生成完成 — 确认后继续" : "AI done — confirm to continue"}
            </span>
          </div>
          <div className="r2v-gen-live" ref={scrollRef} style={{ maxHeight: 400 }}>
            {messages.filter((m) => m.role === "assistant").map((msg, i) => (
              <pre key={i} className="r2v-chat-pre">{stripThinking(msg.content)}</pre>
            ))}
          </div>
          <div className="r2v-prompt-actions">
            <button
              type="button"
              className="r2v-btn r2v-btn--primary r2v-btn--lg r2v-btn--glow"
              onClick={() => applyAiResult()}
              style={{ flex: 1 }}
            >
              {zh ? "✅ 使用这个 Prompt" : "✅ Use this prompt"}
            </button>
            <button
              type="button"
              className="r2v-btn r2v-btn--ghost"
              onClick={() => { resetGeneration(); startChat(); }}
            >
              🔄
            </button>
          </div>
        </section>

      /* ── Empty state — generate button only ── */
      ) : (
        <section className="r2v-prompt-main">
          <div className="r2v-context-action">
            <button
              type="button"
              className="r2v-btn r2v-btn--primary r2v-btn--lg r2v-btn--glow"
              onClick={startChat}
              style={{ minWidth: 240 }}
            >
              {zh ? "🚀 生成 Prompt" : "🚀 Generate Prompt"}
            </button>
          </div>
        </section>
      )}

      {/* ━━ 3. Advanced options — collapsed ━━ */}
      <details className="r2v-advanced-section">
        <summary className="r2v-advanced-summary">
          {zh ? "⚙ 高级选项" : "⚙ Advanced options"}
        </summary>
        <div className="r2v-advanced-body">
          <details className="r2v-custom-instructions">
            <summary>{zh ? "📝 自定义指令" : "📝 Custom instructions"}</summary>
            <textarea
              className="r2v-custom-instructions-area"
              rows={3}
              placeholder={zh ? "追加额外指令..." : "Extra instructions..."}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
            />
          </details>

          <div className="r2v-mode-tabs" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`r2v-mode-tab ${mode === "ai" ? "r2v-mode-tab--active" : ""}`}
              onClick={() => setMode("ai")}
            >
              {zh ? "🤖 AI 扩写" : "🤖 AI expand"}
            </button>
            <button
              type="button"
              className={`r2v-mode-tab ${mode === "paste" ? "r2v-mode-tab--active" : ""}`}
              onClick={() => setMode("paste")}
            >
              {zh ? "📋 手动粘贴" : "📋 Manual paste"}
            </button>
          </div>

          {/* Paste mode */}
          {mode === "paste" && (
            <div style={{ marginTop: 12 }}>
              <textarea
                className="r2v-paste-area"
                rows={8}
                placeholder={zh ? "在这里粘贴视频 prompt..." : "Paste video prompt here..."}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <details className="r2v-neg-input">
                <summary>{zh ? "负面词（可选）" : "Negative prompt (optional)"}</summary>
                <textarea
                  className="r2v-paste-area r2v-paste-area--sm"
                  rows={3}
                  placeholder={zh ? "不希望出现的元素..." : "Elements to avoid..."}
                  value={pasteNeg}
                  onChange={(e) => setPasteNeg(e.target.value)}
                />
              </details>
              <button
                type="button"
                className="r2v-btn r2v-btn--primary"
                onClick={applyPaste}
                disabled={!pasteText.trim()}
              >
                {zh ? "✅ 应用 Prompt" : "✅ Apply prompt"}
              </button>
            </div>
          )}

          {/* File bridge */}
          <details className="r2v-file-bridge" style={{ marginTop: 10 }}>
            <summary>
              {zh ? "📁 文件桥同步" : "📁 File bridge"}
            </summary>
            <div className="r2v-file-bridge-body">
              {unsavedDraft ? (
                <>
                  <p className="r2v-empty" style={{ margin: "8px 0" }}>
                    {zh ? "需要先保存草稿" : "Save draft first"}
                  </p>
                  <button
                    type="button"
                    className="r2v-btn r2v-btn--primary r2v-btn--xs"
                    onClick={() => void persistDraft()}
                  >
                    {zh ? "💾 保存" : "💾 Save"}
                  </button>
                </>
              ) : (
                <>
                  <p className="r2v-empty" style={{ margin: "4px 0 8px" }}>
                    {zh ? "在终端执行：" : "Run in terminal:"}
                  </p>
                  <div className="r2v-cmd">
                    <code>{command}</code>
                    <button
                      type="button"
                      className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                      onClick={copyCmd}
                    >
                      {copied ? "✓" : zh ? "复制" : "Copy"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      </details>

      {/* ── skill module preview modal ── */}
      {(previewModule || previewLoading) ? (
        <div className="r2v-preview-overlay" onClick={() => setPreviewModule(null)}>
          <div className="r2v-preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="r2v-preview-header">
              <div>
                <div className="r2v-preview-title">
                  📚 {previewModule?.title ?? "加载中..."}
                </div>
                {previewModule ? (
                  <div className="r2v-preview-meta">
                    {zh
                      ? `全文 ${(previewModule.fullLen / 1024).toFixed(1)} KB`
                      : `Full: ${(previewModule.fullLen / 1024).toFixed(1)} KB`}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="r2v-preview-close"
                onClick={() => setPreviewModule(null)}
              >
                ✕
              </button>
            </div>
            <div className="r2v-preview-body">
              {previewLoading ? (zh ? "加载中..." : "Loading...") : previewModule?.content}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── prompt history drawer ── */}
      {historyOpen && (
        <div className="r2v-history-overlay" onClick={() => setHistoryOpen(false)}>
          <aside className="r2v-history-drawer" onClick={(e) => e.stopPropagation()}>
            <header className="r2v-history-head">
              <div>
                <div className="r2v-history-title">
                  📚 {zh ? "生成历史" : "Generation History"}
                </div>
                <div className="r2v-history-meta">
                  {zh ? `共 ${promptHistory.length} 条（收藏永久保留 / 其余保留最近 20 条）` : `${promptHistory.length} entries (favorites kept forever / latest 20 otherwise)`}
                </div>
              </div>
              <button type="button" className="r2v-preview-close" onClick={() => setHistoryOpen(false)}>✕</button>
            </header>
            <div className="r2v-history-list">
              {promptHistory.length === 0 ? (
                <div className="r2v-history-empty">
                  {zh ? "暂无生成历史。生成一次 Prompt 后会自动入库。" : "No history yet."}
                </div>
              ) : (
                promptHistory.map((h) => {
                  const date = new Date(h.createdAt);
                  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
                  const presetMeta = h.presetId ? getPresetById(h.presetId) : null;
                  const isCurrent = promptOutput?.prompt === h.prompt;
                  return (
                    <article key={h.id} className={`r2v-history-card ${isCurrent ? "r2v-history-card--current" : ""}`}>
                      <div className="r2v-history-card-head">
                        <span className="r2v-history-card-time">{dateStr}</span>
                        {presetMeta && (
                          <span className="r2v-history-card-preset">{presetMeta.emoji} {zh ? presetMeta.label : presetMeta.labelEn}</span>
                        )}
                        {h.model && <span className="r2v-history-card-model">{h.model}</span>}
                        <button
                          type="button"
                          className="r2v-history-card-fav"
                          title={zh ? (h.favorite ? "取消收藏" : "收藏，永久保留") : (h.favorite ? "Unfavorite" : "Favorite")}
                          onClick={() => togglePromptHistoryFavorite(h.id)}
                        >
                          {h.favorite ? "★" : "☆"}
                        </button>
                      </div>
                      <div className="r2v-history-card-summary">{h.summary || h.prompt.slice(0, 80)}</div>
                      <div className="r2v-history-card-actions">
                        {!isCurrent && (
                          <button
                            type="button"
                            className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                            onClick={() => { restorePromptHistory(h.id); setHistoryOpen(false); }}
                          >
                            {zh ? "↺ 恢复" : "↺ Restore"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                          onClick={() => removePromptHistory(h.id)}
                          title={zh ? "删除此版本" : "Delete"}
                        >
                          🗑
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            {promptHistory.some((h) => !h.favorite) && (
              <footer className="r2v-history-foot">
                <button
                  type="button"
                  className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: zh
                          ? "清空非收藏的历史？"
                          : "Clear non-favorite history?",
                        message: zh ? "收藏会保留。" : "Favorites are kept.",
                        danger: true,
                      })
                    ) {
                      clearPromptHistory();
                    }
                  }}
                >
                  {zh ? "清空非收藏" : "Clear non-favorites"}
                </button>
              </footer>
            )}
          </aside>
        </div>
      )}

      {/* ── preset detail preview modal ── */}
      {(presetPreview || presetPreviewLoading) ? (
        <div className="r2v-preview-overlay" onClick={() => setPresetPreview(null)}>
          <div className="r2v-preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="r2v-preview-header">
              <div>
                <div className="r2v-preview-title">
                  🎯 {presetPreview?.title ?? (zh ? "加载中..." : "Loading...")}
                </div>
                {presetPreview ? (
                  <div className="r2v-preview-meta">
                    {zh
                      ? `规则 ${presetPreview.fullLen} 字`
                      : `Rules: ${presetPreview.fullLen} chars`}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="r2v-preview-close"
                onClick={() => setPresetPreview(null)}
              >
                ✕
              </button>
            </div>
            <div className="r2v-preview-body">
              {presetPreviewLoading ? (zh ? "加载中..." : "Loading...") : presetPreview?.content}
            </div>
            <div className="r2v-preview-foot">
              {(() => {
                const meta = guideAnchorForPreset(
                  presetPreview ? getPresetById(presetPreview.id) : undefined
                );
                return (
                  <a
                    href={`/hh-guide.html#${meta.anchor}`}
                    target="_blank"
                    rel="noopener"
                    className="r2v-preview-foot-link"
                  >
                    {zh
                      ? `🔍 想了解背后的方法论？HH 指南 → ${meta.zh}`
                      : `🔍 Want the full methodology? HH Guide → ${meta.en}`}
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
