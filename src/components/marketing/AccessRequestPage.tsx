import { StCopy, StEntry, StHead, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";

type InitialFeedback = { state: "idle" | "submitting" | "success" | "error"; message?: string; email?: string; statusUrl?: string };
type Carried = { businessName?: string; currentWebsite?: string };

export function AccessRequestPage({ carried }: { initialFeedback?: InitialFeedback; carried?: Carried } = {}) {
  return <StEntry>
    <StHead title="What do you need?" meta="Open your platform account or choose an agency to do the work." />
    {carried?.businessName || carried?.currentWebsite ? <StCopy>{[carried.businessName, carried.currentWebsite].filter(Boolean).join(" · ")}</StCopy> : null}
    <StSection title="Use Strelva"><StRows>
      <StRow title="Open my business account" detail="Run your business yourself. Bring in an agency anytime." href="/sign-up" />
      <StRow title="Open my agency account" detail="Build and run systems for your clients." href="/sign-up?as=agency" />
    </StRows></StSection>
    <StSection title="Bring in an agency"><StRows>
      <StRow title="Find an agency" detail="Choose from the agency directory, then sign in to send your request." href="/agencies" />
    </StRows></StSection>
    <StCopy muted>A request becomes agreed work after scope and timing are confirmed.</StCopy>
    <StTextButton href="/sign-in">Already have an account? Sign in</StTextButton>
  </StEntry>;
}
