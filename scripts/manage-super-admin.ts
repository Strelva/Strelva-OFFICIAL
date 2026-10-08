#!/usr/bin/env tsx
/**
 * Manage super-admin access through the audited database functions.
 *
 * Usage:
 *   pnpm exec tsx scripts/manage-super-admin.ts grant person@example.com \
 *     --actor operator@example.com --reason "On-call coverage" --apply
 *   pnpm exec tsx scripts/manage-super-admin.ts revoke person@example.com \
 *     --actor operator@example.com --reason "Role ended" --apply
 *   pnpm exec tsx scripts/manage-super-admin.ts bootstrap first@example.com \
 *     --reason "Initial operator for local preview" --apply
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Bootstrap is break-glass:
 * it works only when zero active super-admins exist and requires a verified target.
 * The target is recorded as the bootstrap actor. --apply is mandatory.
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Action = "grant" | "revoke" | "bootstrap";

export type ParsedArgs = {
  action: Action;
  targetEmail: string;
  actorEmail: string;
  reason: string;
  apply: boolean;
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function usage(): string {
  return [
    "Usage:",
    "  pnpm exec tsx scripts/manage-super-admin.ts grant <email> --actor <active-operator-email> --reason <reason> --apply",
    "  pnpm exec tsx scripts/manage-super-admin.ts revoke <email> --actor <active-operator-email> --reason <reason> --apply",
    "  pnpm exec tsx scripts/manage-super-admin.ts bootstrap <email> --reason <reason> --apply",
    "Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    "Bootstrap is break-glass and succeeds only when zero active super-admins exist.",
    "Every target must have a verified email; bootstrap records the target as its actor.",
  ].join("\n");
}

export function parseArgs(args: string[]): ParsedArgs | null {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return null;
  const [rawAction, targetEmail, ...options] = args;
  if (rawAction !== "grant" && rawAction !== "revoke" && rawAction !== "bootstrap") {
    throw new Error(usage());
  }
  if (!targetEmail || !isEmail(targetEmail)) throw new Error(usage());

  let actorEmail = "";
  let reason = "";
  let apply = false;
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (option === "--apply") {
      apply = true;
    } else if (option === "--actor" && options[i + 1]) {
      actorEmail = options[++i]!;
    } else if (option === "--reason" && options[i + 1]) {
      reason = options[++i]!;
    } else {
      throw new Error(`Unknown or incomplete option: ${option}\n${usage()}`);
    }
  }
  if (rawAction !== "bootstrap" && !isEmail(actorEmail)) throw new Error(usage());
  if (rawAction === "bootstrap" && actorEmail) {
    throw new Error(`Bootstrap records its target as the actor; omit --actor.\n${usage()}`);
  }
  if (reason.trim().length < 3 || reason.trim().length > 500) {
    throw new Error("Reason must contain 3 to 500 characters.");
  }
  if (rawAction === "grant" && targetEmail.toLowerCase() === actorEmail.toLowerCase()) {
    throw new Error("An operator cannot grant super-admin access to themselves.");
  }
  if (rawAction === "revoke" && targetEmail.toLowerCase() === actorEmail.toLowerCase()) {
    throw new Error("An operator cannot revoke their own super-admin access.");
  }
  return { action: rawAction, targetEmail, actorEmail, reason: reason.trim(), apply };
}

function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function runManageSuperAdmin(parsed: ParsedArgs): Promise<void> {
  if (!parsed.apply) {
    throw new Error(`No access change was made. Review the command and add --apply to call ${parsed.action === "bootstrap" ? "bootstrap_super_admin" : `${parsed.action}_super_admin`}.`);
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const lookupVerifiedUser = async (email: string): Promise<{ id: string; email: string }> => {
    const { data, error } = await client
      .from("users")
      .select("id,email,verified_at")
      .ilike("email", escapeIlikeLiteral(email.trim()))
      .limit(2);
    if (error) throw new Error(`Could not resolve ${email}: ${error.message}`);
    if (!data || data.length !== 1) throw new Error(`Expected one account for ${email}; found ${data?.length ?? 0}.`);
    const user = data[0] as { id: string; email: string; verified_at: string | null };
    if (!user.verified_at) {
      throw new Error(`${email} must complete Supabase email verification and have a provisioned verified user row before receiving super-admin access.`);
    }
    return user;
  };

  const target = await lookupVerifiedUser(parsed.targetEmail);
  let rpcName: string;
  let rpcArgs: Record<string, string>;
  if (parsed.action === "bootstrap") {
    rpcName = "bootstrap_super_admin";
    rpcArgs = { p_user_id: target.id, p_reason: parsed.reason };
  } else {
    const actor = await lookupVerifiedUser(parsed.actorEmail);
    rpcName = parsed.action === "grant" ? "grant_super_admin" : "revoke_super_admin";
    rpcArgs = {
      p_user_id: target.id,
      p_reason: parsed.reason,
      p_actor_user_id: actor.id,
    };
  }

  const { error } = await client.rpc(rpcName, rpcArgs);
  if (error) throw new Error(`The database refused the ${parsed.action}: ${error.message}`);
  process.stdout.write(`${parsed.action === "grant" ? "Granted" : parsed.action === "revoke" ? "Revoked" : "Bootstrapped"} super-admin access for ${target.email}.\n`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(args);
  if (!parsed) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  await runManageSuperAdmin(parsed);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
