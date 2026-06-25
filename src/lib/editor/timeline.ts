import type { EditorClip } from "@/lib/store";

/** Output duration on the timeline (after speed). */
export function renderDuration(c: EditorClip): number {
  return Math.max(0.05, (c.out - c.in) / (c.speed || 1));
}

/** Inclusive end on timeline = startSec + renderDuration. Falls back to
 *  legacy sequential layout when startSec is missing. */
export function endSec(c: EditorClip, fallbackStart = 0): number {
  return (c.startSec ?? fallbackStart) + renderDuration(c);
}

/** Resolve the trackId. Defaults to "v1" if absent. */
export function trackOf(c: EditorClip): string {
  return c.trackId ?? "v1";
}

/**
 * Migrate a list of clips so every clip has an explicit `startSec`.
 * Clips missing `startSec` are placed sequentially within their track
 * (preserving array order), each starting at the previous clip's end.
 *
 * Idempotent — clips that already have `startSec` are left alone.
 */
export function migrateStartSec(clips: EditorClip[]): EditorClip[] {
  const cursorByTrack = new Map<string, number>();
  return clips.map((c) => {
    if (typeof c.startSec === "number") {
      const t = trackOf(c);
      cursorByTrack.set(t, Math.max(cursorByTrack.get(t) ?? 0, endSec(c)));
      return c;
    }
    const t = trackOf(c);
    const start = cursorByTrack.get(t) ?? 0;
    const next = { ...c, startSec: start };
    cursorByTrack.set(t, start + renderDuration(next));
    return next;
  });
}

/** Return clips on the given track, sorted by startSec ascending. */
export function clipsOnTrack(
  clips: EditorClip[],
  trackId: string
): EditorClip[] {
  return clips
    .filter((c) => trackOf(c) === trackId)
    .sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));
}

/** Highest end time across all clips on the given track. */
export function trackEndSec(clips: EditorClip[], trackId: string): number {
  let max = 0;
  for (const c of clips) {
    if (trackOf(c) !== trackId) continue;
    const e = endSec(c);
    if (e > max) max = e;
  }
  return max;
}

/** Highest end time across the whole project (= total project duration). */
export function projectEndSec(clips: EditorClip[]): number {
  let max = 0;
  for (const c of clips) {
    const e = endSec(c);
    if (e > max) max = e;
  }
  return max;
}

/** Find the next gap on a track after a given start time, of at least
 *  `minDur` seconds. Returns the start of that gap (>= afterSec). */
export function nextGapStart(
  clips: EditorClip[],
  trackId: string,
  afterSec: number,
  minDur: number
): number {
  const sorted = clipsOnTrack(clips, trackId);
  let cursor = afterSec;
  for (const c of sorted) {
    const start = c.startSec ?? 0;
    const end = endSec(c);
    if (end <= cursor) continue;
    if (start - cursor >= minDur) return cursor;
    cursor = end;
  }
  return cursor;
}

/** Snap candidates: every clip's start and end on every track, plus playhead. */
export function snapTargets(clips: EditorClip[], playheadSec: number): number[] {
  const set = new Set<number>([0, playheadSec]);
  for (const c of clips) {
    set.add(c.startSec ?? 0);
    set.add(endSec(c));
  }
  return [...set].sort((a, b) => a - b);
}

/** Snap a value to the nearest target within `thresholdSec`; otherwise return as-is. */
export function snap(value: number, targets: number[], thresholdSec: number): number {
  let best = value;
  let bestDist = thresholdSec;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Re-pack startSec for every clip in array order, per track.
 * Used during the transitional phase where the UI still treats clips as a
 * sequential queue. CP3 will replace this with explicit absolute positioning.
 */
export function relayoutAllTracks(clips: EditorClip[]): EditorClip[] {
  const cursorByTrack = new Map<string, number>();
  return clips.map((c) => {
    const t = trackOf(c);
    const start = cursorByTrack.get(t) ?? 0;
    const next = { ...c, startSec: start };
    cursorByTrack.set(t, start + renderDuration(next));
    return next;
  });
}

/** Returns the active clip on a given track at time `t` (or undefined). */
export function clipAt(
  clips: EditorClip[],
  trackId: string,
  t: number
): EditorClip | undefined {
  return clips.find((c) => {
    if (trackOf(c) !== trackId) return false;
    const s = c.startSec ?? 0;
    return t >= s && t < s + renderDuration(c);
  });
}
