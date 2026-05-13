"use client";

import { ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { getAuthSwitchUrl } from "@/lib/invited-email";

const handoffSteps = [
  "Use the exact email address that received your invite.",
  "We match the account to the right website dashboard.",
  "After sign-in, your dashboard opens with the current site context.",
];

export function SignInClient({
  invitedEmail,
  siteName,
  postSignInUrl,
}: {
  invitedEmail: string | null;
  siteName: string;
  postSignInUrl: string;
}) {
  const title = `Sign in to ${siteName}`;

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <AuthDocumentTitle title={title} />
      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1180px] content-center gap-8 pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pt-0">
        <section className="max-w-[620px]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
          >
            <ArrowLeft className="size-4" />
            Scaffold Web
          </Link>

          <p className="mt-12 text-[14px] font-medium text-[color:var(--m-text-3)]">
            Secure dashboard handoff
          </p>
          <h1 className="mt-5 max-w-[680px] text-5xl font-semibold leading-[0.94] tracking-normal text-[color:var(--m-text)] sm:text-6xl md:text-7xl">
            {title}
          </h1>
          <p className="mt-6 max-w-[560px] text-[17px] leading-[1.7] text-[color:var(--m-text-2)]">
            Sign in with the invited account so Scaffold can open the dashboard
            tied to your website, reports, and update history.
          </p>

          {invitedEmail ? (
            <div className="mt-8 rounded-[18px] border border-[var(--m-rule)] bg-[var(--m-accent-soft)] p-5">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 size-5 shrink-0 text-[color:var(--m-accent)]" />
                <div>
                  <p className="text-[13px] font-medium text-[color:var(--m-text)]">
                    Invited email:{" "}
                    <span className="font-semibold text-[color:var(--m-text)]">
                      {invitedEmail}
                    </span>
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.55] text-[color:var(--m-text-2)]">
                    This email stays attached when switching between sign-in and
                    sign-up.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-10 hidden rounded-[18px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-5 lg:block">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-[color:var(--m-accent)]" />
              <h2 className="text-[15px] font-medium text-[color:var(--m-text)]">
                Access path
              </h2>
            </div>
            <ul className="mt-4 grid gap-3">
              {handoffSteps.map((step) => (
                <li
                  key={step}
                  className="flex gap-3 text-[13px] leading-[1.55] text-[color:var(--m-text-2)]"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--m-success)]" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-label="Scaffold Web secure sign-in"
          className="overflow-hidden rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)]"
        >
          <div className="border-b border-[var(--m-rule-soft)] px-6 py-5 sm:px-8">
            <p className="text-[13px] text-[color:var(--m-text-3)]">
              Access check
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-[color:var(--m-text)]">
              Continue to your website dashboard.
            </h2>
          </div>

          <div className="p-4 sm:p-6 md:p-8">
            <ClerkLoading>
              <div className="rounded-[18px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-6 text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border border-[var(--m-rule)] border-t-[var(--m-accent)]" />
                <p className="text-sm font-medium text-[color:var(--m-text)]">
                  Loading secure sign-in...
                </p>
                <p className="mt-2 text-xs leading-5 text-[color:var(--m-text-3)]">
                  If this takes more than a few seconds, check your connection
                  or email jacob@scaffoldweb.com.
                </p>
              </div>
            </ClerkLoading>
            <ClerkLoaded>
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "!w-full !max-w-full !min-w-0",
                    cardBox: "!w-full !max-w-full !min-w-0",
                    card:
                      "!w-full !max-w-full !min-w-0 !bg-transparent !shadow-none !border-0 !p-0",
                    main: "!w-full !max-w-full !min-w-0",
                    form: "!w-full !max-w-full !min-w-0",
                    headerTitle:
                      "!font-sans !text-[color:var(--m-text)] !tracking-normal",
                    headerSubtitle: "!text-[color:var(--m-text-3)]",
                    socialButtonsBlockButton:
                      "!rounded-lg !bg-[var(--m-panel)] !border-[var(--m-rule-soft)] !text-[color:var(--m-text)] hover:!bg-[var(--m-paper-muted)]",
                    formFieldLabel:
                      "!text-[12px] !font-medium !text-[color:var(--m-text-3)]",
                    formFieldInput:
                      "!rounded-lg !bg-[var(--m-surface)] !border-[var(--m-rule)] !text-[color:var(--m-text)] placeholder:!text-[color:var(--m-text-3)] focus:!border-[var(--m-accent)]",
                    formButtonPrimary:
                      "!rounded-full !bg-[var(--m-button)] hover:!bg-[var(--m-text-2)] !text-[color:var(--m-button-text)] !font-medium",
                    footerActionLink:
                      "!text-[color:var(--m-accent)] hover:!text-[color:var(--m-text)]",
                    footerActionText: "!text-[color:var(--m-text-3)]",
                    dividerLine: "!bg-[var(--m-rule-soft)]",
                    dividerText: "!text-[color:var(--m-text-3)]",
                    formFieldErrorText: "!text-[color:var(--m-danger)]",
                    formFieldSuccessText: "!text-[color:var(--m-success)]",
                    identityPreviewText: "!text-[color:var(--m-text)]",
                    identityPreviewEditButton:
                      "!text-[color:var(--m-accent)] hover:!text-[color:var(--m-text)]",
                  },
                }}
                forceRedirectUrl={postSignInUrl}
                fallbackRedirectUrl={postSignInUrl}
                signUpUrl={getAuthSwitchUrl("/sign-up", invitedEmail)}
                initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}
              />
            </ClerkLoaded>
          </div>
        </section>

        <p className="max-w-[760px] text-[13px] leading-6 text-[color:var(--m-text-3)] lg:col-start-2">
          Missing access or the sign-in form is not loading? Sign in with the
          invited email or email{" "}
          <a
            className="text-[color:var(--m-accent)] underline-offset-4 hover:underline"
            href="mailto:jacob@scaffoldweb.com"
          >
            jacob@scaffoldweb.com
          </a>{" "}
          and we&apos;ll connect the right account.
        </p>
      </div>
    </main>
  );
}
