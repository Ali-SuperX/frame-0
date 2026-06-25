/**
 * /api/film/chat — LumenX 4-Tab 对话 API。
 *
 * 每个 Tab（剧本/角色/分镜/时间轴）有独立的对话线程，根据 Tab 类型注入不同的
 * system prompt；并把当前选中实体的摘要（refContent）追加到 system prompt，
 * 让 AI 知道「用户在聊哪张卡」。
 *
 * 支持：
 *   - 流式 SSE（默认）：每条 chunk 形如 `data: {"content":"..."}\n\n`，结束 `data: [DONE]\n\n`
 *   - 非流式 JSON：`{ content: "完整回复文本" }`
 *
 * 上游：DashScope OpenAI 兼容接口
 *   https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 */

import { readUserKeysFromRequest } from "@/lib/bailian/client";
import type { LxTab } from "@/lib/lumenx/types";

const DASHSCOPE_CHAT_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

const DEFAULT_MODEL = "qwen-plus";

// ──────────────────────────────────────────────────────────────────────────
// system prompt：按 Tab 注入不同的人设
// ──────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<LxTab, string> = {
  script: `你是一位专业的 AI 短剧编剧助手，精通短剧创作七步法。

## 你的核心信条
- 情绪节奏 > 情节复杂
- 画面感 > 文字描述
- 禁止抽象心理活动，一切转化为可拍摄的画面动作

## 七步法流程
1. 理解需求：明确题材类型、目标受众、情绪基调
2. 构建冲突：设计核心矛盾和利益对抗
3. 人物弧光：设定角色性格变化轨迹
4. 黄金结构：搭建起承转合骨架
5. 开场三板斧：前3秒必须抓住注意力
6. 爽感节拍：每30秒至少一个情绪高潮点
7. 网文改编：如从现有文本改编，保留爽点，删除内心独白

## 格式规范
- 单集 500-700 字，1-3 个场景
- 场景格式：[编号] 内/外. 地点 - 时间
- 出场角色：角色A、角色B
- 特殊符号：△ 动作描述 | OS 内心独白 | VO 旁白/画外音 | → 悬念结尾

## 你的行为准则
- 用户粘贴文本后，先评估质量再建议优化方向
- 主动引导用户补全角色外貌、场景细节
- 如果剧本完成度足够，建议进入角色提取阶段
- 当你认为可以执行操作时，在回复末尾输出 action 标记

## 可用动作
- [ACTION:extract_entities] — 从剧本提取角色/场景/道具
- [ACTION:polish_script] — 润色当前剧本
- [ACTION:expand_script] — 扩写剧本`,

  character: `你是一位专业的角色设计与视觉创作助手，精通实体提取与参考图生成。

## 实体提取规范
从剧本中提取三类实体：
- **角色 (character)**：覆盖年龄、身材、发型发色、肤色、标志性服装/配饰
- **场景 (scene)**：覆盖类型(室内/室外)、时代风格、光线氛围、核心装饰/地标
- **道具 (prop)**：覆盖颜色、形状、材质、相对体积

## 生图 Prompt 规范
- 角色：9:16 全身照，不写表情，不持物品，纯色/简洁背景
- 场景：16:9 广角无人照，强调空间感和氛围光
- 道具：1:1 居中特写，纯色背景，强调材质纹理
- 所有 prompt 用英文书写，先写主体，再写风格，最后写技术参数

## 你的行为准则
- 帮助用户完善实体描述，使其足够具体可生图
- 检查描述的视觉唯一性（避免"漂亮的女人"这种模糊描述）
- 建议三视图策略以提升后续一致性
- 主动提供 prompt 优化建议

## 可用动作
- [ACTION:extract_entities] — 从剧本提取全部实体
- [ACTION:generate_image:CHARACTER_ID] — 为指定角色生成形象图
- [ACTION:generate_image:SCENE_ID] — 为指定场景生成图
- [ACTION:generate_image:PROP_ID] — 为指定道具生成图
- [ACTION:generate_all_images] — 批量生成所有实体图`,

  storyboard: `你是一位专业的分镜脚本设计师，精通短剧分镜拆解与画面构图。

## 分镜拆解核心原则
"优先合并，不要优先拆开"——
- 同角色连续动作 → 合为一镜
- 完整情绪弧 → 合为一镜
- 连续问答对白 → 合为一镜

## 时长与节奏约束
- 每个 segment 时长 4-15 秒硬上限
- 对白占比不超过 60%
- 连续无对白画面不超过 8 秒

## Segment 格式
每个 segment 包含：
- segment_plan：子镜头调度（时间段+景别+画面内容）
- description：原文场景描述
- dialogue：角色台词
- entities：出场实体 ID 列表（角色/场景/道具）

## 符号体系
- 音乐用 ()：(紧张弦乐渐强)
- 音效用 <>：<门重重关上>
- 台词用 {}：{你知道进这扇门，要付什么代价吗？}
- 字幕用【】：【三天前】

## 镜头语言速查
- 景别：特写(面部情绪)、近景(上半身)、中景(膝上)、全景(全身+环境)、远景(环境全貌)
- 运镜：推(zoom-in)、拉(zoom-out)、摇(pan)、环绕(orbit)、跟(follow)、手持(handheld)

## 你的行为准则
- 帮助用户优化分镜描述的画面感
- 检查景别/运镜选择是否匹配情绪
- 建议合并过碎的分镜、拆分过长的分镜
- 将中文描述翻译为英文画面 prompt

## 可用动作
- [ACTION:build_storyboard] — AI 自动拆解剧本为分镜
- [ACTION:generate_shot_image:SHOT_ID] — 为指定分镜生成首帧图
- [ACTION:generate_all_shot_images] — 批量生成所有分镜首帧`,

  timeline: `你是一位专业的视频编辑与合成助手，精通 AI 视频生成与剪辑节奏设计。

## 视频生成四种模式
1. **multi_ref**（主推）：把 segment 出场实体的参考图作为 ref_assets，prompt 首句锚定空间布局，按时间段逐行描述
2. **start_frame**：先生成首帧静态图，再驱动为视频
3. **n_grid**：多宫格关键帧，适合复杂场景
4. **video_ref**：取前一段视频尾帧接续，保持连续性

## Prompt 写法
- 首句锚定空间：主体位置 + 环境
- 按时间段描述：0-2s 做什么，2-4s 做什么
- 每段包含：画面动作 + 表情变化 + 光影变化
- 避免：抽象情绪词、无法拍摄的内容

## 节奏设计
- 对话场景：正反打节奏，1.5-3s 切一次
- 动作场景：跟镜头，4-7s 一气呵成
- 氛围场景：慢推/慢拉，5-10s 留白
- 总时长 = Σ(每段 durationSec)

## 你的行为准则
- 帮助用户优化视频生成 prompt
- 建议合适的生成模式
- 检查相邻段的连续性（转场是否突兀）
- 优化时长分配和节奏感

## 可用动作
- [ACTION:generate_video:SHOT_ID] — 为指定分镜生成视频
- [ACTION:generate_all_videos] — 批量生成所有分镜视频
- [ACTION:render_final] — 合成最终视频`,
};

