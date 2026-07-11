"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Download,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  Lock,
  Package,
  ShieldCheck,
  UserMinus,
} from "lucide-react";

import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { Button } from "@/components/ui/Button";

type Domain = { domain: string; status: "connected" | "pending"; isApex: boolean };
type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

const OWNED_ITEMS = [
  "Your domain — registered in your name from day one. You hold the registrar/Cloudflare account; Strelva only has a DNS-edit member role.",
  "All your content — business name, copy, services, pricing, hours, FAQs, testimonials, blog posts, and the uploaded photos, logos, and product images on the site. Export it anytime from this dashboard.",
  "On the monthly plan: the full site repo and source files, which transfer to you at month 12 or earlier via buyout. Your domain is already yours either way.",
];

const MANAGED_ITEMS = [
  "Hosting and deployment — the production build, deploy pipeline, uptime monitoring, and SSL that keep your site live while you're subscribed.",
  "The platform — dashboard software, AI tools, review workflow, analytics, weekly reports, integrations, and cache/revalidation plumbing.",
  "Strelva platform source code and deployment credentials. (The platform itself stays with Strelva; your site repo is what transfers to you.)",
];

const HANDOFF_STEPS = [
  {
    title: "Export content",
    body: "Download the structured JSON before any handoff. It includes page sections, settings, theme, navigation, footer, and page configuration — everything Strelva renders from.",
  },
  {
    title: "Export assets",
    body: "Download the asset manifest and save the originals from every listed URL. Confirm logo, hero, service, provider, product, and story images are present.",
  },
  {
    title: "Repo + files transfer",
    body: "On the monthly plan, the site repo and source files transfer to you at month 12 — or earlier via buyout. Strelva bakes your exported content in so the repo runs on its own, then hands you ownership.",
  },
  {
    title: "DNS is already yours",
    body: "Your domain has been in your name since day one. There's nothing to move — Strelva just steps off the DNS-edit access once your deploy is live on your own account.",
  },
  {
    title: "Cancel billing",
    body: "Use the billing portal when handoff timing is confirmed. Canceling billing doesn't move the repo or export files by itself — do the exports and transfer first.",
  },
  {
    title: "Revoke access",
    body: "After the transfer, remove Strelva's DNS-edit role and any repo/deploy access, plus connected Google Business, booking, social, and email tools.",
  },
];

const BILLING_COPY: Record<SubscriptionStatus, string> = {
  active: "Your plan is active.",
  trialing: "Your trial is active.",
  past_due: "Payment needs attention before normal cancellation flow may be available.",
  cancelled: "Your subscription is already canceled.",
  none: "No Stripe subscription is connected in this tenant.",
};

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] || fallback;
}

