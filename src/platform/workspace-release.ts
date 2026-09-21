/** Opt-in until the migration and release acceptance checks are verified. */
export function workspaceReleaseEnabled(): boolean {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1";
}
