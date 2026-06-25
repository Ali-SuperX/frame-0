/**
 * LumenX —— 角色 Tab（4-Tab 架构第二步）。
 *
 * 三段式：角色 / 场景 / 道具。每段都是「紧凑卡片网格」+「+ 添加」。
 * 卡片设计：
 *  - 头像 / 缩略图严格控制在 72px (角色圆形) / 16:9 缩略图 (场景) / 64px (道具) 之内；
 *  - 点击卡片 → 联动右侧对话 setChatContext（命中即高亮 selected）；
 *  - 卡片底部一排 icon-only 操作（上传 / 重做 / 删除 / 选音色）。
 */

"use client";

import { useRef, useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { useCurrentProject, useLumenStore } from "@/lib/lumenx/store";
import type { LxCharacter, LxScene, LxProp, LxVariant } from "@/lib/lumenx/types";
import { genImage, uploadMedia } from "@/lib/lumenx/gen";
import { extractEntities } from "@/lib/lumenx/pipeline";
import { assetImagePrompt } from "@/lib/lumenx/prompts";
import { TTS_VOICES } from "@/lib/r2v/ttsVoices";
import { getStyleById } from "@/lib/lumenx/presets";
import { IconPlus, IconUpload, IconRefresh, IconPlay, IconSparkles } from "../icons";

// ──────────────────────────────────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────────────────────────────────

export default function CharacterTab() {
  const project = useCurrentProject();
  const setEntities = useLumenStore((s) => s.setEntities);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // 初始加载骨架屏：短暂显示 300ms 后切换
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(t);
  }, []);

  if (!project) {
    return (
      <div className="lx-character-tab">
        <div className="lx-tab-empty">未选中项目。</div>
      </div>
    );
  }

  // 骨架屏状态
  if (showSkeleton) {
    return (
      <div className="lx-character-tab">
        <div className="lx-skeleton-grid">
          <div className="lx-skeleton lx-skeleton-card" />
          <div className="lx-skeleton lx-skeleton-card" />
          <div className="lx-skeleton lx-skeleton-card" />
          <div className="lx-skeleton lx-skeleton-card" />
        </div>
        <div className="lx-skeleton-rows">
          <div className="lx-skeleton lx-skeleton-row" />
          <div className="lx-skeleton lx-skeleton-row" />
          <div className="lx-skeleton lx-skeleton-row" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  const allEmpty =
    project.characters.length === 0 &&
    project.scenes.length === 0 &&
    project.props.length === 0;
  const hasSourceText = !!project.sourceText.trim();

  const handleExtract = async () => {
    if (!hasSourceText || extracting) return;
    setExtractError(null);
    setExtracting(true);
    try {
      const result = await extractEntities(project.sourceText);
      setEntities(result);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "提取失败");
    } finally {
      setExtracting(false);
    }
  };

  if (allEmpty && !manualMode) {
    return (
      <div className="lx-character-tab">
        <div className="lx-empty-guide">
          <div className="lx-empty-guide-icons" aria-hidden>
            <span>👤</span>
            <span>🏔️</span>
            <span>🎭</span>
          </div>
          <h3 className="lx-empty-guide-title">角色 · 场景 · 道具</h3>
          <p className="lx-empty-guide-desc">
            AI 可以从剧本中自动提取所有角色、场景和道具，并为它们生成形象图。
          </p>
          <button
            type="button"
            className="lx-empty-guide-btn"
            disabled={!hasSourceText || extracting}
            onClick={handleExtract}
          >
            {extracting ? (
              <>
                <span className="lx-empty-guide-spinner" aria-hidden />
                AI 正在分析…
              </>
            ) : hasSourceText ? (
              <>
                <IconSparkles size={16} />
                从剧本中提取
              </>
            ) : (
              "请先在「剧本」页粘贴内容"
            )}
          </button>
          {extractError && <div className="lx-empty-guide-err">{extractError}</div>}
          <button
            type="button"
            className="lx-empty-guide-link"
            onClick={() => setManualMode(true)}
          >
            或者手动添加 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lx-character-tab">
      <CharacterSection />
      <SceneSection />
      <PropSection />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 角色区
// ──────────────────────────────────────────────────────────────────────────

function CharacterSection() {
  const project = useCurrentProject()!;
  const addCharacter = useLumenStore((s) => s.addCharacter);
  const updateCharacter = useLumenStore((s) => s.updateCharacter);
  const removeCharacter = useLumenStore((s) => s.removeCharacter);
  const [adding, setAdding] = useState(false);

  const handleAdd = (name: string, description: string) => {
    addCharacter();
    const latest = useLumenStore
      .getState()
      .projects.find((p) => p.id === project.id)
      ?.characters.at(-1);
    if (latest) updateCharacter(latest.id, { name, description });
    setAdding(false);
  };

  return (
    <section className="lx-char-section">
      <SectionHead
        title="角色"
        count={project.characters.length}
        onAdd={() => setAdding(true)}
      />
      {adding && (
        <AddForm
          placeholderName="主角名"
          placeholderDesc="外貌、年龄、气质、服装等永久性特征"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}
      <div className="lx-card-grid char">
        {project.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
            onUpdate={(patch) => updateCharacter(c.id, patch)}
            onRemove={() => removeCharacter(c.id)}
          />
        ))}
        <EmptyAddCard
          label="添加角色"
          onClick={() => setAdding(true)}
          compact={project.characters.length > 0}
        />
      </div>
    </section>
  );
}

function CharacterCard({
  character,
  onUpdate,
  onRemove,
}: {
  character: LxCharacter;
  onUpdate: (patch: Partial<LxCharacter>) => void;
  onRemove: () => void;
}) {
  const project = useCurrentProject()!;
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const chatContext = useLumenStore((s) => s.chatContext);
  const openLightbox = useLumenStore((s) => s.openLightbox);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickingVoice, setPickingVoice] = useState(false);

  const isReady = !!character.imageUrl;
  const isSelected =
    chatContext?.refType === "character" && chatContext.refId === character.id;
  const voice = TTS_VOICES.find((v) => v.id === character.voiceId);
  const initial = (character.name || "?").trim().slice(0, 1).toUpperCase();

  const focusChat = () =>
    setChatContext({
      tab: "character",
      refType: "character",
      refId: character.id,
      refLabel: character.name,
      refContent: character.description,
    });

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const { ossUrl } = await uploadMedia(file);
      onUpdate({
        imageUrl: ossUrl,
        variants: [...character.variants, { url: ossUrl, createdAt: Date.now() }].slice(-10),
        status: "done",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setErr(null);
    setBusy(true);
    onUpdate({ status: "running" });
    try {
      const style = getStyleById(
        project.selectedStyleId,
        project.aiStyles,
        project.customStyles,
      );
      const prompt = assetImagePrompt(
        "character",
        character.name,
        character.description,
        style?.positivePrompt,
      );
      const { jobId, imageUrl, meta } = await genImage({
        prompt,
        aspect: "9:16",
        negativePrompt: style?.negativePrompt,
        title: `character·${character.name}`,
        category: "character",
        tags: [character.name],
      });
      const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
      onUpdate({
        imageUrl,
        imageJobId: jobId,
        variants: [...character.variants, variant].slice(-10),
        status: "done",
        imageGen: meta,
      });
    } catch (e) {
      onUpdate({ status: "error" });
      setErr(e instanceof Error ? e.message : "出图失败");
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className={`lx-char-card${isReady ? " ready" : ""}${isSelected ? " selected" : ""}`}
      onClick={focusChat}
      role="button"
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent("lx-context-menu", {
            detail: {
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: "✨ AI 生成形象", action: () => handleRegenerate() },
                { label: "📷 上传参考图", action: () => fileRef.current?.click() },
                { label: "🎤 选择音色", action: () => setPickingVoice(true) },
                { label: "---", action: () => {} },
                { label: "🗑 删除角色", action: () => onRemove(), danger: true },
              ],
            },
          }),
        );
      }}
    >
      <span className={`lx-card-dot${isReady ? " on" : ""}`} title={isReady ? "已生成" : "未生成"} />

      <div
        className="lx-char-thumb"
        onClick={(e) => {
          if (!character.imageUrl) return;
          e.stopPropagation();
          openLightbox({
            url: character.imageUrl,
            mediaType: "image",
            target: { type: "character", id: character.id, media: "image" },
            title: character.name,
          });
        }}
        role={character.imageUrl ? "button" : undefined}
        title={character.imageUrl ? "点击放大查看" : undefined}
      >
        {character.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.imageUrl} alt={character.name} />
        ) : (
          <span className="lx-char-thumb-fallback">{initial}</span>
        )}
        {busy && <div className="lx-card-busy">…</div>}
      </div>

      <div className="lx-card-info">
        <div className="lx-card-name">{character.name || "未命名"}</div>
        <div className="lx-card-desc">{character.description || "（暂无描述）"}</div>
        {character.visualWeight >= 5 && <span className="lx-card-pill">主角</span>}
        {character.visualWeight === 3 && <span className="lx-card-pill alt">配角</span>}
        {character.visualWeight > 0 && character.visualWeight <= 1 && (
          <span className="lx-card-pill mute">群演</span>
        )}
      </div>

      {pickingVoice ? (
        <select
          className="lx-card-voice-select"
          defaultValue={character.voiceId ?? ""}
          autoFocus
          onClick={stop}
          onBlur={() => setPickingVoice(false)}
          onChange={(e) => {
            onUpdate({ voiceId: e.target.value || undefined });
            setPickingVoice(false);
          }}
        >
          <option value="">未选择语音</option>
          {TTS_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.zh} · {v.desc}
            </option>
          ))}
        </select>
      ) : voice ? (
        <button
          type="button"
          className="lx-card-voice-mini"
          onClick={(e) => {
            stop(e);
            if (character.customVoiceUrl) audioRef.current?.play().catch(() => {});
            else setPickingVoice(true);
          }}
          title={character.customVoiceUrl ? "试听" : "切换音色"}
        >
          <IconPlay size={10} />
          <span className="vlbl">{voice.zh}</span>
        </button>
      ) : null}

      {character.customVoiceUrl && (
        <audio ref={audioRef} src={character.customVoiceUrl} preload="none" />
      )}

      {err && <div className="lx-card-err">{err}</div>}

      <div className="lx-card-bar" onClick={stop}>
        <button
          type="button"
          className="lx-card-iconbtn"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="上传参考图"
        >
          <IconUpload size={12} />
        </button>
        <button
          type="button"
          className="lx-card-iconbtn primary"
          onClick={handleRegenerate}
          disabled={busy}
          title={character.imageUrl ? "重做形象" : "生成形象"}
        >
          {character.imageUrl ? <IconRefresh size={12} /> : <IconSparkles size={12} />}
        </button>
        <button
          type="button"
          className="lx-card-iconbtn"
          onClick={() => setPickingVoice((v) => !v)}
          title="选择音色"
          disabled={busy}
        >
          <IconPlay size={12} />
        </button>
        <button
          type="button"
          className="lx-card-iconbtn danger"
          onClick={onRemove}
          disabled={busy}
          title="移除角色"
        >
          ×
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleUpload}
        />
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 场景区
// ──────────────────────────────────────────────────────────────────────────

