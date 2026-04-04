import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import Image from "next/image";
import Link from "next/link";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Links | ${settings.siteName}`,
    description: `Quick links for ${settings.siteName}. Book a session, follow on Instagram, and more.`,
  };
}

export default async function LinksPage() {
  const tenant = await getTenantFromHeaders();
  const [settings, contact, services, events] = await Promise.all([
    getContent("settings", tenant),
    getContent("contact", tenant),
    getContent("services", tenant),
    getContent("events", tenant),
  ]);

  const bookingUrl = settings.bookingUrl || "";
  const instagramUrl = contact.instagramUrl || (settings.instagramHandle ? `https://instagram.com/${settings.instagramHandle}` : "");
  const upcomingEvents = events.events.filter((e) => new Date(e.date) >= new Date());

  // Build links dynamically from content
  const links = [
    {
      title: "Book a Session",
      url: bookingUrl,
      icon: "booking" as const,
      featured: true,
      external: true,
    },
    ...(upcomingEvents.length > 0
      ? [{
          title: upcomingEvents[0].title,
          url: upcomingEvents[0].external_link || "/events",
          icon: "calendar" as const,
          featured: false,
          external: !!upcomingEvents[0].external_link,
        }]
      : []),
    {
      title: "Our Services",
      url: "/services",
      icon: "link" as const,
      featured: false,
      external: false,
    },
    {
      title: "Follow on Instagram",
      url: instagramUrl,
      icon: "instagram" as const,
      featured: false,
      external: true,
    },
    {
      title: "View Services",
      url: bookingUrl,
      icon: "shop" as const,
      featured: false,
      external: true,
    },
    {
      title: contact.email,
      url: `mailto:${contact.email}`,
      icon: "email" as const,
      featured: false,
      external: true,
    },
    ...(contact.phone
      ? [{
          title: contact.phone,
          url: `tel:${contact.phone.replace(/[^+\d]/g, "")}`,
          icon: "phone" as const,
          featured: false,
          external: true,
        }]
      : []),
  ];

  const ICONS: Record<string, React.ReactNode> = {
    booking: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    instagram: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
    email: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    phone: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
    shop: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
    calendar: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
    link: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
      </svg>
    ),
  };

  return (
    <>
      <PageViewTracker />
      <main
        className="min-h-screen flex flex-col items-center pt-16 pb-12 px-4"
        style={{ background: "linear-gradient(180deg, var(--bark) 0%, var(--sage-dark) 100%)" }}
      >
        {/* Profile */}
        <div className="text-center mb-8">
          <div
            className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden"
            style={{ background: "var(--sage)", border: "3px solid rgba(255,255,255,0.2)" }}
          >
            <span
              className="font-display text-3xl"
              style={{ color: "var(--cream)" }}
            >
              R
            </span>
          </div>
          <h1
            className="font-display text-2xl tracking-tight mb-1"
            style={{ color: "var(--cream)" }}
          >
            {settings.siteName}
          </h1>
          <p
            className="text-sm max-w-xs mx-auto"
            style={{ color: "rgba(250,249,247,0.7)" }}
          >
            {settings.siteTagline}
          </p>
        </div>

        {/* Links */}
        <div className="w-full max-w-md space-y-3">
          {links.map((link, i) => {
            const content = (
              <div
                className={`flex items-center gap-3 w-full px-5 py-4 rounded-xl text-left transition-all duration-200 ${
                  link.featured
                    ? "hover:scale-[1.02] hover:shadow-lg"
                    : "hover:scale-[1.01] hover:shadow-md"
                }`}
                style={{
                  background: link.featured ? "var(--sage)" : "rgba(255,255,255,0.1)",
                  color: link.featured ? "var(--cream)" : "var(--cream)",
                  backdropFilter: link.featured ? undefined : "blur(8px)",
                  border: link.featured ? "none" : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <span className="shrink-0" style={{ opacity: link.featured ? 1 : 0.8 }}>
                  {ICONS[link.icon]}
                </span>
                <span className={`flex-1 ${link.featured ? "font-bold text-sm tracking-widest uppercase" : "text-sm font-medium"}`}>
                  {link.title}
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: 0.5 }}
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            );

            if (link.external) {
              return (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              );
            }
            return (
              <Link key={i} href={link.url}>
                {content}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-xs font-medium tracking-widest uppercase transition-opacity hover:opacity-80"
            style={{ color: "rgba(250,249,247,0.4)" }}
          >
            {settings.siteName}
          </Link>
        </div>
      </main>
    </>
  );
}
