"use client";

import { useEffect, useRef, useState } from "react";
import type { JobMedia, Job } from "@/lib/store";
import { readLocalFile, deleteLocalFile } from "@/lib/editor/localFiles";
import { uploadMediaFile, validateUploadFile } from "./uploadMedia";
import { jobResultToFile } from "@/lib/bailian/jobResultToFile";
import AssetPicker from "./AssetPicker";

type Props = {
  label: string;
  accept: "image" | "video" | "audio" | "image|video";
  value?: JobMedia;
  onChange: (media: JobMedia | undefined) => void;
  modelName: string;
  /** 紧凑模式：渲染成一个小方块瓦片（无 URL/Upload tab、无大标题），
   *  用于底部全能对话框 —— 空态是虚线「+ 标题」，有值是缩略图 + 角标删除。 */
  compact?: boolean;
  /** 选填字段：紧凑瓦片下方标注「选填」，让用户一眼看出哪个非必填。 */
  optional?: boolean;
};

function mimeAccept(accept: Props["accept"]): string {
  if (accept === "image") return "image/*";
  if (accept === "video") return "video/*";
  if (accept === "audio") return "audio/*";
  return "image/*,video/*";
}

/** Single media input — supports URL paste OR local file → upload to OSS. */
export default function MediaPicker({
  label,
  accept,
  value,
  onChange,
  modelName,
  compact,
  optional,
}: Props) {
  const [mode, setMode] = useState<"url" | "file">(value?.url?.startsWith("oss://") ? "file" : "url");
  const [urlInput, setUrlInput] = useState(
    value && !value.url.startsWith("oss://") ? value.url : ""
  );
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  // Re-hydrated blob URL when previewUrl is gone but a localKey points to
  // bytes saved in IndexedDB (i.e. after a page reload).
  const [rehydratedPreview, setRehydratedPreview] = useState<string | null>(null);
  // Click thumbnail → fullscreen lightbox, ESC / click backdrop to close.
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // 从资产库选：弹层开关 + 紧凑态 ＋ 的「本地/资产库」二选一菜单。
  const [assetOpen, setAssetOpen] = useState(false);
  const [addMenu, setAddMenu] = useState(false);

  // 切到 Upload tab 时自动聚焦 drop zone，让 Cmd+V 直接生效。
  useEffect(() => {
    if (mode === "file" && !value) dropRef.current?.focus();
  }, [mode, value]);

  // 跟随 value 变化更新 mode + urlInput ——
  // 关键场景：父级用 setMedia({img_url}) 异步设置首帧（如"用此图生成视频"），
  // 本组件已挂载完成，useState 不会重新初始化。如果不在这里同步，
  // 用户会看到「URL 框空但 store 其实已有」的鬼影状态。
  useEffect(() => {
    if (!value) {
      // 已删 / 未填 —— 不动 mode，避免来回切扰民
      return;
    }
    if (value.url.startsWith("oss://") || value.localKey || value.localPath) {
      // 已上传 / 有本地备份 → 切到 file 视图（显示缩略 + 文件名）
      setMode("file");
    } else {
      setMode("url");
      setUrlInput(value.url);
    }
  }, [value]);

  // ESC 关闭 lightbox + 锁滚动。
  useEffect(() => {
    if (!lightboxSrc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxSrc(null);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxSrc]);

  // Rehydrate preview from IndexedDB when previewUrl is missing/dead.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setRehydratedPreview(null);
    const key = value?.localKey;
    const hasLivePreview =
      value?.previewUrl && value.previewUrl.startsWith("blob:");
    if (!key || hasLivePreview) return;
    (async () => {
      try {
        const blob = await readLocalFile(key);
        if (!blob || cancelled) return;
        const typed = value?.mime
          ? new Blob([blob], { type: value.mime })
          : blob;
        createdUrl = URL.createObjectURL(typed);
        setRehydratedPreview(createdUrl);
      } catch {
        /* ignore — falls back to OSS placeholder */
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [value?.localKey, value?.previewUrl, value?.mime]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    setErr(null);
    const ve = await validateUploadFile(files[0]);
    if (ve) { setErr(ve); return; }
    setUploading(true);
    try {
      onChange(await uploadMediaFile(files[0], modelName));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  function commitUrl() {
    const v = urlInput.trim();
    if (!v) return;
    onChange({ url: v, name: v.split("/").pop() });
  }

  // 从资产库选了一个成片 → 取字节重传 OSS（与本地上传一致，保证提交时是公网 URL）
  async function pickAsset(job: Job) {
    setAssetOpen(false);
    setAddMenu(false);
    setErr(null);
    setUploading(true);
    try {
      const file = await jobResultToFile(job);
      if (!file) throw new Error("无法读取该资产的字节，试试重新生成");
      onChange(await uploadMediaFile(file, modelName));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    if (rehydratedPreview) URL.revokeObjectURL(rehydratedPreview);
    if (value?.localKey) {
      void deleteLocalFile(value.localKey).catch(() => {});
    }
    setRehydratedPreview(null);
    onChange(undefined);
    setUrlInput("");
  }

  const isVideo =
    value?.mime?.startsWith("video/") ||
    value?.url?.match(/\.(mp4|mov|webm)/i);

  // Container-level paste handler — focus 在 picker 内任意位置（URL 输入框、
  // Upload drop zone）都能用 ⌘V 粘贴图片，不需要先切 Upload tab。
  // 剪贴板没 file 时不 preventDefault，让 URL input 接收文本默认行为。
  function handleContainerPaste(e: React.ClipboardEvent) {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (!files.length) return;
    e.preventDefault();
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    void handleFiles(dt.files);
  }

  // ── 紧凑瓦片（底部全能对话框用）──
  if (compact) {
    const live =
      value?.previewUrl && value.previewUrl.startsWith("blob:")
        ? value.previewUrl
        : null;
    const src = value
      ? live ||
        rehydratedPreview ||
        value.localPath ||
        value.thumbDataUrl ||
        value.url
      : null;
    const loadable = !!src && /^(https?:|blob:|data:|\/)/.test(src);
    // 短标注：抓 label 里第一段中文（如「First frame · 首帧」→「首帧」），
    // 没有中文则回退完整 label。让三个上传框各自标清是首帧/尾帧/音频。
    const shortLabel = label.match(/[一-鿿]+/)?.[0] || label;
    return (
      <div className="mp-compact" onPaste={handleContainerPaste} title={label}>
        <input
          ref={fileRef}
          type="file"
          accept={mimeAccept(accept)}
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
        {value ? (
          <div className="mp-c-tile">
            {loadable ? (
              isVideo ? (
                <video src={src!} muted className="mp-c-media" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={src!} alt={value.name || "media"} className="mp-c-media" />
              )
            ) : (
              <span className="mp-c-ph" title="预览已失效，请重新上传">↻</span>
            )}
            <button
              type="button"
              className="mp-c-x"
              onClick={clear}
              title="移除"
              aria-label="clear"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="mp-c-addwrap">
            <button
              type="button"
              className="mp-c-add"
              onClick={() => setAddMenu((v) => !v)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
              title={label}
            >
              {uploading ? (
                <span className="mp-c-spin" />
              ) : (
                <span className="mp-c-plus">＋</span>
              )}
            </button>
            {addMenu && (
              <div className="mp-c-menu" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenu(false);
                    fileRef.current?.click();
                  }}
                >
                  ⬆ 本地文件
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenu(false);
                    setAssetOpen(true);
                  }}
                >
                  ⊞ 资产库
                </button>
              </div>
            )}
          </div>
        )}
        {err && <div className="mp-err mp-c-err">{err}</div>}
        <span className="mp-c-cap" title={label}>
          {shortLabel}
          {optional && <span className="mp-c-opt">选填</span>}
        </span>
        <AssetPicker
          open={assetOpen}
          accept={accept}
          onClose={() => setAssetOpen(false)}
          onPick={pickAsset}
        />
      </div>
    );
  }

  return (
    <div className="mp" onPaste={handleContainerPaste}>
      {/* Hidden file input — always mounted so the placeholder card and the
          drop zone can both invoke it via fileRef.current.click(). */}
      <input
        ref={fileRef}
        type="file"
        accept={mimeAccept(accept)}
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="pf-row-head">
        <span className="pf-label">{label}</span>
        {value && (
          <button
            type="button"
            className="pf-clear"
            onClick={clear}
            title="清除并重新选择"
            aria-label="clear"
          >
            × 清除
          </button>
        )}
      </div>

      {value ? (
        <div className="mp-preview">
          {(() => {
            // Pick the best loadable source:
            //   1. live blob: URL from this session (previewUrl)
            //   2. blob: URL rebuilt from IndexedDB (rehydratedPreview)
            //   3. inline thumbnail (thumbDataUrl, persisted in localStorage)
            //   4. http(s)/data URL (publicly fetchable)
            // oss:// has no rehydration source → fall back to text placeholder.
            const live =
              value.previewUrl && value.previewUrl.startsWith("blob:")
                ? value.previewUrl
                : null;
            // Order of preference: live blob → rehydrated IDB blob →
            // server-side localPath (survives cache clears) → inline thumb →
            // remote URL (oss:// usually unloadable).
            const src =
              live || rehydratedPreview || value.localPath || value.thumbDataUrl || value.url;
            const loadable = /^(https?:|blob:|data:|\/)/.test(src);
            if (!loadable) {
              // Make placeholder clickable: one tap re-opens the file picker.
              // Solves the "old uploads have no preview" problem — user clicks,
              // picks a file, new upload writes thumbDataUrl + localKey.
              return (
                <button
                  type="button"
                  className="mp-thumb mp-thumb-ph mp-thumb-ph-btn"
                  aria-label="点击重新上传以恢复预览"
                  title="点击重新上传以恢复预览"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                >
                  <span>OSS</span>
                  <span className="mp-thumb-ph-sub">点击重传</span>
                </button>
              );
            }
            return isVideo ? (
              <video src={src} controls muted className="mp-thumb" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={src}
                alt={value.name || "media"}
                className="mp-thumb mp-thumb-zoomable"
                title="点击放大 (ESC 关闭)"
                onClick={() => setLightboxSrc(src)}
              />
            );
          })()}
          <div className="mp-meta">
            <div className="mp-name" title={value.name}>
              {value.name || "—"}
            </div>
            <div className="mp-url" title={value.url}>
              {value.url.startsWith("oss://") ? "OSS uploaded" : value.url}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mp-tabs">
            <button
              type="button"
              className={`mp-tab${mode === "url" ? " on" : ""}`}
              onClick={() => setMode("url")}
            >
              URL
            </button>
            <button
              type="button"
              className={`mp-tab${mode === "file" ? " on" : ""}`}
              onClick={() => setMode("file")}
            >
              Upload
            </button>
            <button
              type="button"
              className="mp-tab mp-tab-asset"
              onClick={() => setAssetOpen(true)}
            >
              资产库
            </button>
          </div>

          {mode === "url" ? (
            <div className="mp-url-row">
              <input
                className="pf-input"
                type="url"
                placeholder="https://... or oss://..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitUrl();
                  }
                }}
              />
              <button
                type="button"
                className="mp-btn"
                onClick={commitUrl}
                disabled={!urlInput.trim()}
              >
                Set
              </button>
            </div>
          ) : (
            <div
              ref={dropRef}
              className="mp-drop"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <span className="mp-hint">Uploading to OSS…</span>
              ) : (
                <span className="mp-hint">
                  Drop {accept.replace("|", " / ")} · click · or paste ⌘V
                </span>
              )}
            </div>
          )}
        </>
      )}

      {err && <div className="mp-err">{err}</div>}

      {lightboxSrc && (
        <div
          className="mp-lightbox"
          role="dialog"
          aria-label="image preview"
          onClick={() => setLightboxSrc(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt={value?.name || "preview"}
            className="mp-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="mp-lightbox-close"
            onClick={() => setLightboxSrc(null)}
            title="关闭 (ESC)"
            aria-label="close"
          >
            ×
          </button>
          <div className="mp-lightbox-hint">ESC 关闭</div>
        </div>
      )}

      <AssetPicker
        open={assetOpen}
        accept={accept}
        onClose={() => setAssetOpen(false)}
        onPick={pickAsset}
      />
    </div>
  );
}
