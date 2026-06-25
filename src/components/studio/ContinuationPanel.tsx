"use client";

import { useCallback, useEffect, useState } from "react";
import { useStudioStore, type Job, type JobMedia } from "@/lib/store";
import {
  extractKeyFrames,
  extractSingleFrame,
  getVideoDuration,
} from "@/lib/r2v/videoUtils";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { getI2VVariant, getR2VVariant } from "@/lib/bailian/models";
import { uploadDataUrlAsMedia } from "./uploadMedia";
import AnchorRefThumb from "./AnchorRefThumb";
import "@/styles/r2v.css";

/** 延续模式：R2V 多参考图 / I2V 仅首帧 */
type ContMode = "r2v" | "i2v";

/** 续写动作模板 — 一键填入 prompt，覆盖 80% 常见续写需求 */
const PROMPT_TEMPLATES: Array<{
  emoji: string;
  label: string;
  text: string;
}> = [
  { emoji: "⏩", label: "继续动作", text: "主体延续上一段动作并自然推进，节奏保持一致" },
  { emoji: "🎬", label: "镜头推近", text: "镜头缓慢推近至主体面部/产品细节，景别从中景过渡到特写" },
  { emoji: "🔭", label: "镜头拉远", text: "镜头快速拉远至全景，露出更多环境信息，主体保持在画面中心" },
  { emoji: "🔄", label: "切换视角", text: "镜头切换到主体的侧面/背后/正面视角，光线方向相应调整" },
  { emoji: "⚡", label: "新元素入画", text: "新主体/道具/光线变化从画面外进入并与主体产生互动" },
  { emoji: "💫", label: "时间流逝", text: "时间流逝感（光线/天色/影子变化），主体姿态保持基本一致" },
  { emoji: "🎭", label: "情绪转变", text: "主体的表情和肢体语言逐渐由克制转向" },
  { emoji: "🛑", label: "停顿收尾", text: "主体动作逐渐放缓直至定格，镜头同步收稳形成 Pack Shot" },
];

type Props = {
  job: Job;
  zh: boolean;
  onClose: () => void;
};

type KeyFrame = { label: string; dataUrl: string; time: number };
type Phase = "extracting" | "ready" | "submitted";

/**
 * Inline continuation panel for the Studio PreviewPanel.
 *
 * Features:
 *  - Auto-extracts 3 key frames (first/mid/last)
 *  - Custom time-point extraction (user inputs seconds → extract frame)
 *  - Original job's reference images displayed as toggleable picks
 *  - All items (frames + refs) independently selectable
 *  - Budget indicator: selected / 9 max
 */
