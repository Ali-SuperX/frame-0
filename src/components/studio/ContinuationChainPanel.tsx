"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useStudioStore,
  type Job,
  type JobMedia,
} from "@/lib/store";
import { toast } from "@/components/ui/Dialog";
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

type Props = {
  job: Job;
  zh: boolean;
  onClose: () => void;
};

type KeyFrame = { label: string; dataUrl: string; time: number };

type ChainSeg = {
  id: string;
  prompt: string;
  duration: number;
  status: "idle" | "submitting" | "running" | "done" | "error";
  jobId?: string;
  videoUrl?: string;
  errorMessage?: string;
  /** 本段生成完后的尾帧候选（最后 1.5s 内 3 帧）— A1+A2 智能/手选 */
  tailCandidates?: KeyFrame[];
  /** 用户选中的尾帧 label（用作下段衔接）；默认最后一帧 */
  selectedTailLabel?: string;
};

/** 8 个常用续写模板 */
const PROMPT_TEMPLATES: Array<{ emoji: string; label: string; text: string }> = [
  { emoji: "⏩", label: "继续动作", text: "主体延续上一段动作并自然推进，节奏保持一致" },
  { emoji: "🎬", label: "镜头推近", text: "镜头缓慢推近至主体面部/产品细节，景别从中景过渡到特写" },
  { emoji: "🔭", label: "镜头拉远", text: "镜头快速拉远至全景，露出更多环境信息，主体保持在画面中心" },
  { emoji: "🔄", label: "切换视角", text: "镜头切换到主体的侧面/背后/正面视角，光线方向相应调整" },
  { emoji: "⚡", label: "新元素入画", text: "新主体/道具/光线变化从画面外进入并与主体产生互动" },
  { emoji: "💫", label: "时间流逝", text: "时间流逝感（光线/天色/影子变化），主体姿态保持基本一致" },
  { emoji: "🎭", label: "情绪转变", text: "主体的表情和肢体语言逐渐由克制转向" },
  { emoji: "🛑", label: "停顿收尾", text: "主体动作逐渐放缓直至定格，镜头同步收稳形成 Pack Shot" },
];

/** 软衔接（R2V）专用：把上段尾帧放在 refs 第一位（→ 占据"图1"），prompt
 *  里直接命令"把【图1】作为本段视频的首帧"，让 HappyHorse R2V 把它视为画面
 *  起点而不是普通参考图。比之前那句模糊的"延续上一段最后一秒"约束力强。 */
const CONTINUITY_HINT_R2V =
  "【图1】是上一段视频的最后一帧。请把【图1】完整复刻为本段视频的第一帧（首帧），从该画面无缝接续后续内容 —— 主体姿态、构图、机位、光线方向、色调、服装、场景与风格必须与【图1】严格匹配，禁止重新构图、跳切或改变镜头角度，确保两段拼接处看不出剪辑痕迹。";

/** 切镜模式专用：本段从【新场景/新机位】开始，与上段构成自然剪辑切镜。
 *  主体身份/服装/色调与上段保持一致（靠 anchor refs 锁定），但构图、机位、
 *  景别、光线方向自由变化。营造"电影剪辑感"而非"一镜到底"。
 *
 *  灵感：Seedance 2.0 提示词指南 —— "建议在续写生成视频时以转场切镜的时刻
 *  结尾,下一段视频以结尾切镜后的新场景为起始"。 */
const SCENE_CUT_HINT =
  "切镜衔接：本段从【新场景或新机位】开始，与上一段构成自然的剪辑切换（cut on action / 切景别 / 切机位），而不是一镜到底。主体身份、服装、整体色调与上段保持一致，但构图、机位、景别、光线方向可以自由变化，营造电影剪辑感。无需复刻上段最后一帧。";

const MAX_SEGMENTS = 4;

