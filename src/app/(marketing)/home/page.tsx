import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Scaffold Web - Managed website operations for local businesses",
  description:
    "Scaffold Web builds and manages local business websites with a weekly plain-English receipt and a simple update path.",
};

const receiptLines = [
  ["Found", "42 local visits from search and direct links"],
  ["Clicked", "7 booking clicks, 3 calls, 2 menu views"],
  ["Changed", "Hours fixed, new class added, old promo removed"],
  ["Next", "Post the Saturday opening before Thursday noon"],
];

function ReceiptArtifact() {
  return (
    <div
      aria-label="Weekly website receipt"
      className="receipt-artifact-stage motion-rise"
      style={{ "--motion-delay": "120ms" } as React.CSSProperties}
    >
      <div className="receipt-artifact" aria-hidden="true">
        <span className="receipt-artifact-scan" />
        <div className="receipt-artifact-top">
          <span>Monday, 8:12 AM</span>
          <strong>Scaffold Web</strong>
        </div>
        <p className="receipt-artifact-lead">
          People found you this week. One update is worth making before the weekend.
        </p>
        <div className="receipt-artifact-list">
          {receiptLines.map(([label, detail], index) => (
            <div
              key={label}
              className="receipt-artifact-row motion-item"
              style={{ "--i": index } as React.CSSProperties}
            >
              <span>{label}</span>
              <p>{detail}</p>
            </div>
          ))}
        </div>
        <p className="receipt-artifact-foot">Owner note: add the Saturday opening. Publish only after review.</p>
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

        .receipt-artifact-stage {
          position: relative;
          min-height: min(500px, calc(100svh - 11rem));
        }

        .receipt-artifact-stage::before {
          position: absolute;
          inset: 12% 7% 4% auto;
          width: 42%;
          content: "";
          border-radius: 999px;
          background: oklch(72% 0.1 178 / 0.12);
          filter: blur(52px);
        }

        .receipt-artifact {
          position: relative;
          width: min(100%, 520px);
          min-height: min(440px, calc(100svh - 12.5rem));
          margin-left: auto;
          overflow: hidden;
          padding: clamp(1.15rem, 2vw, 1.55rem);
          border: 1px solid oklch(75% 0.05 88 / 0.28);
          border-radius: 8px;
          background:
            linear-gradient(180deg, oklch(91% 0.014 82 / 0.97), oklch(83% 0.018 84 / 0.94)),
            var(--m-text);
          color: oklch(18% 0.011 248);
          box-shadow: 0 34px 95px oklch(4% 0.01 255 / 0.48);
          transform: rotate(-1.1deg);
          isolation: isolate;
        }

        .receipt-artifact::before,
        .receipt-artifact::after {
          position: absolute;
          right: 0;
          left: 0;
          height: 18px;
          content: "";
          background:
            radial-gradient(circle at 9px 0, transparent 8px, oklch(88% 0.015 82 / 0.98) 8.5px) repeat-x;
          background-size: 18px 18px;
          opacity: 0.7;
        }

        .receipt-artifact::before {
          top: -1px;
        }

        .receipt-artifact::after {
          bottom: -1px;
          transform: rotate(180deg);
        }

        .receipt-artifact-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          color: oklch(28% 0.012 248 / 0.72);
          font-size: 0.78rem;
        }

        .receipt-artifact-top strong {
          color: oklch(20% 0.014 248);
          font-weight: 700;
        }

        .receipt-artifact-lead {
          margin-top: clamp(1.5rem, 3vw, 2.45rem);
          max-width: 32rem;
          color: oklch(16% 0.012 248);
          font-size: clamp(1.18rem, 2.05vw, 1.55rem);
          font-weight: 700;
          letter-spacing: 0;
          line-height: 1.15;
        }

        .receipt-artifact-list {
          display: grid;
          margin-top: clamp(1.3rem, 2.5vw, 1.9rem);
          border-top: 1px solid oklch(45% 0.014 248 / 0.24);
        }

        .receipt-artifact-row {
          display: grid;
          grid-template-columns: 5.8rem minmax(0, 1fr);
          gap: 1.15rem;
          padding: 0.82rem 0;
          border-bottom: 1px solid oklch(45% 0.014 248 / 0.24);
        }

        .receipt-artifact-row span {
          color: oklch(30% 0.018 178);
          font-size: 0.78rem;
          font-weight: 800;
        }

        .receipt-artifact-row p {
          color: oklch(24% 0.012 248 / 0.82);
          font-size: 0.92rem;
          line-height: 1.42;
        }

        .receipt-artifact-foot {
          margin-top: clamp(1.4rem, 3vw, 2rem);
          color: oklch(22% 0.012 248 / 0.72);
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .receipt-artifact-scan {
          position: absolute;
          inset: -26% 0 auto;
          z-index: -1;
          height: 36%;
          pointer-events: none;
          background: linear-gradient(180deg, transparent, oklch(72% 0.1 178 / 0.18), transparent);
          transform: translate3d(0, -40%, 0);
          animation: receipt-artifact-scan 5400ms var(--m-ease-expo, cubic-bezier(0.16, 1, 0.3, 1)) 700ms infinite;
        }

        @keyframes receipt-artifact-scan {
          0%,
          38% {
            opacity: 0;
            transform: translate3d(0, -40%, 0);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 340%, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .receipt-artifact-scan {
            animation: none;
          }
        }
      `}</style>
      <div className="relative h-[100svh] overflow-hidden px-5 pt-[4.25rem] md:px-8 md:pt-16">
        <main className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col">
          <section className="grid min-h-0 flex-1 items-center gap-8 pb-4 pt-2 xl:grid-cols-[minmax(0,0.92fr)_minmax(430px,0.88fr)] xl:gap-12">
            <div className="motion-rise min-w-0">
              <p className="mb-3 text-[13px] font-medium text-[color:var(--m-accent)]">
                Managed website operations for local businesses
              </p>
              <h1
                className="max-w-[790px] font-semibold leading-[0.91] tracking-normal text-[color:var(--m-text)]"
                style={{ fontSize: "clamp(2.7rem, 5.1vw, 5.45rem)" }}
              >
                Your website should report back and know what to do next.
              </h1>
              <p className="mt-4 max-w-[650px] text-[1.08rem] font-medium leading-[1.26] tracking-normal text-[color:var(--m-text)] sm:text-[1.28rem] md:text-[1.42rem]">
                Scaffold Web builds and runs the site behind your calls, bookings, visits, and trust. You see what worked, ask for changes in normal language, and approve before the public site changes.
              </p>
              <p className="mt-3 max-w-[610px] text-[15px] leading-[1.5] text-[color:var(--m-text-2)] sm:text-[16px] sm:leading-[1.55]">
                Every week, your site sends a plain-English receipt: who found you, what they clicked, what changed, and the next move worth making.
              </p>
              <p className="mt-2 max-w-[610px] text-[15px] leading-[1.5] text-[color:var(--m-text-2)] sm:text-[16px] sm:leading-[1.55]">
                Tell it what changed. Approve before it goes live.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Link href="/access-request?ref=home-hero" className="marketing-button-primary">
                  Get my free first site
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>

            <div className="hidden xl:block">
              <ReceiptArtifact />
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
