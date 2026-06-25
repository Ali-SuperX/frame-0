import { setRequestLocale } from "next-intl/server";
import Stage from "@/components/Stage";

export default async function StagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Stage />;
}
