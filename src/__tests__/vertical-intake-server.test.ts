import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/connections/server", () => ({ connectionEligibilityFor: vi.fn(async () => ({ eligible: true, through: { kind: "platform" } })) }));
vi.mock("@/platform/connections/holders", () => ({ recordConnectionHolder: vi.fn(async () => undefined) }));
vi.mock("@/products/connected-sites/installer", () => ({ resolveConnectedSiteInstaller: vi.fn(async (_actor, workspaceId) => ({ kind: "business", workspaceId })) }));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: vi.fn() }));
vi.mock("@/platform/bookings/native", () => ({ nativeServices: vi.fn(async () => ({ services: [{ id: "svc-exam", name: "New patient exam" }] })) }));
vi.mock("@/platform/bookings/manual", () => ({ manualBookingsEnabled: vi.fn(async () => true) }));
import { setConnectedSitesStoreForTests, ConnectedSiteInputError, type ConnectedSitesStore } from "@/products/connected-sites/store";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { readBusinessRecord } from "@/platform/business-record/service";
import { intakeInstallConfigSchema } from "@/products/vertical-intake/contracts";
import {
  IntakeUnavailableError, readIntakeApp, readPublicIntakeForm, requestIntakeLive, revealIntakeSensitive, saveIntakeDraft, submitPublicIntake,
} from "@/products/vertical-intake/server";
import type { VerticalIntakeStore } from "@/products/vertical-intake/store";

