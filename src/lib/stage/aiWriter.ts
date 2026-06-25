/**
 * 片场 AI 写剧本 —— 一句话剧情 → N beats
 *
 * 调用 /api/bailian/chat (qwen3.6-plus, OpenAI 兼容协议),
 * 用 system prompt 约束 LLM 输出严格 JSON,前端解析后塞进 episode。
 *
 * 设计要点:
 *   - 强制 JSON 输出,失败兜底 1 次重试(LLM 偶尔会带 ```json 包裹)
 *   - 漫剧/短剧两种 system prompt,文风/镜头建议不同
 *   - 角色名提示 LLM 使用,保证 speakerId 一致
 *   - 漫剧默认 zoom-in/pan-lr 等运动镜头,短剧默认 live
 */

import type { CastBeatKind, CastShotType } from "@/lib/store";

/** LLM 返回的单 beat 形状(严格 JSON schema) */
export type AIBeatDraft = {
  text: string;
  shotType: CastShotType;
  /** LLM 估算的画面 prompt(给 imagegen 用,可空) */
  imagePrompt?: string;
  /** 推荐时长(秒),2-6 之间 */
  durationSec: number;
  /** 谁在说话(角色名,前端再 lookup id) */
  speakerName?: string;
  /** 这一拍发生在哪个场景(场景名,前端 lookup location id 关联场景图，保证背景一致) */
  sceneName?: string;
};

export type AIWriteRequest = {
  /** 一句话剧情(用户输入) */
  premise: string;
  /** 漫剧 / 短剧 */
  kind: CastBeatKind;
  /** 要写多少拍(典型 6-12) */
  numBeats: number;
  /** 当前角色册(LLM 在文本里用这些名字) */
  cast: { name: string; description?: string }[];
  /** 风格提示(中文/英文皆可,LLM 会用作画面氛围) */
  styleHint?: string;
  /** 当前场景册(LLM 标注每拍 sceneName,前端 lookup 关联场景图) */
  locations?: { name: string; description?: string }[];
  /** LLM 模型(默认走 chat route 的 qwen3.6-plus) */
  model?: string;
};

export type AIWriteResult = {
  beats: AIBeatDraft[];
  /** LLM 写完的总结(给用户做 sanity check 用) */
  synopsis?: string;
};

/* —— Prompt 构造 —— */

function buildSystemPrompt(kind: CastBeatKind, cast: { name: string; description?: string }[], styleHint?: string, locations?: { name: string; description?: string }[]): string {
  const castNames = cast.length > 0
    ? cast.map((c) => c.name).join("、")
    : "";
  const locNames = locations && locations.length > 0
    ? locations.map((l) => l.name).join("、")
    : "";

  // 行业标准:把每个角色的描述列给 LLM,这样写出的剧情符合角色设定
  // (如年龄/服装/性格),避免"林夏"在第 3 拍突然举刀这种 OOC
  const castDescriptions = cast.length > 0
    ? cast
        .map((c) => {
          const desc = c.description?.trim();
          return desc ? `  · ${c.name}:${desc}` : `  · ${c.name}`;
        })
        .join("\n")
    : "";

  const formatBlock = `
返回严格 JSON,不要 \`\`\`json 包裹,不要任何前后缀文字。结构:
{
  "synopsis": "对整个故事的一句话总结(可空)",
  "beats": [
    {
      "text": "这一拍的旁白或台词(中文,1-2 句,不超过 35 字)",
      "shotType": "${kind === "comic"
        ? `镜头语言.运动类(漫剧主流):still(静) | zoom-in(关键时刻特写) | zoom-out(揭示场景) | pan-lr(展示环境)
       构图类(增强电影感):ots(过肩,对话场景) | pov(主观,代入感) | dutch(斜角,紧张/失衡) | hero(英雄镜,高光)
       这一拍选最合适的一个,优先用运动类,关键时刻用构图类增加电影感`
        : `live(短剧默认全部真视频)。如需特殊运镜可选:zoom-in(冲突高潮特写) | ots(对话) | pov(代入) | dutch(意外/失衡) | hero(高光)`}",
      "imagePrompt": "画面描述(英文,80 字以内,具体的视觉元素:角色姿态、环境、光线、构图)",
      "durationSec": 数字(2 到 6 之间,中文台词每字按 0.25s 计),
      "speakerName": "${castNames ? "若有对白,从 [" + castNames + "] 选;旁白为空" : "通常为空(纯旁白)"}",
      "sceneName": "${locNames ? "这一拍发生的场景,从 [" + locNames + "] 里选最匹配的一个,保证同场景跨拍背景一致;不确定则空" : "通常为空"}"
    }
  ]
}`;

  if (kind === "comic") {
    return `你是一位漫剧编剧。漫剧 = AI 故事卡片视频 = 静态画面 + 旁白叙述 + 缓慢镜头。
节奏:每拍 3-6 秒,旁白驱动情绪,画面美感优先。
镜头偏好:多用 zoom-in(关键时刻特写)、pan-lr(展示环境)、static(沉静时刻)。
${castDescriptions ? "角色设定(必须遵守,人物言行符合描述):\n" + castDescriptions : (castNames ? "角色:" + castNames : "")}
${castNames ? "在 text/imagePrompt 里使用这些角色名,跨拍保持一致。" : ""}
${styleHint ? "风格:" + styleHint + "。imagePrompt 末尾追加风格关键词。" : ""}

${formatBlock}`;
  } else {
    return `你是一位短剧编剧。短剧 = 真人/AI 视频微剧,1-3 秒强反转,对话密集。
节奏:每拍 2-4 秒,以对白和动作推进,反转密。
镜头:全部 live(每拍都是视频),通过 text 指明动作和对白。
${castDescriptions ? "角色设定(对白和行为必须符合):\n" + castDescriptions : (castNames ? "角色:" + castNames : "")}
${castNames ? "对白用这些角色,speakerName 字段填实际说话者。" : ""}
${styleHint ? "风格:" + styleHint + "。" : ""}

${formatBlock}`;
  }
}

