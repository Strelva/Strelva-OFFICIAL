import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPrivateApplicationSource, publishPrivateApplicationSource, sharePrivateApplicationSource, readPrivateApplicationSources } from "@/experience/workspace/agency/private-definition-server";
import { VersionAccessError, VersionValidationError } from "@/platform/system-versions";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";
const actor = { userId: randomUUID(), verifiedEmail: "owner@example.test" };
const workspaceId = randomUUID(), systemId = randomUUID(), revisionId = randomUUID(), destination = randomUUID();
const source = { businessId: workspaceId, systemId };
const definition = { kind: "internal_app", title: "Requests", fields: [{ id: "request", label: "What do you need?", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] };
function fixture(role = "owner", via = "membership") {
    let revision: Record<string, unknown> | null = null;
    let sharedWith: string[] = [];
    let exited = false;
    const rpc = vi.fn<VersionsDb["rpc"]>(async (name, args) => {
        const record = { source, hidden: true, sharedWith, createdAt: "2026-10-09T00:00:00Z" };
        if (name === "read_version_actor")
            return { data: { userId: actor.userId, memberships: [{ businessId: workspaceId, role, via }] }, error: null };
        if (name === "read_workspace_version_sources")
            return { data: { workspaceId, sources: [{ workspaceId, systemId, name: "Requests", versions: [{ records: "PRIVATE" }] }] }, error: null };
        if (name === "workspace_exit_completed")
            return { data: exited, error: null };
        if (name === "read_system_version_source")
            return { data: record, error: null };
        if (name === "read_system_version_source_revisions")
            return { data: revision ? [revision] : [], error: null };
        if (["create_system_version_source", "publish_private_application_source", "set_private_application_source_share"].includes(name) && (role === "member" || via === "provider_seat" || exited))
            return { data: null, error: { message: "business_record_access_denied" } };
        if (name === "create_system_version_source")
            return { data: { system: { id: systemId, businessId: workspaceId }, source: record }, error: null };
        if (name === "publish_private_application_source") {
            revision = args.p_revision as Record<string, unknown>;
            return { data: revision, error: null };
        }
        if (name === "record_system_revision_qualification") {
            const qualification = { revisionId, status: "pending", evidence: ["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"].map(check => ({ revisionId, check, status: "passed", note: "Unit adapter fixture" })), humanReview: { state: "pending", reviewerId: null, reviewedAt: null, note: "" } };
            if (revision)
                revision.qualification = qualification;
            return { data: qualification, error: null };
        }
        if (name === "set_private_application_source_share") {
            sharedWith = args.p_shared ? [String(args.p_business_id)] : [];
            return { data: { ...record, sharedWith }, error: null };
        }
        throw Error(`Unexpected ${name}`);
    });
    return { rpc, exit: () => { exited = true; } };
}
describe("ordinary private application source producer", () => {
    it.each(["owner", "admin"])("uses the same native authority for ordinary %s without an agency entitlement", async (role) => {
        const db = fixture(role);
        expect(await createPrivateApplicationSource(actor, { workspaceId, name: "Requests", commandId: systemId }, db)).toEqual({ source, hidden: true });
        const input = { workspaceId, systemId, commandId: revisionId, expectedRevision: 0, definition, summary: "Reusable requests" };
        const published = await publishPrivateApplicationSource(actor, input, db);
        expect(published.definition).toEqual(definition);
        expect(published.source).toEqual({ ...source, revisionId, number: 1 });
        expect(published.qualification?.status).not.toBe("qualified");
        await publishPrivateApplicationSource(actor, input, db);
        expect(db.rpc.mock.calls.filter(([name]) => name === "publish_private_application_source")).toHaveLength(1);
        expect(await sharePrivateApplicationSource(actor, { workspaceId, systemId, businessId: destination, shared: true }, db)).toMatchObject({ sharedWith: [destination] });
        expect(db.rpc.mock.calls.map(([name]) => name).some(name => /agency|provider|approval/.test(name))).toBe(false);
        const graph = await readPrivateApplicationSources(actor, workspaceId, undefined, db);
        expect(graph).toMatchObject({ canAuthor: true, sources: [{ systemId, name: "Requests", qualified: false }] });
        expect(JSON.stringify(graph)).not.toContain("PRIVATE");
        await expect(publishPrivateApplicationSource(actor, { ...input, summary: "Changed retry" }, db)).rejects.toThrow();
    });
    it("propagates current native membership refusal without writes or widening provider seats", async () => {
        for (const db of [fixture("member"), fixture("admin", "provider_seat")]) {
            await expect(createPrivateApplicationSource(actor, { workspaceId, name: "Requests", commandId: systemId }, db)).rejects.toBeInstanceOf(VersionAccessError);
            await expect(sharePrivateApplicationSource(actor, { workspaceId, systemId, businessId: destination, shared: true }, db)).rejects.toBeInstanceOf(VersionAccessError);
        }
        await expect(readPrivateApplicationSources(actor, workspaceId, undefined, fixture("admin", "provider_seat"))).rejects.toBeInstanceOf(VersionAccessError);
    });
    it("retains read-only summaries after exit and refuses a forged exact incoming revision", async () => {
        const db = fixture();
        db.exit();
        expect((await readPrivateApplicationSources(actor, workspaceId, undefined, db)).canAuthor).toBe(false);
        await expect(readPrivateApplicationSources(actor, workspaceId, { ...source, revisionId, number: 1 }, db)).rejects.toBeInstanceOf(VersionAccessError);
        await expect(createPrivateApplicationSource(actor, { workspaceId, name: "Requests", commandId: systemId }, db)).rejects.toBeInstanceOf(VersionValidationError);
        await expect(sharePrivateApplicationSource(actor, { workspaceId, systemId, businessId: destination, shared: true }, db)).rejects.toBeInstanceOf(VersionValidationError);
        await expect(publishPrivateApplicationSource(actor, { workspaceId, systemId, commandId: revisionId, expectedRevision: 0, definition, summary: "Stopped" }, db)).rejects.toBeInstanceOf(VersionValidationError);
        expect(db.rpc.mock.calls.some(([name]) => /^(create|publish|set)_/.test(name))).toBe(false);
    });
});
