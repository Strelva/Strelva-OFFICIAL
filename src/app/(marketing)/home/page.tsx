import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Scaffold Web — AI website management for small business",
  description: "Your business runs itself. AI manages your website, sends weekly reports, and keeps clients coming — for $149/mo.",
};

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section
        className="px-6 pt-24 pb-20 md:pt-32 md:pb-28"
        style={{ background: "var(--m-bg)" }}
      >
        <div className="max-w-[720px] mx-auto text-center">
          <div
            className="text-[12px] font-medium tracking-[0.2em] uppercase mb-6"
            style={{ color: "var(--m-text-2)" }}
          >
            Website management for small business
          </div>
          <h1
            className="text-[clamp(2rem,6vw,3.5rem)] font-medium leading-[1.08] tracking-[-0.025em] mb-6"
            style={{ color: "var(--m-text)" }}
          >
            Your business runs itself.
            <br />
            <span style={{ color: "var(--m-text-2)" }}>Just text back yes.</span>
          </h1>
          <p
            className="text-[17px] leading-[1.6] max-w-[480px] mx-auto mb-10"
            style={{ color: "var(--m-text-2)" }}
          >
            AI manages your website, sends weekly reports, and keeps clients coming.
            You focus on running your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/onboard"
              className="inline-block text-[14px] font-medium px-8 py-3.5 transition-colors"
              style={{
                background: "var(--m-text)",
                color: "var(--m-bg)",
              }}
            >
              Get started
            </Link>
            <Link
              href="/sign-in"
              className="inline-block text-[14px] font-medium px-8 py-3.5 border transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--m-rule)",
                color: "var(--m-text-2)",
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        className="px-6 py-20 border-t"
        style={{ background: "var(--m-surface)", borderColor: "var(--m-rule)" }}
      >
        <div className="max-w-[960px] mx-auto">
          <h2
            className="text-[12px] font-medium tracking-[0.2em] uppercase mb-12 text-center"
            style={{ color: "var(--m-text-2)" }}
          >
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                step: "01",
                title: "We build your site",
                desc: "A custom website designed for your business — not a template. Live in days, not months.",
              },
              {
                step: "02",
                title: "AI takes over",
                desc: "Need to update your hours? Add a service? Just text. AI handles the rest.",
              },
              {
                step: "03",
                title: "Weekly proof",
                desc: "Every week you see who found you, what they clicked, and what happened. No guessing.",
              },
            ].map((item) => (
              <div key={item.step}>
                <div
                  className="text-[11px] font-medium tracking-[0.15em] mb-3"
                  style={{ color: "var(--m-accent)" }}
                >
                  {item.step}
                </div>
                <h3
                  className="text-[18px] font-medium mb-2"
                  style={{ color: "var(--m-text)" }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-[15px] leading-[1.6]"
                  style={{ color: "var(--m-text-2)" }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's included */}
      <section
        className="px-6 py-20 border-t"
        style={{ background: "var(--m-bg)", borderColor: "var(--m-rule)" }}
      >
        <div className="max-w-[720px] mx-auto">
          <h2
            className="text-[12px] font-medium tracking-[0.2em] uppercase mb-4 text-center"
            style={{ color: "var(--m-text-2)" }}
          >
            Everything included
          </h2>
          <p
            className="text-[24px] font-medium tracking-[-0.02em] text-center mb-12"
            style={{ color: "var(--m-text)" }}
          >
            One plan. No upsells. No surprises.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-12 gap-y-6">
            {[
              "Custom website build",
              "Unlimited AI updates",
              "Weekly performance reports",
              "Email newsletter management",
              "Blog content generation",
              "Review monitoring",
              "Social media posts",
              "Analytics dashboard",
              "SSL & security",
              "Mobile optimized",
              "SEO fundamentals",
              "Human support when needed",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 py-2 border-b"
                style={{ borderColor: "var(--m-rule)" }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--m-accent)" }}
                />
                <span
                  className="text-[15px]"
                  style={{ color: "var(--m-text)" }}
                >
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        className="px-6 py-20 border-t"
        style={{ background: "var(--m-surface)", borderColor: "var(--m-rule)" }}
      >
        <div className="max-w-[480px] mx-auto text-center">
          <h2
            className="text-[12px] font-medium tracking-[0.2em] uppercase mb-4"
            style={{ color: "var(--m-text-2)" }}
          >
            Simple pricing
          </h2>
          <div
            className="rounded-2xl p-8 mb-6"
            style={{ background: "var(--m-bg)", border: "1px solid var(--m-rule)" }}
          >
            <div className="flex items-baseline justify-center gap-1 mb-2">
              <span
                className="text-[48px] font-medium tracking-[-0.02em]"
                style={{ color: "var(--m-text)" }}
              >
                $149
              </span>
              <span
                className="text-[16px]"
                style={{ color: "var(--m-text-2)" }}
              >
                /mo
              </span>
            </div>
            <p
              className="text-[15px] mb-6"
              style={{ color: "var(--m-text-2)" }}
            >
              Everything. No hidden fees.
            </p>
            <Link
              href="/onboard"
              className="inline-block w-full text-[14px] font-medium px-8 py-3.5 transition-colors"
              style={{
                background: "var(--m-text)",
                color: "var(--m-bg)",
              }}
            >
              Get started
            </Link>
          </div>
          <p
            className="text-[13px]"
            style={{ color: "var(--m-text-3)" }}
          >
            Custom website builds start at $1,500 — one-time, based on complexity.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="px-6 py-20 border-t"
        style={{ background: "var(--m-bg)", borderColor: "var(--m-rule)" }}
      >
        <div className="max-w-[560px] mx-auto text-center">
          <h2
            className="text-[28px] font-medium tracking-[-0.02em] mb-4"
            style={{ color: "var(--m-text)" }}
          >
            Stop managing your website.
          </h2>
          <p
            className="text-[16px] leading-[1.6] mb-8"
            style={{ color: "var(--m-text-2)" }}
          >
            You have a business to run. Let the AI handle the online presence.
            We&apos;ll reach out within 24 hours to get started.
          </p>
          <Link
            href="/onboard"
            className="inline-block text-[14px] font-medium px-8 py-3.5 transition-colors"
            style={{
              background: "var(--m-text)",
              color: "var(--m-bg)",
            }}
          >
            Get started
          </Link>
        </div>
      </section>
    </>
  );
}
