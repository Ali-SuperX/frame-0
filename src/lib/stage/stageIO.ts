/**
 * 片场导入导出 —— JSON 序列化/反序列化时把"派生 URL"也嵌进去,
 * 让跨机器/跨账号导入不丢图。
 *
 * 导出策略:
 *   - 遍历 beats,把当前 jobById 反查到的 imageUrl/voiceUrl/videoUrl
 *     embed 到 beat._embed 字段
 *   - JSON.stringify 后下载
 *
 * 导入策略:
 *   - 解析 JSON,遍历 beats
 *   - 凡是有 _embed.<url> 但本地 jobs 表查不到对应 jobId 时,
 *     创建新 done-状态 Job 并把 jobId 写回 beat
 *   - 清掉 _embed 字段,setCastProject 替换当前
 *
 * 这样导入后用户立刻能播图/音/视频,跟原账号一致(只要 URL 仍可访问)。
 */

import type { CastProject, Job } from "@/lib/store";
import { useStudioStore } from "@/lib/store";

type EmbedMedia = {
  imageUrl?: string;
  voiceUrl?: string;
  videoUrl?: string;
};

/** Augmented beat:在原 CastBeat 上加 _embed 元数据(下划线开头表示导出 metadata) */
type ExportedBeat = Record<string, unknown> & {
  _embed?: EmbedMedia;
};

export function augmentForExport(
  project: CastProject,
  jobById: Map<string, Job>
): object {
  return {
    ...project,
    _exportVersion: 1,
    _exportedAt: new Date().toISOString(),
    episodes: project.episodes.map((ep) => ({
      ...ep,
      beats: ep.beats.map((b) => {
        const embed: EmbedMedia = {};
        if (b.imageJobId) {
          const j = jobById.get(b.imageJobId);
          const u = j?.media?.img_url?.url || j?.media?.ref_images?.[0]?.url;
          if (u) embed.imageUrl = u;
        }
        if (b.voiceJobId?.startsWith("/api/")) {
          embed.voiceUrl = b.voiceJobId;
        }
        if (b.videoJobId) {
          const u = jobById.get(b.videoJobId)?.videoUrl;
          if (u) embed.videoUrl = u;
        }
        return Object.keys(embed).length > 0
          ? { ...b, _embed: embed }
          : { ...b };
      }),
    })),
  };
}

/**
 * 反向处理:解析 JSON,如果 beat 有 _embed 且对应 jobId 在本地 jobs 表里
 * 查不到,就创建一个新 done Job 让 jobId 引用本地可用的版本。
 *
 * 返回净化后的 CastProject(去掉 _embed 字段)。
 */
export function rehydrateImported(raw: unknown): CastProject {
  const parsed = raw as {
    name?: string;
    episodes?: Array<{ beats?: ExportedBeat[] }>;
  };
  if (!parsed?.episodes || !Array.isArray(parsed.episodes)) {
    throw new Error("不是有效的剧本 JSON(缺 episodes 数组)");
  }

  const store = useStudioStore.getState();
  const existing = new Set(store.jobs.map((j) => j.id));

  for (const ep of parsed.episodes) {
    if (!Array.isArray(ep.beats)) continue;
    for (const beat of ep.beats) {
      const embed = beat._embed as EmbedMedia | undefined;
      if (!embed) continue;

      // image —— 优先用 _embed.imageUrl 重建 Job
      if (embed.imageUrl) {
        const existingJobId = beat.imageJobId as string | undefined;
        if (!existingJobId || !existing.has(existingJobId)) {
          const jobId = store.createJobFromPayload({
            modelId: "imported",
            mode: "t2i",
            params: {},
            media: { img_url: { url: embed.imageUrl, name: "imported.png" } },
            prompt: String(beat.text || "(imported)"),
            title: `[Imported] EP${(beat as Record<string, unknown>).idx ?? "?"}`,
          });
          store.setJobStatus(jobId, { status: "done", completedAt: Date.now() });
          beat.imageJobId = jobId;
        }
      }

      // voice —— voiceJobId 直接是 audioUrl,不需要 Job
      if (embed.voiceUrl) {
        beat.voiceJobId = embed.voiceUrl;
      }

      // video
      if (embed.videoUrl) {
        const existingJobId = beat.videoJobId as string | undefined;
        if (!existingJobId || !existing.has(existingJobId)) {
          const jobId = store.createJobFromPayload({
            modelId: "imported",
            mode: "i2v",
            params: {},
            media: {},
            prompt: String(beat.text || "(imported)"),
            title: `[Imported video] EP${(beat as Record<string, unknown>).idx ?? "?"}`,
          });
          store.setJobStatus(jobId, {
            status: "done",
            completedAt: Date.now(),
            videoUrl: embed.videoUrl,
          });
          beat.videoJobId = jobId;
        }
      }

      // 清掉 metadata 字段,不污染 runtime 数据
      delete beat._embed;
    }
  }

  // 清掉顶层导出元数据
  delete (parsed as Record<string, unknown>)._exportVersion;
  delete (parsed as Record<string, unknown>)._exportedAt;

  return parsed as unknown as CastProject;
}
