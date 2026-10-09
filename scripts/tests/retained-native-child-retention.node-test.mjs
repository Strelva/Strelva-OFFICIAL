import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRetainedNativeChild as corrected } from '../lib/retained-native-child.mjs';
const start = process.env.STRELVA_RETENTION_OLD_HELPER ? (await import(pathToFileURL(process.env.STRELVA_RETENTION_OLD_HELPER))).startRetainedNativeChild : corrected;
function fixture(retain, autoClose=true) {
 const signals=[];const process=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:new EventEmitter(),pid:27182});
 process.kill=signal=>{signals.push(signal);if(autoClose)setImmediate(()=>process.emit('close',null,signal));return true;};
 const owned=start('owned',{spawn:()=>process,args:[],env:{},retain,timeoutMs:40,graceMs:5,closeLimitMs:10});
 return {owned,process,signals};
}
for(const code of ['ENOSPC','EIO'])for(const stream of ['stdout','stderr'])test(`${code} ${stream} retention reaches awaited refusal/CLOSE/caller finally`,async()=>{
 const artifacts=new Map();let injecting=false,finallyReached=false,qualified=false;
 const retain=(name,value)=>{if(injecting&&name.endsWith('.log'))throw Object.assign(new Error('fictional private payload must stay private'),{code});artifacts.set(name,value);};
 const {owned,process,signals}=fixture(retain);
 process.stdout.emit('data','original partial prefix\n');const original=artifacts.get('owned.log');injecting=true;
 const journey=(async()=>{try{const result=await owned.completed;if(result.error||!result.closed||result.code!==0)throw Error('Native refusal');qualified=true;}finally{finallyReached=true;}})();
 void journey.catch(()=>{});
 try{assert.doesNotThrow(()=>process[stream].emit('data','later private diagnostic\n'));}catch(error){injecting=false;process.emit('close',0,null);await journey;throw error;}
 await assert.rejects(journey,/Native refusal/);assert.equal(finallyReached,true);assert.equal(qualified,false);assert.equal(owned.done(),true);assert.deepEqual(signals,['SIGTERM']);assert.equal(artifacts.get('owned.log'),original);assert.equal(owned.output().includes('original partial prefix'),true);
 const result=await owned.completed;assert.equal(result.retentionFailed,true);assert.equal(result.closed,true);assert.doesNotMatch(result.error,/fictional private payload/);
});
for(const code of ['ENOSPC','EIO'])test(`${code} final receipt failure cannot qualify code0`,async()=>{
 const {owned,process,signals}=fixture((name)=>{if(name.endsWith('-process.json'))throw Object.assign(new Error('fixture disk failure'),{code});});
 assert.doesNotThrow(()=>process.emit('close',0,null));const result=await owned.completed;
 assert.equal(result.code,0);assert.equal(result.closed,true);assert.equal(result.retentionFailed,true);assert.equal(result.error,'Private native child retention failed');assert.deepEqual(signals,[]);assert.equal(owned.done(),true);
});
for(const code of ['ENOSPC','EIO'])test(`${code} close-time log failure cannot escape or qualify code0`,async()=>{
 let closing=false;const {owned,process,signals}=fixture(name=>{if(closing&&name.endsWith('.log'))throw Object.assign(new Error('fixture close-log failure'),{code});});
 closing=true;assert.doesNotThrow(()=>process.emit('close',0,null));const result=await owned.completed;
 assert.equal(result.closed,true);assert.equal(result.code,0);assert.equal(result.retentionFailed,true);assert.equal(result.error,'Private native child retention failed');assert.deepEqual(signals,[]);
});
test('persistent initial retention failure closes its registered child',async()=>{
 const {owned,signals}=fixture(()=>{throw Object.assign(new Error('fixture disk failure'),{code:'ENOSPC'});});
 const result=await owned.completed;assert.equal(result.closed,true);assert.equal(result.retentionFailed,true);assert.deepEqual(signals,['SIGTERM']);assert.equal(owned.done(),true);
});
test('retention failure with no observed close still rejects bounded closure promise',async()=>{
 let inject=false;const {owned,process,signals}=fixture(()=>{if(inject)throw Object.assign(new Error('fixture disk failure'),{code:'EIO'});},false);
 inject=true;assert.doesNotThrow(()=>process.stdout.emit('data','partial\n'));
 await assert.rejects(owned.completed,/closure was not observed/);assert.equal(owned.done(),false);assert.deepEqual(signals,['SIGTERM','SIGKILL']);
});
test('native error plus retention failure still awaits actual CLOSE and preserves original error',async()=>{
 let inject=false;const {owned,process}=fixture(()=>{if(inject)throw Object.assign(new Error('fixture disk failure'),{code:'EIO'});},false);inject=true;
 assert.doesNotThrow(()=>process.emit('error',new Error('fictional spawn error')));assert.equal(owned.done(),false);process.emit('close',-2,null);
 const result=await owned.completed;assert.equal(result.closed,true);assert.equal(result.error,'fictional spawn error');assert.equal(result.retentionFailed,true);
});
test('ordinary successful behavior retains exact late output and default command',async()=>{
 const artifacts=new Map(),process=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:new EventEmitter(),kill:()=>true});let observedCommand;
 const owned=start('normal',{spawn:command=>{observedCommand=command;return process;},args:[],env:{},retain:(name,value)=>artifacts.set(name,value)});
 process.stdout.emit('data','first\n');process.emit('exit',0,null);assert.equal(owned.done(),false);process.stderr.emit('data','late\n');process.emit('close',0,null);
 const result=await owned.completed;assert.equal(result.error,null);assert.equal(result.retentionFailed,undefined);assert.equal(result.stderr,'late\n');assert.equal(owned.output(),'first\n');assert.equal(observedCommand,'psql');assert.equal(artifacts.has('normal-process.json'),true);
});
function checkGraph(coordinator){
 const repository=process.env.STRELVA_RETAINED_SOURCE_GRAPH_ROOT||process.cwd();
 const listed=new Set([...coordinator.slice(coordinator.indexOf('const sourceFiles ='),coordinator.indexOf('const snapshot =')).matchAll(/'([^']+)'/g)].map(x=>x[1]));
 const visited=new Set();
 function visit(path,source){if(visited.has(path))return;visited.add(path);source??=readFileSync(resolve(repository,path),'utf8');for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){const next=relative(repository,resolve(repository,dirname(path),match[1]));visit(next);}}
 visit('scripts/check-governed-creator-exit-races.mjs',coordinator);
 for(const path of visited)assert.equal(listed.has(path),true,`Missing executable dependency in receipt: ${path}`);
 assert.equal(visited.has('scripts/journey-evidence-files.mjs'),true);
}
test('creator source receipt covers every transitive local executable import',()=>{
 checkGraph(readFileSync(new URL('../check-governed-creator-exit-races.mjs',import.meta.url),'utf8'));
});
test('actual executable graph refuses omission of journey-evidence leaf',()=>{
 const coordinator=readFileSync(new URL('../check-governed-creator-exit-races.mjs',import.meta.url),'utf8');
 const omitted=coordinator.replace("'scripts/journey-evidence-files.mjs', ",'');
 assert.notEqual(omitted,coordinator);assert.throws(()=>checkGraph(omitted),/Missing executable dependency in receipt: scripts\/journey-evidence-files.mjs/);
});
