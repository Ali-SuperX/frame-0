import { NextResponse } from "next/server";
import { generateTTS } from "@/lib/bailian/tts";
import { readUserKeysFromRequest } from "@/lib/bailian/client";
import { hashBytes, persistUploadBytes } from "@/lib/bailian/uploadCache";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/bailian/tts
 *  body: { text, voice, model?, languageType?, sampleAudioUrl? }
 *  sampleAudioUrl: 声音克隆模式 — 传入参考音频 URL */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";
    const voice = typeof body?.voice === "string" ? body.voice : "";
    const sampleAudioUrl = typeof body?.sampleAudioUrl === "string" ? body.sampleAudioUrl : undefined;

    if (!text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    if (!voice && !sampleAudioUrl) {
      return NextResponse.json({ error: "voice or sampleAudioUrl required" }, { status: 400 });
    }

    const userKeys = readUserKeysFromRequest(req);
    const apiKey = userKeys?.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "DASHSCOPE_API_KEY 未配置" },
        { status: 401 }
      );
    }

    const tts = await generateTTS(apiKey, {
      text,
      voice,
      model: typeof body.model === "string" ? body.model : undefined,
      languageType: body.languageType,
      sampleAudioUrl,
    });

    const audioRes = await fetch(tts.audioUrl);
    if (!audioRes.ok) {
      return NextResponse.json(
        { error: `下载 TTS 音频失败: HTTP ${audioRes.status}` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const sha = hashBytes(buf);
    const ct = audioRes.headers.get("content-type") || "audio/mpeg";
    const ext = ct.includes("wav") ? "wav" : ct.includes("ogg") ? "ogg" : "mp3";
    const { ext: persistedExt } = await persistUploadBytes(buf, sha, `tts.${ext}`);

    return NextResponse.json({
      audioUrl: `/api/uploads/${sha}.${persistedExt}`,
      sha,
      size: buf.length,
      characters: tts.characters,
      audioId: tts.audioId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
