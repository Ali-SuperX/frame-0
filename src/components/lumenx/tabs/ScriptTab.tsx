"use client";

/**
 * 剧本 Tab —— LumenX 4-Tab 架构第一站。
 *
 * 设计取向：暗房熔金（espresso + 铜金 accent），借鉴 Zopia 的卡片化叙事节奏：
 *  · 顶上一张「档案卡」放剧本元信息（题材 / 受众 / 一句话）
 *  · 中段「人物小传」走横向 chip-grid，每张卡可点
 *  · 下段「剧本正文」走纸感独白，△动作 / VO旁白 / [场次] 三类信号灯式高亮
 *  · 任意可点段落 hover 时浮出右上角的「与 AI 对话 ↗」徽标，点击 → setChatContext
 *
 * 数据策略：剧本元信息直接寄存在 sourceText 的头部（`题材：…\n受众：…\n简介：…\n\n正文……`），
 * 解析时撕下头部、剩下的就是正文；保存时再把头部拼回去。无需扩展数据模型。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useCurrentProject, useLumenStore } from "@/lib/lumenx/store";
import { extractEntities } from "@/lib/lumenx/pipeline";
import type { LxCharacter } from "@/lib/lumenx/types";

// ============================================================================
// 头部元信息解析 / 拼装
// ============================================================================

type ScriptMeta = {
  genre: string;
  audience: string;
  logline: string;
};

const META_LABELS: Record<keyof ScriptMeta, string[]> = {
  genre: ["题材", "类型", "Genre"],
  audience: ["受众", "目标受众", "Audience"],
  logline: ["简介", "一句话简介", "Logline"],
};

/** 从 sourceText 头部撕下三段元信息，返回 { meta, body }。 */
function splitMeta(sourceText: string): { meta: ScriptMeta; body: string } {
  const meta: ScriptMeta = { genre: "", audience: "", logline: "" };
  const lines = sourceText.split(/\r?\n/);
  let cursor = 0;
  // 仅扫描前 8 行：避免误吃正文里偶然出现的「简介：」对白。
  const scanLimit = Math.min(8, lines.length);
  const consumed = new Set<number>();
  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i].trim();
    if (!line) {
      consumed.add(i);
      continue;
    }
    for (const key of Object.keys(META_LABELS) as (keyof ScriptMeta)[]) {
      const labels = META_LABELS[key];
      const re = new RegExp(`^(?:${labels.join("|")})\\s*[:：]\\s*(.+)$`);
      const m = line.match(re);
      if (m) {
        meta[key] = m[1].trim();
        consumed.add(i);
        cursor = i + 1;
        break;
      }
    }
  }
  // 元信息块结束后，跳过紧随的空行作为分隔。
  while (cursor < lines.length && !lines[cursor].trim()) {
    consumed.add(cursor);
    cursor++;
  }
  const hasAnyMeta = meta.genre || meta.audience || meta.logline;
  if (!hasAnyMeta) return { meta, body: sourceText };
  const body = lines.filter((_, i) => !consumed.has(i)).join("\n").replace(/^\s+/, "");
  return { meta, body };
}

/** 把 meta + body 拼回 sourceText。空的 meta 字段不输出。 */
function joinMeta(meta: ScriptMeta, body: string): string {
  const head: string[] = [];
  if (meta.genre.trim()) head.push(`题材：${meta.genre.trim()}`);
  if (meta.audience.trim()) head.push(`受众：${meta.audience.trim()}`);
  if (meta.logline.trim()) head.push(`简介：${meta.logline.trim()}`);
  if (!head.length) return body.trim();
  return `${head.join("\n")}\n\n${body.replace(/^\s+/, "")}`;
}

// ============================================================================
// 正文行级解析 —— △动作 / VO旁白 / [场次] / 角色名: 台词
// ============================================================================

type LineKind = "scene" | "action" | "vo" | "speaker" | "blank" | "text";
type ParsedLine = { kind: LineKind; raw: string; speaker?: string; content?: string };

function parseBody(body: string): ParsedLine[] {
  return body.split(/\r?\n/).map<ParsedLine>((raw) => {
    const trim = raw.trim();
    if (!trim) return { kind: "blank", raw };
    if (/^[△▲◇◆□■]/.test(trim)) return { kind: "action", raw };
    if (/^(VO|V\.O\.|旁白)\b/i.test(trim) || /^OS[:：]/i.test(trim)) return { kind: "vo", raw };
    if (/^\[[^\]]+\]/.test(trim) || /^第[一二三四五六七八九十百零\d]+(集|场|幕)/.test(trim))
      return { kind: "scene", raw };
    // 角色名：台词 —— 仅当冒号前是短的中文 / 英文名（≤8字、无空格）时识别。
    const m = trim.match(/^([^\s:：]{1,10})\s*[:：]\s*(.+)$/);
    if (m && !/^https?$/i.test(m[1])) return { kind: "speaker", raw, speaker: m[1], content: m[2] };
    return { kind: "text", raw };
  });
}

/** 按场次把行分组：每组以一个 scene 行起头（没有 scene 的话就归到 _open_）。 */
type ParsedScene = { mark: string; lines: ParsedLine[] };
function groupByScene(lines: ParsedLine[]): ParsedScene[] {
  const out: ParsedScene[] = [];
  let cur: ParsedScene = { mark: "", lines: [] };
  for (const ln of lines) {
    if (ln.kind === "scene") {
      if (cur.mark || cur.lines.length) out.push(cur);
      cur = { mark: ln.raw.trim(), lines: [] };
    } else {
      cur.lines.push(ln);
    }
  }
  if (cur.mark || cur.lines.length) out.push(cur);
  return out;
}

