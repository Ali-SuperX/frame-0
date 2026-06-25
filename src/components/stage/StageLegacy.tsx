"use client";

/**
 * 片场 (Stage) —— 漫剧/短剧剧本编辑器
 *
 * 双栏布局:
 *   - 左: 剧本(顶部演员阵容 + 风格 + BGM,中部 episode 列表,底部"跳剪辑")
 *   - 右: 实时预览(当前选中 beat 的图/视频 + 旁白可播 + 时间码)
 *
 * 哲学:
 *   - 一个文档 = 一部剧(不切页面)
 *   - 剧本是 source of truth,图/音/视频是派生物
 *   - "组合成集"不是按钮 —— beats 排好就是时间线
 *   - 跳 editor 是高级模式(单向,不回写)
 *
 * MVP(P0):剧本 CRUD + 单 beat 出图 + 单 beat 配音 + 右侧预览。
 * 后续 phase:角色册自动注入 / AI 写剧本 / Ken Burns 关键帧 / 短剧 R2V。
 */

import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStudioStore, type CastBeat, type CastBeatKind, type CastShotType, type Job } from "@/lib/store";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { TTS_VOICES, DEFAULT_TTS_MODEL } from "@/lib/r2v/ttsVoices";
import { episodeToEditorProject } from "@/lib/stage/episodeToEditor";
import { aiWriteBeats } from "@/lib/stage/aiWriter";
import { aiRewriteBeat, type RewriteIntent } from "@/lib/stage/aiRewriter";
import { augmentForExport, rehydrateImported } from "@/lib/stage/stageIO";
import { useJobPolling } from "@/lib/bailian/useJobPolling";
import { storeLocalFile } from "@/lib/editor/localFiles";
import LocaleSwitcher from "../LocaleSwitcher";

type StageMode = CastBeatKind; // alias for clarity

const SHOT_TYPES: { id: CastShotType; zh: string; en: string; emoji: string; group: "motion" | "frame" }[] = [
  /* 运动类 —— 漫剧用,影响 Ken Burns / editor 关键帧 */
  { id: "still", zh: "静帧", en: "Still", emoji: "⏸", group: "motion" },
  { id: "zoom-in", zh: "缓推", en: "Zoom In", emoji: "⊕", group: "motion" },
  { id: "zoom-out", zh: "缓拉", en: "Zoom Out", emoji: "⊖", group: "motion" },
  { id: "pan-lr", zh: "横摇", en: "Pan", emoji: "↔", group: "motion" },
  { id: "parallax", zh: "视差", en: "Parallax", emoji: "≈", group: "motion" },
  { id: "live", zh: "真视频", en: "Live", emoji: "▶", group: "motion" },
  /* 构图类 —— 影响 imagegen 视角语言 */
  { id: "ots", zh: "过肩", en: "OTS", emoji: "👤", group: "frame" },
  { id: "pov", zh: "主观", en: "POV", emoji: "👁", group: "frame" },
  { id: "dutch", zh: "斜角", en: "Dutch", emoji: "◢", group: "frame" },
  { id: "hero", zh: "英雄", en: "Hero", emoji: "★", group: "frame" },
];

/* —— 真实模型 ID(对应 src/lib/bailian/models.ts 的注册条目)——
       行业标准做法:
       · 漫剧出图无 ref → qwen-image-2.0-pro(中英文渲染最强,商用泛用)
       · 漫剧出图有 ref → qwen-image-edit(ref_images 字段,支持图引导)
       · 漫剧/短剧 "已有图 → 视频" → happyhorse-1.1-i2v(单图首帧 + prompt)
       · 短剧 "无图直接出视频(群戏角色一致)" → happyhorse-1.1-r2v
         (reference_urls + prompt 内 character1/character2 按上传顺序指代) */
const IMG_T2I_MODEL = "qwen-image-2.0-pro";   // 纯文生图
const IMG_EDIT_MODEL = "qwen-image-edit";     // 带 ref 的图编辑
const VIDEO_I2V_MODEL = "happyhorse-1.1-i2v"; // 图生视频(单图首帧)
const VIDEO_R2V_MODEL = "happyhorse-1.1-r2v"; // 多角色参考生视频

/** project.aspect → IMG_SIZE 字符串(qwen-image 支持的 size).
 *  漫剧/短剧默认竖版 9:16(投流主流),宽屏走 16:9。 */
function aspectToImgSize(aspect: string): string {
  if (aspect === "9:16") return "720*1280";
  if (aspect === "1:1") return "1024*1024";
  if (aspect === "4:3") return "1280*720"; // 没有 4:3 选项,降级到 16:9
  return "1664*928"; // 16:9 wide,默认
}

