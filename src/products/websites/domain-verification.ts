import type { DomainClaim } from "@/lib/types";
export const DOMAIN_VERIFICATION_INITIAL_MS=48*60*60*1000;
export const DOMAIN_VERIFICATION_ESCALATION_MS=7*24*60*60*1000;
export function domainVerificationDue(claim:DomainClaim,now:number){
 if(claim.role==="admin"||claim.status==="verified")return false;
 const created=Date.parse(claim.createdAt),updated=Date.parse(claim.updatedAt);
 if(!Number.isFinite(created)||!Number.isFinite(updated))return false;
 const interval=now-created>=DOMAIN_VERIFICATION_INITIAL_MS?24*60*60*1000:60*1000;
 return now-updated>=interval;
}
export async function verifyHostedDomains(dependencies:{
 /** Every site whose claims are polled: active tenants (custom repos and
  * hosted sites alike). Only `tenantId` is read; duplicates are polled once. */
 list:()=>Promise<ReadonlyArray<{tenantId?:string|null}>>;
 claims:(tenantId:string)=>Promise<DomainClaim[]>;
 refresh:(tenantId:string,hostname:string)=>Promise<{ok:boolean}>;
 alert?:(input:{tenantId:string;hostname:string;createdAt:string;checkedAt:string})=>Promise<void>;
 now?:()=>number;limit?:number;
}){
 const now=dependencies.now?.()??Date.now();const sites=await dependencies.list();
 const pending:Array<{tenantId:string;claim:DomainClaim}>=[];
 const tenantIds=[...new Set(sites.map(site=>site.tenantId).filter((id):id is string=>Boolean(id)))];
 for(const tenantId of tenantIds){for(const claim of await dependencies.claims(tenantId)){if(claim.status!=="verified"&&claim.role!=="admin")pending.push({tenantId,claim});}}
 const due=pending.filter(row=>domainVerificationDue(row.claim,now)).sort((a,b)=>Date.parse(a.claim.updatedAt)-Date.parse(b.claim.updatedAt));
 const selected=due.slice(0,Math.max(1,Math.min(dependencies.limit??10,25)));let failed=0;let refreshed=0;let alerted=0;
 for(const {tenantId,claim}of selected){try{const result=await dependencies.refresh(tenantId,claim.domain);if(!result.ok)failed++;else refreshed++;}catch{failed++;}}
 // Reload authoritative claims: a just-verified domain must not receive an alert.
 const reloaded=new Map<string,DomainClaim[]>();
 for(const {tenantId,claim}of pending){if(now-Date.parse(claim.createdAt)<DOMAIN_VERIFICATION_ESCALATION_MS||!dependencies.alert)continue;try{if(!reloaded.has(tenantId))reloaded.set(tenantId,await dependencies.claims(tenantId));const latest=reloaded.get(tenantId)!.find(value=>value.domain===claim.domain);if(latest&&latest.status!=="verified"){await dependencies.alert({tenantId,hostname:claim.domain,createdAt:claim.createdAt,checkedAt:latest.updatedAt});alerted++;}}catch{failed++;}}
 return{pending:pending.length,processed:selected.length,refreshed,failed,alerted,deferred:Math.max(0,due.length-selected.length)};
}
