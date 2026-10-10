export const fakePsqlSource = `#!/usr/bin/env node
const sql = process.argv.at(-1);
const joined = process.argv.join(' ');
const mode = process.env.BOOKING_FAKE_MODE;
const fs = require('node:fs');
if (process.env.BOOKING_FAKE_ENV_LOG) fs.appendFileSync(process.env.BOOKING_FAKE_ENV_LOG,JSON.stringify({sql,pg:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('PG')))})+'\\n');
const app = joined.match(/set application_name='([^']+)'/)?.[1];
if (joined.includes('BOOKING_OWNED_SESSION')) console.log('BOOKING_OWNED_SESSION|' + process.pid + '|2026-10-09 00:00:00+00|' + app);
if ((mode === 'signal_body' || mode === 'signal_query' || mode === 'signal_child') && app?.endsWith('_first')) {
 process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);
} else if ((mode === 'signal_body' || mode === 'signal_query' || mode === 'signal_child') && sql.startsWith('select exists') && sql.includes('_first') && sql.includes('wait_event')) { if(mode==='signal_body') setTimeout(()=>{console.log('t');process.exit(0);},500); else process.exit(3); }
else if (mode === 'writer_error' && app?.endsWith('_first')) process.exit(7);
else if (mode === 'hung_child' && app?.endsWith('_first')) {
  process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);
} else if (sql.startsWith('select jsonb_build_object(')) {
 const fs = require('node:fs');
 const sessionRemains = mode === 'sessions_remain' && fs.readFileSync(process.env.BOOKING_FAKE_STATUS, 'utf8').includes('phase=cleanup terminate_query=');
 console.log(JSON.stringify({data: process.env.BOOKING_FAKE_DATA, socket: process.env.BOOKING_FAKE_SOCKET, port: '54321', listenAddresses: '', systemIdentifier: 'fictional-only', postmasterEpoch: process.env.BOOKING_FAKE_EPOCH,
 databaseOid: '1', databaseName: 'fixture', roleOid: '2', roleName: 'fixture', catalogIdentity: 'fictional-only', sessions: sessionRemains ? [{pid:'999999',started:'2026-10-09 00:00:00+00',app:'foreign-fixture'}] : []}));
} else if (sql.startsWith('select exists(select 1 from public.tenants')) console.log('f');
else if (sql.startsWith('insert into public.tenants')) console.log('ed182000-0000-4000-8000-000000000001');
else if (sql.startsWith('select revision')) console.log('1');
else if (sql.startsWith('select coalesce(bool_and(pg_terminate_backend')) {
  if (mode === 'signal_query') { setTimeout(()=>{console.log('t');process.exit(0);},500); }
  else if (mode === 'terminate_error') { console.error('Fictional termination query failure'); process.exit(3); }
  if(mode!=='signal_query') console.log(mode === 'terminate_false' ? 'f' : 't');
} else if (sql.startsWith('begin;delete from public.booking_settings')) {
  if (mode === 'signal_delete') setTimeout(()=>process.exit(0),500);
  if (mode === 'delete_error') { console.error('Fictional fixture deletion failure'); process.exit(3); }
} else if (sql.startsWith('select not exists(select 1 from pg_stat_activity')) console.log('t');
else if (sql.startsWith('select not exists(select 1 from public.tenants')) console.log(mode === 'fixture_remains' ? 'f' : 't');
else if (sql.startsWith('select exists') || sql.startsWith('select count') || sql.startsWith('select default_length')) console.log('t');
`;
