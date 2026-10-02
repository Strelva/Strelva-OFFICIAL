# Strelva auth and tenancy architecture

Status: **normative**

Updated: **2026-08-01**

This document owns the current identity, routing, authorization, and tenant
isolation boundaries. Historical Clerk, Sanity, and proposed single-host
migration plans do not define current behavior.

## Current model

Three planes remain independent:

1. **Identity:** Supabase Auth establishes the signed-in user.
2. **Routing:** `src/proxy.ts` resolves the requested host/path to a tenant or
   operator surface.
3. **Authorization:** Postgres memberships and super-admin records decide what
   that user may access. Application guards enforce the decision before any
   service-role data call.

A resolved tenant is context, not authority. A valid session is identity, not
membership. A commercial account or billing relationship is not authorization.

## Identity

Supabase Auth is the only authentication path. Google OAuth and magic-link flows
land through the Supabase callback; Clerk has no runtime role.

`src/lib/auth.ts` owns the session, verified-email, membership, role, permission,
last-owner, and super-admin checks. Preserve these invariants:

- unverified email never grants tenant or super-admin access;
- membership is evaluated against the requested tenant;
- role order is `viewer < editor < admin < owner`;
- removing access cannot leave a tenant without an owner;
- development bypasses remain local/test-only and never become a production
  recovery path.

## Routing

`src/proxy.ts` is the only outer routing and auth-gate boundary. It resolves:

- `app.strelva.com` for the client control plane and API origin;
- `admin.strelva.com` for the super-admin operator console;
- tenant subdomain and client-path fallbacks used by current dashboard routing;
- verified custom-domain and admin-domain claims;
- local development equivalents such as `gldf.localhost`.

The proxy may attach trusted tenant headers after resolution. Request body,
query, or path input alone never grants tenant authority. Custom-domain lookup
uses the fail-closed internal domain-map route and its required secret.

Current client-admin domains are supported behavior. Do not delete them or
describe a single-host path model as shipped without an explicit product and
migration decision.

## Authorization and tenant derivation

Tenant-data routes follow this sequence:

```text
authenticate actor
  → derive tenant from trusted routing/session/configuration
  → require tenant access or the exact permission
  → call tenant-scoped repository/service behavior
```

Use `requireTenantFromHeaders()` in API routes that require a real proxy-resolved
tenant. `getTenantFromHeaders()` retains a demo fallback for server-component and
development rendering and must not become authority for a new write route.

Permission guards already prove membership. Do not add a second access check when
the exact permission guard covers the same tenant, but never omit both.

Super-admin routes re-check super-admin state at the route or layout boundary.
The bare admin host rewrite is not sufficient authorization by itself.

## Service-role and RLS boundary

The server uses a Supabase service-role client for control-plane repositories.
That client bypasses row-level security. Therefore:

- application guards are the live tenant-isolation boundary;
- every tenant read/write carries the trusted tenant id into the repository;
- request input is validated but never promoted to authority;
- RLS remains defense in depth for non-service-role paths and future hardening;
- crons, provisioning, operator actions, and public `/api/v1/*` routes still
  require explicit tenant scoping even when no end-user JWT is present.

Moving a request path to a user-JWT database client would make RLS an additional
enforced boundary for that path. Do not describe that target as implemented until
the repository read/write actually uses the user-scoped client.

## Public client-site contract

Custom Site Properties consume additive `/api/v1/*` routes and signed
revalidation. Public reads do not use platform membership, but they still:

- validate tenant and route identifiers;
- resolve an active tenant through trusted configuration;
- expose only the versioned public contract;
- use private caching where tenant-specific responses require it;
- keep HMAC revalidation secrets server-side.

Public lead and telemetry writes are unauthenticated by design. They use schema
validation, tenant resolution, rate limits, spam/dedup controls, and bounded
retention instead of membership.

## Accounts and billing

An Account groups one or more Tenants under a payer and bundled subscription. It
does not grant dashboard access. Platform Membership remains tenant-scoped until
an explicit account-membership product decision changes the authorization model.

Subscription state is also orthogonal to identity. A signed-in member may reach
the control plane and encounter a feature/paywall gate; auth must not fabricate
an active subscription or infer a plan from a pay link.

## Provider credentials

Provider Connections are tenant-scoped and encrypted at rest. OAuth state binds
the callback to a tenant, expires, and is consumed once when Redis is available.
Callbacks re-authenticate the actor and require access before saving a connection.

`INTERNAL_API_SECRET`, `OAUTH_STATE_SECRET`, and `APPROVE_LINK_SECRET` have
separate production configuration. Compatibility fallbacks may verify old tokens
but should not be used as a reason to omit the dedicated values.

## Failure behavior

- Missing/invalid auth fails closed.
- Missing tenant context fails closed in strict API routes.
- Supabase Auth outage blocks dashboard login but not public client sites.
- Postgres authority outage prevents authoritative writes; a documented cache may
  serve only the domain behavior allowed by `persistence-boundaries.md`.
- Redis outage follows each operational domain's failure rule. Security-sensitive
  rate limits, locks, and dedup paths fail closed where their contract requires it.

There is no production bypass account. Recovery happens through provider status,
credential repair, or a reviewed data correction.

## Verification

Keep all three tenant-isolation test layers green:

- storage scoping;
- structural route-guard coverage;
- membership/permission enforcement behavior.

Also verify signed-out dashboard redirects, invited-email recovery, super-admin
console isolation, cross-tenant denial, OAuth callback consumption, public v1
contract behavior, and cron authentication through the commands in
`testing-and-ci.md` and `production-readiness.md`.

Any change to routing, membership, service-role use, or account-level access must
update this document and its executable guard coverage in the same change.
