/**
 * prepareDirectorFromJob —— 把一个成片 job 作为「角色参考」塞进导演台(R2V)草稿。
 *
 * 工坊 / 资产库共用：startBlankDraft → 收集媒体(必要时上传 OSS) → 映射成
 * character references → updateInput。返回是否成功；导航(/director)由调用方做。
 */
import { useR2VStore } from "@/lib/r2v/projectStore";
import type { Reference } from "@/lib/r2v/schema";
import { readLocalFile } from "@/lib/editor/localFiles";
import { uploadMediaFile } from "@/components/studio/uploadMedia";
import { defaultModelForMode, isImageMode } from "@/lib/bailian/models";
import type { Job, JobMedia } from "@/lib/store";

export async function prepareDirectorFromJob(
  job: Job,
  { zh, flash }: { zh: boolean; flash: (msg: string) => void }
): Promise<boolean> {
  const r2v = useR2VStore.getState();
  const locale = zh ? "zh" : "en";
  r2v.startBlankDraft(locale);

  const mediaEntries: JobMedia[] = [];
  if (job.media.reference_urls) mediaEntries.push(...job.media.reference_urls);
  if (job.media.ref_images) mediaEntries.push(...job.media.ref_images);
  if (mediaEntries.length === 0 && job.media.img_url)
    mediaEntries.push(job.media.img_url);

  // 图模式产出图本身是想带进导演台的资产；videoUrl 常是 session-only blob:，
  // DashScope 抓不到，必须先把字节传到 OSS 拿 oss:// URL。
  if (mediaEntries.length === 0 && isImageMode(job.mode) && job.videoUrl) {
    try {
      flash(zh ? "正在上传生成图到云端…" : "Uploading generated image…");
      let blob: Blob | null = null;
      if (job.localKey) blob = await readLocalFile(job.localKey);
      if (!blob) {
        const res = await fetch(job.videoUrl);
        if (res.ok) blob = await res.blob();
      }
      if (blob) {
        const mime = job.localMime || blob.type || "image/png";
        const ext = mime.split("/")[1]?.split("+")[0] || "png";
        const rawTitle = (job.title || "ref").replace(/[\s\r\n]+/g, " ").trim();
        const safeBase =
          rawTitle
            .replace(/[^A-Za-z0-9_-]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40) || "ref";
        const file = new File([blob], `${safeBase}.${ext}`, { type: mime });
        const r2vModel = defaultModelForMode("r2v");
        const uploaded = await uploadMediaFile(file, r2vModel.id);
        mediaEntries.push(uploaded);
      }
    } catch (e) {
      console.error("[prepareDirectorFromJob] image upload failed:", e);
      flash(
        (zh ? "图片上传失败：" : "Upload failed: ") +
          (e instanceof Error ? e.message : String(e)).slice(0, 80)
      );
    }
  }

  const references: Reference[] = mediaEntries.map((m, i) => ({
    slot: i + 1,
    url: m.url,
    role: "character" as const,
    name: m.name,
    thumbDataUrl:
      m.thumbDataUrl && !m.thumbDataUrl.startsWith("blob:")
        ? m.thumbDataUrl
        : undefined,
    localKey: m.localKey,
    localPath: m.localPath,
  }));

  const refs =
    references.length > 0
      ? references
      : [{ slot: 1, url: "" as const, role: "character" as const }];

  const errBefore = useR2VStore.getState().errorMessage;
  await r2v.updateInput((prev) => ({
    ...prev,
    title: job.title || prev.title,
    references: refs,
    coreNeed: job.prompt || "",
  }));

  const after = useR2VStore.getState();
  if (!after.current) {
    flash(zh ? "导演台无可用草稿，请重试" : "No active draft");
    return false;
  }
  if (after.errorMessage && after.errorMessage !== errBefore) {
    flash(
      zh
        ? `导演台数据校验失败：${after.errorMessage}`
        : `Director schema check failed: ${after.errorMessage}`
    );
    return false;
  }

  if (job.prompt) {
    r2v.setPromptManual(job.prompt, job.negativePrompt || undefined);
  }
  return true;
}
