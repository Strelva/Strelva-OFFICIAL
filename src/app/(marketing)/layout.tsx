import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Strelva - Done-for-you managed websites for local businesses",
  description:
    "We build your site, manage it for you, and send a weekly plain-English report. You own everything.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-root antialiased">
      <header className="fixed inset-x-0 top-0 z-50 px-5 py-4 md:px-8">
        <div className="mx-auto flex h-11 max-w-[1400px] items-center justify-between gap-6 rounded-full border border-m-rule-soft bg-m-paper px-4 shadow-[0_18px_64px_oklch(4%_0.01_255_/_0.34)]">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-normal text-m-text"
          >
            Strelva
          </Link>
          <div className="hidden md:block" />
          <nav className="flex items-center gap-4">
            <Link
              href="/access-request"
              className="inline-flex h-8 items-center justify-center rounded-full bg-m-button px-4 text-[13px] font-medium text-m-button-text transition-transform duration-300 hover:-translate-y-0.5"
            >
              Request your build
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="marketing-footer px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 py-8 md:flex-row">
          <div className="text-[13px] font-medium text-m-text">
            Strelva
          </div>
          <div className="flex gap-8 text-[13px] text-m-text-3">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <a href="mailto:jacob@strelva.com" className="hover:underline">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
