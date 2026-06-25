"use client";

import { useEffect, useRef } from "react";
import { useStudioStore } from "@/lib/store";

/**
 * Mirror the persisted `frame-0:bailian` localStorage blob to
 * `data/app-state.json` so it survives:
 *   - browser cache clears
 *   - port/origin changes (3000 ↔ 3001 share the same disk file)
 *   - IndexedDB resets
 *
 * On mount: if the disk state has more jobs than current local state, merge it
 * into the store（不再 reload —— reload 会阻塞首屏并可能陷入死循环）。
 * On state change: debounce 2s, then POST current localStorage blob to disk.
 */
const KEY = "frame-0:bailian";
const DEBOUNCE_MS = 2000;

export function useStateBackup(): void {
  const ran = useRef(false);
  const timer = useRef<number | null>(null);

  // ── 1. Hydrate from disk on first mount if local is thin ──
  // 使用 requestIdleCallback 延迟执行，不阻塞首屏渲染。
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const recover = async () => {
      try {
        const localRaw = localStorage.getItem(KEY);
        const localJobCount = (() => {
          try { return JSON.parse(localRaw || "{}").state?.jobs?.length ?? 0; }
          catch { return 0; }
        })();

        const res = await fetch("/api/state");
        if (!res.ok) return;
        const remote = await res.json();
        if (!remote || typeof remote !== "object") return;
        const remoteJobs: unknown[] = remote?.state?.jobs ?? [];
        if (remoteJobs.length <= localJobCount) return;

        // 不再 reload —— 把磁盘上多出来的 jobs 增量 merge 进 store。
        // 用 importWorksFromJson 走已有的去重逻辑（按 taskId / videoUrl 判重），
        // 确保不会覆盖本地更新的状态。
        const store = useStudioStore.getState();
        const existingTaskIds = new Set(
          store.jobs.filter((j) => j.taskId).map((j) => j.taskId)
        );
        let added = 0;
        for (const raw of remoteJobs) {
          const j = raw as { taskId?: string; id?: string };
          if (j.taskId && existingTaskIds.has(j.taskId)) continue;
          // 利用 createJobFromPayload 逐条写入（已有去重），避免整体覆盖。
          store.createJobFromPayload(raw as Parameters<typeof store.createJobFromPayload>[0]);
          added++;
        }
        if (added > 0) {
          console.info("[frame-0] restored %d jobs from disk backup", added);
        }
      } catch {
        /* network/disk error — silent fallback to local-only */
      }
    };

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(() => void recover());
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => void recover(), 200);
    return () => clearTimeout(t);
  }, []);

  // ── 2. Debounced POST on every store change ──
  useEffect(() => {
    const unsub = useStudioStore.subscribe(() => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        fetch("/api/state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: raw,
        }).catch(() => { /* silent — best effort */ });
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);
}