function buildSystemPrompt(
  tab: LxTab,
  refContent?: string,
  refLabel?: string,
  scriptContent?: string,
  entitiesSummary?: string,
): string {
  const base = SYSTEM_PROMPTS[tab] ?? SYSTEM_PROMPTS.script;
  const parts: string[] = [base];

  // 注入项目剧本上下文（所有 Tab 都需要，确保 AI 了解项目背景）
  if (scriptContent && scriptContent.trim()) {
    const excerpt = scriptContent.trim().slice(0, 2000);
    parts.push(`---\n## 当前项目剧本（摘要）\n${excerpt}${scriptContent.length > 2000 ? "\n…（已截断）" : ""}`);
  }

  // 注入已提取实体摘要
  if (entitiesSummary && entitiesSummary.trim()) {
    parts.push(`## 已提取的角色/场景列表\n${entitiesSummary.trim()}`);
  }

  // 注入当前选中内容（用户点选的某个实体/段落）
  if (refContent && refContent.trim()) {
    const labelLine = refLabel ? `**${refLabel}**\n` : "";
    parts.push(`## 当前选中内容\n${labelLine}${refContent}`);
  }

  return parts.join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────────
// 入参类型
// ──────────────────────────────────────────────────────────────────────────

type LumenXChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: string[];
};

type LumenXChatContext = {
  refType?: string;
  refId?: string;
  refLabel?: string;
  refContent?: string;
};

