/**
 * R2V Post-Process — Cap Cut 三件套 for UGC chunks.
 *
 * Three operations runnable independently or chained:
 *   1. concatChunks()    — stitch N mp4 segments into one
 *   2. addCaptions()     — burn black-outlined white caption per segment
 *   3. adjustSpeed()     — change PTS + atempo (default 0.9 = 90%)
 *
 * Optional:
 *   4. mixBgm()          — mix in a BGM audio at low volume
 *
 * Uses the same FFmpeg.wasm singleton pattern as renderProject.ts to avoid
 * reloading the core on every operation.
 */

let ffmpegSingleton: import("@ffmpeg/ffmpeg").FFmpeg | null = null;

async function getFFmpeg(): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ff = new FFmpeg();
  const CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegSingleton = ff;
  return ff;
}

async function fetchAsUint8(url: string): Promise<Uint8Array> {
  const blob = await fetch(url).then((r) => r.blob());
  return new Uint8Array(await blob.arrayBuffer());
}

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\\\'")
    .replace(/\n/g, " ");
}

export type ChunkSeg = {
  /** URL or blob URL of the segment mp4. */
  url: string;
  /** Spoken line (used as caption text). */
  voiceover: string;
  /** Runtime in seconds (used both for concat timing and caption duration). */
  runtime: number;
};

export type PostProcessProgress = {
  step: "loading" | "concat" | "caption" | "speed" | "bgm" | "voiceover" | "done";
  percent: number; // 0..100
  message?: string;
};

export type VoiceoverEntry = {
  /** 1-based chunk index — used to compute the start offset. */
  index: number;
  /** /api/uploads/<sha>.wav 永久路径 */
  url: string;
};

type ProgressCb = (p: PostProcessProgress) => void;

/**
 * Full pipeline:  N segments → concat → captions burned → 0.9× speed → mp4.
 * Returns a blob URL for the final video.
 */
