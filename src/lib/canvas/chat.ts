/**
 * Canvas 对话 —— 画布「对话节点」的流式聊天 + 上下文收集。
 *
 * streamChat：走 /api/bailian/chat 的 SSE，逐 token 回调累计全文（与
 * directorExpand 同一套解析）。
 * collectChatMessages：从画布血缘（连线）收集上下文 —— 祖先里的
 * chat/answer 构成对话线程，note/character/scene/成片节点折叠成 system
 * 背景块，让"输出可以再次作为上下文"。
 */
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { isImageMode } from "@/lib/bailian/models";
import type { CanvasNode, CanvasEdge } from "@/lib/canvasStore";
import type { Job } from "@/lib/store";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

/** 画布对话默认模型（DashScope OpenAI 兼容端点） */
export const CANVAS_CHAT_MODEL = "qwen3.6-plus";

export async function streamChat(
  messages: ChatMsg[],
  opts: { onToken: (full: string) => void; signal?: AbortSignal; model?: string }
): Promise<string> {
  const res = await fetch("/api/bailian/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeysHeader() },
    body: JSON.stringify({
      stream: true,
      model: opts.model ?? CANVAS_CHAT_MODEL,
      messages,
      enableThinking: false,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${res.status} ${err.slice(0, 120)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          opts.onToken(full);
        }
      } catch {
        // keepalive / 非 JSON 行
      }
    }
  }
  return full.trim();
}

/** 祖先收集（BFS 向上游走连线，限深限量，防环）。返回 id → 距离。 */
function collectAncestors(
  startId: string,
  edges: CanvasEdge[],
  maxDepth = 8,
  maxCount = 24
): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier = [startId];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        if (e.target !== id || dist.has(e.source) || e.source === startId) continue;
        dist.set(e.source, d);
        next.push(e.source);
        if (dist.size >= maxCount) return dist;
      }
    }
    frontier = next;
  }
  return dist;
}

/** 一个节点折叠成一行背景描述（非对话线程的上下文用）。 */
function nodeContextLine(n: CanvasNode, jobs: Job[], zh: boolean): string | null {
  const kind = n.kind ?? "generate";
  const title = n.title?.trim();
  if (kind === "note") {
    const body = n.text?.trim();
    if (!body && !title) return null;
    return `${zh ? "创意笔记" : "Note"}「${title || ""}」：${body || ""}`;
  }
  if (kind === "character" || kind === "scene") {
    const label = kind === "character" ? (zh ? "角色" : "Character") : (zh ? "场景" : "Scene");
    return `${label}「${title || "?"}」：${n.draft.prompt || n.text || ""}`;
  }
  if (kind === "generate") {
    const job = n.jobId ? jobs.find((j) => j.id === n.jobId) : undefined;
    const done = job?.status === "done";
    const media = done ? (isImageMode(job!.mode) ? (zh ? "图片" : "image") : (zh ? "视频" : "video")) : null;
    const prompt = (n.draft.prompt || "").slice(0, 200);
    if (!prompt && !media) return null;
    return media
      ? `${zh ? "已生成" : "Generated"}${media}「${title || job?.title || ""}」${prompt ? `（prompt: ${prompt}）` : ""}`
      : `${zh ? "生成草稿" : "Draft"}：${prompt}`;
  }
  return null;
}

/**
 * 组装对话 messages：
 *  - 祖先里的 chat/answer 按距离从远到近构成线程（user/assistant 交替）
 *  - 其余祖先折叠成一段 system 背景
 *  - 最后追加当前问题
 */
export function collectChatMessages(
  node: CanvasNode,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  jobs: Job[],
  zh: boolean
): ChatMsg[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dist = collectAncestors(node.id, edges);
  const ancestors = [...dist.entries()]
    .map(([id, d]) => ({ n: byId.get(id), d }))
    .filter((x): x is { n: CanvasNode; d: number } => !!x.n)
    .sort((a, b) => b.d - a.d); // 最远的在前 → 时间顺序

  const thread: ChatMsg[] = [];
  const contextLines: string[] = [];
  for (const { n } of ancestors) {
    const kind = n.kind ?? "generate";
    if (kind === "chat") {
      const q = n.draft.prompt.trim();
      if (q) thread.push({ role: "user", content: q });
    } else if (kind === "answer") {
      const a = (n.text || "").trim();
      if (a) thread.push({ role: "assistant", content: a.slice(0, 4000) });
    } else {
      const line = nodeContextLine(n, jobs, zh);
      if (line) contextLines.push(line);
    }
  }

  const sysBase = zh
    ? "你是 Frame/0 画布上的创作伙伴，擅长影视创意、剧本、分镜与画面描述。回答简洁有干货，中文作答，不要客套。"
    : "You are a creative partner on the Frame/0 canvas, expert in film ideas, scripts, storyboards and visual prompts. Be concise and substantive.";
  const sys = contextLines.length
    ? `${sysBase}\n\n${zh ? "画布上下文（用户连线引用的内容）：" : "Canvas context (linked by user):"}\n- ${contextLines.join("\n- ")}`
    : sysBase;

  return [
    { role: "system", content: sys },
    ...thread,
    { role: "user", content: node.draft.prompt.trim() },
  ];
}
