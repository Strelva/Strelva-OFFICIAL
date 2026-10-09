"""Actual owned-native ACL guard and owner-issued roundtrip.

No Auth/provider/customer data writes. Run on the private migration predecessor
state; creates temporary NOLOGIN ACL fixture roles only. Forward/inverse are the
exact files under review. Delegated grants must refuse before any DDL mutation.
"""
import hashlib, json, os, pathlib, re, subprocess, sys, uuid
from urllib.parse import urlparse
if os.environ.get('STRELVA_LOCAL_AUTH_PROOF')!='1':
    raise SystemExit('Owned local Auth proof required.')
db=os.environ.get('STRELVA_LOCAL_DB_URL','')
if urlparse(db).hostname not in ('localhost','127.0.0.1'):
    raise SystemExit('Only owned loopback database allowed.')
if len(sys.argv)!=3:
    raise SystemExit('Usage: check-private-definition-acl-baseline.py forward.sql inverse.sql')
forward=pathlib.Path(sys.argv[1]).resolve().read_text()
inverse=pathlib.Path(sys.argv[2]).resolve().read_text()
args=['psql',db,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1']
def run(sql):
    return subprocess.run(args,input=sql,text=True,capture_output=True,timeout=30)
def execute(sql):
    result=run(sql)
    if result.returncode:
        raise RuntimeError('Owned native ACL command failed: '+result.stderr)
    return result.stdout.strip()
def ident(value):
    return '"'+value.replace('"','""')+'"'
def literal(value):
    return "'"+value.replace("'","''")+"'"
def catalog():
    dump=subprocess.run(['pg_dump','--dbname',db,'--schema-only'],text=True,capture_output=True,timeout=30)
    if dump.returncode:
        raise RuntimeError('Owned schema fingerprint failed.')
    schema='\n'.join(line for line in dump.stdout.splitlines() if not re.match(r'^\\(un)?restrict\s',line))
    roles=execute("select jsonb_build_object('roles',(select jsonb_agg(to_jsonb(r) order by oid) from pg_roles r),'membership',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member),'[]'::jsonb) from pg_auth_members m));")
    return {'schemaSha256':hashlib.sha256(schema.encode()).hexdigest(),'rolesSha256':hashlib.sha256(roles.encode()).hexdigest()}
if execute("select to_regclass('public.private_definition_predecessors') is null;")!='t':
    raise SystemExit('Run this whole-forward/inverse fixture on the predecessor state, not an already-applied private migration.')
owner=execute('select current_user;')
signature='public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)'
if execute('select proowner=(current_user::regrole)::oid from pg_proc where oid='+literal(signature)+'::regprocedure;')!='t':
    raise SystemExit('Owned baseline function owner must be this native migrator.')
initial=catalog()
# Real owner -> delegate WITH GRANT OPTION -> leaf grant chain. These grants
# are actual predecessor ACL state, not entries fabricated in the journal.
delegate='private_acl_delegate_'+uuid.uuid4().hex[:12]
leaf='private_acl_leaf_'+uuid.uuid4().hex[:12]
chain='begin;create role '+ident(delegate)+' nologin;create role '+ident(leaf)+' nologin;grant EXECUTE on function '+signature+' to '+ident(delegate)+' with grant option;set local role '+ident(delegate)+';grant EXECUTE on function '+signature+' to '+ident(leaf)+' granted by '+ident(delegate)+';set local role '+ident(owner)+';\n'
result=run(chain+forward)
if result.returncode==0 or 'private_definition_unsupported_acl_baseline' not in result.stderr:
    raise AssertionError('Forward did not refuse actual delegated grantor before mutations: '+result.stderr)
if catalog()!=initial:
    raise AssertionError('Refused delegated forward changed actual schema/role catalog.')
print(json.dumps({'case':'owner→NOLOGIN delegate→NOLOGIN leaf actual chain refused atomically','unchangedCatalog':initial}))
# A non-owner migrator also fails before CREATE/rename. Even an unprivileged
# NOLOGIN fixture role must not silently adopt the actual predecessor owner.
nonowner='private_acl_migrator_'+uuid.uuid4().hex[:12]
result=run('begin;create role '+ident(nonowner)+' nologin;set local role '+ident(nonowner)+';\n'+forward)
if result.returncode==0 or 'private_definition_unsupported_acl_baseline' not in result.stderr:
    raise AssertionError('Non-owner native migrator was not refused: '+result.stderr)
if catalog()!=initial:
    raise AssertionError('Refused non-owner forward changed actual schema/role catalog.')
print(json.dumps({'case':'non-owner migrator refused before DDL','unchangedCatalog':initial}))
# Supported owner-issued custom grantee / grant-option edges must survive
# exact normalized inverse restoration. Both grants have the original owner.
custom='private_acl_owner_grantee_'+uuid.uuid4().hex[:12]
ordinary='private_acl_owner_leaf_'+uuid.uuid4().hex[:12]
execute('create role '+ident(custom)+' nologin;create role '+ident(ordinary)+' nologin;grant EXECUTE on function '+signature+' to '+ident(custom)+' with grant option;grant EXECUTE on function '+signature+' to '+ident(ordinary)+';')
acl_query="select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid="+literal(signature)+'::regprocedure;'
before=json.loads(execute(acl_query))
try:
    execute(forward)
    execute(inverse)
    after=json.loads(execute(acl_query))
    if after!=before:
        raise AssertionError('Owner-issued custom ACL/grant-option inverse mismatch.')
    print(json.dumps({'case':'owner-issued custom grantee/grant-option forward→inverse exact ACL','normalizedAcl':after}))
finally:
    # Restrict cleanup to exact fixture role grants. No provider/data cleanup.
    execute('revoke all on function '+signature+' from '+ident(custom)+','+ident(ordinary)+' cascade;drop role '+ident(custom)+';drop role '+ident(ordinary)+';')
if catalog()!=initial:
    raise AssertionError('Supported ACL roundtrip/fixture cleanup changed predecessor catalog.')
print(json.dumps({'case':'complete predecessor schema/role catalog retained','catalog':initial}))