const actor = { userId: "81000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const BUSINESS = "81000000-0000-4000-8000-000000000002";
const SITE_ID = "81000000-0000-4000-8000-000000000003";
const LEAD_ROW = "81000000-0000-4000-8000-0000000000aa";
const SUBMISSION = "81000000-0000-4000-8000-0000000000bb";
const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const ORIGIN = "https://north.example";
const site = { id: SITE_ID, workspaceId: BUSINESS, siteUrl: `${ORIGIN}/`, siteHost: "north.example", allowedOrigins: [ORIGIN], captureForms: true, injectSchema: true, verified: true };
const stored = { id: SITE_ID, workspaceId: BUSINESS, publicKey: KEY, label: "north.example", siteUrl: site.siteUrl, siteHost: site.siteHost, allowedOrigins: site.allowedOrigins, platform: "custom" as const, captureForms: true, injectSchema: true, status: "active" as const, verificationToken: null, verifiedAt: "2026-10-08T01:00:00Z", createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z", revokedAt: null, firstEventAt: null, lastEventAt: null };
const FACTS = { display_name: "North Dental", phone: "716-555-0100", insurance_accepted: { carriers: ["Delta Dental PPO", "Cigna"] } };

function sites(overrides: Partial<ConnectedSitesStore> = {}): ConnectedSitesStore {
  return {
    create: vi.fn(), list: vi.fn(async () => [stored]), update: vi.fn(), revoke: vi.fn(), confirmVerification: vi.fn(), inquiries: vi.fn(async () => []), activity: vi.fn(async () => ({})),
    resolve: vi.fn(async () => site), context: vi.fn(async () => ({ revision: 1, facts: FACTS, services: [], site: { captureForms: true, injectSchema: true } })),
    recordEvents: vi.fn(async () => 0), recordSchemaConflict: vi.fn(), purge: vi.fn(async () => ({ events: 0, spam: 0 })),
    recordInquiry: vi.fn(async () => ({ status: "recorded" as const, id: LEAD_ROW, workspaceId: BUSINESS })),
    recordSpam: vi.fn(async () => ({ status: "recorded" as const })),
    ...overrides,
  } as ConnectedSitesStore;
}

function intakeStore(overrides: Partial<VerticalIntakeStore> = {}, config: Record<string, unknown> = {}): VerticalIntakeStore {
  const install = { id: "81000000-0000-4000-8000-0000000000c1", workspaceId: BUSINESS, appId: "dental_intake" as const, status: "live" as const, draftConfig: intakeInstallConfigSchema.parse(config), draftRevision: 2, liveRelease: 1, liveRequestedAt: null, lastLiveCheck: null, updatedAt: "2026-10-20T00:00:00Z" };
  return {
    readApp: vi.fn(async () => ({ access: "owner", install, releases: [], submissions: [] })),
    saveDraft: vi.fn(async () => install), requestLive: vi.fn(async () => install), pause: vi.fn(async () => install),
    readSensitive: vi.fn(async () => []), makeLive: vi.fn(), withdrawLiveRequest: vi.fn(), listLiveRequests: vi.fn(), recordLiveCheck: vi.fn(async () => undefined),
    resolvePublic: vi.fn(async () => ({ installId: install.id, workspaceId: BUSINESS, release: 1, config: intakeInstallConfigSchema.parse(config), definitionVersion: 1 })),
    recordSubmission: vi.fn(async () => ({ status: "recorded" as const, id: SUBMISSION })),
    listOpenVisits: vi.fn(), readVisit: vi.fn(), decideVisit: vi.fn(), purgeSensitive: vi.fn(async () => 0),
    ...overrides,
  };
}

const open = async () => true;
const good = { name: "Pat Lee", phone: "716 555 0111", patient_status: "new", reason: "checkup", insurance_carrier: "p_delta_dental_ppo" };
const body = (answers: Record<string, string>, extra: Record<string, unknown> = {}) => ({ id: "intake-12345678", path: "/visit?utm=1", answers, ...extra });
const submit = (answers: Record<string, string>, deps: { store: VerticalIntakeStore; publicFor?: (id: string) => Promise<boolean> }, extra: Record<string, unknown> = {}) =>
  submitPublicIntake(KEY, site, ORIGIN, "dental_intake", body(answers, extra), { now: new Date("2026-10-20T14:00:00Z"), publicFor: open, ...deps });

beforeEach(() => {
  vi.stubEnv("STRELVA_INQUIRY_RECORDS", "");
  vi.stubEnv("SECRETS_ENC_KEY", "");
  vi.stubEnv("STRELVA_INTAKE_SENSITIVE_FIELDS", "");
  setConnectedSitesStoreForTests(sites());
});
afterEach(() => {
  setConnectedSitesStoreForTests(null);
  vi.unstubAllEnvs();
});

describe("submitPublicIntake", () => {
  it("records one Inquiry, then one submission row, and returns the submission", async () => {
    const connected = sites();
    setConnectedSitesStoreForTests(connected);
    const store = intakeStore();
    const outcome = await submit({ ...good, preferred_days: "tue,thu", preferred_times: "morning", note: "Thanks" }, { store });
    expect(outcome).toEqual({ status: "recorded", id: SUBMISSION, triage: "routine" });
    expect(connected.recordInquiry).toHaveBeenCalledTimes(1);
    expect(store.recordSubmission).toHaveBeenCalledWith(KEY, ORIGIN, "dental_intake", LEAD_ROW, expect.any(Object), "routine", []);
  });

  it("writes the lead with source app:dental_intake and never carries a member ID", async () => {
    const connected = sites();
    setConnectedSitesStoreForTests(connected);
    vi.stubEnv("SECRETS_ENC_KEY", "test-key-for-intake");
    vi.stubEnv("STRELVA_INTAKE_SENSITIVE_FIELDS", "1");
    const store = intakeStore({}, { collectMemberId: true });
    await submit({ ...good, insurance_member_id: "ABC123XYZ", preferred_days: "tue", preferred_times: "morning" }, { store });
    const [key, origin, lead] = (connected.recordInquiry as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe(KEY);
    expect(origin).toBe(ORIGIN);
    expect(lead).toMatchObject({ source: "app:dental_intake", name: "Pat Lee", message: "New patient · Checkup and cleaning · Delta Dental PPO · Prefers Tue · Mornings" });
    expect(lead.fields).toMatchObject({ app: "dental_intake", triage: "routine", phone: "716 555 0111", page: "/visit" });
    expect(JSON.stringify(lead)).not.toContain("ABC123XYZ");
    expect(lead.fields).not.toHaveProperty("insurance_member_id");
    const [, , , , answers, triage, sensitive] = (store.recordSubmission as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(answers).not.toHaveProperty("insurance_member_id");
    expect(triage).toBe("routine");
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0].ciphertext.startsWith("enc:v1:")).toBe(true);
    expect(sensitive[0].ciphertext).not.toContain("ABC123XYZ");
    expect(decryptSecret(sensitive[0].ciphertext)).toBe("ABC123XYZ");
  });

  it("stores no sensitive value when the env switch is off, even if one is posted", async () => {
    const connected = sites();
    setConnectedSitesStoreForTests(connected);
    const store = intakeStore({}, { collectMemberId: true });
    await submit({ ...good, insurance_member_id: "ABC123XYZ" }, { store });
    const call = (store.recordSubmission as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[6]).toEqual([]);
    expect(JSON.stringify((connected.recordInquiry as ReturnType<typeof vi.fn>).mock.calls[0])).not.toContain("ABC123XYZ");
  });

  it("flags tooth pain as urgent in the lead and the submission", async () => {
    const connected = sites();
    setConnectedSitesStoreForTests(connected);
    const store = intakeStore();
    const outcome = await submit({ ...good, reason: "urgent" }, { store });
    expect(outcome).toMatchObject({ status: "recorded", triage: "urgent" });
    expect((connected.recordInquiry as ReturnType<typeof vi.fn>).mock.calls[0]![2].fields.triage).toBe("urgent");
  });

  it("ignores a honeypot unless inquiry records are on, then holds it as spam", async () => {
    const connected = sites();
    setConnectedSitesStoreForTests(connected);
    const store = intakeStore();
    expect(await submit(good, { store }, { _hp: "bot" })).toEqual({ status: "ignored" });
    expect(connected.recordSpam).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    vi.stubEnv("DUAL_WRITE_PG", "1");
    expect(await submit(good, { store }, { _hp: "bot" })).toEqual({ status: "held_as_spam" });
    expect(connected.recordSpam).toHaveBeenCalledTimes(1);
    expect(connected.recordInquiry).not.toHaveBeenCalled();
  });

  it("holds a spam verdict in the pit without any member ID, and records no submission", async () => {
    const connected = sites();
    setConnectedSitesStoreForTests(connected);
    vi.stubEnv("SECRETS_ENC_KEY", "test-key-for-intake");
    vi.stubEnv("STRELVA_INTAKE_SENSITIVE_FIELDS", "1");
    const store = intakeStore({}, { collectMemberId: true });
    const outcome = await submit({ ...good, name: "Zbdhgvucw LLC", email: "z.u.g.o.zu.r.o.yiv.26@gmail.com", note: "Build request: kqzxvbn", insurance_member_id: "ABC123XYZ" }, { store });
    expect(outcome).toEqual({ status: "held_as_spam" });
    const call = (connected.recordSpam as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.stringify(call)).not.toContain("ABC123XYZ");
    expect(call[2].payload).toMatchObject({ capture: "app:dental_intake" });
    expect(connected.recordInquiry).not.toHaveBeenCalled();
    expect(store.recordSubmission).not.toHaveBeenCalled();
  });

  it("throws the exact correction for an invalid answer", async () => {
    const store = intakeStore();
    await expect(submit({ ...good, email: "nope" }, { store })).rejects.toThrow("Enter a valid email address, or clear it and use your phone number.");
    await expect(submit({ ...good, email: "nope" }, { store })).rejects.toBeInstanceOf(ConnectedSiteInputError);
    await expect(submit({ ...good, reason: "" }, { store })).rejects.toThrow("Please answer: What is the visit for?.");
  });

  it("is unavailable when the form is not public for this business, or not live", async () => {
    await expect(submit(good, { store: intakeStore(), publicFor: async () => false })).rejects.toBeInstanceOf(IntakeUnavailableError);
    await expect(submit(good, { store: intakeStore({ resolvePublic: vi.fn(async () => null) }) })).rejects.toBeInstanceOf(IntakeUnavailableError);
  });

  it("makes no app-events call: the platform outbox records the lead and the booking itself", () => {
    const dir = path.join(process.cwd(), "src/products/vertical-intake");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(file => /\.(ts|tsx)$/.test(file));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(readFileSync(path.join(dir, file), "utf8"), file).not.toMatch(/platform\/app-events/);
  });

  it("reports a repeat of the same lead as a duplicate", async () => {
    const connected = sites({ recordInquiry: vi.fn(async () => ({ status: "exists" as const, id: LEAD_ROW, workspaceId: BUSINESS })) });
    setConnectedSitesStoreForTests(connected);
    const store = intakeStore({ recordSubmission: vi.fn(async () => ({ status: "exists" as const, id: SUBMISSION })) });
    expect(await submit(good, { store })).toMatchObject({ status: "duplicate", id: SUBMISSION });
  });
});

describe("readPublicIntakeForm", () => {
  it("builds the form from the Release and the office's confirmed facts", async () => {
    const form = await readPublicIntakeForm(KEY, site, "dental_intake", new Date("2026-10-20T14:00:00Z"), { store: intakeStore(), publicFor: open });
    expect(form?.release).toBe(1);
    expect(form?.office).toMatchObject({ name: "North Dental", phone: "716-555-0100" });
    expect(form?.fields.find(field => field.id === "insurance_carrier")?.options?.map(option => option.label)).toContain("Delta Dental PPO");
    expect(form?.fields.some(field => field.id === "insurance_member_id")).toBe(false);
  });

  it("returns nothing for an unknown App or a closed business", async () => {
    expect(await readPublicIntakeForm(KEY, site, "law_intake", new Date(), { store: intakeStore(), publicFor: open })).toBeNull();
    expect(await readPublicIntakeForm(KEY, site, "dental_intake", new Date(), { store: intakeStore(), publicFor: async () => false })).toBeNull();
  });
});

describe("the owner's side", () => {
  const record = (facts: Record<string, unknown>) => ({ revision: 1, access: "owner", facts: Object.fromEntries(Object.entries(facts).map(([k, value]) => [k, { value, source: "owner", verified: true }])), services: [], people: [] });

  it("rejects a page on another host and member IDs that are not available", async () => {
    const store = intakeStore();
    const deps = { store, sites: async () => [stored] };
    await expect(saveIntakeDraft(actor, BUSINESS, "dental_intake", 2, { pageUrl: "https://elsewhere.example/visit" }, deps)).rejects.toThrow("Use a page on your connected website.");
    await expect(saveIntakeDraft(actor, BUSINESS, "dental_intake", 2, { collectMemberId: true }, deps)).rejects.toThrow("Asking for member IDs isn't available yet.");
    await saveIntakeDraft(actor, BUSINESS, "dental_intake", 2, { pageUrl: `${ORIGIN}/visit`, formLabel: "Ask for a visit" }, deps);
    expect(store.saveDraft).toHaveBeenCalledWith(actor, BUSINESS, "dental_intake", expect.objectContaining({ pageUrl: `${ORIGIN}/visit`, formLabel: "Ask for a visit" }), 2);
  });

  it("refuses to ask the owner while the phone fact or a verified site is missing", async () => {
    vi.mocked(readBusinessRecord).mockResolvedValue(record({ insurance_accepted: FACTS.insurance_accepted }) as never);
    const store = intakeStore();
    await expect(requestIntakeLive(actor, BUSINESS, "dental_intake", { store })).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(requestIntakeLive(actor, BUSINESS, "dental_intake", { store })).rejects.toThrow(/Office phone in Business details/);
    expect(store.requestLive).not.toHaveBeenCalled();
    vi.mocked(readBusinessRecord).mockResolvedValue(record(FACTS) as never);
    await requestIntakeLive(actor, BUSINESS, "dental_intake", { store });
    expect(store.requestLive).toHaveBeenCalledTimes(1);
  });

  it("reads one view with readiness, install lines and the code-site tag", async () => {
    vi.mocked(readBusinessRecord).mockResolvedValue(record(FACTS) as never);
    const view = await readIntakeApp(actor, BUSINESS, "dental_intake", { store: intakeStore({}, { bookingServiceId: "svc-exam" }), now: new Date("2026-10-20T14:00:00Z") });
    expect(view.canGoLive).toBe(true);
    expect(view.readiness.find(row => row.id === "booking")).toMatchObject({ state: "done" });
    expect(view.sites[0]).toMatchObject({ siteKey: KEY, lines: { mount: '<div data-strelva-app="dental_intake"></div>' } });
    expect(view.sites[0]!.lines.script).toContain(`data-strelva-site="${KEY}"`);
    expect(view.sites[0]!.codeSnippet).toContain(`siteKey="${KEY}" appId="dental_intake"`);
    expect(view.app.name).toBe("Dental intake");
  });

  it("decrypts a member ID for display, labelled from the definition", async () => {
    vi.stubEnv("SECRETS_ENC_KEY", "test-key-for-intake");
    const { encryptSecret } = await import("@/platform/infra/crypto/secrets");
    const store = intakeStore({ readSensitive: vi.fn(async () => [{ fieldId: "insurance_member_id", ciphertext: encryptSecret("ABC123XYZ") }]) });
    expect(await revealIntakeSensitive(actor, BUSINESS, SUBMISSION, { store })).toEqual([{ label: "Member ID", value: "ABC123XYZ" }]);
  });
});
