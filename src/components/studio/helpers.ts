"use client";

import { getModel } from "@/lib/bailian/models";
import type { Job } from "@/lib/store";

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ago(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

export function fmtClock(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Given a draft's free-form params and a target modelId, return only the
 * keys that the target spec actually supports. Used by Fan-out so a param
 * like `size` (wan2.6) doesn't leak into a wan2.7 submission.
 */
export function overlapParams(
  params: Record<string, unknown>,
  targetModelId: string
): Record<string, unknown> {
  const spec = getModel(targetModelId);
  if (!spec) return {};
  const allowed = new Set(spec.fields.map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Parse `{a|b|c}` placeholders in a prompt and return all expansions.
 * Cartesian, capped at 8 expansions to prevent runaway batches.
 */
export function expandPromptTemplate(prompt: string): string[] {
  const re = /\{([^{}|]+(?:\|[^{}|]+)+)\}/g;
  const groups: string[][] = [];
  const placeholders: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    placeholders.push(m[0]);
    groups.push(m[1].split("|").map((s) => s.trim()).filter(Boolean));
  }
  if (groups.length === 0) return [prompt];
  let out: string[] = [""];
  for (let i = 0; i < groups.length; i++) {
    const next: string[] = [];
    for (const acc of out) {
      for (const v of groups[i]) {
        next.push(acc === "" ? v : `${acc}\u0001${v}`);
      }
    }
    out = next;
  }
  const expanded = out.slice(0, 8).map((combo) => {
    let result = prompt;
    const values = combo.split("\u0001");
    for (let i = 0; i < placeholders.length; i++) {
      result = result.replace(placeholders[i], values[i]);
    }
    return result;
  });
  return expanded;
}

/** Stable id for grouping batches (fan-out, seed, template). */
export const newGroupId = () =>
  `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Deterministically derive an OKLCH color from a groupId so all jobs in
 *  the same batch share the same accent bar. */
export function colorFromGroupId(gid: string): string {
  let hash = 0;
  for (let i = 0; i < gid.length; i++) {
    hash = (hash * 31 + gid.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.72 0.18 ${hue})`;
}

export const STATUS_COLOR: Record<Job["status"], string> = {
  draft: "var(--paper-mute)",
  submitting: "var(--accent)",
  running: "var(--accent)",
  done: "#6ba96b",
  error: "#c44",
  canceled: "var(--paper-mute)",
};
