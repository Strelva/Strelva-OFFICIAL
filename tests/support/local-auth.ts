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
