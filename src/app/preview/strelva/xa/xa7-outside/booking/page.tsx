import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { HARBOR, e4Choice } from "@/experience/workspace/preview/xa7-outside-fixture";
import { previewBrand } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional booking page", robots: { index: false, follow: false } };

const STATES = ["choose", "empty", "error", "expired-link", "rate", "held", "requested", "confirmed"] as const;

/**
 * XA · E4, the public booking page: the real InquiryBookingChoice that
 * /inquiry-booking/[token] serves, with fictional times, wearing Harbor Dental's
 * own look as the live page reads it from the business's website. The form
 * posts to the preview's act route, which only moves to the held state.
 * ?state=choose|empty|error|expired-link|rate|held|requested|confirmed&brand=none&error=pick
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; brand?: string; error?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const q = await searchParams;
  const state = STATES.find(item => item === q.state) ?? "choose";
  return <InquiryBookingChoice now={Date.parse("2026-11-20T14:05:00Z")} businessName="Harbor Dental" businessPhone={HARBOR.phone} choice={e4Choice(state)} unavailable={state === "error"} error={state === "rate" ? "rate" : q.error === "pick" ? "pick" : undefined} brand={previewBrand(q.brand)} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=handoff${q.brand ? `&brand=${q.brand}` : ""}`} />;
}
