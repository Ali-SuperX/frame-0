"use client";

import type { Series } from "@/lib/store";

export type StageTab = "bible" | "script" | "board" | "cut";

const TABS: { id: StageTab; zh: string; en: string }[] = [
  { id: "bible", zh: "设定", en: "Bible" },
  { id: "script", zh: "剧本", en: "Script" },
  { id: "board", zh: "分镜", en: "Board" },
  { id: "cut", zh: "成片", en: "Cut" },
];

export default function StageProcessRail({
  activeTab,
  setActiveTab,
  series,
  setSeries,
  selectedEpId,
  setSelectedEpId,
  stats,
  isEmpty,
  onAction,
  zh,
}: {
  activeTab: StageTab;
  setActiveTab: (t: StageTab) => void;
  series: Series;
  setSeries: (patch: Partial<Series>) => void;
  selectedEpId: string;
  setSelectedEpId: (id: string) => void;
  stats: { scenes: number; shots: number; duration: number; withNarration: number; withImage: number; withVideo: number };
  isEmpty: boolean;
  onAction?: (tab: StageTab) => void;
  zh: boolean;
}) {
  const charCount = series.bible.filter((e) => e.kind === "character").length;

  function badge(tab: StageTab): string | undefined {
    if (tab === "bible") return charCount > 0 ? `${charCount}` : undefined;
    if (tab === "script") return stats.shots > 0 ? `${stats.shots}` : undefined;
    if (tab === "board") return stats.withImage > 0 ? `${stats.withImage}/${stats.withNarration || stats.shots}` : undefined;
    if (tab === "cut") return stats.withVideo > 0 ? `${stats.withVideo}` : undefined;
    return undefined;
  }

  function stepState(tab: StageTab): "done" | "active" | "pending" {
    if (tab === "bible") return charCount > 0 ? "done" : "active";
    if (tab === "script") return stats.shots > 0 ? "done" : (charCount > 0 ? "active" : "pending");
    if (tab === "board") {
      if (stats.withImage >= stats.withNarration && stats.withNarration > 0) return "done";
      return stats.shots > 0 ? "active" : "pending";
    }
    if (tab === "cut") return stats.withVideo > 0 ? "active" : "pending";
    return "pending";
  }

  return (
    <div className="sl-rail">
      <div className="sl-rail-left">
        <input
          className="sl-title"
          value={series.name}
          onChange={(e) => setSeries({ name: e.target.value })}
          placeholder={zh ? "剧名…" : "Series title…"}
        />
        {series.episodes.length > 1 && (
          <select
            className="sl-ep-select"
            value={selectedEpId}
            onChange={(e) => setSelectedEpId(e.target.value)}
          >
            {series.episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                EP{ep.num} · {ep.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="sl-rail-tabs">
        {TABS.map((t, i) => {
          const state = stepState(t.id);
          const b = badge(t.id);
          return (
            <div key={t.id} className="sl-rail-tab-wrap">
              {i > 0 && <div className="sl-rail-line" />}
              <button
                className={`sl-rail-tab${activeTab === t.id ? " on" : ""} ${state}`}
                onClick={() => {
                  if (activeTab === t.id && state === "active" && onAction) {
                    onAction(t.id);
                  } else {
                    setActiveTab(t.id);
                  }
                }}
              >
                {state === "done" && (
                  <svg className="sl-rail-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                <span className="sl-rail-tab-label">{zh ? t.zh : t.en}</span>
                {b && <span className="sl-rail-tab-badge">{b}</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div className="sl-rail-right">
        {!isEmpty && (
          <div className="sl-stats">
            <span className="sl-stat"><span className="sl-stat-val">{stats.scenes}</span>{zh ? "场" : "S"}</span>
            <span className="sl-stat"><span className="sl-stat-val">{stats.shots}</span>{zh ? "镜" : "Sh"}</span>
            <span className="sl-stat"><span className="sl-stat-val">{Math.round(stats.duration)}</span>s</span>
          </div>
        )}
      </div>
    </div>
  );
}
