import type { Metadata } from "next";
import { MarketingAnimations } from "./animations";

export const metadata: Metadata = {
  title: "REB — We build your site. The AI handles the rest.",
  description:
    "Cut out the marketing agency. Custom website built by hand, then AI manages everything. $149/mo.",
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

export default function MarketingPage() {
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
            We build your site.
            <br />
            The AI handles the rest.
          </h1>
          <p
            className="mt-8 text-[17px] leading-[1.7] max-w-[480px]"
            style={{ color: "var(--m-text-2)" }}
          >
            No more chasing your agency for a text change.
            <br />
            No more $500/mo retainers for someone to update your hours.
            <br />
            We build it. The AI runs it. You just text back yes.
          </p>
          <div className="mt-10">
            <a
              href="/onboard"
              className="inline-block text-[14px] font-medium px-6 py-3 border transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--m-text)",
                color: "var(--m-text)",
              }}
            >
              See what replaces your agency
            </a>
          </div>
        </div>
      </section>

      {/* ── Dashboard mockup ── */}
      <section className="px-6 pb-20 md:pb-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div
            className="rounded-xl border overflow-hidden flex"
            style={{
              background: "var(--m-surface)",
              borderColor: "var(--m-rule)",
            }}
          >
            {/* Sidebar */}
            <div
              className="hidden md:flex flex-col w-[200px] shrink-0 border-r p-4 gap-5"
              style={{ borderColor: "var(--m-rule)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded"
                  style={{ background: "var(--m-accent)" }}
                />
                <span className="text-[14px] font-semibold" style={{ color: "var(--m-text)" }}>
                  REB
                </span>
              </div>
              <div className="space-y-1">
                {["Home", "My Site", "Reports", "Photos", "Settings"].map(
                  (item, i) => (
                    <div
                      key={item}
                      className="text-[13px] px-2.5 py-1.5 rounded"
                      style={{
                        color: i === 0 ? "var(--m-accent)" : "var(--m-text-2)",
                        background: i === 0 ? "rgba(91,141,239,0.1)" : "transparent",
                      }}
                    >
                      {item}
                    </div>
                  )
                )}
              </div>
              <div
                className="border-t pt-4 mt-auto"
                style={{ borderColor: "var(--m-rule)" }}
              >
                <div
                  className="text-[10px] font-mono tracking-wider uppercase mb-2"
                  style={{ color: "var(--m-text-3)" }}
                >
                  Connections
                </div>
                {["Google Analytics", "Mailchimp"].map((c) => (
                  <div key={c} className="flex items-center gap-2 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[12px]" style={{ color: "var(--m-text-2)" }}>
                      {c}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Main area */}
            <div
              className="flex-1 flex flex-col items-center justify-center px-8 py-16 md:py-20 gap-5"
              style={{ background: "var(--m-bg)" }}
            >
              <h2
                className="text-[24px] font-medium"
                style={{ color: "var(--m-text)" }}
              >
                Good morning, Chelsea
              </h2>
              <div className="flex items-center gap-8">
                {[
                  { n: "47", label: "visitors this week" },
                  { n: "12", label: "booking clicks" },
                  { n: "A+", label: "site health", color: "#34d399" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div
                      className="text-[22px] font-medium tabular-nums"
                      style={{ color: s.color || "var(--m-text)" }}
                    >
                      {s.n}
                    </div>
                    <div
                      className="text-[10px] font-mono tracking-wider"
                      style={{ color: "var(--m-text-3)" }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                {["Update my hours", "Write a blog post", "How\u2019s my site doing?"].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="text-[12px] px-3 py-1.5 rounded-full border"
                      style={{
                        borderColor: "var(--m-rule)",
                        color: "var(--m-text-2)",
                      }}
                    >
                      {chip}
                    </span>
                  )
                )}
              </div>
              <div
                className="w-full max-w-[480px] flex items-center gap-3 mt-2 px-4 py-3 rounded-lg border"
                style={{
                  borderColor: "var(--m-rule)",
                  background: "var(--m-surface)",
                }}
              >
                <span className="flex-1 text-[13px]" style={{ color: "var(--m-text-3)" }}>
                  Ask anything about your business…
                </span>
                <div
                  className="w-7 h-7 rounded flex items-center justify-center text-[14px] font-semibold"
                  style={{ background: "var(--m-accent)", color: "#fff" }}
                >
                  ↑
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Rule />

      {/* ── Live Preview — tabbed ── */}
      <section className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>Live preview</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,3rem)] font-medium leading-[1.08] tracking-[-0.02em] mb-4"
              style={{ color: "var(--m-text)" }}
            >
              Everything your agency does.
              <br />
              Without the agency.
            </h2>
            <p
              className="text-[16px] leading-[1.6] max-w-[480px] mb-12"
              style={{ color: "var(--m-text-2)" }}
            >
              Your agency charges $400–500/mo. Takes days to update your hours.
              Sends reports you don&rsquo;t read. This replaces all of that.
            </p>
          </div>

          {/* Tabs + content */}
          <div className="reveal-section">
            <div className="flex gap-0 border-b" style={{ borderColor: "var(--m-rule)" }}>
              {[
                { label: "Chat", active: true },
                { label: "Reports", active: false },
                { label: "Activity", active: false },
              ].map((tab) => (
                <button
                  key={tab.label}
                  className="text-[14px] px-5 py-2.5 border-b-2 -mb-px transition-colors"
                  style={{
                    borderColor: tab.active ? "var(--m-text)" : "transparent",
                    color: tab.active ? "var(--m-text)" : "var(--m-text-3)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              className="border border-t-0 rounded-b-xl p-8 md:p-10"
              style={{
                background: "var(--m-surface)",
                borderColor: "var(--m-rule)",
              }}
            >
              {/* Chat conversation */}
              <div className="max-w-[520px] space-y-5">
                {[
                  {
                    from: "user",
                    text: "Add my Saturday yoga class at 9am",
                  },
                  {
                    from: "reb",
                    text: 'Done. I\u2019ve added \u201cSaturday Yoga \u2014 9:00 AM\u201d to your services page and updated the schedule section on your homepage.',
                  },
                  {
                    from: "user",
                    text: "Write a blog post about spring wellness",
                  },
                  {
                    from: "reb",
                    text: 'Published \u201c5 Simple Spring Wellness Habits.\u201d I matched your tone from previous posts. It\u2019s live on /blog.',
                  },
                ].map((msg, i) => (
                  <div key={i}>
                    {msg.from === "user" ? (
                      <div className="flex justify-end">
                        <div
                          className="text-[14px] px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[320px]"
                          style={{
                            background: "var(--m-raised)",
                            color: "var(--m-text)",
                          }}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div
                          className="text-[10px] font-mono tracking-[0.1em] uppercase mb-1.5"
                          style={{ color: "var(--m-text-3)" }}
                        >
                          REB
                        </div>
                        <p
                          className="text-[14px] leading-[1.6] max-w-[420px]"
                          style={{ color: "var(--m-text-2)" }}
                        >
                          {msg.text}
                        </p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Input with @ connections dropdown */}
                <div className="relative mt-4">
                  {/* @ dropdown */}
                  <div
                    className="absolute bottom-full mb-1 w-[260px] rounded-lg border py-1 z-10"
                    style={{
                      background: "var(--m-raised)",
                      borderColor: "rgba(255,255,255,0.08)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div
                      className="px-3 py-1.5 text-[10px] font-mono tracking-[0.1em] uppercase"
                      style={{ color: "var(--m-text-3)" }}
                    >
                      Connections
                    </div>
                    {[
                      { name: "Google Analytics", tag: "analytics", status: "#34d399", active: true },
                      { name: "Mailchimp", tag: "email", status: "#34d399" },
                      { name: "Instagram", tag: "social", status: "var(--m-accent)" },
                      { name: "Google Business", tag: "reviews", status: "var(--m-accent)" },
                      { name: "Calendly", tag: "booking", status: "var(--m-text-3)" },
                    ].map((c) => (
                      <div
                        key={c.name}
                        className="flex items-center gap-2.5 px-3 py-2 mx-1 rounded"
                        style={{
                          background: c.active ? "rgba(91,141,239,0.1)" : "transparent",
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: c.status }}
                        />
                        <span
                          className="flex-1 text-[13px]"
                          style={{ color: "var(--m-text)" }}
                        >
                          {c.name}
                        </span>
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: "var(--m-text-3)" }}
                        >
                          {c.tag}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Input field with @ typed */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border"
                    style={{
                      borderColor: "rgba(255,255,255,0.1)",
                      background: "var(--m-raised)",
                    }}
                  >
                    <span className="text-[13px]" style={{ color: "var(--m-text)" }}>
                      @
                    </span>
                    <div
                      className="w-px h-4 animate-pulse"
                      style={{ background: "var(--m-text)" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Rule />

      {/* ── How it works — numbered prose ── */}
      <section id="how" className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>How it works</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-14"
              style={{ color: "var(--m-text)" }}
            >
              Your site is live in 48 hours.
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
                  "15-minute call. We learn your services, your voice, and what your agency was failing at. No homework.",
              },
              {
                num: "02",
                title: "We build your site by hand",
                detail:
                  "Custom design, real copywriting. Not a template. Better than what your agency delivered \u2014 in 48 hours.",
              },
              {
                num: "03",
                title: "Cancel the retainer. Text the AI instead.",
                detail:
                  '\u201cAdd Saturday yoga at 9am.\u201d Done. No ticket, no waiting, no invoice. The AI runs your site from here.',
              },
            ].map((step, i) => (
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

      {/* ── Pricing — minimal ── */}
      <section id="pricing" className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="reveal-section">
            <SectionLabel>Pricing</SectionLabel>
            <h2
              className="text-[clamp(1.8rem,4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-14"
              style={{ color: "var(--m-text)" }}
            >
              One plan. Everything included.
              <br />
              No tiers. No surprises.
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
                Replaces $400–500/mo agency retainers
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Custom website built by a human",
                "AI manages updates, blog, email, reviews, social",
                "Weekly proof-of-value reports",
                "One-time build: $1,500\u2013$3,000",
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
              className="inline-block text-[14px] font-medium px-6 py-3 border transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--m-text)",
                color: "var(--m-text)",
              }}
            >
              See the demo
            </a>
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
            Your agency can&rsquo;t text you back
            <br />
            at midnight. Your AI can.
          </h2>
          <p
            className="mt-6 text-[16px] leading-[1.6] max-w-[440px]"
            style={{ color: "var(--m-text-2)" }}
          >
            Preview the full dashboard. See exactly what replaces your agency.
            No credit card.
          </p>
          <div className="mt-8">
            <a
              href="/onboard"
              className="inline-block text-[14px] font-medium px-6 py-3 border transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--m-text)",
                color: "var(--m-text)",
              }}
            >
              See the demo
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
