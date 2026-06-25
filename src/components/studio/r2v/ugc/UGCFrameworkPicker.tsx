"use client";

/**
 * UGC Framework picker — Step 1 of the UGC mode flow.
 *
 * Picks a script structure (chunk count + per-chunk runtime). DOES NOT
 * auto-scaffold chunks anymore — chunks are only created when the user
 * clicks the "🚀 生成 N 段" CTA in Step 2 (UGCGenerateButton). This keeps
 * the flow linear: pick framework → fill brief → generate → review.
 */

import { useR2VStore } from "@/lib/r2v/projectStore";
import { UGC_FRAMEWORKS, type UgcFramework } from "@/lib/r2v/presets";

type Props = { zh: boolean };

export default function UGCFrameworkPicker({ zh }: Props) {
  const cur = useR2VStore((s) => s.current);
  const updateInput = useR2VStore((s) => s.updateInput);

  if (!cur) return null;
  const current = cur.ugcFramework;

  function pick(id: UgcFramework) {
    if (!cur) return;
    if (id === current) return;
    void updateInput({ ugcFramework: id });
  }

  return (
    <section className="r2v-ugc-section r2v-ugc-step1">
      <header className="r2v-ugc-section-head">
        <h3>
          <span className="r2v-step-num">1</span>
          {zh ? "选脚本框架" : "Pick script framework"}
        </h3>
        <span className="r2v-section-sub">
          {zh
            ? "决定段数和节奏 — 选完进入下一步"
            : "Decides chunk count + pacing — proceed to next step after picking"}
        </span>
      </header>

      <div className="r2v-fw-grid">
        {UGC_FRAMEWORKS.map((fw) => {
          const meta = zh ? fw.zh : fw.en;
          const selected = current === fw.id;
          return (
            <button
              key={fw.id}
              type="button"
              className={`r2v-fw-card ${selected ? "r2v-fw-card--on" : ""}`}
              onClick={() => pick(fw.id)}
              aria-pressed={selected}
            >
              <div className="r2v-fw-card-radio" aria-hidden>
                {selected ? <span className="r2v-fw-card-dot" /> : null}
              </div>
              <div className="r2v-fw-card-body">
                <div className="r2v-fw-card-name">{meta.name}</div>
                <div className="r2v-fw-card-sub">{meta.sub}</div>
                <div className="r2v-fw-card-structure">{meta.structure}</div>
                <div className="r2v-fw-card-meta">
                  {fw.suggestedChunks} {zh ? "段" : "chunks"} · {fw.suggestedRuntime}s/{zh ? "段" : "ea"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
