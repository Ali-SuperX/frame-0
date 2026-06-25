"use client";

// FlowStageBody — 各阶段 Inspector 内容（接真实 store 数据）
import type { ChangeEvent } from "react";
import { useStudioStore, type Series, type Job, type StageElement, type StageShot } from "@/lib/store";
import { shotImageUrl, shotVideoUrl, shotVoiceUrl } from "@/lib/stage/stageGen";
import { type FlowStage, type FlowStatus } from "@/lib/stage/flowStages";
import { FlowIcon, Placeholder, GRADS, portraitGrad } from "./FlowIcon";
import StageGenControls from "./StageGenControls";
import { TTS_VOICES } from "@/lib/r2v/ttsVoices";
import { storeLocalFile } from "@/lib/editor/localFiles";
import { uploadMediaFile } from "@/components/studio/uploadMedia";
import { suggestedElementRefsForShot } from "@/lib/stage/shotRefs";

const TEXT_UPLOAD_ACCEPT = ".txt,.md,.markdown,.json,.csv,.srt,text/*";
const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const AUDIO_UPLOAD_ACCEPT = "audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg";
const IMAGE_REF_UPLOAD_MODEL = "qwen-image-edit";
const SHOT_IMAGE_UPLOAD_MODEL = "happyhorse-1.1-i2v";
const EXPORT_PLATFORMS = ["抖音", "快手", "视频号", "B 站", "小红书"];
const TRANSITION_OPTIONS = [
  { value: "fade", label: "淡入淡出" },
  { value: "wipeleft", label: "左擦除" },
  { value: "slideright", label: "右滑入" },
  { value: "circleopen", label: "开圆" },
] as const;

type RefAngle = NonNullable<StageElement["refImages"][number]["angle"]>;
type RefSlot = { angle: RefAngle; label: string };

const CHARACTER_REF_SLOTS: RefSlot[] = [
  { angle: "front", label: "正面" },
  { angle: "side", label: "侧面" },
  { angle: "expr", label: "表情" },
];

const SCENE_REF_SLOTS: RefSlot[] = [
  { angle: "front", label: "主视角" },
  { angle: "side", label: "侧向" },
  { angle: "back", label: "反向" },
];

function refDisplayUrl(ref: StageElement["refImages"][number] | undefined): string | undefined {
  return ref?.previewUrl || ref?.localPath || ref?.thumbDataUrl || ref?.url;
}

function elementCoverRef(element: StageElement) {
  return element.refImages.find((r) => r.angle === "front") ?? element.refImages[0];
}

function elementRefCount(element: StageElement) {
  return element.refImages.filter((r) => r.url || r.previewUrl || r.localPath || r.thumbDataUrl).length;
}

function shotConsistencyReport(shot: StageShot, series: Series) {
  const refs = shot.elementRefs
    .map((id) => series.bible.find((el) => el.id === id))
    .filter((el): el is StageElement => !!el);
  const chars = refs.filter((el) => el.kind === "character");
  const locs = refs.filter((el) => el.kind === "location");
  const missing = refs.filter((el) => elementRefCount(el) === 0);
  const issues: string[] = [];
  const speakerId = shot.dialogue?.[0]?.speakerId;

  if (speakerId && !shot.elementRefs.includes(speakerId)) issues.push("说话角色未绑定");
  if (!chars.length) issues.push("缺角色");
  if (!locs.length) issues.push("缺场景");
  if (missing.length) issues.push(`${missing.map((el) => el.name).join("、")}缺参考`);
  if (chars.length > 3) issues.push("多人镜头建议拆分");
  if (!shot.imagePrompt?.trim() && !shot.narration?.trim() && !(shot.dialogue?.[0]?.line?.trim())) issues.push("缺画面描述");

  return {
    ok: issues.length === 0,
    label: issues.length === 0 ? `一致性就绪 · ${chars.length} 角色 · ${locs.length} 场景` : `${issues.length} 项待补`,
    issues,
  };
}

type StageShotRow = { sh: StageShot; epId: string; sceneId: string; epTitle?: string; epNum?: number };

function shotReadableText(shot: StageShot) {
  return shot.narration || shot.dialogue?.[0]?.line || shot.imagePrompt || "未填写内容";
}

function shotProductionIssues(shot: StageShot, series: Series, jobById: Map<string, Job>) {
  const issues: string[] = [];
  const visual = shotVideoUrl(shot, jobById) || shotImageUrl(shot, jobById);
  const hasImage = !!shotImageUrl(shot, jobById);
  const hasVideo = !!shotVideoUrl(shot, jobById);
  const line = shot.narration?.trim() || shot.dialogue?.[0]?.line?.trim();
  const report = shotConsistencyReport(shot, series);

  if (!line && !shot.imagePrompt?.trim()) issues.push("缺文本");
  if (!report.ok) issues.push(...report.issues);
  if (!visual) issues.push("缺画面");
  if (series.kind === "short" && hasImage && !hasVideo) issues.push("待视频");
  if (line && !shotVoiceUrl(shot)) issues.push("待配音");

  return {
    ok: issues.length === 0,
    issues,
    hasImage,
    hasVideo,
    hasVoice: !!shotVoiceUrl(shot),
    hasVisual: !!visual,
  };
}

function productionSummary(rows: StageShotRow[], series: Series, jobById: Map<string, Job>) {
  const items = rows.map((row) => ({ row, state: shotProductionIssues(row.sh, series, jobById) }));
  return {
    items,
    shots: rows.length,
    visual: items.filter((item) => item.state.hasVisual).length,
    video: items.filter((item) => item.state.hasVideo).length,
    voice: items.filter((item) => item.state.hasVoice).length,
    clean: items.filter((item) => item.state.ok).length,
    issueRows: items.filter((item) => !item.state.ok),
  };
}

function sameRefSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function rowHasAutoRefFix(row: StageShotRow, series: Series) {
  const hasLocation = series.bible.some((el) => el.kind === "location");
  const lacksLocation = !row.sh.elementRefs.some((id) => series.bible.find((el) => el.id === id)?.kind === "location");
  const suggestedRefs = suggestedElementRefsForShot(row.sh, series);
  return (!hasLocation && lacksLocation) || !sameRefSet(row.sh.elementRefs ?? [], suggestedRefs);
}

async function readTextUpload(e: ChangeEvent<HTMLInputElement>, onText: (text: string) => void) {
  const input = e.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = (await file.text()).replace(/^\uFEFF/, "").trim();
    if (text) onText(text);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : "文本读取失败");
  } finally {
    input.value = "";
  }
}

