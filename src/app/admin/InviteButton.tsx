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
        className="w-full rounded-md px-2 py-1.5 text-center text-xs text-amber-300 transition-colors hover:bg-amber-500/10 hover:text-amber-200"
      >
        Invite
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="bg-surface-raised border border-glass-border rounded-xl p-6 w-full max-w-sm">
        <h3 id="invite-title" className="text-lg font-medium text-warm-white mb-1">Invite to {siteName}</h3>
        <p className="text-sm text-gray-muted mb-4">
          They&apos;ll get a tenant/admin sign-up link. Access is assigned to this exact email on signup, and the no-access page can recover it if access hasn&apos;t propagated yet.
        </p>

        {result && (
          <div
            role="status"
            className={`mb-4 rounded-lg border p-4 text-sm ${
              result.success
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/25 bg-red-500/10 text-red-300"
            }`}
          >
            <p className="font-medium">
              {result.success ? "Invite ready" : "Invite failed"}
            </p>
            <p className="mt-1 text-xs opacity-90">{result.message}</p>
            {result.signUpUrl && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-emerald-200">
                  Share this link only with {email.trim().toLowerCase()}.{" "}
                  Access is tied to that exact email, and it opens the stable Scaffold fallback route for this site.
                </p>
                <a
                  href={result.signUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md border border-emerald-500/20 bg-surface-inset px-3 py-2 break-all font-mono text-[11px] text-emerald-100 hover:text-white"
                >
                  <span className="sr-only">Open manual signup link: </span>
                  {result.signUpUrl}
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
                  className="rounded-md bg-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-200"
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
          <label htmlFor="invite-email" className="block text-xs font-medium text-gray-muted mb-2">
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
            className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 transition-colors mb-4"
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              className="rounded-md px-4 py-2 text-sm text-gray-muted hover:text-warm-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-amber-500 text-black px-4 py-2 text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
