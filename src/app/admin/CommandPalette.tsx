"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  href: string;
}

const NAV: Cmd[] = [
  { id: "nav-overview", label: "Overview", hint: "Section", href: "/admin" },
  { id: "nav-onboard", label: "Onboard a client", hint: "Section", href: "/admin/onboard" },
  { id: "nav-paylinks", label: "Pay Links", hint: "Section", href: "/admin/pay-links" },
  { id: "nav-ops", label: "Operations", hint: "Section", href: "/admin/ops" },
  { id: "nav-drafts", label: "Drafts", hint: "Section", href: "/admin/drafts" },
  { id: "nav-audit", label: "Audit trail", hint: "Section", href: "/admin/audit" },
];

export function CommandPalette({ tenants }: { tenants: { id: string; siteName: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(
    () => [
      ...NAV,
      ...tenants.map((t) => ({
        id: `tenant-${t.id}`,
        label: t.siteName,
        hint: "Client",
        href: `/admin/tenants/${t.id}`,
      })),
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
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("strelva:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("strelva:cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function go(cmd: Cmd | undefined) {
    if (!cmd) return;
    setOpen(false);
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
          onChange={(e) => setQuery(e.target.value)}
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
                <span className="text-[10px] uppercase tracking-wide text-gray-faint">{c.hint}</span>
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
