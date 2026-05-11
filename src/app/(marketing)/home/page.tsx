import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Mail,
  MessageCircle,
  MousePointer2,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS,
  SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Scaffold Web - AI website management for small business",
  description: `See what is working. Tell the AI what to change. A custom website, weekly proof, and an AI agent for ${SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL}.`,
};

const steps = [
  {
    number: "01",
    title: "Build",
    copy: "We build a custom website for your business that is fast, mobile-friendly, and built to convert.",
  },
  {
    number: "02",
    title: "Watch",
    copy: "Every week you get plain-English proof of what is working, what changed, and what to improve.",
  },
  {
    number: "03",
    title: "Text",
    copy: "Tell the AI what to change. Your site gets updated and the results show up in next week's report.",
  },
];

const included = [
  ["Custom website", "Built for your business and goals"],
  ["Unlimited updates", "Text as many changes as you want"],
  ["Weekly performance report", "Clear metrics and improvement ideas"],
  ["Lead capture", "Forms, calls, and messages tracked"],
  ["AI website agent", "Text changes, we handle the rest"],
  ["Secure and reliable", "Hosting, backups, and SSL included"],
  ["Mobile-first and fast", "Looks good and loads fast everywhere"],
  ["Ongoing improvements", "We continuously optimize your site"],
  ["SEO basics", "Set up to get found on Google"],
  ["Cancel anytime", "No contracts. Pause or cancel anytime."],
];

const reportRows = [
  { icon: Users, label: "Site visitors", value: "1,247", delta: "+18%" },
  { icon: MousePointer2, label: "Leads", value: "38", delta: "+19%" },
  { icon: MessageCircle, label: "Calls", value: "27", delta: "+29%" },
  { icon: Mail, label: "Form submissions", value: "11", delta: "+10%" },
];

const pricingRows = [
  "Everything included",
  "Unlimited updates",
  "Weekly performance reports",
  "AI website agent",
  "Cancel anytime",
];

