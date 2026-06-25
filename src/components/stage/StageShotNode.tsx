"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useStudioStore,
  type StageShot,
  type StageScene,
  type StageEpisode,
  type Series,
  type StageShotType,
  type Job,
} from "@/lib/store";
import { SHOT_NODE_W } from "@/lib/stage/canvasLayout";
import {
  shotImageUrl,
  shotVideoUrl,
  shotVoiceUrl,
  genShotImage,
  genShotVoice,
  genShotVideo,
} from "@/lib/stage/stageGen";

const SHOT_TYPES: { value: StageShotType; label: string; labelEn: string }[] = [
  { value: "still", label: "静止", labelEn: "Still" },
  { value: "zoom-in", label: "推近", labelEn: "Zoom In" },
  { value: "zoom-out", label: "拉远", labelEn: "Zoom Out" },
  { value: "pan-lr", label: "平移", labelEn: "Pan" },
  { value: "parallax", label: "视差", labelEn: "Parallax" },
  { value: "live", label: "视频", labelEn: "Live" },
  { value: "ots", label: "过肩", labelEn: "OTS" },
  { value: "pov", label: "主观", labelEn: "POV" },
  { value: "dutch", label: "荷兰角", labelEn: "Dutch" },
  { value: "hero", label: "英雄镜", labelEn: "Hero" },
];

