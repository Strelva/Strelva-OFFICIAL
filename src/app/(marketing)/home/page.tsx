import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Scaffold Web - AI website management for local businesses",
  description:
    "A managed website, weekly proof report, and AI update path for local businesses that need calls, bookings, visits, and trust.",
};

const reportRows = [
  ["People found you", "47", "+12 this week"],
  ["Booking clicks", "8", "3 from mobile"],
  ["Updates handled", "3", "human checked"],
];

const receiptSteps = [
  "Weekly report sent",
  "Owner asks for Saturday hours",
  "Draft update written",
  "Human review before publish",
];

const accessRows = [
  ["Ask", "Tell us the one job your website should handle first."],
  ["Fit", "We check whether the beta can help before a build starts."],
  ["Loop", "The website, weekly report, and update path open together."],
];

const proofBadges = [
  { Icon: FileCheck2, label: "Weekly report before the invoice recurs" },
  { Icon: ClipboardCheck, label: "Updates reviewed before publish" },
  { Icon: Clock3, label: "The first request takes about one minute" },
];

function WeeklyReceipt() {
  return (
    <div
      aria-label="Preview of the Scaffold Web weekly receipt and update path"
      className="motion-rise mx-auto w-full max-w-[1120px]"
      style={{ "--motion-delay": "160ms" } as React.CSSProperties}
    >
      <div className="marketing-system-frame relative overflow-hidden rounded-[22px] border border-[var(--m-rule)] bg-[var(--m-paper)] shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)]">
        <div className="grid border-b border-[var(--m-rule-soft)] md:grid-cols-[0.95fr_1.05fr]">
          <div className="flex min-h-16 items-center gap-3 px-5 py-4 sm:px-7">
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--m-rule)] bg-[var(--m-panel)] text-[color:var(--m-accent)]">
              <FileCheck2 className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-[color:var(--m-text)]">Monday receipt</p>
              <p className="mt-0.5 text-[12px] text-[color:var(--m-text-3)]">Report sent, request handled, review queued</p>
            </div>
          </div>
          <div className="hidden items-center justify-end gap-2 px-7 text-[12px] text-[color:var(--m-text-3)] md:flex">
            <span className="h-px w-14 bg-[var(--m-rule)]" />
            Private beta preview
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
          <section className="border-b border-[var(--m-rule-soft)] p-5 sm:p-7 md:border-b-0 md:border-r">
            <p className="text-[13px] text-[color:var(--m-text-3)]">Owner message</p>
            <div className="mt-4 rounded-[16px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--m-accent-soft)] text-[color:var(--m-accent)]">
                  <MessageSquareText className="size-4" />
                </span>
                <p className="max-w-[440px] text-[15px] leading-[1.55] text-[color:var(--m-text)]">
                  Add the new Saturday class, update the booking link, and tell me if people found the page this week.
                </p>
              </div>
            </div>

            <div className="relative mt-7 grid gap-3">
              <div className="process-line" aria-hidden="true" />
              {receiptSteps.map((label, index) => (
                <div key={label} className="motion-item relative flex items-center gap-3" style={{ "--i": index } as React.CSSProperties}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--m-rule)] bg-[var(--m-bg)] text-[11px] text-[color:var(--m-text-3)]">
                    {index + 1}
                  </span>
                  <span className="text-[14px] leading-[1.45] text-[color:var(--m-text-2)]">{label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 sm:p-7">
            <div className="grid gap-3">
              {reportRows.map(([label, value, detail], index) => (
                <div
                  key={label}
                  className="motion-item grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--m-rule-soft)] py-4 last:border-b-0"
                  style={{ "--i": index + 2 } as React.CSSProperties}
                >
                  <div>
                    <p className="text-[14px] text-[color:var(--m-text-2)]">{label}</p>
                    <p className="mt-1 text-[12px] text-[color:var(--m-text-3)]">{detail}</p>
                  </div>
                  <span className="font-mono text-[28px] font-semibold tabular-nums leading-none text-[color:var(--m-text)]">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 rounded-[16px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-4">
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
    </div>
  );
}

function AccessPath() {
  return (
    <section className="motion-rise mx-auto w-full max-w-[1120px]" style={{ "--motion-delay": "260ms" } as React.CSSProperties}>
      <div className="grid gap-4 md:grid-cols-[0.72fr_1.28fr] md:items-stretch">
        <div className="rounded-[22px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-5 sm:p-6">
          <p className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--m-accent)]">
            <Send className="size-4" />
            Access request path
          </p>
          <h2 className="mt-5 text-3xl font-semibold leading-[0.98] tracking-normal text-[color:var(--m-text)] sm:text-4xl">
            One practical answer starts the review.
          </h2>
          <p className="mt-4 max-w-[430px] text-[15px] leading-[1.65] text-[color:var(--m-text-2)]">
            The request asks what should improve first. No payment, no portal setup, no full business plan.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <Link href="/access-request?ref=home-signup-path" className="marketing-button-primary">
              Request access
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/sign-up" className="marketing-button-secondary">
              Already invited
            </Link>
          </div>
        </div>

        <ol className="rounded-[22px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)]">
          {accessRows.map(([title, copy], index) => (
            <li
              key={title}
              className="motion-item grid gap-3 border-b border-[var(--m-rule-soft)] p-5 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:p-6"
              style={{ "--i": index } as React.CSSProperties}
            >
              <span className="text-[13px] font-medium text-[color:var(--m-text)]">
                {title}
              </span>
              <p className="max-w-[520px] text-[14px] leading-[1.65] text-[color:var(--m-text-2)]">
                {copy}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden px-5 pt-28 md:px-8">
      <main className="relative z-10 mx-auto max-w-[1400px]">
        <section className="grid gap-10 pb-20 pt-8 lg:gap-12">
          <div className="motion-rise mx-auto max-w-[1120px] text-center">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--m-rule-soft)] bg-[var(--m-panel)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--m-text-2)]">
              <CircleDot className="size-3.5 text-[color:var(--m-accent)]" />
              Private beta for local operators
            </p>
            <h1
              className="mx-auto mt-7 max-w-[1080px] font-semibold leading-[0.88] tracking-normal text-[color:var(--m-text)]"
              style={{ fontSize: "clamp(4.35rem, 10.4vw, 9.6rem)" }}
            >
              Scaffold Web
            </h1>
            <p className="mx-auto mt-7 max-w-[820px] text-2xl font-medium leading-[1.15] tracking-normal text-[color:var(--m-text)] sm:text-3xl md:text-4xl">
              See what is working. Tell the AI what to change.
            </p>
            <p className="mx-auto mt-5 max-w-[640px] text-[17px] leading-[1.7] text-[color:var(--m-text-2)]">
              A managed website loop for local businesses that need calls, bookings, visits, and trust without becoming the website operator.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/access-request?ref=home-hero" className="marketing-button-primary">
                Request access
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/sign-up" className="marketing-button-secondary">
                I have an invite
              </Link>
            </div>
          </div>

          <WeeklyReceipt />
          <AccessPath />

          <div className="motion-rise mx-auto grid w-full max-w-[1120px] gap-3 border-t border-[var(--m-rule-soft)] pt-7 sm:grid-cols-3" style={{ "--motion-delay": "320ms" } as React.CSSProperties}>
            {proofBadges.map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-[13px] leading-[1.5] text-[color:var(--m-text-2)]">
                <Icon className="size-4 shrink-0 text-[color:var(--m-accent)]" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
