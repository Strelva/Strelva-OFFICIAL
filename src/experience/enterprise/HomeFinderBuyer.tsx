"use client";
import styles from "./home-finder-buyer.module.css";
import { useRef, useState } from "react";
import { z } from "zod";
import { StCopy, StEmpty, StField, StHead, StInput, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { homeFinderSearchResultSchema, type HomeFinderInquiry } from "@/products/home-finder/contracts";
import type { HomeFinderDeliveryDetail } from "@/platform/customers/home-finder-port";
type Search = z.infer<typeof homeFinderSearchResultSchema>;
const resultSchema = z.object({ status: z.enum(["pending", "delivered", "unavailable"]), requestId: z.string().uuid(), message: z.string(), reference: z.string() });
interface BuyerProps { bindingId: string; entryToken: string; brokerageName: string; request?: typeof fetch }
export function HomeFinderBuyer({ request = fetch, ...props }: BuyerProps) {
  return <BuyerSearch key={props.bindingId} {...props} request={request} />;
}
function BuyerSearch({ bindingId, entryToken, brokerageName, request }: BuyerProps & { request: typeof fetch }) {
  const [query, setQuery] = useState(""), [result, setResult] = useState<Search | null>(null), [selected, setSelected] = useState<Search["listings"][number] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const token = useRef(entryToken);
  async function currentEntry() { const response = await request(`${endpoint}?renew=1`, { credentials: "omit", headers: { "x-home-finder-entry": token.current } }); const value = z.object({ token: z.string() }).parse(await response.json()); if (!response.ok) throw new Error("Reopen Home Finder on the brokerage website."); token.current = value.token; return value.token; }
  const endpoint = `/api/home-finder/${encodeURIComponent(bindingId)}`;
  async function search() {
    if (busy) return; setBusy(true); setError("");
    try { const response = await request(`${endpoint}?${new URLSearchParams({ q: query, limit: "20" })}`, { credentials: "omit", headers: { "x-home-finder-entry": await currentEntry() } }); const body: unknown = await response.json(); if (!response.ok) throw new Error("Licensed listings are currently unavailable. Your inquiry has not been started."); setResult(homeFinderSearchResultSchema.parse(body)); setSelected(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Search is unavailable."); } finally { setBusy(false); }
  }
  return <main data-dashboard data-workspace-theme="linen" className={styles.paper}>
    <StPage>
      <StHead title="Find your home" meta={brokerageName} />
      <StCopy>Search current brokerage listings, then ask the brokerage about a home. Your contact details go to its verified inquiry destination.</StCopy>
      <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); void search(); }}>
        <div className="min-w-0 flex-1"><StInput label="City, area or address" value={query} maxLength={160} disabled={busy || Boolean(selected)} onChange={e => setQuery(e.target.value)} /></div>
        <StPill type="submit" variant={selected ? "soft" : "primary"} disabled={busy || Boolean(selected)} busy={busy}>Search homes</StPill>
      </form>
      {error ? <StNotice tone="critical">{error}</StNotice> : null}
      {busy ? <div role="status" className="space-y-4"><StCopy>Reading current listings…</StCopy><StSkeleton /><StSkeleton width="70%" /></div> : null}
      {result ? <StSection title="Homes" meta={<StMono>{result.count} results</StMono>}>
        <StCopy muted>{result.source.name} · Feed checked <StMono as="time" dateTime={result.sourceCheckedAt}>{new Date(result.sourceCheckedAt).toLocaleString()}</StMono></StCopy>
        {result.listings.length ? <StRows label="Search results">{result.listings.map(listing => <StRow key={listing.id} title={listing.address.line} detail={`${listing.address.city}, ${listing.address.state} ${listing.address.postalCode}`} align="start" end={<StPill variant="soft" disabled={Boolean(selected)} onClick={() => setSelected(listing)}>Ask about {listing.address.line}</StPill>}>
          <span className="block space-y-2 pt-2 text-sm font-normal">
            <span className="block"><StMono tone="text">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(listing.price)}</StMono> · {listing.bedrooms ?? "—"} beds · {listing.bathrooms ?? "—"} baths</span>
            {listing.publicRemarks ? <span className="block">{listing.publicRemarks}</span> : null}
            <span className="block text-xs text-gray-muted">Listing brokerage: {listing.listOfficeName ?? "Not supplied"} · Listing contact: {listing.listAgentName ?? "Not supplied"} · MLS source: {listing.sourceSystemName ?? result.source.name}</span>
          </span>
        </StRow>)}</StRows> : <StEmpty>No displayable homes match this search. Try a different city or area.</StEmpty>}
      </StSection> : !error && !busy ? <StEmpty>Choose an area to see current, permitted listings.</StEmpty> : null}
      {selected ? <BuyerInquiry key={selected.id} bindingId={bindingId} listing={selected} currentEntry={currentEntry} request={request} onClose={() => setSelected(null)} /> : null}
    </StPage>
  </main>;
}
function BuyerInquiry({ bindingId, listing, onClose, currentEntry, request }: { bindingId: string; listing: Search["listings"][number]; currentEntry: () => Promise<string>; onClose: () => void; request: typeof fetch }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [message, setMessage] = useState(""), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<z.infer<typeof resultSchema> | null>(null), [delivery, setDelivery] = useState<HomeFinderDeliveryDetail | null>(null);
  const pending = useRef<HomeFinderInquiry | null>(null), inflight = useRef(false), endpoint = `/api/home-finder/${encodeURIComponent(bindingId)}`;
  async function send() {
    if (inflight.current || receipt) return; inflight.current = true; setBusy(true); setError("");
    pending.current ??= { submissionId: crypto.randomUUID(), listing: { id: listing.id, address: [listing.address.line, listing.address.city, listing.address.state, listing.address.postalCode].filter(Boolean).join(", "), inquiryToken: listing.inquiryToken }, buyer: { name, email, ...(phone ? { phone } : {}) }, ...(message ? { message } : {}), consent: true };
    try { const response = await request(endpoint, { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", "x-home-finder-entry": await currentEntry() }, body: JSON.stringify(pending.current) }); const body: unknown = await response.json(); if (!response.ok) throw new Error("Delivery could not be confirmed. Retry this same inquiry or contact the brokerage with the request ID."); const value = resultSchema.parse(body); if (value.requestId !== pending.current.submissionId) throw new Error("The receipt could not be confirmed."); setReceipt(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery could not be confirmed."); } finally { inflight.current = false; setBusy(false); }
  }
  async function checkReceipt() {
    if (!receipt || busy) return; setBusy(true); setError("");
    try { const response = await request(`${endpoint}?${new URLSearchParams({ submissionId: receipt.requestId, receipt: receipt.reference })}`, { credentials: "omit" }); if (!response.ok) throw new Error("Delivery evidence is unavailable. Keep your request ID; do not start another inquiry."); const value: unknown = await response.json(); const parsed = z.object({ installationId: z.string(), reference: z.string(), state: z.enum(["pending", "delivered", "bounced", "failed"]), occurredAt: z.string(), expiresAt: z.string(), observedAt: z.string(), schemaVersion: z.literal("1") }).strict().parse(value); if (parsed.reference !== receipt.reference) throw new Error("The receipt scope could not be confirmed."); setDelivery(parsed); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery evidence is unavailable."); } finally { setBusy(false); }
  }
  const locked = busy || Boolean(pending.current);
  return <StSection title={`Ask about ${listing.address.line}`}>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {pending.current ? <StCopy muted>Request ID: <StMono>{pending.current.submissionId}</StMono>. A failed readback can still mean the brokerage received the inquiry.</StCopy> : null}
    <StSurface label={receipt ? "Inquiry receipt" : "Listing inquiry"}>
      {receipt ? <div className="space-y-4">
        <div role="status"><StState kind={(delivery?.state ?? receipt.status) === "delivered" ? "live" : delivery?.state === "failed" || delivery?.state === "bounced" || receipt.status === "unavailable" ? "down" : "need"}>{delivery ? `Delivery: ${delivery.state}` : receipt.message}</StState></div>
        <StCopy muted>Queued is awaiting delivery. Only verified delivery evidence confirms it reached the destination.</StCopy>
        <div className="flex flex-wrap gap-4"><StPill variant="soft" disabled={busy} busy={busy} onClick={() => void checkReceipt()}>Check delivery receipt</StPill><StTextButton disabled={busy} onClick={onClose}>Done</StTextButton></div>
      </div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (consent) void send(); }}>
        <StInput label="Your name" required maxLength={120} value={name} disabled={locked} onChange={e => setName(e.target.value)} />
        <StInput label="Email" type="email" required maxLength={254} value={email} disabled={locked} onChange={e => setEmail(e.target.value)} />
        <StInput label="Phone (optional)" type="tel" maxLength={40} value={phone} disabled={locked} onChange={e => setPhone(e.target.value)} />
        <StField label="Your question"><textarea rows={4} maxLength={2000} value={message} disabled={locked} onChange={e => setMessage(e.target.value)} /></StField>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={consent} required disabled={locked} onChange={e => setConsent(e.target.checked)} />I agree to share this inquiry and my contact details with the brokerage about this listing.</label>
        <div className="flex flex-wrap gap-4"><StPill type="submit" disabled={busy || !consent} busy={busy}>{pending.current ? "Retry the same inquiry" : "Send inquiry"}</StPill>{!pending.current ? <StTextButton type="button" disabled={busy} onClick={onClose}>Cancel</StTextButton> : null}</div>
      </form>}
    </StSurface>
  </StSection>;
}
