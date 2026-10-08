import { describe, expect, it } from "vitest";
import {
  assertDeclaredPackageBehavior, cloneJson, createInMemoryConnectionOwnership,
  createInMemoryVersionStore, createSystemVersions, declareApplicationPackage,
  inferPackageDeclaration, readPackageDeclaration, VersionDeclarationError,
  VersionIncompatibleError, type JsonObject, type PackageDeclaration, type VersionActor,
} from "@/platform/system-versions";
import { mapVersionsError } from "@/platform/system-versions/supabase-store";

const owner: VersionActor = { userId: "owner", memberships: [{ businessId: "business", role: "owner" }] };
const source = { businessId: "business", systemId: "source" };
function definition(type = "text", extra: JsonObject[] = []): JsonObject {
  const fields = [{ id: "subject", type, label: "Subject", required: true }, ...extra];
  return declareApplicationPackage({ kind: "internal_app", title: "Client requests", fields,
    components: [{ kind: "form", fields: fields.map(field => field.id!) }, { kind: "list", fields: fields.map(field => field.id!) }] });
}
async function fixture(initial = definition()) {
  const store = createInMemoryVersionStore();
  const connections = createInMemoryConnectionOwnership();
  const service = createSystemVersions({ store, connections });
  const revision = await service.publishSourceRevision(owner, { source, definition: initial, summary: "First" });
  const lineage = await service.createVersion(owner, { source: revision.source, version: { businessId: "business", systemId: "client" },
    context: { kind: "agency_client", label: "Client" } });
  return { store, connections, service, revision, lineage };
}

