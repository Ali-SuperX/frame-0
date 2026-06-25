"use client";

/**
 * TimelineWorkspace —— 「时间轴」三栏创作视图
 * 左栏：当前场景脚本 + 角色缩略
 * 中栏：CinemaScreen（所见即所编）+ 底部胶片条
 * 复用 cinema/ 下组件，数据通过 useCinema 适配。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore, type StageShot } from "@/lib/store";
import { genShotImage, genShotVoice, genShotVideo, shotImageUrl } from "@/lib/stage/stageGen";
import { useCinema } from "./cinema/useCinema";
import { usePlayback } from "./cinema/usePlayback";
import { CinemaScreen } from "./cinema/CinemaScreen";
import { CinemaFilmstrip } from "./cinema/CinemaFilmstrip";
import type { Series, StageEpisode, Job } from "@/lib/store";

type Props = {
  series: Series;
  episode: StageEpisode;
  jobById: Map<string, Job>;
  selectedShotId: string | null;
  onSelectShot: (id: string | null) => void;
  zh: boolean;
};

export default function TimelineWorkspace({ series, episode, jobById, selectedShotId, onSelectShot, zh }: Props) {
  const film = useCinema();
  const durations = useMemo(() => film.shots.map((s) => s.durSec), [film.shots]);
  const pb = usePlayback(durations);

  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);

  const [generating, setGenerating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const curShot = film.shots[pb.cur];

  // 同步外部选中 → 内部 playback
  useEffect(() => {
    if (!selectedShotId) return;
    const idx = film.shots.findIndex((s) => s.id === selectedShotId);
    if (idx >= 0 && idx !== pb.cur) pb.go(idx);
  }, [selectedShotId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 同步内部 playback → 外部选中
  useEffect(() => {
    const shot = film.shots[pb.cur];
    if (shot && shot.id !== selectedShotId) onSelectShot(shot.id);
  }, [pb.cur]); // eslint-disable-line react-hooks/exhaustive-deps

  // 找真实 shot 用于 patch
  const findReal = (id?: string) => {
    if (film.isDemo || !id) return null;
    for (const sc of episode.scenes) {
      const shot = sc.shots.find((s) => s.id === id);
      if (shot) return { shot, sceneId: sc.id };
    }
    return null;
  };
  const editTarget = useMemo(() => findReal(curShot?.id), [film.isDemo, episode, curShot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchCur = (patch: Partial<StageShot>) => {
    if (editTarget) updateShot(episode.id, editTarget.sceneId, editTarget.shot.id, patch);
  };

  // 加镜后跳到新镜
  const prevLen = useRef(0);
  useEffect(() => {
    const n = film.isDemo ? 0 : film.shots.length;
    if (n > prevLen.current && prevLen.current > 0) pb.go(n - 1);
    prevLen.current = n;
  }, [film.isDemo, film.shots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function addBlankShot() {
    let sceneId = episode.scenes[0]?.id;
    if (!sceneId) sceneId = addScene(episode.id);
    addShot(episode.id, sceneId, { shotType: "still", durationSec: 3, narration: "", elementRefs: [] });
    showToast(zh ? "已加一镜" : "Shot added");
  }

  // 生成
  async function genOne(kind: "image" | "voice" | "video") {
    if (!editTarget || generating) return;
    const { shot, sceneId } = editTarget;
    setGenerating(`${kind}-${shot.id}`);
    try {
      if (kind === "image") await genShotImage(shot, series, episode.id, sceneId);
      else if (kind === "voice") await genShotVoice(shot, series, episode.id, sceneId);
      else {
        const u = shotImageUrl(shot, jobById);
        if (!u) { showToast(zh ? "请先出图" : "Generate image first"); return; }
        await genShotVideo(shot, series, episode.id, sceneId, u);
      }
      showToast(`#${shot.idx} ${zh ? "完成" : "done"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally { setGenerating(null); }
  }

  // 当前场景
  const currentScene = useMemo(() => {
    if (!curShot || film.isDemo) return null;
    return episode.scenes.find((sc) => sc.shots.some((s) => s.id === curShot.id)) ?? null;
  }, [curShot, film.isDemo, episode]);

  const sceneCast = useMemo(() => {
    if (!currentScene) return [];
    return currentScene.castIds
      .map((id) => series.bible.find((e) => e.id === id))
      .filter(Boolean) as typeof series.bible;
  }, [currentScene, series.bible]);

  return (
    <div className="tl-workspace">
      {/* 左栏：脚本 */}
      <div className="tl-left">
        {currentScene ? (
          <>
            <h3 className="tl-scene-title">
              {zh ? `场 ${episode.scenes.indexOf(currentScene) + 1}` : `Scene ${episode.scenes.indexOf(currentScene) + 1}`}
            </h3>
            {currentScene.locationId && (
              <span className="tl-scene-loc">
                {series.bible.find((e) => e.id === currentScene.locationId)?.name}
              </span>
            )}
            <div className="tl-cast-row">
              {sceneCast.map((c) => (
                <div key={c.id} className="tl-cast-chip">
                  {c.refImages[0] ? (
                    <img src={c.refImages[0].url} alt={c.name} className="tl-cast-img" />
                  ) : (
                    <div className="tl-cast-ph" style={{ borderColor: c.color }}>{c.name[0]}</div>
                  )}
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
            <div className="tl-script-text">
              {currentScene.shots.map((sh) => (
                <div
                  key={sh.id}
                  className={`tl-script-line${sh.id === curShot?.id ? " active" : ""}`}
                  onClick={() => {
                    const idx = film.shots.findIndex((s) => s.id === sh.id);
                    if (idx >= 0) { pb.go(idx); onSelectShot(sh.id); }
                  }}
                >
                  <span className="tl-line-idx">#{sh.idx}</span>
                  <span className="tl-line-text">{sh.narration || (zh ? "(空)" : "(empty)")}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="tl-left-empty">
            {film.isDemo
              ? (zh ? "示例片 —— 加第一镜开始创作" : "Demo — add a shot to start")
              : (zh ? "选中镜头查看脚本" : "Select a shot to view script")}
          </div>
        )}
      </div>

      {/* 中栏：画布 */}
      <div className="tl-center">
        {curShot && (
          <CinemaScreen
            shot={curShot}
            idx={pb.cur}
            count={film.shots.length}
            editable={!!editTarget}
            generating={generating}
            onPrev={pb.prev}
            onNext={pb.next}
            onPatch={patchCur}
            onGen={genOne}
            onOpenDetail={() => {}}
          />
        )}

        {film.isDemo && (
          <div className="tl-demo-cta">
            <button className="ss-btn primary" onClick={addBlankShot}>+ {zh ? "加第一镜" : "Add first shot"}</button>
          </div>
        )}

        <CinemaFilmstrip shots={film.shots} cur={pb.cur} onSelect={pb.go} onAdd={addBlankShot} />
      </div>

      {toast && <div className="tl-toast">{toast}</div>}
    </div>
  );
}
