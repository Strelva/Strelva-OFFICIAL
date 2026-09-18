import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";

/**
 * Application use is a resource grant. It is deliberately separate from the
 * workspace membership and from the application design/release commands.
 * These scopes are the only authority a finished app surface receives.
 */
export const applicationViewKindSchema = z.enum(["form", "list", "detail", "document"]);
export type ApplicationViewKind = z.infer<typeof applicationViewKindSchema>;

export const applicationRecordReadScopeSchema = z.enum(["none", "own", "all"]);
export type ApplicationRecordReadScope = z.infer<typeof applicationRecordReadScopeSchema>;

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const expirySchema = z.string().datetime({ offset: true });
const primitiveSchema = z.union([z.string().max(10000), z.number().finite(), z.boolean()]);

export const applicationUseGrantInputSchema = z.object({
  recipientEmail: emailSchema,
  views: z.array(applicationViewKindSchema).min(1).max(4),
  recordRead: applicationRecordReadScopeSchema.default("none"),
  recordSubmit: z.boolean().default(false),
  purpose: z.string().trim().min(1).max(500),
  expiresAt: expirySchema,
}).strict().superRefine((value, ctx) => {
  if (new Set(value.views).size !== value.views.length) {
    ctx.addIssue({ code: "custom", path: ["views"], message: "Each view can be granted only once." });
  }
  if (value.recordSubmit && !value.views.includes("form")) {
    ctx.addIssue({ code: "custom", path: ["recordSubmit"], message: "Record submission requires the form view." });
  }
});
export type ApplicationUseGrantInput = z.infer<typeof applicationUseGrantInputSchema>;

export const applicationUseGrantSchema = applicationUseGrantInputSchema.extend({
  id: z.string().uuid(),
  workId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  status: z.enum(["active", "revoked"]),
  grantedBy: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type ApplicationUseGrant = z.infer<typeof applicationUseGrantSchema>;

/** Browser input. Native application validation remains authoritative. */
export const applicationUseSubmitSchema = z.object({
  record: z.object({
    id: z.string().trim().min(1).max(100),
    values: z.record(z.string().trim().min(1).max(80), primitiveSchema),
  }).strict(),
  releaseVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(120),
}).strict();
export type ApplicationUseSubmitInput = z.infer<typeof applicationUseSubmitSchema>;

const fieldSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "boolean"]),
  required: z.boolean().optional().default(false),
});
const componentSchema = z.object({
  kind: applicationViewKindSchema,
  fields: z.array(z.string().min(1).max(40)).min(1).max(30),
});
const useSpecSchema = z.object({
  title: z.string().trim().min(1).max(160),
  fields: z.array(fieldSchema).min(1).max(30),
  components: z.array(componentSchema).min(1).max(12),
}).superRefine((spec, ctx) => {
  if (spec.components.filter(component => component.kind === "form").length > 1) {
    ctx.addIssue({ code: "custom", path: ["components"], message: "This application has more than one submission form." });
  }
});
type UseSpec = z.infer<typeof useSpecSchema>;

const rawRecordSchema = z.object({
  id: z.string().min(1).max(100),
  values: z.record(z.string(), primitiveSchema),
  // Ownership comes only from canonical application_records.created_by. It is
  // internal to the access projection and is never returned to the browser.
  createdBy: z.string().uuid().nullable(),
}).strict();
type RawRecord = z.infer<typeof rawRecordSchema>;

/** Internal row returned by the access RPC. Never send this object to a page. */
export interface ApplicationUseContext {
  workId: string;
  workspaceId: string;
  title: string;
  releaseVersion: number;
  releasedSpec: unknown;
  records: unknown[];
  grant: ApplicationUseGrant;
}

export interface ApplicationUseSnapshot {
  workId: string;
  title: string;
  releaseVersion: number;
  views: Array<{
    kind: ApplicationViewKind;
    fields: Array<{ id: string; label: string; type: "text" | "number" | "boolean"; required: boolean }>;
  }>;
  records: Array<{ id: string; values: Record<string, string | number | boolean> }>;
  access: {
    views: ApplicationViewKind[];
    recordRead: ApplicationRecordReadScope;
    recordSubmit: boolean;
    expiresAt: string;
  };
}

