# Connections

Every outside account a business's Systems read from or act on, with whose
account it is and whose provider access carries it
([ADR 0016](../../../../docs/adr/0016-connections-name-whose-account-and-whose-access.md)).

- `contracts.ts`: the shared shapes. `accountHolder` is whose login was
  connected; `accessThrough` is whose approved provider app or project carries
  the calls.
- `providers.ts`: what each provider reads and acts on, its business area, and
  who may hold its account or access.
- `eligibility.ts`: platform access serves every business; an agency's own
  access serves only that agency's clients with the area grant, while that
  agency acts. Strelva Agency is checked like any agency.

Each product that stores outside accounts implements a `ConnectionSource`
next to its own store. The read model composes them; there is no shared table
of every account. A Connection never grants authority by itself.

## Core composition (ADR 0016)

`access.ts` reads only the two per-provider access/approval settings. Google
Business Profile defaults to unknown/none; other providers retain platform /
not_required. Explicit malformed values fail closed. No named-agency setting
participates in eligibility.

`server.ts` authorizes a verified workspace member or a currently staffed
provider seat before reading holders or sources. Direct membership takes
precedence and acts as the business. Area grants come from active
`agency_scope_grants` (`prepare` or `full_control`) with an active seat;
proposals and ended grants do not count. Readers work without writer locks.
The workspace route retains `STRELVA_WORKSPACE_RELEASE`'s existing gate.

`holders.ts` records metadata through service-role-only definer RPCs. Ref and
command replay are serialized; a reused command with a different payload,
digest or actor conflicts. Reconnect uses a new command id. Scope and current
agency authority are checked again even on replay. No credentials enter this
table. Missing refs are overlaid as unknown by the read model, never platform.

### Wiring product sources (integration lane)

Each product exports a `ConnectionSource` object or factory from its own module.
Its imports must not register sources. At the server composition root, explicitly
call `registerConnectionSource(source)` for each chosen object once, before
`listWorkspaceConnections`. Registration is idempotent by object identity and
returns a cleanup function for tests. `listConnectionSources()` takes a snapshot.
The core registry intentionally imports no products. The integration lane owns
the final explicit source list and production entry-point initialization.

Refs use `<ConnectionProvider>:<source row id>`, including `highlevel:` rather
than the storage provider's `gohighlevel` name. Sources return contract-valid
workspace rows and must not emit secrets. Their holder fields are ignored and
overlaid from recorded metadata. Set `systemIds` from known usage, or `[]` when
unknown. A failed/malformed/out-of-scope source contributes no rows and adds its
provider to `sourceErrors`; healthy sources remain visible.

`composeWorkspaceConnections` returns `{ connections, sourceErrors }` (the
brief's prose array signature cannot carry `sourceErrors`). It supports an
optional eligibility callback; the server supplies the acting agency and account
holder checks. Unknown holders and changed provider access need reconnection;
ineligible rows are unavailable. Stored account-holder metadata alone grants no
permission and no provider access.

### Versions

The holder table scopes every new provider ref to one business. A Version may
bind that business's account or an account held by its currently acting agency
with the provider's area; source and sibling refs still resolve to their own
business and are refused. SQL rechecks current actor/area/seat authority and
locks it during binding writes. The Supabase adapter additionally checks current
deployment provider eligibility and matching recorded access on every binding
write. SQL cannot read deployment environment settings. Existing `calendar:`
and `tenant:` ownership checks keep their prior behavior; new refs without
holder metadata are refused.

Migration `20261026100000_conn_core_holders.sql` is held and unapplied. Its
inverse refuses retained holders, changed function definitions/ACLs or later
callers. The coordinator must execute `bash scripts/check-conn-core-sql.sh`
with local Postgres binaries before qualifying SQL behavior. It creates only a
throwaway local cluster. No production action is authorized.

### Source identity and service rows

Holder recording verifies the source's workspace before accepting metadata;
Versions additionally require the live source state and hold source/authority
rows through the binding transaction. Supported canonical refs match the product
lanes: Google binding/location UUIDs; `google_business_profile:read-grant:<workspaceId>`;
Google calendar UUIDs; HighLevel UUIDs; connected-site UUIDs; tenant stable UUIDs
for Calendly/Instagram; `stripe:<workspaceId>:<generation>`; `resend:<workspaceId>`.
Stripe ownership can be recorded during pending onboarding; binding requires the
current generation's ready configured account. Old generations never bind.

Calendly/Instagram can record ownership against the current tenant/workspace
link after OAuth even while legacy storage uses Redis. Binding a Version requires
a current connected Postgres `provider_connections` witness; Redis-only accounts
remain unqualified for that binding until the existing durable mirror is present.
This does not enable or change persistence flags.

`resend:<workspaceId>` is the one synthetic platform-service row: when its source
explicitly attests platform/platform, the read model preserves that identity and
the source's current sending-policy state. It has no customer login to reconnect.
This exception never classifies an old credential or another provider as platform;
all unrecorded account connections remain unknown. The source still owns email
policy and no source-state check proves that mail was sent or delivered.

An actor with several staffed seats uses the agency named by the provider access
or account, only if that agency is among the verified current seats. The code
never selects an agency by UUID ordering. Direct business membership still wins.
Optional DB arguments on the server eligibility, area and holder readers keep an
injected Versions adapter on the same database throughout a command.
