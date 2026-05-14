import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";

export const metadata: Metadata = {
  title: "Dashboard signup is paused.",
  description: "Scaffold Web dashboard signup is temporarily paused while free-site requests and customer access are handled by email.",
};

export default function SignUpPage() {
  const title = "Dashboard signup is paused.";

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <AuthDocumentTitle title={title} />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-40px)] max-w-[960px] flex-col justify-center py-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
        >
          <ArrowLeft className="size-4" />
          Scaffold Web
        </Link>

        <section className="mt-12 overflow-hidden rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] p-6 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-8 md:p-10">
          <MailCheck className="size-9 text-[color:var(--m-accent)]" />
          <p className="mt-6 text-[14px] font-medium text-[color:var(--m-text-3)]">
            Free-site requests stay email-first
          </p>
          <h1 className="mt-4 max-w-[720px] text-5xl font-semibold leading-[0.96] tracking-normal text-[color:var(--m-text)] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.7] text-[color:var(--m-text-2)]">
            We are not asking new customers to create a Clerk account right now.
            Request a free site and we will email your delivery-status link
            after the request is received.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/access-request"
              className="marketing-button-primary h-11 px-5 text-[14px]"
            >
              Request free site
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="mailto:jacob@scaffoldweb.com?subject=Scaffold%20Web%20signup"
              className="marketing-button-secondary h-11 px-5 text-[14px]"
            >
              Email Jacob
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
