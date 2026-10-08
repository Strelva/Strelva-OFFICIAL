#!/usr/bin/env bash
# Ordered local SQL and forward/rollback qualification for #494/#495. Never
# reads production configuration or sends a provider request.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-content-version-authority strelva-cv-auth
cluster_port="$((58000 + ($$ % 2000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
migration_count=0
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2
    cat "$cluster_root/migration.log" >&2
    exit 1
  fi
  migration_count=$((migration_count+1))
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/operator-content-receipts-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/content-publication-authority-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-native-applications.sql" >/dev/null
catalog="select p.oid::regprocedure::text,p.oid,p.proowner,coalesce(p.proacl,acldefault('f',p.proowner))::text,md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by p.oid::regprocedure::text"
psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/before.catalog"
# Refuse introduced-writer function/configuration and ACL drift atomically.
for probe in body acl; do
  if [[ "$probe" == body ]]; then
    psql "${psql_args[@]}" -c "alter function public.write_content_as_actor(text,text,jsonb,uuid,text) set work_mem='12MB'" >/dev/null
  else
    psql "${psql_args[@]}" -c "revoke execute on function public.write_content_as_actor(text,text,jsonb,uuid,text) from service_role" >/dev/null
  fi
  psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/drift-before.catalog"
  if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020110000_content_publication_authority.sql" >"$cluster_root/drift-refusal.log" 2>&1; then
    printf 'Content rollback accepted introduced-writer %s drift.\n' "$probe" >&2; exit 1
  fi
  rg -Fq 'rollback_wrong_order_or_function_drift: actor content publication' "$cluster_root/drift-refusal.log"
  psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/drift-after.catalog"
  cmp "$cluster_root/drift-before.catalog" "$cluster_root/drift-after.catalog"
  if [[ "$probe" == body ]]; then
    psql "${psql_args[@]}" -c "alter function public.write_content_as_actor(text,text,jsonb,uuid,text) reset work_mem" >/dev/null
  else
    psql "${psql_args[@]}" -c "grant execute on function public.write_content_as_actor(text,text,jsonb,uuid,text) to service_role" >/dev/null
  fi
done
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020112000_version_live_owner_authority.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020110000_content_publication_authority.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020110000_content_publication_authority.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020112000_version_live_owner_authority.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/after.catalog"
# Only the intentionally dropped/recreated writer can acquire a new OID.
# Every other function retains its exact OID, owner, ACL and definition.
awk -F '|' 'BEGIN { OFS="|" } /^write_content_as_actor\(/ { $2="recreated" } { print }' "$cluster_root/before.catalog" >"$cluster_root/before.semantic"
awk -F '|' 'BEGIN { OFS="|" } /^write_content_as_actor\(/ { $2="recreated" } { print }' "$cluster_root/after.catalog" >"$cluster_root/after.semantic"
cmp "$cluster_root/before.semantic" "$cluster_root/after.semantic"
psql "${psql_args[@]}" --file="$repo_root/tests/content-publication-authority-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-native-applications.sql" >/dev/null
# Commit only fictional fixtures in this owned local cluster, then prove that
# concurrent verified_at revocation waits behind an accepted effect transaction.
psql "${psql_args[@]}" --set=cp_keep_fixture=true --file="$repo_root/tests/content-publication-authority-schema.sql" >/dev/null
psql "${psql_args[@]}" --set=native_authority_lock_fixture=true --file="$repo_root/tests/w6-version-native-applications.sql" >/dev/null
cat >"$cluster_root/content-lock.sql" <<SQL
begin;
set local role service_role;
select public.write_content_as_actor('cp-fixture','hero','{"headline":"Fictional locked owner effect"}','ca495000-0000-4000-8000-000000000001','cp-owner@example.test');
\! touch '$cluster_root/content.locked'
select pg_sleep(3);
rollback;
SQL
cat >"$cluster_root/version-lock.sql" <<SQL
begin;
set local role service_role;
do \$\$ declare v jsonb; next_release jsonb; begin
  v:=public.read_system_version('bc630000-0000-4000-8000-000000000003','version-stranger@example.test',:'fixture_version_id');
  next_release:=jsonb_build_object('number',1,'definition',v->'baseline'->'definition','baselineRevision',1,'overridePaths','[]'::jsonb,'releasedBy','bc630000-0000-4000-8000-000000000003','releasedAt',now());
  perform public.save_system_version('bc630000-0000-4000-8000-000000000003','version-stranger@example.test',(v->>'id')::uuid,1,jsonb_set(jsonb_set(v,'{releases}',jsonb_build_array(next_release)),'{currentRelease}','1'));
