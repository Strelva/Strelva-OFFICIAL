import type { Metadata } from "next";
import { StCopy, StHead, StNotice, StPage, StPillLink, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";

export const metadata: Metadata = { title: "Build for clients on Strelva", description: "Run client systems under your agency’s name, with scoped access and owner review." };

export default function AgenciesPage() {
  const open = agencySignupReleaseEnabled();
  return <StPage>
    <StHead title="Build for clients. Run it as your agency." meta="For agencies, consultants and independent builders who make and maintain business systems." />
    <StCopy>Your clients see your agency’s name. You create the work, agree its scope and send changes for review. The business keeps control of its systems and can work directly too.</StCopy>
    <StSection title="How to get started"><StRows>
      <StRow title="Create your agency" detail="Choose “I build for clients” when creating an account, then set up your agency’s name, brand and team." />
      <StRow title="Qualify the work you’ll do" detail="Submit the evidence needed for publishing, Google, email or payments. Each effect has its own availability; creating an account alone does not enable it." />
      <StRow title="Bring in your first client" detail="Prepare a draft, invite the business owner and agree the access and control your agency needs. Review stays with whoever has permission for the decision." />
    </StRows></StSection>
    {open ? <StPillLink href="/sign-up?as=agency">Create your agency</StPillLink> : <>
      <StNotice>Agency signup is coming soon. You can request access now; publishing and other outside actions remain subject to qualification.</StNotice>
      <StPillLink href="/access-request?ref=agency">Request agency access</StPillLink>
    </>}
    <StSection title="Looking for help with your own business?">
      <StCopy>You can use Strelva directly. If you want an agency to do the work, request access and tell us what you need. The public agency directory is coming soon.</StCopy>
      <StTextButton href="/access-request?ref=find-agency">Find an agency</StTextButton>
    </StSection>
  </StPage>;
}
