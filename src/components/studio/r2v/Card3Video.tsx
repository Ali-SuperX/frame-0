"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { getModel } from "@/lib/bailian/models";
import { uploadDataUrlToOss } from "../uploadMedia";
import UGCBatchSubmit from "./ugc/UGCBatchSubmit";
import PostProcessTools from "./ugc/PostProcessTools";
import type {
  VideoSegment,
  AnchorStrategy,
  SegmentRunState,
  R2VProjectInput,
} from "@/lib/r2v/schema";
import { extractKeyFrames } from "@/lib/r2v/videoUtils";
import TimelineEditor from "./TimelineEditor";

type Props = { zh: boolean };
type VideoMode = "single" | "long";

type RunState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "running"; taskId: string; startedAt: number }
  | { kind: "saving"; taskId: string; videoUrl: string }
  | { kind: "done"; filename: string }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 4000;

export default function Card3Video({ zh }: Props) {
  /* cur 为空时整组件提前返回 —— 但 React hooks 必须无条件执行，
   * 故把真正的渲染体拆进 Card3VideoInner，由它持有全部 hooks。 */
  const cur = useR2VStore((s) => s.current);
  if (!cur) return null;
  return <Card3VideoInner zh={zh} cur={cur} />;
}

function Card3VideoInner({ zh, cur }: Props & { cur: R2VProjectInput }) {
  const promptOutput = useR2VStore((s) => s.promptOutput);
  const videos = useR2VStore((s) => s.videos);
  const ingestVideo = useR2VStore((s) => s.ingestVideo);
  const refreshVideos = useR2VStore((s) => s.refreshVideos);

  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [now, setNow] = useState<number>(() => Date.now());
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const eta = getModel("happyhorse-1.1-r2v")?.etaSec ?? 180;

  // ── long video mode ──
  const [videoMode, setVideoMode] = useState<VideoMode>("single");
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [anchorStrategy, setAnchorStrategy] = useState<AnchorStrategy>("r2v-chain");
  const [segStates, setSegStates] = useState<Record<string, SegmentRunState>>({});
  const [chainRunning, setChainRunning] = useState(false);
  const chainCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // ── continuation mode (iterative extend) ──
  type ContState =
    | { step: "idle" }
    | { step: "extracting"; videoName: string }
    | { step: "ready"; videoName: string; keyFrames: { label: string; dataUrl: string; time: number }[] }
    | { step: "generating"; videoName: string; keyFrames: { label: string; dataUrl: string; time: number }[] };
  const [cont, setCont] = useState<ContState>({ step: "idle" });
  const [contPrompt, setContPrompt] = useState("");
  const [contDuration, setContDuration] = useState(10);
  const [contRun, setContRun] = useState<RunState>({ kind: "idle" });
  const [contSelectedFrames, setContSelectedFrames] = useState<Set<string>>(new Set());
  const contCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  /* ── refresh videos when project loads ── */
  useEffect(() => {
    if (cur) void refreshVideos();
  }, [cur?.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      cancelRef.current.cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (run.kind !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [run.kind]);

  const elapsed =
    run.kind === "running" ? Math.floor((now - run.startedAt) / 1000) : 0;

  const statusBadge = useMemo(() => {
    switch (run.kind) {
      case "idle":
        return null;
      case "submitting":
        return zh ? "提交中..." : "Submitting...";
      case "running": {
        const left = Math.max(0, eta - elapsed);
        return zh
          ? `渲染中 · ${elapsed}s 已用 / 约 ${left}s 剩余`
          : `Running · ${elapsed}s used / ~${left}s left`;
      }
      case "saving":
        return zh ? "下载并保存到工作目录..." : "Downloading + saving...";
      case "done":
        return zh ? `已保存：${run.filename}` : `Saved: ${run.filename}`;
      case "error":
        return run.message;
    }
  }, [run, elapsed, eta, zh]);

  const refs = cur.references.filter((r) => !!r.url);
  const ready = !!promptOutput?.prompt;
  const refsReady = refs.length > 0;
  const canGenerate =
    ready &&
    refsReady &&
    (run.kind === "idle" || run.kind === "error" || run.kind === "done");

  async function generate() {
    if (!cur || !promptOutput) return;
    cancelRef.current = { cancelled: false };
    setRun({ kind: "submitting" });

    try {
      const referenceUrls = refs.map((r) => ({ url: r.url, name: r.name }));

      const { taskId } = await submitJobRequest({
        modelId: "happyhorse-1.1-r2v",
        params: {
          resolution: cur.output.resolution,
          ratio: cur.output.ratio,
          duration: cur.output.duration,
          watermark: cur.output.watermark,
        },
        media: {
          reference_urls: referenceUrls,
        },
        prompt: promptOutput.prompt,
        negativePrompt: promptOutput.negativePrompt,
      });
      if (!taskId) throw new Error("提交失败：未返回 taskId");

      setRun({ kind: "running", taskId, startedAt: Date.now() });

      while (!cancelRef.current.cancelled) {
        await sleep(POLL_INTERVAL_MS);
        if (cancelRef.current.cancelled) return;
        const qs = new URLSearchParams({
          task_id: taskId,
          model_id: "happyhorse-1.1-r2v",
        });
        const res = await fetch(`/api/bailian/poll?${qs.toString()}`, {
          cache: "no-store",
          headers: apiKeysHeader(),
        });
        const s = await res.json();
        if (s.state === "done") {
          const videoUrl: string = s.localPath || s.videoUrl;
          if (!videoUrl) {
            setRun({
              kind: "error",
              message: "Job completed but no video URL was returned",
            });
            return;
          }
          setRun({ kind: "saving", taskId, videoUrl });
          try {
            const blob = await fetch(videoUrl).then((r) => r.blob());
            const filename = await ingestVideo(blob);
            setRun({ kind: "done", filename: filename ?? "video.mp4" });
          } catch (err) {
            setRun({
              kind: "error",
              message: `Saving video failed: ${(err as Error)?.message ?? String(err)}`,
            });
          }
          return;
        }
        if (s.state === "error" || s.state === "failed") {
          setRun({
            kind: "error",
            message: s.error || s.message || "Generation failed",
          });
          return;
        }
      }
    } catch (err) {
      setRun({
        kind: "error",
        message: (err as Error)?.message ?? String(err),
      });
    }
  }

  function cancel() {
    cancelRef.current.cancelled = true;
    setRun({ kind: "idle" });
  }

  // ── chain generate for long video mode ──
  const updateSegState = useCallback(
    (segId: string, patch: Partial<SegmentRunState>) => {
      setSegStates((prev) => ({
        ...prev,
        [segId]: { ...prev[segId], segId, status: "pending", ...patch },
      }));
    },
    []
  );

  const chainGenerate = useCallback(async () => {
    if (!cur || !promptOutput || segments.length === 0) return;
    chainCancelRef.current = { cancelled: false };
    setChainRunning(true);

    // Reset all segment states
    const initStates: Record<string, SegmentRunState> = {};
    for (const seg of segments) {
      initStates[seg.id] = { segId: seg.id, status: "pending" };
    }
    setSegStates(initStates);

    const allRefs = cur.references.filter((r) => !!r.url);
    // Key frames from the previous segment — used to anchor the next one.
    // Contains first/mid/last frames for better cross-segment consistency
    // (single last frame is insufficient when camera moves or angle changes).
    let prevKeyFrames: { label: string; dataUrl: string }[] = [];

    for (let i = 0; i < segments.length; i++) {
      if (chainCancelRef.current.cancelled) break;
      const seg = segments[i];

      // Determine which refs to use for this segment
      let segRefs = seg.overrideRefSlots
        ? allRefs.filter((r) => seg.overrideRefSlots!.includes(r.slot))
        : allRefs;
      if (segRefs.length === 0) segRefs = allRefs;

      const referenceUrls = segRefs.map((r) => ({ url: r.url, name: r.name }));

      // Build prompt — include camera move if specified
      let segPrompt = seg.prompt;
      if (seg.cameraMove) {
        segPrompt = `[运镜: ${seg.cameraMove}] ${segPrompt}`;
      }
      // For segments after the first, add continuity hint
      if (i > 0) {
        segPrompt = `（延续上一镜画面）${segPrompt}`;
      }

      // ── submit ──
      updateSegState(seg.id, { status: "submitting" });

      try {
        // R2V chain: inject previous-segment key frames as extra references so
        // the model keeps character/scene continuity across the cut. Extracted
        // frames are data: URLs — upload to OSS first (HappyHorse can't fetch
        // base64), respecting the 9-ref limit (drop mid frames first).
        if (prevKeyFrames.length > 0 && anchorStrategy === "r2v-chain") {
          const budget = 9 - referenceUrls.length;
          for (const kf of prevKeyFrames.slice(0, Math.max(1, budget))) {
            const name = `seg${i}_${kf.label}_${Date.now()}.jpg`;
            const url = await uploadDataUrlToOss(
              kf.dataUrl,
              name,
              "happyhorse-1.1-r2v"
            );
            referenceUrls.push({ url, name });
          }
        }
        const { taskId } = await submitJobRequest({
          modelId: "happyhorse-1.1-r2v",
          params: {
            resolution: cur.output.resolution,
            ratio: cur.output.ratio,
            duration: seg.duration,
            watermark: cur.output.watermark,
          },
          media: { reference_urls: referenceUrls },
          prompt: segPrompt,
          negativePrompt: seg.negativePrompt || promptOutput.negativePrompt,
        });
        if (!taskId) throw new Error("提交失败：未返回 taskId");

        updateSegState(seg.id, {
          status: "running",
          taskId,
          startedAt: Date.now(),
        });

        // ── poll ──
        let segVideoUrl: string | null = null;
        while (!chainCancelRef.current.cancelled) {
          await sleep(POLL_INTERVAL_MS);
          if (chainCancelRef.current.cancelled) break;

          // Update elapsed
          const state = initStates[seg.id];
          const started = state?.startedAt ?? Date.now();
          updateSegState(seg.id, {
            elapsed: Math.floor((Date.now() - started) / 1000),
          });

          const qs = new URLSearchParams({
            task_id: taskId,
            model_id: "happyhorse-1.1-r2v",
          });
          const res = await fetch(`/api/bailian/poll?${qs.toString()}`, {
            cache: "no-store",
            headers: apiKeysHeader(),
          });
          const s = await res.json();

          if (s.state === "done") {
            segVideoUrl = s.localPath || s.videoUrl;
            break;
          }
          if (s.state === "error" || s.state === "failed") {
            updateSegState(seg.id, {
              status: "error",
              error: s.error || s.message || "Generation failed",
            });
            break;
          }
        }

        if (chainCancelRef.current.cancelled) break;

        if (segVideoUrl) {
          // Save video
          const blob = await fetch(segVideoUrl).then((r) => r.blob());
          const segBlobUrl = URL.createObjectURL(blob);
          await ingestVideo(blob, `seg${i + 1}`);

          // Extract key frames (first/mid/last) for next segment anchoring
          let keyFrames: { label: string; dataUrl: string; time: number }[] = [];
          try {
            keyFrames = await extractKeyFrames(segBlobUrl, 3);
            prevKeyFrames = keyFrames;
          } catch (err) {
            console.warn("Key frame extraction failed:", err);
          }

          updateSegState(seg.id, {
            status: "done",
            videoUrl: segBlobUrl,
            keyFrames,
            lastFrameDataUrl: keyFrames.at(-1)?.dataUrl,
          });
        }
      } catch (err) {
        updateSegState(seg.id, {
          status: "error",
          error: (err as Error)?.message ?? String(err),
        });
        // Don't stop the chain on error — continue with next segment
      }
    }

    setChainRunning(false);
    void refreshVideos();
  }, [cur, promptOutput, segments, anchorStrategy, updateSegState, ingestVideo, refreshVideos]);

  const cancelChain = useCallback(() => {
    chainCancelRef.current.cancelled = true;
    setChainRunning(false);
  }, []);

  // ── continuation: "extend this video" ──
  const startContinuation = useCallback(async (videoName: string, videoUrl: string) => {
    setCont({ step: "extracting", videoName });
    try {
      const keyFrames = await extractKeyFrames(videoUrl, 3);
      setContSelectedFrames(new Set(keyFrames.map((kf) => kf.label)));
      setCont({ step: "ready", videoName, keyFrames });
    } catch (err) {
      console.error("Key frame extraction failed:", err);
      setCont({ step: "idle" });
    }
  }, []);

  const generateContinuation = useCallback(async () => {
    if (cont.step !== "ready" || !cur || !contPrompt.trim()) return;
    const { keyFrames, videoName } = cont;
    setCont({ step: "generating", videoName, keyFrames });
    contCancelRef.current = { cancelled: false };
    setContRun({ kind: "submitting" });

    const allRefs = cur.references.filter((r) => !!r.url);
    const referenceUrls = allRefs.map((r) => ({ url: r.url, name: r.name }));

    const selectedFrames = keyFrames.filter((kf) => contSelectedFrames.has(kf.label));
    const segPrompt = `（延续上一镜「${videoName}」的画面）${contPrompt.trim()}`;

    try {
      // Inject user-selected key frames (respect 9-ref limit). Extracted frames
      // are data: URLs — upload to OSS first so HappyHorse can fetch them.
      const budget = 9 - referenceUrls.length;
      for (const kf of selectedFrames.slice(0, Math.max(0, budget))) {
        const name = `cont_${kf.label}_${Date.now()}.jpg`;
        const url = await uploadDataUrlToOss(
          kf.dataUrl,
          name,
          "happyhorse-1.1-r2v"
        );
        referenceUrls.push({ url, name });
      }
      const { taskId } = await submitJobRequest({
        modelId: "happyhorse-1.1-r2v",
        params: {
          resolution: cur.output.resolution,
          ratio: cur.output.ratio,
          duration: contDuration,
          watermark: cur.output.watermark,
        },
        media: { reference_urls: referenceUrls },
        prompt: segPrompt,
        negativePrompt: promptOutput?.negativePrompt,
      });
      if (!taskId) throw new Error("提交失败：未返回 taskId");

      setContRun({ kind: "running", taskId, startedAt: Date.now() });

      while (!contCancelRef.current.cancelled) {
        await sleep(POLL_INTERVAL_MS);
        if (contCancelRef.current.cancelled) return;

        const qs = new URLSearchParams({ task_id: taskId, model_id: "happyhorse-1.1-r2v" });
        const res = await fetch(`/api/bailian/poll?${qs.toString()}`, {
          cache: "no-store",
          headers: apiKeysHeader(),
        });
        const s = await res.json();

        if (s.state === "done") {
          const videoUrl: string = s.localPath || s.videoUrl;
          if (videoUrl) {
            setContRun({ kind: "saving", taskId, videoUrl });
            const blob = await fetch(videoUrl).then((r) => r.blob());
            const filename = await ingestVideo(blob, "cont");
            setContRun({ kind: "done", filename: filename ?? "video.mp4" });
          } else {
            setContRun({ kind: "error", message: "No video URL returned" });
          }
          break;
        }
        if (s.state === "error" || s.state === "failed") {
          setContRun({ kind: "error", message: s.error || s.message || "Failed" });
          break;
        }
      }
    } catch (err) {
      setContRun({ kind: "error", message: (err as Error)?.message ?? String(err) });
    }

    // After generation, re-extract frames from the NEW video so user can chain again
    setCont({ step: "idle" });
    setContPrompt("");
    void refreshVideos();
  }, [cont, cur, contPrompt, contDuration, contSelectedFrames, promptOutput, ingestVideo, refreshVideos]);

  const cancelContinuation = useCallback(() => {
    contCancelRef.current.cancelled = true;
    setCont({ step: "idle" });
    setContRun({ kind: "idle" });
  }, []);

  // Timer for continuation elapsed
  useEffect(() => {
    if (contRun.kind !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [contRun.kind]);

  const contElapsed = contRun.kind === "running"
    ? Math.floor((now - contRun.startedAt) / 1000)
    : 0;

  // Timer for chain elapsed updates
  useEffect(() => {
    if (!chainRunning) return;
    const id = window.setInterval(() => {
      setSegStates((prev) => {
        const next = { ...prev };
        for (const key in next) {
          const s = next[key];
          if (s.status === "running" && s.startedAt) {
            next[key] = { ...s, elapsed: Math.floor((Date.now() - s.startedAt) / 1000) };
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [chainRunning]);

  /* ── UGC mode summary (purely informational, doesn't change submit flow yet) ─ */
  const ugcModeActive = cur?.mode === "ugc";
  const ugcChunks = cur?.chunks ?? [];
  const ugcTotalRuntime = ugcChunks.reduce((s, c) => s + (c.runtime ?? 0), 0);

  return (
    <div className="r2v-card r2v-card--video">
      {ugcModeActive && ugcChunks.length > 0 ? (
        <>
          <div className="r2v-ugc-c3-banner" role="note">
            <div className="r2v-ugc-c3-banner-head">
              <span>📱 {zh ? "批量短片" : "UGC mode"}</span>
              <span style={{ opacity: 0.7, fontWeight: 400 }}>
                {ugcChunks.length} {zh ? "段" : "chunks"} · {ugcTotalRuntime}s
              </span>
            </div>
            <div className="r2v-ugc-c3-banner-summary">
              {ugcChunks.map((c) => (
                <span key={c.index} className="r2v-ugc-c3-banner-chunk">
                  #{c.index} · {c.runtime ?? 6}s
                  {c.includeProduct ? " · 📦" : ""}
                  {c.index === 1 && c.hookType ? ` · 🪝` : ""}
                </span>
              ))}
            </div>
            <div className="r2v-ugc-c3-banner-note">
              {zh
                ? "下方「多 chunk 并行提交」会按 chunks 字段构造 N 个独立提交（不依赖 prompt.md，直接走 input.json 的 universalBlocks + chunks）。下面的「单段流程」仍可用 — 两种共存。"
                : "Fan-out below builds N independent submissions from input.json's chunks + universalBlocks (no prompt.md needed). Single-shot flow below still works — both coexist."}
            </div>
          </div>
          <UGCBatchSubmit key={`batch-${cur.projectId}`} zh={zh} />
          <PostProcessTools key={`post-${cur.projectId}`} zh={zh} />
        </>
      ) : null}

      {/* ── mode tabs: single vs long ── */}
      <div className="r2v-mode-tabs">
        <button
          type="button"
          className={`r2v-mode-tab ${videoMode === "single" ? "r2v-mode-tab--active" : ""}`}
          onClick={() => setVideoMode("single")}
          disabled={chainRunning}
        >
          {zh ? "🎬 单段生成" : "🎬 Single"}
        </button>
        <button
          type="button"
          className={`r2v-mode-tab ${videoMode === "long" ? "r2v-mode-tab--active" : ""}`}
          onClick={() => setVideoMode("long")}
          disabled={run.kind === "running" || run.kind === "submitting"}
        >
          {zh ? "🎞️ 长视频（链式）" : "🎞️ Long (chained)"}
        </button>
      </div>

      {/* ── long video timeline ── */}
      {videoMode === "long" ? (
        <section className="r2v-section">
          <TimelineEditor
            zh={zh}
            segments={segments}
            anchorStrategy={anchorStrategy}
            segmentStates={segStates}
            refs={refs}
            onUpdate={setSegments}
            onStrategyChange={setAnchorStrategy}
            onGenerate={chainGenerate}
            onCancel={cancelChain}
            generating={chainRunning}
          />
        </section>
      ) : null}

      {/* ── complete config preview + generate (single mode) ── */}
      {videoMode === "single" ? (
      <>
      <section className="r2v-section">
        <header className="r2v-section-head">
          <h3>{zh ? "📋 完整配置预览" : "📋 Full config preview"}</h3>
          <span className="r2v-section-sub">
            {zh
              ? "以下所有内容将一并提交到 R2V"
              : "Everything below will be submitted to R2V"}
          </span>
        </header>

        {/* ── reference images strip ── */}
        <div className="r2v-cfg-label">
          {zh
            ? `参考图（${refs.length} 张，按顺序映射 character1–${refs.length}）`
            : `References (${refs.length}, mapped to character1–${refs.length})`}
        </div>
        <div className="r2v-cfg-refs">
          {refs.map((ref, i) => {
            // Fallback chain: thumb → server localPath → http(s) URL → placeholder
            const previewSrc = ref.thumbDataUrl
              || ref.localPath
              || (ref.url && /^https?:/i.test(ref.url) ? ref.url : null);
            return (
            <div key={ref.slot} className="r2v-cfg-ref">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt={`character${i + 1}`}
                  className="r2v-cfg-ref-thumb"
                />
              ) : (
                <div className="r2v-cfg-ref-placeholder">
                  {i + 1}
                </div>
              )}
              <div className="r2v-cfg-ref-meta">
                <span className="r2v-cfg-ref-char">
                  character{i + 1}
                </span>
                {ref.note ? (
                  <span className="r2v-cfg-ref-note">{ref.note}</span>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>

        {/* ── output settings badges ── */}
        <div className="r2v-cfg-label">
          {zh ? "输出设置" : "Output settings"}
        </div>
        <div className="r2v-cfg-badges">
          <span className="r2v-cfg-badge">
            {cur.output.resolution}
          </span>
          <span className="r2v-cfg-badge">{cur.output.ratio}</span>
          <span className="r2v-cfg-badge">{cur.output.duration}s</span>
          <span className="r2v-cfg-badge">
            {cur.output.watermark
              ? zh
                ? "水印 ✓"
                : "Watermark ✓"
              : zh
                ? "无水印"
                : "No watermark"}
          </span>
          <span className="r2v-cfg-badge">happyhorse-1.1-r2v</span>
        </div>

        {/* ── prompt preview ── */}
        {ready ? (
          <>
            <div className="r2v-cfg-label">Prompt</div>
            <pre className="r2v-prompt-preview">{promptOutput!.prompt}</pre>
            {promptOutput!.negativePrompt ? (
              <>
                <div className="r2v-cfg-label" style={{ marginTop: 8 }}>
                  Negative
                </div>
                <pre className="r2v-cfg-neg">
                  {promptOutput!.negativePrompt}
                </pre>
              </>
            ) : null}
          </>
        ) : (
          <p className="r2v-empty">
            {zh
              ? "⚠️ 尚未设置 Prompt，请先在 ② 粘贴提示词"
              : "⚠️ No prompt yet — paste one in step ②"}
          </p>
        )}
      </section>

      {/* ── generate action (single mode) ── */}
      <section className="r2v-section">
        <div className="r2v-action-row">
          <button
            type="button"
            className="r2v-btn r2v-btn--primary r2v-btn--lg"
            onClick={generate}
            disabled={!canGenerate}
            style={{ flex: 1 }}
          >
            {run.kind === "running" ||
            run.kind === "submitting" ||
            run.kind === "saving"
              ? zh
                ? "生成中..."
                : "Generating..."
              : zh
                ? `🎬 生成视频（约 ${eta}s）`
                : `🎬 Generate (~${eta}s)`}
          </button>
          {run.kind === "running" || run.kind === "submitting" ? (
            <button
              type="button"
              className="r2v-btn r2v-btn--ghost"
              onClick={cancel}
            >
              {zh ? "取消" : "Cancel"}
            </button>
          ) : null}
        </div>
        {!canGenerate && !ready ? (
          <p className="r2v-empty" style={{ margin: "8px 0 0" }}>
            {zh
              ? "需要 Prompt + 至少 1 张参考图"
              : "Needs prompt + at least 1 reference image"}
          </p>
        ) : null}
        {statusBadge ? (
          <div
            className={`r2v-run-status r2v-run-status--${run.kind}`}
            role={run.kind === "error" ? "alert" : "status"}
          >
            {statusBadge}
          </div>
        ) : null}
        {run.kind === "running" ? (
          <div className="r2v-progress" aria-hidden>
            <div
              className="r2v-progress-bar"
              style={{
                width: `${Math.min(100, Math.round((elapsed / eta) * 100))}%`,
              }}
            />
          </div>
        ) : null}
      </section>
      </>
      ) : null}

      {/* ── video gallery (both modes) ── */}
      {videos.length > 0 ? (
        <section className="r2v-section">
          <header className="r2v-section-head">
            <h3>{zh ? "生成结果" : "Results"}</h3>
          </header>
          <ul className="r2v-videos">
            {videos.map((v) => {
              const isContinuingThis = cont.step !== "idle" && cont.videoName === v.name;
              return (
                <li key={v.name} className="r2v-video">
                  <video
                    src={v.url}
                    controls
                    preload="metadata"
                    className="r2v-video-player"
                  />
                  <div className="r2v-video-meta">
                    <span className="r2v-video-name">{v.name}</span>
                    <span className="r2v-video-size">
                      {(v.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <a
                      href={v.url}
                      download={v.name}
                      className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                    >
                      {zh ? "下载" : "Download"}
                    </a>
                    <button
                      type="button"
                      className={`r2v-btn r2v-btn--xs ${isContinuingThis ? "r2v-btn--primary" : ""}`}
                      onClick={() => startContinuation(v.name, v.url)}
                      disabled={
                        cont.step === "extracting" ||
                        cont.step === "generating" ||
                        contRun.kind === "running" ||
                        contRun.kind === "submitting"
                      }
                    >
                      {cont.step === "extracting" && cont.videoName === v.name
                        ? (zh ? "⏳ 提帧中..." : "⏳ Extracting...")
                        : (zh ? "➕ 延续" : "➕ Extend")}
                    </button>
                  </div>

                  {/* ── connection arrow from this video ── */}
                  {isContinuingThis && (
                    <div className="r2v-cont-arrow">
                      <div className="r2v-cont-arrow-line" />
                      <span className="r2v-cont-arrow-label">
                        {zh ? "🔗 锚定帧已提取，生成下一段" : "🔗 Frames extracted, generate next"}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ── continuation panel ── */}
      {(cont.step === "ready" || cont.step === "generating") && (
        <section className="r2v-section r2v-cont-panel">
          <header className="r2v-section-head">
            <h3>{zh ? "🔗 延续生成" : "🔗 Continue from"}: {cont.videoName}</h3>
            <button
              type="button"
              className="r2v-btn r2v-btn--ghost r2v-btn--xs"
              onClick={cancelContinuation}
              disabled={cont.step === "generating" && contRun.kind === "running"}
            >
              {zh ? "✕ 取消" : "✕ Cancel"}
            </button>
          </header>

          {/* show anchor key frames — user-selectable */}
          <div className="r2v-cont-frames">
            <div className="r2v-cont-frames-header">
              <span className="r2v-cont-frames-label">
                {zh
                  ? `锚定帧（${contSelectedFrames.size}/${cont.keyFrames.length} 帧已选）`
                  : `Anchor frames (${contSelectedFrames.size}/${cont.keyFrames.length} selected)`}
              </span>
              <button
                type="button"
                className="r2v-btn r2v-btn--ghost r2v-btn--xs"
                onClick={() => {
                  if (contSelectedFrames.size === cont.keyFrames.length) {
                    setContSelectedFrames(new Set());
                  } else {
                    setContSelectedFrames(new Set(cont.keyFrames.map((kf) => kf.label)));
                  }
                }}
                disabled={cont.step === "generating"}
              >
                {contSelectedFrames.size === cont.keyFrames.length
                  ? (zh ? "清除" : "Clear")
                  : (zh ? "全选" : "All")}
              </button>
            </div>
            <div className="r2v-tl-keyframes">
              {cont.keyFrames.map((kf) => {
                const on = contSelectedFrames.has(kf.label);
                return (
                  <div
                    key={kf.label}
                    className={`r2v-tl-keyframe r2v-tl-keyframe--pick ${on ? "r2v-tl-keyframe--on" : ""}`}
                    onClick={() => {
                      if (cont.step === "generating") return;
                      setContSelectedFrames((prev) => {
                        const next = new Set(prev);
                        if (next.has(kf.label)) next.delete(kf.label);
                        else next.add(kf.label);
                        return next;
                      });
                    }}
                  >
                    <img src={kf.dataUrl} alt={kf.label} className="r2v-tl-lastframe-img" />
                    <span className="r2v-tl-keyframe-label">{kf.label} · {kf.time}s</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* next segment prompt + duration */}
          <div className="r2v-cont-form">
            <div className="r2v-cont-dur-row">
              <label className="r2v-tl-seg-label">{zh ? "时长" : "Duration"}</label>
              <input
                type="range"
                min={3}
                max={15}
                step={1}
                value={contDuration}
                onChange={(e) => setContDuration(parseInt(e.target.value, 10))}
                disabled={cont.step === "generating"}
                className="r2v-tl-slider"
              />
              <span className="r2v-tl-seg-dur-val">{contDuration}s</span>
            </div>
            <textarea
              className="r2v-tl-prompt-area"
              rows={4}
              placeholder={
                zh
                  ? "描述下一段画面：镜头、动作、光线...\n如：「镜头缓慢推向产品特写，侧逆光打出材质纹理」"
                  : "Describe the next shot: camera, action, lighting..."
              }
              value={contPrompt}
              onChange={(e) => setContPrompt(e.target.value)}
              disabled={cont.step === "generating"}
              autoFocus
            />
          </div>

          {/* generate button + status */}
          <div className="r2v-cont-actions">
            {cont.step === "generating" && (contRun.kind === "running" || contRun.kind === "submitting") ? (
              <>
                <div className="r2v-run-status r2v-run-status--running">
                  {contRun.kind === "submitting"
                    ? (zh ? "提交中..." : "Submitting...")
                    : `${zh ? "渲染中" : "Running"} · ${contElapsed}s / ~${eta}s`}
                </div>
                <div className="r2v-progress" aria-hidden>
                  <div className="r2v-progress-bar" style={{ width: `${Math.min(100, Math.round((contElapsed / eta) * 100))}%` }} />
                </div>
                <button type="button" className="r2v-btn r2v-btn--ghost" onClick={cancelContinuation}>
                  {zh ? "取消" : "Cancel"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="r2v-btn r2v-btn--primary r2v-btn--lg"
                onClick={generateContinuation}
                disabled={!contPrompt.trim()}
                style={{ width: "100%" }}
              >
                {zh
                  ? `🎬 生成下一段（${contDuration}s${contSelectedFrames.size > 0 ? ` · ${contSelectedFrames.size} 帧锚定` : ""}）`
                  : `🎬 Generate next (${contDuration}s${contSelectedFrames.size > 0 ? ` · ${contSelectedFrames.size} anchors` : ""})`}
              </button>
            )}
          </div>

          {contRun.kind === "error" && (
            <div className="r2v-run-status r2v-run-status--error">{contRun.message}</div>
          )}
          {contRun.kind === "done" && (
            <div className="r2v-run-status r2v-run-status--done">
              {zh ? `✅ 已保存：${contRun.filename}` : `✅ Saved: ${contRun.filename}`}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((res) => window.setTimeout(res, ms));
}
