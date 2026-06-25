"use client";

import { useMemo, useState } from "react";
import {
  useStudioStore,
  type Series,
  type StageEpisode,
  type StageShot,
  type Job,
} from "@/lib/store";
import {
  shotImageUrl,
  shotVideoUrl,
  shotVoiceUrl,
  genShotImage,
  genShotVoice,
  genShotVideo,
} from "@/lib/stage/stageGen";

type Props = { series: Series; episode: StageEpisode; zh: boolean };

type BusyKind = "image" | "video" | "voice" | undefined;

export default function BoardWorkspace({ series, episode, zh }: Props) {
  const jobs = useStudioStore((s) => s.jobs);
  const [busyShots, setBusyShots] = useState<Record<string, BusyKind>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const allShots = useMemo(() => {
    const out: { shot: StageShot; sceneId: string; sceneIdx: number }[] = [];
    episode.scenes.forEach((sc, si) => {
      sc.shots.forEach((sh) => out.push({ shot: sh, sceneId: sc.id, sceneIdx: si }));
    });
    return out;
  }, [episode]);

  function markBusy(shotId: string, kind: BusyKind) {
    setBusyShots((prev) => ({ ...prev, [shotId]: kind }));
  }

  async function handleGenImage(shot: StageShot, sceneId: string) {
    markBusy(shot.id, "image");
    try {
      await genShotImage(shot, series, episode.id, sceneId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(shot.id, undefined);
    }
  }

  async function handleGenVoice(shot: StageShot, sceneId: string) {
    markBusy(shot.id, "voice");
    try {
      await genShotVoice(shot, series, episode.id, sceneId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(shot.id, undefined);
    }
  }

  async function handleGenVideo(shot: StageShot, sceneId: string) {
    const imgUrl = shotImageUrl(shot, jobById);
    if (!imgUrl) {
      alert(zh ? "先出静帧再动起来" : "Generate still first");
      return;
    }
    markBusy(shot.id, "video");
    try {
      await genShotVideo(shot, series, episode.id, sceneId, imgUrl);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(shot.id, undefined);
    }
  }

  async function handleBulkGen() {
    if (allShots.length === 0) return;
    setBulkBusy(true);
    try {
      for (const { shot, sceneId } of allShots) {
        const s = useStudioStore.getState().series;
        const ep = s.episodes.find((e) => e.id === episode.id);
        if (!ep) break;
        const sc = ep.scenes.find((sc2) => sc2.id === sceneId);
        const freshShot = sc?.shots.find((sh) => sh.id === shot.id);
        if (!freshShot) continue;

        if (!shotImageUrl(freshShot, jobById)) {
          try { await genShotImage(freshShot, s, episode.id, sceneId); } catch { /* skip */ }
        }
        if (!shotVoiceUrl(freshShot) && (freshShot.narration?.trim() || freshShot.dialogue?.length)) {
          try { await genShotVoice(freshShot, s, episode.id, sceneId); } catch { /* skip */ }
        }
      }
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="board">
      <div className="board-toolbar">
        <span className="board-count">
          {allShots.length} {zh ? "拍" : "shots"}
        </span>
        <button
          className="board-bulk-btn"
          disabled={bulkBusy || allShots.length === 0}
          onClick={handleBulkGen}
        >
          {bulkBusy
            ? (zh ? "生成中…" : "Generating…")
            : (zh ? "全部出图+配音" : "Bulk generate")}
        </button>
      </div>

      <div className="board-wall">
        {allShots.map(({ shot, sceneId, sceneIdx }) => {
          const imgUrl = shotImageUrl(shot, jobById);
          const vidUrl = shotVideoUrl(shot, jobById);
          const voiceUrl = shotVoiceUrl(shot);
          const busy = busyShots[shot.id];

          return (
            <div key={shot.id} className="board-card">
              <div className="board-card-media">
                {vidUrl ? (
                  <video src={vidUrl} className="board-card-vid" muted loop playsInline
                    onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                    onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  />
                ) : imgUrl ? (
                  <img src={imgUrl} alt="" className="board-card-img" />
                ) : (
                  <div className="board-card-ph"><span>{shot.idx}</span></div>
                )}
                {busy && (
                  <div className="board-card-busy">
                    {busy === "image" ? "🖼" : busy === "video" ? "🎬" : "🎤"}
                  </div>
                )}
              </div>

              <div className="board-card-info">
                <span className="board-card-idx">S{sceneIdx + 1}.{shot.idx}</span>
                <span className="board-card-type">{shot.shotType}</span>
              </div>

              <div className="board-card-text">
                {shot.narration?.slice(0, 40) || (zh ? "(空)" : "(empty)")}
              </div>

              <div className="board-card-steps">
                <button
                  className={`board-step${imgUrl ? " done" : ""}`}
                  disabled={!!busy}
                  onClick={() => handleGenImage(shot, sceneId)}
                  title={zh ? "出静帧" : "Generate still"}
                >
                  🖼
                </button>
                <button
                  className={`board-step${vidUrl ? " done" : ""}`}
                  disabled={!!busy || !imgUrl}
                  onClick={() => handleGenVideo(shot, sceneId)}
                  title={zh ? "动起来" : "Animate"}
                >
                  🎬
                </button>
                <button
                  className={`board-step${voiceUrl ? " done" : ""}`}
                  disabled={!!busy}
                  onClick={() => handleGenVoice(shot, sceneId)}
                  title={zh ? "配音" : "Voice"}
                >
                  🎤
                </button>
              </div>

              <div className="board-card-indicators">
                {imgUrl && <span className="board-dot board-dot-img" />}
                {vidUrl && <span className="board-dot board-dot-vid" />}
                {voiceUrl && <span className="board-dot board-dot-voice" />}
              </div>
            </div>
          );
        })}

        {allShots.length === 0 && (
          <div className="board-empty">
            {zh
              ? "还没有分镜。先到「剧本」写几拍。"
              : "No shots yet. Write some in Script first."}
          </div>
        )}
      </div>
    </div>
  );
}
