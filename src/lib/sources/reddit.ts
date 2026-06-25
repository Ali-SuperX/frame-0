import "server-only";
import type { DiscoverItem } from "./types";

const SUBREDDITS = [
  "KlingAI",
  "PikaArt",
  "Seedance",
  "veo3",
  "OpenAI", // Sora posts
  "aivideo",
  "StableVideo",
];

/**
 * Reddit now requires OAuth for any programmatic access. Anonymous JSON
 * endpoints return 403 as of the 2023 API changes.
 *
 * Setup:
 *   1. Go to https://www.reddit.com/prefs/apps
 *   2. Create a "script" type app (redirect URI can be any http://localhost)
 *   3. Copy the client id (under the app name) and secret
 *   4. Add to .env.local:
 *        REDDIT_CLIENT_ID=...
 *        REDDIT_CLIENT_SECRET=...
 *        # Optional (Reddit-recommended), a username so rate-limit logs make sense:
 *        REDDIT_USER_AGENT="frame-0/1.0 (by /u/your_username)"
 *
 * Without these env vars, the Reddit source returns an empty list with a
 * clear "credentials not set" error — the rest of Discover keeps working.
 */

type RedditListing = {
  data: {
    children: Array<{
      data: RedditPostData;
    }>;
  };
};

type RedditPostData = {
  id: string;
  title: string;
  selftext?: string;
  author: string;
  subreddit: string;
  permalink: string;
  url: string;
  created_utc: number;
  score: number;
  over_18?: boolean;
  is_video?: boolean;
  media?: {
    reddit_video?: { fallback_url?: string; hls_url?: string };
  };
  secure_media?: {
    reddit_video?: { fallback_url?: string };
  };
  preview?: {
    images?: Array<{ source?: { url?: string } }>;
    reddit_video_preview?: { fallback_url?: string };
  };
  thumbnail?: string;
};

/* ─────────── OAuth token cache ─────────── */

type CachedToken = { token: string; expiresAt: number };
let tokenCache: CachedToken | null = null;

function getUserAgent(): string {
  return (
    process.env.REDDIT_USER_AGENT ||
    "frame-0/1.0 (video discover aggregator)"
  );
}

export function hasRedditCredentials(): boolean {
  return !!(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
  );
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 30_000 > now) {
    return tokenCache.token;
  }
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Reddit credentials missing. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env.local."
    );
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getUserAgent(),
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Reddit OAuth failed: ${res.status} ${(await res.text()).slice(0, 200)}`
    );
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache = {
    token: body.access_token,
    expiresAt: now + body.expires_in * 1000,
  };
  return body.access_token;
}

/* ─────────── extractors ─────────── */

function extractPrompt(post: RedditPostData): {
  prompt?: string;
  modelLabel?: string;
} {
  const text = `${post.title}\n${post.selftext ?? ""}`;
  let prompt: string | undefined;
  let modelLabel: string | undefined;

  const explicit = text.match(
    /(?:prompt|prompted with|my prompt)\s*[:：]\s*["“']?([^\n"”']{10,500})/i
  );
  if (explicit) prompt = explicit[1].trim();

  if (!prompt) {
    const q = text.match(/["“']([^"”'\n]{20,400})["”']/);
    if (q) prompt = q[1].trim();
  }

  const modelMatch = text.match(
    /\b(Kling(?:\s*v?\d+(?:\.\d+)?)?|Seedance(?:\s*\d+(?:\.\d+)?)?|Veo\s*\d|Sora|Runway\s*(?:Gen[- ]?\d)?|Pika\s*v?\d+(?:\.\d+)?|Wan\s*\d+(?:\.\d+)?|Hailuo|LumaLabs?|Hunyuan|LTX)\b/i
  );
  if (modelMatch) modelLabel = modelMatch[0].replace(/\s+/g, " ").trim();

  return { prompt, modelLabel };
}

function extractVideoUrl(post: RedditPostData): string | undefined {
  const rv =
    post.media?.reddit_video?.fallback_url ||
    post.secure_media?.reddit_video?.fallback_url ||
    post.preview?.reddit_video_preview?.fallback_url;
  if (rv) return rv;
  if (/\.(mp4|webm|mov)(\?|$)/i.test(post.url)) return post.url;
  return undefined;
}

function extractThumbnail(post: RedditPostData): string | undefined {
  const img = post.preview?.images?.[0]?.source?.url;
  if (img) return img.replace(/&amp;/g, "&");
  if (post.thumbnail && post.thumbnail.startsWith("http")) return post.thumbnail;
  return undefined;
}

/* ─────────── public API ─────────── */

/**
 * Fetch top posts across a set of video-oriented subreddits for the given
 * time window. Requires OAuth credentials (see file header); absent creds
 * throw a clear, user-facing error which the API route surfaces per-source.
 */
export async function fetchReddit(opts: {
  period?: "day" | "week" | "month";
  limit?: number;
  includeNsfw?: boolean;
} = {}): Promise<DiscoverItem[]> {
  const period = opts.period ?? "week";
  // Hard default kept small — card thumbnails/videos load client-side, so
  // we don't want a wall of 50+ auto-fetched media. Caller can override
  // but the API route enforces an upper bound too.
  const limit = opts.limit ?? 15;
  const token = await getAccessToken();
  const url = `https://oauth.reddit.com/r/${SUBREDDITS.join("+")}/top?t=${period}&limit=${Math.min(
    limit,
    30
  )}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": getUserAgent(),
    },
    next: { revalidate: 600 }, // 10-min cache; OAuth tokens last ~1h so this is safe.
  });
  if (!res.ok) {
    throw new Error(
      `Reddit fetch failed: ${res.status} ${(await res.text()).slice(0, 160)}`
    );
  }
  const listing = (await res.json()) as RedditListing;

  const items: DiscoverItem[] = [];
  for (const child of listing.data.children) {
    const p = child.data;
    if (!opts.includeNsfw && p.over_18) continue;

    const videoUrl = extractVideoUrl(p);
    const thumbnailUrl = extractThumbnail(p);
    if (!videoUrl && !thumbnailUrl) continue;

    const { prompt, modelLabel } = extractPrompt(p);

    items.push({
      id: `reddit:${p.id}`,
      source: "reddit",
      title: p.title,
      prompt,
      videoUrl,
      thumbnailUrl,
      modelLabel,
      author: p.author,
      sourceUrl: `https://www.reddit.com${p.permalink}`,
      createdAt: p.created_utc * 1000,
      score: p.score,
      channel: `r/${p.subreddit}`,
    });
  }
  return items;
}
