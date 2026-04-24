import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REB — We build your site. The AI handles the rest.",
  description:
    "Cut out the marketing agency. We build your website by hand, then AI manages updates, blog, email, reviews, and social. $149/mo, everything included.",
  openGraph: {
    title: "REB — We build your site. The AI handles the rest.",
    description:
      "No more chasing your agency for a text change. We build it. The AI runs it. You just text back yes.",
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
        ["--m-bg" as string]: "#0e0e0e",
        ["--m-surface" as string]: "#171717",
        ["--m-raised" as string]: "#1f1f1f",
        ["--m-rule" as string]: "rgba(255,255,255,0.06)",
        ["--m-text" as string]: "#e8e8e8",
        ["--m-text-2" as string]: "#787878",
        ["--m-text-3" as string]: "#484848",
        ["--m-accent" as string]: "#5B8DEF",
        background: "#0e0e0e",
        color: "#e8e8e8",
        minHeight: "100vh",
      }}
    >
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(14,14,14,0.9)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div
          className="max-w-[1040px] mx-auto px-6 h-12 flex items-center justify-between border-b"
          style={{ borderColor: "var(--m-rule)" }}
        >
          <a
            href="/"
            className="text-[13px] font-medium tracking-[0.15em] uppercase"
            style={{ color: "var(--m-text)" }}
          >
            REB
          </a>
          <div className="flex items-center gap-6">
            <a
              href="#pricing"
              className="hidden sm:inline text-[13px]"
              style={{ color: "var(--m-text-3)" }}
            >
              Pricing
            </a>
            <a
              href="#how"
              className="hidden sm:inline text-[13px]"
              style={{ color: "var(--m-text-3)" }}
            >
              How it works
            </a>
            <a
              href="/onboard"
              className="text-[13px] font-medium px-4 py-1.5 border transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--m-text)",
                color: "var(--m-text)",
              }}
            >
              See the demo
            </a>
          </div>
        </div>
      </nav>

      <main className="pt-12">{children}</main>

      <footer className="border-t px-6" style={{ borderColor: "var(--m-rule)" }}>
        <div className="max-w-[1040px] mx-auto py-8 flex flex-col md:flex-row justify-between gap-4">
          <div className="text-[12px]" style={{ color: "var(--m-text-3)" }}>
            &copy; {new Date().getFullYear()} REB
          </div>
          <div
            className="flex gap-6 text-[12px]"
            style={{ color: "var(--m-text-3)" }}
          >
            <a href="mailto:jacob@reb.studio" className="hover:underline">
              Contact
            </a>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
