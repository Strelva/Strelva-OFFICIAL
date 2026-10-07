import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  responses: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }>,
  state: null as unknown,
  noticesReleased: true,
  emailOverride: "inherit" as "inherit" | "on" | "off",
}));

vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: async () => boundary.noticesReleased }));
vi.mock("@/platform/release-flags/viewer", () => ({ releaseViewerFor: async () => ({ operator: false, tester: false }) }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: async () => boundary.emailOverride }));

// The SQL side (ids, cross-business guard, receipts) is proven by
// tests/internal-tool-links-schema.sql. Here the database is a recorder so
// the service's order of calls and its failure handling are visible.
vi.mock("@/products/applications/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/products/applications/repository")>();
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      boundary.calls.push({ name, args });
      const respond = boundary.responses[name];
      return respond ? respond(args) : { data: null, error: null };
    },
    from() { throw new Error("not used"); },
  };
  return {
    ...actual,
    durableDb: () => db,
    load: async () => ({
      work: { id: workId, workspaceId, productId: "applications", resourceKind: "application", title: "New client intake", payload: {}, createdBy: "operator", createdAt: "", updatedAt: "" },
      state: boundary.state,
    }),
    runtime: () => ({ workId, workspaceId, title: "New client intake", records: [] }),
  };
});

import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { createApplicationDraft, createApplicationService } from "@/products/applications/server";
import type { ApplicationSpec } from "@/products/applications/contracts";
import {
  assertLinkFieldsReleased,
  assignedPersonEmail,
  missingItem,
  notifyAssignedPerson,
  recordTitle,
  resolveRecordLinks,
  toolSignInUrl,
} from "@/products/applications/internal-tool-links";

const workId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";
const noticeId = "55555555-5555-4555-8555-555555555555";
const staff = { userId: "66666666-6666-4666-8666-666666666666", verifiedEmail: "staff@leslie.example.test" };

const spec: ApplicationSpec = {
  title: "New client intake",
  maintenanceOwner: "operator",
  fields: [
    { id: "business", label: "Client business", type: "text", required: true },
    { id: "client", label: "Client contact", type: "contact", required: true },
    { id: "handler", label: "Handled by", type: "assigned_person", required: false },
    { id: "statements", label: "Bank statements", type: "boolean", required: false },
    { id: "notes", label: "Private notes", type: "text", required: false },
  ],
  components: [{ kind: "form", fields: ["business", "client", "handler", "statements", "notes"] }],
};
const db = {
  async rpc(name: string, args: Record<string, unknown>) {
    boundary.calls.push({ name, args });
    const respond = boundary.responses[name];
    return respond ? respond(args) : { data: null, error: null };
  },
};
const resolved = () => ({ data: { client: { id: contactId, created: true, conflict: false }, handler: { id: personId, created: false, conflict: false } }, error: null });
const claimed = () => ({ data: { claimed: true, noticeId, status: "pending", recipientEmail: "sam@leslie.example.test", personName: "Sam Rivera" }, error: null });

