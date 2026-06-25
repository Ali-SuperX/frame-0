import { setRequestLocale } from "next-intl/server";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RegisterForm zh={locale === "zh"} />;
}
