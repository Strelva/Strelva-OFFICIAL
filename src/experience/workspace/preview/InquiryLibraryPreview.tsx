"use client";
import { AgencyLibraryView } from "../agency/AgencyLibraryView";
export function InquiryLibraryPreview() {
  return <AgencyLibraryView request={fetch} agencyWorkspaceId="5e000000-0000-4000-8000-000000000010" onWorkspace={() => undefined} />;
}