beforeEach(() => {
  boundary.calls = [];
  boundary.responses = {};
  boundary.noticesReleased = true;
  boundary.emailOverride = "inherit";
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_INTERNAL_TOOL_NOTICES_RELEASE", "1");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.strelva.example.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("contact and assigned-person fields", () => {
  it("are refused while STRELVA_SYSTEMS_RELEASE is off", () => {
    expect(() => assertLinkFieldsReleased(spec, false)).toThrow("Contact and assigned-person fields are not available yet.");
    expect(() => assertLinkFieldsReleased({ ...spec, fields: [spec.fields[0]!], components: [{ kind: "form", fields: ["business"] }] }, false)).not.toThrow();
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "");
    // createApplicationDraft is the one draft builder for create, from-source and plan output.
    expect(() => createApplicationDraft({ ...spec, maintenanceOwner: staff.userId }, staff)).toThrow(WorkspaceConflictError);
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    expect(createApplicationDraft({ ...spec, maintenanceOwner: staff.userId }, staff).spec.fields.map((field) => field.type))
      .toEqual(["text", "contact", "assigned_person", "boolean", "text"]);
    expect(() => createApplicationDraft({ ...spec, maintenanceOwner: staff.userId, fields: [...spec.fields, { id: "second", label: "Second", type: "assigned_person", required: false }] }, staff))
      .toThrow(/one assigned person/);
  });

  it("turns typed emails and phones into business record ids", async () => {
    boundary.responses.resolve_internal_tool_links = resolved;
    const result = await resolveRecordLinks(db, staff, { workspaceId, workId }, spec,
      { id: "r1", values: { business: "Brightline", client: "owner@brightline.example.test", handler: "sam@leslie.example.test" } },
      { client: { name: "Brightline Co" } });
    expect(boundary.calls).toEqual([{ name: "resolve_internal_tool_links", args: {
      p_workspace_id: workspaceId, p_work_id: workId, p_user_id: staff.userId, p_verified_email: staff.verifiedEmail,
      p_links: [
        { fieldId: "client", kind: "contact", email: "owner@brightline.example.test", name: "Brightline Co" },
        { fieldId: "handler", kind: "assigned_person", email: "sam@leslie.example.test" },
      ],
    } }]);
    expect(result).toEqual({ record: { id: "r1", values: { business: "Brightline", client: contactId, handler: personId } }, conflicts: [] });
  });

  it("reads a value without @ as a phone, leaves ids alone and reports an email/phone conflict", async () => {
    boundary.responses.resolve_internal_tool_links = () => ({ data: { client: { id: contactId, created: false, conflict: true } }, error: null });
    const result = await resolveRecordLinks(db, staff, { workspaceId, workId }, spec,
      { id: "r1", values: { business: "Acme", client: "(716) 555-0100", handler: personId } });
    expect(boundary.calls[0]!.args.p_links).toEqual([{ fieldId: "client", kind: "contact", phone: "(716) 555-0100" }]);
    expect(result.record.values).toEqual({ business: "Acme", client: contactId, handler: personId });
    expect(result.conflicts).toEqual(["Client contact"]);
  });

  it("makes no call when every link is already an id", async () => {
    const record = { id: "r1", values: { business: "Acme", client: contactId } };
    expect(await resolveRecordLinks(db, staff, { workspaceId, workId }, spec, record)).toEqual({ record, conflicts: [] });
    expect(boundary.calls).toEqual([]);
  });

  it("explains an unknown staff email and refuses outsiders", async () => {
    boundary.responses.resolve_internal_tool_links = () => ({ data: null, error: { message: "application_record_person_unknown" } });
    await expect(resolveRecordLinks(db, staff, { workspaceId, workId }, spec, { id: "r1", values: { business: "A", handler: "nobody@example.test" } }))
      .rejects.toThrow("Handled by: that email isn't on this business's staff.");
    boundary.responses.resolve_internal_tool_links = () => ({ data: null, error: { message: "workspace_membership_required" } });
    await expect(resolveRecordLinks(db, staff, { workspaceId, workId }, spec, { id: "r1", values: { business: "A", client: "a@b.example.test" } }))
      .rejects.toBeInstanceOf(WorkspaceAccessError);
    boundary.responses.resolve_internal_tool_links = () => ({ data: null, error: { message: "application_record_link_denied" } });
    await expect(resolveRecordLinks(db, staff, { workspaceId, workId }, spec, { id: "r1", values: { business: "A", client: "a@b.example.test" } }))
      .rejects.toThrow("Contacts and staff come from this business only.");
  });
});

