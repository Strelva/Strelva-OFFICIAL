import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { journeyProfile } from '../full-model-journey-profile.mjs';
const read = p => readFileSync(p,'utf8');
const base = 'd057d749615a0cb503b48dc7db1d7a422b645102';
const original = p => execFileSync('git',['show',`${base}:${p}`],{encoding:'utf8'});
const forward='20261022182000_booking_settings_atomic_patch.sql', inverse=`rollback-${forward}`;
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
test('physical352 adds only accepted1820 to exact previous351 and leaves registry objects intact',()=>{
 const inventory=JSON.parse(read('scripts/sql/historical-forward-inventory.json')),previous=JSON.parse(original('scripts/sql/historical-forward-inventory.json'));
 assert.equal(inventory.forwardCount,352);assert.deepEqual(inventory.forwardFiles,readdirSync('supabase/migrations').filter(f=>/^\d{14}_.*\.sql$/.test(f)).sort());assert.equal(new Set(inventory.forwardFiles).size,352);
 assert.deepEqual(inventory.forwardFiles.filter(f=>f!==forward),previous.forwardFiles);
 const registry=JSON.parse(read('scripts/release-safety/batches.json')),old=JSON.parse(original('scripts/release-safety/batches.json'));
 assert.deepEqual(registry.baseline,old.baseline);assert.deepEqual(registry.batches,old.batches);assert.deepEqual(registry.proposed.slice(0,-1),old.proposed);
 const item=registry.proposed.at(-1).items[0];assert.equal(item.file,forward);assert.equal(item.sha256,sha(`supabase/migrations/${forward}`));assert.equal(item.rollbackSha256,sha(`supabase/migrations/${inverse}`));
 assert.equal(item.sha256,'6497dd7346ce3f9e9e77409b5fc933871ac931dc266e792dd4806ffcf0b07ce6');assert.equal(item.rollbackSha256,'cf5cc60da8923e2256e30f82d5aa080d1134c76083050c8e3c3ee053b9240c65');
});
test('current readback preserves complete accepted inverse guard without executing its DROP',()=>{
 const rollback=read(`supabase/migrations/${inverse}`),current=read('scripts/sql/booking-settings-current-contract.sql');
 const guard=rollback.match(/do \$inverse\$[\s\S]*?end \$inverse\$;/)[0].replace("  execute 'drop function public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)';\n",'');
 assert.ok(current.includes('begin read only;'));assert.equal(current.match(/do \$inverse\$[\s\S]*?end \$inverse\$;/)[0],guard);
 assert.ok(!/^\s*(?:execute|create|alter|drop|insert|update|delete)\b/im.test(guard));assert.ok(current.endsWith('rollback;\n'));
});
test('both final owners schedule1820 once after1750 before current exposure/readonly admission',()=>{
 for(const owner of ['scripts/check-workspace-sql.sh','scripts/check-workspace-upgrade.sh']){
  const source=read(owner),path=`/supabase/migrations/${forward}`,at=source.indexOf(path);
  assert.equal(source.split(path).length-1,1);assert.ok(at>source.indexOf('/scripts/sql/reward-durable-catalog-contract.sql'));
  assert.ok(at<source.indexOf('/scripts/sql/booking-settings-current-contract.sql'));assert.ok(source.indexOf('/scripts/sql/booking-settings-current-contract.sql')<source.lastIndexOf('/tests/function-exposure-schema.sql'));
  assert.ok(source.indexOf('/scripts/sql/booking-settings-current-contract.sql')<source.lastIndexOf('/scripts/check-readonly-rpcs.mjs'));
 }
 for(const owner of ['scripts/check-governed-creator-exit-races.mjs','scripts/check-checkout-final-admission-races.mjs','scripts/check-creator-maintenance-operations.sh']){
  const source=read(owner);assert.ok(source.includes(`supabase/migrations/${inverse}`));assert.ok(source.includes('scripts/sql/booking-settings-current-contract.sql'));assert.ok(source.includes('reapplied-booking-settings-current-contract'));
 }
});
test('booking native obligations register exact helper cases without weakening Creator or primary scope',()=>{
 const profile=journeyProfile('full-native'),r=profile.supplementalProofs,b=r.bookingSettings;
 assert.equal(r.schemaForwardCount,352);assert.equal(profile.specs.reduce((n,s)=>n+s.count,0),34);assert.equal(r.controlledNative.count,32);assert.deepEqual(r.auth.map(a=>a.count),[7,1,1]);assert.deepEqual(r.primaryWindows,{native:34,cleanup:2,noLogin:2,unchanged:true});assert.equal(profile.acceptance.length,8);
 assert.equal(b.execution,'UNRUN');assert.equal(b.fullReleaseQualified,false);assert.equal(b.requiresSealedCluster,true);assert.equal(b.requiresOwnedRuntimeWindow,true);
 for(const [key,marker] of [['concurrent','for order in'],['forwardAdmission','for name in'],['inverseAdmission','for name in']]){
  const scope=b[key],source=read(scope.runner),names=source.match(new RegExp(`${marker} ([^;]+); do`))[1].trim().split(/\s+/);assert.deepEqual(scope.cases,names);assert.equal(scope.count,names.length);
 }
 assert.ok(read('tests/function-exposure-schema.sql').includes("booking settings atomic command exposed or authority drifted"));
 assert.equal(journeyProfile('full-dark').supplementalProofs,undefined);assert.equal(journeyProfile('full-provider').supplementalProofs,undefined);
});
