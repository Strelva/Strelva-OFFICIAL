import { headers } from "next/headers";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { listMemberAgencies } from "@/platform/workspaces/agency-onboarding";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";
import { strelvaAgencySeat, agencyEntryHref } from "@/experience/operator/agency-entry";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { workspaceHref } from "./work/workspace-href";

export async function AgencyWorkEntry({ destination }: { destination: "actions" | "onboard" }) {
  const requestHeaders = await headers();
  const base = workspaceHref(requestHeaders.get("host") || "", requestHeaders.get("x-forwarded-proto"), "home");
  let agency = null;
  try { const actor = await workspaceHttpActor(); agency = actor ? strelvaAgencySeat(await listMemberAgencies(actor)) : null; } catch { /* No agency authority inferred from the operator role. */ }
  const href = agency ? agencyEntryHref(base, agency.id, destination === "actions" ? "queue" : "onboard", agencyAddClientReleaseEnabled()) : base;
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS[destination].label} meta="Strelva Agency · Runs on Strelva" />
    <StNotice>Client service belongs to Strelva Agency. Open its workspace through your ordinary agency seat. Each request names who asked; owner decisions remain with the client business.</StNotice>
    {agency ? <StTextButton href={href}>{destination === "actions" ? "Open Strelva Agency Queue" : "Open Strelva Agency client setup"}</StTextButton>
      : <><StNotice tone="need">Your Strelva Agency membership could not be verified. Operator access grants no agency seat.</StNotice><StTextButton href={href}>Open workspace to check agency access</StTextButton></>}
  </StPage>;
}
