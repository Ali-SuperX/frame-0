"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useR2VStore, type Stage } from "@/lib/r2v/projectStore";
import { useStudioStore, type JobMedia } from "@/lib/store";
import { confirmDialog } from "@/components/ui/Dialog";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import ProjectStepper from "./ProjectStepper";
import Card1Inputs from "./Card1Inputs";
import Card2Prompt from "./Card2Prompt";
import Card3Video from "./Card3Video";
import R2VSidebar from "./R2VSidebar";
import "@/styles/r2v.css";

/**
 * R2V (Director) workspace — mounted as a standalone page at /[locale]/director.
 * Closing the workspace navigates back to the Studio (/studio) via router.push(studioHref).
 * Note: / itself is now the Landing marketing page, not Studio.
 */
export default function R2VWorkspace() {
  const locale = useLocale();
  const zh = locale === "zh";
  const router = useRouter();
  const homeHref = zh ? "/" : "/en";
  const helpHref = zh ? "/help" : "/en/help";
  const studioHref = zh ? "/studio" : "/en/studio";
  // 关闭导演台 / 应用配置后回工坊(不是回 / 首页 —— 首页是 Landing)
  const closeWorkspace = () => router.push(studioHref);

  // ── Page-level top chrome nav. Shared across all 3 return branches
  //    (loading / fsa-unsupported / main). The r2v-overlay reserves
  //    top:65px below the chrome (see r2v.css). ──
  const chromeNav = (
    <header className="chrome">
      <div className="left">
        <Link href={homeHref} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="logo">
            Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
            <b>DIRECTOR</b>
          </div>
        </Link>
      </div>
      <TopNav current="director" />
      <div className="right">
        <Link
          prefetch={false}
          href={helpHref}
          className="chrome-icon"
          title={zh ? "帮助文档 (?)" : "Help docs (?)"}
          style={{ textDecoration: "none" }}
        >
          ?
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );

  const hydrated = useR2VStore((s) => s.hydrated);
  const fsaUnsupported = useR2VStore((s) => s.fsaUnsupported);
  const current = useR2VStore((s) => s.current);
  const stage = useR2VStore((s) => s.stage);
  const promptOutput = useR2VStore((s) => s.promptOutput);
  const errorMessage = useR2VStore((s) => s.errorMessage);
  const unsavedDraft = useR2VStore((s) => s.unsavedDraft);

  const rootHandle = useR2VStore((s) => s.rootHandle);
  const pickRoot = useR2VStore((s) => s.pickRoot);
  const persistDraft = useR2VStore((s) => s.persistDraft);

  const hydrate = useR2VStore((s) => s.hydrate);
  const setStage = useR2VStore((s) => s.setStage);
  const startBlankDraft = useR2VStore((s) => s.startBlankDraft);
  const updateInput = useR2VStore((s) => s.updateInput);

  /* ── mode switcher (Cinematic ↔ UGC) ──
   * Lives in the topbar so it's one click away from anywhere. Confirm dialog
   * runs when the user would lose mid-flow work; data from the other mode is
   * never discarded — just hidden until they switch back. */
  async function setMode(next: "cinematic" | "ugc") {
    const cur = current;
    if (!cur) return;
    if (next === cur.mode) return;
    const hasUgcWork =
      (cur.chunks?.length ?? 0) > 0 ||
      Object.values(cur.universalBlocks ?? {}).some((v) => v?.trim());
    const hasCinematicWork = !!(
      cur.style ||
      cur.contentDirection ||
      cur.sceneType ||
      cur.brand ||
      cur.mustKeep
    );
    const switchingAwayFromWork =
      (cur.mode === "ugc" && hasUgcWork && next === "cinematic") ||
      (cur.mode === "cinematic" && hasCinematicWork && next === "ugc");
    if (switchingAwayFromWork) {
      const ok = await confirmDialog({
        title: zh ? "切换模式" : "Switch mode",
        message: zh
          ? next === "cinematic"
            ? "切到「单镜大片」后，「批量短片」相关字段（chunks / Universal Blocks）将被隐藏但保留 — 切回仍可见。"
            : "切到「批量短片」后，「单镜大片」相关字段（风格 / 内容方向 / 品牌等）将被隐藏但保留 — 切回仍可见。"
          : `Switching to ${next}. Other-mode fields are hidden but preserved.`,
        confirmText: zh ? "继续" : "Continue",
      });
      if (!ok) return;
    }
    void updateInput({ mode: next });
  }

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flushToast, setFlushToast] = useState<string | null>(null);

  /* ── flush R2V config into Studio draft, then close overlay ── */
  function flushToStudio() {
    const { current: cur, promptOutput } = useR2VStore.getState();
    if (!cur || !promptOutput?.prompt) return;

    const store = useStudioStore.getState();

    // 1. Switch model
    store.setModelId("happyhorse-1.1-r2v");

    // 2. Map R2V references → Studio media.reference_urls
    const refs: JobMedia[] = cur.references
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url,
        name: r.name,
        thumbDataUrl: r.thumbDataUrl,
        localKey: r.localKey,
        localPath: r.localPath,
      }));
    store.setMedia({
      reference_urls: refs,
      img_url: undefined,
      video_url: undefined,
      ref_images: undefined,
    });

    // 3. Set prompt + negative prompt
    store.setPrompt(promptOutput.prompt);
    store.setNegativePrompt(promptOutput.negativePrompt ?? "");

    // 4. Override output params
    store.setParam("resolution", cur.output.resolution);
    store.setParam("ratio", cur.output.ratio);
    store.setParam("duration", cur.output.duration);
    store.setParam("watermark", cur.output.watermark);

    // 5. Show toast → close after delay so user sees confirmation
    const summary = zh
      ? `✅ 已刷入：${refs.length} 张图 · ${cur.output.duration}s · ${cur.output.ratio}`
      : `✅ Pushed: ${refs.length} refs · ${cur.output.duration}s · ${cur.output.ratio}`;
    setFlushToast(summary);
    window.setTimeout(() => {
      setFlushToast(null);
      closeWorkspace();
    }, 1200);
  }

  /* ── one-time hydration ── */
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  /* ── inner project-list drawer state (R2VSidebar). ── */
  const effectiveDrawerOpen = drawerOpen;

  /* ── ESC closes the inner project drawer first; if it's already closed,
   *    ESC navigates back to the Studio. ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (effectiveDrawerOpen) setDrawerOpen(false);
      else closeWorkspace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDrawerOpen]);

  /* ── auto-create a draft on mount so the user lands directly on Card1
   *    instead of staring at an empty shell. ── */
  useEffect(() => {
    if (hydrated && !current && !fsaUnsupported) {
      startBlankDraft(zh ? "zh" : "en");
    }
  }, [hydrated, current, fsaUnsupported, zh, startBlankDraft]);

  if (!hydrated) {
    return (
      <>
        {chromeNav}
        <div className="r2v-overlay r2v-overlay--open">
          <div className="r2v-shell">
            <div className="r2v-empty-state">
              {zh ? "正在初始化..." : "Initialising..."}
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ── browser unsupported (Safari / Firefox) ── */
  if (fsaUnsupported) {
    return (
      <>
        {chromeNav}
        <div className="r2v-overlay r2v-overlay--open">
          <button
            type="button"
            className="r2v-overlay-close"
            onClick={closeWorkspace}
          aria-label={zh ? "返回工坊" : "Close R2V workspace"}
        >
          ✕
        </button>
        <div className="r2v-shell">
          <div className="r2v-empty-state r2v-empty-state--error">
            <h2>
              {zh
                ? "当前浏览器不支持 File System Access"
                : "This browser doesn't support File System Access"}
            </h2>
            <p>
              {zh
                ? "请使用 Chrome / Edge / Arc / Brave 等 Chromium 浏览器打开。"
                : "Use a Chromium-based browser (Chrome / Edge / Arc / Brave)."}
            </p>
          </div>
        </div>
      </div>
      </>
    );
  }

  // Without a current draft / project, show a friendly empty Main pane (the
  // sidebar still lets the user start one).
  const card1Ready = true;
  const card2Ready = !!current && current.references.some((r) => !!r.url);
  const card3Ready = !!promptOutput?.prompt;

  return (
    <>
    {chromeNav}
    <div
      className="r2v-overlay r2v-overlay--open"
    >
      <button
        type="button"
        className="r2v-overlay-close"
        onClick={closeWorkspace}
        aria-label={zh ? "返回工坊" : "Close R2V workspace"}
        title={zh ? "返回工坊（Esc）" : "Back to Studio (Esc)"}
      >
        ✕ {zh ? "返回工坊" : "Back"}
      </button>
      <div className="r2v-layout">
        <R2VSidebar zh={zh} open={effectiveDrawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="r2v-main-wrap">
          <div className="r2v-topbar-row">
          <button
            type="button"
            className="r2v-drawer-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label={zh ? "打开项目抽屉" : "Open projects drawer"}
            title={zh ? "项目抽屉 (Esc 关闭)" : "Projects drawer (Esc to close)"}
          >
          <span className="r2v-drawer-toggle-icon" aria-hidden>
            ☰
          </span>
          <span className="r2v-drawer-toggle-label">
            {zh ? "项目" : "Projects"}
            {current ? (
              <span className="r2v-drawer-toggle-current">
                · {current.title || (zh ? "未命名" : "Untitled")}
              </span>
            ) : null}
          </span>
        </button>
        {/* Mode switcher — segmented control. Click switches with a confirm
            dialog if the user would lose mid-flow work. UGC button shows
            chunks summary inline when active. */}
        {current ? (
          <div
            className="r2v-mode-switch"
            role="tablist"
            aria-label={zh ? "项目模式" : "Project mode"}
          >
            <button
              type="button"
              role="tab"
              aria-selected={current.mode === "cinematic"}
              className={`r2v-mode-switch-btn ${
                current.mode === "cinematic" ? "r2v-mode-switch-btn--on" : ""
              }`}
              onClick={() => setMode("cinematic")}
              title={zh ? "1 条精品 · 品牌 / 高端电商" : "1 hero video · Brand / Luxury"}
            >
              🎬 {zh ? "单镜大片" : "Cinematic"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={current.mode === "ugc"}
              className={`r2v-mode-switch-btn ${
                current.mode === "ugc" ? "r2v-mode-switch-btn--on" : ""
              }`}
              onClick={() => setMode("ugc")}
              title={zh ? "5-7 段 · 投流变体 / 跨境电商" : "5-7 chunks · Performance ads"}
            >
              📱 {zh ? "批量短片" : "UGC"}
              {current.mode === "ugc" && current.chunks.length > 0 ? (
                <span className="r2v-mode-switch-detail">
                  {" · "}
                  {current.chunks.length} {zh ? "段" : "ch"}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
        <a
          href="/hh-guide.html"
          target="_blank"
          rel="noopener"
          className="r2v-topbar-help"
          title={zh
            ? "HH 提示词指南 — 38 个最佳实践案例 + 11 条电商原则 + 调优三档"
            : "HH Prompt Guide — 38 cases + 11 e-com principles"}
          aria-label="HH Prompt Guide"
        >
          <span aria-hidden>?</span>
        </a>
        </div>
        {unsavedDraft ? (
          <div className="r2v-banner r2v-banner--draft" role="status">
            <span>
              {zh
                ? "✏️ 草稿模式 — 字段暂存在浏览器里，保存到磁盘后 Qoder 才能接手"
                : "✏️ Draft — lives in your browser. Save to disk so Qoder can pick it up."}
            </span>
            <button
              type="button"
              className="r2v-btn r2v-btn--xs r2v-banner-action"
              onClick={() => {
                if (rootHandle) {
                  void persistDraft();
                } else {
                  void pickRoot().then(() => persistDraft());
                }
              }}
            >
              {rootHandle
                ? zh ? "💾 保存草稿" : "💾 Save draft"
                : zh ? "📁 选目录并保存" : "📁 Pick folder & save"}
            </button>
          </div>
        ) : null}
        {errorMessage ? (
          <div className="r2v-banner r2v-banner--error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {current ? (
          <>
            <ProjectStepper
              stage={stage}
              card1Ready={card1Ready}
              card2Ready={card2Ready}
              card3Ready={card3Ready}
              zh={zh}
              onJump={(s: Stage) => setStage(s)}
            />

            <main className="r2v-main">
              {stage === 1 ? (
                <Card1Inputs zh={zh} onContinue={() => setStage(2)} />
              ) : null}
              {stage === 2 ? (
                <Card2Prompt zh={zh} onContinue={flushToStudio} />
              ) : null}
              {stage === 3 ? <Card3Video zh={zh} /> : null}
            </main>
          </>
        ) : (
          <div className="r2v-empty-main">
            <div className="r2v-empty-card">
              <h2>
                {zh
                  ? "选一个项目，或新建一个"
                  : "Pick a project, or start a new one"}
              </h2>
              <p>
                {zh
                  ? "frame-0 ↔ Qoder 通过本地文件协作。先填字段，后选目录。"
                  : "frame-0 ↔ Qoder collaborate via local files. Fill the fields first, pick a folder later."}
              </p>
              <button
                type="button"
                className="r2v-btn r2v-btn--primary r2v-btn--lg"
                onClick={() => startBlankDraft(zh ? "zh" : "en")}
              >
                {zh ? "+ 新建草稿" : "+ Start a draft"}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      {/* ── flush toast ── */}
      {flushToast ? (
        <div className="r2v-flush-toast" role="status">
          {flushToast}
        </div>
      ) : null}
    </div>
    </>
  );
}
