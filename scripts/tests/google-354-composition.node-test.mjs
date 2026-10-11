import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {creatorSourceProofRegistry} from '../creator-source-proof-registry.mjs';
const base='bc43f09fecea4c111330e36492f011ab8c1b6f7e';
const read=p=>readFileSync(p,'utf8');
const before=p=>execFileSync('git',['show',`${base}:${p}`]);
const additions=['20261021140200_native_google_recovery_receipt_grouping.sql','20261022175100_legacy_google_operation_authority.sql'];
const ids=['native-google-recovery-receipt-grouping','legacy-google-operation-authority'];
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
test('exact354 adds only two forwards to immutable actual352 and preserves all historical SQL bytes',()=>{
 const old=JSON.parse(before('scripts/sql/historical-forward-inventory.json')),now=JSON.parse(read('scripts/sql/historical-forward-inventory.json'));
 assert.equal(old.forwardCount,352);assert.equal(now.forwardCount,354);
 assert.deepEqual(now.forwardFiles.filter(f=>!additions.includes(f)),old.forwardFiles);
 assert.deepEqual(now.forwardFiles,readdirSync('supabase/migrations').filter(f=>/^\d{14}_.*\.sql$/.test(f)).sort());
 assert.equal(new Set(now.forwardFiles).size,354);
 const files=execFileSync('git',['ls-tree','--name-only',`${base}:supabase/migrations`],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.sql'));
 for(const file of files)assert.deepEqual(readFileSync(`supabase/migrations/${file}`),before(`supabase/migrations/${file}`),file);
});
test('release registry preserves every prior object and pins both forward-only pairs exactly',()=>{
 const old=JSON.parse(before('scripts/release-safety/batches.json')),now=JSON.parse(read('scripts/release-safety/batches.json'));
 assert.deepEqual(now.baseline,old.baseline);assert.deepEqual(now.batches,old.batches);assert.deepEqual(now.proposed.filter(g=>!ids.includes(g.id)),old.proposed);
 for(const [i,file] of additions.entries()){
  const item=now.proposed.find(g=>g.id===ids[i]).items[0];assert.equal(item.file,file);assert.equal(item.sha256,digest(`supabase/migrations/${file}`));
  assert.equal(item.rollback,`rollback-${file}`);assert.equal(item.rollbackSha256,digest(`supabase/migrations/rollback-${file}`));assert.match(item.rollbackStatus,/Forward-only/);
 }
});
test('current1751 readback is the complete exact final guard for six functions and private table',()=>{
 const source=read(`supabase/migrations/${additions[1]}`),current=read('scripts/sql/legacy-google-operation-current-contract.sql');
 const guard=s=>s.match(/do \$legacy_google_creation_guard\$[\s\S]*?end \$legacy_google_creation_guard\$;/)[0];
 assert.equal(guard(current),guard(source));assert.ok(current.includes('begin read only;'));assert.ok(current.endsWith('rollback;\n'));
 assert.ok(!/^\s*(?:execute|create|alter|drop|insert|update|delete)\b/im.test(guard(current)));
 const recovery=read('scripts/sql/native-google-recovery-receipt-grouping-contract.sql');
 assert.ok(recovery.includes('07c4df3b9c602f06b5dd9d78d3bc9f29332dbe852d19bed472c029ec7b0abedf'));
 assert.ok(recovery.includes('catalog.protrftypes is not null'));assert.ok(recovery.includes('catalog.proowner and a.privilege_type'));
 assert.ok(!recovery.includes('execute replacement')&&!recovery.includes('definition:='));assert.ok(recovery.includes('begin read only;'));
});
test('both schema owners apply1402 before native fixtures and1751 after1750 before exposure',()=>{
 const tail=read('scripts/sql/full-model-current-tail.sh');
 assert.equal(tail.split(`/supabase/migrations/${additions[0]}`).length-1,1);
 assert.ok(tail.indexOf(additions[0])>tail.indexOf('20261021140100_native_google_hash_portability.sql'));
 assert.ok(tail.indexOf(additions[0])<tail.indexOf('native-google-recovery-receipt-grouping-schema.sql'));
 assert.ok(tail.indexOf('native-google-recovery-receipt-grouping-schema.sql')<tail.indexOf('native-google-completed-undo-schema.sql'));
 for(const owner of ['check-workspace-sql.sh','check-workspace-upgrade.sh']){
  const s=read(`scripts/${owner}`);assert.equal(s.split(`/supabase/migrations/${additions[1]}`).length-1,1);
  assert.ok(s.indexOf(additions[1])>s.indexOf('/scripts/sql/reward-durable-catalog-contract.sql'));
  assert.ok(s.indexOf(additions[1])<s.indexOf('/scripts/sql/legacy-google-operation-current-contract.sql'));
  assert.ok(s.indexOf('/tests/legacy-google-operation-authority-schema.sql')<s.indexOf('20261022182000_booking_settings_atomic_patch.sql'));
  assert.ok(s.indexOf('/scripts/sql/legacy-google-operation-current-contract.sql')<s.lastIndexOf('/tests/function-exposure-schema.sql'));
 }
 assert.ok(read('scripts/check-workspace-sql.sh').includes('STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF=1 bash'));
});
test('catalog and controlled proof owners capture exact new current guards without weakening old obligations',()=>{
 for(const owner of ['scripts/full-model-stack-qualification.mjs','scripts/check-governed-creator-exit-races.mjs','scripts/check-checkout-final-admission-races.mjs','scripts/check-creator-maintenance-operations.sh','scripts/check-guarded-teardown-fresh.sh']){
  const s=read(owner);for(const name of ['native-google-recovery-receipt-grouping-contract.sql','legacy-google-operation-current-contract.sql'])assert.ok(s.includes(name),owner+name);
 }
 for(const file of ['scripts/release-safety/catalog.sql','scripts/release-safety/runtime-catalog.sql']){
  const s=read(file);assert.ok(s.includes('pg_get_functiondef(p.oid)')&&s.includes("p.pronamespace='public'::regnamespace"));
  assert.ok(s.includes('relrowsecurity')&&s.includes('relforcerowsecurity')&&s.includes('attacl'));
 }
 const r=creatorSourceProofRegistry();assert.equal(r.schemaForwardCount,354);assert.equal(r.controlledNative.count,32);assert.deepEqual(r.auth.map(a=>a.count),[7,1,1]);assert.deepEqual(r.primaryWindows,{native:34,cleanup:2,noLogin:2,unchanged:true});
 assert.equal(r.googleOperations.execution,'UNRUN');assert.equal(r.googleOperations.creation.count,31);assert.equal(r.googleOperations.concurrent.count,10);assert.equal(r.googleOperations.concurrent.cases.length,10);
 const plan=read(r.googleOperations.creation.plan);for(const text of ['normal.sql` LAST','strictly\nless than','ANOTHER fresh owned','Actual DELETE and unlink','10GiB'])assert.ok(plan.includes(text),text);
 const exposure=read('tests/function-exposure-schema.sql');assert.ok(exposure.includes('legacy Google operation incomplete private boundary'));assert.ok(exposure.includes('native Google recovery lost private service-only boundary'));
});
