"""Owned loopback PostgreSQL: observe withdrawal/install serialization.

Input JSON must contain actual native adapter installArguments and existing
qualified source/grant identity receipts. This script creates no roles,
reviewer policy, qualification, source revisions or arbitrary native payload.
Both raced actions invoke actual actor-checked command functions.
"""
import json, os, pathlib, subprocess, sys, time, uuid
from urllib.parse import urlparse

if os.environ.get('STRELVA_LOCAL_AUTH_PROOF') != '1':
    raise SystemExit('Only an explicitly owned local Auth proof database is permitted.')
database = os.environ.get('STRELVA_LOCAL_DB_URL', '')
if urlparse(database).hostname not in ('localhost', '127.0.0.1'):
    raise SystemExit('Only the owned loopback database is permitted.')
if len(sys.argv) != 2:
    raise SystemExit('Usage: check-private-source-install-race.py actual-native-install-receipt.json')
f = json.loads(pathlib.Path(sys.argv[1]).read_text())
for key in ['sourceWorkspaceId', 'sourceSystemId', 'businessId', 'sourceUserId', 'grantId', 'makerUserId']:
    uuid.UUID(f[key])
a = f['installArguments']
if a['p_user_id'] != f['makerUserId'] or a['p_verified_email'] != f['makerEmail']:
    raise SystemExit('Install actor receipt mismatch.')
if a['p_lineage']['version']['businessId'] != f['businessId'] or a['p_lineage']['source']['systemId'] != f['sourceSystemId'] or a['p_lineage']['source']['businessId'] != f['sourceWorkspaceId'] or a['p_lineage']['version']['systemId'] != a['p_command_id']:
    raise SystemExit('Install source/destination receipt mismatch.')
