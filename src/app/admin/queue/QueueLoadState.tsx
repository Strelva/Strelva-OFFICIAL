import { ShieldAlert } from "lucide-react";
import { AdminEmpty } from "../console";

/** Shared by the real route and its local permission/error specimens. */
export function QueueLoadState({ state, message }: { state: "loading" | "denied" | "unavailable"; message?: string }) {
  if (state === "loading") return <div className="mx-auto max-w-[920px]" role="status" aria-busy="true">
    <p className="text-[14px] text-gray-muted">Reading the operator queue…</p>
  </div>;
  return <div className="mx-auto max-w-[920px]">
    <AdminEmpty icon={<ShieldAlert className="size-5" aria-hidden />}
      title={state === "denied" ? "Operators only" : "The queue could not be read"}
      description={state === "denied" ? "The queue is for Strelva operators. Sign in with a verified operator account." : message ?? "The queue could not be read. Refresh to try again."} />
  </div>;
}
