# Sourced only after the historical agency inverse and 210960 successor.
# The caller owns one disposable PostgreSQL cluster and psql_args.
check_full_model_current_tail() {
  local fixture schema_owner="${1:?Choose focused-workspace or historical-upgrade explicitly}"
  case "$schema_owner" in focused-workspace|historical-upgrade) ;; *) printf 'Unknown full-model schema owner: %s\n' "$schema_owner" >&2; return 1;; esac
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100000_investigation_paged_history.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100100_order_external_identity.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100200_google_receipt_key_read.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100300_investigation_history_export.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100400_google_make_real_flag.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100500_google_grant_generation.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100600_google_receipt_intent.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100700_google_provider_payload_retention.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100800_tenant_connection_generation.sql"
  if [[ "$schema_owner" == historical-upgrade ]]; then
    psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-upgrade-before.sql"
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021100900_google_review_content_retention.sql"
    psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-upgrade-after.sql"
  else
    printf 'Review retention migration and ALL upgrade/schema assertions require the full-schema owner; focused command requires check-guarded-teardown-fresh.sh before success.\n'
  fi
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021101000_google_make_real_service_authority.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021110000_enterprise_units.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021111000_enterprise_standards.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021112000_home_finder_native.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021112100_enterprise_home_finder_portability.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021112200_home_finder_configuration.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021130000_agent_payment_attempt_readback.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021130100_custom_sandbox_runtime_qualification.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021131000_agent_oauth_connection_context.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/agent-oauth-connection-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021131100_agent_oauth_renewable.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/agent-oauth-renewable-rollback-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/agent-oauth-renewable-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021131200_agent_website_tools.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021132000_money_effect_admission.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021132100_agent_payment_exit_admission.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021140000_native_google_lifecycle.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021140100_native_google_hash_portability.sql"
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/native-google-hash-portability-contract.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021140200_native_google_recovery_receipt_grouping.sql"
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/native-google-recovery-receipt-grouping-contract.sql"
  for fixture in \
    runtime-data-investigation-history.sql runtime-data-client-authority.sql runtime-data-migration-atomicity.sql \
    runtime-data-google-grant-generation.sql runtime-data-google-receipt-intent.sql runtime-data-google-provider-retention.sql runtime-data-tenant-connection-generation.sql runtime-data-google-service-authority.sql native-google-hash-portability-schema.sql native-google-lifecycle-schema.sql native-google-recovery-receipt-grouping-schema.sql native-google-completed-undo-schema.sql google-provider-reference-native.sql money-effect-admission-schema.sql \
    enterprise-home-finder-schema.sql agent-payment-attempt-schema.sql \
    custom-sandbox-runtime-schema.sql agent-website-tools-schema.sql; do
    printf "Full-model native contract: %s\n" "$fixture"
    psql "${psql_args[@]}" --file="$repo_root/tests/$fixture"
  done
  if [[ "$schema_owner" == historical-upgrade ]]; then
    psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-schema.sql"
  fi
}
