import { WorkspaceResultsView } from "@/experience/places/WorkspaceResults";

export default function ResultsLoading() {
  return <WorkspaceResultsView workspaceId="" state={{ kind: "loading" }} range="live" />;
}
