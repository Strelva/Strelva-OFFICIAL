"""Actual rollback waits for a concurrent first grant, then preserves its receipt."""
from pathlib import Path
import subprocess, sys, os, time
repo=Path(sys.argv[1]); args=['psql',*sys.argv[2:],'-At']
fixture=(repo/'tests/agency-release-flags-schema.sql').read_text().split('-- Native permission assertions begin.')[0].replace('\\set ON_ERROR_STOP on','').replace('begin;\n','',1)
write="select public.set_agency_release_flag_ceiling('25600000-0000-4000-8000-000000000001','flags-operator@example.test','25600000-0000-4000-8000-000000000010','systems','25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000040','publish','operators',0,'Concurrent first permission')"
first=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
first.stdin.write('begin;'+fixture+write+";select 'LOCKED';\n");first.stdin.flush()
while True:
 line=first.stdout.readline()
 if 'LOCKED' in line: break
 if first.poll() is not None: raise RuntimeError(first.stderr.read())
second=subprocess.Popen([*args,'--file',str(repo/'supabase/migrations/rollback-20261021093000_agency_release_flag_ceiling.sql')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env={**os.environ,'PGAPPNAME':'agency-flags-rollback-race'})
deadline=time.monotonic()+10
while True:
 check=subprocess.run([*args,'-c',"select exists(select 1 from pg_stat_activity where application_name='agency-flags-rollback-race' and wait_event_type='Lock')"],capture_output=True,text=True,check=True)
 if check.stdout.strip()=='t': break
 if second.poll() is not None or time.monotonic()>deadline: raise AssertionError('rollback did not wait on concurrent first grant')
 time.sleep(0.02)
first.stdin.write('commit;\n');first.stdin.close();first.wait(timeout=10)
if first.returncode: raise RuntimeError(first.stderr.read())
_,error=second.communicate(timeout=10)
if second.returncode==0 or 'agency_release_flag_rollback_requires_data_preservation' not in error: raise AssertionError(error)
check=subprocess.run([*args,'-c','select (select count(*) from public.agency_release_flag_ceilings)=1 and (select count(*) from public.agency_release_flag_ceiling_history)=1'],capture_output=True,text=True,check=True)
if check.stdout.strip()!='t': raise AssertionError('concurrent first grant/history lost')
print('rollback vs concurrent first grant: actual ACCESS EXCLUSIVE wait, controlled refusal, grant/history preserved')
