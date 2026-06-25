#!/usr/bin/env node
/**
 * 阿拉伯语 demo · PDF 报告痛点 P2 的真实对比演示
 *
 * 跑 4 个对比视频：
 *   1. arabic-hh-talking.mp4   HH 自己讲阿拉伯语（无 audio_url）= PDF 测试报告的崩样
 *   2. arabic-hh-audio_url.mp4 HH 带 audio_url=阿拉伯语 mp3 = HH 原生 lip sync 能力（已知 7 种语种不含阿拉伯）
 *   3. arabic-silent.mp4       sol-2 工作流第一步：HH 静默画面（嘴闭合，内心独白模式）
 *   4. arabic-final.mp4        sol-2 工作流产出：静默画面 + ffmpeg 加阿拉伯语音轨
 *
 * 链路：
 *   - HH T2V 5s 出中东男生种子 → 提中段帧 = arabic_anchor.jpg → 上传 OSS
 *   - edge-tts ar-SA-HamedNeural 出 PDF 报告原台词 → arabic.mp3 → 上传 OSS
 *   - 4 个 HH I2V 5s 调用（同 anchor，不同 prompt / audio 组合）
 *   - ffmpeg 合并视频 3 + mp3 = 视频 4
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
const WORK_DIR = path.join(ROOT, "data", "arabic-tmp");

// PDF 报告里阿拉伯语夜间街采的原句（阿拉伯文 + 罗马转写）
// "但是夜晚很闷，我没找到人聊天，怎么办？"
const ARABIC_TEXT = "لكن طفشان بالليل، وما لقيت أحد يكلمني، وش أسوي؟";

const ARABIC_ROMAN = "Lakin tafshan bil-layl, wa ma laqayt ahad yikallimni, wesh asawwj?";

// 主角 prompt
const SEED_PROMPT = "9:16 竖屏 4K 电影质感。一位 28 岁中东男生，干净阳光，黑色短发清爽自然，浓眉深邃眼神，淡色阿拉伯传统衬衫，坐在窗边正面望向镜头，自然微笑。背景是简约现代咖啡馆，柔和午后光线，蒸汽袅袅的咖啡杯。皮肤细腻自然，发丝边缘逆光勾勒。";

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

async function findLocalVideoWithRetry(taskId, retries = 6, intervalMs = 5000) {
  for (let i = 0; i < retries; i++) {
    const v = await findLocalVideo(taskId);
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
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

function runEdgeTts(text, voice, outMp3) {
  return new Promise((resolve, reject) => {
    const p = spawn("edge-tts", ["--voice", voice, "--text", text, "--write-media", outMp3], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`edge-tts exit ${code}: ${err.slice(-300)}`));
    });
  });
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

  // ─── Step 1: T2V 5s 出中东男生种子 ───
  console.log("\n🌱 Step 1 · HH T2V 5s 出中东男生种子帧");
  const seedTaskId = await submit(
    "happyhorse-1.0-t2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    {},
    SEED_PROMPT
  );
  console.log(`  taskId = ${seedTaskId}`);
  process.stdout.write("  轮询中");
  await poll(seedTaskId, "happyhorse-1.0-t2v");
  console.log();
  const seedVideo = await findLocalVideoWithRetry(seedTaskId);
  if (!seedVideo) throw new Error("种子视频未保存");
  const anchorJpg = path.join(WORK_DIR, "arabic_anchor.jpg");
  await extractAnchorJpg(seedVideo, anchorJpg);
  console.log(`  ✓ 锚点帧：${anchorJpg}`);

  // 上传 anchor
  const anchorOss = await uploadToOss(anchorJpg, "image/jpeg", "happyhorse-1.0-i2v");
  console.log(`  anchor OSS：${anchorOss}`);

  // ─── Step 2: edge-tts 出阿拉伯语 mp3 ───
  console.log("\n🔊 Step 2 · edge-tts 生成阿拉伯语音频（ar-SA-HamedNeural）");
  console.log(`  原文：${ARABIC_TEXT}`);
  console.log(`  罗马：${ARABIC_ROMAN}`);
  const mp3Path = path.join(WORK_DIR, "arabic.mp3");
  await runEdgeTts(ARABIC_TEXT, "ar-SA-HamedNeural", mp3Path);
  const mp3Stat = await fs.stat(mp3Path);
  console.log(`  ✓ ${mp3Path} (${(mp3Stat.size / 1024).toFixed(1)} KB)`);

  // 上传 mp3 到 OSS
  const mp3Oss = await uploadToOss(mp3Path, "audio/mpeg", "happyhorse-1.0-i2v");
  console.log(`  arabic.mp3 OSS：${mp3Oss}`);

  // 把 mp3 复制到 public/hh-cases 给 deck 可访问
  const mp3Out = path.join(OUT_DIR, "arabic-tts.mp3");
  await fs.copyFile(mp3Path, mp3Out);
  console.log(`  ✓ ${mp3Out}（供 deck 引用）`);

  // ─── Step 3: 4 个对比视频 ───

  // 视频 1：HH 自己讲阿拉伯语（无 audio_url）= PDF 测试报告的崩样
  await runOne(
    "Step 3a · HH 自己讲阿拉伯语（无 audio_url，复现 PDF 测试报告场景）",
    "happyhorse-1.0-i2v",
    { resolution: "720P", ratio: "9:16", duration: 5, audio: true, watermark: true },
    { img_url: anchorOss },
    "他用阿拉伯语开口说话：「لكن طفشان بالليل، وما لقيت أحد يكلمني، وش أسوي؟」。手持麦克风风格街采采访，他正面对镜头，自然说话，嘴唇随发音清晰开合，眉头微皱表达疑问。镜头中近景定格。",
    "arabic-hh-talking.mp4"
  );

  // 视频 2：HH 带 audio_url = 阿拉伯语 mp3
  await runOne(
    "Step 3b · HH 带 audio_url=阿拉伯语 mp3（看 HH 原生 lip sync 能否处理非支持语种）",
    "happyhorse-1.0-i2v",
    { resolution: "720P", ratio: "9:16", duration: 5, audio: true, audio_url: mp3Oss, watermark: true },
    { img_url: anchorOss },
    "他正在对镜头采访说话，嘴唇随音频自然开合，自然手势，眼神坚定。中近景。",
    "arabic-hh-audio_url.mp4"
  );

  // 视频 3：HH 静默画面（内心独白模式，嘴闭合）= sol-2 工作流第一步
  await runOne(
    "Step 3c · HH 静默画面（内心独白模式，嘴唇闭合）= sol-2 工作流第一步",
    "happyhorse-1.0-i2v",
    { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    { img_url: anchorOss },
    "[内心独白模式] 他全程嘴唇紧闭，不张嘴说话。镜头中近景，他眼神望向窗外，露出沉思表情，偶尔轻微点头，发丝随微风飘动。柔和午后光线，画面安静温暖。重要约束：禁止任何张嘴动作。",
    "arabic-silent.mp4"
  );

  // ─── Step 4: ffmpeg 合并 视频 3 + mp3 = sol-2 工作流产出 ───
  console.log("\n🎬 Step 4 · ffmpeg 把静默画面 + 阿拉伯语 mp3 合并");
  const silentVideo = path.join(OUT_DIR, "arabic-silent.mp4");
  const finalVideo = path.join(OUT_DIR, "arabic-final.mp4");

  // 音频长于视频，用 stream_loop 让视频循环到音频结束；或反过来用 -shortest
  // 视频 5s 应该跟 35KB mp3 (~3-4s) 接近。先用 -shortest 切短的
  await runFfmpeg([
    "-y",
    "-i", silentVideo,
    "-i", mp3Path,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    finalVideo,
  ]);
  const finalStat = await fs.stat(finalVideo);
  console.log(`  ✓ ${finalVideo} (${(finalStat.size / 1024 / 1024).toFixed(2)} MB)`);

  console.log("\n🎉 阿拉伯语 demo 全部完成");
  console.log("\n输出文件：");
  console.log(`  /hh-cases/arabic-hh-talking.mp4   — HH 自己讲阿拉伯语（PDF 测试报告的崩样复现）`);
  console.log(`  /hh-cases/arabic-hh-audio_url.mp4 — HH 带 audio_url=阿拉伯语 mp3`);
  console.log(`  /hh-cases/arabic-silent.mp4       — HH 静默画面（sol-2 工作流第一步）`);
  console.log(`  /hh-cases/arabic-final.mp4        — 静默画面 + 阿拉伯语音轨（sol-2 工作流产出）`);
  console.log(`  /hh-cases/arabic-tts.mp3          — edge-tts 阿拉伯语音频（独立可播）`);
}

main().catch((e) => { console.error("\n致命错误：", e); process.exit(1); });
