/**
 * 片场 → 剪辑器:把一集 beats 转成 EditorProject(纯函数)。
 *
 * 规则:
 *   - V1 视频轨:每个 beat 一个 clip,按 startSec 顺序排列
 *       · 有 videoUrl → 真视频 clip
 *       · 有 imageUrl 无 video → 图当 still clip(mediaType: 'image')
 *       · 都没有 → 跳过(在返回值的 skipped 里记录)
 *   - A1 旁白轨:beat 有 voiceUrl 则加 audio clip(同步 startSec)
 *   - 字幕:beat.text 写进 clip.text(top 位置,白色,28px)
 *   - 画幅:跟随 castProject.aspect(漫剧默认 9:16)
 *   - BGM:project.bgm 直接传递(volume 0.3 让旁白更清晰)
 *
 * 不做(留给后续 phase):
 *   - Ken Burns 关键帧 —— EditorClip 暂无 keyframes 支持
 *   - 角色 caption 配色(按 speakerId 区分)
 *   - 真视频长度对齐 beat 时长(超时裁剪 / 不足凑齐)
 *
 * 返回 { project, stats } —— stats 让 UI 提示"5 拍成功 / 2 拍未生成图被跳过"。
 */

import type {
  CastBeat,
  CastEpisode,
  CastProject,
  EditorClip,
  EditorProject,
  Job,
  Series,
  StageEpisode,
  StageShot,
} from "@/lib/store";
import { DEFAULT_TRACKS } from "@/lib/store";

function mediaDisplayUrl(media: Job["media"]["img_url"] | undefined): string | undefined {
  return media?.previewUrl || media?.localPath || media?.thumbDataUrl || media?.url;
}

export type EpisodeConvertStats = {
  /** 成功生成 V1 clip 的 beat 数 */
  ok: number;
  /** 因无产物被跳过的 beat 数 */
  skipped: number;
  /** 跳过的 beat idx 列表(给 UI 提示用) */
  skippedIdxs: number[];
  /** 有旁白(A1)的 beat 数 */
  withVoice: number;
};

export type EpisodeConvertResult = {
  project: EditorProject;
  stats: EpisodeConvertStats;
};

/**
 * 给定 beat 反查它的图片/视频/旁白 URL。
 * imageJobId/videoJobId 指向 Job,从 jobs 列表里取;
 * voiceJobId 直接就是 audioUrl(TTS 返回的 /api/uploads/<sha>.mp3 永久 URL)。
 */
function resolveBeatMedia(
  beat: CastBeat,
  jobById: Map<string, Job>
): { imageUrl?: string; videoUrl?: string; voiceUrl?: string } {
  const out: { imageUrl?: string; videoUrl?: string; voiceUrl?: string } = {};
  if (beat.imageJobId) {
    const j = jobById.get(beat.imageJobId);
    out.imageUrl = mediaDisplayUrl(j?.media?.img_url) || mediaDisplayUrl(j?.media?.ref_images?.[0]);
  }
  if (beat.videoJobId) {
    const j = jobById.get(beat.videoJobId);
    if (j?.videoUrl) out.videoUrl = j.videoUrl;
  }
  if (beat.voiceJobId && beat.voiceJobId.startsWith("/api/")) {
    out.voiceUrl = beat.voiceJobId;
  }
  return out;
}

/**
 * 拼集主入口。
 *
 * @param episode 当前集
 * @param project 整剧(用 aspect / bgm)
 * @param jobById 反查 beat 产物的 Job map
 * @param range I/O 范围(1-based beat.idx,inclusive)。不传 = 整集
 */
