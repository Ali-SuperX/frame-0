/**
 * Unified shape for items in the Discover wall — regardless of upstream
 * (Reddit / curated / future sources), everything lands here.
 */

export type DiscoverSource = "reddit" | "curated" | "civitai" | "user";

export type DiscoverItem = {
  /** Stable id within its source namespace. Used for dedupe + React keys. */
  id: string;
  source: DiscoverSource;
  /** Short title (Reddit post title / curated label). */
  title: string;
  /** The creative prompt text, best-effort extracted. May be empty for
   *  curated items where we only have a source link and not the raw prompt. */
  prompt?: string;
  /** Optional negative prompt (rare). */
  negativePrompt?: string;
  /** Publicly playable video URL. If absent, UI falls back to thumbnail +
   *  "Open source →" link. */
  videoUrl?: string;
  /** Optional poster / thumbnail URL. */
  thumbnailUrl?: string;
  /** Model / generator label shown in metadata (e.g. "Kling 2.0", "Seedance 2.0"). */
  modelLabel?: string;
  /** Creator attribution (Reddit author, artist handle, studio). */
  author?: string;
  /** URL to the original post or article — always linked out for attribution. */
  sourceUrl: string;
  /** Unix ms. */
  createdAt?: number;
  /** Engagement hint (Reddit upvotes, curated feature flag). */
  score?: number;
  /** Subreddit or channel tag. */
  channel?: string;
  /** Aspect ratio hint for grid sizing ("16:9" | "9:16" | "1:1"). */
  aspectRatio?: string;
  /** Category tags — cinematic / portrait / animation / landscape / experimental / narrative. */
  categories?: string[];
};

export type DiscoverCategory =
  | "cinematic"
  | "portrait"
  | "animation"
  | "landscape"
  | "experimental"
  | "narrative"
  | "commercial";

export const DISCOVER_CATEGORIES: Array<{
  id: DiscoverCategory | "all";
  label: { zh: string; en: string };
}> = [
  { id: "all", label: { zh: "全部", en: "All" } },
  { id: "cinematic", label: { zh: "电影感", en: "Cinematic" } },
  { id: "portrait", label: { zh: "肖像", en: "Portrait" } },
  { id: "animation", label: { zh: "动画", en: "Animation" } },
  { id: "landscape", label: { zh: "风景", en: "Landscape" } },
  { id: "narrative", label: { zh: "叙事", en: "Narrative" } },
  { id: "experimental", label: { zh: "实验", en: "Experimental" } },
  { id: "commercial", label: { zh: "商业", en: "Commercial" } },
];
