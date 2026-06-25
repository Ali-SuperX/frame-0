import { setRequestLocale } from "next-intl/server";
import Studio from "@/components/Studio";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ locale: string; jobId?: string[] }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  return <Studio initialJobId={jobId?.[0]} />;
}
