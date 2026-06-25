#!/usr/bin/env node
/**
 * 自动跑 hh-guide.html「真人短剧专题」3 个 Good case，
 * 把生成结果保存到 public/hh-cases/drama-NN.mp4。
 *
 * 用法：node scripts/generate-drama-cases.mjs       (跑全部)
 *      node scripts/generate-drama-cases.mjs 01     (只跑 01)
 *
 * Prompt 是文档原版的精简执行版（保留五维度核心，控制在 HH 单段 5-8s）。
 * 全部走 t2v —— 我们没原始参考图，让 HH 自己生成角色。
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
    title: "开门见人",
    duration: 7,
    ratio: "9:16",
    prompt:
      "4K高清电影质感，色调冷中性偏自然，光影柔和，现代家居入户场景。全程无字幕，不保留人声，人物全程不张嘴说话；保留门铃余韵、脚步声、门把手转动声、开门声、室内环境音、轻微衣料摩擦声。人物面部稳定不变形，皮肤细腻自然哑光质感。" +
      "镜头1（0-2秒，近景/平推）：年轻亚洲女性从沙发起身走到门边，右手缓缓抬起靠近门把，手指从自然松开到轻轻收紧，将房门拉开，身体顺势微微侧开，上半身朝门外探出少许，视线先落向门缝外再停住。" +
      "镜头2（2-4秒，中景/侧视）：门已打开，画面切至门外视角。一位年轻男性站在门外，肩膀略微下沉，双手自然垂落身侧，目光先平稳落向门内，随后与门内女性形成明确对视；他的表情从普通等待慢慢显出一点无辜与克制，眉眼放松，嘴唇始终自然闭合。" +
      "镜头3（4-7秒，近景/抽帧）：女性看清门外人后，视线短暂停住，眼神微微一滞，瞳孔轻轻放大，眉毛略微抬起又缓缓收住，嘴唇始终闭合但下颌有极轻微绷紧，呼吸像顿了半拍，肩膀也跟着轻轻定住，情绪从平静开门转为认出对方后的惊讶与怔住。",
  },
  {
    n: "02",
    title: "四人聚餐揭底",
    duration: 12,
    ratio: "16:9",
    prompt:
      "8K高清真人电影风格，写实质感，照片级真实，胶片摄影风格。室内自然暖色调中带轻微冷灰对比，场景光感真实，皮肤保留毛孔质感。全程无字幕。两男两女年轻人围坐餐桌前共进晚餐的现代场景。" +
      "镜头1（0-6秒，近景/微推 浅景深）：镜头从右侧的年轻女性上半身和脸部开始，她左侧紧邻的年轻男性同框可见，前景关系明确。该女性原本只是微微侧向左侧男性坐着，听到自己回忆被触发后，眼神先短暂一滞，随即瞳孔明显放大，眉毛迅速上挑后又微微收紧，嘴唇从半张过渡到更用力地张开；她右手猛地抬起后重重拍在自己大腿上，拍击瞬间肩背一下子绷紧，从原本略放松的坐姿骤然挺直，胸腔明显起伏一次，声音失控拔高。拍完后她保持上身前倾，视线牢牢钉在左侧男性脸上，下巴略微抬高。台词：'我想起来了！他根本不是什么阔少！他就是个送外卖的！我就说这张脸怎么这么眼熟！'" +
      "镜头2（6-12秒，近景/固定 浅景深）：承接上一镜头结束状态，女性保持身体挺直、视线锁定。镜头重心转到左侧男性的反应：他先是下颌微微下坠，嘴巴一点点张大到夸张程度，眉心收紧，眼睛越睁越圆，瞳孔轻微收缩；紧接着上半身下意识向后仰开，背部压向椅背，脖颈略微后缩，像被这句话猛地顶了一下，随后又维持后仰姿态看向女性。台词：'什么？！校花竟然找了个外卖员当男朋友？这跨度也太大了吧！'",
  },
  {
    n: "03",
    title: "古装苏府开门认人",
    duration: 8,
    ratio: "16:9",
    prompt:
      "4K高清电影质感，古装题材，色调偏冷，光影对比强烈。古代苏府大门内外场景，朱红色大门，门内是中式庭院。全程无字幕，不保留人声，人物全程不张嘴说话；保留沉重的开门木质声、衣料摩擦声、晨风轻拂声。" +
      "镜头1（0-2秒，中景/固定 从人物背后拍摄）：镜头从两位站在门外的人背后拍摄，背对镜头面向紧闭的朱红色大门。右侧一位身穿古装的年轻女子，背影显出衣衫凌乱发丝散乱，肩膀微微下垂显得疲惫不堪。左侧后方两步距离站着一位身穿古装的年轻男子，背脊笔直，双手负在身后，静静凝视大门。晨光斜照在门上，投下长长的影子。" +
      "镜头2（2-6秒，中远景/缓推）：朱红色大门从中缝缓缓向两侧拉开，门缝逐渐扩大，露出门内中式庭院。庭院中央偏左站着一位身穿华贵古装的年轻女子，身姿挺直，下巴微扬，目光锐利地直视前方。她右后方半步站着另一位身着丫鬟服饰的年轻女子，双手交叠在身前。门继续打开，中央女子的视线开始缓缓下移，落在门外的人身上。" +
      "镜头3（6-8秒，近景/过肩缓推）：前景是门外狼狈女子的后脑勺和散乱发丝的虚化轮廓，镜头缓缓推向站在门内的华贵女子。她保持站立在原位，原本凌厉的眼神在认出门外人的瞬间急剧变化——瞳孔明显放大，眉心微微皱起，嘴唇轻颤着微张，下巴肌肉绷紧。",
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
  const target = path.join(OUT_DIR, `drama-${c.n}.mp4`);
  try {
    await fs.access(target);
    console.log(`[drama-${c.n}] ${c.title} — 已存在，跳过`);
    return;
  } catch { /* 继续 */ }

  console.log(`\n[drama-${c.n}] ${c.title}`);
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
    catch (e) { console.error(`[drama-${c.n}] ✗ ${e.message}`); fail++; }
  }
  console.log(`\n汇总：${ok} 成功 / ${fail} 失败 / 共 ${targets.length}`);
}

main().catch((e) => { console.error("致命错误：", e); process.exit(1); });
