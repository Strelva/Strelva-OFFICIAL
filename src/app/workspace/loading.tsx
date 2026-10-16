import { XaWorkspaceOpening } from "@/experience/states/XaStates";

/** Paper, Pebble and one Working line while the workspace route resolves. No shell yet: it doesn't know whose workspace this is. */
export default function WorkspaceLoading() {
  return <div data-dashboard data-workspace-theme="linen" data-workspace-look="xa" style={{ minHeight: "100dvh", background: "var(--st-canvas)" }}>
    <XaWorkspaceOpening />
  </div>;
}
