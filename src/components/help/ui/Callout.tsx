import type { ReactNode } from "react";

type Variant = "info" | "warn" | "tip" | "note";

const ICONS: Record<Variant, string> = {
  info: "ⓘ",
  warn: "⚠",
  tip: "✦",
  note: "❍",
};

const DEFAULT_TITLES: Record<Variant, string> = {
  info: "说明",
  warn: "注意",
  tip: "建议",
  note: "备注",
};

export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: Variant;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`help2-callout ${type}`}>
      <span className="help2-callout-icon" aria-hidden>{ICONS[type]}</span>
      <div className="help2-callout-body">
        <div className="help2-callout-title">{title || DEFAULT_TITLES[type]}</div>
        {children}
      </div>
    </div>
  );
}
