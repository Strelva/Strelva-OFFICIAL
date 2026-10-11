import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('grant mutation pins lifecycle before the shared record lock and nested lookup',()=>{
 const source=readFileSync(`${root}supabase/migrations/20261021100800_tenant_connection_generation.sql`,'utf8');
 const hosted=source.indexOf("'hosted-tenant:'||p_tenant_id");
 const tenant=source.indexOf('from public.tenants where id=p_tenant_id for key share');
 const record=source.indexOf("':provider_connections:'");
 const nested=source.indexOf('return public.record_tenant_client_record');
 assert.ok(hosted>=0&&hosted<tenant&&tenant<record&&record<nested);
});
