import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REB Studio — Your site works while you sleep",
  description:
    "Custom websites powered by AI. Your clients get a beautiful site + an AI assistant that handles everything. $3,000 build + $199/mo.",
  openGraph: {
    title: "REB Studio — Your site works while you sleep",
    description:
      "Custom websites powered by AI. Beautiful site + AI assistant that handles everything.",
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
    <>
      {/* Marketing nav */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/80 border-b border-cream-dark/40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a
            href="/"
            className="text-xl font-semibold tracking-tight"
            style={{ color: "var(--bark)" }}
          >
            REB
          </a>
          <a
            href="#pricing"
            className="inline-flex items-center px-5 py-2 rounded-full text-sm font-medium transition-colors"
            style={{
              background: "var(--sage)",
              color: "var(--pure-white)",
            }}
          >
            Get Started
          </a>
        </div>
      </header>

      <main className="pt-16">{children}</main>

      {/* Marketing footer */}
      <footer
        className="border-t py-12 px-6"
        style={{
          borderColor: "var(--cream-dark)",
          background: "var(--pure-white)",
        }}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p
            className="text-sm"
            style={{ color: "var(--bark-faded)" }}
          >
            &copy; {new Date().getFullYear()} REB Studio. Built in Buffalo, NY.
          </p>
          <a
            href="mailto:laney@buffaloprojects.com"
            className="text-sm hover:underline"
            style={{ color: "var(--sage-dark)" }}
          >
            laney@buffaloprojects.com
          </a>
        </div>
      </footer>
    </>
  );
}
