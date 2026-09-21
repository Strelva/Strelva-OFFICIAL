import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => boundary.database }));

import {
  acceptOnboardingRequirement,
  attachExistingOnboardingDocument,
  assignOnboardingCase,
  createOnboardingCase,
  requestOnboardingCorrection,
  readOnboardingCase,
  readOnboardingOriginalFile,
  reviewOnboardingRequirement,
  listOnboardingAttachableDocuments,
  uploadOnboardingFile,
} from "@/products/onboarding/server";
import { editWorkspaceDocument, saveWorkspaceDocument } from "@/products/documents/server";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;
type TestDatabase = ReturnType<typeof databaseBoundary>;
let testDatabase: TestDatabase;

function databaseBoundary() {
  const tables: Record<string, Row[]> = {
    workspace_memberships: [{ workspace_id: workspaceId, user_id: actor.userId, role: "owner" }],
    saved_product_work: [],
    workspace_delegations: [],
  };

  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let insertion: Row | undefined;
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      order() { return query; },
      limit() { return query; },
      insert(value: Row) { insertion = value; return query; },
      async maybeSingle() { const result = await execute(); return { ...result, data: result.data[0] ?? null }; },
      async single() { return query.maybeSingle(); },
      update(value: Row) { const rows = tables[table] ?? []; rows.forEach((row) => { if (filters.every((filter) => filter(row))) Object.assign(row, value); }); return query; },
      then(resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown, reject?: (error: unknown) => unknown) { return execute().then(resolve, reject); },
    };
    async function execute() {
      if (!tables[table]) throw new Error(`Unexpected table ${table}`);
      if (insertion) {
        const at = new Date().toISOString();
        const row = { ...structuredClone(insertion), id: crypto.randomUUID(), created_at: at, updated_at: at };
        tables[table].push(row);
        insertion = undefined;
        return { data: [structuredClone(row)], count: 1, error: null };
      }
      const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      return { data: structuredClone(rows), count: rows.length, error: null };
    }
    return query;
  }

  return {
    from,
    async rpc(name: string, args: Row) {
      if (name === "update_document_work") {
        const work = (tables.saved_product_work ?? []).find((row) => row.id === args.p_work_id);
        if (!work || work.workspace_id !== args.p_workspace_id || work.product_id !== "documents") return { data: null, error: { message: "workspace_access_denied" } };
        const payload = work.payload as Row;
        if (payload.revision !== args.p_expected_revision) return { data: null, error: { message: "document_revision_conflict" } };
        work.payload = structuredClone(args.p_payload);
        work.updated_at = new Date().toISOString();
        return { data: [structuredClone(work)], error: null };
      }
      if (name !== "update_onboarding_work") throw new Error(`Unexpected RPC ${name}`);
      const work = (tables.saved_product_work ?? []).find((row) => row.id === args.p_work_id);
      if (!work || work.workspace_id !== args.p_workspace_id) return { data: null, error: { message: "workspace_access_denied" } };
      const payload = work.payload as Row;
      if (payload.revision !== args.p_expected_revision) return { data: null, error: { message: "onboarding_revision_conflict" } };
      work.payload = structuredClone(args.p_payload);
      work.title = (args.p_payload as Row).title;
      work.updated_at = new Date().toISOString();
      return { data: [structuredClone(work)], error: null };
    },
    forceDocumentRevision(workId: string) {
      const work = (tables.saved_product_work ?? []).find((row) => row.id === workId);
      if (!work) throw new Error("document work not found");
      const payload = work.payload as Row;
      work.payload = { ...payload, revision: Number(payload.revision) + 1 };
    },
  };
}

beforeEach(() => { testDatabase = databaseBoundary(); boundary.database = testDatabase; });
afterEach(() => { vi.restoreAllMocks(); });

