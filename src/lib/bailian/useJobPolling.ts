"use client";

import { useEffect, useRef } from "react";
import { useStudioStore } from "@/lib/store";
import { apiKeysHeader } from "./withUserKeys";

/**
 * Polls the Bailian `/api/bailian/poll` endpoint every 4s for any job that
 * is in `submitting` or `running` status with a known taskId.
 *
 * Mount this in any page (Studio, Archive, Compare) so tasks keep ticking
 * across navigation. Safe to mount multiple times — each component gets
 * its own timer map, but the store is shared so no duplicate writes.
 */
export function useJobPolling(intervalMs: number = 4000): void {
  const jobs = useStudioStore((s) => s.jobs);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);

  const timers = useRef<Map<string, number>>(new Map());

  // Per-render effect: reap finished + spawn new timers. DON'T clean up all
  // timers on re-run (that would thrash the poll cadence on every tick).
  useEffect(() => {
    const map = timers.current;
    for (const [id, timer] of map) {
      const j = jobs.find((x) => x.id === id);
      if (
        !j ||
        j.status === "done" ||
        j.status === "error" ||
        j.status === "canceled"
      ) {
        window.clearInterval(timer);
        map.delete(id);
      }
    }
    for (const j of jobs) {
      const shouldPoll =
        (j.status === "running" || j.status === "submitting") &&
        !!j.taskId &&
        !map.has(j.id);
      if (!shouldPoll) continue;
      const t = window.setInterval(async () => {
        try {
          const qs = new URLSearchParams({
            task_id: j.taskId!,
            model_id: j.modelId,
          });
          const res = await fetch(`/api/bailian/poll?${qs.toString()}`, {
            cache: "no-store",
            headers: apiKeysHeader(),
          });
          const s = await res.json();
          if (s.state === "done") {
            setJobStatus(j.id, {
              status: "done",
              videoUrl: s.localPath || s.videoUrl,
              completedAt: Date.now(),
              ...(s.localPath ? { localKey: `disk:${j.taskId}` } : {}),
            });
            // Push full job context to disk so reruns / param-recovery work.
            if (s.localPath && j.taskId) {
              fetch(`/api/videos/${j.taskId}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  jobId: j.id,
                  modelId: j.modelId,
                  mode: j.mode,
                  prompt: j.prompt,
                  negativePrompt: j.negativePrompt,
                  params: j.params,
                  media: j.media,
                  title: j.title,
                }),
              }).catch(() => { /* best-effort */ });
            }
          } else if (s.state === "error") {
            setJobStatus(j.id, {
              status: "error",
              errorMessage: s.message,
              completedAt: Date.now(),
            });
          } else if (s.state === "running") {
            setJobStatus(j.id, { status: "running" });
          }
        } catch {
          // transient — ignore; keep polling
        }
      }, intervalMs);
      map.set(j.id, t);
    }
  }, [jobs, setJobStatus, intervalMs]);

  // Unmount-only cleanup.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) window.clearInterval(t);
      map.clear();
    };
  }, []);
}
