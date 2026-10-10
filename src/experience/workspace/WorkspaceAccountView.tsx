import { StEntry, StPage, StHead, StSection, StRows, StRow, StMono, StState, StNotice, StEmpty, StTextButton } from "@/components/ui/strelva/Kit";
import type { ReactNode } from "react";
import type { Workspace } from "@/platform/workspaces";

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
}

function workspaceKindLabel(kind: Workspace["kind"]): string {
  switch (kind) {
    case "agency":
      return "Agency workspace";
    case "customer":
      return "Your business";
    default:
      return "Personal workspace";
  }
}


/** Presentation only. The account route resolves verified identity and access. */
export function WorkspaceAccountView({ appBase, signOut, managedHref = "/account?managed=1", notice, continuation, payerInbox, name, email, emailConfirmed, releaseOpen, workspaces, workspacesUnavailable = false }: WorkspaceAccountViewProps) {
  return (
    <StEntry width="account" helpHref={`${appBase || ""}/workspace?view=help`}>
      {notice}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StPage>
          <StHead title="Your account" meta="This belongs to you, not to any business or agency you work with." />
          <StSection title="Profile" meta="How you appear to people you work with">
            <StRows>
              <StRow kind="Name" title={name || "No name is available"} />
              <StRow kind="Email" title={<StMono tone="text">{email || "No email is available"}</StMono>} end={<StState kind={emailConfirmed ? "live" : "need"}>{emailConfirmed ? "Confirmed" : "Confirmation needed"}</StState>} />
            </StRows>
            {!emailConfirmed ? <StNotice tone="need">Confirm this email before private workspace access can be shown.</StNotice> : null}
          </StSection>
          {continuation}
          <StSection title="Sign-in" meta="Strelva emails you a link. There’s no password.">
            <StRows><StRow title="Signed-in identity" detail="Use the email connected to your account to return." end={signOut} /></StRows>
          </StSection>
          <StSection title="Where you have access" meta="Businesses and agencies that invited you">
            {!releaseOpen ? <StEmpty>Personal workspaces are not open in this environment yet. Your signed-in identity is unchanged.</StEmpty>
              : workspacesUnavailable ? <StNotice tone="critical">Workspace access is temporarily unavailable. No access or billing state was changed.</StNotice>
                : !emailConfirmed ? <StEmpty>Workspace access will appear after your email is confirmed.</StEmpty>
                  : !workspaces.length ? <StEmpty>No workspace access is associated with this identity yet.</StEmpty>
                    : <StRows>{workspaces.map(workspace => <StRow key={workspace.id} title={workspace.name} kind={workspaceKindLabel(workspace.kind)} detail={workspace.access === "delegated_read" ? "Read-only access" : "Member access"} end={<StTextButton href={`${appBase || ""}/workspace?workspaceId=${encodeURIComponent(workspace.id)}`} tone="accent">Open</StTextButton>} />)}</StRows>}
          </StSection>
          {releaseOpen && emailConfirmed && payerInbox ? <StSection title="Payer requests"><p>Review financial responsibility addressed to this verified account. Accepting does not grant access to a business or its saved work.</p>{payerInbox}</StSection> : null}
          <StSection title="Managed websites">
            <StRows><StRow title="Your websites are part of your Strelva work" detail="Each site keeps its own people, settings, and agreed service." end={<StTextButton href={managedHref} tone="accent">Open managed websites</StTextButton>} /></StRows>
          </StSection>
          <StSection title="Billing"><StEmpty>Manage website billing from that site’s settings. New paid product plans are not available here yet; your existing service agreement still applies.</StEmpty></StSection>
        </StPage>
      </div>
    </StEntry>
  );
}
