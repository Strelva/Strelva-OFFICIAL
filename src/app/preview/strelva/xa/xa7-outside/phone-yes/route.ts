import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { brandXaPage, xaDecisionPageHtml, xaDoneInput, xaKeepWith, xaYesLabel, type XaDecisionPageInput, type XaIdentity, type XaWeek } from "@/app/api/approve/xa-page";
import { visitorWeek } from "@/platform/bookings/visitor-week";
import { E4_CLOSURES, HARBOR, SLOT_STARTS, XA7_BASE } from "@/experience/workspace/preview/xa7-outside-fixture";

export const dynamic = "force-dynamic";

const OPEN = `${XA7_BASE}/today-phone`;
const SITE = { name: HARBOR.business, owner: HARBOR.owner } satisfies XaIdentity;
const PREPARER = "Maya at North Studio";

/** The same week the visitor's booking page draws (VisitorSlotWeek's data), read-only, Thanksgiving closed in place. */
function week(): XaWeek {
  const w = visitorWeek(SLOT_STARTS.map(start => ({ start })), HARBOR.timeZone, E4_CLOSURES);
  return {
    address: `${HARBOR.site}/book`,
    days: w.days.map(day => ({ key: day.key, weekday: day.weekday, date: day.date, times: day.times.map(t => t.label), closed: day.closed })),
    notes: ["No one is booked on those days.", "A closing note goes on your Hours page."],
  };
}

const ASK = { status: 200, tone: "waits", statusLabel: "Waits for you", heading: "Close for Thanksgiving?", identity: SITE, by: `${PREPARER} prepared this today at 9:14.` } as const;
const BAD = (heading: string, body: string, label = "Open"): XaDecisionPageInput => ({ status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading, body, identity: SITE, primary: { label, url: OPEN } });

/**
 * XA · E2, the yes on the phone: the same page renderer /api/approve serves
 * from a decision email, with fictional items. Forms post nowhere real.
 * ?state=confirm|not-yet|done|unverified|not-yet-done|handled|changed|expired|sign-in|failed|checking|invalid&brand=agency
 */
const STATES: Record<string, () => XaDecisionPageInput> = {
  confirm: () => ({ ...ASK, week: week(), primary: { label: xaYesLabel("system.change_live", "approve"), token: "fictional-preview-token" }, decline: { label: "Not now", token: "fictional-preview-token-2" }, foot: "Undo any time from Today." }),
  "not-yet": () => ({ ...ASK, body: "You chose not yet in the email. Your hours stay as they are until you say yes.", week: week(), decline: { label: xaKeepWith(PREPARER), token: "fictional-preview-token" }, secondary: { label: "Open your workspace instead", url: OPEN } }),
  done: () => xaDoneInput({ changed: "Thanksgiving hours", verified: true, who: `${PREPARER} prepared it`, identity: SITE, seeUrl: `${XA7_BASE}/booking`, undoUrl: OPEN }),
  unverified: () => xaDoneInput({ changed: "Thanksgiving hours", verified: false, who: `${PREPARER} prepared it`, identity: SITE, seeUrl: `${XA7_BASE}/booking`, undoUrl: OPEN }),
  "not-yet-done": () => ({ status: 200, tone: "quiet", heading: `It stays with ${PREPARER}`, body: "Nothing changed. It waits in Strelva when you want it.", identity: SITE, primary: { label: "Open", url: OPEN } }),
  handled: () => ({ status: 200, tone: "quiet", statusLabel: "Nothing to do", heading: "Already handled", body: "This was already taken care of. Nothing more to do.", identity: SITE, primary: { label: "Open", url: OPEN } }),
  changed: () => BAD("This changed since we emailed you", `${PREPARER} changed “Close for Thanksgiving” after this email went out. Open Strelva to see the new version.`),
  expired: () => BAD("This link expired", "Open Strelva to see what's waiting."),
  "sign-in": () => BAD("Sign in to decide this", "Decisions about access, money or leaving Strelva need you signed in.", "Sign in and open"),
  failed: () => BAD("Could not finish this", "Open the item to check its status."),
  checking: () => BAD("Strelva is checking the outcome", "The change may have gone through, but we couldn't record its final result. Strelva needs to check it before anyone tries again."),
  invalid: () => ({ status: 400, tone: "bad", statusLabel: "Nothing went live from this link", heading: "This link is invalid or expired", body: "For your security, one-click approval links expire. Open your workspace to review this in the approval queue." }),
};

export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const input = (STATES[url.searchParams.get("state") ?? "confirm"] ?? STATES.confirm!)();
  let html = xaDecisionPageHtml(input).replaceAll('action="/api/approve"', 'action="#" onsubmit="return false"');
  if (url.searchParams.get("brand") === "agency") html = brandXaPage(html, { agencyId: "fictional", name: "North Studio", logoUrl: null, accentColor: "#2f5236", replyTo: null, credit: "runs_on_strelva" });
  return new Response(html, { status: input.status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