export async function fullPipeline(
  segments: ChunkSeg[],
  opts: {
    speed?: number; // default 0.9
    /** Cross-fade duration between consecutive segments, in seconds.
     *  Default 0.3 (subtle smooth — paired with edge-trim). Set to 0 for hard cuts.
     *  Total output length = sum(runtimes) - (N-1) * crossfade − total trimmed frames.
     *
     *  ⚠️ With edge-trim enabled (default), 0.3s is recommended. Without trim,
     *  bump to 1.0s for the old "soft hide" behavior. */
    crossfade?: number;
    /** Frames to drop from the END of each segment (except the last) before stitching.
     *  Default 6 (≈0.25s @24fps). Removes the model's "deceleration tail" that
     *  causes brake-then-restart artifacts at segment joins. Set 0 to disable.
     *  Source: Seedance 2.0 prompt guide (volcengine.com/docs/82379/2222480). */
    tailFrames?: number;
    /** Frames to drop from the START of each segment (except the first).
     *  Default 1 (≈0.04s @24fps). Removes the model's "warm-up frame".
     *  Set 0 to disable. */
    headFrames?: number;
    /** Source video FPS — used to convert frame counts to seconds. Default 24. */
    fps?: number;
    fontUrl?: string; // optional, defaults to bundled
    onProgress?: ProgressCb;
  } = {}
): Promise<{ blobUrl: string; blob: Blob }> {
  const speed = opts.speed ?? 0.9;
  const crossfade = Math.max(0, opts.crossfade ?? 0.3);
  const tailFrames = Math.max(0, opts.tailFrames ?? 6);
  const headFrames = Math.max(0, opts.headFrames ?? 1);
  const fps = opts.fps ?? 24;
  const cb = opts.onProgress ?? (() => {});

  cb({ step: "loading", percent: 0, message: "Loading FFmpeg core…" });
  const ff = await getFFmpeg();

  // 1. Write all segment files to virtual FS
  cb({ step: "loading", percent: 10, message: "Reading segments…" });
  const segNames: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const bytes = await fetchAsUint8(segments[i].url);
    const name = `seg-${String(i + 1).padStart(2, "0")}.mp4`;
    await ff.writeFile(name, bytes);
    segNames.push(name);
  }

  // 1b. Edge-trim: drop the model's transition frames at segment boundaries.
  // Why this works: video gen models add ~6 deceleration frames at the END
  // (so the segment "stops naturally") and ~1 warm-up frame at the START
  // (so it "begins naturally"). Both are necessary for standalone playback
  // but cause brake-then-restart jolts when concatenating. Trimming them
  // makes the joins look like a continuous motion stream.
  // - First segment: keep head (real intro), trim tail
  // - Middle segments: trim both
  // - Last segment: trim head, keep tail (real ending)
  const trimEnabled = (tailFrames > 0 || headFrames > 0) && segments.length > 1;
  // Work on a local copy of segments so we can update runtime in-place for
  // downstream caption timing without mutating the caller's array.
  const segs: ChunkSeg[] = segments.map((s) => ({ ...s }));
  if (trimEnabled) {
    cb({ step: "loading", percent: 15, message: "Trimming segment edges…" });
    const tailTime = tailFrames / fps;
    const headTime = headFrames / fps;
    for (let i = 0; i < segs.length; i++) {
      const isFirst = i === 0;
      const isLast = i === segs.length - 1;
      const dur = segs[i].runtime || 6;
      const start = isFirst ? 0 : headTime;
      const end = isLast ? dur : Math.max(start + 0.1, dur - tailTime);
      const newDur = end - start;
      if (newDur <= 0.1) continue; // segment too short — skip trim
      const trimmedName = `seg-${String(i + 1).padStart(2, "0")}-trimmed.mp4`;
      await ff.exec([
        "-i", segNames[i],
        "-ss", start.toFixed(3),
        "-t", newDur.toFixed(3),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac",
        "-y", trimmedName,
      ]);
      // Replace the seg file reference and update runtime for caption timing.
      try { await ff.deleteFile(segNames[i]); } catch { /* ignore */ }
      segNames[i] = trimmedName;
      segs[i] = { ...segs[i], runtime: newDur };
    }
  }

  // 2 + 3. Stitch — either hard-cut concat OR crossfade chain.
  //
  // Hard cut (crossfade=0) uses the demuxer `-f concat` route — fastest,
  // identical to the original implementation.
  //
  // Crossfade (>0) uses `xfade` filter + `acrossfade` per segment pair.
  // Each pair eats `crossfade` seconds of overlap. Total length shrinks
  // by (N-1) × crossfade — accepted trade-off for visual smoothness.
  // Note: xfade `offset` must be < first input's duration, so we accumulate
  // the running offset as we chain.
  if (crossfade > 0 && segs.length > 1) {
    cb({
      step: "concat",
      percent: 25,
      message: `Stitching with ${crossfade}s crossfade…`,
    });
    const inputs: string[] = [];
    for (const name of segNames) inputs.push("-i", name);

    const filterParts: string[] = [];
    let prevV = "[0:v]";
    let prevA = "[0:a]";
    let cumOffset = 0;
    for (let i = 1; i < segs.length; i++) {
      cumOffset += (segs[i - 1].runtime ?? 6) - crossfade;
      const vOut = `[v${i}]`;
      const aOut = `[a${i}]`;
      filterParts.push(
        `${prevV}[${i}:v]xfade=transition=fade:duration=${crossfade}:offset=${cumOffset.toFixed(2)}${vOut}`
      );
      filterParts.push(`${prevA}[${i}:a]acrossfade=d=${crossfade}${aOut}`);
      prevV = vOut;
      prevA = aOut;
    }
    await ff.exec([
      ...inputs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      prevV,
      "-map",
      prevA,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-y",
      "stitched.mp4",
    ]);
  } else {
    cb({ step: "concat", percent: 25, message: "Stitching segments…" });
    const listText = segNames.map((n) => `file '${n}'`).join("\n");
    await ff.writeFile("list.txt", new TextEncoder().encode(listText));
    await ff.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-y",
      "stitched.mp4",
    ]);
  }

  // 4. Build a single drawtext filter that activates per-segment by time range.
  //    Timeline accounts for crossfade overlap: segment N+1 starts `crossfade`
  //    seconds before segment N's nominal end (because xfade eats that overlap).
  //    Caption windows match each segment's full visible span; during the 1s
  //    overlap both captions briefly show — short enough to read past, long
  //    enough to keep continuity.
  cb({ step: "caption", percent: 60, message: "Burning captions…" });

  let t = 0;
  const drawtexts: string[] = [];
  for (const seg of segs) {
    const startT = t;
    const endT = t + (seg.runtime || 5);
    t = endT - crossfade; // next seg starts `crossfade` earlier (0 when hard-cut)
    const text = escapeDrawtext(seg.voiceover || "");
    if (!text.trim()) continue;
    // Caption style: black outline (borderw=3) + white fill, positioned at
    // lower-third (y = h-h/4), wider line-spacing using `box=0`.
    drawtexts.push(
      `drawtext=text='${text}':fontsize=42:fontcolor=white:bordercolor=black:borderw=4:` +
        `x=(w-text_w)/2:y=h-h/4:enable='between(t,${startT.toFixed(2)},${endT.toFixed(2)})'`
    );
  }
  const vf = drawtexts.length > 0 ? drawtexts.join(",") : "null";

  await ff.exec([
    "-i",
    "stitched.mp4",
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "copy",
    "-y",
    "captioned.mp4",
  ]);

  // 5. Speed adjust (PTS + atempo)
  cb({ step: "speed", percent: 85, message: `Adjusting speed to ${speed}×…` });
  // atempo accepts 0.5-100 per filter; 0.9 is fine in one pass.
  await ff.exec([
    "-i",
    "captioned.mp4",
    "-filter_complex",
    `[0:v]setpts=${(1 / speed).toFixed(3)}*PTS[v];[0:a]atempo=${speed.toFixed(3)}[a]`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-y",
    "final.mp4",
  ]);

  // 6. Read result
  cb({ step: "done", percent: 100, message: "Done." });
  const finalBytes = (await ff.readFile("final.mp4")) as Uint8Array;
  // Use a clean ArrayBuffer slice — some FFmpeg builds hand back a view
  // backed by the WASM heap, which can be torn down on the next exec.
  const arrayBuffer = finalBytes.buffer.slice(
    finalBytes.byteOffset,
    finalBytes.byteOffset + finalBytes.byteLength
  );
  const blob = new Blob([arrayBuffer as ArrayBuffer], { type: "video/mp4" });

  // Cleanup virtual FS
  try {
    for (const n of segNames) await ff.deleteFile(n);
    await ff.deleteFile("list.txt");
    await ff.deleteFile("stitched.mp4");
    await ff.deleteFile("captioned.mp4");
    await ff.deleteFile("final.mp4");
  } catch {
    /* ignore — virtual FS cleanup */
  }

  return { blobUrl: URL.createObjectURL(blob), blob };
}

