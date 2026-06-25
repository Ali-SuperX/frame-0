"use client";

/**
 * 右侧 Inspector —— 编辑选中镜头 + 单镜 Retake（图/音/视频）。
 * Step 3 会加：elementRefs chips 绑定、一致性强度滑块、首/尾帧槽。
 */

import { useState } from "react";
import {
  useStudioStore,
  type Series,
  type StageShot,
  type StageShotType,
  type StageElement,
  type Job,
} from "@/lib/store";
import { shotImageUrl, shotVideoUrl, shotVoiceUrl } from "@/lib/stage/stageGen";

const SHOT_TYPES: StageShotType[] = [
  "still", "pan-lr", "zoom-in", "zoom-out",
  "parallax", "live", "ots", "pov", "dutch", "hero",
];

export default function StageInspector({
  shot,
  sceneId,
  epId,
  series,
  jobById,
  generating,
  onClose,
  onGenImage,
  onGenVoice,
  onGenVideo,
  zh,
}: {
  shot: StageShot;
  sceneId: string;
  epId: string;
  series: Series;
  jobById: Map<string, Job>;
  generating: string | null;
  onClose: () => void;
  onGenImage: () => void;
  onGenVoice: () => void;
  onGenVideo: () => void;
  zh: boolean;
}) {
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bound = shot.elementRefs
    .map((id) => series.bible.find((e) => e.id === id))
    .filter((e): e is StageElement => !!e);
  const available = series.bible.filter((e) => !shot.elementRefs.includes(e.id));
  const addRef = (id: string) => {
    updateShot(epId, sceneId, shot.id, { elementRefs: [...shot.elementRefs, id] });
    setPickerOpen(false);
  };
  const removeRef = (id: string) =>
    updateShot(epId, sceneId, shot.id, { elementRefs: shot.elementRefs.filter((r) => r !== id) });
  const vidUrl = shotVideoUrl(shot, jobById);
  const imgUrl = shotImageUrl(shot, jobById);
  const voiceUrl = shotVoiceUrl(shot);

  const dot = (has: boolean, ready: boolean) =>
    has ? (ready ? "done" : "loading") : "pending";

  return (
    <aside className="sw-inspector">
      <div className="sw-insp-head">
        <span className="sw-insp-title">
          <span className="idx">#{shot.idx}</span>
          <span>{shot.shotType}</span>
        </span>
        <button className="sw-insp-close" onClick={onClose} title={zh ? "关闭" : "Close"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div className="sw-insp-body">
        {/* preview */}
        <div className="sw-insp-preview">
          {vidUrl ? (
            <video src={vidUrl} controls muted playsInline />
          ) : imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt="" />
          ) : (
            <div className="sw-insp-preview-empty">{zh ? "暂无画面" : "No image"}</div>
          )}
        </div>

        {/* status */}
        <div style={{ display: "flex", gap: 14 }}>
          <span className="sw-insp-status"><span className={`sw-insp-status-dot ${dot(!!shot.imageJobId, !!imgUrl)}`} />{zh ? "图" : "Img"}</span>
          <span className="sw-insp-status"><span className={`sw-insp-status-dot ${dot(!!shot.voiceJobId, !!voiceUrl)}`} />{zh ? "音" : "Snd"}</span>
          <span className="sw-insp-status"><span className={`sw-insp-status-dot ${dot(!!shot.videoJobId, !!vidUrl)}`} />{zh ? "频" : "Vid"}</span>
        </div>

        {/* narration */}
        <div className="sw-insp-field">
          <span className="sw-insp-label">{zh ? "旁白" : "Narration"}</span>
          <textarea
            className="sw-insp-textarea"
            value={shot.narration || ""}
            onChange={(e) => updateShot(epId, sceneId, shot.id, { narration: e.target.value })}
            placeholder={zh ? "旁白文字…" : "Narration…"}
          />
        </div>

        {/* image prompt */}
        <div className="sw-insp-field">
          <span className="sw-insp-label">{zh ? "画面提示词" : "Image Prompt"}</span>
          <textarea
            className="sw-insp-textarea"
            value={shot.imagePrompt || ""}
            onChange={(e) => updateShot(epId, sceneId, shot.id, { imagePrompt: e.target.value })}
            placeholder={zh ? "描述画面…" : "Describe the visual…"}
          />
        </div>

        {/* type + duration */}
        <div className="sw-insp-row">
          <div className="sw-insp-field" style={{ flex: 1 }}>
            <span className="sw-insp-label">{zh ? "景别/运镜" : "Type"}</span>
            <select
              className="sw-insp-select"
              value={shot.shotType || "still"}
              onChange={(e) => updateShot(epId, sceneId, shot.id, { shotType: e.target.value as StageShotType })}
            >
              {SHOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sw-insp-field" style={{ width: 76 }}>
            <span className="sw-insp-label">{zh ? "时长" : "Dur"}</span>
            <input
              className="sw-insp-input"
              type="number"
              min={1}
              max={30}
              value={shot.durationSec}
              onChange={(e) => updateShot(epId, sceneId, shot.id, { durationSec: Number(e.target.value) || 4 })}
            />
          </div>
        </div>

        {/* 出演元素 / elementRefs —— 绑定即一致性参考 */}
        <div className="sw-insp-field">
          <span className="sw-insp-label">{zh ? "出演元素 · 一致性参考" : "Elements · refs"}</span>
          <div className="sw-chips">
            {bound.map((el) => (
              <span key={el.id} className="sw-chip">
                <span className="sw-chip-av" style={{ background: el.color || "var(--ink-3)" }}>
                  {el.refImages?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={el.refImages[0].url} alt="" />
                  ) : (
                    el.name?.[0] ?? "?"
                  )}
                </span>
                <span className="sw-chip-name">{el.name}</span>
                <button className="sw-chip-x" onClick={() => removeRef(el.id)} title={zh ? "解绑" : "Remove"}>×</button>
              </span>
            ))}
            <div className="sw-chip-add-wrap">
              <button className="sw-chip-add" onClick={() => setPickerOpen((v) => !v)}>
                + {zh ? "绑定" : "Bind"}
              </button>
              {pickerOpen && (
                <div className="sw-chip-picker">
                  {available.length === 0 ? (
                    <div className="sw-chip-picker-empty">{zh ? "先在「选角设定」里建元素" : "Create elements first"}</div>
                  ) : (
                    available.map((el) => (
                      <button key={el.id} className="sw-chip-pick" onClick={() => addRef(el.id)}>
                        <span className="sw-chip-av" style={{ background: el.color || "var(--ink-3)" }}>
                          {el.refImages?.[0]?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={el.refImages[0].url} alt="" />
                          ) : (
                            el.name?.[0] ?? "?"
                          )}
                        </span>
                        <span className="sw-chip-name">{el.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* voice audio */}
        {voiceUrl && <audio className="sw-insp-audio" src={voiceUrl} controls />}

        {/* retake actions */}
        <div className="sw-insp-actions">
          <button className="ghost-button compact" onClick={onGenImage} disabled={generating !== null}>
            {generating === `img-${shot.id}` ? "⟳" : "✦"} {imgUrl ? (zh ? "重绘" : "Redo") : (zh ? "出图" : "Image")}
          </button>
          <button className="ghost-button compact" onClick={onGenVoice} disabled={generating !== null}>
            {generating === `voice-${shot.id}` ? "⟳" : "◉"} {voiceUrl ? (zh ? "重配" : "Redo") : (zh ? "配音" : "Voice")}
          </button>
          <button className="ghost-button compact" onClick={onGenVideo} disabled={generating !== null || !imgUrl}>
            {generating === `video-${shot.id}` ? "⟳" : "▶"} {vidUrl ? (zh ? "重做" : "Redo") : (zh ? "视频" : "Video")}
          </button>
        </div>
      </div>
    </aside>
  );
}
