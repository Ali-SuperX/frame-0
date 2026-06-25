"use client";

import { useState } from "react";
import {
  useStudioStore,
  type Series,
  type StageEpisode,
  type StageScene,
  type StageShot,
  type StageShotType,
} from "@/lib/store";

type Props = { series: Series; episode: StageEpisode; zh: boolean };

const SHOT_TYPES: { value: StageShotType; label: string }[] = [
  { value: "still", label: "静止" },
  { value: "zoom-in", label: "推近" },
  { value: "zoom-out", label: "拉远" },
  { value: "pan-lr", label: "平移" },
  { value: "parallax", label: "视差" },
  { value: "live", label: "视频" },
  { value: "ots", label: "过肩" },
  { value: "pov", label: "主观" },
  { value: "dutch", label: "荷兰角" },
  { value: "hero", label: "英雄镜" },
];

export default function ScriptWorkspace({ series, episode, zh }: Props) {
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const removeScene = useStudioStore((s) => s.seriesRemoveScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);

  const characters = series.bible.filter((e) => e.kind === "character");
  const locations = series.bible.filter((e) => e.kind === "location");
  const totalShots = episode.scenes.reduce((s, sc) => s + sc.shots.length, 0);

  return (
    <div className="screenplay">
      {/* 空态引导 */}
      {totalShots === 0 && (
        <div className="sp-empty">
          <div className="sp-empty-title">{zh ? "开始写你的剧本" : "Start your screenplay"}</div>
          <p className="sp-empty-desc">
            {zh
              ? "每个场景包含地点、角色和若干镜头。从加一个场景开始。"
              : "Each scene contains a location, characters, and shots. Start by adding a scene."}
          </p>
          <button className="ss-btn primary" onClick={() => addScene(episode.id)}>
            + {zh ? "新场景" : "New Scene"}
          </button>
        </div>
      )}

      {episode.scenes.map((scene, si) => (
        <div key={scene.id} className="sp-scene">
          {/* 场景标题 ── SCENE HEADING */}
          <div className="sp-heading">
            <span className="sp-heading-num">{si + 1}.</span>
            <span className="sp-heading-text">
              {scene.locationId
                ? (series.bible.find((e) => e.id === scene.locationId)?.name ?? "").toUpperCase()
                : (zh ? "未设场景" : "UNTITLED")}
            </span>
            {scene.castIds.length > 0 && (
              <span className="sp-heading-cast">
                — {scene.castIds.map((id) => series.bible.find((e) => e.id === id)?.name).filter(Boolean).join("、")}
              </span>
            )}
            <div className="sp-heading-acts">
              <button className="sp-btn" onClick={() => addShot(episode.id, scene.id)}>
                + {zh ? "镜头" : "Shot"}
              </button>
              {episode.scenes.length > 1 && (
                <button className="sp-btn sp-btn-del" onClick={() => removeScene(episode.id, scene.id)}>×</button>
              )}
            </div>
          </div>

          {/* 镜头列表 */}
          {scene.shots.map((shot) => (
            <ShotBlock
              key={shot.id}
              shot={shot}
              scene={scene}
              episode={episode}
              series={series}
              characters={characters}
              zh={zh}
            />
          ))}

          {scene.shots.length === 0 && (
            <div className="sp-scene-empty">
              <button className="sp-btn" onClick={() => addShot(episode.id, scene.id)}>
                + {zh ? "写第一拍" : "First shot"}
              </button>
            </div>
          )}
        </div>
      ))}

      {totalShots > 0 && (
        <button className="sp-add-scene" onClick={() => addScene(episode.id)}>
          + {zh ? "新场景" : "New Scene"}
        </button>
      )}
    </div>
  );
}

