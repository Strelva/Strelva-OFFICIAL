-- Forward-only: reverting restores the receipt JSON operator-precedence bug.
do $$ begin raise exception 'native_google_recovery_receipt_grouping_forward_only'; end $$;