end \$\$;
\! touch '$cluster_root/version.locked'
select pg_sleep(3);
rollback;
SQL
# psql variables do not substitute inside dollar-quoted bodies. Bind the UUID
# by substituting only the validated fictional UUID into this private statement.
version_id="$(psql "${psql_args[@]}" -Atc "select id from public.system_versions where business_workspace_id='bc630000-0000-4000-8000-000000000011'")"
[[ "$version_id" =~ ^[0-9a-f-]{36}$ ]] || { printf 'Native race fixture missing.\n' >&2; exit 1; }
sed -i '' "s/:'fixture_version_id'/'$version_id'/" "$cluster_root/version-lock.sql"
for effect in content version; do
  psql "${psql_args[@]}" --file="$cluster_root/$effect-lock.sql" >"$cluster_root/$effect-lock.log" 2>&1 &
  effect_pid=$!
  for _ in $(seq 1 50); do [[ -f "$cluster_root/$effect.locked" ]] && break; sleep 0.1; done
  [[ -f "$cluster_root/$effect.locked" ]] || { cat "$cluster_root/$effect-lock.log" >&2; wait "$effect_pid" || true; exit 1; }
  if [[ "$effect" == content ]]; then
    actors=(ca495000-0000-4000-8000-000000000001)
  else
    actors=(bc630000-0000-4000-8000-000000000002 bc630000-0000-4000-8000-000000000003)
  fi
  for actor in "${actors[@]}"; do
    if psql "${psql_args[@]}" -c "set lock_timeout='200ms'; update public.users set verified_at=null where id='$actor'" >"$cluster_root/revocation-probe.log" 2>&1; then
      printf '%s verification was revocable during its accepted effect.\n' "$effect" >&2; exit 1
    fi
    rg -Fq 'canceling statement due to lock timeout' "$cluster_root/revocation-probe.log"
    if [[ "$effect" == content ]]; then business=ca495000-0000-4000-8000-000000000010; else business=bc630000-0000-4000-8000-000000000011; fi
    if psql "${psql_args[@]}" -c "set lock_timeout='200ms'; update public.workspace_memberships set role='admin' where workspace_id='$business' and user_id='$actor'" >"$cluster_root/role-probe.log" 2>&1; then
      printf '%s owner role was revocable during its accepted effect.\n' "$effect" >&2; exit 1
    fi
    rg -Fq 'canceling statement due to lock timeout' "$cluster_root/role-probe.log"
  done
  wait "$effect_pid"
done
psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/output-before.catalog"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020110000_content_publication_authority.sql" >"$cluster_root/output-refusal.log" 2>&1; then
  printf 'Content rollback removed issued attribution.\n' >&2; exit 1
fi
rg -Fq 'rollback_content_publication_has_outputs' "$cluster_root/output-refusal.log"
psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/output-after.catalog"
cmp "$cluster_root/output-before.catalog" "$cluster_root/output-after.catalog"
printf 'Content/Version authority passed: %s ordered migrations, native denials/owner/provider paths, unchanged history, exact rollback/reapply catalog, introduced-writer drift refusal and concurrent verification revocation exclusion.\n' "$migration_count"
