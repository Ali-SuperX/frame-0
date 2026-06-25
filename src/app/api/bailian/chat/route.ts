/**
 * /api/bailian/chat — DashScope OpenAI-compatible chat endpoint.
 *
 * Supports:
 *   - Streaming SSE (stream: true, default) for AI chat
 *   - Non-streaming JSON (stream: false) for quick VL descriptions
 *   - Multimodal content (text + image_url) for VL models
 *
 * Uses the same API key infrastructure as video generation.
 */

import { readUserKeysFromRequest } from "@/lib/bailian/client";
import { buildSystemPrompt } from "@/lib/r2v/chatSystemPromptServer";
import type { R2VConfig } from "@/lib/r2v/chatSystemPrompt";

const DASHSCOPE_CHAT_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

const DEFAULT_MODEL = "qwen3.6-plus";

function resolveApiKey(userKeys: Record<string, string>): string {
  const key =
    userKeys.DASHSCOPE_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    "";
  if (!key) {
    throw new Error(
      "DASHSCOPE_API_KEY is not set (fill it in Settings ⚙️ or .env.local)"
    );
  }
  return key;
}

export async function POST(req: Request) {
  try {
    const userKeys = readUserKeysFromRequest(req);
    const apiKey = resolveApiKey(userKeys);

    const body = await req.json();
    const {
      messages: rawMessages,
      model = DEFAULT_MODEL,
      stream = true,
      r2vConfig,
      temperature,
      enableThinking,
    }: {
      // content can be string (text-only) or array (multimodal: text + image_url)
      messages: { role: string; content: unknown }[];
      model?: string;
      stream?: boolean;
      r2vConfig?: R2VConfig;
      temperature?: number;
      enableThinking?: boolean;
    } = body;

    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return Response.json(
        { error: "messages is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    // When r2vConfig is present, build system prompt server-side and prepend it.
    // This keeps ~57KB of skill references out of the client bundle.
    let messages = rawMessages;
    if (r2vConfig) {
      const sysPrompt = buildSystemPrompt(r2vConfig);
      messages = [
        { role: "system", content: sysPrompt },
        ...rawMessages,
      ];
    }

    // R2V prompt-generation 默认 0.6——严守规则但允许必要创意
    // 显式传入的 temperature 优先（如 follow-up 调整可以略高）
    const effectiveTemp = typeof temperature === "number"
      ? temperature
      : (r2vConfig ? 0.6 : undefined);

    // 客户端断开(关页/切走)→ 中止上游 fetch，杜绝 SSE 连接悬挂(同 lumenx/chat 8 小时不关根因)
    const ac = new AbortController();
    if (req.signal.aborted) ac.abort();
    else req.signal.addEventListener("abort", () => ac.abort());

    const upstream = await fetch(DASHSCOPE_CHAT_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        ...(typeof effectiveTemp === "number" ? { temperature: effectiveTemp } : {}),
        ...(stream ? { stream_options: { include_usage: true } } : {}),
        // 结构化输出（R2V/编排等）不需要 reasoning。开 thinking 反而让模型烧掉
        // 60s 思考预算（dev log 实测）。优先用显式 enableThinking；其次 R2V 默认关；
        // 其余用途（VL 描述等）保持模型默认。
        ...(typeof enableThinking === "boolean"
          ? { enable_thinking: enableThinking }
          : r2vConfig
            ? { enable_thinking: false }
            : {}),
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json(
        { error: `DashScope API error: ${upstream.status}`, detail: errText },
        { status: upstream.status }
      );
    }

    // ── non-streaming: return JSON directly ──
    if (!stream) {
      const t = setTimeout(() => ac.abort(), 90_000); // 非流式 90s 上限，防 body 读取悬挂
      try {
        const data = await upstream.json();
        return Response.json(data);
      } finally {
        clearTimeout(t);
      }
    }

    // ── streaming: pipe SSE through ──
    const reader = upstream.body?.getReader();
    if (!reader) {
      return Response.json(
        { error: "No response body from DashScope" },
        { status: 502 }
      );
    }

    // 空闲超时：上游 120s 无数据 → 中止(read() 永久等待是 SSE 不关的根因；120s 容得下 thinking 模型的首字耗时)。
    // 客户端断开走 ac.signal；任一触发都让 read() reject → 优雅关流。
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => ac.abort(), 120_000); };
    const disarm = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
    const responseStream = new ReadableStream({
      async pull(controller) {
        arm();
        try {
          const { done, value } = await reader.read();
          disarm();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (err) {
          disarm();
          try { controller.error(err); } catch { /* 已关闭则忽略 */ }
        }
      },
      cancel() {
        disarm();
        reader.cancel().catch(() => {});
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
