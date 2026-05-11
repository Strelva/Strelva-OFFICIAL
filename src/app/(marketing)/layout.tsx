import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Scaffold Web — AI website management for small business",
  description: "See what is working. Tell the AI what to change.",
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
        ["--m-bg" as string]: "#030508",
        ["--m-surface" as string]: "rgba(255,255,255,0.035)",
        ["--m-raised" as string]: "rgba(255,255,255,0.055)",
        ["--m-rule" as string]: "rgba(238,245,255,0.16)",
        ["--m-rule-soft" as string]: "rgba(238,245,255,0.1)",
        ["--m-text" as string]: "#f7f8fb",
        ["--m-text-2" as string]: "#a8acb5",
        ["--m-text-3" as string]: "#6f7480",
        ["--m-accent" as string]: "#2f7bff",
        ["--m-accent-2" as string]: "#70a5ff",
        background: "#030508",
        color: "#f7f8fb",
        minHeight: "100vh",
      }}
    >
      <header
        className="sticky top-0 z-50 border-b px-5 backdrop-blur-xl md:px-8"
        style={{
          borderColor: "var(--m-rule-soft)",
          background: "rgba(3, 5, 8, 0.78)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-6">
          <Link
            href="/"
            className="group flex items-center gap-3 text-[18px] font-semibold tracking-[-0.035em]"
            style={{ color: "var(--m-text)" }}
          >
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-[5px]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <span className="h-3.5 w-3.5 rounded-[3px] border border-current" />
            </span>
            Scaffold Web
          </Link>
          <nav className="hidden items-center gap-12 md:flex">
            <Link
              href="/#how-it-works"
              className="text-[13px] transition-colors hover:text-white"
              style={{ color: "var(--m-text-2)" }}
            >
              How it works
            </Link>
            <Link
              href="/#included"
              className="text-[13px] transition-colors hover:text-white"
              style={{ color: "var(--m-text-2)" }}
            >
              Included
            </Link>
            <Link
              href="/#pricing"
              className="text-[13px] transition-colors hover:text-white"
              style={{ color: "var(--m-text-2)" }}
            >
              Pricing
            </Link>
          </nav>
          <nav className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="hidden text-[13px] transition-colors hover:text-white sm:inline"
              style={{ color: "var(--m-text-2)" }}
            >
              Sign in
            </Link>
            <Link
              href="/onboard"
              className="inline-flex h-10 items-center justify-center rounded-[8px] px-5 text-[13px] font-medium transition-transform hover:-translate-y-0.5"
              style={{
                background: "var(--m-accent)",
                color: "white",
                boxShadow: "0 14px 34px rgba(47, 123, 255, 0.25)",
              }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer
        className="border-t px-6"
        style={{ borderColor: "var(--m-rule-soft)" }}
      >
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 py-8 md:flex-row">
          <div className="text-[13px] font-medium" style={{ color: "var(--m-text)" }}>
            Scaffold Web
          </div>
          <div
            className="flex gap-8 text-[13px]"
            style={{ color: "var(--m-text-3)" }}
          >
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
