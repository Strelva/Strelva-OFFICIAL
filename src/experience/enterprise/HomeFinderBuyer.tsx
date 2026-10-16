"use client";
/**
 * The buyer's Home Finder (XA, lane xs-apps-care). Opened from the
 * brokerage's own website: the brokerage's name on top, one search, then the
 * homes. Asking about a home opens in place under that home, never in a
 * modal. The entry token, consent, same-submission retry and delivery
 * evidence are unchanged.
 */
import { useId, useRef, useState } from "react";
import { z } from "zod";
import { XaButton, XaField, XaHeadline, XaStatus, XaTextArea, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaNote, XaOutside } from "@/experience/xa-object/XaObjectPage";
import { homeFinderSearchResultSchema, type HomeFinderInquiry } from "@/products/home-finder/contracts";
import type { HomeFinderDeliveryDetail } from "@/platform/customers/home-finder-port";
import styles from "./home-finder.module.css";

type Search = z.infer<typeof homeFinderSearchResultSchema>;
type Listing = Search["listings"][number];
const resultSchema = z.object({ status: z.enum(["pending", "delivered", "unavailable"]), requestId: z.string().uuid(), message: z.string(), reference: z.string() });
interface BuyerProps { bindingId: string; entryToken: string; brokerageName: string; request?: typeof fetch; mode?: "light" | "dark" }
const price = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const DELIVERY_WORD = { pending: "On its way", delivered: "Delivered", bounced: "Bounced", failed: "Not delivered" } as const;

export function HomeFinderBuyer({ request = fetch, ...props }: BuyerProps) {
  return <BuyerSearch key={props.bindingId} {...props} request={request} />;
}

