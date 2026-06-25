#!/usr/bin/env node
/**
 * 4 个新 sol 的 A/B 对比 demo：
 *
 * sol 5 多主角对手戏：character1 + character2 双人 R2V 15s
 * sol 6 五要素 prompt 结构化：自由 prompt vs 5 要素结构化 T2V 5s
 * sol 7 运镜预设库：默认 vs dolly zoom / orbit / crash zoom T2V 5s
 * sol 8 服装多版本批量：3 套穿搭变体 R2V 5s
 *
 * 复用 anchor.jpg 作为主角参考图（来自 sol-1 的种子段）
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
const WORK_DIR = path.join(ROOT, "data", "superlong-tmp");

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

async function findLocalVideo(taskId) {
  const files = await fs.readdir(VIDEOS_DIR).catch(() => []);
  const hit = files.find((f) => f.startsWith(taskId) && /\.(mp4|mov|webm)$/i.test(f));
  return hit ? path.join(VIDEOS_DIR, hit) : null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`));
    });
  });
}

async function extractAnchorJpg(videoPath, outJpg) {
  const probeP = spawn("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  let dur = 0;
  probeP.stdout.on("data", (d) => { dur = parseFloat(d.toString()) || 0; });
  await new Promise((r) => probeP.on("close", r));
  const t = Math.max(0.5, dur / 2);
  await runFfmpeg([
    "-y", "-ss", String(t), "-i", videoPath,
    "-frames:v", "1", "-q:v", "2", outJpg,
  ]);
}

async function uploadJpgToOss(jpgPath, modelId) {
  const buf = await fs.readFile(jpgPath);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "image/jpeg" }), path.basename(jpgPath));
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
  const v = await findLocalVideo(taskId);
  if (!v) throw new Error(`${label} 视频未保存到本地`);
  const out = path.join(OUT_DIR, outName);
  await fs.copyFile(v, out);
  console.log(`  ✓ ${out}`);
  return { taskId, video: v, out };
}

// ─── 主流程 ───

async function main() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const anchorJpg = path.join(WORK_DIR, "anchor.jpg");
  if (!(await fs.stat(anchorJpg).catch(() => null))) {
    throw new Error("anchor.jpg 不存在；先跑 generate-superlong-60s.mjs");
  }

  // 已经在 sol-1 流程里上传过，但每次新调用重新上传更稳
  console.log("📌 上传 anchor.jpg（主角 character1）");
  const char1Oss = await uploadJpgToOss(anchorJpg, "happyhorse-1.0-r2v");
  console.log(`  character1 OSS：${char1Oss}`);

  // ───────────────── sol 5 多主角对手戏 ─────────────────
  // Step 1: 生 character2（25 岁亚洲男生，温暖友善）
  console.log("\n\n═══════ sol 5 · 多主角对手戏 ═══════");
  console.log("\n🌱 先生 character2 主角（T2V 5s）");
  const char2SeedTask = await submit(
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    "9:16 竖屏，4K 高清电影质感，明亮自然柔光。一位 28 岁亚洲年轻男生，干净阳光，黑色短发清爽自然，穿浅蓝色亚麻衬衫，坐在原木桌前正面望向镜头，自然微笑。皮肤细腻自然，柔和午后窗光照亮他的脸庞和发丝边缘。背景是简约日系咖啡馆，可见绿植与暖光。"
  );
  process.stdout.write("  轮询中");
  await poll(char2SeedTask, "happyhorse-1.0-t2v");
  console.log();
  const char2Video = await findLocalVideo(char2SeedTask);
  if (!char2Video) throw new Error("character2 种子视频未保存");
  const char2Jpg = path.join(WORK_DIR, "character2.jpg");
  await extractAnchorJpg(char2Video, char2Jpg);
  const char2Oss = await uploadJpgToOss(char2Jpg, "happyhorse-1.0-r2v");
  console.log(`  character2 OSS：${char2Oss}`);

  // A 对照：单 character R2V 15s
  await runOne(
    "sol 5 [A] 单 character 对照",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
    { reference_urls: [char1Oss] },
    "character1 坐在咖啡馆原木桌前，举起白瓷咖啡杯轻嗅咖啡香气，温柔微笑，眼神望向窗外。柔和午后窗光，明亮温暖氛围。中景，缓慢推进。",
    "sol-multichar-A.mp4"
  );

  // B 升级：双 character R2V 15s
  await runOne(
    "sol 5 [B] 双 character 对手戏",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 15, watermark: true },
    { reference_urls: [char1Oss, char2Oss] },
    "咖啡馆原木桌对面，character1 与 character2 隔桌而坐，character1 举起咖啡杯轻笑，character2 用手势比划讲述故事，两人眼神有交流，氛围温暖友好。柔和午后窗光从右侧洒入，画面温馨。中景双人构图，镜头微推。",
    "sol-multichar-B.mp4"
  );

  // ───────────────── sol 6 五要素 prompt 结构化 ─────────────────
  console.log("\n\n═══════ sol 6 · 五要素 prompt 结构化 ═══════");

  // A 对照：自由 prompt
  await runOne(
    "sol 6 [A] 自由 prompt 对照",
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    "一个女生在窗边喝咖啡",
    "sol-recipe-A.mp4"
  );

  // B 升级：5 要素结构化 prompt
  // Camera + Subject + Action + Environment + Lighting
  await runOne(
    "sol 6 [B] 5 要素结构化 prompt",
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    "[Camera] 中景，35mm 镜头，缓慢推进 dolly-in。\n[Subject] 25 岁韩系女生，长发自然披肩，米白针织衫，3/4 侧脸朝向窗外。\n[Action] 双手捧起白瓷咖啡杯，杯沿轻触嘴唇，蒸汽从杯口袅袅升起，她眼神望向窗外，嘴角微微上扬。\n[Environment] 北欧原木风咖啡馆，窗边木桌，桌上有一本翻开的书和一支铜笔，背景是模糊的落地窗街景。\n[Lighting] 柔和午后金色窗光从画面右侧 45 度斜入，照亮她的侧脸轮廓和飘动的发丝，背景轻微逆光，胶片质感，柔焦氛围。",
    "sol-recipe-B.mp4"
  );

  // ───────────────── sol 7 运镜预设库 ─────────────────
  console.log("\n\n═══════ sol 7 · 运镜预设库 ═══════");

  const CAMERA_BASE_SUBJECT = "25 岁韩系女生，长发自然披肩，米白针织衫，在北欧原木风咖啡馆窗边的木桌前，桌上有一杯咖啡，窗外是柔和的午后金色光线，胶片质感氛围。";

  // A 对照：默认运镜（不写 camera 指令）
  await runOne(
    "sol 7 [A] 默认运镜（无指令）",
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    CAMERA_BASE_SUBJECT,
    "sol-camera-A.mp4"
  );

  // B1 升级：Dolly Zoom（眩晕镜头）
  await runOne(
    "sol 7 [B1] Dolly Zoom · 眩晕推进",
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    "[Camera Movement: Dolly Zoom · Vertigo Effect] 镜头物理向前推进，同时镜头焦距反向收缩拉远（Hitchcock 风格眩晕镜头），创造出主体保持画面大小不变但背景产生戏剧性透视压缩的效果。\n" + CAMERA_BASE_SUBJECT,
    "sol-camera-B1-dolly-zoom.mp4"
  );

  // B2 升级：Orbit（环绕镜头）
  await runOne(
    "sol 7 [B2] Orbit · 360 度环绕",
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    "[Camera Movement: Orbit · Smooth 180-degree Arc] 镜头围绕主体以恒定半径做平滑 180 度弧线环绕，从主体右侧出发，经过正前方，转到主体左侧。主体始终位于画面中心，背景因运镜产生连续变化。\n" + CAMERA_BASE_SUBJECT,
    "sol-camera-B2-orbit.mp4"
  );

  // B3 升级：Crash Zoom（快速推近）
  await runOne(
    "sol 7 [B3] Crash Zoom · 快速推近",
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    "[Camera Movement: Crash Zoom · Aggressive Punch-in] 镜头以极快速度从中远景突然推进到主体面部特写，创造冲击力强的视觉锚点。后半段保持在特写定格。\n" + CAMERA_BASE_SUBJECT,
    "sol-camera-B3-crash-zoom.mp4"
  );

  // ───────────────── sol 8 服装多版本批量 ─────────────────
  console.log("\n\n═══════ sol 8 · 服装多版本批量 ═══════");

  // A 对照：保持原服装
  await runOne(
    "sol 8 [A] 原服装对照",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { reference_urls: [char1Oss] },
    "character1 保持米白针织衫造型，坐在窗边自然微笑，温柔氛围。中景定格。",
    "sol-wardrobe-A.mp4"
  );

  // B1 升级：休闲牛仔
  await runOne(
    "sol 8 [B1] 休闲牛仔",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { reference_urls: [char1Oss] },
    "character1 换装成<休闲风格>：浅蓝色丹宁牛仔外套 + 内搭白色 T 恤，下身浅色牛仔裤，发型保持长发披肩。坐在窗边自然微笑，温柔氛围。中景定格。保持人物面孔与气质一致。",
    "sol-wardrobe-B1-casual.mp4"
  );

  // B2 升级：知性正装
  await runOne(
    "sol 8 [B2] 知性正装",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { reference_urls: [char1Oss] },
    "character1 换装成<知性职场风格>：米色西装外套 + 内搭白色丝绸衬衫，发型保持长发披肩，淡雅妆容更精致。坐在窗边自然微笑，温柔知性氛围。中景定格。保持人物面孔与气质一致。",
    "sol-wardrobe-B2-formal.mp4"
  );

  // B3 升级：街头运动
  await runOne(
    "sol 8 [B3] 街头运动",
    "happyhorse-1.0-r2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { reference_urls: [char1Oss] },
    "character1 换装成<街头运动风格>：宽松米白色 oversized 卫衣 + 黑色棒球帽，发型保持长发披肩。坐在窗边自然微笑，温柔活力氛围。中景定格。保持人物面孔与气质一致。",
    "sol-wardrobe-B3-sporty.mp4"
  );

  console.log("\n\n🎉 全部 demo 完成");
  console.log(`  视频文件位于：${OUT_DIR}`);
}

main().catch((e) => { console.error("\n致命错误：", e); process.exit(1); });
