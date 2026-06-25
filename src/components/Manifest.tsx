"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useTranslations, useLocale } from "next-intl";
import LocaleSwitcher from "./LocaleSwitcher";
import "@/styles/frame.css";

/**
 * Slim "About" / manifesto page. Replaces the earlier prototype Landing
 * with its internal scene switcher, pricing section and tweaks panel.
 * This version is a pure marketing page that links out to the real app.
 */
export default function Manifest() {
  const t = useTranslations();
  const locale = useLocale();
  const zh = locale === "zh";
  const homeHref = zh ? "/" : "/en";
  // 工坊路径独立于首页 —— / 现在是 Landing,工坊在 /studio
  const studioHref = zh ? "/studio" : "/en/studio";
  const directorHref = zh ? "/director" : "/en/director";
  const archiveHref = zh ? "/archive" : "/en/archive";
  const editorHref = zh ? "/editor" : "/en/editor";
  const helpHref = zh ? "/help" : "/en/help";

  return (
    <div className="app">
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>STUDIO</b>
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right">
          <Link href={helpHref} className="chrome-icon" title={zh ? "帮助" : "Help"} style={{ textDecoration: "none" }}>?</Link>
          <LocaleSwitcher />
          <Link
            href={studioHref}
            className="btn primary"
            style={{ padding: "10px 16px", textDecoration: "none" }}
          >
            {t("nav.enter_studio")} <span className="arrow">→</span>
          </Link>
        </div>
      </header>

      <section className="scene on" style={{ padding: "96px 56px 80px" }}>
        <div className="mf-hero">
          <div className="mf-kicker">{t("hero.kicker")}</div>
          <h1 className="mf-title">
            {t("hero.title_prefix")} {t("hero.title_article")}{" "}
            <em>{t("hero.title_italic")}</em>
          </h1>
          <p className="mf-lead">{t("hero.lead")}</p>
          <div className="mf-cta-row">
            <Link href={studioHref} className="btn primary" style={{ textDecoration: "none" }}>
              {t("nav.enter_studio")} <span className="arrow">→</span>
            </Link>
          </div>
        </div>

        <div className="mf-pillars">
          {(
            ["direction", "continuity", "credit"] as const
          ).map((k) => (
            <div className="mf-pillar" key={k}>
              <div className="mf-pillar-kicker">
                {t(`pillars.${k}_kicker`)}
              </div>
              <h3 className="mf-pillar-title">
                {t(`pillars.${k}_title`)}
              </h3>
              <p className="mf-pillar-body">{t(`pillars.${k}_body`)}</p>
            </div>
          ))}
        </div>

        <div className="mf-capabilities">
          <div className="mf-cap-kicker">{zh ? "能干什么" : "What it does"}</div>
          <div className="mf-cap-grid">
            {(zh
              ? [
                  ["🎬 工坊", "一条 prompt 并发跑 16 个视频模型", studioHref],
                  ["🎬 导演台", "参考图 + 结构化输入 → AI Prompt → 视频", directorHref],
                  ["✂ 剪辑", "多 clip 拼接 / 转场 / 字幕 / 导出 MP4", editorHref],
                  ["🗂️ 档案", "全部作品归档，批量下载 / 导出 JSON", archiveHref],
                ]
              : [
                  ["🎬 Studio", "One prompt across 16 video models", studioHref],
                  ["🎬 Director", "Ref images + structured input → AI prompt → video", directorHref],
                  ["✂ Edit", "Trim / xfade / captions / export MP4", editorHref],
                  ["🗂️ Archive", "All your work, bulk download, JSON export", archiveHref],
                ]
            ).map(([label, desc, href]) => (
              <Link
                href={href}
                key={label}
                className="mf-cap"
                style={{ textDecoration: "none" }}
              >
                <div className="mf-cap-label">{label}</div>
                <div className="mf-cap-desc">{desc}</div>
              </Link>
            ))}
          </div>
        </div>

        <footer className="mf-foot">
          <div>FRAME/0 · {new Date().getFullYear()}</div>
          <div>
            {zh
              ? "按 ? 看快捷键 · ⌘K 打开命令面板"
              : "Press ? for shortcuts · ⌘K for command palette"}
          </div>
        </footer>
      </section>

      <style jsx global>{`
        .mf-hero {
          max-width: 920px;
          margin: 0 auto 88px;
        }
        .mf-kicker {
          font-family: var(--font-mono);
          font-size: 11.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--accent);
          font-weight: 600;
          margin-bottom: 28px;
        }
        .mf-title {
          font-family: var(--font-serif);
          font-size: clamp(56px, 10vw, 128px);
          line-height: 0.92;
          letter-spacing: -0.04em;
          font-weight: 400;
          color: var(--paper);
          margin: 0 0 32px;
        }
        .mf-title em {
          font-style: italic;
          color: var(--accent);
        }
        .mf-lead {
          font-family: var(--font-serif);
          font-size: 22px;
          line-height: 1.55;
          color: var(--paper-dim);
          max-width: 48ch;
          margin: 0 0 36px;
        }
        .mf-cta-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .mf-pillars {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 0;
          max-width: 1200px;
          margin: 0 auto 96px;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
        }
        .mf-pillar {
          padding: 32px 28px;
          border-right: 1px solid var(--line);
        }
        .mf-pillar:last-child {
          border-right: none;
        }
        .mf-pillar-kicker {
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          font-weight: 600;
          margin-bottom: 14px;
        }
        .mf-pillar-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 28px;
          line-height: 1.15;
          color: var(--paper);
          font-weight: 400;
          margin: 0 0 14px;
          letter-spacing: -0.01em;
        }
        .mf-pillar-body {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--paper-dim);
          margin: 0;
        }

        .mf-capabilities {
          max-width: 1200px;
          margin: 0 auto 80px;
        }
        .mf-cap-kicker {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--paper-mute);
          font-weight: 600;
          margin-bottom: 18px;
        }
        .mf-cap-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1px;
          background: var(--line);
          border: 1px solid var(--line);
        }
        .mf-cap {
          background: var(--ink);
          color: inherit;
          padding: 22px 20px;
          transition: background 0.15s;
        }
        .mf-cap:hover {
          background: var(--ink-2);
        }
        .mf-cap-label {
          font-family: var(--font-serif);
          font-size: 20px;
          font-weight: 400;
          color: var(--paper);
          margin-bottom: 6px;
        }
        .mf-cap-desc {
          font-family: var(--font-mono);
          font-size: 11.5px;
          line-height: 1.6;
          letter-spacing: 0.04em;
          color: var(--paper-dim);
        }

        .mf-foot {
          max-width: 1200px;
          margin: 60px auto 0;
          padding: 24px 0;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .mf-foot-owner {
          /* 联系署名行 —— 不全大写更可读，邮箱可点击 */
          text-transform: none;
          letter-spacing: 0.06em;
          color: var(--paper-dim);
        }
        .mf-foot-owner a {
          color: var(--accent);
          text-decoration: none;
        }
        .mf-foot-owner a:hover {
          text-decoration: underline;
        }
        @media (max-width: 700px) {
          .mf-foot {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
