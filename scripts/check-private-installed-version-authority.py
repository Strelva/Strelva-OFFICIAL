"""Source-only harness: actual installed private Version authority, owned local DB.
Receipts must come from genuine HTTP producers and native runtime reads. No
qualification, grant, clock, identity or membership rows are seeded here.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
from urllib.parse import unquote, urlparse


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def uid(value):
    uuid.UUID(value)
    return literal(value) + '::uuid'


def call(name, *values):
    return 'select public.' + name + '(' + ','.join(values) + ');'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('receipt')
    parser.add_argument('--forward', required=True)
    parser.add_argument('--case', choices=['expiry', 'staff', 'revision', 'membership', 'membership-dual-role'], required=True)
    args = parser.parse_args()
    if os.environ.get('STRELVA_LOCAL_AUTH_PROOF') != '1':
        raise SystemExit('Explicit owned local Auth proof required.')
    database = urlparse(os.environ.get('STRELVA_LOCAL_DB_URL', ''))
    auth = urlparse(os.environ.get('SUPABASE_URL', ''))
    stack = Path(os.environ.get('STRELVA_AUTH_STACK_DIR', '')).resolve()
    if database.scheme not in ['postgres', 'postgresql'] or database.hostname != '127.0.0.1' or database.path != '/postgres' or database.query or database.fragment:
        raise SystemExit('Exact owned loopback database required.')
    config = (stack / 'supabase/config.toml').read_text()
    if stack.stat().st_uid != os.getuid() or not re.fullmatch(r'strelva-auth\.[A-Za-z0-9]+', stack.name):
        raise SystemExit('Owned Auth stack directory required.')
    if not re.search(r'^project_id\s*=\s*"strelva-proof-[a-f0-9]{16}"\s*$', config, re.M):
        raise SystemExit('Owned proof project required.')
    def port(section):
        block = re.search(r'^\[' + section + r'\]\s*\n(.*?)(?=^\[|\Z)', config, re.M | re.S)
        value = re.search(r'^port\s*=\s*(\d+)\s*$', block[1], re.M) if block else None
        return int(value[1]) if value else None
    if database.port != port('db') or auth.hostname not in ['127.0.0.1', 'localhost'] or auth.scheme != 'http' or auth.port != port('api'):
        raise SystemExit('Auth/database ports must match the owned stack.')
    path = Path(args.receipt).resolve()
    proof = Path(os.environ.get('STRELVA_PRIVATE_SOURCE_PROOF_DIR', '')).resolve()
    if proof.stat().st_uid != os.getuid() or path.parent != proof or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise SystemExit('Private receipt in the owned proof directory required.')
    f = json.loads(path.read_text())
    if f['provenance'] != {'actualHttpProducers': True, 'actualNativeRuntime': True, 'localFictionalPolicy': True, 'productionQualification': False}:
        raise SystemExit('Actual producer/runtime provenance required.')
    candidate = f['candidate']
    if not re.fullmatch(r'[a-f0-9]{40}', candidate['sourceCommit']) or not re.fullmatch(r'[a-f0-9]{64}', candidate['forwardSha256']):
        raise SystemExit('Exact candidate source receipt required.')
    if sha256(Path(args.forward).read_bytes()).hexdigest() != candidate['forwardSha256']:
        raise SystemExit('Forward source bytes do not match the frozen candidate receipt.')
    installed, owner, maker, prep = f['installed'], f['owner'], f['maker'], f['preparation']
    for key in ['businessId', 'systemId', 'versionId', 'workId', 'grantId', 'sourceSystemId', 'sourceRevisionId', 'commandId']:
        uid(installed[key])
    for person in [owner, maker]:
        uid(person['userId'])
        if not person['email'].endswith('@example.test'):
            raise SystemExit('Fictional genuine Auth identities required.')
    uid(maker['agencyId'])
    if prep['p_workspace_id'] != installed['businessId'] or prep['p_version_id'] != installed['versionId'] or prep['p_user_id'] != maker['userId'] or prep['p_verified_email'] != maker['email']:
        raise SystemExit('Captured preparation actor/Version mismatch.')
    uid(prep['p_owner_decision_id'])
    save_args = f['saveArguments']
    if save_args['p_user_id'] != maker['userId'] or save_args['p_verified_email'] != maker['email'] or save_args['p_version_id'] != installed['versionId'] or save_args['p_lineage']['id'] != installed['versionId']:
        raise SystemExit('Actual captured generic Version command identity mismatch.')
    row_revision = int(prep['p_row_revision'])
    if int(save_args['p_expected_row_revision']) != row_revision:
        raise SystemExit('Generic command and preparation must capture the same current Version revision.')
    if row_revision < 1:
        raise SystemExit('Actual positive Version revision required.')
    # Finite child environment: never inherit PG service/options, psql config,
    # dynamic-loader, Node or Python preload variables from the caller.
    env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C',
           'PGCONNECT_TIMEOUT': '5', 'PGSSLMODE': 'disable', 'PGPASSFILE': '/dev/null',
           'PGHOST': database.hostname, 'PGPORT': str(database.port), 'PGUSER': unquote(database.username or ''),
           'PGPASSWORD': unquote(database.password or ''), 'PGDATABASE': unquote(database.path.lstrip('/'))}
    base = ['psql', '--no-psqlrc', '-A', '-t', '-q', '--set=ON_ERROR_STOP=1']
    def result(sql, timeout=15):
        return subprocess.run(base, input=sql, env=env, text=True, capture_output=True, timeout=timeout)
    def execute(sql):
        value = result(sql)
        if value.returncode:
            raise AssertionError('Native SQL failed: ' + value.stderr.replace(os.environ.get('STRELVA_LOCAL_DB_URL', ''), '[owned database]')[:1200])
        return value.stdout.strip()
    def expect_refused(sql):
        value = result('begin;' + sql + 'rollback;')
        if value.returncode == 0 or 'business_record_access_denied' not in value.stderr or 'deadlock detected' in value.stderr:
            raise AssertionError('Expected current-authority refusal: ' + value.stderr[:1200])
    def prepare(person):
        return call('record_version_preparation', uid(installed['businessId']), uid(person['userId']), literal(person['email']),
                    uid(installed['versionId']), str(row_revision), uid(prep['p_owner_decision_id']))
    def save(person, captured=save_args):
        return call('save_system_version', uid(person['userId']), literal(person['email']), uid(captured['p_version_id']), str(int(captured['p_expected_row_revision'])), literal(json.dumps(captured['p_lineage'])) + '::jsonb')
    def access(person):
        return 'select public.system_version_access(v,' + uid(person['userId']) + ',' + literal(person['email']) + ',true) from public.system_versions v where v.id=' + uid(installed['versionId']) + ';'
    def state():
        return execute("select jsonb_build_object('version',to_jsonb(v),'preparations',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.system_version_preparations p where p.version_id=v.id),'[]'::jsonb),'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.record_id) from public.application_records r where r.work_id=" + uid(installed['workId']) + "),'[]'::jsonb),'application',to_jsonb(a)) from public.system_versions v join public.application_states a on a.work_id=" + uid(installed['workId']) + ' where v.id=' + uid(installed['versionId']) + ';')
    preflight = execute("select jsonb_build_object('exactInstalled',exists(select 1 from public.system_versions v join public.system_version_native_applications n on n.version_id=v.id join public.system_package_install_grants g on g.work_id=n.work_id join public.private_source_install_grants marker on marker.grant_id=g.id join public.system_version_source_revisions r on r.id=g.source_revision_id join public.owner_decisions d on d.id=" + uid(prep['p_owner_decision_id']) + ' where v.id=' + uid(installed['versionId']) + ' and v.business_workspace_id=' + uid(installed['businessId']) + ' and v.version_system_id=' + uid(installed['systemId']) + ' and n.work_id=' + uid(installed['workId']) + ' and n.business_workspace_id=v.business_workspace_id and g.business_workspace_id=v.business_workspace_id and g.id=' + uid(installed['grantId']) + ' and g.command_id=' + uid(installed['commandId']) + ' and g.agency_workspace_id=' + uid(maker['agencyId']) + ' and g.granted_by=' + uid(owner['userId']) + ' and r.id=' + uid(installed['sourceRevisionId']) + ' and r.source_system_id=' + uid(installed['sourceSystemId']) + ' and r.number=' + str(int(installed['sourceRevision'])) + ' and v.source_system_id=r.source_system_id and v.baseline_revision_id=r.id and v.baseline_revision=r.number and v.row_revision=' + str(row_revision) + " and d.workspace_id=v.business_workspace_id and d.system_id=v.version_system_id and d.source_lifecycle='version_release' and d.source_id=v.id::text and public.system_revision_is_qualified(r.id) and not exists(select 1 from public.workspace_memberships direct where direct.workspace_id=v.business_workspace_id and direct.user_id=" + uid(maker['userId']) + ") and public.system_package_install_grant_active(g," + uid(maker['userId']) + ',' + literal(maker['email']) + ")),'currentMembershipLock',position('for share of membership,actor' in lower(pg_get_functiondef('public.system_version_access(public.system_versions,uuid,text,boolean)'::regprocedure)))>0,'journalCurrent', (select count(*)=17 and bool_and(body_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')) from public.private_definition_function_receipts));")
    if json.loads(preflight) != {'exactInstalled': True, 'currentMembershipLock': True, 'journalCurrent': True}:
        raise SystemExit('Actual installed grant/decision/Version or frozen successor preflight failed: ' + preflight)
    for person in [owner, maker]:
        authenticated = execute('select exists(select 1 from public.users u join auth.users auth on auth.id=u.id where u.id=' + uid(person['userId']) + ' and lower(u.email)=' + literal(person['email'].lower()) + ' and u.verified_at is not null and auth.email_confirmed_at is not null);')
        if authenticated != 't':
            raise SystemExit('Verified genuine Auth actor required.')
    if execute('select exists(select 1 from public.workspace_memberships where workspace_id=' + uid(installed['businessId']) + ' and user_id=' + uid(owner['userId']) + " and role='owner');") != 't':
        raise SystemExit('The actual customer owner must retain direct ownership.')
    baseline = state()
    execute('begin;' + prepare(maker) + 'rollback;')
    execute('begin;' + save(maker) + 'rollback;')
    execute('begin;' + prepare(owner) + 'rollback;')
    if state() != baseline:
        raise AssertionError('Rollback-only baseline changed native state.')
    def refusals(person):
        expect_refused(prepare(person))
        expect_refused(save(person))
        expect_refused(access(person))
        if state() != baseline:
            raise AssertionError('Refused installed write changed Version/preparation/records/application state.')
        # True customer owner can still prepare an installed Version.
        execute('begin;' + prepare(owner) + 'rollback;')
    def emit(case, **detail):
        print(json.dumps({'case': case, 'candidate': candidate, **detail}), flush=True)
    if args.case == 'expiry':
        remaining = float(execute('select extract(epoch from expires_at-clock_timestamp()) from public.system_package_install_grants where id=' + uid(installed['grantId']) + ';'))
        if not 0 < remaining <= 60:
            raise SystemExit('Fresh actual owner-issued installed grant must expire within 60 seconds.')
        deadline = time.monotonic() + 65
        while execute('select expires_at<=clock_timestamp() from public.system_package_install_grants where id=' + uid(installed['grantId']) + ';') != 't':
            if time.monotonic() >= deadline:
                raise AssertionError('Actual grant did not expire inside the bounded window.')
            time.sleep(.05)
        refusals(maker)
        emit('installed Version preparation/access refuse after actual grant expiry; customer owner retained', remainingSeconds=remaining)
    elif args.case == 'staff':
        def staff(active):
            return call('set_agency_client_staff', uid(maker['userId']), literal(maker['email']), uid(maker['agencyId']), uid(installed['businessId']), uid(maker['userId']), 'true' if active else 'false')
        execute(staff(False))
        try:
            refusals(maker)
            emit('installed Version preparation/access refuse after actual staff withdrawal; customer owner retained')
        finally:
            execute(staff(True))
    elif args.case == 'revision':
        mismatch = f['mismatch']
        actual = execute('select exists(select 1 from public.system_version_source_revisions r where r.id=' + uid(mismatch['revisionId']) + ' and r.source_system_id=' + uid(installed['sourceSystemId']) + ' and r.id<>' + uid(installed['sourceRevisionId']) + ' and r.number=' + str(int(mismatch['number'])) + ' and public.system_revision_is_qualified(r.id));')
        if actual != 't':
            raise SystemExit('Mismatch requires a distinct actual qualified revision of this same source.')
        exact = call('require_system_package_install_scope', uid(installed['businessId']), uid(maker['userId']), literal(maker['email']), uid(installed['sourceSystemId']), str(int(installed['sourceRevision'])), uid(installed['commandId']))
        execute('begin;' + exact + 'rollback;')
        expect_refused(call('require_system_package_install_scope', uid(installed['businessId']), uid(maker['userId']), literal(maker['email']), uid(installed['sourceSystemId']), str(int(mismatch['number'])), uid(installed['commandId'])))
        changed = f['mismatchSaveArguments']
        if changed['p_user_id'] != maker['userId'] or changed['p_verified_email'] != maker['email'] or changed['p_version_id'] != installed['versionId'] or int(changed['p_expected_row_revision']) != row_revision or changed['p_lineage']['id'] != installed['versionId'] or changed['p_lineage']['source']['systemId'] != installed['sourceSystemId'] or int(changed['p_lineage']['baseline']['revision']) != int(mismatch['number']):
            raise SystemExit('Actual captured different-revision adoption command required.')
        definition = execute('select definition=' + literal(json.dumps(changed['p_lineage']['baseline']['definition'])) + '::jsonb from public.system_version_source_revisions where id=' + uid(mismatch['revisionId']) + ';')
        if definition != 't':
            raise SystemExit('Requested adoption must carry this actual qualified source definition.')
        # Active install grant permits qualified improvements to the SAME work.
        # This is draft authority, not permission to publish a different row.
        adopted = json.loads(execute('begin;' + save(maker, changed) + 'rollback;'))
        if int(adopted['baseline']['revision']) != int(mismatch['number']) or adopted['baseline']['definition'] != changed['p_lineage']['baseline']['definition']:
            raise AssertionError('Actual generic draft save did not adopt the captured qualified baseline.')
        if state() != baseline:
            raise AssertionError('Revision mismatch changed installed native state.')
        emit('grant A refuses new-install scope B; same-work qualified draft B accepted under active grant', grantedRevision=installed['sourceRevision'], requestedRevision=mismatch['number'], draftSaveRolledBack=True, exactOwnerReleaseApproval='requires separate real Auth proof')
    else:
        members = f['memberships']
        if len(members) != 2 or len({person['userId'] for person in members}) != 2:
            raise SystemExit('Two independent real owner-invited nonowner managers required for opposite orderings.')
        for person in members:
            if person['userId'] in [owner['userId'], maker['userId']]:
                raise SystemExit('Owner and maker cannot be the revocable direct-member actors.')
            actual = execute('select exists(select 1 from public.workspace_invitations i join public.workspace_memberships m on m.workspace_id=i.workspace_id and m.user_id=i.accepted_by join public.users u on u.id=m.user_id join auth.users auth on auth.id=u.id where i.id=' + uid(person['invitationId']) + ' and i.workspace_id=' + uid(installed['businessId']) + ' and i.created_by=' + uid(owner['userId']) + ' and i.accepted_by=' + uid(person['userId']) + " and i.status='accepted' and i.role='admin' and m.role='admin' and i.recipient_email=lower(u.email) and lower(u.email)=" + literal(person['email'].lower()) + ' and u.verified_at is not null and auth.email_confirmed_at is not null);')
            if actual != 't':
                raise SystemExit('Actual accepted owner-HTTP admin invitation and genuine Auth membership required.')
            if args.case == 'membership-dual-role':
                actual_agency = execute('select exists(select 1 from public.workspace_invitations i join public.workspace_memberships m on m.workspace_id=i.workspace_id and m.user_id=i.accepted_by join public.agency_client_staff staff on staff.agency_workspace_id=m.workspace_id and staff.user_id=m.user_id join public.provider_seats seat on seat.agency_workspace_id=staff.agency_workspace_id and seat.customer_workspace_id=staff.customer_workspace_id where i.id=' + uid(person['agencyInvitationId']) + ' and i.workspace_id=' + uid(maker['agencyId']) + ' and i.created_by=' + uid(maker['userId']) + ' and i.accepted_by=' + uid(person['userId']) + " and i.status='accepted' and i.role='admin' and m.role='admin' and i.recipient_email=" + literal(person['email'].lower()) + ' and staff.customer_workspace_id=' + uid(installed['businessId']) + " and staff.status='active' and seat.status='active');")
                if actual_agency != 't':
                    raise SystemExit('Genuine maker-owner agency invitation, current agency admin/staff and provider seat required.')
            execute('begin;' + prepare(person) + 'rollback;')
        if args.case == 'membership-dual-role':
            # No SQL clock or grant mutation: root issued this real grant with
            # enough remaining lifetime for initial maker and dual-role baselines.
            remaining = float(execute('select extract(epoch from expires_at-clock_timestamp()) from public.system_package_install_grants where id=' + uid(installed['grantId']) + ';'))
            if not 0 < remaining <= 60:
                raise SystemExit('Dual-role race requires a still-current genuine grant expiring within sixty seconds.')
            deadline = time.monotonic() + 65
            while execute('select expires_at<=clock_timestamp() from public.system_package_install_grants where id=' + uid(installed['grantId']) + ';') != 't':
                if time.monotonic() >= deadline:
                    raise AssertionError('Dual-role grant did not actually expire.')
                time.sleep(.05)
            for person in members:
                active = execute('select public.system_package_install_grant_active(g,' + uid(person['userId']) + ',' + literal(person['email']) + ') from public.system_package_install_grants g where g.id=' + uid(installed['grantId']) + ';')
                if active != 'f':
                    raise AssertionError('Dual-role provider must have no live exact grant fallback.')
                # Genuine direct customer admin authority still works while the
                # otherwise active provider/agency identity has an expired grant.
                execute('begin;' + prepare(person) + 'rollback;')
            emit('dual-role provider/admin exact grant actually expired; direct customer admin baselines retained', remainingSeconds=remaining)
        def revoke(person):
            return call('revoke_access_review_entry', uid(installed['businessId']), uid(installed['businessId']), uid(owner['userId']), literal(owner['email']), 'false', literal('member'), uid(person['userId']))
        def race(name, held, attempted, refused):
            blocker = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True, bufsize=1)
            waiter = None
            try:
                blocker.stdin.write("begin;set local statement_timeout='35s';select pg_backend_pid();" + held + "select 'HELD';\n")
                blocker.stdin.flush()
                pid = None
                while True:
                    line = blocker.stdout.readline().strip()
                    if line.isdigit() and pid is None:
                        pid = int(line)
                    if line == 'HELD':
                        break
                    if blocker.poll() is not None:
                        raise AssertionError(blocker.stderr.read()[:1200])
                if pid is None:
                    raise AssertionError('Missing real blocker PID.')
                application = 'private-version-membership-' + str(uuid.uuid4())
                waiter = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
                waiter.stdin.write('set application_name=' + literal(application) + ";set statement_timeout='35s';begin;" + attempted + 'commit;\n')
                waiter.stdin.close()
                observed = None
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    rows = json.loads(execute("select coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'wait',a.wait_event_type,'blockers',pg_blocking_pids(a.pid),'membershipTupleObserved',exists(select 1 from pg_locks tuple_lock where tuple_lock.pid=a.pid and tuple_lock.locktype='tuple' and tuple_lock.relation='public.workspace_memberships'::regclass),'membershipRelationHeld',exists(select 1 from pg_locks relation_lock where relation_lock.pid=a.pid and relation_lock.locktype='relation' and relation_lock.relation='public.workspace_memberships'::regclass and relation_lock.granted))),'[]'::jsonb) from pg_stat_activity a where a.application_name=" + literal(application) + ';'))
                    observed = next((row for row in rows if row['wait'] == 'Lock' and pid in row['blockers'] and row['membershipTupleObserved'] and row['membershipRelationHeld']), None)
                    if observed:
                        break
                    if waiter.poll() is not None:
                        raise AssertionError('Command did not wait on real membership transaction: ' + waiter.stderr.read()[:1200])
                    time.sleep(.02)
                if not observed:
                    raise AssertionError('No observed exact workspace_memberships tuple/relation blocker; no permission closure claimed.')
                blocker.stdin.write('commit;\n'); blocker.stdin.close(); blocker.wait(timeout=40)
                if blocker.returncode:
                    raise AssertionError(blocker.stderr.read()[:1200])
                waiter.wait(timeout=40)
                error = waiter.stderr.read()
                if 'deadlock detected' in error or (refused and (waiter.returncode == 0 or 'business_record_access_denied' not in error)) or (not refused and waiter.returncode != 0):
                    raise AssertionError('Unexpected membership ordering result: ' + error[:1200])
                emit(name, observedBlocker=pid, waiter=observed['pid'], wait=observed['wait'], membershipTupleObserved=observed['membershipTupleObserved'], membershipRelationHeld=observed['membershipRelationHeld'], fixtureKind=args.case, result='current-authority refusal' if refused else 'serialized after admission')
            finally:
                for process in [blocker, waiter]:
                    if process is not None and process.poll() is None:
                        process.terminate(); process.wait(timeout=5)
        race('direct customer membership withdrawal wins; standalone preparation refuses', revoke(members[0]), prepare(members[0]), True)
        refusals(members[0])
        # Reuse genuine decision: preparation may already be idempotent, but its
        # actual admission must still lock membership before returning.
        race('standalone preparation wins; actual membership removal waits', prepare(members[1]), revoke(members[1]), False)
        baseline = state()
        refusals(members[1])
        emit('both genuinely invited managers removed; true customer owner preparation retained')


if __name__ == '__main__':
    main()
