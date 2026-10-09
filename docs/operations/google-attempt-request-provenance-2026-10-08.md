# Google dispatch attempt request provenance — 2026-10-08

Objective: resolve the native schema deletion coverage failure naming `operator_google_write_attempts.request` without purging business-authored instructions or losing accepted/uncertain provider history. Read-only audit used the coordinator's actual integration source; no root source, native database, provider, or production changes.

Observed producer contract:

| Write kind | Persisted attempt request | Provider-fed data stored elsewhere |
| --- | --- | --- |
| `gbp_hours` | `regularHours` / `specialHours` selected from approved input | Google hours GET response is `beforeState` on the receipt, not request |
| `gbp_post` | constant language/topic, approved summary, optional approved CTA URL and photo source URL | Google response name and readback are receipt/result fields |
| `gbp_photo` | photo format, approved source URL and category | Google response name and readback are receipt/result fields |
| `review_reply` | exactly `{reviewId, reply: replyText}` | `getReply` before-state fetched after reservation, passed separately to receipt |

Source owners: `src/lib/gbp-management.ts` `receiptedGoogleWrite` builds the outbound command body and reserves it before sending; `src/lib/gbp-replies.ts` `publishReceiptedReply` reserves only review target and authored reply. `src/lib/agent/gbp-operations.ts` constructs approved drafts from business hours, post summary/URLs and photo inputs. `src/platform/operator-queue/store.ts` forwards these commands. `supabase/migrations/20261010161300_review_reply_reservations.sql` admits only object requests, then checks exact stored request equality with tenant/write kind before reuse; pending/accepted attempts block resend, rejected attempts may obtain a fresh reservation. No raw API reviewer/comment/location response is observed in these request producers.

Conclusion: the implemented attempt request is customer-command history, separate from API-fed before/readback receipt payload. The independent 1007 `google_listing_receipt_payloads` purge does not cover this table and must not be claimed as its retention owner. Blanket 29-day attempt request removal would discard authored instructions and undermine conflict/dedup/reconciliation. The deletion-coverage registry must identify its actual durable command-history owner and tenant teardown behavior, with provider-content qualification remaining open; this dated audit does not itself adopt a policy exception or authorize changed production retention.

Limits: the service-only native RPC accepts any JSON object, so producer evidence does not prove arbitrary caller input is customer-authored. `reviewId` is a provider identifier; authored reply/summary/URLs may reproduce API-derived information. Broader Google commercial-use/storage rules for identifiers, quoted/generated content, reconciliation history, before-state receipts and external operating policy remain unverified. Acceptance/uncertainty history must remain durable under any future sanitization; a provider-cache payload must use explicit provenance and original expiry rather than automatically relabelling unknown content. No native or policy-compliance claim follows from this source audit.

Next action: coordinator/enterprise reconcile the deletion coverage owner against this producer contract and existing tenant teardown, then rerun their native schema coverage in their authorized window. If a new actual producer stores API-fed content inside request, isolate that field with explicit provenance/expiry while preserving request identity and settlement history; do not apply a blanket authored-history purge.
