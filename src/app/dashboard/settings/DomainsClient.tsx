"use client";

import { useEffect, useState, useRef, useCallback, useMemo, type FormEvent } from "react";
import { Globe, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";

const DOMAINS_API = "/api/tenant/domains";

export type DomainStatus = "connected" | "pending";

export interface DomainEntry {
  domain: string;
  status: DomainStatus;
  isApex: boolean;
}

interface Props {
  initialDomains: DomainEntry[];
}

// Primary domain fields component
function PrimaryDomainFields() {
  const dashboard = useDashboardOptional();
  const apiHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [productionDomain, setProductionDomain] = useState("");
  const [adminDomain, setAdminDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRef = useRef({ productionDomain: "", adminDomain: "" });

  useEffect(() => {
    fetch(apiHref("/api/tenant-settings"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setProductionDomain(data.productionDomain || "");
          setAdminDomain(data.adminDomain || "");
          latestRef.current = {
            productionDomain: data.productionDomain || "",
            adminDomain: data.adminDomain || "",
          };
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiHref]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiHref("/api/tenant-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          productionDomain: latestRef.current.productionDomain,
          adminDomain: latestRef.current.adminDomain,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError("Failed to save");
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      setError("Network error");
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [apiHref]);

  const derivedAdmin = productionDomain ? `admin.${productionDomain}` : "";

  if (loading) {
    return (
      <div className="mb-6 flex flex-col gap-3" aria-busy="true">
        <div className="h-3.5 w-1/3 rounded-md bg-[var(--st-inset)]" />
        <div className="h-11 rounded-[12px] bg-[var(--st-inset)]" />
      </div>
    );
  }

  return (
    <div className="mb-8 flex flex-col">
      <div className="pb-2">
        <span className="text-[13px] font-medium text-[var(--st-text-3)]">
          Your addresses
        </span>
      </div>

      {/* Production domain */}
      <div className="border-b border-[var(--st-line)] py-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <span className="text-[15px] text-warm-black">Your website address</span>
            <p className="text-[12px] text-gray-faint mt-0.5">
              Your main website address (e.g., yourbusiness.com)
            </p>
          </div>
        </div>
        <input
          type="text"
          value={productionDomain}
          onChange={(e) => {
            const val = e.target.value.toLowerCase();
            setProductionDomain(val);
            latestRef.current.productionDomain = val;
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLElement).blur();
          }}
          placeholder="yourbusiness.com"
          className="min-h-[44px] w-full rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-warm-black outline-none transition-colors placeholder:text-[var(--st-faint)] focus-visible:border-[var(--st-accent)]"
          disabled={saving}
        />
      </div>

      {/* Admin domain */}
      <div className="py-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <span className="text-[15px] text-warm-black">This dashboard&apos;s address</span>
            <p className="text-[12px] text-gray-faint mt-0.5">
              Dashboard access. Leave blank to use: {derivedAdmin || "admin.yourdomain.com"}
            </p>
          </div>
        </div>
        <input
          type="text"
          value={adminDomain}
          onChange={(e) => {
            const val = e.target.value.toLowerCase();
            setAdminDomain(val);
            latestRef.current.adminDomain = val;
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLElement).blur();
          }}
          placeholder={derivedAdmin || "admin.yourdomain.com"}
          className="min-h-[44px] w-full rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] text-warm-black outline-none transition-colors placeholder:text-[var(--st-faint)] focus-visible:border-[var(--st-accent)]"
          disabled={saving}
        />
      </div>

      {error && (
        <div className="mb-4 text-[14px] text-[var(--st-critical)]" role="alert">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 flex items-center gap-2 text-[14px] text-[var(--st-accent)]" role="status">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Saved
        </div>
      )}
    </div>
  );
}

export function DomainsClient({ initialDomains }: Props) {
  const dashboard = useDashboardOptional();
  const apiHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const domainsApi = apiHref(DOMAINS_API);
  const [domains, setDomains] = useState<DomainEntry[]>(initialDomains);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(domainsApi, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.domains) setDomains(data.domains);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [domainsApi]);

  // Refresh every 30s so "pending" domains flip to "connected" after DNS propagates.
  useEffect(() => {
    if (!domains.some((d) => d.status === "pending")) return;
    const id = setInterval(() => {
      fetch(domainsApi, { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.domains) setDomains(data.domains);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [domains, domainsApi]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const domain = input.trim().toLowerCase();
    if (!domain) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(domainsApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add domain");
      } else {
        setDomains(data.domains);
        setInput("");
      }
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domain: string) => {
    setConfirmingRemove(null);
    setRemoving(domain);
    setError(null);
    try {
      const res = await fetch(
        `${domainsApi}?domain=${encodeURIComponent(domain)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to remove domain");
      } else {
        setDomains(data.domains);
      }
    } catch {
      setError("Network error");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      {/* Primary domain fields */}
      <PrimaryDomainFields />

      {/* Additional domains heading */}
      <div className="mb-4">
        <span className="text-[13px] font-medium text-[var(--st-text-3)]">
          More addresses
        </span>
        <p className="text-[12px] text-gray-faint mt-1">
          Add extra domains or subdomains that should point to your site.
        </p>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="mb-4 flex items-center gap-2 rounded-full bg-[var(--st-surface)] py-1.5 pl-4 pr-1.5 shadow-[0_1px_2px_#0000000f]"
      >
        <Globe className="w-4 h-4 text-gray-muted shrink-0" strokeWidth={1.5} />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="yourdomain.com"
          className="flex-1 text-[13px] bg-transparent border-0 outline-none text-warm-black placeholder:text-gray-faint"
          disabled={adding}
        />
        <button
          type="submit"
          disabled={adding || !input.trim()}
          className="flex items-center gap-1.5 rounded-full bg-[var(--st-inset)] px-4 py-2 text-[14px] font-medium text-warm-black transition-colors hover:bg-[var(--st-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {adding ? (
            <span className="h-3 w-3 rounded-full border border-[var(--st-line-strong)] border-t-[var(--st-text)] motion-safe:animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          Add domain
        </button>
      </form>

      {error && (
        <div className="mb-4 text-[14px] text-[var(--st-critical)]" role="alert">
          {error}
        </div>
      )}

      {/* Domain list */}
      <div className="flex flex-col">
        {domains.length === 0 ? (
          <div className="py-3 text-left">
            <p className="text-[13px] text-gray-muted">
              {loaded ? "No custom domains yet. Add one above." : "Loading\u2026"}
            </p>
          </div>
        ) : (
          domains.map((entry, i) => (
            <div
              key={entry.domain}
              className={`py-4 ${
                i < domains.length - 1 ? "border-b border-gray-border/50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className=" text-[13px] text-warm-black truncate">
                      {entry.domain}
                    </span>
                    {entry.status === "connected" ? (
                      <span className="flex items-center gap-1.5 text-[13px] text-[var(--st-text-2)]">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[13px] text-[var(--st-need)]">
                        <Clock className="w-3 h-3" strokeWidth={2} />
                        Waiting to connect
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-gray-faint">
                    {entry.isApex ? (
                      <>
                        Add an <span className="text-warm-black">A</span> record
                        pointing to{" "}
                        <span className="text-warm-black">76.76.21.21</span>
                      </>
                    ) : (
                      <>
                        Add a <span className="text-warm-black">CNAME</span>{" "}
                        record pointing to{" "}
                        <span className="text-warm-black">
                          cname.vercel-dns.com
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setConfirmingRemove(entry.domain)}
                  disabled={removing === entry.domain}
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-muted hover:text-critical hover: transition-all duration-150 disabled:opacity-50"
                  aria-label={`Remove ${entry.domain}`}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-[12px] text-gray-faint mt-4">
        DNS changes can take up to 48 hours to propagate. SSL certificates are
        issued automatically once DNS resolves.
      </p>

      <ConfirmDialog
        open={confirmingRemove !== null}
        title="Remove this domain?"
        message={
          confirmingRemove
            ? `${confirmingRemove} will stop pointing to your site. This may affect your live site if visitors use this domain.`
            : "This may affect your live site if visitors use this domain."
        }
        confirmLabel="Remove"
        destructive
        busy={removing !== null}
        onConfirm={() => {
          if (confirmingRemove) handleRemove(confirmingRemove);
        }}
        onCancel={() => setConfirmingRemove(null)}
      />
    </div>
  );
}