describe("the assigned-person email", () => {
  const record = { id: "r1", values: { business: "Brightline\nCo", client: contactId, handler: personId, statements: false, notes: "Owes back taxes" } };

  it("names the tool, the record title and the one missing item, and nothing else from the record", () => {
    expect(recordTitle(spec, record)).toBe("Brightline Co");
    expect(missingItem(spec, record)).toBe("Bank statements");
    expect(missingItem(spec, { ...record, values: { ...record.values, statements: true } })).toBeNull();
    const url = toolSignInUrl(workspaceId, workId);
    expect(url).toBe(`https://app.strelva.example.test/sign-in?next=${encodeURIComponent(`/workspace?workspaceId=${workspaceId}&view=applications&work=${workId}`)}`);
    const email = assignedPersonEmail({ toolTitle: spec.title, title: "Brightline Co", missing: "Bank statements", personName: "Sam Rivera", signInUrl: url });
    expect(email.subject).toBe("New client intake: Brightline Co");
    expect(email.options.button).toEqual({ label: "Sign in to open it", url });
    const text = JSON.stringify(email);
    expect(text).toContain("Still missing: Bank statements.");
    expect(text).toContain("Hi Sam,");
    expect(text).not.toContain("Owes back taxes");
    expect(text).not.toContain(contactId);
  });

  it("sends once through the shared email path and records the receipt", async () => {
    boundary.responses.claim_internal_tool_submit_notice = claimed;
    const send = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-1", acceptedAt: "2026-10-07T12:00:00Z" }));
    const result = await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send });
    expect(result).toEqual({ status: "sent", noticeId });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      audience: "client", to: "sam@leslie.example.test", subject: "New client intake: Brightline Co",
      idempotencyKey: `internal-tool-notice:${noticeId}`,
    }));
    expect(boundary.calls.map((call) => call.name)).toEqual(["claim_internal_tool_submit_notice", "finish_internal_tool_notice"]);
    expect(boundary.calls[1]!.args).toEqual({ p_notice_id: noticeId, p_workspace_id: workspaceId, p_status: "sent", p_detail: null, p_provider_message_id: "provider-1" });
  });

  it("records a suppression receipt while client email is paused", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    boundary.responses.claim_internal_tool_submit_notice = claimed;
    const result = await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send: sendEmailWithReceipt });
    expect(result.status).toBe("suppressed");
    expect(boundary.calls[1]!.args).toMatchObject({ p_status: "suppressed", p_detail: "email_suppressed_or_unconfigured" });
  });

  it("records a failure receipt when the provider throws, without failing the submit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    boundary.responses.claim_internal_tool_submit_notice = claimed;
    const send = vi.fn(async () => { throw new Error("provider down"); });
    const result = await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send });
    expect(result).toEqual({ status: "failed", noticeId });
    expect(boundary.calls[1]!.args).toMatchObject({ p_status: "failed", p_detail: "provider down" });
  });

  it("never sends twice for the same record and skips a person with no email", async () => {
    const send = vi.fn();
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: false, noticeId, status: "sent" }, error: null });
    expect(await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send })).toEqual({ status: "duplicate", noticeId });
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: false, noticeId, status: "skipped" }, error: null });
    expect(await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send })).toEqual({ status: "skipped", noticeId });
    expect(await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record: { id: "r2", values: { business: "No one" } } }, { send })).toEqual({ status: "skipped", noticeId });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a failed claim as a failed notice instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: null, error: { message: "internal_tool_notice_denied" } });
    expect(await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send: vi.fn() })).toEqual({ status: "failed" });
  });
});

