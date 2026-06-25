"use client";

import type { ParamField as PF } from "@/lib/bailian/models";

/** Render a single non-media param field. Called by ParamForm. */
export function ParamFieldInput({
  field,
  value,
  onChange,
}: {
  field: PF;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.kind === "text") {
    // Char counter for prompt / negative_prompt textareas.
    const isPromptish =
      field.key === "prompt" || field.key === "negative_prompt";
    const len = ((value as string) ?? "").length;
    return field.multiline ? (
      <div className="pf-text-wrap">
        <textarea
          className="pf-input"
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          rows={field.key === "prompt" ? 4 : 2}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
        />
        {isPromptish && (
          <div className="pf-counter">
            <span className={len > 800 ? "warn" : ""}>{len}</span>
            <span className="pf-counter-sep"> · </span>
            <span className="pf-counter-hint">
              {field.key === "prompt"
                ? "prompt"
                : "negative"}
            </span>
          </div>
        )}
      </div>
    ) : (
      <input
        className="pf-input"
        type="text"
        value={(value as string) ?? ""}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.kind === "enum") {
    return (
      <div className="pf-segments">
        {field.options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`pf-seg${value === o.value ? " on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.kind === "int") {
    const numVal = typeof value === "number" ? value : undefined;
    const isSeed = field.key === "seed";
    // Slider variant — when min/max defined and they differ.
    if (field.min !== undefined && field.max !== undefined && field.min !== field.max) {
      return (
        <div className="pf-int">
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={numVal ?? field.min}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="pf-int-val">
            {numVal ?? "—"}
            {field.unit ?? ""}
          </span>
        </div>
      );
    }
    // Locked single-value (min === max).
    if (field.min !== undefined && field.min === field.max) {
      return (
        <div className="pf-int locked">
          <span className="pf-int-val">
            {field.min}
            {field.unit ?? ""}
          </span>
          <span className="pf-locked-hint">fixed</span>
        </div>
      );
    }
    // Free-form numeric input (e.g. seed).
    return (
      <div className="pf-int">
        <input
          type="number"
          className="pf-input"
          value={numVal ?? ""}
          placeholder={isSeed ? "random" : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
        {isSeed && (
          <button
            type="button"
            className="pf-dice"
            onClick={() => {
              // Use a bounded int so it's easy to read/re-enter.
              const r = Math.floor(Math.random() * 1_000_000);
              onChange(r);
            }}
            title="Randomize seed"
            aria-label="Randomize seed"
          >
            🎲
          </button>
        )}
      </div>
    );
  }

  if (field.kind === "bool") {
    const checked = Boolean(value);
    return (
      <button
        type="button"
        className={`pf-toggle${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className="pf-toggle-knob" />
        <span className="pf-toggle-label">{checked ? "on" : "off"}</span>
      </button>
    );
  }

  return null;
}
