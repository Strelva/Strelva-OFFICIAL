import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PossibilityTry } from "@/experience/systems/PossibilityTry";
import { possibilityTryState } from "@/experience/systems/try-state";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const metadata: Metadata = { title: "Try it | Strelva", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * The signed "Try it" preview (systems-experience spec behavior 19). No
 * sign-in: the token is the authority, bound to one candidate revision of
 * one Possibility. Shows only the candidate; nothing live is read or written.
 */
export default async function TryPossibilityPage({ params }: { params: Promise<{ token: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const [{ systemsReleaseEnabledForWorkspace }, { readPossibilityPreview }] = await Promise.all([
    import("@/platform/systems-release"), import("@/platform/possibilities/supabase-repository"),
  ]);
  const state = await possibilityTryState((await params).token, {
    enabled: (workspaceId) => systemsReleaseEnabledForWorkspace(workspaceId),
    read: (claims) => readPossibilityPreview(claims),
  });
  if (!state) notFound();
  return <PossibilityTry state={state} />;
}
