import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {collectWorkspaceExportV3,V3_CATEGORIES,type V3Rpc} from '@/platform/workspace-exports/v3';
const forward=readFileSync('supabase/migrations/20261022173000_neutral_creator_version_money.sql','utf8');
const inverse=readFileSync('supabase/migrations/rollback-20261022173000_neutral_creator_version_money.sql','utf8');
function bodies(source:string){return [...source.matchAll(/create function public\.([a-z_]+)\(([^\n]*)\)\nreturns jsonb language plpgsql( stable)? security definer set search_path=public,pg_temp as \$\$([\s\S]*?)\$\$;/g)];}
describe('neutral creator source packet and retained history',()=>{
 it('pins every actual eight-port body/signature on inverse; a changed body loses its corresponding pin',()=>{
  const ports=bodies(forward);expect(ports).toHaveLength(8);
  for(const port of ports){const digest=createHash('md5').update(port[4]!).digest('hex'),signature=`public.${port[1]}(${port[2]!.split(',').map(arg=>arg.trim().split(/\s+/)[1]).join(',')})`;expect(inverse).toContain(`('${signature}','${digest}'`);const changed=createHash('md5').update(`${port[4]}\nperform 1;`).digest('hex');expect(inverse).not.toContain(`('${signature}','${changed}'`);}
 });
 it('uses the same retained shape guard for reapply and inverse, with lock before catalog reads and no history deletion',()=>{
  const shape=(text:string)=>text.slice(text.indexOf('create temporary table neutral_creator_period_shape'),text.indexOf('drop table pg_temp.neutral_creator_period_shape;')+'drop table pg_temp.neutral_creator_period_shape;'.length);
  expect(shape(forward)).toBe(shape(inverse));expect(shape(inverse).indexOf('lock table public.creator_version_paid_periods in access exclusive mode')).toBeLessThan(shape(inverse).indexOf('select * into t from pg_class'));
  for(const guard of ['t.relowner<>migrator','attacl is not null','pg_policy','aclexplode','pg_attrdef','pg_get_expr','confdeltype','confupdtype','pg_index','tgargs','tgfoid','tgtype=27'])expect(shape(inverse)).toContain(guard);
  expect(inverse).not.toMatch(/drop table public\.creator_version_paid_periods|delete from public\.|truncate public\./i);
  expect(forward).not.toContain('create or replace function');expect(forward).not.toContain('alter function');expect(forward).toContain('neutral_creator_predecessor_acl_drift');
 });
 it('never copies private source definitions, accounts, grants or customer records into paid history and retains restricted foreign keys',()=>{
  const table=forward.slice(forward.indexOf('create table public.creator_version_paid_periods'),forward.indexOf('alter table public.creator_version_paid_periods'));
  expect(table).not.toMatch(/\b(definition|records|access_token|refresh_token|account_secret|grant_id)\b/);
  for(const relation of ['platform_collection_terms','system_versions','system_version_releases','system_version_sources','system_version_source_revisions','creator_listings','platform_collection_prices','workspaces','users'])expect(table).toContain(`references public.${relation}`);
  expect(table).not.toMatch(/on delete cascade/i);expect(forward).toContain('revoke all on public.creator_version_paid_periods from public,anon,authenticated,service_role');
 });
 it('keeps real generic Version identity apart from offering installations and applies the retained loss receipt after late creator accrual',()=>{
  expect(forward).toContain("'system-source:'||src.source_system_id::text");expect(forward).toContain('v.installed_source_revision_id');expect(forward).not.toContain('offering_package_sources');expect(forward).not.toContain('strelva_agency');
  const observer=bodies(forward).find(port=>port[1]==='observe_neutral_creator_settlement')![4]!;
  expect(observer).toContain('neutral_creator_original_accrual_required');expect(observer).toContain('reconcile_split_loss_before_receipt');expect(observer.indexOf("settlement.charge_id,8811")).toBeLessThan(observer.indexOf("paid.line_id,8810"));expect(observer).not.toMatch(/connect_assert|workspace_exit_completed|super_admins|lock_system_revision_qualification/);
 });
 it('exports retained paid lineage through an exact scoped port while preserving ordinary v3 categories and owner actor',async()=>{
  const workspaceId='11111111-1111-4111-8111-111111111111',actor={userId:'22222222-2222-4222-8222-222222222222',verifiedEmail:'owner@example.test'};
  const retained={line_id:'retained',business_workspace_id:workspaceId,source_revision_id:'real-source',accepted_at:'2026-10-09T10:00:00.123456+00:00'};
  const rpc:V3Rpc=vi.fn(async(name,_args)=>({data:name==='workspace_export_v3_role'?'owner':{items:name==='export_neutral_creator_paid_periods'?[retained]:[],next:null},error:null}));
  const document=await collectWorkspaceExportV3(actor,workspaceId,rpc,async()=>({schemaVersion:2}) as never);
  expect(V3_CATEGORIES).toContain('creator_version_paid_periods');expect(document.data.creator_version_paid_periods).toEqual([retained]);expect(rpc).toHaveBeenCalledWith('export_neutral_creator_paid_periods',{p_workspace_id:workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_category:'creator_version_paid_periods',p_offset:0,p_limit:1000});
  expect(rpc).toHaveBeenCalledWith('export_workspace_v3_category',expect.objectContaining({p_category:'revenue_splits'}));
 });
 it('refuses denied retained lineage export rather than silently omitting accepted history',async()=>{
  const rpc:V3Rpc=async(name)=>name==='export_neutral_creator_paid_periods'?{data:null,error:{message:'workspace_export_denied'}}:{data:name==='workspace_export_v3_role'?'owner':{items:[],next:null},error:null};
  await expect(collectWorkspaceExportV3({userId:'actor',verifiedEmail:'owner@example.test'},'workspace',rpc,async()=>({schemaVersion:2}) as never)).rejects.toMatchObject({code:'denied'});
 });
});
it('freezes the authoritative payer party and its actual billing home before accepting new terms, then observes accepted debt without current payer reauthorization',()=>{
 const ports=bodies(forward),prepare=ports.find(port=>port[1]==='prepare_neutral_version_collection')![4]!,adapter=ports.find(port=>port[1]==='record_neutral_version_settlement')![4]!;
 expect(prepare).toContain('public.business_payer_party(workspace)');expect(prepare).toContain('account.payer_kind is distinct from party.kind');expect(prepare).toContain('billing_account.stripe_customer_id');expect(prepare).toContain("billing_home_kind=case party.kind when 'agency' then 'agency' else 'business' end");expect(prepare).toContain('public.workspace_exit_completed(coalesce(party.workspace_id,workspace))');
 expect(adapter).toContain('paid.payer_workspace_id,paid.payer_kind,p_customer');expect(adapter).toContain('invoice_source.payer_kind is distinct from paid.payer_kind');expect(adapter).toContain('return public.record_platform_collection_settlement');expect(adapter.indexOf("p_charge,8811")).toBeLessThan(adapter.indexOf("paid.line_id,8810"));expect(adapter).not.toMatch(/connect_assert|workspace_exit_completed|verify_invoice_split_source|resolve_invoice_business_line|super_admins|public\.accounts/);
});
it('retained export uses the existing pure snapshot authority, never the writer-lock helper',()=>{const port=bodies(forward).find(port=>port[1]==='export_neutral_creator_paid_periods')!;expect(port[3]).toBe(' stable');expect(port[4]).toContain('public.workspace_export_v3_read_role(');expect(port[4]).not.toContain('public.workspace_export_v3_role(');expect(port[4]).not.toMatch(/for share|for update|pg_advisory/);});

