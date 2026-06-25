"use client";

/**
 * 时间轴 / 成片 Tab —— LumenX 4-Tab 架构第 4 个 Tab。
 *
 * 布局：
 *   [topbar: 标题 + 渲染视频]
 *   [panel(左, 250px) | main(中: player + timeline)]
 *
 * 右侧由 ChatPanel 复用，所以本组件只关心左侧分镜详情、中间播放器与时间轴。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLumenStore } from "@/lib/lumenx/store";
import type { LxProject, LxShot } from "@/lib/lumenx/types";
import { mergeVideos, type MergeProgress } from "@/lib/lumenx/videoMerge";

/* ─────────────────────── helpers ─────────────────────── */

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function truncate(text: string, max = 20): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** 在 action 里把 @场景名 / @角色名 / @道具名 高亮成彩色 chip。 */
function HighlightedAction({
  text,
  project,
}: {
  text: string;
  project: LxProject;
}) {
  // 收集所有可能被 @ 引用的实体名 → 类型
  const dict = useMemo(() => {
    const m = new Map<string, "character" | "scene" | "prop">();
    for (const c of project.characters) if (c.name) m.set(c.name, "character");
    for (const s of project.scenes) if (s.name) m.set(s.name, "scene");
    for (const p of project.props) if (p.name) m.set(p.name, "prop");
    return m;
  }, [project.characters, project.scenes, project.props]);

  if (!text) return <span className="lx-tl-action-empty">（无镜头描述）</span>;

  // 简单 @token 切分：匹配 @ 开头的非空白 / 中文标点结束序列
  const parts: Array<{ kind: "text" | "ref"; value: string; type?: string }> = [];
  const re = /@([^\s，。、,.!！？?；;:：()（）"'"'《》<>]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", value: text.slice(last, m.index) });
    const name = m[1];
    const type = dict.get(name);
    parts.push({ kind: "ref", value: name, type });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });

  return (
    <p className="lx-tl-action">
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span
            key={i}
            className={`lx-tl-ref lx-tl-ref-${p.type ?? "unknown"}`}
            data-ref-type={p.type ?? "unknown"}
          >
            @{p.value}
          </span>
        ),
      )}
    </p>
  );
}

/* ─────────────────────── component ─────────────────────── */

