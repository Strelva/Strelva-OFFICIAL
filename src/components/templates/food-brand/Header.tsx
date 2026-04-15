"use client";

import { useEffect, useState, useCallback } from "react";
import { useCart } from "@/lib/cart";
import type { SiteSettings } from "@/lib/types";

const navLinks = [
  { label: "Shop", href: "#products" },
  { label: "Why Us", href: "#comparison" },
  { label: "Contact", href: "#contact" },
];

const sectionIds = ["products", "comparison", "notify", "contact"];

export function Header({ settings }: { settings: SiteSettings }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const { openCart, itemCount } = useCart();

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

  const linkColor = "var(--bark-faded)";
  const linkActiveColor = "var(--bark)";
  const linkHover = "var(--bark)";
  const wordmarkColor = "var(--bark)";

  const isActive = (href: string) => {
    const id = href.replace("#", "");
    return activeSection === id;
  };

  return (
    <>
      <header
        className={`fixed left-0 right-0 z-40 transition-all duration-500 ${
          scrolled ? "py-3 backdrop-blur-xl" : "py-5"
        }`}
        style={{
          background: scrolled
            ? "rgba(250, 248, 245, 0.92)"
            : "transparent",
          borderBottom: scrolled ? "1px solid rgba(0,0,0,0.04)" : "1px solid transparent",
          top: "0",
        }}
      >
        <div className="container-main">
          <div className="flex items-center justify-between">
            {/* Left — Nav links (desktop) */}
            <nav className="hidden md:flex items-center gap-7">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-[0.6875rem] font-medium tracking-[0.14em] uppercase transition-colors duration-300"
                  style={{ color: isActive(link.href) ? linkActiveColor : linkColor }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = linkHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = isActive(link.href) ? linkActiveColor : linkColor; }}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Center — Wordmark */}
            <a
              href="/"
              className="absolute left-1/2 -translate-x-1/2 group transition-opacity duration-300 hover:opacity-70"
            >
              <span
                className="font-display text-lg sm:text-xl tracking-tight transition-colors duration-300 whitespace-nowrap"
                style={{ color: wordmarkColor }}
              >
                {settings.siteName}
              </span>
            </a>

            {/* Right — Icons */}
            <div className="flex items-center gap-5 ml-auto">
              {/* Search (placeholder) */}
              <button
                className="hidden md:block opacity-50 hover:opacity-100 transition-opacity"
                aria-label="Search"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--bark)" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>

              {/* Account (placeholder) */}
              <button
                className="hidden md:block opacity-50 hover:opacity-100 transition-opacity"
                aria-label="Account"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--bark)" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-1a6 6 0 0112 0v1" />
                </svg>
              </button>

              {/* Cart */}
              <button
                onClick={openCart}
                className="relative opacity-70 hover:opacity-100 transition-opacity"
                aria-label="Open cart"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bark)" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 01-8 0" />
                </svg>
                {itemCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[0.5625rem] font-bold"
                    style={{ background: "var(--sage)", color: "var(--cream)" }}
                  >
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </button>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex md:hidden flex-col justify-center items-center w-8 h-8 gap-[5px]"
                aria-label="Menu"
              >
                <span
                  className="block w-5 h-[1.5px] transition-all duration-300"
                  style={{
                    background: "var(--bark)",
                    transform: menuOpen ? "rotate(45deg) translateY(3.25px)" : "none",
                  }}
                />
                <span
                  className="block w-5 h-[1.5px] transition-all duration-300"
                  style={{
                    background: "var(--bark)",
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
          style={{ background: "rgba(250,248,245,0.98)", backdropFilter: "blur(12px)" }}
        >
          <nav className="flex flex-col items-center justify-center h-full gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="font-display text-3xl tracking-tight transition-opacity hover:opacity-60"
                style={{ color: "var(--bark)" }}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={() => { handleNavClick(); openCart(); }}
              className="mt-4 px-8 py-3.5 text-xs font-bold tracking-widest uppercase transition-all"
              style={{ background: "var(--bark)", color: "var(--cream)" }}
            >
              View Cart {itemCount > 0 && `(${itemCount})`}
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
