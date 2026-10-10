import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('final teardown proof uses real complete fresh forward history',()=>{
 const source=readFileSync(`${root}scripts/check-guarded-teardown-fresh.sh`,'utf8');
 assert.ok(source.includes('/supabase/migrations/20*.sql | sort'));
 assert.ok(source.indexOf('done < <(printf')<source.indexOf('--file="$repo_root/tests/guarded-tenant-teardown-schema.sql"'));
 assert.ok(!source.includes('create table')&&!source.includes('rollback-'));
 const historical=readFileSync(`${root}scripts/check-workspace-sql.sh`,'utf8');
 assert.ok(!historical.includes('--file="$repo_root/tests/guarded-tenant-teardown-schema.sql"'));
 assert.ok(historical.includes('check-guarded-teardown-fresh.sh'));
});
