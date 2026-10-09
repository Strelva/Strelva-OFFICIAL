"""Actual owned-native ACL guard and owner-issued roundtrip.

No Auth/provider/customer data writes. Run on the private migration predecessor
state; creates temporary NOLOGIN ACL fixture roles only. Forward/inverse are the
exact files under review. Delegated grants must refuse before any DDL mutation.
"""
import hashlib, json, os, pathlib, re, subprocess, sys, uuid
from urllib.parse import urlparse, parse_qs
import stat, tempfile
db=os.environ.get('STRELVA_LOCAL_DB_URL','')
native=os.environ.get('STRELVA_PRIVATE_DEFINITION_NATIVE_PROOF')=='1'
marker=None
if native:
    parsed=urlparse(db)
    query=parse_qs(parsed.query)
    if parsed.scheme not in ('postgresql','postgres') or parsed.hostname or parsed.password:
        raise SystemExit('Native proof requires an explicit Unix-socket URI without network host/password.')
    if set(query)!={'host','port'} or any(len(v)!=1 for v in query.values()):
        raise SystemExit('Native URI must contain exactly one host socket path and port.')
    socket=pathlib.Path(query['host'][0]).resolve(strict=True)
    marker_path=pathlib.Path(os.environ.get('STRELVA_PRIVATE_DEFINITION_CLUSTER_MARKER','')).resolve(strict=True)
    info=marker_path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o600:
        raise SystemExit('Native cluster marker must be a current-UID-owned mode600 regular file.')
    marker=json.loads(marker_path.read_text())
    data=pathlib.Path(marker['dataDirectory']).resolve(strict=True)
    temporary_roots=(pathlib.Path(tempfile.gettempdir()).resolve(),pathlib.Path('/tmp').resolve())
    for directory in (socket,data,marker_path.parent):
        if not any(directory.is_relative_to(root) for root in temporary_roots) or directory.stat().st_uid!=os.getuid():
            raise SystemExit('Native cluster paths must be owned canonical temporary paths.')
    if marker.get('kind')!='strelva-owned-temporary-postgres' or marker.get('uid')!=os.getuid() or marker.get('socketDirectory')!=str(socket) or str(marker.get('port'))!=query['port'][0]:
        raise SystemExit('Native cluster marker does not match explicit socket routing.')
    if parsed.username!=__import__('pwd').getpwuid(os.getuid()).pw_name or parsed.path!='/postgres':
        raise SystemExit('Native proof must use current OS user and postgres database.')
else:
    if os.environ.get('STRELVA_LOCAL_AUTH_PROOF')!='1':
        raise SystemExit('Owned local Auth proof required.')
    if urlparse(db).hostname not in ('localhost','127.0.0.1'):
        raise SystemExit('Only owned loopback database allowed.')
if len(sys.argv)!=3:
    raise SystemExit('Usage: check-private-definition-acl-baseline.py forward.sql inverse.sql')
forward=pathlib.Path(sys.argv[1]).resolve().read_text()
inverse=pathlib.Path(sys.argv[2]).resolve().read_text()
clean_env={key:os.environ[key] for key in ('PATH','HOME','TMPDIR') if key in os.environ}
clean_env['LC_ALL']='C'
args=['psql',db,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1']
def run(sql):
    return subprocess.run(args,input=sql,text=True,capture_output=True,timeout=30,env=clean_env)
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
    dump=subprocess.run(['pg_dump','--dbname',db,'--schema-only'],text=True,capture_output=True,timeout=30,env=clean_env)
    if dump.returncode:
        raise RuntimeError('Owned schema fingerprint failed.')
    schema='\n'.join(line for line in dump.stdout.splitlines() if not re.match(r'^\\(un)?restrict\s',line))
    roles=execute("select jsonb_build_object('roles',(select jsonb_agg(to_jsonb(r) order by oid) from pg_roles r),'membership',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member),'[]'::jsonb) from pg_auth_members m));")
    return {'schemaSha256':hashlib.sha256(schema.encode()).hexdigest(),'rolesSha256':hashlib.sha256(roles.encode()).hexdigest()}
if native:
    identity=json.loads(execute("select jsonb_build_object('dataDirectory',current_setting('data_directory'),'systemIdentifier',(select system_identifier::text from pg_control_system()),'databaseOid',(select oid::text from pg_database where datname=current_database()),'user',current_user,'port',current_setting('port'),'networkAddress',inet_server_addr(),'socketDirectories',current_setting('unix_socket_directories'));"))
    if pathlib.Path(identity['dataDirectory']).resolve()!=data or identity['systemIdentifier']!=str(marker.get('systemIdentifier')) or identity['databaseOid']!=str(marker.get('databaseOid')) or identity['user']!=urlparse(db).username or identity['port']!=str(marker['port']) or identity['networkAddress'] is not None or pathlib.Path(identity['socketDirectories']).resolve()!=socket:
        raise SystemExit('Actual PostgreSQL identity does not match owned temporary cluster marker.')
    print(json.dumps({'mode':'owned-temporary-unix-socket','identity':identity,'authProof':False}))
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
# Actual custom default privileges challenge every new table/function.
execute('alter default privileges grant execute on functions to '+ident(custom)+';alter default privileges grant all on tables to '+ident(custom)+';')
try:
    execute(forward)
    closed=execute("select not exists(select 1 from public.private_definition_function_receipts receipt join pg_proc p on p.oid=receipt.signature::regprocedure cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=("+literal(custom)+"::regrole)::oid) and not exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=any(array['public.private_application_sources'::regclass,'public.private_source_install_grants'::regclass,'public.private_definition_predecessors'::regclass,'public.private_definition_function_receipts'::regclass]) and acl.grantee<>c.relowner);")
    if closed!='t':raise AssertionError('Custom predecessor/default grants retained forward function/table access.')
    print(json.dumps({'case':'actual custom function/table defaults and predecessor grants closed in forward','closed':True}))
    execute(inverse)
    after=json.loads(execute(acl_query))
    if after!=before:
        raise AssertionError('Owner-issued custom ACL/grant-option inverse mismatch.')
    print(json.dumps({'case':'owner-issued custom grantee/grant-option forward→inverse exact ACL','normalizedAcl':after}))
finally:
    # Restrict cleanup to exact fixture role grants. No provider/data cleanup.
    execute('alter default privileges revoke execute on functions from '+ident(custom)+';alter default privileges revoke all on tables from '+ident(custom)+';')
    execute('revoke all on function '+signature+' from '+ident(custom)+','+ident(ordinary)+' cascade;drop role '+ident(custom)+';drop role '+ident(ordinary)+';')
if catalog()!=initial:
    raise AssertionError('Supported ACL roundtrip/fixture cleanup changed predecessor catalog.')
print(json.dumps({'case':'complete predecessor schema/role catalog retained','catalog':initial}))
