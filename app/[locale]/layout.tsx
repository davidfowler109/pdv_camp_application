import "../style.css";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "../../lib/copy";

export default async function LocaleLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <html lang={locale === "es" ? "es-PA" : "en"}><body>{children}</body></html>;
}
