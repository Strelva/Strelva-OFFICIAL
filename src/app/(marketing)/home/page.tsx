import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Scaffold Web - The website loop local businesses can trust",
  description:
    "Join the free website waitlist for local businesses that want weekly proof, plain-English updates, and a site that stays current.",
};

const reportRows = [
  ["People found you", "47", "12 more than last week"],
  ["Booking clicks", "8", "3 came from mobile"],
  ["Updates handled", "3", "checked before publish"],
];

const proofBadges = [
  { Icon: FileCheck2, label: "Free first site" },
  { Icon: ClipboardCheck, label: "Weekly proof report" },
  { Icon: Clock3, label: "Plain-English updates" },
];

const momentumItems = [
  "Site updates",
  "Weekly reports",
  "Reviews",
  "Email",
  "Social",
  "Follow-ups",
];

function MomentumPanel() {
  return (
    <div className="mt-4 rounded-[18px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium text-[color:var(--m-accent)]">The site loop comes first</p>
        <span className="text-[12px] text-[color:var(--m-text-3)]">then the rest compounds</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {momentumItems.map((item, index) => (
          <span
            key={item}
            className="motion-item rounded-md border border-[var(--m-rule-soft)] bg-[var(--m-bg)] px-2.5 py-2 text-[12px] leading-tight text-[color:var(--m-text-2)]"
            style={{ "--i": index } as React.CSSProperties}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReceiptPanel() {
  return (
    <div
      aria-label="Preview of the Scaffold Web weekly receipt and update path"
      className="marketing-system-frame motion-rise relative overflow-hidden rounded-[22px] border border-[var(--m-rule)] bg-[var(--m-paper)] shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)]"
      style={{ "--motion-delay": "120ms" } as React.CSSProperties}
    >
      <span className="receipt-scan" aria-hidden="true" />
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--m-rule-soft)] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--m-rule)] bg-[var(--m-panel)] text-[color:var(--m-accent)]">
            <FileCheck2 className="size-4" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-[color:var(--m-text)]">Monday receipt</p>
            <p className="mt-0.5 text-[12px] text-[color:var(--m-text-3)]">Report sent. Request handled.</p>
          </div>
        </div>
        <span className="hidden text-[12px] text-[color:var(--m-text-3)] sm:inline">
          Website proof loop
        </span>
      </div>

      <div className="grid gap-0 md:grid-cols-[0.86fr_1.14fr]">
        <section className="border-b border-[var(--m-rule-soft)] p-5 md:border-b-0 md:border-r md:p-6">
          <p className="text-[13px] text-[color:var(--m-text-3)]">Owner asks</p>
          <div className="mt-4 rounded-[16px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--m-accent-soft)] text-[color:var(--m-accent)]">
                <MessageSquareText className="size-4" />
              </span>
              <p className="text-[15px] leading-[1.55] text-[color:var(--m-text)]">
                Add the Saturday class and booking link before Friday.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {["Report sent", "Update drafted", "Reviewed before publish"].map((label, index) => (
              <div key={label} className="motion-item flex items-center gap-3" style={{ "--i": index } as React.CSSProperties}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--m-rule)] bg-[var(--m-bg)] text-[10px] text-[color:var(--m-text-3)]">
                  {index + 1}
                </span>
                <span className="text-[13px] leading-[1.35] text-[color:var(--m-text-2)]">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 md:p-6">
          <div className="grid gap-1">
            {reportRows.map(([label, value, detail], index) => (
              <div
                key={label}
                className="motion-item grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--m-rule-soft)] py-3 last:border-b-0"
                style={{ "--i": index + 2 } as React.CSSProperties}
              >
                <div>
                  <p className="text-[14px] text-[color:var(--m-text-2)]">{label}</p>
                  <p className="mt-1 text-[12px] text-[color:var(--m-text-3)]">{detail}</p>
                </div>
                <span className="font-mono text-[30px] font-semibold tabular-nums leading-none text-[color:var(--m-text)]">
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 rounded-[16px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-[13px] text-[color:var(--m-text-2)]">
                <ShieldCheck className="size-4 text-[color:var(--m-success)]" />
                Ready for review
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--m-accent)]">
                <span className="signal-dot" aria-hidden="true" />
                Queued
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--m-bg)]">
              <span className="progress-run block h-full rounded-full bg-[var(--m-accent)]" />
            </div>
          </div>
          <MomentumPanel />
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <style>{`
        .marketing-footer {
          display: none;
        }
      `}</style>
      <div className="relative h-[100svh] overflow-hidden px-5 pt-20 md:px-8 md:pt-24">
        <main className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col">
        <section className="grid min-h-0 flex-1 items-center gap-5 pb-4 pt-2 lg:grid-cols-[0.86fr_1.14fr] lg:gap-10">
          <div className="motion-rise min-w-0">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--m-rule-soft)] bg-[var(--m-panel)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--m-text-2)] sm:text-[13px]">
              <Activity className="size-3.5 text-[color:var(--m-accent)]" />
              The managed website loop for local businesses
            </p>
            <h1
              className="max-w-[920px] font-semibold leading-[0.9] tracking-normal text-[color:var(--m-text)]"
              style={{ fontSize: "clamp(3.05rem, 7.45vw, 7.9rem)" }}
            >
              Your website should report back.
            </h1>
            <p className="mt-4 max-w-[760px] text-[1.35rem] font-medium leading-[1.12] tracking-normal text-[color:var(--m-text)] sm:text-3xl md:text-4xl">
              Weekly proof, fast updates, and human review before the public site changes.
            </p>
            <p className="mt-4 max-w-[610px] text-[15px] leading-[1.58] text-[color:var(--m-text-2)] sm:text-[17px] sm:leading-[1.65]">
              Scaffold Web builds the site, watches what worked, and handles the small changes owners usually postpone. The first loop is simple: people found you, you ask for an update, the site stays current.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/access-request?ref=home-hero" className="marketing-button-primary">
                Join the free-site waitlist
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/sign-up" className="marketing-button-secondary">
                I have an invite
              </Link>
            </div>
          </div>

          <div className="hidden md:block">
            <ReceiptPanel />
          </div>

          <div className="hidden sm:block md:hidden">
            <ReceiptPanel />
          </div>
        </section>

        <div className="motion-rise hidden shrink-0 gap-3 border-t border-[var(--m-rule-soft)] py-4 sm:grid sm:grid-cols-3" style={{ "--motion-delay": "220ms" } as React.CSSProperties}>
          {proofBadges.map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-[13px] leading-[1.5] text-[color:var(--m-text-2)]">
              <Icon className="size-4 shrink-0 text-[color:var(--m-accent)]" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </main>
      </div>
    </>
  );
}
