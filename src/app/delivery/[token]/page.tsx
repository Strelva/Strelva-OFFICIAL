import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clock3, MailCheck } from "lucide-react";
import {
  deliverySteps,
  getDeliveryLeadByToken,
  getDeliveryStepIndex,
  maskEmail,
} from "@/lib/access-request-delivery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Site delivery status | Strelva",
  description: "Track the status of a Strelva site request.",
};

export default async function DeliveryStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lead = await getDeliveryLeadByToken(token);
  if (!lead) notFound();

  const activeIndex = getDeliveryStepIndex(lead.deliveryStatus);
  const isPaused = lead.deliveryStatus === "paused";
  const submitted = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(lead.submittedAt));

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-40px)] max-w-[1120px] flex-col justify-center gap-8 py-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text"
        >
          <ArrowLeft className="size-4" />
          Strelva
        </Link>

        <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-m-text-3">
              Site delivery status
            </p>
            <h1 className="mt-4 max-w-[760px] text-5xl font-semibold leading-[0.96] text-m-text sm:text-6xl">
              {lead.businessName}
            </h1>
            <p className="mt-5 max-w-[560px] text-[16px] leading-[1.7] text-m-text-2">
              This is the no-login tracking page for your website build request. Keep the link from your email; it is private to the request.
            </p>

            <dl className="mt-8 grid gap-3 text-[14px] sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-lg border border-m-rule-soft bg-m-panel p-4">
                <dt className="text-[12px] text-m-text-3">Submitted</dt>
                <dd className="mt-1 font-medium text-m-text">{submitted}</dd>
              </div>
              <div className="rounded-lg border border-m-rule-soft bg-m-panel p-4">
                <dt className="text-[12px] text-m-text-3">Confirmation sent to</dt>
                <dd className="mt-1 font-medium text-m-text">{maskEmail(lead.email)}</dd>
              </div>
            </dl>
          </div>

          <div className="motion-rise rounded-[28px] border border-m-rule bg-m-paper p-5 shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)] sm:p-7 md:p-9" style={{ "--motion-delay": "120ms" } as React.CSSProperties}>
            <div className="flex flex-col gap-4 border-b border-m-rule-soft pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[13px] text-m-text-3">Current status</p>
                <h2 className="mt-1 text-2xl font-semibold text-m-text">
                  {isPaused ? "Paused for follow-up" : deliverySteps[activeIndex]?.label}
                </h2>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-m-rule-soft bg-m-panel px-3 py-1.5 text-[13px] text-m-text-2">
                <Clock3 className="size-4 text-m-accent" />
                {isPaused ? "Needs review" : `Step ${activeIndex + 1} of ${deliverySteps.length}`}
              </span>
            </div>

            <ol className="mt-7 grid gap-4">
              {deliverySteps.map((step, index) => {
                const complete = !isPaused && index < activeIndex;
                const active = !isPaused && index === activeIndex;
                return (
                  <li key={step.id} className="grid grid-cols-[2rem_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex size-8 items-center justify-center rounded-full border ${
                          complete || active
                            ? "border-m-accent bg-m-accent-soft text-m-accent"
                            : "border-m-rule bg-m-panel text-m-text-3"
                        }`}
                        aria-hidden="true"
                      >
                        {complete ? <CheckCircle2 className="size-4" /> : <Circle className="size-3" />}
                      </span>
                      {index < deliverySteps.length - 1 ? (
                        <span className={`mt-2 h-full min-h-8 w-px ${complete ? "bg-m-accent" : "bg-m-rule-soft"}`} />
                      ) : null}
                    </div>
                    <div className={`rounded-lg border p-4 ${
                      active
                        ? "border-m-accent bg-m-accent-faint"
                        : "border-m-rule-soft bg-m-panel"
                    }`}>
                      <h3 className="text-[15px] font-semibold text-m-text">{step.label}</h3>
                      <p className="mt-1 text-[13px] leading-[1.6] text-m-text-2">{step.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-7 flex items-start gap-3 rounded-lg border border-m-rule-soft bg-m-panel p-4">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-m-success" />
              <p className="text-[13px] leading-[1.6] text-m-text-2">
                You do not need to create an account yet. When there is something to review, the next email will point you back here with the next action.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
