import { setRequestLocale } from "next-intl/server";
import Canvas from "@/components/Canvas";

/**
 * /canvas[/<projectId>] — 工坊的「画布形态」。每个画布(项目)有自己的 URL，
 * 切换/刷新/分享都反映在地址栏，方便定位与调试。optional catch-all：
 * /canvas 与 /canvas/<id> 都命中，无 id 时 Canvas 自规范化到当前活跃画布。
 */
export default async function CanvasPage({
  params,
}: {
  params: Promise<{ locale: string; projectId?: string[] }>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  return <Canvas initialProjectId={projectId?.[0]} />;
}
