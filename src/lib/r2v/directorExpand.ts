/**
 * streamDirectorExpand —— 导演台「AI 电影化扩写」的就地流式版（工坊 / 画布共用）。
 *
 * 两种走法：
 *  - presetId 给定且非 "auto"：复刻导演台原方式 —— 用 r2vConfig.preset 把该「场景
 *    套路」(电商爆款/电影质感/美妆…)的写作规则注入服务端 system prompt，按套路扩写。
 *  - 否则(自由发挥 auto)：用聚焦的「导演/摄影指导」system prompt，干净单段扩写。
 *
 * 都约束为【单镜头连贯扩写】(一个 prompt = 一个片段)，输出尽量干净(不带负向词/自检
 * 清单/参考图标记)。流式逐字回写：每来一段调 onToken(累计全文)，结束返回全文 trim。
 */
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { getPresetById } from "@/lib/r2v/promptPresets";

export async function streamDirectorExpand(
  basePrompt: string,
  opts: {
    zh: boolean;
    onToken: (full: string) => void;
    signal?: AbortSignal;
    /** 场景套路预设 id；"auto"/undefined = 不套套路，自由发挥。 */
    presetId?: string;
  }
): Promise<string> {
  const { zh, onToken, signal, presetId } = opts;
  const base = basePrompt.trim();
  const preset =
    presetId && presetId !== "auto" ? getPresetById(presetId) : undefined;
  // 自由发挥必须有想法；套了套路则想法可空（按套路出一版示例）。
  if (!preset && !base) return "";

  let payload: Record<string, unknown>;
  if (preset) {
    const presetName = zh ? preset.label : preset.labelEn;
    const presetDesc = zh ? preset.desc : preset.descEn;
    const userContent = zh
      ? `${base ? `我的想法：${base}\n\n` : "（我还没写具体想法，请按这个套路给一版有代表性的示例）\n\n"}请严格按「${presetName}」（${presetDesc}）这个导演套路，写一段可直接用于 AI 视频生成的专业 prompt。要求：一段连贯中文，融入该套路特有的景别、运镜、灯光、色调、节奏和质感；保留我的核心意图。不要分镜编号、不要时间码、不要参考图标记（【图N】）、不要 [Negative]、不要自检清单。直接输出 prompt 正文。`
      : `${base ? `My idea: ${base}\n\n` : "(No concrete idea yet — give a representative example in this style)\n\n"}Following the "${presetName}" (${presetDesc}) style strictly, write ONE single-shot professional prompt for AI video generation. One coherent paragraph weaving in this style's shot sizes, camera movement, lighting, color, pacing and texture. Keep my core intent. No shot numbers, no timecodes, no reference markers, no [Negative], no checklist. Output only the prompt text.`;
    payload = {
      stream: true,
      r2vConfig: {
        ...(base ? { coreNeed: base } : {}),
        preset: presetId,
        promptStyle: preset.style,
        isEcommerce: preset.ecommerce ?? false,
        disabledModules: ["checklist", "negative", "r2v-guide"],
      },
      messages: [{ role: "user", content: userContent }],
    };
  } else {
    const system = zh
      ? "你是顶级视频导演兼摄影指导。把用户的创意改写成一段可直接用于 AI 视频生成的专业 prompt。要求：一段连贯描述，融入专业镜头语言（景别、运镜、灯光、焦段、色调、节奏、质感）；完整保留用户核心意图；不要分镜编号、不要时间码、不要参考图标记、不要 [Negative]、不要自检清单。直接输出 prompt 正文。"
      : "You are a top-tier film director and cinematographer. Rewrite the user's idea into ONE professional prompt for AI video generation. One coherent paragraph with professional cinematic language (shot size, camera movement, lighting, lens, color, pacing, texture). Keep user's core intent. No shot numbers, no timecodes, no reference markers, no [Negative], no checklist. Output only the prompt text.";
    payload = {
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: zh ? `创意：${base}` : `Idea: ${base}` },
      ],
    };
  }

  const res = await fetch("/api/bailian/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeysHeader() },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${res.status} ${err.slice(0, 120)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error(zh ? "无流式响应" : "no stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 末尾不完整行留到下一轮
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken(full);
        }
      } catch {
        // 忽略 keepalive / 非 JSON 行
      }
    }
  }
  return full.trim();
}
