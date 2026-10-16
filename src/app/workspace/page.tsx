import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import type { Metadata } from "next";
import { XaNotOpenYet } from "@/experience/states/XaStates";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your workspace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function WorkspacePage() {
  if (!workspaceReleaseEnabled()) return <XaNotOpenYet />;
  // Public shell contains no private data. Each API request validates the session.
  // Keeping the shell accessible lets it preserve recipient-bound fragments across sign-in.
  return <WorkspaceApp rebuildEnabled={process.env.STRELVA_WEBSITE_REBUILD_RELEASE === "1"} />;
}
