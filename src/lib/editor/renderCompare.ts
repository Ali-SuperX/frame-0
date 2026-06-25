"use client";

/**
 * Compose 2-4 videos into a single grid video:
 *   2 → side-by-side (hstack)
 *   3 → 3-up horizontal (hstack)
 *   4 → 2×2 grid (xstack)
 *
 * Each input is scaled to a common cell size, then overlaid with a label
 * strip bearing the model id so the exported file self-documents.
 *
 * Re-uses the ffmpeg singleton from renderProject, so it inherits the CDN
 * core load cost only once per session.
 */

type Input = { url: string; label?: string };

const CELL_W = 640;
const CELL_H = 360;

export async function renderStackedCompare(
  inputs: Input[],
  onStatus?: (msg: string) => void
): Promise<Blob> {
  if (inputs.length < 2 || inputs.length > 4) {
    throw new Error("Supported: 2–4 inputs");
  }

  onStatus?.("Loading FFmpeg…");
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
  const CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  const ff = new FFmpeg();
  await ff.load({
    coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
  });

  // Download + write each input
  for (let i = 0; i < inputs.length; i++) {
    onStatus?.(`Fetching ${i + 1}/${inputs.length}…`);
    const buf = await fetchFile(inputs[i].url);
    await ff.writeFile(`cmp-${i}.mp4`, buf);
  }

  // Build filter_complex per count.
  // Each input: scale → draw label bar at bottom → produce [v0], [v1]...
  const prepSteps: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const label = (inputs[i].label || "").replace(/[':\\]/g, "");
    prepSteps.push(
      `[${i}:v]scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:black,drawtext=text='${label}':x=10:y=h-28:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=6,setsar=1,fps=30[v${i}]`
    );
  }

  let layout: string;
  let outW: number;
  let outH: number;
  if (inputs.length === 2) {
    layout = `[v0][v1]hstack=inputs=2[vout]`;
    outW = CELL_W * 2;
    outH = CELL_H;
  } else if (inputs.length === 3) {
    layout = `[v0][v1][v2]hstack=inputs=3[vout]`;
    outW = CELL_W * 3;
    outH = CELL_H;
  } else {
    // 2×2 grid via xstack
    layout = `[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[vout]`;
    outW = CELL_W * 2;
    outH = CELL_H * 2;
  }

  // Audio: take the first input's audio track to keep it simple.
  // (Mixing N tracks usually sounds muddy for compare.)
  const audioMap = [`-map`, `0:a?`];

  const filterComplex = [...prepSteps, layout].join(";");

  onStatus?.(`Composing ${inputs.length}-up…`);
  const inputArgs: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    inputArgs.push("-i", `cmp-${i}.mp4`);
  }

  await ff.exec([
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    ...audioMap,
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
    "-shortest",
    "-movflags",
    "+faststart",
    "out.mp4",
  ]);

  onStatus?.("Reading result…");
  const data = await ff.readFile("out.mp4");
  const blob = new Blob(
    [data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array()],
    { type: "video/mp4" }
  );
  // Clean up
  for (let i = 0; i < inputs.length; i++) {
    try {
      await ff.deleteFile(`cmp-${i}.mp4`);
    } catch {
      /* ignore */
    }
  }
  try {
    await ff.deleteFile("out.mp4");
  } catch {
    /* ignore */
  }
  void outW;
  void outH;
  return blob;
}
