"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Globe, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type DomainStatus = "connected" | "pending";

export interface DomainEntry {
  domain: string;
  status: DomainStatus;
  isApex: boolean;
}

interface Props {
  initialDomains: DomainEntry[];
}

export function DomainsClient({ initialDomains }: Props) {
  const [domains, setDomains] = useState<DomainEntry[]>(initialDomains);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/domains")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.domains) setDomains(data.domains);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Refresh every 30s so "pending" domains flip to "connected" after the window.
  useEffect(() => {
    if (!domains.some((d) => d.status === "pending")) return;
    const id = setInterval(() => {
      fetch("/api/admin/domains")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.domains) setDomains(data.domains);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [domains]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const domain = input.trim().toLowerCase();
    if (!domain) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    if (!confirm(`Remove ${domain}?`)) return;
    setRemoving(domain);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/domains?domain=${encodeURIComponent(domain)}`,
        { method: "DELETE" }
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
    <div className="p-6 md:p-8 w-full max-w-screen-2xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <span className="text-xs uppercase tracking-widest text-gray-muted">
          DOMAINS
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-warm-black mt-1">
          Custom domains
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          Connect your own domain. After adding, configure DNS at your registrar.
        </p>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="bg-surface border border-gray-border rounded-lg p-4 mb-4 flex items-center gap-2"
      >
        <Globe className="w-4 h-4 text-gray-muted shrink-0" strokeWidth={1.5} />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="yourdomain.com"
          className="flex-1 font-mono text-sm bg-transparent border-0 outline-none text-warm-black placeholder:text-gray-subtle"
          disabled={adding}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={adding}
          icon={<Plus className="w-3.5 h-3.5" />}
          disabled={adding || !input.trim()}
        >
          Add domain
        </Button>
      </form>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-md bg-red-600/5 border border-red-200 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Domain list */}
      <div className="bg-surface border border-gray-border rounded-lg overflow-hidden">
        {domains.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-muted">
              {loaded ? "No custom domains yet. Add one above." : "Loading..."}
            </p>
          </div>
        ) : (
          domains.map((entry, i) => (
            <div
              key={entry.domain}
              className={`px-5 py-4 ${
                i < domains.length - 1 ? "border-b border-gray-bg" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-warm-black truncate">
                      {entry.domain}
                    </span>
                    {entry.status === "connected" ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        <Clock className="w-3 h-3" strokeWidth={2} />
                        Pending DNS
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-subtle font-mono">
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
                  onClick={() => handleRemove(entry.domain)}
                  disabled={removing === entry.domain}
                  className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-gray-muted hover:text-terra hover:bg-terra/5 transition-all duration-150 disabled:opacity-50"
                  title={`Remove ${entry.domain}`}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-gray-subtle mt-4">
        DNS changes can take up to 48 hours to propagate. SSL certificates are
        issued automatically once DNS resolves.
      </p>
    </div>
  );
}
