import { askServiceSetupTry, askServiceInquiryTry } from "@/products/scheduling/server";
import { askServiceSetupSelectionSchema } from "@/platform/ask/new-service";
import { verifyPossibilityPreviewToken } from "@/platform/possibilities/preview-link";
import type { PossibilityTryState } from "./PossibilityTry";
import { siteDocumentSchema } from "@/products/websites/client";
import { siteDocumentHash } from "@/products/websites/index";
import { followUpTryView } from "@/products/inquiries/server";
import { publicBookingScheduleSchema } from "@/products/scheduling/contracts";

/**
 * The state of a signed "Try it" link (systems-experience spec behavior 19).
 * `null`: Systems is off for that business, so the page does not exist. An
 * expired or tampered token says so; a candidate that changed (or closed)
 * says "This changed since we emailed you."
 */
export async function possibilityTryState(token: string, deps: {
  enabled(workspaceId: string): Promise<boolean>;
  read(claims: { businessId: string; possibilityId: string; candidateRevision: number }): Promise<{
    title: string; intent: string;
    changes: Array<{ candidate: { summary: string; content: Record<string, unknown> } }>;
    introduces: Array<{ name: string; candidate?: { content: Record<string, unknown> } }>;
    effects: Array<{ channel?: string }>;
  } | null>;
}, now = Date.now()): Promise<PossibilityTryState | null> {
  const claims = verifyPossibilityPreviewToken(token, now);
  if (!claims) return { kind: "expired" };
  if (!(await deps.enabled(claims.workspaceId).catch(() => false))) return null;
  const p = await deps.read({ businessId: claims.workspaceId, possibilityId: claims.possibilityId, candidateRevision: claims.candidateRevision }).catch(() => null);
  if (!p) return { kind: "changed" };
  const setup = p.introduces.find(item => item.candidate?.content.kind === "ask-new-service-setup")?.candidate?.content;
  const setupSelection = askServiceSetupSelectionSchema.safeParse(setup?.selection);
  if (setup && !setupSelection.success) return {kind:"changed"};
  const serviceSetup = setup && setupSelection.success ? { durationMinutes:setupSelection.data.service.durationMinutes, schedule:askServiceSetupTry(setupSelection.data), inquiry:askServiceInquiryTry(setupSelection.data,"isolated-try") } : null;
  const inquiry = p.changes.find(item => item.candidate.content.kind === "ask-inquiry-follow-up")?.candidate.content;
  const inquiryFollowUp = inquiry ? followUpTryView(inquiry.selection, inquiry.draft, inquiry.rehearsal) : null;
  if (inquiry && !inquiryFollowUp) return { kind: "changed" };
  const website = [...p.introduces, ...p.changes].find(item => ["ask-website-pages", "ask-existing-booking-page", "ask-existing-website-pages"].includes(String(item.candidate?.content.kind)));
  const existingWebsite = website?.candidate?.content.kind === "ask-existing-website-pages";
  const booking = website?.candidate?.content.kind === "ask-existing-booking-page";
  const document = siteDocumentSchema.safeParse(website?.candidate?.content.document);
  if (website && !document.success) return { kind: "changed" };
  const bookingSchedule = publicBookingScheduleSchema.safeParse(website?.candidate?.content.bookingSchedule);
  if (website && document.success && (siteDocumentHash(document.data) !== website.candidate?.content.candidateContentHash
    || !booking && !existingWebsite && (document.data.capabilities || Object.values(document.data.nodes).some(node => node.type === "Booking" || node.type === "InquiryForm"))
    || booking && (!bookingSchedule.success || document.data.capabilities?.booking?.capabilityId !== bookingSchedule.data.capabilityId || document.data.capabilities.booking.version !== bookingSchedule.data.version))) return { kind: "changed" };
  const bookingPath = website?.candidate?.content.bookingPath;
  if (booking && (typeof bookingPath !== "string" || !document.success || !document.data.pages.some(page => page.path === bookingPath))) return { kind: "changed" };
  return {
    kind: "ready",
    view: {
      title: p.title,
      intent: p.intent,
      changes: p.changes.map((change) => change.candidate.summary.replace(/^the /, "The ")),
      introduces: p.introduces.map((intro) => intro.name),
      ...(document.success ? { websiteDocument: document.data } : {}),
      ...(booking && bookingSchedule.success && typeof bookingPath === "string" ? { bookingSchedule: bookingSchedule.data, bookingPath } : {}),
      ...(serviceSetup ? {serviceSetup} : {}),
      ...(inquiryFollowUp ? { inquiryFollowUp } : {}),
      takesSubmissions: !serviceSetup && !inquiryFollowUp && !document.success && (p.introduces.length > 0
        || p.effects.some((effect) => effect.channel === "inquiry_form" || effect.channel === "booking_page")
        || p.changes.some((change) => "form" in change.candidate.content)),
    },
  };
}
