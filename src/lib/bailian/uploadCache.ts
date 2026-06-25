import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { putOssObject, ossUploadKey, isOssConfigured } from "@/lib/storage/oss";

/**
 * Content-addressed cache for Bailian OSS uploads.
 *
 * Hash the raw file bytes (SHA-256). When the same bytes are uploaded again
 * within the TTL, return the existing `oss://` reference instead of re-uploading.
 *
 * Bailian doesn't publish the exact retention for `oss://` upload URLs;
 * we conservatively expire entries after TTL_MS. Stale entries are purged
 * lazily on read.
 */

const CACHE_PATH = path.join(process.cwd(), "data", "upload-cache.json");
const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — conservative

export interface UploadCacheEntry {
  ossUrl: string;
  modelName: string;
  savedAt: number;
  size: number;
  filename?: string;
  /** Local path served at /api/uploads/<sha>.<ext>. */
  localExt?: string;
  /** OSS sidecar key（OSS_ENABLED + 凭证齐时设置）。
   *  /api/uploads/<sha> 本地缺失时,有这个就直接 sign + redirect,省一次 head */
  ossSideKey?: string;
}

/** Persist upload bytes to disk so they survive IDB/localStorage clears.
 *
 *  返回 `{ ext, isNew }`：
 *    - `ext`：从 filename 末段截出来的扩展名（已做 lowercase）
 *    - `isNew`：本次调用是否真正写了新文件（已存在则 false，相同 sha 重复上传）
 *
 *  注意：OSS sidecar 不在本函数内触发，调用方需要在合适时机（如 `/api/bailian/upload`
 *  完成 `putCache` 之后）调用 `triggerUploadOssSidecar(buf, sha, ext)` —— 否则会因为
 *  OSS 上传比 `putCache` 快几秒，sidecar 写回时 `cache[sha]` 还不存在导致 `ossSideKey` 永远丢失。 */
export async function persistUploadBytes(
  buf: Buffer,
  sha: string,
  filename: string
): Promise<{ ext: string; isNew: boolean }> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  // Pick extension from original filename (fall back to bin).
  const m = filename.match(/\.([a-zA-Z0-9]{1,8})$/);
  const ext = (m ? m[1] : "bin").toLowerCase();
  const filePath = path.join(UPLOADS_DIR, `${sha}.${ext}`);
  let isNew = false;
  try {
    await fs.access(filePath); // already exists
  } catch {
    await fs.writeFile(filePath, buf);
    isNew = true;
  }
  return { ext, isNew };
}

/** Fire-and-forget 触发 OSS sidecar 上传 + 写回 ossSideKey。
 *
 *  时序约定：**调用方必须在 `putCache(sha, ...)` 之后再调本函数**。
 *  原因：sidecar 写回逻辑依赖 `cache[sha]` 已存在 —— OSS 上传通常 100ms~几秒，
 *  比单纯 `putCache` 慢很多，但如果在 `putCache` 之前触发，常见路径上 sidecar
 *  早 1~2 秒完成（DashScope `uploadToOss` 占大头），写回时 `cache[sha]` 尚未
 *  存在，`ossSideKey` 永远丢失，第四层兜底退化为"猜 key + head"。
 *
 *  OSS_ENABLED=false / `isNew=false` 时上层应跳过此调用，本函数内只判
 *  `isOssConfigured` 做最后保险。 */
export function triggerUploadOssSidecar(
  buf: Buffer,
  sha: string,
  ext: string
): void {
  if (!isOssConfigured()) return;
  void uploadOssSidecarAsync(buf, sha, ext);
}

/** 异步推 OSS sidecar + 写回 ossSideKey 到 cache。失败仅 log,不抛错。 */
async function uploadOssSidecarAsync(buf: Buffer, sha: string, ext: string): Promise<void> {
  const key = ossUploadKey(sha, ext);
  const mime = guessMime(ext);
  const okKey = await putOssObject(key, buf, mime);
  if (!okKey) return;
  // 写回 cache —— 后续 fallback 时无需 head 即可直接 sign
  try {
    const c = await loadCache();
    if (c[sha]) {
      c[sha].ossSideKey = okKey;
      await saveCache(c);
    }
  } catch (err) {
    console.error("[uploadCache] write ossSideKey to cache failed:", err);
  }
}

export async function readUpload(sha: string, ext: string): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const filePath = path.join(UPLOADS_DIR, `${sha}.${ext}`);
    const buf = await fs.readFile(filePath);
    const mime = guessMime(ext);
    return { buf, mime };
  } catch {
    return null;
  }
}

function guessMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "mp4": return "video/mp4";
    case "webm": return "video/webm";
    default: return "application/octet-stream";
  }
}

type CacheFile = Record<string, UploadCacheEntry>;

async function loadCache(): Promise<CacheFile> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveCache(c: CacheFile): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(c, null, 2));
}

export function hashBytes(buf: Buffer | Uint8Array): string {
  const h = createHash("sha256");
  h.update(buf);
  return h.digest("hex");
}

/** True when an OSS URL's key contains chars that DashScope's GET will fail
 *  to decode (non-ASCII, full-width punct, spaces). Such URLs were written
 *  by pre-sanitize-fix uploads — the bytes never landed at a key DashScope
 *  can fetch back. Treat them as "needs re-upload" so the cache invalidates. */
function hasUnsafeOssKey(ossUrl: string | undefined): boolean {
  if (!ossUrl) return false;
  // After oss://<bucket>/ the rest is the key. Allow only ASCII-safe chars
  // (alnum, `/`, `.`, `_`, `-`). Anything else means a stale legacy key.
  const m = ossUrl.match(/^oss:\/\/[^/]+\/(.+)$/);
  if (!m) return false;
  return /[^A-Za-z0-9/._-]/.test(m[1]);
}

/** Return a still-fresh cached entry or null. Purges expired entries on the fly. */
export async function getCached(sha: string): Promise<UploadCacheEntry | null> {
  const c = await loadCache();
  const now = Date.now();
  let dirty = false;
  for (const [k, v] of Object.entries(c)) {
    if (now - v.savedAt > TTL_MS || hasUnsafeOssKey(v.ossUrl)) {
      delete c[k];
      dirty = true;
    }
  }
  const entry = c[sha];
  if (!entry || now - entry.savedAt > TTL_MS || hasUnsafeOssKey(entry.ossUrl)) {
    if (dirty) await saveCache(c);
    return null;
  }
  if (dirty) await saveCache(c);
  return entry;
}

export async function putCache(sha: string, entry: UploadCacheEntry): Promise<void> {
  const c = await loadCache();
  c[sha] = entry;
  await saveCache(c);
}