function BuyerSearch({ bindingId, entryToken, brokerageName, request, mode }: BuyerProps & { request: typeof fetch }) {
  const [query, setQuery] = useState(""), [result, setResult] = useState<Search | null>(null), [selected, setSelected] = useState<Listing | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const token = useRef(entryToken);
  const searchId = useId();
  const endpoint = `/api/home-finder/${encodeURIComponent(bindingId)}`;
  async function currentEntry() { const response = await request(`${endpoint}?renew=1`, { credentials: "omit", headers: { "x-home-finder-entry": token.current } }); const value = z.object({ token: z.string() }).parse(await response.json()); if (!response.ok) throw new Error("Reopen Home Finder on the brokerage website."); token.current = value.token; return value.token; }
  async function search() {
    if (busy) return; setBusy(true); setError("");
    try { const response = await request(`${endpoint}?${new URLSearchParams({ q: query, limit: "20" })}`, { credentials: "omit", headers: { "x-home-finder-entry": await currentEntry() } }); const body: unknown = await response.json(); if (!response.ok) throw new Error("Licensed listings are currently unavailable. Your inquiry has not been started."); setResult(homeFinderSearchResultSchema.parse(body)); setSelected(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Search is unavailable."); } finally { setBusy(false); }
  }
  return <XaOutside from={brokerageName} mode={mode} meta="Home search" label={`${brokerageName} Home Finder`}>
    <XaHeadline size="lg" quiet="Ask about any home and the brokerage answers you.">Find your home</XaHeadline>
    <form className={styles.search} role="search" onSubmit={event => { event.preventDefault(); void search(); }}>
      <div className={styles.searchField}>
        <label htmlFor={searchId}>City, area or address</label>
        <input id={searchId} value={query} maxLength={160} disabled={busy || Boolean(selected)} onChange={e => setQuery(e.target.value)} placeholder="Elmwood Village, Buffalo" autoComplete="off" />
      </div>
      <XaButton type="submit" variant={selected ? "secondary" : "primary"} size="lg" disabled={busy || Boolean(selected)} busy={busy}>Search homes</XaButton>
    </form>
    {error ? <div role="alert"><XaNote tone="down">{error}</XaNote></div> : null}
    {busy && !selected ? <XaWorking title="Reading current listings" steps={[{ id: "feed", label: `Asking ${brokerageName}'s listing feed`, state: "active" }]} /> : null}
    {result ? <section className={styles.results} aria-label="Homes">
      <p className={styles.resultsHead}><span>{result.count.toLocaleString("en-US")} {result.count === 1 ? "home" : "homes"}</span><span>{result.source.name} · checked <time dateTime={result.sourceCheckedAt}>{new Date(result.sourceCheckedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></span></p>
      {result.listings.length ? <ul className={styles.listings} aria-label="Search results">{result.listings.map(listing => <li key={listing.id} className={styles.listing} data-selected={selected?.id === listing.id || undefined}>
        <div className={styles.listingMain}>
          <p className={styles.address}>{listing.address.line}</p>
          <p className={styles.place}>{listing.address.city}, {listing.address.state} {listing.address.postalCode}</p>
          <p className={styles.facts}><b>{price(listing.price)}</b><span>{listing.bedrooms ?? "Not listed"} beds</span><span>{listing.bathrooms ?? "Not listed"} baths</span>{listing.status !== "active" ? <XaStatus kind="waits" size="sm">{listing.status === "coming-soon" ? "Coming soon" : "Under contract"}</XaStatus> : null}</p>
          {listing.publicRemarks ? <p className={styles.remarks}>{listing.publicRemarks}</p> : null}
          <p className={styles.provenance}>Listing brokerage: {listing.listOfficeName ?? "Not supplied"} · Listing contact: {listing.listAgentName ?? "Not supplied"} · MLS source: {listing.sourceSystemName ?? result.source.name}</p>
        </div>
        {selected?.id === listing.id ? null : <XaButton variant="secondary" size="sm" disabled={Boolean(selected)} onClick={() => setSelected(listing)}>Ask about {listing.address.line}</XaButton>}
        {selected?.id === listing.id ? <BuyerInquiry key={selected.id} bindingId={bindingId} brokerageName={brokerageName} listing={selected} currentEntry={currentEntry} request={request} onClose={() => setSelected(null)} /> : null}
      </li>)}</ul> : <XaNote>No displayable homes match this search. Try a different city or area.</XaNote>}
    </section> : !error && !busy ? <XaNote>Choose an area to see current, permitted listings.</XaNote> : null}
  </XaOutside>;
}

function BuyerInquiry({ bindingId, brokerageName, listing, onClose, currentEntry, request }: { bindingId: string; brokerageName: string; listing: Listing; currentEntry: () => Promise<string>; onClose: () => void; request: typeof fetch }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [message, setMessage] = useState(""), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<z.infer<typeof resultSchema> | null>(null), [delivery, setDelivery] = useState<HomeFinderDeliveryDetail | null>(null);
  const pending = useRef<HomeFinderInquiry | null>(null), inflight = useRef(false), endpoint = `/api/home-finder/${encodeURIComponent(bindingId)}`;
  async function send() {
    if (inflight.current || receipt) return; inflight.current = true; setBusy(true); setError("");
    pending.current ??= { submissionId: crypto.randomUUID(), listing: { id: listing.id, address: [listing.address.line, listing.address.city, listing.address.state, listing.address.postalCode].filter(Boolean).join(", "), inquiryToken: listing.inquiryToken }, buyer: { name, email, ...(phone ? { phone } : {}) }, ...(message ? { message } : {}), consent: true };
    try { const response = await request(endpoint, { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", "x-home-finder-entry": await currentEntry() }, body: JSON.stringify(pending.current) }); const body: unknown = await response.json(); if (!response.ok) throw new Error("Delivery could not be confirmed. Retry this same inquiry or contact the brokerage with your reference."); const value = resultSchema.parse(body); if (value.requestId !== pending.current.submissionId) throw new Error("The receipt could not be confirmed."); setReceipt(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery could not be confirmed."); } finally { inflight.current = false; setBusy(false); }
  }
  async function checkReceipt() {
    if (!receipt || busy) return; setBusy(true); setError("");
    try { const response = await request(`${endpoint}?${new URLSearchParams({ submissionId: receipt.requestId, receipt: receipt.reference })}`, { credentials: "omit" }); if (!response.ok) throw new Error("Delivery evidence is unavailable. Keep your reference; do not start another inquiry."); const value: unknown = await response.json(); const parsed = z.object({ installationId: z.string(), reference: z.string(), state: z.enum(["pending", "delivered", "bounced", "failed"]), occurredAt: z.string(), expiresAt: z.string(), observedAt: z.string(), schemaVersion: z.literal("1") }).strict().parse(value); if (parsed.reference !== receipt.reference) throw new Error("The receipt scope could not be confirmed."); setDelivery(parsed); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery evidence is unavailable."); } finally { setBusy(false); }
  }
  const locked = busy || Boolean(pending.current);
  const state = delivery?.state ?? receipt?.status;
  return <section className={styles.inquiry} aria-label={`Ask about ${listing.address.line}`}>
    <h3 className={styles.inquiryTitle}>Ask about {listing.address.line}</h3>
    {error ? <div role="alert"><XaNote tone="down">{error}</XaNote></div> : null}
    {receipt ? <div className={styles.stack}>
      <div role="status"><XaStatus kind={state === "delivered" ? "live" : state === "failed" || state === "bounced" || state === "unavailable" ? "down" : "waits"}>{delivery ? DELIVERY_WORD[delivery.state] : receipt.message}</XaStatus></div>
      <XaNote>Queued means it is on its way to {brokerageName}. Only verified delivery evidence confirms it arrived. Your reference is {receipt.reference}.</XaNote>
      <div className={styles.row}><XaButton variant="secondary" size="sm" disabled={busy} busy={busy} onClick={() => void checkReceipt()}>Check delivery</XaButton><XaTextLink onClick={onClose}>Done</XaTextLink></div>
    </div> : <form className={styles.stack} onSubmit={event => { event.preventDefault(); if (consent) void send(); }}>
      <div className={styles.grid}>
        <XaField label="Your name" required maxLength={120} value={name} disabled={locked} onChange={e => setName(e.target.value)} autoComplete="name" />
        <XaField label="Email" type="email" required maxLength={254} value={email} disabled={locked} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <XaField label="Phone (optional)" type="tel" maxLength={40} value={phone} disabled={locked} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
      <XaTextArea label="Your question" rows={3} maxLength={2000} value={message} disabled={locked} onChange={e => setMessage(e.target.value)} placeholder="When could I see it?" />
      <label className={styles.consent}><input type="checkbox" checked={consent} required disabled={locked} onChange={e => setConsent(e.target.checked)} /><span>I agree to share this question and my contact details with {brokerageName} about this home.</span></label>
      {pending.current ? <XaNote>Your reference is {pending.current.submissionId}. A failed answer can still mean {brokerageName} received it, so retry this same inquiry.</XaNote> : null}
      <div className={styles.row}><XaButton type="submit" variant="primary" disabled={busy || !consent} busy={busy}>{pending.current ? "Retry the same inquiry" : "Send inquiry"}</XaButton>{!pending.current ? <XaButton variant="quiet" disabled={busy} onClick={onClose}>Cancel</XaButton> : null}</div>
    </form>}
  </section>;
}
