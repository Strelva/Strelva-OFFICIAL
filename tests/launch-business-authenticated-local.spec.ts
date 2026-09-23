import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth.");
test.beforeAll(() => { localEnvironment(); });
test.setTimeout(240_000);

for (const width of [1440, 390]) {
 test(`fresh business, native work, and agency delivery retain one owner at ${width}px`, async ({browser}, testInfo) => {
  const env=localEnvironment();
  const admin=createClient(env.url,env.service,{auth:{persistSession:false,autoRefreshToken:false}});
  const owner=await signedInContext(browser,admin,`launch-owner-${width}`);
  const operator=await signedInContext(browser,admin,`launch-operator-${width}`);
  const stranger=await signedInContext(browser,admin,`launch-stranger-${width}`);
  const page=await owner.context.newPage();
  page.setDefaultTimeout(30_000);
  await page.setViewportSize({width,height:900});
  let businessId="";
  const tenantId=`launch-${randomUUID().slice(0,8)}`;
  try {
    // Observe the browser command before navigation. A full-page continuation
    // may legitimately release its old CDP response body; verify stored state
    // through the exact replay and the new route instead.
    await page.goto("/workspace/business/new?start=applications");
    await page.getByLabel("Business name",{exact:true}).fill(`Juniper launch ${width}`);
    const setupRequest=page.waitForRequest(r=>new URL(r.url()).pathname==="/api/workspace/businesses"&&r.method()==="POST");
    await page.getByRole("button",{name:"Continue with this business",exact:true}).click();
    const setupCommand=(await setupRequest).postDataJSON();
    await expect(page).toHaveURL(/\/workspace\?workspaceId=[a-f0-9-]+&view=applications$/);
    businessId=new URL(page.url()).searchParams.get("workspaceId")!;
    expect(businessId).toMatch(/^[a-f0-9-]{36}$/);
    const repeated=await owner.context.request.post("/api/workspace/businesses",{headers:{origin:env.app},data:setupCommand});
    expect(repeated.status(),await repeated.text()).toBe(200);
    expect(await repeated.json()).toMatchObject({workspaceId:businessId,requestId:null,alreadyCreated:true});
    // The existing workspace contract hides an unavailable workspace's existence.
    const strangerWorkspace=await stranger.context.request.get(`/api/workspace?workspaceId=${businessId}`);
    expect(strangerWorkspace.status()).toBe(404);
    expect(await strangerWorkspace.json()).toEqual({error:"Workspace unavailable."});

    // The customer creates and publishes the first app through its real UI.
    // Do not seed the result with an API call and call that first-use proof.
    await page.getByRole("form", { name: "Application setup" }).getByLabel("App name",{exact:true}).fill("Team requests");
    await page.getByLabel("Field 1",{exact:true}).fill("Request");
    const appCreation=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/bounded-work"&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Create private app",exact:true}).click();
    const appResponse=await appCreation;
    expect(appResponse.status(),await appResponse.text()).toBe(201);
    const app=await appResponse.json();
    await expect(page.getByRole("heading",{name:"Team requests",exact:true,level:1})).toBeVisible();
    await page.getByRole("button",{name:"Review and publish",exact:true}).click();
    await page.getByRole("button",{name:"Check proposed change",exact:true}).click();
    await expect(page.getByRole("button",{name:"Publish",exact:true})).toBeEnabled();
    await page.getByRole("button",{name:"Publish",exact:true}).click();
    await expect(page.getByText(/Version 1 is live/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading",{name:"Team requests",exact:true,level:1})).toBeVisible();
    await expect(page.getByText(/Version 1 is live/)).toBeVisible();

    await page.goto(`/workspace?workspaceId=${businessId}&view=help`);
    await page.getByLabel("What are you trying to do?",{exact:true}).fill("Have Strelva build our website.");
    const requestResponse=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/service-requests"&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Save request",exact:true}).click();
    const requested=await requestResponse;
    expect(requested.status(),await requested.text()).toBe(200);
    let item=(await requested.json()).request;
    expect(item.businessId).toBe(businessId);expect(item.deliveryCommitment).toBeNull();
    const requestId=item.id;
    const deliveryCard=page.getByRole("region",{name:"Strelva delivery",exact:true})
      .locator(`a[href="/workspace/delivery/${requestId}"]`);

    // Synthetic local operator identity only. No production grants or bypass.
    expect((await admin.from("super_admins").insert({user_id:operator.userId,email:operator.email})).error).toBeNull();
    const accepted=await operator.context.request.post("/api/service-requests",{headers:{origin:env.app},data:{action:"respond",requestId,expectedRevision:item.revision,decision:"accepted",note:"Local acceptance proof only",idempotencyKey:randomUUID()}});
    expect(accepted.status(),await accepted.text()).toBe(200);item=(await accepted.json()).request;
    expect(item.deliveryCommitment).toBeNull();
    const operatorPage=await operator.context.newPage();operatorPage.setDefaultTimeout(30_000);
    await operatorPage.setViewportSize({width,height:900});
    await operatorPage.goto(`/workspace/delivery/${requestId}`);
    await operatorPage.getByLabel("Agreed terms reference",{exact:true}).fill("Synthetic quote Q-LOCAL. No billing.");
    await operatorPage.getByLabel("Exact delivery definition",{exact:true}).fill("Tested review website. Final-domain publication is separately approved.");
    await operatorPage.getByLabel("The required inputs are ready and I can take this delivery.",{exact:true}).check();
    await operatorPage.getByRole("button",{name:"Propose 24-hour delivery",exact:true}).click();
    await expect(operatorPage.getByText("Scope and terms need your acceptance",{exact:true})).toBeVisible();
    await page.goto(`/workspace?workspaceId=${businessId}`);
    await expect(page.getByRole("heading",{name:"Strelva delivery",exact:true})).toBeVisible();
    await expect(deliveryCard).toBeVisible();
    await page.goto(`/workspace/delivery/${requestId}`);
    await expect(page.getByRole("button",{name:"Propose 24-hour delivery",exact:true})).toHaveCount(0);
    const agreedResponse=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/service-requests/delivery"&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Accept scope and start 24-hour delivery",exact:true}).click();
    const agreed=await agreedResponse;expect(agreed.status(),await agreed.text()).toBe(200);item=(await agreed.json()).request;
    const dueAt=item.deliveryCommitment.dueAt;
    expect(Date.parse(dueAt)-Date.parse(item.deliveryCommitment.startedAt)).toBe(24*60*60*1000);
    const repeatAgreement=await owner.context.request.post("/api/service-requests/delivery",{headers:{origin:env.app},data:agreed.request().postDataJSON()});
    expect(repeatAgreement.status(),await repeatAgreement.text()).toBe(200);
    expect((await repeatAgreement.json()).request.deliveryCommitment.dueAt).toBe(dueAt);

    // Represents an agency-built site; this fixture is not a live deployment.
    const tenant=await admin.from("tenants").insert({id:tenantId,site_name:"Local review website",active:true}).select("stable_id").single();
    expect(tenant.error).toBeNull();
    const bindingCommand={action:"bind_managed_website",businessId,tenantId,idempotencyKey:randomUUID()};
    // A business owner is not automatically the owner of an existing website.
    // Exercise the real HTTP/RPC boundary instead of granting direct table access.
    const unowned=await owner.context.request.post("/api/offerings/websites",{headers:{origin:env.app},data:bindingCommand});
    expect(unowned.status(),await unowned.text()).toBe(403);
    const membership=await admin.from("memberships").insert({user_id:owner.userId,tenant_id:tenantId,role:"owner"});
    expect(membership.error).toBeNull();
    const binding=await owner.context.request.post("/api/offerings/websites",{headers:{origin:env.app},data:bindingCommand});
    expect(binding.status(),await binding.text()).toBe(200);
    const bindingId=(await binding.json()).websiteBinding.id as string;
    expect(bindingId).toMatch(/^[a-f0-9-]{36}$/);
    const repeatedBinding=await owner.context.request.post("/api/offerings/websites",{headers:{origin:env.app},data:bindingCommand});
    expect(repeatedBinding.status(),await repeatedBinding.text()).toBe(200);
    expect((await repeatedBinding.json()).websiteBinding.id).toBe(bindingId);
    const unrelatedBinding=await stranger.context.request.post("/api/offerings/websites",{headers:{origin:env.app},data:bindingCommand});
    expect(unrelatedBinding.status(),await unrelatedBinding.text()).toBe(403);
    await operatorPage.reload();
    await operatorPage.getByLabel("Customer website",{exact:true}).selectOption(bindingId);
    await operatorPage.getByLabel("Repository, owner/name",{exact:true}).fill("example/local-proof-site");
    await operatorPage.getByLabel("Full commit SHA",{exact:true}).fill("a".repeat(40));
    await operatorPage.getByLabel("Public HTTPS review URL",{exact:true}).fill("https://review.example.com/local-proof");
    for(const label of ["Desktop checked","Mobile checked","Primary action checked"]) await operatorPage.getByLabel(label,{exact:true}).check();
    await operatorPage.getByRole("button",{name:"Submit for customer review",exact:true}).click();
    await expect(operatorPage.getByText("Ready for customer review",{exact:true})).toBeVisible();
    await page.reload();
    await page.getByLabel("Decision or blocker note",{exact:true}).fill("Accepted the synthetic result for this local test.");
    await page.getByRole("button",{name:"Accept delivered result",exact:true}).click();
    await expect(page.getByText("Customer accepted this delivery",{exact:true})).toBeVisible();
    expect((await stranger.context.request.get(`/api/service-requests/delivery?requestId=${requestId}`)).status()).toBe(403);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`delivery-${width}.png`),fullPage:true});
    await page.goto(`/workspace?workspaceId=${businessId}`);
    await expect(deliveryCard.getByText("Customer accepted this delivery",{exact:true})).toBeVisible();
    await page.goto(`/workspace?workspaceId=${businessId}&work=${app.id}`);
    await expect(page.getByRole("heading",{name:"Team requests",exact:true,level:1})).toBeVisible();
    await expect(page.getByText(/Version 1 is live/)).toBeVisible();
    const businesses=await owner.context.request.get("/api/workspace/businesses");
    expect((await businesses.json()).businesses.filter((value:{id:string})=>value.id===businessId)).toHaveLength(1);
    await operatorPage.close();
  } finally {
    await page.close();
    if(businessId) await admin.from("workspaces").delete().eq("id",businessId);
    await admin.from("tenants").delete().eq("id",tenantId);
    for(const identity of [owner,operator,stranger]) {await identity.context.close();await admin.auth.admin.deleteUser(identity.userId).catch(()=>{});}
  }
 });
}
