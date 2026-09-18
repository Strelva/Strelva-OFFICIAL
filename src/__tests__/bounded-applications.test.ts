import { describe, expect, it } from "vitest";
import { createApplicationService } from "@/products/applications/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

describe("bounded applications", () => {
  it("creates an isolated fixed-parts portal and requires a passing rehearsal before installation", async () => {
    const service = createApplicationService(memoryBoundedStore());
    const created = await service.create(owner, "workspace-a", {
      title: "Repair requests", maintenanceOwner: owner.userId,
      fields: [{ id: "problem", label: "Problem", type: "text", required: true }],
      components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }],
    });
    await expect(service.command(owner, created.id, { kind: "install", expectedRevision: 0 })).rejects.toThrow(/rehearsal/i);
    const rehearsed = await service.command(owner, created.id, { kind: "rehearse", expectedRevision: 0 });
    const installed = await service.command(owner, created.id, { kind: "install", expectedRevision: rehearsed.payload.revision });
    expect(installed.payload.status).toBe("installed");
    expect(installed.payload.rehearsal?.checks.every(check => check.passed)).toBe(true);
  });
  it("denies other workspaces, arbitrary scripts and stale changes without losing records", async () => {
    const service = createApplicationService(memoryBoundedStore());
    const spec = { title: "Requests", maintenanceOwner: owner.userId, fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }] };
    await expect(service.create(owner, "workspace-b", spec)).rejects.toThrow(/denied/i);
    await expect(service.create(owner, "workspace-a", { ...spec, script: "fetch('/secrets')" })).rejects.toThrow();
    const app = await service.create(owner, "workspace-a", spec);
    await service.command(owner, app.id, { kind: "rehearse", expectedRevision: 0 });
    await expect(service.command(owner, app.id, { kind: "install", expectedRevision: 0 })).rejects.toThrow(/changed/i);
    await service.command(owner, app.id, { kind: "install", expectedRevision: 1 });
    await service.command(owner, app.id, { kind: "submit", expectedRevision: 2, record: { id: "r1", values: { problem: "Broken door" } } });
    await expect(service.command(owner, app.id, { kind: "revise", expectedRevision: 3, spec: { ...spec, fields: [{ id: "problem", label: "Problem", type: "number", required: true }] } })).rejects.toThrow(/wrong type/i);
    expect((await service.read(owner, app.id)).payload.records[0]!.values.problem).toBe("Broken door");
    await expect(service.read({ userId: "outsider", verifiedEmail: "other@example.com" }, app.id)).rejects.toThrow(/denied/i);
  });

  it("requires new rehearsal after a version change and rolls back without erasing history", async () => {
    const service = createApplicationService(memoryBoundedStore());
    const spec = { title: "Requests", maintenanceOwner: owner.userId, fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }] };
    const app = await service.create(owner, "workspace-a", spec);
    await service.command(owner, app.id, { kind: "rehearse", expectedRevision: 0 });
    await service.command(owner, app.id, { kind: "revise", expectedRevision: 1, spec: { ...spec, title: "Maintenance" } });
    await expect(service.command(owner, app.id, { kind: "install", expectedRevision: 2 })).rejects.toThrow(/rehearsal/i);
    const restored = await service.command(owner, app.id, { kind: "rollback", expectedRevision: 2, version: 1 });
    expect(restored.payload).toMatchObject({ title: "Requests", specVersion: 3, status: "draft", rehearsal: null });
    expect(restored.payload.versions.map(version => version.spec.title)).toEqual(["Requests", "Maintenance", "Requests"]);
  });

  it("installs reusable spec without records and preserves local edits when adopting a source version", async () => {
    const service = createApplicationService(memoryBoundedStore());
    const spec = { title: "Template", maintenanceOwner: owner.userId, fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }] };
    const source = await service.create(owner, "workspace-a", spec);
    await service.command(owner, source.id, { kind: "rehearse", expectedRevision: 0 });
    await service.command(owner, source.id, { kind: "install", expectedRevision: 1 });
    await service.command(owner, source.id, { kind: "submit", expectedRevision: 2, record: { id: "private", values: { problem: "Private customer message" } } });
    const copy = await service.fromSource(owner, "workspace-a", source.id);
    expect(copy.payload.records).toEqual([]);
    expect(copy.payload.installation).toMatchObject({ sourceWorkId: source.id, sourceVersion: 1 });
    await service.command(owner, copy.id, { kind: "revise", expectedRevision: 0, spec: { ...spec, title: "Our local title" } });
    const revisedSpec = { ...spec, components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }] };
    await service.command(owner, source.id, { kind: "revise", expectedRevision: 3, spec: revisedSpec });
    await service.command(owner, source.id, { kind: "rehearse", expectedRevision: 4 });
    await service.command(owner, source.id, { kind: "install", expectedRevision: 5 });
    const updated = await service.command(owner, copy.id, { kind: "adopt_update", expectedRevision: 1, sourceVersion: 2 });
    expect(updated.payload.spec.title).toBe("Our local title");
    expect(updated.payload.spec.components).toHaveLength(2);
    expect(updated.payload.status).toBe("draft");
    await service.command(owner, copy.id, { kind: "revise", expectedRevision: 2, spec: { ...updated.payload.spec, fields: [{ ...spec.fields[0], label: "Local description" }] } });
    await service.command(owner, source.id, { kind: "revise", expectedRevision: 6, spec: { ...revisedSpec, fields: [{ ...spec.fields[0], label: "Source description" }] } });
    await service.command(owner, source.id, { kind: "rehearse", expectedRevision: 7 });
    await service.command(owner, source.id, { kind: "install", expectedRevision: 8 });
    await expect(service.command(owner, copy.id, { kind: "adopt_update", expectedRevision: 3, sourceVersion: 3 })).rejects.toThrow(/conflicts with local/i);
    expect((await service.read(owner, copy.id)).payload.spec.fields[0]!.label).toBe("Local description");

  });

});
