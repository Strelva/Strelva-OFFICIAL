import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  type ConnectionOwnership,
  type SystemRef,
  type VersionActor,
  type VersionLineage,
  type VersionStore,
} from "@/platform/system-versions";
import { createApplicationDraft } from "@/products/applications/server";
import {
  createSupabaseConnectionOwnership,
  createSupabaseVersionStore,
  readVersionActor,
  type VersionsDb,
} from "@/platform/system-versions/supabase-store";

/**
 * Fixtures for the Version store contract: the in-memory reference, and the
 * Postgres store over psql against a throwaway local cluster
 * (STRELVA_VERSIONS_PSQL, set only by scripts/check-workspace-sql.sh).
 * Fictional rows only. Nothing here can reach a remote database.
 */
export type Role = "owner" | "admin" | "member";
export interface Harness {
  store: VersionStore;
  /** Native creation goes through the real atomic artifact command. */
  nativeStore?: VersionStore;
  /** Fictional business owner selects the agency and its builder is staffed. */
  authorizeNativeBuilder?(agencyId: string, businessId: string, builder: VersionActor, owner: VersionActor): Promise<void>;
  /** Open, record and claim the exact owner decision, without bypassing release checks. */
  approveRelease?(actor: VersionActor, lineage: VersionLineage): Promise<void>;
  connections: ConnectionOwnership;
  business(name: string, kind?: "customer" | "agency"): Promise<string>;
  actor(memberships: Array<{ businessId: string; role: Role }>): Promise<VersionActor>;
  system(businessId: string, name: string, kind?: "inquiry" | "internal_app"): Promise<SystemRef>;
  /** A live account owned by a business, as the store names it. */
  connection(businessId: string, provider: "google" | "outlook"): Promise<string>;
  /** Postgres only: the raw RPC client, for server reads under test. */
  db?: VersionsDb;
  /** Postgres only: the spine's revisions on a System. */
  spineRevisions?(systemId: string): Promise<Array<{ number: number; kind: string }>>;
  currentRevision?(systemId: string): Promise<number | null>;
}

export function memoryHarness(): Harness {
  const connections = createInMemoryConnectionOwnership();
  return {
    store: createInMemoryVersionStore(),
    connections,
    business: async () => randomUUID(),
    actor: async (memberships) => ({ userId: randomUUID(), verifiedEmail: `${randomUUID().slice(0, 8)}@example.test`, memberships }),
    system: async (businessId) => ({ businessId, systemId: randomUUID() }),
    async connection(businessId) {
      const id = `calendar:${randomUUID()}`;
      connections.register(id, businessId);
      return id;
    },
  };
}

/** RPCs through psql, as service_role, against an isolated local cluster. */
export function psqlDb(connection: string): VersionsDb & { query(sql: string): string } {
  const base = [...connection.split(" ").filter(Boolean), "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const types: Record<string, string> = {
    p_workspace_id: "uuid", p_user_id: "uuid", p_verified_email: "text", p_system_id: "uuid", p_number: "integer",
    p_shared_with: "uuid[]", p_revision: "jsonb", p_version_id: "uuid", p_connection_ref: "text", p_lineage: "jsonb",
    p_expected_change: "bigint", p_activate: "boolean", p_to: "text", p_limit: "integer",
    p_expected_row_revision: "bigint", p_input: "jsonb", p_command_id: "uuid", p_command_digest: "text",
    p_agency_workspace_id: "uuid", p_staff_user_id: "uuid", p_active: "boolean",
    p_name: "text", p_kind: "text", p_native_payload: "jsonb", p_item: "jsonb", p_row_revision: "bigint",
    p_owner_decision_id: "uuid", p_decision_id: "uuid", p_revision_hash: "text", p_decision: "text", p_by_kind: "text", p_recipient: "text",
  };
  const literal = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string")
    ? `{${value.join(",")}}`
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  return {
    query(sql) { return execFileSync("psql", base, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); },
    async rpc(name, args) {
      const keys = Object.keys(args);
      const vars = keys.flatMap((key, i) => args[key] === null || args[key] === undefined ? [] : ["-v", `a${i}=${literal(args[key])}`]);
      const params = keys.map((key, i) => args[key] === null || args[key] === undefined
        ? `${key} => null::${types[key]}` : `${key} => :'a${i}'::${types[key]}`).join(", ");
      try {
        const out = execFileSync("psql", [...base, ...vars], {
          input: `set role service_role;\nselect coalesce(to_jsonb(public.${name}(${params})), 'null'::jsonb);\n`,
          encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
        });
        return { data: JSON.parse(out.trim()), error: null };
      } catch (error) {
        return { data: null, error: { message: String((error as { stderr?: string }).stderr ?? error) } };
      }
    },
  };
}

