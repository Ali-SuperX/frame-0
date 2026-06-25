"use client";

/**
 * StageShell —— /stage 主入口
 * 布局：顶栏(logo + 全局导航 + tabs + 放映) | 主体(workspace + 持久右侧栏)
 * 4 Tabs: 剧本 / 角色 / 分镜 / 时间轴
 * 右侧栏(ShotSidebar)在所有 Tab 持久显示。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useLocale } from "next-intl";
import { useStudioStore, type Job } from "@/lib/store";
import BibleWorkspace from "./BibleWorkspace";
import ScriptWorkspace from "./ScriptWorkspace";
import BoardWorkspace from "./BoardWorkspace";
import TimelineWorkspace from "./TimelineWorkspace";
import ShotSidebar from "./ShotSidebar";
import StageShortcuts from "./StageShortcuts";
import { CinemaTheater } from "./cinema/CinemaTheater";
import { useCinema } from "./cinema/useCinema";
import { usePlayback } from "./cinema/usePlayback";
import "@/styles/frame.css";
import "@/styles/stage.css";
import "@/styles/stage-cinema.css";

export type TabId = "script" | "bible" | "board" | "timeline";

const TABS: { id: TabId; zh: string; en: string }[] = [
  { id: "script", zh: "剧本", en: "Script" },
  { id: "bible", zh: "角色", en: "Bible" },
  { id: "board", zh: "分镜", en: "Board" },
  { id: "timeline", zh: "时间轴", en: "Timeline" },
];

export default function StageShell() {
  const locale = useLocale();
  const zh = locale === "zh";
  const hp = (p: string) => (zh ? p : `/en${p}`);

  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const jobs = useStudioStore((s) => s.jobs);
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);
  const migrateIfNeeded = useStudioStore((s) => s.migrateIfNeeded);
  useEffect(() => { migrateIfNeeded(); }, [migrateIfNeeded]);

  const currentEp = series.episodes[0];
  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const [tab, setTab] = useState<TabId>("timeline");
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  function handleAddShot() {
    if (!currentEp) return;
    let sceneId = currentEp.scenes[0]?.id;
    if (!sceneId) sceneId = addScene(currentEp.id);
    addShot(currentEp.id, sceneId, { shotType: "still", durationSec: 3, narration: "", elementRefs: [] });
  }

  // 放映用
  const film = useCinema();
  const durations = useMemo(() => film.shots.map((s) => s.durSec), [film.shots]);
  const pb = usePlayback(durations);

  // 右侧栏点击镜头 → 跳到时间轴 tab
  function handleSidebarSelect(shotId: string) {
    setSelectedShotId(shotId);
    if (tab !== "timeline") setTab("timeline");
  }

  // ── 键盘快捷键 ──
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable) return;

      switch (e.key) {
        case "ArrowLeft": pb.prev(); e.preventDefault(); break;
        case "ArrowRight": pb.next(); e.preventDefault(); break;
        case " ": e.preventDefault(); break;
        case "n": case "N": if (!e.metaKey && !e.ctrlKey) { handleAddShot(); e.preventDefault(); } break;
        case "f": case "F": if (!e.metaKey && !e.ctrlKey) { setTheaterOpen(true); e.preventDefault(); } break;
        case "Escape": setTheaterOpen(false); setShortcutsOpen(false); setComposerOpen(false); break;
        case "?": setShortcutsOpen((v) => !v); e.preventDefault(); break;
        case "1": setTab("script"); e.preventDefault(); break;
        case "2": setTab("bible"); e.preventDefault(); break;
        case "3": setTab("board"); e.preventDefault(); break;
        case "4": setTab("timeline"); e.preventDefault(); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pb.prev, pb.next]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app ss-app">
      {/* ── 全局顶栏（复用 frame.css .chrome）── */}
      <header className="chrome">
        <div className="left">
          <Link href={hp("/")} className="logo-link" style={{ textDecoration: "none" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>STAGE</b>
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right">
          <button
            className="ss-btn ss-btn-play"
            onClick={() => setTheaterOpen(true)}
            disabled={film.shots.length === 0}
          >
            &#9654; {zh ? "放映" : "Play"}
          </button>
        </div>
      </header>

      {/* ── 工作栏：剧名 + tabs ── */}
      <div className="ss-toolbar">
        <input
          className="ss-title"
          value={series.name}
          onChange={(e) => setSeries({ name: e.target.value })}
          placeholder={zh ? "剧名…" : "Series title…"}
        />

        <div className="ss-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`ss-tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {zh ? t.zh : t.en}
            </button>
          ))}
        </div>

        <div className="ss-toolbar-right">
          {currentEp && series.episodes.length > 1 && (
            <select
              className="ss-ep-sel"
              value={currentEp.id}
              onChange={() => {}}
            >
              {series.episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  EP{ep.num} · {ep.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── 主体：workspace + 持久右侧栏 ── */}
      <div className="ss-body">
        <main className="ss-workspace" key={tab}>
          {tab === "script" && currentEp && (
            <ScriptWorkspace series={series} episode={currentEp} zh={zh} />
          )}
          {tab === "bible" && (
            <BibleWorkspace series={series} zh={zh} />
          )}
          {tab === "board" && currentEp && (
            <BoardWorkspace series={series} episode={currentEp} zh={zh} />
          )}
          {tab === "timeline" && currentEp && (
            <TimelineWorkspace
              series={series}
              episode={currentEp}
              jobById={jobById}
              selectedShotId={selectedShotId}
              onSelectShot={setSelectedShotId}
              zh={zh}
            />
          )}
          {!currentEp && (
            <div className="ss-empty">{zh ? "初始化中…" : "Initializing…"}</div>
          )}
        </main>

        <ShotSidebar
          selectedShotId={selectedShotId}
          onSelectShot={handleSidebarSelect}
          onAddShot={currentEp ? handleAddShot : undefined}
          onComposer={currentEp ? () => setComposerOpen(true) : undefined}
          zh={zh}
        />
      </div>

      {/* ── 全屏放映 ── */}
      {theaterOpen && (
        <CinemaTheater
          shots={film.shots}
          cur={pb.cur}
          paused={pb.paused}
          onExit={() => setTheaterOpen(false)}
          onSelect={pb.go}
        />
      )}

      {/* ── 快捷键帮助 ── */}
      {shortcutsOpen && <StageShortcuts zh={zh} onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
