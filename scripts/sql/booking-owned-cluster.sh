#!/usr/bin/env bash
# Root explicitly seals only its freshly created, exclusively owned private
# cluster after loading original booking schema. Sealing grants no native lease.
seal_booking_settings_owned_cluster() {
  node "$repo_root/scripts/lib/booking-owned-cluster.mjs" seal \
    --receipt "$cluster_root/booking-owned-cluster.json" --data "$cluster_data" --socket "$cluster_socket" \
    --postmaster-pid "$cluster_postmaster_pid" --owner-pid "$$" -- "${psql_args[@]}"
}
verify_booking_settings_owned_cluster() {
  node "$repo_root/scripts/lib/booking-owned-cluster.mjs" verify \
    --receipt "$cluster_root/booking-owned-cluster.json" --data "$cluster_data" --socket "$cluster_socket" \
    --postmaster-pid "$cluster_postmaster_pid" --owner-pid "$$" --allowed "${1:-[]}" -- "${psql_args[@]}"
}
