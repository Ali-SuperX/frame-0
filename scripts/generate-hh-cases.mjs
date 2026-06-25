#!/usr/bin/env node
/**
 * 自动跑 hh-guide.html 里的 8 个标杆案例，把生成结果保存到 public/hh-cases/。
 *
 * 用法：
 *   1. 确保 dev server 已经运行（npm run dev）
 *   2. 确保 .env.local 里有 DASHSCOPE_API_KEY
 *   3. node scripts/generate-hh-cases.mjs
 *
 * 流程：
 *   submit → 拿 taskId → 轮询 poll → 服务器自动保存到 data/videos/<taskId>.mp4
 *   → 我们从 data/videos/ 拷贝并重命名到 public/hh-cases/case-NN.mp4
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = "http://localhost:3000";

/**
 * 8 个案例 — 全部用 happyhorse-1.0-t2v（不需要参考图）。
 * 原案例 5/6 是 I2V/R2V，但我们没原始首帧/参考图，
 * 改成 T2V 让 HH 自己生成主体，仍然能展示其能力。
 */
const CASES = [
  {
    n: "01",
    title: "香港城市夜景延时",
    duration: 5,
    ratio: "16:9",
    prompt:
      "生成一段 5 秒的电影感香港城市夜景延时视频，拍摄点在维多利亚港，镜头固定，整体节奏舒缓有氛围，突出夜景光影和空间层次，适合横版视频开场并预留标题空间。",
  },
  {
    n: "02",
    title: "公园女子动作链",
    duration: 10,
    ratio: "16:9",
    prompt:
      "【镜头】中景到近景的缓推镜头，深秋午后，室外公园长椅场景，自然散射光。00:00-00:02：一位二十多岁的亚洲女性坐在木质长椅上，穿着浅驼色毛呢大衣，黑色长发被微风轻轻扬起几缕。她低头看着手中的咖啡纸杯，呼出的白气在冷空气中短暂消散。00:02-00:05：她缓缓抬起头，视线移向画面左侧，眼神从沉静转为一丝若有所思的浅笑。阳光透过梧桐枝叶在她侧脸上形成缓慢移动的斑驳光斑。00:05-00:08：镜头继续缓慢前推至近景，她抬起右手将一缕被风吹到脸颊的发丝轻轻别到耳后。00:08-00:10：一阵稍强的风吹起更多落叶从她身前飞过，她下意识微微眯起眼睛。",
  },
  {
    n: "03",
    title: "审讯室对峙",
    duration: 8,
    ratio: "16:9",
    prompt:
      "【场景】冷白灯光打下的审讯室，金属桌面反光，烟灰缸里还有未熄的烟。【主体】左侧老刑警西装褶皱，眼袋深重，手指慢慢敲着桌面；右侧嫌疑人双臂交叉，眼神游移，嘴角带着一丝不易察觉的轻蔑。【运动】老刑警将一张照片缓缓推过桌面，嫌疑人眼神微微一顿又迅速移开；镜头低角度平推，捕捉两人手部与表情的细微对峙。【音频】老刑警低沉沙哑：'你知道我做这行多少年了吗。'短暂沉默，烟灰缸上的烟细细飘散。嫌疑人轻飘飘：'跟我有关系吗。'",
  },
  {
    n: "04",
    title: "私人飞机机舱",
    duration: 8,
    ratio: "16:9",
    prompt:
      "【场景】奢华的私人飞机机舱内，窗外是壮丽的金红色的云海落日，阳光将机舱渲染成琥珀色。【主体】左侧满头银发的年长男性身穿高定西装，手持威士忌酒杯，目光如鹰般锐利；右侧的年轻男性身体微微前倾，眉头微皱，神情既紧张又充满野心。【运动】年长男性轻轻晃动着手中的酒杯，液体挂壁，他身体逼近对方；年轻男性深吸一口气，眼神坚定地回视。镜头缓慢侧推。【音频】年长男性低沉沙哑：'In this world, you either hunt or you become the prey.' 背景飞机引擎深沉的轰鸣声和冰块撞击玻璃杯的清脆声。",
  },
  {
    n: "05",
    title: "哭泣场景（HH 独家）",
    duration: 8,
    ratio: "9:16",
    prompt:
      "近景镜头，一位二十多岁的亚洲女性站在餐桌旁，听到父亲冠心病需要手术费的消息。她眼中的光芒瞬间黯淡下来，眼泪慢慢涌上来，泪水在下睑边缘聚集后顺着脸颊滑落。她低下头，用手指轻轻擦拭眼角，声音哽咽充满无助。皮肤细腻自然，发丝在侧逆光下边缘发亮。环境为暖黄色调家居场景。",
  },
  {
    n: "06",
    title: "大龄妈妈装走秀",
    duration: 5,
    ratio: "9:16",
    prompt:
      "【镜头1 | 中景/平视 | 缓跟运镜 | 5秒】傍晚金色阳光透过梧桐叶洒落，小区花园石板路上。一位 50 岁左右的女性身穿深蓝色 A 字连衣裙，裙摆在小腿处自然摆动。面料垂坠感强，在腰间形成自然褶皱而非紧绷，走动时裙身随步伐轻微荡开。她面带从容微笑，一手轻提草编包，步伐稳健自信。皮肤细腻自然，发丝在金色逆光中边缘发亮。",
  },
  {
    n: "07",
    title: "敦煌九色鹿",
    duration: 8,
    ratio: "16:9",
    prompt:
      "生成一支电影感幻想视频，整体为敦煌壁画风格的极繁美学，色彩以通篇红色系为主，辅以金色、赭石与暗青点缀，画面华丽庄严。一只神圣九色鹿在红色云海中缓步前行，通体洁白底色交织九色祥纹（金、青、赤、绿、紫），鹿角如珊瑚玉树般华美分叉，身躯布满敦煌联珠纹、卷草纹与流动金线，颈部鬃毛与尾巴如流光飘带般曳动。背景为层叠卷云、金线流动的敦煌式天幕，镜头横向跟随九鹿行进，节奏缓慢庄重，飞天飘带与莲纹在远景缓慢流动。",
  },
  {
    n: "08",
    title: "可口可乐清爽广告",
    duration: 8,
    ratio: "16:9",
    prompt:
      "商业摄影质感，明亮冷色调，浅景深。0-2 秒：纯白背景中，一瓶冰镇红色碳酸饮料从上方落入画面，瓶身裹着一层薄霜，撞击冰面激起一圈冰晶飞溅，伴随清脆的撞击声和冰块碎裂声。3-5 秒：微距特写瓶盖开启瞬间，大量冷气白雾从瓶口涌出，碳酸气泡翻涌着溢出瓶口向上漂浮，阳光穿过气泡折射出彩虹色光斑，伴随开罐的'嘶'声和气泡滋滋声。6-8 秒：镜头缓拉至全景，瓶子立于碎冰之上，柔和冷光从侧后方打来在瓶身勾勒出一道冰蓝高光。",
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
      params: {
        resolution: "720P",
        ratio: c.ratio,
        duration: c.duration,
        watermark: true,
      },
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
    if (j.state === "done") {
      // 服务端已经下载到 data/videos/<taskId>.mp4
      return j;
    }
    if (j.state === "error") {
      throw new Error(j.message || "task failed");
    }
    // running / pending → 等 6 秒再问
    await new Promise((r) => setTimeout(r, 6000));
    process.stdout.write(".");
  }
}

