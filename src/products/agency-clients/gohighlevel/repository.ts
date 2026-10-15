import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import type { GhlWebhookEvent } from "./webhook";

/**
 * Storage for the agency's HighLevel account connection and install
 * deliveries (supabase/migrations/20261024600000_agency_source_connections.sql).
 * Tokens pass through the one secrets path and are refused unless encrypted.
 */

export type GhlConnectionStatus = "connected" | "needs_reauth" | "revoked";

export interface GhlConnection {
  id: string;
  workspaceId: string;
  companyId: string;
  scopes: string[];
  status: GhlConnectionStatus;
  tokenExpiresAt: string | null;
  lastError: string | null;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Server-only. Never return this across an HTTP boundary. */
export interface GhlConnectionWithSecrets extends GhlConnection {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface GhlTokenWrite {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
}

export interface GhlStoredEvent {
  deliveryId: string;
  kind: GhlWebhookEvent["kind"];
  companyId: string | null;
  locationId: string | null;
  receivedAt: string;
}

export interface GhlConnectionStore {
  read(workspaceId: string): Promise<GhlConnectionWithSecrets | null>;
  readByCompany(companyId: string): Promise<GhlConnectionWithSecrets | null>;
  /** Connect or reconnect. Refuses (`company_taken`) when another agency already holds this HighLevel company. */
  save(input: { workspaceId: string; companyId: string; connectedBy: string; tokens: GhlTokenWrite }): Promise<GhlConnection>;
  updateTokens(id: string, tokens: GhlTokenWrite): Promise<void>;
  markStatus(id: string, status: GhlConnectionStatus, lastError: string | null): Promise<void>;
  /** Compensation only for this exact save; never clears a newer concurrent reconnect. */
  revokeSaved?(id: string, updatedAt: string): Promise<void>;
  /** `false` when this delivery was already recorded (a retry). */
  recordEvent(event: Omit<GhlStoredEvent, "receivedAt">): Promise<boolean>;
  eventsSince(companyId: string, since: string | null): Promise<GhlStoredEvent[]>;
}

export class GhlStoreError extends WorkspaceStoreError {
  constructor(message: string, readonly code: "company_taken" | "not_encrypted" | "unavailable") {
    super(message);
    this.name = "GhlStoreError";
  }
}

type DbError = { message?: string; code?: string } | null;
type DbResult = { data: unknown; error: DbError };
interface Builder extends PromiseLike<DbResult> {
  select(columns?: string): Builder;
  insert(values: Record<string, unknown>): Builder;
  update(values: Record<string, unknown>): Builder;
  delete(): Builder;
  eq(column: string, value: unknown): Builder;
  or(filter: string): Builder;
  gte(column: string, value: unknown): Builder;
  order(column: string, options?: { ascending?: boolean }): Builder;
  limit(count: number): Builder;
  maybeSingle(): Builder;
  single(): Builder;
}
interface Db { from(table: string): Builder }

const PROVIDER = "gohighlevel";
/** HighLevel ids as the migration accepts them; also keeps the PostgREST filter below literal. */
export const GHL_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UNAVAILABLE = "The HighLevel connection is unavailable. Try again shortly.";

type Row = Record<string, unknown>;

function mapConnection(row: Row): GhlConnectionWithSecrets {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    companyId: String(row.external_account_id),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    status: row.status as GhlConnectionStatus,
    tokenExpiresAt: typeof row.token_expires_at === "string" ? row.token_expires_at : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    connectedBy: String(row.connected_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    accessToken: typeof row.access_token_ciphertext === "string" ? decryptSecret(row.access_token_ciphertext) : null,
    refreshToken: typeof row.refresh_token_ciphertext === "string" ? decryptSecret(row.refresh_token_ciphertext) : null,
  };
}

export function publicGhlConnection(connection: GhlConnectionWithSecrets): GhlConnection {
  const { accessToken, refreshToken, ...rest } = connection;
  return rest;
}

/** Encrypt or refuse: a token is never written in plaintext. */
function sealed(value: string | null): string | null {
  if (value === null) return null;
  const ciphertext = encryptSecret(value);
  if (!ciphertext.startsWith("enc:v1:")) throw new GhlStoreError("HighLevel connections need encrypted storage, which isn't configured here.", "not_encrypted");
  return ciphertext;
}

function tokenColumns(tokens: GhlTokenWrite): Row {
  return {
    access_token_ciphertext: sealed(tokens.accessToken),
    refresh_token_ciphertext: sealed(tokens.refreshToken),
    token_expires_at: tokens.expiresAt,
    scopes: tokens.scopes.slice(0, 40),
  };
}

export function supabaseGhlConnectionStore(client: Db | null = getSupabase() as unknown as Db | null): GhlConnectionStore {
  const db = () => {
    if (!client) throw new GhlStoreError(UNAVAILABLE, "unavailable");
    return client;
  };
  const check = (error: DbError) => {
    if (error) throw new GhlStoreError(UNAVAILABLE, "unavailable");
  };
  async function readWhere(column: string, value: string) {
    const { data, error } = await db().from("agency_source_connections").select("*").eq("provider", PROVIDER).eq(column, value).maybeSingle();
    check(error);
    return data ? mapConnection(data as Row) : null;
  }
  return {
    read: (workspaceId) => readWhere("workspace_id", workspaceId),
    readByCompany: (companyId) => readWhere("external_account_id", companyId),
    async save({ workspaceId, companyId, connectedBy, tokens }) {
      const holder = await readWhere("external_account_id", companyId);
      if (holder && holder.workspaceId !== workspaceId && holder.status !== "revoked") {
        throw new GhlStoreError("This HighLevel agency is already connected to another Strelva agency.", "company_taken");
      }
      const columns = { ...tokenColumns(tokens), external_account_id: companyId, status: "connected", last_error: null, connected_by: connectedBy };
      const existing = await readWhere("workspace_id", workspaceId);
      if (holder && holder.workspaceId !== workspaceId) {
        // A revoked row from another agency holds no token; removing it releases the company.
        const { error } = await db().from("agency_source_connections").delete().eq("id", holder.id).eq("status", "revoked");
        check(error);
      }
      const result = existing
        ? await db().from("agency_source_connections").update(columns).eq("id", existing.id).select("*").single()
        : await db().from("agency_source_connections").insert({ ...columns, workspace_id: workspaceId, provider: PROVIDER }).select("*").single();
      if (result.error?.code === "23505") throw new GhlStoreError("This HighLevel agency is already connected to another Strelva agency.", "company_taken");
      check(result.error);
      return publicGhlConnection(mapConnection(result.data as Row));
    },
    async updateTokens(id, tokens) {
      const { error } = await db().from("agency_source_connections").update({ ...tokenColumns(tokens), status: "connected", last_error: null }).eq("id", id);
      check(error);
    },
    async markStatus(id, status, lastError) {
      const clear = status === "revoked" ? { access_token_ciphertext: null, refresh_token_ciphertext: null, token_expires_at: null } : {};
      const { error } = await db().from("agency_source_connections").update({ status, last_error: lastError?.slice(0, 500) ?? null, ...clear }).eq("id", id);
      check(error);
    },
    async revokeSaved(id, updatedAt) {
      const { error } = await db().from("agency_source_connections").update({
        status: "revoked", last_error: "Reconnect to record whose account this is.",
        access_token_ciphertext: null, refresh_token_ciphertext: null, token_expires_at: null,
      }).eq("id", id).eq("updated_at", updatedAt).eq("status", "connected");
      check(error);
    },
    async recordEvent(event) {
      const { error } = await db().from("agency_source_events").insert({
        provider: PROVIDER,
        delivery_id: event.deliveryId,
        event_kind: event.kind,
        external_account_id: event.companyId,
        external_ref: event.locationId,
      });
      if (error?.code === "23505") return false;
      check(error);
      return true;
    },
    async eventsSince(companyId, since) {
      if (!GHL_ID.test(companyId)) throw new GhlStoreError(UNAVAILABLE, "unavailable");
      let query = db().from("agency_source_events").select("*").eq("provider", PROVIDER)
        // Future-location installs may omit companyId (AppInstall.md); include them and let the listing decide.
        .or(`external_account_id.eq.${companyId},external_account_id.is.null`);
      if (since) query = query.gte("received_at", since);
      const { data, error } = await query.order("received_at", { ascending: true }).limit(1000);
      check(error);
      return (Array.isArray(data) ? data as Row[] : []).map((row) => ({
        deliveryId: String(row.delivery_id),
        kind: row.event_kind as GhlWebhookEvent["kind"],
        companyId: typeof row.external_account_id === "string" ? row.external_account_id : null,
        locationId: typeof row.external_ref === "string" ? row.external_ref : null,
        receivedAt: String(row.received_at),
      }));
    },
  };
}
