import type { ReactNode } from "react";
import { StSection, StSteps } from "@/components/ui/strelva/Kit";
import type { StepState } from "@/components/ui/strelva/Kit";

/** A prepared link is not an approval, an accepted claim or a verified launch. */
export function FirstClientHandoff({ status, detail, draft, review, claim, live, readiness, action }: {
  status: string;
  detail: string;
  draft: StepState;
  review: StepState;
  claim: StepState;
  live: StepState;
  readiness?: ReactNode;
  action: ReactNode;
}) {
  return <StSection title="First client handoff">
    <div role="status" className="my-4">
      <p className="text-sm font-medium">{status}</p>
      <p className="mt-2 text-sm leading-6 text-gray-muted">{detail}</p>
    </div>
    <StSteps label="First client handoff progress" steps={[
      { title: "Draft", state: draft },
      { title: "Review", state: review },
      { title: "Owner claim", state: claim },
      { title: "Live", state: live },
    ]} />
    {readiness ? <p className="my-4 text-sm leading-6 text-gray-muted">{readiness}</p> : null}
    <div className="mt-4">{action}</div>
  </StSection>;
}