async function findLocalVideo(taskId) {
  // saveVideo 命名：<taskId>.<ext>，遍历 data/videos 找匹配
  const files = await fs.readdir(VIDEOS_DIR).catch(() => []);
  const hit = files.find((f) => f.startsWith(taskId) && /\.(mp4|mov|webm)$/i.test(f));
  return hit ? path.join(VIDEOS_DIR, hit) : null;
}

async function runOne(c) {
  const target = path.join(OUT_DIR, `case-${c.n}.mp4`);
  // 跳过已存在
  try {
    await fs.access(target);
    console.log(`[${c.n}] ${c.title} — 已存在，跳过`);
    return;
  } catch { /* 继续 */ }

  console.log(`\n[${c.n}] ${c.title}`);
  console.log(`  提交中 (duration=${c.duration}s, ratio=${c.ratio})...`);
  const taskId = await submit(c);
  console.log(`  taskId = ${taskId}`);
  process.stdout.write("  轮询中");
  const result = await poll(taskId);
  console.log(""); // 换行

  let src = result.localPath
    ? path.join(ROOT, result.localPath.replace(/^\/api\/videos\//, "data/videos/") + ".mp4")
    : await findLocalVideo(taskId);
  if (!src) {
    // 兜底：直接从 OSS URL 下载
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

  // 串行跑（避免 rate limit）—— 也可以改成 Promise.allSettled 并发
  const onlyArg = process.argv[2]; // 可选：只跑某一个，如 "03"
  const targets = onlyArg ? CASES.filter((c) => c.n === onlyArg) : CASES;

  let ok = 0;
  let fail = 0;
  for (const c of targets) {
    try {
      await runOne(c);
      ok++;
    } catch (e) {
      console.error(`[${c.n}] ✗ ${e.message}`);
      fail++;
    }
  }
  console.log(`\n汇总：${ok} 成功 / ${fail} 失败 / 共 ${targets.length}`);
}

main().catch((e) => {
  console.error("致命错误：", e);
  process.exit(1);
});