export interface ApplicationUsePersistence {
  /** Reads and authorizes the current grant, but does not expose raw data to HTTP. */
  inspect(actor: WorkspaceActor, workId: string): Promise<ApplicationUseContext>;
  /** Manager-only grant listing, scoped to the current workspace role. */
  list(actor: WorkspaceActor, workId: string): Promise<ApplicationUseGrant[]>;
  /** Manager-only grant mutation. The persistence boundary rechecks role and identity. */
  grant(actor: WorkspaceActor, workId: string, input: ApplicationUseGrantInput): Promise<ApplicationUseGrant>;
  /** Manager-only revocation. The persistence boundary serializes this with submit. */
  revoke(actor: WorkspaceActor, workId: string, grantId: string): Promise<void>;
  /** Native application submit boundary. Implementations must recheck grant and lock before mutation. */
  submit(
    actor: WorkspaceActor,
    workId: string,
    input: ApplicationUseSubmitInput,
    access: ApplicationUseGrant,
  ): Promise<ApplicationUseContext>;
}

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function db(): RpcClient {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Application access is unavailable right now.");
  return client as unknown as RpcClient;
}

function identity(actor: WorkspaceActor) {
  const userId = z.string().uuid().parse(actor.userId);
  const verifiedEmail = emailSchema.parse(actor.verifiedEmail);
  return { p_user_id: userId, p_verified_email: verifiedEmail };
}

function rpcData(data: unknown): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new WorkspaceStoreError("Application access is unreadable.");
  return row as Record<string, unknown>;
}

function rpcRows(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw new WorkspaceStoreError("Application access is unreadable.");
  return data;
}

function rpcFailure(
  error: { message?: string; code?: string } | null,
  invalidMessage = "Check the application access details and try again.",
): never | void {
  if (!error) return;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/application_use_form_incompatible/.test(detail)) {
    throw new ApplicationUseAccessError("This application form is incompatible with its current release. Ask the owner to update it.");
  }
  if (/application_use_denied|verified_identity_required|workspace_access_denied|grant_not_found|recipient_unverified|application_design_access_denied/.test(detail)) {
    throw new ApplicationUseAccessError();
  }
  if (/application_use_invalid|application_record_invalid|application_schema_invalid/.test(detail)) {
    throw new ApplicationUseInputError(invalidMessage);
  }
  if (/application_use_conflict|application_use_expired|grant_revoked|release_version_conflict|application_release_conflict|application_records_revision_conflict|application_record_duplicate|application_record_limit_reached|idempotency_conflict/.test(detail)) {
    throw new ApplicationUseConflictError("This application changed or the use grant is no longer active.");
  }
  throw new ApplicationUseUnavailableError();
}

function parseGrant(value: unknown, fallbackWorkId: string, fallbackWorkspaceId?: string): ApplicationUseGrant {
  const row = (value && typeof value === "object" && !Array.isArray(value)) ? value as Record<string, unknown> : {};
  const raw = {
    id: row.id,
    workId: row.work_id ?? row.workId ?? fallbackWorkId,
    workspaceId: row.workspace_id ?? row.workspaceId ?? fallbackWorkspaceId,
    recipientEmail: row.recipient_email ?? row.recipientEmail,
    views: row.views,
    recordRead: row.record_read_scope ?? row.recordRead ?? "none",
    recordSubmit: row.record_submit ?? row.recordSubmit ?? false,
    purpose: row.purpose,
    expiresAt: row.expires_at ?? row.expiresAt,
    status: row.status,
    grantedBy: row.granted_by ?? row.grantedBy,
    createdAt: row.created_at ?? row.createdAt,
    revokedAt: row.revoked_at ?? row.revokedAt ?? null,
  };
  const parsed = applicationUseGrantSchema.safeParse(raw);
  if (!parsed.success) throw new ApplicationUseUnavailableError("Application access uses an unsupported grant.");
  return parsed.data;
}

function parseContext(value: unknown, workId: string): ApplicationUseContext {
  const row = rpcData(value);
  const parsedWorkId = typeof row.work_id === "string" ? row.work_id : typeof row.workId === "string" ? row.workId : workId;
  const workspaceId = typeof row.workspace_id === "string" ? row.workspace_id : typeof row.workspaceId === "string" ? row.workspaceId : "";
  const title = typeof row.title === "string" ? row.title : "";
  const releaseVersion = Number(row.release_version ?? row.releaseVersion);
  const releasedSpec = row.released_spec;
  const records = Array.isArray(row.records) ? row.records : [];
  if (!z.string().uuid().safeParse(parsedWorkId).success || !z.string().uuid().safeParse(workspaceId).success || !title || !Number.isInteger(releaseVersion) || releaseVersion < 1 || releasedSpec == null) {
    throw new ApplicationUseUnavailableError("The released application is unavailable.");
  }
  return { workId: parsedWorkId, workspaceId, title, releaseVersion, releasedSpec, records, grant: parseGrant(row.grant ?? row, parsedWorkId, workspaceId) };
}