/** Mix in BGM at low volume on top of an existing video. */
export async function mixBgm(
  videoUrl: string,
  bgmUrl: string,
  opts: { volume?: number; onProgress?: ProgressCb } = {}
): Promise<{ blobUrl: string; blob: Blob }> {
  const volume = opts.volume ?? 0.18;
  const cb = opts.onProgress ?? (() => {});
  cb({ step: "loading", percent: 0 });
  const ff = await getFFmpeg();

  const videoBytes = await fetchAsUint8(videoUrl);
  const bgmBytes = await fetchAsUint8(bgmUrl);
  await ff.writeFile("in.mp4", videoBytes);
  await ff.writeFile("bgm.mp3", bgmBytes);

  cb({ step: "bgm", percent: 30, message: `Mixing BGM at ${volume * 100}%…` });
  await ff.exec([
    "-i",
    "in.mp4",
    "-i",
    "bgm.mp3",
    "-filter_complex",
    `[1:a]volume=${volume.toFixed(2)},aloop=loop=-1:size=2e9[bgm];` +
      `[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    "out.mp4",
  ]);

  cb({ step: "done", percent: 100 });
  const outBytes = (await ff.readFile("out.mp4")) as Uint8Array;
  const ab = outBytes.buffer.slice(
    outBytes.byteOffset,
    outBytes.byteOffset + outBytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "video/mp4" });

  try {
    await ff.deleteFile("in.mp4");
    await ff.deleteFile("bgm.mp3");
    await ff.deleteFile("out.mp4");
  } catch {
    /* ignore */
  }

  return { blobUrl: URL.createObjectURL(blob), blob };
}

/**
 * Mix per-chunk voiceover audio tracks into a video that has already been
 * concatenated + captioned + speed-adjusted by fullPipeline().
 *
 * Each voiceover starts at the cumulative offset of its chunk(taking
 * crossfade into account). The original video audio is silenced by default
 * (UGC short clips usually have no meaningful original audio). Voiceover is
 * NOT speed-adjusted — keeps human speech clear.
 *
 * If a voiceover is longer than its chunk's playback slot, it's truncated
 * to avoid overlapping with the next chunk's voiceover.
 */
export async function mixVoiceovers(
  videoUrl: string,
  voiceovers: VoiceoverEntry[],
  /** Chunk runtimes in seconds — same order as fullPipeline's segments. Used
   *  to compute per-voiceover start offsets. */
  chunkRuntimes: number[],
  opts: {
    /** Voiceover mix volume, default 0.95 (clear human voice). */
    volume?: number;
    /** Original video audio volume, default 0 (mute — UGC convention). */
    originalVolume?: number;
    /** Same crossfade value passed to fullPipeline. Default 0.3. */
    crossfade?: number;
    /** Overall speed applied by fullPipeline — voiceover offsets divide by
     *  this to land on the correct chunk start in the sped-up video. */
    speed?: number;
    onProgress?: ProgressCb;
  } = {}
): Promise<{ blobUrl: string; blob: Blob }> {
  const volume = opts.volume ?? 0.95;
  const originalVolume = opts.originalVolume ?? 0;
  const crossfade = Math.max(0, opts.crossfade ?? 0.3);
  const speed = Math.max(0.1, opts.speed ?? 0.9);
  const cb = opts.onProgress ?? (() => {});

  if (voiceovers.length === 0) {
    // 没东西要混 —— 透传
    cb({ step: "done", percent: 100 });
    const bytes = await fetchAsUint8(videoUrl);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([ab], { type: "video/mp4" });
    return { blobUrl: URL.createObjectURL(blob), blob };
  }

  cb({ step: "loading", percent: 0, message: "Loading FFmpeg…" });
  const ff = await getFFmpeg();

  // 1. Write video
  cb({ step: "loading", percent: 10, message: "Reading video…" });
  const videoBytes = await fetchAsUint8(videoUrl);
  await ff.writeFile("in.mp4", videoBytes);

  // 2. Write each voiceover file, infer extension from URL
  cb({ step: "loading", percent: 20, message: "Reading voiceover audios…" });
  const voEntries: { fileName: string; index: number; offsetMs: number }[] = [];
  for (let i = 0; i < voiceovers.length; i++) {
    const vo = voiceovers[i];
    const bytes = await fetchAsUint8(vo.url);
    const extMatch = vo.url.match(/\.(\w{1,5})(?:\?|$)/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "wav";
    const fileName = `vo-${String(i + 1).padStart(2, "0")}.${ext}`;
    await ff.writeFile(fileName, bytes);
    // Compute offset: sum of prior chunk runtimes minus crossfades, then
    // divided by speed (因为 fullPipeline 已经把视频 speed-up 过了)
    let offset = 0;
    for (let k = 0; k < vo.index - 1 && k < chunkRuntimes.length; k++) {
      offset += chunkRuntimes[k] - crossfade;
    }
    voEntries.push({
      fileName,
      index: vo.index,
      offsetMs: Math.max(0, Math.round((offset / speed) * 1000)),
    });
  }

  cb({ step: "voiceover", percent: 40, message: `Mixing ${voEntries.length} voiceover track(s)…` });

  // 3. Build filter_complex:
  //    [0:a]volume=originalVolume[orig];
  //    [1:a]adelay=offset1|offset1,volume=v[vo1];
  //    [2:a]adelay=offset2|offset2,volume=v[vo2];
  //    ...
  //    [orig][vo1][vo2][voN]amix=inputs=N+1:duration=first[a]
  const parts: string[] = [];
  parts.push(`[0:a]volume=${originalVolume.toFixed(2)}[orig]`);
  const mixLabels: string[] = ["[orig]"];
  for (let i = 0; i < voEntries.length; i++) {
    const e = voEntries[i];
    // adelay 需要每个 channel 各传一个 delay value, 用 `|` 分隔
    parts.push(`[${i + 1}:a]adelay=${e.offsetMs}|${e.offsetMs},volume=${volume.toFixed(2)}[vo${i + 1}]`);
    mixLabels.push(`[vo${i + 1}]`);
  }
  parts.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0[a]`
  );

  const inputs: string[] = ["-i", "in.mp4"];
  for (const e of voEntries) inputs.push("-i", e.fileName);

  await ff.exec([
    ...inputs,
    "-filter_complex", parts.join(";"),
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    "-y", "out.mp4",
  ]);

  cb({ step: "done", percent: 100 });
  const outBytes = (await ff.readFile("out.mp4")) as Uint8Array;
  const ab = outBytes.buffer.slice(
    outBytes.byteOffset,
    outBytes.byteOffset + outBytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "video/mp4" });

  try {
    await ff.deleteFile("in.mp4");
    for (const e of voEntries) await ff.deleteFile(e.fileName);
    await ff.deleteFile("out.mp4");
  } catch { /* ignore */ }

  return { blobUrl: URL.createObjectURL(blob), blob };
}
