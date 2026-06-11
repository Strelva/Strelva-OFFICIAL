import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroWordRotator } from "@/components/marketing/HeroWordRotator";

export const metadata: Metadata = {
  title: "Strelva - Managed website operations for local businesses",
  description:
    "Strelva builds and manages local business websites with a weekly plain-English receipt and a simple update path.",
};

export default function HomePage() {
  return (
    <>
      <style>{`
        .marketing-footer {
          display: none;
        }

        .hero-word-single {
          animation: hero-word-single 560ms var(--m-ease-expo, cubic-bezier(0.16, 1, 0.3, 1)) both;
        }

        @keyframes hero-word-single {
          from {
            opacity: 0;
            transform: translate3d(0, 32%, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-word-single {
            animation: none;
            transform: none;
          }
        }
      `}</style>
      <div className="relative h-[100svh] overflow-hidden px-5 pt-[4.25rem] md:px-8 md:pt-16">
        <main className="relative z-10 mx-auto flex h-full max-w-[1240px] flex-col">
          <section className="flex min-h-0 flex-1 items-center justify-center pb-5 pt-2 text-center">
            <div className="motion-rise flex max-w-[960px] min-w-0 flex-col items-center">
              <h1
                className="max-w-[980px] font-semibold leading-[0.92] tracking-normal text-[color:var(--m-text)]"
                style={{ fontSize: "clamp(3.25rem, 7.3vw, 7.45rem)" }}
              >
                <span>A site that keeps up when you change</span>
                <HeroWordRotator />
              </h1>
              <p className="mt-6 max-w-[660px] text-[17px] leading-[1.55] tracking-normal text-[color:var(--m-text-2)] sm:text-[19px]">
                Send the change. Strelva keeps the site current, checks it before publish, and shows what worked.
              </p>
              <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
                <Link href="/access-request?ref=home-hero" className="marketing-button-primary">
                  Request your build
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
