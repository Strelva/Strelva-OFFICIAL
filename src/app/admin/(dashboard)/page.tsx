"use client";

const SECTIONS = [
  { name: "Hero", href: "/admin/hero", description: "Headline, background image, call-to-action" },
  { name: "Services", href: "/admin/services", description: "Session types, pricing, booking links" },
  { name: "Story", href: "/admin/story", description: "Chelsea's bio, credentials, stats" },
  { name: "Testimonials", href: "/admin/testimonials", description: "Client quotes and reviews" },
  { name: "Events", href: "/admin/events", description: "Upcoming events and workshops" },
  { name: "Providers", href: "/admin/providers", description: "Recommended wellness providers" },
  { name: "Contact", href: "/admin/contact", description: "Email, phone, hours, location" },
  { name: "Settings", href: "/admin/settings", description: "Site name, SEO, Vagaro URL" },
];

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="font-display text-2xl mb-2" style={{ color: "var(--bark)" }}>Dashboard</h1>
      <p className="text-sm mb-8" style={{ color: "var(--bark-faded)" }}>Manage your site content</p>

      <div
        className="flex items-center gap-6 mb-8 p-4 rounded-xl"
        style={{ background: "var(--pure-white)", border: "1px solid var(--cream-dark)" }}
      >
        <div>
          <p className="text-2xl font-display" style={{ color: "var(--sage)" }}>8</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--bark-faded)" }}>Sections</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {SECTIONS.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="block p-6 rounded-xl transition-all"
            style={{
              background: "var(--pure-white)",
              border: "1px solid var(--cream-dark)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--sage)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--cream-dark)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <h2 className="text-lg font-medium" style={{ color: "var(--bark)" }}>{section.name}</h2>
            <p className="text-sm mt-1" style={{ color: "var(--bark-faded)" }}>{section.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
