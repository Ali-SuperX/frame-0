"use client";

/**
 * AI 配音面板 —— 嵌在 NLE 编辑器左侧素材库下方。
 *
 * 用户输入文本 + 选音色 → 调 /api/bailian/tts 生成 mp3/wav →
 * 自动落到时间线选定的音频轨道(默认 A1),作为一个普通 audio clip。
 *
 * 设计:
 *  - 折叠式(默认 collapsed,展开后才占视觉空间)
 *  - 复用 VoicePicker(共用 ttsVoices.ts 清单)
 *  - 复用 estimateCharCount / estimatePrice 价格预估
 *  - 完成后 onCreated 回调把 clip 字段传出去 —— 不直接依赖 store
 */

import { useRef, useState } from "react";
import VoicePicker from "@/components/studio/r2v/VoicePicker";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { estimateCharCount, estimatePrice } from "@/lib/r2v/ttsVoices";

export type TTSClipPayload = {
  sourceUrl: string;
  sourceTitle: string;
  duration: number;
  /** 目标音频轨道 id, 例如 "a1" / "a2" */
  trackId: string;
};

type Props = {
  /** 生成成功后调用,把 clip 字段传给 Editor.addClip 落地 */
  onCreated: (clip: TTSClipPayload) => void;
  /** 时间线现有的音频轨道(用于下拉选择落到哪条) */
  audioTracks: Array<{ id: string; label: string }>;
  zh: boolean;
};

export default function TTSPanel({ onCreated, audioTracks, zh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [trackId, setTrackId] = useState<string>(audioTracks[0]?.id || "a1");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const trimmed = text.trim();
  const chars = estimateCharCount(trimmed);
  const price = estimatePrice(chars);

  async function generate() {
    if (!trimmed) { setError(zh ? "请输入文本" : "Text required"); return; }
    if (!voiceId) { setError(zh ? "请选择音色" : "Pick voice"); return; }
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/bailian/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeysHeader() },
        body: JSON.stringify({ text: trimmed, voice: voiceId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // 探测音频时长 —— 决定 clip duration
      const duration = await probeDuration(j.audioUrl);
      if (!duration || !isFinite(duration)) {
        throw new Error(zh ? "无法读取音频时长" : "Cannot read audio duration");
      }
      // 试听一下
      if (!audioPreviewRef.current) audioPreviewRef.current = new Audio();
      audioPreviewRef.current.src = j.audioUrl;
      void audioPreviewRef.current.play().catch(() => {});

      onCreated({
        sourceUrl: j.audioUrl,
        sourceTitle: trimmed.slice(0, 30) + (trimmed.length > 30 ? "…" : ""),
        duration,
        trackId,
      });
      // 生成后保留文本,允许用户改改再生成另一段(同样落到同个轨道)
    } catch (e) {
      setError((e as Error)?.message || "TTS failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="ed-tts">
      <button
        type="button"
        className="ed-tts-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>🎙 {zh ? "AI 配音" : "AI Voiceover"}</span>
        <span className="ed-tts-chev" aria-hidden>{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded ? (
        <div className="ed-tts-body">
          <textarea
            className="ed-input ed-tts-textarea"
            placeholder={
              zh
                ? "输入要朗读的文本…(限 512 tokens)"
                : "Enter text to synthesize… (max 512 tokens)"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={generating}
          />
          <div className="ed-tts-row">
            <VoicePicker
              value={voiceId}
              onChange={setVoiceId}
              disabled={generating}
              zh={zh}
              compact
            />
          </div>
          <div className="ed-tts-row">
            <label className="ed-tts-track-label">
              {zh ? "落到:" : "Track:"}
              <select
                className="ed-tts-track-select"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={generating || audioTracks.length === 0}
              >
                {audioTracks.length === 0 ? (
                  <option value="a1">A1</option>
                ) : (
                  audioTracks.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))
                )}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="ed-btn ed-tts-go"
            onClick={generate}
            disabled={generating || !trimmed || !voiceId}
          >
            {generating
              ? (zh ? "生成中…" : "Generating…")
              : (zh ? "🎬 生成并落到时间线" : "🎬 Generate + add to timeline")}
          </button>
          <div className="ed-tts-status">
            {error ? (
              <span className="ed-tts-err">{error}</span>
            ) : trimmed ? (
              <span className="ed-tts-cost">
                {chars} {zh ? "字" : "chars"} · ≈ ¥{price.toFixed(4)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <style>{`
        .ed-tts {
          display: flex;
          flex-direction: column;
          margin-top: 8px;
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--line, rgba(255,255,255,0.08));
          border-radius: 8px;
          overflow: hidden;
        }
        .ed-tts-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: transparent;
          color: var(--paper, #e7e7ea);
          border: 0;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: background 0.12s;
        }
        .ed-tts-head:hover { background: rgba(255,255,255,0.04); }
        .ed-tts-chev {
          font-size: 10px;
          color: var(--paper-mute, rgba(255,255,255,0.5));
        }
        .ed-tts-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 0 10px 10px;
        }
        .ed-tts-textarea {
          resize: vertical;
          min-height: 60px;
          font-family: inherit;
          font-size: 12px;
        }
        .ed-tts-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ed-tts-track-label {
          font-size: 11px;
          color: var(--paper-mute, rgba(255,255,255,0.55));
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ed-tts-track-select {
          background: rgba(255,255,255,0.04);
          color: var(--paper, #e7e7ea);
          border: 1px solid var(--line, rgba(255,255,255,0.12));
          border-radius: 4px;
          padding: 3px 6px;
          font: inherit;
          font-size: 11px;
        }
        .ed-tts-go {
          padding: 7px 12px;
          font-size: 12px;
        }
        .ed-tts-go:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .ed-tts-status {
          font-size: 10.5px;
          min-height: 14px;
          color: var(--paper-mute, rgba(255,255,255,0.5));
        }
        .ed-tts-err { color: #fc8181; }
        .ed-tts-cost { color: var(--paper-mute, rgba(255,255,255,0.5)); }
      `}</style>
    </div>
  );
}

async function probeDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const a = new Audio();
    const onMeta = () => { cleanup(); resolve(isFinite(a.duration) ? a.duration : undefined); };
    const onErr = () => { cleanup(); resolve(undefined); };
    const cleanup = () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("error", onErr);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("error", onErr);
    a.src = url;
  });
}