function buildUserPrompt(premise: string, numBeats: number, kind: CastBeatKind): string {
  return `剧情:${premise}

请用${numBeats}拍展开这个故事${kind === "comic" ? "(漫剧节奏,旁白驱动)" : "(短剧节奏,对白驱动,带反转)"}。第一拍立场景,中间推进冲突,最后一拍留下回味或反转。`;
}

/* —— 主入口 —— */

export async function aiWriteBeats(req: AIWriteRequest): Promise<AIWriteResult> {
  const messages = [
    { role: "system", content: buildSystemPrompt(req.kind, req.cast, req.styleHint, req.locations) },
    { role: "user", content: buildUserPrompt(req.premise, req.numBeats, req.kind) },
  ];

  const res = await fetch("/api/bailian/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model: req.model || undefined,
      stream: false,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LLM 调用失败:${res.status} ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string =
    json.choices?.[0]?.message?.content ||
    json.content ||
    "";
  if (!content) throw new Error("LLM 返回为空");

  return parseLLMResponse(content, req.kind);
}

/** 解析 LLM 返回,容忍 ```json 包裹和少量噪音 */
function parseLLMResponse(content: string, kind: CastBeatKind): AIWriteResult {
  // 尝试剥 ```json ... ``` 包裹
  let body = content.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1].trim();

  // 再尝试从第一个 { 到最后一个 } 截取(防 LLM 前后加描述文字)
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) body = body.slice(start, end + 1);

  let parsed: { synopsis?: string; beats?: unknown[] };
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(
      `LLM 输出非 JSON: ${e instanceof Error ? e.message : ""}。前 200 字:${content.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
    throw new Error("LLM 没有产出 beats");
  }

  // 规范化每个 beat — 兜底 shotType / durationSec
  const beats: AIBeatDraft[] = (parsed.beats as Record<string, unknown>[]).map((raw, i) => {
    const text = String(raw.text || "").trim() || `第 ${i + 1} 拍`;
    let shotType = String(raw.shotType || "").trim() as CastShotType;
    const VALID_SHOTS = [
      "still", "zoom-in", "zoom-out", "pan-lr", "parallax", "live",
      "ots", "pov", "dutch", "hero",
    ];
    if (!VALID_SHOTS.includes(shotType)) {
      shotType = kind === "comic" ? (i % 3 === 0 ? "zoom-in" : "still") : "live";
    }
    const durationSec = Math.max(
      2,
      Math.min(8, Number(raw.durationSec) || (kind === "comic" ? 4 : 3))
    );
    const imagePrompt = raw.imagePrompt ? String(raw.imagePrompt).trim() : undefined;
    const speakerName = raw.speakerName ? String(raw.speakerName).trim() : undefined;
    const sceneName = raw.sceneName ? String(raw.sceneName).trim() : undefined;
    return { text, shotType, imagePrompt, durationSec, speakerName, sceneName };
  });

  return {
    beats,
    synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis : undefined,
  };
}
