"""Two actual PostgreSQL sessions: admitted changes serialize with revocation."""
import subprocess, sys, time
args=['psql',*sys.argv[1:],'-At']
agency="'25600000-0000-4000-8000-000000000020'"
workspace="'25600000-0000-4000-8000-000000000010'"
user="'25600000-0000-4000-8000-000000000003'"
operator="'25600000-0000-4000-8000-000000000001'"
system="'25600000-0000-4000-8000-000000000040'"
def execute(sql):
 result=subprocess.run([*args,'-c',sql],capture_output=True,text=True)
 if result.returncode: raise RuntimeError(result.stderr)
 return result.stdout

def run_race(name, held_change, attempt, refusal):
 first=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 first.stdin.write('begin;'+held_change+";select 'LOCKED';\n")
 first.stdin.flush()
 while True:
  line=first.stdout.readline()
  if 'LOCKED' in line: break
  if first.poll() is not None: raise RuntimeError(first.stderr.read())
 second=subprocess.Popen([*args,'-c',"set application_name='agency-flags-race';"+attempt],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 deadline=time.monotonic()+10
 while execute("select exists(select 1 from pg_stat_activity where application_name='agency-flags-race' and wait_event_type='Lock')").strip()!='t':
  if second.poll() is not None or time.monotonic()>deadline: raise AssertionError(name+': second writer did not wait on the actual authority lock')
  time.sleep(0.02)
 first.stdin.write('commit;\n');first.stdin.close()
 first.wait(timeout=10)
 if first.returncode: raise RuntimeError(first.stderr.read())
 _,error=second.communicate(timeout=10)
 if second.returncode==0 or refusal not in error: raise AssertionError(f'{name}: expected {refusal}, got {error}')
 print(f'{name}: blocked with {refusal}')

def agency_set(rev,ceiling):
 return f"select public.set_agency_workspace_release_flag({agency},{workspace},{user},'flags-agency@example.test','systems','operators',{rev},{ceiling},'Concurrent staff change')"
run_race('two staff writes to one revision',agency_set(5,5),agency_set(5,5),'workspace_release_revision_conflict')
run_race('ceiling changed after staff read',f"select public.set_agency_release_flag_ceiling({operator},'flags-operator@example.test',{workspace},'systems',{agency},{system},'publish','operators',5,'Concurrent platform downgrade')",agency_set(5,5),'workspace_release_revision_conflict')
run_race('operator verification withdrawn during ceiling write',f"update public.users set verified_at=null where id={operator}",f"select public.set_agency_release_flag_ceiling({operator},'flags-operator@example.test',{workspace},'systems',{agency},{system},'publish','operators',6,'Concurrent platform permission')",'workspace_access_denied')
execute(f'update public.users set verified_at=now() where id={operator}')
run_race('operator email changed during ceiling write',f"update public.users set email='flags-operator-changed@example.test' where id={operator}",f"select public.set_agency_release_flag_ceiling({operator},'flags-operator@example.test',{workspace},'systems',{agency},{system},'publish','operators',6,'Concurrent platform permission')",'workspace_release_operator_required')
execute(f"update public.users set email='flags-operator@example.test' where id={operator}")
run_race('verification withdrawn during write',f"select public.record_agency_verification('flags-operator@example.test',{agency},'publish','unverified','{{}}','Concurrent withdrawal')",agency_set(6,6),'agency_release_flag_unverified')
execute(f"select public.record_agency_verification('flags-operator@example.test',{agency},'publish','verified','{{\"fixture\":true}}',null)")
run_race('actor verification withdrawn during write',f"update public.users set verified_at=null where id={user}",agency_set(6,6),'workspace_access_denied')
execute(f'update public.users set verified_at=now() where id={user}')
run_race('provider seat ended during write',f"update public.provider_seats set status='ended',ended_by={operator},ended_at=clock_timestamp(),end_reason='Concurrent seat withdrawal' where customer_workspace_id={workspace} and agency_workspace_id={agency} and status='active'",agency_set(6,6),'workspace_access_denied')
