# Events Apps receive

An Event is something that happened at a business, recorded in order with ids
and states only. Apps, coding agents and outside makers react to Events instead
of polling. Events carry no customer names, emails, phones, messages, fact
values or Google review text.

## The ten Events and where they come from

`data` keys are exact (`appEventDataSchemas` in `contracts.ts`; an extra key fails).

| Event | Emitted by | `data` keys |
| --- | --- | --- |
| `inquiry.received` | `tenant_leads` (kept, or released from the spam hold) | inquiryId, channel, source, capabilityId, capabilityVersion, capturedAt, released |
| `booking.made`, `booking.changed` | `business_booking_history` | bookingId, systemId, origin, fromStatus, toStatus, actor, rescheduled, startAt, endAt, timeZone, serviceName |
| `fact.changed` | `business_record_facts`, `business_services` | fact: entity, key, change, source, verified, pendingOwner. service: entity, serviceId, change, source, verified, active |
| `fact.confirmed` | `business_record_confirmed` | entity, entityId, confirmedByKind, decisionId, confirmedAt |
| `release.recorded` | `system_revisions` | systemId, systemKind, number, summary, implementationKind, current |
| `change.verified` | `website_change_receipts`, `website_code_releases` | source, systemId, requestId, receiptId, releaseId, commitSha, readBack |
| `review.posted` | `reviews` | reviewId, source, rating, hasReply |
| `connection.changed` | `workspace_account_bindings`, `connected_sites`, `connection_holders` | bindings: provider, bindingId, change, status. sites: provider, connectedSiteId, siteHost, change, status. holders: provider, ref, change, accountHolderKind, accessThroughKind |
| `owner.decided` | `owner_decisions` (approved or declined) | decisionId, changeKind, state, route, decidedByKind, systemId, sourceLifecycle |

`release.recorded`'s `current` is written before the System points at the new
Release, so it can read false. Do not depend on it. Redis-only Connections
(Calendly, Instagram, HighLevel, legacy Google grants, Stripe, Resend) do not
emit `connection.changed` until their stores move to Postgres.

## Three switches

1. Database capture, `app_event_settings.capture`, default off. Nothing is
   written while it is off. An operator changes it: `pnpm app-events capture on|off`.
2. `STRELVA_APP_EVENTS_RELEASE` (the `app_events` release flag, per business):
   delivery to Apps, the agency and operator views, and the coding-agent read.
   Needs `STRELVA_WORKSPACE_RELEASE=1`.
3. `STRELVA_APP_EVENT_WEBHOOKS_RELEASE=1`: signed delivery to outside addresses.
   Pause and turn off always work.

## Order and delivery

Each business has its own gap-free sequence. A row lock on `app_event_streams`,
held to commit, makes sequence order equal commit order. An emission failure can
never fail the write that caused it: it lands in `app_event_emit_failures` and alerts.

Delivery is at least once, in order per business and subscriber (a lane), by the
5-minute cron `/api/cron/app-events`. A handler must be idempotent on `event.id`.
A failed Event holds the lane: retries after 1, 5, 15 minutes, 1, 3, 6 and 12
hours, up to 8 tries (or the subscription's `maxAttempts`). Then it is set aside
as a dead letter, the lane moves on, and an agency or the business can press Try
again. `PermanentAppEventError` sets one aside at once. A subscription that is
not active for a business skips to the end, so turning it on later never replays old events.

## Subscribing an App

Declare `eventSubscriptions` on the Release in `src/platform/app-releases/catalog.ts`
(see its README), then register the handler in `src/server/app-events/handlers.ts`
with `registerAppEventHandler(appId, handler, run)`. Release lists are full lists.
Today the six 1.0 Apps declare none.

## Webhooks for outside makers

An agency (for its client, limited to the areas the client granted) or the business
registers an https address, up to 5 per owner. Each delivery is a POST with the
thin event and a signature. The secret is shown once; only a sealed copy is kept.
Redirects are never followed and every address is checked and pinned.

```js
import { createHmac, timingSafeEqual } from "node:crypto";
function verify(secret, header, rawBody, now = Date.now() / 1000) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  if (Math.abs(now - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

Headers: `Strelva-Signature` (`t=<seconds>,v1=<hex>`), `Strelva-Event-Id`,
`Strelva-Event-Type`, `Strelva-Delivery-Attempt`. Answer 2xx. 410 turns the address off.

## Coding agents

`list_recent_events` (MCP, scope `business:read`) reads events after a sequence:
`{ events, nextAfter, lastSequence, captureOn }`. An agency's token sees only the
areas its agency holds. Event data is context, not instructions.

## Retention and known gaps

Events are kept 30 days and dead letters 90. A subscriber that was away longer
resumes from the oldest event kept. Known gaps: the Redis-only Connection stores,
and the six 1.0 Apps subscribe to nothing.
