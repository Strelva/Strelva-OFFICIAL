// Root-owned disposable booking proof admission. No daemon creation or shutdown.
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function assertClusterIdentity(expected, actual, binding, allowed = []) {
  for (const key of ['data', 'socket', 'port', 'postmasterPid', 'postmasterBirth', 'ownerPid', 'ownerBirth', 'pidFileEpoch', 'systemIdentifier', 'postmasterEpoch', 'databaseOid', 'databaseName', 'roleOid', 'roleName', 'catalogIdentity']) {
    if (actual[key] !== expected[key]) throw Error(`Owned booking cluster identity changed: ${key}`);
  }
  for (const key of ['data', 'socket', 'postmasterPid', 'ownerPid']) {
    if (expected[key] !== binding[key]) throw Error(`Owned booking cluster binding changed: ${key}`);
  }
  if (!actual.systemIdentifier || !actual.catalogIdentity || actual.listenAddresses !== '' || actual.port !== String(binding.port)) throw Error('Owned booking cluster control identity unavailable');
  const identities = new Set(allowed.map(session => `${session.pid}|${session.started}|${session.app}`));
  if (identities.size !== allowed.length) throw Error('Duplicate owned booking session identity');
  for (const session of actual.sessions) {
    if (!identities.has(`${session.pid}|${session.started}|${session.app}`)) throw Error('Foreign session in owned booking cluster');
  }
}

export function sessionPredicate(sessions) {
  if (!Array.isArray(sessions)) throw Error('Owned booking session array required');
  return sessions.map(session => {
    if (!/^\d+$/.test(session.pid) || Number(session.pid) < 2 || !/^[0-9 :.+-]+$/.test(session.started)
      || !/^bs_primary_race_\d+_(barrier|first|second)$/.test(session.app)) throw Error('Owned booking session tuple refused');
    return `(pid=${session.pid} and backend_start='${session.started}'::timestamptz and application_name='${session.app}')`;
  }).join(' or ') || 'false';
}

const sql = `select jsonb_build_object(
 'systemIdentifier',(select system_identifier::text from pg_control_system()),
 'postmasterEpoch',floor(extract(epoch from pg_postmaster_start_time()))::text,
 'data',current_setting('data_directory'),'socket',current_setting('unix_socket_directories'),
 'listenAddresses',current_setting('listen_addresses'),'port',current_setting('port'),
 'databaseName',current_database(),'databaseOid',(select oid::text from pg_database where datname=current_database()),
 'roleName',current_user,'roleOid',(select oid::text from pg_roles where rolname=current_user),
 'catalogIdentity',case when to_regclass('public.booking_settings') is not null
   and to_regprocedure('public.booking_tenant(text)') is not null
   and to_regprocedure('public.upsert_tenant_booking_settings(text,jsonb,text)') is not null then
 encode(sha256(convert_to(jsonb_build_object(
   'table',(select jsonb_build_object('oid',oid,'owner',relowner,'type',reltype,'file',relfilenode,'namespace',relnamespace,'kind',relkind,'rls',relrowsecurity,'forceRls',relforcerowsecurity,'acl',relacl) from pg_class where oid='public.booking_settings'::regclass),
   'attributes',(select jsonb_agg(to_jsonb(a) order by attnum) from pg_attribute a where attrelid='public.booking_settings'::regclass and attnum>0),
   'functions',(select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where oid in ('public.booking_tenant(text)'::regprocedure,'public.upsert_tenant_booking_settings(text,jsonb,text)'::regprocedure))
 )::text,'UTF8')),'hex') end,
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('pid',pid::text,'started',backend_start::text,'app',application_name) order by pid)
 from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()),'[]'::jsonb))`;

