"use client";
/**
 * An owner asking for a new internal tool. Owners never see build files,
 * paths or costs per build: they say what the tool should do, and it goes to
 * their agency as a Request (the same `save` the help form uses). The Request
 * is not accepted work until the agency agrees scope and a deadline.
 */
import { useRef, useState } from "react";
import { XaButton, XaButtonLink, XaDecision, XaEmpty, XaHeadline, XaNote, XaObjectPage, XaStatus, XaSystemTile, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/applications/application-use.module.css";

export function CustomToolRequest({ workspaceId, businessName, agency, requestsHref, request = fetch }: {
  workspaceId: string;
  businessName: string;
  /** The business's own agency, or null when it has none. */
  agency: { id: string; name: string } | null;
  requestsHref: string;
  request?: typeof fetch;
}) {
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const key = useRef<string | null>(null);

  if (!agency) return <XaObjectPage story={<XaEmpty pose="adds" title="A new internal tool starts with an agency" job={`Pebble is keeping a place for it in ${businessName}.`}
    action={<XaButtonLink variant="primary" size="lg" href={requestsHref}>Bring in an agency</XaButtonLink>}>
    {businessName} doesn&apos;t have an agency yet. Once it does, say what the tool should do here and they build it.
  </XaEmpty>} />;

  async function send() {
    const text = what.trim();
    if (!text) { setError("Say what the tool should do first."); return; }
    if (busy) return;
    setBusy(true); setError("");
    key.current ??= `tool-${crypto.randomUUID()}`;
    try {
      const response = await request("/api/service-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", businessId: workspaceId, status: "requested", request: text.slice(0, 2000), outcome: "A new internal tool",
          context: { source: "internal_tool_request" }, scope: ["internal_tool"], provider: { kind: "agency", agencyWorkspaceId: agency!.id }, idempotencyKey: key.current }),
      });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message || "It wasn't sent. What you wrote is still here.");
      setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "It wasn't sent. What you wrote is still here."); }
    finally { setBusy(false); }
  }

  return <XaObjectPage label="Ask for a new internal tool" phone="object-first"
    head={<>
      <XaSystemTile kind="form" size={48} label="Internal tool" />
      <XaHeadline quiet={`${agency.name} builds it. You make it live.`}>A new internal tool.</XaHeadline>
    </>}
    story={<XaNote>Say it the way you&apos;d tell a new hire: what it keeps track of, who fills it in, and what you want to see at a glance.</XaNote>}
    object={<XaDecision label="Your request" status={sent ? <XaStatus kind="waits">Waiting on {agency.name}</XaStatus> : <XaStatus kind="draft">Not sent</XaStatus>} meta={businessName} yes={null}>
      {sent ? <XaNote tone="done" role="status">Sent to {agency.name}. They reply with what it would take and when; nothing starts until you agree. <XaTextLink href={requestsHref}>See it in Requests</XaTextLink></XaNote>
        : <form className={styles.form} onSubmit={event => { event.preventDefault(); void send(); }} aria-label="Ask for an internal tool">
          <XaTextArea label="What should it do?" value={what} onChange={event => setWhat(event.target.value)} rows={6} maxLength={2000} disabled={busy}
            placeholder="A sheet for the front desk: which chair each patient is in, who's next, and who still owes a copay." />
          {error ? <XaNote tone="down" role="alert">{error}</XaNote> : null}
          <div className={styles.actions}>
            <XaButton type="submit" variant="primary" size="lg" busy={busy}>Send to {agency.name}</XaButton>
          </div>
        </form>}
    </XaDecision>} />;
}