function SceneSection() {
  const project = useCurrentProject()!;
  const addScene = useLumenStore((s) => s.addScene);
  const updateScene = useLumenStore((s) => s.updateScene);
  const removeScene = useLumenStore((s) => s.removeScene);
  const [adding, setAdding] = useState(false);

  const handleAdd = (name: string, description: string) => {
    addScene();
    const latest = useLumenStore
      .getState()
      .projects.find((p) => p.id === project.id)
      ?.scenes.at(-1);
    if (latest) updateScene(latest.id, { name, description });
    setAdding(false);
  };

  return (
    <section className="lx-scene-section">
      <SectionHead title="场景" count={project.scenes.length} onAdd={() => setAdding(true)} />
      {adding && (
        <AddForm
          placeholderName="场景名"
          placeholderDesc="时间、氛围、地点、关键陈设"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}
      <div className="lx-card-grid scene">
        {project.scenes.map((s) => (
          <SceneCard
            key={s.id}
            scene={s}
            onUpdate={(patch) => updateScene(s.id, patch)}
            onRemove={() => removeScene(s.id)}
          />
        ))}
        <EmptyAddCard
          label="添加场景"
          onClick={() => setAdding(true)}
          compact={project.scenes.length > 0}
        />
      </div>
    </section>
  );
}

function SceneCard({
  scene,
  onUpdate,
  onRemove,
}: {
  scene: LxScene;
  onUpdate: (patch: Partial<LxScene>) => void;
  onRemove: () => void;
}) {
  const project = useCurrentProject()!;
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const chatContext = useLumenStore((s) => s.chatContext);
  const openLightbox = useLumenStore((s) => s.openLightbox);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isReady = !!scene.imageUrl;
  const isSelected =
    chatContext?.refType === "scene" && chatContext.refId === scene.id;

  const focusChat = () =>
    setChatContext({
      tab: "character",
      refType: "scene",
      refId: scene.id,
      refLabel: scene.name,
      refContent: scene.description,
    });

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const { ossUrl } = await uploadMedia(file);
      onUpdate({
        imageUrl: ossUrl,
        variants: [...scene.variants, { url: ossUrl, createdAt: Date.now() }].slice(-10),
        status: "done",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setErr(null);
    setBusy(true);
    onUpdate({ status: "running" });
    try {
      const style = getStyleById(
        project.selectedStyleId,
        project.aiStyles,
        project.customStyles,
      );
      const prompt = assetImagePrompt(
        "scene",
        scene.name,
        scene.description,
        style?.positivePrompt,
      );
      const { jobId, imageUrl, meta } = await genImage({
        prompt,
        aspect: project.aspect,
        negativePrompt: style?.negativePrompt,
        title: `scene·${scene.name}`,
        category: "scene",
        tags: [scene.name],
      });
      const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
      onUpdate({
        imageUrl,
        imageJobId: jobId,
        variants: [...scene.variants, variant].slice(-10),
        status: "done",
        imageGen: meta,
      });
    } catch (e) {
      onUpdate({ status: "error" });
      setErr(e instanceof Error ? e.message : "出图失败");
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className={`lx-scene-card${isReady ? " ready" : ""}${isSelected ? " selected" : ""}`}
      onClick={focusChat}
      role="button"
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent("lx-context-menu", {
            detail: {
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: "✨ AI 生成场景", action: () => handleRegenerate() },
                { label: "📷 上传参考图", action: () => fileRef.current?.click() },
                { label: "---", action: () => {} },
                { label: "🗑 删除场景", action: () => onRemove(), danger: true },
              ],
            },
          }),
        );
      }}
    >
      <span className={`lx-card-dot${isReady ? " on" : ""}`} />

      <div
        className="lx-scene-thumb"
        onClick={(e) => {
          if (!scene.imageUrl) return;
          e.stopPropagation();
          openLightbox({
            url: scene.imageUrl,
            mediaType: "image",
            target: { type: "scene", id: scene.id, media: "image" },
            title: scene.name,
          });
        }}
        role={scene.imageUrl ? "button" : undefined}
        title={scene.imageUrl ? "点击放大查看" : undefined}
      >
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.imageUrl} alt={scene.name} />
        ) : (
          <SceneGlyph />
        )}
        {busy && <div className="lx-card-busy">…</div>}
      </div>

      <div className="lx-card-info">
        <div className="lx-card-name">{scene.name || "未命名"}</div>
        <div className="lx-card-desc">{scene.description || "（暂无描述）"}</div>
      </div>

      {err && <div className="lx-card-err">{err}</div>}

      <div className="lx-card-bar" onClick={stop}>
        <button
          type="button"
          className="lx-card-iconbtn"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="上传参考图"
        >
          <IconUpload size={12} />
        </button>
        <button
          type="button"
          className="lx-card-iconbtn primary"
          onClick={handleRegenerate}
          disabled={busy}
          title={scene.imageUrl ? "重做" : "生成"}
        >
          {scene.imageUrl ? <IconRefresh size={12} /> : <IconSparkles size={12} />}
        </button>
        <button
          type="button"
          className="lx-card-iconbtn danger"
          onClick={onRemove}
          disabled={busy}
          title="移除场景"
        >
          ×
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleUpload}
        />
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 道具区
// ──────────────────────────────────────────────────────────────────────────

