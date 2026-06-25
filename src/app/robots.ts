import type { MetadataRoute } from "next";

const BASE = "https://frame-zero.studio";

/** /robots.txt —— 允许抓取公开页面，屏蔽 API 路由。 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