// ============================================================================
// 组件主体
// ============================================================================

export default function ScriptTab() {
  const project = useCurrentProject();
  const patch = useLumenStore((s) => s.patch);
  const setEntities = useLumenStore((s) => s.setEntities);
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const requestAssistant = useLumenStore((s) => s.requestAssistant);
  const appendAssistantMessage = useLumenStore((s) => s.appendAssistantMessage);
  const updateLastAssistantMessage = useLumenStore((s) => s.updateLastAssistantMessage);
  // 当前已选中的剧本片段 refId（用于左侧段落高亮，与右侧 chatContext 双向同步）。
  const selectedRefId = useLumenStore((s) => (s.chatContext?.tab === "script" ? s.chatContext.refId : undefined));

  const fileRef = useRef<HTMLInputElement>(null);
  const [editingBody, setEditingBody] = useState(false);
  const [draftRaw, setDraftRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeDismissed, setAnalyzeDismissed] = useState(false);
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceText = project?.sourceText ?? "";
  const { meta, body } = useMemo(() => splitMeta(sourceText), [sourceText]);
  const parsed = useMemo(() => parseBody(body), [body]);
  const scenes = useMemo(() => groupByScene(parsed), [parsed]);

  const writeMeta = useCallback(
    (next: Partial<ScriptMeta>) => {
      const merged = { ...meta, ...next };
      patch({ sourceText: joinMeta(merged, body) });
    },
    [meta, body, patch],
  );

  /** 首次录入剧本后自动引导：在 script 线程未开始时追一条 assistant 指路消息。 */
  const maybeIntroAfterIngest = useCallback(
    (text: string) => {
      const proj = useLumenStore.getState().projects.find((p) => p.id === project?.id);
      const thread = proj?.threads.find((t) => t.tab === "script");
      const empty = !thread || thread.messages.filter((m) => m.role !== "system").length === 0;
      if (empty) {
        appendAssistantMessage(
          "script",
          `✅ 剧本已录入（共 ${text.length} 字）。\n\n` +
            "• 下一步建议：点击下方「\u{1F50D} 提取角色/场景/道具」，AI 会自动从剧本中抽取实体。\n" +
            "• 也可以先让我「✨ 润色」或「\u{1F4DD} 扩写」剧本。",
        );
      }
    },
    [appendAssistantMessage, project?.id],
  );

  /** 粘贴/上传后统一入口：写回 sourceText 之后补上引导消息。 */
  const ingestScript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      patch({ sourceText: trimmed });
      maybeIntroAfterIngest(trimmed);
    },
    [patch, maybeIntroAfterIngest],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/film/parse-file", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `解析失败：${res.status}`);
        const text = String(json.text || "").trim();
        if (!text) throw new Error("文件里没读到文本内容");
        ingestScript(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [patch],
  );

  const handlePickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void handleUpload(f);
  };

  /** 调用 AI 抽取角色/场景/道具，完成后写回当前项目。
   *  同时在右侧 ChatPanel 推一条「🔄 正在提取…」占位消息，完成/失败后原位重写，
   *  避免“点了后什么反馈都没有”。 */
  const runAutoAnalyze = useCallback(async () => {
    if (!sourceText.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);
    appendAssistantMessage("script", "🔄 正在提取角色/场景/道具…");
    try {
      const result = await extractEntities(sourceText);
      setEntities({
        title: result.title,
        characters: result.characters,
        scenes: result.scenes,
        props: result.props,
      });
      updateLastAssistantMessage(
        "script",
        `✅ 已提取 ${result.characters.length} 个角色、${result.scenes.length} 个场景、${result.props.length} 个道具。可在「角色」Tab 查看。`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      updateLastAssistantMessage("script", `⚠️ 提取失败：${msg}`);
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, setEntities, sourceText, appendAssistantMessage, updateLastAssistantMessage]);

  /** 把一段引用塞进右侧对话上下文 + 顺手发一条占位 user 消息，方便 ChatPanel 渲染时给 hint。 */
  const linkToChat = useCallback(
    (refType: "character" | "scene" | "shot" | "prop" | undefined, refId: string, refLabel: string, refContent: string) => {
      setChatContext({ tab: "script", refType, refId, refLabel, refContent });
    },
    [setChatContext],
  );

  const askAiToWrite = useCallback(() => {
    setChatContext({ tab: "script" });
    // 走统一的 requestAssistant 通道让 ChatPanel 自动发送 + 调 API，
    // 避免仅写用户消息却不触发 AI 回复。
    requestAssistant(
      "script",
      "请从零为我写一份完整的短剧剧本：反转密集、节奏紧凑、3 分钟可拍。直接输出可拍的剧本正文（含「[场次] 内/外.地点-时间」、“△ 动作”、“角色名：台词”、“VO/OS” 等标记）；并在末尾追一句「后续可调度」提示。",
    );
  }, [setChatContext, requestAssistant]);

  const askAiToInferMeta = useCallback(() => {
    setChatContext({
      tab: "script",
      refLabel: "剧本信息",
      refContent: body.slice(0, 800),
    });
    requestAssistant(
      "script",
      "根据当前剧本正文，生成「题材类型 / 目标受众 / 一句话简介」三栏。\n\n请在回复末尾附加结构化标记，格式如下：\n[META_RESULT]\n{\"genre\": \"题材类型\", \"audience\": \"目标受众\", \"logline\": \"一句话简介\"}\n[/META_RESULT]\n\n注意：[META_RESULT] 标记内的 JSON 必须在一行内，不要换行。",
    );
  }, [body, requestAssistant, setChatContext]);

  // ============================================================================
  // 渲染
  // ============================================================================

  if (!project) {
    return (
      <div className="lx-script lx-script--blank">
        <ScriptStyles />
        <div className="lx-script-empty">
          <p className="lx-script-empty__title">还没有打开任何项目</p>
          <p className="lx-script-empty__sub">请先在左侧创建或选中一个 LumenX 项目。</p>
        </div>
      </div>
    );
  }

  const isEmpty = !sourceText.trim();
  const hasAnyMeta = !!(meta.genre || meta.audience || meta.logline);
  const hasEntities = project.characters.length > 0 || project.scenes.length > 0 || project.props.length > 0;
  const showAnalyzeBanner = !isEmpty && !hasEntities && !analyzeDismissed;

  return (
    <div className="lx-script">
      <ScriptStyles />

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.docx,.pdf"
        hidden
        onChange={handlePickFile}
      />

      {error && <div className="lx-script-error">⚠ {error}</div>}

      {isEmpty ? (
        <EmptyState
          busy={busy}
          onPickFile={() => fileRef.current?.click()}
          onAskAi={askAiToWrite}
          onPaste={(text) => ingestScript(text)}
        />
      ) : (
        <>
          {showAnalyzeBanner && (
            <AnalyzeBanner
              charCount={sourceText.length}
              busy={analyzing}
              onAnalyze={runAutoAnalyze}
              onDismiss={() => setAnalyzeDismissed(true)}
            />
          )}

          {hasAnyMeta || showMetaForm ? (
            <ScriptInfoCard meta={meta} onChange={writeMeta} onAskAi={askAiToInferMeta} />
          ) : (
            <MetaSlimBar onAskAi={askAiToInferMeta} onManual={() => setShowMetaForm(true)} />
          )}

          <CharactersSection
            characters={project.characters}
            analyzing={analyzing}
            onAnalyze={runAutoAnalyze}
            onPick={(c) =>
              linkToChat("character", c.id, c.name, c.description || `角色「${c.name}」`)
            }
          />

          <ScriptBodySection
            scenes={scenes}
            rawBody={body}
            editing={editingBody}
            draft={draftRaw}
            selectedRefId={selectedRefId}
            onStartEdit={() => {
              setDraftRaw(body);
              setEditingBody(true);
            }}
            onCancelEdit={() => setEditingBody(false)}
            onSaveEdit={() => {
              patch({ sourceText: joinMeta(meta, draftRaw) });
              setEditingBody(false);
            }}
            onDraftChange={setDraftRaw}
            onUpload={() => fileRef.current?.click()}
            onLine={(content, idx) =>
              linkToChat(undefined, `body-${idx}`, `第 ${idx + 1} 行`, content)
            }
            onScene={(sc, idx) =>
              linkToChat(undefined, `scene-${idx}`, sc.mark || `场次 ${idx + 1}`,
                [sc.mark, ...sc.lines.map((l) => l.raw)].filter(Boolean).join("\n"))
            }
          />
        </>
      )}
    </div>
  );
}

// ============================================================================
// 子组件 —— 空状态
// ============================================================================

function EmptyState({
  busy,
  onPickFile,
  onAskAi,
  onPaste,
}: {
  busy: boolean;
  onPickFile: () => void;
  onAskAi: () => void;
  onPaste: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const charCount = draft.trim().length;
  return (
    <div className="lx-script-empty">
      <div className="lx-script-empty__crown">
        <span className="lx-script-empty__dot" />
        <span className="lx-script-empty__crown-label">SCRIPT · 01 · BLANK PAGE</span>
      </div>
      <h2 className="lx-script-empty__title">开始你的剧本</h2>
      <p className="lx-script-empty__sub">
        在下方粘贴剧本或小说原文，也可以点「上传文件」导入 .txt / .docx / .pdf。粘贴后 AI 会自动抽取角色、场景与道具。
      </p>

      <textarea
        className="lx-script-empty__paste"
        rows={12}
        value={draft}
        placeholder="在这里粘贴你的剧本或小说原文……&#10;&#10;提示：&#10;·  首行可选填「题材：古风权谋」，会自动识别为档案信息&#10;·  逆序口说、剧本、小说都可以，2-3 千字最佳"
        onChange={(e) => setDraft(e.target.value)}
      />

      <div className="lx-script-empty__row">
        <button
          className="lx-script-btn primary"
          disabled={!charCount || busy}
          onClick={() => onPaste(draft.trim())}
        >
          ↳ 录入并开始创作
        </button>
        <button className="lx-script-btn" disabled={busy} onClick={onPickFile}>
          ⇪ 上传文件
        </button>
        <button className="lx-script-btn ghost" disabled={busy} onClick={onAskAi}>
          ✦ 让 AI 从零起稿
        </button>
        <span className="lx-script-empty__count">{charCount} 字</span>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件 —— 粘贴后的 AI 分析提示条
// ============================================================================

function AnalyzeBanner({
  charCount,
  busy,
  onAnalyze,
  onDismiss,
}: {
  charCount: number;
  busy: boolean;
  onAnalyze: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="lx-script-analyze">
      <div className="lx-script-analyze__bar" aria-hidden />
      <div className="lx-script-analyze__body">
        <div className="lx-script-analyze__head">
          <span className="lx-script-analyze__pip" />
          <span className="lx-script-analyze__label">AUTO·ANALYZE</span>
        </div>
        <p className="lx-script-analyze__title">
          已导入 <b>{charCount.toLocaleString()}</b> 字。是否让 AI 抽取角色、场景和道具？
        </p>
        <p className="lx-script-analyze__hint">抽取后可在「角色 / 分镜 / 时间线」Tab 继续起点。</p>
      </div>
      <div className="lx-script-analyze__actions">
        <button className="lx-script-btn primary sm" disabled={busy} onClick={onAnalyze}>
          {busy ? "… 分析中" : "✦ 开始分析"}
        </button>
        <button className="lx-script-btn ghost sm" disabled={busy} onClick={onDismiss}>
          稍后
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// 子组件 —— 档案空态的扭接条（没填任何元信息时不出空表单）
// ============================================================================

function MetaSlimBar({
  onAskAi,
  onManual,
}: {
  onAskAi: () => void;
  onManual: () => void;
}) {
  return (
    <div className="lx-script-metaslim">
      <span className="lx-script-metaslim__mark">档</span>
      <div className="lx-script-metaslim__copy">
        <span className="lx-script-metaslim__label">剧本档案</span>
        <span className="lx-script-metaslim__hint">题材 / 受众 / 一句话简介 · 还没填，可交给 AI 推断</span>
      </div>
      <div className="lx-script-metaslim__actions">
        <button className="lx-script-btn ghost sm" onClick={onAskAi}>✦ AI 推断</button>
        <button className="lx-script-btn sm" onClick={onManual}>✎ 手动填写</button>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件 —— 剧本档案卡
// ============================================================================

function ScriptInfoCard({
  meta,
  onChange,
  onAskAi,
}: {
  meta: ScriptMeta;
  onChange: (next: Partial<ScriptMeta>) => void;
  onAskAi: () => void;
}) {
  return (
    <section className="lx-script-info">
      <header className="lx-script-info__head">
        <div className="lx-script-info__title">
          <span className="lx-script-info__mark">档</span>
          <span>剧本档案</span>
        </div>
        <button className="lx-script-btn ghost sm" onClick={onAskAi} title="让 AI 根据正文回填档案">
          ✦ AI 生成
        </button>
      </header>

      <div className="lx-script-info__grid">
        <InfoField
          label="题材类型"
          placeholder="例：古风权谋 / AI短剧分镜脚本"
          value={meta.genre}
          onCommit={(v) => onChange({ genre: v })}
        />
        <InfoField
          label="目标受众"
          placeholder="例：女频暧昧权谋 / 古风短视频用户"
          value={meta.audience}
          onCommit={(v) => onChange({ audience: v })}
        />
        <InfoField
          label="一句话简介"
          placeholder="例：雨夜西门府，一场以色为饵的试探……"
          value={meta.logline}
          onCommit={(v) => onChange({ logline: v })}
          wide
        />
      </div>
    </section>
  );
}

function InfoField({
  label,
  value,
  placeholder,
  onCommit,
  wide,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  wide?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };
  return (
    <div className={`lx-script-info__field${wide ? " is-wide" : ""}`}>
      <span className="lx-script-info__label">{label}</span>
      {editing ? (
        <input
          autoFocus
          className="lx-script-info__input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button className="lx-script-info__pill" onClick={startEdit} title="点击编辑">
          {value || <em>{placeholder || "点击填写"}</em>}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 子组件 —— 人物小传
// ============================================================================

function CharactersSection({
  characters,
  analyzing,
  onAnalyze,
  onPick,
}: {
  characters: LxCharacter[];
  analyzing: boolean;
  onAnalyze: () => void;
  onPick: (c: LxCharacter) => void;
}) {
  if (!characters.length) {
    // 空态收起为一行轻量提示，不再撑起一个大卡。
    return (
      <p className="lx-script-characters-slim">
        <span className="lx-script-characters-slim__dot" />
        <span className="lx-script-characters-slim__text">人物小传 · AI 分析后自动生成</span>
        <button
          type="button"
          className="lx-script-characters-slim__btn"
          disabled={analyzing}
          onClick={onAnalyze}
        >
          {analyzing ? "… 分析中" : "✦ 立即分析"}
        </button>
      </p>
    );
  }
  return (
    <section className="lx-script-characters">
      <SectionHead label="人物小传" hint={`${characters.length} 位`} />
      <ul className="lx-script-characters__list">
        {characters.map((c) => (
          <li
            key={c.id}
            className="lx-script-paragraph lx-script-characters__item"
            tabIndex={0}
            onClick={() => onPick(c)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(c);
              }
            }}
          >
            <header className="lx-script-characters__head">
              <span className="lx-script-characters__name">{c.name}</span>
              {c.gender && (
                <span className="lx-script-characters__tag">
                  {c.gender === "male" ? "男" : "女"}
                </span>
              )}
              {c.age && <span className="lx-script-characters__tag">{c.age}</span>}
              {c.voiceTone && (
                <span className="lx-script-characters__tag is-tone">{c.voiceTone}</span>
              )}
            </header>
            <p className="lx-script-characters__desc">
              {c.description || <em className="lx-script-characters__placeholder">（暂无小传，点击与 AI 共创）</em>}
            </p>
            <span className="lx-script-paragraph__hint">与 AI 对话 ↗</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================================
// 子组件 —— 剧本正文
// ============================================================================

function ScriptBodySection({
  scenes,
  rawBody,
  editing,
  draft,
  selectedRefId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDraftChange,
  onUpload,
  onLine,
  onScene,
}: {
  scenes: ParsedScene[];
  rawBody: string;
  editing: boolean;
  draft: string;
  selectedRefId?: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDraftChange: (v: string) => void;
  onUpload: () => void;
  onLine: (content: string, globalIdx: number) => void;
  onScene: (scene: ParsedScene, idx: number) => void;
}) {
  const totalLines = scenes.reduce((n, s) => n + s.lines.filter((l) => l.kind !== "blank").length, 0);

  return (
    <section className="lx-script-body">
      <SectionHead
        label="剧本正文"
        hint={`${scenes.length} 场 · ${totalLines} 行`}
        right={
          editing ? (
            <>
              <button className="lx-script-btn sm" onClick={onCancelEdit}>取消</button>
              <button className="lx-script-btn primary sm" onClick={onSaveEdit}>保存</button>
            </>
          ) : (
            <>
              <button className="lx-script-btn ghost sm" onClick={onUpload}>⇪ 重新上传</button>
              <button className="lx-script-btn sm" onClick={onStartEdit}>✎ 编辑</button>
            </>
          )
        }
      />

      {editing ? (
        <textarea
          className="lx-script-body__textarea"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="支持格式：[1-1] 西门府 雨夜 / △ 雨打青砖 / 角色名：台词 / VO 心声"
          rows={Math.max(20, Math.min(40, draft.split("\n").length + 2))}
        />
      ) : (
        <ol className="lx-script-body__scenes">
          {scenes.map((sc, sIdx) => {
            // 计算该场次内首行在全局正文里的偏移，方便 onLine 给一个稳定的 index。
            const offset = scenes.slice(0, sIdx).reduce((n, s) => n + s.lines.length + (s.mark ? 1 : 0), 0);
            const sceneSelected = selectedRefId === `scene-${sIdx}`;
            return (
              <li key={`${sIdx}-${sc.mark}`} className="lx-script-body__scene">
                {sc.mark && (
                  <button
                    type="button"
                    className={`lx-script-paragraph lx-script-scene-mark${sceneSelected ? " is-selected" : ""}`}
                    onClick={() => onScene(sc, sIdx)}
                    title="与 AI 讨论这一场"
                  >
                    {sc.mark}
                    <span className="lx-script-paragraph__hint">↗</span>
                  </button>
                )}
                <div className="lx-script-body__lines">
                  {sc.lines.map((ln, lIdx) => {
                    if (ln.kind === "blank") return <div key={lIdx} className="lx-script-body__gap" />;
                    const cls =
                      ln.kind === "action"
                        ? "lx-script-action"
                        : ln.kind === "vo"
                        ? "lx-script-vo"
                        : ln.kind === "speaker"
                        ? "lx-script-speaker"
                        : "lx-script-text";
                    const globalIdx = offset + lIdx;
                    const lineSelected = selectedRefId === `body-${globalIdx}`;
                    return (
                      <button
                        key={lIdx}
                        type="button"
                        className={`lx-script-paragraph ${cls}${lineSelected ? " is-selected" : ""}`}
                        onClick={() => onLine(ln.raw, globalIdx)}
                      >
                        {ln.kind === "speaker" ? (
                          <>
                            <span className="lx-script-speaker__name">{ln.speaker}</span>
                            <span className="lx-script-speaker__sep">：</span>
                            <span className="lx-script-speaker__text">{ln.content}</span>
                          </>
                        ) : (
                          ln.raw
                        )}
                        <span className="lx-script-paragraph__hint">↗</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
          {!scenes.length && (
            <li className="lx-script-body__scene">
              <p className="lx-script-body__placeholder">{rawBody || "（正文为空）"}</p>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

function SectionHead({
  label,
  hint,
  right,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="lx-script-section-head">
      <h3 className="lx-script-section-head__title">
        <span className="lx-script-section-head__rule" />
        {label}
        {hint && <span className="lx-script-section-head__hint">{hint}</span>}
      </h3>
      {right && <div className="lx-script-section-head__right">{right}</div>}
    </header>
  );
}

// ============================================================================
// 内联样式 —— 全部 lx-script-* 命名空间，托管在本组件内，避免污染全局样式表
// ============================================================================

function ScriptStyles() {
  return (
    <style jsx global>{`
      .lx-script {
        --lx-script-card: color-mix(in oklab, var(--ink-2) 92%, var(--accent) 4%);
        --lx-script-card-edge: color-mix(in oklab, var(--paper) 7%, transparent);
        --lx-script-card-edge-strong: color-mix(in oklab, var(--accent) 26%, var(--line));
        --lx-script-mute: var(--paper-mute);
        --lx-script-dim: var(--paper-dim);
        --lx-script-paper: var(--paper);
        --lx-script-accent: var(--accent);
        --lx-script-accent-2: var(--accent-2);
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 4px 2px 64px;
        color: var(--lx-script-paper);
        font-family: var(--font-sans);
      }

      /* ----- 错误条 ----- */
      .lx-script-error {
        padding: 10px 14px;
        border-radius: 10px;
        background: color-mix(in oklab, var(--accent-2) 18%, var(--ink-2));
        border: 1px solid color-mix(in oklab, var(--accent-2) 50%, var(--line));
        color: color-mix(in oklab, var(--paper) 90%, var(--accent-2));
        font-size: 13px;
      }

      /* ----- 通用按钮 ----- */
      .lx-script-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        font-family: var(--font-sans);
        background: var(--ink-3);
        color: var(--paper);
        border: 1px solid var(--line);
        border-radius: 10px;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, transform 160ms ease, color 160ms ease;
      }
      .lx-script-btn:hover:not(:disabled) {
        background: color-mix(in oklab, var(--paper) 8%, var(--ink-3));
        border-color: var(--edge-strong);
      }
      .lx-script-btn.primary {
        background: linear-gradient(160deg, var(--accent) 0%, var(--accent-2) 100%);
        color: var(--ink);
        border-color: transparent;
        font-weight: 600;
      }
      .lx-script-btn.primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px color-mix(in oklab, var(--accent) 38%, transparent);
      }
      .lx-script-btn.ghost {
        background: transparent;
        border-color: color-mix(in oklab, var(--accent) 28%, var(--line));
        color: color-mix(in oklab, var(--paper) 84%, var(--accent));
      }
      .lx-script-btn.ghost:hover:not(:disabled) {
        background: color-mix(in oklab, var(--accent) 10%, transparent);
      }
      .lx-script-btn.sm { padding: 5px 10px; font-size: 12px; }
      .lx-script-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      /* ----- 段落（可点击）----- */
      .lx-script-paragraph {
        position: relative;
        display: block;
        width: 100%;
        text-align: left;
        background: transparent;
        color: inherit;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 6px 12px 6px 14px;
        font: inherit;
        font-size: 14px;
        line-height: 1.85;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
      }
      .lx-script-paragraph:hover,
      .lx-script-paragraph:focus-visible {
        background: color-mix(in oklab, var(--accent) 10%, transparent);
        border-color: color-mix(in oklab, var(--accent) 32%, transparent);
        outline: none;
      }
      /* 已选为聊天上下文的段落：常驻底色 + 左侧金色装饰条 */
      .lx-script-paragraph.is-selected {
        background: color-mix(in oklab, var(--accent) 14%, transparent);
        border-color: color-mix(in oklab, var(--accent) 48%, transparent);
        box-shadow: inset 3px 0 0 var(--accent);
      }
      .lx-script-paragraph.is-selected .lx-script-paragraph__hint {
        opacity: 1;
        transform: translateX(0);
        color: var(--accent);
      }
      .lx-script-scene-mark.is-selected {
        background: color-mix(in oklab, var(--accent) 26%, var(--ink-3));
        border-color: color-mix(in oklab, var(--accent) 70%, var(--line));
        box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 35%, transparent);
      }
      .lx-script-paragraph__hint {
        position: absolute;
        top: 6px;
        right: 10px;
        font-size: 10px;
        letter-spacing: 0.08em;
        color: var(--accent);
        opacity: 0;
        transform: translateX(4px);
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: none;
        white-space: nowrap;
      }
      .lx-script-paragraph:hover .lx-script-paragraph__hint,
      .lx-script-paragraph:focus-visible .lx-script-paragraph__hint {
        opacity: 1;
        transform: translateX(0);
      }

      /* ----- 行级排版 ----- */
      .lx-script-action {
        font-style: italic;
        color: color-mix(in oklab, var(--paper-mute) 86%, var(--paper));
        font-family: var(--font-serif, var(--font-sans));
      }
      .lx-script-vo {
        font-weight: 600;
        color: color-mix(in oklab, var(--accent) 60%, var(--paper));
        letter-spacing: 0.02em;
      }
      .lx-script-text { color: var(--paper-dim); }
      .lx-script-speaker { color: var(--paper); }
      .lx-script-speaker__name {
        font-weight: 700;
        color: color-mix(in oklab, var(--accent) 50%, var(--paper));
        margin-right: 2px;
      }
      .lx-script-speaker__sep { color: var(--paper-mute); margin-right: 4px; }
      .lx-script-speaker__text { color: var(--paper); }

      /* ----- 场次标记 ----- */
      .lx-script-scene-mark {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0 6px;
        padding: 6px 14px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 12px;
        letter-spacing: 0.12em;
        color: color-mix(in oklab, var(--accent) 70%, var(--paper));
        background: color-mix(in oklab, var(--accent) 10%, var(--ink-3));
        border: 1px solid color-mix(in oklab, var(--accent) 32%, var(--line));
        border-radius: 999px;
        text-transform: uppercase;
        width: auto;
      }
      .lx-script-scene-mark:hover {
        background: color-mix(in oklab, var(--accent) 18%, var(--ink-3));
        border-color: color-mix(in oklab, var(--accent) 55%, var(--line));
      }

      /* ----- 段落标题 ----- */
      .lx-script-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .lx-script-section-head__title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--paper) 88%, var(--accent));
      }
      .lx-script-section-head__rule {
        width: 22px;
        height: 1px;
        background: linear-gradient(90deg, var(--accent), transparent);
      }
      .lx-script-section-head__hint {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
        font-weight: 400;
        color: var(--paper-mute);
        letter-spacing: 0.04em;
        text-transform: none;
      }
      .lx-script-section-head__right { display: flex; gap: 8px; }

      /* ============ 剧本档案卡 ============ */
      .lx-script-info {
        background: var(--lx-script-card);
        border: 1px solid var(--lx-script-card-edge);
        border-radius: 16px;
        padding: 18px 20px;
        position: relative;
        overflow: hidden;
      }
      .lx-script-info::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(620px 120px at 0% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%),
          radial-gradient(420px 80px at 100% 100%, color-mix(in oklab, var(--accent-2) 10%, transparent), transparent 70%);
        pointer-events: none;
      }
      .lx-script-info > * { position: relative; }
      .lx-script-info__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .lx-script-info__title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--paper) 90%, var(--accent));
      }
      .lx-script-info__mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        background: linear-gradient(160deg, var(--accent), var(--accent-2));
        color: var(--ink);
        font-family: var(--font-serif, var(--font-sans));
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .lx-script-info__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 16px;
      }
      .lx-script-info__field { display: flex; flex-direction: column; gap: 6px; }
      .lx-script-info__field.is-wide { grid-column: 1 / -1; }
      .lx-script-info__label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--paper-mute);
      }
      .lx-script-info__pill {
        text-align: left;
        padding: 10px 14px;
        background: color-mix(in oklab, var(--ink) 70%, var(--ink-2));
        border: 1px solid var(--line);
        border-radius: 10px;
        color: var(--paper);
        font-size: 14px;
        cursor: text;
        transition: border-color 160ms ease, background 160ms ease;
      }
      .lx-script-info__pill:hover {
        border-color: color-mix(in oklab, var(--accent) 35%, var(--line));
        background: color-mix(in oklab, var(--accent) 6%, var(--ink-2));
      }
      .lx-script-info__pill em {
        color: var(--paper-mute);
        font-style: italic;
      }
      .lx-script-info__input {
        padding: 10px 14px;
        background: var(--ink);
        border: 1px solid color-mix(in oklab, var(--accent) 40%, var(--line));
        border-radius: 10px;
        color: var(--paper);
        font: inherit;
        font-size: 14px;
        outline: none;
      }
      .lx-script-info__input:focus { border-color: var(--accent); }

      /* ============ 人物小传 ============ */
      .lx-script-characters {
        background: var(--lx-script-card);
        border: 1px solid var(--lx-script-card-edge);
        border-radius: 16px;
        padding: 18px 20px;
      }
      .lx-script-characters__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 10px;
      }
      .lx-script-characters__item {
        padding: 12px 14px;
        background: color-mix(in oklab, var(--ink) 72%, var(--ink-2));
        border: 1px solid var(--line);
        border-radius: 12px;
        line-height: 1.65;
      }
      .lx-script-characters__head {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 6px;
      }
      .lx-script-characters__name {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: color-mix(in oklab, var(--accent) 28%, var(--paper));
      }
      .lx-script-characters__tag {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--paper) 6%, transparent);
        border: 1px solid var(--line);
        color: var(--paper-mute);
      }
      .lx-script-characters__tag.is-tone {
        color: color-mix(in oklab, var(--accent) 60%, var(--paper));
        border-color: color-mix(in oklab, var(--accent) 32%, var(--line));
        background: color-mix(in oklab, var(--accent) 8%, transparent);
      }
      .lx-script-characters__desc {
        margin: 0;
        font-size: 13px;
        color: var(--paper-dim);
        line-height: 1.75;
      }
      .lx-script-characters__placeholder {
        color: var(--paper-mute);
        font-style: italic;
      }
      .lx-script-characters__empty {
        margin: 0;
        font-size: 13px;
        color: var(--paper-mute);
      }

      /* ============ 剧本正文 ============ */
      .lx-script-body {
        background: var(--lx-script-card);
        border: 1px solid var(--lx-script-card-edge);
        border-radius: 16px;
        padding: 18px 20px 22px;
      }
      .lx-script-body__textarea {
        width: 100%;
        min-height: 360px;
        background: var(--ink);
        border: 1px solid color-mix(in oklab, var(--accent) 28%, var(--line));
        border-radius: 12px;
        padding: 16px;
        color: var(--paper);
        font-family: var(--font-mono, ui-monospace, "SF Mono", monospace);
        font-size: 13px;
        line-height: 1.75;
        resize: vertical;
        outline: none;
      }
      .lx-script-body__textarea:focus { border-color: var(--accent); }
      .lx-script-body__scenes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .lx-script-body__scene {
        display: flex;
        flex-direction: column;
      }
      .lx-script-body__lines {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding-left: 4px;
        border-left: 1px dashed color-mix(in oklab, var(--accent) 18%, var(--line));
        margin-left: 8px;
        margin-top: 4px;
      }
      .lx-script-body__gap { height: 8px; }
      .lx-script-body__placeholder {
        margin: 0;
        white-space: pre-wrap;
        color: var(--paper-mute);
        font-style: italic;
      }

      /* ============ 空状态 ============ */
      .lx-script-empty {
        position: relative;
        background: linear-gradient(180deg, var(--ink-2) 0%, var(--ink) 100%);
        border: 1px solid color-mix(in oklab, var(--accent) 14%, var(--line));
        border-radius: 18px;
        padding: 36px 32px 30px;
        overflow: hidden;
      }
      .lx-script-empty::before {
        content: "";
        position: absolute;
        inset: -40% 50% auto auto;
        width: 60%;
        height: 200%;
        background: radial-gradient(closest-side, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%);
        pointer-events: none;
      }
      .lx-script-empty > * { position: relative; }
      .lx-script-empty__crown {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
        letter-spacing: 0.22em;
        color: color-mix(in oklab, var(--accent) 70%, var(--paper));
        margin-bottom: 14px;
      }
      .lx-script-empty__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 80%, transparent);
      }
      .lx-script-empty__title {
        margin: 0 0 6px;
        font-family: var(--font-serif, var(--font-sans));
        font-size: 28px;
        font-weight: 600;
        letter-spacing: -0.005em;
        color: var(--paper);
      }
      .lx-script-empty__sub {
        margin: 0 0 18px;
        font-size: 14px;
        color: var(--paper-dim);
        max-width: 56ch;
        line-height: 1.7;
      }
      .lx-script-empty__paste {
        width: 100%;
        background: color-mix(in oklab, var(--ink) 75%, var(--ink-2));
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 14px 16px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 13px;
        line-height: 1.7;
        color: var(--paper);
        resize: vertical;
        outline: none;
        transition: border-color 160ms ease;
      }
      .lx-script-empty__paste:focus {
        border-color: color-mix(in oklab, var(--accent) 60%, var(--line));
      }
      .lx-script-empty__row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      /* ============ 分析提示条 ============ */
      .lx-script-analyze {
        position: relative;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px 14px 22px;
        background:
          linear-gradient(90deg, color-mix(in oklab, var(--accent) 12%, transparent), transparent 40%),
          color-mix(in oklab, var(--ink-2) 88%, var(--accent) 6%);
        border: 1px solid color-mix(in oklab, var(--accent) 38%, var(--line));
        border-radius: 14px;
        overflow: hidden;
      }
      .lx-script-analyze__bar {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 3px;
        background: linear-gradient(180deg, var(--accent), var(--accent-2));
      }
      .lx-script-analyze__body { flex: 1; min-width: 0; }
      .lx-script-analyze__head {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .lx-script-analyze__pip {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 10px color-mix(in oklab, var(--accent) 80%, transparent);
        animation: lx-script-pulse 1.6s ease-in-out infinite;
      }
      @keyframes lx-script-pulse {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }
      .lx-script-analyze__label {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10.5px;
        letter-spacing: 0.2em;
        color: color-mix(in oklab, var(--accent) 70%, var(--paper));
      }
      .lx-script-analyze__title {
        margin: 0;
        font-size: 14px;
        color: var(--paper);
      }
      .lx-script-analyze__title b {
        color: color-mix(in oklab, var(--accent) 50%, var(--paper));
        font-weight: 700;
      }
      .lx-script-analyze__hint {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--paper-mute);
      }
      .lx-script-analyze__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      
      /* ============ 档案扭接条 ============ */
      .lx-script-metaslim {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        background: color-mix(in oklab, var(--ink-2) 92%, var(--accent) 4%);
        border: 1px dashed color-mix(in oklab, var(--accent) 24%, var(--line));
        border-radius: 14px;
      }
      .lx-script-metaslim__mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        background: linear-gradient(160deg, var(--accent), var(--accent-2));
        color: var(--ink);
        font-family: var(--font-serif, var(--font-sans));
        font-size: 13px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .lx-script-metaslim__copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .lx-script-metaslim__label {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--paper);
      }
      .lx-script-metaslim__hint {
        font-size: 12px;
        color: var(--paper-mute);
      }
      .lx-script-metaslim__actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      
      /* ============ 人物小传·轻量提示 ============ */
      .lx-script-characters-slim {
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        background: transparent;
        border: 1px dashed color-mix(in oklab, var(--paper) 12%, var(--line));
        border-radius: 999px;
        align-self: flex-start;
        font-size: 12.5px;
        color: var(--paper-mute);
      }
      .lx-script-characters-slim__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: color-mix(in oklab, var(--accent) 60%, var(--paper-mute));
      }
      .lx-script-characters-slim__text {
        letter-spacing: 0.04em;
      }
      .lx-script-characters-slim__btn {
        background: transparent;
        border: none;
        color: color-mix(in oklab, var(--accent) 70%, var(--paper));
        font: inherit;
        font-size: 12.5px;
        cursor: pointer;
        padding: 0;
        letter-spacing: 0.04em;
      }
      .lx-script-characters-slim__btn:hover:not(:disabled) {
        color: var(--accent);
        text-decoration: underline;
      }
      .lx-script-characters-slim__btn:disabled {
        opacity: 0.5;
        cursor: progress;
      }
      
      .lx-script-empty__count {
        margin-left: auto;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
        letter-spacing: 0.08em;
        color: var(--paper-mute);
        align-self: center;
      }
      
      /* ============ 兜底响应式 ============ */
      @media (max-width: 720px) {
        .lx-script-info__grid { grid-template-columns: 1fr; }
        .lx-script-empty { padding: 26px 20px; }
        .lx-script-empty__title { font-size: 22px; }
      }
    `}</style>
  );
}
