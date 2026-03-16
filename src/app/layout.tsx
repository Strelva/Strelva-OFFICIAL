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

function LocalBusinessSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: "Rohlax Wellness",
    description: "Professional assisted stretching in Williamsville, NY. Personalized 1-on-1 sessions to relieve tension, improve mobility, and support your well-being.",
    url: "https://rohlaxwellness.com",
    telephone: "+17165592282",
    email: "rohlaxwellness@gmail.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "7158 Transit Road",
      addressLocality: "Williamsville",
      addressRegion: "NY",
      postalCode: "14221",
      addressCountry: "US",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 42.97,
      longitude: -78.70,
    },
    openingHoursSpecification: [
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Tuesday", opens: "12:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Wednesday", opens: "10:00", closes: "16:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Thursday", opens: "12:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "10:00", closes: "16:00" },
    ],
    sameAs: [
      "https://instagram.com/rohlaxwellness",
      "https://facebook.com/rohlaxwellness",
      "https://www.vagaro.com/rohlaxwellness",
      "https://linktr.ee/rohlaxwellness",
    ],
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
