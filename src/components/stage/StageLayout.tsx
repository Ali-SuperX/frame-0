"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopNav from "@/components/TopNav";
import { useLocale } from "next-intl";
import { useStudioStore, type Job } from "@/lib/store";
import {
  genShotImage,
  genShotVoice,
  genShotVideo,
  shotImageUrl,
} from "@/lib/stage/stageGen";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";
import StageProcessRail, { type StageTab } from "./StageProcessRail";
import StageCanvas from "./StageCanvas";
import StageAIComposer from "./StageAIComposer";
import BibleWorkspace from "./BibleWorkspace";
import ScriptWorkspace from "./ScriptWorkspace";
import CutWorkspace from "./CutWorkspace";
import "@/styles/frame.css";
import "@/styles/stage-canvas.css";

export default function StageLayout() {
  const locale = useLocale();
  const zh = locale === "zh";

  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const migrateIfNeeded = useStudioStore((s) => s.migrateIfNeeded);
  const jobs = useStudioStore((s) => s.jobs);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);

  useEffect(() => { migrateIfNeeded(); }, [migrateIfNeeded]);

  const [activeTab, setActiveTab] = useState<StageTab>("board");
  const [selectedEpId, setSelectedEpId] = useState<string>(
    series.episodes[0]?.id ?? "",
  );
  useEffect(() => {
    if (!series.episodes.find((e) => e.id === selectedEpId) && series.episodes[0]) {
      setSelectedEpId(series.episodes[0].id);
    }
  }, [series.episodes, selectedEpId]);

  const currentEp = series.episodes.find((e) => e.id === selectedEpId);

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  // ── Selection state (shared across canvas + inspector + timeline) ──
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);

  // ── Toast ──
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "info" | "warn" } | null>(null);
  const showToast = useCallback((msg: string, type: "ok" | "info" | "warn" = "info") => {
    setToast({ msg, type });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Stats ──
  const stats = useMemo(() => {
    if (!currentEp) return { scenes: 0, shots: 0, duration: 0, withNarration: 0, withImage: 0, withVideo: 0 };
    let shots = 0, duration = 0, withNarration = 0, withImage = 0, withVideo = 0;
    for (const scene of currentEp.scenes) {
      for (const shot of scene.shots) {
        shots++;
        duration += shot.durationSec || 0;
        if (shot.narration || shot.imagePrompt) withNarration++;
        if (shot.imageJobId) withImage++;
        if (shot.videoJobId) withVideo++;
      }
    }
    return { scenes: currentEp.scenes.length, shots, duration, withNarration, withImage, withVideo };
  }, [currentEp]);

  const isEmpty = !currentEp || currentEp.scenes.every((s) => s.shots.length === 0);

  // ── Dismissed suggestion key ──
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // ── Batch generation ──
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const allShots = useMemo(() => {
    if (!currentEp) return [];
    return currentEp.scenes.flatMap((s) =>
      s.shots.map((shot) => ({ shot, sceneId: s.id })),
    );
  }, [currentEp]);

  const batchGenImages = useCallback(async () => {
    if (!currentEp || batchProgress) return;
    const targets = allShots.filter(
      ({ shot }) => !shot.imageJobId && (shot.narration || shot.imagePrompt),
    );
    if (!targets.length) { showToast(zh ? "没有可出图的镜头" : "No shots ready for image gen", "warn"); return; }
    setBatchProgress({ done: 0, total: targets.length, label: zh ? "出图" : "Images" });
    let done = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift()!;
        try { await genShotImage(item.shot, series, currentEp.id, item.sceneId); } catch { /* skip */ }
        done++;
        setBatchProgress({ done, total: targets.length, label: zh ? "出图" : "Images" });
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    setBatchProgress(null);
  }, [currentEp, series, allShots, batchProgress, zh, showToast]);

  const batchGenVoice = useCallback(async () => {
    if (!currentEp || batchProgress) return;
    const targets = allShots.filter(
      ({ shot }) => !shot.voiceJobId && (shot.narration || shot.dialogue?.length),
    );
    if (!targets.length) { showToast(zh ? "没有可配音的镜头" : "No shots ready for voice gen", "warn"); return; }
    setBatchProgress({ done: 0, total: targets.length, label: zh ? "配音" : "Voice" });
    let done = 0;
    for (const item of targets) {
      try { await genShotVoice(item.shot, series, currentEp.id, item.sceneId); } catch { /* skip */ }
      done++;
      setBatchProgress({ done, total: targets.length, label: zh ? "配音" : "Voice" });
    }
    setBatchProgress(null);
  }, [currentEp, series, allShots, batchProgress, zh, showToast]);

  const batchGenVideo = useCallback(async () => {
    if (!currentEp || batchProgress) return;
    const targets = allShots.filter(({ shot }) => {
      if (shot.videoJobId) return false;
      return !!shotImageUrl(shot, jobById);
    });
    if (!targets.length) { showToast(zh ? "没有可生成视频的镜头" : "No shots ready for video", "warn"); return; }
    setBatchProgress({ done: 0, total: targets.length, label: zh ? "视频" : "Video" });
    let done = 0;
    for (const item of targets) {
      const url = shotImageUrl(item.shot, jobById);
      if (!url) continue;
      try { await genShotVideo(item.shot, series, currentEp.id, item.sceneId, url); } catch { /* skip */ }
      done++;
      setBatchProgress({ done, total: targets.length, label: zh ? "视频" : "Video" });
    }
    setBatchProgress(null);
  }, [currentEp, series, allShots, jobById, batchProgress, zh, showToast]);

  const handleExportToEditor = useCallback(() => {
    if (!currentEp) return;
    const { project, stats: exportStats } = seriesToEditorProject(currentEp, series, jobById);
    if (exportStats.ok === 0) {
      showToast(zh ? "没有可导出的素材" : "No media to export", "warn");
      return;
    }
    editorLoadProject(project);
    showToast(zh ? `已导出 ${exportStats.ok} 条到剪辑器` : `Exported ${exportStats.ok} clips`, "ok");
    setTimeout(() => { window.location.href = zh ? "/editor" : "/en/editor"; }, 1200);
  }, [currentEp, series, jobById, editorLoadProject, zh, showToast]);

  // ── Smart suggestion ──
  const suggestion = useMemo(() => {
    if (!currentEp || isEmpty) return null;
    const hasChars = series.bible.some((e) => e.kind === "character");
    const needImage = allShots.filter(
      ({ shot }) => !shot.imageJobId && (shot.narration || shot.imagePrompt),
    ).length;
    const haveImage = allShots.filter(
      ({ shot }) => !!shotImageUrl(shot, jobById) && !shot.videoJobId,
    ).length;
    const haveVideo = stats.withVideo;

    if (!hasChars && stats.shots > 0) {
      return {
        key: "cast",
        icon: "🧑",
        msg: zh ? "添加角色让画面更一致" : "Add characters for visual consistency",
        cta: zh ? "去设定" : "Bible",
        action: () => setActiveTab("bible"),
      };
    }
    if (stats.shots === 0) {
      return {
        key: "script",
        icon: "✍️",
        msg: zh ? "输入故事梗概，AI 自动拆分镜头" : "Enter your story — AI splits it into shots",
        cta: zh ? "开始写" : "Write",
        action: () => {
          setActiveTab("board");
          requestAnimationFrame(() => {
            (document.querySelector(".sc-box-ta") as HTMLElement)?.focus();
          });
        },
      };
    }
    if (needImage > 0) {
      return {
        key: "image",
        icon: "🖼",
        msg: zh ? `${needImage} 个镜头可出图` : `${needImage} shots ready for image gen`,
        cta: zh ? "一键出图" : "Gen All",
        action: batchGenImages,
      };
    }
    if (haveImage > 0) {
      return {
        key: "video",
        icon: "🎬",
        msg: zh ? `${haveImage} 个镜头可出视频` : `${haveImage} shots ready for video`,
        cta: zh ? "一键出视频" : "Gen Video",
        action: batchGenVideo,
      };
    }
    if (haveVideo > 0) {
      return {
        key: "export",
        icon: "📦",
        msg: zh ? "素材就绪，可导出到剪辑器" : "Assets ready — export to editor",
        cta: zh ? "导出" : "Export",
        action: handleExportToEditor,
      };
    }
    return null;
  }, [currentEp, isEmpty, series.bible, allShots, stats, jobById, zh, batchGenImages, batchGenVideo, handleExportToEditor, setActiveTab]);

  // ── Rail action (re-click active tab) ──
  const handleRailAction = useCallback(
    (tab: StageTab) => {
      if (tab === "board") batchGenImages();
      else if (tab === "cut") handleExportToEditor();
    },
    [batchGenImages, handleExportToEditor],
  );

  // ── Timeline ──
  const timelineShots = useMemo(() => {
    if (!currentEp) return [];
    return currentEp.scenes.flatMap((scene, si) =>
      scene.shots.map((shot, shotIdx) => ({
        shot,
        sceneId: scene.id,
        sceneFirst: shotIdx === 0 && si > 0,
      })),
    );
  }, [currentEp]);

  // Ref for panToShot callback from canvas
  const panToShotRef = useRef<((id: string) => void) | null>(null);

  // ── Links ──

  return (
    <div className="sl-app">
      {/* ── Chrome ── */}
      <header className="chrome">
        <div className="left">
          <div className="logo">
            Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
            <b>短漫剧</b>
          </div>
        </div>
        <TopNav />
        <div className="right" />
      </header>

      {/* ── Process Rail ── */}
      <StageProcessRail
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        series={series}
        setSeries={setSeries}
        selectedEpId={selectedEpId}
        setSelectedEpId={setSelectedEpId}
        stats={stats}
        isEmpty={isEmpty}
        onAction={handleRailAction}
        zh={zh}
      />

      {/* ── Suggestion / Progress row (always in grid to keep row order stable) ── */}
      <div>
        {suggestion && suggestion.key !== dismissedKey && !batchProgress && (
          <div className="sc-suggestion-bar">
            <span className="sc-suggestion-icon">{suggestion.icon}</span>
            <span className="sc-suggestion-msg">{suggestion.msg}</span>
            <button className="sc-suggestion-cta" onClick={suggestion.action}>
              {suggestion.cta} →
            </button>
            <button
              className="sc-suggestion-dismiss"
              onClick={() => setDismissedKey(suggestion.key)}
            >
              ×
            </button>
          </div>
        )}
        {batchProgress && (
          <div className="sc-suggestion-bar">
            <span className="sc-composer-spinner sm" />
            <span className="sc-suggestion-msg">
              {batchProgress.label} — {batchProgress.done}/{batchProgress.total}
            </span>
            <div className="sc-batch-mini">
              <div className="sc-batch-mini-fill" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Workspace (3 columns) ── */}
      <div className="sl-workspace">
        {/* ── Left: AI Assistant panel ── */}
        <aside className="sa-panel">
          <div className="sa-head">
            <span className="sa-title">{zh ? "AI 助手" : "AI Assistant"}</span>
          </div>
          <div className="sa-body">
            <div className="sa-intent">
              <div className="sa-intent-label">{zh ? "当前目标" : "Current goal"}</div>
              <div className="sa-intent-value">
                {activeTab === "bible" && (zh ? "定义角色和元素" : "Define characters & elements")}
                {activeTab === "script" && (zh ? "编写故事剧本" : "Write the script")}
                {activeTab === "board" && (zh ? "生成画面素材" : "Generate visual assets")}
                {activeTab === "cut" && (zh ? "导出成片" : "Export final cut")}
              </div>
            </div>
            <div className="sa-chat-empty">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{zh ? "AI 对话即将上线" : "AI chat coming soon"}</span>
            </div>
          </div>
        </aside>

        {/* ── Center: workspace content ── */}
        <div className="sl-center">
          {activeTab === "bible" && (
            <BibleWorkspace series={series} zh={zh} />
          )}
          {activeTab === "script" && currentEp && (
            <ScriptWorkspace series={series} episode={currentEp} zh={zh} />
          )}
          {activeTab === "board" && currentEp && (
            <StageCanvas
              series={series}
              episode={currentEp}
              jobById={jobById}
              selectedShotId={selectedShotId}
              setSelectedShotId={setSelectedShotId}
              expandedShotId={expandedShotId}
              setExpandedShotId={setExpandedShotId}
              batchProgress={batchProgress}
              panToShotRef={panToShotRef}
              zh={zh}
            />
          )}
          {activeTab === "cut" && currentEp && (
            <CutWorkspace series={series} episode={currentEp} zh={zh} />
          )}
        </div>

        {/* ── Right: Inspector panel ── */}
        <aside className="si-panel">
          <div className="si-head">
            <span className="si-title">{zh ? "检查器" : "Inspector"}</span>
          </div>
          <div className="si-body">
            {selectedShotId ? (
              <div className="si-placeholder">
                <span>{zh ? "镜头编辑器" : "Shot Inspector"}</span>
                <span className="si-placeholder-sub">{zh ? "Phase 2 实现" : "Coming in Phase 2"}</span>
              </div>
            ) : (
              <div className="si-placeholder">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
                </svg>
                <span>{zh ? "选中镜头查看详情" : "Select a shot to inspect"}</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Timeline ── */}
      {!isEmpty && timelineShots.length > 0 && activeTab === "board" && (
        <div className="sc-timeline">
          {timelineShots.map(({ shot, sceneFirst }, i) => {
            const imgUrl = shotImageUrl(shot, jobById);
            const isActive = selectedShotId === shot.id;
            return (
              <div
                key={shot.id}
                style={{ display: "flex", alignItems: "center", gap: 0, cursor: "pointer" }}
                onClick={() => { setSelectedShotId(shot.id); panToShotRef.current?.(shot.id); }}
                onDoubleClick={() => setExpandedShotId(expandedShotId === shot.id ? null : shot.id)}
              >
                {i > 0 && (sceneFirst
                  ? <div className="sc-timeline-scene-sep" />
                  : <div className="sc-timeline-connector" />
                )}
                <div className={`sc-timeline-shot${isActive ? " active" : ""}`}>
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl} alt="" />
                  ) : (
                    <div className="sc-timeline-ph">{shot.narration?.slice(0, 8) || ""}</div>
                  )}
                  <span className="sc-timeline-idx">#{shot.idx}</span>
                  <span className="sc-timeline-dur">{shot.durationSec}s</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── AI Composer (bottom dock — moves to Assistant panel in Phase 3) ── */}
      {currentEp && activeTab === "board" && (
        <StageAIComposer series={series} episode={currentEp} zh={zh} />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`sc-toast sc-toast-${toast.type}`}>
          {toast.type === "ok" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
          ) : toast.type === "warn" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4m0 4h.01" /><circle cx="12" cy="12" r="10" strokeWidth="2" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path d="M12 16v-4m0-4h.01" /></svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
