"""Actual payer/write/provision RPCs expose the old lock inversion and prove its repair."""
from pathlib import Path
import subprocess
import sys
import time

repo = Path(sys.argv[1])
args = ['psql', *sys.argv[2:], '-At', '--set=VERBOSITY=verbose']
owner = "'7f000000-0000-4000-8000-000000000001'"
email = "'home-owner@example.test'"


def execute(sql):
    result = subprocess.run([*args, '-c', sql], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def wait_for(check, name):
    deadline = time.monotonic() + 10
    while execute(check).strip() != 't':
        if time.monotonic() > deadline:
            raise AssertionError(name + ': actual session never reached the expected advisory wait')
        time.sleep(0.02)


def held(sql):
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, bufsize=1)
    process.stdin.write("begin;" + sql + ";select 'LOCK_HELD';\n")
    process.stdin.flush()
    while True:
        line = process.stdout.readline()
        if 'LOCK_HELD' in line:
            return process
        if process.poll() is not None:
            raise RuntimeError(process.stderr.read())


def finish(process, sql='commit;'):
    process.stdin.write(sql + '\n')
    process.stdin.close()
    process.stdin = None
    return process.communicate(timeout=15)[1]


def fixture(number):
    business = f"'7f000000-0000-4000-8000-{number:012d}'"
    execute(f"insert into public.workspaces(id,kind,name,created_by) values({business},'customer','Lock-order legacy fixture',{owner});"
            f"insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values({business},{owner},'owner',{owner});"
            f"select public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId',{business},'successorKind','business'),{owner},{email})")
    provision = f"select public.ensure_native_business_billing_home({business})"
    accept = (f"select public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',id),{owner},{email}) "
              f"from public.workspace_payer_transitions where workspace_id={business} and status='pending'")
    write = (f"select public.patch_business_record({business},{owner},{email},'owner',0,"
             "'{\"facts\":{\"display_name\":{\"value\":\"Committed lock-order proof\",\"verified\":true}}}',"
             "gen_random_uuid(),repeat('d',64))")
    return business, provision, accept, write


def writer_first(label, number, expect_deadlock):
    business, provision, accept, write = fixture(number)
    # Actual acceptance holds 7415 without a workspace UPDATE lock. The next
    # actual business write requests that row through business_record_assert_actor.
    first = held(accept)
    second = subprocess.Popen([*args, '-c', "set application_name='native-home-lock-provision';" + provision],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    wait_for("select exists(select 1 from pg_stat_activity where application_name='native-home-lock-provision' and wait_event='advisory')", label)
    first_error = finish(first, write + ';commit;')
    second_error = second.communicate(timeout=15)[1]
    if expect_deadlock:
        if '40P01' not in first_error + second_error or first.returncode == second.returncode == 0:
            raise AssertionError(label + ': original source failed to expose its deadlock')
        print('RED b40827cd: provision observed waiting on actual acceptance; actual patch_business_record deadlocked (40P01)')
        print((first_error + second_error).strip())
    else:
        if first.returncode or second.returncode:
            raise AssertionError(first_error + second_error)
        assert_result(business)
        print('GREEN writer first: provision observed waiting at 7415; actual patch and unpriced home both committed')


def assert_result(business):
    ok = execute(f"select (select count(*)=1 and bool_and(monthly_cents is null and plan_key is null and payer_kind='business') from public.accounts where workspace_id={business}) "
                 f"and exists(select 1 from public.business_record_facts where workspace_id={business} and fact_key='display_name' and value='\"Committed lock-order proof\"'::jsonb)")
    if ok.strip() != 't':
        raise AssertionError('actual write/home result was not retained')


green_definition = execute("select pg_get_functiondef('public.ensure_native_business_billing_home(uuid)'::regprocedure)")
try:
    execute((repo / 'tests/native-business-billing-home-lock-red.sql').read_text())
    writer_first('original source', 13, True)
finally:
    execute(green_definition)
writer_first('corrected source', 14, False)
business, provision, _, write = fixture(15)
first = held(provision)
second = subprocess.Popen([*args, '-c', "set application_name='native-home-lock-writer';" + write],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
wait_for("select exists(select 1 from pg_stat_activity where application_name='native-home-lock-writer' and wait_event='advisory')", 'provision first')
error = finish(first)
second_error = second.communicate(timeout=15)[1]
if first.returncode or second.returncode:
    raise AssertionError(error + second_error)
assert_result(business)
print('GREEN provision first: actual patch observed waiting at 7415; unpriced home and business fact both committed')
