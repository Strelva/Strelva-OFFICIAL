"use client";
/**
 * A prepared Google listing change and the one yes (XaYes) that sends it.
 * The yes submits the existing server action with the exact event, listing
 * and business; the server re-checks authority and records the decision
 * through Needs you. Several waiting drafts show one at a time.
 */
import { useRef, useState } from "react";
import { XaDecision, XaPage, XaRow, XaRows, XaStatus, XaYes, type XaYesState } from "@/components/ui/strelva/Xa";
import styles from "@/experience/connections/xa-connections.module.css";

interface Draft { id: string; title: string; body: string }
export function GoogleDrafts({ drafts, listingName, canManage, blockedReason, action, context }: {
  drafts: readonly Draft[]; listingName: string; canManage: boolean; blockedReason?: string;
  action: (form: FormData) => Promise<void>;
  context: { workspaceId: string; tenantId: string; locationId: string };
}) {
  const [openId, setOpenId] = useState(drafts[0]?.id);
  const [state, setState] = useState<XaYesState>("waiting");
  const form = useRef<HTMLFormElement>(null);
  const decision = useRef<HTMLInputElement>(null);
  const draft = drafts.find(item => item.id === openId) ?? drafts[0];
  if (!draft) return null;
  const others = drafts.filter(item => item.id !== draft.id);
  function send(choice: "approve" | "decline") {
    if (!form.current || !decision.current) return;
    decision.current.value = choice;
    if (choice === "approve") setState("going");
    form.current.requestSubmit();
  }
  return <section className={styles.section} aria-label="Waiting for your yes">
    <XaDecision label={`${draft.title} for ${listingName}`} status={blockedReason ? <XaStatus kind="draft">Held</XaStatus> : <XaStatus kind="waits">Waits for you</XaStatus>} meta="Not sent to Google"
      yes={canManage ? <form ref={form} action={async data => { try { await action(data); } catch { setState("failed"); } }}>
        <input type="hidden" name="workspaceId" value={context.workspaceId} /><input type="hidden" name="tenantId" value={context.tenantId} /><input type="hidden" name="locationId" value={context.locationId} />
        <input type="hidden" name="eventId" value={draft.id} /><input ref={decision} type="hidden" name="action" value="approve" />
        <XaYes state={state} onYes={() => send("approve")} onNotYet={() => send("decline")} disabledReason={blockedReason}
          working={{ title: "Sending it to Google", steps: [{ id: "send", label: `Sending ${draft.title.toLowerCase()} to ${listingName}`, state: state === "failed" ? "failed" : "active" }] }}
          failure="Google didn't take it. Nothing changed on your listing." />
      </form> : <p className={styles.quiet}>Waiting for the owner. Only an authorized owner can approve it.</p>}>
      <XaPage address={`Google · ${listingName}`} title={draft.title} flat><p className={styles.copy}>{draft.body}</p></XaPage>
    </XaDecision>
    {others.length ? <XaRows label="Also waiting">{others.map(item => <XaRow key={item.id} title={item.title} detail="Waits for you · not sent to Google" tone="waits" onClick={() => { setOpenId(item.id); setState("waiting"); }} />)}</XaRows> : null}
  </section>;
}
