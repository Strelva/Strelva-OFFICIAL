import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REB — Your site works while you sleep",
  description:
    "Describe your business. Get a live website in 5 minutes. Update it by chatting with AI.",
  openGraph: {
    title: "REB — Your site works while you sleep",
    description: "AI builds and manages your website. You text what you need. It happens.",
    type: "website",
    locale: "en_US",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="marketing-root antialiased"
      style={{
        ["--m-bg" as string]: "#08080a",
        ["--m-surface" as string]: "#0f0f12",
        ["--m-rule" as string]: "#1c1c20",
        ["--m-rule-light" as string]: "#26262b",
        ["--m-text" as string]: "#e8e8ec",
        ["--m-text-2" as string]: "#8e8e96",
        ["--m-text-3" as string]: "#55555c",
        ["--m-accent" as string]: "#d4a052",
        ["--m-accent-muted" as string]: "rgba(212, 160, 82, 0.12)",
        background: "#08080a",
        color: "#e8e8ec",
        minHeight: "100vh",
      }}
    >
      {/* Minimal nav — editorial, not SaaS */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(8,8,10,0.9)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <div className="max-w-[1120px] mx-auto px-6 h-12 flex items-center justify-between border-b" style={{ borderColor: "var(--m-rule)" }}>
          <a href="/" className="text-[13px] font-medium tracking-[0.15em] uppercase" style={{ color: "var(--m-text)" }}>
            REB
          </a>
          <div className="flex items-center gap-5">
            <a href="#pricing" className="hidden sm:inline text-[12px]" style={{ color: "var(--m-text-3)" }}>Pricing</a>
            <a
              href="/onboard"
              className="text-[12px] font-medium px-3.5 py-1 transition-colors"
              style={{ color: "var(--m-accent)" }}
            >
              Get your site &rarr;
            </a>
          </div>
        </div>
      </nav>

      <main className="pt-12">{children}</main>

      <footer className="border-t px-6" style={{ borderColor: "var(--m-rule)" }}>
        <div className="max-w-[1120px] mx-auto py-10 flex flex-col md:flex-row justify-between gap-4">
          <div className="text-[12px]" style={{ color: "var(--m-text-3)" }}>
            &copy; {new Date().getFullYear()} REB Studio &middot; Buffalo, NY
          </div>
          <div className="flex gap-5 text-[12px]" style={{ color: "var(--m-text-3)" }}>
            <a href="mailto:jacob@reb.studio" className="hover:underline">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
