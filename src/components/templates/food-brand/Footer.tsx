"use client";

import type { SiteSettings, ContactContent } from "@/lib/types";

interface FooterProps {
  settings: SiteSettings;
  contact: ContactContent;
}

export function Footer({ settings, contact }: FooterProps) {
  return (
    <footer id="footer" style={{ background: "var(--bark)", color: "var(--cream)" }}>
      <div className="container-main py-16 md:py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-8">
          {/* Brand */}
          <div>
            <p className="font-display text-lg tracking-tight mb-4 opacity-80">
              {settings.siteName}
            </p>
            <p className="text-sm leading-relaxed opacity-50 max-w-xs">
              {settings.siteDescription}
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.2em] font-bold mb-5 opacity-40">
              Navigate
            </p>
            <ul className="space-y-3 text-sm opacity-60">
              <li><a href="#products" className="hover:opacity-100 transition-opacity">Products</a></li>
              <li><a href="#comparison" className="hover:opacity-100 transition-opacity">Why Us</a></li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.2em] font-bold mb-5 opacity-40">
              Connect
            </p>
            <ul className="space-y-3 text-sm opacity-60">
              <li><a href={`mailto:${contact.email}`} className="hover:opacity-100 transition-opacity">{contact.email}</a></li>
              {contact.instagramUrl && contact.instagramUrl !== "#" && (
                <li><a href={contact.instagramUrl} className="hover:opacity-100 transition-opacity">Instagram</a></li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="container-main py-5 flex flex-wrap justify-between items-center gap-4 text-[0.625rem] tracking-wider uppercase opacity-40">
          <p>&copy; {new Date().getFullYear()} {settings.copyrightText}</p>
          <div className="flex items-center gap-4">
            <p>{settings.footerTagline}</p>
            {contact.instagramUrl && contact.instagramUrl !== "#" && (
              <a href={contact.instagramUrl} className="hover:opacity-100 transition-opacity flex items-center gap-1.5" aria-label="Instagram">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
