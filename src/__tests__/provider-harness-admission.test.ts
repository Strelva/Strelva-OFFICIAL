import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync, readFileSync, readdirSync as requireFiles } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPrivatePath, readPrivateJson, claimProviderDispatch, assertProviderReporter, verifyProviderOwner, verifyProviderWorkspaceOwner, assertProviderApprovalWindow, sandboxProofAdmissionSchema, parseProviderProofAdmission, requireProviderProofAdmission } from "../../tests/support/provider-harness-admission";
import { journeyProfile, preflight } from "../../scripts/full-model-journey-profile.mjs";
const authMock = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: authMock.create }));
const now = Date.parse("2026-10-08T23:00:00Z");
const id = "27417000-0000-4000-8000-000000000001";
const admission = { schemaVersion: 1, environment: "nonproduction", authorizationReference: "Fictional schema test only",
  approvedBy: "Fictional schema validator", approvedAt: "2026-10-08T22:00:00Z", expiresAt: "2026-10-08T23:30:00Z",
  appOrigin: "http://localhost:50354", ownerAuthStatePath: "/owned-proof/fictional-auth.json", workspaceId: id, ownerUserId: id,
  dispatchJournalDirectory: "/owned-proof/fictional-claims", ownerEmail: "fictional@example.test", kind: "sandbox-application", actions: ["build-one-candidate", "read-native-evidence"],
  workId: id, candidateVersion: 1, candidateRevision: 0, sourceDigest: "a".repeat(64), budgetJobId: id, maximumCents: 1,
  teamId: "fictional", projectId: "fictional", image: `fictional/image@sha256:${"b".repeat(64)}`,
  runtimeQualificationId: id, policyVersion: "fictional-v1", runtimePolicyReference: "Fictional schema only", memoryContractReference: "Fictional schema only",
  payerAcceptanceReference: "Fictional schema only", exactBillingResolverReference: "Fictional schema only" };
afterEach(() => vi.unstubAllEnvs());
it("a valid nonproduction input shape never releases the held provider profile", () => {
  expect(parseProviderProofAdmission(sandboxProofAdmissionSchema, admission, now)).toMatchObject({ kind: "sandbox-application" });
  expect(() => preflight(journeyProfile("full-provider"), process.cwd())).toThrow("Provider/client actions remain held");
});
it.each([
  { environment: "production" }, { appOrigin: "https://production.example" }, { actions: ["build-one-candidate", "publish"] },
  { expiresAt: "2026-10-08T22:30:00Z" }, { approvedAt: "2026-10-09T00:00:00Z" }, { maximumCents: 0 },
  { maximumCents: 1_000_001 }, { exactBillingResolverReference: "" }, { image: "fictional/latest" },
])("refuses unsafe, unbounded or incomplete proof inputs %j", mutation => {
  expect(() => parseProviderProofAdmission(sandboxProofAdmissionSchema, { ...admission, ...mutation }, now)).toThrow();
});
it("missing explicit authorization fails before loading a session or provider file, with no skip", () => {
  vi.stubEnv("PLAYWRIGHT_NO_COPY_PROMPT", "1");
  vi.stubEnv("STRELVA_PROVIDER_PROOF_CONFIG", "held-provider-v1");
  vi.stubEnv("STRELVA_AUTHORIZED_PROVIDER_PROOF", undefined);
  vi.stubEnv("STRELVA_PROVIDER_PROOF_ADMISSION", "/must-not-be-read.json");
  expect(() => requireProviderProofAdmission("sandbox-application", sandboxProofAdmissionSchema)).toThrow("Provider proof held");
});

function privateFixture() {
  const directory = mkdtempSync(join(tmpdir(), "provider-admission-unit-"));
  const file = join(directory, "admission.json");
  writeFileSync(file, "{}", { mode: 0o600 });
  return { directory, file };
}
it("permits only current-owner private regular JSON and refuses symlinks/modes/directories", () => {
  const fixture = privateFixture();
  try {
    expect(readPrivateJson(fixture.file)).toEqual({});
    symlinkSync(fixture.file, join(fixture.directory, "link"));
    expect(() => assertPrivatePath(join(fixture.directory, "link"))).toThrow("private current-owner");
    chmodSync(fixture.file, 0o644);
    expect(() => readPrivateJson(fixture.file)).toThrow("private current-owner");
    expect(() => readPrivateJson(fixture.directory)).toThrow("private current-owner");
  } finally { rmSync(fixture.directory, { recursive: true }); }
});
it("refuses an oversized or malformed private JSON without reflecting its content", () => {
  const fixture = privateFixture();
  try {
    writeFileSync(fixture.file, "private secret malformed");
    expect(() => readPrivateJson(fixture.file, 2)).toThrow("exceeds its limit");
    expect(() => readPrivateJson(fixture.file)).toThrow("details withheld");
  } finally { rmSync(fixture.directory, { recursive: true }); }
});
it("durably consumes a dispatch scope, records its request ID and refuses same-scope rerun", () => {
  const fixture = privateFixture();
  try {
    const scope = { kind: "home-finder", authorizationReference: "fictional schema unit only", dispatchJournalDirectory: fixture.directory };
    const claim = claimProviderDispatch(scope, id);
    claim.recordRequest(id); claim.close();
    expect(() => claimProviderDispatch(scope, id)).toThrow("operator review required");
    const files = requireFiles(fixture.directory);
    const journal = files.find(value => value.endsWith(".jsonl"))!;
    expect(readFileSync(join(fixture.directory, journal), "utf8")).toBe(JSON.stringify({ event: "claimed" }) + "\n" + JSON.stringify({ event: "request-observed", requestId: id }) + "\n");
    expect(assertPrivatePath(join(fixture.directory, journal)).mode & 0o777).toBe(0o600);
  } finally { rmSync(fixture.directory, { recursive: true }); }
});
it("refuses a public or symlinked dispatch journal directory", () => {
  const fixture = privateFixture();
  try {
    const claims = join(fixture.directory, "claims"); mkdirSync(claims, { mode: 0o755 });
    const scope = { kind: "sandbox-application", authorizationReference: "fictional", dispatchJournalDirectory: claims };
    expect(() => claimProviderDispatch(scope, id)).toThrow("private current-owner");
    symlinkSync(fixture.directory, join(fixture.directory, "link"));
    expect(() => claimProviderDispatch({ ...scope, dispatchJournalDirectory: join(fixture.directory, "link") }, id)).toThrow("private current-owner");
  } finally { rmSync(fixture.directory, { recursive: true }); }
});
it("refuses stock or additional reporters before loading private proof inputs", () => {
  expect(() => assertProviderReporter({ reporter: [["list"]] })).toThrow("only the isolated");
  expect(() => assertProviderReporter({ reporter: [["/owned/tests/support/provider-redacted-reporter.ts"], ["html"]] })).toThrow("only the isolated");
  expect(() => assertProviderReporter({ reporter: [["/owned/tests/support/provider-redacted-reporter.ts"]] })).not.toThrow();
});
it("refuses provider execution outside the DOM-error-context-disabled config", () => {
  vi.stubEnv("PLAYWRIGHT_NO_COPY_PROMPT", undefined);
  expect(() => requireProviderProofAdmission("sandbox-application", sandboxProofAdmissionSchema)).toThrow("isolated redacted");
});