uuid.UUID(a['p_command_id'])
uuid.UUID(a['p_lineage']['sourceRevisionId'])
base = ['psql', database, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def execute(sql):
    result = subprocess.run([*base, '-c', sql], text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def share(shared):
    return 'select public.set_private_application_source_share(' + ','.join([
        literal(f['sourceWorkspaceId'])+'::uuid', literal(f['sourceUserId'])+'::uuid', literal(f['sourceEmail']),
        literal(f['sourceSystemId'])+'::uuid', literal(f['businessId'])+'::uuid', 'true' if shared else 'false']) + ');'

install = 'select public.create_private_version_system_command(' + ','.join([
    literal(a['p_user_id'])+'::uuid', literal(a['p_verified_email']), literal(json.dumps(a['p_lineage']))+'::jsonb',
    literal(a['p_name']), literal(a['p_kind']), literal(a['p_command_id'])+'::uuid', literal(json.dumps(a['p_native_payload']))+'::jsonb']) + ');'

def run_race(name, held, attempted, refusal=None, finish_held="", before_release=None):
    app = 'private-install-race-' + str(uuid.uuid4())
    first = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    second = None
    try:
        first.stdin.write("begin;set local statement_timeout='35s';select pg_backend_pid();"+held+"select 'LOCKED';\n")
        first.stdin.flush()
        pid = None
        while True:
            line = first.stdout.readline().strip()
            if line.isdigit() and pid is None:
                pid = int(line)
            if line == 'LOCKED':
                break
            if first.poll() is not None:
                raise RuntimeError(first.stderr.read())
        if pid is None:
            raise AssertionError('Missing blocker identity.')
        second = subprocess.Popen([*base, '-c', "set application_name="+literal(app)+";set statement_timeout='35s';begin;"+attempted+'commit;'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic()+8
        observed = None
        while time.monotonic()<deadline:
            value=execute("select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'wait',wait_event_type,'blockers',pg_blocking_pids(pid),'query',query)),'[]'::jsonb) from pg_stat_activity where application_name="+literal(app))
            rows=json.loads(value)
            observed=next((row for row in rows if row['wait']=='Lock' and pid in row['blockers']),None)
            if observed:
                break
            if second.poll() is not None:
                raise AssertionError(name+': raced command did not wait on held source transaction: '+second.stderr.read())
            time.sleep(0.02)
        if not observed:
            raise AssertionError(name+': no observed source blocker before deadline.')
        if before_release:
            before_release()
        first.stdin.write(finish_held+'commit;\n');first.stdin.close()
        first.wait(timeout=40)
        if first.returncode:
            raise RuntimeError(first.stderr.read())
        output, error=second.communicate(timeout=40)
        if refusal:
            if second.returncode==0 or refusal not in error:
                raise AssertionError(name+': expected current-authority refusal: '+error)
        elif second.returncode:
            raise RuntimeError(error)
        if 'deadlock detected' in error:
            raise AssertionError(name+': deadlock, not serialization.')
        print(json.dumps({'case':name,'observedBlocker':pid,'waiter':observed['pid'],'wait':observed['wait'],
                          'result':'authority refusal' if refusal else 'serialized after install'}))
    finally:
        if first.poll() is None:
            first.terminate();first.wait(timeout=5)
        if second is not None and second.poll() is None:
            second.terminate();second.wait(timeout=5)

# Preflight a real marked grant and genuinely qualified source; never arrange
# either through arbitrary rows. Commands below only toggle this exact share.
preflight='select jsonb_build_object(\'grantMatches\',exists(select 1 from public.system_package_install_grants g join public.private_source_install_grants marker on marker.grant_id=g.id join public.system_version_source_revisions r on r.id=g.source_revision_id join public.system_version_sources source on source.system_id=r.source_system_id where g.id='+literal(f['grantId'])+'::uuid and g.business_workspace_id='+literal(f['businessId'])+'::uuid and g.command_id='+literal(a['p_command_id'])+'::uuid and g.source_revision_id='+literal(a['p_lineage']['sourceRevisionId'])+'::uuid and source.business_workspace_id='+literal(f['sourceWorkspaceId'])+'::uuid and r.source_system_id='+literal(f['sourceSystemId'])+'::uuid and r.number='+str(int(a['p_lineage']['baseline']['revision']))+' and r.definition='+literal(json.dumps(a['p_lineage']['baseline']['definition']))+'::jsonb and g.expires_at>clock_timestamp() and public.system_package_install_grant_active(g,'+literal(f['makerUserId'])+'::uuid,'+literal(f['makerEmail'])+') and public.system_revision_is_qualified(r.id)));'
actual=json.loads(execute(preflight))
if actual!={'grantMatches':True}:
    raise SystemExit('Exact current marked grant/destination/command/source-revision/definition/actor linkage is required.')
if os.environ.get('STRELVA_PRIVATE_SOURCE_RACE') == 'expiry':
    # Root supplies a fresh legitimate owner-issued 20-second grant;
    # all command/qualification/actor provenance checks above still apply.
    remaining=float(execute('select extract(epoch from expires_at-clock_timestamp()) from public.system_package_install_grants where id='+literal(f['grantId'])+'::uuid;'))
    if not 12<=remaining<=20:
        raise SystemExit('Expiry proof requires 12–20 seconds of actual remaining grant lifetime after adapter setup.')
    print(json.dumps({'case':'bounded expiry setup margin','remainingSeconds':remaining,'minimumSeconds':12}))
    def wait_expiry():
        deadline=time.monotonic()+25
        while time.monotonic()<deadline:
            expired=execute('select expires_at<=clock_timestamp() from public.system_package_install_grants where id='+literal(f['grantId'])+'::uuid;')
            if expired=='t':
                return
            time.sleep(0.02)
        raise AssertionError('Expiry fixture did not expire inside the bounded race window.')
    source_lock='select public.system_version_assert_source_manager('+','.join([literal(f['sourceWorkspaceId'])+'::uuid',literal(f['sourceUserId'])+'::uuid',literal(f['sourceEmail'])])+');select 1 from public.system_version_sources where system_id='+literal(f['sourceSystemId'])+'::uuid for update;'
    execute(share(True))
    run_race('grant expires while native install waits on source',source_lock,install,'business_record_access_denied',before_release=wait_expiry)
    installed=execute('select exists(select 1 from public.saved_product_work w join public.system_package_install_grants g on g.work_id=w.id where g.id='+literal(f['grantId'])+'::uuid);')
    if installed!='f':
        raise AssertionError('Expired admission created destination work.')
    print(json.dumps({'case':'fresh expiry after all locks; no native draft created','installed':False}))
    sys.exit(0)
# This first ordering intentionally holds ONLY source, not the share. Start
# native install and observe its source wait before withdrawing in the same
# holding transaction. The old share->source order deadlocks here.
source_lock='select public.system_version_assert_source_manager('+','.join([literal(f['sourceWorkspaceId'])+'::uuid',literal(f['sourceUserId'])+'::uuid',literal(f['sourceEmail'])])+');select 1 from public.system_version_sources where system_id='+literal(f['sourceSystemId'])+'::uuid for update;'
execute(share(True))
unused=execute('select not exists(select 1 from public.saved_product_work w join public.system_package_install_grants g on g.work_id=w.id where g.id='+literal(f['grantId'])+'::uuid);')
if unused!='t':
    raise SystemExit('Both race orderings require one genuine unused exact install grant.')
run_race('source first; withdrawal wins; native install refuses',source_lock,install,'business_record_access_denied',finish_held=share(False))
refused=json.loads(execute('select jsonb_build_object(\'installed\',exists(select 1 from public.saved_product_work w where w.id=g.work_id),\'records\',(select count(*) from public.application_records r where r.work_id=g.work_id)) from public.system_package_install_grants g where g.id='+literal(f['grantId'])+'::uuid;'))
if refused!={'installed':False,'records':0}:
    raise AssertionError('Withdrawal-first refusal created destination work/records: '+json.dumps(refused))
print(json.dumps({'case':'withdrawal first retained unused exact grant; no destination work or records','state':refused}))
# Restore by the actual source-manager share command, then use that same still
# unused grant for the opposite ordering. No fixture grant is replaced.
execute(share(True))
run_race('native install wins; withdrawal waits', install, share(False))
# Withdrawal closes future agency admission, while the installed owner System
# is retained. This command reads data only; no customer records are created.
summary=json.loads(execute('select jsonb_build_object(\'active\',public.system_package_install_grant_active(g,'+literal(f['makerUserId'])+'::uuid,'+literal(f['makerEmail'])+'),\'records\',(select count(*) from public.application_records where work_id=g.work_id),\'installed\',exists(select 1 from public.saved_product_work where id=g.work_id)) from public.system_package_install_grants g where id='+literal(f['grantId'])+'::uuid;'))
if summary != {'active': False, 'records': 0, 'installed': True}:
    raise AssertionError('Unexpected retained native draft/customer record state: '+json.dumps(summary))
print(json.dumps({'case':'withdrawal retained owner draft; no copied records','state':summary}))
