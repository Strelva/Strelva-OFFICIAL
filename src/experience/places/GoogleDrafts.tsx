"use client";
/**
 * A prepared Google listing change and the one yes (XaYes) that sends it.
 * The decision card is the change itself (XA · S1): one eyebrow (the status
 * and who prepared it), the title, the new values in owner words, then the
 * yes. Other waiting drafts are listed by their own title only when there are
 * more; while the listing is held (disconnected, paused) they fold into the
 * same blocked yes, so each one has its reason and its way forward. The yes submits the existing server action with
 * the exact event, listing and business; the server re-checks authority and
 * records the decision through Needs you.
 */
import { useRef, useState } from "react";
import { XaButton, XaDecision, XaRow, XaRows, XaStatus, XaTextLink, XaYes, type XaYesState } from "@/components/ui/strelva/Xa";
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
  // Held (disconnected, paused, access pending): every waiting draft folds into one blocked yes, so nothing sits without a reason.
  const held = Boolean(blockedReason);
  const shown = held ? drafts : [draft];
  const status = held
    ? <XaStatus kind="draft">{drafts.length > 1 ? `${drafts.length} changes wait for Google` : "Waits for Google"}</XaStatus>
    : <XaStatus kind="waits">Waits for your yes</XaStatus>;
  return <section className={styles.section} aria-label="Waiting for your yes">
    <XaDecision label={held ? `${drafts.length > 1 ? `${drafts.length} changes` : title} for ${listingName}` : `${title} for ${listingName}`} status={status} meta={held && drafts.length > 1 ? undefined : who(draft)}
      yes={canManage ? <form ref={form} action={async data => { try { await action(data); } catch { setState("failed"); } }}>
        <input type="hidden" name="workspaceId" value={context.workspaceId} /><input type="hidden" name="tenantId" value={context.tenantId} /><input type="hidden" name="locationId" value={context.locationId} />
        <input type="hidden" name="eventId" value={draft.id} /><input ref={decision} type="hidden" name="action" value="approve" />
        {held && blockedReason ? <XaYes state={state} onYes={() => send("approve")} onNotYet={drafts.length > 1 ? undefined : () => send("decline")} disabledReason={blockedReason}
          unblock={reconnect ? <XaButton variant="primary" size="lg" block type="submit" formAction={reconnect}>Reconnect Google</XaButton> : <XaTextLink href={`/workspace?${new URLSearchParams({ workspaceId: context.workspaceId, view: "access" })}`}>See who can reconnect Google</XaTextLink>}
          failure="Google didn't take it. Nothing changed on your listing." />
          : <XaYes state={state} onYes={() => send("approve")} onNotYet={() => send("decline")}
            working={{ title: "Sending it to Google", steps: [{ id: "send", label: `Sending ${title.toLowerCase()} to ${listingName}`, state: state === "failed" ? "failed" : "active" }] }}
            failure="Google didn't take it. Nothing changed on your listing." />}
      </form> : <p className={styles.quiet}>Waiting for the owner. Only an authorized owner can approve it.</p>}>
      {shown.map(item => <div key={item.id} className={styles.objectText}>
        <p className={styles.draftTitle}>{googleDraftTitle(item.title)}</p>
        <ul className={styles.draftLines} aria-label={`What changes on Google: ${googleDraftTitle(item.title)}`}>{googleDraftLines(item.body).map(line => <li key={line}>{line}</li>)}</ul>
        {held && drafts.length > 1 ? <p className={styles.quiet}>{item.preparedBy ? `Prepared by ${item.preparedBy}` : "Prepared from your record"}</p> : null}
      </div>)}
    </XaDecision>
    {!held && others.length ? <XaRows label="Also waiting">{others.map(item => <XaRow key={item.id} title={googleDraftTitle(item.title)} detail={item.preparedBy ? `Prepared by ${item.preparedBy}` : "Prepared from your record"} onClick={() => { setOpenId(item.id); setState("waiting"); }} />)}</XaRows> : null}
  </section>;
}
