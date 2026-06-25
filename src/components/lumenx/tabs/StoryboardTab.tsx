/**
 * LumenX —— 分镜 Tab（4-Tab 架构第三步）。
 *
 * 表格化呈现每个分镜：序号 / 描述 / 主体参考 / 图片 / 视频。
 * 顶部工具栏：画幅、模型、分辨率、批量下载、预估消耗。
 * 与右侧 AI 对话面板联动：点击描述行写入 chatContext。
 */

"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useCurrentProject, useLumenStore } from "@/lib/lumenx/store";
import type { LxAspect, LxProject, LxShot, LxVariant } from "@/lib/lumenx/types";
import { ASPECTS } from "@/lib/lumenx/presets";
import { buildStoryboard } from "@/lib/lumenx/pipeline";
import { LX_VIDEO_MODELS, findVideoModel } from "@/lib/lumenx/lxModels";
import {
  IconPlus,
  IconSparkles,
  IconUpload,
  IconRefresh,
  IconPlay,
} from "../icons";

// 单镜预估消耗（积分/算力点），后续接入计费时再读真实定价。
const COST_PER_SHOT = 29;

// ──────────────────────────────────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────────────────────────────────

export default function StoryboardTab() {
  const project = useCurrentProject();
  const patch = useLumenStore((s) => s.patch);
  const setShots = useLumenStore((s) => s.setShots);
  const addShot = useLumenStore((s) => s.addShot);
  const setVideoModel = useLumenStore((s) => s.setVideoModel);
  const setVideoParams = useLumenStore((s) => s.setVideoParams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当前视频模型及其可选分辨率
  const currentVideoModel = findVideoModel(project?.videoModel);
  const resolutions = currentVideoModel?.resolutions ?? ["720P"];

  if (!project) {
    return (
      <div className="lx-storyboard">
        <div className="lx-sb-empty">
          <p>未选中项目。</p>
        </div>
      </div>
    );
  }

  const shots = project.shots;
  const totalCost = shots.length * COST_PER_SHOT;

  const runAiBreakdown = async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await buildStoryboard(
        project.sourceText,
        project.characters,
        project.scenes,
        project.props,
      );
      setShots(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lx-storyboard">
      {/* 顶部工具栏 */}
      <div className="lx-sb-toolbar">
        <label className="lx-sb-tool">
          <span className="lx-sb-tool-label">画幅</span>
          <select
            className="lx-select"
            value={project.aspect}
            onChange={(e) => patch({ aspect: e.target.value as LxAspect })}
          >
            {ASPECTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id}
              </option>
            ))}
          </select>
        </label>

        <label className="lx-sb-tool">
          <span className="lx-sb-tool-label">模型</span>
          <select
            className="lx-select"
            value={project.videoModel}
            onChange={(e) => setVideoModel(e.target.value)}
          >
            {LX_VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="lx-sb-tool">
          <span className="lx-sb-tool-label">分辨率</span>
          <select
            className="lx-select"
            value={(project.videoParams as Record<string, unknown>)?.resolution as string ?? "720P"}
            onChange={(e) => setVideoParams({ resolution: e.target.value })}
          >
            {resolutions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <div className="lx-sb-tool-spacer" />

        <button
          className="lx-btn ghost sm"
          onClick={() => console.log("[storyboard] batch download", shots.length)}
          disabled={!shots.length}
          title="批量下载所有图片 / 视频"
        >
          批量下载
        </button>

        <div className="lx-sb-cost" title="按当前分镜数 × 单镜预估">
          预估消耗 <strong>{totalCost}</strong>
        </div>
      </div>

      {error && <div className="lx-err lx-sb-err">{error}</div>}

      {/* 表格 / 空状态 */}
      {shots.length === 0 ? (
        <div className="lx-empty-guide">
          <div className="lx-empty-guide-icons" aria-hidden>
            <span>🎬</span>
            <span>🎞️</span>
            <span>🎥</span>
          </div>
          <h3 className="lx-empty-guide-title">还没有分镜</h3>
          <p className="lx-empty-guide-desc">
            用 AI 把剧本拆成 6–12 个连贯镜头，每镜含景别、运镜、台词；也可手动添加从零开始。
          </p>
          <button
            type="button"
            className="lx-empty-guide-btn"
            onClick={runAiBreakdown}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="lx-empty-guide-spinner" aria-hidden />
                AI 拆分中…
              </>
            ) : (
              <>
                <IconSparkles size={16} />
                AI 拆分镜
              </>
            )}
          </button>
          <button
            type="button"
            className="lx-empty-guide-link"
            onClick={addShot}
            disabled={busy}
          >
            或者手动添加分镜 →
          </button>
        </div>
      ) : (
        <div className="lx-sb-table">
          <div className="lx-sb-header">
            <div className="lx-sb-col-idx">#</div>
            <div className="lx-sb-col-desc">描述</div>
            <div className="lx-sb-col-refs">主体参考</div>
            <div className="lx-sb-col-image">图片</div>
            <div className="lx-sb-col-video">视频</div>
          </div>

          {shots.map((shot, i) => (
            <ShotRow key={shot.id} shot={shot} index={i} project={project} />
          ))}

          <div className="lx-sb-footer">
            <button className="lx-btn ghost" onClick={addShot}>
              <IconPlus size={15} /> 添加分镜
            </button>
            <span className="lx-hint">
              共 {shots.length} 镜 · 预估 {totalCost}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 单行
// ──────────────────────────────────────────────────────────────────────────

function ShotRow({
  shot,
  index,
  project,
}: {
  shot: LxShot;
  index: number;
  project: LxProject;
}) {
  const updateShot = useLumenStore((s) => s.updateShot);
  const removeShot = useLumenStore((s) => s.removeShot);
  const reorderShots = useLumenStore((s) => s.reorderShots);
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const openLightbox = useLumenStore((s) => s.openLightbox);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.action);

  // 本镜绑定的「主体参考」缩略图集合（角色 → 场景 → 道具）
  const refs = useMemo(() => {
    const items: { id: string; kind: "character" | "scene" | "prop"; name: string; url?: string }[] = [];
    for (const id of shot.characterIds) {
      const c = project.characters.find((x) => x.id === id);
      if (c) items.push({ id: c.id, kind: "character", name: c.name, url: c.imageUrl });
    }
    if (shot.sceneId) {
      const s = project.scenes.find((x) => x.id === shot.sceneId);
      if (s) items.push({ id: s.id, kind: "scene", name: s.name, url: s.imageUrl });
    }
    for (const id of shot.propIds) {
      const p = project.props.find((x) => x.id === id);
      if (p) items.push({ id: p.id, kind: "prop", name: p.name, url: p.imageUrl });
    }
    return items;
  }, [shot.characterIds, shot.sceneId, shot.propIds, project.characters, project.scenes, project.props]);

  // 当前图片：优先 imageUrl，其次 imageVariants 最近一张
  const currentImage =
    shot.imageUrl || shot.imageVariants[shot.imageVariants.length - 1]?.url;

  const bindToChat = () => {
    setChatContext({
      tab: "storyboard",
      refType: "shot",
      refId: shot.id,
      refLabel: `分镜 #${index + 1}`,
      refContent: shot.action,
    });
  };

  const commitDraft = () => {
    if (draft !== shot.action) updateShot(shot.id, { action: draft });
    setEditing(false);
  };

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const variant: LxVariant = {
      url,
      prompt: "(uploaded)",
      createdAt: Date.now(),
    };
    updateShot(shot.id, {
      imageUrl: url,
      imageVariants: [...shot.imageVariants, variant].slice(-10),
      status: "done",
    });
    e.target.value = "";
  };

  const onAiGenImage = () => {
    bindToChat();
    console.log("[storyboard] gen image", shot.id);
  };
  const onAiGenVideo = () => {
    bindToChat();
    console.log("[storyboard] gen video", shot.id);
  };
  const onEdit = () => {
    setEditing(true);
    bindToChat();
  };
  const onCite = () => {
    bindToChat();
    console.log("[storyboard] cite", shot.id);
  };

  return (
    <div
      className="lx-sb-row"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', shot.id);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('is-dragging');
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('is-dragging');
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove('drag-over');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== shot.id) {
          reorderShots(draggedId, shot.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("lx-context-menu", {
            detail: {
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: "🎨 AI 生成图片", action: () => onAiGenImage() },
                { label: "🎬 AI 生成视频", action: () => onAiGenVideo() },
                { label: "📋 复制描述", action: () => navigator.clipboard.writeText(shot.action || "") },
                { label: "---", action: () => {} },
                { label: "🗑 删除分镜", action: () => removeShot(shot.id), danger: true },
              ],
            },
          }),
        );
      }}
    >
      {/* # 列：序号 + 拖拽 handle */}
      <div className="lx-sb-col-idx">
        <span className="lx-sb-drag-handle" aria-hidden>⋮⋮</span>
        <div className="lx-sb-idx">{index + 1}</div>
        <button
          className="lx-sb-row-del"
          onClick={() => removeShot(shot.id)}
          title="删除该分镜"
        >
          ×
        </button>
      </div>

      {/* 描述列 */}
      <div className="lx-sb-col-desc lx-sb-desc">
        {editing ? (
          <textarea
            className="lx-textarea"
            autoFocus
            value={draft}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commitDraft();
              if (e.key === "Escape") {
                setDraft(shot.action);
                setEditing(false);
              }
            }}
            placeholder="画面 / 动作描述（可以用 @角色 / @场景 引用）"
          />
        ) : (
          <button
            type="button"
            className="lx-sb-desc-text"
            onClick={() => {
              setDraft(shot.action);
              onEdit();
            }}
            title="点击编辑并联动右侧 AI 对话"
          >
            {shot.action ? (
              renderHighlighted(shot.action, project)
            ) : (
              <span className="lx-sb-desc-empty">点击添加画面描述…</span>
            )}
          </button>
        )}

        <div className="lx-sb-actions">
          <label className="lx-sb-act" title="上传本地图片作为该镜画面">
            <input type="file" accept="image/*" hidden onChange={onUpload} />
            <IconUpload size={13} /> 上传图片
          </label>
          <button className="lx-sb-act" onClick={onAiGenImage}>
            <IconSparkles size={13} /> AI 生成
          </button>
          <button className="lx-sb-act" onClick={onEdit}>
            编辑
          </button>
          <button className="lx-sb-act" onClick={onAiGenVideo}>
            <IconRefresh size={13} /> 重做
          </button>
          <button className="lx-sb-act" onClick={onCite}>
            引用
          </button>
        </div>
      </div>

      {/* 主体参考列 */}
      <div className="lx-sb-col-refs lx-sb-refs">
        {refs.length === 0 && (
          <span className="lx-sb-refs-empty">无</span>
        )}
        {refs.map((r) => (
          <div
            key={`${r.kind}-${r.id}`}
            className={`lx-sb-ref-thumb kind-${r.kind}`}
            title={`${kindLabel(r.kind)}：${r.name}`}
          >
            {r.url ? (
              <img src={r.url} alt={r.name} />
            ) : (
              <span className="lx-sb-ref-text">{r.name.slice(0, 2)}</span>
            )}
          </div>
        ))}
        <button
          className="lx-sb-ref-add"
          title="添加主体参考（开发中）"
          onClick={() => console.log("[storyboard] add ref", shot.id)}
        >
          <IconPlus size={14} />
        </button>
      </div>

      {/* 图片列 */}
      <div className="lx-sb-col-image lx-sb-image">
        {currentImage ? (
          <button
            type="button"
            className="lx-sb-image-wrap"
            onClick={() =>
              openLightbox({
                url: currentImage,
                mediaType: "image",
                target: { type: "shot", id: shot.id, media: "image" },
                title: `分镜 #${index + 1}`,
              })
            }
            title="点击放大查看 / 编辑参数"
          >
            <img src={currentImage} alt={`分镜 ${index + 1} 画面`} />
          </button>
        ) : (
          <button
            className="lx-sb-placeholder"
            onClick={onAiGenImage}
            title="生成画面"
          >
            <ImagePlaceholderIcon />
            <span>未生成</span>
          </button>
        )}
      </div>

      {/* 视频列 */}
      <div className="lx-sb-col-video lx-sb-video">
        {shot.videoUrl ? (
          <button
            type="button"
            className="lx-sb-video-wrap"
            onClick={() =>
              openLightbox({
                url: shot.videoUrl!,
                mediaType: "video",
                target: { type: "shot", id: shot.id, media: "video" },
                title: `分镜 #${index + 1} · 视频`,
              })
            }
            title="点击播放 / 编辑参数"
          >
            {currentImage ? (
              <img src={currentImage} alt={`分镜 ${index + 1} 视频封面`} />
            ) : (
              <div className="lx-sb-video-cover" />
            )}
            <span className="lx-sb-video-play">
              <IconPlay size={18} />
            </span>
          </button>
        ) : (
          <button
            className="lx-sb-placeholder"
            onClick={onAiGenVideo}
            title="生成视频"
          >
            <IconPlay size={18} />
            <span>未生成</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 工具：@角色名 / @场景名 高亮
// ──────────────────────────────────────────────────────────────────────────

function renderHighlighted(text: string, project: LxProject): React.ReactNode {
  const names = [
    ...project.characters.map((c) => c.name),
    ...project.scenes.map((s) => s.name),
    ...project.props.map((p) => p.name),
  ].filter(Boolean);

  if (names.length === 0) return text;

  // 同时识别「@xxx」与已配置实体名（中文/英文均可）
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@?(${escaped.join("|")})`, "g");

  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`hl-${key++}`} className="lx-sb-highlight">
        {m[0].startsWith("@") ? m[0] : `@${m[0]}`}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function kindLabel(kind: "character" | "scene" | "prop"): string {
  if (kind === "character") return "角色";
  if (kind === "scene") return "场景";
  return "道具";
}

function ImagePlaceholderIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  );
}
