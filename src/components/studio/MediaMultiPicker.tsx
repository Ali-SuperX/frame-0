"use client";

import { useEffect, useRef, useState } from "react";
import type { JobMedia } from "@/lib/store";
import { deleteLocalFile, readLocalFile } from "@/lib/editor/localFiles";
import { uploadMediaFile, validateUploadFile } from "./uploadMedia";

type Accept = "image" | "video" | "audio" | "image|video";

type Props = {
  label: string;
  accept: Accept;
  value?: JobMedia[];
  onChange: (v: JobMedia[] | undefined) => void;
  maxCount?: number;
  modelName: string;
};

/** Per-slot tag — matches the prompt reference syntax (character1, clip1…). */
function slotTag(accept: Accept, i: number): string {
  if (accept === "image") return `character${i + 1}`;
  if (accept === "video") return `clip${i + 1}`;
  if (accept === "audio") return `audio${i + 1}`;
  return `ref${i + 1}`;
}

function mimeAccept(accept: Accept): string {
  if (accept === "image") return "image/*";
  if (accept === "video") return "video/*";
  if (accept === "audio") return "audio/*";
  return "image/*,video/*";
}

/** Best loadable preview source for an uploaded item, or null.
 *
 *  Priority is reload-survivability first:
 *    1. `localPath` — server-side mirror (`/api/uploads/<sha>.ext`) — survives
 *       both reload and the OSS sidecar's 24h GC. Highest priority.
 *    2. `previewUrl` (blob:) — fastest in-session source, but dies on reload.
 *    3. `thumbDataUrl` (data:/http:) — tiny inline base64, survives reload.
 *       (Skipping blob: variants — historical bug wrote dead blob URLs here.)
 *    4. `url` (http/data/absolute) — original public URL. oss:// is rejected;
 *       the browser can't fetch it and MediaTile rehydrates from IDB instead.
 *
 *  Returning null tells MediaTile "no static source — use IDB rehydrate or a
 *  loading placeholder." Picking localPath first makes the tile stable across
 *  the entire upload → submit → reload lifecycle, eliminating the flash where
 *  blob: dies first and the placeholder shows before rehydrate finishes. */
function staticSrc(m: JobMedia): string | null {
  if (m.localPath && /^(https?:|\/)/.test(m.localPath)) return m.localPath;
  const live = m.previewUrl?.startsWith("blob:") ? m.previewUrl : null;
  if (live) return live;
  if (m.thumbDataUrl && /^(data:|https?:)/.test(m.thumbDataUrl))
    return m.thumbDataUrl;
  if (m.url && /^(https?:|data:|\/)/.test(m.url)) return m.url;
  return null;
}

/**
 * Multi-media picker — a compact thumbnail tray.
 *
 * One drop/click zone takes **multiple files at once** (drag many, OS
 * multi-select, or ⌘V paste). Uploaded items render as small thumbnail tiles,
 * each tagged character1/character2… by position and removable individually.
 * A trailing "+" tile and a fallback URL row keep adding until `maxCount`.
 */
