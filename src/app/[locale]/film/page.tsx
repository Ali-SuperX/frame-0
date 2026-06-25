import { setRequestLocale } from "next-intl/server";
import LumenX from "@/components/lumenx/LumenX";

/**
 * /film —— AI 片场（LumenX 短剧生产流水线）。
 * 剧本 → 美术 → 资产 → 分镜 → 视频 → 配音 → 成片，全程接百炼后端。
 */
export default async function LumenXPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LumenX />;
}