export function episodeToEditorProject(
  episode: CastEpisode,
  project: CastProject,
  jobById: Map<string, Job>,
  range?: { in?: number | null; out?: number | null }
): EpisodeConvertResult {
  const clips: EditorClip[] = [];
  let cursorSec = 0; // V1 时间游标
  let ok = 0;
  let skipped = 0;
  const skippedIdxs: number[] = [];
  let withVoice = 0;

  // —— 应用 I/O 范围 ——
  const inIdx = range?.in ?? null;
  const outIdx = range?.out ?? null;
  const beatsInRange = episode.beats.filter((b) => {
    if (inIdx !== null && b.idx < inIdx) return false;
    if (outIdx !== null && b.idx > outIdx) return false;
    return true;
  });

  for (const beat of beatsInRange) {
    const media = resolveBeatMedia(beat, jobById);
    const dur = beat.durationSec || 4;

    // V1 主画面 —— 视频优先,无视频用图,都无就跳过
    if (media.videoUrl) {
      const clip: EditorClip = {
        id: `stage-v1-${beat.id}`,
        sourceUrl: media.videoUrl,
        sourceTitle: `[EP${episode.num}] #${beat.idx}`,
        duration: dur,
        in: 0,
        out: dur,
        volume: 0.6, // 短剧视频自带音轨,稍压低让旁白突出
        speed: 1,
        mediaType: "video",
        trackId: "v1",
        startSec: cursorSec,
        text: beat.text
          ? {
              content: beat.text,
              position: "bottom",
              color: "#fff",
              sizePx: 26,
            }
          : undefined,
      };
      clips.push(clip);
      ok++;
    } else if (media.imageUrl) {
      const clip: EditorClip = {
        id: `stage-v1-${beat.id}`,
        sourceUrl: media.imageUrl,
        sourceTitle: `[EP${episode.num}] #${beat.idx}`,
        duration: dur,
        in: 0,
        out: dur,
        volume: 0, // 图本无声,V1 静音让旁白(A1)负责声音
        muted: true,
        speed: 1,
        mediaType: "image",
        trackId: "v1",
        startSec: cursorSec,
        text: beat.text
          ? {
              content: beat.text,
              position: "bottom",
              color: "#fff",
              sizePx: 26,
            }
          : undefined,
      };
      clips.push(clip);
      ok++;
    } else {
      skipped++;
      skippedIdxs.push(beat.idx);
      // 时间游标不前进 —— 跳过的 beat 不占时间(避免空洞)
      continue;
    }

    // A1 旁白 —— 与 V1 clip 同 startSec
    if (media.voiceUrl) {
      const voiceClip: EditorClip = {
        id: `stage-a1-${beat.id}`,
        sourceUrl: media.voiceUrl,
        sourceTitle: `[EP${episode.num}] #${beat.idx} 旁白`,
        duration: dur,
        in: 0,
        out: dur,
        volume: 1.0, // 旁白满音量
        speed: 1,
        mediaType: "audio",
        trackId: "a1",
        startSec: cursorSec,
      };
      clips.push(voiceClip);
      withVoice++;
    }

    cursorSec += dur;
  }

  // 标题带范围(若有)便于在 editor 里识别"这是片段不是整集"
  const isRanged = inIdx !== null || outIdx !== null;
  const rangeSuffix = isRanged
    ? ` [${inIdx ?? 1}-${outIdx ?? episode.beats.length}]`
    : "";

  const editorProject: EditorProject = {
    id: `stage-${project.id}-${episode.id}${isRanged ? `-r${inIdx ?? ""}-${outIdx ?? ""}` : ""}`,
    name: `${project.name} · ${episode.title}${rangeSuffix}`,
    clips,
    aspect: project.aspect,
    crossfadeSec: 0.3, // 淡入淡出 0.3s,漫剧/短剧拍间过渡更顺
    transitionType: "fade",
    exportHeight: 1080,
    tracks: DEFAULT_TRACKS,
    bgm: project.bgm
      ? {
          ...project.bgm,
          volume: 0.3, // 压低 BGM 让旁白清晰
        }
      : undefined,
    updatedAt: Date.now(),
  };

  return {
    project: editorProject,
    stats: { ok, skipped, skippedIdxs, withVoice },
  };
}

