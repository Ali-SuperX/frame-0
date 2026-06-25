#!/usr/bin/env node
/**
 * 60s 超长视频 · I2V 对照组（V1 链式）
 *
 *   段 1（I2V 15s，起头帧 = anchor.jpg）
 *      ↓ 提尾帧
 *   段 2（I2V 15s，起头帧 = 段1尾帧）
 *      ↓ 提尾帧
 *   段 3（I2V 15s，起头帧 = 段2尾帧）
 *      ↓ 提尾帧
 *   段 4（I2V 15s，起头帧 = 段3尾帧）
 *      ↓
 *   ffmpeg concat 4 段 → 60s mp4
 *
 * 跟 R2V 版（generate-superlong-60s.mjs）的差异：
 *   - 跳过 T2V 种子段（直接用已有 anchor.jpg 当段 1 起头）
 *   - 段 1+ 全部 I2V，只看 1 帧，没有锚点参考
 *   - prompt 任务定义保持一致，公平对比
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

const TASK_DEFINITION = `[任务一致性锚定 · 贯穿全 60 秒]
主角：一位 25 岁韩系气质年轻女生，清秀温柔，长发自然披肩，皮肤白皙细腻，淡雅妆容
服装：米白色宽松针织衫，浅卡其阔腿裤，全程不换装
场景：北欧原木风现代公寓，大面积落地窗，自然柔光，米色与原木为主色调
拍摄风格：韩系治愈系 vlog 美学，自然柔焦，胶片质感，避免硬阴影
画面原则：以 3/4 侧脸、侧身、低头、背影、手部特写为主，不做正脸大特写
全程保持上述特征一致：人物外观、服装、场景陈设、光线方向均不漂移`;

const CONTINUITY_HINT =
  "（延续上一段最后一秒的画面，保持主体外观、服装细节、光线方向一致，运镜节奏延续）";

const SEGS = [
  {
    n: "1",
    duration: 15,
    prompt:
      "[场景一 · 清晨卧室] 镜头从床头柜上的一杯水缓缓上摇，画面切到她躺在白色被褥中侧身慢慢睁开眼睛，眼神朦胧。她轻轻撑起身体坐在床边，长发自然垂落，伸了个慵懒的懒腰，3/4 侧脸朝向窗外晨光。柔和的清晨白光从落地窗洒入，照亮飘动的窗帘和她的侧脸轮廓。运镜：上摇 → 中景定格 → 微缓推。氛围：宁静、慵懒、治愈。",
  },
  {
    n: "2",
    duration: 15,
    prompt:
      "[场景二 · 衣帽间挑衣] 她站在原木衣柜前，从衣架上取下两件针织衫在身前比对，低头认真看着衣服。镜头从衣物特写缓缓拉远，她侧身站立的中景，发丝随动作自然飘动。然后她转身走向梳妆镜，背影占据画面左侧，镜中映出她整理领口的侧脸。运镜：手部特写 → 拉远到中景 → 跟随转身。光线：北欧自然光，温暖柔和。",
  },
  {
    n: "3",
    duration: 15,
    prompt:
      "[场景三 · 餐厨区早晨咖啡] 镜头从一只白色陶瓷杯特写开始，热咖啡正在倾倒，蒸汽袅袅升起。她的手部入画，握住手冲壶缓慢画圈注水，画面充满匠人感的细节。镜头缓慢上摇，呈现她低头专注冲咖啡的 3/4 侧脸，背景是模糊的厨房原木吧台。她举杯轻嗅咖啡香气，嘴角微微上扬。运镜：微距特写 → 上摇 → 浅景深定格。色调：暖咖色调，胶片颗粒。",
  },
  {
    n: "4",
    duration: 15,
    prompt:
      "[场景四 · 玄关出门] 镜头从挂在墙上的米色风衣特写开始拉远，她走入画面，从衣架上取下风衣穿上，动作流畅。她在玄关镜前侧身整理领口，3/4 侧脸映在镜中。然后她转身朝向镜头方向，轻挥手，长发随转身飘起，温柔回眸微笑。最后她拉开门，画面随光线变亮，定格在她踏出门外的背影剪影，门外是温暖的阳光。运镜：拉远 → 跟随 → 回眸 → 背影定格。氛围：充满希望，自然收尾。",
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

async function extractTailFrameJpg(videoPath, outJpg) {
  const probeP = spawn("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  let dur = 0;
  probeP.stdout.on("data", (d) => { dur = parseFloat(d.toString()) || 0; });
  await new Promise((r) => probeP.on("close", r));
  const t = Math.max(0, dur - 0.5);
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

async function main() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const anchorJpg = path.join(WORK_DIR, "anchor.jpg");
  if (!(await fs.stat(anchorJpg).catch(() => null))) {
    throw new Error(
      "anchor.jpg 不存在；请先跑 generate-superlong-60s.mjs 拿到种子帧"
    );
  }

  console.log("\n📌 上传 anchor.jpg 作为段 1 起头帧（跳过 T2V 种子段）");
  let prevFrameOss = await uploadJpgToOss(anchorJpg, "happyhorse-1.0-i2v");
  console.log(`  anchor OSS：${prevFrameOss}`);

  const segVideos = [];

  for (const seg of SEGS) {
    console.log(`\n📹 段 ${seg.n}（I2V 15s，起头帧 = ${seg.n === "1" ? "anchor" : `段${parseInt(seg.n)-1}尾帧`}）`);

    const fullPrompt =
      (seg.n === "1" ? "" : CONTINUITY_HINT + "\n") +
      TASK_DEFINITION + "\n\n" + seg.prompt;

    const taskId = await submit(
      "happyhorse-1.0-i2v",
      { resolution: "720P", ratio: "9:16", duration: seg.duration, watermark: true },
      { img_url: prevFrameOss },
      fullPrompt
    );
    console.log(`  taskId = ${taskId}`);
    process.stdout.write("  轮询中");
    await poll(taskId, "happyhorse-1.0-i2v");
    console.log();

    const segVideo = await findLocalVideo(taskId);
    if (!segVideo) throw new Error(`段 ${seg.n} 视频未保存到本地`);

    const segOut = path.join(OUT_DIR, `superlong-i2v-seg-${seg.n}.mp4`);
    await fs.copyFile(segVideo, segOut);
    segVideos.push(segOut);
    console.log(`  ✓ ${segOut}`);

    if (seg.n !== "4") {
      const tailJpg = path.join(WORK_DIR, `i2v-seg${seg.n}-tail.jpg`);
      await extractTailFrameJpg(segVideo, tailJpg);
      prevFrameOss = await uploadJpgToOss(tailJpg, "happyhorse-1.0-i2v");
      console.log(`  尾帧 OSS：${prevFrameOss}`);
    }
  }

  console.log("\n🎬 拼接 4 段为 60s 视频...");
  const listFile = path.join(WORK_DIR, "concat-list-i2v.txt");
  await fs.writeFile(
    listFile,
    segVideos.map((p) => `file '${p}'`).join("\n")
  );
  const finalOut = path.join(OUT_DIR, "superlong-60s-i2v.mp4");
  await runFfmpeg([
    "-y", "-f", "concat", "-safe", "0",
    "-i", listFile,
    "-c", "copy",
    finalOut,
  ]);
  const stat = await fs.stat(finalOut);
  console.log(`\n🎉 完成：${finalOut} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => { console.error("\n致命错误：", e); process.exit(1); });
