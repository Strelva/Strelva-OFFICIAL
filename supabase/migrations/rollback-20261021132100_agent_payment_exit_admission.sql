-- Forward-only: reverting restores new-charge admission after completed exit.
do $$ begin raise exception 'agent_payment_exit_admission_forward_only'; end $$;
