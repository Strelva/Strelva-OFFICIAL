import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "./enabled";
import { Xa4SystemsPreview } from "./Xa4SystemsPreview";
import { XA4_STATES, XA4_WORKSPACE, harborBookings, type Xa4Screen } from "./xa4-systems-fixture";
import { WorkspaceBookings } from "@/experience/bookings/WorkspaceBookings";
import { WorkspaceBookingsLoading } from "@/experience/bookings/WorkspaceBookingsLoading";

/**
 * XA-4 · Systems up close preview page body, shared by the six static routes
 * /preview/strelva/xa/xa4-systems/<website|bookings|inbox|form|possibility|history>
 * ?state=ready|empty|loading|error|waiting|done&mode=dark
 */
export async function xa4PreviewPage(screen: Xa4Screen, searchParams: Promise<{ state?: string; mode?: string }>) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  const picked = XA4_STATES.find(item => item === state) ?? "ready";
  // Bookings renders on the server, as /workspace/bookings does.
  const bookings = screen !== "bookings" ? null : picked === "loading" ? <WorkspaceBookingsLoading />
    : <WorkspaceBookings workspaceId={XA4_WORKSPACE} view="week" rulesEnabled={false} state={picked === "error" ? { kind: "error" } : { kind: "ready", bookings: harborBookings(picked === "empty" ? "empty" : picked === "waiting" ? "waiting" : picked === "done" ? "done" : "ready") }} />;
  return <Xa4SystemsPreview key={`${screen}:${picked}:${mode}`} screen={screen} state={picked} mode={mode === "dark" ? "dark" : "light"}>{bookings}</Xa4SystemsPreview>;
}
