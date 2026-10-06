import type { ReleaseViewer } from "@/platform/release-flags/resolve";
/** Exposure only. Every inquiry read and command still requires tenant authority. */
export function inquiryReleaseEnabled(environment: { STRELVA_INQUIRIES_RELEASE?: string } = { STRELVA_INQUIRIES_RELEASE: process.env.STRELVA_INQUIRIES_RELEASE }): boolean {
  return environment.STRELVA_INQUIRIES_RELEASE === "1";
}

/** Per workspace, layered over the env flag (owner-entry spec §4). */
export async function inquiryReleaseEnabledForWorkspace(workspaceId: string, viewer?: ReleaseViewer): Promise<boolean> {
  const { workspaceReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return workspaceReleaseFlagEnabled("inquiries", workspaceId, viewer);
}
