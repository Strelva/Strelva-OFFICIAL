import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { BusinessVerification } from "@/experience/business-record/BusinessVerification";
import { publicBusinessVerification, VERIFICATION_MAX_AGE_MS } from "@/platform/business-record/verification";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public verification fixture", robots: { index: false, follow: false } };
/** Fictional evidence only; exercises the exact public component without DB/provider access. */
export default async function VerificationPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const now = Date.parse("2026-10-08T12:00:00Z");
  const checkedAt = new Date(state === "stale" ? now - VERIFICATION_MAX_AGE_MS - 1 : now).toISOString();
  const revoked = state === "revoked";
  const verification = publicBusinessVerification(state === "unknown" ? null : {
    domains: revoked ? [] : [{ url: "https://fictional-neighborhood-business.example/", checkedAt }],
    googleBusinessProfile: { linked: !revoked, checkedAt: revoked ? null : checkedAt },
    ownerConfirmedFactCount: 12, lastConfirmedAt: new Date(now).toISOString(),
    operatingAgency: revoked ? null : { name: "Fictional Neighborhood Agency with a long name for mobile reflow" },
  }, now);
  return <div className="min-h-dvh bg-surface-base text-warm-black">
    <main className="mx-auto grid w-full max-w-[1120px] gap-12 px-6 pb-24 pt-12 md:px-8 lg:px-12 lg:pt-20">
      <header className="grid gap-4"><p className="text-sm text-gray-muted">Fictional local fixture · {state ?? "fresh"}</p><h1 className="font-display text-[2.5rem] font-semibold leading-[3rem]">Neighborhood Business</h1></header>
      <BusinessVerification verification={verification} />
    </main>
  </div>;
}
