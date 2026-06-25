"use client";

import { useEffect, useRef, useState } from "react";
import {
  useStudioStore,
  type Series,
  type StageEpisode,
  type CastBeatKind,
} from "@/lib/store";
import { aiWriteBeats } from "@/lib/stage/aiWriter";

const BEAT_PRESETS = [4, 6, 8, 12, 16];

const PROMPT_CHIPS: { icon: string; zh: string; en: string; prompt: string; promptEn: string }[] = [
  { icon: "⤴", zh: "推近", en: "Push in", prompt: "镜头缓慢推近主角面部", promptEn: "slow push-in to character face" },
  { icon: "⤵", zh: "拉远", en: "Pull out", prompt: "镜头拉远展现全景", promptEn: "pull out to reveal the landscape" },
  { icon: "⚡", zh: "切换", en: "Cut", prompt: "硬切到另一角度", promptEn: "hard cut to another angle" },
  { icon: "◎", zh: "特写", en: "CU", prompt: "特写表情变化", promptEn: "close-up on expression change" },
  { icon: "💬", zh: "对话", en: "Talk", prompt: "两人对话场景", promptEn: "two-person dialogue scene" },
  { icon: "🏃", zh: "动作", en: "Act", prompt: "快节奏动作场面", promptEn: "fast-paced action sequence" },
  { icon: "🌙", zh: "氛围", en: "Mood", prompt: "安静的环境空镜头", promptEn: "quiet establishing shot" },
  { icon: "🔍", zh: "悬疑", en: "Myst", prompt: "悬疑紧张氛围", promptEn: "mysterious tense atmosphere" },
  { icon: "😂", zh: "喜剧", en: "Fun", prompt: "轻松搞笑风格", promptEn: "lighthearted comedy style" },
  { icon: "💕", zh: "浪漫", en: "Love", prompt: "浪漫唯美情感", promptEn: "romantic emotional style" },
  { icon: "🚀", zh: "科幻", en: "SciFi", prompt: "未来科幻设定", promptEn: "futuristic sci-fi setting" },
  { icon: "🏯", zh: "古风", en: "Era", prompt: "中国古代背景", promptEn: "ancient Chinese setting" },
];

