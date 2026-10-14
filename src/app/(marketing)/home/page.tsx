import type { Metadata } from "next";
import { StCopy, StHead, StPage, StPillLink, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";

export const metadata: Metadata = {
  title: "Strelva — Make and run your business systems",
  description: "Run your business or build for clients. Start with a free website and AI visibility check.",
};

export default function HomePage() {
  const businessOpen = businessSignupReleaseEnabled();
  const agencyOpen = agencySignupReleaseEnabled();
  return <StPage>
    <StHead title="What would you like to make possible?" meta="Make, run and keep reshaping the systems your business needs." />
    <StSection title="Choose your starting point">
      <StRows>
        <StRow title="I run a business" detail={businessOpen ? "Make a website, booking page or another system. Start directly, or bring in an agency when you want help." : "Business accounts are coming soon. Start with a free check or request access."} end={<StTextButton href={businessOpen ? "/sign-up?as=business" : "/audit"}>{businessOpen ? "Start your business" : "Start a free check"}</StTextButton>} />
        <StRow title="I build for clients" detail={agencyOpen ? "Create systems for clients, send work for their review and keep running it under your agency’s name." : "Agency accounts are coming soon. See how client work and verification will work."} end={<StTextButton href="/agencies">For agencies</StTextButton>} />
      </StRows>
    </StSection>
    <StSection title="Start with your website">
      <StCopy>One free check covers website health and whether Gemini names your business. No account required.</StCopy>
      <StPillLink href="/audit">Check your website</StPillLink>
    </StSection>
    {!businessOpen && <StTextButton href="/access-request">Request access</StTextButton>}
  </StPage>;
}
