import type { Metadata } from "next";
import { MarketingAnimations } from "./animations";

export const metadata: Metadata = {
  title: "REB — Your online presence, run by AI",
  description:
    "We build your website. AI manages it. Weekly reports prove it's working. $149/mo, everything included.",
};

/* ─── Page ─── */

export default function MarketingPage() {
  return (
    <>
      <MarketingAnimations />

      {/* ── Hero — editorial, not SaaS ── */}
      <section className="px-6" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1120px] mx-auto pt-24 md:pt-40 pb-20 md:pb-32">
          {/* Oversized headline — the page IS the headline */}
          <h1
            className="text-[clamp(2.5rem,8vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em]"
            style={{ color: "var(--m-text)" }}
          >
            Your online
            <br />
            presence,{" "}
            <span
              className="italic"
              style={{ color: "var(--m-accent)", fontFamily: "var(--font-display), Georgia, serif" }}
            >
              run by AI.
            </span>
          </h1>

          {/* Subhead — generous spacing, asymmetric placement */}
          <div className="grid md:grid-cols-[7fr_5fr] gap-8 mt-12 md:mt-16">
            <div>
              <p className="text-[clamp(1rem,1.8vw,1.25rem)] leading-[1.6]" style={{ color: "var(--m-text-2)" }}>
                We build you a custom website. Then AI manages it&mdash;updates,
                emails, blog posts, weekly reports. You just
                text what you need. It happens.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <a
                  href="/onboard"
                  className="text-[14px] font-medium px-6 py-3 transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "var(--m-accent)", color: "var(--m-bg)" }}
                >
                  Get started &rarr;
                </a>
                <span className="text-[13px]" style={{ color: "var(--m-text-3)" }}>
                  $149/mo &middot; everything included
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider rule ── */}
      <div className="px-6"><div className="max-w-[1120px] mx-auto border-t" style={{ borderColor: "var(--m-rule)" }} /></div>

      {/* ── The product, as a pull quote ── */}
      <section className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1120px] mx-auto grid md:grid-cols-[5fr_7fr] gap-12 md:gap-20 items-start">
          {/* Left — editorial label */}
          <div className="reveal-section">
            <div className="text-[11px] font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "var(--m-accent)" }}>
              How it works
            </div>
            <p className="text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.2] tracking-[-0.02em]" style={{ color: "var(--m-text)" }}>
              You text the AI.
              <br />
              It updates your site.
              <br />
              <span style={{ color: "var(--m-text-2)" }}>That&rsquo;s the whole product.</span>
            </p>
          </div>
          {/* Right — the chat, inline like a magazine sidebar */}
          <div className="reveal-section">
            <div className="border-l-2 pl-6" style={{ borderColor: "var(--m-rule-light)" }}>
              <div className="space-y-4">
                {[
                  { from: "you", text: "Add my Saturday yoga class, 9am, $25 drop-in" },
                  { from: "reb", text: "Done — added to your services page and updated your schedule. Want me to email your regulars?" },
                  { from: "you", text: "Yes" },
                  { from: "reb", text: "Sent to 34 subscribers. 6 opened it already." },
                ].map((msg, i) => (
                  <div key={i}>
                    <div className="text-[10px] font-medium tracking-[0.15em] uppercase mb-1" style={{ color: msg.from === "you" ? "var(--m-text-3)" : "var(--m-accent)" }}>
                      {msg.from === "you" ? "You" : "REB"}
                    </div>
                    <p className="text-[15px] leading-[1.6]" style={{ color: "var(--m-text)" }}>
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule ── */}
      <div className="px-6"><div className="max-w-[1120px] mx-auto border-t" style={{ borderColor: "var(--m-rule)" }} /></div>

      {/* ── What you get — editorial list, not cards ── */}
      <section className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="reveal-section">
            <div className="text-[11px] font-medium tracking-[0.2em] uppercase mb-10" style={{ color: "var(--m-accent)" }}>
              What you get
            </div>
            <div className="space-y-0">
              {[
                { title: "A custom site built for your business", detail: "Professional design tailored to you. Mobile-ready, fast, SEO-optimized. Not a template you drag and drop." },
                { title: "AI manages it while you sleep", detail: "Weekly reports. Proactive suggestions. Stale content caught before clients notice. Email campaigns sent." },
                { title: "Updates by texting, not logging in", detail: "Add services. Change hours. Write blog posts. Send newsletters. All by chat." },
                { title: "Proof it's working, every week", detail: "\"47 people found you. 12 clicked Book Now.\" Numbers, not dashboards." },
              ].map((item, i) => (
                <div
                  key={i}
                  className="grid md:grid-cols-[5fr_7fr] gap-4 py-7 border-t"
                  style={{ borderColor: "var(--m-rule)" }}
                >
                  <h3 className="text-[17px] font-medium" style={{ color: "var(--m-text)" }}>
                    {item.title}
                  </h3>
                  <p className="text-[15px] leading-[1.6]" style={{ color: "var(--m-text-2)" }}>
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule ── */}
      <div className="px-6"><div className="max-w-[1120px] mx-auto border-t" style={{ borderColor: "var(--m-rule)" }} /></div>

      {/* ── Case study — social proof ── */}
      <section className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="reveal-section">
            <div className="text-[11px] font-medium tracking-[0.2em] uppercase mb-10" style={{ color: "var(--m-accent)" }}>
              Results
            </div>
            <div className="grid md:grid-cols-[5fr_7fr] gap-12 md:gap-20 items-start">
              {/* Left — quote */}
              <div>
                <h3 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-medium leading-[1.2] tracking-[-0.02em] mb-2" style={{ color: "var(--m-text)" }}>
                  Rohlax Wellness
                </h3>
                <p className="text-[14px] mb-6" style={{ color: "var(--m-text-3)" }}>
                  Assisted stretching studio, Williamsville NY
                </p>
                <blockquote className="border-l-2 pl-6" style={{ borderColor: "var(--m-rule-light)" }}>
                  <p className="text-[clamp(1rem,1.8vw,1.25rem)] leading-[1.6] italic" style={{ color: "var(--m-text-2)", fontFamily: "var(--font-display), Georgia, serif" }}>
                    &ldquo;I just text it and stuff happens. I haven&rsquo;t thought about my website in weeks.&rdquo;
                  </p>
                  <footer className="mt-3 text-[13px]" style={{ color: "var(--m-text-3)" }}>
                    &mdash; Chelsea, owner
                  </footer>
                </blockquote>
              </div>
              {/* Right — stats */}
              <div className="grid grid-cols-2 gap-px" style={{ background: "var(--m-rule)" }}>
                {[
                  { stat: "Under 5 min", label: "Site built" },
                  { stat: "100%", label: "Content completeness" },
                  { stat: "7", label: "Services with booking links" },
                  { stat: "Every Monday", label: "Weekly AI reports" },
                ].map((item, i) => (
                  <div key={i} className="p-6" style={{ background: "var(--m-bg)" }}>
                    <div className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight tabular-nums mb-1" style={{ color: "var(--m-text)" }}>
                      {item.stat}
                    </div>
                    <div className="text-[13px]" style={{ color: "var(--m-text-3)" }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule ── */}
      <div className="px-6"><div className="max-w-[1120px] mx-auto border-t" style={{ borderColor: "var(--m-rule)" }} /></div>

      {/* ── Pricing — single plan ── */}
      <section id="pricing" className="px-6 py-20 md:py-32" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="reveal-section">
            <div className="text-[11px] font-medium tracking-[0.2em] uppercase mb-10" style={{ color: "var(--m-accent)" }}>
              Pricing
            </div>
            <div className="grid md:grid-cols-[5fr_7fr] gap-12 md:gap-20 items-start">
              {/* Left — price + CTA */}
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-[clamp(2.5rem,5vw,3.5rem)] font-semibold tracking-tight tabular-nums" style={{ color: "var(--m-text)" }}>$149</span>
                  <span className="text-[15px]" style={{ color: "var(--m-text-3)" }}>/month</span>
                </div>
                <p className="text-[15px] leading-[1.6] mb-6" style={{ color: "var(--m-text-2)" }}>
                  Your entire online presence, managed by AI.
                  <br />
                  Everything included. No tiers. No upsells.
                </p>
                <a
                  href="/onboard"
                  className="text-[13px] font-medium px-5 py-2.5 transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{ background: "var(--m-accent)", color: "var(--m-bg)" }}
                >
                  Start free trial
                </a>
                <p className="mt-4 text-[12px]" style={{ color: "var(--m-text-3)" }}>
                  14-day free trial. No credit card required.
                </p>
              </div>
              {/* Right — what's included */}
              <div>
                <ul className="space-y-2">
                  {[
                    "Professional website, built and managed",
                    "Chat to update anything — like texting a person",
                    "Weekly reports: who found you, who clicked",
                    "Email newsletters to your client list",
                    "Blog posts, drafted by AI, approved by you",
                    "Proactive suggestions via text",
                    "Hosting, SSL, and analytics included",
                    "You own everything. Cancel anytime.",
                  ].map((f) => (
                    <li key={f} className="text-[14px] flex items-center gap-2" style={{ color: "var(--m-text-2)" }}>
                      <span style={{ color: "var(--m-accent)" }}>&middot;</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-12 text-[13px]" style={{ color: "var(--m-text-3)" }}>
              Multi-location or white-label?{" "}
              <a href="mailto:jacob@reb.studio" className="underline" style={{ color: "var(--m-text-2)" }}>Let&rsquo;s talk</a>
            </p>
          </div>
        </div>
      </section>

      {/* ── Rule ── */}
      <div className="px-6"><div className="max-w-[1120px] mx-auto border-t" style={{ borderColor: "var(--m-rule)" }} /></div>

      {/* ── Close — one line, massive type ── */}
      <section className="px-6 py-24 md:py-40" style={{ background: "var(--m-bg)" }}>
        <div className="max-w-[1120px] mx-auto reveal-section">
          <p
            className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--m-text)" }}
          >
            Stop managing your website.
            <br />
            <span
              className="italic"
              style={{ color: "var(--m-accent)", fontFamily: "var(--font-display), Georgia, serif" }}
            >
              Let it manage itself.
            </span>
          </p>
          <div className="mt-8">
            <a
              href="/onboard"
              className="text-[14px] font-medium px-6 py-3 transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: "var(--m-accent)", color: "var(--m-bg)" }}
            >
              Get started &rarr;
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
