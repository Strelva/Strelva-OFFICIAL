"use client";

import { useState } from "react";

interface InviteButtonProps {
  tenantId: string;
  siteName: string;
  ownerEmail?: string;
}

export function InviteButton({ tenantId, siteName, ownerEmail }: InviteButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(ownerEmail || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tenant: tenantId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, message: data.error || "Failed to send invite" });
      } else {
        setResult({ success: true, message: data.message });
        setTimeout(() => {
          setOpen(false);
          setResult(null);
        }, 3000);
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        Invite
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-medium text-white mb-1">Invite to {siteName}</h3>
        <p className="text-sm text-zinc-500 mb-4">
          They&apos;ll get an email with a sign-up link. Auto-assigned on signup.
        </p>

        {result && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              result.success
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}
          >
            {result.message}
          </div>
        )}

        <form onSubmit={handleInvite}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            required
            autoFocus
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 mb-4"
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-amber-500 text-black px-4 py-2 text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
