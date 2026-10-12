import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creatorSourceProofRegistry } from '../creator-source-proof-registry.mjs';
import { journeyProfile, validateReport } from '../full-model-journey-profile.mjs';
import { privateAuthorityProfile } from '../private-authority-journey-window.mjs';
import { creatorMaintenanceProfile } from '../creator-maintenance-journey-profile.mjs';
import { ordinarySourceProfile } from '../ordinary-source-journey-profile.mjs';
test('actual354 registration preserves32 distinct controlled cases and primary34 scope',()=>{
 const r=creatorSourceProofRegistry(),p=journeyProfile('full-native');assert.equal(r.schemaForwardCount,354);assert.equal(JSON.parse(readFileSync('scripts/sql/historical-forward-inventory.json')).forwardCount,354);assert.deepEqual(p.supplementalProofs,r);
 assert.equal(r.controlledNative.count,32);assert.equal(r.controlledNative.originalCount,12);assert.equal(r.controlledNative.supplementalCount,20);assert.equal(r.controlledNative.cases.length,32);assert.equal(new Set(r.controlledNative.cases.map(c=>JSON.stringify(c))).size,32);
 assert.equal(p.specs.reduce((n,s)=>n+s.count,0),34);assert.equal(r.execution,'UNRUN');assert.equal(r.fullReleaseQualified,false);assert.equal(r.providerActions,'held');assert.equal(r.substitutionAllowed,false);
 assert.equal(journeyProfile('full-dark').supplementalProofs,undefined);assert.equal(journeyProfile('full-provider').supplementalProofs,undefined);
});
test('fresh7 plus creator1 plus ordinary1 bind exact existing profile owners rather than waiving Auth',()=>{
 const r=creatorSourceProofRegistry(),profiles=[privateAuthorityProfile(),creatorMaintenanceProfile(),ordinarySourceProfile()];
 for(const [i,p] of profiles.entries()) {const registered=r.auth[i];assert.equal(p.name,registered.name);assert.equal(p.specs.length,1);assert.equal(p.specs[0].file,registered.file);assert.equal(p.specs[0].count,registered.count);assert.equal(p.specs[0].cases.length,registered.count);assert.equal(registered.freshStack,true);if(registered.title)assert.equal(p.specs[0].cases[0].title,registered.title);assert.throws(()=>validateReport({suites:[],errors:[]},p));assert.equal(p.providerActions,'held');}
});
