# Studio (Wellness) Vertical — Architecture & Build Notes

**Date:** Jul 7 2026 (updated Jul 30 2026) · **Status:** design (pre-build, gated on validation — nothing in this document exists in the codebase yet) · **Scope:** the net-new studio-operations domain for the wellness edition, organized so it can either live as one vertical *or* be promoted to the whole company.

> **Current state (2026-07-30):** `src/lib/studio/` does not exist. No `studio_*` migrations have been applied. No `studio_*` tables are in the production database. The owner-dashboard Schedule/Roster/Members surfaces that are already live are backed by the existing `bookings` table and `reward_members` KV store, NOT this module. Do not confuse those live surfaces with this pre-build spec.

> **The governing principle:** build this as a **bounded module with clean seams**, not scattered across the codebase. If wellness stays one edition, it's isolated and low-risk. If it blows up and we pivot all-in, the module is already self-contained enough to become the primary app (or be extracted to its own service) without untangling it from six other verticals. We design for that optionality now, because retrofitting a boundary later is the expensive version.

---

## 1. Design principles (the rules we don't break)

1. **One bounded context.** All studio-operations logic lives under a single `studio/` module. The rest of the app imports it only through a narrow public surface (`src/lib/studio/index.ts`). Platform code must **never** reach into studio internals or studio tables directly.
2. **Studio depends on the platform, never the reverse.** Studio consumes shared primitives (auth, tenants, db client, Stripe, revalidation) through their existing public interfaces. Nothing in the core platform imports from `studio/`. This is what makes extraction possible.
3. **The extract test.** At any point we should be able to answer "yes" to: *could `studio/` be lifted into its own package/service, deleting every other vertical, and still stand?* If a change would make that "no," reconsider it.
4. **Physical data separation.** Every studio table is namespaced (`studio_` prefix, ideally a dedicated `studio` Postgres schema — see §4). This keeps the domain visually obvious, avoids collisions, and means the studio data could move to its own database if we extract.
5. **Members are their own auth lane.** Studio end-customers authenticate through the shared Supabase Auth backbone but are authorized separately — never as a 5th staff role. (See §5.)
6. **Feature-flagged, non-breaking.** The whole domain is gated behind the `"classes"` feature flag on `tenants.features[]`. A tenant without it sees zero studio surfaces. No existing tenant is affected.

---

## 2. Code organization (the "clear separate organization")

A single module spanning the layers, mirrored consistently:

```
src/lib/studio/                  # THE bounded domain — all studio-operations logic
  index.ts                       # public surface: the ONLY thing outside code may import
  types.ts                       # domain types (ClassType, Session, Member, Package, ...)
  classes/                       # class types, recurrence → sessions, capacity, waitlist
  members/                       # member accounts, member-auth authorization, profiles, waivers
  commerce/                      # packages, plans, credit ledger, Stripe Connect charge path
  db/                            # studio repositories — the ONLY place that touches studio_* tables

src/app/dashboard/(studio)/      # OWNER tabs — Schedule, Members, Packages, Roster
src/app/(member)/                # MEMBER portal routes (separate auth lane)
src/app/api/studio/              # owner + internal studio APIs
src/app/api/v1/studio/           # PUBLIC member-facing endpoints (consumed by the studio site)

src/components/studio/           # studio UI — schedule grid, reformer floor-map, member-portal UI

supabase/migrations/             # studio migrations, grouped + prefixed (e.g. NNN_studio_*.sql),
                                 # creating tables in the `studio` schema
```

**The seam rule, concretely:** anything the platform needs from studio (e.g. "does this tenant have classes," "today's session count for the Today tab") is exported from `src/lib/studio/index.ts`. Anything studio needs from the platform (current tenant, auth actor, db client, Stripe) is imported from the existing shared libs. No deep imports across the boundary in either direction. A lint rule / import-boundary check can enforce this.

---

## 3. The domain in three sub-areas

The studio module is three cooperating sub-domains. Keep them as the internal folders above.

