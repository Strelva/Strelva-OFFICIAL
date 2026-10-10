/** Fictional email content for the canon. Never imported by a sender. */
import { bookingVisitorPaperEmail, cardDeclinedPaperEmail, exportReadyPaperEmail, morningNeedsYouEmail, newInquiryEmail, offeredDatesPaperEmail, ownerInvitationPaperEmail, urgentNeedsYouEmail, weeklyRecapEmail } from "@/lib/email/paper";
import type { PaperEmail } from "@/lib/email/paper";

export const EMAIL_PREVIEW_DRAFT = "Hi Dana, yes, Sheri mediates disputes between partners. You can ask for a session date here and Sheri will confirm it: attymooney.com/sessions";
export const EMAIL_PREVIEW_IDENTITY = { sender: "Strelva for The Mooney Firm", senderDetail: "to sheri@attymooney.com · 9:12 AM" };
const link = (state: string) => `/preview/strelva/email?view=confirm&state=${state}`;
const open = { label: "Open", url: link("conversation") };
const notYet = { label: "Not yet", url: link("not-yet") };
const send = { label: "Send this reply", url: link("confirm") };
const policyNote = "Sent now because inquiry replies are set to “Ask me first”. Other non-urgent items wait for tomorrow’s 7:00 email. Change who decides in Strelva.";
const urgent = {
  ...EMAIL_PREVIEW_IDENTITY, subject: "Dana wrote in about a partner dispute. Your reply is ready.", person: "Dana Reyes", source: "via attymooney.com",
  inquiry: "Two partners at our firm need help working out a client handoff. Do you mediate this kind of thing, and how do we get a date?",
  draft: EMAIL_PREVIEW_DRAFT, send, notYet, change: { label: "Change it", url: link("edit") }, policyNote,
};
const morningIdentity = { ...EMAIL_PREVIEW_IDENTITY, senderDetail: "to sheri@attymooney.com · 7:00 AM" };
const customerIdentity = { sender: "Lakeview Yoga · Thu 6:12 PM", senderDetail: "" };
const customerFooter = "Sent by Lakeview Yoga, 14 Lake St, Buffalo. Questions? Just reply.";
export const EMAIL_PREVIEW_TEMPLATES = {
  urgent: { frame: "GJ5k6", name: "Urgent Needs you", email: urgentNeedsYouEmail(urgent) },
  "urgent-alt": { frame: "IT5pq", name: "Urgent alternative", email: urgentNeedsYouEmail({ ...urgent, white: true, subject: "Reply to Dana about workplace mediation?", person: "Dana Ruiz", source: "8:12 · attymooney.com form", inquiry: "Two partners at our office aren’t speaking anymore and it’s affecting everyone. Do you handle this, and how soon could we start?", draft: "Hi Dana, thank you for writing. Sheri mediates workplace disputes. To pick a time, request a session date at attymooney.com/sessions. Sheri confirms every request personally.", send: { label: "Approve and send", url: `${link("confirm")}&context=urgent-alt` }, notYet: { ...notYet, url: `${link("not-yet")}&context=urgent-alt` }, change: { ...open, label: "Open", url: `${link("conversation")}&context=urgent-alt` } }) },
  morning: { frame: "iFaQj", name: "7:00 morning email", email: morningNeedsYouEmail({ ...morningIdentity, subject: "2 things need you today", items: [
    { category: "Google review reply", title: "Reply to a 5-star review from M. Patel", detail: "“Thank you for helping us settle this without court.” Reply drafted, 2 sentences.", approve: { label: "Post reply", url: link("review") }, notYet: { label: "Not yet", url: link("review-not-yet") }, open: { label: "Open", url: link("review") } },
    { category: "Website change", title: "Update the fees page for 2027", detail: "You asked Tuesday. Two lines change; preview inside.", approve: { label: "Publish", url: link("website") }, notYet: { label: "Not yet", url: link("website-not-yet") }, open: { label: "Open", url: link("website") } },
  ], handled: "Answered 1 inquiry with your approved reply · checked the site 24 times, all up · sent 1 session reminder" }) },
  "morning-alt": { frame: "cugJG", name: "Morning alternative", email: morningNeedsYouEmail({ ...morningIdentity, white: true, subject: "2 things need you today", items: [
    { category: "Inquiry reply", title: "Reply to Dana about workplace mediation", detail: "Waiting since 8:14 yesterday", approve: { label: "Approve", url: link("confirm") }, notYet, open },
    { category: "Website", title: "Add Saturday hours to attymooney.com", detail: "You asked for this on Monday", approve: { label: "Approve", url: link("website") }, notYet: { label: "Not yet", url: link("website-not-yet") }, open: { label: "Open", url: link("website") } },
  ], handled: "Checked the attymooney.com form end to end · renewed the attymooney.com certificate · filed one inquiry as spam" }) },
  inquiry: { frame: "JxKNy", name: "New inquiry · nothing to decide", email: newInquiryEmail({ ...EMAIL_PREVIEW_IDENTITY, senderDetail: "to sheri@attymooney.com · 2:40 PM", person: "Priya Shah", source: "via attymooney.com · Workplace mediation", inquiry: "Our team lead and a senior engineer stopped speaking after a reorg. Is this something you take on?", recordedOutcome: "Strelva sent your standard first reply with the session link. Saved Priya in Inquiries.", policyNote: "Replies like this are set to “Strelva handles it”.", open: { label: "Open Priya in Strelva", url: `${link("conversation")}&context=inquiry` } }) },
  recap: { frame: "AM2vD", name: "Weekly recap", email: weeklyRecapEmail({ ...morningIdentity, senderDetail: "to sheri@attymooney.com · Mon 7:00 AM", subject: "Your week: 4 inquiries, 2 sessions booked", metrics: [
    { value: "212", label: "visits to attymooney.com" }, { value: "4", label: "inquiries", note: "all from the form; 1 spam held back" },
    { value: "4", label: "answered", note: "fastest 6 min, slowest 3 h" }, { value: "2", label: "session dates booked", note: "Oct 21 and Oct 28" },
    { value: "0", label: "new Google reviews", note: "ask the 2 booked clients after their session?" },
  ], possibility: { kind: "possibility", title: "Ask clients for a review after each session", detail: "A Possibility. Strelva sends one short email the day after. You see it before anything goes out.", action: { label: "Try it first", url: link("possibility") } }, sourceNote: "Counts come from attymooney.com, Inquiries and Mediation sessions. Strelva doesn’t count calls or walk-ins." }) },
  invitation: { frame: "putrG", name: "Owner invitation", email: ownerInvitationPaperEmail({ ...EMAIL_PREVIEW_IDENTITY, sender: "Strelva", senderDetail: "to sheri@attymooney.com · 10:03 AM", business: "The Mooney Firm", greeting: "Hi Sheri. Strelva runs attymooney.com, the inquiry form and your session requests. Everything is set up and running as it was.", systems: [
    { label: "attymooney.com", value: "Live", tone: "live" }, { label: "Inquiries", value: "Live", tone: "live" }, { label: "Mediation intake", value: "Live", tone: "live" }, { label: "Mediation sessions", value: "Draft, waiting on you", tone: "need" },
  ], accept: { label: "Accept and open my workspace", url: link("invitation") }, expires: "Oct 23", invitedBy: "the Strelva team" }) },
  declined: { frame: "P6ZsKe", name: "Card declined", email: cardDeclinedPaperEmail({ ...EMAIL_PREVIEW_IDENTITY, sender: "Strelva billing", senderDetail: "to sheri@attymooney.com · 8:01 AM", payer: "The Mooney Firm", chargeDescription: "Strelva tried to charge [plan price] on the card ending [4 digits] on [date]. The bank declined it.", knownSchedule: [{ label: "Today", value: "Payment needs attention" }], update: { label: "Update the card", url: link("billing") }, serviceNote: "Your public site stays up. Open billing to see the current payment status. Your records stay yours either way." }) },
  export: { frame: "m3fSCD", name: "Export ready", email: exportReadyPaperEmail({ ...EMAIL_PREVIEW_IDENTITY, senderDetail: "to sheri@attymooney.com · 4:22 PM", business: "The Mooney Firm", filename: "mooney-firm-2026-10-09.json", fileDetail: "[size] · schema 3 · JSON archive", included: "Website content · inquiries and replies · session requests · business details. The manifest lists every included category.", omitted: "Card details (held by the payment provider) · other people’s sign-in data", unavailable: "Photo originals and complete change history: check the manifest for this export’s coverage.", download: { label: "Download", url: link("export") }, linkNote: "Link works for 7 days and only for sheri@attymooney.com.", requestedBy: "Asked for by Sheri on Oct 9." }) },
  booking: { frame: "y8xNFR", name: "Visitor booking confirmation", email: bookingVisitorPaperEmail({ ...customerIdentity, subject: "Booked: Slow flow, Sat 9:00 AM", details: "Hi Alex, you’re in. Ana’s Slow flow, Saturday Oct 11, 9:00–10:00 AM, Studio 2.", note: "Bring a mat if you have one. We have spares.", manage: { label: "Change or cancel", url: link("booking") }, footer: customerFooter }) },
  reminder: { frame: "y8xNFR", name: "Visitor booking reminder", email: bookingVisitorPaperEmail({ ...customerIdentity, sender: "Lakeview Yoga · Fri 9:00 AM", subject: "Tomorrow: Slow flow at 9:00 AM", details: "Hi Alex, your Slow flow session is tomorrow at 9:00 AM, Studio 2, 14 Lake St.", note: "Change or cancel until 7:00 AM.", manage: { label: "Change or cancel", url: link("booking") }, footer: customerFooter }) },
  dates: { frame: "qzX73", name: "Three open dates", email: offeredDatesPaperEmail({ sender: "Sheri at The Mooney Firm · 9:20 AM", senderDetail: "", subject: "Pick a date with Sheri", greeting: "Hi Dana, thanks for writing. These dates are open. Open a date to review your request; Sheri confirms by email.", dates: ["Wed, Oct 14 · afternoon", "Fri, Oct 16 · full day", "Fri, Oct 23 · full day"].map(label => ({ label, reviewUrl: link("dates") })), footer: "The Mooney Firm · attymooney.com. Opening a link does nothing. Dates are held only once Sheri confirms. This offer expires in 72 hours." }) },
} satisfies Record<string, { frame: string; name: string; email: PaperEmail }>;

