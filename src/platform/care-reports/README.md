# Care plan reports

The built-in App an agency uses to send each client a monthly report of the
work it did, under the agency's own name. It is declared in
`src/platform/app-releases/catalog.ts` as `care_reports` and stays off unless
`STRELVA_WORKSPACE_RELEASE=1` and the `care_reports` workspace flag
(`STRELVA_CARE_REPORTS_RELEASE`) are on.

## What is in a report

Every figure comes from a record only Strelva holds, read in Postgres by
`care_report_facts` (`20261028100400_care_reports.sql`):

- numbered Releases on the client's Systems, each with its read-back;
- Requests the business accepted as done, and website changes confirmed live;
- inquiries and bookings from `business_outcome_month`;
- hosted-site health rows and recorded site checks;
- the count of Strelva assistant runs (a count, never a price);
- minutes the agency recorded in `agency_client_time_entries`.

A line reads "Not checked on the live site" or "unavailable" rather than guess.

## What "Checked on the live site" means

A Release is checked when Postgres holds a read-back for it:

- `deploy:` Releases: a `website_change_receipts` row with `read_back = confirmed`;
- `code:` Releases: a `website_code_releases` row with `read_back = confirmed`;
- hosted website documents: a healthy `website_document_health` row on or after
  the Release.

Content and baseline Releases carry no read-back and read "Not checked". The App
does not subscribe to Events. It claims no uptime: site check lines end with
"These are recorded checks, not continuous uptime."

## Releases of a report

An agency edits a draft (its note), then publishes. Each publish is a numbered,
append-only Release of the report ("October 2026 report · Release 2"). The owner
sees Releases only, never the draft, the note in progress or delivery history.

## Sharing

- Signed in: the owner opens `/workspace/care-reports/<id>`.
- Link: `/care-reports/<token>`, read-only, unguessable, revocable, one open link
  per report, only the hash stored. Off unless `STRELVA_CARE_REPORT_SHARE_LINKS=1`.
  It stops reading when the client's seat ends.
- Email: built and held (`delivery.ts`). It sends only when
  `STRELVA_CARE_REPORT_EMAIL=1` and `EMAIL_SENDING_ENABLED=true`, the owner
  address is the business's trusted one, and `owner_contact_staff_reason` says it
  is not a staff address. Every other case is recorded as suppressed with a reason
  and the page says so (`CARE_DELIVERY_COPY`). A Release is emailed at most once.

## Time

Agencies record minutes in `agency_client_time_entries` (append-only, voids are
separate rows). `business_effort` is the platform's factory measure (ADR 0009)
and is never read here. Strelva Agency records time the same way (ADR 0012).
