import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * Standalone output —— `next build` 产出 `.next/standalone/server.js`
   * 和裁剪过的 `node_modules`，发布时只需要 standalone/ + .next/static/
   * + public/，**不带 src 源码**。对外部署安全 + 体积小。
   *
   * 部署文件树（远程 /srv/frame-0/）：
   *   standalone/server.js
   *   standalone/.next/server/…   ← 编译产物
   *   standalone/node_modules/…   ← 仅 prod deps
   *   standalone/.next/static/    ← 单独 rsync 进去（next 不自动拷）
   *   standalone/public/          ← 单独 rsync 进去
   */
  output: "standalone",

  /**
   * 排除 standalone 复制时不该带的本地累积文件：
   *   - data/ 是 ECS 上的视频/uploads，本地 dev 也会累积，不能覆盖远程
   *   - public/ 已被 next 单独 copy（standalone 模式），不重复
   */
  outputFileTracingExcludes: {
    "*": ["data/**", "data/videos/**", "data/uploads/**"],
  },

  /**
   * Disable the corner "N" dev indicator badge. It overlays the bottom-left
   * corner of the viewport and conflicts with our own UI.
   */
  devIndicators: false,

  /**
   * 让 Next.js 对这些包做 barrel-file 优化（只引入实际用到的 export），
   * 避免整包打入 client bundle。zustand 本身已 tree-shake 友好，但
   * next-intl 和 zod 的 barrel 在 dev 模式下会增加 HMR 时间。
   */
  experimental: {
    optimizePackageImports: ["next-intl", "zod", "zustand"],
  },

  /**
   * server-only Node 包不要让 Turbopack/Webpack 静态打包,直接走 Node require。
   *
   * - `ali-oss` 内部依赖 `urllib` → 动态 `require('proxy-agent')`(optional)
   *   Turbopack 走静态 import 分析会试图解析这个 optional 依赖,失败导致
   *   整个 import 链(`oss.ts` → `localVideo.ts` → `/api/videos/list`) 编译 500。
   *   把它标成 external 后 Next.js 不打包,运行时由 Node 的 require 在
   *   proxy-agent 缺失时直接抛 + ali-oss 内部 catch 跳过,行为正确。
   */
  serverExternalPackages: ["ali-oss", "pdfjs-dist", "pdf-parse"],

  /**
   * FFmpeg.wasm (used on /editor for export) requires SharedArrayBuffer,
   * which in turn requires the cross-origin isolation headers below.
   * We scope these to the editor path so other pages keep embed-friendly
   * CORS (video thumbnails from signed Bailian URLs, etc).
   */
  async headers() {
    return [
      {
        source: "/:locale(en)?/editor/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        source: "/editor/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
