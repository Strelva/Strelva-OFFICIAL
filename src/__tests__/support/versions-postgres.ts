import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  type ConnectionOwnership,
  type SystemRef,
  type VersionActor,
  type VersionStore,
} from "@/platform/system-versions";
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
  connections: ConnectionOwnership;
  business(name: string, kind?: "customer" | "agency"): Promise<string>;
  actor(memberships: Array<{ businessId: string; role: Role }>): Promise<VersionActor>;
  system(businessId: string, name: string): Promise<SystemRef>;
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
    p_expected_row_revision: "bigint", p_input: "jsonb", p_command_id: "uuid", p_command_digest: "text",
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
  return {
    db,
    store: createSupabaseVersionStore(db),
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
    async system(businessId, name) {
      const id = randomUUID();
      db.query(`insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by)
        values ('${id}', '${businessId}', '${name.replaceAll("'", "''")}', 'inquiry', '${randomUUID()}', repeat('a', 64), '${creator}', '${creator}');`);
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

