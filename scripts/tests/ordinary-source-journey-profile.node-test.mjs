import test from 'node:test';
import assert from 'node:assert/strict';
import { ordinarySourceProfile, ordinarySourcePreflight, ordinarySourceCase } from '../ordinary-source-journey-profile.mjs';
import { journeyProfile, preflight, validateReport } from '../full-model-journey-profile.mjs';
const root = process.cwd();
const env = { ...journeyProfile('full-native').env, PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3100', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321', STRELVA_LOCAL_DB_URL:'postgresql://local@127.0.0.1:54322/postgres' };
test('one additive source case preserves the closed native manifest and held providers',()=>{
 const native=journeyProfile('full-native'), candidate=ordinarySourceProfile(); assert.deepEqual(candidate.env,native.env); assert.equal(candidate.specs.length,1);assert.equal(candidate.specs[0].count,1);assert.equal(candidate.specs[0].cases[0].title,ordinarySourceCase); assert.equal(candidate.completionClaim,'local-ordinary-source-only');assert.equal(candidate.providerActions,'held');assert.equal(ordinarySourcePreflight(root,env),true);assert.throws(()=>preflight(journeyProfile('full-provider'),root),/remain held/);
});
test('missing source/Auth/release gates refuse before fixture dispatch',()=>{
 for(const key of ['STRELVA_LOCAL_AUTH_PROOF','STRELVA_WORKSPACE_RELEASE','STRELVA_SYSTEMS_RELEASE','STRELVA_NEEDS_YOU_RELEASE'])assert.throws(()=>ordinarySourcePreflight(root,{...env,[key]:'0'}),/requires/);
});
test('hosted services, provider credentials and enabled mail refuse',()=>{
 for(const key of ['PLAYWRIGHT_BASE_URL','NEXT_PUBLIC_SUPABASE_URL','STRELVA_LOCAL_DB_URL'])assert.throws(()=>ordinarySourcePreflight(root,{...env,[key]:'https://hosted.example.test'}),/loopback/);
 for(const key of ['STRIPE_SECRET_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY','EMAIL_PROVIDER_API_KEY'])assert.throws(()=>ordinarySourcePreflight(root,{...env,[key]:'unit-placeholder'}),/credentials/);
 for(const key of ['EMAIL_SENDING_ENABLED','CUSTOMER_EMAIL_ENABLED','OPERATOR_EMAILS_ENABLED','PROSPECT_EMAILS_ENABLED'])assert.throws(()=>ordinarySourcePreflight(root,{...env,[key]:'true'}),/held/);
});
test('unit, skipped and wrong-case reports cannot qualify the actual Auth journey',()=>{
 const profile=ordinarySourceProfile();assert.throws(()=>validateReport({suites:[],errors:[]},profile));
 const report={suites:[{specs:[{file:profile.specs[0].file,title:ordinarySourceCase,tests:[{projectName:'desktop',status:'skipped',expectedStatus:'passed',results:[{status:'skipped'}]}]}]}],errors:[]}; assert.throws(()=>validateReport(report,profile));
 report.stats={expected:1,skipped:0,unexpected:0,flaky:0};report.suites[0].specs[0].tests[0]={projectName:'desktop',status:'expected',expectedStatus:'passed',results:[{status:'passed',retry:0}]};assert.equal(validateReport(report,profile).passed,1); assert.equal(validateReport(report,profile).fullReleaseQualified,false);
 report.suites[0].specs[0].title='a passing unit';assert.throws(()=>validateReport(report,profile));
});