- **Scheduling** — what's on the calendar and who's in it. (classes → sessions → bookings, capacity, waitlist, reformers.)
- **Members & accounts** — who the customers are and how they log in. (member accounts, auth lane, waivers.)
- **Commerce & entitlements** — what they buy and what it entitles them to. (packages, plans, the credit ledger, Stripe Connect.)

---

## 4. Data model (net-new tables)

All tables carry `tenant_id text references tenants(id) on delete cascade` and live in the **`studio` schema** (or `studio_` prefix if we keep one schema). Reuse the existing `reward_transactions` append-only-ledger pattern for credits (proven, has an atomic-decrement guard already).

### Scheduling

**`studio_class_types`** — a class definition (the template).
`id uuid pk · tenant_id · name · description · default_instructor_id · duration_min int · default_capacity int · reformer_based bool · recurrence rrule/jsonb · color · active bool · created_at`

**`studio_class_sessions`** — a concrete dated occurrence (generated from recurrence). This is the actual bookable thing.
`id uuid pk · tenant_id · class_type_id fk · instructor_id · starts_at timestamptz · ends_at timestamptz · capacity int · room/location · status (scheduled|cancelled|completed) · created_at`

**`studio_class_bookings`** — a member's spot in a session.
`id uuid pk · tenant_id · session_id fk · member_id fk · reformer_id fk null · status (booked|attended|late_cancel|no_show|cancelled) · paid_with (credit|plan|drop_in) · credit_txn_id null · booked_at · cancelled_at`

**`studio_waitlist_entries`** — the queue for a full session.
`id uuid pk · tenant_id · session_id fk · member_id fk · position int · created_at · promoted_at null`

**`studio_reformers`** — bookable bays/resources (numbered reformers).
`id uuid pk · tenant_id · label · sort int · active bool`

> **On `bookings` (the big one):** the existing `bookings` table is 1:1, capacity-1, free-text client. **Keep it for 1:1 privates** and add a nullable `member_id` so privates link to accounts. **Do NOT jam classes into it** — group classes are a different shape (a session with N attendees + capacity + waitlist). The `generateSlots()` availability math also changes for classes: today it treats a slot as fully occupied; classes need count-vs-capacity. So: privates keep the existing path (extended); classes get the new `class_*` path. Revisit unifying them post-V1 if it earns its keep.

### Members & accounts

**`studio_members`** — the end-customer account.
`id uuid pk · tenant_id · auth_user_id fk auth.users null (null until they claim login) · email · name · phone · status · joined_at · birthday · marketing_opt_in · notes · unique(tenant_id, email)`

**`studio_member_waivers`** — intake + signed agreements.
`id uuid pk · tenant_id · member_id fk · type · data jsonb · signed_at · ip`

> Links to the existing `reward_members` by `(tenant_id, email)` — loyalty becomes the member's rewards facet, not a parallel identity.

### Commerce & entitlements

**`studio_packages`** — the sellable product (a pack or a plan).
`id uuid pk · tenant_id · name · kind (pack|plan) · price_cents · currency · credits int null (packs) · validity_days int null (expiry) · class_scope jsonb (which class types it covers) · billing_interval (plans) · active bool`

**`studio_member_plans`** — a customer's active recurring membership. **Named `member_plans`, NOT "memberships"** — the existing `memberships` table means staff access roles; do not collide the words.
`id uuid pk · tenant_id · member_id fk · package_id fk · stripe_subscription_id (Connect) · status (active|past_due|frozen|cancelled) · started_at · renews_at · frozen_until null · cancel_at null`

**`studio_member_credits`** — append-only credit ledger (pack balances). Balance = sum of non-expired deltas.
`id uuid pk · tenant_id · member_id fk · delta int (+/-) · reason (purchase|booking|expiry|refund|admin) · source_id · expires_at null · created_at`

**`studio_purchases`** — a pack/plan purchase transaction via Stripe Connect.
`id uuid pk · tenant_id · member_id fk · package_id fk · stripe_payment_intent · amount_cents · status · created_at`

### Config