export default function MediaMultiPicker({
  label,
  accept,
  value,
  onChange,
  maxCount = 5,
  modelName,
}: Props) {
  const items = value ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  // `value` changes between the sequential awaits of a multi-file batch — a
  // ref always holds the freshest array so progressive appends never clobber.
  // Sync via effect (not render) — React 19 strict `react-hooks/refs` rule.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  // Count of in-flight uploads — rendered as placeholder tiles.
  const [uploading, setUploading] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Click an image tile → fullscreen lightbox; ESC / backdrop closes.
  const [lightbox, setLightbox] = useState<string | null>(null);

  const full = items.length + uploading >= maxCount;

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setErr(null);
    // Respect the remaining room — silently drop the overflow.
    const room = maxCount - items.length - uploading;
    const batch = files.slice(0, Math.max(0, room));
    if (!batch.length) return;

    // 预校验：DashScope 硬约束 (size/dimension/ratio) 提前阻拦，
    // 跳过超限者、其余照传 — 避免提交后整批渲染失败。
    const ok: File[] = [];
    const rejected: string[] = [];
    for (const f of batch) {
      const ve = await validateUploadFile(f);
      if (ve) rejected.push(ve);
      else ok.push(f);
    }
    if (rejected.length) {
      setErr(
        rejected.length === 1
          ? rejected[0]
          : `${rejected.length} 张图未通过校验：\n${rejected.join("\n")}`
      );
    }
    if (!ok.length) return;

    setUploading((n) => n + ok.length);
    for (const f of ok) {
      try {
        const m = await uploadMediaFile(f, modelName);
        onChange([...(valueRef.current ?? []), m]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeAt(i: number) {
    const it = items[i];
    if (it?.localKey) void deleteLocalFile(it.localKey).catch(() => {});
    if (it?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
    const next = items.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  }

  function clearAll() {
    for (const it of items) {
      if (it.localKey) void deleteLocalFile(it.localKey).catch(() => {});
      if (it.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
    }
    onChange(undefined);
  }

  function commitUrl() {
    const v = urlInput.trim();
    if (!v || full) return;
    onChange([...items, { url: v, name: v.split("/").pop() }]);
    setUrlInput("");
  }

  function onPaste(e: React.ClipboardEvent) {
    const files: File[] = [];
    for (const it of Array.from(e.clipboardData.items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  const empty = items.length === 0 && uploading === 0;

  return (
    <div className="mmt" onPaste={onPaste}>
      <input
        ref={fileRef}
        type="file"
        accept={mimeAccept(accept)}
        multiple
        hidden
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div className="mmt-head">
        <span className="mmt-label">{label}</span>
        <div className="mmt-head-r">
          <span className={`mmt-count${full ? " full" : ""}`}>
            {items.length}/{maxCount}
          </span>
          {items.length > 0 && (
            <button type="button" className="mmt-clear" onClick={clearAll}>
              清空
            </button>
          )}
        </div>
      </div>

      <div
        className={`mmt-tray${dragOver ? " over" : ""}${empty ? " empty" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {items.map((m, i) => (
          <MediaTile
            key={`${m.localKey || m.url || ""}-${i}`}
            media={m}
            tag={slotTag(accept, i)}
            onZoom={(src) => setLightbox(src)}
            onRemove={() => removeAt(i)}
          />
        ))}

        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="mmt-tile mmt-tile-loading">
            <span className="mmt-spin" />
          </div>
        ))}

        {!full && (
          <button
            type="button"
            className="mmt-add"
            onClick={() => fileRef.current?.click()}
          >
            <span className="mmt-add-plus">+</span>
            <span className="mmt-add-label">
              {empty ? "上传图片 · 可一次多选 / 拖入" : "添加"}
            </span>
          </button>
        )}
      </div>

      {!full && (
        <div className="mmt-url">
          <input
            className="mmt-url-input"
            type="url"
            placeholder="或粘贴图片 URL，回车添加…"
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
            className="mmt-url-set"
            onClick={commitUrl}
            disabled={!urlInput.trim()}
          >
            添加
          </button>
        </div>
      )}

      {err && <div className="mmt-err">{err}</div>}

      {lightbox && (
        <div
          className="mp-lightbox"
          role="dialog"
          aria-label="image preview"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="preview"
            className="mp-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="mp-lightbox-close"
            onClick={() => setLightbox(null)}
            title="关闭 (ESC)"
            aria-label="close"
          >
            ×
          </button>
          <div className="mp-lightbox-hint">ESC 关闭</div>
        </div>
      )}
    </div>
  );
}

/* ─────────── tile ───────────
 * 单个缩略图。优先级：本会话 live blob → IDB rehydrate 出的 blob → 静态可渲染源。
 * onError 触发后再回退一档，避免半路 src 失效后留下白板。 */
function MediaTile({
  media,
  tag,
  onZoom,
  onRemove,
}: {
  media: JobMedia;
  tag: string;
  onZoom: (src: string) => void;
  onRemove: () => void;
}) {
  const [rehydrated, setRehydrated] = useState<string | null>(null);
  const [rehydrating, setRehydrating] = useState(false);
  const [failed, setFailed] = useState(false);

  // Rehydrate a fresh blob URL from IDB whenever there's no live preview but
  // we do have a localKey — covers reload + R2V flush-back where url is oss://
  // and thumbDataUrl is either missing or a dead blob. Tracks `rehydrating`
  // so the tile can show a spinner instead of a "broken" placeholder during
  // the IDB read window.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setRehydrated(null);
    setFailed(false);
    const live = media.previewUrl?.startsWith("blob:") ? media.previewUrl : null;
    const key = media.localKey;
    if (live || !key) {
      setRehydrating(false);
      return;
    }
    setRehydrating(true);
    (async () => {
      try {
        const blob = await readLocalFile(key);
        if (cancelled) return;
        if (!blob) {
          setRehydrating(false);
          return;
        }
        const typed = media.mime
          ? new Blob([blob], { type: media.mime })
          : blob;
        createdUrl = URL.createObjectURL(typed);
        setRehydrated(createdUrl);
      } catch {
        /* ignore — falls back to static src or placeholder */
      } finally {
        if (!cancelled) setRehydrating(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [media.localKey, media.previewUrl, media.mime]);

  const live = media.previewUrl?.startsWith("blob:") ? media.previewUrl : null;
  const fallback = staticSrc(media);
  const src = failed ? null : live || rehydrated || fallback;
  const isVideo =
    media.mime?.startsWith("video/") || /\.(mp4|mov|webm)/i.test(media.url);
  const zoomable = !!src && !isVideo;

  // When no src is available, pick the right placeholder state.
  // 用单色字形（继承文字颜色）—— 彩色 emoji 会被误读成「破图」。
  //   - rehydrating  → ⋯  (IDB 读取中, src 即将到达)
  //   - failed       → !  (<img> 加载失败)
  //   - otherwise    → ↻  (源已失效, 提示重新上传)
  let placeholder: { icon: string; cls: string; title: string } | null = null;
  if (!src) {
    if (rehydrating) {
      placeholder = { icon: "⋯", cls: "loading", title: "正在从本地恢复…" };
    } else if (failed) {
      placeholder = { icon: "!", cls: "error", title: "图片加载失败 — 源地址不可访问" };
    } else {
      placeholder = {
        icon: "↻",
        cls: "missing",
        title: `${media.name || media.url} — 预览已失效，请删除后重新上传`,
      };
    }
  }

  return (
    <div
      className={`mmt-tile${zoomable ? " zoom" : ""}`}
      title={zoomable ? "点击放大" : media.name || tag}
      onClick={zoomable && src ? () => onZoom(src) : undefined}
    >
      {src ? (
        isVideo ? (
          <video
            src={src}
            muted
            preload="none"
            className="mmt-tile-media"
            onError={() => setFailed(true)}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={tag}
            className="mmt-tile-media"
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <div className={`mmt-tile-ph mmt-tile-ph-${placeholder!.cls}`} title={placeholder!.title}>
          {placeholder!.icon}
        </div>
      )}
      <span className="mmt-tile-tag">{tag}</span>
      <button
        type="button"
        className="mmt-tile-x"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`移除 ${tag}`}
        title="移除"
      >
        ×
      </button>
    </div>
  );
}
