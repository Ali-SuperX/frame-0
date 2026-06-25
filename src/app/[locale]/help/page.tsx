import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { HelpLayout } from "@/components/help/HelpLayout";
import { EnglishLegacyHelp } from "@/components/help/EnglishLegacyHelp";

export const metadata: Metadata = {
  title: "Help · Frame/0",
  description:
    "Frame/0 complete feature guide — AI video & image generation, multi-track editing, prompt engineering, and more.",
};

/**
 * 中文走深度文档 (22 章节 + sticky TOC + 表格/Callout/CodeBlock)；
 * 英文保留原 624 行简版，避免低质量 AI 翻译。
 */
export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (locale === "zh") {
    return <HelpLayout homeHref="/" />;
  }
  return <EnglishLegacyHelp />;
}