/** 景别/运镜图标（图标优先） */
function ShotTypeIcon({ type }: { type: StageShotType }) {
  const c = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "zoom-in": return (<svg {...c}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>);
    case "zoom-out": return (<svg {...c}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>);
    case "pan-lr": return (<svg {...c}><polyline points="9 6 3 12 9 18" /><polyline points="15 6 21 12 15 18" /></svg>);
    case "parallax": return (<svg {...c}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>);
    case "live": return (<svg {...c}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>);
    case "ots": return (<svg {...c}><circle cx="9" cy="7" r="3" /><path d="M3 21v-2a4 4 0 0 1 4-4h3" /><circle cx="17" cy="15" r="4" /></svg>);
    case "pov": return (<svg {...c}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
    case "dutch": return (<svg {...c}><rect x="3" y="3" width="18" height="18" rx="2" transform="rotate(12 12 12)" /></svg>);
    case "hero": return (<svg {...c}><polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.5 5.5 21 7.5 13.5 2 9 9 9 12 2" /></svg>);
    default: return (<svg {...c}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>);
  }
}

export default function StageShotNode({
  shot,
  scene,
  episode,
  series,
  jobs,
  selected,
  expanded,
  onSelect,
  onExpand,
  onDragHandle,
  zh,
}: {
  shot: StageShot;
  scene: StageScene;
  episode: StageEpisode;
  series: Series;
  jobs: Map<string, Job>;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onExpand: () => void;
  onDragHandle: (e: React.PointerEvent) => void;
  zh: boolean;
}) {
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const removeShot = useStudioStore((s) => s.seriesRemoveShot);
  const addShot = useStudioStore((s) => s.seriesAddShot);

  const imageJob = shot.imageJobId ? jobs.get(shot.imageJobId) : undefined;
  const videoJob = shot.videoJobId ? jobs.get(shot.videoJobId) : undefined;
  const imgUrl = shotImageUrl(shot, jobs);
  const vidUrl = shotVideoUrl(shot, jobs);
  const voiceUrl = shotVoiceUrl(shot);

  const characters = series.bible.filter((e) => e.kind === "character");
  const thumb = imgUrl || vidUrl;

  const [genBusy, setGenBusy] = useState<"img" | "voice" | "video" | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Close context menu on any outside click or scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = () => setCtxMenu(null);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [ctxMenu]);

  const handleGenImage = useCallback(async () => {
    setGenBusy("img");
    setGenErr(null);
    try {
      await genShotImage(shot, series, episode.id, scene.id);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(null);
    }
  }, [shot, series, episode.id, scene.id]);

  const handleGenVoice = useCallback(async () => {
    setGenBusy("voice");
    setGenErr(null);
    try {
      await genShotVoice(shot, series, episode.id, scene.id);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(null);
    }
  }, [shot, series, episode.id, scene.id]);

  const handleGenVideo = useCallback(async () => {
    if (!imgUrl) {
      setGenErr(zh ? "请先出图" : "Generate image first");
      return;
    }
    setGenBusy("video");
    setGenErr(null);
    try {
      await genShotVideo(shot, series, episode.id, scene.id, imgUrl);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(null);
    }
  }, [shot, series, episode.id, scene.id, imgUrl, zh]);

  const handleDuplicate = useCallback(() => {
    const newId = addShot(episode.id, scene.id);
    updateShot(episode.id, scene.id, newId, {
      shotType: shot.shotType,
      narration: shot.narration,
      imagePrompt: shot.imagePrompt,
      dialogue: shot.dialogue ? [...shot.dialogue] : undefined,
      durationSec: shot.durationSec,
      elementRefs: [...shot.elementRefs],
    });
  }, [shot, episode.id, scene.id, addShot, updateShot]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Status indicators
  const hasImage = !!imgUrl;
  const hasVoice = !!voiceUrl;
  const hasVideo = !!vidUrl;
  const imgLoading = imageJob?.status === "running";
  const vidLoading = videoJob?.status === "running";
  const hasNarration = !!(shot.narration?.trim() || shot.imagePrompt?.trim());

  return (
    <div
      className={`sc-shot${selected ? " selected" : ""}${expanded ? " expanded" : ""}`}
      style={{
        position: "absolute",
        left: shot._cx ?? 0,
        top: shot._cy ?? 0,
        width: expanded ? 360 : SHOT_NODE_W,
      }}
      onClick={(e) => {
        e.stopPropagation();
        setCtxMenu(null);
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
      onContextMenu={handleContextMenu}
    >
      {/* 拖拽手柄 */}
      <div
        className="sc-shot-grip"
        onPointerDown={onDragHandle}
      >
        <span className="sc-shot-idx">#{shot.idx}</span>
        <span className="sc-shot-type-ico"><ShotTypeIcon type={shot.shotType} /></span>
        <span className="sc-shot-type-badge">
          {zh
            ? SHOT_TYPES.find((t) => t.value === shot.shotType)?.label ?? shot.shotType
            : SHOT_TYPES.find((t) => t.value === shot.shotType)?.labelEn ?? shot.shotType}
        </span>
        {/* Status dots */}
        <span className="sc-shot-status">
          <span className={`sc-dot img${hasImage ? " on" : ""}${imgLoading ? " loading" : ""}`} title={zh ? "图片" : "Image"} />
          <span className={`sc-dot voice${hasVoice ? " on" : ""}`} title={zh ? "配音" : "Voice"} />
          <span className={`sc-dot video${hasVideo ? " on" : ""}${vidLoading ? " loading" : ""}`} title={zh ? "视频" : "Video"} />
        </span>
        <span className="sc-shot-dur">{shot.durationSec}s</span>
        {(imageJob?.status === "running" || videoJob?.status === "running") && (
          <span className="sc-shot-busy">⟳</span>
        )}
      </div>

      {/* 缩略图 / 占位 */}
      <div className="sc-shot-preview">
        {thumb ? (
          vidUrl ? (
            <video src={vidUrl} className="sc-shot-thumb" muted playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl!} alt="" className="sc-shot-thumb" />
          )
        ) : (
          <div className="sc-shot-ph">
            {expanded
              ? (shot.narration?.slice(0, 40) || (zh ? "出图后这里显示画面" : "Image preview will appear here"))
              : (shot.narration?.slice(0, 30) || (
                <span className="sc-shot-ph-empty">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <span className="sc-shot-ph-hint">{zh ? "双击编辑" : "dblclick"}</span>
                </span>
              ))}
          </div>
        )}
        {vidUrl && (
          <span className="sc-shot-vid-badge">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
          </span>
        )}
        {/* Quick action overlay — always visible when actionable */}
        {!expanded && hasNarration && !hasImage && (
          <div className="sc-shot-quick-actions">
            <button
              className="sc-shot-quick-btn"
              onClick={(e) => { e.stopPropagation(); handleGenImage(); }}
              disabled={genBusy !== null}
              title={zh ? "出图" : "Generate image"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
          </div>
        )}
        {!expanded && hasImage && !hasVideo && (
          <div className="sc-shot-quick-actions">
            <button
              className="sc-shot-quick-btn"
              onClick={(e) => { e.stopPropagation(); handleGenVideo(); }}
              disabled={genBusy !== null}
              title={zh ? "出视频" : "Generate video"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 一行旁白摘要（仅有缩略图时显示，否则 preview 区域已展示文字） */}
      {!expanded && thumb && shot.narration?.trim() && (
        <div className="sc-shot-summary">
          {shot.narration.slice(0, 40)}
        </div>
      )}

      {/* 展开态编辑面板 */}
      {expanded && (
        <div className="sc-shot-edit" onClick={(e) => e.stopPropagation()}>
          <label className="sc-label">{zh ? "镜头类型" : "Shot type"}</label>
          <select
            className="sc-select"
            value={shot.shotType}
            onChange={(e) =>
              updateShot(episode.id, scene.id, shot.id, {
                shotType: e.target.value as StageShotType,
              })
            }
          >
            {SHOT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {zh ? t.label : t.labelEn}
              </option>
            ))}
          </select>

          <label className="sc-label">{zh ? "旁白 / 画面描述" : "Narration"}</label>
          <textarea
            className="sc-textarea"
            value={shot.narration ?? ""}
            onChange={(e) =>
              updateShot(episode.id, scene.id, shot.id, { narration: e.target.value })
            }
            rows={2}
            placeholder={zh ? "描述这个镜头发生的事…" : "Describe what happens in this shot…"}
          />

          <label className="sc-label">{zh ? "画面提示词" : "Image prompt"}</label>
          <textarea
            className="sc-textarea"
            value={shot.imagePrompt ?? ""}
            onChange={(e) =>
              updateShot(episode.id, scene.id, shot.id, { imagePrompt: e.target.value })
            }
            rows={2}
            placeholder={zh ? "留空则用旁白自动生成" : "Leave empty to auto-generate from narration"}
          />

          <label className="sc-label">{zh ? "对白" : "Dialogue"}</label>
          {(shot.dialogue ?? []).map((d, di) => (
            <div key={di} className="sc-dialogue-row">
              <select
                className="sc-select sc-speaker"
                value={d.speakerId ?? ""}
                onChange={(e) => {
                  const next = [...(shot.dialogue ?? [])];
                  next[di] = { ...next[di], speakerId: e.target.value || undefined };
                  updateShot(episode.id, scene.id, shot.id, { dialogue: next });
                }}
              >
                <option value="">{zh ? "旁白" : "Narrator"}</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                className="sc-line-input"
                value={d.line}
                onChange={(e) => {
                  const next = [...(shot.dialogue ?? [])];
                  next[di] = { ...next[di], line: e.target.value };
                  updateShot(episode.id, scene.id, shot.id, { dialogue: next });
                }}
                placeholder={zh ? "台词内容…" : "Line…"}
              />
              <button
                className="sc-btn-x"
                onClick={() => {
                  const next = (shot.dialogue ?? []).filter((_, i) => i !== di);
                  updateShot(episode.id, scene.id, shot.id, { dialogue: next });
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="sc-btn-sm"
            onClick={() => {
              const next = [...(shot.dialogue ?? []), { line: "" }];
              updateShot(episode.id, scene.id, shot.id, { dialogue: next });
            }}
          >
            + {zh ? "对白" : "Line"}
          </button>

          <label className="sc-label">{zh ? "时长 (秒)" : "Duration (s)"}</label>
          <input
            type="number"
            className="sc-input"
            value={shot.durationSec}
            min={1}
            max={30}
            onChange={(e) =>
              updateShot(episode.id, scene.id, shot.id, {
                durationSec: Math.max(1, +e.target.value),
              })
            }
          />

          {voiceUrl && (
            <div style={{ marginTop: 4 }}>
              <audio src={voiceUrl} controls style={{ width: "100%", height: 28 }} />
            </div>
          )}

          <div className="sc-shot-actions">
            <button
              className="sc-btn-sm"
              onClick={handleGenImage}
              disabled={genBusy !== null}
              title={zh ? "生成图片" : "Generate image"}
            >
              {genBusy === "img" ? (
                <span className="sc-composer-spinner sm" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                </svg>
              )}
              {zh ? "出图" : "Image"}
            </button>
            <button
              className="sc-btn-sm"
              onClick={handleGenVoice}
              disabled={genBusy !== null}
              title={zh ? "生成配音" : "Generate voice"}
            >
              {genBusy === "voice" ? (
                <span className="sc-composer-spinner sm" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              )}
              {zh ? "配音" : "Voice"}
            </button>
            <button
              className="sc-btn-sm"
              onClick={handleGenVideo}
              disabled={genBusy !== null || !imgUrl}
              title={zh ? "生成视频" : "Generate video"}
            >
              {genBusy === "video" ? (
                <span className="sc-composer-spinner sm" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              )}
              {zh ? "视频" : "Video"}
            </button>
            <button
              className="sc-btn-sm"
              onClick={handleDuplicate}
              title={zh ? "复制镜头" : "Duplicate shot"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {zh ? "复制" : "Copy"}
            </button>
            <button
              className="sc-btn-del"
              onClick={() => removeShot(episode.id, scene.id, shot.id)}
              title={zh ? "删除镜头" : "Delete shot"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
          {genErr && <div className="sc-composer-err">{genErr}</div>}
        </div>
      )}

      {/* 右键菜单 */}
      {ctxMenu && (
        <div
          className="sc-ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={() => { setCtxMenu(null); onExpand(); }}>
            {zh ? "✏️ 编辑" : "✏️ Edit"}
          </button>
          <button onClick={() => { setCtxMenu(null); handleGenImage(); }}>
            {zh ? "🖼 出图" : "🖼 Gen Image"}
          </button>
          <button onClick={() => { setCtxMenu(null); handleGenVoice(); }}>
            {zh ? "🔊 配音" : "🔊 Gen Voice"}
          </button>
          <button onClick={() => { setCtxMenu(null); handleGenVideo(); }} disabled={!imgUrl}>
            {zh ? "🎬 出视频" : "🎬 Gen Video"}
          </button>
          <div className="sc-ctx-divider" />
          <button onClick={() => { setCtxMenu(null); handleDuplicate(); }}>
            {zh ? "⧉ 复制镜头" : "⧉ Duplicate"}
          </button>
          <button className="sc-ctx-danger" onClick={() => { setCtxMenu(null); removeShot(episode.id, scene.id, shot.id); }}>
            {zh ? "🗑 删除" : "🗑 Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
