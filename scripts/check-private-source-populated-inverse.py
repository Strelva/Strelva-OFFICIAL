"""Refuse actual populated private inverse without seeding history."""
import hashlib,json,os,pathlib,re,subprocess,sys
from urllib.parse import urlparse
if os.environ.get('STRELVA_LOCAL_AUTH_PROOF')!='1':raise SystemExit('Owned actual Auth proof required.')
db=os.environ.get('STRELVA_LOCAL_DB_URL','')
if urlparse(db).hostname not in ('localhost','127.0.0.1'):raise SystemExit('Owned loopback DB required.')
if len(sys.argv)!=2:raise SystemExit('Usage: check-private-source-populated-inverse.py inverse.sql')
args=['psql',db,'-XAtq','-v','ON_ERROR_STOP=1']
def execute(sql):
 r=subprocess.run(args,input=sql,text=True,capture_output=True,timeout=20)
 if r.returncode:raise RuntimeError('Owned populated inverse read failed.')
 return r.stdout.strip()
tables=['private_application_sources','private_source_install_grants','private_definition_predecessors','private_definition_function_receipts','system_version_sources','system_version_source_revisions','system_version_source_shares','system_package_install_grants','system_versions','system_version_native_applications','saved_product_work','application_records']
def snapshot():
 dump=subprocess.run(['pg_dump','--dbname',db,'--schema-only','--schema=public'],text=True,capture_output=True,timeout=30)
 if dump.returncode:raise RuntimeError('Owned catalog read failed.')
 schema='\n'.join(line for line in dump.stdout.splitlines() if not re.match(r'^\\(un)?restrict\s',line))
 rows={name:hashlib.sha256(execute("select coalesce(jsonb_agg(row order by row::text),'[]'::jsonb) from (select to_jsonb(item) row from public."+name+" item) actual;").encode()).hexdigest() for name in tables}
 return {'schemaSha256':hashlib.sha256(schema.encode()).hexdigest(),'rowHashes':rows}
state=json.loads(execute("select jsonb_build_object('privateSources',(select count(*) from public.private_application_sources),'privateGrants',(select count(*) from public.private_source_install_grants));"))
mode=os.environ.get('STRELVA_PRIVATE_INVERSE_HISTORY_CASE','marked-grant')
if state['privateSources']==0:raise SystemExit('Actual HTTP-published source history required.')
if mode=='source-only' and state['privateGrants']!=0:raise SystemExit('Source-only probe must precede any private grant.')
if mode=='marked-grant' and state['privateGrants']==0:raise SystemExit('Actual HTTP-produced marked grant required.')
before=snapshot()
r=subprocess.run(args,input=pathlib.Path(sys.argv[1]).resolve().read_text(),text=True,capture_output=True,timeout=30)
if r.returncode==0 or 'private_definition_populated_forward_only' not in r.stderr:raise AssertionError('Actual populated inverse did not refuse.')
if snapshot()!=before:raise AssertionError('Refused inverse changed catalog/private/native rows.')
print(json.dumps({'case':mode+' populated inverse refused','catalogAndRowsUnchanged':True,'snapshot':before,'historyCounts':state,'productionQualification':False}))
