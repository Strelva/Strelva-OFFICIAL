import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Browser, BrowserContext } from "@playwright/test";

export function localEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const app = process.env.PLAYWRIGHT_BASE_URL || "";
  for (const value of [url, app]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname)) throw new Error("This proof only permits loopback services.");
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!anon || !service) throw new Error("The isolated local keys are required.");
  return { url, app, anon, service };
}

function localSql(sql: string): string {
  const dbUrl = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!dbUrl || !["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname)) {
    throw new Error("Set STRELVA_LOCAL_DB_URL to the disposable loopback database for operator fixtures.");
  }
  return execFileSync("psql", [dbUrl, "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
}

const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Seed authority only in an explicitly configured, loopback test database. */
export function seedLocalSuperAdmin(userId: string, email: string): void {
  localSql(`insert into public.super_admins(user_id, email) values (${sqlLiteral(userId)}::uuid, ${sqlLiteral(email)}) on conflict (user_id) do nothing;`);
}

/** Remove a test fixture row from the disposable database during teardown. */
export function removeLocalSuperAdmin(userId: string): void {
  localSql(`delete from public.super_admins where user_id = ${sqlLiteral(userId)}::uuid;`);
}

/**
 * Native-tool fixtures explicitly give their builder a second, agency role.
 * Customer ownership and super-admin status alone never grant make_systems.
 * This is synthetic authority in the disposable database, not owner self-service.
 */
export function seedLocalNativeMaker(workspaceId: string, userId: string): () => void {
  const agencyId = randomUUID();
  const workspace = `${sqlLiteral(workspaceId)}::uuid`;
  const user = `${sqlLiteral(userId)}::uuid`;
  const agency = `${sqlLiteral(agencyId)}::uuid`;
  const authority = localSql(`select public.workspace_make_systems_authority(${workspace}, ${user});`);
  if (authority !== "member") throw new Error("The native fixture must start as an ordinary customer member.");
  localSql(`begin;
    insert into public.workspaces(id, kind, name, created_by) values (${agency}, 'agency', 'Local native-tool maker', ${user});
    insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (${agency}, ${user}, 'owner', ${user});
    insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values (${workspace}, ${agency}, 'owner', ${user});
    insert into public.agency_client_staff(customer_workspace_id, agency_workspace_id, user_id, assigned_by) values (${workspace}, ${agency}, ${user}, ${user});
    commit;`);
  if (localSql(`select public.workspace_make_systems_authority(${workspace}, ${user});`) !== "provider") {
    throw new Error("The explicit staffed provider seat did not grant maker authority.");
  }
  return () => { localSql(`delete from public.workspaces where id = ${agency};`); };
}

export async function signedInContext(browser: Browser, admin: Pick<SupabaseClient, "auth">, role: string) {
  const env = localEnvironment();
  const email = `local-${role}-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create the isolated local test identity.");
  const context = await browser.newContext({ baseURL: env.app });
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [];
  const auth = createServerClient(env.url, env.anon, { cookies: {
    getAll: () => [],
    setAll: (values) => {
      for (const cookie of values) cookies.push({ name: cookie.name, value: cookie.value, domain: new URL(env.app).hostname, path: cookie.options.path || "/", httpOnly: Boolean(cookie.options.httpOnly), secure: false, sameSite: "Lax" });
    },
  } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("The real local Auth service rejected the test sign-in.");
  await context.addCookies(cookies);
  return { context, userId: created.data.user.id, email };
}
