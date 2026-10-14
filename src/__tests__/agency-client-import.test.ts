import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyClientImport,
  clientImportIdempotencyKey,
  previewClientImport,
  readAgencyClientAddLimits,
  setAgencyClientAddLimits,
  type ClientImportDeps,
} from "@/products/agency-clients/import-server";
import { addAgencyClient, AgencyClientError, agencyImportReleaseEnabled, type AgencyClientDeps } from "@/products/agency-clients/server";
import type { AddAgencyClientInput, AddAgencyClientResult } from "@/products/agency-clients/contracts";
import type { ClientImportLimits, ClientImportRow } from "@/products/agency-clients/import-contract";

const AGENCY = "c3000000-0000-4000-8000-000000000020";
const OTHER_AGENCY = "c3000000-0000-4000-8000-000000000030";
const actor = { userId: "c3000000-0000-4000-8000-000000000001", verifiedEmail: "Owner@Agency.example.test" };
const limits = (overrides: Partial<ClientImportLimits> = {}): ClientImportLimits => ({ daily: 25, waitingForOwner: 100, raised: false, usedToday: 0, waiting: 0, ...overrides });

const northside: ClientImportRow = { sourceRef: "site:northside.example", name: "Northside Bakery", url: "northside.example", ownerEmail: "pat@northside.example", phone: "(716) 555-0142", address: "12 Main St, Buffalo NY" };
const corner: ClientImportRow = { sourceRef: "name:corner plumbing", name: "Corner Plumbing" };
const acme: ClientImportRow = { sourceRef: "site:acme.example", url: "https://www.acme.example/" };

let customer = 0;
function result(input: AddAgencyClientInput, overrides: Partial<AddAgencyClientResult["client"]> = {}): AddAgencyClientResult {
  customer += 1;
  const customerWorkspaceId = `c3000000-0000-4000-8000-${String(customer).padStart(12, "0")}`;
  return {
    client: { additionId: customerWorkspaceId, agencyWorkspaceId: AGENCY, customerWorkspaceId, name: input.name ?? "Read from site", sourceKind: "url",
      sourceUrl: input.url ?? null, prospectId: null, factsSeeded: 1, seatId: null, addedBy: actor.userId, addedAt: "2026-10-12T12:00:00.000Z", replayed: false, ...overrides },
    scan: { status: "scanned", seeded: [], name: null, message: null },
    ownerClaim: input.ownerEmail ? { claimId: customerWorkspaceId, customerWorkspaceId, workspaceName: input.name ?? "", recipientEmail: input.ownerEmail,
      delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false }, expiresAt: "2026-10-26T12:00:00.000Z",
      createdAt: "2026-10-12T12:00:00.000Z", replacedPending: false, claimPath: `/workspace/claim/${"t".repeat(43)}` } : null,
    ownerClaimError: null,
    website: { connect: "/c", rebuild: "/r", rebuildOpenToAgency: true },
    aiCheck: { status: "not_requested" },
  };
}

function deps(read: { addedCommandIds?: string[]; sameHost?: Array<{ sourceUrl: string; customerWorkspaceId: string; name: string }>; limits?: ClientImportLimits } = {},
  add?: (actor: unknown, input: AddAgencyClientInput) => Promise<AddAgencyClientResult>) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({
    data: name === "agency_client_import_preview" ? { addedCommandIds: read.addedCommandIds ?? [], sameHost: read.sameHost ?? [], limits: read.limits ?? limits() } : null,
    error: null,
  }));
  const addFn = vi.fn(add ?? (async (_actor: unknown, input: AddAgencyClientInput) => result(input)));
  return { rpc, add: addFn, concurrency: 2 } satisfies ClientImportDeps;
}

afterEach(() => vi.unstubAllEnvs());

describe("Import clients release (negative control)", () => {
  it("is off by default and never on without the add-client release", () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(agencyImportReleaseEnabled({})).toBe(false);
    expect(agencyImportReleaseEnabled({ STRELVA_AGENCY_IMPORT_RELEASE: "1" })).toBe(false);
    expect(agencyImportReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1" })).toBe(false);
    expect(agencyImportReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1", STRELVA_AGENCY_IMPORT_RELEASE: "true" })).toBe(false);
    expect(agencyImportReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1", STRELVA_AGENCY_IMPORT_RELEASE: "1" })).toBe(true);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(agencyImportReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1", STRELVA_AGENCY_IMPORT_RELEASE: "1" })).toBe(false);
  });
});

