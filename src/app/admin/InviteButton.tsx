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
  const [result, setResult] = useState<{ success: boolean; message: string; signUpUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setResult(null);
    setCopied(false);
    setCopyFailed(false);

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
        setResult({ success: true, message: data.message, signUpUrl: data.signUpUrl });
        if (!data.signUpUrl) {
          setTimeout(() => {
            setOpen(false);
            setResult(null);
          }, 3000);
        }
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
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        Invite
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
        <h3 id="invite-title" className="text-lg font-medium text-white mb-1">Invite to {siteName}</h3>
        <p className="text-sm text-zinc-500 mb-4">
          They&apos;ll get an email with a sign-up link. Access is assigned to this exact email on signup.
        </p>

        {result && (
          <div
            role="status"
            className={`mb-4 p-3 rounded-lg text-sm ${
              result.success
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}
          >
            {result.message}
            {result.signUpUrl && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-emerald-200">
                  Share this link only with {email.trim().toLowerCase()}.{" "}
                  Access is tied to that exact email.
                </p>
                <a
                  href={result.signUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-emerald-300 underline underline-offset-2"
                >
                  Open manual signup link
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.signUpUrl || "");
                      setCopied(true);
                      setCopyFailed(false);
                    } catch {
                      setCopied(false);
                      setCopyFailed(true);
                    }
                  }}
                  className="text-xs font-medium text-emerald-200 underline underline-offset-2"
                >
                  {copied ? "Copied signup link" : "Copy signup link"}
                </button>
                {copyFailed && (
                  <p className="text-xs text-emerald-200">
                    Copy failed. Select the manual signup link above.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleInvite}>
          <label htmlFor="invite-email" className="block text-xs font-medium text-zinc-400 mb-2">
            Invited email
          </label>
          <input
            id="invite-email"
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