export const EMAIL_PREVIEW_CONFIRM_STATES = ["confirm", "sent", "handled", "expired", "changed", "unverified", "loading", "empty", "error", "permission", "not-yet", "edit", "conversation", "review", "review-not-yet", "website", "website-not-yet", "possibility", "invitation", "billing", "export", "booking", "dates"] as const;
export type EmailConfirmState = typeof EMAIL_PREVIEW_CONFIRM_STATES[number];

export const EMAIL_PREVIEW_CONTEXTS = {
  urgent: { person: "Dana Reyes", address: "dana.reyes@example.com", draft: EMAIL_PREVIEW_DRAFT, inquiry: urgent.inquiry },
  "urgent-alt": { person: "Dana Ruiz", address: "dana.ruiz@example.com", draft: "Hi Dana, thank you for writing. Sheri mediates workplace disputes. To pick a time, request a session date at attymooney.com/sessions. Sheri confirms every request personally.", inquiry: "Two partners at our office aren’t speaking anymore and it’s affecting everyone. Do you handle this, and how soon could we start?" },
  inquiry: { person: "Priya Shah", address: "priya.shah@example.com", draft: "", inquiry: "Our team lead and a senior engineer stopped speaking after a reorg. Is this something you take on?" },
} as const;
export type EmailPreviewContext = keyof typeof EMAIL_PREVIEW_CONTEXTS;
