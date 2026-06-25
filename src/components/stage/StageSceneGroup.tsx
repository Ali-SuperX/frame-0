"use client";

import type { StageScene, Series, StageElement } from "@/lib/store";
import type { SceneBox } from "@/lib/stage/canvasLayout";

export default function StageSceneGroup({
  scene,
  box,
  series,
  sceneIdx,
  zh,
}: {
  scene: StageScene;
  box: SceneBox;
  series: Series;
  sceneIdx: number;
  zh: boolean;
}) {
  const location = scene.locationId
    ? series.bible.find((e) => e.id === scene.locationId)
    : undefined;
  const cast = scene.castIds
    .map((cid) => series.bible.find((e) => e.id === cid))
    .filter((e): e is StageElement => !!e);

  return (
    <div
      className="sc-scene-box"
      style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div className="sc-scene-head">
        <span className="sc-scene-num">{zh ? `场 ${sceneIdx + 1}` : `S${sceneIdx + 1}`}</span>
        {location && (
          <span className="sc-scene-loc">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {location.name}
          </span>
        )}
        {cast.length > 0 && (
          <span className="sc-scene-cast-avatars">
            {cast.slice(0, 4).map((c) => (
              <span
                key={c.id}
                className="sc-scene-avatar"
                style={{ background: c.color || "var(--ink-3)" }}
                title={c.name}
              >
                {c.refImages?.[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.refImages[0].url} alt="" />
                ) : (
                  c.name?.[0] ?? "?"
                )}
              </span>
            ))}
            {cast.length > 4 && <span className="sc-scene-avatar more">+{cast.length - 4}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
