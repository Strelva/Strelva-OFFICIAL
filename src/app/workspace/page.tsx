import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import type { Metadata } from "next";
import Link from "next/link";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your work",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function WorkspacePage() {
  if (!workspaceReleaseEnabled()) return (
    <main data-dashboard className="min-h-dvh bg-surface-base px-6 py-24 text-warm-black">
      <div className="mx-auto max-w-xl">
        <p className="text-sm text-gray-fg">Strelva</p>
        <h1 className="mt-6 font-display text-3xl">Workspaces are not open yet.</h1>
        <p className="mt-4 text-gray-fg">Existing client services are unchanged. Private workspaces and agency handoffs will open after their release checks are complete.</p>
        <Link href="/account" className="mt-8 inline-block underline underline-offset-4">Open your existing account</Link>
      </div>
    </main>
  );
  // Public shell contains no private data. Each API request validates the session.
  // Keeping the shell accessible lets it preserve recipient-bound fragments across sign-in.
  return <WorkspaceApp />;
}
