-- Lifecycle CHECK constraints on the internal closed-set columns (Phase 0 hardening).
-- Scope is deliberate: only columns whose value domain is a CLOSED INTERNAL set. We explicitly
-- do NOT constrain tenants.subscription_status -- it mirrors Stripe's status enum (active, past_due,
-- canceled, trialing, unpaid, incomplete, paused, ...), which is external and can drift; a CHECK there
-- would reject a legitimate webhook write the day Stripe sends a status we didn't enumerate.
--
-- Verified against prod before writing: delivery_model has only {custom_repo, platform_template};
-- domain_claims currently has 0 rows. Re-confirm distinct values at apply time (post-onboarding),
-- since a value that crept in outside these sets would make the constraint fail to add.
--
-- Applied as NOT VALID so adding the constraint never blocks on a legacy row; it still enforces every
-- NEW write immediately. Run `alter table ... validate constraint ...` later once existing rows are
-- confirmed clean, to fully validate the back-catalog.

alter table tenants
  add constraint tenants_delivery_model_check
  check (delivery_model in ('custom_repo', 'platform_template')) not valid;

alter table domain_claims
  add constraint domain_claims_status_check
  check (status in ('pending', 'verified', 'misconfigured', 'conflict', 'error')) not valid;
