"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTransition } from "react";
import { routing } from "@/i18n/routing";

/**
 * Inline language toggle (zh ↔ en). Uses next-intl navigation so the
 * active pathname is preserved across locales (e.g. /press → /en/press).
 */
export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        opacity: 0.85,
      }}
      aria-label="Language"
    >
      {routing.locales.map((l, i) => (
        <span key={l} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && <span style={{ opacity: 0.3, margin: "0 4px" }}>·</span>}
          <button
            type="button"
            onClick={() =>
              startTransition(() => {
                router.replace(pathname, { locale: l });
              })
            }
            style={{
              background: "transparent",
              border: "none",
              color: l === locale ? "var(--accent)" : "var(--paper-mute)",
              padding: "2px 3px",
              cursor: l === locale ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: "inherit",
              letterSpacing: "inherit",
              textTransform: "inherit",
            }}
            aria-current={l === locale ? "true" : undefined}
          >
            {l === "zh" ? "中" : "EN"}
          </button>
        </span>
      ))}
    </span>
  );
}
