import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PayLinkForm } from "./PayLinkForm";
import { getPayLink, formatPayLinkAmount } from "@/lib/pay-links";
import { payLinkDoorBadge, payLinkDoorTerms } from "@/lib/pay-link-copy";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ payment?: string; amount?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = await getPayLink(slug);
  if (!config) {
    return { title: { absolute: "Not found" } };
  }
  return {
    title: { absolute: `Your ${config.clientName} website` },
    description: `Your new ${config.clientName} website — secure payment to get started.`,
  };
}

export default async function PayLinkPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const config = await getPayLink(slug);
  if (!config) {
    notFound();
  }

  const sp = await searchParams;
  const payment = sp?.payment;
  const amountParam = sp?.amount;
  const successAmountCents =
    amountParam && /^\d+$/.test(amountParam) ? Number.parseInt(amountParam, 10) : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#f5f6f9] to-[#e7eaf1] text-[#1d1d1f]">
      {/* Entrance motion — staggered rise. Honors reduced-motion. */}
      <style>{`
        @keyframes reb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .reb-rise { animation: reb-rise .65s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .reb-rise { animation: none; } }
      `}</style>

      {/* Ambient backdrop — gives the glass something to refract. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-32 h-[440px] w-[440px] rounded-full bg-[#f7dcc6] opacity-55 blur-[130px]" />
        <div className="absolute -bottom-40 -right-24 h-[480px] w-[480px] rounded-full bg-[#c6d6f1] opacity-55 blur-[140px]" />
        <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#dfe6ee] opacity-50 blur-[150px]" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[540px] flex-col px-5 py-10 sm:py-14">
        {/* Top bar */}
        <div className="reb-rise flex items-center justify-between" style={{ animationDelay: "0ms" }}>
          {config.returnUrl ? (
            <a
              href={config.returnUrl}
              className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-[#52525b] transition-colors hover:text-[#1d1d1f]"
            >
              <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
              {config.clientName}
            </a>
          ) : (
            <span className="text-[14px] font-medium text-[#52525b]">{config.clientName}</span>
          )}
          <span className="rounded-full border border-white/70 bg-white/55 px-3 py-1 text-[12px] font-medium text-[#52525b] backdrop-blur-md">
            {payLinkDoorBadge(config.door)}
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          {payment === "success" && (
            <div className="reb-rise mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-[#bfe3c4] bg-[#eafaec]/80 px-4 py-2 text-[13px] font-medium text-[#1f7a32] backdrop-blur-md">
              <CheckCircle2 size={16} />
              Thank you
              {successAmountCents
                ? ` — payment received for ${formatPayLinkAmount(successAmountCents)}`
                : " — payment received"}
            </div>
          )}
          {payment === "cancelled" && (
            <div className="reb-rise mx-auto mb-7 rounded-full border border-[#ecd9b6] bg-[#fff7e8]/80 px-4 py-2 text-[13px] font-medium text-[#8a6516] backdrop-blur-md">
              No charge made. You can try again below.
            </div>
          )}

          {/* Headline */}
          <div className="mb-8 text-center">
            <span
              className="reb-rise inline-flex items-center rounded-full bg-[#1d1d1f] px-3 py-1 text-[12px] font-medium tracking-wide text-white"
              style={{ animationDelay: "60ms" }}
            >
              Built by Jacob · Strelva
            </span>
            <h1
              className="reb-rise mx-auto mt-5 max-w-[460px] text-[34px] font-semibold leading-[1.06] tracking-[-0.025em] text-[#1d1d1f] sm:text-[42px]"
              style={{ animationDelay: "120ms" }}
            >
              Your new {config.clientName} website.
            </h1>
            <p
              className="reb-rise mx-auto mt-4 max-w-[440px] text-[16px] leading-7 text-[#56565c]"
              style={{ animationDelay: "180ms" }}
            >
              {payLinkDoorTerms(config)}
            </p>
            {config.customCopy && (
              <p
                className="reb-rise mx-auto mt-3 max-w-[440px] text-[15px] leading-7 text-[#56565c]"
                style={{ animationDelay: "210ms" }}
              >
                {config.customCopy}
              </p>
            )}
          </div>

          <PayLinkForm
            slug={config.slug}
            door={config.door}
            amountCents={config.amountCents}
            minCents={config.minCents}
            maxCents={config.maxCents}
          />
        </div>

        <p
          className="reb-rise text-center text-[13px] text-[#86868b]"
          style={{ animationDelay: "320ms" }}
        >
          Questions?{" "}
          <a
            href="mailto:jacob@strelva.com"
            className="font-medium text-[#52525b] underline-offset-2 hover:underline"
          >
            Contact Jacob
          </a>
        </p>
      </div>
    </main>
  );
}
