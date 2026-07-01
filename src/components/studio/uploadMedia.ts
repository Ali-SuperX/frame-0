import type { Job, JobMedia } from "@/lib/store";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { storeLocalFile, readLocalFile } from "@/lib/editor/localFiles";
import { normalizeLocalUploadPath } from "@/lib/mediaPaths";

/** Map of common extensions → MIME types. Used to repair File objects whose
 *  `.type` is empty (chrome-devtools setInputFiles, some clipboard pastes,
 *  drag-drop from terminals) so downstream image/video logic stops false-failing. */
const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Return a File whose `.type` is set — re-wrapping if necessary. Empty `type`
 *  breaks makeThumb / video detection downstream; we repair it at the entry
 *  point so every helper that reads `.type` sees a normalized value. */
export function ensureFileType(file: File): File {
  if (file.type) return file;
  const guessed = EXT_MIME[extOf(file.name)];
  if (!guessed) return file;
  return new File([file], file.name, { type: guessed, lastModified: file.lastModified });
}

/** True when `file` looks like an image — by `type` OR by extension fallback. */
export function isImageFile(file: File): boolean {
  return file.type?.startsWith("image/") || /^(png|jpg|jpeg|webp|gif|avif|bmp)$/i.test(extOf(file.name));
}

// DashScope/Bailian 图片硬约束 — 预校验避免提交后才暴露错。
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MIN_IMAGE_EDGE = 300;
export const MIN_HW_RATIO = 0.40;
export const MAX_HW_RATIO = 2.50;

