import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const migrationRoot = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const filename = "20261022130000_tenant_newsletter_teardown_hold.sql";
const signatures = ["public.tenant_cleanup_teardown_blockers(text)", "public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)"];
const successors = [...signatures, "public.tenant_cleanup_teardown_blockers_before_newsletter(text)"];
const quote = value => `'${value.replaceAll("'", "''")}'`;
const transactionBody = name => {
  const source = readFileSync(resolve(migrationRoot, name), "utf8");
  if ((source.match(/^begin;$/gm) ?? []).length !== 1 || (source.match(/^commit;$/gm) ?? []).length !== 1)
    throw new Error("proof_requires_single_migration_transaction");
  return source.replace(/^begin;\n/m, "").replace(/^commit;\n?$/m, "");
};
const snapshot = names => `(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid::regprocedure::text) from pg_proc p where p.oid=any(array[${names.map(s => `${quote(s)}::regprocedure`).join(",")}]))`;
const grantee = "newsletter_342_proof_grantee";
const delegate = "newsletter_342_proof_delegate";
const createRole = `create role ${grantee};`;
const forwardCases = [
  ["predecessor service execute absent", `revoke execute on function ${signatures[0]} from service_role;`],
  ["custom reader grant", `${createRole} grant execute on function ${signatures[0]} to ${grantee};`],
  ["custom helper grant", `${createRole} grant execute on function ${signatures[1]} to ${grantee};`],
  ["service grant option", `grant execute on function ${signatures[0]} to service_role with grant option;`],
  ["delegated grant graph", `${createRole} create role ${delegate}; grant usage on schema public to ${delegate}; grant execute on function ${signatures[0]} to ${delegate} with grant option; set local role ${delegate}; grant execute on function ${signatures[0]} to ${grantee}; reset role;`],
  ["custom global default function grant", `${createRole} alter default privileges grant execute on functions to ${grantee};`],
  ["custom public default function grant", `${createRole} alter default privileges in schema public grant execute on functions to ${grantee};`],
  ["custom journal default table grant", `${createRole} alter default privileges in schema public grant select on tables to ${grantee};`],
  ...signatures.map(signature => [`nonowner ${signature}`, `${createRole} alter function ${signature} owner to ${grantee};`]),
  ["predecessor body drift", `select prosrc into src from pg_proc where oid=${quote(signatures[1])}::regprocedure; execute replace(pg_get_functiondef(${quote(signatures[1])}::regprocedure),src,src||chr(10)||'-- fictional predecessor drift'||chr(10));`],
  ["predecessor properties drift", `alter function ${signatures[0]} volatile;`],
];
const inverseCases = successors.flatMap(signature => [
  [`successor owner drift ${signature}`, `${createRole} alter function ${signature} owner to ${grantee};`],
  [`successor ACL drift ${signature}`, `${createRole} grant execute on function ${signature} to ${grantee};`],
  [`successor body drift ${signature}`, `select prosrc into src from pg_proc where oid=${quote(signature)}::regprocedure; execute replace(pg_get_functiondef(${quote(signature)}::regprocedure),src,src||chr(10)||'-- fictional body drift'||chr(10));`],
]);

/** Generates SQL only; the coordinator supplies the owned native341 session. */
export function buildNewsletterBaselineProof() {
  const forward = transactionBody(filename);
  const inverse = transactionBody(`rollback-${filename}`);
  const cases = (items, mode) => items.map(([label, setup]) => `
do $proof$
declare before_state jsonb; after_state jsonb; src text;
begin
 begin
  ${mode === "inverse" ? `execute $forward$${forward}$forward$;` : ""}
  ${setup}
  before_state:=${snapshot(mode === "inverse" ? successors : signatures)};
  begin
   execute $candidate$${mode === "inverse" ? inverse : forward}$candidate$;
   raise exception 'proof_candidate_was_allowed';
  exception when others then
   if sqlerrm not like ${quote(mode === "inverse" ? "newsletter_teardown_successor%changed%" : "newsletter_teardown_unsupported%baseline%")}
    then raise; end if;
  end;
  after_state:=${snapshot(mode === "inverse" ? successors : signatures)};
  if after_state is distinct from before_state then raise exception 'proof_refusal_changed_packet';end if;
  ${mode === "inverse" ? "if (select count(*) from public.tenant_newsletter_teardown_function_journal)<>3 then raise exception 'proof_refusal_changed_journal';end if;" : "if to_regclass('public.tenant_newsletter_teardown_function_journal') is not null or to_regprocedure('public.tenant_cleanup_teardown_blockers_before_newsletter(text)') is not null then raise exception 'proof_refusal_created_successor';end if;"}
  raise exception 'proof_case_rollback';
 exception when others then if sqlerrm<>'proof_case_rollback' then raise;end if;end;
 raise notice ${quote(`PASS ${mode}: ${label}`)};
end $proof$;
`).join("");
  return `\\set ON_ERROR_STOP on
-- Local owned341 only. No server startup, provider operation or role cleanup.
begin;
do $roles$ begin
 if exists(select 1 from pg_roles where rolname in (${quote(grantee)},${quote(delegate)})) then raise exception 'proof_role_already_exists';end if;
end $roles$;
${cases(forwardCases, "forward")}
${cases(inverseCases, "inverse")}
do $roundtrip$
declare saved jsonb;
begin
 saved:=${snapshot(signatures)};
 execute $forward$${forward}$forward$;
 execute $inverse$${inverse}$inverse$;
 if ${snapshot(signatures)} is distinct from saved then raise exception 'proof_roundtrip_not_exact';end if;
 if to_regclass('public.tenant_newsletter_teardown_function_journal') is not null or to_regprocedure('public.tenant_cleanup_teardown_blockers_before_newsletter(text)') is not null then raise exception 'proof_inverse_left_successor';end if;
 raise notice 'PASS exact predecessor body/owner/ACL roundtrip';
end $roundtrip$;
rollback;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(buildNewsletterBaselineProof());
