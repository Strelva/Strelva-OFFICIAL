import type { Metadata } from "next";
import { StCopy, StHead, StPage, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";

export const metadata: Metadata = { title: "Strelva plans", description: "Business and agency workspaces, with costs shown before you pay." };

export default function PricingPage() {
  return <StPage>
    <StHead title="Plans for your business and your agency" meta="Price shown before you pay." />
    <StRows>
      <StRow title="Business workspace" detail="Make and run your own systems. You can start directly and bring in an agency when you want help." end={<StTextButton href="/sign-up?as=business">Business accounts</StTextButton>} />
      <StRow title="Agency workspace" detail="Create and maintain client systems with your brand, team and agreed client access." end={<StTextButton href="/agencies">For agencies</StTextButton>} />
    </StRows>
    <StSection title="Work you hire an agency to do"><StCopy>Agency services have their own agreed scope, deadline and price. A request for work does not accept a job or create a subscription.</StCopy></StSection>
    <StTextButton href="/audit">Start with a free check</StTextButton>
  </StPage>;
}
