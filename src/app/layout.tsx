import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { PrivacyAwareAnalytics } from "@/components/PrivacyAwareAnalytics";
import { BRAND_NAME, MARKETING_URL } from "@/lib/brand";
import "./globals.css";

const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f7",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : MARKETING_URL)
  ),
  applicationName: BRAND_NAME,
  title: {
    default: BRAND_NAME,
    template: `%s | ${BRAND_NAME}`,
  },
  description: "AI website management, reporting, and content operations for small businesses.",
  category: "technology",
  openGraph: {
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth is Supabase; no Clerk client components render, so no ClerkProvider.
  return (
    <html lang="en">
      <body
        className={`${geist.variable} antialiased`}
      >
        {children}
        <PrivacyAwareAnalytics />
      </body>
    </html>
  );
}
