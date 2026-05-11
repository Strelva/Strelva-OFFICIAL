import Link from "next/link";
import type { ContactContent, FooterContent, NavigationContent, SiteSettings } from "@/lib/types";

interface FooterProps {
  settings: SiteSettings;
  contact: ContactContent;
  navigation?: NavigationContent;
  footer?: FooterContent;
}

export function Footer({ settings, contact, navigation, footer }: FooterProps) {
  const navLinks = navigation?.menuItems?.length
    ? navigation.menuItems
    : [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ];
  const ctaLabel = navigation?.ctaLabel || "Book Now";
  const ctaHref = navigation?.ctaHref || settings.bookingUrl || "#";
  const tagline = footer?.tagline || settings.siteDescription;
  const copyrightText = footer?.copyrightText || settings.copyrightText;

  return (
    <footer id="footer" style={{ background: "var(--bark)", color: "var(--cream)" }}>
      <div className="container-main py-16 md:py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-8">
          {/* Brand */}
          <div>
            <p className="font-display text-lg tracking-tight mb-4 opacity-80" data-reb-field="siteName">
              {settings.siteName}
            </p>
            <p className="text-sm leading-relaxed opacity-50 max-w-xs" data-reb-field="footer.tagline">
              {tagline}
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.2em] font-bold mb-5 opacity-40">
              Navigate
            </p>
            <ul className="space-y-3 text-sm opacity-60">
              {navLinks.map((link) => (
                <li key={`${link.label}-${link.href}`}>
                  <Link href={link.href} className="hover:opacity-100 transition-opacity">{link.label}</Link>
                </li>
              ))}
              <li><a href={ctaHref} target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity">{ctaLabel}</a></li>
              {footer?.columns?.flatMap((column) => column.links).map((link) => (
                <li key={`${link.label}-${link.href}`}>
                  <Link href={link.href} className="hover:opacity-100 transition-opacity">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.2em] font-bold mb-5 opacity-40">
              Connect
            </p>
            <ul className="space-y-3 text-sm opacity-60">
              {contact.email && (
                <li><a href={`mailto:${contact.email}`} className="hover:opacity-100 transition-opacity">{contact.email}</a></li>
              )}
              {contact.phone && (
                <li><a href={`tel:${contact.phone}`} className="hover:opacity-100 transition-opacity">{contact.phone}</a></li>
              )}
              {contact.instagramUrl && contact.instagramUrl !== "#" && (
                <li><a href={contact.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity">Instagram</a></li>
              )}
              {footer?.socialLinks?.map((link) => (
                <li key={`${link.label}-${link.href}`}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="container-main py-5 flex flex-wrap justify-between items-center gap-4 text-[0.625rem] tracking-wider uppercase opacity-40">
          <p suppressHydrationWarning data-reb-field="copyrightText">&copy; {new Date().getFullYear()} {copyrightText}</p>
          <p data-reb-field="footerTagline">{settings.footerTagline}</p>
        </div>
      </div>
    </footer>
  );
}
