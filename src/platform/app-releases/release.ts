/** Exposure only: Release labels and Needs on screen. Off, nothing new renders. Resolution and Make it live connection reads do not depend on it. */
export function appReleaseLabelsEnabled(
  env: { STRELVA_WORKSPACE_RELEASE?: string; STRELVA_APP_RELEASES?: string } = {
    STRELVA_WORKSPACE_RELEASE: process.env.STRELVA_WORKSPACE_RELEASE,
    STRELVA_APP_RELEASES: process.env.STRELVA_APP_RELEASES,
  },
): boolean {
  return env.STRELVA_WORKSPACE_RELEASE === "1" && env.STRELVA_APP_RELEASES?.trim() === "1";
}
