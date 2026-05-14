import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Scaffold Web - Free websites for local businesses",
  description:
    "Request a free site for your local business, built for calls, bookings, and trust.",
};

const reportRows = [
  ["People found you", "47", "+12 this week"],
  ["Booking clicks", "8", "3 from mobile"],
  ["Updates handled", "3", "human checked"],
];

const proofBadges = [
  { Icon: FileCheck2, label: "Free site request" },
  { Icon: ClipboardCheck, label: "Built for calls and bookings" },
  { Icon: Clock3, label: "One-minute form" },
];

function ReceiptPanel() {
  return (
    <div
      aria-label="Preview of the Scaffold Web weekly receipt and update path"
      className="marketing-system-frame motion-rise relative overflow-hidden rounded-[22px] border border-[var(--m-rule)] bg-[var(--m-paper)] shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)]"
      style={{ "--motion-delay": "120ms" } as React.CSSProperties}
    >
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
                Add the Saturday class and booking link.
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
              <span className="text-[12px] text-[color:var(--m-accent)]">Queued</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--m-bg)]">
              <span className="progress-run block h-full rounded-full bg-[var(--m-accent)]" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileProofPanel() {
  return (
    <div className="motion-rise mt-6 rounded-[18px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-4 md:hidden" style={{ "--motion-delay": "120ms" } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--m-rule)] bg-[var(--m-panel)] text-[color:var(--m-accent)]">
          <FileCheck2 className="size-4" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-[color:var(--m-text)]">Free site request</p>
          <p className="mt-0.5 text-[12px] text-[color:var(--m-text-3)]">Built for calls, bookings, and trust.</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--m-rule-soft)] pt-4">
        <div>
          <p className="font-mono text-2xl font-semibold leading-none text-[color:var(--m-text)]">47</p>
          <p className="mt-1 text-[11px] leading-[1.25] text-[color:var(--m-text-3)]">people found you</p>
        </div>
        <div>
          <p className="font-mono text-2xl font-semibold leading-none text-[color:var(--m-text)]">8</p>
          <p className="mt-1 text-[11px] leading-[1.25] text-[color:var(--m-text-3)]">booking clicks</p>
        </div>
        <div>
          <p className="font-mono text-2xl font-semibold leading-none text-[color:var(--m-text)]">3</p>
          <p className="mt-1 text-[11px] leading-[1.25] text-[color:var(--m-text-3)]">updates handled</p>
        </div>
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
      <div className="relative h-[100svh] overflow-hidden px-5 pt-24 md:px-8">
        <main className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col">
          <section className="grid min-h-0 flex-1 items-center gap-6 pb-6 pt-4 lg:grid-cols-[0.86fr_1.14fr] lg:gap-10">
            <div className="motion-rise min-w-0">
              <h1
                className="max-w-[820px] font-semibold leading-[0.88] tracking-normal text-[color:var(--m-text)]"
                style={{ fontSize: "clamp(3.5rem, 8vw, 8.2rem)" }}
              >
                Get a free site.
              </h1>
              <p className="mt-5 max-w-[720px] text-[1.65rem] font-medium leading-[1.12] tracking-normal text-[color:var(--m-text)] sm:text-3xl md:text-4xl">
                Built for local businesses that need calls, bookings, and trust.
              </p>
              <p className="mt-5 max-w-[560px] text-[17px] leading-[1.65] text-[color:var(--m-text-2)]">
                Request the site. We build the first version free.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/access-request?ref=home-hero" className="marketing-button-primary">
                  Request a free site
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/sign-up" className="marketing-button-secondary">
                  I have an invite
                </Link>
              </div>
              <MobileProofPanel />
            </div>

            <div className="hidden md:block">
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