export default function TimelineTab({ project }: { project: LxProject }) {
  const setChatContext = useLumenStore((s) => s.setChatContext);
  const requestAssistant = useLumenStore((s) => s.requestAssistant);
  const shots = project.shots;

  // 默认选中第一个有 videoUrl 的 shot；都没有则选第一个。
  const initialId = useMemo(() => {
    const withVideo = shots.find((s) => !!s.videoUrl);
    return withVideo?.id ?? shots[0]?.id ?? null;
  }, [shots]);

  const [selectedShotId, setSelectedShotId] = useState<string | null>(initialId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 当前 video 已播放秒数
  const [videoDuration, setVideoDuration] = useState(0);
  /** 顺序播放所有分镜模式（结束后自动跳下一个）。 */
  const [playAll, setPlayAll] = useState(false);
  /** 全部播放完毕的提示。 */
  const [allPlayed, setAllPlayed] = useState(false);

  /** 合成相关。 */
  const [showMerged, setShowMerged] = useState<boolean>(!!project.mergedVideoUrl);
  const [mergeProgress, setMergeProgress] = useState<MergeProgress | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mergedVideoRef = useRef<HTMLVideoElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // project.mergedVideoUrl 出现 / 消失时同步 showMerged 默认值。
  useEffect(() => {
    if (project.mergedVideoUrl) setShowMerged(true);
    else setShowMerged(false);
  }, [project.mergedVideoUrl]);

  // shots 变化时自动锁定一个有效选中。
  useEffect(() => {
    if (!shots.length) {
      setSelectedShotId(null);
      return;
    }
    if (!shots.some((s) => s.id === selectedShotId)) {
      setSelectedShotId(initialId);
    }
  }, [shots, selectedShotId, initialId]);

  const selectedIdx = shots.findIndex((s) => s.id === selectedShotId);
  const selected = selectedIdx >= 0 ? shots[selectedIdx] : null;

  const totalDuration = useMemo(
    () => shots.reduce((acc, s) => acc + (s.durationSec || 0), 0),
    [shots],
  );

  /* 切换 shot：重置播放器 src */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setProgress(0);
    setVideoDuration(0);
    if (selected?.videoUrl) {
      v.src = selected.videoUrl;
      v.load();
      if (isPlaying) v.play().catch(() => setIsPlaying(false));
    } else {
      v.removeAttribute("src");
      v.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.videoUrl]);

  /* 播放结束 → 自动播下一个 */
  const handleEnded = () => {
    if (selectedIdx < 0) return;
    const next = shots.slice(selectedIdx + 1).find((s) => !!s.videoUrl);
    if (next) {
      setSelectedShotId(next.id);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      if (playAll) {
        setPlayAll(false);
        setAllPlayed(true);
        // 3 秒后自动隐藏「播放完成」提示
        window.setTimeout(() => setAllPlayed(false), 3000);
      }
    }
  };

  /** 播放全部：从第一个有视频的分镜开始顺序播。 */
  const handlePlayAll = () => {
    const first = shots.find((s) => !!s.videoUrl);
    if (!first) {
      alert("还没有任何分镜视频，请先在「分镜」页生成视频。");
      return;
    }
    setShowMerged(false); // 退出合成视频预览，回到分段播放
    setAllPlayed(false);
    setPlayAll(true);
    if (first.id !== selectedShotId) {
      setSelectedShotId(first.id);
      // src 切换由 effect 完成；这里设置 isPlaying 让 effect 自动 play()
      setIsPlaying(true);
    } else {
      const v = videoRef.current;
      if (v) {
        v.currentTime = 0;
        v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !selected?.videoUrl) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (frac: number) => {
    const v = videoRef.current;
    if (!v || !videoDuration) return;
    v.currentTime = Math.max(0, Math.min(videoDuration, frac * videoDuration));
  };

  const seekRelative = (deltaSec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + deltaSec));
  };

  const goFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
  };

  /* 键盘快捷键：空格播放/暂停，左右箭头快进快退 */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  /* 联动右侧 ChatPanel：把当前 shot 注入 chatContext */
  const bindShotToChat = (shot: LxShot, idx: number) => {
    setChatContext({
      tab: "timeline",
      refType: "shot",
      refId: shot.id,
      refLabel: `分镜 #${idx + 1}`,
      refContent: shot.action || shot.imagePrompt || "",
    });
  };

  const onSelectSegment = (shot: LxShot, idx: number) => {
    setSelectedShotId(shot.id);
    bindShotToChat(shot, idx);
  };

  /* 时间刻度：按总时长粗略地切 5s 一档（不超过 12 档）。 */
  const ruler = useMemo(() => {
    if (!totalDuration) return [] as number[];
    const stepCandidates = [1, 2, 5, 10, 15, 30, 60];
    const step = stepCandidates.find((s) => totalDuration / s <= 12) ?? 60;
    const ticks: number[] = [];
    for (let t = 0; t <= totalDuration; t += step) ticks.push(t);
    return ticks;
  }, [totalDuration]);

  /* 选中 shot 关联的资产缩略图（角色 + 场景 + 道具） */
  const refAssets = useMemo(() => {
    if (!selected) return [] as Array<{ id: string; name: string; url?: string; kind: string }>;
    const list: Array<{ id: string; name: string; url?: string; kind: string }> = [];
    for (const cid of selected.characterIds) {
      const c = project.characters.find((x) => x.id === cid);
      if (c) list.push({ id: c.id, name: c.name, url: c.imageUrl, kind: "角色" });
    }
    if (selected.sceneId) {
      const s = project.scenes.find((x) => x.id === selected.sceneId);
      if (s) list.push({ id: s.id, name: s.name, url: s.imageUrl, kind: "场景" });
    }
    for (const pid of selected.propIds) {
      const p = project.props.find((x) => x.id === pid);
      if (p) list.push({ id: p.id, name: p.name, url: p.imageUrl, kind: "道具" });
    }
    return list;
  }, [selected, project.characters, project.scenes, project.props]);

  /**
   * 触发整片合成：把所有有视频的分镜按顺序拼为单一 MP4。
   * 完成后写入 store 的 mergedVideoUrl，并切换播放器到合成视频预览。
   */
  const handleRenderFinal = async () => {
    const urls = shots
      .filter((s) => !!s.videoUrl)
      .map((s) => s.videoUrl as string);

    if (!urls.length) {
      alert("还没有任何分镜视频，请先生成。");
      return;
    }
    const missing = shots.length - urls.length;
    if (missing > 0) {
      const ok = window.confirm(
        `还有 ${missing} 个分镜没有视频，仅会合成已有的 ${urls.length} 个。是否继续？`,
      );
      if (!ok) return;
    }

    setMergeError(null);
    setMergeProgress({
      phase: "loading",
      current: 0,
      total: urls.length,
      message: "准备合成…",
    });
    try {
      // 释放上一次的 blob URL，避免内存泄漏
      const prev = useLumenStore.getState().projects.find((p) => p.id === project.id)
        ?.mergedVideoUrl;
      if (prev && prev.startsWith("blob:")) {
        try { URL.revokeObjectURL(prev); } catch { /* ignore */ }
      }

      const { blobUrl } = await mergeVideos(urls, (p) => setMergeProgress(p));
      useLumenStore.getState().patch({ mergedVideoUrl: blobUrl });
      setShowMerged(true);
      // 短暂保留 done 状态，便于用户看到 toast；2s 后清空
      window.setTimeout(() => setMergeProgress(null), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setMergeError(msg);
      setMergeProgress(null);
    }
  };

  /** 下载合成视频。 */
  const handleDownloadMerged = () => {
    const url = project.mergedVideoUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "lumenx"}-成片.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const merging = !!mergeProgress && mergeProgress.phase !== "done";
  const hasAnyVideo = shots.some((s) => !!s.videoUrl);

  /* ── 渲染 ── */

  if (!shots.length) {
    return (
      <div className="lx-timeline-tab lx-timeline-tab-empty">
        <div className="lx-tl-topbar">
          <div className="lx-tl-title">{project.title || "时间轴"}</div>
          <button className="lx-btn ghost" disabled>
            <DownloadIcon /> 合成成片
          </button>
        </div>
        <div className="lx-empty-guide">
          <div className="lx-empty-guide-icons" aria-hidden>
            <span>🎞️</span>
            <span>▶️</span>
            <span>🎬</span>
          </div>
          <h3 className="lx-empty-guide-title">还没有可预览的成片</h3>
          <p className="lx-empty-guide-desc">
            先在「分镜」页生成视频，然后回到这里预览成片。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lx-timeline-tab">
      {/* 顶部栏 */}
      <div className="lx-tl-topbar">
        <div className="lx-tl-title">
          <span className="lx-tl-title-prefix">时间轴</span>
          <span className="lx-tl-title-sep">·</span>
          <span className="lx-tl-title-name">{project.title || "未命名短剧"}</span>
        </div>
        <div className="lx-tl-topbar-actions">
          <span className="lx-tl-total">总时长 {fmtTime(totalDuration)}</span>
          <button
            className="lx-btn ghost"
            onClick={handlePlayAll}
            disabled={!hasAnyVideo || merging}
            title="从第一个分镜开始顺序播放"
          >
            <PlayIcon /> 播放全部
          </button>
          {project.mergedVideoUrl ? (
            <>
              <span className="lx-merged-badge" title="已生成成片">
                ✓ 成片已合成
              </span>
              <button
                className="lx-btn ghost lx-download-btn"
                onClick={handleDownloadMerged}
                disabled={merging}
                title="下载成片 MP4"
              >
                <DownloadIcon /> 下载成片
              </button>
              <button
                className="lx-btn primary"
                onClick={handleRenderFinal}
                disabled={merging}
                title="重新合成"
              >
                <SparkIcon /> {merging ? "合成中…" : "重新合成"}
              </button>
            </>
          ) : (
            <button
              className="lx-btn primary"
              onClick={handleRenderFinal}
              disabled={!hasAnyVideo || merging}
              title={hasAnyVideo ? "将所有分镜视频合成为单一 MP4" : "先生成至少一个分镜视频"}
            >
              <DownloadIcon /> {merging ? "合成中…" : "合成成片"}
            </button>
          )}
        </div>
      </div>

      <div className="lx-tl-body">
        {/* 左侧详情面板 */}
        <aside className="lx-tl-panel">
          {selected ? (
            <>
              <div className="lx-tl-panel-head">
                <div className="lx-tl-panel-tag">分镜</div>
                <div className="lx-tl-panel-idx">#{selectedIdx + 1}</div>
              </div>

              <div className="lx-tl-panel-section">
                <div className="lx-tl-panel-label">镜头描述</div>
                <HighlightedAction text={selected.action} project={project} />
              </div>

              <div className="lx-tl-panel-section">
                <div className="lx-tl-panel-label">主体参考</div>
                {refAssets.length ? (
                  <div className="lx-tl-asset-grid">
                    {refAssets.map((a) => (
                      <div key={`${a.kind}-${a.id}`} className="lx-tl-asset" title={`${a.kind} · ${a.name}`}>
                        <div className="lx-tl-asset-thumb">
                          {a.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt={a.name} />
                          ) : (
                            <div className="lx-tl-asset-fallback">{a.name?.[0] ?? "?"}</div>
                          )}
                          <span className="lx-tl-asset-kind">{a.kind}</span>
                        </div>
                        <div className="lx-tl-asset-name">{a.name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="lx-tl-asset-empty">未关联角色 / 场景 / 道具</div>
                )}
              </div>

              <div className="lx-tl-panel-section">
                <div className="lx-tl-meta-row">
                  <span className="lx-tl-meta-k">景别</span>
                  <span className="lx-tl-meta-v">{selected.shotSize || "—"}</span>
                </div>
                <div className="lx-tl-meta-row">
                  <span className="lx-tl-meta-k">运镜</span>
                  <span className="lx-tl-meta-v">{selected.camera || "—"}</span>
                </div>
                <div className="lx-tl-meta-row">
                  <span className="lx-tl-meta-k">时长</span>
                  <span className="lx-tl-meta-v">{selected.durationSec || 0}s</span>
                </div>
              </div>

              <div className="lx-tl-panel-actions">
                <button
                  className="lx-btn primary block"
                  disabled={selected.status === "running"}
                  onClick={() => {
                    setChatContext({
                      tab: "timeline",
                      refType: "shot",
                      refId: selected.id,
                      refLabel: `分镜 #${selectedIdx + 1}`,
                      refContent: selected.action || selected.imagePrompt || "",
                    });
                    requestAssistant("timeline", `为分镜 #${selectedIdx + 1} 生成视频`);
                  }}
                >
                  <SparkIcon /> {selected.status === "running" ? "生成中…" : "生成视频"}
                </button>
                <button
                  className="lx-btn ghost block"
                  onClick={() => bindShotToChat(selected, selectedIdx)}
                >
                  <PencilIcon /> 编辑
                </button>
              </div>
            </>
          ) : (
            <div className="lx-tl-panel-empty">未选中分镜</div>
          )}
        </aside>

        {/* 中间区域：播放器 + 时间轴 */}
        <section className="lx-tl-main">
          <div className="lx-tl-player">
          <div className="lx-tl-stage">
            {/* 合成进度 / 错误提示覆盖层 */}
            {(merging || mergeError) && (
              <div className="lx-render-progress" role="status" aria-live="polite">
                <div className="lx-render-progress-card">
                  {mergeError ? (
                    <>
                      <div className="lx-render-progress-title error">⚠️ 合成失败</div>
                      <div className="lx-render-progress-msg">{mergeError}</div>
                      <button
                        className="lx-btn ghost"
                        onClick={() => setMergeError(null)}
                      >
                        关闭
                      </button>
                    </>
                  ) : mergeProgress ? (
                    <>
                      <div className="lx-render-progress-title">
                        正在合成成片
                      </div>
                      <div className="lx-render-progress-msg">
                        {mergeProgress.message}
                      </div>
                      <div className="lx-render-progress-bar">
                        <div
                          className="lx-render-progress-fill"
                          style={{
                            width:
                              mergeProgress.phase === "loading"
                                ? "10%"
                                : mergeProgress.phase === "fetching"
                                ? `${10 + (mergeProgress.current / Math.max(1, mergeProgress.total)) * 60}%`
                                : mergeProgress.phase === "merging"
                                ? "75%"
                                : mergeProgress.phase === "encoding"
                                ? "90%"
                                : "100%",
                          }}
                        />
                      </div>
                      <div className="lx-render-progress-step">
                        {mergeProgress.phase === "fetching"
                          ? `${mergeProgress.current}/${mergeProgress.total}`
                          : mergeProgress.phase}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {/* 全部播放完成提示 */}
            {allPlayed && (
              <div className="lx-tl-finish-toast" role="status">
                ✓ 全部分镜播放完成
              </div>
            )}

            {showMerged && project.mergedVideoUrl ? (
              <video
                ref={mergedVideoRef}
                key={project.mergedVideoUrl}
                className="lx-tl-video"
                src={project.mergedVideoUrl}
                controls
                playsInline
              />
            ) : selected?.videoUrl ? (
                <video
                  ref={videoRef}
                  className="lx-tl-video"
                  playsInline
                  poster={selected.imageUrl ?? selected.imageVariants?.[0]?.url}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={handleEnded}
                  onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 0)}
                />
            ) : !hasAnyVideo ? (
                <div className="lx-tl-stage-empty lx-tl-stage-no-videos">
                  <div className="lx-tl-empty-hero">
                    <span className="lx-tl-empty-icon">🎬</span>
                    <h3 className="lx-tl-empty-title">还没有生成视频</h3>
                    <p className="lx-tl-empty-desc">
                      选中左侧分镜后点击「生成视频」，或使用右侧对话批量生成
                    </p>
                  </div>
                </div>
            ) : (
                <div className="lx-tl-stage-empty">
                  {selected?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.imageUrl} alt="" className="lx-tl-stage-poster" />
                  ) : null}
                  <span className="lx-tl-stage-empty-text">暂无视频</span>
                </div>
              )}
          </div>

            {/* 控制条 */}
            <div className="lx-tl-controls">
              <button
                className="lx-tl-ctrl-btn"
                onClick={togglePlay}
                disabled={!selected?.videoUrl}
                title={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <div
                className="lx-tl-progress"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const f = (e.clientX - rect.left) / rect.width;
                  seekTo(f);
                }}
              >
                <div
                  className="lx-tl-progress-fill"
                  style={{
                    width: videoDuration ? `${(progress / videoDuration) * 100}%` : "0%",
                  }}
                />
              </div>
              <div className="lx-tl-time">
                {fmtTime(progress)} / {fmtTime(videoDuration)}
              </div>
              <button
                className="lx-tl-ctrl-btn"
                onClick={goFullscreen}
                disabled={!selected?.videoUrl}
                title="全屏"
              >
                <FullscreenIcon />
              </button>
            </div>
          </div>

          {/* 时间轴 */}
          <div className="lx-tl-timeline">
            <div className="lx-tl-time-ruler">
              {ruler.map((t) => (
                <span
                  key={t}
                  className="lx-tl-tick"
                  style={{
                    left: totalDuration ? `${(t / totalDuration) * 100}%` : "0%",
                  }}
                >
                  {fmtTime(t)}
                </span>
              ))}
            </div>
            <div className="lx-tl-track" ref={timelineScrollRef}>
              {shots.map((s, idx) => {
                const thumb = s.imageVariants?.[0]?.url ?? s.imageUrl;
                const active = s.id === selectedShotId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`lx-tl-segment${active ? " active" : ""}${s.status === "running" ? " running" : ""}`}
                    onClick={() => onSelectSegment(s, idx)}
                    style={{
                      // 段宽与时长成比例（最小 96px）
                      width: `${Math.max(96, (s.durationSec || 4) * 28)}px`,
                    }}
                  >
                    <div className="lx-tl-segment-thumb">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={`分镜 ${idx + 1}`} />
                      ) : (
                        <div className="lx-tl-segment-fallback">#{idx + 1}</div>
                      )}
                      {s.videoUrl ? <span className="lx-tl-segment-vbadge">▶</span> : null}
                    </div>
                    <div className="lx-tl-segment-meta">
                      <div className="lx-tl-segment-desc">
                        {truncate(s.action || s.imagePrompt || `分镜 ${idx + 1}`, 20)}
                      </div>
                      <div className="lx-tl-segment-dur">{(s.durationSec || 0).toFixed(1)}s</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────── inline icons ─────────────────────── */

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 5.6L19 9l-5.4 1.4L12 16l-1.6-5.6L5 9l5.4-1.4L12 2z" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
    </svg>
  );
}