describe("owner notices and release gates", () => {
  const record = { id: "r-owner", values: { business: "Brightline", notes: "Private tax details" } };
  const plainSpec = { ...spec, fields: [spec.fields[0]!], components: [{ kind: "form" as const, fields: ["business"] }] };
  it("notifies the owner even without an assigned-person field, using the tenant mail gate", async () => {
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: true, noticeId, recipientEmail: "owner@example.test", tenantId: "gldf" }, error: null });
    const send = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "owner-send", acceptedAt: "2026-10-10T12:00:00Z" }));
    expect((await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec: plainSpec, record }, { send })).status).toBe("sent");
    expect(boundary.calls[0]!.args.p_field_id).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test", tenantId: "gldf", audience: "client" }));
    expect(JSON.stringify(send.mock.calls)).not.toContain("Private tax details");
  });
  it("addresses the owner and assigned person once, deduplicating the same address", async () => {
    const send = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "one-send", acceptedAt: "2026-10-10T12:00:00Z" }));
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: true, noticeId, recipientEmail: "owner@example.test", assignedEmail: "sam@example.test" }, error: null });
    await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["owner@example.test", "sam@example.test"] }));
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: true, noticeId, recipientEmail: "owner@example.test", assignedEmail: "owner@example.test" }, error: null });
    await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ to: "owner@example.test" }));
  });
  it.each(["STRELVA_INTERNAL_TOOL_NOTICES_RELEASE", "STRELVA_WORKSPACE_RELEASE"])("does no database or send work with %s off", async flag => {
    vi.stubEnv(flag, "0");
    const send = vi.fn();
    expect(await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send })).toEqual({ status: "none" });
    expect(boundary.calls).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
  it("honors a per-business off row", async () => {
    boundary.noticesReleased = false;
    expect(await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send: vi.fn() })).toEqual({ status: "none" });
    expect(boundary.calls).toEqual([]);
  });
  it.each(["EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED"])("requires %s even with a tenant override on", async flag => {
    vi.stubEnv(flag, "false");
    boundary.emailOverride = "on";
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: true, noticeId, recipientEmail: "owner@example.test", tenantId: "gldf" }, error: null });
    const send = vi.fn();
    expect((await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send })).status).toBe("suppressed");
    expect(send).not.toHaveBeenCalled();
    expect(boundary.calls.at(-1)!.args.p_status).toBe("suppressed");
  });
  it("honors reb:client-email off even when global sending is enabled", async () => {
    boundary.emailOverride = "off";
    boundary.responses.claim_internal_tool_submit_notice = () => ({ data: { claimed: true, noticeId, recipientEmail: "owner@example.test", tenantId: "gldf" }, error: null });
    const send = vi.fn();
    expect((await notifyAssignedPerson(db, staff, { workspaceId, workId, toolTitle: spec.title, spec, record }, { send })).status).toBe("suppressed");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("member submit of a live tool", () => {
  const release = { version: 1, spec, publishedAt: "2026-10-07T12:00:00Z", publishedBy: "operator", provenance: "published" as const };
  beforeEach(() => {
    boundary.state = { currentReleaseVersion: 1, releases: [release], recordsRevision: 0, status: "installed" };
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("resolves links, saves ids, then claims one notice", async () => {
    boundary.responses.resolve_internal_tool_links = resolved;
    boundary.responses.claim_internal_tool_submit_notice = claimed;
    const result = await createApplicationService().submit(staff, workId, {
      expectedReleaseVersion: 1, expectedRecordsRevision: 0,
      record: { id: "r1", values: { business: "Brightline", client: "owner@brightline.example.test", handler: "sam@leslie.example.test" } },
    });
    expect(boundary.calls.map((call) => call.name)).toEqual(["resolve_internal_tool_links", "submit_application_record", "claim_internal_tool_submit_notice", "finish_internal_tool_notice"]);
    expect(boundary.calls[1]!.args.p_values).toEqual({ business: "Brightline", client: contactId, handler: personId });
    expect(result).toMatchObject({ linkResult: { notice: "suppressed", contactConflicts: [] } });
  });

  it("saves nothing when a contact cannot be resolved", async () => {
    boundary.responses.resolve_internal_tool_links = () => ({ data: null, error: { message: "application_record_invalid" } });
    await expect(createApplicationService().submit(staff, workId, {
      expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "r1", values: { business: "A", client: "not an email" } },
    })).rejects.toThrow("Check the email or phone in this record.");
    expect(boundary.calls.map((call) => call.name)).toEqual(["resolve_internal_tool_links"]);
  });

  it("refuses to use a tool with link fields while the flag is off", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "");
    await expect(createApplicationService().submit(staff, workId, {
      expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "r1", values: { business: "A", client: contactId } },
    })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(boundary.calls).toEqual([]);
  });

  it("leaves a tool without link fields exactly as before", async () => {
    boundary.state = { currentReleaseVersion: 1, releases: [{ ...release, spec: { ...spec, fields: [spec.fields[0]!], components: [{ kind: "form", fields: ["business"] }] } }], recordsRevision: 0, status: "installed" };
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "");
    const result = await createApplicationService().submit(staff, workId, { expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "r1", values: { business: "A" } } });
    expect(boundary.calls.map((call) => call.name)).toEqual(["submit_application_record"]);
    expect(result).not.toHaveProperty("linkResult");
  });
});
