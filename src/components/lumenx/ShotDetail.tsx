/**
 * LumenX —— 分镜详情弹窗（全屏覆盖层）。
 *
 * 从分镜表格点击某行后展开为全屏 overlay，用于细致编辑该镜的视频生成参数。
 * 布局：左 = 分镜缩略图列（可切换） | 中 = 视频播放器 + 操作条 | 右 = 脚本 + 参考图 + 配置栏。
 *
 * 仅前端展示状态：所有"生成 / 放大 / 下载"操作目前均为 console.log 占位，
 * 真实接线在后续 jobPolling / pipeline 任务中接入。
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useCurrentProject, useLumenStore } from "@/lib/lumenx/store";
import type { LxProject, LxShot, LxVariant } from "@/lib/lumenx/types";
import {
  IconPlus,
  IconUpload,
  IconRefresh,
  IconPlay,
  IconSparkles,
} from "./icons";

// ──────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────

interface ShotDetailProps {
  shotId: string;
  onClose: () => void;
}

// 主体参考的归一化条目
type RefItem = {
  id: string;
  kind: "character" | "scene" | "prop";
  name: string;
  url?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────────────────────────────────

export default function ShotDetail({ shotId, onClose }: ShotDetailProps) {
  const project = useCurrentProject();
  const updateShot = useLumenStore((s) => s.updateShot);
  const setChatContext = useLumenStore((s) => s.setChatContext);

  const [activeShotId, setActiveShotId] = useState(shotId);
  const [scriptCollapsed, setScriptCollapsed] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [model, setModel] = useState("seedance-2.0-pro");
  const [resolution, setResolution] = useState("480p");

  // 视频播放进度
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDur, setVideoDur] = useState(0);

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 切换 shot 时重置视频时间
  useEffect(() => {
    setVideoTime(0);
    setVideoDur(0);
  }, [activeShotId]);

  if (!project) return null;

  const shots = project.shots;
  const activeShot = shots.find((s) => s.id === activeShotId) ?? shots[0];
  if (!activeShot) return null;

  const activeIndex = shots.findIndex((s) => s.id === activeShot.id);

  // 主体参考集合
  const refs: RefItem[] = collectRefs(activeShot, project);

  // ────────────────────────────────────────────────────────────────────────
  // 操作处理
  // ────────────────────────────────────────────────────────────────────────

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onRegenerateVideo = () => {
    setChatContext({
      tab: "storyboard",
      refType: "shot",
      refId: activeShot.id,
      refLabel: `分镜 #${activeIndex + 1}`,
      refContent: activeShot.action,
    });
    console.log("[shot-detail] regen video", activeShot.id);
  };

  const onZoom = () => {
    if (activeShot.videoUrl) window.open(activeShot.videoUrl, "_blank");
    else if (activeShot.imageUrl) window.open(activeShot.imageUrl, "_blank");
  };

  const onDeleteVideo = () => {
    if (!activeShot.videoUrl) return;
    if (!confirm("确认删除该镜的视频？")) return;
    updateShot(activeShot.id, { videoUrl: undefined, videoJobId: undefined });
  };

  const onUploadCover = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const variant: LxVariant = {
      url,
      prompt: "(uploaded)",
      createdAt: Date.now(),
    };
    updateShot(activeShot.id, {
      imageUrl: url,
      imageVariants: [...activeShot.imageVariants, variant].slice(-10),
      status: "done",
    });
    e.target.value = "";
  };

  const onDurationChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(1, Math.min(30, Number(e.target.value) || 1));
    updateShot(activeShot.id, { durationSec: v });
  };

  const onSubmit = () => {
    setChatContext({
      tab: "storyboard",
      refType: "shot",
      refId: activeShot.id,
      refLabel: `分镜 #${activeIndex + 1}`,
      refContent: activeShot.action,
    });
    console.log("[shot-detail] submit", {
      shotId: activeShot.id,
      model,
      resolution,
      durationSec: activeShot.durationSec,
      audio: audioOn,
    });
  };

  // 当前 shot 的封面（视频 poster / 占位）
  const cover =
    activeShot.imageUrl ||
    activeShot.imageVariants[activeShot.imageVariants.length - 1]?.url;

  // ────────────────────────────────────────────────────────────────────────
  // 渲染
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="lx-shot-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`分镜 ${activeIndex + 1} 详情`}
      onMouseDown={onBackdropClick}
    >
      <div className="lx-shot-modal" onMouseDown={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button
          className="lx-shot-close"
          onClick={onClose}
          title="关闭 (Esc)"
          aria-label="关闭"
        >
          ×
        </button>

        {/* ────── 左：缩略图列 ────── */}
        <aside className="lx-shot-sidebar">
          <label className="lx-shot-sidebar-upload" title="上传封面图">
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={onUploadCover}
            />
            <IconUpload size={14} />
            <span>上传</span>
          </label>

          <div className="lx-shot-sidebar-list">
            {shots.map((s, i) => {
              const thumbUrl =
                s.imageUrl ||
                s.imageVariants[s.imageVariants.length - 1]?.url;
              const active = s.id === activeShot.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`lx-shot-thumb${active ? " active" : ""}`}
                  onClick={() => setActiveShotId(s.id)}
                  title={`分镜 #${i + 1}${s.action ? "\n" + s.action.slice(0, 40) : ""}`}
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={`分镜 ${i + 1}`} />
                  ) : (
                    <span className="lx-shot-thumb-empty">{i + 1}</span>
                  )}
                  <span className="lx-shot-thumb-idx">{i + 1}</span>
                  {active && (
                    <span className="lx-shot-thumb-badge">已选中</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ────── 中：播放器区 ────── */}
        <section className="lx-shot-player">
          <div className="lx-shot-actions-bar">
            <span className="lx-shot-actions-status">
              <span className="dot" /> 已选中 · 第 {activeIndex + 1} 镜
            </span>
            <div className="lx-shot-actions-spacer" />
            <button
              className="lx-shot-action"
              onClick={onRegenerateVideo}
              title="重新生成视频"
            >
              <IconRefresh size={14} /> 重新生成
            </button>
            <button
              className="lx-shot-action"
              onClick={onZoom}
              title="放大查看"
              disabled={!activeShot.videoUrl && !activeShot.imageUrl}
            >
              <ZoomIcon /> 放大
            </button>
            {activeShot.videoUrl ? (
              <a
                className="lx-shot-action"
                href={activeShot.videoUrl}
                download={`shot-${activeIndex + 1}.mp4`}
                title="下载视频"
              >
                <DownloadIcon /> 下载
              </a>
            ) : (
              <button className="lx-shot-action" disabled title="暂无视频">
                <DownloadIcon /> 下载
              </button>
            )}
            <button
              className="lx-shot-action danger"
              onClick={onDeleteVideo}
              disabled={!activeShot.videoUrl}
              title="删除视频"
            >
              <TrashIcon /> 删除
            </button>
          </div>

          <div className="lx-shot-stage">
            {activeShot.videoUrl ? (
              <video
                key={activeShot.id}
                ref={videoRef}
                src={activeShot.videoUrl}
                poster={cover}
                controls
                muted={!audioOn}
                onTimeUpdate={(e) =>
                  setVideoTime((e.target as HTMLVideoElement).currentTime)
                }
                onLoadedMetadata={(e) =>
                  setVideoDur((e.target as HTMLVideoElement).duration || 0)
                }
              />
            ) : cover ? (
              <div className="lx-shot-stage-cover">
                <img src={cover} alt={`分镜 ${activeIndex + 1} 封面`} />
                <div className="lx-shot-stage-hint">
                  <IconPlay size={20} />
                  <span>暂无视频，点击{'"'}重新生成{'"'}开始合成</span>
                </div>
              </div>
            ) : (
              <div className="lx-shot-stage-empty">
                <IconPlay size={28} />
                <p>暂无画面</p>
                <span>先生成封面图，再生成视频</span>
              </div>
            )}
          </div>

          <div className="lx-shot-stage-meta">
            <span className="lx-shot-time">
              {formatTime(videoTime)} / {formatTime(videoDur || activeShot.durationSec)}
            </span>
            <span className="lx-shot-meta-sep">·</span>
            <span>{activeShot.shotSize || "中景"}</span>
            <span className="lx-shot-meta-sep">·</span>
            <span>{activeShot.camera || "still"}</span>
          </div>
        </section>

        {/* ────── 右：详情区 ────── */}
        <aside className="lx-shot-detail">
          <header className="lx-shot-detail-head">
            <h2 className="lx-shot-detail-title">
              Scene {activeIndex + 1}
              <span className="lx-shot-detail-sub">/ 共 {shots.length} 镜</span>
            </h2>
            <button
              className="lx-shot-detail-collapse"
              onClick={() => setScriptCollapsed((v) => !v)}
              title={scriptCollapsed ? "展开脚本" : "收起脚本"}
            >
              {scriptCollapsed ? "展开" : "收起"}
            </button>
          </header>

          {!scriptCollapsed && (
            <div className="lx-shot-script">
              {renderScript(activeShot.action, project)}
              {activeShot.dialogue && (
                <p className="lx-shot-script-dialog">
                  <span className="lx-shot-script-label">台词</span>
                  {activeShot.dialogue}
                </p>
              )}
            </div>
          )}

          <div className="lx-shot-refs">
            <div className="lx-shot-refs-head">
              <span className="lx-shot-refs-title">主体参考</span>
              <span className="lx-shot-refs-count">{refs.length}</span>
            </div>
            <div className="lx-shot-refs-grid">
              {refs.map((r) => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className={`lx-shot-ref kind-${r.kind}`}
                  title={`${kindLabel(r.kind)}：${r.name}`}
                >
                  <div className="lx-shot-ref-img">
                    {r.url ? (
                      <img src={r.url} alt={r.name} />
                    ) : (
                      <span>{r.name.slice(0, 2)}</span>
                    )}
                  </div>
                  <span className="lx-shot-ref-name">{r.name}</span>
                </div>
              ))}
              <button
                className="lx-shot-ref-add"
                onClick={() =>
                  console.log("[shot-detail] add ref", activeShot.id)
                }
                title="添加参考"
              >
                <IconPlus size={16} />
                <span>添加</span>
              </button>
            </div>
          </div>

          {/* 底部配置栏 */}
          <div className="lx-shot-config">
            <label className="lx-shot-cfg">
              <span className="lx-shot-cfg-k">模型</span>
              <select
                className="lx-shot-cfg-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="seedance-2.0-pro">Seedance 2.0 Pro</option>
                <option value="seedance-1.0">Seedance 1.0</option>
                <option value="kling-1.6">Kling 1.6</option>
              </select>
            </label>

            <div className="lx-shot-cfg">
              <span className="lx-shot-cfg-k">画幅</span>
              <span className="lx-shot-cfg-v">{project.aspect}</span>
            </div>

            <label className="lx-shot-cfg">
              <span className="lx-shot-cfg-k">分辨率</span>
              <select
                className="lx-shot-cfg-select"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>

            <label className="lx-shot-cfg">
              <span className="lx-shot-cfg-k">时长</span>
              <span className="lx-shot-cfg-dur">
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={activeShot.durationSec}
                  onChange={onDurationChange}
                />
                <em>s</em>
              </span>
            </label>

            <label
              className={`lx-shot-toggle${audioOn ? " on" : ""}`}
              title="是否生成音频"
            >
              <input
                type="checkbox"
                checked={audioOn}
                onChange={(e) => setAudioOn(e.target.checked)}
                hidden
              />
              <span className="lx-shot-toggle-track">
                <span className="lx-shot-toggle-thumb" />
              </span>
              <span className="lx-shot-toggle-label">音频</span>
            </label>

            <button
              className="lx-shot-submit"
              onClick={onSubmit}
              title="生成 / 重新生成"
            >
              <IconSparkles size={14} />
              <span>生成</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 工具
