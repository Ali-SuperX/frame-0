/**
 * jobResultToFile —— 把一个成片 job 的「产出」还原成 File，方便重新上传到 OSS。
 *
 * 字节来源优先级：localKey(IndexedDB 原始字节) → fetch(videoUrl)(本会话 blob /
 * 公网 URL)。拿不到字节返回 null。用于「从资产库选图当 i2v 首帧 / r2v 参考」等
 * 复用场景 —— 百炼只抓公网 URL，所以选完要把字节重传 OSS。
 */
import type { Job } from "@/lib/store";
import { readLocalFile } from "@/lib/editor/localFiles";
import { isImageMode } from "@/lib/bailian/models";

export async function jobResultToFile(job: Job): Promise<File | null> {
  if (!job.videoUrl && !job.localKey) return null;

  let blob: Blob | null = null;
  if (job.localKey) blob = await readLocalFile(job.localKey);
  if (!blob && job.videoUrl) {
    try {
      const res = await fetch(job.videoUrl);
      if (res.ok) blob = await res.blob();
    } catch {
      /* 跨 session 失效的 blob: 会抛，落到 return null */
    }
  }
  if (!blob) return null;

  const img = isImageMode(job.mode);
  const mime = job.localMime || blob.type || (img ? "image/png" : "video/mp4");
  const ext = mime.split("/")[1]?.split("+")[0] || (img ? "png" : "mp4");
  const rawTitle = (job.title || "asset").replace(/[\s\r\n]+/g, " ").trim();
  const safeBase =
    rawTitle
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "asset";
  return new File([blob], `${safeBase}.${ext}`, { type: mime });
}
