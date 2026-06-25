/**
 * useCinema —— 数据适配层（★可扩展核心）
 * 把底层 Series/StageShot/jobs 映射成视图唯一认得的 CineFilm 中间模型。
 * 接真实 AI / 换数据源 / 加字段 / 改取图逻辑，都只动这里，视图组件零改动。
 */
import { useEffect, useMemo } from "react";
import { useStudioStore } from "@/lib/store";
import { shotImageUrl, shotVideoUrl } from "@/lib/stage/stageGen";
import { MOVE_ZH } from "./config";
import { DEMO_CAST, DEMO_SHOTS } from "./demo";
import type { CineCast, CineFilm, CineMedia, CineShot } from "./types";

export function useCinema(): CineFilm {
  const series = useStudioStore((s) => s.series);
  const jobs = useStudioStore((s) => s.jobs);
  const migrateIfNeeded = useStudioStore((s) => s.migrateIfNeeded);
  useEffect(() => { migrateIfNeeded(); }, [migrateIfNeeded]);

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const currentEp = series.episodes[0];

  const realShots = useMemo<CineShot[]>(() => {
    if (!currentEp) return [];
    const elById = (id?: string) => series.bible.find((b) => b.id === id);
    return currentEp.scenes.flatMap((sc) =>
      sc.shots.map((shot) => {
        const img = shotImageUrl(shot, jobById);
        const vid = shotVideoUrl(shot, jobById);
        const d = shot.dialogue?.find((l) => l.line?.trim());
        const sp = d ? elById(d.speakerId) : undefined;
        const media: CineMedia = vid
          ? { kind: "video", url: vid, poster: img }
          : img
            ? { kind: "image", url: img }
            : { kind: "pending", prompt: shot.imagePrompt };
        return {
          id: shot.id,
          idx: shot.idx,
          media,
          shotType: shot.shotType,
          move: MOVE_ZH[shot.shotType] ?? shot.shotType,
          durSec: shot.durationSec || 0,
          speaker: sp?.name,
          speakerColor: sp?.color ?? "var(--accent)",
          line: (d?.line ?? shot.narration ?? "").trim(),
          narration: shot.narration ?? "",
          prompt: shot.imagePrompt ?? "",
        } satisfies CineShot;
      }),
    );
  }, [currentEp, series.bible, jobById]);

  const realCast = useMemo<CineCast[]>(
    () =>
      series.bible
        .filter((e) => e.kind === "character")
        .map((e) => ({ id: e.id, name: e.name, color: e.color ?? "var(--accent)" })),
    [series.bible],
  );

  const isDemo = realShots.length === 0;
  const shots = isDemo ? DEMO_SHOTS : realShots;
  const cast = isDemo ? DEMO_CAST : realCast;

  return {
    title: isDemo ? "霓虹猎手" : series.name?.trim() || "未命名",
    epLabel: isDemo
      ? "示例 · 信号塔"
      : `EP.${String(currentEp?.num ?? 1).padStart(2, "0")}${currentEp?.title ? ` · ${currentEp.title}` : ""}`,
    shots,
    cast,
    isDemo,
    totalDurSec: shots.reduce((s, x) => s + x.durSec, 0),
  };
}