/** 同步 size 校验。视频也走这条 (上限相同)。 */
export function validateUploadSize(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name || "图片"} 大小 ${mb} MB 超过 20 MB 上限`;
  }
  return null;
}

/** 异步 dimension + ratio 校验。视频/解码失败时返回 null，让后端兜底。
 *  双路径解码与 makeThumb 一致：createImageBitmap 优先、Image 元素兜底。 */
export async function validateImageDimensions(file: File): Promise<string | null> {
  if (!isImageFile(file)) return null;
  let w = 0, h = 0;
  try {
    const bm = await createImageBitmap(file);
    w = bm.width; h = bm.height;
    bm.close?.();
  } catch {
    try {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const el = new Image();
          el.onload = () => res(el);
          el.onerror = () => rej(new Error("decode failed"));
          el.src = url;
        });
        w = img.naturalWidth; h = img.naturalHeight;
      } finally { URL.revokeObjectURL(url); }
    } catch { return null; }
  }
  if (w < MIN_IMAGE_EDGE || h < MIN_IMAGE_EDGE) {
    return `${file.name || "图片"} 分辨率 ${w}×${h} 太小（最低 ${MIN_IMAGE_EDGE}×${MIN_IMAGE_EDGE}）`;
  }
  const ratio = h / w;
  if (ratio < MIN_HW_RATIO || ratio > MAX_HW_RATIO) {
    return `${file.name || "图片"} 宽高比 H/W=${ratio.toFixed(2)} 超出允许范围 ${MIN_HW_RATIO}–${MAX_HW_RATIO}`;
  }
  return null;
}

// HappyHorse Video Edit 硬约束
const VE_MAX_BYTES = 100 * 1024 * 1024;
const VE_MIN_DURATION = 3;
const VE_MAX_DURATION = 60;
const VE_MAX_LONG_EDGE = 4096;
const VE_MIN_SHORT_EDGE = 360;
const VE_MIN_RATIO = 1 / 2.5;
const VE_MAX_RATIO = 2.5;
const VE_MIN_FPS = 8;

/** 视频校验（VE 模式）—— 格式/大小/时长/分辨率/宽高比/帧率 */
export async function validateVideoFile(file: File): Promise<string | null> {
  const ext = extOf(file.name);
  const mime = file.type || EXT_MIME[ext] || "";
  if (!mime.startsWith("video/") && !["mp4", "mov", "webm", "m4v"].includes(ext)) {
    return `仅支持 MP4/MOV 格式视频（当前：${file.name}）`;
  }
  if (file.size > VE_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `视频大小 ${mb} MB 超过 100 MB 上限`;
  }
  // 异步校验时长和分辨率
  try {
    const url = URL.createObjectURL(file);
    try {
      const meta = await new Promise<{ w: number; h: number; dur: number; fps: number }>((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          const w = v.videoWidth;
          const h = v.videoHeight;
          const dur = v.duration;
          // 帧率无法从 HTMLVideoElement 直接获取，兜底假设 OK
          resolve({ w, h, dur, fps: 30 });
        };
        v.onerror = () => reject(new Error("视频元数据读取失败"));
        v.src = url;
      });
      if (!Number.isFinite(meta.dur)) {
        return "无法读取视频时长，请确认文件未损坏";
      }
      if (meta.dur < VE_MIN_DURATION) {
        return `视频时长 ${meta.dur.toFixed(1)}s 不足 ${VE_MIN_DURATION}s 最低要求`;
      }
      if (meta.dur > VE_MAX_DURATION) {
        return `视频时长 ${meta.dur.toFixed(0)}s 超过 ${VE_MAX_DURATION}s 上限`;
      }
      const longEdge = Math.max(meta.w, meta.h);
      const shortEdge = Math.min(meta.w, meta.h);
      if (longEdge > VE_MAX_LONG_EDGE) {
        return `视频分辨率 ${meta.w}×${meta.h}：长边 ${longEdge}px 超过 ${VE_MAX_LONG_EDGE}px 上限`;
      }
      if (shortEdge < VE_MIN_SHORT_EDGE) {
        return `视频分辨率 ${meta.w}×${meta.h}：短边 ${shortEdge}px 不足 ${VE_MIN_SHORT_EDGE}px`;
      }
      const ratio = meta.w / meta.h;
      if (ratio < VE_MIN_RATIO || ratio > VE_MAX_RATIO) {
        return `视频宽高比 ${ratio.toFixed(2)} 超出允许范围（1:2.5 ~ 2.5:1）`;
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    // 元数据读取失败不阻塞，让后端兜底
    console.warn("[validateVideoFile]", e);
  }
  return null;
}

/** 统一入口：size → dimension/video 顺序，命中即返。 */
export async function validateUploadFile(file: File): Promise<string | null> {
  const ext = extOf(file.name);
  const mime = file.type || EXT_MIME[ext] || "";
  // 视频文件走视频校验
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(ext)) {
    return await validateVideoFile(file);
  }
  // 图片走原有校验
  const sizeErr = validateUploadSize(file);
  if (sizeErr) return sizeErr;
  return await validateImageDimensions(file);
}

/**
 * Generate a tiny base64 thumbnail from an image file. Used to persist a
 * lightweight preview alongside the OSS URL so the thumbnail is visible
 * immediately after a page reload (no async IDB read needed).
 *
 * Two decode paths: `createImageBitmap` (fast, modern) then `<img>` element
 * (universal fallback for browsers that reject Files with empty `.type`).
 *
 * Returns `null` for non-image files or if both decoders fail.
 */
export async function makeThumb(
  file: File,
  maxSize = 240,
  quality = 0.78
): Promise<string | null> {
  if (!isImageFile(file)) return null;

  // Path 1: createImageBitmap — fast, zero-copy on most browsers.
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      return canvas.toDataURL("image/jpeg", quality);
    }
  } catch {
    /* fall through to <img> path */
  }

  // Path 2: HTMLImageElement — works even when File.type is empty.
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("img decode failed"));
        el.src = url;
      });
      const ratio = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * SHA-256 hex of a File's raw bytes. This matches the server-side cache key.
 */
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function registerUploadedMedia(input: {
  file: File;
  sha: string;
  ossUrl: string;
  ext?: string;
  modelName: string;
}): Promise<string | undefined> {
  const fd = new FormData();
  fd.append("sha", input.sha);
  fd.append("ossUrl", input.ossUrl);
  fd.append("filename", input.file.name);
  fd.append("size", String(input.file.size));
  fd.append("model", input.modelName);
  if (input.ext) fd.append("ext", input.ext);
  fd.append("file", input.file, input.file.name);
  const res = await fetch("/api/bailian/upload/register", {
    method: "POST",
    body: fd,
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    localPath?: string;
  };
  if (!res.ok) throw new Error(body.error || `register HTTP ${res.status}`);
  return normalizeLocalUploadPath(body.localPath);
}

/**
 * Upload a single file to OSS via browser-direct POST, persist the original
 * bytes to IndexedDB (for reload-proof previews), and generate an inline
 * thumbnail. Returns a fully-populated JobMedia.
 *
 * Shared by MediaPicker (single) and MediaMultiPicker (batch).
 *
 * @throws when the policy request, OSS direct upload, or register request fails.
 */
export async function uploadMediaFile(
  rawFile: File,
  modelName: string
): Promise<JobMedia> {
  // Normalize MIME type at the entry — every downstream consumer (makeThumb,
  // video detection, OSS sanitize) reads `file.type` and silently no-ops on
  // empty values. chrome-devtools' setInputFiles in particular always feeds
  // files with `type === ""`, which was the trigger for the "OSS placeholder"
  // bug after batch uploads.
  const file = ensureFileType(rawFile);
  const previewUrl = URL.createObjectURL(file);
  const sha = await sha256Hex(file);

  const policyRes = await fetch("/api/bailian/upload/policy", {
    method: "POST",
    headers: { ...apiKeysHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ sha, filename: file.name, model: modelName }),
  });
  const p = (await policyRes.json().catch(() => ({}))) as {
    cached?: boolean;
    ossUrl?: string;
    localPath?: string;
    error?: string;
    upload_host?: string;
    fields?: Record<string, string>;
    safeFilename?: string;
    ext?: string;
    mirrorRequired?: boolean;
    registerRequired?: boolean;
  };
  if (!policyRes.ok) throw new Error(p.error || `policy HTTP ${policyRes.status}`);

  let ossUrl: string;
  let localPath: string | undefined;
  if (p.cached) {
    ossUrl = p.ossUrl!;
    localPath = normalizeLocalUploadPath(p.localPath);
    if (p.registerRequired || p.mirrorRequired) {
      localPath =
        (await registerUploadedMedia({ file, sha, ossUrl, ext: p.ext, modelName })) ??
        localPath;
    }
  } else {
    const fd = new FormData();
    for (const [k, v] of Object.entries(p.fields ?? {})) fd.append(k, v);
    if (p.safeFilename) fd.append("file", file, p.safeFilename);
    else fd.append("file", file);
    const upRes = await fetch(p.upload_host!, { method: "POST", body: fd });
    if (!upRes.ok && upRes.status !== 204) {
      throw new Error(
        `OSS direct upload failed: ${upRes.status} ${(await upRes.text()).slice(0, 200)}`
      );
    }
    ossUrl = p.ossUrl!;
    localPath =
      (await registerUploadedMedia({ file, sha, ossUrl, ext: p.ext, modelName })) ??
      normalizeLocalUploadPath(p.localPath);
  }

  // Persist original bytes to IndexedDB so the preview survives reloads.
  const localKey = `mp-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  try {
    await storeLocalFile(localKey, file);
  } catch {
    /* IDB unavailable / quota — preview still works for current session */
  }
  const thumbDataUrl = await makeThumb(file);
  return {
    name: file.name,
    url: ossUrl,
    previewUrl,
    mime: file.type,
    localKey,
    thumbDataUrl: thumbDataUrl ?? undefined,
    localPath,
  };
}

