"use client";
/**
 * A prepared Google listing change and the one yes (XaYes) that sends it.
 * The decision card is the change itself (XA · S1): where it goes as a 13/500
 * label, the title, the new values in owner words, then the yes. The status
 * shows once, on the card. Other waiting drafts are listed by their own title
 * only when there are more. The yes submits the existing server action with
 * the exact event, listing and business; the server re-checks authority and
 * records the decision through Needs you.
 */
import { useRef, useState } from "react";
import { XaButton, XaDecision, XaRow, XaRows, XaStatus, XaYes, type XaYesState } from "@/components/ui/strelva/Xa";
import { googleDraftLines, googleDraftTitle } from "@/experience/connections/owner-words";
import styles from "@/experience/connections/xa-connections.module.css";

/** `preparedBy` names whoever asked for it when the event records one; otherwise Strelva prepared it from the record. */
interface Draft { id: string; title: string; body: string; preparedBy?: string }
export function GoogleDrafts({ drafts, listingName, canManage, blockedReason, reconnect, action, context }: {
  drafts: readonly Draft[]; listingName: string; canManage: boolean; blockedReason?: string;
  /** Starts Google sign-in again (the connect action) when the listing is disconnected and the viewer may reconnect it. */
  reconnect?: (form: FormData) => Promise<void>;
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
  const title = googleDraftTitle(draft.title);
  const who = (item: Draft) => item.preparedBy ? `from ${item.preparedBy}` : "from your record";
  function send(choice: "approve" | "decline") {
    if (!form.current || !decision.current) return;
    decision.current.value = choice;
    if (choice === "approve") setState("going");
    form.current.requestSubmit();
  }
  return <section className={styles.section} aria-label="Waiting for your yes">
    <XaDecision label={`${title} for ${listingName}`} status={blockedReason ? <XaStatus kind="draft">Held · {who(draft)}</XaStatus> : <XaStatus kind="waits">Waits for you · {who(draft)}</XaStatus>}
      yes={canManage ? <form ref={form} action={async data => { try { await action(data); } catch { setState("failed"); } }}>
        <input type="hidden" name="workspaceId" value={context.workspaceId} /><input type="hidden" name="tenantId" value={context.tenantId} /><input type="hidden" name="locationId" value={context.locationId} />
        <input type="hidden" name="eventId" value={draft.id} /><input ref={decision} type="hidden" name="action" value="approve" />
        <XaYes state={state} onYes={() => send("approve")} onNotYet={() => send("decline")} disabledReason={blockedReason}
          unblock={blockedReason && reconnect ? <XaButton variant="primary" size="lg" block type="submit" formAction={reconnect}>Reconnect Google</XaButton> : undefined}
          working={{ title: "Sending it to Google", steps: [{ id: "send", label: `Sending ${title.toLowerCase()} to ${listingName}`, state: state === "failed" ? "failed" : "active" }] }}
          failure="Google didn't take it. Nothing changed on your listing." />
      </form> : <p className={styles.quiet}>Waiting for the owner. Only an authorized owner can approve it.</p>}>
      <div className={styles.objectText}>
        <p className={styles.objectLabel}>Google · {listingName}</p>
        <p className={styles.draftTitle}>{title}</p>
        <ul className={styles.draftLines} aria-label="What changes on Google">{googleDraftLines(draft.body).map(line => <li key={line}>{line}</li>)}</ul>
      </div>
    </XaDecision>
    {others.length ? <XaRows label="Also waiting">{others.map(item => <XaRow key={item.id} title={googleDraftTitle(item.title)} detail={item.preparedBy ? `Prepared by ${item.preparedBy}` : "Prepared from your record"} onClick={() => { setOpenId(item.id); setState("waiting"); }} />)}</XaRows> : null}
  </section>;
}