// ──────────────────────────────────────────────────────────────────────────

function collectRefs(shot: LxShot, project: LxProject): RefItem[] {
  const items: RefItem[] = [];
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
}

function kindLabel(kind: RefItem["kind"]): string {
  if (kind === "character") return "角色";
  if (kind === "scene") return "场景";
  return "道具";
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 渲染脚本：
 *  - 行首形如 "0-2s:" / "2-4s :" 的时间戳加粗为独立 chip
 *  - 同时高亮 @角色 / @场景 / @道具 名（沿用 StoryboardTab 的策略）
 */
function renderScript(text: string, project: LxProject): React.ReactNode {
  if (!text) {
    return (
      <p className="lx-shot-script-empty">
        暂无脚本描述。点击{'"'}编辑{'"'}或在右侧 AI 对话中补充。
      </p>
    );
  }

  // 按行切分，每行单独渲染（保留时间戳格式）
  const lines = text.split(/\r?\n/);
  return (
    <div className="lx-shot-script-body">
      {lines.map((line, i) => {
        const m = line.match(/^\s*(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*s)\s*[:：]\s*(.*)$/);
        if (m) {
          return (
            <p className="lx-shot-script-line" key={i}>
              <span className="lx-shot-script-time">{m[1]}</span>
              <span className="lx-shot-script-text">
                {highlight(m[2], project)}
              </span>
            </p>
          );
        }
        if (!line.trim()) return <br key={i} />;
        return (
          <p className="lx-shot-script-line" key={i}>
            <span className="lx-shot-script-text">{highlight(line, project)}</span>
          </p>
        );
      })}
    </div>
  );
}

function highlight(text: string, project: LxProject): React.ReactNode {
  const names = [
    ...project.characters.map((c) => c.name),
    ...project.scenes.map((s) => s.name),
    ...project.props.map((p) => p.name),
  ].filter(Boolean);

  if (names.length === 0) return text;

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@?(${escaped.join("|")})`, "g");

  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const name = m[1];
    const kind: RefItem["kind"] = project.characters.some((c) => c.name === name)
      ? "character"
      : project.scenes.some((s) => s.name === name)
        ? "scene"
        : "prop";
    out.push(
      <span key={`hl-${key++}`} className={`lx-shot-mention kind-${kind}`}>
        {m[0].startsWith("@") ? m[0] : `@${m[0]}`}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// 内联图标（操作条专用，与 icons.tsx 风格一致）
// ──────────────────────────────────────────────────────────────────────────

function ZoomIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M8 11h6M11 8v6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  );
}
