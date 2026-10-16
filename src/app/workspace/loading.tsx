import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaWorkspaceOpening } from "@/experience/states/XaStates";

/**
 * The shell skeleton while the workspace route resolves: the quiet rail with
 * the mark and the account only (it doesn't know whose workspace this is
 * yet), and Pebble's Working line in the content column where the page's
 * headline will be. Inert, so nothing half-loaded can be clicked.
 */
export default function WorkspaceLoading() {
  return <>
    <div inert style={{ display: "contents" }}>
      <StrelvaShell unopened signOut={null} title="Your Strelva">
        <XaWorkspaceOpening />
      </StrelvaShell>
    </div>
    <p role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Opening your workspace</p>
  </>;
}
