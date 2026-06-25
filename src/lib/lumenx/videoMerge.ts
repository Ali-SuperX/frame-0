/**
 * LumenX 成片合成 —— 用 @ffmpeg/ffmpeg 0.12.x 把多个分镜视频在浏览器端拼为单一 MP4。
 *
 * 策略：
 *  - 先尝试 `-c copy` 无损 concat（所有分镜编码相同时最快，秒级完成）。
 *  - 若 copy 失败（编码 / 时间基不一致），自动降级 `-c:v libx264 -c:a aac` 重编码。
 *
 * 注意：FFmpeg core 走 unpkg CDN（与 src/lib/r2v/postProcess.ts 保持一致）。
 */
"use client";

let ffmpegSingleton: import("@ffmpeg/ffmpeg").FFmpeg | null = null;

async function getFFmpeg(
  onLog?: (msg: string) => void,
): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ff = new FFmpeg();
  if (onLog) {
    ff.on("log", ({ message }: { message: string }) => onLog(message));
  }
  const CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegSingleton = ff;
  return ff;
}

async function fetchAsUint8(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const blob = await res.blob();
  return new Uint8Array(await blob.arrayBuffer());
}

export type MergeProgress = {
  phase: "loading" | "fetching" | "merging" | "encoding" | "done" | "error";
  current: number;
  total: number;
  message: string;
};

export type MergeResult = {
  blobUrl: string;
  blob: Blob;
  /** 实际使用的拼接策略：copy（无损） / encode（重编码）。 */
  strategy: "copy" | "encode";
};

/**
 * 把若干视频 URL 顺序拼成一个 MP4，返回 blob URL。
 *
 * @param videoUrls 按播放顺序排列的视频 URL（http/https/blob/api 路径都支持）。
 * @param onProgress 进度回调。
 */
export async function mergeVideos(
  videoUrls: string[],
  onProgress?: (p: MergeProgress) => void,
): Promise<MergeResult> {
  const cb = onProgress ?? (() => {});

  if (!videoUrls.length) {
    throw new Error("没有可合成的视频");
  }

  // ── 1. 加载 FFmpeg core ────────────────────────────────────────────────
  cb({
    phase: "loading",
    current: 0,
    total: videoUrls.length,
    message: "加载 FFmpeg 引擎…",
  });
  const ff = await getFFmpeg();

  // ── 2. 逐个 fetch 视频写入虚拟 FS ────────────────────────────────────
  const segNames: string[] = [];
  for (let i = 0; i < videoUrls.length; i++) {
    cb({
      phase: "fetching",
      current: i + 1,
      total: videoUrls.length,
      message: `下载分镜 ${i + 1}/${videoUrls.length}…`,
    });
    const bytes = await fetchAsUint8(videoUrls[i]);
    const name = `seg-${String(i + 1).padStart(2, "0")}.mp4`;
    await ff.writeFile(name, bytes);
    segNames.push(name);
  }

  // ── 3. 写 concat 列表 ────────────────────────────────────────────────
  const listText = segNames.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(listText));

  // ── 4. 第一次尝试：无损 concat (-c copy) ─────────────────────────────
  cb({
    phase: "merging",
    current: videoUrls.length,
    total: videoUrls.length,
    message: "拼接视频（无损）…",
  });

  let strategy: "copy" | "encode" = "copy";
  let mergeOk = false;
  try {
    const code = await ff.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c", "copy",
      "-y", "merged.mp4",
    ]);
    // exec 返回 0 表示成功
    if (code === 0) {
      // 还需校验输出文件存在且非空（个别情况下 -c copy 会产出 0 字节）
      try {
        const probe = (await ff.readFile("merged.mp4")) as Uint8Array;
        if (probe && probe.byteLength > 1024) {
          mergeOk = true;
        }
      } catch {
        mergeOk = false;
      }
    }
  } catch {
    mergeOk = false;
  }

  // ── 5. 若 copy 失败则重编码 ─────────────────────────────────────────
  if (!mergeOk) {
    strategy = "encode";
    cb({
      phase: "encoding",
      current: videoUrls.length,
      total: videoUrls.length,
      message: "编码不一致，正在重编码合成…",
    });
    try {
      // 删旧产物（忽略失败）
      try { await ff.deleteFile("merged.mp4"); } catch { /* ignore */ }
    } catch { /* ignore */ }

    await ff.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-movflags", "+faststart",
      "-y", "merged.mp4",
    ]);
  }

  // ── 6. 读出结果 ──────────────────────────────────────────────────────
  const finalBytes = (await ff.readFile("merged.mp4")) as Uint8Array;
  if (!finalBytes || finalBytes.byteLength === 0) {
    throw new Error("合成失败：输出文件为空");
  }
  const arrayBuffer = finalBytes.buffer.slice(
    finalBytes.byteOffset,
    finalBytes.byteOffset + finalBytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "video/mp4" });
  const blobUrl = URL.createObjectURL(blob);

  // ── 7. 清理虚拟 FS ───────────────────────────────────────────────────
  try {
    for (const n of segNames) await ff.deleteFile(n);
    await ff.deleteFile("list.txt");
    await ff.deleteFile("merged.mp4");
  } catch {
    /* ignore — 虚拟 FS 清理失败无害 */
  }

  cb({
    phase: "done",
    current: videoUrls.length,
    total: videoUrls.length,
    message: `合成完成（${strategy === "copy" ? "无损拼接" : "重编码"}）`,
  });

  return { blobUrl, blob, strategy };
}
