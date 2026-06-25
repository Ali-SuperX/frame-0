import { setRequestLocale } from "next-intl/server";
import Manifest from "@/components/Manifest";

/**
 * Marketing / manifest page.
 * Previously lived at `/`; moved here so the video-generation Studio can
 * take the root slot as the product's true home.
 */
export default async function ManifestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Manifest />;
}
