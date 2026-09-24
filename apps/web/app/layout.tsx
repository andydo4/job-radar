import type { Metadata, Viewport } from "next";
import { Geist_Mono, Playfair_Display } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Primer", template: "%s · Primer" },
  description: "Biotech jobs the moment they're posted, and every grad deadline in one place.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0000f2",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // "light" / "dark" pins the theme; no cookie = follow the device (prefers-color-scheme).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      suppressHydrationWarning
      className={`${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
