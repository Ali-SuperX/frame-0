import { setRequestLocale } from "next-intl/server";
import Editor from "@/components/Editor";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Editor />;
}
