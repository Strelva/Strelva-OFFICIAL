import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Scaffold Web — Sign in to your dashboard",
  description: "Access your business dashboard.",
};

export default function HomePage() {
  return (
    <section className="px-6 min-h-[calc(100vh-48px)] flex items-center justify-center" style={{ background: "var(--m-bg)" }}>
      <div className="text-center max-w-[480px]">
        <div
          className="text-[13px] font-medium tracking-[0.15em] uppercase mb-8"
          style={{ color: "var(--m-text)" }}
        >
          Scaffold Web
        </div>
        <h1
          className="text-[clamp(1.8rem,5vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-4"
          style={{ color: "var(--m-text)" }}
        >
          Your business runs itself.
        </h1>
        <p
          className="text-[16px] leading-[1.6] mb-10"
          style={{ color: "var(--m-text-2)" }}
        >
          AI manages your website while you run your business.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/sign-in"
            className="inline-block text-[14px] font-medium px-8 py-3 transition-colors"
            style={{
              background: "var(--m-text)",
              color: "var(--m-bg)",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/onboard"
            className="inline-block text-[14px] font-medium px-8 py-3 border transition-colors hover:bg-white/5"
            style={{
              borderColor: "var(--m-rule)",
              color: "var(--m-text-2)",
            }}
          >
            Get started
          </Link>
        </div>
      </div>
    </section>
  );
}