describe("revision-bound package declarations", () => {
  it("derives read/write fields, outside effects and exact outbound data from the supported runtime", () => {
    const basic = inferPackageDeclaration(definition("text", [{ id: "notes", label: "Notes", type: "text", required: false }]));
    expect(basic.recordsRead).toEqual(["application_records", "business_owner"]);
    expect(basic.recordsWritten).toEqual(["application_records"]);
    expect(basic.outsideEffects).toEqual(["email"]);
    expect(basic.dataEgress.find(flow => flow.destination === "business_owner_email")?.fields).toEqual(expect.arrayContaining([
      "application_records.values.subject", "application_records.values.notes", "application.labels.notes", "business_owner.email",
    ]));
    const linked = inferPackageDeclaration(definition("contact", [{ id: "assignee", label: "Assigned", type: "assigned_person", required: false }]));
    expect(linked.recordsWritten).toContain("business_contacts");
    expect(linked.businessFields.written).toEqual(expect.arrayContaining(["business_contacts.email", "business_contacts.source"]));
    expect(linked.recordsRead).toContain("business_people");
    expect(linked.businessFields.read).toContain("business_people.active");
    expect(linked.dataEgress.find(flow => flow.destination === "assigned_person_email")?.fields).toContain("business_people.name");
    expect(linked.dataEgress.find(flow => flow.destination === "shared_application_view")?.fields).toContain("business_contacts.phone");
    expect(linked.bindingKinds).toEqual([]);
  });

  it.each([
    ["read records", (value: PackageDeclaration) => { value.recordsRead = []; }],
    ["written records", (value: PackageDeclaration) => { value.recordsWritten = []; }],
    ["read fields", (value: PackageDeclaration) => { value.businessFields.read = []; }],
    ["written fields", (value: PackageDeclaration) => { value.businessFields.written = []; }],
    ["effects", (value: PackageDeclaration) => { value.outsideEffects = []; }],
    ["egress recipients", (value: PackageDeclaration) => { value.dataEgress = []; }],
    ["egress fields", (value: PackageDeclaration) => { value.dataEgress[0]!.fields = []; }],
  ] as const)("refuses a publication underdeclaring %s before creating any source state", async (_name, narrow) => {
    const declared = definition("contact");
    narrow(declared.declaration as PackageDeclaration);
    const store = createInMemoryVersionStore();
    const service = createSystemVersions({ store, connections: createInMemoryConnectionOwnership() });
    await expect(service.publishSourceRevision(owner, { source, definition: declared, summary: "Undeclared" })).rejects.toBeInstanceOf(VersionDeclarationError);
    expect(await store.getSource(owner, source)).toBeNull();
    expect(await store.listRevisions(owner, source)).toEqual([]);
  });

  it("requires an exact binding-requirement set and rechecks ownership at release", async () => {
    const declared = definition();
    const authority = declared.declaration as PackageDeclaration;
    authority.bindingKinds = ["email_sender"];
    expect(() => assertDeclaredPackageBehavior(declared, authority, [])).toThrow(VersionDeclarationError);
    const store = createInMemoryVersionStore(), connections = createInMemoryConnectionOwnership({ connection: "business" });
    const service = createSystemVersions({ store, connections });
    const revision = await service.publishSourceRevision(owner, { source, definition: declared, requires: { bindingKinds: ["email_sender"] }, summary: "Declared prerequisite" });
    let lineage = await service.createVersion(owner, { source: revision.source, version: { businessId: "business", systemId: "client" }, context: { kind: "agency_client", label: "Client" } });
    await expect(service.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision })).rejects.toBeInstanceOf(VersionIncompatibleError);
    lineage = await service.bindAccount(owner, lineage.id, { kind: "email_sender", connectionId: "connection", expectedRowRevision: lineage.rowRevision });
    connections.register("connection", "foreign_business");
    await expect(service.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision })).rejects.toBeInstanceOf(VersionIncompatibleError);
    expect((await store.getLineage(owner, lineage.id))?.releases).toEqual([]);
    connections.register("connection", "business");
    await expect(service.release(owner, lineage.id, { expectedRowRevision: lineage.rowRevision })).resolves.toMatchObject({ currentRelease: 1 });
  });

  it.each(["application.labels.subject", "application.options.subject", "application.release_version", "application_records.revision"])("refuses missing shared-view egress %s independently of email allowances", path => {
    const declared = definition("number");
    declared.fields = [{ id: "subject", type: "select", label: "Private tier", required: true, options: ["Tier A", "Tier B"] }];
    declared.declaration = inferPackageDeclaration(declared);
    const authority = cloneJson(declared.declaration) as PackageDeclaration;
    const shared = authority.dataEgress.find(flow => flow.destination === "shared_application_view")!;
    expect(shared.fields).toContain(path);
    shared.fields = shared.fields.filter(field => field !== path);
    expect(() => assertDeclaredPackageBehavior(declared, authority, [])).toThrow(VersionDeclarationError);
  });

  it("blocks same-ID number-to-select option egress at release without mutating state", async () => {
    const f = await fixture(definition("number"));
    const draft = await f.service.setOverride(owner, f.lineage.id, { path: "fields", expectedRowRevision: 1,
      value: [{ id: "subject", label: "Subject", type: "select", required: true, options: ["Private tier A", "Private tier B"] }] });
    const before = await f.store.getLineage(owner, draft.id);
    await expect(f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision })).rejects.toBeInstanceOf(VersionDeclarationError);
    expect(await f.store.getLineage(owner, draft.id)).toEqual(before);
  });

  it("does not include hidden labels or options until a component exposes the field", () => {
    const declared = definition("number", [{ id: "hidden", label: "Private tier", type: "select", required: true, options: ["Private A"] }]);
    declared.components = [{ kind: "form", fields: ["subject"] }];
    declared.declaration = inferPackageDeclaration(declared);
    const shared = (declared.declaration as PackageDeclaration).dataEgress.find(flow => flow.destination === "shared_application_view")!;
    expect(shared.fields).not.toContain("application.labels.hidden");
    expect(shared.fields).not.toContain("application.options.hidden");
    expect(() => assertDeclaredPackageBehavior(declared, declared.declaration, [])).not.toThrow();
    declared.components = [{ kind: "form", fields: ["subject", "hidden"] }];
    expect(() => assertDeclaredPackageBehavior(declared, declared.declaration, [])).toThrow(VersionDeclarationError);
  });

  it.each([undefined, null, {}, { schemaVersion: 2 }, { ...inferPackageDeclaration(definition()), outsideEffects: ["http"] },
    { ...inferPackageDeclaration(definition()), recordsRead: ["*"] },
    { ...inferPackageDeclaration(definition()), bindingKinds: ["email_sender", "email_sender"] },
    { ...inferPackageDeclaration(definition()), extra: true },
  ])("fails closed for incomplete, unknown or malformed declaration %#", value => {
    expect(() => readPackageDeclaration(value)).toThrow(VersionDeclarationError);
  });

  it.each([
    { title: "Untyped" }, { kind: "website" }, { ...definition(), outsideEffects: ["payment"] },
    { ...definition(), fields: [{ id: "subject", label: "Subject", required: true, type: "http" }] },
    { ...definition(), fields: [{ id: "subject", label: "Subject", required: true, type: "select", options: [" Untrimmed "] }] },
    { ...definition(), components: [{ kind: "webhook", fields: ["subject"] }] },
    { ...definition(), components: [{ kind: "list", fields: ["unknown"] }] },
  ] as JsonObject[])("refuses unsupported effective definitions %# even with plausible claims", value => {
    expect(() => assertDeclaredPackageBehavior(value, definition().declaration, [])).toThrow(VersionDeclarationError);
  });

  it("allows cosmetic edits and behavior subsets, preserving the source ceiling", async () => {
    const f = await fixture(definition("contact"));
    let draft = await f.service.setOverride(owner, f.lineage.id, { path: "title", value: "My client requests", expectedRowRevision: 1 });
    draft = await f.service.setOverride(owner, draft.id, { path: "fields", value: definition("number").fields, expectedRowRevision: draft.rowRevision });
    const released = await f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision });
    expect(released.currentRelease).toBe(1);
    expect(released.releases[0]?.definition.declaration).toEqual(f.revision.definition.declaration);
  });

  it.each(["contact", "assigned_person"])("blocks a local %s field widening atomically", async type => {
    const f = await fixture(definition("number"));
    const draft = await f.service.setOverride(owner, f.lineage.id, { path: "fields", value: definition(type).fields, expectedRowRevision: 1 });
    const before = await f.store.getLineage(owner, draft.id);
    await expect(f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision })).rejects.toBeInstanceOf(VersionDeclarationError);
    expect(await f.store.getLineage(owner, draft.id)).toEqual(before);
  });

  it("cannot gain permission from a local declaration or whole-definition replacement", async () => {
    const f = await fixture();
    await expect(f.service.setOverride(owner, f.lineage.id, { path: "declaration", value: definition("contact").declaration, expectedRowRevision: 1 })).rejects.toBeInstanceOf(VersionDeclarationError);
    const draft = await f.service.setOverride(owner, f.lineage.id, { path: "*", value: definition("contact"), expectedRowRevision: 1 });
    await expect(f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision })).rejects.toBeInstanceOf(VersionDeclarationError);
  });

  it("does not let a newer unadopted revision widen the current authority", async () => {
    const f = await fixture(definition("number"));
    await f.service.publishSourceRevision(owner, { source, definition: definition("contact"), summary: "New contacts" });
    const draft = await f.service.setOverride(owner, f.lineage.id, { path: "fields", value: definition("contact").fields, expectedRowRevision: 1 });
    await expect(f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision })).rejects.toBeInstanceOf(VersionDeclarationError);
  });

  it("rechecks keep-local behavior against a newly narrowed adopted declaration", async () => {
    const f = await fixture(definition("contact"));
    const localFields = cloneJson(definition("contact").fields) as JsonObject[];
    localFields[0]!.label = "Local client";
    let draft = await f.service.setOverride(owner, f.lineage.id, { path: "fields", value: localFields, expectedRowRevision: 1 });
    await f.service.publishSourceRevision(owner, { source, definition: definition("number"), summary: "Remove contact resolution" });
    draft = await f.service.adoptImprovement(owner, draft.id, { revision: 2, resolutions: [{ path: "fields", choice: "keep_local" }], expectedRowRevision: draft.rowRevision });
    expect(draft.baseline.revision).toBe(2);
    await expect(f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision })).rejects.toBeInstanceOf(VersionDeclarationError);
  });

  it("does not restore old permissions when restoring an old release after adoption", async () => {
    const f = await fixture(definition("contact"));
    let draft = await f.service.release(owner, f.lineage.id, { expectedRowRevision: 1 });
    await f.service.publishSourceRevision(owner, { source, definition: definition("number"), summary: "Narrowed behavior" });
    draft = await f.service.adoptImprovement(owner, draft.id, { revision: 2, expectedRowRevision: draft.rowRevision });
    draft = await f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision });
    draft = await f.service.restoreReleaseDraft(owner, draft.id, { releaseNumber: 1, expectedRowRevision: draft.rowRevision });
    expect(draft.overrides[0]?.value).toMatchObject({ declaration: definition("number").declaration });
    await expect(f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision })).rejects.toBeInstanceOf(VersionDeclarationError);
    expect((await f.store.getLineage(owner, draft.id))?.currentRelease).toBe(2);
  });

  it("allows a restored subset after an explicitly adopted broader revision", async () => {
    const f = await fixture();
    let draft = await f.service.release(owner, f.lineage.id, { expectedRowRevision: 1 });
    const broad = definition("text", [{ id: "contact", label: "Contact", type: "contact", required: false }]);
    await f.service.publishSourceRevision(owner, { source, definition: broad, summary: "Contacts supported" });
    draft = await f.service.adoptImprovement(owner, draft.id, { revision: 2, expectedRowRevision: draft.rowRevision });
    draft = await f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision });
    draft = await f.service.restoreReleaseDraft(owner, draft.id, { releaseNumber: 1, expectedRowRevision: draft.rowRevision });
    const released = await f.service.release(owner, draft.id, { expectedRowRevision: draft.rowRevision });
    expect(released.currentRelease).toBe(3);
    expect(released.releases[2]?.definition.declaration).toEqual(broad.declaration);
  });

  it("keeps undeclared legacy source drafts readable but refuses any new release", async () => {
    const f = await fixture({ title: "Legacy shape" });
    await expect(f.service.readVersion(owner, f.lineage.id)).resolves.toMatchObject({ workingDefinition: { title: "Legacy shape" } });
    await expect(f.service.release(owner, f.lineage.id, { expectedRowRevision: 1 })).rejects.toBeInstanceOf(VersionDeclarationError);
  });

  it("preserves Google listing copy drafts without allowing a native Version release", async () => {
    const f = await fixture({ kind: "google_listing", post: { topicType: "STANDARD", summary: "Local hours update" } });
    expect((await f.service.readVersion(owner, f.lineage.id)).currentRelease).toBeNull();
    await expect(f.service.release(owner, f.lineage.id, { expectedRowRevision: 1 })).rejects.toBeInstanceOf(VersionDeclarationError);
    await expect(f.service.publishSourceRevision(owner, { source, definition: { kind: "google_listing", declaration: definition().declaration! }, summary: "Forged native authority" })).rejects.toBeInstanceOf(VersionDeclarationError);
  });

  it("rejects tampered cached baseline metadata instead of trusting it", async () => {
    const f = await fixture();
    await f.store.updateLineage(owner, { ...f.lineage, baseline: { revision: 1, definition: definition("contact") } }, 1);
    await expect(f.service.release(owner, f.lineage.id, { expectedRowRevision: 2 })).rejects.toBeInstanceOf(VersionDeclarationError);
  });

  it("uses the owned Version's pin even when the source revision list is no longer shared", async () => {
    const f = await fixture();
    f.store.getRevision = async () => null;
    f.store.listRevisions = async () => [];
    await expect(f.service.release(owner, f.lineage.id, { expectedRowRevision: 1 })).resolves.toMatchObject({ currentRelease: 1 });
  });

  it("refuses prototype paths that could forge inherited declaration metadata", async () => {
    const f = await fixture();
    for (const path of ["__proto__.declaration", "constructor.prototype.declaration", "declaration.recordsRead"]) {
      await expect(f.service.setOverride(owner, f.lineage.id, { path, value: [], expectedRowRevision: 1 })).rejects.toThrow();
    }
    expect((await f.store.getLineage(owner, f.lineage.id))?.rowRevision).toBe(1);
  });

  it("maps the database refusal to a distinct failure, never no-op validation success", () => {
    expect(() => mapVersionsError({ message: "system_version_declaration_invalid" }, "Failed")).toThrow(VersionDeclarationError);
  });
});
