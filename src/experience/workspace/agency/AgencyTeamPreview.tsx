"use client";
import { useMemo } from "react";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { TEAM_AGENCY, withAgencyTeamPreview } from "../preview/agency-team-fixture";
import { AgencyTeamView } from "./AgencyTeamView";

export function AgencyTeamPreview({ state }: { state: string }) {
  const request = useMemo(() => withAgencyTeamPreview(async () => Response.json({}), state), [state]);
  return <WorkspaceRequestContext.Provider value={request}><AgencyTeamView key={state} workspaceId={TEAM_AGENCY} /></WorkspaceRequestContext.Provider>;
}
