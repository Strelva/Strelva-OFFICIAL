import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { ordinaryAgencyMaker, ordinaryCustomerBusiness } from "./support/ordinary-agency-maker";
import { configuredPackageReviewer } from "./support/configured-package-reviewer";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and database.");
test.setTimeout(180_000);
async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
async function read(request: APIRequestContext, workId: string) {
  const response = await request.get(`/api/bounded-work?productId=applications&workId=${workId}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function command(request: APIRequestContext, workId: string, input: unknown) {
  return post(request, "/api/bounded-work", { action: "command", productId: "applications", workId, command: input });
}

test("independently owned businesses install and update definitions without copying customer records", async ({ browser }, info) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const builder = await signedInContext(browser, admin, "reuse-builder");
  const customer = await signedInContext(browser, admin, "reuse-customer");
  let reviewer: Awaited<ReturnType<typeof configuredPackageReviewer>> | undefined;
  try {
    const customerSpace = await ordinaryCustomerBusiness(customer, "Harbor repair business");
    const sourceSpace = await ordinaryCustomerBusiness(builder, "Source repair business");
    const maker = await ordinaryAgencyMaker(browser, admin, customer, customerSpace, builder);
    const created = await post(builder.context.request, "/api/workspace/version-sources", { action: "create", workspaceId: maker.agencyId,
      name: "Repair requests reusable definition", commandId: randomUUID() },201);
    const source = created.source;
    let definition = { kind: "internal_app", title: "Repair requests",
      fields: [{ id: "problem", label: "Problem", type: "text", required: true }],
      components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }] };
    let expectedRevision=0;
    async function publishSource() {
      const revision = await post(builder.context.request, "/api/workspace/version-sources", { action: "publish", workspaceId: maker.agencyId,
        systemId: source.systemId, commandId: randomUUID(), expectedRevision, definition, summary: "Reviewed reusable repair definition" },201);
      expectedRevision=revision.source.number;
      const checks = await post(builder.context.request, "/api/workspace/packages", { action: "qualify", workspaceId: maker.agencyId, revisionId: revision.source.revisionId });
      if(!reviewer){
        await post(builder.context.request,"/api/workspace/version-sources",{action:"share",workspaceId:maker.agencyId,systemId:source.systemId,businessId:customerSpace,shared:true});
        await post(customer.context.request,"/api/workspace/version-sources",{action:"install",workspaceId:customerSpace,source:revision.source,name:"Pending-review installation",commandId:randomUUID()},400);
        await post(builder.context.request,"/api/workspace/packages",{action:"review",workspaceId:maker.agencyId,revisionId:revision.source.revisionId,approve:true,note:"Ordinary agency is not a platform reviewer."},403);
        const refusedWorks=await admin.from("saved_product_work").select("id").eq("workspace_id",customerSpace).eq("product_id","applications");
        expect(refusedWorks.error).toBeNull();expect(refusedWorks.data).toEqual([]);
        reviewer=await configuredPackageReviewer(browser,admin);
      }
      const reviewed = await post(reviewer.context.request, "/api/workspace/packages", { action: "review", workspaceId: maker.agencyId, revisionId: revision.source.revisionId,
        approve: true, note: "Checked repair definition and actual isolated native rehearsal under the configured local review policy." });
      expect(checks.revisionId).toBe(revision.source.revisionId);
      expect(checks.evidence.every((item:{status:string})=>item.status==="passed")).toBe(true);
      expect(reviewed.status).toBe("qualified");
      expect(reviewed.humanReview.state).toBe("approved");
      expect(reviewed.humanReview.reviewerId).toBe(reviewer.userId);
      await info.attach(`private-source-revision-${revision.source.number}-local-review`,{contentType:"application/json",body:Buffer.from(JSON.stringify({
        localFictionalPolicy:true,productionQualification:false,source:revision.source,definition:revision.definition,checks,review:reviewed,
        reviewer:{userId:reviewer.userId,policyVersion:reviewer.policyVersion}},null,2))});
      return revision;
    }
    const first = await publishSource();
    for(const businessId of [sourceSpace,customerSpace])await post(builder.context.request,"/api/workspace/version-sources",{action:"share",workspaceId:maker.agencyId,systemId:source.systemId,businessId,shared:true});
    async function install(request: APIRequestContext, workspaceId: string) {
      const installed = await post(request, "/api/workspace/version-sources", { action: "install", workspaceId, source: first.source,
        name: "Repair requests", commandId: randomUUID() }, 201);
      const person = workspaceId === sourceSpace ? builder : customer;
      const native = await admin.rpc("read_version_native_runtime", { p_workspace_id: workspaceId, p_user_id: person.userId,
        p_verified_email: person.email, p_version_id: installed.versionId });
      expect(native.error).toBeNull();
      expect(native.data.kind).toBe("internal_app");
      return { ...installed, workId: native.data.workId as string };
    }
    async function releaseVersion(request:APIRequestContext,version:{workspaceId:string;systemId:string;versionId:string;workId:string}){
      const response=await request.get(`/api/workspace/versions?workspaceId=${version.workspaceId}&systemId=${version.systemId}`);
      expect(response.status(),await response.text()).toBe(200);
      const current=await response.json();
      const prepared=await post(request,"/api/workspace/versions/manage",{action:"prepare_release",workspaceId:version.workspaceId,systemId:version.systemId,versionId:version.versionId,rowRevision:current.rowRevision});
      expect(prepared.outcome).toBe("prepared");
      const needs=await request.get(`/api/workspace/needs-you?workspaceId=${version.workspaceId}`);
      expect(needs.status(),await needs.text()).toBe(200);
      const item=(await needs.json()).items.find((item:{id:string})=>item.id===prepared.receipt.decisionId);
      expect(item).toBeTruthy();
      const done=await post(request,"/api/workspace/needs-you",{workspaceId:version.workspaceId,itemId:item.id,revision:item.revisionHash,decision:"approve"});
      expect(done.status).toBe("done");
      return read(request,version.workId);
    }
    const sourceInstall = await install(builder.context.request, sourceSpace);
    let sourceApp = await releaseVersion(builder.context.request, sourceInstall);
    sourceApp = await command(builder.context.request, sourceApp.id, { kind: "submit", expectedReleaseVersion: 1, expectedRecordsRevision: 0,
      record: { id: "source-private", values: { problem: "Private source business record" } } });
    const commandId=randomUUID();
    const grant=await post(customer.context.request,"/api/workspace/version-sources",{action:"grant_install",workspaceId:customerSpace,agencyWorkspaceId:maker.agencyId,revisionId:first.source.revisionId,commandId,expiresAt:new Date(Date.now()+3_600_000).toISOString()});
    const installedVersion=await post(builder.context.request,"/api/workspace/version-sources",{action:"install",workspaceId:customerSpace,source:first.source,name:"Harbor repairs",commandId},201);
    const nativeTarget=await admin.rpc("read_version_native_runtime",{p_workspace_id:customerSpace,p_user_id:customer.userId,p_verified_email:customer.email,p_version_id:installedVersion.versionId});
    expect(nativeTarget.error).toBeNull();
    const target={...installedVersion,workId:nativeTarget.data.workId as string};
    expect(grant.commandId).toBe(commandId);
    let installed = await read(customer.context.request, target.workId);
    expect(installed.workspaceId).toBe(customerSpace);
    expect(installed.payload.records).toEqual([]);
    expect(JSON.stringify(installed)).not.toContain("Private source business record");
    expect((await customer.context.request.get(`/api/bounded-work?productId=applications&workId=${sourceApp.id}`)).status()).toBe(403);
    installed = await releaseVersion(customer.context.request, target);
    installed = await command(customer.context.request, target.workId, { kind: "submit", expectedReleaseVersion: 1, expectedRecordsRevision: 0,
      record: { id: "customer-record", values: { problem: "Customer business record" } } });
    // Customer manages its Version; this does not grant general app authoring.
    const versionPath = `/api/workspace/versions?workspaceId=${customerSpace}&systemId=${target.systemId}`;
    async function view() {
      const response = await customer.context.request.get(versionPath);
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    }
    let current = await view();
    await post(builder.context.request,"/api/workspace/versions/manage",{action:"override",workspaceId:customerSpace,systemId:target.systemId,versionId:target.versionId,rowRevision:current.rowRevision,path:"title",value:"Agency draft label"});
    current=await view();
    expect(current.workingDefinition.title).toBe("Agency draft label");
    expect((await read(customer.context.request,target.workId)).payload.release.spec.title).toBe("Repair requests");
    await post(customer.context.request, "/api/workspace/versions/manage", { action: "override", workspaceId: customerSpace,
      systemId: target.systemId, versionId: target.versionId, rowRevision: current.rowRevision, path: "title", value: "Harbor repairs" });
    definition = { ...definition, fields: [{ id: "problem", label: "Repair detail", type: "text", required: true }] };
    const second = await publishSource();
    current = await view();
    await post(customer.context.request, "/api/workspace/versions", { action: "adopt", workspaceId: customerSpace,
      systemId: target.systemId, versionId: target.versionId, rowRevision: current.rowRevision, revision: second.source.number });
    current=await view();
    expect(current.workingDefinition.title).toBe("Harbor repairs");
    expect(current.workingDefinition.fields[0].label).toBe("Repair detail");
    installed = await read(customer.context.request, target.workId);
    expect(installed.payload.release.version).toBe(1);
    expect(installed.payload.release.spec.fields[0].label).toBe("Problem");
    expect(installed.payload.records).toEqual([{ id: "customer-record", values: { problem: "Customer business record" } }]);
    expect(JSON.stringify(installed)).not.toContain("Private source business record");
    installed = await releaseVersion(customer.context.request, target);
    expect(installed.payload.release.version).toBe(2);
    expect(installed.payload.release.spec.title).toBe("Harbor repairs");
    expect(installed.payload.release.spec.fields[0].label).toBe("Repair detail");
    definition = { ...definition, title: "Source changed its name" };
    const third = await publishSource();
    current = await view();
    const before = await read(customer.context.request, target.workId);
    await post(customer.context.request, "/api/workspace/versions", { action: "adopt", workspaceId: customerSpace,
      systemId: target.systemId, versionId: target.versionId, rowRevision: current.rowRevision, revision: third.source.number }, 409);
    expect(await read(customer.context.request, target.workId)).toEqual(before);
    // Explicit source withdrawal is current authority, not a cached grant.
    await post(builder.context.request,"/api/workspace/version-sources",{action:"share",workspaceId:maker.agencyId,systemId:source.systemId,businessId:customerSpace,shared:false});
    await post(customer.context.request, "/api/workspace/version-sources", { action: "install", workspaceId: customerSpace,
      source: third.source, name: "Withdrawn package", commandId: randomUUID() }, 403);
    expect(await read(customer.context.request, target.workId)).toEqual(before);
    expect((await builder.context.request.get(`/api/bounded-work?productId=applications&workId=${target.workId}`)).status()).toBe(403);
  } finally { await reviewer?.context.close(); await builder.context.close(); await customer.context.close(); }
});
