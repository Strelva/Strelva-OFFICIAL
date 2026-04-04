import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REB — AI website management for local businesses",
  description:
    "Describe your business. Get a live website in 5 minutes. Update it by chatting with AI. Weekly reports prove it's working.",
  keywords: [
    "AI website management",
    "AI website builder",
    "local business website",
    "website for small business",
    "AI website assistant",
  ],
};

/* ─── Icon components ─── */

function ChatIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ─── Data ─── */

const steps = [
  {
    icon: <ZapIcon />,
    title: "Describe your business",
    description: "Tell us what you do, who you serve, and what matters. AI generates your site in under 5 minutes.",
  },
  {
    icon: <ChatIcon />,
    title: "Update it by talking",
    description: '"Add my new Saturday yoga class." "Change my hours for the holiday." Your AI assistant handles it.',
  },
  {
    icon: <ChartIcon />,
    title: "Watch it work",
    description: 'Weekly reports in plain English: "47 people found you this week. 3 clicked Book Now."',
  },
];

const tiers = [
  {
    name: "Starter",
    price: 49,
    description: "Your website + AI assistant",
    features: [
      "AI-generated website",
      "Chat to update anything",
      "Business dashboard",
      "Traffic analytics",
      "Hosting included",
    ],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Growth",
    price: 149,
    description: "Everything in Starter, plus reach",
    features: [
      "Everything in Starter",
      "Email newsletters",
      "Blog posts via AI",
      "Review management",
      "Weekly AI reports",
      "Priority support",
    ],
    cta: "Start free",
    highlighted: true,
  },
  {
    name: "Scale",
    price: 399,
    description: "Full AI business OS",
    features: [
      "Everything in Growth",
      "Social media posting",
      "API access",
      "White-label ready",
      "Custom domain",
      "Dedicated support",
    ],
    cta: "Contact us",
    highlighted: false,
  },
];

/* ─── Page ─── */

export default function MarketingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ background: "var(--pure-white)" }}>
        <div className="max-w-4xl mx-auto px-6 pt-24 pb-20 md:pt-36 md:pb-32 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: "var(--sage)" }}>
            AI website management
          </p>
          <h1
            className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight"
            style={{ color: "var(--bark)", fontFamily: "var(--font-display), serif" }}
          >
            Your business online
            <br />
            in 5 minutes
          </h1>
          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: "var(--bark-light)" }}>
            Describe what you do. AI builds your website. Update it by chatting.
            Weekly reports prove it&rsquo;s working.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/onboard"
              className="inline-flex items-center px-8 py-3.5 rounded-full text-base font-medium transition-all hover:scale-[1.02]"
              style={{ background: "var(--sage)", color: "var(--pure-white)" }}
            >
              Get your site now
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center px-8 py-3.5 rounded-full text-base font-medium transition-colors"
              style={{ color: "var(--sage-dark)", border: "1.5px solid var(--sage-light)" }}
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 text-sm" style={{ color: "var(--bark-faded)" }}>
            No credit card required. Live site in under 5 minutes.
          </p>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--cream))" }}
        />
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 md:py-28 px-6" style={{ background: "var(--cream)" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center" style={{ color: "var(--bark)" }}>
            How it works
          </h2>
          <p className="mt-4 text-center text-lg max-w-xl mx-auto" style={{ color: "var(--bark-faded)" }}>
            From &ldquo;I need a website&rdquo; to &ldquo;my site runs itself&rdquo; in three steps.
          </p>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {steps.map((step, i) => (
              <div key={i} className="text-center md:text-left">
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                  style={{ background: "var(--sage-wash)", color: "var(--sage-dark)" }}
                >
                  {step.icon}
                </div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--sage)" }}>
                  Step {i + 1}
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--bark)" }}>
                  {step.title}
                </h3>
                <p className="text-base leading-relaxed" style={{ color: "var(--bark-faded)" }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section className="py-20 md:py-28 px-6" style={{ background: "var(--pure-white)" }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "var(--bark)" }}>
            Built for businesses that don&rsquo;t have time for a website
          </h2>
          <p className="mt-6 text-lg leading-relaxed" style={{ color: "var(--bark-faded)" }}>
            Yoga studios. Plumbers. Restaurants. Accountants. Salons. Contractors.
            If you run a local business and your website is either bad, outdated,
            or a LinkTree page — this is for you.
          </p>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--bark-faded)" }}>
            You don&rsquo;t need to learn a CMS. You don&rsquo;t need to hire a designer.
            You text the AI what you need, and it happens.
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 md:py-28 px-6" style={{ background: "var(--cream)" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center" style={{ color: "var(--bark)" }}>
            Simple, honest pricing
          </h2>
          <p className="mt-4 text-center text-lg max-w-xl mx-auto" style={{ color: "var(--bark-faded)" }}>
            Start free. Upgrade when you need more.
          </p>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className="rounded-2xl p-7 border-2 flex flex-col"
                style={{
                  background: "var(--pure-white)",
                  borderColor: tier.highlighted ? "var(--sage)" : "var(--cream-dark)",
                }}
              >
                {tier.highlighted && (
                  <div
                    className="text-[10px] font-bold uppercase tracking-widest mb-3 px-3 py-1 rounded-full self-start"
                    style={{ background: "var(--sage-wash)", color: "var(--sage-dark)" }}
                  >
                    Most popular
                  </div>
                )}
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--sage)" }}>
                  {tier.name}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-semibold" style={{ color: "var(--bark)" }}>
                    ${tier.price}
                  </span>
                  <span className="text-base" style={{ color: "var(--bark-faded)" }}>/mo</span>
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--bark-faded)" }}>
                  {tier.description}
                </p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" style={{ color: "var(--sage)" }}>
                        <CheckIcon />
                      </span>
                      <span className="text-sm" style={{ color: "var(--bark-light)" }}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <a
                  href={tier.name === "Scale" ? "mailto:laney@buffaloprojects.com" : "/onboard"}
                  className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-full text-sm font-medium transition-all hover:scale-[1.02]"
                  style={
                    tier.highlighted
                      ? { background: "var(--sage)", color: "var(--pure-white)" }
                      : { background: "var(--cream)", color: "var(--sage-dark)" }
                  }
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 md:py-28 px-6" style={{ background: "var(--pure-white)" }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "var(--bark)" }}>
            Your site in 5 minutes. No catch.
          </h2>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--bark-faded)" }}>
            Describe your business, pick a look, and you&rsquo;re live.
            No credit card. No meetings. No waiting.
          </p>
          <div className="mt-10">
            <a
              href="/onboard"
              className="inline-flex items-center px-10 py-4 rounded-full text-base font-medium transition-all hover:scale-[1.02]"
              style={{ background: "var(--sage)", color: "var(--pure-white)" }}
            >
              Get your site now
            </a>
          </div>
          <p className="mt-8 text-sm" style={{ color: "var(--bark-faded)" }}>
            Questions?{" "}
            <a
              href="mailto:laney@buffaloprojects.com"
              className="underline underline-offset-2"
              style={{ color: "var(--sage-dark)" }}
            >
              laney@buffaloprojects.com
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
