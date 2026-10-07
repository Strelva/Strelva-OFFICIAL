import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PossibilityTry, type PossibilityTryState } from "@/experience/systems/PossibilityTry";
import { composeAskPageSet } from "@/products/websites/index";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Try it interface fixture", robots: { index: false, follow: false } };

/** Local fixture for the signed "Try it" page: `state=ready|pages|changed|expired`. Fictional content. */
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
  if (state === "pages" && fixture.kind === "ready") fixture.view = {
    title: "A new website for River Practice",
    intent: "A fictional informational website candidate. Owner review still comes before Make real.",
    changes: [], introduces: ["River Practice service website"], takesSubmissions: false,
    websiteDocument: composeAskPageSet("River Practice", { kind: "website-pages", pages: [
      { path: "/", title: "Our services", description: "Find the support your team needs", paragraphs: ["A new service website for a fictional consulting practice. This copy is prepared for review and is not a verified business fact.", "Choose Consulting in the navigation to explore the second page. Every page belongs to this isolated candidate."] },
      { path: "/consulting", title: "Consulting", description: "Plan your next step", paragraphs: ["We help teams understand their next step. This proposed wording still needs the owner's review.", "A service page can describe the work clearly before an owner chooses to publish. This candidate has no booking, intake, payment, or message Connection."] },
    ] }).document,
  };
  return <PossibilityTry state={fixture} />;
}
