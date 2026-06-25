#!/usr/bin/env node
/**
 * 阶段 A' · 45 秒"有剧情"独立采样对照
 *
 * 3 个不同剧情 × R2V/I2V × 15 秒 = 6 段
 * 每段都从同一主角参考图独立启动（不串联，无累积干扰）
 * 拼接成 R2V 45s + I2V 45s，剧情有变化、不乏味
 *
 * 3 个剧情（同主角、同场景风格）：
 *   ① 卧室晨起
 *   ② 衣帽间挑衣
 *   ③ 窗边喝咖啡
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
const WORK_DIR = path.join(ROOT, "data", "ab-A45-storied-tmp");
const ANCHOR_JPG = path.join(ROOT, "data", "superlong-tmp", "anchor.jpg");

const TASK_DEFINITION = `[任务一致性锚定]
主角：一位 25 岁韩系气质年轻女生，清秀温柔，长发自然披肩，米白针织衫，浅卡其阔腿裤
场景：北欧原木风现代公寓，自然柔光，胶片质感
全程保持人物外观、服装、光线一致`;

const STORIES = [
  {
    n: 1,
    label: "卧室晨起",
    prompt: TASK_DEFINITION + `

[场景 · 清晨卧室] 镜头中景，她坐在床边整理凌乱的长发，眼神朦胧。床头柜上放着一杯水。
柔和的清晨光从落地窗洒入。她伸了个慵懒的懒腰，3/4 侧脸望向窗外。整体节奏舒缓。`,
  },
  {
    n: 2,
    label: "衣帽间挑衣",
    prompt: TASK_DEFINITION + `

[场景 · 衣帽间] 镜头中景，她站在原木衣柜前，从衣架上取下两件针织衫在身前比对，
低头认真打量手中的衣物。北欧自然光从右侧斜入，发丝随动作自然飘动。`,
  },
  {
    n: 3,
    label: "窗边喝咖啡",
    prompt: TASK_DEFINITION + `

[场景 · 窗边咖啡] 镜头中景，她坐在窗边的原木桌前，双手捧起白瓷咖啡杯轻嗅咖啡香气，
3/4 侧脸朝向窗外，眼神柔和。蒸汽袅袅升起。胶片暖色调氛围。`,
  },
];

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
  if (!(await fs.stat(ANCHOR_JPG).catch(() => null))) throw new Error(`anchor.jpg 不存在`);

  console.log("📌 上传主角参考图");
  const anchorOss = await uploadToOss(ANCHOR_JPG, "image/jpeg", "happyhorse-1.0-r2v");
  console.log(`  OSS: ${anchorOss}`);

  // R2V 3 段不同剧情独立采样
  const r2vSegs = [];
  for (const story of STORIES) {
    const out = await runOne(
      `[R2V] 剧情 ${story.n}/${STORIES.length} · ${story.label} · 15 秒 · refs=[anchor]`,
      "happyhorse-1.0-r2v",
      { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
      { reference_urls: [anchorOss] },
      story.prompt,
      `ab-A45s-r2v-${story.n}.mp4`
    );
    r2vSegs.push(out);
  }

  // I2V 3 段不同剧情独立采样
  const i2vSegs = [];
  for (const story of STORIES) {
    const out = await runOne(
      `[I2V] 剧情 ${story.n}/${STORIES.length} · ${story.label} · 15 秒 · img_url=anchor`,
      "happyhorse-1.0-i2v",
      { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
      { img_url: anchorOss },
      story.prompt,
      `ab-A45s-i2v-${story.n}.mp4`
    );
    i2vSegs.push(out);
  }

  // 拼接
  console.log("\n🎬 拼接 R2V 3 段 → 45s 剧情版");
  const r2vList = path.join(WORK_DIR, "r2v-list.txt");
  await fs.writeFile(r2vList, r2vSegs.map((p) => `file '${p}'`).join("\n"));
  const r2vFinal = path.join(OUT_DIR, "ab-A45s-r2v.mp4");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", r2vList, "-c", "copy", r2vFinal]);
  console.log(`  ✓ ${r2vFinal}`);

  console.log("\n🎬 拼接 I2V 3 段 → 45s 剧情版");
  const i2vList = path.join(WORK_DIR, "i2v-list.txt");
  await fs.writeFile(i2vList, i2vSegs.map((p) => `file '${p}'`).join("\n"));
  const i2vFinal = path.join(OUT_DIR, "ab-A45s-i2v.mp4");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", i2vList, "-c", "copy", i2vFinal]);
  console.log(`  ✓ ${i2vFinal}`);

  console.log("\n🎉 完成 · 6 段独立采样 + 2 段拼接");
}

main().catch((e) => { console.error("\n致命错误：", e); process.exit(1); });