it('counts every single/composite retained foreign key and pins the actual owner release',()=>{const table=forward.slice(forward.indexOf('create table public.creator_version_paid_periods'),forward.indexOf('alter table public.creator_version_paid_periods'));const count=[...table.matchAll(/references public\./g)].length;expect(count).toBe(11);expect(forward).toContain(`contype='f')<>${count}`);expect(inverse).toContain(`contype='f')<>${count}`);expect(table).toContain('foreign key(version_id,release_number) references public.system_version_releases(version_id,number) on delete restrict');});

it('verifies every newly created port inside the forward transaction before its schema notification or commit',()=>{
 const contract=readFileSync('scripts/sql/neutral-creator-version-money-contract.sql','utf8');
 const start='do $neutral_ports$',end='end $neutral_ports$;';
 const block=(source:string)=>{const at=source.indexOf(start);expect(at).toBeGreaterThan(-1);return source.slice(at,source.indexOf(end,at)+end.length);};
 const guard=block(contract);expect(block(forward)).toBe(guard);expect(block(inverse)).toBe(guard);
 expect(forward.indexOf(start)).toBeGreaterThan(forward.lastIndexOf("grant execute on function %s to service_role"));
 expect(forward.indexOf(end)).toBeLessThan(forward.indexOf("notify pgrst"));expect(forward.indexOf(end)).toBeLessThan(forward.lastIndexOf('commit;'));
 for(const port of bodies(forward)){const digest=createHash('md5').update(port[4]!).digest('hex');expect(guard).toContain(digest);}
 for(const property of ['p.proowner<>migrator','not p.prosecdef','p.proconfig is distinct from','p.proargnames is distinct from','md5(p.prosrc)','count(*) from aclexplode(p.proacl))<>2','a.grantor<>migrator','a.is_grantable',"a.grantee not in(migrator,('service_role'::regrole)::oid)"])expect(guard).toContain(property);
});
it('retains the existing governed six-port atomic guard rather than moving it to post-migration qualification',()=>{
 const governed=readFileSync('supabase/migrations/20261022172000_governed_money_operations.sql','utf8');
 const inverseGoverned=readFileSync('supabase/migrations/rollback-20261022172000_governed_money_operations.sql','utf8');
 const start='do $canonical_governed_money$',end='end $canonical_governed_money$;';
 const block=(source:string)=>source.slice(source.indexOf(start),source.indexOf(end)+end.length);
 expect(block(governed)).toBe(block(inverseGoverned));expect(block(governed).match(/\('public\./g)).toHaveLength(6);
 expect(governed.indexOf(start)).toBeGreaterThan(governed.indexOf("grant execute on function %s to service_role"));expect(governed.indexOf(end)).toBeLessThan(governed.indexOf('notify pgrst'));
 expect(block(governed)).toContain("a.grantee not in(migrator,('service_role'::regrole)::oid)");
});

it('prepares an actual forward default-ACL refusal probe, with clean predecessor and no retained-history deletion',()=>{
 const probe=readFileSync('scripts/sql/neutral-creator-default-acl-refusal.sql','utf8');
 expect(probe).toContain('alter default privileges in schema public grant execute on functions to neutral_creator_default_acl_probe');
 expect(probe).toContain('\\ir ../../supabase/migrations/20261022173000_neutral_creator_version_money.sql');
 expect(probe).toContain('neutral_creator_probe_committed_exposure');expect(probe).toContain('neutral_creator_probe_fault_not_installed');expect(probe).toContain('neutral_creator_acl_drift');
 expect(probe).not.toMatch(/drop table public\.|delete from public\.|truncate public\./i);
 expect(probe.indexOf('neutral_creator_probe_committed_exposure')).toBeLessThan(probe.indexOf('revoke execute on functions from neutral_creator_default_acl_probe'));
});
