import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const path=join(root,'supabase/migrations/20261022175100_legacy_google_operation_authority.sql');
const source=readFileSync(path,'utf8');
const names=['legacy_google_canonical_json','legacy_google_location_digest','read_legacy_google_operation','legacy_google_commit','commit_legacy_google_binding_operation','apply_legacy_google_operation'];

test('every created function has a current literal body hash before commit',()=>{
  const guard=source.slice(source.indexOf('do $legacy_google_creation_guard$'));
  for(const name of names){
    const match=source.match(new RegExp('create function public\\.'+name+'\\([\\s\\S]*?\\bas \\$\\$([\\s\\S]*?)\\$\\$;'));
    assert.ok(match,name);
    const digest=createHash('sha256').update(match[1]).digest('hex');
    assert.ok(guard.includes("'"+digest+"'"),name+' source hash');
    assert.ok(guard.includes('public.'+name+'('),name+' signature');
  }
  assert.equal((source.match(/^commit;$/gm)||[]).length,1);
  assert.ok(source.indexOf('end $legacy_google_creation_guard$;')<source.indexOf('\ncommit;'));
});
test('creation rejects inherited grants before named privilege changes',()=>{
  assert.ok(source.indexOf('do $legacy_google_table_defaults$')<source.indexOf('revoke all on public.legacy_google_operation_watermarks'));
  assert.ok(source.indexOf('do $legacy_google_function_defaults$')<source.indexOf('revoke all on function public.legacy_google_canonical_json'));
  assert.ok(source.includes('a.grantee not in (0,baseline_owner)'));
  assert.ok(source.includes('fn.protrftypes is not null'));
  assert.ok(source.includes('baseline_owner=service_oid'));
  assert.ok(source.includes("coalesce(fn.proacl,acldefault('f',baseline_owner))"));
});
test('strict table guard includes PG18 not-null catalog and authority graph',()=>{
  assert.ok(source.includes("contype<>'n')<>3"));
  assert.ok(source.includes("contype='n')<>expected_not_null_count"));
  assert.ok(source.includes("current_setting('server_version_num')::integer>=180000 then 2 else 0"));
  assert.ok(source.includes("to_jsonb(c)->>'conenforced'"));
  assert.ok(source.includes('inhrelid=table_oid or inhparent=table_oid'));
  assert.ok(source.includes('pg_rewrite where ev_class=table_oid'));
  assert.ok(source.includes('a.attacl is not null'));
  assert.ok(source.includes('not i.indcheckxmin'));
  assert.ok(source.includes('a.attstattarget is distinct from expected_statistics_target'));
});
test('trusted service fences and writes all authoritative records in one transaction',()=>{
  const core=source.match(/create function public\.legacy_google_commit\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/)[1];
  assert.ok(!core.includes('if p_kind is not null and exists(select 1 from public.tenant_client_records'));
  const fence=core.indexOf('if exists(select 1 from public.tenant_client_records');
  const write=core.indexOf("result:=public.record_tenant_client_record(p_pin->>'tenantId','provider_connections'");
  assert.ok(fence>=0&&write>fence);
  assert.ok(core.includes('if grant_input is not null then\n    select * into prior'));
  assert.ok(core.includes("if location_input is not null then\n    metadata:="));
  assert.ok(write<core.indexOf('result:=public.upsert_workspace_account_binding'));
});
test('prepared hostile-fresh generator emits exact refusals and normal source',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'legacy-google-source-check-'));
  try{
    const output=join(temporary,'variants');
    const result=spawnSync('python3',[join(root,'tests/support/legacy-google-operation-creation-variants.py'),root,output],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
    assert.equal(manifest.refusals.length,31);
    assert.equal(readFileSync(join(output,'normal.sql'),'utf8'),source);
    for(const item of manifest.refusals){
      assert.equal(item.error,'legacy_google_creation_authority_invalid');
      const variant=readFileSync(join(output,item.file),'utf8');
      assert.equal((variant.match(/^begin;$/gm)||[]).length,1,item.file);
      assert.equal((variant.match(/^commit;$/gm)||[]).length,1,item.file);
      assert.ok(variant.includes('do $legacy_google_creation_guard$'),item.file);
    }
  } finally { rmSync(temporary,{recursive:true,force:true}); }
});
