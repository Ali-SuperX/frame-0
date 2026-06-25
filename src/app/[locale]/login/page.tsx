import { setRequestLocale } from "next-intl/server";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "登录 · Frame/0",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LoginForm zh={locale === "zh"} />;
}
