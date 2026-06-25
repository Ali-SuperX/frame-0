import { setRequestLocale } from "next-intl/server";
import Landing from "@/components/Landing";

/**
 * Root: Frame/0 主战宣传页(Landing)。
 * 创作入口在 /studio(工坊)、/director(导演台)、/stage(片场)、/editor(剪辑)。
 */
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Landing />;
}
