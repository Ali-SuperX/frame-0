"use client";

import { useEffect } from "react";

/**
 * 全局错误边界 —— 仅在 root layout 自身崩溃时触发（极少见）。
 * 必须自带 <html>/<body>，因为它替换整个文档。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[frame-0] global error:", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "oklch(0.19 0.012 60)",
          color: "oklch(0.92 0.015 75)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 12px" }}>
            应用出错了 · Application error
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "oklch(0.7 0.015 75)",
              margin: "0 0 24px",
            }}
          >
            发生了无法恢复的错误，请重试或刷新页面。
            <br />
            An unrecoverable error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              border: "none",
              background: "oklch(0.72 0.17 40)",
              color: "oklch(0.19 0.012 60)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            重试 / Try again
          </button>
        </div>
      </body>
    </html>
  );
}
