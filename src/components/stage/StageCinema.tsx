"use client";

/**
 * StageCinema —— 「电影感创作平台」/stage 主界面
 *
 * 重心：创作。当前镜 = 编辑焦点，所见即所编（点画面出图、点字幕改旁白、点 slate 调运镜/时长）。
 * 复用成熟面板：选角(StageBiblePanel) / 编剧(StageAIComposer) / 详细(StageInspector)。
 * 数据：useCinema 适配真实 Series；无分镜放映示例片引导创作。放映=影院模式出口。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useStudioStore, type StageShot } from "@/lib/store";
import { genShotImage, genShotVoice, genShotVideo, shotImageUrl } from "@/lib/stage/stageGen";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";
import { fmtDur } from "./cinema/config";
import { useCinema } from "./cinema/useCinema";
import { usePlayback } from "./cinema/usePlayback";
import { CinemaScreen } from "./cinema/CinemaScreen";
import { CinemaFilmstrip } from "./cinema/CinemaFilmstrip";
import { CinemaTheater } from "./cinema/CinemaTheater";
import { PlayIcon, ExportIcon } from "./cinema/icons";
import StageBiblePanel from "./StageBiblePanel";
import StageAIComposer from "./StageAIComposer";
import StageInspector from "./StageInspector";
import "@/styles/frame.css";
import "@/styles/stage-canvas.css";
import "@/styles/stage-workspace.css";
import "@/styles/stage-cinema.css";

type BatchType = "image" | "voice" | "video";

export default function StageCinema() {
  const zh = useLocale() === "zh";
  const film = useCinema();
  const durations = useMemo(() => film.shots.map((s) => s.durSec), [film.shots]);
  const pb = usePlayback(durations);

  // ── 创作数据 / action ──
  const series = useStudioStore((s) => s.series);
  const jobs = useStudioStore((s) => s.jobs);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);
  const currentEp = series.episodes[0];
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const [bibleOpen, setBibleOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailShotId, setDetailShotId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const curShot = film.shots[pb.cur];

  // 当前镜 / 详细镜 → 真实 shot（示例片不可编辑）
  const findReal = (id?: string) => {
    if (film.isDemo || !currentEp || !id) return null;
    for (const sc of currentEp.scenes) {
      const shot = sc.shots.find((s) => s.id === id);
      if (shot) return { shot, sceneId: sc.id };
    }
    return null;
  };
  const editTarget = useMemo(() => findReal(curShot?.id), [film.isDemo, currentEp, curShot?.id]);
  const detail = useMemo(() => findReal(detailShotId ?? undefined), [film.isDemo, currentEp, detailShotId]);

  const patchCur = (patch: Partial<StageShot>) => {
    if (editTarget && currentEp) updateShot(currentEp.id, editTarget.sceneId, editTarget.shot.id, patch);
  };

  // 加镜后自动跳到新镜（从示例片切到真实数据 / 续写）
  const prevLen = useRef(0);
  useEffect(() => {
    const n = film.isDemo ? 0 : film.shots.length;
    if (n > prevLen.current && prevLen.current > 0) pb.go(n - 1);
    prevLen.current = n;
  }, [film.isDemo, film.shots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 手动加一个空镜头 —— 不依赖 AI 后端，立即进入可编辑
  function addBlankShot() {
    if (!currentEp) { showToast(zh ? "初始化中…" : "Initializing…"); return; }
    let sceneId = currentEp.scenes[0]?.id;
    if (!sceneId) sceneId = addScene(currentEp.id);
    addShot(currentEp.id, sceneId, { shotType: "still", durationSec: 3, narration: "", elementRefs: [] });
    showToast(zh ? "已加一镜 —— 开始编辑" : "Shot added");
  }

  // ── 生成 ──
  async function genOne(kind: BatchType, shot: StageShot, sceneId: string) {
    if (!currentEp || generating) return;
    setGenerating(`${kind}-${shot.id}`);
    try {
      if (kind === "image") await genShotImage(shot, series, currentEp.id, sceneId);
      else if (kind === "voice") await genShotVoice(shot, series, currentEp.id, sceneId);
      else {
        const u = shotImageUrl(shot, jobById);
        if (!u) { showToast(zh ? "请先出图" : "Generate image first"); return; }
        await genShotVideo(shot, series, currentEp.id, sceneId, u);
      }
      showToast(`#${shot.idx} ${zh ? "完成" : "done"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally { setGenerating(null); }
  }
  const onGenCur = (kind: BatchType) => { if (editTarget) genOne(kind, editTarget.shot, editTarget.sceneId); };

  async function handleBatch(type: BatchType) {
    if (!currentEp || batch) return;
    const label = { image: zh ? "出图" : "Images", voice: zh ? "配音" : "Voice", video: zh ? "视频" : "Video" }[type];
    const targets = currentEp.scenes.flatMap((sc) =>
      sc.shots
        .filter((shot) => {
          if (type === "image") return !shot.imageJobId && (shot.narration || shot.imagePrompt);
          if (type === "voice") return !shot.voiceJobId && (shot.narration || shot.dialogue?.length);
          return !shot.videoJobId && !!shotImageUrl(shot, jobById);
        })
        .map((shot) => ({ shot, sceneId: sc.id })),
    );
    if (!targets.length) { showToast(zh ? `没有可${label}的镜头` : `No shots for ${label}`); return; }
    setBatch({ done: 0, total: targets.length, label });
    let done = 0;
    if (type === "image") {
      const q = [...targets];
      const w = async () => {
        while (q.length) {
          const it = q.shift()!;
          try { await genShotImage(it.shot, series, currentEp.id, it.sceneId); } catch { /* skip */ }
          done++; setBatch({ done, total: targets.length, label });
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
        done++; setBatch({ done, total: targets.length, label });
      }
    }
    setBatch(null);
    showToast(`${label} ${zh ? "完成" : "done"} (${targets.length})`);
  }

  function handleExport() {
    if (!currentEp) return;
    const { project, stats } = seriesToEditorProject(currentEp, series, jobById);
    if (stats.ok === 0) { showToast(zh ? "没有可导出的素材" : "Nothing to export"); return; }
    editorLoadProject(project);
    showToast(`${zh ? "导出" : "Exported"} ${stats.ok} ${zh ? "条到剪辑器" : "clips"}`);
    setTimeout(() => { window.location.href = zh ? "/editor" : "/en/editor"; }, 900);
  }

  const startCreate = () => { if (currentEp) setComposerOpen(true); else showToast(zh ? "初始化中…" : "Initializing…"); };

  return (
    <div className="cn-root">
      {/* ── 片头条 ── */}
      <header className="cn-header">
        <div className="cn-title">
          <h1>{film.title.length > 1 ? (<>{film.title.slice(0, -1)}<span className="cn-mark">{film.title.slice(-1)}</span></>) : film.title}</h1>
          <span className="cn-meta">
            {film.epLabel} · {film.shots.length} 镜 · {fmtDur(film.totalDurSec)}
            {film.isDemo && <span className="cn-demo-badge">示例片</span>}
          </span>
        </div>

        <button className="cn-cast cn-cast-btn" onClick={() => setBibleOpen(true)} title={zh ? "选角 / 角色册" : "Cast"}>
          {film.cast.length ? (
            film.cast.map((c) => (
              <span className="cn-cast-item" key={c.id}>
                <span className="cn-cast-dot" style={{ ["--cn-dot" as string]: c.color }} />
                {c.name}
              </span>
            ))
          ) : (
            <span className="cn-cast-empty">+ 选角</span>
          )}
        </button>

        <div className="cn-actions">
          <button className="cn-btn" onClick={() => setBibleOpen(true)}>选角</button>
          <button className="cn-btn" onClick={startCreate}>编剧</button>
          {!film.isDemo && (
            <>
              <span className="cn-actions-sep" />
              <button className="cn-btn" onClick={() => handleBatch("image")}>出图</button>
              <button className="cn-btn" onClick={() => handleBatch("voice")}>配音</button>
              <button className="cn-btn" onClick={() => handleBatch("video")}>视频</button>
              <button className="cn-btn" onClick={handleExport}><ExportIcon /> 导出</button>
            </>
          )}
          <button className="cn-btn cn-btn-primary" onClick={pb.enterTheater}><PlayIcon /> 放映</button>
        </div>
      </header>

      {/* ── 中央银幕（编辑台）── */}
      <CinemaScreen
        shot={curShot}
        idx={pb.cur}
        count={film.shots.length}
        editable={!!editTarget}
        generating={generating}
        onPrev={pb.prev}
        onNext={pb.next}
        onPatch={patchCur}
        onGen={onGenCur}
        onOpenDetail={() => curShot && setDetailShotId(curShot.id)}
      />

      {/* ── 空态创作引导 ── */}
      {film.isDemo && (
        <div className="cn-demo-cta">
          这是示例片 —— 开拍属于你的短剧
          <button className="cn-btn cn-btn-primary" onClick={addBlankShot}>+ 加第一镜</button>
          <button className="cn-btn" onClick={startCreate}>AI 编剧</button>
        </div>
      )}

      {/* ── 底部胶片条（切镜）── */}
      <CinemaFilmstrip shots={film.shots} cur={pb.cur} onSelect={pb.go} onAdd={addBlankShot} />

      {/* ── 全屏放映 · 影院模式 ── */}
      {pb.theater && (
        <CinemaTheater shots={film.shots} cur={pb.cur} paused={pb.paused} onExit={pb.exitTheater} onSelect={pb.go} />
      )}

      {/* ── 创作面板（复用成熟组件）── */}
      {bibleOpen && (
        <div className="sw-bible-overlay" onClick={(e) => { if (e.target === e.currentTarget) setBibleOpen(false); }}>
          <StageBiblePanel series={series} zh={zh} onClose={() => setBibleOpen(false)} />
        </div>
      )}

      {composerOpen && currentEp && (
        <div className="cn-drawer" onClick={(e) => { if (e.target === e.currentTarget) setComposerOpen(false); }}>
          <div className="cn-drawer-panel">
            <button className="cn-drawer-close" onClick={() => setComposerOpen(false)} aria-label="关闭">✕</button>
            <StageAIComposer series={series} episode={currentEp} zh={zh} />
          </div>
        </div>
      )}

      {detail && currentEp && (
        <StageInspector
          shot={detail.shot}
          sceneId={detail.sceneId}
          epId={currentEp.id}
          series={series}
          jobById={jobById}
          generating={generating}
          onClose={() => setDetailShotId(null)}
          onGenImage={() => genOne("image", detail.shot, detail.sceneId)}
          onGenVoice={() => genOne("voice", detail.shot, detail.sceneId)}
          onGenVideo={() => genOne("video", detail.shot, detail.sceneId)}
          zh={zh}
        />
      )}

      {batch && (
        <div className="cn-batchbar">
          <span>{batch.label} {batch.done}/{batch.total}</span>
          <div className="cn-batchbar-track"><div className="cn-batchbar-fill" style={{ width: `${(batch.done / batch.total) * 100}%` }} /></div>
        </div>
      )}

      {toast && <div className="cn-toast">{toast}</div>}
    </div>
  );
}
