// Actual harmless Bash/Node children with fake psql only. No PostgreSQL/network.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fakePsqlSource } from './support/booking-proof-fake.mjs';

const root=process.cwd();
const quote=value=>`'${value.replaceAll("'","'\\''")}'`;
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
function setup(mode, hostile=false){
 const dir=mkdtempSync('/private/tmp/strelva-booking-transport-signal-unit-'),data=resolve(dir,'data'),socket=resolve(dir,'socket'),status=resolve(dir,'booking-settings-cleanup.log'),envLog=resolve(dir,'transport.jsonl');
 mkdirSync(data,{mode:0o700});mkdirSync(socket,{mode:0o700});const epoch=String(Math.floor(Date.now()/1000));
 writeFileSync(resolve(data,'postmaster.pid'),[process.pid,data,epoch,'54321',socket,'',''].join('\n'),{mode:0o600});
 writeFileSync(resolve(dir,'psql'),fakePsqlSource,{mode:0o755});writeFileSync(status,'',{mode:0o600});writeFileSync(envLog,'',{mode:0o600});
 const env={...Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('PG'))),PATH:`${dir}:${process.env.PATH}`,BOOKING_FAKE_MODE:mode,BOOKING_FAKE_DATA:data,BOOKING_FAKE_SOCKET:socket,BOOKING_FAKE_EPOCH:epoch,BOOKING_FAKE_STATUS:status,BOOKING_FAKE_ENV_LOG:envLog};
 if(hostile)Object.assign(env,{PGHOSTADDR:'192.0.2.77',PGSERVICE:'fictional-service',PGSERVICEFILE:'/fictional/service',PGPASSFILE:'/fictional/pass',PGOPTIONS:'-c application_name=fictional-hostile',PGDATABASE:'fictional-redirect',PGUSER:'fictional-user',PGPASSWORD:'fictional-password'});
 const command=`repo_root=${quote(root)};cluster_root=${quote(dir)};cluster_data=${quote(data)};cluster_socket=${quote(socket)};cluster_postmaster_pid=${process.pid};psql_args=(--host=${quote(socket)} --port=54321 --username=fixture --dbname=fixture);source ${quote(resolve(root,'scripts/sql/booking-owned-cluster.sh'))};seal_booking_settings_owned_cluster;source ${quote(resolve(root,'scripts/sql/booking-settings-atomicity.sh'))};run_booking_settings_atomicity`;
 return{dir,status,envLog,env,command,log:()=>readFileSync(status,'utf8')};
}
async function until(check,done,limit=14000){const deadline=Date.now()+limit;while(Date.now()<deadline){const result=check();if(result)return result;if(done())throw Error('Owned helper closed before the requested boundary');await pause(10);}throw Error('Owned helper boundary deadline exceeded');}
function closeChild(child){return new Promise((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}));});}
async function emergencyChildClose(pid){if(!pid||!alive(pid))return;process.kill(pid,'SIGTERM');await pause(100);if(alive(pid))process.kill(pid,'SIGKILL');await until(()=>!alive(pid),()=>false,2000);}

