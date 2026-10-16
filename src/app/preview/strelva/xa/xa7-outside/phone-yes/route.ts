import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { brandXaPage, xaDecisionPageHtml, xaYesLabel, type XaDecisionPageInput } from "@/app/api/approve/xa-page";
import { XA7_BASE } from "@/experience/workspace/preview/xa7-outside-fixture";

export const dynamic = "force-dynamic";

const OPEN = `${XA7_BASE}/today-phone`;
const LINES = ["Mon, Tue and Wed, Nov 23 to 25: open as usual", "Thu and Fri, Nov 26 and 27: closed, no online booking", "Sat, Nov 28: 9 to 1", "Booked on those days: no one", "Closing note added to harbordental.com/hours"];

/**
 * XA · E2, the yes on the phone: the same page renderer /api/approve serves
 * from a decision email, with fictional items. The form posts nowhere real.
 * ?state=confirm|not-yet|done|unverified|not-yet-done|handled|changed|expired|sign-in|failed|checking|invalid&brand=agency
 */
const STATES: Record<string, XaDecisionPageInput> = {
  confirm: { status: 200, tone: "waits", statusLabel: "Waits for you", heading: "Close for Thanksgiving, Nov 26–27?", by: "Prepared by Maya at North Studio.", body: "Thanksgiving hours go live on harbordental.com and your booking page. Nothing happens until you confirm.", lines: LINES, address: "harbordental.com/book", primary: { label: xaYesLabel("system.change_live", "approve"), token: "fictional-preview-token" }, secondary: { label: "Open your workspace instead", url: OPEN } },
  "not-yet": { status: 200, tone: "waits", statusLabel: "Waits for you", heading: "Close for Thanksgiving, Nov 26–27?", by: "Prepared by Maya at North Studio.", body: "It stays with Maya and nothing changes on your page. Nothing happens until you confirm.", primary: { label: xaYesLabel("system.change_live", "not_yet"), token: "fictional-preview-token" }, secondary: { label: "Open your workspace instead", url: OPEN } },
  done: { status: 200, tone: "done", statusLabel: "Done", heading: "Approved", by: "Maya at North Studio · Runs on Strelva", body: "Thanksgiving hours are live.\nClosed Thu and Fri, Nov 26 and 27\nConfirmed live.", primary: { label: "Open System", url: OPEN } },
  unverified: { status: 200, tone: "done", statusLabel: "Done", heading: "Approved", by: "Maya at North Studio · Runs on Strelva", body: "Thanksgiving hours went to your booking page.\nClosed Thu and Fri, Nov 26 and 27\nAccepted. Confirmation is still pending.", primary: { label: "Open System", url: OPEN } },
  "not-yet-done": { status: 200, tone: "quiet", statusLabel: "Nothing changed", heading: "Not yet", body: "Nothing was done. It's still in Strelva when you want it.", primary: { label: "Open", url: OPEN } },
  handled: { status: 200, tone: "quiet", statusLabel: "Nothing to do", heading: "Already handled", body: "This was already taken care of. Nothing more to do.", primary: { label: "Open", url: OPEN } },
  changed: { status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "This changed since we emailed you", body: "Nothing was done. Open Strelva to see the latest version and decide there.", primary: { label: "Open", url: OPEN } },
  expired: { status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "This link expired", body: "Nothing was done. Open Strelva to see what's waiting.", primary: { label: "Open", url: OPEN } },
  "sign-in": { status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "Sign in to decide this", body: "Decisions about access, money or leaving Strelva need you signed in. Nothing was done.", primary: { label: "Sign in and open", url: OPEN } },
  failed: { status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "Could not finish this", body: "Open the item to check its status.", primary: { label: "Open", url: OPEN } },
  checking: { status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "Strelva is checking the outcome", body: "The change may have gone through, but we couldn't record its final result. Strelva needs to check it before anyone tries again.", primary: { label: "Open", url: OPEN } },
  invalid: { status: 400, tone: "bad", statusLabel: "Nothing went live from this link", heading: "This link is invalid or expired", body: "For your security, one-click approval links expire. Open your workspace to review this in the approval queue." },
};

export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const input = STATES[url.searchParams.get("state") ?? "confirm"] ?? STATES.confirm!;
  let html = xaDecisionPageHtml(input).replace('action="/api/approve"', 'action="#" onsubmit="return false"');
  if (url.searchParams.get("brand") === "agency") html = brandXaPage(html, { agencyId: "fictional", name: "North Studio", logoUrl: null, accentColor: "#2f5236", replyTo: null, credit: "runs_on_strelva" });
  return new Response(html, { status: input.status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
