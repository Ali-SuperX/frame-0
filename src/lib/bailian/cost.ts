/**
 * Rough per-second cost table for each video model, in RMB fen (0.01 元).
 * These are ballpark numbers based on public pricing pages; final billing
 * is authoritative. Used only as a UI hint ("本条约 ¥0.45"), never for
 * actual metering.
 *
 * Source references:
 *   - Wan: https://help.aliyun.com/zh/model-studio/billing/
 *   - Kling: kling.kuaishou.com pricing
 *   - PixVerse / Hailuo: vendor docs
 */

type CostPerSec = number; // RMB fen

const FEN: Record<string, CostPerSec> = {
  // Wan family — ~1.4元 per 5s at 720P, ~3元 at 1080P; averaged
  "wan2.7-t2v": 60,
  "wan2.7-i2v": 60,
  // wan2.7-videoedit 计费按"输入视频时长 + 输出视频时长"，单价同 t2v 量级；
  // UI 估值仅提示用，最终以官方账单为准。
  "wan2.7-videoedit": 60,
  "wan2.6-t2v": 28,
  "wan2.6-i2v": 28,
  "wan2.6-i2v-flash": 14,
  "wan2.6-r2v": 42,
  "wan2.6-r2v-flash": 24,

  // PixVerse ~0.8元/5s at 720P
  "pixverse/pixverse-v5.6-t2v": 16,
  "pixverse/pixverse-v5.6-it2v": 16,
  "pixverse/pixverse-v5.6-r2v": 20,

  // Kling v3 — std ~0.7元/s, pro ~1.5元/s (we average)
  "kling/kling-v3-video-generation": 100,
  "kling/kling-v3-video-generation-i2v": 100,

};

/**
 * HappyHorse / 快乐马 — official list price, billed per second by output
 * resolution: 720P = 0.9 元/s, 1080P = 1.6 元/s. Covers t2v / i2v / r2v
 * (video-edit shares the rate; its duration = input length, often unknown).
 */
const HAPPYHORSE_FEN_PER_SEC: Record<string, CostPerSec> = {
  "720P": 90,
  "1080P": 160,
};

/** Returns an estimate of total cost in fen. Returns 0 for unknown models. */
export function estimateCostFen(
  modelId: string,
  durationSec?: number,
  qualityMode?: string,
  resolution?: string
): number {
  const secs = Math.max(1, durationSec ?? 5);
  // HappyHorse is billed per second by output resolution.
  if (modelId.startsWith("happyhorse-")) {
    const key = String(resolution || "720P").toUpperCase();
    const rate = HAPPYHORSE_FEN_PER_SEC[key] ?? HAPPYHORSE_FEN_PER_SEC["720P"];
    return Math.round(rate * secs);
  }
  const base = FEN[modelId] ?? 0;
  // Kling pro ~2x std
  const multiplier = qualityMode === "pro" ? 2 : 1;
  return Math.round(base * secs * multiplier);
}

/**
 * Apply a 折 discount to a fen amount. `zhe` is 1–10 (Chinese convention:
 * 8.5折 → pay 85%). 10 (or ≥10) means no discount.
 */
export function applyDiscount(fen: number, zhe: number): number {
  if (!fen || !zhe || zhe >= 10) return fen;
  return Math.round((fen * zhe) / 10);
}

/** Formats fen → human-readable "¥0.45". */
export function formatFen(fen: number): string {
  if (!fen) return "—";
  return `¥${(fen / 100).toFixed(2)}`;
}