export function OwnershipSection() {
  const dashboard = useDashboardOptional();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [downloading, setDownloading] = useState<"content" | "assets" | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [confirmingHandoff, setConfirmingHandoff] = useState(false);
  const [handoffNote, setHandoffNote] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);

  const subscriptionStatus = dashboard?.subscriptionStatus ?? "none";
  const apiHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );

  useEffect(() => {
    fetch(apiHref("/api/admin/domains"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { domains: [] }))
      .then((data) => setDomains(data.domains || []))
      .catch(() => setDomains([]))
      .finally(() => setLoadingDomains(false));
  }, [apiHref]);

  async function downloadExport(kind: "content" | "assets") {
    setError("");
    setNotice("");
    setDownloading(kind);
    try {
      const res = await fetch(apiHref(`/api/tenant-export/${kind}`), { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Export failed with ${res.status}`);
      const blob = await res.blob();
      downloadBlob(
        blob,
        filenameFromDisposition(res.headers.get("Content-Disposition"), `${dashboard?.tenantId || "site"}-${kind}.json`),
      );
      setNotice(kind === "content" ? "Content export downloaded." : "Asset manifest downloaded.");
    } catch {
      setError("Could not download that export. Try again or ask Strelva for a handoff package.");
    } finally {
      setDownloading(null);
    }
  }

  async function sendFilesRequest() {
    setError("");
    setNotice("");
    setRequesting(true);
    try {
      const res = await fetch(apiHref("/api/offboarding/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          notes: handoffNote.trim() || "Owner requested their site files from the Ownership Center.",
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setConfirmingHandoff(false);
      setHandoffNote("");
      setNotice("We've got your request — we'll reach out to hand over your files.");
    } catch {
      setError("Could not send that request. You can still download your exports or email Strelva directly.");
    } finally {
      setRequesting(false);
    }
  }

  async function openBillingPortal() {
    setBillingError("");
    setOpeningPortal(true);
    try {
      const res = await fetch(apiHref("/api/billing/portal"), {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.portalUrl) {
        setBillingError(
          res.status === 404 || !dashboard?.hasStripeCustomer
            ? "Your plan is managed by Strelva — message us anytime to change or end it."
            : body?.error || "Could not open the billing portal.",
        );
        return;
      }
      window.open(body.portalUrl, "_blank", "noopener,noreferrer");
    } catch {
      setBillingError("Could not open the billing portal. Check your connection and try again.");
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-glass-border bg-glass p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Handoff clarity
          </p>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-warm-white">
            Your domain, your content, your customers — leave anytime, with everything.
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
            Nothing here is locked in. Export your content and assets whenever you want, request your site files in one click, and see exactly what transfers before any offboarding, DNS, or billing change.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={downloading === "content" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            onClick={() => downloadExport("content")}
            disabled={!!downloading}
          >
            Export content
          </Button>
          <Button
            variant="primary"
            icon={downloading === "assets" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            onClick={() => downloadExport("assets")}
            disabled={!!downloading}
          >
            Export assets
          </Button>
        </div>
      </div>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-[12px] ${error ? "border-amber-400/20 bg-amber-400/10 text-amber-300" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-glass-border bg-glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" strokeWidth={1.5} />
            <h3 className="text-[16px] font-medium text-warm-white">Your business owns</h3>
          </div>
          <div className="space-y-3">
            {OWNED_ITEMS.map((item) => (
              <div key={item} className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.6} />
                <p className="text-[13px] leading-relaxed text-gray-muted">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-glass-border bg-glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-muted" strokeWidth={1.5} />
            <h3 className="text-[16px] font-medium text-warm-white">Strelva manages</h3>
          </div>
          <div className="space-y-3">
            {MANAGED_ITEMS.map((item) => (
              <div key={item} className="flex gap-3">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-gray-muted" strokeWidth={1.5} />
                <p className="text-[13px] leading-relaxed text-gray-muted">{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-glass-border bg-glass p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
              Your site files
            </p>
            <h3 className="mt-1 text-[18px] font-medium text-warm-white">Request your site files</h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-gray-muted">
              One click tells Strelva you want the site repo and source files handed over. We&apos;ll confirm timing and walk the transfer with you — your domain is already in your name, so there&apos;s nothing to move there.
            </p>
          </div>
          {!confirmingHandoff && (
            <Button
              variant="primary"
              icon={<Package className="h-4 w-4" />}
              onClick={() => {
                setError("");
                setNotice("");
                setConfirmingHandoff(true);
              }}
            >
              Request your site files
            </Button>
          )}
        </div>

        {confirmingHandoff && (
          <div className="mb-6 rounded-lg border border-accent/30 bg-accent-dim/40 p-4">
            <label htmlFor="handoff-note" className="block text-[12px] font-medium text-warm-white">
              Anything we should know? (optional)
            </label>
            <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
              Add your timing, where you&apos;re taking the site, or a question. We&apos;ll read it before we reach out.
            </p>
            <textarea
              id="handoff-note"
              value={handoffNote}
              onChange={(event) => setHandoffNote(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Hoping to move in the next month — what do you need from me?"
              className="mt-3 w-full resize-none rounded-lg border border-gray-border bg-surface-raised px-3 py-2 text-[13px] text-warm-white placeholder:text-gray-faint focus:border-accent/50 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                onClick={sendFilesRequest}
                disabled={requesting}
              >
                Send request
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmingHandoff(false);
                  setHandoffNote("");
                }}
                disabled={requesting}
              >
                Cancel
              </Button>
              <span className="text-[11px] text-gray-faint">Sending this doesn&apos;t cancel billing or move anything.</span>
            </div>
          </div>
        )}

        <div className="mb-5 border-t border-glass-border pt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Offboarding checklist
          </p>
          <h4 className="mt-1 text-[15px] font-medium text-warm-white">Move cleanly, in order</h4>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {HANDOFF_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-lg border border-gray-border bg-surface-raised p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-dim text-[11px] font-semibold text-accent">
                  {index + 1}
                </span>
                <h4 className="text-[13px] font-medium text-warm-white">{step.title}</h4>
              </div>
              <p className="text-[12px] leading-relaxed text-gray-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-glass-border bg-glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-accent" strokeWidth={1.5} />
            <h3 className="text-[16px] font-medium text-warm-white">DNS and domain handoff</h3>
          </div>
          <div className="rounded-lg border border-gray-border">
            <div className="grid grid-cols-[1fr_100px] border-b border-gray-border px-4 py-2 text-[11px] font-mono uppercase tracking-wide text-gray-faint">
              <span>Connected domain</span>
              <span>Status</span>
            </div>
            {loadingDomains ? (
              <div className="px-4 py-4 text-[13px] text-gray-muted">Loading domains...</div>
            ) : domains.length ? (
              domains.map((domain) => (
                <div key={domain.domain} className="grid grid-cols-[1fr_100px] border-b border-gray-border/50 px-4 py-3 last:border-b-0">
                  <span className="truncate text-[13px] text-warm-white">{domain.domain}</span>
                  <span className={domain.status === "connected" ? "text-[12px] text-emerald-400" : "text-[12px] text-amber-400"}>
                    {domain.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-[13px] text-gray-muted">No custom domains are connected.</div>
            )}
          </div>
          <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.5} />
              <p className="text-[12px] leading-relaxed text-gray-muted">
                Do not delete DNS records until the next provider confirms the replacement site is live. DNS changes can take hours to settle, and removing domains early can interrupt the live site.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-glass-border bg-glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-accent" strokeWidth={1.5} />
            <h3 className="text-[16px] font-medium text-warm-white">Billing cancellation</h3>
          </div>
          <p className="text-[13px] leading-relaxed text-gray-muted">{BILLING_COPY[subscriptionStatus]}</p>
          <button
            onClick={openBillingPortal}
            disabled={openingPortal}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-border px-4 py-2 text-[12px] text-gray-muted transition-colors hover:bg-surface-raised hover:text-warm-white disabled:opacity-60"
          >
            {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Open billing portal
          </button>
          {billingError && <p className="mt-3 text-[12px] text-amber-400">{billingError}</p>}
          <div className="mt-5 border-t border-gray-border pt-4">
            <div className="mb-2 flex items-center gap-2">
              <UserMinus className="h-4 w-4 text-gray-muted" strokeWidth={1.5} />
              <p className="text-[13px] font-medium text-warm-white">Admin revocation</p>
            </div>
            <p className="text-[12px] leading-relaxed text-gray-muted">
              After exports, DNS handoff, and billing timing are confirmed, remove Strelva access from registrar, Google Business, booking, social, email, and analytics accounts.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
