"use client";

/**
 * 音色下拉(共享) —— 投流广告场景常用 7 个音色。
 *
 * 默认 placeholder "选择音色" —— 强迫用户首次主动选择,避免所有项目都用同一个
 * 默认音色导致投流广告"千篇一律"。
 */

import { listVoices, getVoice, type TTSVoice } from "@/lib/r2v/ttsVoices";

type Props = {
  /** 当前选中的 voice id;undefined 表示尚未选择 */
  value: string | undefined;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
  zh?: boolean;
  /** 紧凑模式(用于行内场景,字号 / 间距更小) */
  compact?: boolean;
};

export default function VoicePicker({ value, onChange, disabled, zh = true, compact }: Props) {
  const voices = listVoices();
  const selected = value ? getVoice(value) : undefined;

  return (
    <label className={`voice-picker ${compact ? "voice-picker--compact" : ""}`}>
      <select
        className="voice-picker-select"
        value={value || ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        disabled={disabled}
        aria-label={zh ? "选择音色" : "Pick voice"}
      >
        <option value="" disabled>
          {zh ? "音色…" : "Voice…"}
        </option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {labelFor(v, zh)}
          </option>
        ))}
      </select>
      {selected ? (
        <span className="voice-picker-hint" title={selected.bestFor}>
          {compact ? null : <>· {selected.desc}</>}
        </span>
      ) : null}
      <style>{`
        .voice-picker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .voice-picker--compact { font-size: 12px; gap: 6px; }
        .voice-picker-select {
          background: rgba(255,255,255,0.04);
          color: var(--paper, #e7e7ea);
          border: 1px solid var(--line, rgba(255,255,255,0.12));
          border-radius: 6px;
          padding: 5px 8px;
          font: inherit;
          cursor: pointer;
        }
        .voice-picker-select:disabled { opacity: 0.5; cursor: not-allowed; }
        .voice-picker-select:hover:not(:disabled) {
          border-color: var(--accent, rgba(255,200,160,0.5));
        }
        .voice-picker-hint {
          color: var(--paper-mute, rgba(255,255,255,0.5));
          font-size: 11px;
        }
      `}</style>
    </label>
  );
}

function labelFor(v: TTSVoice, zh: boolean): string {
  const gender = v.gender === "male" ? (zh ? "男" : "M") : (zh ? "女" : "F");
  return zh
    ? `${v.zh}(${gender}·${v.id})`
    : `${v.id} (${gender})`;
}
