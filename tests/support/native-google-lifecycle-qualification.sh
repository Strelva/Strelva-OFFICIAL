# Prepared, opt-in qualification only. Source this file from a caller that owns
# an empty disposable cluster already loaded through native_google_lifecycle.
# The caller supplies repo_root, cluster_root/data/socket/port and psql_args.
# This helper neither starts nor destroys a cluster and never contacts Google.
# Invoke only with STRELVA_NATIVE_GOOGLE_SQL_QUALIFICATION=owned-disposable.
check_native_google_lifecycle_qualification() (
 set -euo pipefail
 [[ "${STRELVA_NATIVE_GOOGLE_SQL_QUALIFICATION:-}" == owned-disposable ]] || {
  printf 'Native Google SQL qualification requires explicit owned-disposable authority.\n' >&2; return 1;
 }
 [[ "$cluster_root" == /* && "$cluster_root" != / && "$cluster_data" == "$cluster_root/data"
  && "$cluster_socket" == "$cluster_root/socket" && "$cluster_port" =~ ^[0-9]+$
  && -O "$cluster_root" && -O "$cluster_data" && -O "$cluster_socket"
  && -O "$cluster_data/PG_VERSION" && -O "$cluster_data/postmaster.pid" ]] || return 1
 # Permit only the owning runner's local Unix socket, fixed port and local user.
 # No inherited URL, service, password, remote host or replacement DB arguments.
 local arg host_seen=0 port_seen=0 user_seen=0 db_seen=0 stop_seen=0
 for arg in "${psql_args[@]}"; do
  case "$arg" in
   "--host=$cluster_socket") host_seen=$((host_seen+1));;
   "--port=$cluster_port") port_seen=$((port_seen+1));;
   "--username=$(id -un)") user_seen=$((user_seen+1));;
   --dbname=postgres) db_seen=$((db_seen+1));;
   --set=ON_ERROR_STOP=1) stop_seen=$((stop_seen+1));;
   --no-psqlrc) ;;
   *) printf 'Native qualification refused unexpected connection argument.\n' >&2; return 1;;
  esac
 done
 [[ "$host_seen:$port_seen:$user_seen:$db_seen:$stop_seen" == 1:1:1:1:1 ]] || return 1
 local qualification_dir="$cluster_root/native-google-lifecycle-qualification"
 mkdir -p "$qualification_dir"
 chmod 700 "$qualification_dir"
 # Read-only identity validation precedes every mutation. The server must use
 # this owned data/socket directory and have all TCP listeners disabled.
 psql "${psql_args[@]}" -X -q --set="owned_data=$cluster_data" --set="owned_socket=$cluster_socket" --set="owned_port=$cluster_port" >"$qualification_dir/identity.log" 2>&1 <<'SQL'
select current_setting('data_directory')=:'owned_data'
 and current_setting('unix_socket_directories')=:'owned_socket'
 and current_setting('port')=:'owned_port' and current_setting('listen_addresses')=''
 and current_database()='postgres' and current_user=session_user
 and (select rolsuper from pg_roles where rolname=current_user)
 and pg_get_userbyid((select datdba from pg_database where datname=current_database()))=current_user
 and not exists(select 1 from public.native_google_oauth_attempts)
 and not exists(select 1 from public.native_google_disconnect_receipts)
 and not exists(select 1 from public.workspace_account_bindings where location_selection_generation<>0) as owned_empty_native \gset
\if :owned_empty_native
\else
\quit 41
\endif
SQL
 local forward="$repo_root/supabase/migrations/20261021140000_native_google_lifecycle.sql"
 local inverse="$repo_root/supabase/migrations/rollback-20261021140000_native_google_lifecycle.sql"
 local hash_successor="$repo_root/supabase/migrations/20261021140100_native_google_hash_portability.sql"
 # Snapshots contain hashes, object names and catalog properties only. Rows,
 # function SQL and any credentials are never printed into diagnostic logs.
 cat >"$qualification_dir/snapshot.sql" <<SQL
\i $repo_root/tests/support/public-catalog-fingerprint.sql
SQL
 cat >>"$qualification_dir/snapshot.sql" <<'SQL'
select 'authority '||p.oid::regprocedure::text||' '||encode(sha256(convert_to((to_jsonb(p)-array['oid','prosrc','prosqlbody'])::text,'UTF8')),'hex')
 from pg_proc p where p.pronamespace='public'::regnamespace order by p.oid::regprocedure::text;
select 'owner '||c.relname||' '||pg_get_userbyid(c.relowner) from pg_class c
 where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.relname;
select 'journal-security '||encode(sha256(convert_to(jsonb_build_object('owner',c.relowner,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl)::text,'UTF8')),'hex')
 from pg_class c where c.oid=to_regclass('public.native_google_lifecycle_prior_functions');
select 'journal-policy '||p.polname||' '||encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex')
 from pg_policy p where p.polrelid=to_regclass('public.native_google_lifecycle_prior_functions') order by p.polname;
select 'journal-column '||a.attname||' '||encode(sha256(convert_to((to_jsonb(a)-'attrelid')::text,'UTF8')),'hex')
 from pg_attribute a where a.attrelid=to_regclass('public.native_google_lifecycle_prior_functions')
 and a.attnum>0 and not a.attisdropped order by a.attnum;
create function pg_temp.native_qualification_rows() returns setof text language plpgsql as $$
declare relation record; digest text; begin
 for relation in select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname loop
  execute format('select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb)::text,''UTF8'')),''hex'') from public.%I t',relation.relname) into digest;
  return next 'rows '||relation.relname||' '||digest;
 end loop;
end $$;
select * from pg_temp.native_qualification_rows();
SQL
 native_qualification_snapshot() {
  psql "${psql_args[@]}" -X -Atq -f "$qualification_dir/snapshot.sql" >"$1"
 }
 native_qualification_refuse() {
  local label="$1" sql_file="$2" expected="$3"
  native_qualification_snapshot "$qualification_dir/$label-before.snapshot"
  if psql "${psql_args[@]}" -X -q -f "$sql_file" >"$qualification_dir/$label.log" 2>&1; then
   printf 'Expected native qualification refusal: %s\n' "$label" >&2; return 1
  fi
  rg -q -- "$expected" "$qualification_dir/$label.log"
  native_qualification_snapshot "$qualification_dir/$label-after.snapshot"
  cmp "$qualification_dir/$label-before.snapshot" "$qualification_dir/$label-after.snapshot"
  printf 'PASS native SQL refusal restored exact catalog and row snapshot: %s\n' "$label"
 }
 # Generate variants from the reviewed source. Drift is introduced inside its
 # transaction before the real guard; on refusal that entire transaction must
 # roll back. No replacement guard or fake lifecycle outcome is used.
 python3 - "$forward" "$inverse" "$qualification_dir" "$hash_successor" <<'PY'
from pathlib import Path
import re,sys
forward,inverse,destination,hash_successor=map(Path,sys.argv[1:])
f,i=forward.read_text(),inverse.read_text()
assert len(re.findall(r'^begin;$',f,re.M))==1 and len(re.findall(r'^begin;$',i,re.M))==1
target='public.upsert_workspace_account_binding(jsonb,text)'
def injected(source,sql):
 return re.sub(r'^begin;$',lambda _: 'begin;\n'+sql,source,count=1,flags=re.M)
def write(name,source): (destination/(name+'.sql')).write_text(source)
body_change="""do $qualification$ declare definition text; marker text:='  returning * into v_row;'; begin
 definition:=pg_get_functiondef('public.upsert_workspace_account_binding(jsonb,text)'::regprocedure);
 if strpos(definition,marker)=0 then raise exception 'native_qualification_fixture_marker_missing'; end if;
 execute replace(definition,marker,'  perform 1;'||chr(10)||marker);
end $qualification$;"""
write('forward-marker-preserved-body-drift',injected(f,body_change))
write('forward-extra-acl',injected(f,'grant execute on function '+target+' to authenticated;'))
write('forward-owner-acl',injected(f,"do $qualification$ begin execute 'revoke execute on function "+target+" from '||quote_ident(pg_get_userbyid((select relowner from pg_class where oid='public.workspace_account_bindings'::regclass))); end $qualification$;"))
write('forward-owner-drift',injected(f,'alter function '+target+' owner to authenticated;'))
write('forward-security-drift',injected(f,'alter function '+target+' security invoker;'))
write('forward-search-path-drift',injected(f,'alter function '+target+' set search_path=pg_temp,public;'))
# Refuse after the first historical writer has already been wrapped and the
# native tables/triggers have been created: explicit transaction must undo all.
late_marker="marker text := '  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || '"
assert f.count(late_marker)==1
write('forward-late-marker-refusal',f.replace(late_marker,"marker text := 'missing_marker perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || '",1))
write('inverse-extra-acl',injected(i,'grant execute on function '+target+' to authenticated;'))
for name,sql in {
 'inverse-journal-extra-column': 'alter table public.native_google_lifecycle_prior_functions add column unexpected text;',
 'inverse-journal-nullability': 'alter table public.native_google_lifecycle_prior_functions alter column prior_properties drop not null;',
 'inverse-journal-default': "alter table public.native_google_lifecycle_prior_functions alter column prior_properties set default '{}'::jsonb;",
 'inverse-journal-column-type': 'alter table public.native_google_lifecycle_prior_functions alter column applied_properties type json using applied_properties::json;',
}.items(): write(name,injected(i,sql))

write('inverse-owner-acl',injected(i,"do $qualification$ begin execute 'revoke execute on function "+target+" from '||quote_ident(pg_get_userbyid((select relowner from pg_class where oid='public.workspace_account_bindings'::regclass))); end $qualification$;"))
for name,sql in {
 'inverse-journal-owner': 'alter table public.native_google_lifecycle_prior_functions owner to authenticated;',
 'inverse-journal-rls': 'alter table public.native_google_lifecycle_prior_functions disable row level security;',
 'inverse-journal-force-rls': 'alter table public.native_google_lifecycle_prior_functions force row level security;',
 'inverse-journal-policy': 'create policy unexpected_journal_policy on public.native_google_lifecycle_prior_functions for select to authenticated using(true);',
 'inverse-journal-table-acl': 'grant select on public.native_google_lifecycle_prior_functions to authenticated;',
 'inverse-journal-column-acl': 'grant update(prior_properties) on public.native_google_lifecycle_prior_functions to service_role;',
}.items(): write(name,injected(i,sql))

# Coordinate live ACL drift with both mutable journal snapshots. The immutable
# inverse policy must refuse before restoration even when those three agree.
rebaseline_acl="""grant execute on function public.upsert_workspace_account_binding(jsonb,text) to authenticated;
update public.native_google_lifecycle_prior_functions journal set prior_properties=live_authority.properties,applied_properties=live_authority.properties
 from (select (to_jsonb(p)-array['oid','prosrc','prosqlbody'])||jsonb_build_object(
  'qualifiedSignature','public.upsert_workspace_account_binding(jsonb,text)',
  'ownerName',pg_get_userbyid(p.proowner),'languageName',l.lanname,
  'bindingTableOwner',pg_get_userbyid((select relowner from pg_class where oid='public.workspace_account_bindings'::regclass))) properties
 from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.upsert_workspace_account_binding(jsonb,text)'::regprocedure) live_authority
 where journal.signature='public.upsert_workspace_account_binding(jsonb,text)';"""
write('inverse-coordinated-acl-journal-drift',injected(i,rebaseline_acl))
write('inverse-security-drift',injected(i,'alter function '+target+' security invoker;'))
for name,sql in {
 'inverse-catalog-cost': 'alter function '+target+' cost 101;',
 'inverse-catalog-volatility': 'alter function '+target+' stable;',
 'inverse-catalog-strict': 'alter function '+target+' strict;',
 'inverse-catalog-grant-option': 'grant execute on function '+target+' to service_role with grant option;',
 'inverse-prior-properties': "update public.native_google_lifecycle_prior_functions set prior_properties=prior_properties||'{\"procost\":101}'::jsonb where signature='"+target+"';",
 'inverse-applied-properties': "update public.native_google_lifecycle_prior_functions set applied_properties=applied_properties||'{\"procost\":101}'::jsonb where signature='"+target+"';",
}.items(): write(name,injected(i,sql))

write('inverse-owner-drift',injected(i,'alter function '+target+' owner to authenticated;'))
write('inverse-search-path-drift',injected(i,'alter function '+target+' set search_path=pg_temp,public;'))
write('inverse-deleted-journal',injected(i,"delete from public.native_google_lifecycle_prior_functions where signature='"+target+"';"))
tamper="update public.native_google_lifecycle_prior_functions set definition=definition||'; select 1/0;' where signature='"+target+"';"
write('inverse-tampered-journal',injected(i,tamper))
rehash="update public.native_google_lifecycle_prior_functions set prior_definition_hash=encode(sha256(convert_to(definition,'UTF8')),'hex') where signature='"+target+"';"
write('inverse-tampered-journal-rehashed',injected(i,tamper+'\n'+rehash))
populate="""insert into public.users(id,email,verified_at) values('e7140044-0000-4000-8000-000000000001','native-qualification@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('e7140044-0000-4000-8000-000000000010','customer','Native inverse qualification','e7140044-0000-4000-8000-000000000001');
insert into public.native_google_oauth_attempts(id,workspace_id,requested_by,account_id,location_id,nonce_hash,state_hash,expected_locations,status)
values('e7140044-0000-4000-8000-000000000100','e7140044-0000-4000-8000-000000000010','e7140044-0000-4000-8000-000000000001','accounts/qualification','qualification-place',repeat('a',64),repeat('b',64),'[]'::jsonb,'pending');"""
write('inverse-populated',injected(i,populate))
# These target the extension-independent successor after the original lifecycle
# forward is reapplied. They run the real guarded source, never a fake guard.
h=hash_successor.read_text()
owner='public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)'
verifier='public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text)'
for name,sql in {
 'hash-owner-extra-acl': 'grant execute on function '+owner+' to authenticated;',
 'hash-inverse-extra-acl': 'grant execute on function '+verifier+' to authenticated;',
 'hash-owner-search-path': 'alter function '+owner+' set search_path=pg_temp,public;',
 'hash-owner-cost': 'alter function '+owner+' cost 101;',
 'hash-inverse-owner': 'alter function '+verifier+' owner to authenticated;',
}.items(): write(name,injected(h,sql))
for name,signature,marker in [('hash-owner-source',owner,'declare b public.workspace_account_bindings%rowtype;'),('hash-inverse-source',verifier,'declare binding public.workspace_account_bindings%rowtype;')]:
 sql="do $qualification$ declare definition text; begin definition:=pg_get_functiondef('"+signature+"'::regprocedure); execute replace(definition,'"+marker+"','-- source drift'||chr(10)||'"+marker+"'); end $qualification$;"
 write(name,injected(h,sql))
# A changed optional service actor default must not be blessed by source-only pins.
sql="do $qualification$ declare definition text; begin definition:=pg_get_functiondef('"+verifier+"'::regprocedure); if strpos(definition,'DEFAULT NULL::text')=0 then raise exception 'native_hash_qualification_default_marker_missing'; end if; execute replace(definition,'DEFAULT NULL::text',$default$DEFAULT 'unexpected'::text$default$); end $qualification$;"
write('hash-inverse-default',injected(h,sql))

PY
 local label
 # All inverse refusal scenarios exercise the actual current inverse guards.
 for label in inverse-journal-extra-column inverse-journal-nullability inverse-journal-default inverse-journal-column-type; do
  native_qualification_refuse "$label" "$qualification_dir/$label.sql" native_google_rollback_journal_shape_drift
 done
 for label in inverse-journal-owner inverse-journal-rls inverse-journal-force-rls inverse-journal-policy inverse-journal-table-acl inverse-journal-column-acl; do
  native_qualification_refuse "$label" "$qualification_dir/$label.sql" native_google_rollback_journal_authority_drift
 done
 for label in inverse-extra-acl inverse-owner-acl inverse-coordinated-acl-journal-drift inverse-security-drift inverse-owner-drift inverse-search-path-drift inverse-catalog-cost inverse-catalog-volatility inverse-catalog-strict inverse-catalog-grant-option; do
  native_qualification_refuse "$label" "$qualification_dir/$label.sql" 'native_google_rollback_(source|authority)_drift'
 done
 native_qualification_refuse inverse-deleted-journal "$qualification_dir/inverse-deleted-journal.sql" native_google_rollback_archive_incomplete
 for label in inverse-tampered-journal inverse-tampered-journal-rehashed inverse-prior-properties inverse-applied-properties; do
  native_qualification_refuse "$label" "$qualification_dir/$label.sql" native_google_rollback_archive_drift
 done
 native_qualification_refuse inverse-populated "$qualification_dir/inverse-populated.sql" native_google_rollback_populated_review_required
 native_qualification_snapshot "$qualification_dir/applied-before.snapshot"
 psql "${psql_args[@]}" -X -q -f "$inverse" >"$qualification_dir/empty-inverse.log" 2>&1
 native_qualification_snapshot "$qualification_dir/historical-before.snapshot"
 for label in forward-marker-preserved-body-drift forward-extra-acl forward-owner-acl forward-owner-drift forward-security-drift forward-search-path-drift; do
  native_qualification_refuse "$label" "$qualification_dir/$label.sql" 'native_google_writer_predecessor_(acl_)?drift'
 done
 native_qualification_refuse forward-late-marker-refusal "$qualification_dir/forward-late-marker-refusal.sql" native_google_binding_writer_source_changed
 psql "${psql_args[@]}" -X -q -f "$forward" >"$qualification_dir/reapply.log" 2>&1
 for label in hash-owner-extra-acl hash-inverse-extra-acl hash-owner-search-path hash-owner-cost hash-inverse-owner hash-owner-source hash-inverse-source hash-inverse-default; do
  native_qualification_refuse "$label" "$qualification_dir/$label.sql" 'native_google_hash_(predecessor|authority)_drift'
 done
 psql "${psql_args[@]}" -X -q -f "$hash_successor" >"$qualification_dir/hash-reapply.log" 2>&1
 native_qualification_snapshot "$qualification_dir/applied-after.snapshot"
 cmp "$qualification_dir/applied-before.snapshot" "$qualification_dir/applied-after.snapshot"
 psql "${psql_args[@]}" -X -q -f "$inverse" >"$qualification_dir/second-empty-inverse.log" 2>&1
 native_qualification_snapshot "$qualification_dir/historical-after.snapshot"
 cmp "$qualification_dir/historical-before.snapshot" "$qualification_dir/historical-after.snapshot"
 psql "${psql_args[@]}" -X -q -f "$forward" >"$qualification_dir/final-reapply.log" 2>&1
 psql "${psql_args[@]}" -X -q -f "$hash_successor" >"$qualification_dir/final-hash-reapply.log" 2>&1
 native_qualification_snapshot "$qualification_dir/final-applied.snapshot"
 cmp "$qualification_dir/applied-before.snapshot" "$qualification_dir/final-applied.snapshot"
 printf 'PASS empty native inverse/reapply preserved exact writer authority, catalog and rows.\n'
)
