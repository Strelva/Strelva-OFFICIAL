import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import { getContent } from "@/lib/storage";
import { defaults } from "@/lib/defaults";
import { getTenantFromHeaders, isPreviewMode } from "@/lib/tenant";
import { SiteLinks, type SiteLinkItem } from "@/components/public/SiteLinks";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const hosted = await hostedPageMetadata("/links");
  if (hosted) return hosted;
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant).catch(() => defaults.settings);
  return {
    title: `Links | ${settings.siteName}`,
    description: `Quick links for ${settings.siteName}. Book a session, follow on Instagram, and more.`,
  };
}

export default async function LinksPage() {
  const hosted = await renderHostedPage("/links");
  if (hosted) return hosted;
  const tenant = await getTenantFromHeaders();
  const preview = await isPreviewMode();
  const fetchOptions = preview ? { preview: true } : undefined;
  const [settings, contact, events] = await Promise.all([
    getContent("settings", tenant, fetchOptions).catch(() => defaults.settings),
    getContent("contact", tenant, fetchOptions).catch(() => defaults.contact),
    getContent("events", tenant, fetchOptions).catch(() => defaults.events),
  ]);

  const bookingUrl = settings.bookingUrl || "";
  const instagramUrl = contact.instagramUrl || (settings.instagramHandle ? `https://instagram.com/${settings.instagramHandle}` : "");
  // Guard: a tenant with no events content (or a transient miss) must not crash
  // the page — default to an empty list.
  const eventList = Array.isArray(events?.events) ? events.events : [];
  const upcomingEvents = eventList.filter((e) => new Date(e.date) >= new Date());

  // Build links from content, then drop any with no real destination so the
  // client's page never renders a dead "Book a Session" / mailto: to nothing.
  const rawLinks: (SiteLinkItem | null)[] = [
    bookingUrl
      ? { title: "Book a session", url: bookingUrl, icon: "booking", featured: true, external: true }
      : null,
    (() => {
      const firstEvent = upcomingEvents[0];
      return firstEvent?.external_link
        ? { title: firstEvent.title, url: firstEvent.external_link, icon: "calendar", featured: false, external: true }
        : null;
    })(),
    instagramUrl
      ? { title: "Follow on Instagram", url: instagramUrl, icon: "instagram", featured: false, external: true }
      : null,
    contact.email
      ? { title: contact.email, url: `mailto:${contact.email}`, icon: "email", featured: false, external: true }
      : null,
    contact.phone
      ? { title: contact.phone, url: `tel:${contact.phone.replace(/[^+\d]/g, "")}`, icon: "phone", featured: false, external: true }
      : null,
  ];
  const links = rawLinks.filter((l): l is SiteLinkItem => l !== null);

  return (
    <>
      <PageViewTracker />
      <SiteLinks siteName={settings.siteName} tagline={settings.siteTagline} links={links} logoUrl={settings.logoUrl} />
    </>
  );
}
