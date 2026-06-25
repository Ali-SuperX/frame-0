#!/usr/bin/env node
/**
 * R2V vs I2V 严格对照实验 · 两阶段
 *
 * 阶段 A · 5 秒单段对照（最干净，无累积干扰）
 *   同 anchor + 同 prompt + 同 5 秒
 *   ① R2V(refs=[anchor]) → ab-A-r2v.mp4
 *   ② I2V(img_url=anchor) → ab-A-i2v.mp4
 *   差异完全来自模型本身
 *
 * 阶段 B · 共享段 1 + 重跑段 2-4（测累积漂移）
 *   段 1 复用现有 R2V 段 1（superlong-seg-1.mp4），公共起点
 *   段 2-4 分别 R2V vs I2V 跑：
 *     R2V: refs=[anchor + 上段尾帧]
 *     I2V: img_url=上段尾帧
 *
 * 总：2 (A) + 6 (B) = 8 次模型调用 ~30 分钟
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
const WORK_DIR = path.join(ROOT, "data", "ab-compare-tmp");
const ANCHOR_JPG = path.join(ROOT, "data", "superlong-tmp", "anchor.jpg");
const SHARED_SEG1 = path.join(OUT_DIR, "superlong-seg-1.mp4");

const TASK_DEFINITION = `[任务一致性锚定]
主角：一位 25 岁韩系气质年轻女生，清秀温柔，长发自然披肩，米白针织衫，浅卡其阔腿裤
场景：北欧原木风现代公寓，自然柔光，胶片质感
全程保持人物外观、服装、光线一致`;

// 阶段 A · 单段 5s prompt
const SINGLE_PROMPT = TASK_DEFINITION + `

她坐在窗边，3/4 侧脸微笑望向镜头，发丝随微风轻拂，柔和午后金色窗光从右侧斜入。
中景定格，5 秒。`;

// 阶段 B · 段 2/3/4 prompt（跟 60s 实验完全一致）
const SEG_PROMPTS_B = {
  "2": "[场景二 · 衣帽间挑衣] 她站在原木衣柜前，从衣架上取下两件针织衫在身前比对，低头认真看着衣服。镜头从衣物特写缓缓拉远，她侧身站立的中景，发丝随动作自然飘动。然后她转身走向梳妆镜，背影占据画面左侧，镜中映出她整理领口的侧脸。运镜：手部特写 → 拉远到中景 → 跟随转身。光线：北欧自然光，温暖柔和。",
  "3": "[场景三 · 餐厨区早晨咖啡] 镜头从一只白色陶瓷杯特写开始，热咖啡正在倾倒，蒸汽袅袅升起。她的手部入画，握住手冲壶缓慢画圈注水，画面充满匠人感的细节。镜头缓慢上摇，呈现她低头专注冲咖啡的 3/4 侧脸，背景是模糊的厨房原木吧台。她举杯轻嗅咖啡香气，嘴角微微上扬。运镜：微距特写 → 上摇 → 浅景深定格。色调：暖咖色调，胶片颗粒。",
  "4": "[场景四 · 玄关出门] 镜头从挂在墙上的米色风衣特写开始拉远，她走入画面，从衣架上取下风衣穿上，动作流畅。她在玄关镜前侧身整理领口，3/4 侧脸映在镜中。然后她转身朝向镜头方向，轻挥手，长发随转身飘起，温柔回眸微笑。最后她拉开门，画面随光线变亮，定格在她踏出门外的背影剪影，门外是温暖的阳光。运镜：拉远 → 跟随 → 回眸 → 背影定格。氛围：充满希望，自然收尾。",
};
const CONTINUITY_HINT = "（延续上一段最后一秒的画面，保持主体外观、服装细节、光线方向一致，运镜节奏延续）";

// ─── helpers ───
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

async function extractTailFrameJpg(videoPath, outJpg) {
  const probeP = spawn("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", videoPath,
  ]);
  let dur = 0;
  probeP.stdout.on("data", (d) => { dur = parseFloat(d.toString()) || 0; });
  await new Promise((r) => probeP.on("close", r));
  const t = Math.max(0, dur - 0.5);
  await runFfmpeg(["-y", "-ss", String(t), "-i", videoPath, "-frames:v", "1", "-q:v", "2", outJpg]);
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
  return { videoPath: v, outPath: out };
}

// ─── 主流程 ───
async function main() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  if (!(await fs.stat(ANCHOR_JPG).catch(() => null))) {
    throw new Error(`anchor.jpg 不存在：${ANCHOR_JPG}`);
  }
  if (!(await fs.stat(SHARED_SEG1).catch(() => null))) {
    throw new Error(`公共段 1 视频不存在：${SHARED_SEG1}（需要先跑 generate-superlong-60s.mjs）`);
  }

  console.log("📌 上传 anchor 到 OSS");
  const anchorOss = await uploadToOss(ANCHOR_JPG, "image/jpeg", "happyhorse-1.0-r2v");
  console.log(`  anchor OSS: ${anchorOss}`);

  // ═══════════════ 阶段 A · 5 秒单段对照 ═══════════════
  console.log("\n\n═══════════ 阶段 A · 5 秒单段对照 ═══════════");

  await runOne(
    "[A · R2V] 5 秒单段 · refs=[anchor]",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { reference_urls: [anchorOss] },
    SINGLE_PROMPT,
    "ab-A-r2v.mp4"
  );

  await runOne(
    "[A · I2V] 5 秒单段 · img_url=anchor",
    "happyhorse-1.0-i2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { img_url: anchorOss },
    SINGLE_PROMPT,
    "ab-A-i2v.mp4"
  );

  // ═══════════════ 阶段 B · 共享段 1 + 段 2-4 链式对照 ═══════════════
  console.log("\n\n═══════════ 阶段 B · 共享段 1 + 段 2-4 链式对照 ═══════════");

  console.log("\n📌 提取公共段 1 尾帧（来自现有 superlong-seg-1.mp4）");
  const sharedTailJpg = path.join(WORK_DIR, "shared-seg1-tail.jpg");
  await extractTailFrameJpg(SHARED_SEG1, sharedTailJpg);
  const sharedTailOss = await uploadToOss(sharedTailJpg, "image/jpeg", "happyhorse-1.0-r2v");
  console.log(`  公共段 1 尾帧 OSS: ${sharedTailOss}`);

  // R2V 链：段 2-4，每段 refs=[anchor + 上段尾帧]，独立递推
  let prevR2vTailOss = sharedTailOss;
  for (const n of ["2", "3", "4"]) {
    const prompt = (n !== "2" ? CONTINUITY_HINT + "\n" : "") + TASK_DEFINITION + "\n\n" + SEG_PROMPTS_B[n];
    const { videoPath } = await runOne(
      `[B · R2V] 段 ${n} · refs=[anchor + ${n === "2" ? "公共段1尾帧" : "上段尾帧"}]`,
      "happyhorse-1.0-r2v",
      { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
      { reference_urls: [anchorOss, prevR2vTailOss] },
      prompt,
      `ab-B-r2v-seg${n}.mp4`
    );
    if (n !== "4") {
      const tailJpg = path.join(WORK_DIR, `r2v-seg${n}-tail.jpg`);
      await extractTailFrameJpg(videoPath, tailJpg);
      prevR2vTailOss = await uploadToOss(tailJpg, "image/jpeg", "happyhorse-1.0-r2v");
      console.log(`  R2V 段 ${n} 尾帧 OSS: ${prevR2vTailOss}`);
    }
  }

  // I2V 链：段 2-4，每段 img_url=上段尾帧，独立递推
  let prevI2vTailOss = sharedTailOss;
  for (const n of ["2", "3", "4"]) {
    const prompt = (n !== "2" ? CONTINUITY_HINT + "\n" : "") + TASK_DEFINITION + "\n\n" + SEG_PROMPTS_B[n];
    const { videoPath } = await runOne(
      `[B · I2V] 段 ${n} · img_url=${n === "2" ? "公共段1尾帧" : "上段尾帧"}`,
      "happyhorse-1.0-i2v",
      { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
      { img_url: prevI2vTailOss },
      prompt,
      `ab-B-i2v-seg${n}.mp4`
    );
    if (n !== "4") {
      const tailJpg = path.join(WORK_DIR, `i2v-seg${n}-tail.jpg`);
      await extractTailFrameJpg(videoPath, tailJpg);
      prevI2vTailOss = await uploadToOss(tailJpg, "image/jpeg", "happyhorse-1.0-i2v");
      console.log(`  I2V 段 ${n} 尾帧 OSS: ${prevI2vTailOss}`);
    }
  }

  console.log("\n\n🎉 全部 8 段视频已完成");
  console.log("阶段 A 输出：");
  console.log("  ab-A-r2v.mp4  (R2V 5s 单段)");
  console.log("  ab-A-i2v.mp4  (I2V 5s 单段)");
  console.log("阶段 B 输出（公共段 1 = superlong-seg-1.mp4）：");
  console.log("  ab-B-r2v-seg2/3/4.mp4");
  console.log("  ab-B-i2v-seg2/3/4.mp4");
  console.log("\n下一步：抽帧 + face_recognition 量化对比");
}

main().catch((e) => { console.error("\n致命错误：", e); process.exit(1); });
