import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh", "en"] as const,
  defaultLocale: "zh",
  // No prefix for default locale: `/` serves zh, `/en/...` serves en.
  localePrefix: "as-needed",
  // Do NOT auto-redirect based on Accept-Language — respect the URL.
  // (User explicit toggle still persists via NEXT_LOCALE cookie.)
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