/** 提取段尾 1.5s 内的 N 个候选帧 — A1 智能选帧基础 */
async function extractTailCandidates(videoUrl: string, count = 3): Promise<KeyFrame[]> {
  const dur = await getVideoDuration(videoUrl).catch(() => 0);
  if (!dur) return [];
  // 最后 1.5s 内（或视频 30%）等距取 count 帧
  const span = Math.min(1.5, dur * 0.3);
  const start = Math.max(0, dur - span);
  const step = count > 1 ? span / (count - 1) : 0;
  const frames: KeyFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = start + step * i;
    try {
      const kf = await extractSingleFrame(videoUrl, t);
      frames.push({ ...kf, label: `tail-${i + 1}` });
    } catch { /* 单帧失败不阻塞 */ }
  }
  return frames;
}

function waitForJob(jobId: string, signal: AbortSignal): Promise<{ videoUrl: string }> {
  return new Promise((resolve, reject) => {
    const initial = useStudioStore.getState().jobs.find((j) => j.id === jobId);
    if (initial?.status === "done" && initial.videoUrl) {
      resolve({ videoUrl: initial.videoUrl });
      return;
    }
    if (initial?.status === "error") {
      reject(new Error(initial.errorMessage || "job failed"));
      return;
    }
    const unsub = useStudioStore.subscribe((state) => {
      const j = state.jobs.find((x) => x.id === jobId);
      if (!j) return;
      if (j.status === "done" && j.videoUrl) {
        unsub();
        resolve({ videoUrl: j.videoUrl });
      } else if (j.status === "error") {
        unsub();
        reject(new Error(j.errorMessage || "job failed"));
      }
    });
    signal.addEventListener("abort", () => {
      unsub();
      reject(new Error("aborted"));
    });
  });
}

