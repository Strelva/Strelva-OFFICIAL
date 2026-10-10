import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext, FullConfig } from "@playwright/test";
import { isAbsolute } from "node:path";
import { z } from "zod";

const reference = z.string().trim().min(1).max(500);
const uuid = z.string().uuid();
const absolutePath = z.string().refine(isAbsolute, "Use an absolute owned proof file path");
const localOrigin = z.string().url().refine(value => {
  const url = new URL(value);
  return ["localhost", "127.0.0.1"].includes(url.hostname) && url.origin === value
    && !url.username && !url.password;
}, "The control plane must be the owned loopback proof app");
const common = z.object({ schemaVersion: z.literal(1), environment: z.literal("nonproduction"),
  authorizationReference: reference, approvedBy: reference, approvedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }), appOrigin: localOrigin,
  ownerAuthStatePath: absolutePath, dispatchJournalDirectory: absolutePath, workspaceId: uuid, ownerUserId: uuid, ownerEmail: z.string().email(),
});
export const homeFinderProofAdmissionSchema = common.extend({ kind: z.literal("home-finder"),
  actions: z.tuple([z.literal("read-licensed-feed"), z.literal("send-one-consented-inquiry")]),
  bindingId: uuid, externalInstallationId: reference, licenseReference: reference,
  clientUrl: z.string().url().refine(value => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; }),
  clientExecutionAuthorization: reference, listingId: reference, searchQuery: z.string().max(160),
  buyer: z.object({ name: z.string().min(1).max(120), email: z.string().email(), consent: z.literal(true), consentReference: reference }).strict(),
  brokerageDeliveryAuthorization: reference, agencyDeliveryAuthorization: reference,
}).strict();
export const sandboxProofAdmissionSchema = common.extend({ kind: z.literal("sandbox-application"),
  actions: z.tuple([z.literal("build-one-candidate"), z.literal("read-native-evidence")]),
  workId: uuid, candidateVersion: z.number().int().positive(), candidateRevision: z.number().int().nonnegative(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), budgetJobId: uuid, maximumCents: z.number().int().min(1).max(1_000_000),
  teamId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), image: z.string().regex(/^[a-zA-Z0-9_./:-]+@sha256:[a-f0-9]{64}$/),
  runtimeQualificationId: uuid, policyVersion: reference, runtimePolicyReference: reference, memoryContractReference: reference, payerAcceptanceReference: reference,
  exactBillingResolverReference: reference,
}).strict();

/** Necessary run inputs, never a substitute for human permission or SQL authority.
 * The closed full-provider runner remains held even when this file is present. */
export function parseProviderProofAdmission<T>(schema: z.ZodType<T>, raw: unknown, now = Date.now()): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("Provider proof held: invalid admission inputs (details withheld).");
  const value = parsed.data;
  const clock = common.pick({ approvedAt: true, expiresAt: true }).parse(value);
  assertProviderApprovalWindow(clock, now);
  return freezeAdmission(value);
}
export function requireProviderProofAdmission<T>(kind: string, schema: z.ZodType<T>): T {
  const path = process.env.STRELVA_PROVIDER_PROOF_ADMISSION;
  if (process.env.PLAYWRIGHT_NO_COPY_PROMPT !== "1" || process.env.STRELVA_PROVIDER_PROOF_CONFIG !== "held-provider-v1")
    throw new Error("Provider proof held: use the isolated redacted provider configuration.");
  if (process.env.STRELVA_AUTHORIZED_PROVIDER_PROOF !== "1" || process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || !path || !isAbsolute(path))
    throw new Error(`Provider proof held: explicit nonproduction ${kind} authorization, existing owner session and scoped admission inputs are required. A profile flag grants no authority.`);
  const value = parseProviderProofAdmission(schema, readPrivateJson(path, 64 * 1024));
  const privateScope = common.pick({ ownerAuthStatePath: true, dispatchJournalDirectory: true }).parse(value);
  assertPrivatePath(privateScope.ownerAuthStatePath, false);
  assertPrivatePath(privateScope.dispatchJournalDirectory, true);
  return value;
}

/** Refuse symlinks, foreign ownership, group/world access and nonregular files. */
export function assertPrivatePath(path: string, directory = false) {
  const stat = lstatSync(path);
  if (!isAbsolute(path) || stat.isSymbolicLink() || stat.uid !== process.getuid?.()
    || (directory ? !stat.isDirectory() || (stat.mode & 0o777) !== 0o700 : !stat.isFile() || (stat.mode & 0o777) !== 0o600))
    throw new Error("Provider proof held: private current-owner regular file/directory required.");
  return stat;
}
export function readPrivateJson(path: string, maximum = 1024 * 1024): unknown {
  const checked = assertPrivatePath(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== checked.dev || opened.ino !== checked.ino || opened.uid !== process.getuid?.()
      || !opened.isFile() || (opened.mode & 0o777) !== 0o600 || opened.size > maximum)
      throw new Error("Provider proof held: private file changed or exceeds its limit.");
    try { return JSON.parse(readFileSync(fd, "utf8")); }
    catch { throw new Error("Provider proof held: invalid private JSON (details withheld)."); }
  } finally { closeSync(fd); }
}

