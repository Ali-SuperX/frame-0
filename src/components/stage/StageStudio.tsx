"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useLocale } from "next-intl";
import {
  useStudioStore,
  type Job,
  type StageShot,
  type StageShotType,
} from "@/lib/store";
import {
  genShotImage,
  genShotVoice,
  genShotVideo,
  shotImageUrl,
  shotVideoUrl,
  shotVoiceUrl,
} from "@/lib/stage/stageGen";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";
import StageCanvas from "./StageCanvas";
import StageAIComposer from "./StageAIComposer";
import "@/styles/frame.css";
import "@/styles/stage-studio.css";
import "@/styles/stage-canvas.css";

const SHOT_TYPES: StageShotType[] = [
  "still", "pan-lr", "zoom-in", "zoom-out",
  "parallax", "live", "ots", "pov", "dutch", "hero",
];

export default function StageStudio() {
  const locale = useLocale();
  const zh = locale === "zh";
  const hp = (p: string) => (zh ? p : `/en${p}`);

  // ── Store ──
  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const jobs = useStudioStore((s) => s.jobs);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);
  const migrateIfNeeded = useStudioStore((s) => s.migrateIfNeeded);
  useEffect(() => {
    migrateIfNeeded();
  }, [migrateIfNeeded]);

  const currentEp = series.episodes[0];
  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const allShots = useMemo(
    () =>
      currentEp
        ? currentEp.scenes.flatMap((s) =>
            s.shots.map((shot) => ({ shot, sceneId: s.id })),
          )
        : [],
    [currentEp],
  );

  const imgCount = allShots.filter((r) => r.shot.imageJobId).length;
  const voiceCount = allShots.filter((r) => r.shot.voiceJobId).length;
  const videoCount = allShots.filter((r) => r.shot.videoJobId).length;
  const totalDur = allShots.reduce(
    (s, r) => s + (r.shot.durationSec || 0),
    0,
  );
  const isEmpty = allShots.length === 0;

  // ── Canvas state ──
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    label: string;
  } | null>(null);
  const panToShotRef = useRef<((id: string) => void) | null>(null);

  // ── Toast ──
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Gen (single shot, for Inspector) ──
  const [generating, setGenerating] = useState<string | null>(null);

  async function handleGenImage(shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    setGenerating(`img-${shot.id}`);
    try {
      await genShotImage(shot, series, currentEp.id, sceneId);
      showToast(`#${shot.idx} ${zh ? "出图完成" : "image done"}`);
    } catch (err) {
      showToast(
        `${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGenerating(null);
    }
  }

  async function handleGenVoice(shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    setGenerating(`voice-${shot.id}`);
    try {
      await genShotVoice(shot, series, currentEp.id, sceneId);
      showToast(`#${shot.idx} ${zh ? "配音完成" : "voice done"}`);
    } catch (err) {
      showToast(
        `${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGenerating(null);
    }
  }

  async function handleGenVideo(shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    const imgUrl = shotImageUrl(shot, jobById);
    if (!imgUrl) {
      showToast(zh ? "请先出图" : "Generate image first");
      return;
    }
    setGenerating(`video-${shot.id}`);
    try {
      await genShotVideo(shot, series, currentEp.id, sceneId, imgUrl);
      showToast(`#${shot.idx} ${zh ? "视频已提交" : "video submitted"}`);
    } catch (err) {
      showToast(
        `${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGenerating(null);
    }
  }

  // ── Batch gen ──
  async function handleBatch(type: "image" | "voice" | "video") {
    if (!currentEp || batchProgress) return;
    const label = { image: zh ? "出图" : "Images", voice: zh ? "配音" : "Voice", video: zh ? "视频" : "Video" }[type];
    const targets = allShots.filter(({ shot }) => {
      if (type === "image")
        return !shot.imageJobId && (shot.narration || shot.imagePrompt);
      if (type === "voice")
        return !shot.voiceJobId && (shot.narration || shot.dialogue?.length);
      return !shot.videoJobId && !!shotImageUrl(shot, jobById);
    });
    if (!targets.length) {
      showToast(`${zh ? "没有可" : "No shots for "}${label}${zh ? "的镜头" : ""}`);
      return;
    }
    setBatchProgress({ done: 0, total: targets.length, label });
    let done = 0;
    if (type === "image") {
      const q = [...targets];
      const w = async () => {
        while (q.length) {
          const it = q.shift()!;
          try {
            await genShotImage(it.shot, series, currentEp.id, it.sceneId);
          } catch {
            /* skip */
          }
          done++;
          setBatchProgress({ done, total: targets.length, label });
        }
      };
      await Promise.all(Array.from({ length: 3 }, w));
    } else {
      for (const it of targets) {
        try {
          if (type === "voice")
            await genShotVoice(it.shot, series, currentEp.id, it.sceneId);
          else {
            const u = shotImageUrl(it.shot, jobById);
            if (u)
              await genShotVideo(
                it.shot,
                series,
                currentEp.id,
                it.sceneId,
                u,
              );
          }
        } catch {
          /* skip */
        }
        done++;
        setBatchProgress({ done, total: targets.length, label });
      }
    }
    setBatchProgress(null);
    showToast(`${label} ${zh ? "完成" : "done"} (${targets.length})`);
  }

  // ── Export ──
  function handleExport() {
    if (!currentEp) return;
    const { project, stats } = seriesToEditorProject(
      currentEp,
      series,
      jobById,
    );
    if (stats.ok === 0) {
      showToast(zh ? "没有可导出的素材" : "No media to export");
      return;
    }
    editorLoadProject(project);
    showToast(
      `${zh ? "导出" : "Exported"} ${stats.ok} ${zh ? "条到剪辑器" : "clips"}`,
    );
    setTimeout(() => {
      window.location.href = zh ? "/editor" : "/en/editor";
    }, 1000);
  }

  // ── Pipeline progress (always-visible) ──
  const pipelineProgress = useMemo(() => {
    if (allShots.length === 0) return 0;
    const steps = allShots.length * 3;
    let done = 0;
    for (const { shot } of allShots) {
      if (shot.imageJobId) done++;
      if (shot.voiceJobId) done++;
      if (shot.videoJobId) done++;
    }
    return Math.round((done / steps) * 100);
  }, [allShots]);

  // ── Smart suggestion ──
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null);
  const suggestion = useMemo(() => {
    if (isEmpty) return { key: "empty", icon: "✦", msg: zh ? "用 AI 编写你的故事" : "Write your story with AI", cta: null };
    const hasNarration = allShots.some((r) => r.shot.narration);
    if (!hasNarration) return { key: "narration", icon: "✍", msg: zh ? "给镜头添加旁白" : "Add narration to shots", cta: null };
    if (imgCount === 0) return { key: "gen-img", icon: "✦", msg: zh ? "生成画面 — 让故事可视化" : "Generate images — visualize your story", cta: zh ? "批量出图" : "Gen All", action: "batch-image" as const };
    if (imgCount < allShots.length) return { key: "more-img", icon: "✦", msg: zh ? `还有 ${allShots.length - imgCount} 镜没有画面` : `${allShots.length - imgCount} shots need images`, cta: zh ? "补齐" : "Gen Rest", action: "batch-image" as const };
    if (voiceCount === 0) return { key: "gen-voice", icon: "◉", msg: zh ? "配音 — 让角色开口说话" : "Add voices — bring characters to life", cta: zh ? "批量配音" : "Voice All", action: "batch-voice" as const };
    if (videoCount === 0 && imgCount > 0) return { key: "gen-video", icon: "▶", msg: zh ? "生成视频 — 让画面动起来" : "Generate videos — animate your scenes", cta: zh ? "批量视频" : "Video All", action: "batch-video" as const };
    if (pipelineProgress === 100) return { key: "export", icon: "⇩", msg: zh ? "全部完成！导出到剪辑器" : "All done! Export to editor", cta: zh ? "导出" : "Export", action: "export" as const };
    return null;
  }, [isEmpty, allShots, imgCount, voiceCount, videoCount, pipelineProgress, zh]);

  const showSuggestion = suggestion && suggestion.key !== dismissedSuggestion;

  function handleSuggestionAction() {
    if (!suggestion) return;
    if ("action" in suggestion) {
      if (suggestion.action === "batch-image") handleBatch("image");
      else if (suggestion.action === "batch-voice") handleBatch("voice");
      else if (suggestion.action === "batch-video") handleBatch("video");
      else if (suggestion.action === "export") handleExport();
    }
  }

  // ── Milestone celebration ──
  const [celebration, setCelebration] = useState<string | null>(null);
  const prevMilestoneRef = useRef<string>("");
  useEffect(() => {
    if (allShots.length === 0) return;
    let milestone = "";
    if (pipelineProgress === 100) milestone = "complete";
    else if (imgCount === allShots.length && imgCount > 0) milestone = "all-images";
    else if (imgCount === 1 && prevMilestoneRef.current === "") milestone = "first-image";

    if (milestone && milestone !== prevMilestoneRef.current) {
      const msgs: Record<string, string> = {
        "first-image": zh ? "🎨 第一张画面诞生！" : "🎨 First image created!",
        "all-images": zh ? "🖼 所有画面就绪！" : "🖼 All images ready!",
        "complete": zh ? "🎬 制作完成！可以导出了" : "🎬 Production complete!",
      };
      if (msgs[milestone]) {
        setCelebration(msgs[milestone]);
        setTimeout(() => setCelebration(null), 3000);
      }
    }
    prevMilestoneRef.current = milestone;
  }, [pipelineProgress, imgCount, allShots.length, zh]);

  // ── Selected shot (for Inspector) ──
  const selectedRecord = useMemo(() => {
    if (!selectedShotId) return null;
    return allShots.find((r) => r.shot.id === selectedShotId) ?? null;
  }, [selectedShotId, allShots]);

  const selectedShot = selectedRecord?.shot ?? null;
  const selectedSceneId = selectedRecord?.sceneId ?? null;

  // ── Render ──
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--ink)",
        overflow: "hidden",
      }}
    >
      {/* Chrome */}
      <header
        className="chrome"
        style={{
          position: "relative",
          background: "var(--ink)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="left">
          <Link href={hp("/")} style={{ textDecoration: "none" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>{zh ? "短漫剧" : "Comic"}</b>
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right" />
      </header>

      {/* ── Main canvas area ── */}
      <div className="acs">
        <div className="sc-shell">
          {/* Canvas (fills everything) */}
          {currentEp && (
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

          {/* ── Floating Toolbar ── */}
          <div className="sc-float-toolbar">
            <div className="sc-float-toolbar-title">
              <input
                value={series.name}
                onChange={(e) => setSeries({ name: e.target.value })}
                placeholder={zh ? "剧名…" : "Title…"}
              />
            </div>

            <div className="sc-float-toolbar-sep" />

            <div className="sc-float-stats">
              <span>{allShots.length}{zh ? "镜" : "s"}</span>
              <span className="stat-dot" />
              <span style={{ color: imgCount > 0 ? "var(--signal)" : undefined }}>
                {imgCount}{zh ? "图" : "i"}
              </span>
              <span className="stat-dot" />
              <span style={{ color: voiceCount > 0 ? "var(--signal)" : undefined }}>
                {voiceCount}{zh ? "音" : "a"}
              </span>
              <span className="stat-dot" />
              <span>{videoCount}{zh ? "频" : "v"}</span>
              <span className="stat-dot" />
              <span>{totalDur}s</span>
            </div>

            {!isEmpty && !batchProgress && (
              <>
                <div className="sc-float-toolbar-sep" />
                <div className="sc-pipeline">
                  <div className="sc-pipeline-bar">
                    <div className="sc-pipeline-fill" style={{ width: `${pipelineProgress}%` }} />
                  </div>
                  <span className="sc-pipeline-pct">{pipelineProgress}%</span>
                </div>
              </>
            )}

            <div className="sc-float-toolbar-sep" />

            {batchProgress ? (
              <div className="sc-float-batch">
                <span>
                  {batchProgress.label} {batchProgress.done}/{batchProgress.total}
                </span>
                <div className="sc-float-batch-bar">
                  <div
                    className="sc-float-batch-fill"
                    style={{
                      width: `${(batchProgress.done / batchProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="sc-float-actions">
                <button
                  className="ghost-button compact"
                  onClick={() => handleBatch("image")}
                  disabled={isEmpty}
                >
                  {zh ? "出图" : "Images"}
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => handleBatch("voice")}
                  disabled={isEmpty}
                >
                  {zh ? "配音" : "Voice"}
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => handleBatch("video")}
                  disabled={isEmpty}
                >
                  {zh ? "视频" : "Video"}
                </button>
                <button
                  className="primary-button compact"
                  onClick={handleExport}
                  disabled={isEmpty}
                >
                  {zh ? "导出" : "Export"}
                </button>
              </div>
            )}
          </div>

          {/* ── Smart Suggestion Pill ── */}
          {showSuggestion && !batchProgress && (
            <div className="sc-suggestion" key={suggestion.key}>
              <span className="sc-suggestion-icon">{suggestion.icon}</span>
              <span>{suggestion.msg}</span>
              {suggestion.cta && (
                <button className="sc-suggestion-cta" onClick={handleSuggestionAction}>
                  {suggestion.cta}
                </button>
              )}
              <button className="sc-suggestion-dismiss" onClick={() => setDismissedSuggestion(suggestion.key)}>
                ×
              </button>
            </div>
          )}

          {/* ── Inspector Panel ── */}
          {selectedShot && selectedSceneId && currentEp && (
            <div className="sc-inspector">
              <div className="sc-inspector-head">
                <span className="sc-inspector-head-title">
                  #{selectedShot.idx} {selectedShot.shotType}
                </span>
                <button
                  className="sc-inspector-close"
                  onClick={() => setSelectedShotId(null)}
                >
                  ×
                </button>
              </div>

              <div className="sc-inspector-body">
                {/* Preview */}
                <div className="sc-inspector-preview">
                  {(() => {
                    const vidUrl = shotVideoUrl(selectedShot, jobById);
                    const imgUrl = shotImageUrl(selectedShot, jobById);
                    if (vidUrl) return <video src={vidUrl} controls muted playsInline />;
                    if (imgUrl)
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgUrl} alt="" />
                      );
                    return (
                      <div className="sc-inspector-preview-empty">
                        {zh ? "暂无画面" : "No image"}
                      </div>
                    );
                  })()}
                </div>

                {/* Status row */}
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="sc-inspector-status">
                    <span
                      className={`sc-inspector-status-dot ${
                        selectedShot.imageJobId
                          ? shotImageUrl(selectedShot, jobById)
                            ? "done"
                            : "loading"
                          : "pending"
                      }`}
                    />
                    {zh ? "图" : "Img"}
                  </div>
                  <div className="sc-inspector-status">
                    <span
                      className={`sc-inspector-status-dot ${
                        selectedShot.voiceJobId
                          ? shotVoiceUrl(selectedShot)
                            ? "done"
                            : "loading"
                          : "pending"
                      }`}
                    />
                    {zh ? "音" : "Snd"}
                  </div>
                  <div className="sc-inspector-status">
                    <span
                      className={`sc-inspector-status-dot ${
                        selectedShot.videoJobId
                          ? shotVideoUrl(selectedShot, jobById)
                            ? "done"
                            : "loading"
                          : "pending"
                      }`}
                    />
                    {zh ? "频" : "Vid"}
                  </div>
                </div>

                {/* Narration */}
                <div className="sc-inspector-field">
                  <span className="sc-inspector-label">
                    {zh ? "旁白" : "Narration"}
                  </span>
                  <textarea
                    className="sc-inspector-textarea"
                    value={selectedShot.narration || ""}
                    onChange={(e) =>
                      updateShot(currentEp.id, selectedSceneId, selectedShot.id, {
                        narration: e.target.value,
                      })
                    }
                    placeholder={zh ? "旁白文字…" : "Narration…"}
                  />
                </div>

                {/* Image Prompt */}
                <div className="sc-inspector-field">
                  <span className="sc-inspector-label">
                    {zh ? "画面提示词" : "Image Prompt"}
                  </span>
                  <textarea
                    className="sc-inspector-textarea"
                    value={selectedShot.imagePrompt || ""}
                    onChange={(e) =>
                      updateShot(currentEp.id, selectedSceneId, selectedShot.id, {
                        imagePrompt: e.target.value,
                      })
                    }
                    placeholder={
                      zh ? "描述画面…" : "Describe the visual…"
                    }
                  />
                </div>

                {/* Type + Duration row */}
                <div className="sc-inspector-row">
                  <div className="sc-inspector-field" style={{ flex: 1 }}>
                    <span className="sc-inspector-label">
                      {zh ? "类型" : "Type"}
                    </span>
                    <select
                      className="sc-inspector-select"
                      value={selectedShot.shotType || "still"}
                      onChange={(e) =>
                        updateShot(currentEp.id, selectedSceneId, selectedShot.id, {
                          shotType: e.target.value as StageShotType,
                        })
                      }
                    >
                      {SHOT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sc-inspector-field">
                    <span className="sc-inspector-label">
                      {zh ? "时长" : "Dur"}
                    </span>
                    <input
                      className="sc-inspector-input"
                      type="number"
                      min={1}
                      max={30}
                      value={selectedShot.durationSec}
                      onChange={(e) =>
                        updateShot(currentEp.id, selectedSceneId, selectedShot.id, {
                          durationSec: Number(e.target.value) || 4,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Voice audio */}
                {shotVoiceUrl(selectedShot) && (
                  <audio
                    className="sc-inspector-audio"
                    src={shotVoiceUrl(selectedShot)!}
                    controls
                  />
                )}

                {/* Gen actions */}
                <div className="sc-inspector-actions">
                  <button
                    className="ghost-button compact"
                    onClick={() =>
                      handleGenImage(selectedShot, selectedSceneId)
                    }
                    disabled={generating !== null}
                  >
                    {generating === `img-${selectedShot.id}` ? "⟳" : "✦"}{" "}
                    {shotImageUrl(selectedShot, jobById)
                      ? zh
                        ? "重绘"
                        : "Redo"
                      : zh
                        ? "出图"
                        : "Gen"}
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() =>
                      handleGenVoice(selectedShot, selectedSceneId)
                    }
                    disabled={generating !== null}
                  >
                    {generating === `voice-${selectedShot.id}` ? "⟳" : "◉"}{" "}
                    {shotVoiceUrl(selectedShot)
                      ? zh
                        ? "重配"
                        : "Redo"
                      : zh
                        ? "配音"
                        : "Voice"}
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() =>
                      handleGenVideo(selectedShot, selectedSceneId)
                    }
                    disabled={
                      generating !== null ||
                      !shotImageUrl(selectedShot, jobById)
                    }
                  >
                    {generating === `video-${selectedShot.id}` ? "⟳" : "▶"}{" "}
                    {shotVideoUrl(selectedShot, jobById)
                      ? zh
                        ? "重做"
                        : "Redo"
                      : zh
                        ? "视频"
                        : "Video"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── AI Composer (floating bottom) ── */}
          {currentEp && (
            <div className="sc-float-composer">
              <StageAIComposer series={series} episode={currentEp} zh={zh} />
            </div>
          )}

          {/* ── Toast ── */}
          {toast && !celebration && (
            <div
              style={{
                position: "fixed",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 50,
                padding: "8px 20px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.85)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                fontSize: 12,
                whiteSpace: "nowrap",
                animation: "fadeIn 150ms ease",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {toast}
            </div>
          )}

          {/* ── Celebration Toast ── */}
          {celebration && (
            <div className="sc-toast-celebrate">{celebration}</div>
          )}
        </div>
      </div>
    </div>
  );
}