function PropSection() {
  const project = useCurrentProject()!;
  const addProp = useLumenStore((s) => s.addProp);
  const updateProp = useLumenStore((s) => s.updateProp);
  const removeProp = useLumenStore((s) => s.removeProp);
  const [adding, setAdding] = useState(false);

  const handleAdd = (name: string, description: string) => {
    addProp();
    const latest = useLumenStore
      .getState()
      .projects.find((p) => p.id === project.id)
      ?.props.at(-1);
    if (latest) updateProp(latest.id, { name, description });
    setAdding(false);
  };

  return (
    <section className="lx-prop-section">
      <SectionHead title="道具" count={project.props.length} onAdd={() => setAdding(true)} />
      {adding && (
        <AddForm
          placeholderName="道具名"
          placeholderDesc="材质、颜色、年代、关键细节"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}
      <div className="lx-card-grid prop">
        {project.props.map((p) => (
          <PropCard
            key={p.id}
            prop={p}
            onUpdate={(patch) => updateProp(p.id, patch)}
            onRemove={() => removeProp(p.id)}
          />
        ))}
        <EmptyAddCard
          label="添加道具"
          onClick={() => setAdding(true)}
          compact={project.props.length > 0}
        />
      </div>
    </section>
  );
}

function PropCard({
  prop,
  onUpdate,
  onRemove,
}: {
  prop: LxProp;
  onUpdate: (patch: Partial<LxProp>) => void;
  onRemove: () => void;
}) {
  const project = useCurrentProject()!;
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const chatContext = useLumenStore((s) => s.chatContext);
  const openLightbox = useLumenStore((s) => s.openLightbox);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isReady = !!prop.imageUrl;
  const isSelected =
    chatContext?.refType === "prop" && chatContext.refId === prop.id;

  const focusChat = () =>
    setChatContext({
      tab: "character",
      refType: "prop",
      refId: prop.id,
      refLabel: prop.name,
      refContent: prop.description,
    });

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const { ossUrl } = await uploadMedia(file);
      onUpdate({
        imageUrl: ossUrl,
        variants: [...prop.variants, { url: ossUrl, createdAt: Date.now() }].slice(-10),
        status: "done",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setErr(null);
    setBusy(true);
    onUpdate({ status: "running" });
    try {
      const style = getStyleById(
        project.selectedStyleId,
        project.aiStyles,
        project.customStyles,
      );
      const prompt = assetImagePrompt(
        "prop",
        prop.name,
        prop.description,
        style?.positivePrompt,
      );
      const { jobId, imageUrl, meta } = await genImage({
        prompt,
        aspect: "1:1",
        negativePrompt: style?.negativePrompt,
        title: `prop·${prop.name}`,
        category: "prop",
        tags: [prop.name],
      });
      const variant: LxVariant = { url: imageUrl, jobId, prompt, createdAt: Date.now() };
      onUpdate({
        imageUrl,
        imageJobId: jobId,
        variants: [...prop.variants, variant].slice(-10),
        status: "done",
        imageGen: meta,
      });
    } catch (e) {
      onUpdate({ status: "error" });
      setErr(e instanceof Error ? e.message : "出图失败");
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <article
      className={`lx-prop-card${isReady ? " ready" : ""}${isSelected ? " selected" : ""}`}
      onClick={focusChat}
      role="button"
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent("lx-context-menu", {
            detail: {
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: "✨ AI 生成图片", action: () => handleRegenerate() },
                { label: "📷 上传参考图", action: () => fileRef.current?.click() },
                { label: "---", action: () => {} },
                { label: "🗑 删除道具", action: () => onRemove(), danger: true },
              ],
            },
          }),
        );
      }}
    >
      <span className={`lx-card-dot${isReady ? " on" : ""}`} />

      <div
        className="lx-prop-thumb"
        onClick={(e) => {
          if (!prop.imageUrl) return;
          e.stopPropagation();
          openLightbox({
            url: prop.imageUrl,
            mediaType: "image",
            target: { type: "prop", id: prop.id, media: "image" },
            title: prop.name,
          });
        }}
        role={prop.imageUrl ? "button" : undefined}
        title={prop.imageUrl ? "点击放大查看" : undefined}
      >
        {prop.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={prop.imageUrl} alt={prop.name} />
        ) : (
          <PropGlyph />
        )}
        {busy && <div className="lx-card-busy">…</div>}
      </div>

      <div className="lx-card-info">
        <div className="lx-card-name">{prop.name || "未命名"}</div>
        {prop.description && (
          <div className="lx-card-desc one-line">{prop.description}</div>
        )}
      </div>

      {err && <div className="lx-card-err">{err}</div>}

      <div className="lx-card-bar" onClick={stop}>
        <button
          type="button"
          className="lx-card-iconbtn"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="上传"
        >
          <IconUpload size={12} />
        </button>
        <button
          type="button"
          className="lx-card-iconbtn primary"
          onClick={handleRegenerate}
          disabled={busy}
          title={prop.imageUrl ? "重做" : "生成"}
        >
          {prop.imageUrl ? <IconRefresh size={12} /> : <IconSparkles size={12} />}
        </button>
        <button
          type="button"
          className="lx-card-iconbtn danger"
          onClick={onRemove}
          disabled={busy}
          title="移除"
        >
          ×
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleUpload}
        />
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 共用：区段头 / 添加表单 / 空提示 / 占位图形
// ──────────────────────────────────────────────────────────────────────────