export default function Stage() {
  const locale = useLocale();
  const zh = locale === "zh";

  /* —— 一次取齐 store 切片,避免 27 个独立 selector(参考 Editor 经验) —— */
  const {
    project,
    jobs,
    setCastProject,
    castAddEpisode,
    castRemoveEpisode,
    castUpdateEpisode,
    castAddBeat,
    castRemoveBeat,
    castUpdateBeat,
    castAddCharacter,
    castRemoveCharacter,
    castSetStyle,
    editorLoadProject,
  } = useStudioStore(
    useShallow((s) => ({
      project: s.castProject,
      jobs: s.jobs,
      setCastProject: s.setCastProject,
      castAddEpisode: s.castAddEpisode,
      castRemoveEpisode: s.castRemoveEpisode,
      castUpdateEpisode: s.castUpdateEpisode,
      castAddBeat: s.castAddBeat,
      castRemoveBeat: s.castRemoveBeat,
      castUpdateBeat: s.castUpdateBeat,
      castAddCharacter: s.castAddCharacter,
      castRemoveCharacter: s.castRemoveCharacter,
      castSetStyle: s.castSetStyle,
      editorLoadProject: s.editorLoadProject,
    }))
  );

  const router = useRouter();

  /* —— 挂 useJobPolling:R2V 短剧视频生成完会自动更新 Job.videoUrl,
        进而触发 beat thumb / preview 刷新 —— */
  useJobPolling();

  /* —— 当前选中的 episode / beat —— 仅 UI 态,不进 store —— */
  const [selectedEpId, setSelectedEpId] = useState<string>(
    () => project.episodes[0]?.id ?? "ep-1"
  );
  const currentEp = useMemo(
    () =>
      project.episodes.find((e) => e.id === selectedEpId) ??
      project.episodes[0],
    [project.episodes, selectedEpId]
  );

  const [selectedBeatId, setSelectedBeatId] = useState<string | undefined>(
    () => project.episodes[0]?.beats[0]?.id
  );
  const currentBeat = useMemo(
    () => currentEp?.beats.find((b) => b.id === selectedBeatId),
    [currentEp, selectedBeatId]
  );

  /* —— 跳转 nav 用的 hrefs —— */
  const homeHref = zh ? "/" : "/en";
  const editorHref = zh ? "/editor" : "/en/editor";
  const helpHref = zh ? "/help" : "/en/help";

  /* —— 通过 jobId 反查 Job(取 image/video URL) —— */
  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  function beatImageUrl(b: CastBeat): string | undefined {
    if (!b.imageJobId) return;
    const j = jobById.get(b.imageJobId);
    return j?.media?.img_url?.url || j?.media?.ref_images?.[0]?.url;
  }
  function beatVideoUrl(b: CastBeat): string | undefined {
    if (!b.videoJobId) return;
    return jobById.get(b.videoJobId)?.videoUrl;
  }
  function beatVoiceUrl(b: CastBeat): string | undefined {
    if (!b.voiceJobId) return;
    // voiceJobId 是 /api/bailian/tts 返回的 audioUrl(永久 /api/uploads/<sha>.mp3),
    // 直接当 URL 用,不查 jobs
    return b.voiceJobId.startsWith("/api/") ? b.voiceJobId : undefined;
  }

  /* —— 生成: 单 beat busy 态(每种操作独立 kind,UI 上不会串扰)—— */
  type BeatBusyKind = "image" | "voice" | "video" | "rewrite" | undefined;
  const [genBusy, setGenBusy] = useState<Record<string, BeatBusyKind>>({});
  function markBusy(beatId: string, kind: BeatBusyKind) {
    setGenBusy((m) => ({ ...m, [beatId]: kind }));
  }

  /* —— AI 写剧本弹窗 + 批量生成态 + 拖拽 beat 态 + 角色编辑 —— */
  const [aiOpen, setAiOpen] = useState<boolean>(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"image" | "voice" | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  /** 拖拽源 beat 的 idx,目标 idx —— 在 BeatRow 内监听 dragstart/dragover/drop */
  const [dragBeatIdx, setDragBeatIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  /** 整集连播:开关 + 当前播到第几拍(idx) + setTimeout 句柄 */
  const [episodePlaying, setEpisodePlaying] = useState<boolean>(false);
  const epTimerRef = useRef<number | null>(null);
  /** I/O 试播范围(1-based beat idx,null = 用边界)。
   *  快捷键 I/O 在选中 beat 上打标记;clear 清除。 */
  const [rangeIn, setRangeIn] = useState<number | null>(null);
  const [rangeOut, setRangeOut] = useState<number | null>(null);

  function stopEpisode() {
    if (epTimerRef.current !== null) {
      window.clearTimeout(epTimerRef.current);
      epTimerRef.current = null;
    }
    setEpisodePlaying(false);
  }
  /** 当前 episode 的播放范围(I/O 或全集)。返回 1-based [from, to] inclusive。 */
  function getPlayRange(): [number, number] {
    if (!currentEp || currentEp.beats.length === 0) return [1, 0];
    const maxIdx = currentEp.beats.length;
    const from = Math.max(1, Math.min(maxIdx, rangeIn ?? 1));
    const to = Math.max(from, Math.min(maxIdx, rangeOut ?? maxIdx));
    return [from, to];
  }
  function playEpisode() {
    if (!currentEp || currentEp.beats.length === 0) return;
    const [fromIdx, toIdx] = getPlayRange();
    // 当前 beat 在范围内就从这开始;否则从范围起点开始
    let startArrayIdx = currentBeat
      ? currentEp.beats.findIndex((b) => b.id === currentBeat.id)
      : -1;
    const fromArr = fromIdx - 1;
    const toArr = toIdx - 1;
    if (startArrayIdx < fromArr || startArrayIdx > toArr) startArrayIdx = fromArr;
    setEpisodePlaying(true);
    playFrom(startArrayIdx, toArr, currentEp.id);
  }
  /** 递归播下一拍。从 store 最新值读 episode,避免 setTimeout 闭包用 stale currentEp。
   *  capturedEpId 锁定播放开始时的 ep id —— 切 ep 后这个 timer 也不会跨集播错。 */
  function playFrom(beatArrayIdx: number, lastArrayIdx: number, capturedEpId: string) {
    if (beatArrayIdx > lastArrayIdx) {
      stopEpisode();
      return;
    }
    // 实时从 store 读 ep,确保拿到的是最新的 beats(用户中途可能改了 text/时长)
    const liveEp = useStudioStore
      .getState()
      .castProject.episodes.find((e) => e.id === capturedEpId);
    if (!liveEp) {
      stopEpisode();
      return;
    }
    // 如果用户切到别的 ep,停止播放(避免在 stale ep 上继续)
    if (useStudioStore.getState().castProject.episodes.find((e) => e.id === selectedEpId)?.id !== capturedEpId) {
      // 实际 selectedEpId 是 React state,不在 store —— 用 ref 的方式更稳:
      // 这里简化:看 setSelectedBeatId 的 beat 是否还在原 ep 内
    }
    const b = liveEp.beats[beatArrayIdx];
    if (!b) {
      stopEpisode();
      return;
    }
    setSelectedBeatId(b.id);
    const ms = Math.max(800, b.durationSec * 1000);
    epTimerRef.current = window.setTimeout(() => {
      playFrom(beatArrayIdx + 1, lastArrayIdx, capturedEpId);
    }, ms);
  }

  /* —— 切 episode 时清范围 + 停整集播放(范围/播放都是 stage 级 state) —— */
  useEffect(() => {
    setRangeIn(null);
    setRangeOut(null);
    if (epTimerRef.current !== null) {
      window.clearTimeout(epTimerRef.current);
      epTimerRef.current = null;
    }
    setEpisodePlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEpId]);

  /* —— beat 删/重排后 idx 重新编号,
        如果 rangeIn/Out 指向的 idx 不再存在,自动裁剪到边界或清除 —— */
  useEffect(() => {
    if (!currentEp) return;
    const max = currentEp.beats.length;
    if (max === 0) {
      if (rangeIn !== null) setRangeIn(null);
      if (rangeOut !== null) setRangeOut(null);
      return;
    }
    if (rangeIn !== null && rangeIn > max) setRangeIn(null);
    if (rangeOut !== null && rangeOut > max) setRangeOut(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEp?.beats.length]);

  /* —— 快捷键:I 设入点,O 设出点,X 清范围,Space 播停 —— */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 只处理无修饰键
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 弹窗打开时,所有快捷键都不要触发(让用户在弹窗里输入)
      if (aiOpen || editingCharId) return;
      // 输入框/select 内的按键不抢焦
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      // contentEditable 兜底
      if (t?.isContentEditable) return;
      if (!currentBeat || !currentEp) return;
      const idx = currentBeat.idx;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setRangeIn(idx);
        if (rangeOut !== null && rangeOut < idx) setRangeOut(null);
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setRangeOut(idx);
        if (rangeIn !== null && rangeIn > idx) setRangeIn(null);
      } else if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        setRangeIn(null);
        setRangeOut(null);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (episodePlaying) stopEpisode();
        else playEpisode();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentBeat, currentEp, rangeIn, rangeOut, episodePlaying, aiOpen, editingCharId]);
  // 切换 ep 或卸载时停止
  // 组件卸载时清掉定时器(切路由/页面)。
  // 切 ep 的 timer cleanup 已在上面 [selectedEpId] effect 里做,这里只管 unmount。
  useEffect(() => {
    return () => {
      if (epTimerRef.current !== null) {
        window.clearTimeout(epTimerRef.current);
        epTimerRef.current = null;
      }
    };
  }, []);

  async function genImage(beat: CastBeat) {
    if (!currentEp) return;
    markBusy(beat.id, "image");
    try {
      const prompt =
        beat.imagePrompt?.trim() ||
        synthPrompt(beat, project.style.promptSuffix, project.cast);
      if (!prompt) {
        alert(zh ? "请先填一句旁白或画面提示" : "Need narration or image prompt first");
        return;
      }

      // —— 行业标准:角色 ref 始终注入(漫剧关键) ——
      // 取所有有头像的角色 + 风格 ref,优先 speakerId 对应的角色排第一
      const refImages = collectRefImages(beat, project.cast, project.style.refImageUrl);
      const hasRef = refImages.length > 0;

      // 模型选择:有 ref 走 qwen-image-edit,无 ref 走 qwen-image-2.0-pro
      const modelId = hasRef ? IMG_EDIT_MODEL : IMG_T2I_MODEL;
      const size = aspectToImgSize(project.aspect);

      // qwen-image-edit 的 ref 字段是 ref_images(maxCount 3 — 超出截断)
      const refs = refImages.slice(0, 3).map((url, i) => ({
        url,
        name: `ref-${i}.png`,
      }));

      const res = await submitJobRequest({
        modelId,
        params: { size, n: 1, prompt_extend: true, watermark: false },
        media: hasRef ? { ref_images: refs } : {},
        prompt,
      });

      // 同步图模型直接拿 imageUrls,无 taskId
      const url = res.imageUrls?.[0];
      if (url) {
        const jobId = useStudioStore.getState().createJobFromPayload({
          modelId,
          mode: hasRef ? "i2i" : "t2i",
          params: { size, n: 1 },
          media: { img_url: { url, name: `beat-${beat.idx}.png` } },
          prompt,
          title: `[Stage] ${currentEp.title} #${beat.idx}${hasRef ? " (ref)" : ""}`,
        });
        useStudioStore.getState().setJobStatus(jobId, {
          status: "done",
          completedAt: Date.now(),
        });
        castUpdateBeat(currentEp.id, beat.id, { imageJobId: jobId });
      } else if (res.taskId) {
        alert(zh ? "异步出图暂不在 P0 范围,请重试同步模型" : "Async polling not in P0");
      }
    } catch (e) {
      alert((e instanceof Error ? e.message : String(e)));
    } finally {
      markBusy(beat.id, undefined);
    }
  }

  /* —— 生成: 配音 —— 行业标准:多角色按 speakerId 自动切音色 ——
       优先级:beat.speakerId 对应角色的 voiceId → 项目默认全局 voiceId */
  const [voiceId, setVoiceId] = useState<string>(TTS_VOICES[0].id);
  function pickVoiceForBeat(beat: CastBeat): string {
    if (beat.speakerId) {
      const c = project.cast.find((x) => x.id === beat.speakerId);
      if (c?.voiceId) return c.voiceId;
    }
    return voiceId;
  }
  async function genVoice(beat: CastBeat) {
    if (!currentEp) return;
    const text = beat.text.trim();
    if (!text) {
      alert(zh ? "请先写一句旁白" : "Write narration first");
      return;
    }
    markBusy(beat.id, "voice");
    try {
      const chosenVoice = pickVoiceForBeat(beat);
      const res = await fetch("/api/bailian/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: chosenVoice,
          model: DEFAULT_TTS_MODEL,
          languageType: "Auto",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "TTS failed");
      const audioUrl: string = j.audioUrl;
      // 探测音频时长,自动回写 durationSec(留 0.5s 尾音)
      const audio = new Audio(audioUrl);
      audio.addEventListener("loadedmetadata", () => {
        const dur = Number.isFinite(audio.duration) ? audio.duration + 0.5 : 4;
        castUpdateBeat(currentEp.id, beat.id, {
          voiceJobId: audioUrl,
          durationSec: Math.max(2, Math.min(20, dur)),
        });
      });
      // 兜底:如果元数据没加载到,先写 URL,时长保持原值
      castUpdateBeat(currentEp.id, beat.id, { voiceJobId: audioUrl });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(beat.id, undefined);
    }
  }

  /* —— 图 → 视频(i2v):有 beat 图时把图当首帧 + prompt 描述运动 —— */
  async function genVideo(beat: CastBeat) {
    if (!currentEp) return;
    const imageUrl = beatImageUrl(beat);
    if (!imageUrl) {
      alert(
        zh
          ? "i2v 需要先有 beat 图。先 🖼 出图,或者用全集 ⚡ 一键生成"
          : "i2v needs a beat image first. Generate one, or use bulk."
      );
      return;
    }
    markBusy(beat.id, "video");
    try {
      // i2v prompt:beat.text 是台词/旁白,需要扩展成"运动描述"
      // 简单兜底:加上 shotType 对应的运动短语
      const motionHint =
        beat.shotType === "zoom-in" ? ", slow push-in" :
        beat.shotType === "zoom-out" ? ", slow pull-out" :
        beat.shotType === "pan-lr" ? ", slow pan left to right" :
        beat.shotType === "parallax" ? ", subtle parallax motion" :
        ", subtle natural motion";
      const videoPrompt = (beat.text || synthPrompt(beat, project.style.promptSuffix)) + motionHint;

      // i2v 用真实可用的画幅(720P) + 时长(5-10s)
      const aspectRatio = project.aspect === "9:16" ? "9:16" : project.aspect === "1:1" ? "1:1" : "16:9";
      const duration = Math.max(5, Math.min(10, Math.round(beat.durationSec)));

      const res = await submitJobRequest({
        modelId: VIDEO_I2V_MODEL,
        params: {
          resolution: "720P",
          ratio: aspectRatio,
          duration,
          prompt_extend: true,
          watermark: false,
        },
        media: { img_url: { url: imageUrl, name: `beat-${beat.idx}.png` } },
        prompt: videoPrompt,
      });
      if (res.taskId) {
        const jobId = useStudioStore.getState().createJobFromPayload({
          modelId: VIDEO_I2V_MODEL,
          mode: "i2v",
          params: { resolution: "720P", ratio: aspectRatio, duration },
          media: { img_url: { url: imageUrl, name: `beat-${beat.idx}.png` } },
          prompt: videoPrompt,
          title: `[Stage] ${currentEp.title} #${beat.idx} → video`,
        });
        useStudioStore.getState().setJobStatus(jobId, {
          status: "running",
          taskId: res.taskId,
        });
        castUpdateBeat(currentEp.id, beat.id, {
          videoJobId: jobId,
          kind: "short",
          durationSec: duration, // 视频时长可能跟 TTS 不同步,这里以视频实际值为准
        });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(beat.id, undefined);
    }
  }

  /* —— 群戏 R2V:无图,直接从角色 ref 生视频(行业高级用法) ——
     用 cast 头像作为 reference_urls,prompt 内自动把角色名替换成 character1/2/...
     适用场景:漫剧高潮拍想直接出动态多角色镜头 */
  async function genVideoFromCast(beat: CastBeat) {
    if (!currentEp) return;
    const withRefs = project.cast.filter((c) => c.refImageUrl);
    if (withRefs.length === 0) {
      alert(
        zh
          ? "R2V 群戏模式需要角色册里至少有 1 个带头像的角色"
          : "R2V needs at least 1 character with avatar"
      );
      return;
    }
    markBusy(beat.id, "video");
    try {
      // prompt 改写:把角色名替换成 character1/character2/... 按 cast 顺序。
      // 关键:按角色名长度倒序替换 —— 否则 "小米" + "米" 两个角色时,
      // 先替换 "米" 会破坏 "小米"。
      let rewritten = beat.text || synthPrompt(beat, project.style.promptSuffix);
      const sortedByLen = withRefs
        .map((c, i) => ({ c, tag: `character${i + 1}` }))
        .sort((a, b) => b.c.name.length - a.c.name.length);
      for (const { c, tag } of sortedByLen) {
        rewritten = rewritten.split(c.name).join(tag);
      }

      const aspectRatio = project.aspect === "9:16" ? "9:16" : project.aspect === "1:1" ? "1:1" : "16:9";
      const duration = Math.max(5, Math.min(10, Math.round(beat.durationSec)));

      const refUrls = withRefs.slice(0, 9).map((c, i) => ({
        url: c.refImageUrl!,
        name: `character${i + 1}.png`,
      }));

      const res = await submitJobRequest({
        modelId: VIDEO_R2V_MODEL,
        params: {
          resolution: "720P",
          ratio: aspectRatio,
          duration,
          watermark: false,
        },
        media: { reference_urls: refUrls },
        prompt: rewritten,
      });
      if (res.taskId) {
        const jobId = useStudioStore.getState().createJobFromPayload({
          modelId: VIDEO_R2V_MODEL,
          mode: "r2v",
          params: { resolution: "720P", ratio: aspectRatio, duration },
          media: { reference_urls: refUrls },
          prompt: rewritten,
          title: `[Stage] ${currentEp.title} #${beat.idx} → R2V`,
        });
        useStudioStore.getState().setJobStatus(jobId, {
          status: "running",
          taskId: res.taskId,
        });
        castUpdateBeat(currentEp.id, beat.id, {
          videoJobId: jobId,
          kind: "short",
          durationSec: duration,
        });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(beat.id, undefined);
    }
  }

  /* —— 批量生成:整集一键出图 + 配音 ——
     扫描当前 episode,凡是无 image 的 beat 串行 genImage,
     无 voice 的 beat 再串行 genVoice。
     串行而非并行:imagegen API 有并发限制,避免被限流。
     守卫:每轮 await 后从 store 重新校验 ep 是否还存在(防被删) */
  async function bulkGenerate() {
    if (!currentEp) return;
    if (currentEp.beats.length === 0) {
      alert(zh ? "先加几拍" : "Add beats first");
      return;
    }
    const needsImage = currentEp.beats.filter((b) => !beatImageUrl(b));
    const needsVoice = currentEp.beats.filter((b) => b.text.trim() && !beatVoiceUrl(b));
    if (needsImage.length === 0 && needsVoice.length === 0) {
      alert(zh ? "本集所有拍都已经有图和音了" : "All beats already have image + voice");
      return;
    }
    const ok = confirm(
      zh
        ? `即将串行生成:${needsImage.length} 张图 + ${needsVoice.length} 段配音。可能耗时几分钟,继续?`
        : `Will generate: ${needsImage.length} images + ${needsVoice.length} voiceovers. May take minutes. Continue?`
    );
    if (!ok) return;

    const targetEpId = currentEp.id; // 锁住目标 ep,避免误写
    const isEpAlive = () =>
      useStudioStore.getState().castProject.episodes.some((e) => e.id === targetEpId);

    // 阶段 1:图
    setBulkBusy("image");
    setBulkProgress({ done: 0, total: needsImage.length });
    for (let i = 0; i < needsImage.length; i++) {
      if (!isEpAlive()) {
        console.warn("[stage bulk] target episode removed, aborting image phase");
        break;
      }
      try {
        await genImage(needsImage[i]);
      } catch (e) {
        console.error("[stage bulk image]", e);
      }
      setBulkProgress({ done: i + 1, total: needsImage.length });
    }

    // 阶段 2:音
    setBulkBusy("voice");
    setBulkProgress({ done: 0, total: needsVoice.length });
    for (let i = 0; i < needsVoice.length; i++) {
      if (!isEpAlive()) {
        console.warn("[stage bulk] target episode removed, aborting voice phase");
        break;
      }
      try {
        await genVoice(needsVoice[i]);
      } catch (e) {
        console.error("[stage bulk voice]", e);
      }
      setBulkProgress({ done: i + 1, total: needsVoice.length });
    }

    setBulkBusy(null);
    setBulkProgress({ done: 0, total: 0 });
  }

  /* —— 用户上传图(角色头像 / beat 图 / 风格 ref 三处共用) ——
     file → IDB(跨 session 保活) + blob URL(本 session 即用)。
     返回 { url, localKey, mime }。
     注意:blob URL 会在 page reload 后失效,但 localKey 可以让我们重建 —— Stage 未做 IDB rehydrate,
     这是 P1 范围(用户刷新后图片会 broken,但 jobs 持久化的 URL 仍可用,所以"AI 出图"不受影响)。 */
  async function uploadImageFile(
    file: File,
    keyPrefix: string
  ): Promise<{ url: string; localKey: string; mime: string }> {
    const key = `${keyPrefix}-${Date.now()}-${file.name}`;
    await storeLocalFile(key, file);
    const url = URL.createObjectURL(file);
    return { url, localKey: key, mime: file.type || "image/png" };
  }

  /** 用户上传图 → 创建 done 状态的 image Job → 绑到 beat.imageJobId。
   *  这样下游 genVideo / episodeToEditorProject 完全复用 AI 出图链路。 */
  async function uploadBeatImage(beat: CastBeat, file: File) {
    if (!currentEp) return;
    markBusy(beat.id, "image");
    try {
      const { url, localKey, mime } = await uploadImageFile(file, `beat-${beat.id}`);
      const jobId = useStudioStore.getState().createJobFromPayload({
        modelId: "manual-upload", // 标记为手动上传,跟 AI 出图区分
        mode: "t2i",
        params: {},
        media: {
          img_url: { url, name: file.name, localKey, mime },
        },
        prompt: beat.text || "(user-uploaded)",
        title: `[Stage] ${currentEp.title} #${beat.idx} (上传)`,
      });
      useStudioStore.getState().setJobStatus(jobId, {
        status: "done",
        completedAt: Date.now(),
      });
      castUpdateBeat(currentEp.id, beat.id, { imageJobId: jobId });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(beat.id, undefined);
    }
  }

  /** 角色头像上传 → 直接写 refImageUrl/refLocalKey 到 character */
  async function uploadCharRef(charId: string, file: File) {
    try {
      const { url, localKey } = await uploadImageFile(file, `char-${charId}`);
      useStudioStore.getState().castUpdateCharacter(charId, {
        refImageUrl: url,
        refLocalKey: localKey,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  /** 风格 ref 上传 */
  async function uploadStyleRef(file: File) {
    try {
      const { url, localKey } = await uploadImageFile(file, "style-ref");
      castSetStyle({ refImageUrl: url, refLocalKey: localKey });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  /* —— AI 改写单 beat —— intent 是预设,custom 走自定义 prompt —— */
  async function rewriteBeat(beat: CastBeat, intent: RewriteIntent) {
    if (!currentEp) return;
    if (!beat.text.trim()) {
      alert(zh ? "请先写一句原文再改写" : "Write some text first");
      return;
    }
    let custom: string | undefined;
    if (intent === "custom") {
      const ans = prompt(zh ? "改写指令(如:换成第一人称)" : "Rewrite instruction (e.g. switch to first-person)");
      if (!ans?.trim()) return;
      custom = ans.trim();
    }
    markBusy(beat.id, "rewrite");
    try {
      const r = await aiRewriteBeat({
        text: beat.text,
        kind: project.kind,
        intent,
        customInstruction: custom,
      });
      const patch: Partial<CastBeat> = { text: r.text };
      if (r.shotType) patch.shotType = r.shotType;
      castUpdateBeat(currentEp.id, beat.id, patch);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(beat.id, undefined);
    }
  }

  /* —— AI 写剧本提交 ——
     接受 premise + numBeats,调 LLM,把返回的 beats 批量塞进当前 episode。
     speakerName 反查 cast.id,没找到就不设。 */
  const [aiBusy, setAiBusy] = useState<boolean>(false);
  async function submitAiWrite(premise: string, numBeats: number) {
    if (!currentEp) return;
    if (!premise.trim()) {
      alert(zh ? "请写一句剧情" : "Write a premise");
      return;
    }
    setAiBusy(true);
    try {
      const result = await aiWriteBeats({
        premise: premise.trim(),
        kind: project.kind,
        numBeats,
        cast: project.cast,
        styleHint: project.style.promptSuffix,
      });
      // 把 LLM 返回的 beats 批量加入
      for (const draft of result.beats) {
        // speakerName → speakerId 反查
        const speaker = project.cast.find((c) => c.name === draft.speakerName);
        castAddBeat(currentEp.id, {
          text: draft.text,
          shotType: draft.shotType,
          imagePrompt: draft.imagePrompt,
          durationSec: draft.durationSec,
          speakerId: speaker?.id,
        });
      }
      setAiOpen(false);
      if (result.synopsis) {
        setTimeout(
          () => alert((zh ? "已生成 " : "Generated ") + result.beats.length + (zh ? " 拍。剧情:" : " beats. Synopsis: ") + result.synopsis),
          100
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  /* —— UI —— */
  return (
    <div className="stage-app">
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0 <b>STAGE</b>
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right">
          <Link prefetch={false} href={helpHref} className="chrome-icon" title={zh ? "帮助" : "Help"}>?</Link>
          <LocaleSwitcher />
        </div>
      </header>

      <main className="stage-main">
        {/* —— 顶部:项目名 + 模式切换 + 演员 + 风格 + BGM —— */}
        <div className="stage-top">
          <input
            className="stage-title"
            value={project.name}
            onChange={(e) => setCastProject({ name: e.target.value })}
            placeholder={zh ? "未命名剧本" : "Untitled Script"}
          />
          <div className="stage-mode-seg" role="tablist">
            <button
              className={`mode-pill${project.kind === "comic" ? " on" : ""}`}
              onClick={() => setCastProject({ kind: "comic" })}
              title={zh ? "漫剧:静态图 + 旁白 + Ken Burns" : "Comic: still + narration"}
            >
              {zh ? "漫剧" : "Comic"}
            </button>
            <button
              className={`mode-pill${project.kind === "short" ? " on" : ""}`}
              onClick={() => setCastProject({ kind: "short" })}
              title={zh ? "短剧:每拍出视频 + 对白" : "Short drama: per-beat video"}
            >
              {zh ? "短剧" : "Short"}
            </button>
          </div>

          <div className="stage-cast">
            <span className="cast-label">{zh ? "演员" : "Cast"}</span>
            {project.cast.length === 0 ? (
              <span className="cast-empty">{zh ? "暂无" : "none"}</span>
            ) : (
              project.cast.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`cast-chip${c.refImageUrl ? " has-ref" : ""}`}
                  style={{ borderColor: c.color, color: c.color }}
                  title={
                    zh
                      ? `点击编辑角色 · ${c.name}${c.voiceId ? " · " + c.voiceId : " · 未配音色"}`
                      : `Click to edit · ${c.name}${c.voiceId ? " · " + c.voiceId : " · no voice"}`
                  }
                  onClick={() => setEditingCharId(c.id)}
                >
                  {c.refImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.refImageUrl} alt="" className="cast-avatar" />
                  ) : (
                    <span className="cast-dot" style={{ background: c.color }} />
                  )}
                  <span className="cast-name">{c.name}</span>
                  {c.voiceId && <span className="cast-voice-dot" title={c.voiceId}>🎙</span>}
                </button>
              ))
            )}
            <button
              className="cast-add"
              onClick={() => {
                const name = prompt(zh ? "角色名字" : "Character name");
                if (name?.trim()) castAddCharacter({ name: name.trim() });
              }}
              title={zh ? "添加角色 · 点已有角色芯片可上传头像" : "Add character · click chip to upload avatar"}
            >
              +
            </button>
          </div>

          <div className="stage-style">
            <span className="style-label">{zh ? "风格" : "Style"}</span>
            <input
              className="style-input"
              placeholder={zh ? "如:日漫,水彩,赛博朋克..." : "e.g. anime, watercolor, cyberpunk..."}
              value={project.style.promptSuffix ?? ""}
              onChange={(e) => castSetStyle({ promptSuffix: e.target.value })}
            />
            <label
              className={`style-ref-btn${project.style.refImageUrl ? " has-ref" : ""}`}
              title={zh ? "上传风格参考图" : "Upload style reference image"}
            >
              {project.style.refImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.style.refImageUrl} alt="" />
              ) : (
                "📎"
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadStyleRef(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="stage-voice">
            <span className="voice-label">{zh ? "默认音色" : "Voice"}</span>
            <select
              className="voice-select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              {TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {zh ? v.zh : v.id} · {v.desc}
                </option>
              ))}
            </select>
          </div>

          <div className="stage-top-spacer" />

          {/* —— 剧本导入导出(轻量,放在按钮组左边) —— */}
          <button
            className="stage-io-btn"
            onClick={() => {
              // 导出 = augment 后序列化:把每 beat 的图/音/视频 URL 嵌进 JSON,
              // 跨机器导入也能立刻播
              const augmented = augmentForExport(project, jobById);
              const blob = new Blob(
                [JSON.stringify(augmented, null, 2)],
                { type: "application/json" }
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.name || "untitled"}.script.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            title={zh ? "导出剧本 JSON(含图/音/视频 URL)" : "Export script JSON (with media URLs)"}
          >
            ⬇
          </button>
          <label
            className="stage-io-btn"
            title={zh ? "从 JSON 导入剧本(替换当前)" : "Import script from JSON (replaces current)"}
          >
            ⬆
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = "";
                const r = new FileReader();
                r.onload = () => {
                  try {
                    const parsedRaw = JSON.parse(String(r.result));
                    if (!parsedRaw.episodes || !Array.isArray(parsedRaw.episodes)) {
                      throw new Error(zh ? "不是有效的剧本 JSON" : "Not a valid script JSON");
                    }
                    if (!confirm(
                      zh
                        ? "导入将替换当前剧本,确定?"
                        : "Import will replace current script. Confirm?"
                    )) return;
                    // 重建嵌入的媒体 Job —— 即使 jobs 表是空的,beat 也能播
                    const rehydrated = rehydrateImported(parsedRaw);
                    setCastProject(rehydrated);
                    setSelectedEpId(rehydrated.episodes[0]?.id ?? "ep-1");
                    setSelectedBeatId(rehydrated.episodes[0]?.beats?.[0]?.id);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : String(err));
                  }
                };
                r.readAsText(f);
              }}
            />
          </label>

          {/* —— 自动化按钮组:AI 写剧本 / 全集出图 / 全集配音 —— */}
          <button
            className="stage-ai-btn"
            onClick={() => setAiOpen(true)}
            title={zh ? "AI 写剧本:一句话 → N 拍" : "AI Writer: one line → N beats"}
          >
            ✨ {zh ? "AI 写剧本" : "AI Writer"}
          </button>
          <button
            className="stage-bulk-btn"
            onClick={bulkGenerate}
            disabled={bulkBusy !== null}
            title={zh ? "整集一键出图 + 配音(跳过已生成的)" : "Bulk gen image + voice for this episode"}
          >
            {bulkBusy
              ? zh
                ? `${bulkBusy} ${bulkProgress.done}/${bulkProgress.total}`
                : `${bulkBusy} ${bulkProgress.done}/${bulkProgress.total}`
              : zh
              ? "⚡ 整集一键生成"
              : "⚡ Bulk Generate"}
          </button>
        </div>

        {/* —— 主体:左剧本 + 右预览 —— */}
        <div className="stage-grid">
          {/* 左 —— 剧本 */}
          <section className="stage-script">
            {/* episode tabs */}
            <div className="ep-tabs">
              {project.episodes.map((ep) => (
                <button
                  key={ep.id}
                  className={`ep-tab${ep.id === selectedEpId ? " on" : ""}`}
                  onClick={() => {
                    setSelectedEpId(ep.id);
                    setSelectedBeatId(ep.beats[0]?.id);
                  }}
                  onDoubleClick={() => {
                    const t = prompt(zh ? "重命名集" : "Rename episode", ep.title);
                    if (t?.trim()) castUpdateEpisode(ep.id, { title: t.trim() });
                  }}
                >
                  <b>EP{ep.num}</b> {ep.title}
                  <span className="ep-count">{ep.beats.length}</span>
                </button>
              ))}
              <button
                className="ep-add"
                onClick={() => {
                  const id = castAddEpisode();
                  setSelectedEpId(id);
                  setSelectedBeatId(undefined);
                }}
              >
                + {zh ? "新集" : "New episode"}
              </button>
              {project.episodes.length > 1 && (
                <button
                  className="ep-del"
                  onClick={() => {
                    if (!currentEp) return;
                    if (confirm(zh ? `删除 ${currentEp.title}?` : `Delete ${currentEp.title}?`)) {
                      const removedId = currentEp.id;
                      castRemoveEpisode(removedId);
                      // 从 store 读最新 episodes(避免 stale closure 指回被删 ep)
                      const next = useStudioStore
                        .getState()
                        .castProject.episodes.filter((e) => e.id !== removedId)[0];
                      setSelectedEpId(next?.id ?? "");
                      setSelectedBeatId(next?.beats[0]?.id);
                    }
                  }}
                  title={zh ? "删除当前集" : "Delete current episode"}
                >
                  ✕
                </button>
              )}
            </div>

            {/* —— I/O 范围条 —— 显示当前试播范围,有快捷键 I/O/X */}
            {currentEp && currentEp.beats.length > 0 && (
              <div className="ep-range-bar">
                <span className="ep-range-label">
                  {zh ? "试播范围" : "Range"}
                </span>
                <span className={`ep-range-pill${rangeIn !== null ? " set" : ""}`}>
                  {zh ? "入" : "I"}
                  <b>{rangeIn ?? "—"}</b>
                </span>
                <span className="ep-range-sep">→</span>
                <span className={`ep-range-pill${rangeOut !== null ? " set" : ""}`}>
                  {zh ? "出" : "O"}
                  <b>{rangeOut ?? "—"}</b>
                </span>
                <span className="ep-range-spacer" />
                {(rangeIn !== null || rangeOut !== null) && (
                  <button
                    className="ep-range-clear"
                    onClick={() => {
                      setRangeIn(null);
                      setRangeOut(null);
                    }}
                    title={zh ? "清除范围(快捷键 X)" : "Clear range (X)"}
                  >
                    ✕ {zh ? "清除" : "Clear"}
                  </button>
                )}
                <span className="ep-range-hint">
                  {zh
                    ? "选中拍后按 I 设入 / O 设出 / X 清 / Space 播停"
                    : "Select beat then I=in · O=out · X=clear · Space=play"}
                </span>
              </div>
            )}

            {/* beat list */}
            <div className="beats">
              {currentEp?.beats.length === 0 ? (
                <div className="beats-empty">
                  <div className="empty-title">{zh ? "开始写第一拍" : "Write your first beat"}</div>
                  <div className="empty-sub">
                    {zh ? "每拍 = 一句旁白 + 一张画面 + 2-6 秒" : "Each beat = one line + one image + 2-6s"}
                  </div>
                </div>
              ) : (
                currentEp?.beats.map((b) => (
                  <BeatRow
                    key={b.id}
                    beat={b}
                    selected={b.id === selectedBeatId}
                    busy={genBusy[b.id]}
                    zh={zh}
                    imageUrl={beatImageUrl(b)}
                    videoUrl={beatVideoUrl(b)}
                    voiceUrl={beatVoiceUrl(b)}
                    isRangeIn={rangeIn === b.idx}
                    isRangeOut={rangeOut === b.idx}
                    outOfRange={
                      (rangeIn !== null && b.idx < rangeIn) ||
                      (rangeOut !== null && b.idx > rangeOut)
                    }
                    onSelect={() => setSelectedBeatId(b.id)}
                    onTextChange={(text) =>
                      currentEp && castUpdateBeat(currentEp.id, b.id, { text })
                    }
                    onShotChange={(shotType) =>
                      currentEp && castUpdateBeat(currentEp.id, b.id, { shotType })
                    }
                    onGenImage={() => genImage(b)}
                    onGenVoice={() => genVoice(b)}
                    onGenVideo={() => genVideo(b)}
                    onGenVideoR2V={() => genVideoFromCast(b)}
                    canR2V={project.cast.some((c) => c.refImageUrl)}
                    onUploadImage={(f) => uploadBeatImage(b, f)}
                    onRewrite={(intent) => rewriteBeat(b, intent)}
                    onDelete={() => {
                      if (!currentEp) return;
                      if (confirm(zh ? "删除这一拍?" : "Delete this beat?")) {
                        castRemoveBeat(currentEp.id, b.id);
                      }
                    }}
                    onDragStart={() => setDragBeatIdx(b.idx)}
                    onDragOver={() => setDragOverIdx(b.idx)}
                    onDrop={() => {
                      if (
                        currentEp &&
                        dragBeatIdx !== null &&
                        dragBeatIdx !== b.idx
                      ) {
                        // store action 内部会重新编号
                        useStudioStore
                          .getState()
                          .castMoveBeat(currentEp.id, dragBeatIdx, b.idx);
                      }
                      setDragBeatIdx(null);
                      setDragOverIdx(null);
                    }}
                    dragging={dragBeatIdx === b.idx}
                    dragOver={dragOverIdx === b.idx && dragBeatIdx !== b.idx}
                  />
                ))
              )}
              <button
                className="beat-add"
                onClick={() => {
                  if (!currentEp) return;
                  const id = castAddBeat(currentEp.id);
                  setSelectedBeatId(id);
                }}
              >
                + {zh ? "加一拍" : "Add beat"}
              </button>
            </div>

            {/* 跳剪辑 —— 拼集 → 灌 editorProject → 跳 /editor */}
            <div className="stage-foot">
              <button
                type="button"
                className="to-editor"
                title={
                  zh
                    ? "把整集 beats 拼成时间线,跳到剪辑器精修(单向,不回写)"
                    : "Compose episode into timeline, open in editor (one-way)"
                }
                disabled={!currentEp || currentEp.beats.length === 0}
                onClick={() => {
                  if (!currentEp) return;
                  if (currentEp.beats.length === 0) {
                    alert(zh ? "先加几拍吧" : "Add some beats first");
                    return;
                  }
                  const { project: editorProj, stats } = episodeToEditorProject(
                    currentEp,
                    project,
                    jobById,
                    // 遵守 I/O 范围:有范围就只拼范围内的 beat
                    rangeIn !== null || rangeOut !== null
                      ? { in: rangeIn, out: rangeOut }
                      : undefined
                  );
                  if (stats.ok === 0) {
                    alert(
                      zh
                        ? "没有任何一拍生成了画面,先点 🖼 出几张图再来"
                        : "No beat has an image yet. Generate at least one."
                    );
                    return;
                  }
                  editorLoadProject(editorProj);
                  if (stats.skipped > 0) {
                    const idxs = stats.skippedIdxs.join(", ");
                    const msg = zh
                      ? `已拼 ${stats.ok} 拍 (${stats.withVoice} 配音)。跳过 ${stats.skipped} 拍(无画面):#${idxs}`
                      : `Composed ${stats.ok} beats (${stats.withVoice} voiced). Skipped ${stats.skipped} (no image): #${idxs}`;
                    // 用 setTimeout 让 alert 不阻塞 router.push
                    setTimeout(() => alert(msg), 50);
                  }
                  router.push(editorHref);
                }}
              >
                {zh ? "拼集 → 跳剪辑器 →" : "Compose → Editor →"}
              </button>
              <div className="foot-stat">
                {zh
                  ? `${currentEp?.beats.length ?? 0} 拍 · 预估 ${Math.round(
                      (currentEp?.beats.reduce((s, b) => s + b.durationSec, 0) ?? 0) * 10
                    ) / 10}s`
                  : `${currentEp?.beats.length ?? 0} beats · est. ${Math.round(
                      (currentEp?.beats.reduce((s, b) => s + b.durationSec, 0) ?? 0) * 10
                    ) / 10}s`}
              </div>
            </div>
          </section>

          {/* 右 —— 实时预览 */}
          <section className="stage-preview">
            <PreviewPane
              zh={zh}
              beat={currentBeat}
              imageUrl={currentBeat ? beatImageUrl(currentBeat) : undefined}
              videoUrl={currentBeat ? beatVideoUrl(currentBeat) : undefined}
              voiceUrl={currentBeat ? beatVoiceUrl(currentBeat) : undefined}
              aspect={project.aspect}
              episodePlaying={episodePlaying}
              currentBeatPosition={
                currentBeat && currentEp
                  ? currentEp.beats.findIndex((b) => b.id === currentBeat.id) + 1
                  : 0
              }
              totalBeats={currentEp?.beats.length ?? 0}
              onPlayEpisode={playEpisode}
              onStopEpisode={stopEpisode}
            />
          </section>
        </div>
      </main>

      {/* —— AI 写剧本 弹窗 —— */}
      {aiOpen && (
        <AiWriterModal
          zh={zh}
          kind={project.kind}
          castNames={project.cast.map((c) => c.name)}
          busy={aiBusy}
          onSubmit={submitAiWrite}
          onClose={() => setAiOpen(false)}
        />
      )}

      {/* —— 角色编辑弹窗 —— */}
      {editingCharId && (() => {
        const c = project.cast.find((x) => x.id === editingCharId);
        if (!c) return null;
        return (
          <CharacterEditor
            zh={zh}
            character={c}
            onChange={(patch) =>
              useStudioStore.getState().castUpdateCharacter(c.id, patch)
            }
            onUploadAvatar={(f) => uploadCharRef(c.id, f)}
            onDelete={() => {
              if (confirm(zh ? `删除角色 "${c.name}"?` : `Delete "${c.name}"?`)) {
                castRemoveCharacter(c.id);
                setEditingCharId(null);
              }
            }}
            onClose={() => setEditingCharId(null)}
          />
        );
      })()}

      <StageStyles />
    </div>
  );
}

/* ─────────── 子组件: Beat 行 ─────────── */

function BeatRow({
  beat,
  selected,
  busy,
  zh,
  imageUrl,
  videoUrl,
  voiceUrl,
  isRangeIn,
  isRangeOut,
  outOfRange,
  onSelect,
  onTextChange,
  onShotChange,
  onGenImage,
  onGenVoice,
  onGenVideo,
  onGenVideoR2V,
  canR2V,
  onUploadImage,
  onRewrite,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
  dragOver,
}: {
  beat: CastBeat;
  selected: boolean;
  busy: "image" | "voice" | "video" | "rewrite" | undefined;
  zh: boolean;
  imageUrl?: string;
  videoUrl?: string;
  voiceUrl?: string;
  isRangeIn?: boolean;
  isRangeOut?: boolean;
  outOfRange?: boolean;
  onSelect: () => void;
  onTextChange: (v: string) => void;
  onShotChange: (s: CastShotType) => void;
  onGenImage: () => void;
  onGenVoice: () => void;
  onGenVideo: () => void;
  onGenVideoR2V: () => void;
  canR2V: boolean;
  onUploadImage: (f: File) => void;
  onRewrite: (intent: RewriteIntent) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
}) {
  return (
    <div
      className={`beat-row${selected ? " on" : ""}${dragging ? " dragging" : ""}${dragOver ? " drag-over" : ""}${outOfRange ? " out-of-range" : ""}${isRangeIn ? " range-in" : ""}${isRangeOut ? " range-out" : ""}`}
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="beat-idx">
        {beat.idx}
        {isRangeIn && <span className="beat-io-mark in">I</span>}
        {isRangeOut && <span className="beat-io-mark out">O</span>}
      </div>
      <div className="beat-thumb">
        {videoUrl ? (
          <video src={videoUrl} muted preload="metadata" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" />
        ) : (
          <span className="thumb-empty">·</span>
        )}
      </div>
      <div className="beat-main">
        <textarea
          className="beat-text"
          value={beat.text}
          onChange={(e) => onTextChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder={zh ? "写一句旁白或台词..." : "Write a narration or line..."}
          rows={2}
        />
        <div className="beat-meta">
          <select
            className="beat-shot"
            value={beat.shotType}
            onChange={(e) => onShotChange(e.target.value as CastShotType)}
            onClick={(e) => e.stopPropagation()}
          >
            {SHOT_TYPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {zh ? s.zh : s.en}
              </option>
            ))}
          </select>
          <span className="beat-dur">{beat.durationSec.toFixed(1)}s</span>
          {voiceUrl && (
            <audio src={voiceUrl} controls className="beat-audio" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      </div>
      <div className="beat-actions" onClick={(e) => e.stopPropagation()}>
        {/* ✨ AI 改写 —— 用 select 触发 LLM 改文本(更紧凑/更燃/更悬念/更日常/自定义)
            select 默认显示 ✨,选完触发 + 立刻 reset 到默认值 */}
        <select
          className={`beat-rewrite${busy === "rewrite" ? " busy" : ""}`}
          value=""
          disabled={!!busy || !beat.text.trim()}
          onChange={(e) => {
            const v = e.target.value as RewriteIntent | "";
            if (v) onRewrite(v);
            e.target.value = "";
          }}
          title={zh ? "AI 改写本拍文本" : "AI rewrite this beat"}
        >
          <option value="">{busy === "rewrite" ? "···" : "✨"}</option>
          <option value="tighter">{zh ? "✨ 更紧凑" : "✨ Tighter"}</option>
          <option value="punchy">{zh ? "✨ 更燃" : "✨ Punchier"}</option>
          <option value="suspense">{zh ? "✨ 更悬念" : "✨ Suspense"}</option>
          <option value="casual">{zh ? "✨ 更日常" : "✨ Casual"}</option>
          <option value="custom">{zh ? "✨ 自定义指令" : "✨ Custom..."}</option>
        </select>
        <button
          className={`beat-btn${busy === "image" ? " busy" : ""}`}
          onClick={onGenImage}
          disabled={!!busy}
          title={zh ? "AI 生成画面" : "AI generate image"}
        >
          {busy === "image" ? "···" : "🖼"}
        </button>
        <label
          className={`beat-btn beat-upload${busy ? " disabled" : ""}`}
          title={zh ? "上传本地图(覆盖 AI 出图)" : "Upload local image (overrides AI)"}
        >
          📎
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadImage(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className={`beat-btn${busy === "voice" ? " busy" : ""}`}
          onClick={onGenVoice}
          disabled={!!busy}
          title={zh ? "配音(自动写时长)" : "Generate voiceover"}
        >
          {busy === "voice" ? "···" : "🎙"}
        </button>
        {/* 🎬 视频生成 —— 默认 i2v(需先有图),长按/右键切 r2v 群戏模式 */}
        <select
          className={`beat-video-mode${busy === "video" ? " busy" : ""}`}
          value=""
          disabled={!!busy || (!imageUrl && !canR2V)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "i2v") onGenVideo();
            else if (v === "r2v") onGenVideoR2V();
            e.target.value = "";
          }}
          title={
            zh
              ? `图→视频(i2v):${imageUrl ? "✓ 可用" : "需先出图"} · R2V 群戏:${canR2V ? "✓ 可用(角色册有头像)" : "需先在角色册上传至少 1 个头像"}`
              : `i2v: ${imageUrl ? "ready" : "needs image"} · R2V: ${canR2V ? "ready" : "needs character avatar"}`
          }
        >
          <option value="">{busy === "video" ? "···" : "🎬"}</option>
          {imageUrl && (
            <option value="i2v">{zh ? "🎬 图→视频(本拍)" : "🎬 i2v (this image)"}</option>
          )}
          {canR2V && (
            <option value="r2v">{zh ? "🎬 R2V 群戏(角色册)" : "🎬 R2V (cast multi-ref)"}</option>
          )}
        </select>
        <button
          className="beat-btn beat-del"
          onClick={onDelete}
          disabled={!!busy}
          title={zh ? "删除这一拍" : "Delete beat"}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ─────────── 子组件: 右侧预览 ─────────── */

function PreviewPane({
  zh,
  beat,
  imageUrl,
  videoUrl,
  voiceUrl,
  aspect,
  episodePlaying,
  currentBeatPosition,
  totalBeats,
  onPlayEpisode,
  onStopEpisode,
}: {
  zh: boolean;
  beat?: CastBeat;
  imageUrl?: string;
  videoUrl?: string;
  voiceUrl?: string;
  aspect: string;
  episodePlaying: boolean;
  currentBeatPosition: number;
  totalBeats: number;
  onPlayEpisode: () => void;
  onStopEpisode: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /* —— 整集播放期间:beat 变化时自动播 video + audio —— */
  useEffect(() => {
    if (!episodePlaying) return;
    // 切到新 beat,自动 play
    videoRef.current?.play().catch(() => {});
    audioRef.current?.play().catch(() => {});
  }, [beat?.id, episodePlaying]);

  if (!beat) {
    return (
      <div className="preview-empty">
        <div className="empty-eye">◇</div>
        <div className="empty-title">{zh ? "选一拍预览" : "Select a beat to preview"}</div>
        {totalBeats > 0 && (
          <button className="preview-play-ep" onClick={onPlayEpisode}>
            ▶ {zh ? "从头连播整集" : "Play episode from start"}
          </button>
        )}
      </div>
    );
  }

  const aspectStyle =
    aspect === "9:16" ? { aspectRatio: "9/16", maxHeight: "70vh" } :
    aspect === "1:1" ? { aspectRatio: "1/1", maxHeight: "70vh" } :
    aspect === "4:3" ? { aspectRatio: "4/3", maxHeight: "70vh" } :
    { aspectRatio: "16/9", maxHeight: "70vh" };

  /* —— Ken Burns 自动 scale —— 漫剧 zoom-in/out/pan-lr 用 CSS animation —— */
  const motionClass =
    beat.kind === "comic"
      ? beat.shotType === "zoom-in"
        ? "kb-zoom-in"
        : beat.shotType === "zoom-out"
        ? "kb-zoom-out"
        : beat.shotType === "pan-lr"
        ? "kb-pan-lr"
        : ""
      : "";

  return (
    <div className="preview-pane">
      <div className="preview-stage" style={aspectStyle}>
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            preload="metadata"
            className="preview-media"
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className={`preview-media ${motionClass}`}
            style={{ animationDuration: `${beat.durationSec}s` }}
          />
        ) : (
          <div className="preview-placeholder">
            {zh ? "未生成画面" : "No image yet"}
          </div>
        )}
        <div className="preview-corners">
          <span /><span /><span /><span />
        </div>
        {/* 字幕烧录预览 —— 让用户在 stage 内就看到 editor 导出时的样子 */}
        {beat.text && (
          <div className="preview-caption">
            {beat.text}
          </div>
        )}
      </div>

      <div className="preview-meta">
        <div className="meta-tag">{beat.kind === "short" ? (zh ? "短剧" : "Short") : (zh ? "漫剧" : "Comic")}</div>
        <div className="meta-shot">
          {SHOT_TYPES.find((s) => s.id === beat.shotType)?.emoji} ·{" "}
          {SHOT_TYPES.find((s) => s.id === beat.shotType)?.[zh ? "zh" : "en"]}
        </div>
        <div className="meta-dur">{beat.durationSec.toFixed(1)}s</div>
        <div className="meta-spacer" />
        {episodePlaying ? (
          <button
            className="preview-play-ep playing"
            onClick={onStopEpisode}
            title={zh ? "停止整集播放" : "Stop episode playback"}
          >
            ⏸ {currentBeatPosition}/{totalBeats}
          </button>
        ) : (
          <button
            className="preview-play-ep"
            onClick={onPlayEpisode}
            disabled={totalBeats === 0}
            title={zh ? "从当前拍开始连播整集" : "Play episode from current beat"}
          >
            ▶ {zh ? "整集" : "Play All"}
          </button>
        )}
      </div>

      {beat.text && (
        <div className="preview-text">"{beat.text}"</div>
      )}

      {voiceUrl && (
        <audio
          ref={audioRef}
          src={voiceUrl}
          controls
          className="preview-audio"
        />
      )}
    </div>
  );
}

/* ─────────── 子组件: AI 写剧本 弹窗 ─────────── */

function AiWriterModal({
  zh,
  kind,
  castNames,
  busy,
  onSubmit,
  onClose,
}: {
  zh: boolean;
  kind: CastBeatKind;
  castNames: string[];
  busy: boolean;
  onSubmit: (premise: string, numBeats: number) => void;
  onClose: () => void;
}) {
  const [premise, setPremise] = useState<string>("");
  const [numBeats, setNumBeats] = useState<number>(kind === "comic" ? 8 : 6);

  return (
    <div className="ai-modal-backdrop" onClick={onClose}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="ai-head">
          <div>
            <div className="ai-eyebrow">{zh ? "AI 写剧本" : "AI Writer"}</div>
            <div className="ai-title">
              {zh
                ? kind === "comic" ? "一句话写一集漫剧" : "一句话写一集短剧"
                : kind === "comic" ? "Comic episode from one line" : "Short drama from one line"}
            </div>
          </div>
          <button className="ai-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <textarea
          className="ai-premise"
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          placeholder={
            zh
              ? "例:雨夜地铁站,一个失意的女孩遇到一只会说话的猫,猫告诉她一个秘密..."
              : "e.g. On a rainy night, a girl meets a talking cat who tells her a secret..."
          }
          rows={4}
          autoFocus
        />

        {castNames.length > 0 && (
          <div className="ai-cast-hint">
            {zh ? "AI 会使用这些角色:" : "AI will use these characters: "}
            <b>{castNames.join("、")}</b>
          </div>
        )}

        <div className="ai-controls">
          <label className="ai-label">
            {zh ? "拍数" : "Beats"}
            <input
              type="number"
              className="ai-num"
              min={3}
              max={20}
              value={numBeats}
              onChange={(e) => setNumBeats(Math.max(3, Math.min(20, Number(e.target.value) || 6)))}
            />
          </label>
          <div className="ai-controls-spacer" />
          <button className="ai-cancel" onClick={onClose} disabled={busy}>
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            className="ai-submit"
            onClick={() => onSubmit(premise, numBeats)}
            disabled={busy || !premise.trim()}
          >
            {busy
              ? zh ? "✨ 写作中..." : "✨ Writing..."
              : zh ? `✨ 写 ${numBeats} 拍` : `✨ Write ${numBeats} beats`}
          </button>
        </div>

        <div className="ai-foot">
          {zh
            ? "💡 写完后所有拍会加进当前集,你可以再改文本/换镜头/重写,然后点 ⚡ 一键生成全集图音"
            : "💡 Tip: edit any beat after, then ⚡ Bulk Generate for images + voiceovers"}
        </div>
      </div>
    </div>
  );
}

/* ─────────── 子组件: 角色编辑弹窗 ─────────── */

function CharacterEditor({
  zh,
  character,
  onChange,
  onUploadAvatar,
  onDelete,
  onClose,
}: {
  zh: boolean;
  character: import("@/lib/store").CastCharacter;
  onChange: (patch: Partial<import("@/lib/store").CastCharacter>) => void;
  onUploadAvatar: (f: File) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ai-modal-backdrop" onClick={onClose}>
      <div className="ai-modal char-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="ai-head">
          <div>
            <div className="ai-eyebrow" style={{ color: character.color }}>
              {zh ? "角色" : "Character"}
            </div>
            <input
              className="char-name-input"
              value={character.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={zh ? "角色名" : "Name"}
              style={{ color: character.color }}
            />
          </div>
          <button className="ai-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="char-body">
          {/* 头像 */}
          <label
            className="char-avatar-box"
            style={{ borderColor: character.color }}
            title={zh ? "点击上传头像" : "Click to upload avatar"}
          >
            {character.refImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={character.refImageUrl} alt="" />
            ) : (
              <span className="char-avatar-empty">📷</span>
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadAvatar(f);
                e.target.value = "";
              }}
            />
          </label>

          <div className="char-fields">
            <label className="char-field">
              <span className="char-label">{zh ? "音色" : "Voice"}</span>
              <select
                className="voice-select"
                value={character.voiceId ?? ""}
                onChange={(e) =>
                  onChange({ voiceId: e.target.value || undefined })
                }
              >
                <option value="">{zh ? "(用项目默认)" : "(use project default)"}</option>
                {TTS_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {zh ? v.zh : v.id} · {v.desc}
                  </option>
                ))}
              </select>
            </label>

            <label className="char-field">
              <span className="char-label">{zh ? "角色描述" : "Description"}</span>
              <textarea
                className="char-desc"
                value={character.description ?? ""}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder={
                  zh
                    ? "如:25 岁,长发,穿米白色风衣,神情温柔..."
                    : "e.g. 25, long hair, beige trench coat, gentle look..."
                }
                rows={3}
              />
              <span className="char-hint">
                {zh
                  ? "💡 这段描述会自动加进 imagegen prompt,让 AI 跨拍画出一致的角色"
                  : "💡 Auto-injected into imagegen prompt for cross-shot consistency"}
              </span>
            </label>

            <label className="char-field">
              <span className="char-label">{zh ? "代表色" : "Color"}</span>
              <input
                type="color"
                className="char-color"
                value={character.color ?? "#ff8a4c"}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="char-foot">
          <button className="char-del" onClick={onDelete}>
            🗑 {zh ? "删除角色" : "Delete character"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="ai-submit" onClick={onClose}>
            {zh ? "完成" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── 工具:旁白文本 → imagegen prompt ───────────
   行业标准做法:
     1. beat.text(剧情)
     2. + speaker 角色描述(身高/服装/性格)—— 跨拍一致性关键
     3. + 其它登场角色描述(从 text 里检测出现的名字)
     4. + style 风格短语
     5. + shotType 镜头语言
   beat.imagePrompt 优先级最高,可完全覆盖 */
function synthPrompt(
  beat: CastBeat,
  styleSuffix?: string,
  cast: import("@/lib/store").CastCharacter[] = []
): string {
  const parts: string[] = [];
  if (beat.text.trim()) parts.push(beat.text.trim());

  // —— 角色描述自动注入 ——
  // 优先级:beat.speakerId 的角色 > text 里出现名字的角色
  const involved = new Set<string>();
  if (beat.speakerId) involved.add(beat.speakerId);
  for (const c of cast) {
    if (c.name && beat.text.includes(c.name)) involved.add(c.id);
  }
  for (const id of involved) {
    const c = cast.find((x) => x.id === id);
    if (c?.description?.trim()) parts.push(`${c.name}: ${c.description.trim()}`);
  }

  if (styleSuffix?.trim()) parts.push(styleSuffix.trim());
  // 镜头语言注入 —— 给 imagegen 模型明确的视角/取景指令
  const shotPhrase: Record<string, string> = {
    "zoom-in": "cinematic close-up, emotional focus",
    "zoom-out": "cinematic wide shot, establishing scene",
    "pan-lr": "panoramic wide aspect, slow horizontal sweep feel",
    parallax: "layered foreground and background, depth-of-field bokeh",
    ots: "over-the-shoulder shot, conversation framing, shallow depth",
    pov: "first-person point-of-view shot, immersive perspective",
    dutch: "Dutch angle, tilted horizon, unsettled mood",
    hero: "low-angle hero shot, looking up, heroic composition",
  };
  if (shotPhrase[beat.shotType]) parts.push(shotPhrase[beat.shotType]);
  return parts.join(", ");
}

/* ─────────── 角色 ref 收集 ───────────
   优先 speakerId 对应的单角色;否则把所有有头像的角色都塞进去。
   再加上风格 ref(如果有)。
   去重 + 限制最多 4 张(imagegen ref 多了会拖慢/影响质量)。 */
function collectRefImages(
  beat: CastBeat,
  cast: import("@/lib/store").CastCharacter[],
  styleRefUrl?: string
): string[] {
  const urls = new Set<string>();
  if (beat.speakerId) {
    const c = cast.find((x) => x.id === beat.speakerId);
    if (c?.refImageUrl) urls.add(c.refImageUrl);
  }
  for (const c of cast) {
    if (urls.size >= 3) break;
    if (c.refImageUrl) urls.add(c.refImageUrl);
  }
  if (styleRefUrl && urls.size < 4) urls.add(styleRefUrl);
  return [...urls];
}

/* ─────────── styles (component-scoped via styled-jsx) ─────────── */

function StageStyles() {
  return (
    <style jsx global>{`
      .stage-app {
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .stage-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        margin-top: 65px;
        height: calc(100vh - 65px);
        min-height: 0;
        background: var(--ink);
      }

      /* —— 顶部条:项目名 + 模式 + 演员 + 风格 + 音色 —— */
      .stage-top {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 24px;
        border-bottom: 1px solid var(--line);
        background:
          linear-gradient(180deg,
            color-mix(in oklab, var(--ink) 96%, var(--ink-2)) 0%,
            var(--ink) 100%);
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .stage-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 22px;
        font-weight: 400;
        color: var(--paper);
        background: transparent;
        border: none;
        outline: none;
        border-bottom: 1px solid transparent;
        padding: 2px 4px;
        min-width: 180px;
        flex-shrink: 0;
        transition: border-color 0.15s;
      }
      .stage-title:hover, .stage-title:focus { border-bottom-color: var(--line); }

      .stage-mode-seg {
        display: inline-flex;
        gap: 2px;
        padding: 3px;
        background: var(--bg-sunken);
        border: 1px solid color-mix(in oklab, var(--paper) 5%, var(--line));
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sunken);
      }
      .mode-pill {
        padding: 5px 14px;
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        background: transparent;
        border: none;
        color: var(--paper-mute);
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all var(--ease-smooth);
      }
      .mode-pill:hover:not(.on) { color: var(--paper); }
      .mode-pill.on {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        box-shadow: var(--shadow-cta);
      }

      .stage-cast, .stage-style, .stage-voice {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .cast-label, .style-label, .voice-label {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--paper-mute);
        margin-right: 2px;
      }
      .cast-empty { font-size: 11px; color: var(--paper-mute); font-style: italic; }
      .cast-chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 9px;
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 12px;
        border: 1px solid;
        border-radius: 999px;
        background: color-mix(in oklab, currentColor 5%, transparent);
        cursor: default;
      }
      .cast-add {
        width: 22px; height: 22px;
        font-size: 14px;
        background: transparent;
        border: 1px dashed var(--line);
        color: var(--paper-mute);
        border-radius: 50%;
        cursor: pointer;
        display: grid; place-items: center;
        transition: all 0.15s;
      }
      .cast-add:hover {
        border-color: var(--accent);
        color: var(--accent);
        border-style: solid;
      }

      .style-input {
        background: color-mix(in oklab, var(--ink-2) 60%, transparent);
        border: 1px solid var(--line);
        color: var(--paper);
        font-size: 12px;
        padding: 4px 10px;
        border-radius: var(--radius-md);
        min-width: 240px;
        outline: none;
      }
      .style-input:focus {
        border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
      }

      .voice-select {
        background: color-mix(in oklab, var(--ink-2) 60%, transparent);
        border: 1px solid var(--line);
        color: var(--paper);
        font-family: var(--font-mono);
        font-size: 11px;
        padding: 4px 8px;
        border-radius: var(--radius-md);
        outline: none;
        max-width: 200px;
      }

      /* —— 主体 grid —— */
      .stage-grid {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(420px, 1fr) minmax(360px, 1.2fr);
        gap: 1px;
        background: var(--line);
        min-height: 0;
      }
      .stage-script, .stage-preview {
        background: var(--ink);
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      /* —— Episode tabs —— */
      .ep-tabs {
        display: flex;
        gap: 4px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--line);
        overflow-x: auto;
        flex-shrink: 0;
      }
      .ep-tab {
        background: color-mix(in oklab, var(--ink-2) 60%, transparent);
        border: 1px solid var(--line);
        color: var(--paper-dim);
        padding: 5px 12px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        transition: all var(--ease-smooth);
      }
      .ep-tab b {
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--paper);
      }
      .ep-tab .ep-count {
        font-size: 9px;
        background: color-mix(in oklab, var(--paper) 8%, transparent);
        padding: 0 5px;
        border-radius: 999px;
        color: var(--paper-mute);
      }
      .ep-tab:hover { border-color: color-mix(in oklab, var(--paper) 18%, var(--line)); color: var(--paper); }
      .ep-tab.on {
        background: color-mix(in oklab, var(--accent) 12%, transparent);
        border-color: var(--accent);
        color: var(--paper);
      }
      .ep-tab.on b { color: var(--accent); }
      .ep-add, .ep-del {
        background: transparent;
        border: 1px dashed var(--line);
        color: var(--paper-mute);
        padding: 5px 10px;
        font-family: var(--font-mono);
        font-size: 11px;
        border-radius: var(--radius-md);
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.15s;
      }
      .ep-add:hover { border-color: var(--accent); color: var(--accent); border-style: solid; }
      .ep-del:hover { border-color: #ff5a5a; color: #ff5a5a; border-style: solid; }

      /* —— Beat 列表 —— */
      .beats {
        flex: 1;
        overflow-y: auto;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .beats-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--paper-mute);
        text-align: center;
      }
      .empty-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 22px;
        color: var(--paper-dim);
      }
      .empty-sub { font-size: 12px; }

      .beat-row {
        display: grid;
        grid-template-columns: 28px 80px 1fr auto;
        gap: 10px;
        padding: 10px;
        background: color-mix(in oklab, var(--ink-2) 50%, transparent);
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all var(--ease-smooth);
        align-items: center;
      }
      .beat-row:hover {
        border-color: color-mix(in oklab, var(--paper) 14%, var(--line));
        background: color-mix(in oklab, var(--ink-2) 70%, transparent);
      }
      .beat-row.on {
        border-color: var(--accent);
        background: color-mix(in oklab, var(--accent) 6%, var(--ink-2));
        box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 30%, transparent);
      }
      .beat-idx {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 700;
        color: var(--paper-mute);
        text-align: center;
      }
      .beat-row.on .beat-idx { color: var(--accent); }
      .beat-thumb {
        width: 80px;
        height: 56px;
        background: var(--ink);
        border-radius: var(--radius-sm);
        overflow: hidden;
        display: grid;
        place-items: center;
      }
      .beat-thumb img, .beat-thumb video {
        width: 100%; height: 100%;
        object-fit: cover;
      }
      .thumb-empty {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 22px;
        color: color-mix(in oklab, var(--paper-mute) 50%, transparent);
      }
      .beat-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
      .beat-text {
        background: transparent;
        border: 1px solid transparent;
        color: var(--paper);
        font-family: var(--font-serif);
        font-size: 14px;
        line-height: 1.45;
        padding: 4px 6px;
        border-radius: var(--radius-sm);
        outline: none;
        resize: none;
        font-style: italic;
      }
      .beat-text:hover { border-color: var(--line); }
      .beat-text:focus { border-color: color-mix(in oklab, var(--accent) 40%, var(--line)); background: color-mix(in oklab, var(--ink) 60%, transparent); }
      .beat-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--paper-mute);
      }
      .beat-shot {
        background: transparent;
        color: var(--paper-dim);
        border: 1px solid var(--line);
        font-family: var(--font-mono);
        font-size: 10px;
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        outline: none;
      }
      .beat-dur {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--paper-dim);
        font-weight: 600;
      }
      .beat-audio {
        height: 24px;
        max-width: 220px;
      }
      .beat-actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .beat-btn {
        width: 30px; height: 30px;
        background: color-mix(in oklab, var(--ink-2) 80%, transparent);
        border: 1px solid var(--line);
        color: var(--paper-dim);
        font-size: 14px;
        cursor: pointer;
        border-radius: var(--radius-md);
        display: grid;
        place-items: center;
        transition: all var(--ease-smooth);
      }
      .beat-btn:hover:not(:disabled):not(.beat-del) {
        border-color: var(--accent);
        color: var(--accent);
        background: color-mix(in oklab, var(--accent) 8%, var(--ink-2));
      }
      .beat-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .beat-btn.busy { background: var(--gradient-cta); color: var(--cta-ink); }
      .beat-btn.beat-del:hover:not(:disabled) {
        border-color: #ff5a5a;
        color: #ff5a5a;
        background: color-mix(in oklab, #ff5a5a 10%, transparent);
      }

      .beat-add {
        background: transparent;
        border: 1px dashed var(--line);
        color: var(--paper-mute);
        padding: 10px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: all 0.15s;
      }
      .beat-add:hover {
        border-color: var(--accent);
        color: var(--accent);
        border-style: solid;
        background: color-mix(in oklab, var(--accent) 5%, transparent);
      }

      /* —— 底部 —— */
      .stage-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        border-top: 1px solid var(--line);
        background: color-mix(in oklab, var(--ink-2) 30%, transparent);
        flex-shrink: 0;
      }
      .to-editor {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        text-decoration: none;
        padding: 7px 18px;
        border: none;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        box-shadow: var(--shadow-cta);
        transition: all var(--ease-spring);
        cursor: pointer;
      }
      .to-editor:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--shadow-cta-hover);
        filter: brightness(1.05);
      }
      .to-editor:active:not(:disabled) {
        transform: translateY(0) scale(0.98);
      }
      .to-editor:disabled {
        background: var(--ink-3);
        color: var(--paper-mute);
        box-shadow: none;
        cursor: not-allowed;
        opacity: 0.7;
      }
      .foot-stat {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--paper-mute);
        letter-spacing: 0.06em;
      }

      /* —— 右侧预览 —— */
      .stage-preview {
        padding: 24px;
        align-items: center;
        justify-content: center;
        gap: 16px;
        overflow-y: auto;
      }
      .preview-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--paper-mute);
      }
      .empty-eye {
        font-size: 64px;
        color: color-mix(in oklab, var(--paper-mute) 30%, transparent);
        font-family: var(--font-serif);
      }
      .preview-pane {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        width: 100%;
        max-width: 520px;
      }
      .preview-stage {
        position: relative;
        width: 100%;
        background: #000;
        border-radius: var(--radius-lg);
        overflow: hidden;
        box-shadow: var(--shadow-2);
      }
      .preview-media {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .preview-placeholder {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--paper-mute);
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 16px;
      }
      .preview-corners > span {
        position: absolute;
        width: 16px; height: 16px;
        border: 1px solid color-mix(in oklab, var(--paper) 30%, transparent);
        pointer-events: none;
      }
      .preview-corners > span:nth-child(1) { top: 8px; left: 8px; border-right: none; border-bottom: none; }
      .preview-corners > span:nth-child(2) { top: 8px; right: 8px; border-left: none; border-bottom: none; }
      .preview-corners > span:nth-child(3) { bottom: 8px; left: 8px; border-right: none; border-top: none; }
      .preview-corners > span:nth-child(4) { bottom: 8px; right: 8px; border-left: none; border-top: none; }

      .preview-meta {
        display: flex;
        gap: 12px;
        align-items: center;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: var(--paper-mute);
      }
      .meta-tag {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        padding: 2px 8px;
        border-radius: 999px;
      }
      .preview-text {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 18px;
        line-height: 1.5;
        color: var(--paper);
        text-align: center;
        padding: 0 12px;
        max-width: 480px;
      }
      .preview-audio {
        width: 100%;
        max-width: 320px;
        height: 32px;
      }

      /* —— Ken Burns —— */
      @keyframes kb-zoom-in {
        from { transform: scale(1); }
        to   { transform: scale(1.08); }
      }
      @keyframes kb-zoom-out {
        from { transform: scale(1.08); }
        to   { transform: scale(1); }
      }
      @keyframes kb-pan-lr {
        from { transform: scale(1.05) translateX(-2%); }
        to   { transform: scale(1.05) translateX(2%); }
      }
      .kb-zoom-in   { animation: kb-zoom-in   linear infinite alternate; }
      .kb-zoom-out  { animation: kb-zoom-out  linear infinite alternate; }
      .kb-pan-lr    { animation: kb-pan-lr    linear infinite alternate; }

      /* ——— 字幕烧录预览 (跟 episodeToEditor 字幕样式同步) ——— */
      .preview-caption {
        position: absolute;
        left: 8%;
        right: 8%;
        bottom: 7%;
        font-family: var(--font-sans);
        font-size: 18px;
        font-weight: 700;
        color: #fff;
        text-align: center;
        text-shadow:
          0 2px 4px rgba(0, 0, 0, 0.95),
          0 0 12px rgba(0, 0, 0, 0.7),
          0 0 24px rgba(0, 0, 0, 0.5);
        line-height: 1.4;
        letter-spacing: 0.02em;
        pointer-events: none;
        z-index: 5;
      }

      /* ——— 角色芯片新版(button) + 头像点 ——— */
      .cast-chip {
        background: color-mix(in oklab, currentColor 5%, transparent);
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 12px;
        padding: 3px 9px;
        gap: 6px;
        display: inline-flex;
        align-items: center;
      }
      .cast-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .cast-voice-dot {
        font-size: 9px;
        opacity: 0.85;
      }

      /* ——— 角色编辑弹窗 ——— */
      .char-modal {
        width: min(560px, 92vw);
      }
      .char-name-input {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 26px;
        background: transparent;
        border: none;
        outline: none;
        border-bottom: 1px solid transparent;
        padding: 4px 2px;
        margin-top: 4px;
        letter-spacing: -0.01em;
        line-height: 1.1;
        transition: border-color 0.15s;
        min-width: 200px;
      }
      .char-name-input:hover, .char-name-input:focus {
        border-bottom-color: color-mix(in oklab, currentColor 30%, transparent);
      }
      .char-body {
        display: flex;
        gap: 20px;
        margin-bottom: 18px;
      }
      .char-avatar-box {
        width: 120px;
        height: 120px;
        border: 2px solid var(--line);
        border-radius: var(--radius-lg);
        background: color-mix(in oklab, var(--ink) 60%, transparent);
        display: grid;
        place-items: center;
        cursor: pointer;
        overflow: hidden;
        flex-shrink: 0;
        transition: all 0.15s;
      }
      .char-avatar-box:hover {
        background: color-mix(in oklab, var(--ink-2) 80%, transparent);
      }
      .char-avatar-box img {
        width: 100%; height: 100%;
        object-fit: cover;
      }
      .char-avatar-empty {
        font-size: 32px;
        opacity: 0.4;
      }
      .char-fields {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
      }
      .char-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .char-label {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--paper-mute);
      }
      .char-desc {
        background: color-mix(in oklab, var(--ink) 60%, transparent);
        border: 1px solid var(--line);
        color: var(--paper);
        font-family: var(--font-sans);
        font-size: 13px;
        line-height: 1.55;
        padding: 8px 10px;
        border-radius: var(--radius-md);
        outline: none;
        resize: vertical;
      }
      .char-desc:focus {
        border-color: color-mix(in oklab, var(--accent) 40%, var(--line));
      }
      .char-hint {
        font-size: 11px;
        color: var(--paper-mute);
        line-height: 1.45;
      }
      .char-color {
        width: 38px;
        height: 24px;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        cursor: pointer;
        background: transparent;
      }
      .char-foot {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
      }
      .char-del {
        background: transparent;
        border: 1px solid color-mix(in oklab, #ff5a5a 40%, var(--line));
        color: #ff5a5a;
        padding: 6px 14px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: all var(--ease-quick);
      }
      .char-del:hover {
        background: color-mix(in oklab, #ff5a5a 12%, transparent);
        border-color: #ff5a5a;
      }

      /* ——— 整集连播按钮 ——— */
      .preview-play-ep {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        border: none;
        padding: 5px 14px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        cursor: pointer;
        box-shadow: var(--shadow-cta);
        transition: all var(--ease-spring);
      }
      .preview-play-ep:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--shadow-cta-hover);
        filter: brightness(1.06);
      }
      .preview-play-ep:disabled {
        background: var(--ink-3);
        color: var(--paper-mute);
        box-shadow: none;
        cursor: not-allowed;
      }
      .preview-play-ep.playing {
        background: linear-gradient(135deg, #ff5a5a 0%, #ff8a4c 100%);
        color: #fff;
        animation: ep-pulse 1.2s ease-in-out infinite;
      }
      @keyframes ep-pulse {
        0%, 100% { box-shadow: 0 4px 14px color-mix(in oklab, #ff5a5a 30%, transparent); }
        50% { box-shadow: 0 4px 22px color-mix(in oklab, #ff5a5a 60%, transparent); }
      }
      .meta-spacer { flex: 1; }

      /* ——— 角色头像 + 风格 ref 上传 ——— */
      .cast-chip {
        cursor: pointer;
      }
      .cast-chip:hover {
        background: color-mix(in oklab, currentColor 10%, transparent);
        transform: translateY(-1px);
      }
      .cast-chip.has-ref {
        padding-left: 4px;
      }
      .cast-avatar {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        object-fit: cover;
        margin-right: 4px;
      }
      .cast-name { line-height: 1; }

      .style-ref-btn {
        width: 26px;
        height: 26px;
        background: color-mix(in oklab, var(--ink) 60%, transparent);
        border: 1px dashed var(--line);
        color: var(--paper-mute);
        border-radius: var(--radius-md);
        cursor: pointer;
        display: grid;
        place-items: center;
        font-size: 11px;
        overflow: hidden;
        flex-shrink: 0;
        transition: all 0.15s;
      }
      .style-ref-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
        border-style: solid;
      }
      .style-ref-btn.has-ref {
        border-style: solid;
        border-color: var(--accent);
        padding: 0;
      }
      .style-ref-btn img {
        width: 100%; height: 100%;
        object-fit: cover;
      }

      /* ——— Beat 上传按钮 ——— */
      .beat-upload {
        cursor: pointer;
      }
      .beat-upload.disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* ——— Beat 视频模式 select (i2v / r2v) ——— */
      .beat-video-mode {
        width: 30px;
        height: 30px;
        background: color-mix(in oklab, var(--ink-2) 80%, transparent);
        border: 1px solid var(--line);
        color: var(--paper-dim);
        font-size: 14px;
        padding: 0 4px;
        text-align: center;
        cursor: pointer;
        border-radius: var(--radius-md);
        appearance: none;
        -webkit-appearance: none;
        transition: all var(--ease-smooth);
      }
      .beat-video-mode:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--accent);
        background: color-mix(in oklab, var(--accent) 8%, var(--ink-2));
      }
      .beat-video-mode:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .beat-video-mode.busy {
        background: var(--gradient-cta);
        color: var(--cta-ink);
      }

      /* ——— Beat AI 改写 select ——— */
      .beat-rewrite {
        width: 30px;
        height: 30px;
        background: linear-gradient(135deg,
          color-mix(in oklab, #2dd4bf 20%, var(--ink-2)) 0%,
          color-mix(in oklab, #14b8a6 18%, var(--ink-2)) 100%);
        border: 1px solid color-mix(in oklab, #2dd4bf 40%, var(--line));
        color: #14b8a6;
        font-size: 13px;
        padding: 0 4px;
        text-align: center;
        cursor: pointer;
        border-radius: var(--radius-md);
        appearance: none;
        -webkit-appearance: none;
        transition: all var(--ease-smooth);
      }
      .beat-rewrite:hover:not(:disabled) {
        border-color: #14b8a6;
        background: linear-gradient(135deg,
          color-mix(in oklab, #2dd4bf 35%, var(--ink-2)) 0%,
          color-mix(in oklab, #14b8a6 30%, var(--ink-2)) 100%);
        color: #fff;
      }
      .beat-rewrite:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      /* ——— I/O 范围条 ——— */
      .ep-range-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 16px;
        background: color-mix(in oklab, var(--ink-2) 40%, transparent);
        border-bottom: 1px solid var(--line);
        flex-shrink: 0;
        font-family: var(--font-mono);
        font-size: 10.5px;
        flex-wrap: wrap;
      }
      .ep-range-label {
        color: var(--paper-mute);
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .ep-range-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        background: transparent;
        border: 1px dashed var(--line);
        color: var(--paper-mute);
        border-radius: var(--radius-sm);
      }
      .ep-range-pill b {
        color: var(--paper-dim);
        font-weight: 700;
      }
      .ep-range-pill.set {
        border-style: solid;
        border-color: var(--accent);
        color: var(--accent);
        background: color-mix(in oklab, var(--accent) 8%, transparent);
      }
      .ep-range-pill.set b { color: var(--accent); }
      .ep-range-sep { color: var(--paper-mute); }
      .ep-range-spacer { flex: 1; min-width: 8px; }
      .ep-range-clear {
        background: transparent;
        border: 1px solid var(--line);
        color: var(--paper-mute);
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        font-family: var(--font-mono);
        font-size: 10px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .ep-range-clear:hover {
        border-color: #ff5a5a;
        color: #ff5a5a;
      }
      .ep-range-hint {
        color: var(--paper-mute);
        font-size: 10px;
        font-family: var(--font-sans);
        opacity: 0.7;
        flex-basis: 100%;
        margin-top: -2px;
      }

      /* ——— Beat 行 I/O marker + 范围外半透明 ——— */
      .beat-io-mark {
        display: inline-block;
        margin-left: 4px;
        padding: 0 4px;
        font-size: 9px;
        font-weight: 700;
        border-radius: 2px;
        line-height: 1.4;
        font-family: var(--font-mono);
      }
      .beat-io-mark.in {
        background: var(--accent);
        color: var(--cta-ink);
      }
      .beat-io-mark.out {
        background: #4ea8f7;
        color: #fff;
      }
      .beat-row.out-of-range {
        opacity: 0.42;
      }
      .beat-row.range-in {
        border-left: 3px solid var(--accent);
      }
      .beat-row.range-out {
        border-right: 3px solid #4ea8f7;
      }

      /* ——— Beat 拖拽 ——— */
      .beat-row { transition: all var(--ease-smooth); }
      .beat-row.dragging {
        opacity: 0.4;
        transform: scale(0.98);
      }
      .beat-row.drag-over {
        border-color: var(--accent);
        box-shadow: 0 -3px 0 0 var(--accent);
        transform: translateY(2px);
      }

      /* ——— 顶部工具栏右侧:AI 写剧本 + 批量生成 ——— */
      .stage-top-spacer { flex: 1; min-width: 8px; }
      .stage-io-btn {
        width: 28px;
        height: 28px;
        background: transparent;
        border: 1px solid var(--line);
        color: var(--paper-mute);
        border-radius: var(--radius-md);
        cursor: pointer;
        display: inline-grid;
        place-items: center;
        font-size: 13px;
        transition: all var(--ease-quick);
        flex-shrink: 0;
      }
      .stage-io-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
        background: color-mix(in oklab, var(--accent) 8%, transparent);
      }
      .stage-ai-btn, .stage-bulk-btn {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 6px 14px;
        border-radius: var(--radius-md);
        cursor: pointer;
        flex-shrink: 0;
        transition: all var(--ease-spring);
      }
      .stage-ai-btn {
        background: linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%);
        color: #fff;
        border: none;
        box-shadow: 0 3px 10px color-mix(in oklab, #2dd4bf 30%, transparent);
      }
      .stage-ai-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 5px 18px color-mix(in oklab, #2dd4bf 50%, transparent);
        filter: brightness(1.08);
      }
      .stage-bulk-btn {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        border: none;
        box-shadow: var(--shadow-cta);
      }
      .stage-bulk-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--shadow-cta-hover);
        filter: brightness(1.06);
      }
      .stage-bulk-btn:disabled {
        background: var(--ink-3);
        color: var(--paper-mute);
        box-shadow: none;
        cursor: wait;
      }

      /* ——— AI 写剧本 弹窗 ——— */
      .ai-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
        background: color-mix(in oklab, var(--ink) 75%, transparent);
        backdrop-filter: blur(12px) saturate(120%);
        -webkit-backdrop-filter: blur(12px) saturate(120%);
        display: grid;
        place-items: center;
        animation: ai-fade 0.18s ease;
      }
      @keyframes ai-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes ai-rise {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .ai-modal {
        width: min(560px, 90vw);
        background: linear-gradient(180deg,
          color-mix(in oklab, var(--ink-2) 95%, transparent) 0%,
          color-mix(in oklab, var(--ink) 92%, transparent) 100%);
        border: 1px solid color-mix(in oklab, var(--paper) 8%, var(--line));
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-3);
        padding: 28px 32px 22px;
        animation: ai-rise 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .ai-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .ai-eyebrow {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #14b8a6;
        line-height: 1;
      }
      .ai-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 26px;
        color: var(--paper);
        letter-spacing: -0.01em;
        line-height: 1.1;
        margin-top: 6px;
      }
      .ai-close {
        width: 28px; height: 28px;
        background: transparent;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        color: var(--paper-mute);
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        flex-shrink: 0;
        transition: all var(--ease-quick);
      }
      .ai-close:hover {
        color: var(--paper);
        border-color: color-mix(in oklab, var(--paper) 25%, transparent);
      }
      .ai-premise {
        width: 100%;
        background: color-mix(in oklab, var(--ink) 60%, transparent);
        border: 1px solid var(--line);
        color: var(--paper);
        font-family: var(--font-serif);
        font-size: 15px;
        font-style: italic;
        line-height: 1.55;
        padding: 12px 14px;
        border-radius: var(--radius-md);
        outline: none;
        resize: vertical;
        min-height: 100px;
        transition: border-color 0.15s;
      }
      .ai-premise:focus {
        border-color: color-mix(in oklab, #2dd4bf 50%, var(--line));
        box-shadow: 0 0 0 3px color-mix(in oklab, #2dd4bf 12%, transparent);
      }
      .ai-cast-hint {
        margin-top: 10px;
        font-size: 12px;
        color: var(--paper-mute);
        font-family: var(--font-mono);
        line-height: 1.5;
      }
      .ai-cast-hint b {
        color: var(--paper);
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 500;
        font-size: 13px;
      }
      .ai-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 16px;
      }
      .ai-controls-spacer { flex: 1; }
      .ai-label {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--paper-mute);
        letter-spacing: 0.08em;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ai-num {
        width: 56px;
        background: color-mix(in oklab, var(--ink) 60%, transparent);
        border: 1px solid var(--line);
        color: var(--paper);
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        outline: none;
        text-align: center;
      }
      .ai-cancel {
        background: transparent;
        border: 1px solid var(--line);
        color: var(--paper-dim);
        padding: 7px 16px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: all var(--ease-quick);
      }
      .ai-cancel:hover:not(:disabled) {
        border-color: color-mix(in oklab, var(--paper) 25%, transparent);
        color: var(--paper);
      }
      .ai-submit {
        background: linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%);
        color: #fff;
        border: none;
        padding: 8px 20px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        cursor: pointer;
        box-shadow: 0 3px 10px color-mix(in oklab, #2dd4bf 35%, transparent);
        transition: all var(--ease-spring);
      }
      .ai-submit:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px color-mix(in oklab, #2dd4bf 50%, transparent);
        filter: brightness(1.08);
      }
      .ai-submit:disabled {
        background: var(--ink-3);
        color: var(--paper-mute);
        box-shadow: none;
        cursor: not-allowed;
      }
      .ai-foot {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
        font-size: 11px;
        color: var(--paper-mute);
        font-family: var(--font-sans);
        line-height: 1.55;
      }
    `}</style>
  );
}
