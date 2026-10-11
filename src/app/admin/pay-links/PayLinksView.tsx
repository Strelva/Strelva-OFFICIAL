"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StEmpty, StField, StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StSurface, StTextButton, StTextField } from "@/components/ui/strelva/Kit";

export interface PaidPayment {
  amountCents: number;
  customerEmail?: string;
  paidAt: string;
}

export interface PayLink {
  slug: string;
  clientName: string;
  /** Retained on existing records (build | managed_start), no longer operator-facing. */
  door?: string;
  tenantId?: string;
  leadSlug?: string;
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
  customCopy?: string;
  returnUrl?: string;
  createdAt?: string;
  createdBy?: string;
}

type AmountMode = "fixed" | "range";

const blankForm = {
  slug: "",
  clientName: "",
  tenantId: "",
  returnUrl: "",
  customCopy: "",
  mode: "fixed" as AmountMode,
  amountDollars: "",
  minDollars: "",
  maxDollars: "",
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/** Format an ISO timestamp as "Mon D" or "Mon D, YYYY" if not current year. */
function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return "";
  }
}

export function PayLinksView({ request = fetch, initialLinks, initialPayments = {}, preview = false }: { request?: typeof fetch; initialLinks?: PayLink[]; initialPayments?: Record<string, PaidPayment>; preview?: boolean }) {
  const [links, setLinks] = useState<PayLink[]>(initialLinks ?? []);
  const [clients, setClients] = useState<Array<{ id: string; siteName?: string }>>([]);
  const [paidPayments, setPaidPayments] = useState<Record<string, PaidPayment>>(initialPayments);
  const [loading, setLoading] = useState(initialLinks === undefined);
  const [form, setForm] = useState(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  // Revenue roll-up across the pay-link book. "Collected" = the ACTUAL amount
  // charged (from the build-payment trail), so a paid range link counts for what
  // the client really paid, not $0. "Outstanding" = the face amount of unpaid
  // fixed links (range links have no single figure, so they can't be projected).
  const rollup = useMemo(() => {
    let collected = 0;
    let outstanding = 0;
    for (const l of links) {
      const paid = paidPayments[l.slug];
      if (paid) {
        collected += paid.amountCents;
      } else if (typeof l.amountCents === "number") {
        outstanding += l.amountCents;
      }
    }
    return { collected, outstanding };
  }, [links, paidPayments]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request("/api/admin/pay-links");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (res.status === 403 ? "Operator access is required to read payment links." : "Failed to load pay links"));
      setLinks(data.payLinks ?? []);
      setPaidPayments(data.paidPayments ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pay links");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (preview) return;
    void load();
    // Client list for the "Link to client" picker — so the operator selects a
    // real client instead of typing an internal slug (a typo silently minted an
    // unlinked link).
    void (async () => {
      try {
        const res = await request("/api/admin/tenants");
        if (res.ok) setClients(await res.json());
      } catch {
        /* picker degrades to no options; the field stays usable */
      }
    })();
  }, [preview, request, load]);

  async function submit() {
    setError(null);
    if (!form.slug.trim() || !form.clientName.trim()) {
      setError("Slug and client name are required.");
      return;
    }

    // The offer is "build" (a one-time charge) — the superseded managed-start
    // door is gone from the UI; the backend still keys its one-time payment
    // purpose off door:"build". leadSlug defaults server-side to the slug.
    const body: Record<string, unknown> = {
      slug: form.slug.trim(),
      clientName: form.clientName.trim(),
      door: "build",
      // leadSlug intentionally omitted — lib defaults it to the slug
    };

    if (form.tenantId.trim()) body.tenantId = form.tenantId.trim();
    if (form.returnUrl.trim()) body.returnUrl = form.returnUrl.trim();
    if (form.customCopy.trim()) body.customCopy = form.customCopy.trim();

    if (form.mode === "range") {
      const min = Number(form.minDollars);
      const max = Number(form.maxDollars);
      if (!min || !max) {
        setError("A range link needs both a minimum and a maximum amount.");
        return;
      }
      body.minCents = Math.round(min * 100);
      body.maxCents = Math.round(max * 100);
    } else {
      const amount = Number(form.amountDollars);
      if (!amount) {
        setError("An amount is required.");
        return;
      }
      body.amountCents = Math.round(amount * 100);
    }

    setSubmitting(true);
    try {
      const res = await request("/api/admin/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setForm(blankForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mint link");
    } finally {
      setSubmitting(false);
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/pay/${slug}`;
    void navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
  }

  async function revoke(slug: string) {
    setConfirmingRevoke(null);
    setError(null);
    try {
      const res = await request(`/api/admin/pay-links?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.payLinks.label} meta="Acting agency: Strelva Agency · Runs on Strelva. One-off service charges, setup fees and deposits." />
    <StNotice>Legacy Strelva Agency service billing. These payment-link controls still require operator access; ordinary agency payment-link creation is not available here.</StNotice>
    <StSection title="New Strelva Agency payment link">
      <StSurface label="New payment link form">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Slug" value={form.slug} onChange={v => setForm({ ...form, slug: v })} placeholder="[payment link name]" />
            <Field label="Client name" value={form.clientName} onChange={v => setForm({ ...form, clientName: v })} placeholder="[business name]" />
            <StField label="Link to site (optional)" hint="Pick the site to tie this link to its support record. Otherwise, leave it unlinked.">
              <select value={form.tenantId} onChange={e => {
                const id = e.target.value;
                const picked = clients.find(c => c.id === id);
                setForm(f => ({ ...f, tenantId: id, clientName: f.clientName.trim() ? f.clientName : (picked?.siteName ?? f.clientName) }));
              }}><option value="">No site linked</option>{clients.map(c => <option key={c.id} value={c.id}>{c.siteName || c.id}</option>)}</select>
            </StField>
            <StField label="Amount type"><select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as AmountMode })}><option value="fixed">Fixed amount</option><option value="range">Let them choose (range)</option></select></StField>
            {form.mode === "range" ? <>
              <Field label="Minimum (USD)" value={form.minDollars} onChange={v => setForm({ ...form, minDollars: v })} type="number" />
              <Field label="Maximum (USD)" value={form.maxDollars} onChange={v => setForm({ ...form, maxDollars: v })} type="number" />
              <p className="sm:col-span-2 text-sm text-gray-muted">The client chooses on a $50-step slider. The difference between maximum and minimum must be a whole multiple of $50.</p>
            </> : <Field label="Amount (USD)" value={form.amountDollars} onChange={v => setForm({ ...form, amountDollars: v })} type="number" />}
            <Field label="Client website URL (optional)" value={form.returnUrl} onChange={v => setForm({ ...form, returnUrl: v })} placeholder="[website URL]" description="Back-link shown on the payment page." />
            <Field label="Note on payment page (optional)" value={form.customCopy} onChange={v => setForm({ ...form, customCopy: v })} description="Shown under the payment description." />
          </div>
          {error && <StNotice tone="critical">{error}</StNotice>}
          <div><StPill onClick={() => void submit()} disabled={submitting} busy={submitting}>{submitting ? "Creating…" : "Create Strelva Agency payment link"}</StPill></div>
        </div>
      </StSurface>
    </StSection>
    <StSection title="Payment links" meta={loading ? undefined : <StMono>{links.length}</StMono>}>
      {(rollup.collected > 0 || rollup.outstanding > 0) && <p className="text-sm text-gray-muted"><StMono tone="live">{dollars(rollup.collected)} collected</StMono> · <StMono>{dollars(rollup.outstanding)} outstanding</StMono> (fixed links only)</p>}
      {loading ? <StSkeleton label="Loading payment links" /> : links.length === 0 ? <StEmpty>No payment links yet.</StEmpty> : <StRows label="Payment links">{links.map(l => {
        const paid = paidPayments[l.slug];
        return <StRow key={l.slug} title={l.clientName} detail={<><StMono>/pay/{l.slug}{typeof l.amountCents === "number" ? ` · ${dollars(l.amountCents)}` : typeof l.minCents === "number" && typeof l.maxCents === "number" ? ` · ${dollars(l.minCents)}–${dollars(l.maxCents)}` : ""}</StMono><br />Strelva Agency · Creator: {l.createdBy || "Actor not recorded"}<br />{l.tenantId ? <StTextButton href={`/admin/clients/${l.tenantId}`}>{l.tenantId}</StTextButton> : "No site linked"}{paid && <><br /><StState kind="live">Paid {dollars(paid.amountCents)}</StState>{paid.customerEmail && ` · ${paid.customerEmail}`}{paid.paidAt && <StMono> · {shortDate(paid.paidAt)}</StMono>}</> }</>}
          end={<div className="flex flex-wrap items-center gap-4"><StTextButton onClick={() => copyLink(l.slug)}>{copied === l.slug ? "Copied" : "Copy URL"}</StTextButton>{confirmingRevoke === l.slug ? <><StTextButton tone="danger" onClick={() => void revoke(l.slug)}>Confirm revoke</StTextButton><StTextButton onClick={() => setConfirmingRevoke(null)}>Cancel</StTextButton></> : <StTextButton tone="danger" onClick={() => setConfirmingRevoke(l.slug)}>Revoke</StTextButton>}</div>} />;
      })}</StRows>}
    </StSection>
  </StPage>;
}

function Field({ label, value, onChange, placeholder, type = "text", description }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; description?: string }) {
  return <StTextField label={label} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} description={description} />;
}
