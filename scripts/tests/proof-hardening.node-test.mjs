import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journeyProfile, validateReport } from '../full-model-journey-profile.mjs';
import { assertBaseline, migrationInventory, qualify } from '../full-model-stack-qualification.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profile = journeyProfile('full-native');
function report() {
  const specs = profile.specs.flatMap(item => item.cases.map(c => ({ file: item.file, title: c.title,
    tests: [{ projectName: c.project, status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })));
  return { suites: [{ specs }], stats: { expected: specs.length, skipped: 0, unexpected: 0, flaky: 0 }, errors: [] };
}
test('exact 34 native title/project identities pass with qualification held', () => {
  assert.equal(validateReport(report(), profile).passed,34);
  assert.equal(validateReport(report(), profile).fullReleaseQualified,false);
});
test('same-count replacement, wrong project, duplicate and missing identity fail', () => {
  for (const mutate of [r=>{r.suites[0].specs[0].title='unrelated passing preview';},
    r=>{r.suites[0].specs[0].tests[0].projectName='other-project';},
    r=>{r.suites[0].specs[3]=structuredClone(r.suites[0].specs[2]);},
    r=>{r.suites[0].specs.pop();}]) { const r=report(); mutate(r); assert.throws(()=>validateReport(r,profile)); }
});
test('skips retries extra attempts flaky results and global errors remain rejected',()=>{
  for(const mutate of [r=>{r.stats.skipped=1;},r=>{r.suites[0].specs[0].tests[0].results[0].retry=1;},
    r=>{r.suites[0].specs[0].tests[0].results.push({status:'passed'});},r=>{r.stats.flaky=1;},r=>{r.errors.push({message:'failure'});}]) {
    const r=report(); mutate(r); assert.throws(()=>validateReport(r,profile));
  }
});
const current={binding:{stack:'/tmp/owned',configSha256:'config',databaseUrlSha256:'url',authUrlSha256:'auth'},databaseIdentity:{systemIdentifier:'123',databaseOid:'1',database:'postgres'},migrations:[{version:'20261008000000',file:'20261008000000_test.sql',sha256:'bytes'}],ledger:[{version:'20261008000000',name:'test',statements:['select 1']}],catalogSha256:'catalog',rolesSha256:'acl',dumpVersion:'pg_dump 17'};
const baseline={format:1,phase:'fresh-bootstrap',recordedAt:'2026-10-08T00:00:00Z',...current};
test('recorded baseline accepts only identical source ledger catalog roles and cluster',()=>{
  assert.equal(assertBaseline(baseline,current).fullReleaseQualified,false);
  for (const field of Object.keys(current)) { const changed=structuredClone(current); changed[field]='drift'; assert.throws(()=>assertBaseline(baseline,changed),/mismatch/); }
  assert.throws(()=>assertBaseline(null,current),/Unknown bootstrap/);
  assert.throws(()=>assertBaseline({...baseline,phase:'reused'},current),/Unknown bootstrap/);
});
test('migration inventory hashes actual bytes and excludes inverse/manual helpers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'proof-inventory.'));
 try{writeFileSync(join(dir,'20261008000000_test.sql'),'select 1;');writeFileSync(join(dir,'rollback-20261008000000_test.sql'),'select 2;');const first=migrationInventory(dir);assert.equal(first.length,1);writeFileSync(join(dir,'20261008000000_test.sql'),'select 3;');assert.notEqual(migrationInventory(dir)[0].sha256,first[0].sha256);}finally{rmSync(dir,{recursive:true});}
});
test('old owned loopback stack without baseline is rejected before database capture',()=>{
 const dir=mkdtempSync(join(tmpdir(),'proof-unknown-baseline.'));
 try{mkdirSync(join(dir,'supabase'));writeFileSync(join(dir,'supabase/config.toml'),'project_id = "strelva-proof-0123456789abcdef"');
 const env=join(dir,'env');writeFileSync(env,[`STRELVA_AUTH_STACK_DIR=${dir}`,'STRELVA_LOCAL_DB_URL=postgresql://postgres:local@127.0.0.1:1/postgres','SUPABASE_URL=http://127.0.0.1:2','NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:2','NEXT_PUBLIC_SUPABASE_ANON_KEY=anon','SUPABASE_SERVICE_ROLE_KEY=service'].join('\n'));
 assert.throws(()=>qualify('verify',dir,env),/Unknown bootstrap baseline/);
 }finally{rmSync(dir,{recursive:true});}
});