/**
 * Upload a base64 `data:` URL (e.g. a frame extracted from a video) to OSS and
 * return the resulting `oss://` URL.
 *
 * Extracted frames are `data:` URLs which DashScope (HappyHorse especially)
 * cannot fetch — any frame reused as a job reference / first frame MUST go
 * through this first. Shared by the continuation panels and the R2V workspace.
 *
 * @throws when the upload request fails.
 */
/**
 * @deprecated prefer {@link uploadDataUrlAsMedia} —— 旧版本只返 ossUrl，
 * 上层拿不到 localPath / sha 做缩略图回填，会导致后续 reload 后该帧裂成 OSS 占位符。
 * 保留这个返回字符串的版本仅为兼容已有调用点，新代码请用对象版本。
 */
export async function uploadDataUrlToOss(
  dataUrl: string,
  name: string,
  modelId: string
): Promise<string> {
  return (await uploadDataUrlAsMedia(dataUrl, name, modelId)).ossUrl;
}

/** 上传一段 data:URL 到 OSS，并返回足以重建预览的所有字段。 */
export async function uploadDataUrlAsMedia(
  dataUrl: string,
  name: string,
  modelId: string
): Promise<{ ossUrl: string; localPath?: string; sha?: string }> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type || "image/jpeg" }));
  fd.append("model", modelId);
  const res = await fetch("/api/bailian/upload", {
    method: "POST",
    headers: apiKeysHeader(),
    body: fd,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(j.error || `upload failed: ${res.status}`);
  }
  const j = await res.json();
  return {
    ossUrl: j.ossUrl as string,
    localPath: normalizeLocalUploadPath(j.localPath as string | undefined),
    sha: j.sha as string | undefined,
  };
}

/**
 * True when an `oss://dashscope-instant/...` URL was uploaded before today.
 *
 * That bucket is temporary — DashScope GCs the objects after a short
 * retention, so a URL whose embedded date (`.../<YYYY-MM-DD>/...`) is from an
 * earlier day can no longer be fetched ("OSS Resource ... not exist").
 * Same-day URLs are treated as fresh, so an immediate generate-after-upload
 * costs nothing extra.
 */
