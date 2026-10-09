import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCandidateMigrations } from './check-workspace-target.mjs';
import { parseLocalStackEnv } from './full-model-journey-profile.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value);
export function migrationInventory(directory) {
  return readCandidateMigrations(directory).map(({version, name}) => {
    const file = `${version}_${name}.sql`;
    return { version, file, sha256: hash(readFileSync(join(directory, file))) };
  });
}
export function assertBaseline(baseline, current) {
  if (!baseline || baseline.format !== 1 || baseline.phase !== 'fresh-bootstrap' || !baseline.recordedAt)
    throw new Error('Unknown bootstrap baseline; create a new owned stack.');
  for (const field of ['binding', 'databaseIdentity', 'migrations', 'ledger', 'catalogSha256', 'rolesSha256', 'dumpVersion'])
    if (canonical(baseline[field]) !== canonical(current[field])) throw new Error(`Stack qualification mismatch: ${field}.`);
  return { qualified: true, scope: 'owned-local-schema-only', fullReleaseQualified: false,
    baselineSha256: hash(canonical(baseline)), current };
}
function capture(root, env) {
  const stack = env.STRELVA_AUTH_STACK_DIR;
  const config = readFileSync(join(stack, 'supabase/config.toml'), 'utf8');
  const port = section => Number(new RegExp(`\\[${section}\\][\\s\\S]*?\\nport\\s*=\\s*(\\d+)`).exec(config)?.[1]);
  const db = new URL(env.STRELVA_LOCAL_DB_URL), api = new URL(env.SUPABASE_URL);
  if (Number(db.port) !== port('db') || Number(api.port) !== port('api')
    || env.NEXT_PUBLIC_SUPABASE_URL !== env.SUPABASE_URL) throw new Error('Owned stack endpoint/configuration mismatch.');
  const migrations = migrationInventory(join(root, 'supabase/migrations'));
  if (canonical(migrations) !== canonical(migrationInventory(join(stack, 'supabase/migrations'))))
    throw new Error('Current and staged forward migration bytes differ.');
  // Do not inherit PGOPTIONS/PGSERVICE or emit database credentials in errors.
  const cleanEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  cleanEnv.LC_ALL = 'C';
  const run = (command, args) => {
    try { return execFileSync(command, args, { env: cleanEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] }); }
    catch { throw new Error(`Owned database ${command} capture failed; no qualification recorded.`); }
  };
  const sql = query => JSON.parse(run('psql', [env.STRELVA_LOCAL_DB_URL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query]).trim());
  const databaseIdentity = sql("select jsonb_build_object('systemIdentifier',(select system_identifier::text from pg_control_system()),'databaseOid',(select oid::text from pg_database where datname=current_database()),'database',current_database())");
  const ledger = sql("select coalesce(jsonb_agg(to_jsonb(m) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations m");
  if (canonical(ledger.map(row => row.version)) !== canonical(migrations.map(row => row.version)))
    throw new Error('Applied migration ledger does not match staged forwards.');
  for (const contract of ['scripts/sql/native-google-recovery-receipt-grouping-contract.sql', 'scripts/sql/legacy-google-operation-current-contract.sql'])
    run('psql', [env.STRELVA_LOCAL_DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, contract)]);
  // pg_dump includes definitions, triggers, policies, ownership, ACL and default ACL.
  // Role flags/membership live outside the schema dump and are captured separately.
  const roles = sql("select jsonb_build_object('roles',(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,'config',rolconfig) order by rolname) from pg_roles),'membership',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'grantor',g.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option) order by r.rolname,m.rolname,g.rolname),'[]'::jsonb) from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor))");
  const dumpVersion = run('pg_dump', ['--version']).trim();
  const catalog = run('pg_dump', ['--dbname', env.STRELVA_LOCAL_DB_URL, '--schema-only'])
    .split('\n').filter(line => !/^\\(un)?restrict\s/.test(line)).join('\n');
  return { binding: { stack: resolve(stack), configSha256: hash(config), databaseUrlSha256: hash(env.STRELVA_LOCAL_DB_URL), authUrlSha256: hash(env.SUPABASE_URL) },
    databaseIdentity, migrations, ledger, catalogSha256: hash(catalog), rolesSha256: hash(canonical(roles)), dumpVersion };
}
export function qualify(action, root, envFile) {
  const env = parseLocalStackEnv(readFileSync(envFile, 'utf8'));
  const baselineFile = join(env.STRELVA_AUTH_STACK_DIR, 'full-model-bootstrap-baseline.json');
  if (action === 'verify' && !existsSync(baselineFile)) throw new Error('Unknown bootstrap baseline; reuse refused. Create a new owned stack.');
  if (action === 'bootstrap' && existsSync(baselineFile)) throw new Error('Bootstrap baseline already exists; cannot re-bless a stack.');
  if (!['bootstrap','verify'].includes(action)) throw new Error('Choose bootstrap or verify.');
  const current = capture(resolve(root), env);
  if (action === 'bootstrap') {
    const baseline = { format: 1, phase: 'fresh-bootstrap', recordedAt: new Date().toISOString(), ...current };
    writeFileSync(baselineFile, canonical(baseline)+'\n', { flag: 'wx', mode: 0o600 });
    return { recorded: true, scope: 'owned-local-schema-only', fullReleaseQualified: false, baselineSha256: hash(canonical(baseline)) };
  }
  return assertBaseline(JSON.parse(readFileSync(baselineFile, 'utf8')), current);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(qualify(...process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
