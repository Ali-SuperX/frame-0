/**
 * R2V Video Utilities — client-side helpers for long video generation.
 */

export type KeyFrame = {
  /** Position label: "first" | "mid" | "last" or time in seconds */
  label: string;
  /** Base64 JPEG data URL */
  dataUrl: string;
  /** Timestamp in seconds */
  time: number;
};

/**
 * Extract a single frame at a specific time from a video.
 * Low-level helper used by extractKeyFrames.
 */
function extractFrameAt(
  video: HTMLVideoElement,
  timeSec: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    video.currentTime = Math.max(0, timeSec);

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas 2D unavailable")); return; }
        ctx.drawImage(video, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (err) {
        reject(err);
      }
    };

    video.addEventListener("seeked", onSeeked, { once: true });
  });
}

/**
 * Extract key frames from a video for cross-segment consistency anchoring.
 *
 * Default strategy: first frame (0.2s), middle frame, last frame (–0.1s).
 * This gives the next segment:
 *   - First frame → establishes the starting visual state
 *   - Mid frame   → captures the dominant visual angle of the segment
 *   - Last frame  → provides continuity for the next segment's opening
 *
 * @param videoSrc  — blob: URL or http(s) URL of the video
 * @param count     — number of frames to extract (default 3; clamped to 1–5)
 * @param quality   — JPEG quality 0–1 (default 0.85)
 * @returns         — array of KeyFrame objects, ordered by time
 */
export async function extractKeyFrames(
  videoSrc: string,
  count = 3,
  quality = 0.85
): Promise<KeyFrame[]> {
  count = Math.max(1, Math.min(5, count));

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";

  // Load metadata
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Video load timed out")), 15000);
    video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
    video.onerror = () => { clearTimeout(timer); reject(new Error("Video load failed")); };
    video.src = videoSrc;
  });

  const dur = video.duration;
  if (!dur || dur === Infinity) throw new Error("Cannot determine video duration");

  // Calculate timestamps: first (0.2s), evenly spaced mids, last (–0.1s)
  const times: number[] = [];
  const first = Math.min(0.2, dur * 0.05);
  const last = Math.max(0, dur - 0.1);

  if (count === 1) {
    times.push(last);
  } else if (count === 2) {
    times.push(first, last);
  } else {
    times.push(first);
    const midCount = count - 2;
    for (let i = 1; i <= midCount; i++) {
      times.push(first + (last - first) * (i / (midCount + 1)));
    }
    times.push(last);
  }

  // Extract frames sequentially (seeking is serial on <video>)
  const frames: KeyFrame[] = [];
  const labels = count === 1
    ? ["last"]
    : count === 2
      ? ["first", "last"]
      : ["first", ...Array.from({ length: count - 2 }, (_, i) => `mid${i + 1}`), "last"];

  for (let i = 0; i < times.length; i++) {
    const dataUrl = await extractFrameAt(video, times[i], quality);
    frames.push({
      label: labels[i],
      dataUrl,
      time: Math.round(times[i] * 10) / 10,
    });
  }

  // Cleanup
  video.pause();
  video.removeAttribute("src");
  video.load();

  return frames;
}

/**
 * Extract a single frame at a given timestamp from a video URL.
 * Standalone — creates and destroys its own <video> element.
 */
export async function extractSingleFrame(
  videoSrc: string,
  timeSec: number,
  quality = 0.85
): Promise<KeyFrame> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Video load timed out")), 15000);
    video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
    video.onerror = () => { clearTimeout(timer); reject(new Error("Video load failed")); };
    video.src = videoSrc;
  });

  const clamped = Math.max(0, Math.min(timeSec, video.duration - 0.05));
  const dataUrl = await extractFrameAt(video, clamped, quality);

  video.pause();
  video.removeAttribute("src");
  video.load();

  return {
    label: `${clamped.toFixed(1)}s`,
    dataUrl,
    time: Math.round(clamped * 10) / 10,
  };
}

/**
 * Get the duration of a video in seconds.
 */
export function getVideoDuration(videoSrc: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const timer = setTimeout(() => reject(new Error("Timeout")), 10000);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve(video.duration);
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => { clearTimeout(timer); reject(new Error("Load failed")); };
    video.src = videoSrc;
  });
}

/**
 * Convenience wrapper: extract just the last frame.
 * Backward-compatible with the old extractLastFrame signature.
 */
export async function extractLastFrame(
  videoSrc: string,
  _offsetFromEnd = 0.1,
  quality = 0.85
): Promise<string> {
  const frames = await extractKeyFrames(videoSrc, 1, quality);
  return frames[0].dataUrl;
}

/**
 * Generate a unique segment ID.
 */
export function segmentId(): string {
  return `seg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Parse a rhythm string like "3-4-3-5" into an array of durations.
 */
export function parseRhythm(rhythm: string): number[] {
  return rhythm
    .split(/[-–—,\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n >= 3 && n <= 15);
}

/**
 * Suggest segment durations for a target total duration.
 * Each segment is 8–12s by default, last segment absorbs remainder.
 */
export function suggestSegments(totalDuration: number): number[] {
  if (totalDuration <= 15) return [totalDuration];
  const idealSegLen = 10;
  const count = Math.ceil(totalDuration / idealSegLen);
  const base = Math.floor(totalDuration / count);
  const remainder = totalDuration - base * count;
  const durations: number[] = [];
  for (let i = 0; i < count; i++) {
    durations.push(i < remainder ? base + 1 : base);
  }
  // Clamp each to [3, 15]
  return durations.map((d) => Math.max(3, Math.min(15, d)));
}