function isStaleOssUrl(url: string | undefined): boolean {
  if (!url || !url.startsWith("oss://dashscope-instant/")) return false;
  // Pre-sanitize-fix uploads embedded raw filename (中文 / 全角逗号 / 空格)
  // into the OSS key. DashScope's GET can't decode those back to the stored
  // key → permanent "OSS Resource ... not exist" regardless of date. Force
  // re-upload so the new sanitized key lands somewhere DashScope can fetch.
  const keyMatch = url.match(/^oss:\/\/[^/]+\/(.+)$/);
  if (keyMatch && /[^A-Za-z0-9/._-]/.test(keyMatch[1])) return true;
  const m = url.match(/\/(\d{4}-\d{2}-\d{2})\//);
  if (!m) return true; // no readable date → re-upload to be safe
  return m[1] < new Date().toISOString().slice(0, 10);
}

/**
 * Recover a media item's bytes from a local copy — IndexedDB original, then
 * the server-side mirror, then the inline thumbnail. Returns null when nothing
 * local is available.
 */
async function recoverMediaBlob(m: JobMedia): Promise<Blob | null> {
  if (m.localKey) {
    try {
      const b = await readLocalFile(m.localKey);
      if (b) return b;
    } catch {
      /* fall through */
    }
  }
  for (const src of [normalizeLocalUploadPath(m.localPath), m.thumbDataUrl]) {
    if (!src) continue;
    try {
      const res = await fetch(src);
      if (res.ok) return await res.blob();
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** Re-upload one media item when its temporary OSS URL has expired; otherwise
 *  return it untouched. Returns the item with a `__unrecoverable: true` marker
 *  attached (extra prop, no schema impact) when no local copy is available
 *  for refresh — the submit layer surfaces this as a friendly "请重新上传"
 *  error rather than letting DashScope return "OSS Resource ... not exist". */
async function refreshOne(m: JobMedia, modelId: string): Promise<JobMedia> {
  if (!isStaleOssUrl(m.url)) return m;
  try {
    const blob = await recoverMediaBlob(m);
    if (!blob) {
      console.warn(
        "[refreshStaleMedia] cannot recover media —",
        "name:", m.name, "url:", m.url,
        "hasLocalKey:", !!m.localKey, "hasLocalPath:", !!m.localPath,
        "hasThumbDataUrl:", !!m.thumbDataUrl
      );
      return { ...m, __unrecoverable: true } as JobMedia;
    }
    const file = new File([blob], m.name || "media", {
      type: m.mime || blob.type || "image/jpeg",
    });
    const fresh = await uploadMediaFile(file, modelId);
    // Swap in the fresh URL + paths; keep the original name + thumbnail.
    return {
      ...m,
      url: fresh.url,
      localPath: fresh.localPath,
      localKey: fresh.localKey ?? m.localKey,
      thumbDataUrl: m.thumbDataUrl ?? fresh.thumbDataUrl,
    };
  } catch (err) {
    console.warn("[refreshStaleMedia] refresh failed for", m.name, err);
    return { ...m, __unrecoverable: true } as JobMedia;
  }
}

/**
 * Refresh every media input whose temporary `oss://dashscope-instant` URL has
 * expired, re-uploading the bytes from the local copy. Fresh URLs are left
 * untouched — a same-session submit costs nothing extra.
 *
 * Called right before submit so reused media (re-run / extend / R2V workspace)
 * no longer fails with "OSS Resource ... not exist".
 */
export async function refreshStaleMedia(
  media: Job["media"],
  modelId: string
): Promise<Job["media"]> {
  const img_url = media.img_url
    ? await refreshOne(media.img_url, modelId)
    : undefined;
  const reference_urls = media.reference_urls
    ? await Promise.all(media.reference_urls.map((m) => refreshOne(m, modelId)))
    : undefined;
  const video_url = media.video_url
    ? await refreshOne(media.video_url, modelId)
    : undefined;
  const ref_images = media.ref_images
    ? await Promise.all(media.ref_images.map((m) => refreshOne(m, modelId)))
    : undefined;
  const last_frame_url = media.last_frame_url
    ? await refreshOne(media.last_frame_url, modelId)
    : undefined;
  const first_clip_url = media.first_clip_url
    ? await refreshOne(media.first_clip_url, modelId)
    : undefined;
  const audio_url = media.audio_url
    ? await refreshOne(media.audio_url, modelId)
    : undefined;
  return { img_url, last_frame_url, first_clip_url, audio_url, reference_urls, video_url, ref_images };
}
