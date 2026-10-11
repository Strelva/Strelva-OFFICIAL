/** Execute the actual fixture producer with mocked Auth/SQL/fs ports only.
 * Validate real generated file bytes through Bash; no stack or Auth is used. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const root=process.argv[2], seed=process.argv[3]||join(root,'scripts/seed-local-package-reviewer.ts');
const requireRoot=createRequire(join(root,'package.json'));
const ts=requireRoot('typescript');
const directory="/private/tmp/strelva-full-journeys.fixture'quote";
const stack='/private/tmp/strelva-auth.fixture';
const userId='aaaaaaaa-0000-4000-8000-000000000001';
const authUrl='http://127.0.0.1:12345',db='postgresql://postgres:dummy@127.0.0.1:12346/postgres';
const identity={systemIdentifier:'owned-fixture-system',databaseOid:'5',database:'postgres'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const baseline={binding:{stack,databaseUrlSha256:sha(db),authUrlSha256:sha(authUrl)},databaseIdentity:identity};
const writes=[],logs=[],sqlInputs=[],authCalls=[];
let createdEmail,createdPassword;
const env={STRELVA_LOCAL_AUTH_PROOF:'1',STRELVA_WORKSPACE_RELEASE:'1',STRELVA_SYSTEMS_RELEASE:'1',EMAIL_SENDING_ENABLED:'false',
 STRELVA_LOCAL_DB_URL:db,NEXT_PUBLIC_SUPABASE_URL:authUrl,SUPABASE_URL:authUrl,PLAYWRIGHT_BASE_URL:'http://localhost:12347',SUPABASE_SERVICE_ROLE_KEY:'dummy-local-service',NEXT_PUBLIC_SUPABASE_ANON_KEY:'dummy-local-anon',PATH:process.env.PATH};
const fsPort={realpathSync:path=>path,statSync:()=>({isDirectory:()=>true}),readFileSync:path=>{
 if(path===join(directory,'env'))return `STRELVA_AUTH_STACK_DIR=${stack}\n`;
 if(path===join(stack,'full-model-bootstrap-baseline.json'))return JSON.stringify(baseline);
 throw Error('Unexpected file read');
},writeFileSync:(path,content,options)=>writes.push({path,content,options})};
const ports={
 'node:crypto':{createHash,randomUUID:()=>userId},'node:fs':fsPort,'node:path':requireRoot('node:path'),
 'node:child_process':{execFileSync:(_command,args,options)=>{
  sqlInputs.push(options.input);
  if(options.input.includes('pg_control_system'))return JSON.stringify(identity);
  const values=Object.fromEntries(args.filter(arg=>/^v\d+=/.test(arg)).map(arg=>[arg.slice(0,arg.indexOf('=')),arg.slice(arg.indexOf('=')+1)]));
  return JSON.stringify({userId:values.v1,email:values.v2,verified:true,policyVersion:values.v3,active:true});
 }},
 '@supabase/supabase-js':{createClient:()=>({auth:{admin:{createUser:async input=>{
  authCalls.push('createUser');createdEmail=input.email;createdPassword=input.password;return {data:{user:{id:userId}},error:null};
 }}}})},
 '@supabase/ssr':{createServerClient:(_url,_key,options)=>({auth:{signInWithPassword:async input=>{
  authCalls.push('signInWithPassword');assert.equal(input.email,createdEmail);assert.equal(input.password,createdPassword);
  options.cookies.setAll([{name:'local-session',value:'dummy-session-cookie'}]);return {data:{user:{id:userId}},error:null};
 }}})},
};
const fakeProcess={env,argv:['node',seed,directory],stdout:{write:value=>logs.push(value)},stderr:{write:value=>logs.push(value)},exitCode:0};
const context=vm.createContext({require:name=>{assert.ok(name in ports,`unexpected import ${name}`);return ports[name];},module:{exports:{}},exports:{},process:fakeProcess,URL,AbortSignal,
 fetch:async(url,options)=>{assert.equal(url.pathname,'/api/workspace');assert.equal(options.headers.cookie,'local-session=dummy-session-cookie');authCalls.push('workspaceSync');return {status:200};}});
let source=readFileSync(seed,'utf8').replace('void main().catch','globalThis.__seedPromise=main().catch');
source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInContext(source,context,{filename:seed});await context.__seedPromise;
assert.equal(fakeProcess.exitCode,0);assert.equal(writes.length,2);
assert.deepEqual(authCalls,['createUser','signInWithPassword','workspaceSync']);
const envFile=writes.find(file=>file.path.endsWith('package-reviewer-test.env'));
assert.equal(envFile.content.trimEnd().split('\n').length,3);assert.ok(!envFile.content.includes('\\n'));
for(const file of writes){assert.equal(file.options.mode,0o600);assert.equal(file.options.flag,'wx');assert.ok(file.content.endsWith('\n'));}
// Interpret the actual generated env through Bash, including a quote in the
// receipt path. The child output stays inside assertions, never printed.
const parsed=JSON.parse(execFileSync('bash',['-c','set -a; source /dev/stdin; node -e \'process.stdout.write(JSON.stringify([process.env.STRELVA_LOCAL_PACKAGE_REVIEWER_EMAIL,process.env.STRELVA_LOCAL_PACKAGE_REVIEWER_PASSWORD,process.env.STRELVA_LOCAL_PACKAGE_REVIEWER_RECEIPT]));\''],{input:envFile.content,encoding:'utf8',env:{PATH:process.env.PATH}}));
assert.deepEqual(parsed,[createdEmail,createdPassword,join(directory,'package-reviewer-fixture.json')]);
const receipt=JSON.parse(writes.find(file=>file.path.endsWith('package-reviewer-fixture.json')).content);
assert.equal(receipt.productionQualification,false);assert.equal(receipt.localFictionalPolicy,true);assert.equal(receipt.realAuth,true);
assert.equal(receipt.policy.userId,userId);assert.equal(receipt.policy.email,createdEmail);
assert.ok(!JSON.stringify(receipt).includes(createdPassword));
assert.ok(logs.every(line=>line.endsWith('\n')));assert.ok(!logs.join('').includes(createdPassword));
assert.ok(!logs.join('').includes(env.SUPABASE_SERVICE_ROLE_KEY));assert.ok(!logs.join('').includes('dummy-session-cookie'));
assert.equal(sqlInputs.length,2);assert.ok(sqlInputs[1].includes('insert into public.system_revision_reviewers'));
assert.ok(!sqlInputs.some(sql=>/insert into public.system_revision_qualifications|review_system_revision_qualification/i.test(sql)));
process.stdout.write('Reviewer producer mocked output roundtrip PASS: three Bash-parseable env lines, quoted receipt path, mode600/exclusive files, real producer sequence, fictional policy only, no secret logged.\n');
