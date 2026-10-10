import { StNotice, StSteps, type StepState } from "@/components/ui/strelva/Kit";
import type { SystemActivation } from "./model";

/** Display the recorded outcome; an accepted outside effect is never called undone. */
export function MakeRealProgress({ activation }: { activation: SystemActivation }) {
  return <div className="grid gap-6" aria-label={`Steps of ${activation.title}`}>
    <p role="status" className="text-sm text-gray-muted">{activation.headline} · {activation.done} of {activation.total} done</p>
    <StSteps label={`Making ${activation.title} real`} steps={activation.lines.map(line => ({ title: line.label, state: line.detail === "Running now." ? "active" : makeRealStepState(line.state), detail: line.detail ? `${line.state}: ${line.detail}` : line.state }))} />
    <StNotice tone={activation.partlyLive ? "need" : undefined}>{activation.partlyLive
      ? "Some changes have landed. Strelva keeps their receipts and shows what still needs attention. An accepted change is not repeated."
      : "Strelva checks each step before moving on. Live pointers change only after the outside effects they depend on have been accepted."}</StNotice>
  </div>;
}

export function makeRealStepState(state: string): StepState {
  if (/not (?:yet )?confirmed|not sure|unknown/i.test(state)) return "unverified";
  if (/^(Done|Completed|Live|Confirmed|Undone)$/i.test(state)) return "done";
  if (/^(Running|In progress|Checking)$/i.test(state)) return "active";
  if (/failed|didn.t happen/i.test(state)) return "failed";
  return "pending";
}
