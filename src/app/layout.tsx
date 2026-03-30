import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

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

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantFromHeaders();
  const [settings, hero] = await Promise.all([
    getContent("settings", tenant),
    getContent("hero", tenant),
  ]);
  return {
    title: `${settings.siteName} | ${settings.siteTagline}`,
    description: settings.siteDescription,
    keywords: settings.siteKeywords
      ? settings.siteKeywords.split(",").map((k: string) => k.trim())
      : ["assisted stretching", "Buffalo NY", "Williamsville NY", "stretch therapy", "mobility", "wellness"],
    icons: {
      icon: "/icon.svg",
      apple: "/apple-icon.svg",
    },
    openGraph: {
      title: `${settings.siteName} | ${settings.siteTagline}`,
      description: settings.siteDescription,
      type: "website",
      locale: "en_US",
      images: hero.backgroundImageUrl ? [{ url: hero.backgroundImageUrl, width: 1200, height: 630 }] : [],
    },
    other: {
      "geo.region": "US-NY",
      "geo.placename": "Williamsville",
    },
    alternates: {
      canonical: "/",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf9f7",
};

async function LocalBusinessSchema() {
  const tenant = await getTenantFromHeaders();
  const [contact, settings, hero] = await Promise.all([
    getContent("contact", tenant),
    getContent("settings", tenant),
    getContent("hero", tenant),
  ]);

  // Parse hours string into structured specs
  // Supports: "Tuesday: 12:00 PM – 6:00 PM", "Tue 12-6", "Mon 9am-5pm"
  const dayMap: Record<string, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  };

  function parseTime(t: string): string {
    t = t.trim().toLowerCase();
    const match12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (match12) {
      let h = parseInt(match12[1]);
      const m = match12[2] || "00";
      if (match12[3].toLowerCase() === "pm" && h < 12) h += 12;
      if (match12[3].toLowerCase() === "am" && h === 12) h = 0;
      return `${h.toString().padStart(2, "0")}:${m}`;
    }
    if (t.includes(":")) return t;
    return `${t.padStart(2, "0")}:00`;
  }

  const hoursSpecs: Array<Record<string, string>> = [];
  if (contact.hours) {
    const parts = contact.hours.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^(\w{3})\w*[:\s]+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
      if (match) {
        const dayKey = match[1].toLowerCase();
        const day = dayMap[dayKey];
        if (day) {
          hoursSpecs.push({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: day,
            opens: parseTime(match[2]),
            closes: parseTime(match[3]),
          });
        }
      }
    }
  }

  // Parse address string into components (fallback to full string as streetAddress)
  const addressParts = contact.address ? contact.address.split(",").map((s: string) => s.trim()) : [];
  const streetAddress = addressParts[0] || "";
  const addressLocality = addressParts[1] || "";
  const stateZip = (addressParts[2] || "").match(/([A-Z]{2})\s*(\d{5})/);

  const schema = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: settings.siteName,
    description: settings.siteDescription,
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://rohlaxwellness.com",
    telephone: contact.phone,
    email: contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress,
      addressLocality,
      addressRegion: stateZip?.[1] || "NY",
      postalCode: stateZip?.[2] || "",
      addressCountry: "US",
    },
    geo: (() => {
      // Parse coordinates from Google Maps embed URL if available
      const mapUrl = contact.googleMapsUrl || "";
      const coordMatch = mapUrl.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      return {
        "@type": "GeoCoordinates",
        latitude: coordMatch ? parseFloat(coordMatch[2]) : 42.97,
        longitude: coordMatch ? parseFloat(coordMatch[1]) : -78.70,
      };
    })(),
    ...(hoursSpecs.length > 0 ? { openingHoursSpecification: hoursSpecs } : {}),
    sameAs: [
      contact.instagramUrl,
      contact.facebookUrl,
      settings.bookingUrl,
    ].filter(Boolean),
    priceRange: "$$",
    image: hero.backgroundImageUrl || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&h=630&fit=crop",
    ...(settings.ownerName ? {
      founder: {
        "@type": "Person",
        name: settings.ownerName,
        ...(settings.ownerTitle ? { jobTitle: settings.ownerTitle } : {}),
      },
    } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <LocalBusinessSchema />
        </head>
        <body
          className={`${instrumentSerif.variable} ${inter.variable} antialiased`}
          style={{ background: "var(--cream)", color: "var(--bark)" }}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
