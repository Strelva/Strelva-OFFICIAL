import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { HARBOR, e4Choice } from "@/experience/workspace/preview/xa7-outside-fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional booking page", robots: { index: false, follow: false } };

const STATES = ["choose", "empty", "error", "expired-link", "rate", "held", "requested", "confirmed"] as const;

/**
 * XA · E4, the public booking page: the real InquiryBookingChoice that
 * /inquiry-booking/[token] serves, with fictional times. The form posts nowhere.
 * ?state=choose|empty|error|expired-link|rate|held|requested|confirmed&brand=harbor
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; brand?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const q = await searchParams;
  const state = STATES.find(item => item === q.state) ?? "choose";
  const brand = q.brand === "harbor" ? { "--visitor-accent": "#1f4e6b", "--visitor-text": "#152230" } as CSSProperties : undefined;
  return <div style={brand}>
    <InquiryBookingChoice now={Date.parse("2026-11-20T14:05:00Z")} businessName="Harbor Dental" businessPhone={HARBOR.phone} choice={e4Choice(state)} unavailable={state === "error"} error={state === "rate" ? "rate" : undefined} actionUrl="#" />
  </div>;
}
