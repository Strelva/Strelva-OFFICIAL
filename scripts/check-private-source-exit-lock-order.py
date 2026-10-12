"""Prepared owned-loopback native harness. No runtime proof until executed.

Input supplies 32 independent actual native fixture/argument receipts. This
runner never creates Auth, qualification, agreements, grants or fixtures. Twelve
original full-order races are retained; twenty supplemental source/listing races
are separately named. SQL command arguments are typed, never executable input.
"""
import json
import os
import pathlib
import select
import re
import signal
import platform
from contextlib import contextmanager
import subprocess
import sys
import time
import uuid
from urllib.parse import urlparse, unquote

PORTS = {
    'create': ('create_system_version_source', ['uuid','uuid','text','jsonb','uuid','text']),
    'publish': ('publish_private_application_source', ['uuid','uuid','text','uuid','uuid','integer','jsonb']),
    'share': ('set_private_application_source_share', ['uuid','uuid','text','uuid','uuid','boolean']),
    'listing': ('register_neutral_creator_listing', ['uuid','text','jsonb']),
}
EXIT_TYPES = ['uuid','uuid','text','text','text','jsonb','text','text','text']


def literal(value):
    return "E'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def call(name, types, values):
    if len(types) != len(values):
        raise ValueError('Native argument count mismatch')
    arguments = []
    for kind, value in zip(types, values):
        if kind == 'uuid':
            uuid.UUID(value)
        elif kind == 'integer':
            if type(value) is not int:
                raise ValueError('Integer native argument required')
        elif kind == 'boolean':
            if type(value) is not bool:
                raise ValueError('Boolean native argument required')
        elif kind == 'text' and value is not None and not isinstance(value, str):
            raise ValueError('Text native argument required')
        encoded = json.dumps(value) if kind == 'jsonb' else str(value).lower() if kind == 'boolean' else value
        arguments.append('null::'+kind if encoded is None else literal(encoded)+'::'+kind)
    return 'select public.'+name+'('+','.join(arguments)+');'


def validate_cases(document):
    required = {(kind, port, order) for kind in ['agency','customer'] for port in ['create','publish','share'] for order in ['source-first','exit-first']}
    required |= {(kind, port, order) for kind in ['agency','customer'] for port in PORTS for order in ['partial-source-first','partial-exit-first']}
    required |= {(kind,'listing',order) for kind in ['agency','customer'] for order in ['source-first','exit-first']}
    cases = document['cases']
    actual = [(c['kind'],c['port'],c['order']) for c in cases]
    if len(actual) != len(set(actual)) or set(actual) != required:
        raise ValueError('Exact original12 plus supplemental20 matrix required')
    workspaces = []
    for c in cases:
        workspace = c['workspaceId']; uuid.UUID(workspace); workspaces.append(workspace)
        name, types = PORTS[c['port']]
        call(name,types,c['sourceArguments']); call('complete_workspace_exit',EXIT_TYPES,c['exitArguments'])
        if c['exitArguments'][0] != workspace:
            raise ValueError('Exit workspace mismatch')
        if c['port'] == 'listing':
            if c['sourceArguments'][2]['workspaceId'] != workspace:
                raise ValueError('Listing workspace mismatch')
            for key in ['sourceRevisionId']:
                uuid.UUID(c['sourceArguments'][2][key])
        elif c['sourceArguments'][0] != workspace:
            raise ValueError('Source workspace mismatch')
        call(name,types,c['freshSourceArguments'])
        if c['freshSourceArguments'] == c['sourceArguments']:
            raise ValueError('Distinct fresh source command required')
        fresh_workspace = c['freshSourceArguments'][2]['workspaceId'] if c['port']=='listing' else c['freshSourceArguments'][0]
        if fresh_workspace != workspace:
            raise ValueError('Fresh source workspace mismatch')
    if len(workspaces) != len(set(workspaces)):
        raise ValueError('Every irreversible exit needs an independent pristine fixture')
    return cases


