import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect,test } from "@playwright/test";
import { localEnvironment,signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF!=="1","Requires isolated local Supabase Auth and database.");
test.setTimeout(90_000);
test("current owner downloads a bounded usable workspace snapshot while other access is denied",async({browser},testInfo)=>{
  const env=localEnvironment();
  const admin=createClient(env.url,env.service,{auth:{persistSession:false,autoRefreshToken:false}});
  const owner=await signedInContext(browser,admin,"export-owner");
  const member=await signedInContext(browser,admin,"export-member");
  const delegate=await signedInContext(browser,admin,"export-delegate");
  const workspaceId=randomUUID(),agencyId=randomUUID(),workId=randomUUID(),jobId=randomUUID();
  try{
    expect((await admin.from("workspaces").insert([{id:workspaceId,kind:"customer",name:"Harbor Export",created_by:owner.userId},{id:agencyId,kind:"agency",name:"Outside Agency",created_by:delegate.userId}])).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([{workspace_id:workspaceId,user_id:owner.userId,role:"owner",created_by:owner.userId},{workspace_id:workspaceId,user_id:member.userId,role:"member",created_by:owner.userId},{workspace_id:agencyId,user_id:delegate.userId,role:"owner",created_by:delegate.userId}])).error).toBeNull();
    expect((await admin.from("saved_product_work").insert({id:workId,workspace_id:workspaceId,product_id:"tracker",resource_kind:"tracker",title:"Quarterly work",payload:{rows:[{name:"portable"}]},input:{privatePrompt:"excluded"},created_by:owner.userId})).error).toBeNull();
    expect((await admin.from("workspace_delegations").insert({customer_workspace_id:workspaceId,customer_work_id:workId,agency_workspace_id:agencyId,scope:["work:read"],status:"active",granted_by:owner.userId,accepted_by:delegate.userId})).error).toBeNull();
    expect((await admin.from("job_economics").insert({id:jobId,workspace_id:workspaceId,work_id:workId,product_id:"tracker",resource_kind:"tracker",payer_id:owner.userId,max_authorized_cents:500,reserved_cents:0,used_cents:0,actual_cents:null,actual_known:false,status:"draft",created_by:owner.userId})).error).toBeNull();
    for(const person of [member,delegate]){const denied=await person.context.request.post("/api/workspace-export",{headers:{origin:env.app},data:{workspaceId}});expect(denied.status()).toBe(403);}

    const page=await owner.context.newPage();
    await page.goto(`/workspace/export?workspaceId=${workspaceId}`);
    await expect(page.getByRole("heading",{name:"Download current workspace data"})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath("workspace-export-owner-desktop.png"),fullPage:true});
    const downloadPromise=page.waitForEvent("download");
    await page.getByRole("button",{name:"Download workspace JSON"}).click();
    const download=await downloadPromise; const path=await download.path(); if(!path)throw new Error("Export download path unavailable");
    const snapshot=JSON.parse(await readFile(path,"utf8"));
    expect(snapshot).toMatchObject({schemaVersion:1,workspace:{id:workspaceId,name:"Harbor Export",kind:"customer"},manifest:{scope:"current_workspace_portability_snapshot"}});
    expect(snapshot.savedResults).toHaveLength(1); expect(snapshot.savedResults[0].input).toBeUndefined();
    expect(snapshot.economics.jobs[0]).toMatchObject({actualKnown:false,actualCents:null});
    expect(JSON.stringify(snapshot)).not.toContain("privatePrompt");
    expect((await admin.from("workspace_export_receipts").select("requested_by,byte_size").eq("workspace_id",workspaceId)).data?.[0]?.requested_by).toBe(owner.userId);
    await page.setViewportSize({width:390,height:844}); await page.reload();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("workspace-export-owner-mobile.png"),fullPage:true});

    expect((await admin.from("workspace_memberships").delete().eq("workspace_id",workspaceId).eq("user_id",owner.userId)).error).toBeNull();
    const revoked=await owner.context.request.post("/api/workspace-export",{headers:{origin:env.app},data:{workspaceId}}); expect(revoked.status()).toBe(403);
  }finally{
    await admin.from("workspaces").delete().in("id",[workspaceId,agencyId]);
    for(const person of [owner,member,delegate]){await person.context.close().catch(()=>{});await admin.auth.admin.deleteUser(person.userId).catch(()=>{});}
  }
});
