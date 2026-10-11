"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function OperatorInquiryActions({ rowId, state, notice }: { rowId?: string; state?: string; notice?: { tenantId: string; inquiryId: string } | { rowId: string } }) {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(null);
  async function act(decision?: string) {
    setSaving(true); setResult(null);
    try {
      const response = await fetch(notice ? "rowId" in notice ? "/api/admin/client-leads/connected-owner-notice" : "/api/admin/client-leads/owner-notice" : "/api/admin/client-leads/held", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify(notice ?? { rowId, decision }),
      });
      const body = await response.json().catch(() => null) as { status?: string; error?: string; reason?: string } | null;
      if (!response.ok || !body) setResult({ error: true, text: response.status === 403 ? "Operator access is required. Nothing changed." : body?.error ?? "The result could not be confirmed. Reload before trying again." });
      else if (notice) {
        const accepted = ["accepted", "accepted_unverified", "verified", "delivered", "deferred"].includes(body.status ?? "");
        setResult({ error: !accepted, text: accepted ? "Owner notice accepted. Delivery is recorded separately." : body.reason === "correct_owner_recipient_before_resending"
          ? "Repair refused. Correct the owner recipient in the business record before resending. Customer replies were not sent."
          : `Owner notice did not send: ${(body.reason ?? body.status ?? "unconfirmed").replace(/_/g, " ")}.` });
      } else if (body.status === "decided" || body.status === "unchanged") setResult({ error: false, text: decision === "release" ? "Released. Nobody was emailed." : decision === "hold" ? "Moved back to held messages." : "Marked as spam. The record was kept." });
      else setResult({ error: true, text: "The result could not be confirmed. Reload before trying again." });
    } catch { setResult({ error: true, text: "The result could not be confirmed. Reload before trying again." }); }
    finally { setSaving(false); }
  }
  return <div className="mt-3 space-y-2">
    {result && !result.error ? null : <div className="flex flex-wrap gap-2">
      {notice ? <Button size="lg" variant="secondary" loading={saving} onClick={() => void act()}>{saving ? "Checking…" : "Send to corrected owner"}</Button>
        : state === "released" ? <Button size="lg" variant="secondary" loading={saving} onClick={() => void act("hold")}>Move back to held</Button>
          : <><Button size="lg" loading={saving} onClick={() => void act("release")}>{saving ? "Saving…" : "Not spam, release it"}</Button>
            {state !== "confirmed_spam" && <Button size="lg" variant="secondary" disabled={saving} onClick={() => void act("confirm_spam")}>It&apos;s spam</Button>}</>}
    </div>}
    {result && <p role={result.error ? "alert" : "status"} className={`text-sm ${result.error ? "text-critical" : "text-gray-muted"}`}>{result.text}</p>}
  </div>;
}