function TextUploadButton({ onText }: { onText: (text: string) => void }) {
  return (
    <label className="sf-text-upload" title="上传文本">
      <input
        type="file"
        accept={TEXT_UPLOAD_ACCEPT}
        onChange={(e) => { void readTextUpload(e, onText); }}
      />
      <FlowIcon n="export" s={12} sw={2} />
      <span>上传文本</span>
    </label>
  );
}

async function persistLocalUpload(file: File, keyPrefix: string) {
  const localKey = `${keyPrefix}-${Date.now()}-${file.name}`;
  await storeLocalFile(localKey, file);
  return {
    url: URL.createObjectURL(file),
    localKey,
    mime: file.type || "application/octet-stream",
    name: file.name,
  };
}

export default function FlowStageBody({
  stage, status: _status, series, jobById,
}: {
  stage: FlowStage;
  status: FlowStatus;
  series: Series;
  jobById: Map<string, Job>;
}) {
  const setSeries = useStudioStore((s) => s.setSeries);
  const addElement = useStudioStore((s) => s.seriesAddElement);
  const updateElement = useStudioStore((s) => s.seriesUpdateElement);
  const removeElement = useStudioStore((s) => s.seriesRemoveElement);
  const removeShot = useStudioStore((s) => s.seriesRemoveShot);
  const addShot = useStudioStore((s) => s.seriesAddShot);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const updateEpisode = useStudioStore((s) => s.seriesUpdateEpisode);
  const addEpisode = useStudioStore((s) => s.seriesAddEpisode);
  const removeEpisode = useStudioStore((s) => s.seriesRemoveEpisode);
  const setBgm = useStudioStore((s) => s.seriesSetBgm);
  const createJobFromPayload = useStudioStore((s) => s.createJobFromPayload);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const activeEpId = useStudioStore((s) => s.activeEpId);
  const setActiveEp = useStudioStore((s) => s.setActiveEp);
  const id = stage.id;
  const setEditConfig = (patch: NonNullable<Series["editConfig"]>) => setSeries({ editConfig: { ...series.editConfig, ...patch } });
  const setExportConfig = (patch: NonNullable<Series["exportConfig"]>) => setSeries({ exportConfig: { ...series.exportConfig, ...patch } });

  async function uploadElementRef(elId: string, file: File, angle: RefAngle = "front") {
    try {
      const media = await uploadMediaFile(file, series.genConfig?.image?.modelId ?? IMAGE_REF_UPLOAD_MODEL);
      const current = useStudioStore.getState().series.bible.find((el) => el.id === elId);
      const refs = current?.refImages ?? [];
      const idx = refs.findIndex((r) => r.angle === angle);
      const next = [...refs];
      const ref = {
        url: media.url,
        previewUrl: media.previewUrl,
        localPath: media.localPath,
        thumbDataUrl: media.thumbDataUrl,
        localKey: media.localKey,
        name: media.name,
        mime: media.mime,
        angle,
      };
      if (idx >= 0) next[idx] = ref;
      else next.push(ref);
      updateElement(elId, { refImages: next });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "参考图上传失败");
    }
  }

  async function uploadShotImage(epId: string, sceneId: string, shotId: string, file: File) {
    try {
      const media = await uploadMediaFile(file, series.genConfig?.video?.modelId ?? SHOT_IMAGE_UPLOAD_MODEL);
      const fresh = useStudioStore.getState().series;
      const shot = fresh.episodes
        .find((ep) => ep.id === epId)?.scenes
        .find((sc) => sc.id === sceneId)?.shots
        .find((sh) => sh.id === shotId);
      const prompt = shot?.imagePrompt || shot?.narration || shot?.dialogue?.[0]?.line || "(user-uploaded)";
      const jobId = createJobFromPayload({
        modelId: "manual-upload",
        mode: "t2i",
        params: {},
        media: { img_url: media },
        prompt,
        title: `[Stage] ${shot?.idx ?? ""} 上传画面`,
      });
      setJobStatus(jobId, { status: "done" });
      updateShot(epId, sceneId, shotId, { imageJobId: jobId });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "上传失败");
    }
  }

  async function uploadBgm(file: File) {
    try {
      const media = await persistLocalUpload(file, "stage-bgm");
      setBgm({ sourceUrl: media.url, sourceTitle: media.name, volume: 0.45, localKey: media.localKey, mime: media.mime });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "上传失败");
    }
  }

  function repairShotRefs(items: { sh: StageShot; epId: string; sceneId: string }[]) {
    let workingSeries = useStudioStore.getState().series;
    const hasLocation = workingSeries.bible.some((el) => el.kind === "location");
    const needsLocation = items.some((item) =>
      !item.sh.elementRefs.some((id) => workingSeries.bible.find((el) => el.id === id)?.kind === "location")
    );
    if (!hasLocation && needsLocation && items.length) {
      addElement({
        kind: "location",
        name: "核心场景",
        description: series.synopsis ? `${series.synopsis} 的主要发生空间，保持统一空间结构、光线方向和关键道具。` : "主要发生空间，保持统一空间结构、光线方向和关键道具。",
        consistencyWeight: 80,
        refImages: [],
      });
      workingSeries = useStudioStore.getState().series;
    }
    for (const item of items) {
      const nextRefs = suggestedElementRefsForShot(item.sh, workingSeries);
      if (!sameRefSet(item.sh.elementRefs ?? [], nextRefs)) {
        updateShot(item.epId, item.sceneId, item.sh.id, { elementRefs: nextRefs });
      }
    }
  }

  function repairableCount(items: { sh: StageShot; epId: string; sceneId: string }[]) {
    const hasLocation = series.bible.some((el) => el.kind === "location");
    const needsLocation = items.some((item) =>
      !item.sh.elementRefs.some((id) => series.bible.find((el) => el.id === id)?.kind === "location")
    );
    const refFixes = items.filter((item) => !sameRefSet(item.sh.elementRefs ?? [], suggestedElementRefsForShot(item.sh, series))).length;
    return refFixes + (!hasLocation && needsLocation && items.length ? 1 : 0);
  }

  // ── 创意 · 题材 ──
  if (id === "idea") {
    return (
      <div className="sf-fade-up">
        <StageGenControls step="script" />
        <div className="sf-field">
          <div className="sf-sec-label sf-sec-label-actions">
            <span>一句话灵感 · Logline</span>
            <TextUploadButton onText={(text) => setSeries({ synopsis: text })} />
          </div>
          <textarea className="sf-ta sf-ta-story" rows={6} value={series.synopsis ?? ""}
            onChange={(e) => setSeries({ synopsis: e.target.value })}
            placeholder="用一句话描述你的故事，AI 据此驱动全流程创作…" />
        </div>
        <div className="sf-field">
          <div className="sf-sec-label">生产规格</div>
          <div className="sf-spec-row">
            {(["short", "comic"] as const).map((kind) => (
              <button key={kind} className={`sf-spec-btn${series.kind === kind ? " on" : ""}`} onClick={() => setSeries({ kind })}>
                {kind === "short" ? "短剧" : "漫剧"}
              </button>
            ))}
            {(["9:16", "16:9", "1:1"] as const).map((aspect) => (
              <button key={aspect} className={`sf-spec-btn${series.aspect === aspect ? " on" : ""}`} onClick={() => setSeries({ aspect })}>
                {aspect}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 剧本大纲 ──
  if (id === "outline") {
    const eps = series.episodes;
    return (
      <div className="sf-fade-up">
        <StageGenControls step="script" />
        <div className="sf-field">
          <div className="sf-sec-label sf-sec-label-actions">
            <span>全剧大纲</span>
            <TextUploadButton onText={(text) => setSeries({ synopsis: text })} />
          </div>
          <textarea className="sf-ta" rows={5} value={series.synopsis ?? ""}
            onChange={(e) => setSeries({ synopsis: e.target.value })}
            placeholder="上传或输入完整故事大纲、人物关系、关键反转和结尾。" />
        </div>
        <div className="sf-sec-label">分集梗概<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>{eps.length} EP</span></div>
        {!eps.length && <Empty ico="outline" title="尚无大纲" desc="先添加一集，或在右侧 AI 输入框里让模型生成分集梗概。" />}
        {eps.map((ep) => (
          <div className="sf-beat" key={ep.id}>
            <div className="sf-beat-no">{String(ep.num).padStart(2, "0")}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input className="sf-beat-tt-in" value={ep.title} onChange={(e) => updateEpisode(ep.id, { title: e.target.value })} placeholder="本集标题" />
              <textarea className="sf-beat-tx-in" value={ep.synopsis ?? ""} onChange={(e) => updateEpisode(ep.id, { synopsis: e.target.value })} placeholder="一句话梗概…" rows={2} />
            </div>
          </div>
        ))}
        <button className="sf-add-card sf-add-row" onClick={() => { const nid = addEpisode(`第 ${eps.length + 1} 集`); setActiveEp(nid); }}>
          <FlowIcon n="plus" s={16} />添加分集梗概
        </button>
      </div>
    );
  }

  // ── 分集 · 分镜 ──
  if (id === "episodes") {
    const eps = series.episodes;
    const activeEp = eps.find((ep) => ep.id === activeEpId) ?? eps[0];
    const activeScene = activeEp?.scenes[0];
    const activeShots = activeEp?.scenes.flatMap((sc) => sc.shots.map((sh) => ({ sh, sceneId: sc.id }))) ?? [];
    const elements = series.bible.filter((e) => e.kind === "character" || e.kind === "location" || e.kind === "prop");
    const repairItems = activeEp ? activeShots.map(({ sh, sceneId }) => ({ sh, sceneId, epId: activeEp.id })) : [];
    const repairCount = repairableCount(repairItems);
    return (
      <div className="sf-fade-up">
        <StageGenControls step="script" />
        <div className="sf-sec-label">分集列表<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>{eps.length} 集 · 点击切换当前集</span></div>
        {!eps.length && <p className="sf-hint-line">还没有剧集。新建一集，或在创意对话里让 AI 拆分镜。</p>}
        {eps.map((ep) => {
          const shots = ep.scenes.flatMap((sc) => sc.shots);
          const ready = shots.length > 0;
          const active = ep.id === activeEpId;
          return (
            <div className={`sf-beat sf-beat-ep${active ? " on" : ""}`} key={ep.id} style={{ alignItems: "center" }} onClick={() => setActiveEp(ep.id)}>
              <div className="sf-beat-no" style={{ fontSize: 9.5, width: 34 }}>{ep.num}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sf-beat-tt">{ep.title}{active && <span className="sf-ep-cur">当前</span>}</div>
                <div className="sf-beat-tx mono">{ready ? `${shots.length} 镜 · ${ep.scenes.length} 场` : "待拆解"}</div>
              </div>
              {ready
                ? <span className="sf-chip ok"><FlowIcon n="check" s={11} sw={2.5} /></span>
                : <span className="sf-chip empty">待生成</span>}
              <button className="sf-beat-del" title="删除本集" onClick={(e) => { e.stopPropagation(); if (window.confirm(`删除「${ep.title}」？此集分镜会一并删除。`)) removeEpisode(ep.id); }}><FlowIcon n="close" s={12} sw={2.2} /></button>
            </div>
          );
        })}
        <button className="sf-add-card sf-add-row" onClick={() => { const nid = addEpisode(`第 ${eps.length + 1} 集`); setActiveEp(nid); }}>
          <FlowIcon n="plus" s={16} />添加新一集
        </button>
        {activeEp && (
          <div className="sf-episode-editor">
            <div className="sf-sec-label sf-sec-label-actions">
              <span>当前集分镜</span>
              <TextUploadButton onText={(text) => updateEpisode(activeEp.id, { synopsis: text })} />
              <button className="sf-text-upload" disabled={!repairCount} onClick={() => repairShotRefs(repairItems)} title="按说话人和文本自动绑定角色场景">
                <FlowIcon n="target" s={12} sw={2} />
                <span>修复引用{repairCount ? ` ${repairCount}` : ""}</span>
              </button>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ac-2)" }}>{activeEp.title}</span>
            </div>
            <textarea className="sf-ta" rows={3} value={activeEp.synopsis ?? ""}
              onChange={(e) => updateEpisode(activeEp.id, { synopsis: e.target.value })}
              placeholder="本集剧情概要、情绪变化和结尾钩子。" />
            {!activeShots.length && <p className="sf-hint-line">本集还没有镜头。添加镜头后，逐镜画面和配音步骤会直接使用这里的内容。</p>}
            {activeShots.map(({ sh, sceneId }) => {
              const line = sh.narration ?? sh.dialogue?.[0]?.line ?? "";
              const consistency = shotConsistencyReport(sh, series);
              return (
                <div className="sf-script-shot" key={sh.id}>
                  <div className="sf-script-shot-head">
                    <span>SHOT {String(sh.idx).padStart(2, "0")}</span>
                    <select value={sh.shotType} onChange={(e) => updateShot(activeEp.id, sceneId, sh.id, { shotType: e.target.value as typeof sh.shotType })}>
                      {["live", "still", "zoom-in", "zoom-out", "pan-lr", "parallax", "ots", "pov", "dutch", "hero"].map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <label>
                      <input type="range" min={2} max={12} step={1} value={sh.durationSec} onChange={(e) => updateShot(activeEp.id, sceneId, sh.id, { durationSec: Number(e.target.value) })} />
                      <b>{sh.durationSec}s</b>
                    </label>
                    <button onClick={() => removeShot(activeEp.id, sceneId, sh.id)} title="删除镜头"><FlowIcon n="close" s={12} sw={2.3} /></button>
                  </div>
                  <textarea className="sf-shot-textarea sf-script-line" value={line} rows={2}
                    onChange={(e) => sh.dialogue?.length
                      ? updateShot(activeEp.id, sceneId, sh.id, { dialogue: [{ ...sh.dialogue[0], line: e.target.value }] })
                      : updateShot(activeEp.id, sceneId, sh.id, { narration: e.target.value })}
                    placeholder="旁白或对白" />
                  <textarea className="sf-shot-prompt" value={sh.imagePrompt ?? ""} rows={2}
                    onChange={(e) => updateShot(activeEp.id, sceneId, sh.id, { imagePrompt: e.target.value })}
                    placeholder="画面提示词：角色动作、构图、光线、情绪。" />
                  <div className="sf-ref-row">
                    {elements.map((el) => {
                      const on = sh.elementRefs.includes(el.id);
                      const count = elementRefCount(el);
                      return (
                        <button key={el.id} className={`sf-ref-chip${on ? " on" : ""}${count ? "" : " missing"}`} onClick={() => {
                          const refs = sh.elementRefs ?? [];
                          updateShot(activeEp.id, sceneId, sh.id, { elementRefs: on ? refs.filter((x) => x !== el.id) : [...refs, el.id] });
                        }}>
                          {el.name}<small>{count ? `${count}图` : "待图"}</small>
                        </button>
                      );
                    })}
                  </div>
                  <ConsistencyBadge report={consistency} />
                </div>
              );
            })}
            <button className="sf-add-card sf-add-row" onClick={() => {
              const sceneId = activeScene?.id ?? addScene(activeEp.id, { castIds: [] });
              addShot(activeEp.id, sceneId, { narration: "", durationSec: series.kind === "comic" ? 4 : 5, elementRefs: elements.slice(0, 2).map((el) => el.id) });
            }}>
              <FlowIcon n="plus" s={16} />添加镜头
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── 角色设定 ──
  if (id === "character") {
    const chars = series.bible.filter((e) => e.kind === "character");
    return (
      <div className="sf-fade-up">
        <StageGenControls step="portrait" />
        <div className="sf-sec-label">主要角色<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>{chars.length} 角色</span></div>
        {!chars.length && <p className="sf-hint-line">还没有角色。添加主角，再用「AI 生成」出立绘，逐镜出图才能保持人物一致。</p>}
        <div className="sf-card-grid">
          {chars.map((c, i) => {
            const coverUrl = refDisplayUrl(elementCoverRef(c));
            const refCount = elementRefCount(c);
            return (
            <div className="sf-mini-card sf-cast-card" key={c.id}>
              <div className="sf-mc-img">
                {coverUrl ? <img src={coverUrl} alt={c.name} /> : <Placeholder grad={portraitGrad(i + 3)} comic={series.kind === "comic"} />}
                <label className="sf-media-upload" title="上传角色参考图">
                  <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void uploadElementRef(c.id, f, "front"); e.currentTarget.value = ""; }} />
                  <FlowIcon n="export" s={12} sw={2} />参考图
                </label>
                <button className="sf-mc-del" onClick={() => removeElement(c.id)} title="删除角色"><FlowIcon n="close" s={12} sw={2.4} /></button>
              </div>
              <div className="sf-mc-body">
                <div className={`sf-asset-status${refCount > 0 ? " ok" : ""}`}>{refCount > 0 ? `${refCount} 张参考已就绪` : "缺少角色参考"}</div>
                <input className="sf-mc-in sf-mc-in-name" value={c.name} onChange={(e) => updateElement(c.id, { name: e.target.value })} placeholder="角色名" />
                <textarea className="sf-mc-ta" value={c.description ?? ""} onChange={(e) => updateElement(c.id, { description: e.target.value })} placeholder="外貌、身份、服装、性格锚点…" rows={3} />
                <input className="sf-mc-in sf-mc-in-role" value={c.actingBaseline ?? ""} onChange={(e) => updateElement(c.id, { actingBaseline: e.target.value })} placeholder="表演基线：口癖 / 情绪 / 节奏" />
                <RefSlotGrid element={c} slots={CHARACTER_REF_SLOTS} onUpload={(angle, file) => uploadElementRef(c.id, file, angle)} />
                <label className="sf-mini-field">
                  <span>一致性</span>
                  <input type="range" min={40} max={100} step={5} value={c.consistencyWeight ?? 85} onChange={(e) => updateElement(c.id, { consistencyWeight: Number(e.target.value) })} />
                  <b>{c.consistencyWeight ?? 85}</b>
                </label>
                <label className="sf-mini-field full">
                  <span>音色</span>
                  <select value={c.voiceId ?? ""} onChange={(e) => updateElement(c.id, { voiceId: e.target.value || undefined })}>
                    <option value="">默认</option>
                    {TTS_VOICES.filter((v) => v.group === "qwen3").map((v) => <option key={v.id} value={v.id}>{v.zh} · {v.desc}</option>)}
                  </select>
                </label>
              </div>
            </div>
          );
          })}
          <button className="sf-add-card" onClick={() => addElement({ kind: "character", name: `角色 ${chars.length + 1}`, refImages: [] })}>
            <FlowIcon n="plus" s={18} /><span>添加角色</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 场景设定 ──
  if (id === "scene") {
    const locs = series.bible.filter((e) => e.kind === "location");
    return (
      <div className="sf-fade-up">
        <StageGenControls step="portrait" />
        <div className="sf-sec-label">场景库<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>{locs.length} 场景</span></div>
        {!locs.length && <p className="sf-hint-line">还没有场景。添加核心场景，再用「AI 生成」出概念图，背景才能统一。</p>}
        <div className="sf-card-grid">
          {locs.map((s, i) => {
            const coverUrl = refDisplayUrl(elementCoverRef(s));
            const refCount = elementRefCount(s);
            return (
            <div className="sf-mini-card sf-scene-card" key={s.id}>
              <div className="sf-mc-img">
                {coverUrl ? <img src={coverUrl} alt={s.name} /> : <Placeholder grad={GRADS[Object.keys(GRADS)[(i + 4) % 8]]} comic={series.kind === "comic"} />}
                <label className="sf-media-upload" title="上传场景参考图">
                  <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void uploadElementRef(s.id, f, "front"); e.currentTarget.value = ""; }} />
                  <FlowIcon n="export" s={12} sw={2} />参考图
                </label>
                <button className="sf-mc-del" onClick={() => removeElement(s.id)} title="删除场景"><FlowIcon n="close" s={12} sw={2.4} /></button>
              </div>
              <div className="sf-mc-body">
                <div className={`sf-asset-status${refCount > 0 ? " ok" : ""}`}>{refCount > 0 ? `${refCount} 张参考已就绪` : "缺少场景参考"}</div>
                <input className="sf-mc-in sf-mc-in-name" value={s.name} onChange={(e) => updateElement(s.id, { name: e.target.value })} placeholder="场景名" />
                <textarea className="sf-mc-ta" value={s.description ?? ""} onChange={(e) => updateElement(s.id, { description: e.target.value })} placeholder="空间结构、年代、光线、色彩、可识别道具…" rows={3} />
                <RefSlotGrid element={s} slots={SCENE_REF_SLOTS} onUpload={(angle, file) => uploadElementRef(s.id, file, angle)} />
                <label className="sf-mini-field">
                  <span>一致性</span>
                  <input type="range" min={40} max={100} step={5} value={s.consistencyWeight ?? 80} onChange={(e) => updateElement(s.id, { consistencyWeight: Number(e.target.value) })} />
                  <b>{s.consistencyWeight ?? 80}</b>
                </label>
              </div>
            </div>
          );
          })}
          <button className="sf-add-card" onClick={() => addElement({ kind: "location", name: `场景 ${locs.length + 1}`, refImages: [] })}>
            <FlowIcon n="plus" s={18} /><span>添加场景</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 逐镜画面 ──
  if (id === "frames") {
    const aep = series.episodes.find((e) => e.id === activeEpId) ?? series.episodes[0];
    const rows = aep ? aep.scenes.flatMap((sc) => sc.shots.map((sh) => ({ sh, epId: aep.id, sceneId: sc.id }))) : [];
    const elements = series.bible.filter((e) => e.kind === "character" || e.kind === "location" || e.kind === "prop");
    const repairCount = repairableCount(rows);
    const addFrameShot = () => {
      let epId = aep?.id;
      if (!epId) {
        epId = addEpisode("第 1 集");
        setActiveEp(epId);
      }
      const freshEp = useStudioStore.getState().series.episodes.find((e) => e.id === epId);
      const sceneId = freshEp?.scenes[0]?.id ?? addScene(epId, { castIds: [] });
      addShot(epId, sceneId, {
        shotType: series.kind === "comic" ? "zoom-in" : "live",
        durationSec: series.kind === "comic" ? 4 : 5,
        elementRefs: elements.slice(0, 2).map((e) => e.id),
      });
    };
    if (!rows.length) return (
      <div className="sf-fade-up">
        <StageGenControls step="image" />
        <StageGenControls step="video" />
        <Empty ico="frames" title="本集尚无分镜" desc="逐镜生成画面：运镜、构图、时长与渲染风格。" />
        <button className="sf-add-card sf-add-row" onClick={addFrameShot}>
          <FlowIcon n="plus" s={16} />添加第一镜
        </button>
      </div>
    );
    return (
      <div className="sf-fade-up">
        <StageGenControls step="image" />
        <StageGenControls step="video" />
        <ProductionPanel
          rows={rows}
          series={series}
          jobById={jobById}
          title="制作预检"
          autoFixCount={repairCount}
          onAutoFix={() => repairShotRefs(rows)}
          onFixRow={(row) => repairShotRefs([row])}
        />
        <div className="sf-sec-label sf-sec-label-actions">
          <span>分镜脚本</span>
          <button className="sf-text-upload" disabled={!repairCount} onClick={() => repairShotRefs(rows)} title="按说话人和文本自动绑定角色场景">
            <FlowIcon n="target" s={12} sw={2} />
            <span>修复引用{repairCount ? ` ${repairCount}` : ""}</span>
          </button>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ac-2)" }}>{aep?.title ?? ""}</span>
        </div>
        {rows.map(({ sh, epId, sceneId }) => {
          const img = shotImageUrl(sh, jobById);
          const vid = shotVideoUrl(sh, jobById);
          const voice = shotVoiceUrl(sh);
          const line = sh.narration ?? sh.dialogue?.[0]?.line ?? "";
          const consistency = shotConsistencyReport(sh, series);
          return (
            <div className="sf-shot sf-shot-full" key={sh.id}>
              <div className="sf-shot-thumb">
                {vid ? <video src={vid} muted playsInline loop /> : img ? <img src={img} alt="" /> : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--bg-1)", color: "var(--t3)" }}><FlowIcon n="image" s={18} /></div>}
                <label className="sf-media-upload sf-media-upload-shot" title="上传本镜画面">
                  <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void uploadShotImage(epId, sceneId, sh.id, f); e.currentTarget.value = ""; }} />
                  <FlowIcon n="export" s={12} sw={2} />上传画面
                </label>
                <div className="sf-shot-state">
                  <span className={img ? "on" : ""}>图</span>
                  <span className={vid ? "on" : ""}>视</span>
                  <span className={voice ? "on" : ""}>声</span>
                </div>
              </div>
              <div className="sf-shot-info">
                <div className="sf-shot-topline">
                  <div className="sf-shot-no">SHOT {String(sh.idx).padStart(2, "0")}</div>
                  <select value={sh.shotType} onChange={(e) => updateShot(epId, sceneId, sh.id, { shotType: e.target.value as typeof sh.shotType })}>
                    {["live", "still", "zoom-in", "zoom-out", "pan-lr", "parallax", "ots", "pov", "dutch", "hero"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <label className="sf-shot-dur">
                    <input type="range" min={2} max={12} step={1} value={sh.durationSec} onChange={(e) => updateShot(epId, sceneId, sh.id, { durationSec: Number(e.target.value) })} />
                    <b>{sh.durationSec}s</b>
                  </label>
                </div>
                <textarea className="sf-shot-tx-in sf-shot-textarea" value={line} placeholder="旁白 / 对白…"
                  onChange={(e) => sh.dialogue?.length
                    ? updateShot(epId, sceneId, sh.id, { dialogue: [{ ...sh.dialogue[0], line: e.target.value }] })
                    : updateShot(epId, sceneId, sh.id, { narration: e.target.value })} rows={2} />
                <textarea className="sf-shot-prompt" value={sh.imagePrompt ?? ""} placeholder="画面提示词：构图、表情、动作、光线、镜头语言"
                  onChange={(e) => updateShot(epId, sceneId, sh.id, { imagePrompt: e.target.value })} rows={2} />
                <div className="sf-ref-row">
                  {elements.length === 0 ? <span className="sf-ref-empty">先在角色 / 场景节点添加参考</span> : elements.map((el) => {
                    const on = sh.elementRefs.includes(el.id);
                    const count = elementRefCount(el);
                    return (
                      <button key={el.id} className={`sf-ref-chip${on ? " on" : ""}${count ? "" : " missing"}`} onClick={() => {
                        const refs = sh.elementRefs ?? [];
                        updateShot(epId, sceneId, sh.id, { elementRefs: on ? refs.filter((x) => x !== el.id) : [...refs, el.id] });
                      }}>
                        {el.kind === "character" ? <FlowIcon n="character" s={10} /> : el.kind === "location" ? <FlowIcon n="scene" s={10} /> : <FlowIcon n="target" s={10} />}
                        {el.name}
                        <small>{count ? `${count}图` : "待图"}</small>
                      </button>
                    );
                  })}
                </div>
                <ConsistencyBadge report={consistency} />
                <details className="sf-shot-config">
                  <summary><FlowIcon n="target" s={12} />单镜模型参数</summary>
                  <StageGenControls step="image" shotRef={{ epId, sceneId, shot: sh }} compact />
                  <StageGenControls step="video" shotRef={{ epId, sceneId, shot: sh }} compact />
                  <StageGenControls step="voice" shotRef={{ epId, sceneId, shot: sh }} compact />
                </details>
              </div>
              <button className="sf-shot-del" onClick={() => removeShot(epId, sceneId, sh.id)} title="删除镜头"><FlowIcon n="close" s={12} sw={2.4} /></button>
            </div>
          );
        })}
        <button className="sf-add-card sf-add-row" onClick={addFrameShot}>
          <FlowIcon n="plus" s={16} />添加镜头
        </button>
      </div>
    );
  }

  // ── 配音 · 音乐 ──
  if (id === "audio") {
    const chars = series.bible.filter((e) => e.kind === "character");
    const aep = series.episodes.find((e) => e.id === activeEpId) ?? series.episodes[0];
    const rows = aep ? aep.scenes.flatMap((sc) => sc.shots.map((sh) => ({ sh, epId: aep.id, sceneId: sc.id }))) : [];
    const speakable = rows.filter(({ sh }) => sh.narration?.trim() || (sh.dialogue?.length ?? 0) > 0);
    return (
      <div className="sf-fade-up">
        <StageGenControls step="voice" />
        <div className="sf-sec-label">角色音色<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>{chars.length} 角色</span></div>
        {!chars.length && <p className="sf-hint-line">还没有角色。先在角色节点添加人物，再为每个角色绑定音色。</p>}
        {chars.map((c) => (
          <div className="sf-beat sf-audio-row" key={c.id} style={{ alignItems: "center" }}>
            <div className="sf-beat-no" style={{ background: "var(--ac-soft)", color: "var(--ac-2)" }}><FlowIcon n="mic" s={12} sw={2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sf-beat-tt" style={{ fontSize: 12 }}>{c.name}</div>
              <div className="sf-beat-tx mono" style={{ fontSize: 11 }}>{c.voiceId || "跟随全剧默认"}</div>
            </div>
            <select value={c.voiceId ?? ""} onChange={(e) => updateElement(c.id, { voiceId: e.target.value || undefined })}>
              <option value="">默认</option>
              {TTS_VOICES.filter((v) => v.group === "qwen3").map((v) => <option key={v.id} value={v.id}>{v.zh}</option>)}
            </select>
          </div>
        ))}
        <div className="sf-sec-label" style={{ marginTop: 16 }}>台词队列<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>{speakable.length} 句</span></div>
        {!speakable.length && <Empty ico="mic" title="尚无可配音台词" desc="在分镜里写旁白或对白后，这里会显示逐句配音队列。" />}
        {speakable.map(({ sh, epId, sceneId }) => {
          const voice = shotVoiceUrl(sh);
          const line = sh.narration ?? sh.dialogue?.[0]?.line ?? "";
          const speakerId = sh.dialogue?.[0]?.speakerId;
          return (
            <div className="sf-voice-line" key={sh.id}>
              <div className="sf-voice-main">
                <span className={`sf-voice-status${voice ? " on" : ""}`}>{voice ? "已配音" : "待配音"}</span>
                <select value={speakerId ?? ""} onChange={(e) => {
                  const nextSpeaker = e.target.value || undefined;
                  updateShot(epId, sceneId, sh.id, nextSpeaker
                    ? { narration: undefined, dialogue: [{ speakerId: nextSpeaker, line }] }
                    : { narration: line, dialogue: undefined });
                }}>
                  <option value="">旁白</option>
                  {chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <textarea value={line} onChange={(e) => sh.dialogue?.length
                  ? updateShot(epId, sceneId, sh.id, { dialogue: [{ ...sh.dialogue[0], line: e.target.value }] })
                  : updateShot(epId, sceneId, sh.id, { narration: e.target.value })} rows={2} />
              </div>
              {voice && <audio controls src={voice} />}
            </div>
          );
        })}
        <div className="sf-sec-label" style={{ marginTop: 16 }}>背景音乐</div>
        <div className="sf-bgm-box">
          <div className="sf-bgm-main">
            <div className="sf-beat-no" style={{ background: "var(--cy-soft)", color: "var(--cy)" }}><FlowIcon n="music" s={12} sw={2} /></div>
            <div>
              <div className="sf-beat-tt" style={{ fontSize: 12 }}>{series.bgm?.sourceTitle ?? "尚未添加 BGM"}</div>
              <div className="sf-beat-tx mono" style={{ fontSize: 11 }}>{series.bgm ? `音量 ${Math.round((series.bgm.volume ?? 0.45) * 100)}%` : "支持 mp3 / wav / m4a"}</div>
            </div>
          </div>
          <label className="sf-text-upload">
            <input type="file" accept={AUDIO_UPLOAD_ACCEPT} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void uploadBgm(f); e.currentTarget.value = ""; }} />
            <FlowIcon n="export" s={12} sw={2} />
            <span>上传 BGM</span>
          </label>
          {series.bgm && <audio controls src={series.bgm.sourceUrl} />}
        </div>
      </div>
    );
  }

  // ── 剪辑 · 合成 ──
  if (id === "edit") {
    const aep = series.episodes.find((e) => e.id === activeEpId) ?? series.episodes[0];
    const rows = aep ? aep.scenes.flatMap((sc) => sc.shots) : [];
    const rowRefs = aep ? aep.scenes.flatMap((sc) => sc.shots.map((sh) => ({ sh, epId: aep.id, sceneId: sc.id, epTitle: aep.title, epNum: aep.num }))) : [];
    const totalDur = Math.max(1, rows.reduce((sum, sh) => sum + Math.max(1, sh.durationSec || 4), 0));
    const visualReady = rows.filter((sh) => shotVideoUrl(sh, jobById) || shotImageUrl(sh, jobById)).length;
    const voiceReady = rows.filter((sh) => shotVoiceUrl(sh)).length;
    const repairCount = repairableCount(rowRefs);
    return (
      <div className="sf-fade-up">
        <div className="sf-readiness">
          <div><b>{visualReady}</b><span>画面就绪</span></div>
          <div><b>{voiceReady}</b><span>配音就绪</span></div>
          <div><b>{Math.round(totalDur)}s</b><span>预计时长</span></div>
        </div>
        <ProductionPanel
          rows={rowRefs}
          series={series}
          jobById={jobById}
          title="合成预检"
          autoFixCount={repairCount}
          onAutoFix={() => repairShotRefs(rowRefs)}
          onFixRow={(row) => repairShotRefs([row])}
        />
        <div className="sf-sec-label">合成参数</div>
        <div className="sf-edit-config">
          <label>
            <span>转场</span>
            <select
              value={series.editConfig?.transitionType ?? "fade"}
              onChange={(e) => setEditConfig({ transitionType: e.target.value as NonNullable<Series["editConfig"]>["transitionType"] })}
            >
              {TRANSITION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          <label>
            <span>淡化</span>
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.1}
              value={series.editConfig?.crossfadeSec ?? 0.3}
              onChange={(e) => setEditConfig({ crossfadeSec: Number(e.target.value) })}
            />
            <b>{(series.editConfig?.crossfadeSec ?? 0.3).toFixed(1)}s</b>
          </label>
          <label>
            <span>字幕</span>
            <select
              value={series.editConfig?.captionPosition ?? "bottom"}
              onChange={(e) => setEditConfig({ captionPosition: e.target.value as NonNullable<Series["editConfig"]>["captionPosition"] })}
            >
              <option value="bottom">底部</option>
              <option value="center">居中</option>
              <option value="top">顶部</option>
            </select>
          </label>
          <label>
            <span>字号</span>
            <input
              type="range"
              min={20}
              max={42}
              step={1}
              value={series.editConfig?.captionSizePx ?? 26}
              onChange={(e) => setEditConfig({ captionSizePx: Number(e.target.value) })}
            />
            <b>{series.editConfig?.captionSizePx ?? 26}</b>
          </label>
        </div>
        <div className="sf-sec-label">时间轴<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)" }}>按镜头顺序合成</span></div>
        <div className="sf-tl">
          <div className="sf-tl-ruler"><span>0s</span><span>{Math.round(totalDur / 2)}s</span><span>{Math.round(totalDur)}s</span></div>
          <div className="sf-tl-track">
            <div className="sf-tl-lbl"><FlowIcon n="film" s={11} sw={1.8} />画面</div>
            <div className="sf-tl-lane">
              {rows.length ? rows.map((sh) => {
                const ready = shotVideoUrl(sh, jobById) || shotImageUrl(sh, jobById);
                return <div className={`sf-tl-clip${ready ? "" : " missing"}`} key={sh.id} style={{ width: `${Math.max(8, (sh.durationSec / totalDur) * 100)}%` }}>S{sh.idx}</div>;
              }) : <span className="sf-tl-empty">暂无镜头</span>}
            </div>
          </div>
          <div className="sf-tl-track">
            <div className="sf-tl-lbl"><FlowIcon n="mic" s={11} sw={1.8} />配音</div>
            <div className="sf-tl-lane">
              {rows.length ? rows.map((sh) => <div className={`sf-tl-clip audio${shotVoiceUrl(sh) ? "" : " missing"}`} key={sh.id} style={{ width: `${Math.max(8, (sh.durationSec / totalDur) * 100)}%` }}>A{sh.idx}</div>) : <span className="sf-tl-empty">暂无台词</span>}
            </div>
          </div>
          <div className="sf-tl-track">
            <div className="sf-tl-lbl"><FlowIcon n="music" s={11} sw={1.8} />音乐</div>
            <div className="sf-tl-lane">
              <div className={`sf-tl-clip music${series.bgm ? "" : " missing"}`} style={{ width: "100%" }}>{series.bgm ? series.bgm.sourceTitle : "BGM 未添加"}</div>
            </div>
          </div>
        </div>
        <p className="sf-hint-line">点节点头部的生成按钮可导入剪辑器，导入前建议先补齐缺失的画面和声音。</p>
      </div>
    );
  }

  // ── 导出 · 发布 ──
  if (id === "export") {
    const allRows = series.episodes.flatMap((ep) => ep.scenes.flatMap((sc) => sc.shots.map((sh) => ({ ep, sh, sceneId: sc.id }))));
    const allShots = allRows.map(({ ep, sh }) => ({ ep, sh }));
    const visualReady = allShots.filter(({ sh }) => shotVideoUrl(sh, jobById) || shotImageUrl(sh, jobById)).length;
    const voiceReady = allShots.filter(({ sh }) => shotVoiceUrl(sh)).length;
    const missing = allShots.filter(({ sh }) => !(shotVideoUrl(sh, jobById) || shotImageUrl(sh, jobById)) || !shotVoiceUrl(sh));
    const consistencyMissing = allShots.filter(({ sh }) => !shotConsistencyReport(sh, series).ok).length;
    const platforms = series.exportConfig?.platforms ?? EXPORT_PLATFORMS;
    const exportRows = allRows.map(({ ep, sh, sceneId }) => ({ sh, epId: ep.id, sceneId, epTitle: ep.title, epNum: ep.num }));
    const repairCount = repairableCount(exportRows);
    return (
      <div className="sf-fade-up">
        <div className="sf-readiness">
          <div><b>{allShots.length}</b><span>总镜头</span></div>
          <div><b>{visualReady}</b><span>画面素材</span></div>
          <div><b>{voiceReady}</b><span>声音素材</span></div>
        </div>
        <ProductionPanel
          rows={exportRows}
          series={series}
          jobById={jobById}
          title="发布预检"
          autoFixCount={repairCount}
          onAutoFix={() => repairShotRefs(exportRows)}
          onFixRow={(row) => repairShotRefs([row])}
        />
        <div className="sf-sec-label">导出规格</div>
        <div className="sf-export-grid">
          {([["竖屏 9:16", "1080×1920", "9:16"], ["横屏 16:9", "1920×1080", "16:9"], ["方形 1:1", "1080×1080", "1:1"], ["母版", "4K · 无损", ""]] as const).map(([t, s, a]) => {
            const on = a === series.aspect;
            return (
              <button key={t} className={`sf-export-card${on ? " on" : ""}`} onClick={() => a && setSeries({ aspect: a })}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--t2)", marginTop: 2 }}>{s}</div>
              </button>
            );
          })}
        </div>
        <div className="sf-sec-label">清晰度</div>
        <div className="sf-field-row">
          {([720, 1080, 2160] as const).map((height) => (
            <button
              key={height}
              className={`sf-spec-btn${(series.exportConfig?.height ?? 1080) === height ? " on" : ""}`}
              onClick={() => setExportConfig({ height })}
            >
              {height === 2160 ? "4K" : `${height}p`}
            </button>
          ))}
        </div>
        <div className="sf-sec-label">一键分发</div>
        <div className="sf-field-row">
          {EXPORT_PLATFORMS.map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                className={`sf-tag${on ? " on" : ""}`}
                key={p}
                onClick={() => setExportConfig({ platforms: on ? platforms.filter((x) => x !== p) : [...platforms, p] })}
              >
                {on && <FlowIcon n="check" s={11} sw={2.5} />}{p}
              </button>
            );
          })}
        </div>
        <div className="sf-sec-label" style={{ marginTop: 16 }}>发布前检查<span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: allShots.length === 0 || missing.length || consistencyMissing ? "var(--warn)" : "var(--ok)" }}>{allShots.length === 0 ? "暂无镜头" : missing.length || consistencyMissing ? `${missing.length + consistencyMissing} 项待补` : "素材齐全"}</span></div>
        <div className="sf-export-list">
          {allShots.length === 0 && <Empty ico="export" title="暂无可导出内容" desc="先完成分镜、画面和配音，再回到这里导出。" />}
          {allShots.slice(0, 12).map(({ ep, sh }) => {
            const hasVisual = !!(shotVideoUrl(sh, jobById) || shotImageUrl(sh, jobById));
            const hasVoice = !!shotVoiceUrl(sh);
            const consistency = shotConsistencyReport(sh, series);
            return (
              <div className="sf-export-row" key={sh.id}>
                <span>{ep.num}-{String(sh.idx).padStart(2, "0")}</span>
                <b>{sh.narration || sh.dialogue?.[0]?.line || sh.imagePrompt || "未填写内容"}</b>
                <i className={hasVisual ? "ok" : ""}>画面</i>
                <i className={hasVoice ? "ok" : ""}>声音</i>
                <i className={consistency.ok ? "ok" : ""}>一致性</i>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

function ProductionPanel({
  rows,
  series,
  jobById,
  title,
  autoFixCount = 0,
  onAutoFix,
  onFixRow,
}: {
  rows: StageShotRow[];
  series: Series;
  jobById: Map<string, Job>;
  title: string;
  autoFixCount?: number;
  onAutoFix?: () => void;
  onFixRow?: (row: StageShotRow) => void;
}) {
  const summary = productionSummary(rows, series, jobById);
  const percent = summary.shots ? Math.round((summary.clean / summary.shots) * 100) : 0;
  const limitedIssues = summary.issueRows.slice(0, 6);

  return (
    <div className="sf-prod-panel">
      <div className="sf-prod-head">
        <div>
          <span>{title}</span>
          <b>{summary.shots ? `${percent}% 就绪` : "暂无镜头"}</b>
        </div>
        <div className="sf-prod-head-actions">
          {onAutoFix && (
            <button className="sf-prod-fix" disabled={!autoFixCount} onClick={onAutoFix} title="按说话人、镜头文本和现有角色场景自动补引用">
              <FlowIcon n="target" s={12} sw={2} />
              <span>修复可自动项{autoFixCount ? ` ${autoFixCount}` : ""}</span>
            </button>
          )}
          <i>{summary.clean}/{summary.shots}</i>
        </div>
      </div>
      <div className="sf-prod-meter"><span style={{ width: `${percent}%` }} /></div>
      <div className="sf-prod-metrics">
        <div><b>{summary.visual}</b><span>画面</span></div>
        <div><b>{summary.video}</b><span>视频</span></div>
        <div><b>{summary.voice}</b><span>声音</span></div>
        <div><b>{summary.issueRows.length}</b><span>待补</span></div>
      </div>
      {limitedIssues.length > 0 && (
        <div className="sf-prod-list">
          {limitedIssues.map(({ row, state }) => {
            const canFixRow = rowHasAutoRefFix(row, series);
            return (
              <div className="sf-prod-row" key={row.sh.id}>
                <span>{row.epNum ? `${row.epNum}-` : ""}{String(row.sh.idx).padStart(2, "0")}</span>
                <b>{shotReadableText(row.sh)}</b>
                {onFixRow && canFixRow && (
                  <button className="sf-prod-row-fix" onClick={() => onFixRow(row)} title="只修复这一镜的角色和场景引用">修复引用</button>
                )}
                <em>{state.issues.slice(0, 4).join(" · ")}</em>
              </div>
            );
          })}
          {summary.issueRows.length > limitedIssues.length && (
            <div className="sf-prod-more">还有 {summary.issueRows.length - limitedIssues.length} 镜待补</div>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ ico, title, desc }: { ico: string; title: string; desc: string }) {
  return (
    <div className="sf-fade-up sf-empty-state">
      <div className="sf-empty-ic"><FlowIcon n={ico} s={22} /></div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      <p style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 5, lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}

function ConsistencyBadge({ report }: { report: ReturnType<typeof shotConsistencyReport> }) {
  return (
    <div className={`sf-consistency${report.ok ? " ok" : ""}`}>
      <span>{report.label}</span>
      {!report.ok && report.issues.map((issue) => <b key={issue}>{issue}</b>)}
    </div>
  );
}

function RefSlotGrid({
  element,
  slots,
  onUpload,
}: {
  element: StageElement;
  slots: RefSlot[];
  onUpload: (angle: RefAngle, file: File) => void | Promise<void>;
}) {
  return (
    <div className="sf-ref-slots">
      {slots.map((slot) => {
        const ref = element.refImages.find((r) => r.angle === slot.angle);
        const url = refDisplayUrl(ref);
        return (
          <label key={slot.angle} className={`sf-ref-slot${url ? " on" : ""}`} title={`上传${slot.label}参考`}>
            <input
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void onUpload(slot.angle, file);
                e.currentTarget.value = "";
              }}
            />
            <span className="sf-ref-slot-thumb">
              {url ? <img src={url} alt={`${element.name}${slot.label}`} /> : <FlowIcon n="image" s={14} sw={2} />}
            </span>
            <span>{slot.label}</span>
          </label>
        );
      })}
    </div>
  );
}
