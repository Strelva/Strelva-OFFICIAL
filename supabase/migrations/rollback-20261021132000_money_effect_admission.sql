-- No downgrade to the stale admission/quote-clock implementation is safe.
-- Preserve provider observations and immutable receipts; use a reviewed successor.
do $$ begin raise exception 'money_effect_admission_forward_only'; end $$;