describe("clientImportIdempotencyKey", () => {
  it("is a stable UUID per agency, source and source ref", () => {
    const key = clientImportIdempotencyKey(AGENCY, "sheet", "site:northside.example");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(clientImportIdempotencyKey(AGENCY.toUpperCase(), "sheet", "site:northside.example")).toBe(key);
    expect(clientImportIdempotencyKey(OTHER_AGENCY, "sheet", "site:northside.example")).not.toBe(key);
    expect(clientImportIdempotencyKey(AGENCY, "gohighlevel", "site:northside.example")).not.toBe(key);
    expect(clientImportIdempotencyKey(AGENCY, "sheet", "site:acme.example")).not.toBe(key);
  });
});

describe("previewClientImport", () => {
  it("gives every row a state and adds nothing", async () => {
    const existingKey = clientImportIdempotencyKey(AGENCY, "sheet", corner.sourceRef);
    const d = deps({ addedCommandIds: [existingKey], sameHost: [{ sourceUrl: "https://acme.example", customerWorkspaceId: OTHER_AGENCY, name: "Acme Roofing" }] });
    const preview = await previewClientImport(actor, { action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows: [
      northside,
      corner,
      acme,
      { sourceRef: "row:5", phone: "716" },
      { sourceRef: "site:bad", url: "ftp://bad.example" },
      { ...northside, sourceRef: "site:northside.example/" , name: "Northside again" },
      { sourceRef: "name:odd", name: "Odd Phone", phone: "12", address: "x".repeat(250) },
    ] }, d);
    expect(preview.rows.map((row) => row.state)).toEqual(["ready", "duplicate", "duplicate", "incomplete", "refused", "duplicate", "ready"]);
    expect(preview.rows[1]!.reason).toBe("Already imported from this list.");
    expect(preview.rows[2]!.reason).toBe("Already your client: Acme Roofing.");
    expect(preview.rows[3]!.reason).toBe("Add a website or a business name.");
    expect(preview.rows[4]!.reason).toMatch(/public HTTP or HTTPS/);
    expect(preview.rows[5]!.reason).toMatch(/more than once/);
    expect(preview.rows[6]!.note).toBe("Phone not kept: it needs 7 to 15 digits. Address not kept: it is longer than 200 characters.");
    expect(preview.canAddToday).toBe(2);
    expect(d.add).not.toHaveBeenCalled();
    const [name, args] = d.rpc.mock.calls[0]!;
    expect(name).toBe("agency_client_import_preview");
    expect(args).toMatchObject({ p_user_id: actor.userId, p_verified_email: "owner@agency.example.test", p_agency_workspace_id: AGENCY });
    expect(args.p_hosts).toEqual(["northside.example", "acme.example"]);
    expect(args.p_command_ids).toHaveLength(5);
  });

  it("counts only what fits the agency's own limits", async () => {
    const preview = await previewClientImport(actor, { action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside, corner, acme] },
      deps({ limits: limits({ daily: 60, usedToday: 59, raised: true }) }));
    expect(preview.canAddToday).toBe(1);
    expect(preview.limits).toMatchObject({ daily: 60, raised: true });
  });

  it("surfaces a refused reader as the agency would read it", async () => {
    const d = deps();
    d.rpc.mockResolvedValueOnce({ data: null, error: { message: "agency_client_access_denied" } } as never);
    await expect(previewClientImport(actor, { action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows: [corner] }, d))
      .rejects.toMatchObject({ status: 403, code: "agency_client_access_denied" });
  });
});

