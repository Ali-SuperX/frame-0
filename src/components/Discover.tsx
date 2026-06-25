"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { useStudioStore } from "@/lib/store";
import { confirmDialog } from "@/components/ui/Dialog";
import { DISCOVER_CATEGORIES, type DiscoverCategory, type DiscoverItem } from "@/lib/sources/types";
import LocaleSwitcher from "./LocaleSwitcher";
import "@/styles/frame.css";

type Tab = "all" | "reddit" | "civitai" | "curated" | "saved";
type Period = "day" | "week" | "month";

export default function Discover() {
  const locale = useLocale();
  const zh = locale === "zh";
  const router = useRouter();

  const homeHref = zh ? "/" : "/en";
  const helpHref = zh ? "/help" : "/en/help";

  const savedPrompts = useStudioStore((s) => s.savedPrompts);
  const saveExternalPrompt = useStudioStore((s) => s.saveExternalPrompt);
  const createManualWork = useStudioStore((s) => s.createManualWork);
  const loadExternalPromptIntoDraft = useStudioStore(
    (s) => s.loadExternalPromptIntoDraft
  );
  const discoverCache = useStudioStore((s) => s.discoverCache);
  const setDiscoverCache = useStudioStore((s) => s.setDiscoverCache);

  const [tab, setTab] = useState<Tab>("all");
  const [period, setPeriod] = useState<Period>("week");
  const [category, setCategory] = useState<DiscoverCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [redditConfigured, setRedditConfigured] = useState(true);
  const [cacheMs, setCacheMs] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  /** Cache key per (source, period). Saved tab doesn't hit the network. */
  const cacheKey = `${tab === "all" ? "all" : tab}:${period}`;
  const TTL_MS = 60 * 60 * 1000; // 1 hour — 灵感数据不频繁变化，减少无效 fetch

  /**
   * Load discover data with a stale-while-revalidate strategy:
   *   - If cache is fresh, show it immediately and skip network
   *   - If cache is stale or missing, show cached (if any) + fetch in background
   *   - `force=true` bypasses cache entirely (refresh button)
   */
  function loadDiscover(force = false) {
    if (tab === "saved") return;
    const cached = discoverCache[cacheKey];
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    const isFresh = cached && age < TTL_MS;

    if (cached) {
      // Paint cached items instantly — zero network.
      setItems(cached.items as DiscoverItem[]);
      setRedditConfigured(cached.redditConfigured ?? true);
      setErr(
        cached.errors && Object.keys(cached.errors).length
          ? Object.entries(cached.errors)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
          : null
      );
      setCacheMs(age);
    }
    if (!force && isFresh) return; // all good, nothing to fetch

    // Stale or force → fetch in background. Only show spinner if no cache at all.
    if (!cached) setLoading(true);
    const qs = new URLSearchParams({
      source: tab === "all" ? "all" : tab,
      period,
    });
    fetch(`/api/discover?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        const newItems = (j.items ?? []) as unknown[];
        const hasErrors = j.errors && Object.keys(j.errors).length > 0;

        // If fetch returned zero items but has errors, keep existing cache intact
        // (e.g. "reddit: fetch failed" shouldn't wipe previously fetched good data)
        if (newItems.length === 0 && hasErrors && cached && (cached.items as unknown[]).length > 0) {
          setErr(
            Object.entries(j.errors)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
          );
          return;
        }

        const entry = {
          items: newItems,
          errors: j.errors,
          redditConfigured: j.config?.reddit?.configured ?? true,
          fetchedAt: Date.now(),
        };
        setDiscoverCache(cacheKey, entry);
        setItems(entry.items as DiscoverItem[]);
        setRedditConfigured(entry.redditConfigured ?? true);
        setErr(
          hasErrors
            ? Object.entries(j.errors)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")
            : null
        );
        setCacheMs(0);
      })
      .catch((e) => {
        // Network failure — never wipe cached data, just show error if no cache
        if (!cached) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDiscover(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  const filtered = useMemo(() => {
    if (tab === "saved") return [];
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (category !== "all") {
        if (!it.categories?.includes(category)) return false;
      }
      if (!q) return true;
      const blob = `${it.title} ${it.prompt ?? ""} ${it.modelLabel ?? ""} ${it.author ?? ""} ${it.channel ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, query, category, tab]);

  function onCopy(it: DiscoverItem) {
    if (!it.prompt) return;
    navigator.clipboard
      .writeText(it.prompt)
      .then(() => flash(zh ? "Prompt 已复制" : "Prompt copied"))
      .catch(() => flash(zh ? "复制失败" : "Copy failed"));
  }
  // 注:跳"工坊"统一用 /studio 路径(/ 现在是 Landing 主战页)
  function onLoadToStudio(it: DiscoverItem) {
    if (!it.prompt) return;
    loadExternalPromptIntoDraft(it.prompt, it.negativePrompt);
    flash(zh ? "载入工坊 ·跳转中…" : "Loaded · redirecting…");
    router.push(zh ? "/studio" : "/en/studio");
  }
  function onSaveToLibrary(it: DiscoverItem) {
    if (!it.prompt) return;
    saveExternalPrompt({
      prompt: it.prompt,
      title: it.title,
      negativePrompt: it.negativePrompt,
    });
    flash(zh ? "已收藏 ⭐" : "Saved ⭐");
  }
  function onAddToArchive(it: DiscoverItem) {
    if (!it.videoUrl) {
      flash(zh ? "该条目无视频直链" : "No direct video URL");
      return;
    }
    createManualWork({
      title: it.title,
      videoUrl: it.videoUrl,
      prompt: it.prompt,
      sourceLabel: it.modelLabel || it.channel || it.source,
      publish: true,
    });
    flash(zh ? "已加入档案 ⇲" : "Added to archive ⇲");
  }

  return (
    <div className="app" style={{ minHeight: "100vh" }}>
      {/* Chrome */}
      <header className="chrome">
        <div className="left">
          <Link
            href={homeHref}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>DISCOVER</b>
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right">
          <Link prefetch={false} href={helpHref} className="chrome-icon" title={zh ? "帮助" : "Help"} style={{ textDecoration: "none" }}>?</Link>
          <LocaleSwitcher />
          <span className="tag">
            <span className="dot" />
            {loading
              ? zh ? "加载中…" : "loading…"
              : `${filtered.length}`}
          </span>
        </div>
      </header>

      <section className="disc-section">
        <div className="disc-head">
          <div>
            <div className="disc-kicker">
              {zh ? "T/08 · 灵感广场" : "T/08 · Discover"}
            </div>
            <h1>
              {zh ? "别人的" : "What"}{" "}
              <em>{zh ? "提示词。" : "others prompted."}</em>
            </h1>
            <p>
              {zh
                ? "从 Reddit 社区聚合最新热门，加上一份手工维护的官方精选。每条都能一键复制 prompt、扔进工坊、收藏到你的库，或直接入档案。"
                : "Aggregated from Reddit communities plus a hand-curated set of official showcases. Copy the prompt, load it into Studio, save it, or pipe the video into your Archive — one click each."}
            </p>
          </div>

          <div className="disc-filters">
            <div className="disc-tabs">
              {(
                [
                  ["all", zh ? "全部" : "All"],
                  ["civitai", "CivitAI"],
                  ["curated", zh ? "精选" : "Curated"],
                  ["reddit", "Reddit"],
                  ["saved", zh ? "我的" : "My saved"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`disc-tab${tab === k ? " on" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {label}
                  {k === "saved" && savedPrompts.length > 0 && (
                    <span className="disc-pill">{savedPrompts.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="disc-period-row">
              {tab !== "saved" && tab !== "curated" && (
                <div className="disc-period">
                  {(
                    [
                      ["day", zh ? "今日" : "Day"],
                      ["week", zh ? "本周" : "Week"],
                      ["month", zh ? "本月" : "Month"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className={`disc-chip${period === k ? " on" : ""}`}
                      onClick={() => setPeriod(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {tab !== "saved" && (
                <button
                  type="button"
                  className="disc-refresh"
                  onClick={() => loadDiscover(true)}
                  disabled={loading}
                  title={
                    cacheMs !== null && cacheMs > 0
                      ? zh
                        ? `缓存 ${Math.round(cacheMs / 60_000)} 分钟前，点我强制刷新`
                        : `cached ${Math.round(cacheMs / 60_000)} min ago · click to refresh`
                      : zh
                        ? "刷新"
                        : "refresh"
                  }
                >
                  {loading ? "…" : "↻"}{" "}
                  {cacheMs !== null && cacheMs > 30_000 && (
                    <span className="disc-age">
                      {Math.round(cacheMs / 60_000)}m
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {tab !== "saved" && (
          <div className="disc-categories">
            {DISCOVER_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`disc-cat${category === c.id ? " on" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                {zh ? c.label.zh : c.label.en}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          className="disc-search"
          placeholder={
            zh
              ? "搜 prompt / 模型 / 作者 / 子板块"
              : "search prompt / model / author / channel"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Reddit credentials helper — shown instead of the raw error */}
        {(tab === "reddit" || tab === "all") && !redditConfigured && (
          <div className="disc-note">
            <b>{zh ? "Reddit 未配置" : "Reddit not configured"}</b>
            <span>
              {zh
                ? "到 reddit.com/prefs/apps 注册 script app，把 client_id / secret 填进 .env.local 的 "
                : "Register a script app at reddit.com/prefs/apps and add client_id / secret to .env.local as "}
              <code>REDDIT_CLIENT_ID</code> /{" "}
              <code>REDDIT_CLIENT_SECRET</code>
              {zh
                ? "，重启 dev server 即可启用。精选 tab 不受影响。"
                : ", then restart the dev server. Curated tab still works as-is."}
            </span>
          </div>
        )}
        {err && redditConfigured && <div className="disc-err">{err}</div>}

        {tab === "saved" ? (
          <SavedGrid zh={zh} />
        ) : loading ? (
          <div className="disc-loading">
            {zh ? "拉取中…" : "Fetching…"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="disc-empty">
            {zh ? "没有结果。换个关键词或时间窗？" : "No matches. Try a different term or period."}
          </div>
        ) : (
          <div className="disc-grid">
            {filtered.map((it) => (
              <DiscoverCard
                key={it.id}
                item={it}
                zh={zh}
                onCopy={() => onCopy(it)}
                onLoadToStudio={() => onLoadToStudio(it)}
                onSave={() => onSaveToLibrary(it)}
                onAddToArchive={() => onAddToArchive(it)}
              />
            ))}
          </div>
        )}
      </section>

      {toast && <div className="disc-toast">{toast}</div>}

      <style jsx global>{`
        .disc-section {
          padding: 60px 48px 80px;
          max-width: 1600px;
          margin: 0 auto;
        }
        .disc-head {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          align-items: end;
          border-bottom: 1px solid var(--line);
          padding-bottom: 24px;
          margin-bottom: 20px;
        }
        .disc-kicker {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 10px;
        }
        .disc-head h1 {
          font-family: var(--font-serif);
          font-size: 64px;
          line-height: 0.98;
          letter-spacing: -0.03em;
          font-weight: 400;
          margin: 0;
          color: var(--paper);
        }
        .disc-head h1 em {
          color: var(--accent);
          font-style: italic;
        }
        .disc-head p {
          margin-top: 14px;
          color: var(--paper-dim);
          max-width: 64ch;
          font-size: 14.5px;
          line-height: 1.55;
        }
        .disc-filters {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }
        .disc-tabs {
          display: flex;
          gap: 2px;
          border: 1px solid var(--line);
        }
        .disc-tab {
          padding: 9px 16px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--line);
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .disc-tab:last-child {
          border-right: none;
        }
        .disc-tab:hover {
          color: var(--paper);
        }
        .disc-tab.on {
          background: var(--paper);
          color: var(--ink);
        }
        .disc-pill {
          padding: 1px 6px;
          background: var(--accent);
          color: var(--ink);
          border-radius: 8px;
          font-size: 9.5px;
          font-weight: 700;
        }
        .disc-tab.on .disc-pill {
          background: var(--ink);
          color: var(--paper);
        }
        .disc-period-row {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .disc-period {
          display: flex;
          gap: 3px;
        }
        .disc-refresh {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 5px 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          cursor: pointer;
          border-radius: 2px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .disc-refresh:hover:not(:disabled) {
          border-color: var(--accent);
          color: var(--accent);
        }
        .disc-refresh:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .disc-age {
          font-size: 9.5px;
          color: var(--paper-mute);
          letter-spacing: 0.08em;
        }

        /* Category chips — second row of filters */
        .disc-categories {
          display: flex;
          gap: 4px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .disc-cat {
          padding: 5px 12px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .disc-cat:hover {
          color: var(--paper);
        }
        .disc-cat.on {
          background: var(--paper);
          color: var(--ink);
          border-color: var(--paper);
        }
        .disc-chip {
          padding: 5px 12px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .disc-chip.on {
          background: var(--accent);
          color: var(--ink);
          border-color: var(--accent);
        }

        .disc-search {
          width: 100%;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 10px 14px;
          font-family: var(--font-mono);
          font-size: 13.5px;
          margin-bottom: 24px;
        }
        .disc-search:focus {
          outline: none;
          border-color: var(--accent);
        }
        .disc-err {
          padding: 14px;
          background: color-mix(in oklab, #c44 14%, transparent);
          border: 1px solid #c44;
          color: #f88;
          font-family: var(--font-mono);
          font-size: 12px;
          margin-bottom: 20px;
        }
        .disc-note {
          padding: 14px 18px;
          background: color-mix(in oklab, var(--accent) 10%, var(--ink-2));
          border: 1px solid var(--accent);
          color: var(--paper);
          font-family: var(--font-mono);
          font-size: 12.5px;
          line-height: 1.55;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .disc-note b {
          color: var(--accent);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .disc-note code {
          background: var(--ink);
          border: 1px solid var(--line);
          padding: 1px 6px;
          border-radius: 2px;
          font-size: 11px;
          color: var(--paper);
        }
        .disc-loading,
        .disc-empty {
          padding: 60px 20px;
          text-align: center;
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.1em;
        }

        .disc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px 16px;
        }

        /* Discover card */
        .disc-card {
          background: var(--ink-2);
          border: 1px solid var(--line);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: all 0.18s;
        }
        .disc-card:hover {
          border-color: var(--paper-mute);
          transform: translateY(-2px);
        }
        .disc-thumb {
          aspect-ratio: 16 / 10;
          background: black;
          position: relative;
          overflow: hidden;
        }
        .disc-thumb video,
        .disc-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .disc-thumb.gradient {
          background-position: center;
          background-size: cover;
        }
        .disc-thumb .disc-source-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 3px 8px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(6px);
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper);
        }
        .disc-thumb .disc-model-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 3px 8px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(6px);
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .disc-body {
          padding: 12px 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .disc-title {
          font-family: var(--font-serif);
          font-size: 15.5px;
          line-height: 1.3;
          color: var(--paper);
          font-weight: 400;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .disc-prompt {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 13px;
          line-height: 1.5;
          color: var(--paper-dim);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .disc-meta {
          display: flex;
          gap: 10px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          color: var(--paper-mute);
          letter-spacing: 0.06em;
          flex-wrap: wrap;
        }
        .disc-meta a {
          color: var(--paper-mute);
          text-decoration: none;
        }
        .disc-meta a:hover {
          color: var(--accent);
        }
        .disc-actions {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid var(--line);
        }
        .disc-act {
          padding: 10px 6px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--line);
          color: var(--paper);
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.12s;
        }
        .disc-act:last-child {
          border-right: none;
        }
        .disc-act:hover {
          background: color-mix(in oklab, var(--accent) 18%, transparent);
          color: var(--accent);
        }
        .disc-act:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .disc-act:disabled:hover {
          background: transparent;
          color: var(--paper);
        }

        /* Saved tab uses similar grid but from savedPrompts */
        .disc-saved-empty {
          padding: 60px 20px;
          text-align: center;
          color: var(--paper-mute);
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 16px;
        }

        .disc-toast {
          position: fixed;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--paper);
          color: var(--ink);
          padding: 10px 20px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          z-index: 90;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          animation: disc-toast-in 0.18s ease-out;
        }
        @keyframes disc-toast-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-8px);
          }
        }
      `}</style>
    </div>
  );
}

/* ─────────── Card ─────────── */

function DiscoverCard({
  item,
  zh,
  onCopy,
  onLoadToStudio,
  onSave,
  onAddToArchive,
}: {
  item: DiscoverItem;
  zh: boolean;
  onCopy: () => void;
  onLoadToStudio: () => void;
  onSave: () => void;
  onAddToArchive: () => void;
}) {
  const hasPrompt = !!item.prompt;
  const hasVideo = !!item.videoUrl;
  const isGradient = item.thumbnailUrl?.startsWith("gradient:");
  const gradientVal = isGradient ? item.thumbnailUrl!.slice("gradient:".length) : undefined;

  return (
    <article className="disc-card">
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "block", textDecoration: "none", color: "inherit" }}
        title={zh ? "打开原始来源" : "Open source"}
      >
        <div
          className={`disc-thumb${isGradient ? " gradient" : ""}`}
          style={isGradient ? { background: gradientVal } : undefined}
        >
          {item.videoUrl ? (
            // preload="none" + lazy poster — no network traffic until hover.
            // Poster uses the Reddit preview thumbnail if we have one; that's
            // one small jpeg per card (cheap) instead of N video headers.
            <video
              src={item.videoUrl}
              poster={
                item.thumbnailUrl && !isGradient
                  ? item.thumbnailUrl
                  : undefined
              }
              muted
              loop
              playsInline
              preload="none"
              onMouseEnter={(e) => {
                const v = e.currentTarget;
                if (!v.src || v.src === "") return;
                void v.play().catch(() => {});
              }}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : item.thumbnailUrl && !isGradient ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
          ) : null}
          <div className="disc-source-badge">
            {item.channel || item.source}
          </div>
          {item.modelLabel && (
            <div className="disc-model-badge">{item.modelLabel}</div>
          )}
        </div>
      </a>
      <div className="disc-body">
        <div className="disc-title">{item.title}</div>
        {hasPrompt && <div className="disc-prompt">“{item.prompt}”</div>}
        <div className="disc-meta">
          {item.author && <span>@{item.author}</span>}
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
            {zh ? "原帖 ↗" : "source ↗"}
          </a>
        </div>
      </div>
      <div className="disc-actions">
        <button
          type="button"
          className="disc-act"
          onClick={onCopy}
          disabled={!hasPrompt}
          title={zh ? "复制 prompt" : "Copy prompt"}
        >
          ⎘ {zh ? "复制" : "Copy"}
        </button>
        <button
          type="button"
          className="disc-act"
          onClick={onLoadToStudio}
          disabled={!hasPrompt}
          title={zh ? "载入工坊 draft 并跳转" : "Load into Studio draft"}
        >
          → {zh ? "工坊" : "Studio"}
        </button>
        <button
          type="button"
          className="disc-act"
          onClick={onSave}
          disabled={!hasPrompt}
          title={zh ? "收藏到我的库" : "Save to my library"}
        >
          ⭐ {zh ? "收藏" : "Save"}
        </button>
        <button
          type="button"
          className="disc-act"
          onClick={onAddToArchive}
          disabled={!hasVideo}
          title={zh ? "视频入档案" : "Add to archive"}
        >
          ⇲ {zh ? "入档" : "Archive"}
        </button>
      </div>
    </article>
  );
}

/* ─────────── Saved tab content ─────────── */

function SavedGrid({ zh }: { zh: boolean }) {
  const savedPrompts = useStudioStore((s) => s.savedPrompts);
  const removeSavedPrompt = useStudioStore((s) => s.removeSavedPrompt);
  if (!savedPrompts.length) {
    return (
      <div className="disc-saved-empty">
        {zh
          ? "还没有收藏。在精选/Reddit 标签上点 ⭐ 收藏按钮。"
          : "Nothing saved yet. Hit ⭐ on a Curated or Reddit card."}
      </div>
    );
  }
  return (
    <div className="disc-grid">
      {savedPrompts.map((p) => (
        <article key={p.id} className="disc-card">
          <div
            className="disc-thumb gradient"
            style={{
              background:
                "linear-gradient(160deg, #2a2030 0%, #6a4050 50%, #d89060 100%)",
            }}
          >
            <div className="disc-source-badge">
              {zh ? "我的收藏" : "SAVED"}
            </div>
            {p.modelId && <div className="disc-model-badge">{p.modelId}</div>}
          </div>
          <div className="disc-body">
            <div className="disc-title">{p.title}</div>
            <div className="disc-prompt">“{p.prompt}”</div>
          </div>
          <div className="disc-actions">
            <button
              type="button"
              className="disc-act"
              onClick={() => {
                navigator.clipboard.writeText(p.prompt);
              }}
            >
              ⎘ {zh ? "复制" : "Copy"}
            </button>
            <button
              type="button"
              className="disc-act"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: zh ? "删除这条收藏？" : "Delete this saved prompt?",
                    danger: true,
                  })
                )
                  removeSavedPrompt(p.id);
              }}
            >
              × {zh ? "删除" : "Delete"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
