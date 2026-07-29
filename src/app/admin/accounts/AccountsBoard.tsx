"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Vital, Chip, AdminEmpty } from "../console";
import type { Account, AccountStatus } from "@/lib/accounts";

export interface SiteOption {
  id: string;
  name: string;
  domain: string | null;
}

interface Row {
  account: Account;
  mrrCents: number;
  siteNames: string[];
}

function money(cents: number): string {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d}` : `$${d.toFixed(2)}`;
}

const STATUS_TONE: Record<AccountStatus, "good" | "warn" | "crit"> = {
  active: "good",
  paused: "warn",
  churned: "crit",
};

async function api(path: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok;
}

export function AccountsBoard({
  rows,
  sites,
  unassignedSites,
  totalMrrCents,
  multiSiteCount,
}: {
  rows: Row[];
  sites: SiteOption[];
  unassignedSites: SiteOption[];
  totalMrrCents: number;
  multiSiteCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(id: string, fn: () => Promise<boolean>) {
    setBusy(id);
    const ok = await fn();
    setBusy(null);
    if (ok) refresh();
  }

  async function createAccount() {
    if (!name.trim()) return;
    await run("__create__", async () => {
      const ok = await api("/api/admin/accounts", "POST", {
        name: name.trim(),
        primaryContactName: contactName.trim() || undefined,
        primaryContactEmail: contactEmail.trim() || undefined,
      });
      if (ok) {
        setName("");
        setContactName("");
        setContactEmail("");
        setShowCreate(false);
      }
      return ok;
    });
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Vital label="Accounts" value={rows.length} verdict={`${multiSiteCount} multi-site`} />
        <Vital label="Bundled MRR" value={money(totalMrrCents)} verdict="active subscriptions" verdictTone="good" />
        <Vital label="Unassigned sites" value={unassignedSites.length} verdict="not in any account" verdictTone={unassignedSites.length ? "warn" : "neutral"} />
      </div>

      {/* Create */}
      <Panel
        title="New account"
        trailing={
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="text-[12px] font-medium text-gray-muted hover:text-accent transition-colors"
          >
            {showCreate ? "Cancel" : "+ Add"}
          </button>
        }
      >
        {showCreate && (
          <div className="space-y-3 px-[18px] pb-[18px]">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Account name (e.g. Andy Anderson)"
                className="rounded-lg border border-glass-border bg-surface-raised px-3 py-2 text-[13px] text-warm-white placeholder:text-gray-faint focus:border-accent focus:outline-none"
              />
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                className="rounded-lg border border-glass-border bg-surface-raised px-3 py-2 text-[13px] text-warm-white placeholder:text-gray-faint focus:border-accent focus:outline-none"
              />
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Contact email"
                className="rounded-lg border border-glass-border bg-surface-raised px-3 py-2 text-[13px] text-warm-white placeholder:text-gray-faint focus:border-accent focus:outline-none"
              />
            </div>
            <button
              onClick={createAccount}
              disabled={!name.trim() || busy === "__create__"}
              className="rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent transition hover:brightness-105 disabled:opacity-50"
            >
              {busy === "__create__" ? "Creating…" : "Create account"}
            </button>
          </div>
        )}
        {!showCreate && (
          <p className="px-[18px] pb-[18px] text-[12.5px] text-gray-muted">
            Group a multi-site owner (like Andy: CoCard + Vermont Unlimited) under one account, then assign their sites below.
          </p>
        )}
      </Panel>

      {/* Accounts */}
      {rows.length === 0 ? (
        <AdminEmpty
          icon={<span className="text-lg">◇</span>}
          title="No accounts yet"
          description="Create an account to group a customer's sites under one bundled subscription."
        />
      ) : (
        <div className="space-y-4">
          {rows.map(({ account, mrrCents }) => {
            const addable = sites.filter((s) => !account.tenantIds.includes(s.id));
            return (
              <Panel key={account.id}>
                <div className="px-[18px] py-4">
                  {/* header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-display text-[17px] font-medium tracking-[-0.01em] text-warm-white">
                        {account.name}
                      </span>
                      <Chip tone={STATUS_TONE[account.status]}>{account.status}</Chip>
                      {account.tenantIds.length > 1 && <Chip tone="accent">{account.tenantIds.length} sites</Chip>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-[18px] font-medium text-warm-white">{money(mrrCents)}<span className="text-[12px] text-gray-faint">/mo</span></span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete account "${account.name}"? Its sites become standalone again.`)) {
                            run(account.id, () => api(`/api/admin/accounts/${account.id}`, "DELETE"));
                          }
                        }}
                        className="text-[11.5px] font-medium text-gray-faint hover:text-critical transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {(account.primaryContactName || account.primaryContactEmail) && (
                    <p className="mt-1 text-[12px] text-gray-muted">
                      {account.primaryContactName}
                      {account.primaryContactName && account.primaryContactEmail ? " · " : ""}
                      {account.primaryContactEmail}
                    </p>
                  )}

                  {/* subscription line items */}
                  {account.subscription?.items && account.subscription.items.length > 0 && (
                    <div className="mt-3 rounded-lg border border-glass-border bg-surface-raised px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-faint">Bundled subscription{account.subscription.status ? ` · ${account.subscription.status}` : ""}</p>
                      <div className="mt-1.5 space-y-1">
                        {account.subscription.items.map((it) => (
                          <div key={it.tenantId} className="flex items-center justify-between text-[12.5px]">
                            <span className="text-gray-muted">{it.label}</span>
                            <span className="font-mono text-warm-white tabular-nums">{money(it.amountCents)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* sites */}
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-faint mb-1.5">Sites</p>
                    {account.tenantIds.length === 0 ? (
                      <p className="text-[12px] text-gray-faint">No sites assigned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {account.tenantIds.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1.5 rounded-md bg-gray-bg px-2 py-1 text-[12px] text-warm-white">
                            {siteName.get(id) || id}
                            <button
                              onClick={() => run(`${account.id}:${id}`, () => api(`/api/admin/accounts/${account.id}`, "PATCH", { unlinkTenant: id }))}
                              disabled={busy === `${account.id}:${id}`}
                              className="text-gray-faint hover:text-critical transition-colors"
                              aria-label={`Remove ${siteName.get(id) || id}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* add site */}
                    {addable.length > 0 && (
                      <div className="mt-2.5">
                        <select
                          defaultValue=""
                          disabled={busy === `add:${account.id}`}
                          onChange={(e) => {
                            const tid = e.target.value;
                            if (tid) run(`add:${account.id}`, () => api(`/api/admin/accounts/${account.id}`, "PATCH", { linkTenant: tid }));
                            e.target.value = "";
                          }}
                          className="rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-[12.5px] text-warm-white focus:border-accent focus:outline-none"
                        >
                          <option value="" disabled>+ Assign a site…</option>
                          {addable.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}{s.domain ? ` (${s.domain})` : ""}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {pending && <p className="text-[11px] text-gray-faint">Updating…</p>}
    </div>
  );
}
