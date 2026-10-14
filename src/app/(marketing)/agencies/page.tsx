import type { Metadata } from "next";
import { StCopy, StEmpty, StHead, StNotice, StPage, StPillLink, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { readAgencyDirectory } from "@/platform/agency-directory";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";

export const metadata: Metadata = { title: "Find an agency", description: "Choose an agency to help with your business, or build for clients under your own name." };

export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  const open = agencySignupReleaseEnabled();
  const user = workspaceReleaseEnabled() ? await getSessionUser() : null;
  const actor = user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email } : null;
  const [directory, businesses] = actor ? await Promise.all([
    readAgencyDirectory(actor).catch(() => null),
    listWorkspaces(actor).then(items => items.filter(item => item.kind === "customer" && item.access === "member" && item.role === "owner")).catch(() => null),
  ]) : [null, null];
  return <StPage>
    <StHead title="Find an agency" meta="Choose who helps your business. No agency is selected for you." />
    <StCopy>Agree the work with your agency, choose which areas they can access and keep control of your business. Their access starts only after they accept your proposal.</StCopy>
    {actor ? <>
      <StSection title="Listed agencies">{directory === null ? <StNotice tone="critical">The agency list is unavailable right now. <StTextButton href="/agencies">Try again</StTextButton></StNotice> : directory.length ? <StRows>{directory.map(agency => <StRow key={agency.agencyWorkspaceId} title={agency.name} detail={agency.summary} />)}</StRows> : <StEmpty>No agencies are listed yet. You can still use Strelva directly.</StEmpty>}</StSection>
      <StSection title="Choose your business">{businesses === null ? <StNotice tone="critical">Your businesses couldn’t be read. <StTextButton href="/agencies">Try again</StTextButton></StNotice> : businesses.length ? <StRows>{businesses.map(business => <StRow key={business.id} title={<StTextButton href={`/workspace?${new URLSearchParams({ workspaceId: business.id, view: "help" })}`}>{business.name}</StTextButton>} detail="Open Help to choose an agency and review its access." />)}</StRows> : <><StCopy>Only a business owner can bring in an agency. Set up your business or ask its owner to choose the agency.</StCopy><StTextButton href="/workspace/business/new">Set up your business</StTextButton></>}</StSection>
    </> : workspaceReleaseEnabled() ? <StTextButton href={`/sign-in?next=${encodeURIComponent("/workspace?view=help")}`}>Sign in to see agencies for your business</StTextButton> : <><StNotice>New business accounts open soon. Request access and tell us what you need help with.</StNotice><StTextButton href="/access-request?ref=find-agency">Request business access</StTextButton></>}
    <StSection title="Build for clients. Run it as your agency.">
    <StCopy>For agencies, consultants and independent builders who make and maintain business systems.</StCopy>
    <StCopy>Your clients see your agency’s name. You create the work, agree its scope and send changes for review. The business keeps control of its systems and can work directly too.</StCopy>
    <StSection title="How to get started"><StRows>
      <StRow title="Create your agency" detail="Choose “I build for clients” when creating an account, then set up your agency’s name, brand and team." />
      <StRow title="Qualify the work you’ll do" detail="Submit the evidence needed for publishing, Google, email or payments. Each effect has its own availability; creating an account alone does not enable it." />
      <StRow title="Bring in your first client" detail="Add a client and prepare a draft. Owner invitations are paused during rollout; agree the work and access before making changes. Review stays with whoever has permission for the decision." />
    </StRows></StSection>
    {open ? <StPillLink href="/sign-up?as=agency">Create your agency</StPillLink> : <>
      <StNotice>Agency signup is coming soon. You can request access now; publishing and other outside actions remain subject to qualification.</StNotice>
      <StPillLink href="/access-request?ref=agency">Request agency access</StPillLink>
    </>}
    </StSection>
  </StPage>;
}