function dateIsActive(value: string, now: Date): boolean {
  const expiry = Date.parse(value);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

function assertUsable(context: ApplicationUseContext, actor: WorkspaceActor, now: Date): ApplicationUseGrant {
  const grant = context.grant;
  if (grant.status !== "active" || grant.recipientEmail !== actor.verifiedEmail.trim().toLowerCase() || !dateIsActive(grant.expiresAt, now)) {
    throw new ApplicationUseAccessError("This application link is no longer available to your account.");
  }
  if (!grant.views.length) throw new ApplicationUseAccessError("This application has no available views.");
  return grant;
}

function safeRecord(value: unknown): RawRecord | null {
  const parsed = rawRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function assertSubmittedFieldsAllowed(
  context: ApplicationUseContext,
  grant: ApplicationUseGrant,
  input: ApplicationUseSubmitInput,
): void {
  const parsed = useSpecSchema.safeParse(context.releasedSpec);
  if (!parsed.success) throw new ApplicationUseUnavailableError("The released application cannot be displayed.");
  const form = parsed.data.components.find(component => component.kind === "form");
  if (!form || !grant.views.includes("form")) {
    throw new ApplicationUseAccessError("This application does not expose a submission form to your account.");
  }
  const allowed = new Set(form.fields);
  if (Object.keys(input.record.values).some(fieldId => !allowed.has(fieldId))) {
    throw new ApplicationUseAccessError("This field is not part of the released form.");
  }
  if (parsed.data.fields.some(field => {
    const value = input.record.values[field.id];
    return field.required && (value === undefined || (typeof value === "string" && value.trim() === ""));
  })) {
    throw new ApplicationUseInputError("Complete the required form fields and try again.");
  }
}

function project(context: ApplicationUseContext, actor: WorkspaceActor, now: Date): ApplicationUseSnapshot {
  const grant = assertUsable(context, actor, now);
  const parsed = useSpecSchema.safeParse(context.releasedSpec);
  if (!parsed.success) throw new ApplicationUseUnavailableError("The released application cannot be displayed.");
  const spec: UseSpec = parsed.data;
  const grantedViews = new Set(grant.views);
  const formCount = spec.components.filter(component => component.kind === "form").length;
  if (grant.recordSubmit && formCount !== 1) {
    throw new ApplicationUseAccessError("This application does not expose one usable submission form.");
  }
  const form = spec.components.find(component => component.kind === "form");
  if (grant.recordSubmit && form && spec.fields.some(field => field.required && !form.fields.includes(field.id))) {
    throw new ApplicationUseAccessError("This application form is incompatible with its current release. Ask the owner to update it.");
  }
  const fields = new Map(spec.fields.map(field => [field.id, field]));
  const views = spec.components
    .filter(component => grantedViews.has(component.kind))
    .map(component => ({
      kind: component.kind,
      fields: component.fields.map(id => fields.get(id)).filter((field): field is UseSpec["fields"][number] => Boolean(field)).map(field => ({
        id: field.id, label: field.label, type: field.type, required: field.required ?? false,
      })),
    }))
    .filter(component => component.fields.length > 0);
  if (!views.length) throw new ApplicationUseAccessError("This application has no views available to your account.");
  const visibleFields = new Set(views.flatMap(view => view.fields.map(field => field.id)));
  const records = grant.recordRead === "none" ? [] : context.records.flatMap(value => {
    const record = safeRecord(value);
    if (!record) return [];
    if (grant.recordRead === "own" && record.createdBy !== actor.userId) return [];
    const safeValues = Object.fromEntries(Object.entries(record.values).filter(([key]) => visibleFields.has(key)));
    return [{ id: record.id, values: safeValues }];
  });
  return {
    workId: context.workId,
    title: context.title,
    releaseVersion: context.releaseVersion,
    views,
    records,
    access: { views: grant.views, recordRead: grant.recordRead, recordSubmit: grant.recordSubmit, expiresAt: grant.expiresAt },
  };
}

export class ApplicationUseAccessError extends WorkspaceAccessError {
  constructor(message = "This application link is no longer available to your account.") {
    super(message);
    this.name = "ApplicationUseAccessError";
  }
}

export class ApplicationUseConflictError extends WorkspaceConflictError {
  constructor(message = "The application changed or its access grant is no longer active.") {
    super(message);
    this.name = "ApplicationUseConflictError";
  }
}

export class ApplicationUseUnavailableError extends WorkspaceStoreError {
  constructor(message = "Application use is temporarily unavailable.") {
    super(message);
    this.name = "ApplicationUseUnavailableError";
  }
}

export class ApplicationUseInputError extends Error {
  constructor(message = "Check the application input and try again.") {
    super(message);
    this.name = "ApplicationUseInputError";
  }
}

export const postgresApplicationUsePersistence: ApplicationUsePersistence = {
  async inspect(actor, workId) {
    const { data, error } = await db().rpc("read_application_use", {
      ...identity(actor),
      p_work_id: z.string().uuid().parse(workId),
    });
    rpcFailure(error);
    return parseContext(data, workId);
  },
  async list(actor, workId) {
    const { data, error } = await db().rpc("list_application_use_grants", {
      ...identity(actor),
      p_work_id: z.string().uuid().parse(workId),
    });
    rpcFailure(error);
    return rpcRows(data).map(value => parseGrant(value, workId));
  },
  async grant(actor, workId, input) {
    const { data, error } = await db().rpc("grant_application_use", {
      ...identity(actor),
      p_work_id: z.string().uuid().parse(workId),
      p_recipient_email: input.recipientEmail,
      p_views: input.views,
      p_record_read_scope: input.recordRead,
      p_record_submit: input.recordSubmit,
      p_purpose: input.purpose,
      p_expires_at: input.expiresAt,
    });
    rpcFailure(error, "Check the recipient, permissions, and expiry.");
    return parseGrant(rpcData(data), workId);
  },
  async revoke(actor, workId, grantId) {
    const { error } = await db().rpc("revoke_application_use", {
      ...identity(actor),
      p_work_id: z.string().uuid().parse(workId),
      p_grant_id: z.string().uuid().parse(grantId),
    });
    rpcFailure(error);
  },
  async submit(actor, workId, input, access) {
    const { data, error } = await db().rpc("submit_application_use_record", {
      ...identity(actor),
      p_work_id: z.string().uuid().parse(workId),
      p_grant_id: z.string().uuid().parse(access.id),
      p_release_version: input.releaseVersion,
      p_record: input.record,
      p_idempotency_key: input.idempotencyKey,
    });
    rpcFailure(error, "Check the record fields and try again.");
    return parseContext(data, workId);
  },
};

export function applicationUseHref(workId: string): string {
  return `/apps/${z.string().uuid().parse(workId)}`;
}

export function createApplicationAccessService(
  persistence: ApplicationUsePersistence = postgresApplicationUsePersistence,
  clock = () => new Date(),
) {
  return {
    async inspect(actor: WorkspaceActor, workId: string): Promise<ApplicationUseSnapshot> {
      const context = await persistence.inspect(actor, z.string().uuid().parse(workId));
      return project(context, actor, clock());
    },
    async list(actor: WorkspaceActor, workId: string): Promise<ApplicationUseGrant[]> {
      return persistence.list(actor, z.string().uuid().parse(workId));
    },
    async submit(actor: WorkspaceActor, workId: string, raw: unknown): Promise<ApplicationUseSnapshot> {
      const input = applicationUseSubmitSchema.parse(raw);
      const normalizedWorkId = z.string().uuid().parse(workId);
      // This preflight gives the user a useful denial and pins the version sent
      // to the native operation. The persistence submit repeats the grant and
      // release checks while holding its work/grant lock, closing revocation
      // and concurrent-submit races.
      const current = await persistence.inspect(actor, normalizedWorkId);
      const grant = assertUsable(current, actor, clock());
      if (!grant.recordSubmit) throw new ApplicationUseAccessError("This application does not accept records from your account.");
      assertSubmittedFieldsAllowed(current, grant, input);
      if (input.releaseVersion !== current.releaseVersion) throw new ApplicationUseConflictError("This application has a newer released version. Reload before submitting.");
      const saved = await persistence.submit(actor, normalizedWorkId, input, grant);
      return project(saved, actor, clock());
    },
    async grant(actor: WorkspaceActor, workId: string, raw: unknown): Promise<{ grant: ApplicationUseGrant; href: string }> {
      const input = applicationUseGrantInputSchema.parse(raw);
      const normalizedWorkId = z.string().uuid().parse(workId);
      const grant = await persistence.grant(actor, normalizedWorkId, input);
      return { grant, href: applicationUseHref(normalizedWorkId) };
    },
    async revoke(actor: WorkspaceActor, workId: string, grantId: string): Promise<void> {
      await persistence.revoke(actor, z.string().uuid().parse(workId), z.string().uuid().parse(grantId));
    },
  };
}

export const applicationAccessService = createApplicationAccessService();