/** Exclusive durable admission before the first effect. Never delete, expire or retry a claim.
 * A crash before dispatch intentionally burns this authorization until operator review. */
export function claimProviderDispatch(scope: { kind: string; authorizationReference: string; dispatchJournalDirectory: string }, target: string) {
  assertPrivatePath(scope.dispatchJournalDirectory, true);
  const key = createHash("sha256").update(JSON.stringify([scope.kind, scope.authorizationReference, target])).digest("hex");
  const path = join(scope.dispatchJournalDirectory, `${key}.jsonl`);
  let fd: number;
  try { fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch { throw new Error("Provider proof held: dispatch claim exists or could not be acquired; operator review required."); }
  const record = (value: { event: "claimed" | "request-observed"; requestId?: string }) => {
    writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd);
  };
  try {
    record({ event: "claimed" });
    const directoryFd = openSync(scope.dispatchJournalDirectory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch { closeSync(fd); throw new Error("Provider proof held: dispatch claim durability could not be confirmed."); }
  return { recordRequest(requestId: string) {
    if (!z.string().uuid().safeParse(requestId).success) throw new Error("Provider proof: request ID unavailable.");
    record({ event: "request-observed", requestId });
  }, close() { closeSync(fd); } };
}

/** Verify the actual loaded cookie session with Auth getUser(), as the app does.
 * No declared identity, decoded JWT, service-role impersonation or refresh writes. */
export async function verifyProviderOwner(context: Pick<BrowserContext, "cookies">, scope: { appOrigin: string; ownerUserId: string; ownerEmail: string }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Provider proof held: owned loopback Auth configuration required.");
  const cookies = await context.cookies(scope.appOrigin);
  const auth = createServerClient(url, key, { auth: { autoRefreshToken: false }, cookies: {
    getAll: () => cookies.map(({ name, value }) => ({ name, value })),
    setAll: () => { throw new Error("Provider proof held: session refresh is outside this run."); },
  } });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user?.email_confirmed_at || data.user.id !== scope.ownerUserId
    || data.user.email?.trim().toLowerCase() !== scope.ownerEmail.trim().toLowerCase())
    throw new Error("Provider proof held: actual verified owner session does not match approved identity.");
}

export function loadProviderOwnerState(path: string) {
  const schema = z.object({ cookies: z.array(z.object({ name: z.string(), value: z.string(), domain: z.string(), path: z.string(),
    expires: z.number(), httpOnly: z.boolean(), secure: z.boolean(), sameSite: z.enum(["Strict", "Lax", "None"]) })),
    origins: z.array(z.object({ origin: z.string(), localStorage: z.array(z.object({ name: z.string(), value: z.string() })) })) });
  const result = schema.safeParse(readPrivateJson(path));
  if (!result.success) throw new Error("Provider proof held: invalid private owner state (details withheld).");
  return result.data;
}

export function assertProviderReporter(config: Pick<FullConfig, "reporter">) {
  if (config.reporter.length !== 1 || !config.reporter[0]?.[0].replaceAll("\\", "/").endsWith("/tests/support/provider-redacted-reporter.ts"))
    throw new Error("Provider proof held: only the isolated redacted reporter is permitted.");
}

function freezeAdmission<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeAdmission(child);
    Object.freeze(value);
  }
  return value;
}
export function assertProviderApprovalWindow(scope: { approvedAt: string; expiresAt: string }, now = Date.now()) {
  const approved = Date.parse(scope.approvedAt), expires = Date.parse(scope.expiresAt);
  if (!Number.isFinite(approved) || !Number.isFinite(expires) || approved > now || expires <= now || expires <= approved)
    throw new Error("Provider proof is held: approval is expired or not current.");
}

/** Read current direct customer-owner authority through the real app session.
 * The business route binds actual actor ID; policy GET restricts to direct
 * customer members and returns the freshly read role. No fixture/service actor.
 * This harness intentionally refuses agency-only/admin/provider-seat scopes. */
export async function verifyProviderWorkspaceOwner(context: Pick<BrowserContext, "cookies"> & { request: Pick<BrowserContext["request"], "get"> },
  scope: { appOrigin: string; workspaceId: string; ownerUserId: string; ownerEmail: string }) {
  await verifyProviderOwner(context, scope);
  const options = { headers: { "cache-control": "no-cache" }, maxRetries: 0, maxRedirects: 0 };
  const businessResponse = await context.request.get("/api/workspace/businesses", options);
  if (businessResponse.status() !== 200) throw new Error("Provider proof held: current business actor unavailable.");
  const business = z.object({ actorId: z.string().uuid(), businesses: z.array(z.object({ id: z.string().uuid() }).passthrough()) }).safeParse(await businessResponse.json());
  if (!business.success || business.data.actorId !== scope.ownerUserId || !business.data.businesses.some(row => row.id === scope.workspaceId))
    throw new Error("Provider proof held: current app actor/business does not match approved owner scope.");
  const policyResponse = await context.request.get(`/api/workspace/needs-you/policy?workspaceId=${scope.workspaceId}`, options);
  if (policyResponse.status() !== 200 || !z.object({ role: z.literal("owner") }).passthrough().safeParse(await policyResponse.json()).success)
    throw new Error("Provider proof held: current direct business-owner authority required.");
}