def verify_receipt(c, receipt, arguments):
    workspace = c['workspaceId']
    if c['port'] == 'create':
        system = receipt['system']; source = receipt['source']['source']
        uuid.UUID(system['id'])
        if system['businessId'] != workspace or source != {'businessId':workspace,'systemId':system['id']} or system['name'] != arguments[3]['name'] or system['kind'] != arguments[3]['kind']:
            raise AssertionError('Native create receipt identity mismatch')
    elif c['port'] == 'publish':
        if receipt['source'] != {'businessId':workspace,'systemId':arguments[3],'revisionId':arguments[4],'number':arguments[5]+1} or receipt['definition'] != arguments[6]['definition'] or receipt['publishedBy'] != arguments[1]:
            raise AssertionError('Native publication receipt mismatch')
    elif c['port'] == 'share':
        if receipt['source'] != {'businessId':workspace,'systemId':arguments[3]} or (arguments[4] in receipt['sharedWith']) != arguments[5]:
            raise AssertionError('Native one-business share receipt mismatch')
    else:
        command=arguments[2]
        uuid.UUID(receipt['id']); uuid.UUID(receipt['sourceSystemId'])
        if receipt['creatorWorkspaceId'] != workspace or receipt['sourceRevisionId'] != command['sourceRevisionId'] or receipt['definitionId'] != 'system-source:'+receipt['sourceSystemId'] or receipt['agreementVersion'] != command['agreementVersion'] or receipt['rateReference'] != command['rateReference']:
            raise AssertionError('Native listing receipt mismatch')


