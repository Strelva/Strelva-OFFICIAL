"""Actual agency RPC and private billing backfill helper, in native transactions."""
import json
import hashlib
import pathlib
import queue
import subprocess
import sys
import threading
import time

mode, repo = sys.argv[1:3]
args = ['psql', *sys.argv[3:], '-At']
workspace = "'25600000-0000-4000-8000-000000000010'"
signature = 'public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text)'


def execute(sql, allowed_error=None):
    result = subprocess.run([*args, '-c', sql], capture_output=True, text=True, timeout=20)
    if allowed_error:
        assert result.returncode != 0 and allowed_error in result.stderr, result.stderr
        print(json.dumps({'expected_error': allowed_error, 'exit': result.returncode, 'stderr': result.stderr}))
    elif result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


class Session:
    def __init__(self, name):
        self.name = name
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, bufsize=1)
        self.lines = queue.Queue()
        threading.Thread(target=self.read, daemon=True).start()
        self.send(f"set application_name='{name}'; set statement_timeout='12s'; set deadlock_timeout='200ms'; begin;")

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip())

    def send(self, sql):
        self.process.stdin.write(sql + '\n')
        self.process.stdin.flush()

    def marker(self, marker):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                line = self.lines.get(timeout=0.05)
                print(json.dumps({'session': self.name, 'stdout': line}))
                if line == marker:
                    return
            except queue.Empty:
                if self.process.poll() is not None:
                    raise RuntimeError(self.process.stderr.read())
        raise AssertionError(self.name + ': missing marker ' + marker)

    def finish(self, commit=True, expect_deadlock=False):
        if self.process.poll() is None:
            try:
                self.send('commit;' if commit else 'rollback;')
                self.process.stdin.close()
            except BrokenPipeError:
                pass
        self.process.wait(timeout=15)
        error = self.process.stderr.read()
        print(json.dumps({'session': self.name, 'exit': self.process.returncode, 'stderr': error}))
        if expect_deadlock:
            assert self.process.returncode != 0 and 'deadlock detected' in error, error
        else:
            assert self.process.returncode == 0, error
        return error


def wait_lock(name, blocker=None):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        rows = execute("select coalesce(json_agg(json_build_object('name',a.application_name,'pid',a.pid,"
                       "'wait_type',a.wait_event_type,'wait_event',a.wait_event,'blockers',pg_blocking_pids(a.pid),"
                       "'query',a.query))::text,'[]') from pg_stat_activity a "
                       f"where a.application_name='{name}' and a.wait_event_type='Lock'")
        parsed = json.loads(rows)
        if parsed:
            if blocker:
                pid = int(execute(f"select pid from pg_stat_activity where application_name='{blocker}'"))
                assert pid in parsed[0]['blockers'], parsed
            print('OBSERVED_WAIT ' + rows)
            return parsed
        time.sleep(0.02)
    raise AssertionError(name + ': actual operation did not wait')


def agency(revision, state='operators', user='25600000-0000-4000-8000-000000000003', email='flags-agency@example.test', ceiling=5):
    return ("set local role service_role; select public.set_agency_workspace_release_flag("
            f"'25600000-0000-4000-8000-000000000020',{workspace},'{user}','{email}',"
            f"'systems','{state}',{revision},{ceiling},'Actual composed lock-order proof'); reset role;")


def billing():
    # This helper is intentionally owner-only, just as the migration's backfill.
    return f"select public.ensure_native_business_billing_home({workspace});"


def current_revision():
    return int(execute(f"select revision from public.workspace_release_flags where workspace_id={workspace} and flag='systems'"))


def owner_patch(revision, command, display_name):
    return ("set local role service_role; select public.patch_business_record("
            f"{workspace},'25600000-0000-4000-8000-000000000002','flags-owner@example.test','owner',{revision},"
            f"'{{\"facts\":{{\"display_name\":{{\"value\":\"{display_name}\"}}}}}}'::jsonb,"
            f"'25600000-0000-4000-8000-{command}',repeat('e',64)); reset role;")


def catalog():
    return json.loads(execute("select json_build_object('definition',pg_get_functiondef(p.oid),"
                             "'catalog',to_jsonb(p)-'prosrc','comment',obj_description(p.oid,'pg_proc')) "
                             f"from pg_proc p where p.oid='{signature}'::regprocedure"))


