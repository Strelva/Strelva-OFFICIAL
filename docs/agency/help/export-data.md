# Export your data

[Internal 1.0 draft](../README.md). The business controls its data. An agency
relationship does not make the agency the business owner.

## Current owner download

1. Sign in as the workspace owner with a confirmed email.
2. Open **People & access**, then **Export workspace data**.
3. Select **Download workspace JSON**.
4. Open the downloaded file and check that it is the workspace you intended.
   If the request fails, no successful download is established.

This button requests a limited snapshot. Its parsed contract includes supported
saved results, application releases and records, onboarding cases, economics
receipts and public website booking grants/receipts. It excludes managed-site
content, application source/artifacts, calendar connection data, inquiry/follow-up
and offering/agency records, and credentials. Uploads are references, not
embedded files. The SQL snapshot has a 2 MB limit before booking enrichment.

Known blocker: the latest website-document SQL adds fields that the current
strict export parser does not accept. A successful download against the complete
migration set is unproven. Resolve and recheck this mismatch under #479 before
using this as an onboarding completion step.

A broader schema-3 export service exists behind a separate release gate. This
button does not call it. Its owner path uses the same snapshot parser, so it
does not bypass this mismatch. Do not describe this download as a complete business
or website backup.

## Agency request at 1.0

1. Request the client's export through your agency seat. The export goes to
   the owner; your agency gets a receipt. [NOT BUILT — tracked in #295]
2. When your agency relationship ends, take the handoff export of your own
   Package definitions, without client data. [NOT BUILT — tracked in #295]

Exporting does not stop service, cancel billing, delete work or transfer ownership.
Next: [leave or change agency](./leave-or-change-agency.md).
