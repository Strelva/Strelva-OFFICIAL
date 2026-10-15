import { assertIntakeDefinition, type VerticalIntakeAppId, type VerticalIntakeDefinition } from "../contracts";
import { DENTAL_INTAKE } from "./dental";

export const VERTICAL_INTAKE_DEFINITIONS: Readonly<Record<VerticalIntakeAppId, VerticalIntakeDefinition>> = Object.freeze({
  dental_intake: DENTAL_INTAKE,
});

for (const definition of Object.values(VERTICAL_INTAKE_DEFINITIONS)) assertIntakeDefinition(definition);

/** Only version 1 exists. Throws on an unknown App or version. */
export function intakeDefinition(appId: string, version = 1): VerticalIntakeDefinition {
  const found = (VERTICAL_INTAKE_DEFINITIONS as Record<string, VerticalIntakeDefinition | undefined>)[appId];
  if (!found || found.version !== version) throw new Error(`Unknown intake definition: ${appId} v${version}`);
  return found;
}
