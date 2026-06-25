import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono, Geist } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { DialogHost } from "@/components/ui/Dialog";
import { AuthProvider } from "@/components/AuthProvider";
import GlobalFooter from "@/components/GlobalFooter";
import Fingerprint from "@/components/Fingerprint";
import "../globals.css";

// 字体集精简：每多一个字重就多一个 woff2 文件 + 多一次并发下载占位。
// dev 模式 HTTP/1.1 6 并发上限下，超出的字体会排队，直接拖累 LCP。
// 实际 var(--font-mono / --font-sans) 仅 400/500/600 高频用到，其余字重
// 由浏览器从最近字重 fake，肉眼几乎无差。
const serif = Instrument_Serif({
  variable: "--f-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
  variable: "--f-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const sans = Geist({
  variable: "--f-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL("https://frame-zero.studio"),
    generator: "FRAME/0 · openFrame",
    other: {
      "x-source-code": "https://github.com/ali-lanke/frame-0",
      "x-license": "AGPL-3.0-only",
    },
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
    },
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: {
        "zh-CN": "/",
        en: "/en",
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // suppressHydrationWarning is on <html> because browser extensions
    // (Dark Reader, color-scheme shims, etc.) mutate `data-theme` / `style`
    // on the html element before React hydrates, producing SSR/client diff
    // warnings that we can't fix from our side.
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      className={`${serif.variable} ${mono.variable} ${sans.variable} h-full antialiased`}
      data-accent="terracotta"
      data-paper="warm"
      suppressHydrationWarning
    >
      <body data-grain="on" suppressHydrationWarning>
        <NextIntlClientProvider>
          <AuthProvider>
            <Fingerprint />
            {children}
            <DialogHost />
            <GlobalFooter />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
