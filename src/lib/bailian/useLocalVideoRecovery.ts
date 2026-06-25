"use client";

import { useEffect, useRef, useState } from "react";
import { useStudioStore } from "@/lib/store";

interface LocalMeta {
  taskId: string;
  jobId?: string;
  modelId?: string;
  mode?: string;
  prompt?: string;
  negativePrompt?: string;
  params?: Record<string, unknown>;
  media?: Record<string, unknown>;
  title?: string;
  savedAt: number;
}

export function useLocalVideoRecovery(): void {
  const createJobFromPayload = useStudioStore((s) => s.createJobFromPayload);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const deleteJob = useStudioStore((s) => s.deleteJob);
  const ran = useRef(false);
  // State flag that flips when hydration completes — this re-triggers the effect.
  const [hydrated, setHydrated] = useState(() => useStudioStore.persist.hasHydrated());

  useEffect(() => {
    if (!hydrated) {
      // Re-check inside the effect — hydration may have completed between
      // the render and this effect running, in which case onFinishHydration
      // would never fire.
      if (useStudioStore.persist.hasHydrated()) {
        setHydrated(true);
        return;
      }
      const unsub = useStudioStore.persist.onFinishHydration(() => {
        setHydrated(true);
      });
      return unsub;
    }

    if (ran.current) return;
    ran.current = true;

    const recover = async () => {
      // Re-read jobs AFTER hydration to get the real persisted data
      const hydratedJobs = useStudioStore.getState().jobs;
      try {
        const res = await fetch("/api/videos/list");
        if (!res.ok) return;
        const locals: LocalMeta[] = await res.json();
        if (!locals.length) return;
        const localByTaskId = new Map(locals.map((l) => [l.taskId, l]));

        // Backfill: any existing recovered job whose params are empty —
        // pull meta from disk and patch in place.
        // If disk meta is also gone, purge the orphan job entirely.
        for (const j of hydratedJobs) {
          if (!j.taskId) continue;
          const local = localByTaskId.get(j.taskId);
          if (!local) {
            if (j.modelId === "recovered") deleteJob(j.id);
            continue;
          }
          const hasParams = j.params && Object.keys(j.params).length > 0;
          if (hasParams) continue;
          if (!local.modelId) {
            deleteJob(j.id);
            continue;
          }
          const patch: Partial<typeof j> = {};
          if (local.modelId && j.modelId !== local.modelId) patch.modelId = local.modelId;
          if (local.mode) patch.mode = local.mode as typeof j.mode;
          if (local.params) patch.params = local.params;
          if (local.media) patch.media = local.media as typeof j.media;
          if (local.prompt && !j.prompt) patch.prompt = local.prompt;
          if (local.negativePrompt && !j.negativePrompt) patch.negativePrompt = local.negativePrompt;
          if (local.title && j.title?.startsWith("Recovered ")) patch.title = local.title;
          if (Object.keys(patch).length > 0) setJobStatus(j.id, patch);
        }

        const existingTaskIds = new Set(
          hydratedJobs.filter((j) => j.taskId).map((j) => j.taskId)
        );
        const existingVideoUrls = new Set(
          hydratedJobs.filter((j) => j.videoUrl).map((j) => j.videoUrl)
        );
        const deletedTaskIds = new Set(useStudioStore.getState().deletedTaskIds);

        for (const local of locals) {
          const localUrl = `/api/videos/${local.taskId}`;
          if (existingTaskIds.has(local.taskId)) continue;
          if (existingVideoUrls.has(localUrl)) continue;
          if (deletedTaskIds.has(local.taskId)) continue;
          if (!local.modelId) continue;

          const mode = (local.mode as "t2v" | "i2v" | "r2v") || "t2v";
          const jobId = createJobFromPayload({
            modelId: local.modelId,
            mode,
            params: local.params ?? {},
            media: (local.media as never) ?? {},
            prompt: local.prompt || "",
            negativePrompt: local.negativePrompt,
            title:
              local.title ||
              (local.prompt ? local.prompt.slice(0, 50) : local.taskId.slice(0, 8)),
          });
          setJobStatus(jobId, {
            taskId: local.taskId,
            status: "done",
            videoUrl: localUrl,
            localKey: `disk:${local.taskId}`,
            completedAt: local.savedAt,
          });
        }
      } catch {
        /* silent */
      }
    };

    // 延迟到浏览器空闲时执行 —— /api/videos/list 网络请求 + 逐条写 store
    // 不应阻塞首屏 paint。
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(() => void recover());
      return () => cancelIdleCallback(id);
    }
    const timer = window.setTimeout(() => void recover(), 150);
    return () => clearTimeout(timer);
  }, [hydrated, createJobFromPayload, setJobStatus, deleteJob]);
}