export default function ContinuationPanel({ job, zh, onClose }: Props) {
  const createJobFromPayload = useStudioStore((s) => s.createJobFromPayload);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const selectJob = useStudioStore((s) => s.selectJob);

  const [phase, setPhase] = useState<Phase>("extracting");
  const [keyFrames, setKeyFrames] = useState<KeyFrame[]>([]);
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set());
  const [videoDuration, setVideoDuration] = useState(0);

  // Custom frame extraction
  const [customTime, setCustomTime] = useState("");
  const [extracting, setExtracting] = useState(false);

  // Original reference images from the source job
  const origRefs: JobMedia[] = Array.isArray(job.media?.reference_urls)
    ? job.media!.reference_urls
    : [];
  const [selectedRefs, setSelectedRefs] = useState<Set<number>>(
    () => new Set(origRefs.map((_, i) => i))
  );

  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);

  // ── 延续模式 ──
  // r2v：保留多参考图+多锚定帧（已有功能）
  // i2v：仅用 1 帧作为首帧，无参考图（新功能）
  const [contMode, setContMode] = useState<ContMode>("r2v");
  const i2vModelId = getI2VVariant(job.modelId);
  const i2vSupported = !!i2vModelId;
  // r2v 延续也可能跨模型 —— 比如源任务是 video-edit，本身没有 r2v 能力，
  // 必须切到同家族的 r2v 模型（happyhorse-1.1-r2v）。已是 r2v 时返回自身。
  const r2vModelId = getR2VVariant(job.modelId) ?? job.modelId;

  // ── extract key frames on mount ──
  useEffect(() => {
    if (!job.videoUrl) { onClose(); return; }
    let alive = true;
    void (async () => {
      try {
        const [kfs, dur] = await Promise.all([
          extractKeyFrames(job.videoUrl!, 3),
          getVideoDuration(job.videoUrl!),
        ]);
        if (!alive) return;
        setKeyFrames(kfs);
        setSelectedFrames(new Set(kfs.map((kf) => kf.label)));
        setVideoDuration(dur);
        setPhase("ready");
      } catch (err) {
        console.error("Key frame extraction failed:", err);
        if (alive) onClose();
      }
    })();
    return () => { alive = false; };
  }, [job.videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── custom frame extraction ──
  const extractCustomFrame = useCallback(async () => {
    if (!job.videoUrl || extracting) return;
    const t = parseFloat(customTime);
    if (isNaN(t) || t < 0 || t > videoDuration) return;

    setExtracting(true);
    try {
      const kf = await extractSingleFrame(job.videoUrl, t);
      // Deduplicate by time
      setKeyFrames((prev) => {
        if (prev.some((f) => f.time === kf.time)) return prev;
        return [...prev, kf];
      });
      setSelectedFrames((prev) => new Set([...prev, kf.label]));
      setCustomTime("");
    } catch (err) {
      console.error("Custom frame extraction failed:", err);
    }
    setExtracting(false);
  }, [job.videoUrl, customTime, videoDuration, extracting]);

  // 切到 i2v 时把帧选择缩成单选（只保留最后一个，通常是用户最近点击的）
  useEffect(() => {
    if (contMode === "i2v" && selectedFrames.size > 1) {
      // 默认保留 "last" 帧（最常用的延续起点）
      const fallback = keyFrames.find((k) => k.label === "last")?.label
        ?? Array.from(selectedFrames)[0];
      setSelectedFrames(new Set([fallback]));
    }
  }, [contMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── toggle helpers ──
  const toggleFrame = useCallback((label: string) => {
    setSelectedFrames((prev) => {
      // i2v 模式下选择即替换（单选行为）
      if (contMode === "i2v") {
        if (prev.has(label) && prev.size === 1) return prev; // 不允许全部清空
        return new Set([label]);
      }
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, [contMode]);

  const toggleAllFrames = useCallback(() => {
    setSelectedFrames((prev) =>
      prev.size === keyFrames.length
        ? new Set()
        : new Set(keyFrames.map((kf) => kf.label))
    );
  }, [keyFrames]);

  const toggleRef = useCallback((idx: number) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllRefs = useCallback(() => {
    setSelectedRefs((prev) =>
      prev.size === origRefs.length
        ? new Set()
        : new Set(origRefs.map((_, i) => i))
    );
  }, [origRefs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── budget calc ──
  const totalSelected = selectedRefs.size + selectedFrames.size;
  const overBudget = totalSelected > 9;

  // ── submit ──
  const submit = useCallback(async () => {
    if (phase !== "ready" || !prompt.trim() || overBudget) return;
    if (contMode === "i2v" && (selectedFrames.size !== 1 || !i2vSupported)) return;
    setPhase("submitted");

    const segPrompt = `（延续上一段画面）${prompt.trim()}`;
    const params: Record<string, unknown> = {
      resolution: job.params.resolution ?? "720P",
      ratio: job.params.ratio ?? "16:9",
      duration,
      watermark: job.params.watermark ?? true,
    };

    // ── i2v 分支：只把一帧当首帧，模型切到 i2v 变体 ──
    if (contMode === "i2v") {
      const firstFrame = keyFrames.find((kf) => selectedFrames.has(kf.label));
      if (!firstFrame) { setPhase("ready"); return; }
      const targetModelId = i2vModelId!;
      const frameName = `cont_first_${firstFrame.label}_${Date.now()}.jpg`;

      // 先建本地 job 记录（带 dataUrl 缩略），UI 立即可见
      const jobId = createJobFromPayload({
        modelId: targetModelId,
        mode: "i2v",
        params,
        media: { img_url: { url: firstFrame.dataUrl, name: frameName, thumbDataUrl: firstFrame.dataUrl } } as Job["media"],
        prompt: segPrompt,
        negativePrompt: job.negativePrompt,
        title: `🎬 ${prompt.trim()}`.slice(0, 60),
      });
      selectJob(jobId);

      try {
        // HappyHorse i2v 必须用 oss:// URL，先把 dataUrl 上传到 OSS
        const m = await uploadDataUrlAsMedia(firstFrame.dataUrl, frameName, targetModelId);
        const ossUrl = m.ossUrl;
        // 更新本地 job 的 img_url 为 oss://，缩略 + 服务端镜像一起带上，
        // 这样后续 reload 在 IDB 没字节时仍可走 localPath 回显。
        setJobStatus(jobId, {
          media: { img_url: { url: ossUrl, name: frameName, thumbDataUrl: firstFrame.dataUrl, localPath: m.localPath } },
        });

        const { taskId } = await submitJobRequest({
          modelId: targetModelId,
          params,
          media: { img_url: { url: ossUrl, name: frameName } } as Job["media"],
          prompt: segPrompt,
          negativePrompt: job.negativePrompt,
        });
        setJobStatus(jobId, { taskId, status: "running" });
      } catch (err) {
        setJobStatus(jobId, {
          status: "error",
          errorMessage: (err as Error)?.message ?? String(err),
        });
      }
      onClose();
      return;
    }

    // ── r2v 分支（默认）：多参考图 + 多锚定帧 ──
    // 原始参考图已是 oss:// —— 全字段透传，避免本地 job 渲染时退化为 OSS 占位符
    type RefItem = { url: string; name?: string; localKey?: string; localPath?: string; thumbDataUrl?: string; mime?: string };
    const origRefUrls: RefItem[] = [];
    for (const idx of Array.from(selectedRefs).sort((a, b) => a - b)) {
      const ref = origRefs[idx];
      if (!ref) continue;
      if (typeof ref === "string") {
        origRefUrls.push({ url: ref });
        continue;
      }
      if (!ref.url) continue;
      origRefUrls.push({
        url: ref.url,
        name: ref.name,
        localKey: ref.localKey,
        localPath: ref.localPath,
        mime: ref.mime,
        thumbDataUrl:
          ref.thumbDataUrl && !ref.thumbDataUrl.startsWith("blob:")
            ? ref.thumbDataUrl
            : undefined,
      });
    }
    // 选中的锚定帧（受 9 张参考图上限约束）
    const pickedFrames = keyFrames
      .filter((kf) => selectedFrames.has(kf.label))
      .slice(0, Math.max(0, 9 - origRefUrls.length));

    // 先建本地 job —— 锚定帧暂用 dataUrl 缩略，UI 立即可见
    const jobId = createJobFromPayload({
      modelId: r2vModelId,
      mode: "r2v",
      params,
      media: {
        reference_urls: [
          ...origRefUrls,
          ...pickedFrames.map((kf) => ({
            url: kf.dataUrl,
            name: `cont_${kf.label}`,
            thumbDataUrl: kf.dataUrl,
          })),
        ],
      } as Job["media"],
      prompt: segPrompt,
      negativePrompt: job.negativePrompt,
      title: `🔗 ${prompt.trim()}`.slice(0, 60),
    });
    selectJob(jobId);

    try {
      // 锚定帧必须先传 OSS —— DashScope/HappyHorse 无法拉取 base64 dataUrl
      const frameRefs: RefItem[] = [];
      for (const kf of pickedFrames) {
        const name = `cont_${kf.label}_${Date.now()}.jpg`;
        const m = await uploadDataUrlAsMedia(kf.dataUrl, name, r2vModelId);
        frameRefs.push({ url: m.ossUrl, name, localPath: m.localPath, thumbDataUrl: kf.dataUrl });
      }
      const referenceUrls = [...origRefUrls, ...frameRefs];
      // 回填本地 job 的 media 为 oss://（保留帧缩略用于预览）
      setJobStatus(jobId, {
        media: {
          reference_urls: [...origRefUrls, ...frameRefs],
        },
      });
      const { taskId } = await submitJobRequest({
        modelId: r2vModelId,
        params,
        media: { reference_urls: referenceUrls },
        prompt: segPrompt,
        negativePrompt: job.negativePrompt,
      });
      setJobStatus(jobId, { taskId, status: "running" });
    } catch (err) {
      setJobStatus(jobId, {
        status: "error",
        errorMessage: (err as Error)?.message ?? String(err),
      });
    }

    onClose();
    // r2vModelId 从 job.modelId derive(line 87),lint 不识别 derive 关系。
    // 显式加进 deps 让闭包始终拿到最新值(r2v 提交分支用 line 280/304/315)
  }, [
    phase, prompt, duration, keyFrames, selectedFrames, selectedRefs,
    origRefs, job, overBudget, contMode, i2vModelId, i2vSupported, r2vModelId,
    createJobFromPayload, setJobStatus, selectJob, onClose,
  ]);

  // ── extracting state ──
  if (phase === "extracting") {
    return (
      <div className="cont-studio">
        <div className="cont-studio-loading">
          {zh ? "⏳ 正在提取锚定帧..." : "⏳ Extracting anchor frames..."}
        </div>
      </div>
    );
  }

  return (
    <div className="cont-studio">
      <div className="cont-studio-header">
        <span className="cont-studio-title">
          {zh ? "🔗 延续生成" : "🔗 Extend video"}
        </span>
        <span className={`cont-studio-budget ${overBudget ? "cont-studio-budget--over" : ""}`}>
          {contMode === "i2v"
            ? `1 frame`
            : `${totalSelected}/9 refs`}
        </span>
        <button
          type="button"
          className="btn-ghost cont-studio-close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* ── Mode toggle: R2V (refs) / I2V (first frame) ── */}
      <div className="cont-studio-mode-toggle">
        <button
          type="button"
          className={`cont-mode-btn ${contMode === "r2v" ? "cont-mode-btn--active" : ""}`}
          onClick={() => setContMode("r2v")}
          title={zh ? "用多张参考图 + 锚定帧延续（连贯性更强）" : "Use multiple refs + frames"}
        >
          🖼️ {zh ? "参考图延续（R2V）" : "Refs + frames (R2V)"}
        </button>
        <button
          type="button"
          className={`cont-mode-btn ${contMode === "i2v" ? "cont-mode-btn--active" : ""}`}
          onClick={() => i2vSupported && setContMode("i2v")}
          disabled={!i2vSupported}
          title={
            i2vSupported
              ? (zh ? "仅用单帧作为首帧生成（动态更自然）" : "Single frame as first frame")
              : (zh ? "当前模型无 I2V 变体" : "No I2V variant for this model")
          }
        >
          🎬 {zh ? "首帧生视频（I2V）" : "First frame (I2V)"}
          {!i2vSupported && <span className="cont-mode-disabled-tag">{zh ? "不支持" : "N/A"}</span>}
        </button>
      </div>

      {contMode === "i2v" && (
        <div className="cont-studio-mode-hint">
          {zh
            ? `📌 将切换到 ${i2vModelId} 模型，只用 1 张选中帧作为首帧；原参考图不会传入`
            : `📌 Will switch to ${i2vModelId}, only the selected frame is used as first frame`}
        </div>
      )}

      {/* ── original reference images — 仅 r2v 显示 ── */}
      {contMode === "r2v" && origRefs.length > 0 && (
        <div className="cont-studio-section">
          <div className="cont-studio-frames-head">
            <span className="cont-studio-frames-label">
              {zh
                ? `原始参考图（${selectedRefs.size}/${origRefs.length}）`
                : `Original refs (${selectedRefs.size}/${origRefs.length})`}
            </span>
            <button
              type="button"
              className="btn-ghost cont-studio-toggle-all"
              onClick={toggleAllRefs}
            >
              {selectedRefs.size === origRefs.length
                ? (zh ? "清除" : "Clear")
                : (zh ? "全选" : "All")}
            </button>
          </div>
          <div className="cont-studio-thumbs">
            {origRefs.map((ref, i) => (
              <AnchorRefThumb
                key={`ref-${i}`}
                media={ref}
                index={i + 1}
                selected={selectedRefs.has(i)}
                onClick={() => toggleRef(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── anchor frames / first frame picker ── */}
      <div className="cont-studio-section">
        <div className="cont-studio-frames-head">
          <span className="cont-studio-frames-label">
            {contMode === "i2v"
              ? (zh ? `选择首帧（单选）` : `Pick first frame (single)`)
              : zh
                ? `锚定帧（${selectedFrames.size}/${keyFrames.length}）`
                : `Anchor frames (${selectedFrames.size}/${keyFrames.length})`}
          </span>
          {contMode === "r2v" && (
            <button
              type="button"
              className="btn-ghost cont-studio-toggle-all"
              onClick={toggleAllFrames}
            >
              {selectedFrames.size === keyFrames.length
                ? (zh ? "清除" : "Clear")
                : (zh ? "全选" : "All")}
            </button>
          )}
        </div>
        <div className="cont-studio-thumbs">
          {keyFrames.map((kf) => {
            const on = selectedFrames.has(kf.label);
            return (
              <div
                key={kf.label}
                className={`cont-studio-thumb ${on ? "cont-studio-thumb--on" : ""}`}
                onClick={() => toggleFrame(kf.label)}
              >
                <img src={kf.dataUrl} alt={kf.label} />
                <span className="cont-studio-thumb-label">
                  {kf.label} · {kf.time}s
                </span>
              </div>
            );
          })}
        </div>

        {/* custom time extraction */}
        <div className="cont-studio-custom-extract">
          <input
            type="number"
            className="cont-studio-time-input"
            placeholder={zh ? "秒数" : "sec"}
            min={0}
            max={videoDuration}
            step={0.1}
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void extractCustomFrame(); }}
          />
          <span className="cont-studio-time-hint">
            / {videoDuration.toFixed(1)}s
          </span>
          <button
            type="button"
            className="btn-ghost cont-studio-extract-btn"
            onClick={extractCustomFrame}
            disabled={extracting || !customTime}
          >
            {extracting
              ? (zh ? "⏳" : "⏳")
              : (zh ? "＋ 提帧" : "＋ Extract")}
          </button>
        </div>
      </div>

      {/* ── prompt + duration ── */}
      <div className="cont-studio-form">
        <div className="cont-studio-dur">
          <label>{zh ? "时长" : "Duration"}</label>
          <input
            type="range"
            min={3}
            max={15}
            step={1}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
          />
          <span>{duration}s</span>
        </div>

        {/* 模板按钮行 — 一键填入常见续写动作 */}
        <div className="cont-studio-tpls">
          <span className="cont-studio-tpls-label">
            {zh ? "💡 快捷模板：" : "💡 Templates:"}
          </span>
          <div className="cont-studio-tpls-row">
            {PROMPT_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                className="cont-studio-tpl-btn"
                title={t.text}
                onClick={() => {
                  // 追加而非覆盖；多个模板叠加用 ; 分隔
                  setPrompt((p) => {
                    const trimmed = p.trim();
                    if (!trimmed) return t.text;
                    return `${trimmed}；${t.text}`;
                  });
                }}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="cont-studio-prompt"
          rows={3}
          placeholder={
            zh
              ? "描述下一段画面：镜头、动作、光线...（可点上方模板快速填入）"
              : "Describe the next shot: camera, action, lighting..."
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          autoFocus
        />

        {/* 源任务 prompt 引用条 */}
        {job.prompt?.trim() && (
          <div className="cont-studio-srcprompt">
            <span className="cont-studio-srcprompt-label">
              {zh ? "📋 源任务 prompt：" : "📋 Source prompt:"}
            </span>
            <span className="cont-studio-srcprompt-text" title={job.prompt}>
              {job.prompt.slice(0, 80)}{job.prompt.length > 80 ? "…" : ""}
            </span>
            <button
              type="button"
              className="cont-studio-srcprompt-use"
              onClick={() => setPrompt(job.prompt || "")}
              title={zh ? "用源 prompt 作为起点" : "Use source as starting point"}
            >
              {zh ? "↪ 引用" : "↪ Use"}
            </button>
          </div>
        )}
      </div>

      {/* ── submit ── */}
      {contMode === "r2v" && overBudget && (
        <div className="cont-studio-warn">
          {zh
            ? `⚠️ 超出 9 张参考图上限，请取消选择 ${totalSelected - 9} 项`
            : `⚠️ Over 9-ref limit, deselect ${totalSelected - 9} items`}
        </div>
      )}
      {contMode === "i2v" && selectedFrames.size !== 1 && (
        <div className="cont-studio-warn">
          {zh ? "⚠️ I2V 模式需要恰好选择 1 帧作为首帧" : "⚠️ I2V requires exactly 1 frame"}
        </div>
      )}
      <button
        type="button"
        className="cont-studio-submit"
        onClick={submit}
        disabled={
          !prompt.trim() || phase === "submitted"
          || (contMode === "r2v" && overBudget)
          || (contMode === "i2v" && selectedFrames.size !== 1)
        }
      >
        {contMode === "i2v"
          ? (zh
              ? `🎬 首帧生视频（${duration}s · 1 帧）`
              : `🎬 First-frame video (${duration}s · 1 frame)`)
          : zh
            ? `🎬 生成下一段（${duration}s · ${totalSelected} 张参考）`
            : `🎬 Generate next (${duration}s · ${totalSelected} refs)`}
      </button>
    </div>
  );
}
