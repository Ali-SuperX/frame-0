"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

/**
 * TopNav —— 全站统一顶部导航（单一数据源）。
 *
 * 所有页面的 `<header className="chrome">` 里都渲染它，保证：
 *  - 项集合一致（7 项，一处定义，不再各页手写漂移）
 *  - 单行不换行（继承 .chrome nav 的 white-space:nowrap）
 *  - 当前页高亮（.on 金色）但仍是 <Link>，照样可点跳转
 * 隐藏页（/stage /film 等）不传 current，显示同一套 7 项、无高亮。
 */

export type NavKey =
  | "studio"
  | "canvas"
  | "director"
  | "archive"
  | "editor"
  | "guide";

const ITEMS: { key: NavKey; path: string; zh: string; en: string }[] = [
  { key: "studio", path: "/studio", zh: "工坊", en: "Studio" },
  { key: "canvas", path: "/canvas", zh: "画布", en: "Canvas" },
  { key: "director", path: "/director", zh: "导演台", en: "Director" },
  { key: "archive", path: "/archive", zh: "资产库", en: "Assets" },
  { key: "editor", path: "/editor", zh: "剪辑", en: "Editor" },
  { key: "guide", path: "/guide", zh: "指南", en: "Guide" },
];

export default function TopNav({ current }: { current?: NavKey }) {
  const zh = useLocale() === "zh";
  return (
    <nav id="nav">
      {ITEMS.map((it) => (
        <Link
          key={it.key}
          prefetch={false}
          href={zh ? it.path : `/en${it.path}`}
          className={current === it.key ? "on" : undefined}
        >
          {zh ? it.zh : it.en}
        </Link>
      ))}
    </nav>
  );
}
