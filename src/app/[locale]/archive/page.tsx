import { setRequestLocale } from "next-intl/server";
import Archive from "@/components/Archive";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Archive />;
}
