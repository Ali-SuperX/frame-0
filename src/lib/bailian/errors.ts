/**
 * Translate Bailian/DashScope API error codes & messages into human-readable
 * zh/en sentences. Used by the submit handler and the running-state toast.
 */

type LocalizedMessage = { zh: string; en: string };

const CODE_MAP: Record<string, LocalizedMessage> = {
  "Workspace.AccessDenied": {
    zh: "当前 API Key 所在 workspace 未开通该模型。去百炼控制台申请开通。",
    en: "Your workspace hasn't been granted access to this model. Request access in the Bailian console.",
  },
  "InvalidApiKey": {
    zh: "API Key 无效或已过期。检查 .env.local 里的 DASHSCOPE_API_KEY。",
    en: "API key invalid or expired. Check DASHSCOPE_API_KEY in .env.local.",
  },
  "InvalidParameter": {
    zh: "参数不被模型接受。查看下面的 message，常见是 size/ratio/duration 超出范围。",
    en: "Parameter rejected by the model. See message below — usually size/ratio/duration out of range.",
  },
  "InvalidParameter.Duration": {
    zh: "时长不被该模型支持。不同模型对时长要求不同（Wan 2.7 常只支持 5s）。",
    en: "Duration not supported by this model. Each model has its own allowed values.",
  },
  "InvalidParameter.size": {
    zh: "尺寸不被该模型支持。尝试切换到 1280×720 等常见值。",
    en: "Size not supported by this model. Try a common value like 1280×720.",
  },
  "RequestTimeOut": {
    zh: "请求超时。网络或百炼后端繁忙，稍后重试。",
    en: "Request timed out. Retry in a moment.",
  },
  "Throttling": {
    zh: "请求过于频繁，触发限流。稍等几秒再提交。",
    en: "Rate limited. Wait a few seconds and retry.",
  },
  "Throttling.RateQuota": {
    zh: "达到并发配额上限。减少同时运行的任务。",
    en: "Concurrency quota reached. Run fewer tasks at once.",
  },
  "Throttling.AllocationQuota": {
    zh: "模型调用次数已用完（日/月配额）。到控制台查看配额。",
    en: "Daily/monthly quota used up. Check the console.",
  },
  "Arrearage": {
    zh: "账户欠费。请充值后重试。",
    en: "Account unpaid. Top up and retry.",
  },
  "DataInspectionFailed": {
    zh: "内容被安全检查拦截。调整 prompt 避开敏感词。",
    en: "Content flagged by safety check. Adjust prompt to avoid sensitive terms.",
  },
  "Model.NotExist": {
    zh: "模型不存在或已下线。检查 modelId。",
    en: "Model not found or deprecated. Check modelId.",
  },
};

/**
 * Try to extract a known error code from the raw error string produced by
 * `postJson()` in client.ts. Returns null if no match.
 */
function extractCode(raw: string): string | null {
  // Our postJson wraps errors as "DashScope error: {message}". The upstream
  // JSON often includes a `code` field like "Workspace.AccessDenied".
  // We try several shapes.
  for (const key of Object.keys(CODE_MAP)) {
    if (raw.includes(key)) return key;
  }
  return null;
}

/**
 * Turn a raw error string into a friendly localized message. If no known
 * code matches, we fall back to the raw text (best-effort trimmed).
 */
export function translateError(
  raw: string | undefined,
  zh: boolean
): string {
  if (!raw) return zh ? "未知错误" : "Unknown error";
  const code = extractCode(raw);
  if (code) {
    const msg = CODE_MAP[code];
    return zh ? msg.zh : msg.en;
  }
  // Trim the leading "DashScope error: " prefix if present.
  return raw.replace(/^DashScope error:\s*/, "").slice(0, 240);
}
