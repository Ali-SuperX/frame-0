"use client";

import { useEffect, useRef } from "react";
import { useStudioStore, type Job } from "@/lib/store";

/**
 * Fires a browser notification the first time a job transitions to `done`
 * or `error`. Skips if the page is visible + focused (no need to bug the
 * user when they're already watching).
 *
 * Mount once in the Studio root. Safe to mount multiple times — the `notified`
 * ref-set prevents double fires per job id.
 */
export function useJobNotifications(): void {
  const jobs = useStudioStore((s) => s.jobs);
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    for (const j of jobs) {
      const terminal = j.status === "done" || j.status === "error";
      if (!terminal) continue;
      if (notified.current.has(j.id)) continue;
      notified.current.add(j.id);

      // Only notify if user isn't actively watching this page.
      if (document.visibilityState === "visible" && document.hasFocus()) continue;

      const title =
        j.status === "done"
          ? `FRAME/0 · ${j.modelId.split("/").pop()} ready`
          : `FRAME/0 · job failed`;
      const body =
        j.status === "done"
          ? (j.prompt || j.title).slice(0, 120)
          : j.errorMessage?.slice(0, 160) || "Unknown error";

      try {
        const n = new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: j.id, // dedupes if we ever re-notify
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        /* some browsers throw in restricted contexts; ignore */
      }
    }
  }, [jobs]);
}

/**
 * Best-effort request for notification permission. Returns the final
 * permission state. Safe to call many times — no-ops after first answer.
 */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Narrow helper so callers can filter without importing `Job` directly. */
export type NotifyJob = Pick<Job, "id" | "status" | "title" | "modelId">;
