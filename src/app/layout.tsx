import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import { PrivacyAwareAnalytics } from "@/components/PrivacyAwareAnalytics";
import { BRAND_NAME, MARKETING_URL } from "@/platform/infra/brand";
import "./globals.css";

const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// The workspace's interface face (October 6, 2026). Scoped by StrelvaShell's linen theme.
const dmSans = DM_Sans({
  variable: "--font-workspace",
  subsets: ["latin"],
  display: "swap",
});

// October 9, 2026: times, counts, paths and keys in the paper workspace.
const geistMono = Geist_Mono({
  variable: "--font-mono-st",
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
        className={`${geist.variable} ${dmSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <PrivacyAwareAnalytics />
      </body>
    </html>
  );
}
