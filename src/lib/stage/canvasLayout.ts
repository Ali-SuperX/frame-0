import type { StageScene, StageShot } from "@/lib/store";

export const SHOT_NODE_W = 220;
export const SHOT_NODE_H = 160;
const GAP_X = 36;
const GAP_Y = 80;
const SCENE_PAD = 24;

export type ShotPos = { shotId: string; x: number; y: number };
export type SceneBox = { sceneId: string; x: number; y: number; w: number; h: number };

export function layoutEpisode(
  scenes: StageScene[],
): { shots: ShotPos[]; boxes: SceneBox[] } {
  const shots: ShotPos[] = [];
  const boxes: SceneBox[] = [];
  let cy = 0;

  for (const scene of scenes) {
    let cx = 0;
    const sceneShots: ShotPos[] = [];

    for (const shot of scene.shots) {
      if (shot._cx != null && shot._cy != null) {
        sceneShots.push({ shotId: shot.id, x: shot._cx, y: shot._cy });
        cx = Math.max(cx, shot._cx + SHOT_NODE_W + GAP_X);
      } else {
        sceneShots.push({ shotId: shot.id, x: cx, y: cy });
        cx += SHOT_NODE_W + GAP_X;
      }
    }

    if (sceneShots.length > 0) {
      const xs = sceneShots.map((s) => s.x);
      const ys = sceneShots.map((s) => s.y);
      const minX = Math.min(...xs) - SCENE_PAD;
      const minY = Math.min(...ys) - SCENE_PAD - 28;
      const maxX = Math.max(...xs) + SHOT_NODE_W + SCENE_PAD;
      const maxY = Math.max(...ys) + SHOT_NODE_H + SCENE_PAD;
      boxes.push({ sceneId: scene.id, x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    }

    shots.push(...sceneShots);
    cy += SHOT_NODE_H + GAP_Y + 28;
  }

  return { shots, boxes };
}

/** 整理画布：忽略当前 _cx/_cy，按场景行重新排布，返回全新坐标 */
export function reflowPositions(scenes: StageScene[]): ShotPos[] {
  const out: ShotPos[] = [];
  let cy = 0;
  for (const scene of scenes) {
    let cx = 0;
    for (const shot of scene.shots) {
      out.push({ shotId: shot.id, x: cx, y: cy });
      cx += SHOT_NODE_W + GAP_X;
    }
    cy += SHOT_NODE_H + GAP_Y + 28;
  }
  return out;
}

export function appendShotPosition(
  existing: ShotPos[],
  scene: StageScene,
  newShotId: string,
): { x: number; y: number } {
  const sceneShots = existing.filter((s) =>
    scene.shots.some((sh) => sh.id === s.shotId),
  );
  if (sceneShots.length === 0) return { x: 0, y: 0 };
  const last = sceneShots[sceneShots.length - 1];
  return { x: last.x + SHOT_NODE_W + GAP_X, y: last.y };
}
