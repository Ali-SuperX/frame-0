"use client";

/**
 * StageWorkspace —— /stage 的统一外壳（取代 StageStudio / StageLayout）
 * 四区：左阶段轨 · 中央画布 · 右 Inspector · 底部 Dock(时间线 + AI)
 * 复用底层：store / 生成管线(stageGen) / 画布原语(StageCanvas) / 资产面板 / AIComposer。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useLocale } from "next-intl";
import { useStudioStore, type Job, type StageShot } from "@/lib/store";
import {
  genShotImage,
  genShotVoice,
  genShotVideo,
  shotImageUrl,
} from "@/lib/stage/stageGen";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";
import StageCanvas from "./StageCanvas";
import StageAIComposer from "./StageAIComposer";
import StageBiblePanel from "./StageBiblePanel";
import StageInspector from "./StageInspector";
import StageFlowRail, { STAGES, type StageStep, type StepState } from "./StageFlowRail";
import "@/styles/frame.css";
import "@/styles/stage-canvas.css";
import "@/styles/stage-workspace.css";

type BatchType = "image" | "voice" | "video";

export default function StageWorkspace() {
  const locale = useLocale();
  const zh = locale === "zh";
  const hp = (p: string) => (zh ? p : `/en${p}`);

  // ── Store ──
  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const jobs = useStudioStore((s) => s.jobs);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);
  const migrateIfNeeded = useStudioStore((s) => s.migrateIfNeeded);
  useEffect(() => { migrateIfNeeded(); }, [migrateIfNeeded]);

  const currentEp = series.episodes[0];
  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const allShots = useMemo(
    () => (currentEp ? currentEp.scenes.flatMap((s) => s.shots.map((shot) => ({ shot, sceneId: s.id }))) : []),
    [currentEp],
  );
  const imgCount = allShots.filter((r) => r.shot.imageJobId).length;
  const voiceCount = allShots.filter((r) => r.shot.voiceJobId).length;
  const videoCount = allShots.filter((r) => r.shot.videoJobId).length;
  const totalDur = allShots.reduce((s, r) => s + (r.shot.durationSec || 0), 0);
  const shotsN = allShots.length;
  const isEmpty = shotsN === 0;
  const charCount = series.bible.filter((e) => e.kind === "character").length;

  const pipelineProgress = useMemo(() => {
    if (shotsN === 0) return 0;
    let done = 0;
    for (const { shot } of allShots) {
      if (shot.imageJobId) done++;
      if (shot.voiceJobId) done++;
      if (shot.videoJobId) done++;
    }
    return Math.round((done / (shotsN * 3)) * 100);
  }, [allShots, shotsN]);

  // ── UI state ──
  const [activeStage, setActiveStage] = useState<StageStep>("shots");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const panToShotRef = useRef<((id: string) => void) | null>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Single-shot gen (Inspector) ──
  async function handleGenImage(shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    setGenerating(`img-${shot.id}`);
    try {
      await genShotImage(shot, series, currentEp.id, sceneId);
      showToast(`#${shot.idx} ${zh ? "出图完成" : "image done"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally { setGenerating(null); }
  }
  async function handleGenVoice(shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    setGenerating(`voice-${shot.id}`);
    try {
      await genShotVoice(shot, series, currentEp.id, sceneId);
      showToast(`#${shot.idx} ${zh ? "配音完成" : "voice done"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally { setGenerating(null); }
  }
  async function handleGenVideo(shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    const imgUrl = shotImageUrl(shot, jobById);
    if (!imgUrl) { showToast(zh ? "请先出图" : "Generate image first"); return; }
    setGenerating(`video-${shot.id}`);
    try {
      await genShotVideo(shot, series, currentEp.id, sceneId, imgUrl);
      showToast(`#${shot.idx} ${zh ? "视频已提交" : "video submitted"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally { setGenerating(null); }
  }

  // ── Batch gen ──
  async function handleBatch(type: BatchType) {
    if (!currentEp || batchProgress) return;
    const label = { image: zh ? "出图" : "Images", voice: zh ? "配音" : "Voice", video: zh ? "视频" : "Video" }[type];
    const targets = allShots.filter(({ shot }) => {
      if (type === "image") return !shot.imageJobId && (shot.narration || shot.imagePrompt);
      if (type === "voice") return !shot.voiceJobId && (shot.narration || shot.dialogue?.length);
      return !shot.videoJobId && !!shotImageUrl(shot, jobById);
    });
    if (!targets.length) { showToast(zh ? `没有可${label}的镜头` : `No shots for ${label}`); return; }
    setBatchProgress({ done: 0, total: targets.length, label });
    let done = 0;
    if (type === "image") {
      const q = [...targets];
      const w = async () => {
        while (q.length) {
          const it = q.shift()!;
          try { await genShotImage(it.shot, series, currentEp.id, it.sceneId); } catch { /* skip */ }
          done++; setBatchProgress({ done, total: targets.length, label });
        }
      };
      await Promise.all(Array.from({ length: 3 }, w));
    } else {
      for (const it of targets) {
        try {
          if (type === "voice") await genShotVoice(it.shot, series, currentEp.id, it.sceneId);
          else {
            const u = shotImageUrl(it.shot, jobById);
            if (u) await genShotVideo(it.shot, series, currentEp.id, it.sceneId, u);
          }
        } catch { /* skip */ }
        done++; setBatchProgress({ done, total: targets.length, label });
      }
    }
    setBatchProgress(null);
    showToast(`${label} ${zh ? "完成" : "done"} (${targets.length})`);
  }

  // ── Export ──
  function handleExport() {
    if (!currentEp) return;
    const { project, stats } = seriesToEditorProject(currentEp, series, jobById);
    if (stats.ok === 0) { showToast(zh ? "没有可导出的素材" : "No media to export"); return; }
    editorLoadProject(project);
    showToast(`${zh ? "导出" : "Exported"} ${stats.ok} ${zh ? "条到剪辑器" : "clips"}`);
    setTimeout(() => { window.location.href = zh ? "/editor" : "/en/editor"; }, 900);
  }

  // ── Rail navigation ──
  function stateOf(id: StageStep): StepState {
    switch (id) {
      case "setup": return series.name?.trim() ? "done" : "active";
      case "script": return shotsN > 0 ? "done" : (series.name?.trim() ? "active" : "pending");
      case "cast": return charCount > 0 ? "done" : (shotsN > 0 ? "active" : "pending");
      case "shots": return shotsN > 0 && imgCount >= shotsN ? "done" : (shotsN > 0 ? "active" : "pending");
      case "animate": return shotsN > 0 && videoCount >= shotsN ? "done" : (imgCount > 0 ? "active" : "pending");
      case "export": return shotsN > 0 && videoCount >= shotsN ? "done" : (videoCount > 0 ? "active" : "pending");
    }
  }
  function onSelectStage(id: StageStep) {
    setActiveStage(id);
    if (id === "cast") setBibleOpen(true);
    if (id === "script") {
      setDockCollapsed(false);
      setTimeout(() => (document.querySelector(".sc-box-ta") as HTMLTextAreaElement)?.focus(), 60);
    }
    if (id === "export") handleExport();
  }

  // ── Selected shot ──
  const selectedRecord = useMemo(
    () => (selectedShotId ? allShots.find((r) => r.shot.id === selectedShotId) ?? null : null),
    [selectedShotId, allShots],
  );

  const activeMeta = STAGES.find((s) => s.id === activeStage)!;
  const ActiveIcon = activeMeta.Icon;
  const isPrimary = (a: BatchType | "export") =>
    (activeStage === "shots" && a === "image") ||
    (activeStage === "animate" && a === "video") ||
    (activeStage === "export" && a === "export");

  return (
    <div className="sw-root">
      {/* ── Chrome ── */}
      <header className="chrome sw-chrome">
        <div className="left">
          <Link href={hp("/")} style={{ textDecoration: "none" }}>
            <div className="logo">Frame<span style={{ color: "var(--accent)" }}>/</span>0 <b>{zh ? "短漫剧" : "Comic"}</b></div>
          </Link>
        </div>
        <TopNav />
        <div className="right" />
      </header>

      {/* ── Body: rail | center | inspector ── */}
      <div className="sw-body">
        <StageFlowRail
          active={activeStage}
          onSelect={onSelectStage}
          stateOf={stateOf}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((v) => !v)}
          seriesName={series.name}
          onRename={(name) => setSeries({ name })}
          stats={{ scenes: currentEp?.scenes.length ?? 0, shots: shotsN, duration: totalDur }}
          zh={zh}
        />

        <div className="sw-center">
          {/* center bar */}
          <div className="sw-center-bar">
            <span className="sw-center-bar-title">
              <span className="ico"><ActiveIcon /></span>
              {zh ? activeMeta.zh : activeMeta.en}
            </span>

            {!isEmpty && (
              <div className="sw-stats">
                <span>{shotsN}{zh ? "镜" : "sh"}</span>
                <span className="dot" />
                <span className={imgCount > 0 ? "hot" : ""}>{imgCount}{zh ? "图" : "i"}</span>
                <span className="dot" />
                <span className={voiceCount > 0 ? "hot" : ""}>{voiceCount}{zh ? "音" : "a"}</span>
                <span className="dot" />
                <span>{videoCount}{zh ? "频" : "v"}</span>
                <span className="dot" />
                <span>{totalDur}s</span>
              </div>
            )}

            {!isEmpty && !batchProgress && (
              <div className="sw-pipeline">
                <div className="sw-pipeline-bar"><div className="sw-pipeline-fill" style={{ width: `${pipelineProgress}%` }} /></div>
                <span className="sw-pipeline-pct">{pipelineProgress}%</span>
              </div>
            )}

            <div className="sw-bar-spacer" />

            {batchProgress ? (
              <div className="sw-batch">
                <span>{batchProgress.label} {batchProgress.done}/{batchProgress.total}</span>
                <div className="sw-batch-bar"><div className="sw-batch-fill" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} /></div>
              </div>
            ) : (
              <div className="sw-bar-actions">
                <button className={`${isPrimary("image") ? "primary-button" : "ghost-button"} compact`} onClick={() => handleBatch("image")} disabled={isEmpty}>{zh ? "出图" : "Images"}</button>
                <button className={`${isPrimary("voice") ? "primary-button" : "ghost-button"} compact`} onClick={() => handleBatch("voice")} disabled={isEmpty}>{zh ? "配音" : "Voice"}</button>
                <button className={`${isPrimary("video") ? "primary-button" : "ghost-button"} compact`} onClick={() => handleBatch("video")} disabled={isEmpty}>{zh ? "视频" : "Video"}</button>
                <button className={`${isPrimary("export") ? "primary-button" : "ghost-button"} compact`} onClick={handleExport} disabled={isEmpty}>{zh ? "导出" : "Export"}</button>
              </div>
            )}
          </div>

          {/* canvas */}
          <div className="sw-canvas-wrap">
            {currentEp ? (
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
            ) : (
              <div style={{ margin: "auto", color: "var(--paper-mute)", fontSize: 13 }}>
                {zh ? "暂无剧集" : "No episode"}
              </div>
            )}
          </div>
        </div>

        {/* inspector */}
        {selectedRecord && currentEp && (
          <StageInspector
            shot={selectedRecord.shot}
            sceneId={selectedRecord.sceneId}
            epId={currentEp.id}
            series={series}
            jobById={jobById}
            generating={generating}
            onClose={() => setSelectedShotId(null)}
            onGenImage={() => handleGenImage(selectedRecord.shot, selectedRecord.sceneId)}
            onGenVoice={() => handleGenVoice(selectedRecord.shot, selectedRecord.sceneId)}
            onGenVideo={() => handleGenVideo(selectedRecord.shot, selectedRecord.sceneId)}
            zh={zh}
          />
        )}
      </div>

      {/* ── Dock: timeline + AI ── */}
      {currentEp && (
        <div className={`sw-dock${dockCollapsed ? " collapsed" : ""}`}>
          <button className="sw-dock-handle" onClick={() => setDockCollapsed((v) => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            {dockCollapsed ? (zh ? "展开 AI 编剧 / 时间线" : "Expand AI & timeline") : (zh ? "收起" : "Collapse")}
          </button>

          {!isEmpty && (
            <div className="sw-dock-timeline">
              {allShots.map(({ shot }) => {
                const u = shotImageUrl(shot, jobById);
                return (
                  <div
                    key={shot.id}
                    className={`sw-tl-shot${selectedShotId === shot.id ? " sel" : ""}`}
                    onClick={() => { setSelectedShotId(shot.id); panToShotRef.current?.(shot.id); }}
                    title={`#${shot.idx} ${shot.shotType}`}
                  >
                    {u ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u} alt="" />
                    ) : (
                      <div className="sw-tl-shot-ph">#{shot.idx}</div>
                    )}
                    <span className="sw-tl-shot-idx">{shot.idx}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="sw-dock-ai">
            <StageAIComposer series={series} episode={currentEp} zh={zh} />
          </div>
        </div>
      )}

      {/* bible (选角设定) 左抽屉 */}
      {bibleOpen && (
        <div
          className="sw-bible-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setBibleOpen(false); }}
        >
          <StageBiblePanel series={series} zh={zh} onClose={() => setBibleOpen(false)} />
        </div>
      )}

      {/* toast */}
      {toast && <div className="sw-toast">{toast}</div>}
    </div>
  );
}
