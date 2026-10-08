"use client";

import { Check, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { OwnerClaimAccepted, OwnerClaimPreview } from "@/products/agency-clients/contracts";

/**
 * The owner's side of an agency's claim link (#259): who set the business up,
 * which address the link is for, and one action. Accepting makes the signed-in
 * account the owner; the agency keeps working through the seat the owner can end.
 */
export function OwnerClaimAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<OwnerClaimPreview | null>(null);
  const [accepted, setAccepted] = useState<OwnerClaimAccepted | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const target = `/workspace/claim/${token}`;

  useEffect(() => {
    let current = true;
    fetch(`/api/workspace-claims/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { claim?: OwnerClaimPreview; error?: string };
        if (!response.ok || !body.claim) throw new Error(body.error || "This link is missing or no longer works.");
        if (current) setPreview(body.claim);
      })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "This link is missing or no longer works."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token]);

  async function accept() {
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/workspace-claims/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => ({})) as { accepted?: OwnerClaimAccepted; error?: string };
      if (response.status === 401) { router.push(`/sign-in?next=${encodeURIComponent(target)}`); return; }
      if (!response.ok || !body.accepted) throw new Error(body.error || "The business couldn’t be claimed.");
      setAccepted(body.accepted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The business couldn’t be claimed.");
    } finally {
      setSubmitting(false);
    }
  }

  const expires = preview ? new Date(preview.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "";

  return (
    <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-[720px] items-center">
        <Card padding="lg" className="w-full">
          {loading ? <p role="status" className="flex items-center gap-3 text-sm text-gray-muted"><Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" />Checking your link</p>
            : accepted ? <div>
              <div className="flex size-12 items-center justify-center rounded-full bg-positive/15 text-positive"><Check className="size-6" aria-hidden="true" /></div>
              <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-positive">You’re the owner</p>
              <h1 className="mt-3 font-display text-[40px] font-medium leading-tight">{accepted.workspaceName} is yours.</h1>
              <p className="mt-4 text-base leading-6 text-gray-muted">{accepted.alreadyAccepted ? "You already claimed it with this link." : "Check the details your agency added, and confirm what’s right."} You decide what goes live, and you can end your agency’s access at any time.</p>
              <a href={`/workspace?workspaceId=${encodeURIComponent(accepted.workspaceId)}`} className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent/85">Open your business</a>
            </div>
            : preview ? <div>
              <LockKeyhole className="size-7 text-accent-text" aria-hidden="true" />
              <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">From {preview.agencyName}</p>
              <h1 className="mt-3 font-display text-[40px] font-medium leading-tight">Take ownership of {preview.workspaceName}</h1>
              <p className="mt-4 text-base leading-6 text-gray-muted">{preview.agencyName} set up {preview.workspaceName} on Strelva. As the owner you confirm its details, approve what goes live, and choose who works on it.</p>
              <dl className="mt-8 grid gap-4 border-y border-gray-border py-6 sm:grid-cols-2">
                <div><dt className="text-xs text-gray-muted">For</dt><dd className="mt-1 break-all text-sm font-medium">{preview.recipientEmail}</dd></div>
                <div><dt className="text-xs text-gray-muted">Works until</dt><dd className="mt-1 text-sm font-medium">{expires}</dd></div>
              </dl>
              {preview.status === "pending" ? <>
                <p className="mt-6 text-sm leading-6 text-gray-muted">Sign in with {preview.recipientEmail} to accept. The link alone grants nothing.</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button size="lg" loading={submitting} onClick={() => void accept()}>Become the owner</Button>
                  <a href={`/sign-in?next=${encodeURIComponent(target)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-border px-4 text-sm font-medium hover:bg-gray-bg">Sign in</a>
                  <a href={`/sign-up?next=${encodeURIComponent(target)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-medium text-gray-muted underline-offset-4 hover:underline">Create an account</a>
                </div>
              </> : <p className="mt-6 text-sm text-gray-muted">{preview.status === "revoked" ? `${preview.agencyName} replaced this link with a newer one. Use the latest link they sent.` : preview.status === "expired" ? `This link expired. Ask ${preview.agencyName} for a new one.` : "This business has already been claimed with this link."}</p>}
            </div>
              : <div><LockKeyhole className="size-7 text-critical" aria-hidden="true" /><h1 className="mt-6 font-display text-[36px] font-medium">This link doesn’t work</h1></div>}
          {error ? <p role="alert" className="mt-6 rounded-xl border border-critical/30 px-4 py-3 text-sm text-critical">{error}</p> : null}
        </Card>
      </div>
    </main>
  );
}
