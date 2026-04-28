import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Scaffold Web — AI website management for small business",
  description: "Your business runs itself. AI manages your website, sends weekly reports, and keeps clients coming.",
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
        ["--m-surface" as string]: "#141414",
        ["--m-raised" as string]: "#1a1a1a",
        ["--m-rule" as string]: "rgba(255,255,255,0.08)",
        ["--m-text" as string]: "#e8e8e8",
        ["--m-text-2" as string]: "#888888",
        ["--m-text-3" as string]: "#555555",
        ["--m-accent" as string]: "#5B8DEF",
        background: "#0e0e0e",
        color: "#e8e8e8",
        minHeight: "100vh",
      }}
    >
      <header
        className="px-6 h-14 flex items-center justify-between border-b"
        style={{ borderColor: "var(--m-rule)" }}
      >
        <Link
          href="/"
          className="text-[13px] font-medium tracking-[0.1em] uppercase"
          style={{ color: "var(--m-text)" }}
        >
          Scaffold Web
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/sign-in"
            className="text-[13px] transition-colors hover:opacity-80"
            style={{ color: "var(--m-text-2)" }}
          >
            Sign in
          </Link>
          <Link
            href="/onboard"
            className="text-[13px] font-medium px-4 py-1.5 transition-colors"
            style={{
              background: "var(--m-text)",
              color: "var(--m-bg)",
            }}
          >
            Get started
          </Link>
        </nav>
      </header>

      <main>{children}</main>

      <footer
        className="border-t px-6"
        style={{ borderColor: "var(--m-rule)" }}
      >
        <div className="max-w-[1040px] mx-auto py-8 flex flex-col md:flex-row justify-between gap-4">
          <div className="text-[12px]" style={{ color: "var(--m-text-3)" }}>
            &copy; {new Date().getFullYear()} Scaffold Web
          </div>
          <div
            className="flex gap-6 text-[12px]"
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
