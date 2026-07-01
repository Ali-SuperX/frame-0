"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Job, JobMedia } from "@/lib/store";
import { translateError } from "@/lib/bailian/errors";
import { getModel, isImageMode, MODE_LABELS } from "@/lib/bailian/models";
import { normalizeLocalUploadPath } from "@/lib/mediaPaths";
import VideoPlayer from "./VideoPlayer";
import JobImage from "./JobImage";
import { fmtDuration, fmtClock } from "./helpers";

// 懒加载：ContinuationPanel / ContinuationChainPanel 仅在用户点击"续写"时才需要，
// 且它们各自 import 了 5173 行的 r2v.css —— 延迟加载可让首屏 CSS bundle 瘦 ~60KB。
const ContinuationPanel = dynamic(() => import("./ContinuationPanel"), {
  ssr: false,
});
const ContinuationChainPanel = dynamic(
  () => import("./ContinuationChainPanel"),
  { ssr: false }
);

/**
 * Central preview pane — shows the active job's rendered video, the live
 * ETA of a running job, or a friendly empty state. Used only by Studio.
 * CSS is provided by Studio's global style block (classes prefixed
 * `preview-*` / `eta-*` / `spinner`).
 */
export default function PreviewPanel({
  job,
  zh,
  onRerun,
  onPublish,
  onRetry,
  hasJobs,
  onOpenLibrary,
  onSendToDirector,
  onImageToVideo,
  onEditVideo,
  theater,
  onToggleTheater,
}: {
  job: Job | undefined;
  zh: boolean;
  onRerun: () => void;
  onPublish: () => void;
  onRetry: () => void;
  hasJobs: boolean;
  onOpenLibrary: () => void;
  /** Send this job's reference images + prompt to the Director (R2V) workspace. */
  onSendToDirector?: (job: Job) => void;
  /** Load a finished image as the first frame of an I2V draft. */
  onImageToVideo?: (job: Job) => void;
  /** Load a finished video as the source of a Video-Edit (ve) draft. */
  onEditVideo?: (job: Job) => void;
  /** 影院模式开关 —— 视频铺满全屏。 */
  theater?: boolean;
  onToggleTheater?: () => void;
}) {
  const [extending, setExtending] = useState(false);
  const [chaining, setChaining] = useState(false);
  // Close continuation panel when switching jobs
  useEffect(() => { setExtending(false); }, [job?.id]);

  return (
    <div className="preview-main">
      <div className="preview-stage">
        {!job ? (
          <div className="preview-ph">
            <div className="preview-ph-kicker">FRAME/0 · 百炼</div>
            <h2>
              {zh ? (
                <>
                  底部对话框， <em>写完即生成。</em>
                </>
              ) : (
                <>
                  Compose below, <em>then generate.</em>
                </>
              )}
            </h2>
            <p>
              {hasJobs
                ? zh
                  ? "点击左栏任意任务预览结果，或在底部对话框填写并提交新任务。"
                  : "Click any job on the left to preview, or use the composer below to submit a new one."
                : zh
                  ? "不知从何下手？可以先从灵感库挑一个 prompt。"
                  : "Need a starting point? Browse the library for prompt ideas."}
            </p>
            {!hasJobs && (
              <button
                type="button"
                className="preview-lib-btn"
                onClick={onOpenLibrary}
              >
                ✦ {zh ? "打开灵感库" : "Open library"}
              </button>
            )}
          </div>
        ) : job.status === "done" && job.videoUrl ? (
          <div className="preview-develop-in" key={job.id}>
            {isImageMode(job.mode) ? (
              <JobImage
                src={job.videoUrl}
                alt={job.title}
                localKey={job.localKey}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              <VideoPlayer src={job.videoUrl} zh={zh} />
            )}
          </div>
        ) : job.status === "error" ? (
          <div className="preview-err">
            <div className="preview-err-msg">
              ✗ {translateError(job.errorMessage, zh)}
            </div>
            {job.errorMessage && (
              <div className="preview-err-raw">{job.errorMessage}</div>
            )}
            <button
              type="button"
              className="btn-ghost"
              onClick={onRetry}
              style={{ marginTop: 14 }}
            >
              ↻ {zh ? "重试（保留参数）" : "Retry with same params"}
            </button>
          </div>
        ) : (
          <RunningState job={job} zh={zh} />
        )}
        {job && job.status === "done" && job.videoUrl && onToggleTheater && (
          <button
            type="button"
            className="stage-theater-btn"
            onClick={onToggleTheater}
            title={
              theater
                ? zh
                  ? "退出影院 (Esc)"
                  : "Exit theater (Esc)"
                : zh
                  ? "影院模式 —— 视频铺满全屏"
                  : "Theater mode — fill the screen"
            }
            aria-label={theater ? "exit theater" : "theater mode"}
          >
            {theater ? "✕" : "⛶"}
          </button>
        )}
      </div>

      {job && (
        <>
          <JobRecipe job={job} zh={zh} />
          <div className="preview-actions">
            <button
              className="btn-ghost"
              onClick={onRerun}
              title={
                zh ? "载入这些参数到对话框" : "Load these params into the composer"
              }
            >
              ↺ {zh ? "用这套参数再来一条" : "Re-run with these params"}
            </button>
            {job.status === "done" && job.videoUrl && (
              <>
                <DoneActions
                  job={job}
                  zh={zh}
                  onPublish={onPublish}
                />
                {isImageMode(job.mode) ? (
                  /* 图片任务：一键把成图设为图生视频首帧，免手动上传。 */
                  onImageToVideo && (
                    <button
                      className="btn-ghost btn-ghost-accent"
                      onClick={() => onImageToVideo(job)}
                      title={
                        zh
                          ? "把这张图设为「图生视频」的首帧，直接写运动描述即可生成"
                          : "Use this image as the I2V first frame"
                      }
                    >
                      🎞 {zh ? "用此图生成视频" : "Animate image"}
                    </button>
                  )
                ) : (
                  <>
                    <button
                      className={`btn-ghost${extending ? " active" : ""}`}
                      onClick={() => { setExtending((v) => !v); setChaining(false); }}
                      title={zh ? "单段延续：从这条视频生成下一段" : "Single-segment extend"}
                    >
                      ➕ {zh ? "延续" : "Extend"}
                    </button>
                    <button
                      className={`btn-ghost${chaining ? " active" : ""}`}
                      onClick={() => { setChaining((v) => !v); setExtending(false); }}
                      title={zh ? "链式延续：一次描述 2-4 段，自动串行生成（实验功能，验证连贯性用）" : "Chain mode: describe 2-4 segs, auto-serial (experimental)"}
                    >
                      🔗 {zh ? "链式" : "Chain"}
                    </button>
                    {onEditVideo && (
                      <button
                        className="btn-ghost"
                        onClick={() => onEditVideo(job)}
                        title={
                          zh
                            ? "把这条视频送入剪辑器继续剪辑"
                            : "Send this video to the Editor"
                        }
                      >
                        ✂ {zh ? "送剪辑" : "Edit"}
                      </button>
                    )}
                  </>
                )}
                {onSendToDirector && (
                  <button
                    className="btn-ghost"
                    onClick={() => onSendToDirector(job)}
                    title={zh ? "把参考图和 prompt 刷入导演台二创" : "Send refs & prompt to Director for remix"}
                  >
                    🎬 {zh ? "导演台" : "Director"}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Inline continuation panel */}
          {extending && job.status === "done" && job.videoUrl && (
            <ContinuationPanel
              key={job.id}
              job={job}
              zh={zh}
              onClose={() => setExtending(false)}
            />
          )}

          {/* Inline chain continuation panel */}
          {chaining && job.status === "done" && job.videoUrl && (
            <ContinuationChainPanel
              key={`chain-${job.id}`}
              job={job}
              zh={zh}
              onClose={() => setChaining(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ─────────── Job recipe — 历史任务完整配置明细 ─────────── */

const LABEL_ZH: Record<string, string> = {
  resolution: "分辨率",
  ratio: "画面比例",
  duration: "时长",
  size: "尺寸",
  shot_type: "镜头",
  prompt_extend: "智能改写",
  audio: "生成音频",
  audio_url: "音频地址",
  audio_setting: "音频",
  watermark: "AI 水印",
  seed: "种子",
  quality_mode: "画质",
  n: "生成数量",
  negative_prompt: "负向词",
};

const OPTION_ZH: Record<string, string> = {
  "16:9  horizontal": "16:9 横屏",
  "9:16  vertical": "9:16 竖屏",
  "1:1   square": "1:1 方形",
  "Single shot": "单镜头",
  "Multiple shots": "多镜头",
  "Standard": "标准",
  "Pro": "专业",
  "Auto": "自动",
  "Keep original": "保留原声",
};

const HIDDEN_PARAM_KEYS = new Set([
  "prompt",
  "negative_prompt",
  "img_url",
  "video_url",
  "reference_urls",
  "ref_images",
  "last_frame_url",
  "first_clip_url",
  "audio_url",
]);

function JobRecipe({ job, zh }: { job: Job; zh: boolean }) {
  const spec = getModel(job.modelId);
  const [promptOpen, setPromptOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const paramRows = Object.entries(job.params)
    .filter(
      ([k, v]) =>
        v !== undefined && v !== null && v !== "" && !HIDDEN_PARAM_KEYS.has(k)
    )
    .map(([key, value]) => {
      const field = spec?.fields.find((f) => f.key === key);
      let display = String(value);
      if (field) {
        if (field.kind === "enum") {
          const optLabel =
            field.options.find((o) => o.value === value)?.label ??
            String(value);
          display = zh ? OPTION_ZH[optLabel] ?? optLabel : optLabel;
        } else if (field.kind === "bool") {
          display = value ? (zh ? "开" : "ON") : zh ? "关" : "OFF";
        } else if (field.kind === "int") {
          display = `${String(value)}${field.unit ?? ""}`;
        }
      }
      const label = zh
        ? LABEL_ZH[key] ?? field?.label ?? key
        : field?.label ?? key;
      return { key, label, display };
    });
  const mediaItems: JobMedia[] = [
    ...(job.media.img_url ? [job.media.img_url] : []),
    ...(job.media.reference_urls ?? []),
    ...(job.media.video_url ? [job.media.video_url] : []),
    ...(job.media.ref_images ?? []),
  ];
  const hasPrompt = !!(job.prompt || job.negativePrompt);
  return (
    <div className="preview-recipe">
      {hasPrompt && (
        <div className="preview-rc-prompts">
          <button
            type="button"
            className="preview-rc-toggle"
            onClick={() => setPromptOpen((v) => !v)}
            aria-expanded={promptOpen}
          >
            <span className={`preview-rc-caret${promptOpen ? " open" : ""}`}>
              ▸
            </span>
            <span className="preview-rc-toggle-k">
              {zh ? "提示词" : "PROMPT"}
            </span>
            {!promptOpen && (
              <span className="preview-rc-peek">
                {job.prompt || job.negativePrompt}
              </span>
            )}
          </button>
          {promptOpen && (
            <>
              {job.prompt && (
                <p className="preview-rc-prompt">{job.prompt}</p>
              )}
              {job.negativePrompt && (
                <p className="preview-rc-neg">
                  <span className="preview-rc-neg-k">
                    {zh ? "负向词" : "NEGATIVE"}
                  </span>
                  {job.negativePrompt}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <div className="preview-rc-params">
        <span>
          <b>{zh ? "模型" : "Model"}</b>{" "}
          {spec?.displayName ?? job.modelId}
        </span>
        <span>
          <b>{zh ? "模式" : "Mode"}</b>{" "}
          {zh
            ? MODE_LABELS[job.mode]?.zh ?? job.mode.toUpperCase()
            : MODE_LABELS[job.mode]?.en ?? job.mode.toUpperCase()}
        </span>
        {paramRows.map((p) => (
          <span key={p.key}>
            <b>{p.label}</b> {p.display}
          </span>
        ))}
        {job.completedAt && job.completedAt > job.createdAt && (
          <span>
            <b>{zh ? "耗时" : "Took"}</b>{" "}
            {fmtDuration(job.completedAt - job.createdAt)}
          </span>
        )}
      </div>
      {mediaItems.length > 0 && (
        <div className="preview-rc-media">
          {mediaItems.map((m, i) => (
            <RecipeThumb key={i} media={m} index={i} onZoom={setLightboxSrc} />
          ))}
        </div>
      )}
      {lightboxSrc && (
        <RefLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

function RecipeThumb({
  media,
  index,
  onZoom,
}: {
  media: JobMedia;
  index: number;
  onZoom?: (src: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const src =
    media.thumbDataUrl || media.localPath || media.previewUrl || media.url;
  const loadable = !failed && /^(https?:|blob:|data:|\/)/.test(src ?? "");
  const label = media.name || media.url;
  if (!loadable) {
    return (
      <div className="preview-rc-thumb preview-rc-thumb-ph" title={label}>
        {index + 1}
      </div>
    );
  }
  const fullSrc = media.localPath || media.previewUrl || media.url || src;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={media.name || `ref ${index + 1}`}
      className="preview-rc-thumb"
      title={label}
      style={{ cursor: "pointer" }}
      onClick={() => onZoom?.(fullSrc!)}
      onError={() => setFailed(true)}
    />
  );
}

function RefLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ref-lightbox" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="ref-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* ─────────── Running state (ETA) ─────────── */

function getSourceThumb(job: Job): string | null {
  const m = job.media;
  for (const src of [m.img_url, m.video_url, ...(m.reference_urls ?? [])]) {
    if (!src) continue;
    const url = src.thumbDataUrl || normalizeLocalUploadPath(src.localPath) || src.previewUrl;
    if (url && /^(https?:|blob:|data:|\/)/.test(url)) return url;
  }
  return null;
}

function isHttpUrl(url: string | undefined | null): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

function toAbsoluteAppUrl(url: string): string | null {
  if (!url.startsWith("/")) return null;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return null;
  }
}

function shareVideoUrl(job: Job): string | null {
  if (isHttpUrl(job.videoUrl)) return job.videoUrl;
  if (job.videoUrl) {
    const absolute = toAbsoluteAppUrl(job.videoUrl);
    if (absolute) return absolute;
  }
  if (job.taskId) return toAbsoluteAppUrl(`/api/videos/${encodeURIComponent(job.taskId)}`);
  return null;
}

function RunningState({ job, zh }: { job: Job; zh: boolean }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsedSec = Math.floor((Date.now() - job.createdAt) / 1000);
  const thumb = getSourceThumb(job);

  return (
    <div className="preview-ph preview-developing" style={{ width: "100%" }}>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="dev-bg-img" />
      )}
      <div className="dev-rings">
        <div className="dev-ring dev-ring-1" />
        <div className="dev-ring dev-ring-2" />
        <div className="dev-ring dev-ring-3" />
      </div>
      <div className="dev-particles">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="dev-dot" style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <div className="dev-content">
        <div className="dev-pulse-core" />
        <div className="dev-label">
          {job.status === "submitting"
            ? zh ? "入槽中" : "LOADING"
            : zh ? "生成中" : "GENERATING"}
        </div>
        <div className="dev-timer">{fmtClock(elapsedSec)}</div>
        <div className="dev-model">{job.modelId}</div>
      </div>
    </div>
  );
}

/* ─────────── Done actions (download / copy / publish / edit) ─────────── */

function DoneActions({
  job,
  zh,
  onPublish,
}: {
  job: Job;
  zh: boolean;
  onPublish: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(label);
    } catch {
      flash(zh ? "复制失败" : "Copy failed");
    }
  }
  async function download() {
    if (!job.videoUrl) return;
    flash(zh ? "下载中…" : "Downloading…");
    try {
      const res = await fetch(job.videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frame-0_${job.id.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flash(zh ? "已下载" : "Saved");
    } catch {
      flash(zh ? "下载失败" : "Download failed");
    }
  }
  return (
    <>
      <button
        className="btn-ghost"
        onClick={download}
        title={zh ? "下载到本地 MP4" : "Save MP4 locally"}
      >
        ↓ {zh ? "下载" : "Download"}
      </button>
      <button
        className="btn-ghost"
        onClick={() => {
          const url = shareVideoUrl(job);
          if (!url) {
            flash(zh ? "暂无可分享地址" : "No shareable URL");
            return;
          }
          void copy(url, zh ? "在线 URL 已复制" : "Online URL copied");
        }}
        title={zh ? "复制在线视频地址" : "Copy online video URL"}
      >
        ⎘ {zh ? "复制 URL" : "Copy URL"}
      </button>
      {job.prompt && (
        <button
          className="btn-ghost"
          onClick={() =>
            copy(job.prompt!, zh ? "Prompt 已复制" : "Prompt copied")
          }
          title={zh ? "复制 prompt" : "Copy prompt"}
        >
          ⎘ {zh ? "复制 Prompt" : "Copy Prompt"}
        </button>
      )}
      <button className="btn-ghost" onClick={onPublish}>
        {job.published
          ? zh ? "★ 取消发布" : "★ Unpublish"
          : zh ? "☆ 发布到档案" : "☆ Publish"}
      </button>
      {toast && <span className="preview-toast">{toast}</span>}
    </>
  );
}
