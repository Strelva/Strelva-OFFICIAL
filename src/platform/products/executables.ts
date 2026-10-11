import { COLLECTION_LABELS, KIND_LABELS } from "@/platform/presentation/place-labels";
/**
 * Native work that the current workspace can execute under its local release.
 *
 * This registry drives executable workspace routes. It is deliberately not
 * part of the commercial product catalog: working code does not establish a
 * released product, an installation, a price, or an accepted provider duty.
 */
export type WorkspaceExecutableId =
  | "websites"
  | "onboarding"
  | "applications"
  | "scheduling"
  | "investigations"
  | "operations";

export interface WorkspaceExecutableDefinition {
  id: WorkspaceExecutableId;
  name: string;
  description: string;
  availability: "release_gated";
}

export const WORKSPACE_EXECUTABLES = [
  {
    id: "websites",
    name: COLLECTION_LABELS.websites,
    description: "Create a website draft, preview it, and prepare the approved version for launch.",
    availability: "release_gated",
  },
  {
    id: "onboarding",
    name: KIND_LABELS.onboarding,
    description: "Collect required documents, review their contents, and see what is still missing.",
    availability: "release_gated",
  },
  {
    id: "applications",
    name: COLLECTION_LABELS.applications,
    description: "Collect and use business records in a private form and working list.",
    availability: "release_gated",
  },
  {
    id: "scheduling",
    name: COLLECTION_LABELS.scheduling,
    description: "Reserve available time and keep conflicting requests out of the schedule.",
    availability: "release_gated",
  },
  {
    id: "investigations",
    name: COLLECTION_LABELS.investigations,
    description: "Compare two permitted records and notice when they disagree.",
    availability: "release_gated",
  },
  {
    id: "operations",
    name: COLLECTION_LABELS.operations,
    description: "Approve a bounded result and keep its progress, decisions, and evidence together.",
    availability: "release_gated",
  },
] as const satisfies readonly WorkspaceExecutableDefinition[];

export function listWorkspaceExecutableProducts(): readonly WorkspaceExecutableDefinition[] {
  return WORKSPACE_EXECUTABLES;
}