function SectionHead({
  title,
  count,
  onAdd,
}: {
  title: string;
  count: number;
  onAdd: () => void;
}) {
  return (
    <header className="lx-section-head">
      <h3 className="lx-section-title">
        {title}
        <span className="lx-section-count">{count}</span>
      </h3>
      <button type="button" className="lx-btn sm" onClick={onAdd}>
        <IconPlus size={13} />
        添加
      </button>
    </header>
  );
}

function AddForm({
  placeholderName,
  placeholderDesc,
  onSubmit,
  onCancel,
}: {
  placeholderName: string;
  placeholderDesc: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), desc.trim());
  };
  return (
    <div className="lx-add-form">
      <input
        className="lx-input"
        autoFocus
        placeholder={placeholderName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <textarea
        className="lx-textarea"
        rows={2}
        placeholder={placeholderDesc}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="lx-add-foot">
        <button type="button" className="lx-btn primary sm" onClick={submit} disabled={!name.trim()}>
          提交
        </button>
        <button type="button" className="lx-btn ghost sm" onClick={onCancel}>
          取消
        </button>
        <span className="lx-add-hint">⌘/Ctrl + Enter 提交 · Esc 取消</span>
      </div>
    </div>
  );
}

function EmptyAddCard({
  label,
  onClick,
  compact,
}: {
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`lx-empty-card${compact ? " compact" : ""}`}
      onClick={onClick}
    >
      <span className="lx-empty-card-plus">
        <IconPlus size={18} />
      </span>
      <span className="lx-empty-card-label">{label}</span>
    </button>
  );
}

// ── 占位 SVG（仅在缩略图内显示，尺寸由父容器约束） ──

function SceneGlyph() {
  return (
    <svg viewBox="0 0 64 36" className="lx-glyph wide">
      <rect x="2" y="2" width="60" height="32" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 26l16-12 12 8 12-10 20 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="48" cy="10" r="3" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function PropGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="lx-glyph">
      <rect x="10" y="14" width="28" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 14v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
