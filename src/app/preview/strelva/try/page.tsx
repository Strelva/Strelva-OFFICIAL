import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PossibilityTry, type PossibilityTryState } from "@/experience/systems/PossibilityTry";
import { composeAskPageSet, existingWebsitePageOperations, prepareSitePatch } from "@/products/websites/index";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Try it interface fixture", robots: { index: false, follow: false } };

/** Local fixture for the signed "Try it" page: `state=ready|pages|booking|changed|expired`. Fictional content. */
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
  if (state === "booking" && fixture.kind === "ready") {
    const document = composeAskPageSet("River Practice", { kind: "website-pages", pages: [
      { path: "/", title: "River Practice", description: "Fictional existing website", paragraphs: ["The original website remains available in this isolated candidate."] },
      { path: "/book", title: "Book a consulting session", description: "Try the configured service", paragraphs: ["Fictional configured consulting service. These are test times, not a check of live calendar availability."] },
    ] }).document;
    document.nodes.booking = { id: "booking", type: "Booking", variant: "inline", props: { title: "Book a consulting session" }, children: [], factIds: [] };
    document.nodes.page_1!.children.push("booking");
    document.capabilities = { baseUrl: "https://example.invalid", tenant: "river-practice", booking: { capabilityId: "consult", version: 1, range: { from: "2026-10-10T13:00:00.000Z", to: "2026-10-10T15:00:00.000Z" } } };
    fixture.view = { title: "A booking page for River Practice", intent: "Fictional existing-site alternative with an interactive isolated booking test. Owner review still comes before Make real.", changes: ["The existing native site with one booking page"], introduces: [], takesSubmissions: false, websiteDocument: document, bookingPath: "/book", bookingSchedule: { schemaVersion: 1, capabilityId: "consult", version: 1, name: "Consulting session", provider: "google", timeZone: "America/New_York", slots: [{ id: "test-slot-one", start: "2026-10-10T13:00:00.000Z", end: "2026-10-10T14:00:00.000Z" }, { id: "test-slot-two", start: "2026-10-10T14:00:00.000Z", end: "2026-10-10T15:00:00.000Z" }] } };
  }
  if (["existing-pages", "existing-section", "existing-rebuild"].includes(state ?? "") && fixture.kind === "ready") {
    const published = composeAskPageSet("River Practice", { kind: "website-pages", pages: [
      { path: "/", title: "River Practice", description: "Fictional existing website", paragraphs: ["The existing home page stays live while this alternative is reviewed."] },
    ] }).document;
    const mode = state === "existing-section" ? "section" : state === "existing-rebuild" ? "rebuild" : "page-set";
    const candidate = { kind: "existing-website-pages", mode, pages: [{ path: mode === "page-set" ? "/services" : "/", title: "Consulting", description: "Plan the next move for your business", paragraphs: ["Prepared consulting copy for the owner's review. This candidate has not changed the live website."] }] };
    const prepared = await prepareSitePatch({ document: published, ops: existingWebsitePageOperations(published, candidate), forceReview: true });
    fixture.view = { title: "An alternative for River Practice", intent: "A fictional native website alternative. Copy still needs owner review before Make real.", changes: ["The existing website with proposed consulting copy"], introduces: [], takesSubmissions: false, websiteDocument: prepared.document };
  }
  return <PossibilityTry state={fixture} />;
}
