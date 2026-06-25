"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useStudioStore, type Job, type StageShot } from "@/lib/store";
import { shotImageUrl, shotVideoUrl } from "@/lib/stage/stageGen";

type Props = {
  selectedShotId: string | null;
  onSelectShot: (id: string) => void;
  onAddShot?: () => void;
  onBatchGen?: () => void;
  onComposer?: () => void;
  zh: boolean;
};

export default function ShotSidebar({ selectedShotId, onSelectShot, onAddShot, onBatchGen, onComposer, zh }: Props) {
  const series = useStudioStore((s) => s.series);
  const jobs = useStudioStore((s) => s.jobs);
  const moveShot = useStudioStore((s) => s.seriesMoveShot);
  const currentEp = series.episodes[0];

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const allShots = useMemo(() => {
    if (!currentEp) return [];
    const out: { shot: StageShot; sceneIdx: number; sceneId: string }[] = [];
    currentEp.scenes.forEach((sc, si) => {
      sc.shots.forEach((sh) => out.push({ shot: sh, sceneIdx: si, sceneId: sc.id }));
    });
    return out;
  }, [currentEp]);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedShotId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-shot-id="${selectedShotId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedShotId]);

  const totalDur = allShots.reduce((s, r) => s + (r.shot.durationSec || 0), 0);

  // ── Drag & Drop ──
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
    (e.currentTarget as HTMLElement).classList.add("dragging");
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    setDragIdx(null);
    setDropIdx(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx !== null && idx !== dragIdx) {
      setDropIdx(idx);
    }
  }, [dragIdx]);

  const handleDrop = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx || !currentEp) return;
    const fromItem = allShots[dragIdx];
    const toItem = allShots[targetIdx];
    if (fromItem.sceneId === toItem.sceneId) {
      moveShot(currentEp.id, fromItem.sceneId, fromItem.shot.idx, toItem.shot.idx);
    }
    setDragIdx(null);
    setDropIdx(null);
  }, [dragIdx, allShots, currentEp, moveShot]);

  return (
    <aside className="sb-sidebar">
      <div className="sb-header">
        <span className="sb-title">{zh ? "分镜预览" : "Shots"}</span>
        <span className="sb-count">{allShots.length} {zh ? "镜" : "shots"}</span>
      </div>

      <div className="sb-list" ref={listRef}>
        {allShots.length === 0 ? (
          <div className="sb-empty">
            {zh ? "还没有分镜。先到「剧本」写几拍。" : "No shots yet. Write some in Script."}
          </div>
        ) : (
          allShots.map(({ shot, sceneIdx, sceneId }, idx) => {
            const imgUrl = shotImageUrl(shot, jobById);
            const vidUrl = shotVideoUrl(shot, jobById);
            const isSelected = selectedShotId === shot.id;

            return (
              <div key={shot.id}>
                {dropIdx === idx && dragIdx !== null && dragIdx !== idx && (
                  <div className="sb-drop-indicator" />
                )}
                <div
                  data-shot-id={shot.id}
                  className={`sb-card${isSelected ? " selected" : ""}`}
                  onClick={() => onSelectShot(shot.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  <div className="sb-card-thumb">
                    {vidUrl ? (
                      <video
                        src={vidUrl}
                        muted
                        loop
                        playsInline
                        className="sb-card-media"
                        onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                      />
                    ) : imgUrl ? (
                      <img src={imgUrl} alt="" className="sb-card-media" />
                    ) : (
                      <div className="sb-card-ph">
                        <span>{shot.idx}</span>
                      </div>
                    )}
                    <span className="sb-card-dur">{shot.durationSec.toFixed(1)}s</span>
                    {vidUrl && <span className="sb-card-play">&#9654;</span>}
                  </div>
                  <div className="sb-card-meta">
                    <span className="sb-card-idx">S{sceneIdx + 1}.{shot.idx}</span>
                    <span className="sb-card-type">{shot.shotType}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sb-footer">
        <div className="sb-actions">
          {onAddShot && (
            <button className="ss-btn" onClick={onAddShot}>+ {zh ? "加镜" : "Add"}</button>
          )}
          {onComposer && (
            <button className="ss-btn" onClick={onComposer}>{zh ? "AI 续写" : "AI Write"}</button>
          )}
          {onBatchGen && (
            <button className="ss-btn primary" onClick={onBatchGen}>{zh ? "全部出图" : "Gen All"}</button>
          )}
        </div>
        <div className="sb-footer-info">
          <span>{Math.floor(totalDur / 60)}:{String(Math.round(totalDur % 60)).padStart(2, "0")}</span>
          <span>·</span>
          <span>{allShots.length} {zh ? "镜" : "shots"}</span>
        </div>
      </div>
    </aside>
  );
}
