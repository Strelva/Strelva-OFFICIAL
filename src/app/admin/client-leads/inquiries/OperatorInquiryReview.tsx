import Link from "next/link";
import { Chip, Panel } from "@/app/admin/console";
import type { InquiryReviewView, OperatorHeldInquiry, OperatorInquiryNotice } from "@/platform/operator-queue";
import { OperatorInquiryActions } from "./OperatorInquiryActions";

export interface InquiryReviewLoad { state: "ready" | "off" | "unavailable" | "denied" | "loading"; held: OperatorHeldInquiry[]; notices: OperatorInquiryNotice[]; next: { at: string; id: string } | null }
export function OperatorInquiryReview({ load, view, recordsOpen, noticesOpen }: { load: InquiryReviewLoad; view: InquiryReviewView; recordsOpen: boolean; noticesOpen: boolean }) {
  return <div className="space-y-6">
    <div><Link href="/admin/client-leads" className="text-sm text-gray-muted underline focus-visible:text-accent">Client leads</Link>
      <h1 className="mt-2 font-display text-[26px] font-medium text-warm-white">Inquiry review</h1>
      <p className="mt-1 max-w-xl text-sm text-gray-muted">Review messages held as spam and notices the owner did not receive. Releasing a message sends no email.</p></div>
    <nav aria-label="Inquiry review" className="flex flex-wrap gap-3 text-sm">
      {recordsOpen && ([['held','Held messages'],['released','Released'],['spam','Confirmed spam']] as const).map(([key,title]) => <Link key={key} href={`?view=${key}`} aria-current={view === key ? "page" : undefined} className="text-warm-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-accent">{title}</Link>)}
      {noticesOpen && <Link href="?view=notices" aria-current={view === "notices" ? "page" : undefined} className="text-warm-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-accent">Owner not told</Link>}
    </nav>
    <Panel title={view === "notices" ? "Owner not told" : view === "released" ? "Released messages" : view === "spam" ? "Confirmed spam" : "Held messages"}>
      {load.state !== "ready" ? <p role="status" className="border-t border-glass-border px-4 py-4 text-sm text-gray-muted">{load.state === "loading" ? "Reading inquiry records…" : load.state === "denied" ? "Only Strelva operators can review these records." : load.state === "off" ? "Inquiry review is not enabled." : <>Inquiry records could not be read. <Link href={`?view=${view}`} className="underline">Try again</Link></>}</p>
        : load.held.length + load.notices.length === 0 ? <p className="border-t border-glass-border px-4 py-4 text-sm text-gray-muted">{view === "notices" ? "No unresolved owner notices on this page." : "No messages in this review state."}</p>
          : <ul className="divide-y divide-glass-border border-t border-glass-border">
            {load.held.map(row => <li key={row.id} className="min-w-0 px-4 py-4"><p className="break-words text-sm font-medium text-warm-white">{row.name || "No name given"} · {row.businessName}</p>
              <p className="mt-1 break-all text-xs text-gray-muted">{row.email} · <time dateTime={row.capturedAt}>{new Date(row.capturedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}</time></p>
              <p className="mt-2 text-sm text-warning">{row.heldReason ?? "Held for review"}</p><p className="mt-2 whitespace-pre-line break-words text-sm text-gray-muted">{row.message}</p>
              <OperatorInquiryActions rowId={row.id} state={row.intakeState} /></li>)}
            {load.notices.map(row => <li key={row.id} className="min-w-0 px-4 py-4"><p className="break-words text-sm font-medium text-warm-white">{row.businessName} · inquiry from {row.name || "a visitor"}</p>
              <div className="mt-2"><Chip tone="warn">{row.status.replace(/_/g, " ")}</Chip></div><p className="mt-2 break-words text-sm text-gray-muted">{row.reason?.replace(/_/g, " ") ?? "Delivery was not confirmed."}</p>
              <p className="mt-2 text-sm text-gray-muted">Correct the owner recipient in the business record first. This repair sends only an owner notice.</p>
              <OperatorInquiryActions notice={row.tenantId ? { tenantId: row.tenantId, inquiryId: row.inquiryId } : { rowId: row.inquiryId }} />
            </li>)}
          </ul>}
    </Panel>
    {load.next && <Link className="inline-block text-sm text-warm-white underline focus-visible:outline focus-visible:outline-accent" href={`?view=${view}&before=${encodeURIComponent(load.next.at)}&beforeId=${load.next.id}`}>Older records</Link>}
  </div>;
}
