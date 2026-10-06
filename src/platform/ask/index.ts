export * from "./contracts";
export * from "./authority";
export * from "./classify";
export * from "./resolution";
export * from "./ports";
export * from "./tools";
export * from "./turn";

/**
 * Ask Strelva has its own off-by-default flag, on top of the workspace and
 * Systems releases it depends on: all three must be "1".
 */
export function askReleaseEnabled(environment: {
  STRELVA_WORKSPACE_RELEASE?: string;
  STRELVA_SYSTEMS_RELEASE?: string;
  STRELVA_ASK_RELEASE?: string;
} = {
  STRELVA_WORKSPACE_RELEASE: process.env.STRELVA_WORKSPACE_RELEASE,
  STRELVA_SYSTEMS_RELEASE: process.env.STRELVA_SYSTEMS_RELEASE,
  STRELVA_ASK_RELEASE: process.env.STRELVA_ASK_RELEASE,
}): boolean {
  return environment.STRELVA_WORKSPACE_RELEASE === "1"
    && environment.STRELVA_SYSTEMS_RELEASE === "1"
    && environment.STRELVA_ASK_RELEASE === "1";
}

/**
 * Could Ask be on for any workspace? STRELVA_ASK_RELEASE and the workspace
 * release exactly "1", and Systems `1` or `workspace`. Under `workspace` the
 * turn still needs Systems on for the asked workspace (`AskTurnDeps.released`).
 */
export function askReleaseMayBeOn(environment: {
  STRELVA_WORKSPACE_RELEASE?: string;
  STRELVA_SYSTEMS_RELEASE?: string;
  STRELVA_ASK_RELEASE?: string;
} = {
  STRELVA_WORKSPACE_RELEASE: process.env.STRELVA_WORKSPACE_RELEASE,
  STRELVA_SYSTEMS_RELEASE: process.env.STRELVA_SYSTEMS_RELEASE,
  STRELVA_ASK_RELEASE: process.env.STRELVA_ASK_RELEASE,
}): boolean {
  const systems = environment.STRELVA_SYSTEMS_RELEASE?.trim();
  return environment.STRELVA_WORKSPACE_RELEASE === "1"
    && (systems === "1" || systems === "workspace")
    && environment.STRELVA_ASK_RELEASE === "1";
}
