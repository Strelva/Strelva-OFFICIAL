/** Real sign-in and refresh proof against disposable loopback Supabase only. */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readOperatorSessionFromEnv } from "./operator-session";
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (new URL(url).hostname !== "127.0.0.1") throw new Error("Loopback only");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const user = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const email = `local-501-freshness-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Local user failed");
  try {
    const first = await user.auth.signInWithPassword({ email, password });
    if (first.error || !first.data.session) throw new Error("Local sign-in failed");
    const claims = await user.auth.getClaims(first.data.session.access_token);
    const context = await readOperatorSessionFromEnv({ ...process.env, STRELVA_OPERATOR_SESSION_ACCESS_TOKEN: first.data.session.access_token });
    if (context.authTime === null) throw new Error("Fresh password authentication was not recognized");
    await new Promise(resolve => setTimeout(resolve, 1200));
    const refreshed = await user.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) throw new Error("Local refresh failed");
    const nextClaims = await user.auth.getClaims(refreshed.data.session.access_token);
    const next = await readOperatorSessionFromEnv({ ...process.env, STRELVA_OPERATOR_SESSION_ACCESS_TOKEN: refreshed.data.session.access_token });
    if (next.authTime !== context.authTime) throw new Error("Refresh reset authentication freshness");
    if (!(Number(nextClaims.data?.claims.iat) > Number(claims.data?.claims.iat))) throw new Error("Refresh did not issue a newer token");
    console.log(JSON.stringify({ proof: "real local Auth sign-in and refresh", firstAuthTime: context.authTime, refreshedAuthTime: next.authTime, tokenIssuedLater: true, oidcAuthTimeAbsent: claims.data?.claims.auth_time === undefined, method: claims.data?.claims.amr?.[0] }, null, 2));
  } finally { await admin.auth.admin.deleteUser(created.data.user.id); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
