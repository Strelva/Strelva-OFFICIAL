import type { ReactNode } from "react";
import { XaAnswers, XaHeadline, XaInitial, XaLabel, XaRow, XaRows, XaSays, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFrame } from "@/components/ui/strelva/xa/entry";
import type { Workspace } from "@/platform/workspaces";
import { WorkspaceSignOutButton } from "./WorkspaceSignOutButton";
import styles from "./workspace-account.module.css";

export interface WorkspaceAccountViewProps {
  appBase?: string;
  signOut?: ReactNode;
  managedHref?: string;
  notice?: ReactNode;
  continuation?: ReactNode;
  payerInbox?: ReactNode;
  name: string | null;
  email: string;
  emailConfirmed: boolean;
  releaseOpen: boolean;
  workspaces: Pick<Workspace, "id" | "kind" | "name" | "access">[];
  workspacesUnavailable?: boolean;
  mode?: "light" | "dark";
}

/** What a place is to this person, in their words. Read-only is the one exception worth saying. */
function workspaceDetail(workspace: Pick<Workspace, "kind" | "access">): string {
  const readOnly = workspace.access === "delegated_read";
  if (workspace.kind === "agency") return "Agency";
  if (workspace.kind === "customer") return readOnly ? "Client · Read-only access" : "Your business";
  return "Just you";
}

/**
 * XA account (October 16). Drawn in the entry frame's column, the way R1
 * reads a record: label on the left, the fact on the right, one hairline
 * between. Places you work are open rows that open in place. Status shows
 * only the exception (an unconfirmed email, read-only access).
 *
 * Presentation only. The account route resolves verified identity and access.
 * Hook-free on purpose: the route and its tests call it as a function.
 */
export function WorkspaceAccountView({ appBase, signOut, managedHref = "/account?managed=1", notice, continuation, payerInbox, name, email, emailConfirmed, releaseOpen, workspaces, workspacesUnavailable = false, mode }: WorkspaceAccountViewProps) {
  const base = appBase || "";
  const placesNote = !releaseOpen ? "Workspaces aren’t open here yet. Your sign-in is unchanged."
    : workspacesUnavailable ? "Workspace access is temporarily unavailable. I didn’t change any access or billing."
      : !emailConfirmed ? "Workspace access will appear after your email is confirmed."
        : !workspaces.length ? "No workspace has invited this email yet. When one does, it appears here." : null;
  return (
    <XaEntryFrame mode={mode} wide label="Your account" end={<XaTextLink href={`${base}/workspace?view=help`}>Help</XaTextLink>}>
      {notice}
      <div className={styles.page}>
        <XaHeadline size="md" quiet="It belongs to you, not to a business or agency.">Your account</XaHeadline>

        <section className={styles.section} aria-labelledby="account-you">
          <XaLabel as="h2" id="account-you">You</XaLabel>
          <XaAnswers labelWidth={120} rows={[
            ["Name", name || <span className={styles.quiet}>No name on this sign-in</span>],
            ["Email", <span key="email" className={styles.email}>
              <span className={styles.address}>{email || "No email on this sign-in"}</span>
              {emailConfirmed ? <span className={styles.quiet}>Confirmed</span> : <XaStatus kind="waits" size="sm">Confirmation needed</XaStatus>}
            </span>],
            ["Sign-in", <span key="sign-in" className={styles.email}><span>A link by email. There’s no password.</span>{signOut === null ? null : <span className={styles.signOut}>{signOut ?? <WorkspaceSignOutButton className={styles.signOutButton} />}</span>}</span>],
          ]} />
          {!emailConfirmed ? <XaSays>Confirm this email from the link Strelva sent, then come back. Your workspaces stay hidden until then.</XaSays> : null}
        </section>

        {continuation}

        <section className={styles.section} aria-labelledby="account-places">
          <XaLabel as="h2" id="account-places">Where you work</XaLabel>
          {placesNote ? <XaSays>{placesNote}</XaSays>
            : <XaRows label="Where you work">{workspaces.map(workspace => <XaRow key={workspace.id}
              lead={<XaInitial name={workspace.name} shape={workspace.kind === "personal" ? "round" : "square"} size={28} />}
              title={workspace.name} detail={workspaceDetail(workspace)}
              href={`${base}/workspace?workspaceId=${encodeURIComponent(workspace.id)}`} />)}</XaRows>}
        </section>

        {releaseOpen && emailConfirmed && payerInbox ? <section className={styles.section} aria-labelledby="account-payer">
          <XaLabel as="h2" id="account-payer">Asked to pay</XaLabel>
          <p className={styles.body}>A business can ask you to pay for it. Saying yes doesn’t give you access to that business or its work.</p>
          {payerInbox}
        </section> : null}

        <section className={styles.section} aria-labelledby="account-sites">
          <XaLabel as="h2" id="account-sites">Websites from before workspaces</XaLabel>
          <XaRows label="Managed websites">
            <XaRow lead={<XaSystemTile kind="website" size={28} />} title="Managed websites" detail="Each site keeps its own people and settings." href={managedHref} />
          </XaRows>
          <p className={styles.body}>Their billing stays in each site’s settings, under your existing service agreement.</p>
        </section>
      </div>
    </XaEntryFrame>
  );
}