export function postgresHarness(connection: string): Harness {
  const db = psqlDb(connection);
  const creator = randomUUID();
  db.query(`insert into public.users(id, email, verified_at) values ('${creator}', 'creator-${creator.slice(0, 8)}@example.test', now());`);
  const nativeDb: VersionsDb = { rpc(name, args) {
    if (name !== "create_system_version") return db.rpc(name, args);
    const lineage = args.p_lineage as VersionLineage;
    const { kind: _kind, declaration: _declaration, ...definition } = lineage.baseline.definition;
    const actor = { userId: args.p_user_id as string, verifiedEmail: args.p_verified_email as string };
    const payload = createApplicationDraft({ ...definition, maintenanceOwner: actor.userId }, actor);
    return db.rpc("create_version_system_command", { ...args, p_name: definition.title, p_kind: "internal_app",
      p_command_id: lineage.version.systemId, p_native_payload: payload });
  } };
  return {
    db,
    store: createSupabaseVersionStore(db),
    nativeStore: createSupabaseVersionStore(nativeDb),
    async authorizeNativeBuilder(agencyId, businessId, builder, owner) {
      const chosen = await db.rpc("choose_business_provider", { p_workspace_id: businessId, p_agency_workspace_id: agencyId,
        p_user_id: owner.userId, p_verified_email: owner.verifiedEmail });
      if (chosen.error) throw new Error(chosen.error.message);
      const staffed = await db.rpc("set_agency_client_staff", { p_workspace_id: businessId, p_agency_workspace_id: agencyId,
        p_user_id: builder.userId, p_verified_email: builder.verifiedEmail, p_staff_user_id: builder.userId, p_active: true });
      if (staffed.error) throw new Error(staffed.error.message);
    },
    async approveRelease(actor, lineage) {
      const revisionHash = createHash("sha256").update(JSON.stringify(["version_release", lineage.id, lineage.rowRevision])).digest("hex");
      const opened = await db.rpc("open_owner_decision", { p_workspace_id: lineage.version.businessId, p_item: {
        kind: "system.change_live", route: "owner_decides", systemId: lineage.version.systemId,
        title: "Put intake live", approveEffect: "The runtime changes", notYetEffect: "Nothing changes",
        sourceLifecycle: "version_release", sourceId: lineage.id, revisionHash, adminMayDecide: false,
      } });
      if (opened.error) throw new Error(opened.error.message);
      const decisionId = (opened.data as { id: string }).id;
      const prepared = await db.rpc("record_version_preparation", { p_workspace_id: lineage.version.businessId,
        p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_version_id: lineage.id,
        p_row_revision: lineage.rowRevision, p_owner_decision_id: decisionId });
      if (prepared.error) throw new Error(prepared.error.message);
      const claimed = await db.rpc("claim_owner_decision", { p_workspace_id: lineage.version.businessId, p_decision_id: decisionId,
        p_revision_hash: revisionHash, p_decision: "approve", p_by_kind: "session", p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail, p_recipient: null });
      if (claimed.error) throw new Error(claimed.error.message);
    },
    connections: createSupabaseConnectionOwnership(db),
    async business(name, kind = "customer") {
      const id = randomUUID();
      db.query(`insert into public.workspaces(id, kind, name, created_by) values ('${id}', '${kind}', '${name.replaceAll("'", "''")}', '${creator}');`);
      return id;
    },
    async actor(memberships) {
      const userId = randomUUID();
      const email = `v-${userId.slice(0, 8)}@example.test`;
      db.query(`insert into public.users(id, email, verified_at) values ('${userId}', '${email}', now());`
        + memberships.map((item) => `insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values ('${item.businessId}', '${userId}', '${item.role}', '${creator}');`).join(""));
      // The real actor port, read back from the database.
      return readVersionActor({ userId, verifiedEmail: email }, db);
    },
    async system(businessId, name, kind = "inquiry") {
      const id = randomUUID();
      db.query(`insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by)
        values ('${id}', '${businessId}', '${name.replaceAll("'", "''")}', '${kind}', '${randomUUID()}', repeat('a', 64), '${creator}', '${creator}');`);
      return { businessId, systemId: id };
    },
    async connection(businessId, provider) {
      const id = randomUUID();
      db.query(`insert into public.workspace_calendar_connections(id, workspace_id, provider, calendar_id, calendar_name, time_zone, status, created_by)
        values ('${id}', '${businessId}', '${provider}', 'primary', 'Bookings', 'America/New_York', 'connected', '${creator}');`);
      return `calendar:${id}`;
    },
    async spineRevisions(systemId) {
      const out = db.query(`select coalesce(json_agg(json_build_object('number', number, 'kind', implementation->>'kind') order by number), '[]') from public.system_revisions where system_id = '${systemId}';`);
      return JSON.parse(out) as Array<{ number: number; kind: string }>;
    },
    async currentRevision(systemId) {
      const out = db.query(`select coalesce(current_revision_number::text, '') from public.systems where id = '${systemId}';`);
      return out ? Number(out) : null;
    },
  };
}

