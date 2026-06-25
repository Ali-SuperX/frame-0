import "server-only";
import type { DiscoverItem } from "./types";

/**
 * CivitAI public API — no authentication required.
 * Fetches trending AI-generated images/videos with prompts and model metadata.
 *
 * API docs: https://github.com/civitai/civitai/wiki/REST-API-Reference
 */

type CivitaiImage = {
  id: number;
  url: string;
  hash: string;
  width: number;
  height: number;
  nsfw: boolean | string;
  nsfwLevel: number;
  createdAt: string;
  postId: number;
  stats: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    dislikeCount: number;
    heartCount: number;
    commentCount: number;
  };
  meta?: {
    prompt?: string;
    negativePrompt?: string;
    Model?: string;
    "Model hash"?: string;
    cfgScale?: number;
    steps?: number;
    sampler?: string;
    seed?: number;
    Size?: string;
  };
  username: string;
  type?: "image" | "video";
};

type CivitaiResponse = {
  items: CivitaiImage[];
  metadata: {
    totalItems: number;
    currentPage: number;
    pageSize: number;
  };
};

const CIVITAI_BASE = "https://civitai.com/api/v1/images";

function mapPeriod(period: "day" | "week" | "month"): string {
  switch (period) {
    case "day":
      return "Day";
    case "week":
      return "Week";
    case "month":
      return "Month";
  }
}

function inferAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  if (ratio > 1.5) return "16:9";
  if (ratio < 0.75) return "9:16";
  return "1:1";
}

/**
 * Fetch trending images from CivitAI.
 * No credentials needed — fully public API.
 */
export async function fetchCivitai(opts: {
  period?: "day" | "week" | "month";
  limit?: number;
} = {}): Promise<DiscoverItem[]> {
  const period = opts.period ?? "week";
  const limit = Math.min(opts.limit ?? 15, 30);

  const params = new URLSearchParams({
    sort: "Most Reactions",
    period: mapPeriod(period),
    limit: String(limit),
    nsfw: "None",
  });

  const res = await fetch(`${CIVITAI_BASE}?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json",
    },
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(
      `CivitAI fetch failed: ${res.status} ${(await res.text()).slice(0, 160)}`
    );
  }

  const data = (await res.json()) as CivitaiResponse;

  const items: DiscoverItem[] = [];
  for (const img of data.items) {
    const prompt = img.meta?.prompt;
    const modelLabel = img.meta?.Model;

    // Build a meaningful title from prompt or model
    const title = prompt
      ? prompt.slice(0, 80) + (prompt.length > 80 ? "…" : "")
      : modelLabel
        ? `${modelLabel} generation`
        : `CivitAI #${img.id}`;

    items.push({
      id: `civitai:${img.id}`,
      source: "civitai",
      title,
      prompt,
      negativePrompt: img.meta?.negativePrompt,
      videoUrl: img.type === "video" ? img.url : undefined,
      thumbnailUrl: img.url,
      modelLabel,
      author: img.username,
      sourceUrl: `https://civitai.com/images/${img.id}`,
      createdAt: new Date(img.createdAt).getTime(),
      score:
        img.stats.heartCount +
        img.stats.likeCount +
        img.stats.laughCount +
        img.stats.cryCount,
      aspectRatio: inferAspectRatio(img.width, img.height),
    });
  }

  return items;
}
