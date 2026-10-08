# Super-admin access operations

Super-admin authority lives in `public.super_admins`. A row is active only when
`revoked_at is null`; the old `public.super_admin_bootstrap` email list does not
grant access after migration `20261015110000`. That migration drops the unused
list after confirming it contains only its original Jacob and Noah seed rows.
Its empty-history rollback recreates that seed set. No runtime code reads the
list.

## First operator on local, preview, or disaster recovery

Use this path after the grant migration is installed when the environment has
zero active super-admin rows:

1. Create or restore the operator's account through that environment's normal
   Supabase Auth flow and complete email verification. The Auth provisioning
   trigger mirrors the verified identity to `public.users.verified_at`. If an
   already-verified Auth account has no verified `public.users` row, stop and
   repair that provisioning mismatch through the approved Auth path; do not
   write the column directly.
2. Confirm the database is the intended local or preview environment and that
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` point to it. Keep the key in
   the local secret store; never paste it into a command, log, or document.
3. Run the CLI with an explicit reason and `--apply`:

   ```sh
   pnpm exec tsx scripts/manage-super-admin.ts bootstrap first-operator@example.test \
     --reason "Initial operator for isolated preview" --apply
   ```

   `bootstrap` calls `bootstrap_super_admin` using the service-role key. The
   database takes a transaction lock and refuses unless there are zero active
   rows. The verified target is recorded as both actor and target, with
   `via = 'service_role_key'` and `break_glass = true`. The operation is
   atomic and cannot be used to add a second operator.
4. Verify the result with `select * from public.super_admin_access_review;` and
   confirm the matching `break_glass` event in
   `public.super_admin_access_events`.

The same procedure applies to a fresh local database, a preview database, or a
disaster-recovery restore with no active operator. A nonzero active roster makes
bootstrap fail. Use an existing active, verified operator with the ordinary
grant command when one remains.

## Grant and revoke

Ordinary commands require an active, verified human actor and a verified target.
The database rechecks those requirements regardless of the CLI's preflight.
Self-grants and self-revokes are refused; revoking the final active operator is
also refused. Every successful change records the channel, actor, target, reason
and timestamp. Updates, deletes and truncates of the event table are blocked.

```sh
pnpm exec tsx scripts/manage-super-admin.ts grant person@example.test \
  --actor operator@example.test --reason "Support coverage" --apply

pnpm exec tsx scripts/manage-super-admin.ts revoke person@example.test \
  --actor operator@example.test --reason "Role ended" --apply
```

If a target has no `public.users.verified_at` value, complete the normal
Supabase email-verification and Auth provisioning flow first. If Auth already
reports the account as verified but the mirrored row is still null, stop and
repair that mismatch through the approved Auth path. Do not write the
verification column directly to bypass the gate.

## Migration and rollback boundary

Migration `20261015110000_super_admin_grants.sql` becomes one-way after the first
grant, revoke, or bootstrap event. Its rollback refuses to discard any audit
event. Before the first event, the rollback restores the prior `super_admins`
table grants, the legacy auth trigger and the two original bootstrap emails.

The forward migration deliberately stops if `super_admin_bootstrap` contains
anything beyond the original two seed rows; inspect and resolve that difference
before scheduling the migration. Noah's legacy bootstrap row is not an active
grant. After migration, confirm Noah has an active row and, if not, use the
ordinary grant command under an active operator's authority.
