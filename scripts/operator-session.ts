import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import type { WorkspaceActor } from "../src/platform/workspaces/types";
import type { OperatorAuditContext } from "../src/platform/workspaces/operator-approvals";

export interface OperatorSession extends WorkspaceActor {
  /** Verified `auth_time` claim, in Unix seconds. */
  authTime: number | null;
  auditContext: OperatorAuditContext;
}

/** Resolve the CLI actor from a signed Supabase session token; never accept an email/name flag. */
export async function readOperatorSessionFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OperatorSession> {
  const token = env.STRELVA_OPERATOR_SESSION_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Set STRELVA_OPERATOR_SESSION_ACCESS_TOKEN from your signed-in Strelva session.");
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and a public Supabase key are required to verify the signed-in operator.");

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const [{ data: userResult, error: userError }, { data: claimsResult, error: claimsError }] = await Promise.all([
    client.auth.getUser(token),
    client.auth.getClaims(token),
  ]);
  const user = userResult.user;
  const claims = claimsResult?.claims;
  if (userError || claimsError || !user || !user.email || !user.email_confirmed_at
    || claims?.sub !== user.id) {
    throw new Error("A verified signed-in Strelva operator session is required.");
  }
  const email = user.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The signed-in operator has no verified email address.");
  const rawAuthTime = claims.auth_time;
  const authTime = typeof rawAuthTime === "number" && Number.isFinite(rawAuthTime) ? rawAuthTime : null;
  const osUser = env.USER?.trim() || env.LOGNAME?.trim() || `uid:${process.getuid?.() ?? "unknown"}`;
  return {
    userId: user.id,
    verifiedEmail: email,
    authTime,
    auditContext: { source: "cli", osUser: osUser.slice(0, 120), machine: hostname().slice(0, 200) },
  };
}
