import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StEmpty, StHead, StNotice, StPage, StSkeleton } from "@/components/ui/strelva/Kit";

/** Shared by the real route and its local permission/error specimens. */
export function QueueLoadState({ state, message }: { state: "loading" | "denied" | "unavailable"; message?: string }) {
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.queue.label} meta="Support, incidents and releases only Strelva staff can do. Every action here is logged." />
    {state === "loading" ? <div role="status" aria-busy="true" className="space-y-4">
      <p className="text-[14px] text-gray-muted">Reading the operator queue…</p>
      <StSkeleton label="Reading the operator queue" /><StSkeleton width="75%" /><StSkeleton width="90%" />
    </div> : state === "denied" ? <StEmpty>Operators only. Sign in with a verified Strelva operator account to open the queue.</StEmpty>
      : <StNotice tone="critical">{message ?? "The queue could not be read. Refresh to try again."}</StNotice>}
  </StPage>;
}
