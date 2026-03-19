"use client";

import { useEffect, useState, useCallback } from "react";
import type { SiteSettings } from "@/lib/types";

const navLinks = [
  { label: "Services", href: "#services" },
  { label: "About", href: "#story" },
  { label: "Events", href: "#events" },
  { label: "Providers", href: "#providers" },
  { label: "Contact", href: "#contact" },
];

const sectionIds = ["services", "booking", "story", "testimonials", "events", "providers", "contact"];

export function Header({ settings }: { settings: SiteSettings }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  const updateActiveSection = useCallback(() => {
    const scrollY = window.scrollY + 200;
    let current = "";
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) {
        current = id;
      }
    }
    setActiveSection(current);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
      updateActiveSection();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [updateActiveSection]);

  const handleNavClick = () => setMenuOpen(false);

  const linkColor = scrolled ? "var(--bark-faded)" : "rgba(255,255,255,0.95)";
  const linkActiveColor = scrolled ? "var(--bark)" : "#fff";
  const linkHover = scrolled ? "var(--bark)" : "#fff";
  const wordmarkColor = scrolled ? "var(--bark)" : "#fff";

  const isActive = (href: string) => {
    const id = href.replace("#", "");
    return activeSection === id;
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
          scrolled ? "py-3 backdrop-blur-xl" : "py-6"
        }`}
        style={{
          background: scrolled
            ? "rgba(250, 249, 247, 0.92)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)",
          borderBottom: scrolled ? "1px solid rgba(0,0,0,0.04)" : "1px solid transparent",
        }}
      >
        <div className="container-main">
          <div className="flex items-center justify-between">
            <a
              href="/"
              className="group transition-opacity duration-300 hover:opacity-70"
            >
              <span
                className="font-display text-base sm:text-lg tracking-tight transition-colors duration-300"
                style={{ color: wordmarkColor }}
              >
                {settings.siteName}
              </span>
            </a>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-xs font-medium tracking-wider uppercase transition-colors duration-300 px-3 py-2.5"
                  style={{ color: isActive(link.href) ? linkActiveColor : linkColor }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = linkHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = isActive(link.href) ? linkActiveColor : linkColor; }}
                >
                  {link.label}
                </a>
              ))}
              <a
                href="#booking"
                className="text-xs font-semibold tracking-wider uppercase px-5 py-2.5 transition-all duration-300"
                style={{
                  background: scrolled ? "var(--sage)" : "rgba(255,255,255,0.25)",
                  color: scrolled ? "var(--pure-white)" : "#fff",
                  border: scrolled ? "1px solid transparent" : "1px solid rgba(255,255,255,0.9)",
                  backdropFilter: scrolled ? "none" : "blur(8px)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = scrolled ? "var(--sage-dark)" : "rgba(255,255,255,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = scrolled ? "var(--sage)" : "rgba(255,255,255,0.25)";
                }}
              >
                Book Now
              </a>
            </nav>

            {/* Mobile: CTA + hamburger */}
            <div className="flex md:hidden items-center gap-4">
              <a
                href="#booking"
                className="text-[0.625rem] font-semibold tracking-wider uppercase px-4 py-2 transition-all duration-300"
                style={{
                  background: scrolled ? "var(--sage)" : "rgba(255,255,255,0.2)",
                  color: "var(--pure-white)",
                  border: scrolled ? "1px solid transparent" : "1px solid rgba(255,255,255,0.7)",
                }}
                onClick={handleNavClick}
              >
                Book Now
              </a>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex flex-col justify-center items-center w-8 h-8 gap-[5px]"
                aria-label="Menu"
              >
                <span
                  className="block w-5 h-[1.5px] transition-all duration-300"
                  style={{
                    background: scrolled ? "var(--bark)" : "var(--cream)",
                    transform: menuOpen ? "rotate(45deg) translateY(3.25px)" : "none",
                  }}
                />
                <span
                  className="block w-5 h-[1.5px] transition-all duration-300"
                  style={{
                    background: scrolled ? "var(--bark)" : "var(--cream)",
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
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="font-display text-3xl tracking-tight transition-opacity hover:opacity-60 px-6 py-3"
                style={{ color: "var(--bark)" }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#booking"
              onClick={handleNavClick}
              className="mt-4 px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-all"
              style={{ background: "var(--sage)", color: "var(--pure-white)" }}
            >
              Book Now
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