describe("applyClientImport", () => {
  it("adds each ready row through the ordinary add with a deterministic key and found facts", async () => {
    const d = deps();
    const applied = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside, corner] }, d);
    expect(applied.rows.map((row) => row.state)).toEqual(["added", "added"]);
    expect(applied.rows[0]!.ownerClaimPath).toBe(`/workspace/claim/${"t".repeat(43)}`);
    expect(applied.rows[1]!.ownerClaimPath).toBeUndefined();
    const inputs = d.add.mock.calls.map(([, input]) => input);
    expect(inputs).toContainEqual({ action: "add", agencyWorkspaceId: AGENCY, idempotencyKey: clientImportIdempotencyKey(AGENCY, "sheet", northside.sourceRef),
      url: "https://northside.example/", name: "Northside Bakery", ownerEmail: "pat@northside.example",
      foundFacts: { phone: "(716) 555-0142", address: "12 Main St, Buffalo NY", source: { kind: "client_import_sheet", ref: "site:northside.example" } } });
    expect(inputs).toContainEqual({ action: "add", agencyWorkspaceId: AGENCY, idempotencyKey: clientImportIdempotencyKey(AGENCY, "sheet", corner.sourceRef), name: "Corner Plumbing" });
  });

  it("never passes a source's owner candidates into the strict add input", async () => {
    const d = deps();
    await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "gohighlevel", rows: [{ sourceRef: "loc-1", name: "Lake Effect Roofing",
      ownerEmailCandidates: [{ email: "jo@lakeeffect.example", basis: "account_admin" }] }] }, d);
    expect(d.add.mock.calls[0]![1]).toEqual({ action: "add", agencyWorkspaceId: AGENCY, idempotencyKey: clientImportIdempotencyKey(AGENCY, "gohighlevel", "loc-1"), name: "Lake Effect Roofing" });
  });

  it("re-importing the same rows never adds a second client", async () => {
    // The first import's response was lost: the database replays the same keys.
    const replay = deps({}, async (_actor, input) => result(input, { replayed: true }));
    const again = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside] }, replay);
    expect(again.rows[0]).toMatchObject({ state: "duplicate", reason: "Already imported from this list." });
    expect(again.rows[0]!.ownerClaimPath).toBeUndefined();
    // A later preview knows the key and never offers the row again.
    const seen = deps({ addedCommandIds: [clientImportIdempotencyKey(AGENCY, "sheet", northside.sourceRef)] });
    const applied = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside] }, seen);
    expect(applied.rows[0]!.state).toBe("duplicate");
    expect(seen.add).not.toHaveBeenCalled();
    // Changed details under the same key are a duplicate, not a second client.
    const changed = deps({}, async () => { throw new AgencyClientError("conflict", 409, "agency_client_idempotency_conflict"); });
    const conflict = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [{ ...northside, name: "Northside Bakery & Cafe" }] }, changed);
    expect(conflict.rows[0]!.state).toBe("duplicate");
  });

  it("keeps other rows added when one fails, and reports each row", async () => {
    const d = deps({}, async (_actor, input) => {
      if (input.name === "Corner Plumbing") throw new AgencyClientError("We couldn't find the business's name on its site. Enter it.", 400, "agency_client_name_required");
      if (!input.name) throw new Error("socket hang up");
      return result(input);
    });
    const applied = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside, corner, acme] }, d);
    expect(applied.rows.map((row) => row.state)).toEqual(["added", "refused", "refused"]);
    expect(applied.rows[1]!.reason).toBe("We couldn't find the business's name on its site. Enter it.");
    expect(applied.rows[2]!.reason).toMatch(/won't be added twice/);
    expect(d.add).toHaveBeenCalledTimes(3);
  });

  it("stops at the agency's limit without scanning the rows past it", async () => {
    const capped = deps({ limits: limits({ daily: 2, usedToday: 1, raised: true }) });
    const applied = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside, corner, acme] }, capped);
    expect(applied.rows.map((row) => row.state)).toEqual(["added", "refused", "refused"]);
    expect(applied.rows[1]!.reason).toMatch(/today's limit/);
    expect(capped.add).toHaveBeenCalledTimes(1);

    const waiting = deps({ limits: limits({ waitingForOwner: 3, waiting: 3 }) });
    const none = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside] }, waiting);
    expect(none.rows[0]!.reason).toMatch(/waiting for their owner/);
    expect(waiting.add).not.toHaveBeenCalled();
  });

  it("stops starting rows once the database refuses for the limit", async () => {
    let calls = 0;
    const d = { ...deps({}, async () => { calls += 1; throw new AgencyClientError("Your agency has added the most clients allowed today. Try again tomorrow.", 429, "agency_client_daily_limit"); }), concurrency: 1 };
    const applied = await applyClientImport(actor, { action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: [northside, corner, acme] }, d);
    expect(calls).toBe(1);
    expect(applied.rows.every((row) => row.state === "refused" && row.reason === "Your agency has added the most clients allowed today. Try again tomorrow.")).toBe(true);
  });
});

