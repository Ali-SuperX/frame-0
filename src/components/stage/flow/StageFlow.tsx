"use client";

/**
 * StageFlow —— /stage 节点画布创作平台（新入口）
 * 布局：全站 .chrome 顶栏 | 9 步流程条 | 节点流画布 | (M2)Inspector + (M3)AI Dock
 * 数据：真实 store(series/jobs) 派生 9 阶段状态/缩略图/meta。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useLocale } from "next-intl";
import { useStudioStore, type Job, type Series, type StageShot } from "@/lib/store";
import {
  deriveStageStatus, deriveStageMeta, FLOW_STAGES, type FlowStageId,
} from "@/lib/stage/flowStages";
import { genShotImage, genShotVoice, genShotVideo, genElementImage, shotImageUrl, shotImageSubmitUrl, shotVideoUrl, shotVoiceUrl } from "@/lib/stage/stageGen";
import { aiWriteBeats } from "@/lib/stage/aiWriter";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";
import { suggestedElementRefsForShot } from "@/lib/stage/shotRefs";
import { getVoice, pickVoiceByPersona, TTS_VOICES } from "@/lib/r2v/ttsVoices";
import FlowStepper from "./FlowStepper";
import FlowCanvas from "./FlowCanvas";
import FlowProjectMenu from "./FlowProjectMenu";
import { FlowIcon } from "./FlowIcon";
import { CinemaTheater } from "../cinema/CinemaTheater";
import { useAuth } from "@/components/AuthProvider";
import { useCinema } from "../cinema/useCinema";
import { usePlayback } from "../cinema/usePlayback";
import { readLocalFile } from "@/lib/editor/localFiles";
import "@/styles/frame.css";
import "@/styles/stage-flow.css";
import "@/styles/stage-cinema.css";

const PIPE_STEPS = [
  { id: "script", zh: "剧本分镜", en: "Script shots", no: "03" },
  { id: "character", zh: "角色立绘", en: "Cast art", no: "04" },
  { id: "scene", zh: "场景概念图", en: "Scene art", no: "05" },
  { id: "frames_img", zh: "逐镜出图", en: "Frame images", no: "06a" },
  { id: "frames_vid", zh: "图生视频", en: "I2V video", no: "06b" },
  { id: "audio", zh: "配音", en: "Voice", no: "07" },
] as const;

const PIPE_PRESETS = [
  { zh: "资产全出", en: "All assets", steps: ["character", "scene"] },
  { zh: "画面全出", en: "All frames", steps: ["frames_img", "frames_vid"] },
  { zh: "一条龙", en: "Full pipeline", steps: ["script", "character", "scene", "frames_img", "frames_vid", "audio"] },
] as const;

const PIPE_ORDER = PIPE_STEPS.map((s) => s.id);

type StageAssetPlan = {
  characters?: {
    name?: string;
    description?: string;
    actingBaseline?: string;
    gender?: "male" | "female";
    consistencyWeight?: number;
  }[];
  locations?: {
    name?: string;
    description?: string;
    consistencyWeight?: number;
  }[];
};

type StageIdeaPlan = {
  synopsis?: string;
  kind?: Series["kind"];
  aspect?: Series["aspect"];
};

type StageOutlinePlan = {
  outline?: string;
  episodes?: {
    title?: string;
    synopsis?: string;
  }[];
};

function sameRefSet(a: string[] = [], b: string[] = []) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function extractJsonObject<T>(content: string): T {
  let body = content.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) body = body.slice(start, end + 1);
  return JSON.parse(body) as T;
}

async function callStageJson<T>(messages: { role: "system" | "user"; content: string }[], model?: string): Promise<T> {
  const res = await fetch("/api/bailian/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: model || undefined, stream: false, temperature: 0.72 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI 调用失败:${res.status} ${text.slice(0, 160)}`);
  }
  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content || json.content || "";
  if (!content) throw new Error("AI 返回为空");
  return extractJsonObject<T>(content);
}

function guessGender(text: string): "male" | "female" {
  const lower = text.toLowerCase();
  if (/(男|父|哥|弟|叔|爷|少年|丈夫|先生|boss|霸总|皇帝|王爷|他)/.test(lower)) return "male";
  if (/(女|母|姐|妹|姨|奶|少女|妻子|小姐|公主|皇后|她)/.test(lower)) return "female";
  return "female";
}

function pickStageVoice(gender: "male" | "female", tone?: string): string {
  const preferred = pickVoiceByPersona(gender, tone);
  if (getVoice(preferred)?.group === "qwen3") return preferred;
  const pool = TTS_VOICES.filter((v) => v.group === "qwen3" && v.gender === gender);
  if (!pool.length) return gender === "male" ? "Ethan" : "Cherry";
  const t = (tone || "").toLowerCase();
  let best = pool[0];
  let score = 0;
  for (const voice of pool) {
    const hay = `${voice.zh} ${voice.desc} ${voice.bestFor}`.toLowerCase();
    const next = ["沉稳", "温柔", "甜", "活泼", "权威", "知性", "成熟", "少年", "感性", "商务", "悬疑"]
      .reduce((sum, kw) => sum + (t.includes(kw) && hay.includes(kw) ? 1 : 0), 0);
    if (next > score) {
      best = voice;
      score = next;
    }
  }
  return best.id;
}

export default function StageFlow() {
  const zh = useLocale() === "zh";
  const hp = (p: string) => (zh ? p : `/en${p}`);
  const { user, loading: authLoading } = useAuth();
  const localAuthBypass = process.env.NODE_ENV === "development";
  const activeEpId = useStudioStore((s) => s.activeEpId);

  const series = useStudioStore((s) => s.series);
  const jobs = useStudioStore((s) => s.jobs);
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);
  const addEpisode = useStudioStore((s) => s.seriesAddEpisode);
  const updateEpisode = useStudioStore((s) => s.seriesUpdateEpisode);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const addElement = useStudioStore((s) => s.seriesAddElement);
  const updateElement = useStudioStore((s) => s.seriesUpdateElement);
  const setSeries = useStudioStore((s) => s.setSeries);
  const setActiveEp = useStudioStore((s) => s.setActiveEp);
  const setBgm = useStudioStore((s) => s.seriesSetBgm);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);
  const migrateIfNeeded = useStudioStore((s) => s.migrateIfNeeded);
  const loadOrgs = useStudioStore((s) => s.loadOrgs);
  const loadProjects = useStudioStore((s) => s.loadProjects);
  const openProject = useStudioStore((s) => s.openProject);
  const newProject = useStudioStore((s) => s.newProject);
  const saveCurrentProject = useStudioStore((s) => s.saveCurrentProject);
  const currentProjectId = useStudioStore((s) => s.currentProjectId);
  useEffect(() => { migrateIfNeeded(); }, [migrateIfNeeded]);

  useEffect(() => {
    let cancelled = false;
    const revive = async () => {
      const st = useStudioStore.getState();
      for (const el of st.series.bible) {
        const revived = await Promise.all(el.refImages.map(async (ref) => {
          const needsPreview = ref.previewUrl?.startsWith("blob:") || ref.url.startsWith("blob:");
          if (!ref.localKey || !needsPreview) return ref;
          const blob = await readLocalFile(ref.localKey).catch(() => null);
          if (!blob || cancelled) return ref;
          const objectUrl = URL.createObjectURL(blob);
          return ref.url.startsWith("blob:")
            ? { ...ref, url: objectUrl }
            : { ...ref, previewUrl: objectUrl };
        }));
        if (!cancelled && revived.some((ref, idx) => ref.url !== el.refImages[idx]?.url || ref.previewUrl !== el.refImages[idx]?.previewUrl)) {
          updateElement(el.id, { refImages: revived });
        }
      }

      const bgm = st.series.bgm;
      if (bgm?.localKey && bgm.sourceUrl.startsWith("blob:")) {
        const blob = await readLocalFile(bgm.localKey).catch(() => null);
        if (blob && !cancelled) setBgm({ ...bgm, sourceUrl: URL.createObjectURL(blob) });
      }

      for (const job of st.jobs) {
        const media = job.media?.img_url;
        const needsPreview = media?.previewUrl?.startsWith("blob:") || media?.url.startsWith("blob:");
        if (!media?.localKey || !needsPreview) continue;
        const blob = await readLocalFile(media.localKey).catch(() => null);
        if (!blob || cancelled) continue;
        const objectUrl = URL.createObjectURL(blob);
        const img_url = media.url.startsWith("blob:")
          ? { ...media, url: objectUrl }
          : { ...media, previewUrl: objectUrl };
        setJobStatus(job.id, { media: { ...job.media, img_url } });
      }
    };
    const timer = window.setTimeout(() => { void revive(); }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [setBgm, setJobStatus, updateElement]);

  // 进入即拉组织/项目，恢复上次项目或自动建第一个（多租户：项目从 DB 按用户/组织加载）
  useEffect(() => {
    if (!user) return; // 未登录不拉项目，开发旁路时使用本地持久化数据
    (async () => {
      await loadOrgs();
      await loadProjects();
      const st = useStudioStore.getState();
      if (st.currentProjectId && st.projectList.some((p) => p.id === st.currentProjectId)) {
        await openProject(st.currentProjectId);
      } else if (st.projectList.length) {
        await openProject(st.projectList[0].id);
      } else {
        const id = await newProject("我的第一个项目");
        if (id) await openProject(id);
      }
    })();
  }, [user, loadOrgs, loadProjects, openProject, newProject]);

  // series 变化 → 防抖保存到当前项目（落库，按组织隔离）
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentProjectId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveCurrentProject(); }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [series, currentProjectId, saveCurrentProject]);

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const activeEp = series.episodes.find((e) => e.id === activeEpId) ?? series.episodes[0];
  const status = useMemo(() => deriveStageStatus(series, jobById, activeEpId), [series, jobById, activeEpId]);
  const meta = useMemo(() => deriveStageMeta(series, jobById, activeEpId), [series, jobById, activeEpId]);
  const progress = useMemo(
    () => Object.values(status).filter((s) => s === "ready").length / FLOW_STAGES.length,
    [status],
  );

  const [selectedId, setSelectedId] = useState<FlowStageId | null>("idea");
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<FlowStageId | null>(null);

  // 放映
  const film = useCinema();
  const durations = useMemo(() => film.shots.map((s) => s.durSec), [film.shots]);
  const pb = usePlayback(durations);

  // 选节点 → 弹跟随框并收起 Inspector（保证二级展开语义：跟随框 → 详细编辑 → 面板）
  const handleSelect = (id: FlowStageId | null) => { setSelectedId(id); };

  // 生成反馈（M3：toast；真实 stageGen/aiWriter 接口预留）
  const [toast, setToast] = useState<{ text: string; ok?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (text: string, ok = false) => {
    setToast({ text, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const [genBusy, setGenBusy] = useState(false);

  // ── 批量 pipeline ──
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchChecked, setBatchChecked] = useState<Set<string>>(new Set(PIPE_ORDER));
  const abortRef = useRef<AbortController | null>(null);
  const [pipeState, setPipeState] = useState<{ steps: string[]; cur: string | null; label: string; done: string[] } | null>(null);

  const pendingCounts = useMemo(() => {
    if (!activeEp) return { script: 1, character: 0, scene: 0, frames_img: 0, frames_vid: 0, audio: 0 };
    const shots = activeEp.scenes.flatMap((sc) => sc.shots);
    return {
      script: shots.length === 0 ? 1 : 0,
      character: series.bible.filter((e) => e.kind === "character" && e.refImages.length === 0).length,
      scene: series.bible.filter((e) => e.kind === "location" && e.refImages.length === 0).length,
      frames_img: shots.filter((s) => !shotImageUrl(s, jobById) && (s.narration?.trim() || s.imagePrompt?.trim() || (s.elementRefs?.length ?? 0) > 0)).length,
      frames_vid: series.kind === "comic" ? 0 : shots.filter((s) => shotImageUrl(s, jobById) && !shotVideoUrl(s, jobById) && !s.videoJobId).length,
      audio: activeEp.scenes.flatMap((sc) => sc.shots.filter((s) => !s.voiceJobId && (s.narration?.trim() || (s.dialogue?.length ?? 0) > 0))).length,
    };
  }, [activeEp, series, jobById]);

  const getFresh = () => {
    const st = useStudioStore.getState();
    return { series: st.series, jobById: new Map(st.jobs.map((j) => [j.id, j] as const)) };
  };

  const ensureActiveEpisode = () => {
    let st = useStudioStore.getState();
    let ep: Series["episodes"][number] | undefined = st.series.episodes.find((e) => e.id === st.activeEpId) ?? st.series.episodes[0];
    if (!ep) {
      const epId = addEpisode(`第 ${st.series.episodes.length + 1} 集`);
      setActiveEp(epId);
      st = useStudioStore.getState();
      ep = st.series.episodes.find((e) => e.id === epId);
    }
    if (ep && ep.scenes.length === 0) {
      addScene(ep.id, { castIds: [] });
      st = useStudioStore.getState();
      ep = st.series.episodes.find((e) => e.id === ep?.id);
    }
    return ep ?? null;
  };

  const episodePremise = (ep?: Series["episodes"][number] | null) => {
    const st = useStudioStore.getState().series;
    return [
      ep?.synopsis,
      st.synopsis,
      st.kind === "comic"
        ? "竖屏漫剧，强情绪，旁白驱动，结尾留钩子。"
        : "竖屏短剧，对话密集，冲突清晰，结尾强反转。",
    ].filter(Boolean).join("\n");
  };

  const repairEpisodeRefsForGeneration = (epId: string) => {
    let workingSeries = useStudioStore.getState().series;
    const ep = workingSeries.episodes.find((e) => e.id === epId);
    const items = ep?.scenes.flatMap((sc) => sc.shots.map((shot) => ({ shot, sceneId: sc.id }))) ?? [];
    if (!items.length) return 0;

    let changed = 0;
    const hasLocation = workingSeries.bible.some((el) => el.kind === "location");
    const needsLocation = items.some(({ shot }) =>
      !(shot.elementRefs ?? []).some((id) => workingSeries.bible.find((el) => el.id === id)?.kind === "location")
    );
    if (!hasLocation && needsLocation) {
      addElement({
        kind: "location",
        name: "核心场景",
        description: workingSeries.synopsis ? `${workingSeries.synopsis} 的主要发生空间，保持统一空间结构、光线方向和关键道具。` : "主要发生空间，保持统一空间结构、光线方向和关键道具。",
        consistencyWeight: 80,
        refImages: [],
      });
      changed += 1;
      workingSeries = useStudioStore.getState().series;
    }

    for (const item of items) {
      const nextRefs = suggestedElementRefsForShot(item.shot, workingSeries);
      if (!sameRefSet(item.shot.elementRefs ?? [], nextRefs)) {
        updateShot(epId, item.sceneId, item.shot.id, { elementRefs: nextRefs });
        changed += 1;
      }
    }
    return changed;
  };

  const writeBeatsToEpisode = async (epId: string, premise: string) => {
    let currentSeries = useStudioStore.getState().series;
    let ep = currentSeries.episodes.find((e) => e.id === epId);
    if (!ep) return 0;
    let sceneId = ep.scenes[0]?.id;
    if (!sceneId) {
      sceneId = addScene(epId, { castIds: [] });
      currentSeries = useStudioStore.getState().series;
      ep = currentSeries.episodes.find((e) => e.id === epId);
    }
    if (!sceneId || !ep) return 0;

    const cast = currentSeries.bible
      .filter((e) => e.kind === "character")
      .map((c) => ({ name: c.name, description: c.description }));
    const locs = currentSeries.bible.filter((e) => e.kind === "location");
    const styleHint = currentSeries.bible
      .filter((e) => e.kind === "style")
      .map((s) => s.description)
      .filter(Boolean)
      .join("; ");
    const scriptCfg = currentSeries.genConfig?.script;
    const numBeats = Math.max(4, Math.min(14, Number(scriptCfg?.params?.numBeats) || (currentSeries.kind === "comic" ? 6 : 8)));
    const aiResult = await aiWriteBeats({
      premise,
      kind: currentSeries.kind,
      numBeats,
      cast,
      styleHint: styleHint || undefined,
      locations: locs.map((l) => ({ name: l.name, description: l.description })),
      model: scriptCfg?.modelId,
    });
    if (!aiResult.beats.length) return 0;
    if (aiResult.synopsis) {
      const latest = useStudioStore.getState().series;
      const latestEp = latest.episodes.find((e) => e.id === epId);
      if (!latest.synopsis?.trim()) setSeries({ synopsis: aiResult.synopsis });
      if (latestEp && !latestEp.synopsis?.trim()) updateEpisode(epId, { synopsis: aiResult.synopsis });
    }

    for (const beat of aiResult.beats) {
      const fresh = useStudioStore.getState().series;
      const characters = fresh.bible.filter((e) => e.kind === "character");
      const locations = fresh.bible.filter((e) => e.kind === "location");
      const speakerId = beat.speakerName ? characters.find((c) => c.name === beat.speakerName)?.id : undefined;
      const sceneRefId = beat.sceneName ? locations.find((l) => l.name === beat.sceneName)?.id : locations.length === 1 ? locations[0].id : undefined;
      const baseRefs = [speakerId, sceneRefId].filter((x): x is string => !!x);
      const shotId = addShot(epId, sceneId, {
        shotType: beat.shotType || (fresh.kind === "comic" ? "still" : "live"),
        narration: speakerId ? undefined : beat.text,
        dialogue: speakerId ? [{ speakerId, line: beat.text }] : undefined,
        elementRefs: baseRefs,
        imagePrompt: beat.imagePrompt,
        durationSec: beat.durationSec || (fresh.kind === "comic" ? 4 : 3),
      });
      const draftShot: StageShot = {
        id: shotId,
        idx: 1,
        shotType: beat.shotType || (fresh.kind === "comic" ? "still" : "live"),
        narration: speakerId ? undefined : beat.text,
        dialogue: speakerId ? [{ speakerId, line: beat.text }] : undefined,
        elementRefs: baseRefs,
        imagePrompt: beat.imagePrompt,
        durationSec: beat.durationSec || (fresh.kind === "comic" ? 4 : 3),
      };
      updateShot(epId, sceneId, shotId, {
        shotType: draftShot.shotType,
        narration: draftShot.narration,
        dialogue: draftShot.dialogue,
        elementRefs: suggestedElementRefsForShot(draftShot, fresh),
        imagePrompt: draftShot.imagePrompt,
        durationSec: draftShot.durationSec,
      });
    }
    return aiResult.beats.length;
  };

  const ensureEpisodeHasShots = async (epId: string) => {
    const currentSeries = useStudioStore.getState().series;
    const ep = currentSeries.episodes.find((e) => e.id === epId);
    const count = ep?.scenes.reduce((sum, sc) => sum + sc.shots.length, 0) ?? 0;
    if (count > 0) return 0;
    return writeBeatsToEpisode(epId, episodePremise(ep));
  };

  const applyIdeaAssistant = async (): Promise<string> => {
    const currentSeries = useStudioStore.getState().series;
    const model = currentSeries.genConfig?.script?.modelId;
    const seed = currentSeries.synopsis?.trim();
    const plan = await callStageJson<StageIdeaPlan>([
      {
        role: "system",
        content: `你是短剧开发制片人。请输出严格 JSON，只返回 JSON。
结构:
{
  "synopsis": "一个可拍的短剧题材，包含主角、冲突、反转和视觉基调，80 字以内",
  "kind": "short 或 comic",
  "aspect": "9:16 或 16:9 或 1:1"
}
目标是后续能直接拆分镜、做角色一致性和逐镜画面。`,
      },
      { role: "user", content: seed ? `把这个题材升级成可生产短剧:${seed}` : "生成一个竖屏短剧题材，强钩子，适合多角色连续分镜。" },
    ], model);
    const synopsis = plan.synopsis?.trim();
    if (!synopsis) return "AI 没返回可用题材，请再点一次或输入一句故事方向。";
    const patch: Partial<Series> = { synopsis };
    if (plan.kind === "short" || plan.kind === "comic") patch.kind = plan.kind;
    if (plan.aspect === "9:16" || plan.aspect === "16:9" || plan.aspect === "1:1") patch.aspect = plan.aspect;
    setSeries(patch);
    return "已生成可拍题材，并同步短剧类型与画幅。下一步可生成大纲或直接拆分镜。";
  };

  const applyOutlineAssistant = async (): Promise<string> => {
    const currentSeries = useStudioStore.getState().series;
    const model = currentSeries.genConfig?.script?.modelId;
    const premise = currentSeries.synopsis?.trim() || "竖屏短剧，主角被迫卷入冲突，最后一集反转真相。";
    const plan = await callStageJson<StageOutlinePlan>([
      {
        role: "system",
        content: `你是短剧统筹编剧。请输出严格 JSON，只返回 JSON。
结构:
{
  "outline": "全剧大纲，120 字以内",
  "episodes": [{"title": "第 1 集标题", "synopsis": "本集梗概，40 字以内"}]
}
episodes 输出 3 到 6 集，每集必须有冲突推进和结尾钩子。`,
      },
      { role: "user", content: premise },
    ], model);
    const outline = plan.outline?.trim();
    const items = (plan.episodes ?? []).filter((item) => item.title?.trim() || item.synopsis?.trim()).slice(0, 6);
    if (outline) setSeries({ synopsis: outline });
    if (!items.length) return outline ? "已更新全剧大纲，但 AI 没返回分集梗概。" : "AI 没返回可用大纲。";

    let st = useStudioStore.getState();
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx];
      const title = item.title?.trim() || `第 ${idx + 1} 集`;
      const synopsis = item.synopsis?.trim() || outline || premise;
      const existing = st.series.episodes[idx];
      if (existing) updateEpisode(existing.id, { title, synopsis });
      else {
        const epId = addEpisode(title);
        updateEpisode(epId, { synopsis });
        if (idx === 0) setActiveEp(epId);
      }
      st = useStudioStore.getState();
    }
    const first = useStudioStore.getState().series.episodes[0];
    if (first) setActiveEp(first.id);
    return `已生成 ${items.length} 集大纲，每集都带冲突推进和钩子。`;
  };

  const stopPipeline = () => { abortRef.current?.abort(); };

  const runPipeline = async (steps: string[]) => {
    const ep = activeEp ?? ensureActiveEpisode();
    if (!ep || genBusy) return;
    const epId = ep.id;
    const ac = new AbortController();
    abortRef.current = ac;
    setGenBusy(true);
    const done: string[] = [];
    setPipeState({ steps, cur: null, label: "", done: [] });

    for (const sid of steps) {
      if (ac.signal.aborted) break;
      setPipeState({ steps, cur: sid, label: "", done: [...done] });

      try {
        if (sid === "script") {
          const ep2 = ensureActiveEpisode();
          if (ep2) {
            const added = await ensureEpisodeHasShots(ep2.id);
            setPipeState((p) => p ? { ...p, label: added ? `${added} 镜` : "已就绪" } : p);
          }
        } else if (sid === "character" || sid === "scene") {
          const isChar = sid === "character";
          let { series: s } = getFresh();
          if (!s.bible.some((e) => e.kind === (isChar ? "character" : "location"))) {
            setPipeState((p) => p ? { ...p, label: "规划中" } : p);
            await applyAssetAssistant(isChar ? "character" : "scene", s.synopsis || (isChar ? "按短剧标准创建主角、对手和关键配角" : "按短剧标准创建核心场景、转折场景和结尾高光场景"));
            s = getFresh().series;
          }
          const targets = s.bible.filter((e) => e.kind === (isChar ? "character" : "location") && e.refImages.length === 0);
          if (targets.length) {
            let d = 0;
            const q = [...targets];
            const run = async () => {
              while (q.length && !ac.signal.aborted) {
                const el = q.shift()!;
                const fresh = getFresh().series;
                try { await genElementImage(el, fresh, fresh.genConfig?.portrait); } catch {}
                d++;
                setPipeState((p) => p ? { ...p, label: `${d}/${targets.length}` } : p);
              }
            };
            await Promise.all([run(), run()]);
          }
        } else if (sid === "frames_img") {
          await ensureEpisodeHasShots(epId);
          const fixed = repairEpisodeRefsForGeneration(epId);
          if (fixed) setPipeState((p) => p ? { ...p, label: `预检 ${fixed}` } : p);
          const { series: s, jobById: jm } = getFresh();
          const ep2 = s.episodes.find((e) => e.id === epId);
          if (ep2) {
            const need = ep2.scenes.flatMap((sc) => sc.shots.filter((shot) => !shotImageUrl(shot, jm) && (shot.narration?.trim() || shot.imagePrompt?.trim() || (shot.elementRefs?.length ?? 0) > 0)).map((shot) => ({ shot, sceneId: sc.id })));
            if (need.length) {
              let d = 0;
              const q = [...need];
              const run = async () => {
                while (q.length && !ac.signal.aborted) {
                  const it = q.shift()!;
                  const fresh = getFresh().series;
                  try { await genShotImage(it.shot, fresh, epId, it.sceneId, it.shot.genOverride?.image ?? fresh.genConfig?.image); } catch {}
                  d++;
                  setPipeState((p) => p ? { ...p, label: `${d}/${need.length}` } : p);
                }
              };
              await Promise.all([run(), run(), run()]);
            }
          }
        } else if (sid === "frames_vid") {
          repairEpisodeRefsForGeneration(epId);
          const { series: s, jobById: jm } = getFresh();
          if (s.kind !== "comic") {
            const ep2 = s.episodes.find((e) => e.id === epId);
            if (ep2) {
              const need = ep2.scenes.flatMap((sc) => sc.shots.filter((shot) => shotImageUrl(shot, jm) && !shotVideoUrl(shot, jm) && !shot.videoJobId).map((shot) => ({ shot, sceneId: sc.id })));
              if (need.length) {
                let d = 0;
                for (const it of need) {
                  if (ac.signal.aborted) break;
                  const u = shotImageSubmitUrl(it.shot, getFresh().jobById);
                  const fresh = getFresh().series;
                  try { if (u) await genShotVideo(it.shot, fresh, epId, it.sceneId, u, it.shot.genOverride?.video ?? fresh.genConfig?.video); } catch {}
                  d++;
                  setPipeState((p) => p ? { ...p, label: `${d}/${need.length}` } : p);
                }
              }
            }
          }
        } else if (sid === "audio") {
          await ensureEpisodeHasShots(epId);
          const { series: s } = getFresh();
          const ep2 = s.episodes.find((e) => e.id === epId);
          if (ep2) {
            const need = ep2.scenes.flatMap((sc) => sc.shots.filter((shot) => !shot.voiceJobId && (shot.narration?.trim() || (shot.dialogue?.length ?? 0) > 0)).map((shot) => ({ shot, sceneId: sc.id })));
            if (need.length) {
              let d = 0;
              for (const it of need) {
                if (ac.signal.aborted) break;
                const fresh = getFresh().series;
                try { await genShotVoice(it.shot, fresh, epId, it.sceneId, it.shot.genOverride?.voice ?? fresh.genConfig?.voice); } catch {}
                d++;
                setPipeState((p) => p ? { ...p, label: `${d}/${need.length}` } : p);
              }
            }
          }
        }
      } catch (err) {
        const label = PIPE_STEPS.find((s) => s.id === sid)?.[zh ? "zh" : "en"] ?? sid;
        const msg = err instanceof Error ? err.message : "生成失败";
        setGenBusy(false);
        abortRef.current = null;
        setPipeState(null);
        flash(`${label}失败：${msg.slice(0, 90)}`);
        return;
      }

      done.push(sid);
    }

    setGenBusy(false);
    abortRef.current = null;
    if (!ac.signal.aborted) {
      setPipeState({ steps, cur: null, label: "", done: [...done] });
      flash(`批量生成完成 ✦ ${done.length} 步`, true);
      setTimeout(() => { setPipeState(null); setBatchOpen(false); }, 1500);
    } else {
      flash(zh ? "已停止" : "Stopped");
      setPipeState(null);
    }
  };

  const handleGenerate = async (id: FlowStageId) => {
    const st = FLOW_STAGES.find((s) => s.id === id);
    const ep = activeEp ?? ensureActiveEpisode();
    if (!ep) { flash("初始化中…"); return; }
    if (genBusy) { flash("生成进行中，请稍候…"); return; }

    if (id === "idea") {
      setGenBusy(true);
      flash("AI 正在生成可拍题材…");
      try {
        const reply = await applyIdeaAssistant();
        flash(reply, true);
      } catch (err) {
        flash(err instanceof Error ? err.message : "题材生成失败");
      } finally {
        setGenBusy(false);
      }
      return;
    }

    if (id === "outline") {
      setGenBusy(true);
      flash("AI 正在拆全剧大纲…");
      try {
        if (!useStudioStore.getState().series.synopsis?.trim()) await applyIdeaAssistant();
        const reply = await applyOutlineAssistant();
        flash(reply, true);
      } catch (err) {
        flash(err instanceof Error ? err.message : "大纲生成失败");
      } finally {
        setGenBusy(false);
      }
      return;
    }

    if (id === "episodes") {
      setGenBusy(true);
      flash("AI 正在写本集分镜…");
      try {
        const ep2 = ensureActiveEpisode();
        if (!ep2) throw new Error("无法创建当前集");
        if (!useStudioStore.getState().series.synopsis?.trim()) await applyIdeaAssistant();
        const count = await writeBeatsToEpisode(ep2.id, episodePremise(ep2));
        const fixed = repairEpisodeRefsForGeneration(ep2.id);
        flash(count ? `已生成 ${count} 个可编辑分镜${fixed ? `，并修复 ${fixed} 项引用` : ""}` : "本集分镜已就绪", true);
      } catch (err) {
        flash(err instanceof Error ? err.message : "分镜生成失败");
      } finally {
        setGenBusy(false);
      }
      return;
    }

    // 逐镜画面 → 两步推进：①批量出图（关键帧）②短剧档再图生视频
    if (id === "frames") {
      if (ep.scenes.flatMap((sc) => sc.shots).length === 0) {
        setGenBusy(true);
        flash("先补本集分镜…");
        try {
          const count = await writeBeatsToEpisode(ep.id, episodePremise(ep));
          repairEpisodeRefsForGeneration(ep.id);
          flash(`已生成 ${count} 个分镜，请检查后再出图`, true);
        } catch (err) {
          flash(err instanceof Error ? err.message : "分镜生成失败");
        } finally {
          setGenBusy(false);
        }
        return;
      }
      const fixed = repairEpisodeRefsForGeneration(ep.id);
      if (fixed) flash(`已自动预检并修复 ${fixed} 项引用`, true);
      const fresh = getFresh();
      const freshSeries = fresh.series;
      const freshJobById = fresh.jobById;
      const freshEp = freshSeries.episodes.find((e) => e.id === ep.id) ?? ep;
      const all = freshEp.scenes.flatMap((sc) => sc.shots.map((shot) => ({ shot, sceneId: sc.id })));
      const isComic = freshSeries.kind === "comic";
      // 第一步：无图且有内容的镜头 → 批量出图（3 并发）
      const needImg = all.filter(({ shot: s }) => !shotImageUrl(s, freshJobById) && (s.narration?.trim() || s.imagePrompt?.trim() || (s.elementRefs?.length ?? 0) > 0));
      if (needImg.length) {
        setGenBusy(true);
        let done = 0; let ok = 0;
        flash(`AI 出图中 0/${needImg.length}…`);
        const q = [...needImg];
        const worker = async () => {
          while (q.length) {
            const it = q.shift()!;
            const latest = useStudioStore.getState().series;
            try { await genShotImage(it.shot, latest, ep.id, it.sceneId, it.shot.genOverride?.image ?? latest.genConfig?.image); ok++; } catch { /* skip 单镜失败 */ }
            flash(`AI 出图中 ${++done}/${needImg.length}…`);
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        setGenBusy(false);
        flash(ok === 0 ? "出图失败 ✗ 请检查 API 密钥配置" : ok < needImg.length ? `出图 ${ok}/${needImg.length}（${needImg.length - ok} 镜失败）` : isComic ? `出图完成 ✓ 共 ${ok} 镜` : `出图完成 ✓ ${ok} 镜，再点「生成」即可图生视频`, ok > 0);
        return;
      }
      // 第二步（短剧）：有图无视频的镜头 → 批量图生视频（串行防限流）
      if (!isComic) {
        const latest = getFresh();
        const latestEp = latest.series.episodes.find((e) => e.id === ep.id) ?? freshEp;
        const latestAll = latestEp.scenes.flatMap((sc) => sc.shots.map((shot) => ({ shot, sceneId: sc.id })));
        const needVid = latestAll.filter(({ shot: s }) => shotImageUrl(s, latest.jobById) && !shotVideoUrl(s, latest.jobById) && !s.videoJobId);
        if (needVid.length) {
          setGenBusy(true);
          let done = 0; let ok = 0;
          flash(`AI 生视频中 0/${needVid.length}…`);
          for (const it of needVid) {
            const latestNow = getFresh();
            const u = shotImageSubmitUrl(it.shot, latestNow.jobById);
            try { if (u) { await genShotVideo(it.shot, latestNow.series, ep.id, it.sceneId, u, it.shot.genOverride?.video ?? latestNow.series.genConfig?.video); ok++; } } catch { /* skip */ }
            flash(`AI 生视频中 ${++done}/${needVid.length}…`);
          }
          setGenBusy(false);
          flash(ok === 0 ? "生视频失败 ✗ 请检查 API 密钥配置" : ok < needVid.length ? `生视频 ${ok}/${needVid.length}（${needVid.length - ok} 镜失败）` : `生视频完成 ✓ 共 ${ok} 镜`, ok > 0);
          return;
        }
      }
      flash(isComic ? "画面已全部出图 ✓" : "画面与视频已全部生成 ✓");
      return;
    }

    // 配音 · 音乐 → 批量真实配音（串行，避免 TTS 限流）
    if (id === "audio") {
      const targets = ep.scenes.flatMap((sc) =>
        sc.shots.filter((s) => !s.voiceJobId && (s.narration?.trim() || (s.dialogue?.length ?? 0) > 0))
          .map((shot) => ({ shot, sceneId: sc.id })));
      if (!targets.length && ep.scenes.flatMap((sc) => sc.shots).length === 0) {
        setGenBusy(true);
        flash("先补本集台词分镜…");
        try {
          const count = await writeBeatsToEpisode(ep.id, episodePremise(ep));
          flash(`已生成 ${count} 个分镜，下一次点击即可配音`, true);
        } catch (err) {
          flash(err instanceof Error ? err.message : "分镜生成失败");
        } finally {
          setGenBusy(false);
        }
        return;
      }
      if (!targets.length) { flash("没有可配音的台词"); return; }
      setGenBusy(true);
      let done = 0; let ok = 0;
      flash(`AI 配音中 0/${targets.length}…`);
      for (const it of targets) {
        const latest = useStudioStore.getState().series;
        try { await genShotVoice(it.shot, latest, ep.id, it.sceneId, it.shot.genOverride?.voice ?? latest.genConfig?.voice); ok++; } catch { /* skip */ }
        flash(`AI 配音中 ${++done}/${targets.length}…`);
      }
      setGenBusy(false);
      flash(ok === 0 ? "配音失败 ✗ 请检查 API 密钥配置" : ok < targets.length ? `配音 ${ok}/${targets.length}（${targets.length - ok} 句失败）` : `配音完成 ✓ 共 ${ok} 句`, ok > 0);
      return;
    }

    // 剪辑 · 合成 → 真实导出到剪辑器（复用 seriesToEditorProject，形成创作闭环）
    if (id === "edit") {
      const { project, stats } = seriesToEditorProject(ep, series, jobById);
      if (stats.ok === 0) { flash("没有可合成的素材（先出图 / 出视频）"); return; }
      editorLoadProject(project);
      flash(`已导出 ${stats.ok} 条到剪辑器 ✦`, true);
      setTimeout(() => { window.location.href = zh ? "/editor" : "/en/editor"; }, 900);
      return;
    }

    if (id === "export") {
      const latest = getFresh();
      const ep2 = latest.series.episodes.find((e) => e.id === ep.id) ?? ep;
      const { project, stats } = seriesToEditorProject(ep2, latest.series, latest.jobById);
      if (stats.ok === 0) { flash("没有可导出的画面素材，先完成逐镜画面"); return; }
      editorLoadProject(project);
      flash(`已生成导出工程 ${stats.ok} 条，可到剪辑器完成最终导出`, true);
      return;
    }

    // 角色 / 场景 → 批量文生图生成立绘 / 场景概念图（2 并发）
    if (id === "character" || id === "scene") {
      const isChar = id === "character";
      const label = isChar ? "立绘" : "场景图";
      const pool = series.bible.filter((e) => e.kind === (isChar ? "character" : "location"));
      if (!pool.length) {
        setGenBusy(true);
        flash(isChar ? "AI 正在规划角色…" : "AI 正在规划场景…");
        try {
          const reply = await applyAssetAssistant(id, series.synopsis || (isChar ? "按短剧标准创建主角、对手和关键配角" : "按短剧标准创建主要室内、室外和高光场景"));
          flash(reply, true);
        } catch (err) {
          flash(err instanceof Error ? err.message : "AI 规划失败");
        } finally {
          setGenBusy(false);
        }
        return;
      }
      const targets = pool.filter((e) => e.refImages.length === 0);
      if (!targets.length) { flash(`所有${isChar ? "角色" : "场景"}已有参考图，可在详情面板继续上传多角度参考。`, true); return; }
      setGenBusy(true);
      let done = 0; let ok = 0;
      flash(`AI 生成${label} 0/${targets.length}…`);
      const q = [...targets];
      const worker = async () => {
        while (q.length) {
          const el = q.shift()!;
          try { await genElementImage(el, series, series.genConfig?.portrait); ok++; } catch { /* skip 单个失败 */ }
          flash(`AI 生成${label} ${++done}/${targets.length}…`);
        }
      };
      await Promise.all([worker(), worker()]);
      setGenBusy(false);
      flash(ok === 0 ? `${label}生成失败 ✗ 请检查 API 密钥配置` : ok < targets.length ? `${label} ${ok}/${targets.length}（${targets.length - ok} 张失败）` : `${label}生成完成 ✓ 共 ${ok} 张`, ok > 0);
      return;
    }

    flash(`「${st?.title}」AI 生成即将接入`);
  };

  const applyAssetAssistant = async (scopeId: FlowStageId, text: string): Promise<string> => {
    const wantsCharacter = scopeId === "character";
    const model = series.genConfig?.script?.modelId;
    const existingChars = series.bible.filter((e) => e.kind === "character");
    const existingLocs = series.bible.filter((e) => e.kind === "location");
    const messages = [
      {
        role: "system" as const,
        content: `你是短剧制片阶段的资产规划助手。请根据用户要求和已有剧本，输出严格 JSON。
只返回 JSON，不要解释。
结构:
{
  "characters": [{"name": "角色名", "description": "外貌身份服装性格，60 字以内", "actingBaseline": "表演基线，30 字以内", "gender": "male 或 female", "consistencyWeight": 85}],
  "locations": [{"name": "场景名", "description": "空间结构，时代，光线，色彩，可识别道具，60 字以内", "consistencyWeight": 80}]
}
当前故事:${series.synopsis || "未填写"}
已有角色:${existingChars.map((c) => `${c.name}:${c.description || ""}`).join("；") || "无"}
已有场景:${existingLocs.map((l) => `${l.name}:${l.description || ""}`).join("；") || "无"}
本次只输出${wantsCharacter ? "characters" : "locations"}字段，数量 1 到 4 个。`,
      },
      { role: "user" as const, content: text },
    ];
    const plan = await callStageJson<StageAssetPlan>(messages, model);

    if (wantsCharacter) {
      const items = (plan.characters ?? []).filter((item) => item.name?.trim());
      if (!items.length) return "AI 没返回可用角色。换个描述再试一次。";
      let changed = 0;
      for (const item of items) {
        const name = item.name!.trim();
        const description = item.description?.trim() || "待补充外貌、身份和核心动机。";
        const actingBaseline = item.actingBaseline?.trim() || "表演自然，情绪随冲突递进。";
        const gender = item.gender ?? guessGender(`${name} ${description} ${actingBaseline}`);
        const voiceId = pickStageVoice(gender, `${description} ${actingBaseline}`);
        const weight = Math.max(60, Math.min(100, Number(item.consistencyWeight) || 85));
        const fresh = useStudioStore.getState().series.bible;
        const existing = fresh.find((el) => el.kind === "character" && el.name === name);
        if (existing) {
          updateElement(existing.id, { description, actingBaseline, consistencyWeight: weight, voiceId });
        } else {
          addElement({ kind: "character", name, description, actingBaseline, consistencyWeight: weight, voiceId, refImages: [] });
        }
        changed += 1;
      }
      return `已补全 ${changed} 个角色设定，并按人物气质推荐音色。接下来可上传正面、侧面、表情参考图。`;
    }

    const items = (plan.locations ?? []).filter((item) => item.name?.trim());
    if (!items.length) return "AI 没返回可用场景。换个描述再试一次。";
    let changed = 0;
    for (const item of items) {
      const name = item.name!.trim();
      const description = item.description?.trim() || "待补充空间结构、光线和可识别道具。";
      const weight = Math.max(55, Math.min(100, Number(item.consistencyWeight) || 80));
      const fresh = useStudioStore.getState().series.bible;
      const existing = fresh.find((el) => el.kind === "location" && el.name === name);
      if (existing) updateElement(existing.id, { description, consistencyWeight: weight });
      else addElement({ kind: "location", name, description, consistencyWeight: weight, refImages: [] });
      changed += 1;
    }
    return `已补全 ${changed} 个场景设定。建议为核心场景上传主视角、侧向、反向参考图。`;
  };

  const applyAudioAssistant = async (text: string): Promise<string> => {
    const chars = useStudioStore.getState().series.bible.filter((e) => e.kind === "character");
    if (!chars.length) return "先在角色节点创建人物，再为每个角色推荐音色。";
    let changed = 0;
    for (const c of chars) {
      const tone = `${text} ${c.name} ${c.description || ""} ${c.actingBaseline || ""}`;
      const voiceId = pickStageVoice(guessGender(tone), tone);
      updateElement(c.id, { voiceId });
      changed += 1;
    }
    const names = chars.map((c) => {
      const voiceId = pickStageVoice(guessGender(`${text} ${c.name} ${c.description || ""} ${c.actingBaseline || ""}`), `${text} ${c.description || ""} ${c.actingBaseline || ""}`);
      const v = getVoice(voiceId);
      return `${c.name}:${v?.zh || voiceId}`;
    });
    return `已为 ${changed} 个角色推荐音色。${names.join("，")}。BGM 可在左侧上传，配音生成会使用这些角色音色。`;
  };

  const applyEditAssistant = async (text: string): Promise<string> => {
    const editPatch: NonNullable<Series["editConfig"]> = {};
    if (/字幕.*(居中|中间)/.test(text)) editPatch.captionPosition = "center";
    if (/字幕.*顶部|上方/.test(text)) editPatch.captionPosition = "top";
    if (/字幕.*底部|下方/.test(text)) editPatch.captionPosition = "bottom";
    if (/大字幕|字号.*(大|32|36|40)/.test(text)) editPatch.captionSizePx = 34;
    if (/小字幕|字号.*(小|20|22)/.test(text)) editPatch.captionSizePx = 22;
    if (/擦除/.test(text)) editPatch.transitionType = "wipeleft";
    if (/滑入|右滑/.test(text)) editPatch.transitionType = "slideright";
    if (/开圆|圆形/.test(text)) editPatch.transitionType = "circleopen";
    if (/淡入|淡出|淡化|柔和/.test(text)) editPatch.transitionType = "fade";
    if (/快切|硬切|无转场/.test(text)) editPatch.crossfadeSec = 0;
    if (/柔和|慢转场|长转场/.test(text)) editPatch.crossfadeSec = 0.8;
    if (Object.keys(editPatch).length) {
      setSeries({ editConfig: { ...useStudioStore.getState().series.editConfig, ...editPatch } });
    }
    const currentSeries = useStudioStore.getState().series;
    const ep = activeEp ?? currentSeries.episodes[0];
    if (!ep) return "还没有剧集，先生成分镜后再合成。";
    const { project, stats } = seriesToEditorProject(ep, currentSeries, jobById);
    if (/(导入|剪辑器|合成|精修|时间线)/.test(text)) {
      if (stats.ok === 0) return "当前没有可导入的画面素材，先在逐镜画面生成或上传画面。";
      editorLoadProject(project);
      return `已把 ${stats.ok} 条可用素材导入剪辑器。可以去剪辑页继续卡点、字幕和转场。`;
    }
    const changed = Object.keys(editPatch).length ? "已更新合成参数。" : "";
    return `${changed}当前可合成素材 ${stats.ok} 条，缺失 ${stats.skipped} 条。输入“导入剪辑器”即可生成剪辑项目。`;
  };

  const applyExportAssistant = async (text: string): Promise<string> => {
    if (text.includes("16:9") || /横屏/.test(text)) setSeries({ aspect: "16:9" });
    if (text.includes("1:1") || /方形/.test(text)) setSeries({ aspect: "1:1" });
    if (text.includes("9:16") || /竖屏|抖音|快手|视频号|小红书/.test(text)) setSeries({ aspect: "9:16" });
    const exportPatch: NonNullable<Series["exportConfig"]> = {};
    if (/4k|2160/i.test(text)) exportPatch.height = 2160;
    else if (/720/.test(text)) exportPatch.height = 720;
    else if (/1080|高清/.test(text)) exportPatch.height = 1080;
    const platformNames = ["抖音", "快手", "视频号", "B 站", "小红书"];
    const selectedPlatforms = platformNames.filter((name) => text.includes(name.replace(" ", "")) || text.includes(name));
    if (/全平台|全部平台|一键分发/.test(text)) exportPatch.platforms = platformNames;
    else if (selectedPlatforms.length) exportPatch.platforms = selectedPlatforms;
    if (Object.keys(exportPatch).length) {
      setSeries({ exportConfig: { ...useStudioStore.getState().series.exportConfig, ...exportPatch } });
    }
    const st = useStudioStore.getState();
    const shots = st.series.episodes.flatMap((ep) => ep.scenes.flatMap((sc) => sc.shots));
    const jm = new Map(st.jobs.map((j) => [j.id, j] as const));
    const visual = shots.filter((shot) => shotVideoUrl(shot, jm) || shotImageUrl(shot, jm)).length;
    const voice = shots.filter((shot) => shotVoiceUrl(shot)).length;
    return `已按你的分发意图更新画幅为 ${useStudioStore.getState().series.aspect}。发布检查：共 ${shots.length} 镜，画面 ${visual} 镜，声音 ${voice} 镜。`;
  };

  // 对话框 send → 各阶段把 AI 回复落入 store，避免只停留在聊天文本
  const WRITE_SCOPES = new Set(["global", "idea", "outline", "episodes", "frames"]);
  const handleChat = async (scopeId: string, text: string): Promise<string> => {
    const st = FLOW_STAGES.find((s) => s.id === scopeId);
    if (scopeId === "character" || scopeId === "scene") return applyAssetAssistant(scopeId, text);
    if (scopeId === "audio") return applyAudioAssistant(text);
    if (scopeId === "edit") return applyEditAssistant(text);
    if (scopeId === "export") return applyExportAssistant(text);
    if (!WRITE_SCOPES.has(scopeId)) return `收到 ✦ 我来处理「${st?.title ?? "这里"}」相关的修改（也可点节点上的「生成」直接出内容）。`;
    let epId = activeEp?.id;
    if (!epId) {
      epId = addEpisode("第 1 集");
      setActiveEp(epId);
    }
    const ep = useStudioStore.getState().series.episodes.find((e) => e.id === epId);
    if (!ep) return "请先新建一集，再生成分镜。";
    const count = await writeBeatsToEpisode(ep.id, text);
    if (!count) return "AI 没返回有效分镜，换个描述再试试。";
    const fixed = repairEpisodeRefsForGeneration(ep.id);
    flash(`已生成 ${count} 个分镜${fixed ? `，并修复 ${fixed} 项引用` : ""}，切到「逐镜画面」查看并出图`, true);
    return `已生成 ${count} 个分镜，填进了「逐镜画面」节点。你可以继续逐镜编辑对白、画面提示词和角色场景引用。`;
  };

  // 键盘：esc 关闭 · 1-9 切阶段 · F 放映
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "Escape") {
        if (theaterOpen) setTheaterOpen(false);
        else setSelectedId(null);
      } else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) {
        if (film.shots.length) { setTheaterOpen(true); e.preventDefault(); }
      } else if (/^[1-9]$/.test(e.key)) {
        const st = FLOW_STAGES[Number(e.key) - 1];
        if (st) { setSelectedId(st.id); e.preventDefault(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [film.shots.length, theaterOpen]);

  return (
    <div className="app sf-app">
      {!localAuthBypass && !authLoading && !user && (
        <div className="sf-authgate">
          <div className="sf-authgate-card">
            <div className="sf-authgate-ico"><FlowIcon n="layers" s={30} sw={1.6} /></div>
            <h2 className="sf-authgate-h">登录后管理你的短剧项目</h2>
            <p className="sf-authgate-p">项目按账号隔离、云端保存、跨设备同步</p>
            <a href={hp("/login")} className="sf-authgate-btn">去登录 / 注册</a>
          </div>
        </div>
      )}
      {/* 全站顶栏 */}
      <header className="chrome">
        <div className="left">
          <Link href={hp("/")} className="logo-link" style={{ textDecoration: "none" }}>
            <div className="logo">Frame<span style={{ color: "var(--accent)" }}>/</span>0 <b>STAGE</b></div>
          </Link>
          <FlowProjectMenu />
        </div>
        <TopNav />
        <div className="right">
          <button className={`btn sm${pipeState ? " generating" : ""}`} onClick={() => setBatchOpen(true)}>
            {pipeState ? (<><span className="sf-bspin" />{pipeState.label ? `${PIPE_STEPS.find((s) => s.id === pipeState.cur)?.[zh ? "zh" : "en"] || ""} ${pipeState.label}` : (zh ? "生成中…" : "Running…")}</>) : (<><FlowIcon n="sparkles" s={13} sw={2} />{zh ? "批量" : "Batch"}</>)}
          </button>
          <button className="btn primary" onClick={() => setTheaterOpen(true)} disabled={film.shots.length === 0}>
            <FlowIcon n="play" s={14} sw={2.2} /> {zh ? "预览成片" : "Preview"}
          </button>
        </div>
      </header>

      {/* 节点画布工作区 */}
      <div className="sf-root">
        <FlowStepper status={status} selectedId={selectedId} onSelect={handleSelect} onHover={setHoveredStepId} hoveredId={hoveredStepId} progress={progress} />
        <div className="sf-stage">
          <FlowCanvas series={series} jobById={jobById} status={status} meta={meta}
            selectedId={selectedId} onSelect={handleSelect} hoveredId={hoveredStepId} onHover={setHoveredStepId}
            onGenerate={handleGenerate} onSend={handleChat} />
          {toast && (
            <div className="sf-toast show">
              <div className="sf-toast-ic" style={{ background: toast.ok ? "var(--ok-soft)" : "var(--ac-soft)", color: toast.ok ? "var(--ok)" : "var(--ac-2)" }}>
                <FlowIcon n={toast.ok ? "check" : "sparkles"} s={13} sw={2.2} />
              </div>
              {toast.text}
            </div>
          )}
        </div>
      </div>

      {/* 批量生成面板 */}
      {batchOpen && (
        <div className="sf-batch-scrim" onClick={() => !pipeState && setBatchOpen(false)}>
          <div className="sf-batch" onClick={(e) => e.stopPropagation()}>
            <div className="sf-batch-head">
              <span>{pipeState ? (zh ? "生成中…" : "Generating…") : (zh ? "▶ 批量生成" : "▶ Batch Generate")}</span>
              {!pipeState && <button className="sf-card-x" onClick={() => setBatchOpen(false)}><FlowIcon n="x" s={14} sw={2} /></button>}
            </div>
            {!pipeState ? (
              <>
                <div className="sf-batch-presets">
                  {PIPE_PRESETS.map((p) => {
                    const match = p.steps.every((s) => batchChecked.has(s)) && batchChecked.size === p.steps.length;
                    return (
                      <button key={p.zh} className={`sf-batch-preset${match ? " on" : ""}`}
                        onClick={() => setBatchChecked(new Set(p.steps))}>{zh ? p.zh : p.en}</button>
                    );
                  })}
                </div>
                <div className="sf-batch-list">
                  {PIPE_STEPS.map((s) => {
                    const cnt = pendingCounts[s.id as keyof typeof pendingCounts] ?? 0;
                    const disabled = s.id === "frames_vid" && series.kind === "comic";
                    return (
                      <button key={s.id} disabled={disabled}
                        className={`sf-batch-item${batchChecked.has(s.id) ? " on" : ""}${disabled ? " disabled" : ""}`}
                        onClick={() => {
                          const n = new Set(batchChecked);
                          if (batchChecked.has(s.id)) n.delete(s.id);
                          else n.add(s.id);
                          setBatchChecked(n);
                        }}>
                        <span className="sf-batch-check">{batchChecked.has(s.id) ? "●" : "○"}</span>
                        <span className="sf-batch-no">{s.no}</span>
                        <span className="sf-batch-label">{zh ? s.zh : s.en}</span>
                        <span className="sf-batch-cnt">{cnt ? `${cnt} ${zh ? "待处理" : "pending"}` : (zh ? "✓ 就绪" : "✓ done")}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="sf-batch-foot">
                  <button className="btn ghost sm" onClick={() => setBatchOpen(false)}>{zh ? "取消" : "Cancel"}</button>
                  <button className="btn primary sm" disabled={batchChecked.size === 0}
                    onClick={() => runPipeline(PIPE_ORDER.filter((s) => batchChecked.has(s)))}>{zh ? `开始 (${batchChecked.size} 步)` : `Start (${batchChecked.size} steps)`}</button>
                </div>
              </>
            ) : (
              <>
                <div className="sf-batch-list">
                  {pipeState.steps.map((sid) => {
                    const s = PIPE_STEPS.find((x) => x.id === sid);
                    if (!s) return null;
                    const isDone = pipeState.done.includes(sid);
                    const isCur = pipeState.cur === sid;
                    return (
                      <div key={sid} className={`sf-batch-prog${isDone ? " done" : ""}${isCur ? " active" : ""}`}>
                        <span className="sf-batch-prog-ico">{isDone ? "✓" : isCur ? <span className="sf-bspin" /> : "○"}</span>
                        <span className="sf-batch-prog-label">{zh ? s.zh : s.en}</span>
                        {isCur && pipeState.label && <span className="sf-batch-prog-detail">{pipeState.label}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="sf-batch-foot">
                  <button className="btn ghost sm" onClick={stopPipeline}>{zh ? "⏹ 停止" : "⏹ Stop"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 全屏放映 */}
      {theaterOpen && (
        <CinemaTheater shots={film.shots} cur={pb.cur} paused={pb.paused}
          onExit={() => setTheaterOpen(false)} onSelect={pb.go} />
      )}
    </div>
  );
}