type LumenXChatBody = {
  messages: LumenXChatMessage[];
  tab: LxTab;
  model?: string;
  context?: LumenXChatContext;
  stream?: boolean;
  /** 项目剧本内容（摘要或全文），所有 Tab 都应携带，确保 AI 了解项目背景 */
  scriptContent?: string;
  /** 已提取的角色/场景列表摘要，便于 AI 知晓项目角色谱系 */
  entitiesSummary?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// API key
// ──────────────────────────────────────────────────────────────────────────

function resolveApiKey(userKeys: Record<string, string>): string {
  const key =
    userKeys.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || "";
  if (!key) {
    throw new Error(
      "DASHSCOPE_API_KEY is not set (fill it in Settings ⚙️ or .env.local)"
    );
  }
  return key;
}

// ──────────────────────────────────────────────────────────────────────────
// 把上游 OpenAI 风格的 SSE 转成 { content } 风格
// ──────────────────────────────────────────────────────────────────────────

function transformUpstreamSSE(
  upstreamBody: ReadableStream<Uint8Array>,
  ac: AbortController,
  idleMs = 120_000, // 120s 容得下 thinking 模型首字耗时,又把悬挂上限压到 2 分钟
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buffer = "";
  let closed = false;
  // 空闲超时：上游 idleMs 内无任何数据 → 中止上游 fetch（reader.read 会随之 reject）。
  // 修复 8 小时不关的根因：上游挂住(不发 [DONE] 不结束)时,read() 永远等待 → SSE 连接永不关闭。
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => ac.abort(), idleMs); };
  const disarm = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      arm(); // 读之前武装；拿到数据/结束/出错再解除
      try {
        const { done, value } = await reader.read();
        disarm(); // 拿到结果(数据/结束)即解除空闲计时 —— 只计「等上游」的时间，不误伤慢客户端/背压
        if (done) {
          if (!closed) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            closed = true;
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // SSE 以 \n\n 分包；逐行解析每个事件块
        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          // 一个 event 内可能有多条 `data:` 行
          const lines = rawEvent.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();

            if (!payload) continue;
            if (payload === "[DONE]") {
              disarm();
              if (!closed) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                closed = true;
              }
              return;
            }

            try {
              const json = JSON.parse(payload) as {
                choices?: Array<{
                  delta?: { content?: string; reasoning_content?: string };
                  message?: { content?: string; reasoning_content?: string };
                }>;
              };
              const choice = json.choices?.[0];
              const delta =
                choice?.delta?.content ??
                choice?.message?.content ??
                "";
              const reasoning =
                choice?.delta?.reasoning_content ??
                choice?.message?.reasoning_content ??
                "";
              if (delta) {
                const out = `data: ${JSON.stringify({ content: delta })}\n\n`;
                controller.enqueue(encoder.encode(out));
              } else if (reasoning) {
                // 思考型模型(如 qwen3.7-max) 在思考阶段只发 reasoning_content，
                // 转发为单独事件，前端可展示「思考中」状态并保持连接活跃。
                const out = `data: ${JSON.stringify({ reasoning })}\n\n`;
                controller.enqueue(encoder.encode(out));
              }
            } catch {
              // 非 JSON 的 keep-alive 行忽略
            }
          }
        }
      } catch (err) {
        disarm();
        if (!closed) {
          const message = err instanceof Error ? err.message : "stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: message })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          closed = true;
        }
      }
    },
    cancel() {
      disarm();
      reader.cancel().catch(() => {});
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 路由
// ──────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const userKeys = readUserKeysFromRequest(req);
    const apiKey = resolveApiKey(userKeys);

    const body = (await req.json()) as LumenXChatBody;
    const {
      messages: rawMessages,
      tab,
      model = DEFAULT_MODEL,
      context,
      stream = true,
    } = body ?? {};

    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return Response.json(
        { error: "messages is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    const validTabs: LxTab[] = ["script", "character", "storyboard", "timeline"];
    if (!tab || !validTabs.includes(tab)) {
      return Response.json(
        { error: `tab is required and must be one of: ${validTabs.join(", ")}` },
        { status: 400 }
      );
    }

    const sysPrompt = buildSystemPrompt(
      tab,
      context?.refContent,
      context?.refLabel,
      body.scriptContent,
      body.entitiesSummary,
    );

    // 过滤掉客户端可能误传的 system 消息——system 由服务端按 Tab 统一注入
    const userTurns = rawMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));

    const messages = [
      { role: "system", content: sysPrompt },
      ...userTurns,
    ];

    // 客户端断开(关页/切走)→ 中止上游 fetch，杜绝连接悬挂(8 小时不关的根因之一)
    const ac = new AbortController();
    if (req.signal.aborted) ac.abort();
    else req.signal.addEventListener("abort", () => ac.abort());

    const upstream = await fetch(DASHSCOPE_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        // Qwen3 系思考型模型(qwen3.7-max / qwen3.7-plus 等)默认会先输出 reasoning_content，
        // 思考阶段可能持续数十秒，期间不发 content -> 前端表现为「无响应」。
        // 关闭思考让所有模型立即开始流式吐字；普通模型兼容忽略此参数。
        enable_thinking: false,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: ac.signal,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json(
        { error: `DashScope API error: ${upstream.status}`, detail: errText },
        { status: 500 }
      );
    }

    // ── 非流式：抽出 content 直接返回 ──
    if (!stream) {
      const t = setTimeout(() => ac.abort(), 90_000); // 非流式上限 90s，防 body 读取悬挂
      try {
        const data = (await upstream.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        return Response.json({ content });
      } finally {
        clearTimeout(t);
      }
    }

    // ── 流式：转译上游 SSE 成 { content } 风格 ──
    if (!upstream.body) {
      return Response.json(
        { error: "No response body from DashScope" },
        { status: 502 }
      );
    }

    const responseStream = transformUpstreamSSE(upstream.body, ac);

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
