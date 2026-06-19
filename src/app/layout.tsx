import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { BRAND_NAME, MARKETING_URL } from "@/lib/brand";
import { isSupabaseAuthConfigured } from "@/lib/db/server-client";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
  const shell = (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${inter.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );

  // On the Supabase auth path no Clerk client components render (sign-in/up +
  // sign-out are all swapped behind the flag), so ClerkProvider is unnecessary.
  // Keeping it only on the Clerk path means the provider drops cleanly at cutover.
  return isSupabaseAuthConfigured() ? shell : <ClerkProvider>{shell}</ClerkProvider>;
}