/* ─── v2: Series/StageEpisode → EditorProject ─── */

function resolveShotMedia(
  shot: StageShot,
  jobById: Map<string, Job>
): { imageUrl?: string; videoUrl?: string; voiceUrl?: string } {
  const out: { imageUrl?: string; videoUrl?: string; voiceUrl?: string } = {};
  if (shot.imageJobId) {
    const j = jobById.get(shot.imageJobId);
    out.imageUrl = mediaDisplayUrl(j?.media?.img_url) || mediaDisplayUrl(j?.media?.ref_images?.[0]);
  }
  if (shot.videoJobId) {
    const j = jobById.get(shot.videoJobId);
    if (j?.videoUrl) out.videoUrl = j.videoUrl;
  }
  if (shot.voiceJobId?.startsWith("/api/")) {
    out.voiceUrl = shot.voiceJobId;
  }
  return out;
}

export function seriesToEditorProject(
  episode: StageEpisode,
  series: Series,
  jobById: Map<string, Job>,
): EpisodeConvertResult {
  const clips: EditorClip[] = [];
  let cursorSec = 0;
  let ok = 0;
  let skipped = 0;
  const skippedIdxs: number[] = [];
  let withVoice = 0;
  const captionPosition = series.editConfig?.captionPosition ?? "bottom";
  const captionSizePx = series.editConfig?.captionSizePx ?? 26;

  let globalIdx = 0;
  for (const scene of episode.scenes) {
    for (const shot of scene.shots) {
      globalIdx++;
      const media = resolveShotMedia(shot, jobById);
      const dur = shot.durationSec || 4;
      const text = shot.narration || shot.dialogue?.[0]?.line;

      if (media.videoUrl) {
        clips.push({
          id: `stage-v1-${shot.id}`,
          sourceUrl: media.videoUrl,
          sourceTitle: `[EP${episode.num}] #${globalIdx}`,
          duration: dur, in: 0, out: dur,
          volume: 0.6, speed: 1,
          mediaType: "video", trackId: "v1", startSec: cursorSec,
          text: text ? { content: text, position: captionPosition, color: "#fff", sizePx: captionSizePx } : undefined,
        });
        ok++;
      } else if (media.imageUrl) {
        clips.push({
          id: `stage-v1-${shot.id}`,
          sourceUrl: media.imageUrl,
          sourceTitle: `[EP${episode.num}] #${globalIdx}`,
          duration: dur, in: 0, out: dur,
          volume: 0, muted: true, speed: 1,
          mediaType: "image", trackId: "v1", startSec: cursorSec,
          text: text ? { content: text, position: captionPosition, color: "#fff", sizePx: captionSizePx } : undefined,
        });
        ok++;
      } else {
        skipped++;
        skippedIdxs.push(globalIdx);
        continue;
      }

      if (media.voiceUrl) {
        clips.push({
          id: `stage-a1-${shot.id}`,
          sourceUrl: media.voiceUrl,
          sourceTitle: `[EP${episode.num}] #${globalIdx} 旁白`,
          duration: dur, in: 0, out: dur,
          volume: 1.0, speed: 1,
          mediaType: "audio", trackId: "a1", startSec: cursorSec,
        });
        withVoice++;
      }

      cursorSec += dur;
    }
  }

  return {
    project: {
      id: `stage-${series.id}-${episode.id}`,
      name: `${series.name} · ${episode.title}`,
      clips,
      aspect: series.aspect,
      crossfadeSec: series.editConfig?.crossfadeSec ?? 0.3,
      transitionType: series.editConfig?.transitionType ?? "fade",
      exportHeight: series.exportConfig?.height ?? 1080,
      tracks: DEFAULT_TRACKS,
      bgm: series.bgm ? { ...series.bgm, volume: 0.3 } : undefined,
      updatedAt: Date.now(),
    },
    stats: { ok, skipped, skippedIdxs, withVoice },
  };
}
