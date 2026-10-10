import { proofEnvironment } from "../../scripts/private-authority-proof-environment.mjs";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type Browser } from "@playwright/test";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";
import { publishPrivateApplicationSource, grantPrivateApplicationInstall } from "@/experience/workspace/agency/private-definition-server";
import { manageBusinessVersion, decideSystemImprovement } from "@/experience/workspace/agency/version-server";
import { localEnvironment, signedInContext } from "./local-auth";
import { ordinaryAgencyMaker, ordinaryCustomerBusiness } from "./ordinary-agency-maker";
import { configuredPackageReviewer } from "./configured-package-reviewer";

export const forward = resolve("supabase/migrations/20261022123000_private_definition_versions.sql");
export const inverse = resolve("supabase/migrations/rollback-20261022123000_private_definition_versions.sql");
const fixedPath = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
export { proofEnvironment } from "../../scripts/private-authority-proof-environment.mjs";

function sha(path: string) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
export function candidate() {
  return { sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", env: { PATH: fixedPath, LC_ALL: "C", NODE_ENV: "test" } }).trim(), forwardSha256: sha(forward), inverseSha256: sha(inverse) };
}
export function receipt(value: unknown) {
  proofEnvironment();
  const root = realpathSync(process.env.STRELVA_PRIVATE_SOURCE_PROOF_DIR!);
  if (statSync(root).uid !== process.getuid?.()) throw new Error("Owned proof directory required.");
  const path = join(root, `private-authority-${randomUUID()}.json`);
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" }); return path;
}
export function runProof(path: string, mode: "source" | "grant" | "expiry" | "staff" | "revision" | "membership" | "membership-dual-role") {
  const producer = mode === "source" || mode === "grant";
  return execFileSync("python3", ["-I", resolve(`scripts/${producer ? "check-private-producer-inverse-race" : "check-private-installed-version-authority"}.py`), path,
    "--forward", forward, ...(producer ? ["--inverse", inverse, "--outcome", "populated"] : []), "--case", mode],
  { encoding: "utf8", env: proofEnvironment(), timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
}
export async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status); return response.json();
}
// A closed read-only adapter records the real command at its sole write boundary.
// Unexpected RPCs fail; neither fabricated success nor fallback argument builders exist.
const reads = new Set(["require_agency_authoring_scope", "read_version_actor", "read_system_version_source", "read_system_version_source_revisions", "read_system_version", "read_system_version_for_system", "system_version_connection_holder"]);
async function capture(admin: SupabaseClient, target: string, invoke: (db: VersionsDb) => Promise<unknown>) {
  const stopped = new Error("Captured before native write"); let captured: Record<string, unknown> | undefined;
  const db: VersionsDb = { async rpc(name, args) {
    if (name === target) { if (captured) throw new Error("Repeated captured write"); captured = structuredClone(args); throw stopped; }
    if (!reads.has(name)) throw new Error(`Unexpected capture RPC: ${name}`);
    return admin.rpc(name, args);
  } };
  try { await invoke(db); throw new Error("Real adapter did not reach native write"); } catch (error) { if (error !== stopped) throw error; }
  if (!captured) throw new Error("No real command captured"); return captured;
}
export async function fixture(browser: Browser) {
  proofEnvironment(); const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const contexts: Array<{ close(): Promise<void> }> = [];
  const owner = await signedInContext(browser, admin, "private-authority-owner"); contexts.push(owner.context);
  try {
    const businessId = await ordinaryCustomerBusiness(owner, "Private authority business");
    const maker = await ordinaryAgencyMaker(browser, admin, owner, businessId); contexts.push(maker.context);
    const created = await post(maker.context.request, "/api/workspace/version-sources", { action: "create", workspaceId: maker.agencyId, name: "Authority source", commandId: randomUUID() }, 201);
    let reviewer: Awaited<ReturnType<typeof configuredPackageReviewer>> | undefined;
    const definition = { kind: "internal_app", title: "Authority requests", fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }] };
    const actor = { userId: maker.userId, verifiedEmail: maker.email };
    const ownerActor = { userId: owner.userId, verifiedEmail: owner.email };
    function publishInput(number: number) { return { workspaceId: maker.agencyId, systemId: created.source.systemId as string, commandId: randomUUID(), expectedRevision: number - 1, definition: number === 1 ? definition : { ...definition, fields: [{ ...definition.fields[0], label: "Repair detail" }] }, summary: `Qualified private authority revision ${number}` }; }
    async function publish(input: ReturnType<typeof publishInput>) {
      const published = await post(maker.context.request, "/api/workspace/version-sources", { action: "publish", ...input }, 201);
      const checks = await post(maker.context.request, "/api/workspace/packages", { action: "qualify", workspaceId: maker.agencyId, revisionId: published.source.revisionId });
      expect(checks.evidence.every((item: { status: string }) => item.status === "passed")).toBe(true);
      if (!reviewer) { reviewer = await configuredPackageReviewer(browser, admin); contexts.push(reviewer.context); }
      const reviewed = await post(reviewer.context.request, "/api/workspace/packages", { action: "review", workspaceId: maker.agencyId, revisionId: published.source.revisionId, approve: true, note: "Actual native rehearsal under the owned fictional local policy." });
      expect(reviewed.status).toBe("qualified"); expect(reviewed.humanReview.reviewerId).toBe(reviewer.userId);
      await post(maker.context.request, "/api/workspace/version-sources", { action: "share", workspaceId: maker.agencyId, systemId: created.source.systemId, businessId, shared: true });
      return published;
    }
    async function publicationReceipt(input: ReturnType<typeof publishInput>) {
      const args = await capture(admin, "publish_private_application_source", db => publishPrivateApplicationSource(actor, input, db));
      return receipt({ candidate: candidate(), provenance: { actualAdapterCapture: true, nativeWriteExecuted: false, localFictionalPolicy: true, productionQualification: false }, actor: { userId: maker.userId, email: maker.email }, producerName: "publish_private_application_source", producerArguments: args });
    }
    function grantInput(revisionId: string, lifetime = 3_600_000) { return { workspaceId: businessId, agencyWorkspaceId: maker.agencyId, revisionId, commandId: randomUUID(), expiresAt: new Date(Date.now() + lifetime).toISOString() }; }
    async function grantReceipt(input: ReturnType<typeof grantInput>) {
      const args = await capture(admin, "grant_private_application_install", db => grantPrivateApplicationInstall(ownerActor, input, db));
      return receipt({ candidate: candidate(), provenance: { actualAdapterCapture: true, nativeWriteExecuted: false, localFictionalPolicy: true, productionQualification: false }, actor: { userId: owner.userId, email: owner.email }, producerName: "grant_private_application_install", producerArguments: args });
    }
    async function installedReceipt(mode: "expiry" | "staff" | "revision" | "membership" | "membership-dual-role") {
      const first = await publish(publishInput(1));
      const second = mode === "revision" ? await publish(publishInput(2)) : undefined;
      const memberships: Array<{ userId: string; email: string; invitationId: string; agencyInvitationId?: string }> = [];
      // Create and accept genuine owner-issued memberships before the short expiry starts.
      if (mode === "membership" || mode === "membership-dual-role") {
        for (let index = 0; index < 2; index++) {
          const member = await signedInContext(browser, admin, `private-authority-admin-${index}`); contexts.push(member.context);
          async function invite(request: APIRequestContext, workspaceId: string) {
            const invitation = await post(request, "/api/workspace-invitations", { workspaceId, recipientEmail: member.email, role: "admin" }, 201);
            await post(member.context.request, `/api/workspace-invitations/accept/${invitation.token}`, {});
            return invitation.invitation.id as string;
          }
          const memberReceipt = { userId: member.userId, email: member.email, invitationId: await invite(owner.context.request, businessId) };
          if (mode === "membership-dual-role") {
            const agencyInvitationId = await invite(maker.context.request, maker.agencyId);
            await post(maker.context.request, "/api/workspace/agency-team", { action: "assign", workspaceId: maker.agencyId, userIds: [member.userId], clientIds: [businessId], active: true });
            memberships.push({ ...memberReceipt, agencyInvitationId });
          } else memberships.push(memberReceipt);
        }
      }
      const grant = grantInput(first.source.revisionId, mode === "expiry" || mode === "membership-dual-role" ? 60_000 : 3_600_000);
      const granted = await post(owner.context.request, "/api/workspace/version-sources", { action: "grant_install", ...grant });
      const installed = await post(maker.context.request, "/api/workspace/version-sources", { action: "install", workspaceId: businessId, source: first.source, name: "Private authority installation", commandId: grant.commandId }, 201);
      const native = await admin.rpc("read_version_native_runtime", { p_workspace_id: businessId, p_user_id: owner.userId, p_verified_email: owner.email, p_version_id: installed.versionId });
      expect(native.error).toBeNull(); expect(native.data.kind).toBe("internal_app");
      const currentResponse = await owner.context.request.get(`/api/workspace/versions?workspaceId=${businessId}&systemId=${installed.systemId}`);
      expect(currentResponse.status(), await currentResponse.text()).toBe(200); const current = await currentResponse.json();
      const ref = { workspaceId: businessId, systemId: installed.systemId as string, versionId: installed.versionId as string, rowRevision: current.rowRevision as number };
      const prepared = await post(maker.context.request, "/api/workspace/versions/manage", { action: "prepare_release", ...ref });
      expect(prepared.outcome).toBe("prepared"); expect(prepared.receipt.versionId).toBe(installed.versionId);
      const saveArguments = await capture(admin, "save_system_version", db => manageBusinessVersion(actor, { ...ref, action: "override", path: "title", value: "Authority baseline save" }, db));
      const mismatchSaveArguments = second ? await capture(admin, "save_system_version", db => decideSystemImprovement(actor, { ...ref, action: "adopt", revision: second.source.number }, db)) : undefined;
      return receipt({ candidate: candidate(), provenance: { actualHttpProducers: true, actualNativeRuntime: true, localFictionalPolicy: true, productionQualification: false },
        owner: { userId: owner.userId, email: owner.email }, maker: { userId: maker.userId, email: maker.email, agencyId: maker.agencyId },
        installed: { businessId, systemId: installed.systemId, versionId: installed.versionId, workId: native.data.workId, grantId: granted.grantId, commandId: grant.commandId, sourceSystemId: first.source.systemId, sourceRevisionId: first.source.revisionId, sourceRevision: first.source.number },
        preparation: { p_workspace_id: businessId, p_user_id: maker.userId, p_verified_email: maker.email, p_version_id: installed.versionId, p_row_revision: prepared.receipt.rowRevision, p_owner_decision_id: prepared.receipt.decisionId },
        saveArguments, ...(second ? { mismatch: { revisionId: second.source.revisionId, number: second.source.number }, mismatchSaveArguments } : {}), memberships });
    }
    return { publicationReceipt, grantReceipt, grantInput, publish, publishInput, installedReceipt, close: async () => { await Promise.allSettled(contexts.map(context => context.close())); } };
  } catch (error) { await Promise.allSettled(contexts.map(context => context.close())); throw error; }
}
