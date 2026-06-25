"use client";

import { MODE_LABELS, type Mode, type ModelSpec } from "@/lib/bailian/models";

type Props = {
  models: ModelSpec[];
  selectedId: string;
  onSelect: (id: string) => void;
  zh: boolean;
};

/** Grouped model dropdown — mode groups, tight rows, scrolls in a short window. */
export default function ModelPicker({ models, selectedId, onSelect, zh }: Props) {
  // 按模式分组，保留 models 数组里 mode 的首次出现顺序。
  const order: Mode[] = [];
  for (const m of models) if (!order.includes(m.mode)) order.push(m.mode);

  return (
    <div className="mp-list">
      {order.map((mode) => (
        <div key={mode} className="mp-group">
          <div className="mp-group-label">
            {zh ? MODE_LABELS[mode].zh : MODE_LABELS[mode].en}
          </div>
          {models
            .filter((m) => m.mode === mode)
            .map((m) => {
              const active = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`mp-row${active ? " on" : ""}`}
                  onClick={() => onSelect(m.id)}
                  title={m.id}
                >
                  <span className="mp-row-name">{m.displayName}</span>
                  {active && <span className="mp-row-check">✓</span>}
                </button>
              );
            })}
        </div>
      ))}
      <style jsx>{`
        .mp-list {
          display: flex;
          flex-direction: column;
          max-height: 192px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--line) transparent;
        }
        .mp-list::-webkit-scrollbar {
          width: 6px;
        }
        .mp-list::-webkit-scrollbar-thumb {
          background: var(--line);
          border-radius: 3px;
        }
        .mp-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .mp-group + .mp-group {
          margin-top: 2px;
        }
        .mp-group-label {
          padding: 5px 8px 2px;
          font-family: var(--mono);
          font-size: 8.5px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .mp-row {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 2px 10px;
          background: transparent;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          font: inherit;
          color: var(--paper-dim);
          transition: background 0.12s ease, color 0.12s ease;
        }
        .mp-row:hover {
          background: var(--ink-3);
          color: var(--paper);
        }
        .mp-row.on {
          color: var(--accent);
          box-shadow: inset 2px 0 0 var(--accent);
        }
        .mp-row-name {
          flex: 1;
          min-width: 0;
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.3;
          letter-spacing: 0.03em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mp-row-check {
          flex-shrink: 0;
          font-size: 10px;
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}
