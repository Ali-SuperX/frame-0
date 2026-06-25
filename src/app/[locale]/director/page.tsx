import { setRequestLocale } from "next-intl/server";
import R2VWorkspace from "@/components/studio/r2v/R2VWorkspace";

export default async function DirectorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <R2VWorkspace />;
}
