# Private directory rehearsal package (#311)

Prepared October 7, 2026. This is local proof preparation, not a directory
submission, a live test business, provider certification or accepted legal text.
One server: `/api/mcp/public`. Native business pages use `/biz/{handle}` because
`/b/{token}` already owns customer booking confirmation.

## Rehearsal fixture

`tests/agent-channel-schema.sql` seeds a fictional consulting business, published
page, owner/agency identities, one service and an owner-confirmed 24-hour reply
policy inside a throwaway local database. It records inquiry and quote requests,
an owner price, current agency authority and its revocation, then rolls back.
No live customer records, credentials or email are required. The gated browser
specimen `/preview/strelva/agent-oauth` uses fictional choices only; it is available
only in development with `STRELVA_UI_PREVIEW=1`.

Run the ordered schema and runtime probe:

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-agent-channel-sql.sh tests/agent-channel-schema.sql
pnpm exec vitest run src/__tests__/agent-channel-oauth.test.ts src/__tests__/agent-channel-inquiries.test.ts src/__tests__/platform-mcp.test.ts
pnpm typecheck
```

## Five positive prompts

1. Find Fixture Consulting, then show its confirmed services and policies.
2. Send my inquiry with a stable request ID, identify the assistant by name, and
   keep the opaque status token. Report receipt, without promising accepted work.
3. Request an owner-priced consulting quote for reviewing my proposal in Buffalo.
   Explain whether a confirmed reply-by clock exists; never calculate a price.
4. Read that request's status using its opaque token. After the owner approves a
   price, show the exact receipt amount, currency and terms.
5. Connect an agency assistant with `business:read` to its staffed client. Read
   that business's current context, then end the exact seat and demonstrate denial.

## Three negative prompts

1. Read another business's inquiry using the first business's status token: refused.
2. As agency staff, approve a quote or request customer contact details: refused.
3. Reuse an authorization code, omit/change `resource`, send plain PKCE, or fetch a
   metadata document pointing at localhost/private DNS: refused.

These are rehearsal instructions. Only the automated contracts listed above are
executed evidence. Directory-client compatibility remains a separate live proof.

## Demo video script

Open the fictional business page. Show only confirmed policies and the evidence
block. Find the business through the single MCP. Submit an inquiry twice with the
same request ID and show one native record and one status token. Request a quote;
show no automatic price. The owner approves one price and its immutable receipt
appears in status. Open assistant consent; show the business and exact permissions.
Attach agency context access, end the seat, and show the old token denied. Finish
with customer confirmation off: no live emails, reservations or payments occur.

## Submission stop points

Privacy, terms and support pages are owned by the marketing repository. This lane
has not reviewed or published legal copy or verified a support address. Before an
external submission, select and inspect those actual public URLs, choose one
explicitly authorized fictional live test business, authorize the exact email
scope, capture native ChatGPT/Claude/Gemini client compatibility and the video,
and obtain directory submission authorization. Never present local mocks as that
proof. `client-metadata.example.json` is a private client document example; its
example.test host must be replaced by an authorized public HTTPS metadata URL.

Primary spec: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
Resource indicators: https://www.rfc-editor.org/rfc/rfc8707
