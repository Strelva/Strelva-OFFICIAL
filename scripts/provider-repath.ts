import type { ProviderRepathResult } from "../src/platform/business-record/contracts";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface ProviderRepathOptions {
  tenantId: string;
  operatorEmail?: string;
  agencyWorkspaceId?: string;
  agencyStaffEmails?: string[];
  agencySelectionBasis?: "existing_contract" | "owner_choice";
  apply: boolean;
  jacobsYes: boolean;
  databaseUrl?: string;
}

export interface ProviderRepathDeps {
  repath(
    operatorEmail: string,
    tenantId: string,
    route: { agencyWorkspaceId: string; agencyStaffEmails: string[]; agencySelectionBasis: "existing_contract" | "owner_choice" },
    apply: boolean,
  ): Promise<ProviderRepathResult>;
  log(line: string): void;
}

export interface ProviderRepathOutcome {
  mode: "dry-run" | "apply";
  result: ProviderRepathResult;
}

export async function runProviderRepath(options: ProviderRepathOptions, deps: ProviderRepathDeps): Promise<ProviderRepathOutcome> {
  if (!options.operatorEmail) throw new Error("--operator-email=<a Strelva super admin> is required to inspect a converted tenant.");
  if (!options.agencyWorkspaceId) throw new Error("--agency=<agency workspace UUID> is required; provider selection has no default.");
  if (!options.agencyStaffEmails?.length) throw new Error("--agency-staff=<member email[,email...]> is required.");
  if (!options.agencySelectionBasis) throw new Error("--agency-basis=<existing_contract|owner_choice> is required.");
  if (!options.databaseUrl) throw new Error("Re-routing needs a database connection; none is configured.");
  if (options.apply && !isLocalDatabaseUrl(options.databaseUrl) && !options.jacobsYes) {
    throw new Error("Refusing --apply: the database is not a local loopback host. A production re-route needs Jacob's yes (--i-have-jacobs-yes).");
  }

  const route = {
    agencyWorkspaceId: options.agencyWorkspaceId,
    agencyStaffEmails: options.agencyStaffEmails,
    agencySelectionBasis: options.agencySelectionBasis,
  };
  const result = await deps.repath(options.operatorEmail, options.tenantId, route, options.apply);
  const mode = options.apply ? "apply" : "dry-run";
  deps.log(`Provider re-route: ${options.tenantId} (${mode})`);
  deps.log(`  database: ${isLocalDatabaseUrl(options.databaseUrl) ? "local" : "NOT local"}`);
  deps.log(`  business: ${result.workspaceId}`);
  deps.log(`  agency: ${result.providerRoute.agencyWorkspaceId}; basis=${result.providerRoute.selectionBasis}; source=${result.providerRoute.source}`);
  if (result.providerRoute.providerToEndId) {
    deps.log(`  legacy provider attribution to end: ${result.providerRoute.providerToEndId} (agency ${result.providerRoute.providerToEndWorkspaceId})`);
  }
  deps.log(`  named agency staff: ${options.agencyStaffEmails.join(", ")}`);
  deps.log(`  legacy conversion admin memberships: ${result.legacyAdminMemberships}; removed=${result.legacyAdminMembershipsRemoved}`);
  deps.log(`  provider seat: ${result.providerRoute.seatId ?? "would create"}; staff rows: ${result.providerRoute.staff.length}`);
  deps.log("  owner invitation/email: unchanged and not sent");
  deps.log(options.apply ? "Re-route applied atomically." : "Dry run: nothing was written.");
  return { mode, result };
}
