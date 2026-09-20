/**
 * Native work that the current workspace can execute under its local release.
 *
 * This registry drives executable workspace routes. It is deliberately not
 * part of the commercial product catalog: working code does not establish a
 * released product, an installation, a price, or an accepted provider duty.
 */
export type WorkspaceExecutableId =
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
    id: "onboarding",
    name: "Onboarding",
    description: "Collect required documents, review their contents, and see what is still missing.",
    availability: "release_gated",
  },
  {
    id: "applications",
    name: "Internal applications",
    description: "Collect and use business records in a private form and working list.",
    availability: "release_gated",
  },
  {
    id: "scheduling",
    name: "Scheduling",
    description: "Reserve available time and keep conflicting requests out of the schedule.",
    availability: "release_gated",
  },
  {
    id: "investigations",
    name: "Ongoing checks",
    description: "Compare two permitted records and notice when they disagree.",
    availability: "release_gated",
  },
  {
    id: "operations",
    name: "Delegated work",
    description: "Approve a bounded result and keep its progress, decisions, and evidence together.",
    availability: "release_gated",
  },
] as const satisfies readonly WorkspaceExecutableDefinition[];

export function listWorkspaceExecutableProducts(): readonly WorkspaceExecutableDefinition[] {
  return WORKSPACE_EXECUTABLES;
}
