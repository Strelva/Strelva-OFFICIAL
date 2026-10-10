// Actual owned Node children only. No psql, Docker, database or provider process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startRetainedNativeChild } from '../lib/retained-native-child.mjs';
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
const source=(stream,ignoreTerm=false,exitAfter=false)=>`
 const timer=setTimeout(()=>process.exit(23),5000);
 process.on('SIGTERM',()=>{${ignoreTerm?'':'process.exit(0);'}});
 process.stdin.on('end',()=>process.exit(24));
 process.stdin.once('data',()=>{process.${stream}.write('owned fixture diagnostic\\n');${exitAfter?'clearTimeout(timer);process.exitCode=0;process.stdin.destroy();':'setInterval(()=>{},1000);'}});
 process.stdout.write('READY|'+process.pid+'\\n');
 process.stdin.resume();
`;
function make(retain,stream,ignoreTerm=false,exitAfter=false){
 let spawned;
 const owned=startRetainedNativeChild('actual-node',{command:process.execPath,args:['-e',source(stream,ignoreTerm,exitAfter)],env:{LC_ALL:'C'},retain,
  spawn:(command,args,options)=>{assert.equal(command,process.execPath);spawned=spawn(command,args,{...options,detached:false});return spawned;},timeoutMs:3000,graceMs:30,closeLimitMs:300});
 assert.ok(Number.isInteger(spawned.pid)&&spawned.pid>0);return {owned,pid:spawned.pid};
}
async function ready(owned,pid){
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clear();reject(Error('Owned Node readiness missing'));},1500);
  const clear=()=>{clearTimeout(timer);owned.child.stdout.removeListener('data',check);owned.child.removeListener('close',closed);};
  const closed=()=>{clear();reject(Error('Owned Node closed before ready'));};
  const check=()=>{if(owned.output().includes(`READY|${pid}\n`)){clear();resolve();}};
  owned.child.stdout.on('data',check);owned.child.once('close',closed);check();});
 assert.equal(alive(pid),true);assert.equal(owned.done(),false);
}
async function cleanup(owned,pid){
 if(!owned.done())owned.terminate();await owned.completed.catch(()=>{});
 if(!owned.done()){
  try{process.kill(pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
  if(!owned.done())await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned Node final CLOSE missing')),1000);owned.child.once('close',()=>{clearTimeout(timer);resolve();});});
 }
 assert.equal(owned.done(),true);assert.equal(alive(pid),false);
}
for(const code of ['ENOSPC','EIO'])for(const stream of ['stdout','stderr'])test(`actual Node ${code} ${stream} fault closes PID before caller restoration`,{timeout:5000},async(t)=>{
 const artifacts=new Map();let injecting=false;const retain=(name,value)=>{if(injecting&&name.endsWith('.log'))throw Object.assign(Error('fixture private retention detail'),{code});artifacts.set(name,value);};
 const {owned,pid}=make(retain,stream);let sentinel='blocked',finallyAfterClose=false;const order=[];
 owned.child.once('close',()=>order.push('CLOSE'));
 try{
  await ready(owned,pid);const partial=artifacts.get('actual-node.log');assert.ok(partial.includes(`READY|${pid}`));injecting=true;
  const operation=(async()=>{try{const result=await owned.completed;if(result.error||result.signal||result.timedOut||result.code!==0||!result.closed)throw Error('Owned command refused');}finally{finallyAfterClose=owned.done()&&!alive(pid);sentinel='restored';order.push('finally');}})();
  void operation.catch(()=>{});owned.child.stdin.write('GO\n');await assert.rejects(operation,/Owned command refused/);
  const result=await owned.completed;assert.equal(result.retentionFailed,true);assert.equal(result.closed,true);assert.equal(result.terminationRequested,true);assert.equal(finallyAfterClose,true);assert.equal(sentinel,'restored');assert.deepEqual(order,['CLOSE','finally']);assert.equal(artifacts.get('actual-node.log'),partial);assert.doesNotMatch(result.error,/fixture private retention detail/);
 }finally{await cleanup(owned,pid);t.diagnostic(JSON.stringify({actualOwnedPid:pid,closed:owned.done(),pidAliveAfter:alive(pid),exitCode:owned.child.exitCode,signalCode:owned.child.signalCode,restorationAfterClose:finallyAfterClose}));}
});
for(const code of ['ENOSPC','EIO'])test(`actual Node ${code} final process receipt refuses natural code0`,{timeout:5000},async(t)=>{
 const {owned,pid}=make(name=>{if(name.endsWith('-process.json'))throw Object.assign(Error('fixture final disk detail'),{code});},'stdout',false,true);
 try{await ready(owned,pid);owned.child.stdin.write('GO\n');const result=await owned.completed;assert.equal(result.code,0);assert.equal(result.closed,true);assert.equal(result.retentionFailed,true);assert.equal(result.error,'Private native child retention failed');assert.equal(result.terminationRequested,false);assert.equal(alive(pid),false);}finally{await cleanup(owned,pid);t.diagnostic(JSON.stringify({actualOwnedPid:pid,closed:owned.done(),pidAliveAfter:alive(pid),exitCode:owned.child.exitCode,signalCode:owned.child.signalCode}));}
});
test('actual Node ignoring SIGTERM receives bounded SIGKILL and actual CLOSE', {timeout:5000},async(t)=>{
 let injecting=false;const {owned,pid}=make(name=>{if(injecting&&name.endsWith('.log'))throw Object.assign(Error('fixture disk detail'),{code:'EIO'});},'stdout',true);
 try{await ready(owned,pid);injecting=true;owned.child.stdin.write('GO\n');const result=await owned.completed;
  assert.equal(result.retentionFailed,true);assert.equal(result.signal,'SIGKILL');assert.equal(result.closed,true);assert.equal(result.terminationRequested,true);assert.equal(result.timedOut,false);assert.equal(alive(pid),false);
 }finally{await cleanup(owned,pid);t.diagnostic(JSON.stringify({actualOwnedPid:pid,closed:owned.done(),pidAliveAfter:alive(pid),exitCode:owned.child.exitCode,signalCode:owned.child.signalCode}));}
});
