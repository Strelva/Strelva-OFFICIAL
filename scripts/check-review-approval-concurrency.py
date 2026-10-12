#!/usr/bin/env python3
"""Controlled real-Postgres ordering against fictional rows on the owned cluster."""
import json, os, subprocess, sys, time, uuid

args = ['psql', *sys.argv[1:]]

def sql(statement, check=True):
    result = subprocess.run([*args, '-Atc', statement], text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result

def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

def worker(statement, name):
    return subprocess.Popen([*args, '-Atc', statement], env={**os.environ, 'PGAPPNAME': name}, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def sleeping(name):
    for _ in range(100):
        if sql("select count(*) from pg_stat_activity where application_name='" + name + "' and wait_event='PgSleep'").stdout.strip() == '1':
            return
        time.sleep(.02)
    raise RuntimeError('Owned contention worker did not reach its controlled pause')

sql("""do $$ declare op uuid:='90400000-0000-4000-8000-000000000001'; agency uuid; result jsonb;
begin
 insert into public.users(id,email,verified_at) values(op,'race-operator@strelva.example.test',now());
 insert into public.super_admins(user_id,email) values(op,'race-operator@strelva.example.test');
 select id into agency from public.create_owned_workspace(op,'race-operator@strelva.example.test','agency','Race fixture');
 insert into public.tenants(id,stable_id,site_name,active,owner_email) values('race-site','90400000-0000-4000-8000-000000000003','Race fixture',true,'race-owner@example.test');
 result:=public.convert_tenant_to_business('race-operator@strelva.example.test','race-site',jsonb_build_object(
 'tenantId','race-site','tenantStableId','90400000-0000-4000-8000-000000000003','workspaceName','Race fixture','agencyWorkspaceId',agency,
 'agencyStaffEmails',jsonb_build_array('race-operator@strelva.example.test'),'agencySelectionBasis','owner_choice','billing',null,'account',null,'contacts',jsonb_build_array(),
 'patch',jsonb_build_object('facts',jsonb_build_object('owner_recipient',jsonb_build_object('value',jsonb_build_object('email','race-owner@example.test'),'verified',false)))),
 '90400000-0000-4000-8000-000000000004',repeat('a',64));
end $$;""")

def command(event):
    authority = json.loads(sql("select public.read_tenant_review_approval_authority('race-site')").stdout)
    request = {'reviewId': event, 'reply': 'Thank you'}
    claim = json.loads(sql('select public.begin_operator_google_write(' + literal({'commandKey':'approval:'+event,'tenantId':'race-site','writeKind':'review_reply','request':request}) + ')').stdout)
    return {'grantId':str(uuid.uuid4()),'tenantId':'race-site','eventId':event,'attemptId':'owned-race-attempt','action':'approved','tokenKind':'review',
        'tokenExpiresAt':int(time.time()*1000)+86400000,'workspaceId':authority['workspaceId'],'recipient':authority['recipient'],
        'authorityVersion':authority['version'],'ledger':'legacy','ledgerId':claim['attemptId'],
        'request':{**request,'providerTarget':'https://mybusiness.googleapis.com/v4/accounts/race/locations/race/reviews/'+event+'/reply'}}

def change():
    return "update public.business_owner_recipient_trust set trusted_at=clock_timestamp(),trusted_via='owner_write' where workspace_id=(select workspace_id from public.tenant_workspace_links where tenant_slug_at_link='race-site')"

# Transition wins: while its uncommitted epoch owns admission, no send can be
# admitted; after it commits, the old exact token is denied by fresh authority.
old = command('transition-first')
w = worker('begin; '+change()+"; select pg_sleep(1.5); commit;", 'review-transition-first')
sleeping('review-transition-first')
r = sql('select public.admit_tenant_review_approval_dispatch('+literal(old)+')', check=False)
assert r.returncode and 'review_authority_busy_retry' in r.stderr
out, err = w.communicate(timeout=10)
assert w.returncode == 0, err
r = sql('select public.admit_tenant_review_approval_dispatch('+literal(old)+')', check=False)
assert r.returncode and 'review_approval_authority_changed' in r.stderr
assert sql("select count(*) from public.tenant_review_dispatch_grants where event_id='transition-first'").stdout.strip() == '0'

# Admission wins: competing transition rolls back promptly instead of holding
# an owner/exit row across a network request. Its explicit retry succeeds after
# command admission; the admitted exact command settles without present-owner
# authority, and neither grant replay nor a new old-token admission can send.
accepted = command('admission-first')
w = worker('begin; select public.admit_tenant_review_approval_dispatch('+literal(accepted)+'); select pg_sleep(1.5); commit;', 'review-admission-first')
sleeping('review-admission-first')
r = sql(change(), check=False)
assert r.returncode and 'review_authority_busy_retry' in r.stderr
out, err = w.communicate(timeout=10)
assert w.returncode == 0, err
admission_rows=[json.loads(line) for line in out.splitlines() if line.startswith('{')]
assert len(admission_rows)==1 and admission_rows[0]['admitted'] is True
sql(change())
sql("select public.settle_tenant_review_dispatch_admission('"+accepted['grantId']+"','"+accepted['ledgerId']+"',"+literal(accepted['request'])+",200)")
assert sql("select count(*) from public.tenant_review_dispatch_grants where event_id='admission-first' and dispatch_state='spent'").stdout.strip() == '1'
r = sql('select public.admit_tenant_review_approval_dispatch('+literal({**accepted,'grantId':str(uuid.uuid4())})+')', check=False)
assert r.returncode and 'review_approval_authority_changed' in r.stderr

# Repeatable-read cannot smuggle a stale owner snapshot through admission.
fresh = command('unsupported-isolation')
r = sql('begin isolation level repeatable read; select public.admit_tenant_review_approval_dispatch('+literal(fresh)+'); commit;', check=False)
assert r.returncode and 'review_dispatch_isolation_unsupported' in r.stderr
print('Controlled PostgreSQL orderings passed: transition wins, admission wins, explicit busy retry, immutable settlement, revoked replay, unsupported stale isolation. Fictional provider dispatch count: one admitted command; no network calls.')