def owned_connection(raw_url, receipt, inherited):
    required={'purpose','host','port','database','user','windowId','dataDirectory','postmasterPid','psqlPath','databaseOid','systemIdentifier','startedAt'}
    if set(receipt) != required:
        raise ValueError('Exact finite owned cluster receipt fields required')
    parsed=urlparse(raw_url)
    if parsed.scheme not in ('postgres','postgresql') or parsed.hostname != '127.0.0.1' or parsed.query or parsed.fragment or parsed.params:
        raise ValueError('Canonical numeric loopback URI without routing options required')
    if parsed.port is None or not 1024 <= parsed.port <= 65535:
        raise ValueError('Explicit disposable cluster port required')
    database=unquote(parsed.path.removeprefix('/')); user=unquote(parsed.username or '')
    if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}',database) or not re.fullmatch(r'[a-z][a-z0-9_]{0,62}',user):
        raise ValueError('Plain database and user identities required')
    if receipt['purpose'] != 'private-source-exit-disposable' or receipt['host'] != '127.0.0.1' or receipt['port'] != parsed.port or receipt['database'] != database or receipt['user'] != user:
        raise ValueError('Owned cluster endpoint identity mismatch')
    uuid.UUID(receipt['windowId'])
    data=pathlib.Path(receipt['dataDirectory']).resolve(strict=True)
    temporary=pathlib.Path('/tmp').resolve()
    if temporary not in data.parents or data.stat().st_uid != os.getuid():
        raise ValueError('Current-user disposable temporary data directory required')
    marker=data/'strelva-private-source-exit-owned.json'
    if marker.is_symlink() or marker.stat().st_uid != os.getuid() or json.loads(marker.read_text()) != receipt:
        raise ValueError('Exact pre-existing runtime-owner cluster receipt required')
    pid_lines=(data/'postmaster.pid').read_text().splitlines()
    if int(pid_lines[0]) != receipt['postmasterPid'] or pathlib.Path(pid_lines[1]).resolve() != data or int(pid_lines[3]) != parsed.port:
        raise ValueError('Local postmaster identity mismatch')
    os.kill(receipt['postmasterPid'],0)
    binary=pathlib.Path(receipt['psqlPath']).resolve(strict=True)
    if binary.name != 'psql' or not os.access(binary,os.X_OK):
        raise ValueError('Explicit existing psql binary required')
    # Finite child env: inherited PGHOSTADDR/PGSERVICE/PGOPTIONS/HOME and all
    # other libpq defaults never reach psql. URI is never forwarded to libpq.
    env={'PATH':'/usr/bin:/bin','LC_ALL':'C','PGCONNECT_TIMEOUT':'3','PGSSLMODE':'disable','PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGOPTIONS':'-c statement_timeout=5000 -c standard_conforming_strings=on'}
    if parsed.password is not None:
        env['PGPASSWORD']=unquote(parsed.password)
    base=[str(binary),'--host=127.0.0.1','--port='+str(parsed.port),'--username='+user,'--dbname='+database,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
    return base,env,data


def connection_guard(receipt, data_directory):
    checks=["current_setting('data_directory') is distinct from "+literal(str(data_directory)),
            "current_database() is distinct from "+literal(receipt['database']),
            "current_user is distinct from "+literal(receipt['user']),
            "(select oid::bigint from pg_database where datname=current_database()) is distinct from "+literal(receipt['databaseOid'])+'::bigint',
            "(select system_identifier::text from pg_control_system()) is distinct from "+literal(receipt['systemIdentifier']),
            "inet_server_port() is distinct from "+literal(receipt['port'])+'::integer',
            "host(inet_server_addr()) is distinct from E'127.0.0.1'",
            "pg_postmaster_start_time()::text is distinct from "+literal(receipt['startedAt']),
            "current_setting('standard_conforming_strings') is distinct from E'on'"]
    body="begin if "+' or '.join(checks)+" then raise exception 'private_source_owned_cluster_mismatch';end if;end"
    tag='$owned_cluster_'+uuid.uuid4().hex+'$'
    while tag in body:
        tag='$owned_cluster_'+uuid.uuid4().hex+'$'
    return 'do '+tag+' '+body+' '+tag+';'


def _close_children(children):
    # Every child gets independent TERM/KILL/reap attempts, even if a sibling
    # fails. Forced/unknown closure cannot qualify an otherwise green race.
    results=[]
    for process in children:
        if process is None:
            continue
        result={'clientPid':process.pid,'forced':False,'reaped':False,'errors':[]}
        try:
            if process.poll() is None:
                result['forced']=True; process.terminate()
        except Exception as error:
            result['errors'].append('TERM: '+str(error))
        try:
            process.wait(timeout=2)
        except Exception as error:
            result['errors'].append('TERM wait: '+safe_error(error))
            try:
                process.kill()
            except Exception as kill_error:
                result['errors'].append('KILL: '+str(kill_error))
            try:
                process.wait(timeout=2)
            except Exception as reap_error:
                result['errors'].append('KILL wait: '+safe_error(reap_error))
        result['reaped']=process.poll() is not None
        result['returncode']=process.returncode
        results.append(result)
    return results


def close_children(children):
    handlers={number:signal.signal(number,signal.SIG_IGN) for number in (signal.SIGINT,signal.SIGTERM)}
    try:
        return _close_children(children)
    finally:
        for number,handler in handlers.items():
            signal.signal(number,handler)


def backend_closed(pid, timeout=2):
    if pid is None:
        return 'UNKNOWN'
    deadline=time.monotonic()+timeout
    while True:
        try:
            os.kill(pid,0)
        except ProcessLookupError:
            return 'CLOSED'
        except (PermissionError,OSError):
            return 'UNKNOWN'
        if time.monotonic()>=deadline:
            return 'HOLD'
        time.sleep(0.02)


def safe_error(error):
    if isinstance(error,subprocess.TimeoutExpired):
        return 'Bounded child timeout after '+str(error.timeout)+' seconds'
    return str(error)


def compare_retained(before, after, workspace, stop):
    # Keep full snapshots, but distinguish the exact authorized mutable exit
    # projection from immutable native specification/history and customer data.
    for table in before:
        if table != 'application_states' and before[table] != after[table]:
            raise AssertionError('Retained history changed: '+table)
    old={r['work_id']:r for r in before['application_states']}
    new={r['work_id']:r for r in after['application_states']}
    if old.keys() != new.keys():
        raise AssertionError('Exit created/deleted native application state')
    projections=[]
    for work_id, previous in old.items():
        current=new[work_id]
        if current == previous:
            if stop and previous['workspace_id']==workspace and previous['lifecycle_status'] in ('draft','installed'):
                raise AssertionError('Expected authorized native stop projection missing')
            continue
        retained_fields=lambda r:{k:v for k,v in r.items() if k not in ('lifecycle_status','updated_at')}
        if not stop or previous['workspace_id'] != workspace or previous['lifecycle_status'] not in ('draft','installed') or current['lifecycle_status'] != 'retired' or retained_fields(current) != retained_fields(previous):
            raise AssertionError('Unexpected native mutable projection or retained specification change')
        projections.append({'workId':work_id,'before':previous,'after':current})
    return projections


VERIFIED_PYTHON_VERSION=(3,14,6)
VERIFIED_PYTHON_ENTRY=pathlib.Path('/opt/homebrew/bin/python3')


def verified_python_runtime():
    # Signal/trace retention controls differ on the installed3.9 interpreter.
    # This exact already-existing runtime passed actual kernel fault controls.
    if platform.python_implementation()!='CPython' or tuple(sys.version_info[:3])!=VERIFIED_PYTHON_VERSION:
        raise RuntimeError('Private source proof requires verified CPython3.14.6 via /opt/homebrew/bin/python3; unsupported interpreter HOLD before effects')
    actual=pathlib.Path(sys.executable).resolve(strict=True)
    expected=VERIFIED_PYTHON_ENTRY.resolve(strict=True)
    if actual!=expected:
        raise RuntimeError('Private source proof requires exact existing verified Python executable; HOLD before effects')
    return {'implementation':'CPython','version':'3.14.6','executable':str(actual),'entry':str(VERIFIED_PYTHON_ENTRY)}


class SignalGate:
    def __init__(self):
        self.depth=0;self.pending=[];self.previous={};self.terminal_invalidator=None
    def install(self):
        verified_python_runtime()
        self.previous={number:signal.signal(number,self.handler) for number in (signal.SIGINT,signal.SIGTERM)}
    def restore(self):
        for number,handler in self.previous.items():
            signal.signal(number,handler)
    def handler(self,number,_frame):
        self.pending.append(number)
        if self.terminal_invalidator is not None:
            self.terminal_invalidator()
        if self.depth==0:
            raise RuntimeError('Harness interrupted; HOLD')
    @contextmanager
    def protected(self, deliver=True):
        self.depth+=1
        try:
            yield
        finally:
            self.depth-=1
            if deliver and self.depth==0 and self.pending and sys.exc_info()[0] is None:
                raise RuntimeError('Deferred harness interruption after ownership; HOLD')


class ChildRegistry:
    def __init__(self, gate):
        verified_python_runtime()
        self.gate=gate;self.entries=[]
    def spawn(self, args, receipt, **kwargs):
        # Python handlers queue rather than raise across OS creation, return,
        # metadata assignment and registry ownership. No ignored/lost signal.
        with self.gate.protected():
            process=subprocess.Popen(args,**kwargs)
            entry={'process':process,'receipt':receipt}
            self.entries.append(entry)
            receipt['clientPid']=process.pid
            return process
    def process_for(self, receipt):
        return next((e['process'] for e in self.entries if e['receipt'] is receipt),None)
    def close(self, receipts=None):
        results=[]
        for entry in self.entries:
            record=entry['receipt']
            if receipts is not None and not any(record is r for r in receipts):
                continue
            if 'registryClosure' not in record:
                try:
                    record['registryClosure']=_close_children([entry['process']])[0]
                except BaseException as error:
                    # An unexpected child-specific failure never skips siblings.
                    process=entry['process']
                    errors=[safe_error(error)]
                    try:
                        process.kill();process.wait(timeout=2)
                    except BaseException as reap_error:
                        errors.append(safe_error(reap_error))
                    record['registryClosure']={'clientPid':process.pid,'forced':True,'reaped':process.returncode is not None,'returncode':process.returncode,'errors':errors}
            results.append(record['registryClosure'])
        return results


def retain_terminal(output, evidence, owned_fallback=None):
    # Independent fallback survives a failed primary write. Neither a retention
    # failure nor fallback can qualify a run; stdout remains the last receipt.
    def write(path):
        staging=path.with_name(path.name+'.terminal-'+uuid.uuid4().hex)
        try:
            staging.write_text(json.dumps(evidence,indent=2)+'\n')
            os.replace(staging,path)
        finally:
            if staging.exists():
                staging.unlink()
    try:
        write(output)
        return {'path':str(output),'status':'RETAINED'}
    except Exception as error:
        evidence['status']='HOLD';evidence['retentionFailure']=safe_error(error)
        fallback=output.with_name(output.name+'.terminal-hold.json')
        try:
            if fallback.exists() and owned_fallback != str(fallback):
                raise RuntimeError('Refuse overwriting previous emergency evidence')
            write(fallback)
            return {'path':str(fallback),'status':'FALLBACK_HOLD'}
        except Exception as fallback_error:
            evidence['fallbackRetentionFailure']=safe_error(fallback_error)
            print(json.dumps({'status':'HOLD','terminalRetention':'FAILED','signals':evidence.get('signals',[]),'children':evidence.get('terminalChildren',[])}),file=sys.stderr)
            return {'path':None,'status':'FAILED_HOLD'}


def finish_owned_run(gate,registry,output,evidence,backend_check=backend_closed):
    verified_python_runtime()
    with gate.protected(deliver=False):
        closed=registry.close()
        native=[]
        for entry in registry.entries:
            receipt=entry['receipt']
            state=backend_check(receipt.get('backendPid'))
            receipt['terminalBackendClosure']=state
            native.append({'clientPid':receipt.get('clientPid'),'backendPid':receipt.get('backendPid'),'state':state})
        evidence['terminalChildren']=closed;evidence['terminalBackends']=native
        evidence['signals']=gate.pending
        if gate.pending or any(r['forced'] or not r['reaped'] or r['errors'] for r in closed) or any(r['state']!='CLOSED' for r in native):
            evidence['status']='HOLD'
        receipt={};writing=False;dirty=False
        def persist_terminal():
            nonlocal writing,dirty
            if writing:
                dirty=True
                return
            writing=True
            try:
                old_fallback=receipt.get('path') if receipt.get('status')=='FALLBACK_HOLD' else None
                retained=retain_terminal(output,evidence,owned_fallback=old_fallback)
                receipt.clear();receipt.update(retained)
                if dirty:
                    # First write may have serialized PASS before interruption.
                    # This rewrite starts with HOLD; later signals cannot make
                    # that already-HOLD serialization qualify as success.
                    dirty=False;evidence['status']='HOLD'
                    retained=retain_terminal(output,evidence,owned_fallback=receipt.get('path') if receipt.get('status')=='FALLBACK_HOLD' else None)
                    receipt.clear();receipt.update(retained)
            finally:
                writing=False
                # Release hands ownership back to the signal callback. An
                # interruption immediately before release queued dirty; drain
                # it now. An interruption after release writes directly, so
                # no pending-count snapshot can lose this final invalidation.
                if dirty:
                    dirty=False
                    persist_terminal()
        def invalidate_terminal():
            evidence['status']='HOLD';evidence['signals']=gate.pending
            persist_terminal()
        # Remains armed through helper return and caller acceptance. A late
        # signal invalidates memory AND durable evidence, even while deferred.
        gate.terminal_invalidator=invalidate_terminal
        persist_terminal()
        return receipt


def main():
    runtime=verified_python_runtime()
    if os.environ.get('STRELVA_LOCAL_AUTH_PROOF') != '1' or os.environ.get('STRELVA_PRIVATE_SOURCE_EXIT_WINDOW') != '1':
        raise SystemExit('Explicit owned local native runtime window required')
    database = os.environ.get('STRELVA_LOCAL_DB_URL','')
    receipt_path=os.environ.get('STRELVA_PRIVATE_SOURCE_CLUSTER_RECEIPT','')
    if not receipt_path:
        raise SystemExit('Explicit runtime-owner disposable cluster receipt required')
    receipt=json.loads(pathlib.Path(receipt_path).read_text())
    base,child_env,data_directory=owned_connection(database,receipt,os.environ)
    identity_guard=connection_guard(receipt,data_directory)
    if len(sys.argv) != 3:
        raise SystemExit('Usage: runner actual-native-fixtures.json retained-evidence.json')
    output = pathlib.Path(sys.argv[2])
    if output.exists():
        raise SystemExit('Refuse overwriting prior success/failure evidence')
    cases = validate_cases(json.loads(pathlib.Path(sys.argv[1]).read_text()))
    evidence = {'status':'RUNNING','pythonRuntime':runtime,'originalRaces':12,'supplementalRaces':20,'fullReleaseQualified':False,'cases':[],'oneOffChildren':[],'clusterReceipt':{k:v for k,v in receipt.items() if k!='password'}}
    gate=SignalGate();gate.install();registry=ChildRegistry(gate)
    def save():
        output.write_text(json.dumps(evidence,indent=2)+'\n')
    def run_command(sql, timeout=15):
        app='private-exit-order-oneoff-'+uuid.uuid4().hex
        child={'application':app,'status':'RUNNING','backendPid':None}
        evidence['oneOffChildren'].append(child)
        process=None
        try:
            process=registry.spawn([*base,'-c',identity_guard+'set application_name='+literal(app)+';select pg_backend_pid();'+sql],child,env=child_env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            out,err=process.communicate(timeout=timeout)
            lines=out.splitlines()
            if not lines or not lines[0].isdigit():
                raise RuntimeError('Missing actual one-off backend identity')
            child['backendPid']=int(lines[0]);child['returncode']=process.returncode
            child['status']='COMPLETE'
            return subprocess.CompletedProcess([],process.returncode,'\n'.join(lines[1:]),err)
        except BaseException as error:
            child['status']='HOLD';child['failure']=safe_error(error)
            raise RuntimeError(safe_error(error)) from None
        finally:
            with gate.protected(deliver=False):
                child['closure']=registry.close([child])
                child['backendClosure']=backend_closed(child['backendPid'])
                if any(c['forced'] or not c['reaped'] or c['errors'] for c in child['closure']) or child['backendClosure']!='CLOSED' or gate.pending:
                    child['status']='HOLD'
                save()
            if child['status']=='HOLD' and sys.exc_info()[0] is None:
                raise RuntimeError('Interrupted/forced/unknown one-off closure; HOLD')
    def execute(sql):
        r=run_command(sql)
        if r.returncode:
            raise RuntimeError(r.stderr)
        return r.stdout.strip()
    def graph():
        return json.loads(execute("select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'app',application_name,'wait',wait_event_type,'event',wait_event,'blockers',pg_blocking_pids(pid),'query',query,'locks',(select coalesce(jsonb_agg(jsonb_build_object('type',l.locktype,'mode',l.mode,'granted',l.granted,'relation',l.relation::regclass::text,'classid',l.classid,'objid',l.objid,'objsubid',l.objsubid,'transactionid',l.transactionid)),'[]'::jsonb) from pg_locks l where l.pid=pg_stat_activity.pid))),'[]'::jsonb) from pg_stat_activity where application_name like 'private-exit-order-%' and pid<>pg_backend_pid();"))
    def retained_sql():
        # Local fixture history only, READ ONLY; exit-owned rows are separate.
        tables = ['systems','system_version_sources','system_version_source_revisions','system_version_source_shares','system_revision_qualifications','creator_listings','money_agreements','creator_version_paid_periods','revenue_splits','split_payouts','platform_collections','private_application_sources','system_versions','system_version_bindings','application_records','application_states']
        parts = [literal(t)+",(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from public."+t+' x)' for t in tables]
        return 'select jsonb_build_object('+','.join(parts)+');'
    def retained():
        return json.loads(execute('begin read only;'+retained_sql()+'commit;'))
    def send(p, sql):
        p.stdin.write(sql+'\n'); p.stdin.flush()
    pending = {}
    def marker(p, expected, timeout=8):
        deadline = time.monotonic()+timeout
        buffer = pending.pop(p.pid, '')
        lines = []
        while time.monotonic()<deadline:
            while '\n' in buffer:
                line, buffer = buffer.split('\n',1); line=line.strip(); lines.append(line)
                if line == expected:
                    pending[p.pid] = buffer
                    return lines
            ready, _, _ = select.select([p.stdout],[],[],0.1)
            if ready:
                chunk = os.read(p.stdout.fileno(),65536)
                if chunk:
                    buffer += chunk.decode()
            if p.poll() is not None:
                raise RuntimeError('Holder exited: '+p.stderr.read())
        raise RuntimeError('Holder barrier timeout: '+json.dumps(lines))
    try:
        save()
        observed=json.loads(execute("begin read only;select jsonb_build_object('dataDirectory',current_setting('data_directory'),'database',current_database(),'databaseOid',(select oid::bigint from pg_database where datname=current_database()),'systemIdentifier',(select system_identifier::text from pg_control_system()),'port',inet_server_port(),'address',host(inet_server_addr()),'startedAt',pg_postmaster_start_time()::text,'user',current_user,'standardConformingStrings',current_setting('standard_conforming_strings'));commit;"))
        expected={k:receipt[k] for k in ['dataDirectory','database','databaseOid','systemIdentifier','port','startedAt','user']}
        expected['dataDirectory']=str(data_directory);expected['address']='127.0.0.1';expected['standardConformingStrings']='on'
        if observed != expected:
            raise AssertionError('Observed disposable cluster/catalog identity mismatch')
        evidence['observedClusterIdentity']=observed;save()
        for c in cases:
            row = {'kind':c['kind'],'port':c['port'],'order':c['order'],'status':'RUNNING','graphs':[]}
            evidence['cases'].append(row); save()
            workspace = c['workspaceId']; quoted = literal(workspace)+'::uuid'
            source = call(*PORTS[c['port']],c['sourceArguments'])
            exit_call = call('complete_workspace_exit',EXIT_TYPES,c['exitArguments'])
            preflight = json.loads(execute("select jsonb_build_object('kind',(select kind from public.workspaces where id="+quoted+"),'exited',public.workspace_exit_completed("+quoted+"),'owner',exists(select 1 from public.users u join public.workspace_memberships m on m.user_id=u.id where m.workspace_id="+quoted+" and m.role='owner' and u.id="+literal(c['exitArguments'][1])+"::uuid and u.verified_at is not null and lower(u.email)=lower(btrim("+literal(c['exitArguments'][2])+"))));"))
            if preflight != {'kind':c['kind'],'exited':False,'owner':True}:
                raise AssertionError('Actual current exit fixture required: '+json.dumps(preflight))
            # Rollback-only positive control invokes actual service-role producer
            # before every irreversible race; malformed source cannot fake refusal.
            control = execute('begin isolation level read committed;set local role service_role;'+source+'rollback;')
            verify_receipt(c,json.loads(control),c['sourceArguments'])
            fresh_source=call(*PORTS[c['port']],c['freshSourceArguments'])
            fresh_control=execute('begin isolation level read committed;set local role service_role;'+fresh_source+'rollback;')
            verify_receipt(c,json.loads(fresh_control),c['freshSourceArguments'])
            row['freshPositiveReceipt']=json.loads(fresh_control)
            row['positiveReceipt']=json.loads(control)
            first = None; second = None
            holder_receipt={'backendPid':None};waiter_receipt={'backendPid':None}
            try:
                source_first = c['order'].endswith('source-first')
                partial = c['order'].startswith('partial-')
                app = 'private-exit-order-'+str(uuid.uuid4())
                first = registry.spawn(base,holder_receipt,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=child_env,text=True,bufsize=1)
                send(first,identity_guard+"begin isolation level read committed;set local application_name="+literal(app+'-holder')+";set local statement_timeout='35s';select pg_backend_pid();")
                # Separate marker flush prevents Python buffered stdout from
                # hiding a barrier behind already-buffered lines.
                send(first,"select 'PID_READY';")
                lines=marker(first,'PID_READY'); pid=next(int(s) for s in lines if s.isdigit());holder_receipt['backendPid']=pid
                advisory='select pg_advisory_xact_lock(hashtextextended('+quoted+'::text,7415));'
                held = advisory if partial else source if source_first else exit_call
                send(first,('' if partial else 'set local role service_role;')+held)
                send(first,"select 'HELD';"); held_lines=marker(first,'HELD')
                if not partial and not source_first:
                    row['actualExitReceipt']=json.loads(held_lines[-2])
                    if row['actualExitReceipt'].get('state',{}).get('status') != 'completed':
                        raise AssertionError('Held actual exit did not complete')
                if not partial and source_first:
                    verify_receipt(c,json.loads(held_lines[-2]),c['sourceArguments']); row['actualSourceReceipt']=json.loads(held_lines[-2])
                attempted = exit_call if source_first else source
                second=registry.spawn([*base,'-c',identity_guard+"begin isolation level read committed;set local application_name="+literal(app+'-waiter')+";set local statement_timeout='35s';set local role service_role;"+attempted+'commit;'],waiter_receipt,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=child_env,text=True)
                deadline=time.monotonic()+8; waiter=None
                while time.monotonic()<deadline:
                    rows=graph(); row['graphs'].append(rows)
                    waiter=next((r for r in rows if r['app']==app+'-waiter' and r['wait']=='Lock' and pid in r['blockers']),None)
                    if waiter:
                        break
                    if second.poll() is not None:
                        raise AssertionError('Attempt did not wait: '+second.stderr.read())
                    time.sleep(0.02)
                if not waiter:
                    raise AssertionError('No controlled native blocking barrier')
                waiter_receipt['backendPid']=waiter['pid']
                row['backendIdentities']={'holderPid':pid,'holderApplication':app+'-holder','waiterPid':waiter['pid'],'waiterApplication':app+'-waiter'}
                row['barrier']=waiter
                if waiter['event'] != 'advisory':
                    raise AssertionError('Actual waiter did not block on shared7415 boundary')
                if partial and not source_first:
                    # Detect the historical inversion before dispatching exit:
                    # no waiter may hold a workspace row-lock relation lock.
                    held_workspace=execute("select exists(select 1 from pg_locks where pid="+str(waiter['pid'])+" and relation='public.workspaces'::regclass and granted and mode in('RowShareLock','RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')); ")
                    if held_workspace != 'f':
                        raise AssertionError('Inherited pre-advisory workspace lock remains; HOLD')
                before = retained() if not source_first else None
                if partial:
                    send(first,'set local role service_role;'+(source if source_first else exit_call))
                    send(first,"select 'ACTUAL_DONE';"); actual_lines=marker(first,'ACTUAL_DONE',40)
                    if not source_first:
                        row['actualExitReceipt']=json.loads(actual_lines[-2])
                        if row['actualExitReceipt'].get('state',{}).get('status') != 'completed':
                            raise AssertionError('Partial held actual exit did not complete')
                    if source_first:
                        verify_receipt(c,json.loads(actual_lines[-2]),c['sourceArguments']); row['actualSourceReceipt']=json.loads(actual_lines[-2])
                after_held = None
                if source_first:
                    send(first,'reset role;'+retained_sql())
                    send(first,"select 'SNAPSHOT';")
                    after_held=json.loads(marker(first,'SNAPSHOT')[-2])
                send(first,'commit;'); first.stdin.close(); first.wait(timeout=40)
                if first.returncode:
                    raise RuntimeError(first.stderr.read())
                out,err=second.communicate(timeout=40); row['waiterOutput']=out; row['waiterError']=err
                if any(token in err for token in ['40P01','deadlock detected','57014','lock timeout','statement timeout']):
                    raise AssertionError('Deadlock/timeout is failure, never canonical refusal')
                if source_first:
                    if second.returncode or json.loads(out).get('state',{}).get('status') != 'completed':
                        raise AssertionError('Actual exit did not complete: '+err)
                    final_retained=retained()
                    row['authorizedMutableProjection']=compare_retained(after_held,final_retained,workspace,c['exitArguments'][5].get('kind')=='stop')
                    row['retainedBeforeExit']=after_held;row['retainedAfterExit']=final_retained
                else:
                    if second.returncode == 0 or 'workspace_exit_future_work_blocked' not in err:
                        raise AssertionError('Actual source failed to refuse after exit: '+err)
                    final_retained=retained()
                    row['authorizedMutableProjection']=compare_retained(before,final_retained,workspace,c['exitArguments'][5].get('kind')=='stop')
                    row['retainedBeforeExit']=before;row['retainedAfterExit']=final_retained
                for label, attempted_source in [('replay',source),('fresh',fresh_source)]:
                    fresh=run_command('begin isolation level read committed;set local role service_role;'+attempted_source+'commit;')
                    row[label+'Refusal']=fresh.stderr
                    if fresh.returncode == 0 or 'workspace_exit_future_work_blocked' not in fresh.stderr:
                        raise AssertionError(label+' source admitted after exit')
                if retained() != final_retained:
                    raise AssertionError('Fresh/replay refusal changed retained history')
                row['status']='PASS'; save()
            except Exception as case_error:
                with gate.protected(deliver=False):
                    row['status']='HOLD'; row['failure']=safe_error(case_error)
                    try:
                        row['failureGraph']=graph()
                    except Exception as graph_error:
                        row['failureGraphError']=safe_error(graph_error)
                    # Retention failure here cannot bypass registry cleanup.
                    save()
                raise
            finally:
                with gate.protected(deliver=False):
                    closure=registry.close([holder_receipt,waiter_receipt]);row['childClosure']=closure
                    row['backendClosure']='UNKNOWN'
                    try:
                        deadline=time.monotonic()+3
                        while True:
                            remaining=[r for r in graph() if r['app'] in ([app+'-holder',app+'-waiter']+[child['application'] for child in evidence['oneOffChildren'] if child['status']!='RUNNING'])]
                            if not remaining or time.monotonic()>=deadline:
                                break
                            time.sleep(0.05)
                        row['remainingBackends']=remaining
                        row['backendClosure']='CLOSED' if not remaining else 'HOLD'
                    except Exception as closure_error:
                        row['backendClosureError']=safe_error(closure_error)
                    if gate.pending or any(r['forced'] or not r['reaped'] or r['errors'] for r in closure) or row['backendClosure']!='CLOSED':
                        row['status']='HOLD'
                    save()
                if row['status']=='HOLD':
                    raise RuntimeError('Interrupted/forced/unknown case closure; HOLD')
        evidence['status']='PASS'; save()
    except Exception as error:
        with gate.protected(deliver=False):
            evidence['status']='HOLD'; evidence['failure']=safe_error(error)
            try:
                evidence['failureGraph']=graph()
            except Exception as graph_error:
                evidence['failureGraphError']=safe_error(graph_error)
        raise RuntimeError(safe_error(error)) from None
    finally:
        try:
            terminal=finish_owned_run(gate,registry,output,evidence)
            if gate.pending or evidence['status']!='PASS' or terminal['status']!='RETAINED':
                raise RuntimeError('Terminal interruption/closure/retention HOLD')
        finally:
            gate.restore()


if __name__ == '__main__':
    main()
