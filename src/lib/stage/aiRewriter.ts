/**
 * 片场 AI 改写单 beat —— "重写更紧凑/更燃/更悬念/..."
 *
 * 行业标准做法:给 LLM 一个"风格指令" + 原文本,让它改写。
 * 输出严格 JSON,前端解析后 patch 进 beat。
 */

import type { CastBeatKind, CastShotType } from "@/lib/store";

export type RewriteIntent =
  | "tighter"   // 更紧凑(砍废话)
  | "punchy"    // 更燃(情绪冲击 / 反转)
  | "suspense"  // 更悬念(留钩子)
  | "casual"    // 更日常(口语化)
  | "custom";

export type RewriteRequest = {
  text: string;
  kind: CastBeatKind;
  intent: RewriteIntent;
  customInstruction?: string;
};

export type RewriteResult = {
  text: string;
  /** LLM 可能建议换镜头(如改成 zoom-in 增强冲击)*/
  shotType?: CastShotType;
};

const INTENT_PHRASE: Record<RewriteIntent, string> = {
  tighter: "更紧凑,删掉所有废话,只保留情绪和动作。字数减半。",
  punchy: "更燃,加强情绪冲击,可以加一句出人意料的反转。",
  suspense: "更悬念,结尾留钩子,让人想看下一拍。",
  casual: "更日常自然,口语化,像真人说话。",
  custom: "(用户自定义指令见下)",
};

export async function aiRewriteBeat(req: RewriteRequest): Promise<RewriteResult> {
  const intentPhrase =
    req.intent === "custom" && req.customInstruction
      ? req.customInstruction
      : INTENT_PHRASE[req.intent];

  const sys = `你是一位${req.kind === "comic" ? "漫剧" : "短剧"}编剧。
改写用户给的一拍台词/旁白,要求:${intentPhrase}

返回严格 JSON,无任何前后缀文字、无 \`\`\` 包裹:
{
  "text": "改写后的中文,1-2 句,不超过 35 字",
  "shotType": "若需要换镜头则给一个,值用英文枚举:still | zoom-in | zoom-out | pan-lr | parallax | live | ots | pov | dutch | hero。如保持原镜头则不返回此字段"
}`;

  const messages = [
    { role: "system", content: sys },
    { role: "user", content: `原文:${req.text}` },
  ];

  const res = await fetch("/api/bailian/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: false, temperature: 0.7 }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM 改写失败:${res.status} ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const content: string =
    json.choices?.[0]?.message?.content || json.content || "";
  if (!content) throw new Error("LLM 返回为空");

  // 容忍 ```json 包裹 + 前后噪音
  let body = content.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) body = body.slice(start, end + 1);

  let parsed: { text?: string; shotType?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    // LLM 没出 JSON,把整段当 text 兜底
    return { text: content.trim() };
  }

  const text = String(parsed.text || "").trim();
  if (!text) throw new Error("LLM 改写后文本为空");
  const VALID = ["still", "zoom-in", "zoom-out", "pan-lr", "parallax", "live", "ots", "pov", "dutch", "hero"];
  const shotType =
    parsed.shotType && VALID.includes(parsed.shotType)
      ? (parsed.shotType as CastShotType)
      : undefined;

  return { text, shotType };
}
