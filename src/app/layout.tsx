import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import { getContent } from "@/lib/storage";

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
  const settings = await getContent("settings");
  const contact = await getContent("contact");
  return {
    title: `${settings.siteName} | ${settings.siteTagline}`,
    description: settings.siteDescription,
    keywords: ["assisted stretching", "Buffalo NY", "Williamsville NY", "stretch therapy", "mobility", "wellness", "Chelsea Rohl", "Rohlax"],
    openGraph: {
      title: `${settings.siteName} | ${settings.siteTagline}`,
      description: settings.siteDescription,
      type: "website",
      locale: "en_US",
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
  const contact = await getContent("contact");
  const settings = await getContent("settings");

  // Parse hours string into structured specs (e.g. "Tue 12-6, Wed 10-4, ...")
  const dayMap: Record<string, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  };
  const hoursSpecs: Array<Record<string, string>> = [];
  if (contact.hours) {
    const parts = contact.hours.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^(\w{3})\w*\s+(\d{1,2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)/i);
      if (match) {
        const dayKey = match[1].toLowerCase();
        const day = dayMap[dayKey];
        if (day) {
          const opens = match[2].includes(":") ? match[2] : `${match[2]}:00`;
          const closes = match[3].includes(":") ? match[3] : `${match[3]}:00`;
          hoursSpecs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens, closes });
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
    url: "https://rohlaxwellness.com",
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
    geo: {
      "@type": "GeoCoordinates",
      latitude: 42.97,
      longitude: -78.70,
    },
    ...(hoursSpecs.length > 0 ? { openingHoursSpecification: hoursSpecs } : {}),
    sameAs: [
      contact.instagramUrl,
      contact.facebookUrl,
      settings.vagaroUrl,
    ].filter(Boolean),
    priceRange: "$$",
    image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&h=630&fit=crop",
    founder: {
      "@type": "Person",
      name: "Chelsea Rohl",
      jobTitle: "Physical Therapist & Stretch Therapist",
    },
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
  );
}
