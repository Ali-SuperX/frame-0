/**
 * LumenX prompt 构造（纯函数）—— 手动按钮与「一键串联」共用同一套，
 * 保证两条路径出的图/视频完全一致（尤其角色一致性锚定逻辑不漂移）。
 */

import type { LxProject, LxShot, LxStyle, LxAspect } from "./types";
import { shotSizeEn, cameraMotion } from "./presets";

export type AssetKind = "character" | "scene" | "prop";

/** 角色/场景/道具 形象图 prompt。 */
export function assetImagePrompt(
  kind: AssetKind,
  name: string,
  description: string,
  stylePos?: string,
): string {
  const hint =
    kind === "character"
      ? "character reference, full body, neutral pose, clean solid background, consistent design"
      : kind === "scene"
        ? "establishing shot, environment concept art, no people, cinematic atmosphere"
        : "product shot, single object isolated on plain background, studio lighting";
  return [name, description, hint, stylePos].filter(Boolean).join(", ");
}

/** 角色用竖图(便于做立绘参考)，场景/道具跟项目画幅。 */
export function assetAspect(kind: AssetKind, projectAspect: LxAspect): LxAspect {
  return kind === "character" ? "9:16" : projectAspect;
}

/** 分镜帧渲染：拼 prompt（含角色一致性锚定）+ 收集参考图（角色>场景>道具）。 */
export function shotImageInput(
  shot: LxShot,
  project: LxProject,
  style?: LxStyle,
): { prompt: string; refImages: string[] } {
  const chars = shot.characterIds
    .map((id) => project.characters.find((c) => c.id === id))
    .filter(Boolean) as LxProject["characters"];
  const scene = project.scenes.find((s) => s.id === shot.sceneId);
  const props = shot.propIds
    .map((id) => project.props.find((p) => p.id === id))
    .filter(Boolean) as LxProject["props"];

  const refChars = chars.filter((c) => c.imageUrl);
  const refImages = [
    ...refChars.map((c) => c.imageUrl!),
    ...(scene?.imageUrl ? [scene.imageUrl] : []),
    ...(props.map((p) => p.imageUrl).filter(Boolean) as string[]),
  ];
  const anchor = refChars.length
    ? `Keep each character's face, hairstyle, body and clothing identical to the reference images — ${refChars.map((c) => `${c.name}: ${c.description}`).join("; ")}. `
    : "";
  const prompt = [anchor + (shot.imagePrompt || shot.action), shotSizeEn(shot.shotSize), style?.positivePrompt]
    .filter(Boolean)
    .join(", ");
  return { prompt, refImages };
}

/** 分镜帧 → 视频 的 prompt（画面 + 运镜运动提示）。 */
export function shotVideoPrompt(shot: LxShot): string {
  return (shot.imagePrompt || shot.action) + cameraMotion(shot.camera);
}
