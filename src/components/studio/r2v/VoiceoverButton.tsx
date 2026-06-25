"use client";

/**
 * 行内配音按钮 —— 给定文本 + 音色 → 调 /api/bailian/tts → 拿到永久 audioUrl。
 * 同 text + voice 的组合通过 sha 缓存,不重复生成。
 *
 * 也支持上传外部 mp3 跳过 TTS(同 BGM 上传机制)。
 */

import { useRef, useState } from "react";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { estimateCharCount, estimatePrice } from "@/lib/r2v/ttsVoices";
import VoicePicker from "./VoicePicker";

export type VoiceoverState = {
  voiceoverVoiceId?: string;
  voiceoverAudioUrl?: string;
  voiceoverAudioSha?: string;
  voiceoverAudioDuration?: number;
  voiceoverManualUrl?: string;
};

type Props = {
  /** 待配音的文本(chunk.voiceover 或 cinematic.voiceoverText) */
  text: string;
  /** 当前配音状态(来自 store) */
  state: VoiceoverState;
  /** 写回 store —— patch 只包含变化的字段 */
  onChange: (patch: Partial<VoiceoverState>) => void;
  zh?: boolean;
  /** 紧凑布局 */
  compact?: boolean;
  disabled?: boolean;
};

/** sha256(text + "|" + voice) 的浏览器实现 —— 决定何时复用缓存 */
async function computeContentSha(text: string, voice: string): Promise<string> {
  const data = new TextEncoder().encode(`${text.trim()}|${voice}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VoiceoverButton({
  text,
  state,
  onChange,
  zh = true,
  compact,
  disabled,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmed = text.trim();
  const chars = estimateCharCount(trimmed);
  const price = estimatePrice(chars);
  const voiceId = state.voiceoverVoiceId;

  // 当前是否已经生成且 cache 命中 ——
  // 重新计算 contentSha 比较,变了就视为需重新生成
  const effectiveAudioUrl = state.voiceoverManualUrl || state.voiceoverAudioUrl;
  const hasAudio = !!effectiveAudioUrl;

  async function generate() {
    if (!trimmed) { setError(zh ? "请先填写文案" : "Text required"); return; }
    if (!voiceId) { setError(zh ? "请选择音色" : "Pick voice"); return; }
    setError(null);
    setGenerating(true);
    try {
      // 客户端 sha 用于幂等 ——
      // 服务端的 uploadCache 会按音频字节 sha 复用,但这里再算一遍输入 sha
      // 可以提前命中 chunk 自己的本地 cache(state.voiceoverAudioSha)
      const contentSha = await computeContentSha(trimmed, voiceId);
      if (contentSha === state.voiceoverAudioSha && state.voiceoverAudioUrl) {
        // 文本和音色都没变,直接用现有 audio
        setGenerating(false);
        return;
      }
      const res = await fetch("/api/bailian/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeysHeader() },
        body: JSON.stringify({ text: trimmed, voice: voiceId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onChange({
        voiceoverAudioUrl: j.audioUrl,
        voiceoverAudioSha: contentSha,
        voiceoverManualUrl: undefined, // TTS 生成后清掉手动上传
      });
      // 探测时长(metadata only,不下载)
      probeDuration(j.audioUrl).then((d) => d && onChange({ voiceoverAudioDuration: d }));
    } catch (e) {
      setError((e as Error)?.message || "TTS failed");
    } finally {
      setGenerating(false);
    }
  }

  function play() {
    if (!effectiveAudioUrl) return;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = effectiveAudioUrl;
    void audioRef.current.play();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      // 简单做法:把 File 转成 object URL 暂用,实际生产中应该上传到 server-side
      // 永久存储。这里复用 /api/bailian/upload 路径上传任意字节 ——
      // upload route 已经支持任意 mime,返回 /api/uploads/<sha>.<ext>。
      const fd = new FormData();
      fd.append("file", file);
      fd.append("model", "tts-manual");
      const res = await fetch("/api/bailian/upload", {
        method: "POST",
        headers: apiKeysHeader(),
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onChange({
        voiceoverManualUrl: j.localPath, // /api/uploads/<sha>.<ext>
        voiceoverAudioUrl: undefined,
        voiceoverAudioSha: undefined,
      });
      probeDuration(j.localPath).then((d) => d && onChange({ voiceoverAudioDuration: d }));
    } catch (err) {
      setError((err as Error)?.message || "upload failed");
    }
    if (e.target) e.target.value = "";
  }

  return (
    <div className={`vo-btn ${compact ? "vo-btn--compact" : ""}`}>
      <div className="vo-btn-row">
        <span className="vo-btn-label">🎙 {zh ? "配音" : "Voiceover"}</span>
        <VoicePicker
          value={voiceId}
          onChange={(id) => onChange({ voiceoverVoiceId: id })}
          disabled={disabled || generating}
          zh={zh}
          compact={compact}
        />
      </div>
      <div className="vo-btn-row">
        <button
          type="button"
          className="vo-btn-action"
          onClick={generate}
          disabled={disabled || generating || !trimmed || !voiceId}
        >
          {generating
            ? (zh ? "生成中…" : "Generating…")
            : hasAudio
              ? (zh ? "↻ 重生" : "↻ Regenerate")
              : (zh ? "▶ 生成试听" : "▶ Generate")}
        </button>
        <button
          type="button"
          className="vo-btn-action vo-btn-action--ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || generating}
          title={zh ? "上传本地 mp3 跳过 AI 生成" : "Upload local mp3"}
        >
          ⬆ {zh ? "上传 mp3" : "Upload mp3"}
        </button>
        {hasAudio ? (
          <button
            type="button"
            className="vo-btn-action vo-btn-action--ghost"
            onClick={play}
            title={zh ? "试听" : "Play"}
          >
            🔊
          </button>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={onPickFile}
          style={{ display: "none" }}
        />
      </div>
      <div className="vo-btn-status">
        {hasAudio ? (
          <span className="vo-btn-status-ok">
            ✓ {state.voiceoverManualUrl ? (zh ? "已上传" : "Uploaded") : (zh ? "已生成" : "Generated")}
            {state.voiceoverAudioDuration ? ` · ${state.voiceoverAudioDuration.toFixed(1)}s` : ""}
          </span>
        ) : trimmed ? (
          <span className="vo-btn-status-cost">
            {chars} {zh ? "字" : "chars"} · ≈ ¥{price.toFixed(4)}
          </span>
        ) : null}
        {error ? <span className="vo-btn-status-err">{error}</span> : null}
      </div>
      <style>{`
        .vo-btn {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 8px 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--line, rgba(255,255,255,0.08));
          border-radius: 8px;
        }
        .vo-btn--compact { padding: 6px 8px; gap: 4px; }
        .vo-btn-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .vo-btn-label {
          font-size: 12px;
          color: var(--paper-mute, rgba(255,255,255,0.55));
          letter-spacing: 0.02em;
          min-width: 50px;
        }
        .vo-btn-action {
          padding: 5px 12px;
          background: var(--accent, #d97757);
          color: #fff;
          border: 0;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .vo-btn-action:hover:not(:disabled) { opacity: 0.85; }
        .vo-btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
        .vo-btn-action--ghost {
          background: rgba(255,255,255,0.06);
          color: var(--paper, #e7e7ea);
          border: 1px solid var(--line, rgba(255,255,255,0.12));
        }
        .vo-btn-status {
          font-size: 11px;
          line-height: 1.4;
        }
        .vo-btn-status-ok { color: #68d391; }
        .vo-btn-status-cost { color: var(--paper-mute, rgba(255,255,255,0.5)); }
        .vo-btn-status-err { color: #fc8181; margin-left: 8px; }
      `}</style>
    </div>
  );
}

async function probeDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const a = new Audio();
    const onMeta = () => {
      const d = a.duration;
      cleanup();
      resolve(isFinite(d) ? d : undefined);
    };
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
