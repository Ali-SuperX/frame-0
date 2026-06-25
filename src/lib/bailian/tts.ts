/**
 * 百炼 Qwen-TTS / CosyVoice 文本转语音 server-side client.
 *
 * 支持两种模式:
 * 1. 预置音色: qwen3-tts-flash + voice ID (Ethan / longxiaochun 等)
 * 2. 声音克隆: cosyvoice-clone-v2 + 参考音频 URL → 克隆音色合成
 *
 * 文档: https://help.aliyun.com/zh/model-studio/qwen-tts-api
 */

import { DEFAULT_TTS_MODEL, CLONE_TTS_MODEL } from "@/lib/r2v/ttsVoices";

const TTS_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

export type TTSRequest = {
  text: string;
  voice: string;
  model?: string;
  languageType?: "Auto" | "Chinese" | "English";
  /** 声音克隆: 传入参考音频 URL,将自动切换到克隆模型 */
  sampleAudioUrl?: string;
};

export type TTSResult = {
  audioUrl: string;
  audioId?: string;
  characters?: number;
};

export async function generateTTS(
  apiKey: string,
  req: TTSRequest
): Promise<TTSResult> {
  if (!apiKey) throw new Error("DashScope API key required for TTS");
  const text = req.text.trim();
  if (!text) throw new Error("text required");
  if (text.length > 512) {
    throw new Error(`text too long (${text.length}); TTS limit is 512 tokens, split into smaller chunks`);
  }

  const isClone = !!req.sampleAudioUrl;
  const model = isClone ? CLONE_TTS_MODEL : (req.model || DEFAULT_TTS_MODEL);

  const body: Record<string, unknown> = {
    model,
    input: {
      text,
      voice: isClone ? req.sampleAudioUrl : req.voice,
      language_type: req.languageType || "Auto",
    },
  };

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const respText = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(respText); } catch { /* fallthrough */ }
  if (!res.ok || parsed.code) {
    const msg = (parsed?.message as string) || respText.slice(0, 400) || `HTTP ${res.status}`;
    throw new Error(`DashScope TTS error: ${msg}`);
  }

  const output = (parsed.output ?? {}) as Record<string, unknown>;
  const audio = (output.audio ?? {}) as Record<string, unknown>;
  const url = audio.url as string | undefined;
  if (!url) {
    throw new Error(`TTS response missing audio.url: ${respText.slice(0, 200)}`);
  }
  const usage = (parsed.usage ?? {}) as Record<string, unknown>;

  return {
    audioUrl: url,
    audioId: typeof audio.id === "string" ? audio.id : undefined,
    characters: typeof usage.characters === "number" ? usage.characters : undefined,
  };
}
