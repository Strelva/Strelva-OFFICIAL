import { getSupabase } from "@/lib/db/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INQUIRY_WORKSPACE_EXIT_CODE = "workspace_exit_future_work_blocked" as const;

type ExitMappingRow = {
  workspace_id?: unknown;
  installation_id?: unknown;
  installation_status?: unknown;
  exit_completed?: unknown;
};

export interface InquiryWorkspaceExitMapping {
  workspaceId: string;
  installationId: string;
  installationStatus: "draft" | "active" | "retired";
  exitCompleted: boolean;
}

export interface InquiryWorkspaceResolution {
  /** The actual customer workspace when an inquiry offering is installed. */
  businessId: string;
  workspaceIds: string[];
  exitCompleted: boolean;
  mapped: boolean;
}

export class InquiryWorkspaceExitUnavailableError extends Error {
  readonly code = "inquiry_workspace_exit_unavailable";

  constructor() {
    super("The inquiry workspace exit state is temporarily unavailable.");
    this.name = "InquiryWorkspaceExitUnavailableError";
  }
}

export class InquiryWorkspaceExitBlockedError extends Error {
  readonly code = INQUIRY_WORKSPACE_EXIT_CODE;

  constructor() {
    super("Inquiry intake and delivery are stopped for this workspace.");
    this.name = "InquiryWorkspaceExitBlockedError";
  }
}

type DbClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { stable_id?: unknown } | null; error: unknown }>;
      };
    };
  };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

function db(): DbClient | null {
  return getSupabase() as unknown as DbClient | null;
}

function stableId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

async function resolveTenantStableId(input: { tenantId: string; tenantStableId?: string }): Promise<string | null> {
  const supplied = stableId(input.tenantStableId) ?? stableId(input.tenantId);
  if (supplied) return supplied;
  const client = db();
  if (!client) throw new InquiryWorkspaceExitUnavailableError();
  const result = await client.from("tenants").select("stable_id").eq("id", input.tenantId).maybeSingle();
  if (result.error) throw new InquiryWorkspaceExitUnavailableError();
  const resolved = stableId(result.data?.stable_id);
  if (!resolved) throw new InquiryWorkspaceExitUnavailableError();
  return resolved;
}

function mapRow(value: unknown): InquiryWorkspaceExitMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InquiryWorkspaceExitUnavailableError();
  const row = value as ExitMappingRow;
  const workspaceId = stableId(row.workspace_id);
  const installationId = stableId(row.installation_id);
  const installationStatus = row.installation_status;
  if (!workspaceId || !installationId || (installationStatus !== "draft" && installationStatus !== "active" && installationStatus !== "retired")) {
    throw new InquiryWorkspaceExitUnavailableError();
  }
  if (typeof row.exit_completed !== "boolean") throw new InquiryWorkspaceExitUnavailableError();
  return {
    workspaceId,
    installationId,
    installationStatus,
    exitCompleted: row.exit_completed === true,
  };
}

export async function listInquiryWorkspaceExitMappings(input: {
  tenantId: string;
  tenantStableId?: string;
}): Promise<InquiryWorkspaceExitMapping[]> {
  const client = db();
  if (!client) throw new InquiryWorkspaceExitUnavailableError();
  const tenantStableId = await resolveTenantStableId(input);
  if (!tenantStableId) throw new InquiryWorkspaceExitUnavailableError();
  const result = await client.rpc("read_inquiry_workspace_exit", { p_tenant_stable_id: tenantStableId });
  if (result.error || !Array.isArray(result.data)) throw new InquiryWorkspaceExitUnavailableError();
  return result.data.map(mapRow);
}

/** Resolve the actual customer workspace behind a tenant's installed inquiry. */
export async function resolveInquiryWorkspace(input: {
  tenantId: string;
  tenantStableId?: string;
  fallbackBusinessId: string;
}): Promise<InquiryWorkspaceResolution> {
  const mappings = await listInquiryWorkspaceExitMappings(input);
  const selected = mappings[0];
  return {
    businessId: selected?.workspaceId ?? input.fallbackBusinessId,
    workspaceIds: [...new Set(mappings.map((mapping) => mapping.workspaceId))],
    exitCompleted: mappings.some((mapping) => mapping.exitCompleted),
    mapped: mappings.length > 0,
  };
}

export async function isInquiryWorkspaceExited(input: {
  tenantId: string;
  tenantStableId?: string;
}): Promise<boolean> {
  const mappings = await listInquiryWorkspaceExitMappings(input);
  return mappings.some((mapping) => mapping.exitCompleted);
}

export async function assertInquiryWorkspaceOpen(input: {
  tenantId: string;
  tenantStableId?: string;
}): Promise<void> {
  if (await isInquiryWorkspaceExited(input)) throw new InquiryWorkspaceExitBlockedError();
}
