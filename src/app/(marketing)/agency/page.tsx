import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REB Studio — Your site works while you sleep",
};

/* ─── Icon components ─── */

function BuildIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ─── Data ─── */

const steps = [
  {
    icon: <BuildIcon />,
    title: "We build it",
    description:
      "A custom Next.js site designed around your business. No templates, no drag-and-drop. Hand-crafted for you.",
  },
  {
    icon: <ChatIcon />,
    title: "You talk to AI",
    description:
      'Update your hours, add events, change content — just chat. "Add my new yoga class on Saturdays at 10am."',
  },
  {
    icon: <ChartIcon />,
    title: "Site improves",
    description:
      "Weekly reports, SEO optimization, and content suggestions. Your site gets better while you focus on clients.",
  },
];

const features = [
  "Custom-designed website (not a template)",
  "AI assistant that updates your site via chat",
  "Business dashboard with real metrics",
  "Booking integration",
  "SEO optimization",
  "Weekly performance reports",
];

const monthlyIncludes = [
  "AI assistant for unlimited content updates",
  "Business dashboard & analytics",
  "Hosting on Vercel edge network",
  "Weekly performance reports",
  "SEO monitoring & suggestions",
  "Priority support",
];

/* ─── Page ─── */

export default function MarketingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--pure-white)" }}
      >
        <div className="max-w-4xl mx-auto px-6 pt-24 pb-20 md:pt-36 md:pb-32 text-center">
          <h1
            className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight"
            style={{ color: "var(--bark)", fontFamily: "var(--font-display), serif" }}
          >
            Your site works
            <br />
            while you sleep
          </h1>
          <p
            className="mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            style={{ color: "var(--bark-light)" }}
          >
            Custom websites powered by AI. Your clients get a beautiful site + an
            AI assistant that handles everything.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#pricing"
              className="inline-flex items-center px-8 py-3.5 rounded-full text-base font-medium transition-all hover:scale-[1.02]"
              style={{
                background: "var(--sage)",
                color: "var(--pure-white)",
              }}
            >
              Get Started
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center px-8 py-3.5 rounded-full text-base font-medium transition-colors"
              style={{
                color: "var(--sage-dark)",
                border: "1.5px solid var(--sage-light)",
              }}
            >
              How it works
            </a>
          </div>
        </div>

        {/* Decorative gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--cream))",
          }}
        />
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="py-20 md:py-28 px-6"
        style={{ background: "var(--cream)" }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight text-center"
            style={{ color: "var(--bark)" }}
          >
            How it works
          </h2>
          <p
            className="mt-4 text-center text-lg max-w-xl mx-auto"
            style={{ color: "var(--bark-faded)" }}
          >
            Three steps from &ldquo;I need a website&rdquo; to
            &ldquo;my site runs itself.&rdquo;
          </p>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {steps.map((step, i) => (
              <div key={i} className="text-center md:text-left">
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                  style={{
                    background: "var(--sage-wash)",
                    color: "var(--sage-dark)",
                  }}
                >
                  {step.icon}
                </div>
                <div
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--sage)" }}
                >
                  Step {i + 1}
                </div>
                <h3
                  className="text-xl font-semibold mb-2"
                  style={{ color: "var(--bark)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{ color: "var(--bark-faded)" }}
                >
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What You Get ── */}
      <section
        className="py-20 md:py-28 px-6"
        style={{ background: "var(--pure-white)" }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight text-center"
            style={{ color: "var(--bark)" }}
          >
            What you get
          </h2>
          <p
            className="mt-4 text-center text-lg max-w-xl mx-auto"
            style={{ color: "var(--bark-faded)" }}
          >
            Everything a local business needs to look professional
            and stay visible online.
          </p>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {features.map((feature) => (
              <div
                key={feature}
                className="flex items-start gap-3 p-4 rounded-xl"
                style={{ background: "var(--cream)" }}
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--sage)" }}
                >
                  <CheckIcon />
                </span>
                <span
                  className="text-base"
                  style={{ color: "var(--bark)" }}
                >
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section
        id="pricing"
        className="py-20 md:py-28 px-6"
        style={{ background: "var(--cream)" }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight text-center"
            style={{ color: "var(--bark)" }}
          >
            Simple pricing
          </h2>
          <p
            className="mt-4 text-center text-lg max-w-xl mx-auto"
            style={{ color: "var(--bark-faded)" }}
          >
            One build fee. One monthly price. No surprises.
          </p>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Build fee */}
            <div
              className="rounded-2xl p-8 border"
              style={{
                background: "var(--pure-white)",
                borderColor: "var(--cream-dark)",
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: "var(--sage)" }}
              >
                One-time
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-4xl font-semibold"
                  style={{ color: "var(--bark)" }}
                >
                  $3,000
                </span>
              </div>
              <p
                className="mt-3 text-base leading-relaxed"
                style={{ color: "var(--bark-faded)" }}
              >
                Custom website designed and built for your business.
                Hand-crafted, not generated from a template.
              </p>
            </div>

            {/* Monthly */}
            <div
              className="rounded-2xl p-8 border-2"
              style={{
                background: "var(--pure-white)",
                borderColor: "var(--sage)",
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: "var(--sage)" }}
              >
                Monthly
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-4xl font-semibold"
                  style={{ color: "var(--bark)" }}
                >
                  $199
                </span>
                <span
                  className="text-base"
                  style={{ color: "var(--bark-faded)" }}
                >
                  /mo
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {monthlyIncludes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 shrink-0"
                      style={{ color: "var(--sage)" }}
                    >
                      <CheckIcon />
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "var(--bark-light)" }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA / Contact ── */}
      <section
        className="py-20 md:py-28 px-6"
        style={{ background: "var(--pure-white)" }}
      >
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight"
            style={{ color: "var(--bark)" }}
          >
            Ready to get started?
          </h2>
          <p
            className="mt-4 text-lg leading-relaxed"
            style={{ color: "var(--bark-faded)" }}
          >
            Let&rsquo;s talk about your business. We&rsquo;ll scope
            the project, show you what your site could look like, and
            get you live in under two weeks.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:laney@buffaloprojects.com"
              className="inline-flex items-center px-8 py-3.5 rounded-full text-base font-medium transition-all hover:scale-[1.02]"
              style={{
                background: "var(--sage)",
                color: "var(--pure-white)",
              }}
            >
              Schedule a call
            </a>
          </div>
          <p
            className="mt-6 text-sm"
            style={{ color: "var(--bark-faded)" }}
          >
            or email{" "}
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
