"""Execute real inverse refusal probes on the explicitly owned local database.

No provider/customer data effects. Each deliberate role/function drift is in
one transaction that is rolled back on inverse rejection; pre/post snapshots
verify every journaled function's body and normalized ACL stayed unchanged.
"""
import json, os, pathlib, subprocess, sys, uuid
from urllib.parse import urlparse
if os.environ.get('STRELVA_LOCAL_AUTH_PROOF')!='1':
    raise SystemExit('Requires explicitly owned local Auth proof database.')
db=os.environ.get('STRELVA_LOCAL_DB_URL','')
if urlparse(db).hostname not in ('localhost','127.0.0.1'):
    raise SystemExit('Only owned loopback DB allowed.')
if len(sys.argv)!=2:
    raise SystemExit('Usage: check-private-source-inverse-drift.py absolute-inverse.sql')
inverse=pathlib.Path(sys.argv[1]).resolve()
if not inverse.is_file():
    raise SystemExit('Saved exact inverse is required.')
base=['psql',db,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1']
snapshot_sql="""select coalesce(jsonb_agg(jsonb_build_object('signature',r.signature,'body',encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex'),'acl',
 (select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=r.signature::regprocedure)) order by r.signature),'[]'::jsonb) from public.private_definition_function_receipts r;"""
def execute(sql):
    result=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()
before=json.loads(execute(snapshot_sql))
if len(before)!=13:
    raise SystemExit('Expected complete 13-function successor journal.')
for target in [
    'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
    'public.system_package_install_grant_active_private_core(public.system_package_install_grants,uuid,text)']:
    role='private_inverse_drift_'+uuid.uuid4().hex[:16]
    sql='begin;create role '+role+' nologin;grant execute on function '+target+' to '+role+';\n'+inverse.read_text()
    result=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=20)
    if result.returncode==0 or 'private_definition_successor_acl_changed' not in result.stderr:
        raise AssertionError('Actual inverse failed to refuse custom-role ACL drift: '+result.stderr)
    if json.loads(execute(snapshot_sql))!=before:
        raise AssertionError('Refused inverse changed body/ACL baseline.')
    if execute("select exists(select 1 from pg_roles where rolname='"+role+"');")!='f':
        raise AssertionError('Transactional role drift was not rolled back.')
    print(json.dumps({'case':'custom-role ACL drift refused before restoration','target':target}))
core='public.lock_system_package_install_grant_private_core(uuid,uuid,text)'
# A harmless comment changes the actual core definition hash without altering
# privileges; the complete inverse must detect it before dropping that core.
sql="""begin;do $drift$ declare definition text;begin
 definition:=pg_get_functiondef('"""+core+"""'::regprocedure);
 if strpos(definition,'AS $function$')=0 then raise exception 'unexpected native function delimiter';end if;
 execute replace(definition,'AS $function$','AS $function$'||chr(10)||'-- deliberate owned inverse core drift');
end $drift$;
"""+inverse.read_text()
result=subprocess.run(base,input=sql,text=True,capture_output=True,timeout=20)
if result.returncode==0 or 'private_definition_successor_changed' not in result.stderr:
    raise AssertionError('Actual inverse failed to refuse renamed-core body drift: '+result.stderr)
if json.loads(execute(snapshot_sql))!=before:
    raise AssertionError('Refused core inverse changed body/ACL baseline.')
print(json.dumps({'case':'renamed-core body drift refused before restoration','target':core}))
