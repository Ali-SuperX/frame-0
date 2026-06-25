"use client";

import { useEffect, useRef } from "react";
import { useStudioStore } from "@/lib/store";
import { readLocalFile } from "@/lib/editor/localFiles";

/**
 * On mount, scan all jobs for `localKey` — those are jobs whose video lives
 * in IndexedDB. Blob URLs don't survive page reload, so we re-read the bytes
 * and mint a fresh URL, updating each job in place.
 *
 * 优化：不再对每个 blob: URL 发 HEAD 请求验证存活性 —— 200 个 job 就是 200
 * 个并发请求，直接拖垮 dev HTTP/1.1 6 连接限制。改为：
 *   - blob: URL → 一律 rehydrate（跨 session 必然失效，同 session 重建也无副作用）
 *   - /api/videos/* 或 http(s):// → 跳过（不需要 IDB rehydrate）
 *
 * 额外使用 requestIdleCallback 延迟启动，不阻塞首屏渲染。
 */
export function useLocalJobRehydration(): void {
  const jobs = useStudioStore((s) => s.jobs);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    const run = async () => {
      for (const j of jobs) {
        if (cancelled) return;
        if (!j.localKey) continue;
        // 仅对 blob: URL 做 rehydrate —— 这些跨 session 必失效。
        // disk 路径 (/api/videos/*) 和远程 URL 不需要处理。
        if (!j.videoUrl?.startsWith("blob:")) continue;
        try {
          const blob = await readLocalFile(j.localKey);
          if (!blob || cancelled) continue;
          const typed = j.localMime
            ? new Blob([blob], { type: j.localMime })
            : blob;
          const url = URL.createObjectURL(typed);
          setJobStatus(j.id, { videoUrl: url });
        } catch {
          /* ignore — file may have been cleared */
        }
      }
    };

    // 延迟到浏览器空闲时执行，不阻塞首屏 paint
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(() => void run());
      return () => { cancelled = true; cancelIdleCallback(id); };
    }
    const timer = window.setTimeout(() => void run(), 100);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