it("verifies the loaded cookie session with Auth before trusting its declared owner", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fictional-public-unit-key");
  authMock.create.mockReturnValue({ auth: { getUser: authMock.getUser } });
  const cookies = [{ name: "fictional-session", value: "fictional-cookie-unit" }];
  const context = { cookies: vi.fn(async () => cookies.map(cookie => ({ ...cookie, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const }))) };
  authMock.getUser.mockResolvedValue({ error: null, data: { user: { id, email: admission.ownerEmail, email_confirmed_at: "2026-10-08" } } });
  await verifyProviderOwner(context, admission);
  expect(context.cookies).toHaveBeenCalledWith(admission.appOrigin);
  expect(authMock.getUser).toHaveBeenCalled();
  const options = authMock.create.mock.calls.at(-1)![2];
  expect(options.cookies.getAll()).toEqual(cookies);
  expect(() => options.cookies.setAll([])).toThrow("refresh is outside");
  authMock.getUser.mockResolvedValue({ error: null, data: { user: { id: "another-user", email: admission.ownerEmail, email_confirmed_at: "2026-10-08" } } });
  await expect(verifyProviderOwner(context, admission)).rejects.toThrow("does not match");
  authMock.getUser.mockResolvedValue({ error: null, data: { user: { id, email: admission.ownerEmail } } });
  await expect(verifyProviderOwner(context, admission)).rejects.toThrow("does not match");
});

it("freezes the admission and refuses approval that expires during setup after burning a claim", () => {
  const immutable = parseProviderProofAdmission(sandboxProofAdmissionSchema, admission, now);
  expect(Object.isFrozen(immutable)).toBe(true);
  expect(Object.isFrozen(immutable.actions)).toBe(true);
  const fixture = privateFixture();
  try {
    const scope = { kind: "sandbox-application", authorizationReference: "fictional timed approval", dispatchJournalDirectory: fixture.directory };
    const claim = claimProviderDispatch(scope, id);
    expect(() => assertProviderApprovalWindow(immutable, Date.parse(admission.expiresAt))).toThrow("expired");
    claim.close();
    expect(() => claimProviderDispatch(scope, id)).toThrow("operator review required");
  } finally { rmSync(fixture.directory, { recursive: true }); }
});
it("rechecks actual app actor and direct owner role, refusing demotion, different business or actor", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fictional-public-unit-key");
  authMock.create.mockReturnValue({ auth: { getUser: authMock.getUser } });
  authMock.getUser.mockResolvedValue({ error: null, data: { user: { id, email: admission.ownerEmail, email_confirmed_at: "2026-10-08" } } });
  const response = (data: unknown) => ({ status: () => 200, json: async () => data });
  const get = vi.fn();
  const context = { cookies: vi.fn(async () => []), request: { get } };
  get.mockResolvedValueOnce(response({ actorId: id, businesses: [{ id }] })).mockResolvedValueOnce(response({ role: "owner" }));
  await verifyProviderWorkspaceOwner(context, admission);
  get.mockResolvedValueOnce(response({ actorId: id, businesses: [{ id }] })).mockResolvedValueOnce(response({ role: "admin" }));
  await expect(verifyProviderWorkspaceOwner(context, admission)).rejects.toThrow("direct business-owner");
  get.mockResolvedValueOnce(response({ actorId: id, businesses: [] }));
  await expect(verifyProviderWorkspaceOwner(context, admission)).rejects.toThrow("actor/business");
  get.mockResolvedValueOnce(response({ actorId: "27417000-0000-4000-8000-000000000002", businesses: [{ id }] }));
  await expect(verifyProviderWorkspaceOwner(context, admission)).rejects.toThrow("actor/business");
});