export default function HomePage() {
  return (
    <div
      className="overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% -12%, rgba(37, 99, 235, 0.13), transparent 34%), var(--m-bg)",
      }}
    >
      <section className="px-5 pb-12 pt-16 sm:pt-20 md:px-8 lg:pb-16 lg:pt-28">
        <div className="mx-auto max-w-[1280px] text-center">
          <h1
            className="mx-auto max-w-[1050px] text-[54px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[74px] md:text-[92px] lg:text-[104px]"
            style={{ color: "var(--m-text)" }}
          >
            See what&apos;s working.
            <br />
            Tell the AI what to change.
          </h1>
          <p
            className="mx-auto mt-7 max-w-[640px] text-[18px] leading-[1.55] sm:text-[20px]"
            style={{ color: "var(--m-text-2)" }}
          >
            A custom website, weekly proof, and an AI agent that handles updates
            for {SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL}.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/onboard"
              className="inline-flex h-14 min-w-[168px] items-center justify-center rounded-[8px] px-7 text-[16px] font-medium transition-transform hover:-translate-y-0.5"
              style={{
                background: "var(--m-accent)",
                color: "white",
                boxShadow: "0 18px 48px rgba(38, 111, 255, 0.28)",
              }}
            >
              Get started
            </Link>
            <a
              href="#included"
              className="inline-flex h-14 min-w-[210px] items-center justify-center rounded-[8px] border px-7 text-[16px] font-medium transition-colors hover:bg-white/[0.04]"
              style={{
                borderColor: "var(--m-rule)",
                color: "var(--m-text)",
              }}
            >
              See the weekly report
            </a>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-t px-5 py-14 md:px-8 md:py-18"
        style={{ borderColor: "var(--m-rule-soft)" }}
      >
        <div className="mx-auto max-w-[1320px]">
          <h2
            className="text-[34px] font-semibold tracking-[-0.035em] md:text-[42px]"
            style={{ color: "var(--m-text)" }}
          >
            How it works
          </h2>
          <div className="mt-10 grid gap-0 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="border-t py-8 md:border-l md:border-t-0 md:px-10 md:first:border-l-0"
                style={{ borderColor: "var(--m-rule)" }}
              >
                <div
                  className="text-[34px] font-semibold leading-none tracking-[-0.04em]"
                  style={{ color: "var(--m-accent)" }}
                >
                  {step.number}
                </div>
                <h3
                  className="mt-6 text-[24px] font-semibold tracking-[-0.035em]"
                  style={{ color: "var(--m-text)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="mt-3 max-w-[310px] text-[15px] leading-[1.6]"
                  style={{ color: "var(--m-text-2)" }}
                >
                  {step.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="included"
        className="border-t px-5 py-14 md:px-8 md:py-18"
        style={{ borderColor: "var(--m-rule-soft)" }}
      >
        <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[1fr_0.92fr] lg:items-start">
          <div>
            <h2
              className="text-[34px] font-semibold tracking-[-0.035em] md:text-[42px]"
              style={{ color: "var(--m-text)" }}
            >
              Included
            </h2>
            <div className="mt-9 grid gap-x-12 gap-y-7 sm:grid-cols-2">
              {included.map(([title, copy]) => (
                <div key={title} className="flex gap-4">
                  <Check
                    className="mt-1 size-4 shrink-0"
                    style={{ color: "var(--m-accent)" }}
                    strokeWidth={2.2}
                  />
                  <div>
                    <h3
                      className="text-[17px] font-medium tracking-[-0.015em]"
                      style={{ color: "var(--m-text)" }}
                    >
                      {title}
                    </h3>
                    <p
                      className="mt-1 text-[14px] leading-[1.5]"
                      style={{ color: "var(--m-text-3)" }}
                    >
                      {copy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <WeeklyReportPreview />
        </div>
      </section>

      <section
        id="pricing"
        className="border-t px-5 py-14 md:px-8 md:py-18"
        style={{ borderColor: "var(--m-rule-soft)" }}
      >
        <div className="mx-auto max-w-[1320px]">
          <h2
            className="text-center text-[34px] font-semibold tracking-[-0.035em] md:text-[42px]"
            style={{ color: "var(--m-text)" }}
          >
            Pricing
          </h2>
          <div className="mx-auto mt-7 max-w-[500px] rounded-[8px] border p-7 md:p-9" style={{ borderColor: "var(--m-rule)", background: "var(--m-surface)" }}>
            <p className="text-center text-[15px]" style={{ color: "var(--m-text-2)" }}>
              Simple, transparent pricing
            </p>
            <div className="mt-4 flex items-end justify-center gap-1">
              <span
                className="text-[56px] font-semibold leading-none tracking-[-0.055em]"
                style={{ color: "var(--m-text)" }}
              >
                ${SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS}
              </span>
              <span className="pb-2 text-[22px]" style={{ color: "var(--m-text)" }}>
                /mo
              </span>
            </div>
            <p className="mt-2 text-center text-[14px]" style={{ color: "var(--m-text-3)" }}>
              Everything you need to grow online.
            </p>
            <div className="mt-7 border-t pt-5" style={{ borderColor: "var(--m-rule)" }}>
              {pricingRows.map((row) => (
                <div key={row} className="flex items-center gap-3 py-2">
                  <Check className="size-4" style={{ color: "var(--m-accent)" }} strokeWidth={2.2} />
                  <span className="text-[15px]" style={{ color: "var(--m-text)" }}>
                    {row}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-t px-5 py-16 text-center md:px-8 md:py-20"
        style={{ borderColor: "var(--m-rule-soft)" }}
      >
        <h2
          className="text-[36px] font-semibold tracking-[-0.04em] md:text-[52px]"
          style={{ color: "var(--m-text)" }}
        >
          Ready to grow your business?
        </h2>
        <p className="mx-auto mt-4 max-w-[540px] text-[17px]" style={{ color: "var(--m-text-2)" }}>
          Get your custom website and weekly proof, starting today.
        </p>
        <Link
          href="/onboard"
          className="mt-8 inline-flex h-13 items-center justify-center rounded-[8px] px-7 text-[16px] font-medium transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--m-accent)", color: "white" }}
        >
          Get started
        </Link>
      </section>
    </div>
  );
}

function ProductPreview() {
  return (
    <div
      className="mx-auto mt-14 grid max-w-[1180px] gap-0 overflow-hidden rounded-[8px] border text-left shadow-2xl md:grid-cols-[0.92fr_1.12fr_0.92fr]"
      style={{
        borderColor: "var(--m-rule)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.052), rgba(255,255,255,0.018))",
        boxShadow: "0 38px 120px rgba(0, 0, 0, 0.46)",
      }}
    >
      <PreviewColumn title="Your weekly report is ready">
        <p className="mt-5 text-[15px] leading-[1.6]" style={{ color: "var(--m-text-2)" }}>
          Here&apos;s how your site performed May 12 - May 18, 2026.
        </p>
        <a
          href="#included"
          className="mt-16 inline-flex items-center gap-2 rounded-[7px] border px-5 py-3 text-[14px] font-medium"
          style={{ borderColor: "var(--m-rule)", color: "var(--m-text)" }}
        >
          Open full report
          <ArrowRight className="size-4" />
        </a>
      </PreviewColumn>

      <PreviewColumn title="Site visitors" className="border-y md:border-x md:border-y-0">
        <div className="mt-5 flex items-end gap-3">
          <span
            className="text-[40px] font-semibold leading-none tracking-[-0.04em]"
            style={{ color: "var(--m-text)" }}
          >
            1,247
          </span>
          <span className="pb-1 text-[15px]" style={{ color: "var(--m-accent)" }}>
            +18%
          </span>
        </div>
        <p className="mt-2 text-[14px]" style={{ color: "var(--m-text-3)" }}>
          vs May 5 - May 11
        </p>
        <MiniChart />
      </PreviewColumn>

      <PreviewColumn title="Ask the AI to make a change">
        <div
          className="mt-5 min-h-[108px] rounded-[7px] border p-5 text-[15px] leading-[1.55]"
          style={{ borderColor: "var(--m-rule)", color: "var(--m-text-2)" }}
        >
          Try &quot;Add a new service for Gutter Cleaning&quot;
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="max-w-[220px] text-[13px] leading-[1.45]" style={{ color: "var(--m-text-3)" }}>
            The AI will update your site and deliver next week&apos;s proof.
          </p>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--m-accent)", color: "white" }}
          >
            <Send className="size-4" />
          </span>
        </div>
      </PreviewColumn>
    </div>
  );
}

function PreviewColumn({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-h-[260px] p-7 md:p-10 ${className}`}
      style={{ borderColor: "var(--m-rule)" }}
    >
      <h3 className="text-[17px] font-medium tracking-[-0.02em]" style={{ color: "var(--m-text)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function MiniChart() {
  return (
    <div className="mt-8 h-[118px]">
      <svg viewBox="0 0 360 140" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--m-accent)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--m-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M12 118 C40 108 48 88 76 94 C102 99 100 70 130 78 C156 86 166 64 190 64 C220 64 220 40 250 42 C282 44 282 58 312 44 C334 34 342 22 352 17 L352 132 L12 132 Z"
          fill="url(#chartFill)"
        />
        <path
          d="M12 118 C40 108 48 88 76 94 C102 99 100 70 130 78 C156 86 166 64 190 64 C220 64 220 40 250 42 C282 44 282 58 312 44 C334 34 342 22 352 17"
          fill="none"
          stroke="var(--m-accent)"
          strokeLinecap="round"
          strokeWidth="4"
        />
        {[42, 76, 110].map((y) => (
          <line
            key={y}
            x1="0"
            x2="360"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}

function WeeklyReportPreview() {
  return (
    <div
      className="rounded-[8px] border p-6 md:p-8"
      style={{
        borderColor: "var(--m-rule)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))",
        boxShadow: "0 28px 90px rgba(0, 0, 0, 0.32)",
      }}
    >
      <div className="flex items-center justify-between gap-5">
        <h3 className="text-[18px] font-medium tracking-[-0.02em]" style={{ color: "var(--m-text)" }}>
          Weekly report preview
        </h3>
        <span className="text-[12px]" style={{ color: "var(--m-text-3)" }}>
          May 12 - May 18, 2026
        </span>
      </div>
      <div className="mt-6 border-t" style={{ borderColor: "var(--m-rule)" }}>
        {reportRows.map((row) => (
          <ReportRow key={row.label} {...row} />
        ))}
        <div className="grid grid-cols-[36px_1fr_auto] gap-4 border-b py-5" style={{ borderColor: "var(--m-rule)" }}>
          <BarChart3 className="mt-1 size-5" style={{ color: "var(--m-text-2)" }} strokeWidth={1.8} />
          <div>
            <div className="text-[15px]" style={{ color: "var(--m-text)" }}>
              Top performing page
            </div>
            <div className="mt-1 text-[13px]" style={{ color: "var(--m-text-3)" }}>
              362 views
            </div>
          </div>
          <div className="text-right text-[15px]" style={{ color: "var(--m-text)" }}>
            /services/roofing
          </div>
        </div>
      </div>
      <p className="mt-6 text-[14px] leading-[1.55]" style={{ color: "var(--m-text-3)" }}>
        See the full report for insights and recommendations.
      </p>
      <a
        href="#pricing"
        className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium"
        style={{ color: "var(--m-accent)" }}
      >
        View full report
        <ArrowRight className="size-4" />
      </a>
    </div>
  );
}

function ReportRow({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div
      className="grid grid-cols-[36px_1fr_auto_auto] items-center gap-4 border-b py-5"
      style={{ borderColor: "var(--m-rule)" }}
    >
      <Icon className="size-5" style={{ color: "var(--m-text-2)" }} strokeWidth={1.8} />
      <span className="text-[15px]" style={{ color: "var(--m-text)" }}>
        {label}
      </span>
      <span className="text-[22px] font-medium tracking-[-0.03em]" style={{ color: "var(--m-text)" }}>
        {value}
      </span>
      <span className="text-[14px]" style={{ color: "var(--m-accent)" }}>
        {delta}
      </span>
    </div>
  );
}