Studio settings (cancellation window, no-show fee, booking lead time, reformer count) go in a `studio_settings` row per tenant, or a `studio` key on the existing tenant config jsonb. `tenants.features[]` gains `"classes"`.

---

## 5. Member accounts + the auth lane (the critical seam)

Today auth is **staff-only**: four roles (owner/admin/editor/viewer), all of which grant control-plane/dashboard access. A studio's customer has no account.

**Design:** members authenticate through the same Supabase Auth (magic link / Google), but authorization is a **separate function** — `isStudioMember(authUserId, tenantId)` checking `studio_members`, entirely independent of the staff `CLIENT_ROLES` gate. A member session resolves to the **member portal** on the studio's site and the `/api/v1/studio/*` endpoints. It can never resolve to `app.strelva.com`.

Why this matters for the pivot: keeping member identity in `studio_members` (not bolted onto staff `users`/`memberships`) means the customer-facing system is already its own thing. If we go all-in, the member side is the product's front door and it's cleanly separable.

---

## 6. Commerce & the one rule we're breaking on purpose

Per `AGENTS.md`, the control plane deliberately owns **no customer charge** today (commerce is surfaced, not transacted). Selling a class-pack or membership means owning that charge, via **Stripe Connect** (each studio is a connected account; Strelva takes an application fee = the payments spread). This is the deliberate exception, confined to `src/lib/studio/commerce/`. Everything money-related for members lives there, behind the Connect integration, so the "no checkout" rule still holds everywhere outside the studio module.

---

## 7. The pivot-all-in path (why the boundary earns its keep)

If the niche takes off and we go all-in on wellness:

1. **Make studio the default.** Onboarding, routing, and marketing default to the wellness edition; other verticals recede. No code moves — it's config + emphasis.
2. **Extract if needed.** Because `studio/` is bounded, its tables are namespaced (`studio` schema), and member auth is its own lane, the module can be lifted into its own service/repo, and the `studio` schema split to its own database, with the seams (index.ts + shared-primitive imports) as the only rewire points.
3. **The rest becomes legacy, not a dependency.** Nothing in studio depends on the other verticals, so dropping them is subtraction, not surgery.

**What would destroy this optionality (so, forbidden):** platform code importing studio internals; studio tables dumped into `public` with no namespace; member identity hung off staff roles; commerce logic leaking outside `studio/commerce/`. Every one of these trades a week of discipline now for a month of untangling later.

---

## 8. Rollout / migration plan

- **Migrations as a grouped set** (`NNN_studio_*.sql`) creating the `studio` schema + tables. Additive only — no changes to existing tables except the nullable `bookings.member_id` and the `tenants.features[]` value.
- **Feature flag first.** Ship the schema + module dark, flip `"classes"` on for Cove (and internal test tenants) only.
- **No existing tenant touched.** GLDF, Rohlax, RHM etc. never get `"classes"`, so they never see a studio surface.
- **Cove is the canary.** Real data, real money, one studio — validate reliability (esp. the billing path) before opening to others.

---

## 9. Open decisions / risks

1. **Postgres `studio` schema vs `studio_` prefix.** Schema = cleaner separation + easier extraction; prefix = simpler, one namespace. Leaning schema. (Confirm against how the current service-role client + app-layer isolation are set up.)
2. **Unify privates + classes later?** V1 keeps `bookings` (privates) and `class_*` (classes) separate. Revisit only if the split causes real pain.
3. **Credit expiry semantics** — per-pack `validity_days`, enforced at balance calculation. Needs a clear rule (rolling vs fixed) before build.
4. **Member auth friction** — magic link is lowest-friction for studio clients; confirm the portal UX before building.
5. **Reliability bar on billing** — a silent Stripe Connect failure = a studio's revenue stops. This module needs the highest test coverage in the codebase. Non-negotiable, restating from the roadmap.

---

## Related
- GTM brief: `docs/wellness-vertical-brief.md`
- Validation script: `docs/wellness-validation-interview-script.md`
- Build-scope summary (accounts/tabs/data): artifact `5c9fa5ef-...` and vault `brain/1-projects/scaffold-web/wellness-vertical-2026-07-07.md`
