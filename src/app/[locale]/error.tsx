"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 路由级错误边界 —— 捕获 [locale] 下任意页面/组件的运行时错误，
 * 渲染兜底 UI 而非整页白屏。样式内联自包含，不依赖外部 CSS。
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const zh = !pathname.startsWith("/en");

  useEffect(() => {
    console.error("[frame-0] route error:", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0.19 0.012 60)",
        color: "oklch(0.92 0.015 75)",
        padding: 32,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <p
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "oklch(0.72 0.17 40)",
            margin: "0 0 16px",
          }}
        >
          {zh ? "出错了" : "Something broke"}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.35, margin: "0 0 12px" }}>
          {zh ? "页面遇到意外错误" : "This page hit an unexpected error"}
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "oklch(0.7 0.015 75)",
            margin: "0 0 24px",
          }}
        >
          {zh
            ? "可以重试当前页面；若反复失败，请刷新或返回首页。"
            : "Try again below. If it keeps failing, reload or head home."}
        </p>
        {error.digest && (
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "oklch(0.55 0.012 75)",
              margin: "0 0 24px",
            }}
          >
            digest: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
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
            {zh ? "重试" : "Try again"}
          </button>
          <a
            href={zh ? "/" : "/en"}
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid oklch(0.4 0.012 75)",
              color: "oklch(0.92 0.015 75)",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            {zh ? "返回首页" : "Home"}
          </a>
        </div>
      </div>
    </main>
  );
}
