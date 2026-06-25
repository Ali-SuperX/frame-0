import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE = "https://frame-zero.studio";

/** 站点公开页面 —— 默认语言无前缀，其余语言带 /<locale> 前缀。 */
const PAGES: {
  path: string;
  priority: number;
  freq: "weekly" | "monthly";
}[] = [
  { path: "", priority: 1, freq: "weekly" },
  { path: "/press", priority: 0.6, freq: "monthly" },
  { path: "/manifest", priority: 0.6, freq: "monthly" },
  { path: "/archive", priority: 0.5, freq: "monthly" },
  { path: "/editor", priority: 0.5, freq: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routing.locales.flatMap((locale) => {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    return PAGES.map((p) => ({
      url: `${BASE}${prefix}${p.path}`,
      lastModified: now,
      changeFrequency: p.freq,
      priority: p.priority,
    }));
  });
}
