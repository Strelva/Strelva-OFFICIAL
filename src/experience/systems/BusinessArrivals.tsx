"use client";

import { useEffect, useState } from "react";
import { StEmpty, StNotice, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { systemArrivalsSchema, type SystemArrivals } from "@/products/inquiries/client";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

type State = { workspaceId: string; status: "off" | "error" | "ready"; data?: SystemArrivals };

/** In-app arrivals use the same kept records as Inquiries and Bookings. A
 * scope change clears the old business synchronously; stale replies are ignored. */
export function BusinessArrivals({ workspaceId, appBase = "" }: { workspaceId: string; appBase?: string }) {
  const request = useWorkspaceRequest();
  const [result, setResult] = useState<State | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const refresh = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refresh);
    request(`/api/workspace/system-arrivals?${new URLSearchParams({ workspaceId })}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        if (abort.signal.aborted) return;
        if ([401, 403].includes(response.status)) { setResult({ workspaceId, status: "off" }); return; }
        const body: unknown = await response.json();
        if (abort.signal.aborted) return;
        if (response.status === 503 && body && typeof body === "object" && "code" in body && body.code === "not_released") {
          setResult({ workspaceId, status: "off" }); return;
        }
        const parsed = systemArrivalsSchema.safeParse(body);
        if (!response.ok || !parsed.success || parsed.data.workspaceId !== workspaceId) throw new Error("unavailable");
        if (!abort.signal.aborted) setResult({ workspaceId, status: "ready", data: parsed.data });
      }).catch(() => { if (!abort.signal.aborted) setResult({ workspaceId, status: "error" }); });
    return () => { abort.abort(); window.removeEventListener("focus", refresh); };
  }, [workspaceId, request, attempt]);
  const state = result?.workspaceId === workspaceId ? result : null;
  if (state?.status === "off") return null;
  return <StSection title="Customer activity" meta={state?.data?.sources.includes("inquiries") ? "Recent inquiries · bookings in the next 30 days" : "Bookings in the next 30 days"} action={<StTextButton onClick={() => setAttempt(value => value + 1)}>Check again</StTextButton>}>
    <div aria-live="polite">
      {!state ? <StSkeleton label="Checking customer activity" /> : state.status === "error" ? <StNotice>Customer activity could not be checked. Open Inquiries or Bookings to check your records.</StNotice> : <>
        {state.data?.unavailable.length ? <StNotice>Some {state.data.unavailable.join(" and ")} could not be checked. The full count is unknown.</StNotice> : null}
        {state.data?.items.length ? <StRows label="Customer activity">{state.data.items.map(item => <StRow key={item.id} title={item.title} detail={item.detail} end={<StTextButton href={`${appBase}${item.href}`}>{item.kind === "inquiry" ? "Open inquiries" : "Open bookings"}</StTextButton>} />)}</StRows>
          : !state.data?.unavailable.length ? <StEmpty>{state.data?.sources.includes("inquiries") ? "No recent inquiries or upcoming bookings are recorded." : "No upcoming bookings are recorded."}</StEmpty> : null}
      </>}
    </div>
    {(!state?.data || state.data.sources.includes("inquiries")) ? <StTextButton href={`${appBase}/workspace/inquiries?${new URLSearchParams({ workspaceId })}`}>Inquiries</StTextButton> : null}{" "}
    <StTextButton href={`${appBase}/workspace/bookings?${new URLSearchParams({ workspaceId })}`}>Bookings</StTextButton>
  </StSection>;
}
