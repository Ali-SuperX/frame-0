import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "指南 · Frame/0",
  description: "HappyHorse 视频提示词全指南、实战短板应对方案",
};

type Doc = {
  /** public/ 下的 html 路径 */
  href: string;
  zhTitle: string;
  enTitle: string;
  zhDesc: string;
  enDesc: string;
  badge?: string;
};

const DOCS: Doc[] = [
  {
    href: "/hh-guide.html",
    zhTitle: "视频提示词全指南",
    enTitle: "Video Prompt Field Guide",
    zhDesc:
      "HappyHorse 1.0 完整指南：5 要素拆解、镜头语法、节奏控制、负向词模板、常见坑位。从零到能写出可控生成。",
    enDesc:
      "HappyHorse 1.0 complete walk-through: 5 elements, camera grammar, pacing, negative templates, common pitfalls.",
    badge: "主文档",
  },
  {
    href: "/hh-solutions.html",
    zhTitle: "实战短板 · 应对方案",
    enTitle: "Practical Failure Modes & Fixes",
    zhDesc:
      "分类总结生成中常见的失败案例（人物变形、运镜抖动、风格漂移等）以及对应的提示词修补思路。",
    enDesc:
      "Catalogued failure modes (warping, camera jitter, style drift) and the prompt patches that fix them.",
  },
  {
    href: "/hh-solutions-deck.html",
    zhTitle: "实战短板 · 汇报版",
    enTitle: "Solutions · Deck Edition",
    zhDesc: "以上文档的精简幻灯片版本，适合分享给团队。",
    enDesc: "Slide-formatted summary of the above, share-friendly.",
  },
];

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const zh = locale === "zh";
  const homeHref = zh ? "/" : "/en";

  return (
    <div className="app">
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>GUIDE</b>
            </div>
          </Link>
        </div>
        <TopNav current="guide" />
        <div className="right">
          <Link prefetch={false} href={zh ? "/help" : "/en/help"} className="chrome-icon" title={zh ? "帮助" : "Help"} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>?</Link>
        </div>
      </header>

      <main className="guide-main">
        <div className="guide-head">
          <h1 className="guide-title">{zh ? "提示词指南" : "Prompt Guides"}</h1>
          <p className="guide-sub">
            {zh
              ? "把「什么样的描述能让模型出对画面」沉淀成可读的文档。"
              : "Codify what kind of description gets the model to render correctly."}
          </p>
        </div>
        <div className="guide-grid">
          {DOCS.map((d) => (
            <a
              key={d.href}
              href={d.href}
              target="_blank"
              rel="noopener noreferrer"
              className="guide-card"
            >
              <div className="guide-card-head">
                <span className="guide-card-title">
                  {zh ? d.zhTitle : d.enTitle}
                </span>
                {d.badge && <span className="guide-card-badge">{d.badge}</span>}
              </div>
              <p className="guide-card-desc">{zh ? d.zhDesc : d.enDesc}</p>
              <span className="guide-card-cta">
                {zh ? "打开 →" : "Open →"}
              </span>
            </a>
          ))}
        </div>

      </main>

      <style>{`
        .guide-main {
          max-width: 920px;
          margin: 100px auto 80px;
          padding: 0 24px;
        }
        .guide-head { margin-bottom: 40px; }
        .guide-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          font-size: 48px;
          line-height: 1.1;
          margin: 0 0 12px;
          color: var(--paper);
        }
        .guide-sub {
          font-size: 15px;
          line-height: 1.6;
          color: var(--paper-dim);
          max-width: 60ch;
          margin: 0;
        }
        .guide-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .guide-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 22px 22px 18px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 10px;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.15s, transform 0.15s;
        }
        .guide-card:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
        }
        .guide-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .guide-card-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          font-size: 20px;
          color: var(--paper);
        }
        .guide-card-badge {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          padding: 3px 8px;
          border: 1px solid color-mix(in oklab, var(--accent) 50%, transparent);
          border-radius: 999px;
        }
        .guide-card-desc {
          font-size: 13px;
          line-height: 1.55;
          color: var(--paper-dim);
          margin: 0;
          flex: 1;
        }
        .guide-card-cta {
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.16em;
          color: var(--paper-mute);
          margin-top: 8px;
        }
        .guide-card:hover .guide-card-cta { color: var(--accent); }

        .guide-foot {
          margin-top: 56px;
          padding-top: 20px;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 12px;
          color: var(--paper-mute);
        }
        .guide-foot-owner { letter-spacing: 0.04em; }
        .guide-foot-mail {
          color: var(--accent);
          text-decoration: none;
          font-family: var(--font-mono);
          font-size: 11.5px;
        }
        .guide-foot-mail:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
