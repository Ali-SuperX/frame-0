"use client";

/**
 * Post-process tools for UGC chunks — Cap Cut 三件套.
 *
 * Shows up after all chunks are generated (status === "done"). Provides:
 *   - 🎬 一键后期: concat + captions + 90% speed → final mp4
 *   - 🎵 加 BGM: optional, mix a music file into the result
 *   - 💾 Save / Download
 *
 * The user can re-run with different speed / BGM without re-rendering chunks.
 */

import { useEffect, useRef, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import {
  fullPipeline,
  mixBgm,
  mixVoiceovers,
  type ChunkSeg,
  type PostProcessProgress,
  type VoiceoverEntry,
} from "@/lib/r2v/postProcess";

type Props = { zh: boolean };

type Stage =
  | { kind: "idle" }
  | { kind: "running"; progress: PostProcessProgress }
  | { kind: "done"; videoUrl: string; videoBlob: Blob }
  | { kind: "error"; message: string };

export default function PostProcessTools({ zh }: Props) {
  const cur = useR2VStore((s) => s.current);
  const videos = useR2VStore((s) => s.videos);
  const ingestVideo = useR2VStore((s) => s.ingestVideo);

  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [speed, setSpeed] = useState(0.9);
  /** Segment-to-segment crossfade duration (seconds).
   *  0 = hard cut, 0.3 default (paired with edge-trim), 1.0 = soft hide, 1.5+ = cinematic. */
  const [crossfade, setCrossfade] = useState(0.3);
  /** Edge-trim: drop the model's deceleration tail + warm-up head at segment joins.
   *  Default on — pairs with low crossfade for clean concatenation.
   *  Source: Seedance 2.0 prompt guide. */
  const [edgeTrim, setEdgeTrim] = useState(true);
  /** AI 配音(自动复用 chunk 内置 voiceoverAudioUrl / voiceoverManualUrl)。
   *  ⚠️ 默认 OFF —— 配音是「可选」功能,不是必需的:
   *  - 即使部分 chunks 已生成 voiceover,后期合成默认不会自动加配音
   *  - 用户必须主动勾选这个 toggle 才会 mix
   *  - 这样用户可以"先生成几段配音试听,但最终视频不带配音"也 OK */
  const [withVoiceover, setWithVoiceover] = useState(false);
  const [voiceoverVolume, setVoiceoverVolume] = useState(0.95);
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.18);
  const [withBgm, setWithBgm] = useState(false);
  const bgmInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (stage.kind === "done") URL.revokeObjectURL(stage.videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cur || cur.mode !== "ugc" || cur.chunks.length === 0) return null;

  /* ── Match chunks to generated video files in <project>/videos/ ── */
  // Convention from UGCBatchSubmit: filename contains "chunk-N"
  const chunkVideoMap: Record<number, { name: string; url: string } | null> = {};
  for (const c of cur.chunks) {
    const v = videos.find((x) => x.name.includes(`-chunk-${c.index}.mp4`) || x.name.includes(`chunk-${c.index}`));
    chunkVideoMap[c.index] = v ? { name: v.name, url: v.url } : null;
  }
  const allMatched = cur.chunks.every((c) => chunkVideoMap[c.index] !== null);

  async function runPipeline() {
    if (!cur) return;
    const segments: ChunkSeg[] = cur.chunks.map((c) => {
      const v = chunkVideoMap[c.index];
      return {
        url: v?.url ?? "",
        voiceover: c.voiceover || "",
        runtime: c.runtime ?? 6,
      };
    });
    if (segments.some((s) => !s.url)) {
      setStage({
        kind: "error",
        message: zh
          ? "缺少 chunk 视频 — 请先在上方完成所有 chunk 提交"
          : "Missing chunk videos — submit all chunks first",
      });
      return;
    }

    setStage({
      kind: "running",
      progress: { step: "loading", percent: 0 },
    });

    try {
      let result = await fullPipeline(segments, {
        speed,
        crossfade,
        // edgeTrim=true 用 Seedance 推荐的 6/1 帧；关掉时 0/0 还原旧行为
        tailFrames: edgeTrim ? 6 : 0,
        headFrames: edgeTrim ? 1 : 0,
        onProgress: (p) => setStage({ kind: "running", progress: p }),
      });

      // Optional voiceover mix(在 BGM 之前 —— BGM 是背景音乐,人声优先)
      const voiceovers: VoiceoverEntry[] = withVoiceover
        ? cur.chunks
            .map((c) => {
              const url = c.voiceoverManualUrl || c.voiceoverAudioUrl;
              return url ? { index: c.index, url } : null;
            })
            .filter((x): x is VoiceoverEntry => x !== null)
        : [];
      if (voiceovers.length > 0) {
        const runtimes = cur.chunks.map((c) => c.runtime ?? 6);
        result = await mixVoiceovers(result.blobUrl, voiceovers, runtimes, {
          volume: voiceoverVolume,
          crossfade,
          speed,
          onProgress: (p) =>
            setStage({
              kind: "running",
              progress: { ...p, step: "voiceover" },
            }),
        });
      }

      // Optional BGM mix
      if (withBgm && bgmFile) {
        const bgmUrl = URL.createObjectURL(bgmFile);
        try {
          result = await mixBgm(result.blobUrl, bgmUrl, {
            volume: bgmVolume,
            onProgress: (p) =>
              setStage({
                kind: "running",
                progress: { ...p, step: "bgm" },
              }),
          });
        } finally {
          URL.revokeObjectURL(bgmUrl);
        }
      }

      setStage({ kind: "done", videoUrl: result.blobUrl, videoBlob: result.blob });
    } catch (err) {
      setStage({
        kind: "error",
        message: (err as Error)?.message ?? String(err),
      });
    }
  }

  async function saveToProject() {
    if (stage.kind !== "done") return;
    await ingestVideo(stage.videoBlob, "final");
  }

  return (
    <section className="r2v-postprocess">
      <header className="r2v-postprocess-head">
        <h3>
          🎬 {zh ? "一键后期（Cap Cut 替代）" : "One-click Post-process"}
        </h3>
        <span className="r2v-section-sub">
          {zh
            ? "段间过渡 + 拼接 N 段 + 烧字幕（黑边白字）+ 调速 90% + 可选 BGM"
            : "Crossfade + concat N segments + burn captions + 0.9× speed + optional BGM"}
        </span>
      </header>

      {!allMatched ? (
        <div className="r2v-postprocess-empty">
          {zh
            ? `等待 ${
                cur.chunks.filter((c) => !chunkVideoMap[c.index]).length
              } 段视频生成完成…`
            : `Waiting for ${
                cur.chunks.filter((c) => !chunkVideoMap[c.index]).length
              } chunk video(s)…`}
        </div>
      ) : (
        <>
          <div className="r2v-postprocess-controls">
            <label className="r2v-block-field">
              <span className="r2v-block-label">
                {zh ? "⏱ 整体速度（0.85-1.0 常用）" : "⏱ Speed (0.85-1.0 typical)"}
              </span>
              <input
                type="range"
                min={0.7}
                max={1.0}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                disabled={stage.kind === "running"}
              />
              <span className="r2v-block-hint">{(speed * 100).toFixed(0)}%</span>
            </label>

            <label className="r2v-block-field">
              <span className="r2v-block-label">
                {zh ? "✂ 段间精修（删过渡帧）" : "✂ Edge-trim joins"}
              </span>
              <input
                type="checkbox"
                checked={edgeTrim}
                onChange={(e) => setEdgeTrim(e.target.checked)}
                disabled={stage.kind === "running"}
                style={{ width: "auto" }}
              />
              <span className="r2v-block-hint">
                {edgeTrim
                  ? zh
                    ? "✓ 删每段末尾 6 帧 + 下段开头 1 帧（≈0.28s/接点），消除「动作刹车」感"
                    : "✓ Drop 6 tail + 1 head frames per join (≈0.28s), kills brake-restart artifacts"
                  : zh
                    ? "保留原始帧，全靠 crossfade 软糊（兼容旧行为）"
                    : "Keep all frames, rely on crossfade to soften"}
              </span>
            </label>

            <label className="r2v-block-field">
              <span className="r2v-block-label">
                {zh ? "🔀 段间过渡时长" : "🔀 Crossfade duration"}
              </span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={crossfade}
                onChange={(e) => setCrossfade(Number(e.target.value))}
                disabled={stage.kind === "running"}
              />
              <span className="r2v-block-hint">
                {crossfade === 0
                  ? zh
                    ? "硬切（无过渡）" + (edgeTrim ? " · 配合精修最干净" : "")
                    : "Hard cut" + (edgeTrim ? " · best with trim" : "")
                  : `${crossfade.toFixed(2)}s · ${
                      crossfade <= 0.4
                        ? zh
                          ? "推荐（配合精修）"
                          : "Recommended (with trim)"
                        : crossfade <= 0.8
                          ? zh
                            ? "快切节奏"
                            : "Quick"
                          : crossfade <= 1.2
                            ? zh
                              ? "软过渡"
                              : "Smooth"
                            : zh
                              ? "电影感"
                              : "Cinematic"
                    }`}
              </span>
            </label>

            {/* 🆕 AI 配音 toggle —— 完全可选,默认 OFF。
                只有在 chunks 至少有 1 段已生成配音时才显示 toggle。 */}
            {cur && cur.chunks.some((c) => c.voiceoverAudioUrl || c.voiceoverManualUrl) ? (
              <>
                <label className="r2v-postprocess-bgm-toggle">
                  <input
                    type="checkbox"
                    checked={withVoiceover}
                    onChange={(e) => setWithVoiceover(e.target.checked)}
                    disabled={stage.kind === "running"}
                  />
                  <span>
                    🎙 {zh ? "加配音(可选)" : "Add Voiceover (optional)"}
                    <span className="r2v-block-hint" style={{ marginLeft: 6 }}>
                      {(() => {
                        const n = cur.chunks.filter(
                          (c) => c.voiceoverAudioUrl || c.voiceoverManualUrl
                        ).length;
                        const total = cur.chunks.length;
                        const partial = n < total;
                        return zh
                          ? `(${n}/${total} 段已生成${partial ? "·未生成段静音" : ""})`
                          : `(${n}/${total} ready${partial ? "·rest silent" : ""})`;
                      })()}
                    </span>
                  </span>
                </label>
                {withVoiceover ? (
                  <label className="r2v-block-field">
                    <span className="r2v-block-label">
                      {zh ? "配音音量" : "Voiceover volume"}
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={1.2}
                      step={0.05}
                      value={voiceoverVolume}
                      onChange={(e) => setVoiceoverVolume(Number(e.target.value))}
                      disabled={stage.kind === "running"}
                    />
                    <span className="r2v-block-hint">
                      {Math.round(voiceoverVolume * 100)}%
                    </span>
                  </label>
                ) : null}
              </>
            ) : (
              <div className="r2v-block-hint" style={{ marginTop: 4 }}>
                💡 {zh
                  ? "AI 配音是可选功能。要用就在上方 chunks 里生成,然后回这里勾选"
                  : "Voiceover is optional. Generate per-chunk TTS above to enable here."}
              </div>
            )}

            <label className="r2v-postprocess-bgm-toggle">
              <input
                type="checkbox"
                checked={withBgm}
                onChange={(e) => setWithBgm(e.target.checked)}
                disabled={stage.kind === "running"}
              />
              <span>🎵 {zh ? "加 BGM" : "Add BGM"}</span>
            </label>

            {withBgm ? (
              <div className="r2v-postprocess-bgm">
                <input
                  ref={bgmInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setBgmFile(e.target.files?.[0] ?? null)}
                  className="r2v-input r2v-input--small"
                  disabled={stage.kind === "running"}
                />
                <label className="r2v-block-field">
                  <span className="r2v-block-label">
                    {zh ? "BGM 音量" : "BGM volume"}
                  </span>
                  <input
                    type="range"
                    min={0.05}
                    max={0.4}
                    step={0.02}
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(Number(e.target.value))}
                    disabled={stage.kind === "running"}
                  />
                  <span className="r2v-block-hint">
                    {Math.round(bgmVolume * 100)}% (
                    {zh ? "建议 15-25%" : "15-25% recommended"})
                  </span>
                </label>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="r2v-btn r2v-btn--primary r2v-btn--lg"
            onClick={runPipeline}
            disabled={stage.kind === "running"}
          >
            {stage.kind === "running"
              ? zh
                ? "处理中…"
                : "Processing…"
              : zh
                ? `🎬 一键后期（${cur.chunks.length} 段 · ${
                    cur.chunks.reduce((s, c) => s + (c.runtime ?? 6), 0)
                  }s → ${(speed * 100).toFixed(0)}% 速度）`
                : `🎬 Run pipeline (${cur.chunks.length} chunks → ${(speed * 100).toFixed(0)}% speed)`}
          </button>

          {stage.kind === "running" ? (
            <div className="r2v-postprocess-progress">
              <div className="r2v-progress">
                <div
                  className="r2v-progress-bar"
                  style={{ width: `${stage.progress.percent}%` }}
                />
              </div>
              <div className="r2v-postprocess-progress-label">
                {stage.progress.step} · {stage.progress.percent}%
                {stage.progress.message ? ` · ${stage.progress.message}` : ""}
              </div>
            </div>
          ) : null}

          {stage.kind === "error" ? (
            <div className="r2v-batch-badge r2v-batch-badge--error" style={{ marginTop: 8 }}>
              {stage.message}
            </div>
          ) : null}

          {stage.kind === "done" ? (
            <div className="r2v-postprocess-result">
              <video
                src={stage.videoUrl}
                controls
                preload="metadata"
                className="r2v-postprocess-preview"
              />
              <div className="r2v-postprocess-result-actions">
                <a
                  href={stage.videoUrl}
                  download={`${cur.projectId}-final.mp4`}
                  className="r2v-btn r2v-btn--ghost"
                >
                  💾 {zh ? "下载" : "Download"}
                </a>
                <button
                  type="button"
                  className="r2v-btn r2v-btn--primary"
                  onClick={saveToProject}
                >
                  📁 {zh ? "保存到项目目录" : "Save to project"}
                </button>
                <button
                  type="button"
                  className="r2v-btn r2v-btn--ghost"
                  onClick={() => setStage({ kind: "idle" })}
                >
                  🔄 {zh ? "重新跑（换参数）" : "Re-run with new params"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
