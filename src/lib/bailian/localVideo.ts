import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { putOssObject, ossVideoKey, isOssConfigured } from "@/lib/storage/oss";

const VIDEO_DIR = path.join(process.cwd(), "data", "videos");

export interface LocalVideoMeta {
  taskId: string;
  jobId?: string;
  modelId?: string;
  mode?: string;
  prompt?: string;
  negativePrompt?: string;
  /** Full submit params (resolution/ratio/duration/etc.). */
  params?: Record<string, unknown>;
  /** Full input media (img_url/reference_urls/etc.). */
  media?: Record<string, unknown>;
  title?: string;
  videoFile: string;
  mime: string;
  savedAt: number;
  /** OSS sidecar key（OSS_ENABLED + 凭证齐时设置）。
   *  /api/videos/<taskId> 本地缺失时,有这个就直接 sign + redirect */
  ossSideKey?: string;
}

async function ensureDir() {
  await fs.mkdir(VIDEO_DIR, { recursive: true });
}

export function videoDir() {
  return VIDEO_DIR;
}

export async function saveVideo(
  taskId: string,
  videoUrl: string,
  meta?: Partial<Omit<LocalVideoMeta, "taskId" | "videoFile" | "mime" | "savedAt">>
): Promise<{ localPath: string; meta: LocalVideoMeta }> {
  await ensureDir();
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "video/mp4";
  const ext = ct.includes("webm") ? "webm" : "mp4";
  const filename = `${taskId}.${ext}`;
  const filePath = path.join(VIDEO_DIR, filename);
  await fs.writeFile(filePath, buf);

  // OSS sidecar —— 异步推一份到用户自己的 OSS,失败仅 log。
  // 推完成后异步 updateVideoMeta 写回 ossSideKey,供后续 /api/videos/<taskId> fallback 用
  if (isOssConfigured()) {
    void uploadOssSidecarAsync(buf, taskId, ext, ct);
  }

  // Merge with any existing meta (so caller can update later).
  const jsonPath = path.join(VIDEO_DIR, `${taskId}.json`);
  let prior: Partial<LocalVideoMeta> = {};
  try {
    prior = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
  } catch { /* first save */ }

  const metaObj: LocalVideoMeta = {
    ...prior,
    ...meta,
    taskId,
    videoFile: filename,
    mime: ct,
    savedAt: Date.now(),
  };
  await fs.writeFile(jsonPath, JSON.stringify(metaObj, null, 2));

  return { localPath: `/api/videos/${taskId}`, meta: metaObj };
}

/** Update the metadata JSON in-place without re-downloading the video. */
export async function updateVideoMeta(
  taskId: string,
  patch: Partial<LocalVideoMeta>
): Promise<void> {
  await ensureDir();
  const jsonPath = path.join(VIDEO_DIR, `${taskId}.json`);
  let prior: Partial<LocalVideoMeta> = {};
  try {
    prior = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
  } catch {
    return; // nothing to update
  }
  const next = { ...prior, ...patch };
  await fs.writeFile(jsonPath, JSON.stringify(next, null, 2));
}

export async function listLocalVideos(): Promise<LocalVideoMeta[]> {
  await ensureDir();
  const files = await fs.readdir(VIDEO_DIR);
  const metas: LocalVideoMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(VIDEO_DIR, f), "utf-8");
      metas.push(JSON.parse(raw));
    } catch {
      /* skip corrupt */
    }
  }
  return metas;
}

export async function getVideoPath(
  taskId: string
): Promise<{ filePath: string; mime: string } | null> {
  const jsonPath = path.join(VIDEO_DIR, `${taskId}.json`);
  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    const meta: LocalVideoMeta = JSON.parse(raw);
    const filePath = path.join(VIDEO_DIR, meta.videoFile);
    await fs.access(filePath);
    return { filePath, mime: meta.mime };
  } catch {
    return null;
  }
}

/** 读 meta.json,不要求视频文件存在 —— 用于 OSS fallback 从 meta 拿 ossSideKey */
export async function readVideoMeta(taskId: string): Promise<LocalVideoMeta | null> {
  const jsonPath = path.join(VIDEO_DIR, `${taskId}.json`);
  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    return JSON.parse(raw) as LocalVideoMeta;
  } catch {
    return null;
  }
}

/** 异步推 OSS sidecar + 写回 ossSideKey 到 meta.json。失败仅 log,不抛错。 */
async function uploadOssSidecarAsync(
  buf: Buffer,
  taskId: string,
  ext: string,
  mime: string,
): Promise<void> {
  const key = ossVideoKey(taskId, ext);
  const okKey = await putOssObject(key, buf, mime);
  if (!okKey) return;
  try {
    await updateVideoMeta(taskId, { ossSideKey: okKey });
  } catch (err) {
    console.error("[localVideo] write ossSideKey to meta failed:", err);
  }
}
