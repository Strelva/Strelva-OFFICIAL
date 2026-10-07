#!/usr/bin/env tsx
/**
 * Grant or revoke super-admin access through the audited database functions.
 *
 * Usage:
 *   pnpm exec tsx scripts/manage-super-admin.ts grant person@example.com \
 *     --actor operator@example.com --reason "On-call coverage" --apply
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The --apply flag is
 * mandatory so an incomplete or copied command cannot change access by itself.
 */
import { createClient } from "@supabase/supabase-js";

type Action = "grant" | "revoke";

type ParsedArgs = {
  action: Action;
  targetEmail: string;
  actorEmail: string;
  reason: string;
  apply: boolean;
};

function usage(): string {
  return [
    "Usage: pnpm exec tsx scripts/manage-super-admin.ts <grant|revoke> <email>",
    "  --actor <operator-email> --reason <recorded-reason> [--apply]",
    "Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  ].join("\n");
}

function parseArgs(args: string[]): ParsedArgs | null {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return null;
  const [rawAction, targetEmail, ...options] = args;
  if (rawAction !== "grant" && rawAction !== "revoke") throw new Error(usage());
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) throw new Error(usage());

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail)) throw new Error(usage());
  if (reason.trim().length < 3 || reason.trim().length > 500) throw new Error("Reason must contain 3 to 500 characters.");
  if (rawAction === "grant" && targetEmail.toLowerCase() === actorEmail.toLowerCase()) {
    throw new Error("An operator cannot grant super-admin access to themselves.");
  }
  return { action: rawAction, targetEmail, actorEmail, reason: reason.trim(), apply };
}

function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!parsed.apply) {
    throw new Error(`No access change was made. Review the command and add --apply to call ${parsed.action}_super_admin.`);
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const lookupUserId = async (email: string): Promise<{ id: string; email: string }> => {
    const { data, error } = await client
      .from("users")
      .select("id,email")
      .ilike("email", escapeIlikeLiteral(email.trim()))
      .limit(2);
    if (error) throw new Error(`Could not resolve ${email}: ${error.message}`);
    if (!data || data.length !== 1) throw new Error(`Expected one account for ${email}; found ${data?.length ?? 0}.`);
    return data[0]!;
  };
  const [target, actor] = await Promise.all([
    lookupUserId(parsed.targetEmail),
    lookupUserId(parsed.actorEmail),
  ]);
  const { error } = await client.rpc(
    parsed.action === "grant" ? "grant_super_admin" : "revoke_super_admin",
    {
      p_user_id: target.id,
      p_reason: parsed.reason,
      p_actor_user_id: actor.id,
    },
  );
  if (error) throw new Error(`The database refused the ${parsed.action}: ${error.message}`);
  process.stdout.write(`${parsed.action === "grant" ? "Granted" : "Revoked"} super-admin access for ${target.email}.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
