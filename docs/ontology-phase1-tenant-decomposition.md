# Ontology Phase 1 — Tenant decomposition (additive foundation)

`TenantConfig` (`src/lib/types.ts`) is the historical ~50-field monolith every
consumer reads today — identity, business profile, site/delivery config, billing,
and automation knobs all flattened into one interface. This increment decomposes it
into four typed sub-models plus a container, and adds a **lossless projection**
between the two.

This step is **purely additive**. Nothing is removed, no consumer is rewritten, no
mapper (`rowToTenant`/`tenantToRow`) or DB column changes. `TenantConfig` stays the
compatibility read-projection so consumers can migrate onto the sub-models one at a
time. What is NOT done here is listed at the bottom.

## New files

| File | Role |
|------|------|
| `src/lib/tenant/models.ts` | The four sub-models (`TenantIdentity`, `BusinessProfile`, `SiteConfig`, `CommercialSnapshot`, `AutomationPolicy`) + the `DecomposedTenant` container. Every field reuses its exact type + optionality from `TenantConfig`. |
| `src/lib/tenant/projection.ts` | `composeTenantConfig` / `decomposeTenantConfig` — the lossless bridge. |
| `src/__tests__/tenant-projection.test.ts` | Round-trip guarantee: full fixture + sparse fixture + disjoint/complete key coverage. |

## Field → model map

Every `TenantConfig` field is assigned to exactly one sub-model (disjoint + complete
— asserted by a test).

### `TenantIdentity` — the stable spine
| Field | Type |
|-------|------|
| `id` | `string` |
| `subdomain` | `string` |
| `siteName` | `string` |
| `createdAt` | `string` |
| `updatedAt` | `string?` |
| `active` | `boolean` |

### `BusinessProfile` — who the business is
| Field | Type |
|-------|------|
| `ownerName` | `string` |
| `ownerEmail` | `string?` |
| `ownerPhone` | `string?` |
| `industry` | `string` |
| `businessHours` | `BusinessHours?` |
| `branding` | `TenantConfig["branding"]?` (inline object) |
| `personality` | `string?` |
| `businessRules` | `string?` |
| `socialConfig` | `TenantConfig["socialConfig"]?` (inline object) |
| `reviewsConfig` | `TenantConfig["reviewsConfig"]?` (inline object) |
| `referredBy` | `string?` |

### `SiteConfig` — how the site is built + served
| Field | Type |
|-------|------|
| `template` | `TemplateId` |
| `deliveryModel` | `TenantDeliveryModel?` |
| `customRepo` | `CustomRepoMetadata?` |
| `siteCapabilities` | `Partial<SiteCapabilityManifest>?` |
| `features` | `TenantFeature[]?` |
| `integrations` | `IntegrationProvider[]?` |
| `customDomains` | `string[]?` |
| `domainClaims` | `DomainClaim[]?` |
| `productionDomain` | `string?` |
| `adminDomain` | `string?` |
| `siteUrl` | `string?` |
| `revalidateUrl` | `string?` |
| `revalidationSecret` | `string?` |
| `resendDomain` | `string?` |
| `visibility` | `TenantVisibilityConfig?` |

### `CommercialSnapshot` — the money
| Field | Type |
|-------|------|
| `stripeCustomerId` | `string?` |
| `stripeSubscriptionId` | `string?` |
| `subscriptionStatus` | `TenantConfig["subscriptionStatus"]?` (local union) |
| `subscriptionStartedAt` | `string?` |
| `subscriptionPastDueSince` | `string?` |
| `commitmentEndsAt` | `string?` |
| `planOverride` | `TenantConfig["planOverride"]?` (local union) |
| `subscriptionPlan` | `CommercialPlanKey?` |
| `planMonthlyCents` | `number?` |
| `planCurrency` | `string?` |

### `AutomationPolicy` — automation + integration knobs
| Field | Type |
|-------|------|
| `autoPublish` | `boolean?` |
| `autoApproveThreshold` | `number \| null?` |
| `bookingProvider` | `string?` |
| `bookingUrl` | `string?` |
| `beholdFeedId` | `string?` |
| `slackWebhookUrl` | `string?` |
| `googleSearchConsoleKey` | `string?` |
| `instagramAccessToken` | `string?` |

## Projection approach

- **`decomposeTenantConfig(tc)`** destructures the `TenantConfig` and buckets each
  field into its sub-model, returning `{ identity, profile, site, commercial, policy }`.
- **`composeTenantConfig(parts)`** spreads the four sub-models back into a single
  `TenantConfig`. Because the buckets are disjoint, the spread has no key collisions.
- **Losslessness:** `composeTenantConfig(decomposeTenantConfig(tc))` deep-equals `tc`
  for any `TenantConfig`. Proven by `tenant-projection.test.ts` with a fully-populated
  fixture (every field set) and a sparse fixture (only required fields), plus a
  disjoint-and-complete key-coverage assertion.
- **Type exactness:** fields with a named nested type import it directly
  (`CustomRepoMetadata`, `BusinessHours`, `DomainClaim`, …); fields whose type is an
  inline object or a local union on the interface (`branding`, `socialConfig`,
  `reviewsConfig`, `subscriptionStatus`, `planOverride`) are referenced via indexed
  access (`TenantConfig["field"]`) rather than redefined, so a change to `types.ts`
  can never silently drift the sub-model.

## Incremental migration plan (later increments)

The projection is the bridge that makes the migration incremental and reversible:

1. **Now (this increment):** sub-models + projection exist and are proven lossless.
   `TenantConfig` is unchanged and remains the shape every consumer reads/writes.
2. **Read-side migration (per consumer):** a consumer that only needs one slice
   (e.g. a billing surface needing `CommercialSnapshot`) calls
   `decomposeTenantConfig(tc).commercial` and depends on the narrow sub-model instead
   of the whole `TenantConfig`. Move consumers one at a time; each is an isolated,
   revertible change. `TenantConfig` stays the source, so an un-migrated consumer is
   unaffected.
3. **Mapper migration:** once a critical mass of consumers reads sub-models, teach the
   Postgres mapper to build the sub-models directly (or produce `DecomposedTenant`),
   with `composeTenantConfig` still emitting a `TenantConfig` for the remaining
   flat-shape consumers.
4. **Write-side migration:** route writes through the sub-models + `composeTenantConfig`
   → `tenantToRow`, so a partial update targets one sub-model.
5. **DB decomposition (optional, separate):** if warranted, split the 45-column
   `tenants` row to mirror the sub-models. Independent from the type work above.
6. **Phase 6 — remove the projection:** when the last consumer is off `TenantConfig`,
   delete `TenantConfig` (or reduce it to an alias) and retire `composeTenantConfig`.

At every step both shapes coexist and the projection keeps them in sync, so no
step is a big-bang cutover.

## Explicitly NOT done in this increment

- **Consumer migration** — no consumer reads the sub-models yet; every one still uses
  `TenantConfig`.
- **DB / schema decomposition** — the `tenants` table is still 45 flat columns;
  `rowToTenant`/`tenantToRow` are untouched.
- **Stable-id resolution** — `TenantIdentity` carries `id`/`subdomain` as they exist
  today (there is no `stableId` field on `TenantConfig` yet); introducing a stable
  identity key is separate future work.
- **No behavior change** — this is types + a pure projection + a test. No runtime path,
  cache, API contract, or persisted shape changes.
