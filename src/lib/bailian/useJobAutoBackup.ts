"use client";

import { useEffect, useRef } from "react";
import { useStudioStore } from "@/lib/store";
import { storeLocalFile } from "@/lib/editor/localFiles";

/**
 * Global abort controller shared across all instances. When the user clicks
 * ANY <a> link (i.e. starts a navigation), we immediately abort all background
 * video downloads so the browser connection pool is free for the Next.js RSC
 * payload fetch. Without this, downloads occupy all 6 HTTP/1.1 connections and
 * client-side navigation deadlocks (old page fetch blocks → route fetch queues
 * → old component never unmounts → AbortController never fires).
 */
let globalAbort: AbortController | null = null;

function getGlobalAbort(): AbortController {
  if (!globalAbort || globalAbort.signal.aborted) {
    globalAbort = new AbortController();
  }
  return globalAbort;
}

// Install a one-time click listener on the document that aborts all background
// downloads whenever the user clicks a link (navigation intent).
if (typeof window !== "undefined") {
  let installed = false;
  if (!installed) {
    installed = true;
    document.addEventListener(
      "click",
      (e) => {
        const target = (e.target as HTMLElement)?.closest?.("a[href]");
        if (target && globalAbort && !globalAbort.signal.aborted) {
          globalAbort.abort();
        }
      },
      { capture: true }
    );
  }
}

/**
 * Auto-download remote (OSS) video files to IndexedDB so they survive
 * the 1-hour DashScope signed-URL expiry. Without this, archive videos
 * 403 a few hours after generation.
 *
 * Key design:
 *   - Uses a GLOBAL AbortController that fires on any <a> click (navigation)
 *   - Delayed via requestIdleCallback so it never blocks first paint
 *   - Sequential (one at a time) to avoid saturating browser connections
 *   - Uses fetch priority "low" so navigation requests always take precedence
 *
 * Failed downloads (404/CORS) are silently skipped and never retried in this session.
 */
export function useJobAutoBackup(): void {
  const jobs = useStudioStore((s) => s.jobs);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    const seen = attempted.current;
    const abort = getGlobalAbort();
    const { signal } = abort;

    async function run() {
      for (const j of jobs) {
        if (signal.aborted) return;
        if (j.status !== "done") continue;
        if (j.localKey) continue;
        if (j.videoUrl?.startsWith("/api/videos/")) continue;
        if (!j.videoUrl) continue;
        if (!/^https?:/i.test(j.videoUrl)) continue;
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        try {
          const res = await fetch(j.videoUrl, {
            signal,
            priority: "low" as RequestPriority,
          } as RequestInit);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (signal.aborted) return;
          const localKey = `job-${j.id}`;
          await storeLocalFile(localKey, blob);
          if (signal.aborted) return;
          const blobUrl = URL.createObjectURL(blob);
          setJobStatus(j.id, {
            videoUrl: blobUrl,
            localKey,
            localMime: blob.type || "video/mp4",
          });
          // Yield between downloads — keeps UI + navigation responsive
          await new Promise((r) => setTimeout(r, 200));
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          /* network/CORS — silent, won't retry */
        }
      }
    }

    // Delay until browser idle
    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(() => void run());
      return () => cancelIdleCallback(idleId);
    }
    const timerId = setTimeout(() => void run(), 2000);
    return () => clearTimeout(timerId);
  }, [jobs, setJobStatus]);
}
