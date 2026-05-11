import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import { IframeScrollListener } from "@/components/public/IframeScrollListener";
import { EditModeOverlay } from "@/components/public/EditModeOverlay";
import { PreviewBanner } from "@/components/public/PreviewBanner";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders, isPreviewMode } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { themeContentToCssVars } from "@/lib/design-tokens";

async function isAdminDomain(): Promise<boolean> {
  const h = await headers();
  const host = h.get("host") || "";
  return host.startsWith("admin.");
}

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
      : [],
    icons: {
      icon: "/icon.jpg",
      apple: "/apple-icon.jpg",
    },
    openGraph: {
      title: `${settings.siteName} | ${settings.siteTagline}`,
      description: settings.siteDescription,
      type: "website",
      locale: "en_US",
      images: hero.backgroundImageUrl
        ? [{ url: hero.backgroundImageUrl, width: 1200, height: 630 }]
        : [],
    },
    alternates: {
      canonical: process.env.NEXT_PUBLIC_SITE_URL,
    },
  };
}

// Structured data for the tenant's business — injected into <head> via Next.js metadata
async function LocalBusinessSchema() {
  const tenant = await getTenantFromHeaders();
  const [contact, settings, hero] = await Promise.all([
    getContent("contact", tenant),
    getContent("settings", tenant),
    getContent("hero", tenant),
  ]);

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

  const addressParts = contact.address ? contact.address.split(",").map((s: string) => s.trim()) : [];
  const streetAddress = addressParts[0] || "";
  const addressLocality = addressParts[1] || "";
  const stateZip = (addressParts[2] || "").match(/([A-Z]{2})\s*(\d{5})/);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  // Use specific business type for tenants with full contact info, generic for others
  const businessType = contact.phone && contact.address ? "HealthAndBeautyBusiness" : "LocalBusiness";

  const schema = {
    "@context": "https://schema.org",
    "@type": businessType,
    name: settings.siteName,
    description: settings.siteDescription,
    ...(siteUrl ? { url: siteUrl } : {}),
    telephone: contact.phone,
    email: contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress,
      addressLocality,
      ...(stateZip ? { addressRegion: stateZip[1], postalCode: stateZip[2] } : {}),
      addressCountry: "US",
    },
    ...((() => {
      const mapUrl = contact.googleMapsUrl || "";
      const coordMatch = mapUrl.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      return coordMatch
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: parseFloat(coordMatch[2]),
              longitude: parseFloat(coordMatch[1]),
            },
          }
        : {};
    })()),
    ...(hoursSpecs.length > 0 ? { openingHoursSpecification: hoursSpecs } : {}),
    sameAs: [
      contact.instagramUrl,
      contact.facebookUrl,
      settings.bookingUrl,
    ].filter(Boolean),
    priceRange: "$$",
    ...(hero.backgroundImageUrl ? { image: hero.backgroundImageUrl } : {}),
    ...(settings.ownerName
      ? {
          founder: {
            "@type": "Person",
            name: settings.ownerName,
            ...(settings.ownerTitle ? { jobTitle: settings.ownerTitle } : {}),
          },
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function TenantPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tenant, isPreview, isAdmin] = await Promise.all([
    getTenantFromHeaders(),
    isPreviewMode(),
    isAdminDomain(),
  ]);

  // Gate public routes: only allow access in preview mode or from tenant subdomains
  // Admin subdomain requests without preview flag should redirect to dashboard
  if (isAdmin && !isPreview) {
    redirect("/dashboard");
  }

  const template = await getTemplateForTenant(tenant);

  const fetchOptions = isPreview ? { preview: true } : undefined;
  const [settings, contact, navigation, footer, theme] = await Promise.all([
    getContent("settings", tenant, fetchOptions),
    getContent("contact", tenant, fetchOptions),
    getContent("navigation", tenant, fetchOptions),
    getContent("footer", tenant, fetchOptions),
    getContent("theme", tenant, fetchOptions),
  ]);

  const HeaderComponent = template.Header;
  const FooterComponent = template.Footer;
  const Wrapper = template.LayoutWrapper;

  const content = (
    <>
      <HeaderComponent settings={settings} navigation={navigation} />
      {children}
      <FooterComponent settings={settings} contact={contact} navigation={navigation} footer={footer} />
    </>
  );

  return (
    <div style={{ ...template.themeVars, ...themeContentToCssVars(theme) } as React.CSSProperties}>
      <SmoothScrollProvider>
        <LocalBusinessSchema />
        <IframeScrollListener />
        <EditModeOverlay />
        {isPreview && <PreviewBanner />}
        {Wrapper ? <Wrapper>{content}</Wrapper> : content}
      </SmoothScrollProvider>
    </div>
  );
}
