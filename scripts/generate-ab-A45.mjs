#!/usr/bin/env node
/**
 * 阶段 A' · 45 秒独立采样对照（3 段 × 15 秒，互不串联）
 *
 * R2V 跑 3 段 × 15s，每段都用 [anchor] + 同一份 prompt 独立调用 → 拼接成 45s
 * I2V 跑 3 段 × 15s，每段都用 img_url=anchor + 同一份 prompt 独立调用 → 拼接成 45s
 *
 * 设计目的：3 段独立采样 = 3 次单段实验，比单次更稳。
 * 每段 R2V 和 I2V 起点完全相同（同 anchor），跟链式累积无关。
 *
 * 总：6 次模型调用 + 2 次 ffmpeg 拼接 ~20 分钟
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = "http://localhost:3000";
const VIDEOS_DIR = path.join(ROOT, "data", "videos");
const OUT_DIR = path.join(ROOT, "public", "hh-cases");
const WORK_DIR = path.join(ROOT, "data", "ab-A45-tmp");
const ANCHOR_JPG = path.join(ROOT, "data", "superlong-tmp", "anchor.jpg");

const TASK_DEFINITION = `[任务一致性锚定]
主角：一位 25 岁韩系气质年轻女生，清秀温柔，长发自然披肩，米白针织衫，浅卡其阔腿裤
场景：北欧原木风现代公寓，自然柔光，胶片质感
全程保持人物外观、服装、光线一致`;

const SINGLE_PROMPT = TASK_DEFINITION + `

她坐在窗边，3/4 侧脸微笑望向镜头，发丝随微风轻拂，柔和午后金色窗光从右侧斜入。
中景定格，15 秒。`;

async function submit(modelId, params, media, prompt) {
  const res = await fetch(`${API}/api/bailian/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId, params, media: { prompt, ...media } }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `submit failed: ${res.status}`);
  return j.taskId;
}

async function poll(taskId, modelId) {
  const url = `${API}/api/bailian/poll?task_id=${encodeURIComponent(taskId)}&model_id=${encodeURIComponent(modelId)}`;
  while (true) {
    const res = await fetch(url);
    const j = await res.json();
    if (j.state === "done") return j;
    if (j.state === "error") throw new Error(j.message || "task failed");
    await new Promise((r) => setTimeout(r, 6000));
    process.stdout.write(".");
  }
}

async function findLocalVideoWithRetry(taskId, retries = 6, intervalMs = 5000) {
  for (let i = 0; i < retries; i++) {
    const files = await fs.readdir(VIDEOS_DIR).catch(() => []);
    const hit = files.find((f) => f.startsWith(taskId) && /\.(mp4|mov|webm)$/i.test(f));
    if (hit) return path.join(VIDEOS_DIR, hit);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-300)}`)));
  });
}

async function uploadToOss(filePath, mime, modelId) {
  const buf = await fs.readFile(filePath);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), path.basename(filePath));
  fd.append("model", modelId);
  const res = await fetch(`${API}/api/bailian/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(j.error || `upload failed`);
  }
  const j = await res.json();
  return j.ossUrl;
}

async function runOne(label, modelId, params, media, prompt, outName) {
  console.log(`\n📹 ${label}`);
  const taskId = await submit(modelId, params, media, prompt);
  console.log(`  taskId = ${taskId}`);
  process.stdout.write("  轮询中");
  await poll(taskId, modelId);
  console.log();
  const v = await findLocalVideoWithRetry(taskId);
  if (!v) throw new Error(`${label} 视频未保存到本地`);
  const out = path.join(OUT_DIR, outName);
  await fs.copyFile(v, out);
  console.log(`  ✓ ${out}`);
  return out;
}

async function main() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  if (!(await fs.stat(ANCHOR_JPG).catch(() => null))) {
    throw new Error(`anchor.jpg 不存在`);
  }

  console.log("📌 上传 anchor 到 OSS");
  const anchorOss = await uploadToOss(ANCHOR_JPG, "image/jpeg", "happyhorse-1.0-r2v");
  console.log(`  anchor OSS: ${anchorOss}`);

  // R2V 3 段独立采样
  const r2vSegs = [];
  for (const n of [1, 2, 3]) {
    const out = await runOne(
      `[R2V] 独立采样 ${n}/3 · 15 秒 · refs=[anchor] · 同 prompt`,
      "happyhorse-1.0-r2v",
      { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
      { reference_urls: [anchorOss] },
      SINGLE_PROMPT,
      `ab-A45-r2v-${n}.mp4`
    );
    r2vSegs.push(out);
  }

  // I2V 3 段独立采样
  const i2vSegs = [];
  for (const n of [1, 2, 3]) {
    const out = await runOne(
      `[I2V] 独立采样 ${n}/3 · 15 秒 · img_url=anchor · 同 prompt`,
      "happyhorse-1.0-i2v",
      { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
      { img_url: anchorOss },
      SINGLE_PROMPT,
      `ab-A45-i2v-${n}.mp4`
    );
    i2vSegs.push(out);
  }

  // ffmpeg 拼接成 45s
  console.log("\n🎬 拼接 R2V 3 段 → 45s");
  const r2vList = path.join(WORK_DIR, "r2v-list.txt");
  await fs.writeFile(r2vList, r2vSegs.map((p) => `file '${p}'`).join("\n"));
  const r2vFinal = path.join(OUT_DIR, "ab-A45-r2v.mp4");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", r2vList, "-c", "copy", r2vFinal]);
  console.log(`  ✓ ${r2vFinal}`);

  console.log("\n🎬 拼接 I2V 3 段 → 45s");
  const i2vList = path.join(WORK_DIR, "i2v-list.txt");
  await fs.writeFile(i2vList, i2vSegs.map((p) => `file '${p}'`).join("\n"));
  const i2vFinal = path.join(OUT_DIR, "ab-A45-i2v.mp4");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", i2vList, "-c", "copy", i2vFinal]);
  console.log(`  ✓ ${i2vFinal}`);

  console.log("\n🎉 完成");
}

main().catch((e) => { console.error("\n致命错误：", e); process.exit(1); });
