import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PossibilityTry, type PossibilityTryState } from "@/experience/systems/PossibilityTry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Try it interface fixture", robots: { index: false, follow: false } };

/** Local fixture for the signed "Try it" page: `state=ready|changed|expired`. Fictional content. */
export default async function TryPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const fixture: PossibilityTryState = state === "changed" ? { kind: "changed" } : state === "expired" ? { kind: "expired" } : {
    kind: "ready",
    view: {
      title: "Consult booking for attymooney.com",
      intent: "Let visitors book a free 20-minute consult beside the contact form.",
      changes: ["The site with a consult booking page", "Inquiries from the booking form"],
      introduces: ["Consult booking"],
      takesSubmissions: true,
    },
  };
  return <PossibilityTry state={fixture} />;
}
