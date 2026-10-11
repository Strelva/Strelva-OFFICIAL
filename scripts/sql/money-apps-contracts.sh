# Sourced by fresh/upgrade rehearsals that own psql_args and cluster_data.
# Every provider profile/rate in these SQL fixtures is fictional, local and rolled back.
check_money_apps_contracts() {
  local bundle_input="$cluster_data/bundle-native-input.sql" fixture
  (cd "$repo_root" && ./node_modules/.bin/tsx scripts/system-bundle-native-fixture.ts "$bundle_input")
  for fixture in \
    payer-billing-completion-schema.sql agency-billing-receipt-terms-upgrade-schema.sql sandbox-build-evidence-schema.sql \
    provider-change-cancel-schema.sql money-apps-payer-connect-schema.sql money-export-readonly-schema.sql \
    agent-confirmed-provenance-schema.sql agent-channel-schema.sql agent-channel-abuse-schema.sql agent-booking-admission-schema.sql \
    creator-packages-schema.sql offering-source-versions-schema.sql \
    system-bundles-schema.sql system-bundles-rollback-schema.sql system-bundle-lifecycle-schema.sql system-bundle-lifecycle-rollback-schema.sql \
    recurring-responsibilities-schema.sql business-attributions-schema.sql connect-money-schema.sql money-apps-creator-quote-ledger-schema.sql ledger-attribution-schema.sql \
    system-package-readonly-schema.sql function-exposure-schema.sql payer-authority-reader-integration-schema.sql; do
    printf 'Money/apps native contract: %s\n' "$fixture"
    psql "${psql_args[@]}" --set="bundle_native_input=$bundle_input" --file="$repo_root/tests/$fixture"
  done
  node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
}