export default function StageAIComposer({
  series,
  episode,
  zh,
}: {
  series: Series;
  episode: StageEpisode;
  zh: boolean;
}) {
  const addScene = useStudioStore((s) => s.seriesAddScene);
  const addShot = useStudioStore((s) => s.seriesAddShot);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const setSeries = useStudioStore((s) => s.setSeries);

  const [premise, setPremise] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numBeats, setNumBeats] = useState(8);
  const [showChips, setShowChips] = useState(false);
  const [result, setResult] = useState<{ beats: number; synopsis?: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const kind: CastBeatKind = series.kind || "comic";

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [premise]);

  function insertChip(text: string) {
    const cur = premise.trim();
    setPremise(cur ? `${cur}，${text}` : text);
    setShowChips(false);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }

  async function handleGenerate() {
    const text = premise.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const cast = series.bible
        .filter((e) => e.kind === "character")
        .map((c) => ({ name: c.name, description: c.description }));

      const styleElements = series.bible.filter((e) => e.kind === "style");
      const styleHint = styleElements.map((s) => s.description).filter(Boolean).join("; ");

      const aiResult = await aiWriteBeats({
        premise: text,
        kind,
        numBeats,
        cast,
        styleHint: styleHint || undefined,
      });

      if (!aiResult.beats.length) {
        setError(zh ? "AI 未返回有效剧本" : "AI returned no beats");
        return;
      }

      if (aiResult.synopsis) {
        setSeries({ synopsis: aiResult.synopsis });
      }

      let sceneId = episode.scenes[episode.scenes.length - 1]?.id;
      if (!sceneId) sceneId = addScene(episode.id);

      const characters = series.bible.filter((e) => e.kind === "character");

      for (const beat of aiResult.beats) {
        const shotId = addShot(episode.id, sceneId);
        const speakerId = beat.speakerName
          ? characters.find((c) => c.name === beat.speakerName)?.id
          : undefined;

        const dialogue = speakerId
          ? [{ speakerId, line: beat.text }]
          : undefined;
        const narration = speakerId ? undefined : beat.text;

        updateShot(episode.id, sceneId, shotId, {
          shotType: beat.shotType || "still",
          narration,
          dialogue,
          imagePrompt: beat.imagePrompt,
          durationSec: beat.durationSec || 4,
        });
      }

      setResult({ beats: aiResult.beats.length, synopsis: aiResult.synopsis });
      setPremise("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const hasCharacters = series.bible.some((e) => e.kind === "character");
  const canGenerate = !busy && premise.trim().length > 0;

  return (
    <div className="sc-composer">
      <div className="sc-box">
        {/* ── 输入区域 ── */}
        <div className="sc-box-input">
          <textarea
            ref={taRef}
            className="sc-box-ta"
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder={
              zh
                ? hasCharacters
                  ? `描述故事… AI 拆分 ${numBeats} 镜（${series.bible.filter((e) => e.kind === "character").map((c) => c.name).slice(0, 2).join("、")}）`
                  : `描述故事… AI 自动拆分 ${numBeats} 个镜头`
                : hasCharacters
                  ? `Describe your story… AI splits to ${numBeats} shots (${series.bible.filter((e) => e.kind === "character").map((c) => c.name).slice(0, 2).join(", ")})`
                  : `Describe your story… AI splits to ${numBeats} shots`
            }
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            disabled={busy}
          />
          <button
            className={`sc-box-send${canGenerate ? " on" : ""}`}
            onClick={handleGenerate}
            disabled={!canGenerate}
            title="⌘↵"
          >
            {busy ? (
              <span className="sc-composer-spinner sm" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>

        {busy && (
          <div className="sc-box-progress">
            <span className="sc-composer-spinner" />
            <span>{zh ? "AI 创作中…" : "AI writing…"}</span>
          </div>
        )}

        {/* ── 内嵌工具行 ── */}
        <div className="sc-box-tools">
          <button
            className={`sc-box-pill${kind === "comic" ? " on" : ""}`}
            onClick={() => setSeries({ kind: "comic" })}
            title={zh ? "漫剧" : "Comic"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
          </button>
          <button
            className={`sc-box-pill${kind === "short" ? " on" : ""}`}
            onClick={() => setSeries({ kind: "short" })}
            title={zh ? "短剧" : "Drama"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <span className="sc-box-div" />

          {BEAT_PRESETS.map((n) => (
            <button
              key={n}
              className={`sc-box-beat${numBeats === n ? " on" : ""}`}
              onClick={() => setNumBeats(n)}
            >
              {n}
            </button>
          ))}

          <span className="sc-box-div" />

          <button
            className={`sc-box-pill${showChips ? " on" : ""}`}
            onClick={() => setShowChips((v) => !v)}
            title={zh ? "提示词" : "Chips"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
            </svg>
          </button>

          <span className="sc-box-spacer" />

          <span className="sc-box-hint">⌘↵</span>
          {hasCharacters && (
            <span className="sc-box-hint">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              {series.bible.filter((e) => e.kind === "character").length}
            </span>
          )}
        </div>

        {/* ── 提示词面板（展开） ── */}
        {showChips && (
          <div className="sc-box-chips">
            {PROMPT_CHIPS.map((c) => (
              <button
                key={c.zh}
                className="sc-box-chip"
                onClick={() => insertChip(zh ? c.prompt : c.promptEn)}
                title={zh ? c.prompt : c.promptEn}
              >
                <span className="sc-box-chip-icon">{c.icon}</span>
                {zh ? c.zh : c.en}
              </button>
            ))}
          </div>
        )}

        {/* ── Result / Error ── */}
        {result && (
          <div className="sc-box-result">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
            {zh ? `+${result.beats} 镜头` : `+${result.beats} shots`}
            <button className="sc-box-result-x" onClick={() => setResult(null)}>×</button>
          </div>
        )}
        {error && <div className="sc-box-err">{error}</div>}
      </div>
    </div>
  );
}
