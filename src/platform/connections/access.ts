import { z } from "zod";
import type { ConnectionProvider, ProviderAccess } from "./contracts";

/** Explicit malformed configuration always fails closed, including for non-Google providers. */
export function readProviderAccess(provider: ConnectionProvider, env: Readonly<Record<string, string | undefined>> = process.env): ProviderAccess {
  const suffix = provider.toUpperCase();
  const raw = env[`STRELVA_CONNECTION_ACCESS_${suffix}`];
  const approval = env[`STRELVA_CONNECTION_APPROVAL_${suffix}`];
  let through: ProviderAccess["through"] = { kind: "unknown" };
  if (raw === undefined) through = provider === "google_business_profile" ? { kind: "unknown" } : { kind: "platform" };
  else if (raw === "platform") through = { kind: "platform" };
  else if (raw.startsWith("agency:") && z.string().uuid().safeParse(raw.slice(7)).success) through = { kind: "agency", workspaceId: raw.slice(7) };
  const fallback = provider === "google_business_profile" ? "none" : "not_required";
  return { provider, through, approval: approval === undefined ? fallback :
    approval === "approved" || approval === "pending" || approval === "not_required" || approval === "none" ? approval : "none" };
}
