import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext } from "@playwright/test";
import { localEnvironment } from "./local-auth";

/** Authenticate a genuinely configured local policy identity. Never create a
 * reviewer row, elevate an ordinary agency, or manufacture qualification. */
export async function configuredPackageReviewer(browser: Browser, admin: SupabaseClient) {
  const env=localEnvironment();
  const email=process.env.STRELVA_LOCAL_PACKAGE_REVIEWER_EMAIL || "";
  const password=process.env.STRELVA_LOCAL_PACKAGE_REVIEWER_PASSWORD || "";
  const receiptPath=process.env.STRELVA_LOCAL_PACKAGE_REVIEWER_RECEIPT || "";
  if(!email || !password || !receiptPath)throw new Error("Full native installation requires an explicitly configured local platform reviewer and review policy; pending-review refusal has already been proved. Set local reviewer credentials after policy configuration.");
  const receipt=JSON.parse(readFileSync(receiptPath,"utf8"));
  if(receipt.kind!=="fictional-owned-local-reviewer-policy" || receipt.realAuth!==true || receipt.localFictionalPolicy!==true || receipt.productionQualification!==false || receipt.policy.email!==email)throw new Error("An explicitly fictional owned local reviewer receipt is required.");
  const user=await admin.from("users").select("id,email,verified_at").eq("email",email).maybeSingle();
  if(user.error || !user.data?.verified_at)throw new Error("The configured local reviewer identity is unavailable.");
  const policy=await admin.from("system_revision_reviewers").select("policy_version,active").eq("user_id",user.data.id).maybeSingle();
  if(policy.error || policy.data?.active!==true || !policy.data.policy_version)throw new Error("The configured identity has no current platform review policy.");
  if(receipt.policy.userId!==user.data.id || receipt.policy.policyVersion!==policy.data.policy_version)throw new Error("Local Auth/policy fixture receipt drift.");
  const context=await browser.newContext({baseURL:env.app});
  const cookies:Array<Parameters<BrowserContext["addCookies"]>[0][number]>=[];
  const auth=createServerClient(env.url,env.anon,{cookies:{getAll:()=>[],setAll:values=>{
    for(const cookie of values)cookies.push({name:cookie.name,value:cookie.value,domain:new URL(env.app).hostname,path:cookie.options.path||"/",httpOnly:Boolean(cookie.options.httpOnly),secure:false,sameSite:"Lax"});
  }}});
  const signed=await auth.auth.signInWithPassword({email,password});
  if(signed.error || signed.data.user?.id!==user.data.id){await context.close();throw new Error("Real local Auth rejected the configured platform reviewer.");}
  await context.addCookies(cookies);
  return {context,userId:user.data.id,email,policyVersion:policy.data.policy_version};
}
