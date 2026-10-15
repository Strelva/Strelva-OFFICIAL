import type { AppReleaseGate, BuiltInApp, BuiltInAppReleaseState } from "./contracts";

export type GateReader = (gate: AppReleaseGate) => boolean | Promise<boolean>;

/**
 * Where one business stands in one App. Pure: the caller supplies the gate
 * reader. Gates are read lazily and in order, never past the first one that is
 * off, so an App with only Release 1 reads nothing.
 */
export async function resolveBuiltInAppRelease(
  app: BuiltInApp,
  gateOn: GateReader,
  options: { ignoreAvailability?: boolean } = {},
): Promise<BuiltInAppReleaseState> {
  if (!options.ignoreAvailability) {
    for (const gate of app.availability) {
      if (!(await gateOn(gate))) return { appId: app.id, available: false };
    }
  }
  let reached = app.releases[0]!;
  let heldBack: { number: number; key: string; gates: AppReleaseGate[] } | null = null;
  for (const release of app.releases.slice(1)) {
    let on = true;
    for (const gate of release.gates) {
      if (!(await gateOn(gate))) { on = false; break; }
    }
    if (!on) {
      heldBack = { number: release.number, key: release.key, gates: [...release.gates] };
      break;
    }
    reached = release;
  }
  return {
    appId: app.id,
    available: true,
    release: reached.number,
    key: reached.key,
    latest: app.releases.length,
    heldBack,
    requiredConnections: reached.requiredConnections.map(item => ({ ...item })),
  };
}
