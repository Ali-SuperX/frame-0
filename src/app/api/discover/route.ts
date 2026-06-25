import { NextResponse } from "next/server";
import { fetchReddit, hasRedditCredentials } from "@/lib/sources/reddit";
import { fetchCivitai } from "@/lib/sources/civitai";
import { getCurated } from "@/lib/sources/curated";
import type { DiscoverItem } from "@/lib/sources/types";

export const runtime = "nodejs";

/**
 * GET /api/discover?source=reddit|curated|all&period=day|week|month
 *
 * Server-side aggregator. Shields the browser from CORS + rate-limits and
 * lets us layer source-specific normalization in one place.
 *
 * Returns `{ items, errors, config }`:
 *   - `errors[sourceName]` — human-readable failure reason per-source
 *   - `config.reddit.configured` — whether OAuth creds are set (so UI can
 *     show a "how to enable" hint instead of a bare error)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const src = url.searchParams.get("source") ?? "all";
  const period = (url.searchParams.get("period") ?? "week") as
    | "day"
    | "week"
    | "month";

  const out: DiscoverItem[] = [];
  const errors: Record<string, string> = {};

  // Client can request more, but we cap at 20 to protect Reddit's rate-limit
  // budget and the user's bandwidth (each card loads a thumbnail eagerly).
  const reqLimit = Number(url.searchParams.get("limit")) || 15;
  const limit = Math.max(5, Math.min(reqLimit, 20));

  if (src === "reddit" || src === "all") {
    try {
      const r = await fetchReddit({ period, limit, includeNsfw: false });
      out.push(...r);
    } catch (e) {
      errors.reddit = e instanceof Error ? e.message : String(e);
    }
  }
  if (src === "civitai" || src === "all") {
    try {
      const c = await fetchCivitai({ period, limit });
      out.push(...c);
    } catch (e) {
      errors.civitai = e instanceof Error ? e.message : String(e);
    }
  }
  if (src === "curated" || src === "all") {
    out.push(...getCurated());
  }

  return NextResponse.json(
    {
      items: out,
      errors,
      config: {
        reddit: { configured: hasRedditCredentials() },
      },
    },
    {
      // Browser-side HTTP cache: 5 min fresh, 10 min stale-while-revalidate.
      // Combined with the client-side store cache, most navigations hit 0 bytes.
      headers: {
        "Cache-Control":
          "public, max-age=300, stale-while-revalidate=600",
      },
    }
  );
}
