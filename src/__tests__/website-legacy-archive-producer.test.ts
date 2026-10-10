import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getWork } from "@/platform/workspaces/repository";
import { createWebsiteService } from "@/products/websites/server";
import { websiteSchema } from "@/products/websites/contracts";
import { generateWebsiteArtifact } from "@/products/websites/generation";
import { captureLegacyWebsiteArchive, validateLegacyWebsiteArchive, legacyArchiveRecord, legacyArchiveSqlSerialization } from "@/products/websites/legacy-archive";
const state = vi.hoisted(() => ({ row: {} as Record<string,unknown>, tables: [] as string[] }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: (table: string) => {
  state.tables.push(table);
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "workspace_memberships" ? { role: "owner" } : state.row, error: null }) };
  return query;
} }) }));
const key = { workspaceId: "11111111-1111-4111-8111-111111111111", workId: "22222222-2222-4222-8222-222222222222" };
const actor = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "owner@example.com" };
async function fixture() {
  const brief = { businessName: "Juniper Bread", description: "Fresh bread.", primaryCallToAction: "Contact us" };
  const bundle = await generateWebsiteArtifact({ ...key, revision: 1, brief });
  const payload = { version: 1, revision: 1, title: brief.businessName, brief, candidate: bundle.candidate, status: "preview_ready", approvedCandidateRevision: null, launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: null, createdBy: actor.userId, createdAt: bundle.generatedAt, history: [] };
  state.row = { id: key.workId, workspace_id: key.workspaceId, product_id: "websites", resource_kind: "website", title: null, input: null, source_work_id: null, created_by: actor.userId, created_at: bundle.generatedAt, updated_at: bundle.generatedAt, payload };
  const work = await getWork(actor,key.workId);
  if (!work) throw new Error("Missing fixture work");
  return { work, bundle };
}
describe("actual getWork archive source and recovery controls", () => {
  it("captures actual mapWork undefined optionals with exact JSON wire omission", async () => {
    const { work } = await fixture();
    expect(work).toHaveProperty("sourceWorkId",undefined);
    expect(work).toHaveProperty("title",undefined);
    expect(work).toHaveProperty("input",undefined);
    const archive = captureLegacyWebsiteArchive(work,key);
    expect(JSON.parse(archive.sourceJson)).toEqual(JSON.parse(JSON.stringify(work)));
    expect(JSON.parse(archive.sourceJson)).not.toHaveProperty("sourceWorkId");
    expect(validateLegacyWebsiteArchive(archive)).toEqual(archive);
    expect(state.tables).toContain("saved_product_work");
  });
  it("preserves raw whitespace source while projecting the exact old normalized reader", async () => {
    const { work } = await fixture();
    const payload = work.payload as { title:string; brief:{businessName:string} };
    payload.title = "  Juniper Bread  "; payload.brief.businessName = "  Juniper Bread  ";
    const archive=captureLegacyWebsiteArchive(work,key);
    expect(JSON.parse(archive.sourceJson).payload.title).toBe("  Juniper Bread  ");
    expect(legacyArchiveRecord(archive).website).toEqual(websiteSchema.parse(work.payload));
    const oldReader=createWebsiteService({ member:async()=>{},read:async()=>work,create:async()=>{throw new Error("unexpected creation");},update:async()=>{throw new Error("unexpected edit");} });
    expect(legacyArchiveRecord(archive)).toEqual(await oldReader.read(actor,key.workId));
    expect(legacyArchiveRecord(archive).website.title).toBe("Juniper Bread");
    expect(JSON.parse(archive.sourceJson).payload.title).toBe("  Juniper Bread  ");
  });
  it("binds exact UTF8 canonical text without relying on postgres JSONB formatting", async () => {
    const { work } = await fixture();
    const payload=work.payload as { brief:{notes?:string} };payload.brief.notes='Café Buffalo 🦬\n"quoted"';
    const archive=captureLegacyWebsiteArchive(work,key);const sql=legacyArchiveSqlSerialization(archive);
    expect(createHash("sha256").update(Buffer.from(sql.sourceJson,"utf8")).digest("hex")).toBe(archive.sourceDigest);
    expect(createHash("sha256").update(Buffer.from(sql.evidenceJson,"utf8")).digest("hex")).toBe(archive.evidenceDigest);
    expect(JSON.parse(sql.sourceJson)).toEqual(JSON.parse(JSON.stringify(work)));
    expect(JSON.parse(sql.evidenceJson)).toEqual(archive.versions);
    const preimage=`{"evidenceDigest":"${archive.evidenceDigest}","kind":"website_legacy_archive","sourceDigest":"${archive.sourceDigest}","sourceRevision":${archive.sourceRevision},"workId":"${archive.sourceWorkId}","workspaceId":"${archive.workspaceId}"}`;
    expect(createHash("sha256").update(preimage,"utf8").digest("hex")).toBe(archive.archiveId);
  });
  it("pins JS key/string/number canonical boundaries and refuses unsupported PostgreSQL values", async () => {
    const { work } = await fixture();
    work.input={"10":"ten","2":"two", "\uE000":"BMP", "🦬":"supplementary", edge:[-0,0.000001,1e-7,Number.MAX_SAFE_INTEGER]};
    const archive=captureLegacyWebsiteArchive(work,key);
    expect(archive.sourceJson.indexOf('"2":"two"')).toBeLessThan(archive.sourceJson.indexOf('"10":"ten"'));
    expect(archive.sourceJson.indexOf('"🦬":"supplementary"')).toBeLessThan(archive.sourceJson.indexOf('"\uE000":"BMP"'));
    expect(archive.sourceJson).toContain('"edge":[0,0.000001,1e-7,9007199254740991]');
    for (const unsupported of [9007199254740992,"NUL\u0000", "unpaired\uD800"]) {
      work.input={unsupported};expect(()=>captureLegacyWebsiteArchive(work,key)).toThrow();
    }
    work.input={deep:{lost:undefined}};expect(()=>captureLegacyWebsiteArchive(work,key)).toThrow();
  });
  it("retains all503 valid historical/current/approved/launch references", async () => {
    const { work } = await fixture();
    const payload = work.payload as { history: unknown[]; candidate: { revision: number; preview: { revision: number } }; approvedCandidateRevision: number; launch: { candidateRevision: number } };
    payload.history = Array.from({ length:500 },(_,i) => ({ revision:i+1,kind:"candidate_generated",actorId:actor.userId,at:work.createdAt,candidateRevision:i+1,note:null }));
    payload.candidate.revision=501;payload.candidate.preview.revision=501;payload.approvedCandidateRevision=502;payload.launch.candidateRevision=503;
    const archive = captureLegacyWebsiteArchive(work,key);
    expect(archive.versions).toHaveLength(503);
    expect(archive.versions.filter(v => v.availability === "body_unresolved")).toHaveLength(502);
    expect(validateLegacyWebsiteArchive(archive)).toEqual(archive);
  });
  it("refuses a missing manifest instead of treating file-hash verification as manifest proof", async () => {
    const { work,bundle } = await fixture();
    bundle.files=bundle.files.filter(file=>file.path!=="artifact-manifest.json");
    expect(() => captureLegacyWebsiteArchive(work,key,[bundle])).toThrow("manifest is missing");
  });
  it("rejects a forged manifest even when its new file hash passes the old bundle verifier", async () => {
    const { work,bundle } = await fixture();
    const manifest = bundle.files.find(file => file.path === "artifact-manifest.json")!;
    const changed = JSON.parse(manifest.content);changed.workId="44444444-4444-4444-8444-444444444444";
    manifest.content=JSON.stringify(changed);manifest.bytes=Buffer.byteLength(manifest.content);manifest.sha256=createHash("sha256").update(manifest.content).digest("hex");
    expect(() => captureLegacyWebsiteArchive(work,key,[bundle])).toThrow("manifest");
  });
});
