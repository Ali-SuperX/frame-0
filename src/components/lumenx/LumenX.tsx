"use client";

/**
 * LumenX 入口 ——
 *  - 无当前项目：显示项目列表首页（新建 + 已有项目卡片）。
 *  - 有当前项目：进入 4-Tab 编辑器（LumenXLayout 包裹 + 当前 Tab 内容 + 右侧 ChatPanel）。
 *
 * Tab 切换由 store.setTab 驱动；LumenXLayout 内已渲染 ChatPanel，因此这里只需根据
 * project.tab 选择左侧内容组件即可。
 */

import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useLocale } from "next-intl";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useJobPolling } from "@/lib/bailian/useJobPolling";
import { useLumenStore, useCurrentProject } from "@/lib/lumenx/store";
import type { LxProject, LxTab } from "@/lib/lumenx/types";
import LumenXLayout from "./Layout";
import ScriptTab from "./tabs/ScriptTab";
import CharacterTab from "./tabs/CharacterTab";
import StoryboardTab from "./tabs/StoryboardTab";
import TimelineTab from "./tabs/TimelineTab";
import "@/styles/frame.css";
import "@/styles/lumenx.css";

export default function LumenX() {
  useJobPolling();
  const locale = useLocale();
  const zh = locale === "zh";
  const project = useCurrentProject();

  if (!project) {
    return (
      <div className="lx-app">
        <Chrome zh={zh} />
        <Home zh={zh} />
      </div>
    );
  }

  return (
    <LumenXLayout>
      <TabContent tab={project.tab} project={project} />
    </LumenXLayout>
  );
}

/* ───────────── Tab 内容路由 ───────────── */
function TabContent({ tab, project }: { tab: LxTab; project: LxProject }) {
  switch (tab) {
    case "script":
      return <ScriptTab />;
    case "character":
      return <CharacterTab />;
    case "storyboard":
      return <StoryboardTab />;
    case "timeline":
      return <TimelineTab project={project} />;
  }
}

/* ───────────── 顶部导航（仅项目列表页使用） ───────────── */
function Chrome({ zh }: { zh: boolean }) {
  const hp = (p: string) => (zh ? p : `/en${p}`);
  return (
    <header className="chrome">
      <div className="left">
        <Link href={hp("/")} className="logo-link" style={{ textDecoration: "none" }}>
          <div className="logo">
            Frame<span style={{ color: "var(--accent)" }}>/</span>0 <b>LUMENX</b>
          </div>
        </Link>
      </div>
      <TopNav />
      <div className="right">
        <Link
          prefetch={false}
          href={hp("/help")}
          className="chrome-icon"
          title={zh ? "帮助" : "Help"}
          style={{ textDecoration: "none" }}
        >
          ?
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}

/* ───────────── 首页：一键新建 + 项目卡墙 ───────────── */
function Home({ zh }: { zh: boolean }) {
  const projects = useLumenStore((s) => s.projects);
  const createProject = useLumenStore((s) => s.createProject);
  const deleteProject = useLumenStore((s) => s.deleteProject);
  const open = useLumenStore((s) => s.open);

  const startBlank = () => {
    createProject({ sourceText: "", aspect: "16:9" });
    // createProject 内部已经把 currentId 切到新项目，外层 LumenX 会立刻渲染编辑器。
  };

  return (
    <main className="lx-home">
      <HomeStyles />

      {/* 顶部标识：编号 · 标语 · 副标 —— editorial / 暗房感 */}
      <header className="lx-home__hero">
        <span className="lx-home__index">N°&nbsp;00 · SCRIPT&nbsp;DESK</span>
        <h1 className="lx-home__title">
          <span className="lx-home__title-mark">LUMEN</span>
          <span className="lx-home__title-x">X</span>
        </h1>
        <p className="lx-home__sub">
          AI 短剧创作工作台 · 一键开新本，剧本 / 角色 / 分镜 / 时间线四联工序，对话面板常驻右侧。
        </p>
        <div className="lx-home__rule" aria-hidden />
      </header>

      {/* 项目卡墙：第一张是「新建」， 其余是已有项目 */}
      <section className="lx-home__deck">
        <button type="button" className="lx-home__new" onClick={startBlank}>
          <span className="lx-home__new-glow" aria-hidden />
          <span className="lx-home__new-cross" aria-hidden>
            <span />
            <span />
          </span>
          <span className="lx-home__new-title">新建短剧</span>
          <span className="lx-home__new-sub">空白工程 · 进入即写</span>
          <span className="lx-home__new-tag">↵ ENTER</span>
        </button>

        {projects.map((p, i) => (
          <article
            key={p.id}
            className="lx-home__card"
            onClick={() => open(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open(p.id);
              }
            }}
          >
            <button
              type="button"
              className="lx-home__card-del"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`删除「${p.title}」？此操作不可恢复。`)) deleteProject(p.id);
              }}
            >
              ×
            </button>
            <div className="lx-home__card-tape" aria-hidden>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <em>·</em>
              <span>{p.aspect}</span>
            </div>
            <h3 className="lx-home__card-title">{p.title || "未命名短剧"}</h3>
            <p className="lx-home__card-excerpt">
              {p.sourceText.trim()
                ? p.sourceText.trim().slice(0, 96)
                : <span className="lx-home__card-empty">还没有正文 · 进入后即可粘贴或让 AI 起稿</span>}
            </p>
            <footer className="lx-home__card-foot">
              <span><b>{p.characters.length}</b> 角色</span>
              <span><b>{p.scenes.length}</b> 场</span>
              <span><b>{p.shots.length}</b> 镜</span>
              <span className="lx-home__card-arrow">↗</span>
            </footer>
          </article>
        ))}
      </section>

      {projects.length === 0 && (
        <p className="lx-home__hint">点上方「新建短剧」即可开始 · 任何步骤都能让右侧 AI 接手。</p>
      )}
      {!zh && <p className="lx-home__hint">UI is Chinese-first (matches the upstream lumenx workflow).</p>}
    </main>
  );
}

