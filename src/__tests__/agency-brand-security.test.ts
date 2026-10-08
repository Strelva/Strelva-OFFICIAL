import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), tenant: vi.fn(), send: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mock.rpc }) }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mock.tenant }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: async () => "inherit" }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mock.send }; } }));
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";
import { resolveOwnerBrand, resolveTenantBrand, validateBrand } from "@/platform/agency-brand/server";
import { agencyReplyTo, resolveAgencyAttribution } from "@/platform/agency-prospecting/server";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
const id = "b2640000-0000-4000-8000-000000000020";
const input = { displayName: "North, Web", accentColor: "#447a4f", replyTo: "member@north.example", logo: null, credit: "runs_on_strelva" as const };
const row = { agencyId: id, name: "North", brand: input, emailAllowed: true, replyTo: input.replyTo };
const agency = { workspaceId: id, slug: "north", name: "North", contactUrl: "https://north.example", brand: { logoUrl: null, accentColor: null } };
const profile = [{ workspace_id: id, slug: "north", name: "North", contact_url: agency.contactUrl, contact_email: "profile@north.example" }];
const message = { audience: "client" as const, workspaceId: id, to: "owner@example.test", subject: "Decision", options: { heading: "Strelva needs you" } };
function payload() { return mock.send.mock.calls.at(-1)![0]; }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("STRELVA_AGENCY_PROSPECTING_RELEASE", "1"); vi.stubEnv("REPLY_TO_EMAIL", "hello@strelva.com");
  mock.send.mockResolvedValue({ data: { id: "sent" }, error: null });
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === "agency_prospecting_profile" ? profile : row, error: null }));
});
afterEach(() => vi.unstubAllEnvs());
describe("agency brand review regressions", () => {
  it.each(["Google Business Support", "Strelva Support", "Microsoft", "Apple Support", "Meta Support", "Facebook", "Instagram", "Yelp", "Stripe", "PayPal", "Square", "Amazon", "owner@example.test", "https://north.example", "www.north.example", "north.example", "Ｇｏｏｇｌｅ Support"])("rejects impersonating/address/URL name %s at save", displayName => {
    expect(() => validateBrand({ ...input, displayName })).toThrow();
  });
  it("normalizes compatibility text and strips invisible direction controls at save", () => {
    expect(validateBrand({ ...input, displayName: "Ｎorth\u202e\u2066\u200e\u200f\u200b\u200c\u200d\ufeff Web" }).displayName).toBe("North Web");
    expect(validateBrand({ ...input, displayName: "Pineapple Metaphor" }).displayName).toBe("Pineapple Metaphor");
  });
  it("quotes comma/quote/backslash names and adds the platform disclosure", async () => {
    mock.rpc.mockResolvedValue({ data: { ...row, brand: { ...input, displayName: 'North, "Web" \\ Studio' } }, error: null });
    await sendEmailWithReceipt(message);
    expect(payload().from).toBe('"North, \\"Web\\" \\\\ Studio via Strelva" <hello@updates.strelva.com>');
  });
  it.each(["Strelva Support", "Google Business Support", "owner@example.test", "https://north.example"])("sanitizes legacy unsafe name %s at send", displayName => {
    mock.rpc.mockResolvedValue({ data: { ...row, brand: null, name: displayName }, error: null });
    return sendEmailWithReceipt(message).then(() => expect(payload()).toMatchObject({ from: '"Strelva" <hello@updates.strelva.com>' }));
  });
  it("does not treat replacement tokens in agency names as replacement instructions", async () => {
    mock.rpc.mockResolvedValue({ data: { ...row, brand: { ...input, displayName: "North $& $' Web" } }, error: null });
    await sendEmailWithReceipt(message);
    expect(payload().text).toContain("North $& $' Web needs you");
  });
  it("rechecks email verification for cached brands and ignores agency headers when revoked", async () => {
    mock.rpc.mockResolvedValue({ data: { ...row, emailAllowed: false }, error: null });
    await sendEmailWithReceipt({ ...message, replyTo: "stale@north.example", fromName: "Cached Agency", options: { ...message.options, brand: { ...STRELVA_BRAND, agencyId: id, name: "Cached Agency", replyTo: input.replyTo } } });
    expect(mock.rpc).toHaveBeenCalledWith("resolve_owner_brand", { p_workspace_id: id });
    expect(payload()).toMatchObject({ from: '"Strelva" <hello@updates.strelva.com>', replyTo: "hello@strelva.com" });
  });
  it("does not restore a cached agency after its business provider seat has ended", async () => {
    const businessId = "b2640000-0000-4000-8000-000000000010";
    mock.rpc.mockImplementation(async (_name: string, args: { p_workspace_id: string }) => ({ data: args.p_workspace_id === businessId ? null : row, error: null }));
    await sendEmailWithReceipt({ ...message, workspaceId: businessId, options: { ...message.options, brand: { ...STRELVA_BRAND, agencyId: id, name: "Cached Agency", replyTo: input.replyTo } } });
    expect(payload()).toMatchObject({ from: '"Strelva" <hello@updates.strelva.com>', replyTo: "hello@strelva.com" });
    expect(payload().text).not.toContain("Cached Agency");
  });
  it("normalizes a legacy workspace name again at send", async () => {
    mock.rpc.mockResolvedValue({ data: { ...row, brand: null, name: "Ｎorth\u202e\u200b Web" }, error: null });
    await sendEmailWithReceipt(message);
    expect(payload().from).toBe('"North Web via Strelva" <hello@updates.strelva.com>');
  });
  it("uses Strelva content and headers when a cached brand lookup fails", async () => {
    mock.rpc.mockRejectedValue(new Error("offline"));
    await sendEmailWithReceipt({ ...message, options: { ...message.options, brand: { ...STRELVA_BRAND, agencyId: id, name: "Cached Agency", replyTo: input.replyTo } } });
    expect(payload()).toMatchObject({ from: '"Strelva" <hello@updates.strelva.com>', replyTo: "hello@strelva.com" });
    expect(payload().text).not.toContain("Cached Agency");
  });
  it("does not use a stale brand reply-to or caller address after membership revocation", async () => {
    mock.rpc.mockImplementation(async (name: string) => ({ data: name === "agency_prospecting_profile" ? profile : { ...row, replyTo: null }, error: null }));
    await sendEmailWithReceipt({ ...message, replyTo: "owner@example.test" });
    expect(payload().replyTo).toBe("hello@strelva.com");
    expect(await agencyReplyTo(agency)).toBe("hello@strelva.com");
  });
  it.each(["missing column", "thrown lookup"])("falls back across owner, tenant, prospect and send on %s", async failure => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "agency_prospecting_profile") return { data: profile, error: null };
      if (failure === "thrown lookup") throw new Error("connection dropped");
      return { data: null, error: { message: 'column w.agency_brand does not exist' } };
    });
    mock.tenant.mockResolvedValue(id);
    expect(await resolveOwnerBrand(id)).toEqual(STRELVA_BRAND);
    expect(await resolveTenantBrand("tenant")).toEqual(STRELVA_BRAND);
    expect(await resolveAgencyAttribution("north")).toMatchObject({ name: "Strelva" });
    expect(await agencyReplyTo(agency)).toBe("hello@strelva.com");
    await expect(sendEmailWithReceipt(message)).resolves.toMatchObject({ status: "accepted" });
    expect(payload()).toMatchObject({ from: '"Strelva" <hello@updates.strelva.com>', replyTo: "hello@strelva.com" });
    expect(warn).toHaveBeenCalled(); warn.mockRestore();
  });
  it("falls back when tenant-to-workspace lookup throws", async () => {
    mock.tenant.mockRejectedValue(new Error("offline"));
    expect(await resolveTenantBrand("tenant")).toEqual(STRELVA_BRAND);
  });
});