describe("onboarding requirements", () => {
  it("keeps an assigned customer case reviewable through upload, correction, acceptance, and replacement", async () => {
    const created = await createOnboardingCase(actor, {
      workspaceId,
      title: "Vendor onboarding",
      subjectType: "supplier",
      subjectLabel: "Acme Supplies",
      requirements: [{ key: "tax_id", label: "Tax ID", fields: [{ key: "taxId", label: "Tax ID" }] }],
    });
    const requirementId = created.case.requirements[0]!.id;
    expect(created.case.requirements[0]).toMatchObject({ status: "missing", document: null });

    const assigned = await assignOnboardingCase(actor, created.workId, { email: "reviewer@example.com" });
    expect(assigned.case.assignee).toEqual({ email: "reviewer@example.com" });

    const uploaded = await uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId,
      file: new File(["Tax ID: 12-3456789"], "tax-id.txt", { type: "text/plain" }),
    });
    const supplied = await readOnboardingCase(actor, created.workId);
    expect(uploaded.extraction).toMatchObject({ status: "available", provider: "local-text" });
    expect(supplied.case.requirements[0]).toMatchObject({
      status: "supplied",
      document: { revision: 0, provenance: { storageBoundary: "saved_product_work", source: "upload" } },
      proposedData: { taxId: "12-3456789" },
    });

    const reopened = await uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId,
      file: new File(["Tax ID: 12-3456789"], "tax-id.txt", { type: "text/plain" }),
      reopenOnly: true,
    });
    expect(reopened.document).toMatchObject({ text: "Tax ID: 12-3456789", provenance: { originalName: "tax-id.txt" } });
    const original = await readOnboardingOriginalFile(actor, reopened.document!.workId);
    expect(original.bytes.toString("utf8")).toBe("Tax ID: 12-3456789");
    expect(original.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);

    await reviewOnboardingRequirement(actor, created.workId, requirementId, { taxId: "12-3456789" });
    const accepted = await acceptOnboardingRequirement(actor, created.workId, requirementId);
    expect(accepted.case.requirements[0]).toMatchObject({ status: "accepted", acceptedRevision: 0, reviewedData: { taxId: "12-3456789" } });
    await expect(reviewOnboardingRequirement(actor, created.workId, requirementId, { taxId: "12-3456789" })).rejects.toThrow(/accepted/i);
    const correction = await requestOnboardingCorrection(actor, created.workId, requirementId, "Please confirm the current tax record.");
    expect(correction.case).toMatchObject({ status: "in_progress", requirements: [{ status: "correction", acceptedRevision: null }] });

    const replacement = await uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId,
      file: new File(["Tax ID: 98-7654321"], "tax-id-new.txt", { type: "text/plain" }),
    });
    expect(replacement.case.requirements[0]).toMatchObject({ status: "supplied", acceptedRevision: null, proposedData: { taxId: "98-7654321" } });
    expect(replacement.case.history.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["created", "assigned", "supplied", "reviewed", "accepted"]));
  });

  it("makes correction explicit and refuses acceptance after the linked document revision changes", async () => {
    const created = await createOnboardingCase(actor, {
      workspaceId,
      title: "Customer onboarding",
      subjectType: "customer",
      subjectLabel: "Northwind",
      requirements: [{ key: "agreement", label: "Signed agreement", fields: [{ key: "name", label: "Name" }] }],
    });
    const requirementId = created.case.requirements[0]!.id;
    const uploaded = await uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId,
      file: new File(["Name: Northwind"], "agreement.txt", { type: "text/plain" }),
    });
    const supplied = await readOnboardingCase(actor, created.workId);
    const documentWorkId = supplied.case.requirements[0]!.document!.workId;
    await reviewOnboardingRequirement(actor, created.workId, requirementId, { name: "Northwind" });
    const corrected = await requestOnboardingCorrection(actor, created.workId, requirementId, "The signature page is missing.");
    expect(corrected.case.requirements[0]).toMatchObject({ status: "correction", acceptedRevision: null, reviewedData: null });
    await reviewOnboardingRequirement(actor, created.workId, requirementId, { name: "Northwind" });
    await expect(editWorkspaceDocument(actor, documentWorkId, { kind: "edit", expectedRevision: 0, title: "agreement.txt", text: "Name: Northwind\nSigned: yes" })).rejects.toThrow(/immutable/i);
    testDatabase.forceDocumentRevision(documentWorkId);
    await expect(acceptOnboardingRequirement(actor, created.workId, requirementId)).rejects.toThrow(/version changed/i);
    expect(uploaded.extraction?.status).toBe("available");
  });

  it("reports unavailable extraction without inventing a provider result", async () => {
    const created = await createOnboardingCase(actor, {
      workspaceId,
      title: "Employee onboarding",
      subjectType: "employee",
      subjectLabel: "Jordan Lee",
      requirements: [{ key: "identity", label: "Identity document", fields: [{ key: "name", label: "Name" }] }],
    });
    const requirementId = created.case.requirements[0]!.id;
    const uploaded = await uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId,
      file: new File(["%PDF-unsupported"], "identity.pdf", { type: "application/pdf" }),
    });
    expect(uploaded.extraction).toMatchObject({ status: "unavailable", provider: "none" });
    expect(uploaded.extraction?.message).toMatch(/provider|manually/i);
    expect((await readOnboardingCase(actor, created.workId)).case.requirements[0]).toMatchObject({ status: "supplied", proposedData: {} });
  });

  it("attaches an existing document revision and makes an accepted link visibly stale after a source edit", async () => {
    const source = await saveWorkspaceDocument(actor, workspaceId, { title: "Supplier record", text: "Legal name: Northwind" });
    const created = await createOnboardingCase(actor, {
      workspaceId,
      title: "Existing record onboarding",
      subjectType: "supplier",
      subjectLabel: "Northwind",
      requirements: [{ key: "supplier_record", label: "Supplier record", fields: [{ key: "legalName", label: "Legal name" }] }],
    });
    const requirementId = created.case.requirements[0]!.id;
    expect(await listOnboardingAttachableDocuments(actor, workspaceId)).toEqual([expect.objectContaining({ workId: source.workId, revision: 0, title: "Supplier record" })]);

    const attached = await attachExistingOnboardingDocument(actor, { workspaceId, caseId: created.workId, requirementId, documentWorkId: source.workId });
    expect(attached.case.requirements[0]).toMatchObject({ status: "supplied", document: { source: "saved_document", revision: 0, provenance: null }, proposedData: { legalName: "Northwind" } });
    await reviewOnboardingRequirement(actor, created.workId, requirementId, { legalName: "Northwind" });
    await acceptOnboardingRequirement(actor, created.workId, requirementId);

    await editWorkspaceDocument(actor, source.workId, { kind: "edit", expectedRevision: 0, title: "Supplier record", text: "Legal name: Northwind Trading" });
    const stale = await readOnboardingCase(actor, created.workId);
    expect(stale.case.requirements[0]).toMatchObject({ status: "correction", stale: true, acceptedRevision: null });
    await expect(reviewOnboardingRequirement(actor, created.workId, requirementId, { legalName: "Northwind Trading" })).rejects.toThrow(/changed|current/i);

    const refreshed = await attachExistingOnboardingDocument(actor, { workspaceId, caseId: created.workId, requirementId, documentWorkId: source.workId });
    expect(refreshed.case.requirements[0]).toMatchObject({ status: "supplied", stale: false, document: { source: "saved_document", revision: 1 } });
    await reviewOnboardingRequirement(actor, created.workId, requirementId, { legalName: "Northwind Trading" });
    const accepted = await acceptOnboardingRequirement(actor, created.workId, requirementId);
    expect(accepted.case.requirements[0]).toMatchObject({ status: "accepted", acceptedRevision: 1 });
  });

  it("rejects private files larger than the stated limit before storing them", async () => {
    const created = await createOnboardingCase(actor, {
      workspaceId,
      title: "Large file onboarding",
      subjectType: "customer",
      subjectLabel: "Northwind",
      requirements: [{ key: "agreement", label: "Agreement", fields: [] }],
    });
    await expect(uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId: created.case.requirements[0]!.id,
      file: new File([new Uint8Array(2_000_001)], "agreement.bin", { type: "application/octet-stream" }),
    })).rejects.toThrow(/2MB/i);
  });

  it("uses the existing local CSV parser for proposed requirement information", async () => {
    const created = await createOnboardingCase(actor, {
      workspaceId,
      title: "Supplier CSV onboarding",
      subjectType: "supplier",
      subjectLabel: "Northwind",
      requirements: [{ key: "supplier_record", label: "Supplier record", fields: [{ key: "legalName", label: "Legal name" }, { key: "taxId", label: "Tax ID" }] }],
    });
    const requirementId = created.case.requirements[0]!.id;
    await uploadOnboardingFile(actor, {
      workspaceId,
      caseId: created.workId,
      requirementId,
      file: new File(["Legal name,Tax ID\nNorthwind,12-3456789\n"], "supplier.csv", { type: "text/csv" }),
    });
    expect((await readOnboardingCase(actor, created.workId)).case.requirements[0]).toMatchObject({ proposedData: { legalName: "Northwind", taxId: "12-3456789" } });
  });
});