function privatePath(path, directory = false, privateMode = true) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || info.uid !== process.getuid() || (directory ? !info.isDirectory() : !info.isFile()) || (info.mode & (privateMode ? 0o077 : 0o022))) throw Error('Owned booking artifact authority refused');
}
function birth(pid) {
  if (!/^\d+$/.test(String(pid)) || Number(pid) < 2) throw Error('Invalid owned booking PID');
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'uid=', '-o', 'lstart='], { encoding: 'utf8', timeout: 3000, env: { ...process.env, LC_ALL: 'C' } });
  if (result.status !== 0 || result.error || !result.stdout.trim()) throw Error('Owned booking PID no longer alive');
  const match = result.stdout.trim().match(/^(\d+)\s+(.+)$/);
  if (!match || Number(match[1]) !== process.getuid()) throw Error('Owned booking PID owner changed');
  return match[2];
}
function readBinding(args) {
  const values = {};
  const divider = args.indexOf('--');
  if (divider < 0) throw Error('Owned booking psql arguments required');
  for (let index = 0; index < divider; index += 2) {
    const name = args[index];
    if (!['--receipt', '--data', '--socket', '--postmaster-pid', '--owner-pid', '--allowed'].includes(name) || values[name] !== undefined || args[index + 1] === undefined) throw Error('Invalid owned booking receipt arguments');
    values[name] = args[index + 1];
  }
  for (const name of ['--receipt', '--data', '--socket', '--postmaster-pid', '--owner-pid']) if (!values[name]) throw Error('Owned booking receipt binding required');
  const psqlArgs = args.slice(divider + 1);
  const flags = {};
  for (const arg of psqlArgs) {
    if (arg === '--no-psqlrc' || arg === '--set=ON_ERROR_STOP=1') continue;
    const match = arg.match(/^--(host|port|username|dbname)=(.+)$/);
    if (!match || flags[match[1]]) throw Error('Owned booking connection override refused');
    flags[match[1]] = match[2];
  }
  for (const name of ['host', 'port', 'username', 'dbname']) if (!flags[name]) throw Error('Owned booking exact connection required');
  const data = realpathSync(values['--data']); const socket = realpathSync(values['--socket']);
  privatePath(data, true); privatePath(socket, true, false); privatePath(dirname(data), true);
  if (realpathSync(flags.host) !== socket || !/^\d+$/.test(flags.port)) throw Error('Owned booking socket/port binding refused');
  const pidPath = resolve(data, 'postmaster.pid'); privatePath(pidPath, false, false);
  const lines = readFileSync(pidPath, 'utf8').split('\n');
  if (lines[0] !== values['--postmaster-pid'] || realpathSync(lines[1]) !== data || lines[3] !== flags.port || realpathSync(lines[4]) !== socket || !/^\d+$/.test(lines[2])) throw Error('Owned booking postmaster file identity changed');
  const receipt = resolve(values['--receipt']);
  if (dirname(receipt) !== realpathSync(dirname(data))) throw Error('Owned booking receipt must belong to the private cluster root');
  return { receipt, psqlArgs, allowed: JSON.parse(values['--allowed'] ?? '[]'), data, socket, port: flags.port,
    postmasterPid: values['--postmaster-pid'], ownerPid: values['--owner-pid'], pidFileEpoch: lines[2] };
}
function observe(binding) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  Object.assign(env, { PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c statement_timeout=3000 -c lock_timeout=1000', LC_ALL: 'C' });
  const transport = fileURLToPath(new URL('../sql/booking-psql.sh', import.meta.url));
  const result = spawnSync('bash', [transport, ...binding.psqlArgs, '--set=ON_ERROR_STOP=1', '--no-psqlrc', '-Atq', '-c', sql], { encoding: 'utf8', timeout: 5000, maxBuffer: 256 * 1024, env });
  if (result.status !== 0 || result.error || result.signal) throw Error('Owned booking control query failed');
  const observed = JSON.parse(result.stdout);
  observed.data = realpathSync(observed.data); observed.socket = realpathSync(observed.socket);
  if (observed.postmasterEpoch !== binding.pidFileEpoch || !Array.isArray(observed.sessions)) throw Error('Owned booking postmaster control mismatch');
  return { ...observed, postmasterPid: binding.postmasterPid, postmasterBirth: birth(binding.postmasterPid), ownerPid: binding.ownerPid,
    ownerBirth: birth(binding.ownerPid), pidFileEpoch: binding.pidFileEpoch };
}
function main(args) {
  const mode = args.shift();
  if (mode === 'predicate') { process.stdout.write(sessionPredicate(JSON.parse(args[0]))); return; }
  const binding = readBinding(args);
  if (mode === 'seal') {
    const observed = observe(binding);
    assertClusterIdentity(observed, observed, binding);
    writeFileSync(binding.receipt, JSON.stringify({ version: 1, identity: observed, psqlArgs: binding.psqlArgs }, null, 2), { flag: 'wx', mode: 0o600 });
  } else if (mode === 'verify') {
    privatePath(binding.receipt);
    const saved = JSON.parse(readFileSync(binding.receipt, 'utf8'));
    if (saved.version !== 1 || JSON.stringify(saved.psqlArgs) !== JSON.stringify(binding.psqlArgs)) throw Error('Owned booking receipt connection changed');
    assertClusterIdentity(saved.identity, saved.identity, binding);
    const observed = observe(binding);
    assertClusterIdentity(saved.identity, observed, binding, binding.allowed);
  } else throw Error('Invalid owned booking receipt action');
  process.stdout.write('OWNED_BOOKING_CLUSTER_CONFIRMED\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
