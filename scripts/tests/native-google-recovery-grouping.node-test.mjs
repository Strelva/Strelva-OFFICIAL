import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=(name)=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const historical=read('supabase/migrations/20261021140000_native_google_lifecycle.sql');
const successor=read('supabase/migrations/20261021140200_native_google_recovery_receipt_grouping.sql');
const body=historical.match(/create function public.save_native_google_recovered_activation\(.*?as \$\$(.*?)\$\$;/s)[1];
const hash=(value)=>createHash('sha256').update(value).digest('hex');
test('successor pins exact historical body and only groups the two receipt extractions',()=>{
 const fixed=body.replace("(new_step->'receipt'-array","((new_step->'receipt')-array").replace("(old_step->'receipt'-array","((old_step->'receipt')-array");
 assert.equal(hash(body),'a3fc6d449bcc218835cf24f873bd561f1e22b2b1f9bcd8a0725cac850a7ad527');
 assert.equal(hash(fixed),'07c4df3b9c602f06b5dd9d78d3bc9f29332dbe852d19bed472c029ec7b0abedf');
 assert.ok(successor.includes(hash(body))&&successor.includes(hash(fixed)));
 assert.equal(fixed.replace("((new_step->'receipt')-array","(new_step->'receipt'-array").replace("((old_step->'receipt')-array","(old_step->'receipt'-array"),body);
});
test('diagnostics retain acceptedAt refusal and positive recovery checks',()=>{
 const fixture=read('tests/native-google-completed-undo-schema.sql');
 assert.match(fixture,/bad:=jsonb_set\(next,'\{steps,0,receipt,acceptedAt\}'.*'make_real_activation_invalid'/);
 assert.match(fixture,/got:=public.save_native_google_recovered_activation/);
 assert.match(fixture,/get stacked diagnostics.*returned_sqlstate.*pg_exception_detail.*pg_exception_context/);
});
test('qualification reapplies grouping after each lifecycle recreation',()=>{
 const harness=read('tests/support/native-google-lifecycle-qualification.sh');
 assert.match(harness,/recovery-late-authority/);
 assert.equal((harness.match(/-f "\$recovery_successor"/g)||[]).length,2);
 assert.ok(harness.indexOf('recovery-reapply.log')<harness.indexOf('applied-after.snapshot'));
 assert.ok(harness.indexOf('final-recovery-reapply.log')<harness.indexOf('final-applied.snapshot'));
});
