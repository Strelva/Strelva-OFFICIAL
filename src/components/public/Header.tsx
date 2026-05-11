"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { NavigationContent, SiteSettings } from "@/lib/types";

const navLinks = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function Header({
  settings,
  navigation,
}: {
  settings: SiteSettings;
  navigation?: NavigationContent;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // On inner pages, always use scrolled (light bg) style
  const useTransparent = isHome && !scrolled;

  const linkColor = useTransparent ? "rgba(255,255,255,0.95)" : "var(--bark-faded)";
  const linkActiveColor = useTransparent ? "#fff" : "var(--bark)";
  const linkHover = useTransparent ? "#fff" : "var(--bark)";
  const wordmarkColor = useTransparent ? "#fff" : "var(--bark)";

  const configuredLinks = navigation?.menuItems?.length ? navigation.menuItems : navLinks;
  const ctaLabel = navigation?.ctaLabel || "Book Now";
  const ctaHref = navigation?.ctaHref || settings.bookingUrl || "#";
  const isActive = (href: string) => pathname === href;

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
          useTransparent ? "py-6" : "py-3 backdrop-blur-xl"
        }`}
        style={{
          background: useTransparent
            ? "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)"
            : "rgba(250, 249, 247, 0.92)",
          borderBottom: useTransparent ? "1px solid transparent" : "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <div className="container-main">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="group transition-opacity duration-300 hover:opacity-70"
            >
              <span
                className="font-display text-base sm:text-lg tracking-tight transition-colors duration-300"
                style={{ color: wordmarkColor }}
              >
                {settings.siteName}
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-8">
              {configuredLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs font-medium tracking-wider uppercase transition-colors duration-300 px-3 py-3"
                  style={{ color: isActive(link.href) ? linkActiveColor : linkColor }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = linkHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = isActive(link.href) ? linkActiveColor : linkColor; }}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href={ctaHref} target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold tracking-wider uppercase px-5 py-2.5 transition-all duration-300"
                style={{
                  background: useTransparent ? "rgba(255,255,255,0.25)" : "var(--sage)",
                  color: useTransparent ? "#fff" : "var(--pure-white)",
                  border: useTransparent ? "1px solid rgba(255,255,255,0.9)" : "1px solid transparent",
                  backdropFilter: useTransparent ? "blur(8px)" : "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = useTransparent ? "rgba(255,255,255,0.4)" : "var(--sage-dark)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = useTransparent ? "rgba(255,255,255,0.25)" : "var(--sage)";
                }}
              >
                {ctaLabel}
              </Link>
            </nav>

            {/* Mobile: CTA + hamburger */}
            <div className="flex md:hidden items-center gap-4">
              <Link
                href={ctaHref} target="_blank" rel="noopener noreferrer"
                className="text-[0.625rem] font-semibold tracking-wider uppercase px-4 py-2 transition-all duration-300"
                style={{
                  background: useTransparent ? "rgba(255,255,255,0.2)" : "var(--sage)",
                  color: "var(--pure-white)",
                  border: useTransparent ? "1px solid rgba(255,255,255,0.7)" : "1px solid transparent",
                }}
              >
                {ctaLabel}
              </Link>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex flex-col justify-center items-center w-8 h-8 gap-[5px]"
                aria-label="Menu"
                aria-expanded={menuOpen}
              >
                <span
                  className="block w-5 h-[1.5px] transition-all duration-300"
                  style={{
                    background: useTransparent ? "var(--cream)" : "var(--bark)",
                    transform: menuOpen ? "rotate(45deg) translateY(3.25px)" : "none",
                  }}
                />
                <span
                  className="block w-5 h-[1.5px] transition-all duration-300"
                  style={{
                    background: useTransparent ? "var(--cream)" : "var(--bark)",
                    transform: menuOpen ? "rotate(-45deg) translateY(-3.25px)" : "none",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[39] md:hidden"
          style={{ background: "rgba(250,249,247,0.98)", backdropFilter: "blur(12px)" }}
        >
          <nav className="flex flex-col items-center justify-center h-full gap-8">
            {configuredLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="font-display text-3xl tracking-tight transition-opacity hover:opacity-60 px-6 py-3"
                style={{
                  color: isActive(link.href) ? "var(--sage)" : "var(--bark)",
                }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={ctaHref} target="_blank" rel="noopener noreferrer"
              onClick={closeMenu}
              className="mt-4 px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-all"
              style={{ background: "var(--sage)", color: "var(--pure-white)" }}
            >
              {ctaLabel}
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