def apply(inverse=False, error=None):
    name = ('rollback-' if inverse else '') + '20261021096000_agency_release_flag_lock_order.sql'
    result = subprocess.run([*args, '-f', str(pathlib.Path(repo) / 'supabase/migrations' / name)],
                            capture_output=True, text=True, timeout=20)
    print(json.dumps({'migration': name, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}))
    if error:
        assert result.returncode != 0 and error in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr


def data_snapshot():
    return execute("select json_build_object('flags',(select jsonb_agg(to_jsonb(f) order by workspace_id,flag) from public.workspace_release_flags f),"
                   "'ceilings',(select jsonb_agg(to_jsonb(c) order by workspace_id,flag) from public.agency_release_flag_ceilings c),"
                   "'history',(select jsonb_agg(to_jsonb(h) order by id) from public.workspace_release_flag_changes h),"
                   "'ceiling_history',(select jsonb_agg(to_jsonb(h) order by id) from public.agency_release_flag_ceiling_history h),"
                   "'accounts',(select jsonb_agg(to_jsonb(a) order by id) from public.accounts a))::text")


if mode == 'red':
    # A gate queues billing first, agency second. Both operations themselves
    # acquire all their locks; no operation is preloaded with a workspace lock.
    gate = Session('composition-gate')
    gate.send(f"select pg_advisory_xact_lock(hashtextextended({workspace}::text,7415)); select 'GATED';")
    gate.marker('GATED')
    home = Session('composition-billing-old')
    home.send(billing() + "select 'HOME'; commit;")
    wait_lock(home.name, gate.name)
    staff = Session('composition-agency-old')
    staff.send(agency(5) + "select 'FLAG'; commit;")
    wait_lock(staff.name, gate.name)
    # The old agency call is already holding the workspace row while queued
    # behind billing on the same advisory lock. A NOWAIT reader proves it.
    execute(f"begin; select id from public.workspaces where id={workspace} for update nowait; rollback;", 'could not obtain lock on row')
    gate.finish()
    # Either PostgreSQL victim is acceptable; retain the literal native error.
    results = []
    for item in (home, staff):
        item.process.stdin.close()
        item.process.wait(timeout=15)
        error = item.process.stderr.read()
        print(json.dumps({'session': item.name, 'exit': item.process.returncode, 'stderr': error}))
        results.append((item.process.returncode, error))
    assert sum('deadlock detected' in error for _, error in results) == 1, results
    assert any(code == 0 for code, _ in results), results
    print('RED_REPRODUCED: actual old agency setter and actual billing backfill deadlocked after gate release.')
