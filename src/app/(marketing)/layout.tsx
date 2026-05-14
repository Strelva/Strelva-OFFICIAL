import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Scaffold Web - Free sites for local businesses",
  description: "Request a free public site built around calls, bookings, and trust.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-root antialiased">
      <header className="fixed inset-x-0 top-0 z-50 px-5 py-4 md:px-8">
        <div className="mx-auto flex h-11 max-w-[1400px] items-center justify-between gap-6 rounded-full border border-[var(--m-rule-soft)] bg-[var(--m-paper)] px-4 shadow-[0_18px_64px_oklch(4%_0.01_255_/_0.34)]">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-normal text-[color:var(--m-text)]"
          >
            Scaffold Web
          </Link>
          <div className="hidden md:block" />
          <nav className="flex items-center gap-4">
            <Link
              href="/access-request"
              className="inline-flex h-8 items-center justify-center rounded-full bg-[var(--m-button)] px-4 text-[13px] font-medium text-[var(--m-button-text)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              Request free site
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="marketing-footer px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 py-8 md:flex-row">
          <div className="text-[13px] font-medium text-[color:var(--m-text)]">
            Scaffold Web
          </div>
          <div className="flex gap-8 text-[13px] text-[color:var(--m-text-3)]">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <a href="mailto:jacob@scaffoldweb.com" className="hover:underline">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
