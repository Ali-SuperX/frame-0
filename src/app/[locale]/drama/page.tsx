import { setRequestLocale } from "next-intl/server";
import DramaCanvas from "@/components/drama/DramaCanvas";

export default async function DramaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DramaCanvas />;
}
