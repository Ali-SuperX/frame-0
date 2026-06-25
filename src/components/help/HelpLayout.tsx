import Link from "next/link";
import TopNav from "@/components/TopNav";
import "@/styles/help.css";
import { HelpTOC } from "./HelpTOC";
import { ALL_SECTIONS, TOC_ENTRIES } from "./sections";

export function HelpLayout({ homeHref }: { homeHref: string }) {
  return (
    <div className="app">
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right" />
      </header>

      <main className="help2-shell">
        <HelpTOC entries={TOC_ENTRIES} />

        <div className="help2-main">
          <section className="help2-hero">
            <p className="help2-eyebrow">官方文档 · Documentation</p>
            <h1 className="help2-title">
              Frame<span className="help2-title-accent">/</span>0
            </h1>
            <p className="help2-subtitle">
              一台与机器共同导演的 AI 影像生产仪器。本页面是产品完整文档 ——
              从概念定位、模型矩阵、导演台工作流，到系统限制、故障排查、术语表，
              覆盖每一个功能模块的"用法 · 边界 · 提示词技巧"。
            </p>
            <div className="help2-hero-meta">
              <span><b>章节数</b> 22</span>
              <span><b>更新于</b> 2026-05</span>
              <span><b>语言</b> 中文 · <Link href="/en/help" style={{ color: "inherit" }}>English</Link></span>
              <span><b>反馈</b> AGENTS.md / PRODUCT.md</span>
            </div>
          </section>

          {ALL_SECTIONS.map((S, i) => <S key={i} />)}

          <section className="help2-cta">
            <p className="help2-cta-text">读完了？打开工坊开始创作。</p>
            <Link href="/studio" className="help2-cta-btn">进入工坊 →</Link>
          </section>
        </div>
      </main>
    </div>
  );
}
