#!/usr/bin/env node
/**
 * 跑 5 个电商场景视频，补全 guide 里电商章节短板。
 * 覆盖：爆款、奢品、UGC 种草、美妆、产品微距。
 *
 * 用法：node scripts/generate-ecom-cases.mjs       全跑
 *      node scripts/generate-ecom-cases.mjs 02    只跑 02
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = "http://localhost:3000";

const CASES = [
  {
    n: "01",
    title: "电商爆款（高饱和+快切+Pack Shot）",
    duration: 8,
    ratio: "9:16",
    prompt:
      "9:16竖屏电商爆款风格，高饱和暖色调，硬光高反差，节奏明快。" +
      "镜头1（0-2秒，中近景/快推）：手部特写抓握一支金色高端口红，红黄高饱和背景，浮现大字「💥 一周回购 87%」，硬光照亮口红膏体。" +
      "镜头2（2-5秒，特写/俯拍）：口红在白色镜面上慢动作旋转一圈，光线扫过金属外壳形成连贯反光带，膏体延展出丝绒质地的水光。字幕「丝绒水光 12 小时不脱色」浮现。" +
      "镜头3（5-8秒，全景/Pack shot 固定）：口红垂直立于纯白渐变背景中心，旁边浮现品牌名「LUMINANCE」白色无衬线字体，画面收尾干净留白。",
  },
  {
    n: "02",
    title: "电商奢品（慢推+低饱和+哑光质感）",
    duration: 10,
    ratio: "16:9",
    prompt:
      "16:9横屏电商奢品级广告风格，低饱和单一色调，黑色丝绒桌面，冷白侧逆光雕刻产品轮廓，节奏极慢。" +
      "镜头1（0-4秒，大特写/缓推）：一支高端腕表斜置于深色丝绒上，冷白侧逆光从左 45 度入射，金属拉丝表盘呈现细腻磨砂质感，蓝宝石玻璃镜面反射一道窄高光带。镜头从远端缓慢推向表盘 12 点位置。" +
      "镜头2（4-8秒，微距/环绕）：镜头以微距环绕表带一周，露出皮革缝线工艺细节与蝴蝶扣金属切边，暖橙补光从右后方轻柔填充凹槽阴影。" +
      "镜头3（8-10秒，全景/静止）：腕表静置画面正中，右下角浮现一行细体无衬线品牌名，背景纯黑无任何杂物。",
  },
  {
    n: "03",
    title: "电商 UGC 种草（手持自拍 + Before/After）",
    duration: 10,
    ratio: "9:16",
    prompt:
      "9:16竖屏 UGC 自拍风格，手持轻晃自然光，暖色调去滤镜感。" +
      "镜头1（0-3秒，半身/正面自拍）：年轻亚洲女性手持手机自拍，背景为温馨家居，她对着镜头笑着拿起一瓶精华液，自然语调说：'姐妹们这款真的绝了'。" +
      "镜头2（3-6秒，面部近景/侧面自拍）：她用手指挤出精华液涂到脸颊，皮肤毛孔可见自然质感，凝露状产品在皮肤上呈现水光反射，手指轻轻按摩。" +
      "镜头3（6-10秒，半身/对比）：画面左半边显示「使用前」时哑光暗沉的皮肤，右半边「使用后」明亮通透有光泽。模特笑着对镜头点头，竖起大拇指。",
  },
  {
    n: "04",
    title: "美妆护肤（柔光 + 凝露水光特写）",
    duration: 8,
    ratio: "1:1",
    prompt:
      "1:1方形美妆广告级画面，柔光自然光，奶白瓷质背景，皮肤细腻自然哑光质感。" +
      "镜头1（0-3秒，微距/缓推）：一滴透明凝露状精华液从滴管中缓缓垂落，特写镜头跟随液滴下坠，落入纯白瓷质托盘激起一圈细小波纹，环形光在液滴表面形成柔和高光圈。" +
      "镜头2（3-6秒，大特写/侧面 45 度）：精华液在亚洲女性脸颊皮肤上轻柔晕开，毛孔可见自然纹理，水光反射体现产品的服帖与吸收，柔光勾勒出脸颊轮廓。" +
      "镜头3（6-8秒，产品全景/俯拍）：磨砂玻璃质感的精华液瓶身立于奶白色背景中心，瓶盖金色滚边反射柔和光晕，画面下方浮现细体白色品牌字样。",
  },
  {
    n: "05",
    title: "产品微距（无人物 · 金属拉丝）",
    duration: 9,
    ratio: "16:9",
    prompt:
      "16:9横屏产品微距广告级画面，纯黑哑光背景，棚拍冷白主光配反光板，无任何人物。" +
      "镜头1（0-3秒，微距/缓推）：一支金属充电宝顶部斜立，镜头从远端缓推至 USB-C 接口，冷白光从右上 30 度入射，照亮金属拉丝纹路与接口内同心圆精密结构，金属切角反光带连贯延伸。" +
      "镜头2（3-6秒，微距/横移）：镜头沿充电宝长轴横向平移，掠过侧面阳极氧化金属表面，光斑流转勾勒出细腻颗粒质感，电源指示灯渐次亮起一颗、两颗、三颗。" +
      "镜头3（6-9秒，全景/缓拉）：镜头缓慢拉远，充电宝完整呈现于黑色哑光桌面中央，右下角浮现产品参数小字「20000mAh · 65W PD」，画面纯净无任何生活化元素。",
  },
];

const VIDEOS_DIR = path.join(ROOT, "data", "videos");
const OUT_DIR = path.join(ROOT, "public", "hh-cases");

async function submit(c) {
  const res = await fetch(`${API}/api/bailian/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: "happyhorse-1.0-t2v",
      params: { resolution: "720P", ratio: c.ratio, duration: c.duration, watermark: true },
      media: { prompt: c.prompt },
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `submit failed: ${res.status}`);
  return j.taskId;
}

async function poll(taskId) {
  const url = `${API}/api/bailian/poll?task_id=${encodeURIComponent(taskId)}&model_id=happyhorse-1.0-t2v`;
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

async function runOne(c) {
  const target = path.join(OUT_DIR, `ecom-${c.n}.mp4`);
  try {
    await fs.access(target);
    console.log(`[ecom-${c.n}] ${c.title} — 已存在，跳过`);
    return;
  } catch { /* 继续 */ }

  console.log(`\n[ecom-${c.n}] ${c.title}`);
  console.log(`  提交中 (duration=${c.duration}s, ratio=${c.ratio})...`);
  const taskId = await submit(c);
  console.log(`  taskId = ${taskId}`);
  process.stdout.write("  轮询中");
  const result = await poll(taskId);
  console.log("");

  let src = result.localPath
    ? path.join(ROOT, result.localPath.replace(/^\/api\/videos\//, "data/videos/") + ".mp4")
    : await findLocalVideo(taskId);
  if (!src) {
    console.log(`  本地未找到，从 ${result.videoUrl} 下载…`);
    const r = await fetch(result.videoUrl);
    const buf = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(target, buf);
  } else {
    await fs.copyFile(src, target);
  }
  const stat = await fs.stat(target);
  console.log(`  ✓ ${target} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const onlyArg = process.argv[2];
  const targets = onlyArg ? CASES.filter((c) => c.n === onlyArg) : CASES;
  let ok = 0, fail = 0;
  for (const c of targets) {
    try { await runOne(c); ok++; }
    catch (e) { console.error(`[ecom-${c.n}] ✗ ${e.message}`); fail++; }
  }
  console.log(`\n汇总：${ok} 成功 / ${fail} 失败 / 共 ${targets.length}`);
}

main().catch((e) => { console.error("致命错误：", e); process.exit(1); });
