# The hand-built historical workspace fixture kept these product migrations
# in separate proof clusters. Current access-review and enterprise contracts
# need their real schema in the SAME database. Apply only once, after the old
# catalog/inverse checks and before service-boundary/current-tail successors.
apply_historical_current_predecessors() {
  local migration
  for migration in \
    20260908150000_enterprise_customers.sql \
    20260921220000_customer_business_entry.sql \
    20261011170000_agency_prospects.sql \
    20261015100000_agency_add_client.sql \
    20261015111000_website_owner_agency_publish.sql; do
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$migration"
  done
}
check_historical_current_predecessors() {
  psql "${psql_args[@]}" --file="$repo_root/tests/support/historical-current-predecessors.sql"
}