test('all verified/action/background/cleanup transports strip hostile inherited libpq settings',()=>{
 const fixture=setup('success',true);let passed=false;
 try{
  const result=spawnSync('bash',['-c',fixture.command],{env:fixture.env,encoding:'utf8',timeout:15000});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  const calls=readFileSync(fixture.envLog,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(calls.some(call=>call.sql.startsWith('select jsonb_build_object')));assert.ok(calls.some(call=>call.sql.startsWith('insert into public.tenants')));assert.ok(calls.some(call=>call.sql.includes('write_tenant_booking_settings_fields')));assert.ok(calls.some(call=>call.sql.startsWith('begin;delete')));
  for(const call of calls)assert.deepEqual(call.pg,{PGCONNECT_TIMEOUT:'3',PGOPTIONS:'-c statement_timeout=3000 -c lock_timeout=1000'},call.sql);
  passed=true;
 }catch(error){error.message+=`\nRetained harmless transport evidence: ${fixture.dir}`;throw error;}finally{if(passed)rmSync(fixture.dir,{recursive:true,force:true});}
});

for(const boundary of ['body','query','child','delete'])for(const signal of ['SIGTERM','SIGINT'])test(`actual ${signal} during cleanup ${boundary} waits for owned child closure and retains terminal failure`,{timeout:20000},async(t)=>{
 const fixture=setup(`signal_${boundary}`),child=spawn('bash',['-c',fixture.command],{env:fixture.env,stdio:['ignore','pipe','pipe']});
 let closed=false,firstPid,helperPid,passed=false;const output=[];child.stdout.on('data',chunk=>output.push(String(chunk)));child.stderr.on('data',chunk=>output.push(String(chunk)));const completed=closeChild(child).then(result=>{closed=true;return result;});
 try{
  const needle=boundary==='body'?'phase=session label=first':boundary==='query'?'phase=cleanup start':boundary==='child'?'phase=child_close_start label=cleanup-first':'phase=fixture_delete_start';
  await until(()=>fixture.log().includes(needle),()=>closed);
  const log=fixture.log();helperPid=Number(log.match(/helper_pid=(\d+)/)?.[1]);assert.ok(helperPid>1&&alive(helperPid));
  if(boundary!=='delete'){firstPid=Number(log.match(/phase=session label=first backend_pid=(\d+)/)?.[1]);assert.ok(firstPid>1&&alive(firstPid),'actual tracked harmless child must be live when signal is sent');}
  process.kill(helperPid,signal);
  const result=await completed;assert.equal(result.signal,null);assert.equal(result.code,signal==='SIGTERM'?143:130,output.join(''));
  const final=fixture.log();assert.match(final,new RegExp(`phase=signal name=${signal.slice(3)}`));assert.match(final,new RegExp(`terminal_signal_status=${result.code}`));assert.match(final,/phase=cleanup .*qualification_status=/);assert.ok(!output.join('').includes('PASS cleanup'));
  if(firstPid){assert.equal(alive(firstPid),false,'helper must close its tracked child before terminal exit');assert.match(final,new RegExp(`pid=${firstPid} closed=1`));}
  assert.match(final,/fixture_absent=t/);passed=true;t.diagnostic(JSON.stringify({boundary,signal,helperPid,firstPid:firstPid??null,code:result.code,helperClosed:closed,trackedChildAliveAfter:firstPid?alive(firstPid):false}));
 }catch(error){error.message+=`\nRetained harmless signal evidence: ${fixture.dir}`;throw error;}finally{
  if(!closed){if(helperPid&&alive(helperPid))process.kill(helperPid,'SIGTERM');await Promise.race([completed,pause(8000)]);if(!closed){child.kill('SIGKILL');await completed;}}
  await emergencyChildClose(firstPid);if(passed)rmSync(fixture.dir,{recursive:true,force:true});
 }
});

// Replacing the owned log with a directory causes an actual append-open failure,
// including when tests run as an elevated user. No permission assumptions.
for(const boundary of ['query','child','delete'])test(`actual log failure at cleanup ${boundary} still closes children and deletes fixture`,{timeout:20000},async(t)=>{
 const fixture=setup(`signal_${boundary}`),child=spawn('bash',['-c',fixture.command],{env:fixture.env,stdio:['ignore','pipe','pipe']});
 let closed=false,firstPid,helperPid,passed=false;const output=[];child.stdout.on('data',chunk=>output.push(String(chunk)));child.stderr.on('data',chunk=>output.push(String(chunk)));const completed=closeChild(child).then(result=>{closed=true;return result;});
 try{
  const needle=boundary==='query'?'phase=cleanup start':boundary==='child'?'phase=child_close_start label=cleanup-first':'phase=fixture_delete_start';
  await until(()=>fixture.log().includes(needle),()=>closed);
  const log=fixture.log();helperPid=Number(log.match(/helper_pid=(\d+)/)?.[1]);
  if(boundary!=='delete'){firstPid=Number(log.match(/phase=session label=first backend_pid=(\d+)/)?.[1]);assert.ok(firstPid>1&&alive(firstPid));}
  renameSync(fixture.status,`${fixture.status}.retained`);mkdirSync(fixture.status,{mode:0o700});
  const result=await completed;assert.equal(result.signal,null);assert.equal(result.code,1,output.join(''));
  const fallback=output.join('');assert.match(fallback,/BOOKING_RECEIPT_FAILURE/);assert.match(fallback,/fixture_absent=t/);assert.ok(!fallback.includes('PASS cleanup'));
  if(firstPid){assert.equal(alive(firstPid),false);assert.match(fallback,new RegExp(`pid=${firstPid} closed=1`));}
  passed=true;t.diagnostic(JSON.stringify({boundary,code:result.code,trackedChildAliveAfter:firstPid?alive(firstPid):false,fallbackReceipt:true}));
 }catch(error){error.message+=`\nRetained harmless log-failure evidence: ${fixture.dir}`;throw error;}finally{
  if(!closed){if(helperPid&&alive(helperPid))process.kill(helperPid,'SIGTERM');await Promise.race([completed,pause(8000)]);if(!closed){child.kill('SIGKILL');await completed;}}
  await emergencyChildClose(firstPid);if(passed)rmSync(fixture.dir,{recursive:true,force:true});
 }
});
