import { setRequestLocale } from "next-intl/server";
import Discover from "@/components/Discover";

export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Discover />;
}