/* ───────────── 首页样式 —— 暗房 + 铜金，胶片感 ───────────── */
function HomeStyles() {
  return (
    <style jsx global>{`
      .lx-home {
        max-width: 1180px;
        margin: 0 auto;
        padding: 96px 32px 96px;
        color: var(--paper);
        font-family: var(--font-sans);
      }

      /* —— Hero —— */
      .lx-home__hero {
        position: relative;
        text-align: center;
        padding: 0 0 48px;
      }
      .lx-home__index {
        display: inline-block;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
        letter-spacing: 0.32em;
        color: color-mix(in oklab, var(--accent) 60%, var(--paper-mute));
        margin-bottom: 22px;
      }
      .lx-home__title {
        margin: 0;
        font-family: var(--font-serif, var(--font-sans));
        font-size: clamp(72px, 13vw, 168px);
        font-weight: 500;
        font-style: italic;
        line-height: 0.92;
        letter-spacing: -0.04em;
        color: var(--paper);
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 0.04em;
      }
      .lx-home__title-mark {
        background: linear-gradient(180deg, var(--paper) 0%, color-mix(in oklab, var(--paper) 60%, var(--ink)) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .lx-home__title-x {
        background: linear-gradient(160deg, var(--accent) 0%, var(--accent-2) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        font-style: normal;
        margin-left: 0.06em;
      }
      .lx-home__sub {
        margin: 22px auto 0;
        max-width: 56ch;
        font-size: 15px;
        line-height: 1.75;
        color: var(--paper-dim);
      }
      .lx-home__rule {
        margin: 36px auto 0;
        width: 64px;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--accent), transparent);
      }

      /* —— 卡墙 —— */
      .lx-home__deck {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 8px;
      }

      /* —— 新建卡：发光边框 + 大十字 —— */
      .lx-home__new {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 220px;
        padding: 28px 20px;
        font-family: inherit;
        background:
          radial-gradient(140% 90% at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 60%),
          color-mix(in oklab, var(--ink-2) 90%, var(--accent) 4%);
        color: var(--paper);
        border: 1px solid color-mix(in oklab, var(--accent) 40%, var(--line));
        border-radius: 18px;
        cursor: pointer;
        overflow: hidden;
        transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
      }
      .lx-home__new:hover {
        transform: translateY(-3px);
        border-color: var(--accent);
        box-shadow: 0 16px 48px -16px color-mix(in oklab, var(--accent) 70%, transparent);
      }
      .lx-home__new-glow {
        position: absolute;
        inset: -40% 30% auto auto;
        width: 70%;
        height: 180%;
        background: radial-gradient(closest-side, color-mix(in oklab, var(--accent) 28%, transparent), transparent 70%);
        pointer-events: none;
        animation: lx-home-pulse 4.6s ease-in-out infinite;
      }
      @keyframes lx-home-pulse {
        0%, 100% { opacity: 0.55; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.06); }
      }
      .lx-home__new-cross {
        position: relative;
        width: 42px;
        height: 42px;
      }
      .lx-home__new-cross span {
        position: absolute;
        background: linear-gradient(160deg, var(--accent), var(--accent-2));
        border-radius: 2px;
      }
      .lx-home__new-cross span:first-child {
        top: 50%; left: 0; right: 0; height: 3px; transform: translateY(-50%);
      }
      .lx-home__new-cross span:last-child {
        left: 50%; top: 0; bottom: 0; width: 3px; transform: translateX(-50%);
      }
      .lx-home__new-title {
        margin-top: 6px;
        font-family: var(--font-serif, var(--font-sans));
        font-size: 22px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--paper);
      }
      .lx-home__new-sub {
        font-size: 12.5px;
        color: var(--paper-mute);
        letter-spacing: 0.04em;
      }
      .lx-home__new-tag {
        position: absolute;
        bottom: 14px;
        right: 16px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px;
        letter-spacing: 0.18em;
        color: color-mix(in oklab, var(--accent) 60%, var(--paper-mute));
        opacity: 0;
        transform: translateX(6px);
        transition: opacity 220ms ease, transform 220ms ease;
      }
      .lx-home__new:hover .lx-home__new-tag {
        opacity: 1;
        transform: translateX(0);
      }

      /* —— 已有项目卡 —— */
      .lx-home__card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 220px;
        padding: 18px 18px 16px;
        background: color-mix(in oklab, var(--ink-2) 88%, var(--paper) 4%);
        border: 1px solid var(--line);
        border-radius: 18px;
        cursor: pointer;
        outline: none;
        transition: transform 220ms ease, border-color 220ms ease, background 220ms ease;
      }
      .lx-home__card:hover,
      .lx-home__card:focus-visible {
        transform: translateY(-3px);
        border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
        background: color-mix(in oklab, var(--ink-2) 80%, var(--accent) 6%);
      }
      .lx-home__card-del {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        color: var(--paper-mute);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        transition: opacity 160ms ease, background 160ms ease, color 160ms ease;
      }
      .lx-home__card:hover .lx-home__card-del,
      .lx-home__card:focus-visible .lx-home__card-del {
        opacity: 1;
      }
      .lx-home__card-del:hover {
        background: color-mix(in oklab, var(--accent-2) 18%, transparent);
        border-color: color-mix(in oklab, var(--accent-2) 50%, var(--line));
        color: var(--paper);
      }
      .lx-home__card-tape {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10.5px;
        letter-spacing: 0.18em;
        color: color-mix(in oklab, var(--accent) 55%, var(--paper-mute));
        text-transform: uppercase;
      }
      .lx-home__card-tape em { font-style: normal; opacity: 0.5; }
      .lx-home__card-title {
        margin: 0;
        font-family: var(--font-serif, var(--font-sans));
        font-size: 22px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--paper);
        letter-spacing: -0.005em;
      }
      .lx-home__card-excerpt {
        margin: 0;
        flex: 1;
        font-size: 12.5px;
        line-height: 1.7;
        color: var(--paper-dim);
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .lx-home__card-empty {
        font-style: italic;
        color: var(--paper-mute);
      }
      .lx-home__card-foot {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-top: 6px;
        padding-top: 12px;
        border-top: 1px dashed color-mix(in oklab, var(--accent) 16%, var(--line));
        font-size: 11.5px;
        color: var(--paper-mute);
        letter-spacing: 0.02em;
      }
      .lx-home__card-foot b {
        font-weight: 600;
        color: var(--paper);
        margin-right: 2px;
      }
      .lx-home__card-arrow {
        margin-left: auto;
        font-size: 14px;
        color: color-mix(in oklab, var(--accent) 70%, var(--paper));
        transform: translateX(0);
        transition: transform 220ms ease;
      }
      .lx-home__card:hover .lx-home__card-arrow {
        transform: translate(3px, -3px);
      }

      .lx-home__hint {
        margin: 32px auto 0;
        text-align: center;
        font-size: 12.5px;
        color: var(--paper-mute);
        letter-spacing: 0.02em;
      }

      @media (max-width: 720px) {
        .lx-home { padding: 64px 18px 80px; }
        .lx-home__hero { padding-bottom: 32px; }
        .lx-home__deck { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 480px) {
        .lx-home__deck { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
