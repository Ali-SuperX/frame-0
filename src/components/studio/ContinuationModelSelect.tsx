"use client";

import type { ModelSpec } from "@/lib/bailian/models";

type Props = {
  label: string;
  models: ModelSpec[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  hint?: string;
};

export default function ContinuationModelSelect({
  label,
  models,
  value,
  onChange,
  disabled,
  hint,
}: Props) {
  return (
    <label className="cont-studio-model-select">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || models.length === 0}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.displayName}
          </option>
        ))}
      </select>
      {hint && <em>{hint}</em>}
    </label>
  );
}
