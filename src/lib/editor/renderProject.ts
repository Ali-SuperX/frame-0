"use client";

import type { EditorAspect, EditorClip, EditorProject } from "@/lib/store";

/**
 * Resolve output dimensions for an aspect ratio.
 * `targetH` is the long edge (or short edge for vertical) → defaults to 1080.
 * Width is derived from aspect to avoid stretching.
 */
export function dimsFor(
  aspect: EditorAspect,
  targetH = 1080
): { w: number; h: number } {
  // Round to even pixels — h264 yuv420p requires it.
  const even = (n: number) => 2 * Math.round(n / 2);
  const h = even(targetH);
  switch (aspect) {
    case "9:16":
      return { w: even(h * 9 / 16), h };
    case "1:1":
      return { w: h, h };
    case "4:3":
      return { w: even(h * 4 / 3), h };
    case "16:9":
    default:
      return { w: even(h * 16 / 9), h };
  }
}

/**
 * Client-side video rendering via ffmpeg.wasm.
 *
 * Pipeline per clip:
 *   1. Fetch source as ArrayBuffer → write to FS as /in-{i}.mp4
 *   2. Run a filter that does (in order): trim, speed, volume, text overlay,
 *      scale+pad to 1280×720, re-encode to /cut-{i}.mp4 (same codec settings
 *      so concat demuxer accepts them)
 * Finally:
 *   3. Build concat list file, run concat demuxer → /out.mp4
 *   4. Read out.mp4, return Blob
 *
 * Why re-encode every clip: concat demuxer refuses mismatched timebases /
 * codec params. Forcing identical output params sidesteps that.
 *
 * Why 1280×720: a safe default. Future: expose as project setting.
 */

export type RenderProgress = {
  stage: "loading" | "downloading" | "processing" | "concat" | "done" | "error";
  /** 0..1 across the whole job; rough. */
  pct?: number;
  message?: string;
};

let ffmpegSingleton: import("@ffmpeg/ffmpeg").FFmpeg | null = null;

async function getFFmpeg(): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ff = new FFmpeg();

  // Load the WASM core from unpkg CDN. toBlobURL dodges CORS issues with
  // the embedded worker script. The corePath below pins a known version.
  const CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegSingleton = ff;
  return ff;
}

/** Escape a string for FFmpeg's drawtext text= argument. */
function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\\\'")
    .replace(/\n/g, " ");
}

/** Build the per-clip filter chain: trim + setpts + scale+pad + optional drawtext.
 *  `fontPath` is the virtual FS path for drawtext (written by renderProject). */
