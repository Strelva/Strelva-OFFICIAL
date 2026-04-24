import type { Metadata } from "next";
import { MarketingAnimations } from "./agency/animations";

export const metadata: Metadata = {
  title: "REB — Your business runs itself. Just text back yes.",
  description:
    "AI manages your website while you run your business. Updates, blog, email, reviews, social — all handled. $149/mo.",
};

function Rule() {
  return (
    <div className="px-6">
      <div
        className="max-w-[1040px] mx-auto border-t"
        style={{ borderColor: "var(--m-rule)" }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      className="text-[11px] font-mono tracking-[0.15em] uppercase mb-4"
      style={{ color: "var(--m-text-3)" }}
    >
      {children}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <MarketingAnimations />

      {/* ── Hero ── */}
      <section className="px-6" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto pt-32 md:pt-48 pb-16 md:pb-24">
          <h1
            className="text-[clamp(2.8rem,7.5vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.03em]"
            style={{ color: "var(--m-text)" }}
          >
            Your business runs itself.
            <br />
            Just text back yes.
          </h1>
          <p
            className="mt-8 text-[17px] leading-[1.7] max-w-[520px]"
            style={{ color: "var(--m-text-2)" }}
          >
            Your site works while you sleep. The AI handles updates, blog posts,
            email, reviews, and social — you just approve the changes.
            More clients, less hassle.
          </p>
          <div className="mt-10 flex flex-wrap gap-4 items-center">
            <a
              href="/onboard"
              className="inline-block text-[14px] font-medium px-6 py-3 transition-colors"
              style={{
                background: "var(--m-text)",
                color: "var(--m-bg)",
              }}
            >
              Get started
            </a>
            <span className="text-[14px]" style={{ color: "var(--m-text-3)" }}>
              $149/mo — everything included
            </span>
          </div>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="px-6 pb-20 md:pb-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                title: "Just tell the AI what you want",
                detail:
                  '"Add my Saturday yoga class." Done. No ticket system, no waiting, no invoice.',
              },
              {
                title: "47 people found you this week",
                detail:
                  "Weekly reports in plain English. See exactly how your site is working — before the invoice recurs.",
              },
              {
                title: "Your site works while you sleep",
                detail:
                  "The AI monitors, updates, and improves your site 24/7. You approve changes with a text.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3
                  className="text-[18px] font-medium mb-3"
                  style={{ color: "var(--m-text)" }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-[15px] leading-[1.6]"
                  style={{ color: "var(--m-text-2)" }}
                >
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Rule />

      {/* ── What you get ── */}
      <section className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>What you get</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,3rem)] font-medium leading-[1.08] tracking-[-0.02em] mb-14"
              style={{ color: "var(--m-text)" }}
            >
              Everything your business needs online.
              <br />
              Managed by AI.
            </h2>
          </div>

          <div className="reveal-section grid md:grid-cols-2 gap-6">
            {[
              {
                title: "Custom website",
                detail: "Built by a human, not a template. Better than what agencies deliver.",
              },
              {
                title: "AI updates",
                detail: "Text your changes. The AI makes them. You approve with a reply.",
              },
              {
                title: "Blog & content",
                detail: "The AI writes posts that match your voice. You approve before publish.",
              },
              {
                title: "Email & newsletters",
                detail: "Stay in touch with customers. The AI drafts, you send.",
              },
              {
                title: "Reviews & reputation",
                detail: "Monitor and respond to reviews. The AI suggests responses.",
              },
              {
                title: "Weekly reports",
                detail: '"47 people found you. 3 clicked Book Now." Proof of value, every week.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="py-5 border-t"
                style={{ borderColor: "var(--m-rule)" }}
              >
                <h3
                  className="text-[16px] font-medium mb-2"
                  style={{ color: "var(--m-text)" }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-[15px] leading-[1.6]"
                  style={{ color: "var(--m-text-2)" }}
                >
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Rule />

      {/* ── How it works ── */}
      <section id="how" className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>How it works</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-14"
              style={{ color: "var(--m-text)" }}
            >
              Live in 48 hours.
              <br />
              Then you never think about it again.
            </h2>
          </div>

          <div className="space-y-0">
            {[
              {
                num: "01",
                title: "Tell us about your business",
                detail:
                  "15-minute call. We learn your services, your voice, and what you need. No homework.",
              },
              {
                num: "02",
                title: "We build your site by hand",
                detail:
                  "Custom design, real copywriting. Not a template. Live in 48 hours.",
              },
              {
                num: "03",
                title: "The AI takes over",
                detail:
                  'You text "Add Saturday yoga at 9am." The AI does it. You approve. That\'s it.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="reveal-section grid grid-cols-[40px_1fr] gap-6 py-8 border-t"
                style={{ borderColor: "var(--m-rule)" }}
              >
                <span
                  className="text-[14px] font-mono tracking-wider"
                  style={{ color: "var(--m-text-3)" }}
                >
                  {step.num}
                </span>
                <div>
                  <h3
                    className="text-[18px] font-medium mb-2"
                    style={{ color: "var(--m-text)" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6] max-w-[520px]"
                    style={{ color: "var(--m-text-2)" }}
                  >
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Rule />

      {/* ── Pricing ── */}
      <section id="pricing" className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>Pricing</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-14"
              style={{ color: "var(--m-text)" }}
            >
              One plan. Everything included.
            </h2>
          </div>

          <div
            className="reveal-section grid md:grid-cols-[1fr_1fr] gap-12 py-10 border-t border-b"
            style={{ borderColor: "var(--m-rule)" }}
          >
            <div>
              <div className="flex items-baseline gap-1 mb-2">
                <span
                  className="text-[clamp(2.5rem,5vw,3rem)] font-medium tracking-tight tabular-nums"
                  style={{ color: "var(--m-text)" }}
                >
                  $149
                </span>
                <span className="text-[16px]" style={{ color: "var(--m-text-3)" }}>
                  /mo
                </span>
              </div>
              <p className="text-[15px]" style={{ color: "var(--m-text-2)" }}>
                No tiers. No surprises. No contracts.
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Custom website built by a human",
                "AI manages updates, blog, email, reviews, social",
                "Weekly proof-of-value reports",
                "One-time build fee: $1,500-$3,000",
              ].map((f) => (
                <p key={f} className="text-[15px]" style={{ color: "var(--m-text-2)" }}>
                  {f}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <a
              href="/onboard"
              className="inline-block text-[14px] font-medium px-6 py-3 transition-colors"
              style={{
                background: "var(--m-text)",
                color: "var(--m-bg)",
              }}
            >
              Get started
            </a>
          </div>
        </div>
      </section>

      <Rule />

      {/* ── For local businesses ── */}
      <section className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>Built for</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-6"
              style={{ color: "var(--m-text)" }}
            >
              Local businesses who have
              <br />
              a website problem they stopped trying to solve.
            </h2>
            <p
              className="text-[16px] leading-[1.6] max-w-[520px] mb-10"
              style={{ color: "var(--m-text-2)" }}
            >
              You have a bad website, or you use Linktree + a booking platform,
              or you left an agency. You want more clients, not a dashboard.
              You&apos;ll never log into a traditional CMS.
            </p>
          </div>

          <div className="reveal-section flex flex-wrap gap-3">
            {[
              "Wellness studios",
              "Restaurants",
              "Food brands",
              "Trades",
              "Professional services",
            ].map((type) => (
              <span
                key={type}
                className="text-[13px] px-4 py-2 border"
                style={{
                  borderColor: "var(--m-rule)",
                  color: "var(--m-text-2)",
                }}
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      <Rule />

      {/* ── Final CTA ── */}
      <section className="px-6 py-24 md:py-40" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto reveal-section">
          <h2
            className="text-[clamp(1.8rem,4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em]"
            style={{ color: "var(--m-text)" }}
          >
            Stop managing your website.
            <br />
            Start running your business.
          </h2>
          <p
            className="mt-6 text-[16px] leading-[1.6] max-w-[440px]"
            style={{ color: "var(--m-text-2)" }}
          >
            $149/mo. Custom website. AI that actually does the work.
            Weekly reports that prove it.
          </p>
          <div className="mt-8">
            <a
              href="/onboard"
              className="inline-block text-[14px] font-medium px-6 py-3 transition-colors"
              style={{
                background: "var(--m-text)",
                color: "var(--m-bg)",
              }}
            >
              Get started
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
