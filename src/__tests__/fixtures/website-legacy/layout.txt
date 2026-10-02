import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import { IframeScrollListener } from "@/components/public/IframeScrollListener";
import { EditModeOverlay } from "@/components/public/EditModeOverlay";
import { PreviewBanner } from "@/components/public/PreviewBanner";
import { getContent } from "@/lib/storage";
import { defaults } from "@/lib/defaults";
import { getTenantFromHeaders, isPreviewMode } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
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
    getContent("settings", tenant).catch(() => defaults.settings),
    getContent("hero", tenant).catch(() => defaults.hero),
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

// Map a tenant industry string to its schema.org @type value.
// Falls back to "LocalBusiness" for unknown or empty industries.
function industryToSchemaType(industry: string): string {
  const lower = industry.toLowerCase();
  if (lower.includes("health") || lower.includes("beauty") || lower.includes("wellness") || lower.includes("spa") || lower.includes("salon") || lower.includes("fitness")) {
    return "HealthAndBeautyBusiness";
  }
  if (lower.includes("food") || lower.includes("restaurant") || lower.includes("cafe") || lower.includes("bakery")) {
    return "FoodEstablishment";
  }
  if (lower.includes("lodging") || lower.includes("hotel") || lower.includes("motel") || lower.includes("inn")) {
    return "LodgingBusiness";
  }
  if (lower.includes("sport") || lower.includes("gym") || lower.includes("yoga") || lower.includes("pilates")) {
    return "SportsActivityLocation";
  }
  return "LocalBusiness";
}

// Structured data for the tenant's business — injected into <head> via Next.js metadata.
async function LocalBusinessSchema() {
  const tenant = await getTenantFromHeaders();
  const [contact, settings, hero, tenantConfig] = await Promise.all([
    getContent("contact", tenant).catch(() => defaults.contact),
    getContent("settings", tenant).catch(() => defaults.settings),
    getContent("hero", tenant).catch(() => defaults.hero),
    getTenantConfig(tenant).catch(() => null),
  ]);

  const dayMap: Record<string, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  };

  function parseTime(t: string): string {
    t = t.trim().toLowerCase();
    const match12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (match12) {
      let h = parseInt(match12[1]!);
      const m = match12[2] ?? "00";
      if (match12[3]!.toLowerCase() === "pm" && h < 12) h += 12;
      if (match12[3]!.toLowerCase() === "am" && h === 12) h = 0;
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
        const dayKey = match[1]!.toLowerCase();
        const day = dayMap[dayKey];
        if (day) {
          hoursSpecs.push({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: day,
            opens: parseTime(match[2]!),
            closes: parseTime(match[3]!),
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

  // Derive schema.org @type from the tenant's industry; fall back to LocalBusiness.
  const businessType = industryToSchemaType(tenantConfig?.industry ?? "");

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
      ...(stateZip ? { addressRegion: stateZip[1]!, postalCode: stateZip[2]! } : {}),
      addressCountry: "US",
    },
    ...((() => {
      const mapUrl = contact.googleMapsUrl || "";
      const coordMatch = mapUrl.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      return coordMatch
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: parseFloat(coordMatch[2]!),
              longitude: parseFloat(coordMatch[1]!),
            },
          }
        : {};
    })()),
    ...(hoursSpecs.length > 0 ? { openingHoursSpecification: hoursSpecs } : {}),
    sameAs: [
      contact.instagramUrl,
      contact.facebookUrl,
      settings.bookingUrl,
    ].filter((u): u is string => {
      if (!u) return false;
      try {
        const parsed = new URL(u);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    }),
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

  // Escape HTML-significant sequences so tenant content (siteName, description,
  // address, etc.) can't break out of the <script> tag. JSON.stringify escapes
  // quotes but NOT `<` — a value like `</script><script>…` would otherwise close
  // the JSON-LD element and execute injected script (stored XSS on every page).
  const json = JSON.stringify(schema)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/;/g, "\\u003b");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
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
    getContent("settings", tenant, fetchOptions).catch(() => defaults.settings),
    getContent("contact", tenant, fetchOptions).catch(() => defaults.contact),
    getContent("navigation", tenant, fetchOptions).catch(() => defaults.navigation),
    getContent("footer", tenant, fetchOptions).catch(() => defaults.footer),
    getContent("theme", tenant, fetchOptions).catch(() => defaults.theme),
  ]);

  const HeaderComponent = template.Header;
  const FooterComponent = template.Footer;
  const Wrapper = template.LayoutWrapper;

  const content = (
    <>
      <HeaderComponent settings={settings} navigation={navigation} />
      <main id="main-content">{children}</main>
      <FooterComponent settings={settings} contact={contact} navigation={navigation} footer={footer} />
    </>
  );

  return (
    <div style={{ ...template.themeVars, ...themeContentToCssVars(theme) } as React.CSSProperties}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
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