elif mode == 'green':
    assert execute(f"select count(*) from public.accounts where workspace_id={workspace}") == '0'
    # Repeat the RED queue order. The corrected agency call queues on 7415
    # without holding the workspace row, so billing can provision its first home.
    gate = Session('composition-gate-green')
    gate.send(f"select pg_advisory_xact_lock(hashtextextended({workspace}::text,7415)); select 'GATED';")
    gate.marker('GATED')
    home = Session('composition-billing-gated')
    home.send(billing() + "select 'HOME';")
    wait_lock(home.name, gate.name)
    staff = Session('composition-agency-gated')
    staff.send(agency(5, 'on') + "select 'FLAG';")
    wait_lock(staff.name, gate.name)
    execute(f"begin; select id from public.workspaces where id={workspace} for update nowait; rollback;")
    print('GREEN_GATE: both actual operations queued; workspace row remained available before gate release.')
    gate.finish()
    home.marker('HOME')
    home.finish()
    staff.marker('FLAG')
    staff.finish()
    assert current_revision() == 5
    staff = Session('composition-agency-first')
    staff.send(agency(current_revision()) + "select 'FLAG';")
    staff.marker('FLAG')
    home = Session('composition-billing-second')
    home.send(billing() + "select 'HOME';")
    wait_lock(home.name, staff.name)
    staff.finish()
    home.marker('HOME')
    home.finish()
    assert execute(f"select state='operators' and revision=6 from public.workspace_release_flags where workspace_id={workspace} and flag='systems'") == 't'
    assert execute(f"select count(*) from public.accounts where workspace_id={workspace} and billing_type='none' and payment_status='none' and billing_home_kind='business' and created_via='business'") == '1'
    first_home = execute(f"select id from public.accounts where workspace_id={workspace}")
    home = Session('composition-billing-first')
    home.send(billing() + "select 'HOME';")
    home.marker('HOME')
    staff = Session('composition-agency-second')
    staff.send(agency(current_revision(), 'on') + "select 'FLAG';")
    wait_lock(staff.name, home.name)
    home.finish()
    staff.marker('FLAG')
    staff.finish()
    assert execute(f"select state='on' and revision=7 from public.workspace_release_flags where workspace_id={workspace} and flag='systems'") == 't'
    assert execute(f"select id from public.accounts where workspace_id={workspace}") == first_home
    record = Session('composition-owner-record-first')
    record.send(owner_patch(0, '000000000060', 'Owner record first') + "select 'RECORD';")
    record.marker('RECORD')
    staff = Session('composition-agency-after-record')
    staff.send(agency(7, 'on') + "select 'FLAG';")
    wait_lock(staff.name, record.name)
    record.finish()
    staff.marker('FLAG')
    staff.finish()
    staff = Session('composition-agency-before-record')
    staff.send(agency(7, 'on') + "select 'FLAG';")
    staff.marker('FLAG')
    record = Session('composition-owner-record-second')
    record.send(owner_patch(1, '000000000061', 'Agency flag first') + "select 'RECORD';")
    wait_lock(record.name, staff.name)
    staff.finish()
    record.marker('RECORD')
    record.finish()
    assert execute(f"select revision from public.business_records where workspace_id={workspace}") == '2'
    owner_data = execute(f"select jsonb_agg(to_jsonb(f) order by to_jsonb(f)::text) from public.business_record_facts f where workspace_id={workspace}")
    assert 'Agency flag first' in owner_data
    print('BUSINESS_RECORD_GREEN: both actual owner patch/agency orders waited and committed owner-source record revision 2.')
    execute(agency(6), 'workspace_release_revision_conflict')
    execute(agency(7, ceiling=4), 'workspace_release_revision_conflict')
    execute(agency(7, user='25600000-0000-4000-8000-000000000004', email='flags-other-agency@example.test'), 'workspace_access_denied')
    execute("set role service_role;" + billing(), 'permission denied for function ensure_native_business_billing_home')
    assert current_revision() == 7
    before = catalog()
    data = data_snapshot()
    apply(inverse=True)
    restored = catalog()
    assert restored['catalog'] == before['catalog'] and restored['comment'] == before['comment']
    assert data_snapshot() == data
    assert execute(f"select jsonb_agg(to_jsonb(f) order by to_jsonb(f)::text) from public.business_record_facts f where workspace_id={workspace}") == owner_data
    apply()
    assert catalog() == before and data_snapshot() == data
    assert execute(f"select jsonb_agg(to_jsonb(f) order by to_jsonb(f)::text) from public.business_record_facts f where workspace_id={workspace}") == owner_data
    print('INVERSE_AFTER_WRITES: exact catalog/ACL restored on reapply; committed flag/ceiling/audit/home rows unchanged.')
    print('GREEN: both actual operation orders waited, committed flag/home, preserved CAS and current-scope denial.')
elif mode == 'catalog':
    original = catalog()
    needle = ' perform public.workspace_release_assert_workspace(p_workspace_id);'
    changed = original['definition'].replace(needle, ' -- synthetic later-body guard proof\n' + needle)
    execute(changed)
    changed_catalog = catalog()
    apply(error='agency_release_flag_lock_order_predecessor_conflict')
    assert catalog() == changed_catalog
    execute(original['definition'])
    apply()
    successor = catalog()
    lock = ' perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));\n'
    assert successor['definition'].replace(lock, '') == original['definition']
    assert successor['catalog'] == original['catalog'] and successor['comment'] == original['comment']
    print('ONE_LINE_BODY_DIFF: ' + json.dumps({'before_sha256': hashlib.sha256(original['definition'].encode()).hexdigest(),
                                             'after_sha256': hashlib.sha256(successor['definition'].encode()).hexdigest(),
                                             'oid': original['catalog']['oid'], 'acl': original['catalog']['proacl']}))
    apply(error='agency_release_flag_lock_order_predecessor_conflict')
    assert catalog() == successor
    execute(successor['definition'].replace(needle, ' -- synthetic later-body guard proof\n' + needle))
    changed_catalog = catalog()
    apply(inverse=True, error='agency_release_flag_lock_order_rollback_conflict')
    assert catalog() == changed_catalog
    execute(successor['definition'])
    apply(inverse=True)
    assert catalog() == original
    apply(inverse=True, error='agency_release_flag_lock_order_rollback_conflict')
    assert catalog() == original
    apply()
    assert catalog() == successor
    print('CATALOG_GREEN: full pg_proc metadata, ACL, OID, comments preserved; forward/inverse guards atomic; exact inverse/reapply.')
else:
    raise AssertionError(mode)