describe("found facts on the ordinary add", () => {
  it("stores a sheet's phone and address as unconfirmed agency facts over the scan's, and drops invalid ones", async () => {
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({ data: name === "authorize_agency_client_add" ? "owner"
      : name === "agency_add_client_enrolled" ? { additionId: AGENCY, agencyWorkspaceId: AGENCY, customerWorkspaceId: OTHER_AGENCY, name: "Northside Bakery", sourceKind: "url",
        sourceUrl: "https://northside.example/", prospectId: null, factsSeeded: 4, seatId: null, addedBy: actor.userId, addedAt: "2026-10-12T12:00:00.000Z", replayed: false } : null, error: null }));
    const d = { rpc, seed: vi.fn(async () => ({ scan: { status: "scanned" as const, seeded: ["phone", "email"], name: null, message: null },
      facts: { phone: { value: "(716) 555-0000" }, email: { value: "hello@northside.example" } } })), token: () => "t".repeat(43), now: () => new Date(), assess: vi.fn(async () => { throw new Error("off"); }) } satisfies AgencyClientDeps;
    const added = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside.example", name: "Northside Bakery",
      idempotencyKey: clientImportIdempotencyKey(AGENCY, "sheet", "site:northside.example"), foundFacts: { phone: "(716) 555-0142", address: "12 Main St" } }, d);
    const args = rpc.mock.calls.find(([name]) => name === "agency_add_client_enrolled")![1] as { p_input: { facts: Record<string, unknown> }; p_command_digest: string };
    expect(args.p_input.facts).toEqual({ phone: { value: "(716) 555-0142" }, email: { value: "hello@northside.example" }, address: { value: { formatted: "12 Main St" } } });
    expect(added.scan.seeded).toEqual(["phone", "email", "address"]);

    await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside.example", name: "Northside Bakery",
      idempotencyKey: clientImportIdempotencyKey(AGENCY, "sheet", "site:northside.example"), foundFacts: { phone: "123" } }, d);
    const second = rpc.mock.calls.filter(([name]) => name === "agency_add_client_enrolled")[1]![1] as typeof args;
    expect(second.p_input.facts.phone).toEqual({ value: "(716) 555-0000" });
    // Found facts are not part of the request digest: a re-import with edited facts still replays.
    expect(second.p_command_digest).toBe(args.p_command_digest);
  });
});

describe("per-agency limits", () => {
  it("reads this agency's limits for a member", async () => {
    const rpc = vi.fn(async () => ({ data: { agencyWorkspaceId: AGENCY, ...limits({ daily: 60, raised: true }), revision: 2 }, error: null }));
    await expect(readAgencyClientAddLimits(actor, AGENCY, { rpc })).resolves.toMatchObject({ daily: 60, raised: true });
    expect(rpc).toHaveBeenCalledWith("read_agency_client_add_limits", { p_user_id: actor.userId, p_verified_email: "owner@agency.example.test", p_agency_workspace_id: AGENCY });
  });

  it("lets only Postgres decide who is an operator, and maps its refusals", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "workspace_release_operator_required" } }));
    await expect(setAgencyClientAddLimits("Not-An-Operator@agency.example.test", { agencyWorkspaceId: AGENCY, daily: 60, waitingForOwner: 200, reason: "Verified agency, 60 clients", expectedRevision: 0 }, { rpc }))
      .rejects.toMatchObject({ status: 403, code: "workspace_release_operator_required" });
    expect(rpc).toHaveBeenCalledWith("set_agency_client_add_limits", { p_operator_email: "not-an-operator@agency.example.test", p_agency_workspace_id: AGENCY,
      p_daily: 60, p_waiting_for_owner: 200, p_reason: "Verified agency, 60 clients", p_expected_revision: 0 });
    await expect(setAgencyClientAddLimits("ops@strelva.example", { agencyWorkspaceId: AGENCY, daily: 60, waitingForOwner: null, reason: "half", expectedRevision: 0 }, { rpc })).rejects.toThrow();
    await expect(setAgencyClientAddLimits("ops@strelva.example", { agencyWorkspaceId: AGENCY, daily: 501, waitingForOwner: 10, reason: "too many", expectedRevision: 0 }, { rpc })).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