function buildFilter(
  clip: EditorClip,
  dims: { w: number; h: number },
  fontPath?: string
): string {
  const speed = clip.speed || 1;
  const filters: string[] = [];
  // Reverse must come BEFORE setpts (reverse buffers all frames).
  if (clip.reversed) filters.push("reverse");
  if (speed !== 1) filters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
  // Color / exposure adjustments via eq filter (no-op when all defaults).
  const adj = clip.adjust;
  if (adj) {
    const b = adj.brightness ?? 0;
    const c = adj.contrast ?? 1;
    const s = adj.saturation ?? 1;
    if (Math.abs(b) > 0.001 || Math.abs(c - 1) > 0.001 || Math.abs(s - 1) > 0.001) {
      filters.push(
        `eq=brightness=${b.toFixed(3)}:contrast=${c.toFixed(3)}:saturation=${s.toFixed(3)}`
      );
    }
  }
  const { w, h } = dims;
  filters.push(
    `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
    "setsar=1",
    "fps=30"
  );
  // Caption
  if (clip.text?.content?.trim()) {
    const t = clip.text;
    const y =
      t.position === "top"
        ? "40"
        : t.position === "center"
          ? "(h-text_h)/2"
          : "h-text_h-48";
    const col = (t.color || "white").replace(/^#/, "0x");
    const fontArg = fontPath ? `fontfile=${fontPath}:` : "";
    filters.push(
      `drawtext=${fontArg}text='${escapeDrawtext(t.content)}':x=(w-text_w)/2:y=${y}:fontsize=${t.sizePx}:fontcolor=${col}:box=1:boxcolor=black@0.4:boxborderw=10`
    );
  }
  return filters.join(",");
}

function buildAudioFilter(clip: EditorClip): string {
  const speed = clip.speed || 1;
  // muted flag forces volume → 0 regardless of slider value.
  const vol = clip.muted ? 0 : typeof clip.volume === "number" ? clip.volume : 1;
  const parts: string[] = [];
  if (clip.reversed) parts.push("areverse");
  // atempo supports 0.5..2.0; compose with itself for higher factors
  if (speed !== 1) {
    let remaining = speed;
    while (remaining > 2) {
      parts.push("atempo=2.0");
      remaining /= 2;
    }
    while (remaining < 0.5) {
      parts.push("atempo=0.5");
      remaining *= 2;
    }
    if (Math.abs(remaining - 1) > 0.001) {
      parts.push(`atempo=${remaining.toFixed(4)}`);
    }
  }
  if (vol === 0) parts.push("volume=0");
  else if (Math.abs(vol - 1) > 0.001) parts.push(`volume=${vol.toFixed(3)}`);
  // Always normalize to stereo 48k so concat doesn't choke
  parts.push("aresample=48000:async=1", "aformat=sample_fmts=fltp:channel_layouts=stereo");
  return parts.join(",");
}

/**
 * Main entry. Returns a Blob containing the rendered MP4.
 * `onProgress` receives updates frequently — throttle at caller if needed.
 */
export async function renderProject(
  clips: EditorClip[],
  onProgress?: (p: RenderProgress) => void,
  opts?: {
    aspect?: EditorAspect;
    crossfadeSec?: number;
    exportHeight?: number;
    transitionType?: NonNullable<EditorProject["transitionType"]>;
    bgm?: EditorProject["bgm"];
    /** a1 配音轨(独立音频 clip,按 startSec 混进成片) */
    voiceClips?: EditorClip[];
    layout?: NonNullable<EditorProject["layout"]>;
    splitImage?: EditorProject["splitImage"];
    splitRatio?: number;
  }
): Promise<Blob> {
  if (clips.length === 0) {
    throw new Error("Timeline is empty — add at least one clip before export.");
  }
  const canvas = dimsFor(opts?.aspect ?? "16:9", opts?.exportHeight);
  const layout = opts?.layout ?? "single";
  const ratio = Math.max(0.2, Math.min(0.8, opts?.splitRatio ?? 0.5));
  const useSplit = layout !== "single" && !!opts?.splitImage?.sourceUrl;
  // When splitting: the video portion gets a fraction of the canvas; the
  // image fills the rest. Per-clip rendering targets `dims` (the video
  // portion). A final vstack/hstack pass adds the image to fill canvas.
  const even = (n: number) => 2 * Math.round(n / 2);
  const dims: { w: number; h: number } = useSplit
    ? layout === "vsplit"
      ? { w: canvas.w, h: even(canvas.h * ratio) }
      : { w: even(canvas.w * ratio), h: canvas.h }
    : canvas;
  const transitionType = opts?.transitionType ?? "fade";
  const xfade = Math.max(0, opts?.crossfadeSec ?? 0);
  const voiceClips = (opts?.voiceClips ?? []).filter((c) => c.sourceUrl);
  const hasAudioMix = voiceClips.length > 0 || !!opts?.bgm;
  onProgress?.({ stage: "loading", pct: 0.02, message: "Loading FFmpeg…" });
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");

  // Clean up any prior run residues.
  const sweep = async (name: string) => {
    try {
      await ff.deleteFile(name);
    } catch {
      /* ignore */
    }
  };

  // Forward FFmpeg progress to UI. ff.on("progress") gives 0..1 per exec.
  const progressHandlers = new Set<(n: number) => void>();
  ff.on("progress", ({ progress }) => {
    for (const h of progressHandlers) h(progress);
  });

  // Download a font for drawtext if any clip has text overlays.
  // ffmpeg.wasm has no system fonts — we fetch one from CDN and write
  // it to the virtual filesystem.
  let fontPath: string | undefined;
  const needsFont = clips.some((c) => c.text?.content?.trim());
  if (needsFont) {
    try {
      const fontBuf = await fetchFile(
        // CJK 字体 —— 短剧字幕多中文，latin-only 会烧成豆腐块；Noto Sans SC 含中文 + 基础拉丁
        "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2"
      );
      await ff.writeFile("_font.woff2", fontBuf);
      fontPath = "_font.woff2";
    } catch {
      // Font download failed — drawtext will attempt without fontfile
    }
  }

  const cutNames: string[] = [];
  const total = clips.length;

  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    const inName = `in-${i}.mp4`;
    const outName = `cut-${i}.mp4`;
    onProgress?.({
      stage: "downloading",
      pct: 0.05 + (i / total) * 0.4,
      message: `Fetching clip ${i + 1}/${total}…`,
    });
    const buf = await fetchFile(clip.sourceUrl);
    await ff.writeFile(inName, buf);

    const duration = Math.max(0.05, clip.out - clip.in);
    // 定格补帧(holdLastFrame)：源媒体短于 clip 时长时，tpad 克隆末帧填满；stop_duration 给足(=duration，
    //   足够覆盖任何缺口)，最终由【输出侧】-t 精确切到 duration。源比 clip 长时 -t 在源播放期间就切断、
    //   tpad 不触发 → 与原行为完全一致。drama 成片里配音长于画面的镜头用，避免 a1 配音叠播 + 音画错位。
    const videoFilter = clip.holdLastFrame
      ? `${buildFilter(clip, dims, fontPath)},tpad=stop_mode=clone:stop_duration=${duration.toFixed(3)}`
      : buildFilter(clip, dims, fontPath);
    const audioFilter = buildAudioFilter(clip);
    const args = [
      "-y",
      "-ss",
      String(clip.in),
      // 非定格：-t 放【输入侧】(只解码所需区间，最快)。定格：-t 必须放【输出侧】，否则输入 -t 会在源 EOF 处
      //   提前结束、tpad 的克隆帧根本来不及生成。
      ...(clip.holdLastFrame ? [] : ["-t", String(duration)]),
      "-i",
      inName,
      "-vf",
      videoFilter,
      "-af",
      audioFilter,
      "-c:v",
      "libx264",
      "-preset",
      "superfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      ...(clip.holdLastFrame ? ["-t", String(duration)] : []),
      outName,
    ];

    onProgress?.({
      stage: "processing",
      pct: 0.1 + (i / total) * 0.7,
      message: `Processing clip ${i + 1}/${total}…`,
    });
    const trackProg = (p: number) => {
      onProgress?.({
        stage: "processing",
        pct: 0.1 + ((i + p) / total) * 0.7,
        message: `Processing clip ${i + 1}/${total} · ${Math.round(p * 100)}%`,
      });
    };
    progressHandlers.add(trackProg);
    await ff.exec(args);
    progressHandlers.delete(trackProg);
    await sweep(inName);
    cutNames.push(outName);
  }

  // Final stitch: concat demuxer for hard cuts, xfade filter chain for
  // crossfade. xfade is way slower (requires full re-encode) so we only
  // opt in when user set crossfadeSec > 0.
  const needsXfade = xfade > 0 && cutNames.length > 1;
  if (!needsXfade) {
    onProgress?.({ stage: "concat", pct: 0.85, message: "Stitching clips…" });
    const listText = cutNames.map((n) => `file '${n}'`).join("\n");
    await ff.writeFile("list.txt", new TextEncoder().encode(listText));
    await ff.exec([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      useSplit ? "pre-split.mp4" : hasAudioMix ? "pre-audio.mp4" : "out.mp4",
    ]);
    await sweep("list.txt");
  } else {
    onProgress?.({
      stage: "concat",
      pct: 0.85,
      message: `Crossfading ${cutNames.length} clips…`,
    });
    // Build xfade chain. Each pair needs an offset = cumulative duration - xfade.
    // Compute rendered durations per clip (after speed).
    const durs: number[] = clips.map((c) =>
      Math.max(0.05, (c.out - c.in) / (c.speed || 1))
    );
    const inputs: string[] = [];
    for (const name of cutNames) inputs.push("-i", name);

    // Video filter graph: [0:v][1:v]xfade=offset=o1[v01]; [v01][2:v]xfade=offset=o2[v012]; ...
    const vSteps: string[] = [];
    const aSteps: string[] = [];
    let accumulated = durs[0];
    let vLabel = "0:v";
    let aLabel = "0:a";
    for (let i = 1; i < cutNames.length; i++) {
      const offset = Math.max(0, accumulated - xfade);
      const outV = i === cutNames.length - 1 ? "vout" : `v${i}`;
      const outA = i === cutNames.length - 1 ? "aout" : `a${i}`;
      vSteps.push(
        `[${vLabel}][${i}:v]xfade=transition=${transitionType}:duration=${xfade.toFixed(2)}:offset=${offset.toFixed(2)}[${outV}]`
      );
      aSteps.push(
        `[${aLabel}][${i}:a]acrossfade=d=${xfade.toFixed(2)}[${outA}]`
      );
      vLabel = outV;
      aLabel = outA;
      accumulated += durs[i] - xfade;
    }
    const filterComplex = [...vSteps, ...aSteps].join(";");

    await ff.exec([
      "-y",
      ...inputs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "superfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      useSplit ? "pre-split.mp4" : hasAudioMix ? "pre-audio.mp4" : "out.mp4",
    ]);
  }

  // Layout composition — vstack/hstack the split image onto the rendered
  // video. Skipped when layout === "single" or no image attached.
  if (useSplit && opts?.splitImage) {
    onProgress?.({
      stage: "concat",
      pct: 0.9,
      message: "Compositing split image…",
    });
    const imgBuf = await fetchFile(opts.splitImage.sourceUrl);
    // Always write as image.png — ffmpeg.wasm decodes by header, not extension.
    await ff.writeFile("split.png", imgBuf);
    const imgDims =
      layout === "vsplit"
        ? { w: canvas.w, h: canvas.h - dims.h }
        : { w: canvas.w - dims.w, h: canvas.h };
    const stack = layout === "vsplit" ? "vstack" : "hstack";
    await ff.exec([
      "-y",
      "-i",
      "pre-split.mp4",
      "-loop",
      "1",
      "-i",
      "split.png",
      "-filter_complex",
      `[0:v]setsar=1[v0];` +
        `[1:v]scale=${imgDims.w}:${imgDims.h}:force_original_aspect_ratio=decrease,pad=${imgDims.w}:${imgDims.h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v1];` +
        `[v0][v1]${stack}=inputs=2[vout]`,
      "-map",
      "[vout]",
      "-map",
      "0:a",
      "-c:v",
      "libx264",
      "-preset",
      "superfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      "-shortest",
      "-movflags",
      "+faststart",
      hasAudioMix ? "pre-audio.mp4" : "out.mp4",
    ]);
    await sweep("pre-split.mp4");
    await sweep("split.png");
  }

  // 配音(a1)+ BGM 统一混音 —— 每条配音按 startSec adelay 到位，BGM 循环铺满，
  // amix normalize=0 保人声满音量(短剧视频轨通常静音，不会削顶)。这步修了「导出丢配音」。
  if (hasAudioMix) {
    onProgress?.({ stage: "concat", pct: 0.92, message: "Mixing voice & music…" });
    const inputs: string[] = ["-i", "pre-audio.mp4"];
    const fparts: string[] = [
      "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[base]",
    ];
    const mixLabels: string[] = ["[base]"];
    let idx = 1;
    for (const vc of voiceClips) {
      const fn = `voice-${idx}.bin`;
      await ff.writeFile(fn, await fetchFile(vc.sourceUrl));
      inputs.push("-i", fn);
      const delayMs = Math.max(0, Math.round((vc.startSec ?? 0) * 1000));
      const vol = vc.muted ? 0 : typeof vc.volume === "number" ? vc.volume : 1;
      fparts.push(
        `[${idx}:a]adelay=${delayMs}|${delayMs},volume=${vol.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[va${idx}]`
      );
      mixLabels.push(`[va${idx}]`);
      idx++;
    }
    if (opts?.bgm) {
      await ff.writeFile("bgm.bin", await fetchFile(opts.bgm.sourceUrl));
      inputs.push("-stream_loop", "-1", "-i", "bgm.bin");
      const bgmVol = Math.max(0, Math.min(2, opts.bgm.volume ?? 0.5));
      fparts.push(
        `[${idx}:a]volume=${bgmVol.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[bgma]`
      );
      mixLabels.push("[bgma]");
      idx++;
    }
    const mixFilter = `${fparts.join(";")};${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`;
    try {
      await ff.exec([
        "-y",
        ...inputs,
        "-filter_complex",
        mixFilter,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        "out.mp4",
      ]);
    } catch {
      // 混音兜底:万一 amix/adelay 出意外,至少导出无配音视频,不让整个导出失败(严格非破坏)
      onProgress?.({ stage: "concat", pct: 0.95, message: "Audio mix fell back — video only…" });
      await ff.exec(["-y", "-i", "pre-audio.mp4", "-c", "copy", "-movflags", "+faststart", "out.mp4"]);
    }
    await sweep("pre-audio.mp4");
    for (let k = 1; k <= voiceClips.length; k++) await sweep(`voice-${k}.bin`);
    if (opts?.bgm) await sweep("bgm.bin");
  }

  onProgress?.({ stage: "concat", pct: 0.97, message: "Reading result…" });
  const data = await ff.readFile("out.mp4");
  const blob = new Blob(
    [data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array()],
    { type: "video/mp4" }
  );

  // Cleanup
  for (const n of cutNames) await sweep(n);
  await sweep("out.mp4");
  if (fontPath) await sweep(fontPath);

  onProgress?.({ stage: "done", pct: 1, message: "Done." });
  return blob;
}

/** Probe video duration (in seconds) via a detached <video> element. */
export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    // No crossOrigin: many sources (Bailian OSS) don't return CORS headers.
    // Metadata-only loading doesn't require CORS; only canvas reads do.
    v.src = url;
    const done = () => {
      const d = v.duration;
      v.remove();
      if (!isFinite(d) || d <= 0) reject(new Error("Invalid duration"));
      else resolve(d);
    };
    v.onloadedmetadata = done;
    v.onerror = () => {
      v.remove();
      reject(new Error("Failed to load video metadata"));
    };
    window.setTimeout(() => reject(new Error("Metadata timed out")), 15_000);
  });
}
