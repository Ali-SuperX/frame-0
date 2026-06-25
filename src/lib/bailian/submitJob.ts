"use client";

import type { Job } from "@/lib/store";
import { apiKeysHeader } from "./withUserKeys";
import { refreshStaleMedia } from "@/components/studio/uploadMedia";

/**
 * Submit a single job's params to /api/bailian/submit and return its taskId.
 * Throws on failure. Used by Studio submit handler, Retry, and Fan-out.
 */
export async function submitJobRequest(job: {
  modelId: string;
  params: Record<string, unknown>;
  media: Job["media"];
  prompt?: string;
  negativePrompt?: string;
}): Promise<{ taskId?: string; imageUrls?: string[] }> {
  // Re-upload any media whose temporary OSS URL has expired (same-session
  // uploads are untouched). Stops reused media failing "OSS … not exist".
  const media = await refreshStaleMedia(job.media, job.modelId);

  // Fail-early when refreshStaleMedia tried but couldn't recover (no local
  // copy in IDB / on disk). Otherwise we'd ship the dirty URL to DashScope
  // and the user would see the cryptic "OSS Resource ... not exist".
  const allMedia = [
    media.img_url,
    media.last_frame_url,
    media.first_clip_url,
    media.audio_url,
    media.video_url,
    ...(media.reference_urls ?? []),
    ...(media.ref_images ?? []),
  ].filter(Boolean);
  const unrecoverable = allMedia.filter(
    (m) => (m as { __unrecoverable?: boolean })?.__unrecoverable
  );
  if (unrecoverable.length > 0) {
    const names = unrecoverable.map((m) => m!.name || "未命名").join("、");
    throw new Error(
      `以下 ${unrecoverable.length} 张媒体已失效且无法自动恢复，请在工坊里手动重新上传后再生成：${names}`
    );
  }

  const body = {
    modelId: job.modelId,
    params: job.params,
    media: {
      prompt: job.prompt || undefined,
      negative_prompt: job.negativePrompt || undefined,
      img_url: media.img_url?.url,
      last_frame_url: media.last_frame_url?.url,
      first_clip_url: media.first_clip_url?.url,
      reference_urls: media.reference_urls?.map((m) => m.url),
      video_url: media.video_url?.url,
      ref_images: media.ref_images?.map((m) => m.url),
      audio_url: media.audio_url?.url || (job.params.audio_url as string) || undefined,
    },
  };

  // Guard: blob:/data: URLs are browser-local — DashScope can't fetch them, so
  // their presence means a media input was never uploaded to OSS. Fail loud &
  // clear here instead of letting the server return a cryptic
  // "Failed to download blob:…". Catches this whole class of regression.
  const mediaUrls = [
    body.media.img_url,
    body.media.last_frame_url,
    body.media.first_clip_url,
    body.media.video_url,
    body.media.audio_url,
    ...(body.media.reference_urls ?? []),
    ...(body.media.ref_images ?? []),
  ];
  if (
    mediaUrls.some(
      (u) =>
        typeof u === "string" &&
        (u.startsWith("blob:") || u.startsWith("data:"))
    )
  ) {
    throw new Error("媒体未上传到云端，请重新上传图片/视频后再生成");
  }

  const res = await fetch("/api/bailian/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeysHeader() },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "submit failed");
  return { taskId: j.taskId, imageUrls: j.imageUrls };
}
