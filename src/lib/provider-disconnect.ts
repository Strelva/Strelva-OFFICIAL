import type { Connection, IntegrationProvider } from "./types";
import { deleteConnection, getConnection } from "./connections";
import { workspacePorts } from "./workspace-ports";
import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { revokeProviderAuthorization, type ProviderRevocationResult, type RevocationOutcome } from "@/platform/infra/provider-revocation";

export interface ProviderDisconnectReceipt {
  id: string;
  provider: IntegrationProvider;
  revocationOutcome: RevocationOutcome;
  revocationErrorCode: string | null;
  localCleanupStatus: "complete" | "partial";
  clearedStores: string[];
}

export interface ProviderDisconnectInput {
  tenantId: string;
  provider: IntegrationProvider;
  actorUserId?: string | null;
}

type GoogleBindingTokens = { accessToken?: string | null; refreshToken?: string | null };
type ReadGoogleBindingResult = { bindings: GoogleBindingTokens[]; error: boolean };

export interface ProviderDisconnectDependencies {
  readConnection(tenantId: string, provider: IntegrationProvider): Promise<Connection | null>;
  deleteConnection(tenantId: string, provider: IntegrationProvider): Promise<boolean | void>;
  clearTenantConfigCache(): Promise<boolean>;
  readGoogleBindings(tenantId: string): Promise<ReadGoogleBindingResult>;
  revoke(provider: IntegrationProvider, token?: string | null): Promise<ProviderRevocationResult>;
  record(input: {
    tenantId: string;
    provider: IntegrationProvider;
    actorUserId: string | null;
    revocationOutcome: RevocationOutcome;
    revocationErrorCode: string | null;
    localCleanupStatus: "complete" | "partial";
    clearedStores: string[];
  }): Promise<ProviderDisconnectReceipt>;
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readBindingTokens(tenantId: string): Promise<ReadGoogleBindingResult> {
  const store = await workspacePorts().googleBindings();
  const bindings: GoogleBindingTokens[] = [];
  let error = false;
  const read = async (scope: string) => {
    try {
      const binding = await store.readGoogleBindingForTenant(scope);
      if (!binding) return;
      const tokens: GoogleBindingTokens = {};
      try { tokens.accessToken = decryptSecret(binding.accessTokenCiphertext); } catch { error = true; }
      try { tokens.refreshToken = decryptSecret(binding.refreshTokenCiphertext); } catch { error = true; }
      bindings.push(tokens);
    } catch {
      error = true;
    }
  };

  // The legacy tenant grant and the native business grant are independent
  // stores. Read both before the receipt port clears either one.
  await read(tenantId);
  try {
    const target = await store.readBindingTarget(tenantId);
    if (target) await read(workspacePublishingScope(target.workspaceId));
  } catch {
    error = true;
  }
  return { bindings, error };
}

async function recordProviderDisconnect(input: Parameters<ProviderDisconnectDependencies["record"]>[0]): Promise<ProviderDisconnectReceipt> {
  const store = await workspacePorts().providerDisconnect();
  return store.recordTenantProviderDisconnect(input);
}

async function clearTenantConfigCache(): Promise<boolean> {
  try {
    const tenantStore = await import("./tenants");
    return await tenantStore.invalidateTenantConfigCache();
  } catch {
    return false;
  }
}

const defaultDependencies: ProviderDisconnectDependencies = {
  readConnection: getConnection,
  deleteConnection,
  clearTenantConfigCache,
  readGoogleBindings: readBindingTokens,
  revoke: revokeProviderAuthorization,
  record: recordProviderDisconnect,
};

async function attemptRevocation(
  dependencies: ProviderDisconnectDependencies,
  provider: IntegrationProvider,
  token?: string | null,
): Promise<ProviderRevocationResult> {
  try {
    return await dependencies.revoke(provider, token);
  } catch {
    // Keep disconnect resilient even if the adapter fails before its bounded
    // HTTP request handler can normalize the error.
    return { outcome: "failed", errorCode: "request_failed" };
  }
}

function summarizeRevocation(results: ProviderRevocationResult[], readError: boolean): ProviderRevocationResult {
  const outcomes = results.map((result) => result.outcome);
  const failures = results.filter((result) => result.outcome === "failed");
  const successes = results.some((result) => result.outcome === "revoked" || result.outcome === "already_revoked");
  const errorCode = failures.find((result) => result.errorCode)?.errorCode ?? (readError ? "credential_read_failed" : null);
  if (readError) return { outcome: successes ? "partial_failure" : "failed", errorCode };
  if (!results.length) return { outcome: "no_token", errorCode: null };
  if (failures.length) return { outcome: successes ? "partial_failure" : "failed", errorCode };
  if (outcomes.every((outcome) => outcome === "already_revoked")) return { outcome: "already_revoked", errorCode: null };
  return results[0] ?? { outcome: "no_token", errorCode: null };
}

/**
 * Disconnect one tenant-owned provider. Provider calls are bounded and
 * best-effort; local credential deletion and the receipt are attempted even
 * when the provider does not revoke successfully.
 */
export async function disconnectTenantProvider(
  input: ProviderDisconnectInput,
  dependencies: ProviderDisconnectDependencies = defaultDependencies,
): Promise<ProviderDisconnectReceipt> {
  let connectionReadError = false;
  const connection = await dependencies.readConnection(input.tenantId, input.provider).catch(() => {
    connectionReadError = true;
    return null;
  });
  const googleBindings = input.provider === "google"
    ? await dependencies.readGoogleBindings(input.tenantId).catch(() => ({ bindings: [], error: true }))
    : { bindings: [], error: false };

  const tokens = new Set<string>();
  if (input.provider === "google") {
    const redisToken = connection?.refreshToken || connection?.accessToken;
    if (redisToken) tokens.add(redisToken);
    for (const binding of googleBindings.bindings) {
      const bindingToken = binding.refreshToken || binding.accessToken;
      if (bindingToken) tokens.add(bindingToken);
    }
  } else if (connection) {
    const token = connection.refreshToken || connection.accessToken;
    if (token) tokens.add(token);
  }

  const revocations = input.provider === "yelp" || input.provider === "vegaro"
    ? [await attemptRevocation(dependencies, input.provider)]
    : input.provider === "google" && googleBindings.error
      ? await Promise.all([...tokens].map((token) => attemptRevocation(dependencies, input.provider, token))).then((results) => results.length ? results : [{ outcome: "failed" as const, errorCode: "credential_read_failed" }])
      : input.provider === "google"
        ? await Promise.all([...tokens].map((token) => attemptRevocation(dependencies, input.provider, token)))
        : input.provider === "calendly" || input.provider === "instagram"
          ? tokens.size
            ? await Promise.all([...tokens].map((token) => attemptRevocation(dependencies, input.provider, token)))
            : [await attemptRevocation(dependencies, input.provider, null)]
          : [];
  const revocation = summarizeRevocation(
    revocations,
    (input.provider === "google" && (connectionReadError || googleBindings.error))
      || (input.provider === "calendly" && connectionReadError),
  );

  let redisCleared = false;
  try {
    redisCleared = (await dependencies.deleteConnection(input.tenantId, input.provider)) !== false;
  } catch {
    redisCleared = false;
  }
  let tenantCacheCleared = true;
  if (input.provider === "instagram") {
    try {
      tenantCacheCleared = await dependencies.clearTenantConfigCache();
    } catch {
      tenantCacheCleared = false;
    }
  }
  const clearedStores = redisCleared ? [`redis_connection:${input.provider}`] : [];
  if (input.provider === "instagram" && tenantCacheCleared) clearedStores.push("tenant_config_cache");
  const localCleanupStatus = redisCleared && tenantCacheCleared ? "complete" : "partial";

  const receipt = await dependencies.record({
    tenantId: input.tenantId,
    provider: input.provider,
    actorUserId: isUuid(input.actorUserId) ? input.actorUserId : null,
    revocationOutcome: revocation.outcome,
    revocationErrorCode: revocation.errorCode,
    localCleanupStatus,
    clearedStores,
  });
  // The first invalidation prevents stale reads from serving the legacy token;
  // clear again after the transactional tenant-row update to close the race.
  if (input.provider === "instagram") {
    await dependencies.clearTenantConfigCache().catch(() => false);
  }
  return receipt;
}
