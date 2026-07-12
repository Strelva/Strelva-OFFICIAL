"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  href: string;
}

// Mirrors the rail so every section is reachable from the palette, in the same
// grouped order (workspace → clients → review → system).
const NAV: Cmd[] = [
  { id: "nav-overview", label: "Overview", hint: "Section", href: "/admin" },
  { id: "nav-clients", label: "Clients", hint: "Section", href: "/admin/clients" },
  { id: "nav-leads", label: "Leads", hint: "Section", href: "/admin/leads" },
  { id: "nav-onboard", label: "Onboard a client", hint: "Section", href: "/admin/onboard" },
  { id: "nav-paylinks", label: "Pay links", hint: "Section", href: "/admin/pay-links" },
  { id: "nav-analytics", label: "Analytics", hint: "Section", href: "/admin/analytics" },
  { id: "nav-actions", label: "Actions", hint: "Section", href: "/admin/actions" },
  { id: "nav-drafts", label: "Drafts", hint: "Section", href: "/admin/drafts" },
  { id: "nav-maintenance", label: "Maintenance", hint: "Section", href: "/admin/digests" },
  { id: "nav-ops", label: "Ops", hint: "Section", href: "/admin/ops" },
  { id: "nav-audit", label: "Audit trail", hint: "Section", href: "/admin/audit" },
];

// Actions, not just jumps. Each routes to a surface that ALREADY performs the
// work — either the real page (mint a pay link) or Mission Control with the ask
// prefilled (`?ask=`), where the operator agent's propose_* → confirm flow
// commits it. No new mutation path is created here; this is navigation only.
const ACTIONS: Cmd[] = [
  { id: "act-mc", label: "Open Mission Control", hint: "Action", href: "/admin#mission-control" },
  { id: "act-ask", label: "Ask the operator agent…", hint: "Action", href: "/admin?ask=" },
  { id: "act-paylink", label: "Mint a pay link", hint: "Action", href: "/admin/pay-links" },
];

export function CommandPalette({ tenants }: { tenants: { id: string; siteName: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(
    () => [
      ...NAV,
      ...ACTIONS,
      ...tenants.flatMap((t) => [
        {
          id: `tenant-${t.id}`,
          label: t.siteName,
          hint: "Client",
          href: `/admin/clients/${t.id}`,
        },
        {
          id: `scan-${t.id}`,
          label: `Run a scan on ${t.siteName}`,
          hint: "Action",
          href: `/admin?ask=${encodeURIComponent(`Run a fresh site scan on ${t.id}`)}`,
        },
      ]),
    ],
    [tenants]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Global open shortcut (Cmd/Ctrl+K) + a custom event so a visible button can open it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (prev) return false;
          setQuery("");
          setActive(0);
          return true;
        });
      }
    }
    function onOpen() {
      setQuery("");
      setActive(0);
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("strelva:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("strelva:cmdk", onOpen);
    };
  }, []);

  // Focus the input when the palette opens. Only a DOM call (no setState), so
  // this is a legitimate effect (resets live in the open/onChange handlers).
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  function go(cmd: Cmd | undefined) {
    if (!cmd) return;
    setOpen(false);
    // An `?ask=` action prefills Mission Control. If we're already on /admin the
    // console is mounted (its `?ask=` mount effect won't re-fire), so hand it the
    // ask over a live event instead of a no-op navigation.
    const askMatch = cmd.href.match(/^\/admin\?ask=(.*)$/);
    if (askMatch && pathname === "/admin") {
      window.dispatchEvent(new CustomEvent("strelva:ask", { detail: decodeURIComponent(askMatch[1]) }));
      return;
    }
    router.push(cmd.href);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-surface-base/70 backdrop-blur-sm pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-glass-border bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Jump to a section or client…"
          className="w-full bg-transparent border-b border-glass-border px-4 py-3 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-muted">No matches</li>
          )}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-glass text-warm-white" : "text-gray-muted hover:text-warm-white"
                }`}
              >
                <span>{c.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-gray-faint">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-glass-border px-4 py-2 text-[11px] text-gray-faint">
          ↑↓ to navigate · ↵ to open · esc to close
        </div>
      </div>
    </div>
  );
}