function ShotBlock({
  shot, scene, episode, series, characters, zh,
}: {
  shot: StageShot;
  scene: StageScene;
  episode: StageEpisode;
  series: Series;
  characters: typeof series.bible;
  zh: boolean;
}) {
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const removeShot = useStudioStore((s) => s.seriesRemoveShot);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`sp-shot${expanded ? " expanded" : ""}`}>
      {/* 主行 ── 镜号 + 旁白（像剧本的 action line） */}
      <div className="sp-shot-row" onClick={() => setExpanded(!expanded)}>
        <span className="sp-gutter">
          <span className="sp-gutter-idx">#{shot.idx}</span>
          <span className="sp-gutter-type">{SHOT_TYPES.find((t) => t.value === shot.shotType)?.label ?? shot.shotType}</span>
        </span>
        <span className="sp-action">{shot.narration || (zh ? "（点击编辑旁白）" : "(click to edit)")}</span>
        <button
          className="sp-btn sp-btn-del"
          onClick={(e) => { e.stopPropagation(); removeShot(episode.id, scene.id, shot.id); }}
        >×</button>
      </div>

      {/* 对白区（始终显示，若有对白） */}
      {!expanded && shot.dialogue && shot.dialogue.length > 0 && (
        <div className="sp-dialogue-preview">
          {shot.dialogue.map((d, di) => {
            const speaker = d.speakerId ? series.bible.find((e) => e.id === d.speakerId)?.name : null;
            return (
              <div key={di} className="sp-dialogue-line">
                <span className="sp-character">{speaker?.toUpperCase() ?? (zh ? "旁白" : "V.O.")}</span>
                <span className="sp-dialogue">{d.line}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 展开编辑 */}
      {expanded && (
        <div className="sp-detail">
          <div className="sp-field">
            <label>{zh ? "旁白 / 画面描述" : "Action"}</label>
            <textarea
              value={shot.narration ?? ""}
              onChange={(e) => updateShot(episode.id, scene.id, shot.id, { narration: e.target.value })}
              rows={3}
              placeholder={zh ? "描述画面动作…" : "Describe the action…"}
            />
          </div>

          <div className="sp-field">
            <label>{zh ? "镜头类型" : "Shot Type"}</label>
            <select
              value={shot.shotType}
              onChange={(e) => updateShot(episode.id, scene.id, shot.id, { shotType: e.target.value as StageShotType })}
            >
              {SHOT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="sp-field">
            <label>{zh ? "对白" : "Dialogue"}</label>
            {(shot.dialogue ?? []).map((d, di) => (
              <div key={di} className="sp-dialogue-edit">
                <select
                  value={d.speakerId ?? ""}
                  onChange={(e) => {
                    const next = [...(shot.dialogue ?? [])];
                    next[di] = { ...next[di], speakerId: e.target.value || undefined };
                    updateShot(episode.id, scene.id, shot.id, { dialogue: next });
                  }}
                >
                  <option value="">{zh ? "旁白" : "V.O."}</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  value={d.line}
                  onChange={(e) => {
                    const next = [...(shot.dialogue ?? [])];
                    next[di] = { ...next[di], line: e.target.value };
                    updateShot(episode.id, scene.id, shot.id, { dialogue: next });
                  }}
                  placeholder={zh ? "台词…" : "Line…"}
                />
                <button
                  className="sp-btn sp-btn-del"
                  onClick={() => {
                    const next = (shot.dialogue ?? []).filter((_, i) => i !== di);
                    updateShot(episode.id, scene.id, shot.id, { dialogue: next });
                  }}
                >×</button>
              </div>
            ))}
            <button
              className="sp-btn"
              onClick={() => {
                const next = [...(shot.dialogue ?? []), { line: "" }];
                updateShot(episode.id, scene.id, shot.id, { dialogue: next });
              }}
            >+ {zh ? "加台词" : "Add line"}</button>
          </div>

          <div className="sp-field sp-field-row">
            <label>{zh ? "画面提示词" : "Image Prompt"}</label>
            <textarea
              value={shot.imagePrompt ?? ""}
              onChange={(e) => updateShot(episode.id, scene.id, shot.id, { imagePrompt: e.target.value })}
              rows={2}
              placeholder={zh ? "留空自动生成" : "Auto-generated if empty"}
            />
          </div>

          <div className="sp-field sp-field-inline">
            <label>{zh ? "时长" : "Duration"}</label>
            <input
              type="number"
              value={shot.durationSec}
              min={1}
              max={30}
              onChange={(e) => updateShot(episode.id, scene.id, shot.id, { durationSec: +e.target.value })}
            />
            <span>s</span>
          </div>
        </div>
      )}
    </div>
  );
}
