import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertClusterIdentity, sessionPredicate } from '../lib/booking-owned-cluster.mjs';

const original = {data:'/private/tmp/owned/data',socket:'/private/tmp/owned/socket',port:'54321',postmasterPid:'100',postmasterBirth:'birth-100',ownerPid:'101',ownerBirth:'birth-101',pidFileEpoch:'1000',systemIdentifier:'1234567',postmasterEpoch:'1000',databaseOid:'1',databaseName:'fixture',roleOid:'2',roleName:'fixture',catalogIdentity:'schema-hash',listenAddresses:'',sessions:[]};
const binding = {data:original.data,socket:original.socket,port:original.port,postmasterPid:original.postmasterPid,ownerPid:original.ownerPid};
const session = {pid:'200',started:'2026-10-09 00:00:00+00',app:'bs_primary_race_101_first'};

test('accepts exact sealed cluster and exact owned session tuples', () => {
  assert.doesNotThrow(() => assertClusterIdentity(original,{...original,sessions:[session]},binding,[session]));
  assert.match(sessionPredicate([session]), /pid=200 and backend_start='2026-10-09 00:00:00\+00'::timestamptz/);
});
for (const key of ['data','socket','port','postmasterPid','postmasterBirth','ownerPid','ownerBirth','pidFileEpoch','systemIdentifier','postmasterEpoch','databaseOid','databaseName','roleOid','roleName','catalogIdentity']) {
  test(`refuses ${key} drift even with matching temporary path prefix`, () => {
    assert.throws(() => assertClusterIdentity(original,{...original,[key]:`${original[key]}-foreign`},binding), /identity changed/);
  });
}
test('refuses untracked foreign baseline and reused PID or changed start/name', () => {
  assert.throws(() => assertClusterIdentity(original,{...original,sessions:[session]},binding), /Foreign session/);
  for (const foreign of [{...session,pid:'201'},{...session,started:'2026-10-09 00:00:01+00'},{...session,app:'bs_primary_race_101_second'}]) {
    assert.throws(() => assertClusterIdentity(original,{...original,sessions:[foreign]},binding,[session]), /Foreign session/);
  }
  assert.throws(() => assertClusterIdentity(original,original,binding,[session,session]), /Duplicate/);
});
test('rejects remote listeners, absent catalog and unsafe session tuple SQL', () => {
  assert.throws(() => assertClusterIdentity(original,{...original,listenAddresses:'localhost'},binding), /control identity/);
  assert.throws(() => assertClusterIdentity(original,{...original,catalogIdentity:''},binding), /identity changed/);
  for (const foreign of [{...session,pid:'200;delete'},{...session,started:"2026-10-09';delete"},{...session,app:"bs_primary_race_101_first'"}]) assert.throws(() => sessionPredicate([foreign]), /tuple refused/);
  assert.equal(sessionPredicate([]),'false');
});

for (const mode of ['missing', 'public']) test(`CLI refuses ${mode} receipt before control-query transport`, () => {
  const dir = mkdtempSync('/private/tmp/strelva-booking-receipt-unit-');
  try {
    const data=resolve(dir,'data'), socket=resolve(dir,'socket'), receipt=resolve(dir,'booking-owned-cluster.json'), observed=resolve(dir,'connected');
    mkdirSync(data,{mode:0o700}); mkdirSync(socket,{mode:0o700});
    writeFileSync(resolve(data,'postmaster.pid'),[process.pid,data,String(Math.floor(Date.now()/1000)),'54321',socket,'',''].join('\n'),{mode:0o600});
    writeFileSync(resolve(dir,'psql'),'#!/bin/sh\nprintf observed > "$BOOKING_OWNED_TEST_OBSERVED"\nexit 3\n',{mode:0o755});
    if(mode==='public') writeFileSync(receipt,'{}',{mode:0o644});
    const result=spawnSync(process.execPath,[resolve('scripts/lib/booking-owned-cluster.mjs'),'verify','--receipt',receipt,'--data',data,'--socket',socket,'--postmaster-pid',String(process.pid),'--owner-pid',String(process.pid),'--',`--host=${socket}`,'--port=54321','--username=fixture','--dbname=fixture'],{encoding:'utf8',timeout:5000,env:{...process.env,PATH:`${dir}:${process.env.PATH}`,BOOKING_OWNED_TEST_OBSERVED:observed}});
    assert.ifError(result.error); assert.equal(result.status,1); assert.equal(existsSync(observed),false,'refusal must precede SQL transport');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
