import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {verifyReleaseInventory} from '../../scripts/release-safety/inventory';
import {exactForwardLedger} from '../../scripts/lib/governed-creator-exit-proof.mjs';
const read=(name:string)=>readFileSync(name,'utf8');
const forward='20261022173000_neutral_creator_version_money.sql',inverse=`rollback-${forward}`;
const inventory=JSON.parse(read('scripts/sql/historical-forward-inventory.json'));
const ports=[...read(`supabase/migrations/${forward}`).matchAll(/create function public\.([a-z_]+)\(/g)].map(item=>item[1]!);
describe('exact additive neutral money composition',()=>{
 it('admits only the exact sorted unique354 historical ledger',()=>{
  const historical=inventory.forwardFiles as string[];
  expect(inventory.forwardCount).toBe(354);expect(historical).toEqual([...historical].sort());expect(historical).toHaveLength(354);expect(new Set(historical).size).toBe(354);expect(historical.at(-1)).toBe('20261022182000_booking_settings_atomic_patch.sql');
  const versions=historical.map(name=>name.slice(0,14));expect(exactForwardLedger(inventory,versions)).toEqual(versions);
  expect(()=>exactForwardLedger(inventory,versions.slice(0,-1))).toThrow();expect(()=>exactForwardLedger(inventory,historical.filter(name=>!name.startsWith('20261021140200_')&&!name.startsWith('20261022175100_')).map(name=>name.slice(0,14)))).toThrow();expect(()=>exactForwardLedger(inventory,[...versions.slice(0,-1),'20990000000000'])).toThrow();expect(()=>exactForwardLedger(inventory,[...versions].reverse())).toThrow();
 });
 it('covers exactly the historical354 plus the pinned held lifetime-kind extension without extending historical qualification',()=>{
  const staged='20261022183000_lifetime_system_kind.sql';
  const physical=readdirSync('supabase/migrations').filter(name=>/^\d{14}_.*\.sql$/.test(name)).sort();
  // Only this named staged extension is additional; every unknown addition fails equality.
  expect(inventory.forwardFiles).not.toContain(staged);
  expect(physical).toEqual([...inventory.forwardFiles,staged].sort());expect(physical).toHaveLength(355);expect(new Set(physical).size).toBe(355);
  // Source coverage of the extension does not admit it to the qualified historical ledger.
  expect(()=>exactForwardLedger(inventory,physical.map(name=>name.slice(0,14)))).toThrow();
  const manifest=JSON.parse(read('scripts/release-safety/batches.json'));
  const batches=manifest.proposed.filter((item:{id:string})=>item.id==='lifetime-system-kind');expect(batches).toHaveLength(1);
  const batch=batches[0];expect(batch.items).toHaveLength(1);
  const item=batch.items[0];expect(item.file).toBe(staged);expect(item.rollback).toBe(`rollback-${staged}`);
  expect(item.sha256).toBe('cb4634ccfa6dc84e701cc08b707e631ffa2cf813d88899e14dc6294e76aca417');
  expect(item.rollbackSha256).toBe('95978ca755b1d88c702c30410d438f6a33fad7c6b7f2900c9aa38c9fa3c6634d');
  for(const [file,pin] of [[item.file,item.sha256],[item.rollback,item.rollbackSha256]])expect(createHash('sha256').update(readFileSync(`supabase/migrations/${file}`)).digest('hex')).toBe(pin);
  expect(batch.status).toContain('UNRUN/held');expect(batch.status).toContain('no deployment or migration application authorized');expect(item.rollbackStatus).toContain('UNRUN/held');
 });
 it('pins actual forward and retained-history inverse bytes without a qualification claim',()=>{
  verifyReleaseInventory(process.cwd());const manifest=JSON.parse(read('scripts/release-safety/batches.json'));const batch=manifest.proposed.find((item:{id:string})=>item.id==='neutral-creator-version-money');expect(batch.items).toHaveLength(1);
  const item=batch.items[0];expect(item.file).toBe(forward);expect(item.rollback).toBe(inverse);
  for(const [file,pin] of [[item.file,item.sha256],[item.rollback,item.rollbackSha256]])expect(createHash('sha256').update(readFileSync(`supabase/migrations/${file}`)).digest('hex')).toBe(pin);
  expect(batch.status).toContain('unqualified');expect(item.rollbackStatus).toContain('retains every immutable paid Version row');
 });
 it('includes native installation and exact catalog checks before final exposure and read-only scanning in both existing SQL owners',()=>{
  for(const script of ['scripts/check-workspace-sql.sh','scripts/check-workspace-upgrade.sh']){
   const source=read(script),position=source.lastIndexOf(`/supabase/migrations/${forward}`);expect(position).toBeGreaterThan(source.lastIndexOf('/tests/governed-money-operations-schema.sql'));expect(source.lastIndexOf('/scripts/sql/neutral-creator-version-money-contract.sql')).toBeGreaterThan(position);expect(source.lastIndexOf('/tests/function-exposure-schema.sql')).toBeGreaterThan(position);expect(source.lastIndexOf('/scripts/check-readonly-rpcs.mjs')).toBeGreaterThan(position);
  }
 });
 it('keeps exact eight-port private exposure and retained-table/column protections alongside the original six-port group',()=>{
  const exposure=read('tests/function-exposure-schema.sql');expect(ports).toHaveLength(8);for(const name of ports)expect(exposure).toContain(`public.${name}(`);
  expect(exposure).toContain('installed not in(0,8)');expect(exposure).toContain('has_any_column_privilege');expect(exposure).toContain('neutral source money retained history exposed directly');expect(exposure).toContain('installed not in(0,6)');
 });
 it('keeps fixed native qualification counts and binds creator coordinator to new canonical checks before and after original inverse/reapply',()=>{
  const authority=read('scripts/private-authority-journey-window.mjs');expect(authority).toContain('migrations?.length !== 354');expect(authority).toContain('ledger?.length !== 354');
  const checkout=read('scripts/check-checkout-final-admission-races.mjs');expect(checkout).toContain('inventory.forwardCount !== 354');expect(checkout).toContain('JSON.stringify(installedLedger) !== JSON.stringify(expectedLedger)');
  const creator=read('scripts/check-governed-creator-exit-races.mjs');expect(creator).toContain("'scripts/sql/neutral-creator-version-money-contract.sql'");expect(creator).toContain("'scripts/sql/private-source-current-contract.sql'");expect(creator).toContain("run('neutral-source-contract'");expect(creator).toContain("run('reapplied-neutral-source-contract'");
 });
});