export default function ContinuationChainPanel({ job, zh, onClose }: Props) {
  const createJobFromPayload = useStudioStore((s) => s.createJobFromPayload);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const selectJob = useStudioStore((s) => s.selectJob);

  // 起始帧（链式起点）
  const [keyFrames, setKeyFrames] = useState<KeyFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [customTime, setCustomTime] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [framesReady, setFramesReady] = useState(false);

  // 🆕 B1：任务定义（贯穿全局，自动注入每段 prompt）
  const [taskDefinition, setTaskDefinition] = useState("");

  // 🆕 B2：锚点参考图（从源 job 继承的 reference_urls）
  const origRefs: JobMedia[] = Array.isArray(job.media?.reference_urls)
    ? job.media!.reference_urls
    : [];
  const [enabledRefs, setEnabledRefs] = useState<Set<number>>(
    () => new Set(origRefs.map((_, i) => i))
  );

  // 段列表（默认 2 段）—— lazy initializer 避免 render 阶段调 Date.now()
  // (React 19 `react-hooks/purity` 规则:render 必须是纯函数)
  const [segments, setSegments] = useState<ChainSeg[]>(() => [
    { id: `seg-${Date.now()}`, prompt: "", duration: 8, status: "idle" },
    { id: `seg-${Date.now() + 1}`, prompt: "", duration: 8, status: "idle" },
  ]);

  const [chainRunning, setChainRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 🆕 B3：段 2+ 默认 r2v（锚点 refs + 上段尾帧合并），可切硬衔接走 i2v
  const r2vModelId = getR2VVariant(job.modelId);
  const i2vModelId = getI2VVariant(job.modelId);
  const supported = !!r2vModelId;

  // ── 衔接模式 ──
  // soft（默认）：段 2+ 仍走 R2V，上段尾帧塞进 refs[0]，prompt 显式声明
  //   "以【图1】为本段第一帧" —— 比纯软提示约束力强，但仍是组合式生成
  // hard：段 2+ 切到 I2V，上段尾帧 = first_frame（模型硬约束首帧），代价
  //   是 I2V 不接受多 refs，锚点角色靠 task definition 文字保住
  // cut：段 2+ 走 R2V 但**不**塞上段尾帧，prompt 用 SCENE_CUT_HINT 让段间
  //   构成自然剪辑切镜。主体一致靠 anchor refs + task definition。适合武戏、
  //   蒙太奇、节奏快的内容（避免"一镜到底"反而带来的衔接跳变）。
  type ChainMode = "soft" | "hard" | "cut";
  const [chainMode, setChainMode] = useState<ChainMode>("soft");
  const hardSupported = !!i2vModelId;
  const effectiveChainMode: ChainMode =
    chainMode === "hard" && !hardSupported ? "soft" : chainMode;

  // 提取源视频关键帧（链式起点候选）
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
        setSelectedFrame(kfs.at(-1)?.label || kfs[0]?.label || null);
        setVideoDuration(dur);
        setFramesReady(true);
      } catch (err) {
        console.error("Key frame extraction failed:", err);
        if (alive) onClose();
      }
    })();
    return () => { alive = false; };
  }, [job.videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自定义提帧
  const extractCustom = useCallback(async () => {
    if (!job.videoUrl || extracting) return;
    const t = parseFloat(customTime);
    if (isNaN(t) || t < 0 || t > videoDuration) return;
    setExtracting(true);
    try {
      const kf = await extractSingleFrame(job.videoUrl, t);
      setKeyFrames((prev) => (prev.some((f) => f.time === kf.time) ? prev : [...prev, kf]));
      setSelectedFrame(kf.label);
      setCustomTime("");
    } catch (err) {
      console.error("Custom frame extraction failed:", err);
    }
    setExtracting(false);
  }, [job.videoUrl, customTime, videoDuration, extracting]);

  // 段操作
  const addSegment = useCallback(() => {
    setSegments((prev) =>
      prev.length >= MAX_SEGMENTS
        ? prev
        : [...prev, { id: `seg-${Date.now()}`, prompt: "", duration: 8, status: "idle" }]
    );
  }, []);

  const removeSegment = useCallback((id: string) => {
    setSegments((prev) => prev.length > 1 ? prev.filter((s) => s.id !== id) : prev);
  }, []);

  const updateSeg = useCallback((id: string, patch: Partial<ChainSeg>) => {
    setSegments((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const applyTemplate = useCallback((id: string, text: string) => {
    setSegments((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const trimmed = s.prompt.trim();
      return { ...s, prompt: trimmed ? `${trimmed}；${text}` : text };
    }));
  }, []);

  const toggleAnchorRef = useCallback((idx: number) => {
    setEnabledRefs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // 🆕 用户切换段尾帧（只在已 done 的段可用）
  const setSegTail = useCallback((segId: string, label: string) => {
    updateSeg(segId, { selectedTailLabel: label });
  }, [updateSeg]);

  // ── 链式执行 ──
  const runChain = useCallback(async () => {
    if (!selectedFrame || !supported || chainRunning) return;
    const startFrame = keyFrames.find((k) => k.label === selectedFrame);
    if (!startFrame) return;
    if (segments.some((s) => !s.prompt.trim())) {
      toast(zh ? "每段都必须填写 prompt" : "Each segment needs a prompt", "error");
      return;
    }

    setChainRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = {
      resolution: job.params.resolution ?? "720P",
      ratio: job.params.ratio ?? "16:9",
      watermark: job.params.watermark ?? true,
    };

    // 🆕 锚点参考图：从 origRefs 里挑用户启用的，URL 必须是 oss:// 或 https://
    // 必须保留 localKey/localPath/thumbDataUrl —— 否则后续本地 job 渲染时只剩
    // oss:// 浏览器渲染不出来，参考图列表全部退化成 OSS 占位符。
    type AnchorRef = { url: string; name?: string; localKey?: string; localPath?: string; thumbDataUrl?: string; mime?: string };
    const anchorRefs: AnchorRef[] = [];
    for (const idx of Array.from(enabledRefs).sort((a, b) => a - b)) {
      const ref = origRefs[idx];
      if (!ref) continue;
      if (typeof ref === "string") {
        anchorRefs.push({ url: ref });
        continue;
      }
      if (!ref.url) continue;
      anchorRefs.push({
        url: ref.url,
        name: ref.name,
        // 跨 session reload 关键：thumbDataUrl 仅信任 data:/http: 形式
        thumbDataUrl:
          ref.thumbDataUrl && !ref.thumbDataUrl.startsWith("blob:")
            ? ref.thumbDataUrl
            : undefined,
        localKey: ref.localKey,
        localPath: ref.localPath,
        mime: ref.mime,
      });
    }

    // 任务定义前缀（B1）
    const taskPrefix = taskDefinition.trim()
      ? `[任务一致性锚定 · 贯穿全程]\n${taskDefinition.trim()}\n\n`
      : "";

    let prevVideoUrl: string | undefined;
    let prevTailOss: { url: string; name: string } | undefined;

    try {
      for (let i = 0; i < segments.length; i++) {
        if (ctrl.signal.aborted) break;
        const seg = segments[i];
        updateSeg(seg.id, { status: "submitting", errorMessage: undefined });

        // 衔接帧：段 1 = 用户选的起始帧；段 2+ = 上段选中尾帧
        let bridgeFrameDataUrl: string;
        if (i === 0) {
          bridgeFrameDataUrl = startFrame.dataUrl;
        } else {
          if (!prevVideoUrl) throw new Error("missing previous segment video");
          // 用上段 selectedTailLabel 对应的帧；若没设置，重新提取最后一帧
          const prevSeg = segments[i - 1];
          let chosen: KeyFrame | undefined;
          if (prevSeg.tailCandidates && prevSeg.selectedTailLabel) {
            chosen = prevSeg.tailCandidates.find((c) => c.label === prevSeg.selectedTailLabel);
          }
          if (!chosen && prevSeg.tailCandidates?.length) {
            chosen = prevSeg.tailCandidates[prevSeg.tailCandidates.length - 1];
          }
          if (!chosen) {
            // fallback：现场提取最后一帧
            const cands = await extractTailCandidates(prevVideoUrl, 1);
            chosen = cands[0];
          }
          if (!chosen) throw new Error("无法从上段视频提取尾帧");
          bridgeFrameDataUrl = chosen.dataUrl;
        }

        // 上传衔接帧到 OSS（段 1 = 起始帧；段 N≥2 = 上段尾帧）
        const frameName = `chain_seg${i + 1}_bridge_${Date.now()}.jpg`;
        const bridge = await uploadDataUrlAsMedia(bridgeFrameDataUrl, frameName, r2vModelId!);
        const bridgeOssUrl = bridge.ossUrl;
        if (i === 0) prevTailOss = { url: bridgeOssUrl, name: frameName };

        const segPromptCore = seg.prompt.trim();
        // 硬衔接：段 2+ 切 I2V，bridge frame 锁为首帧；段 1 仍走 R2V 让锚点 refs 进场
        const useHardI2V = effectiveChainMode === "hard" && i > 0 && !!i2vModelId;
        // 切镜：段 2+ 走 R2V 但不带上段尾帧，prompt 用 SCENE_CUT_HINT
        const isCutMode = effectiveChainMode === "cut" && i > 0;
        const segModelId = useHardI2V ? i2vModelId! : r2vModelId!;
        const segMode: "r2v" | "i2v" = useHardI2V ? "i2v" : "r2v";

        // refs 排布：
        // - R2V 段 1：起始帧 + 锚点 refs（起始帧为「图1」让 prompt 可锚定）
        // - R2V 段 N≥2 soft：上段尾帧放 refs[0]（→ 占据「图1」），锚点 refs 退后
        // - R2V 段 N≥2 cut：仅锚点 refs（保人物/场景一致），不传 bridge frame
        // - I2V 段 N≥2 hard：bridge 直接作 img_url，锚点 refs 不能传（I2V 不接）
        const bridgeRef: AnchorRef = {
          url: bridgeOssUrl,
          name: frameName,
          thumbDataUrl: bridgeFrameDataUrl,
          localPath: bridge.localPath,
        };
        const allRefs: AnchorRef[] = useHardI2V
          ? []
          : isCutMode
            ? [...anchorRefs]
            : [bridgeRef, ...anchorRefs];

        // 段 prompt 拼装
        const segPrompt = (() => {
          if (useHardI2V) {
            // I2V：模型已硬锁首帧，不需要"图1"语法
            return `${taskPrefix}${segPromptCore}`;
          }
          if (i === 0) {
            return `${taskPrefix}${segPromptCore}`;
          }
          if (isCutMode) {
            // 切镜：放弃首帧延续，靠 anchor refs + 切镜 hint
            return `${taskPrefix}${SCENE_CUT_HINT}\n${segPromptCore}`;
          }
          // R2V 软衔接：尾帧已在 refs[0] = 图1，prompt 显式声明
          return `${taskPrefix}${CONTINUITY_HINT_R2V}\n${segPromptCore}`;
        })();

        // 创建本地 job
        const jobId = createJobFromPayload({
          modelId: segModelId,
          mode: segMode,
          params: { ...params, duration: seg.duration },
          media: useHardI2V
            ? ({
                img_url: {
                  url: bridgeOssUrl,
                  name: frameName,
                  thumbDataUrl: bridgeFrameDataUrl,
                  localPath: bridge.localPath,
                },
              } as Job["media"])
            : ({
                // 直接透传 anchor/bridge 的完整字段 —— url/name/localKey/localPath/
                // mime/thumbDataUrl 一个不丢。这样 reload 后 MediaTile 能从 IDB
                // rehydrate 或退回 localPath 显示，不会再退化成 OSS 占位符。
                reference_urls: allRefs.map((r) => ({
                  url: r.url,
                  name: r.name,
                  mime: r.mime,
                  localKey: r.localKey,
                  localPath: r.localPath,
                  thumbDataUrl: r.thumbDataUrl,
                })),
              } as Job["media"]),
          prompt: segPrompt,
          negativePrompt: job.negativePrompt,
          title: `🔗 段${i + 1} · ${segPromptCore.slice(0, 40)}`,
        });
        updateSeg(seg.id, { jobId });
        if (i === 0) selectJob(jobId);

        // 提交到 DashScope
        const { taskId } = await submitJobRequest({
          modelId: segModelId,
          params: { ...params, duration: seg.duration },
          media: useHardI2V
            ? ({ img_url: { url: bridgeOssUrl, name: frameName } } as Job["media"])
            : ({ reference_urls: allRefs } as Job["media"]),
          prompt: segPrompt,
          negativePrompt: job.negativePrompt,
        });
        setJobStatus(jobId, { taskId, status: "running" });
        updateSeg(seg.id, { status: "running" });

        // 等本段跑完
        const { videoUrl } = await waitForJob(jobId, ctrl.signal);
        prevVideoUrl = videoUrl;

        // 🆕 A1：本段 done 后立刻提取 3 个尾帧候选（用户可手选作为下段衔接）
        const tailCands = await extractTailCandidates(videoUrl, 3);
        updateSeg(seg.id, {
          status: "done",
          videoUrl,
          tailCandidates: tailCands,
          selectedTailLabel: tailCands.at(-1)?.label,
        });
      }
    } catch (err) {
      const errMsg = (err as Error)?.message ?? String(err);
      setSegments((prev) => prev.map((s) =>
        s.status === "submitting" || s.status === "running"
          ? { ...s, status: "error", errorMessage: errMsg }
          : s
      ));
    } finally {
      setChainRunning(false);
      abortRef.current = null;
      void prevTailOss; // 占位
    }
  }, [
    segments, keyFrames, selectedFrame, chainRunning, supported,
    r2vModelId, i2vModelId, effectiveChainMode,
    taskDefinition, enabledRefs, origRefs,
    job, zh, createJobFromPayload, setJobStatus, selectJob, updateSeg,
  ]);

  const cancelChain = useCallback(() => {
    abortRef.current?.abort();
    setChainRunning(false);
  }, []);

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  // ── 渲染 ──
  if (!framesReady) {
    return (
      <div className="cont-studio">
        <div className="cont-studio-loading">
          {zh ? "⏳ 正在提取起始帧..." : "⏳ Extracting key frames..."}
        </div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="cont-studio">
        <div className="cont-studio-header">
          <span className="cont-studio-title">🔗 {zh ? "链式生成" : "Chain mode"}</span>
          <button type="button" className="btn-ghost cont-studio-close" onClick={onClose}>✕</button>
        </div>
        <div className="cont-chain-blocked">
          {zh
            ? `当前模型 ${job.modelId} 没有 R2V 变体，无法做链式生成。请用 happyhorse 系列重生成。`
            : `Model ${job.modelId} has no R2V variant.`}
        </div>
      </div>
    );
  }

  return (
    <div className="cont-studio cont-chain">
      <div className="cont-studio-header">
        <span className="cont-studio-title">
          🔗 {zh ? `链式生成（${segments.length} 段）` : `Chain mode (${segments.length} segs)`}
        </span>
        <span className="cont-chain-total">
          {zh ? `总 ${totalDuration}s` : `${totalDuration}s total`}
        </span>
        <button type="button" className="btn-ghost cont-studio-close" onClick={onClose} disabled={chainRunning}>✕</button>
      </div>

      <div className="cont-chain-hint">
        {effectiveChainMode === "hard"
          ? zh
            ? `🔒 硬衔接：段 1 用 R2V（${r2vModelId}），段 2+ 切 I2V（${i2vModelId}），上段尾帧锁为本段首帧 —— 衔接最稳，但 I2V 不接锚点参考图，靠任务定义保人物`
            : `🔒 Hard: seg 1 R2V (${r2vModelId}), seg 2+ I2V (${i2vModelId}), prev tail = first frame. Tight continuity but I2V drops anchor refs.`
          : effectiveChainMode === "cut"
            ? zh
              ? `✂️ 切镜模式：全部段 R2V（${r2vModelId}），不塞上段尾帧，靠锚点 refs + 切镜 prompt 让段间构成自然剪辑。适合武戏/蒙太奇/快节奏内容（避开"一镜到底"反而导致的跳变）`
              : `✂️ Cut: all R2V (${r2vModelId}); no bridge frame, anchor refs + cut-scene prompt create natural editing rhythm. Best for action/montage/fast-pace.`
            : zh
              ? `📌 软衔接：全部段 R2V（${r2vModelId}），上段尾帧作【图1】塞进 refs，prompt 显式声明"图1为本段首帧"`
              : `📌 Soft: all segments R2V (${r2vModelId}); prev tail injected as ref [图1] with prompt directive.`}
      </div>

      {/* ── 衔接模式开关 ── */}
      <div className="cont-studio-section cont-chain-mode">
        <div className="cont-studio-mode-toggle">
          <button
            type="button"
            className={`cont-studio-mode-btn ${effectiveChainMode === "soft" ? "cont-studio-mode-btn--active" : ""}`}
            onClick={() => !chainRunning && setChainMode("soft")}
            disabled={chainRunning}
            title={zh ? "文戏 / 对话 / 慢推：上段尾帧锁定为本段首帧" : "Drama/dialogue/slow push: prev tail = first frame"}
          >
            🪡 {zh ? "软衔接（文戏）" : "Soft (drama)"}
          </button>
          <button
            type="button"
            className={`cont-studio-mode-btn ${effectiveChainMode === "hard" ? "cont-studio-mode-btn--active" : ""}`}
            onClick={() => !chainRunning && hardSupported && setChainMode("hard")}
            disabled={chainRunning || !hardSupported}
            title={
              hardSupported
                ? zh ? "段 2+ 走 I2V，尾帧硬锁为首帧（衔接最稳）" : "Seg 2+ I2V, prev tail forced as first frame"
                : zh ? "当前模型族无可用 I2V 变体" : "No I2V variant for this model family"
            }
          >
            🔒 {zh ? "硬衔接（一镜到底）" : "Hard (one-take)"}
            {!hardSupported && <span className="cont-mode-disabled-tag">{zh ? "不支持" : "N/A"}</span>}
          </button>
          <button
            type="button"
            className={`cont-studio-mode-btn ${effectiveChainMode === "cut" ? "cont-studio-mode-btn--active" : ""}`}
            onClick={() => !chainRunning && setChainMode("cut")}
            disabled={chainRunning}
            title={zh ? "武戏 / 动作 / 蒙太奇：段间自然切镜，避开「一镜到底」导致的跳变" : "Action/montage/fast-pace: natural cut-scenes between segments"}
          >
            ✂️ {zh ? "切镜（武戏）" : "Cut (action)"}
          </button>
        </div>
      </div>

      {/* ── 🆕 B1：任务定义（贯穿全局） ── */}
      <div className="cont-studio-section">
        <div className="cont-studio-frames-head">
          <span className="cont-studio-frames-label">
            🎯 {zh ? "任务定义（贯穿全段 · 自动注入每段 prompt）" : "Task definition"}
          </span>
        </div>
        <textarea
          className="cont-studio-prompt cont-chain-task"
          rows={2}
          placeholder={zh
            ? "示例：主角是图1 中的 25 岁亚洲女性，长直发，米色风衣；场景：图2 的现代咖啡店；全程保持上述特征一致。"
            : "e.g. Main subject: woman in image 1; scene: cafe in image 2; keep consistent across all segments."
          }
          value={taskDefinition}
          onChange={(e) => setTaskDefinition(e.target.value)}
          disabled={chainRunning}
        />
      </div>

      {/* ── 🆕 B2：锚点参考图（从源 job 继承） ── */}
      {origRefs.length > 0 && (
        <div className="cont-studio-section">
          <div className="cont-studio-frames-head">
            <span className="cont-studio-frames-label">
              📌 {zh
                ? `锚点参考图（${enabledRefs.size}/${origRefs.length}，所有段共享）`
                : `Anchor refs (${enabledRefs.size}/${origRefs.length})`}
            </span>
          </div>
          <div className="cont-studio-thumbs">
            {origRefs.map((ref, i) => (
              <AnchorRefThumb
                key={`anchor-${i}`}
                media={ref}
                index={i + 1}
                selected={enabledRefs.has(i)}
                onClick={() => !chainRunning && toggleAnchorRef(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 起始帧选择 ── */}
      <div className="cont-studio-section">
        <div className="cont-studio-frames-head">
          <span className="cont-studio-frames-label">
            🎬 {zh ? "段 1 起始帧（单选）" : "Seg 1 start frame"}
          </span>
        </div>
        <div className="cont-studio-thumbs">
          {keyFrames.map((kf) => {
            const on = selectedFrame === kf.label;
            return (
              <div
                key={kf.label}
                className={`cont-studio-thumb ${on ? "cont-studio-thumb--on" : ""}`}
                onClick={() => !chainRunning && setSelectedFrame(kf.label)}
              >
                <img src={kf.dataUrl} alt={kf.label} />
                <span className="cont-studio-thumb-label">{kf.label} · {kf.time}s</span>
              </div>
            );
          })}
        </div>
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
            onKeyDown={(e) => { if (e.key === "Enter") void extractCustom(); }}
            disabled={chainRunning}
          />
          <span className="cont-studio-time-hint">/ {videoDuration.toFixed(1)}s</span>
          <button
            type="button"
            className="btn-ghost cont-studio-extract-btn"
            onClick={extractCustom}
            disabled={extracting || !customTime || chainRunning}
          >
            {extracting ? "⏳" : (zh ? "＋ 提帧" : "＋ Extract")}
          </button>
        </div>
      </div>

      {/* ── 段列表 ── */}
      <div className="cont-chain-segs">
        {segments.map((seg, i) => (
          <div key={seg.id} className={`cont-chain-seg cont-chain-seg--${seg.status}`}>
            <div className="cont-chain-seg-head">
              <span className="cont-chain-seg-idx">
                {zh ? `段 ${i + 1}` : `Seg ${i + 1}`}
                {i === 0
                  ? <span className="cont-chain-seg-mode">{zh ? "（起始）" : "(start)"}</span>
                  : <span className="cont-chain-seg-mode">{zh ? "（续上段尾帧 + 锚点）" : "(prev tail + anchors)"}</span>}
              </span>
              <span className="cont-chain-seg-status">
                {seg.status === "submitting" && (zh ? "📤 提交中" : "📤 Submitting")}
                {seg.status === "running" && (zh ? "🎬 生成中" : "🎬 Running")}
                {seg.status === "done" && (zh ? "✓ 完成" : "✓ Done")}
                {seg.status === "error" && (zh ? "✕ 失败" : "✕ Error")}
              </span>
              {!chainRunning && segments.length > 1 && (
                <button
                  type="button"
                  className="cont-chain-seg-rm"
                  onClick={() => removeSegment(seg.id)}
                  title={zh ? "删除此段" : "Remove"}
                >
                  ✕
                </button>
              )}
            </div>

            {/* 模板按钮行 */}
            <div className="cont-chain-tpls">
              {PROMPT_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="cont-studio-tpl-btn"
                  title={t.text}
                  disabled={chainRunning}
                  onClick={() => applyTemplate(seg.id, t.text)}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            <textarea
              className="cont-studio-prompt"
              rows={2}
              placeholder={
                i === 0
                  ? (zh ? "描述段 1 的画面（从起始帧延续）..." : "Describe segment 1...")
                  : (zh ? `描述段 ${i + 1} 的画面（自动续上段）...` : `Describe segment ${i + 1}...`)
              }
              value={seg.prompt}
              onChange={(e) => updateSeg(seg.id, { prompt: e.target.value })}
              disabled={chainRunning && (seg.status === "running" || seg.status === "submitting")}
            />

            <div className="cont-studio-dur">
              <label>{zh ? "时长" : "Duration"}</label>
              <input
                type="range"
                min={3}
                max={15}
                step={1}
                value={seg.duration}
                onChange={(e) => updateSeg(seg.id, { duration: parseInt(e.target.value, 10) })}
                disabled={chainRunning}
              />
              <span>{seg.duration}s</span>
            </div>

            {seg.errorMessage && (
              <div className="cont-chain-seg-err">{seg.errorMessage}</div>
            )}

            {seg.videoUrl && seg.status === "done" && (
              <>
                <video
                  src={seg.videoUrl}
                  className="cont-chain-seg-video"
                  controls
                  muted
                />
                {/* 🆕 A1+A2：尾帧候选选择器（仅当下一段存在且本段已 done） */}
                {i < segments.length - 1 && seg.tailCandidates && seg.tailCandidates.length > 0 && (
                  <div className="cont-chain-seg-tails">
                    <div className="cont-chain-seg-tails-label">
                      🎞 {zh ? "选择尾帧（喂给下一段衔接）：" : "Pick tail frame for next seg:"}
                    </div>
                    <div className="cont-chain-seg-tails-row">
                      {seg.tailCandidates.map((c) => {
                        const on = (seg.selectedTailLabel || seg.tailCandidates!.at(-1)?.label) === c.label;
                        return (
                          <div
                            key={c.label}
                            className={`cont-chain-tail-thumb ${on ? "cont-chain-tail-thumb--on" : ""}`}
                            onClick={() => setSegTail(seg.id, c.label)}
                            title={`${c.label} · ${c.time}s`}
                          >
                            <img src={c.dataUrl} alt={c.label} />
                            <span>{c.time.toFixed(1)}s</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {segments.length < MAX_SEGMENTS && !chainRunning && (
          <button
            type="button"
            className="cont-chain-add"
            onClick={addSegment}
          >
            ＋ {zh ? `添加下一段（最多 ${MAX_SEGMENTS} 段）` : `Add segment (max ${MAX_SEGMENTS})`}
          </button>
        )}
      </div>

      {/* ── 启动 / 取消 ── */}
      <div className="cont-chain-actions">
        {chainRunning ? (
          <button type="button" className="cont-studio-submit cont-studio-submit--cancel" onClick={cancelChain}>
            ■ {zh ? "停止" : "Stop"}
          </button>
        ) : (
          <button
            type="button"
            className="cont-studio-submit"
            onClick={runChain}
            disabled={!selectedFrame || segments.some((s) => !s.prompt.trim())}
          >
            🎬 {zh
              ? `开始链式生成（${segments.length} 段 · 总 ${totalDuration}s${taskDefinition.trim() ? " · 任务锚定 ✓" : ""}${enabledRefs.size > 0 ? ` · ${enabledRefs.size} 锚点` : ""}）`
              : `Run chain (${segments.length} segs · ${totalDuration}s)`}
          </button>
        )}
      </div>
    </div>
  );
}

