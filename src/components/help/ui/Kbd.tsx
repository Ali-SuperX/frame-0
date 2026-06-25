import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="help2-kbd">{children}</kbd>;
}

export function KbdRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="help2-kbd-row">
      <Kbd>{keys}</Kbd>
      <span>{label}</span>
    </div>
  );
}

export function KbdGrid({ items }: { items: { keys: string; label: string }[] }) {
  return (
    <div className="help2-kbd-grid">
      {items.map((it, i) => <KbdRow key={i} keys={it.keys} label={it.label} />)}
    </div>
  );
}
