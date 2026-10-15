# Dental intake

Status: built locally on `grade/app-dental-intake`, flag `STRELVA_VERTICAL_INTAKE_RELEASE` off. Not in production. Three
migrations are held and unapplied (`20261028100500`, `20261028100600`, `20261028100700`). No provider, email or flag change
is authorized.

Dental intake is a built-in App, credited "Strelva", and the first Intake App. A patient fills a short new-patient form on
the office's own website. It becomes an Inquiry in the one lead store, with spam scoring and the spam pit. When the office has
Bookings set up, Needs you proposes a concrete visit time that matches the patient's preferred days and times, and the owner
confirms it.

Events: `inquiry.received` and `booking.made` come from the platform event outbox (app_events), not from this App. Its
Inquiries and bookings land in the one lead and booking stores, so the outbox records them for it.

## Who does what

- **The patient** fills the form. Tooth pain, swelling or a broken tooth shows the office phone, whether the office is open
  now, and the 911 line, before the patient sends anything.
- **The owner** decides "Make it live" in Needs you, and confirms each proposed visit. Both are owner only.
- **An admin or an agency** sets up the draft, installs the two lines, checks the live page and pauses the App. They ask the
  owner to make it live; they cannot.
- **Owners and admins** (actual members, never agency seats) can read a stored member ID. Every read is audited.

## Gates and switches

All default off. See `docs/operations/integration-keys.md`.

| Switch | What it does |
| --- | --- |
| `STRELVA_VERTICAL_INTAKE_RELEASE` (`vertical_intake`) | The App itself: the public form, the Inquiries panel, both Needs you sources, the insurance row in Business details. Operator switched; agencies cannot switch it during rollout. |
| `STRELVA_INTAKE_SENSITIVE_FIELDS` | Lets the form ask for an insurance member ID. Needs `SECRETS_ENC_KEY`, and the install must also turn it on. |
| `STRELVA_INTAKE_OWNER_EMAIL` | The owner's Needs you emails about it. Off by default. |
| `STRELVA_BOOKING_MANUAL=1`, `STRELVA_BOOKING_STORE_WRITE=1`, Postgres booking read | Visit proposals appear only when these are on. Otherwise the office books by phone and the panel says so. |

Customer email stays off and is untouched. With it off the copy says "Patients aren't emailed while customer email is off. The
office calls them back." Booking confirmations follow the existing booking email gates.

## Health information

Strelva isn't set up to hold patient health information yet (it isn't a HIPAA-covered system). This form asks only for contact
details, insurance plan, a reason from a short list and preferred times, and asks patients not to include medical details.

Collected: name, phone, optional email, new or returning, insurance plan from the office's list, a reason from a fixed list,
preferred days and times, and an optional 500-character note that tells patients not to include medical details. Not collected:
no Social Security number, no date of birth, no medical history. A code guard rejects any definition field that matches those
words, at module load.

The member ID field exists but is hidden and refused unless the env switch is on, `SECRETS_ENC_KEY` is set and the install turns
it on. It is stored as ciphertext only, readable by the business's own owner or admin members, audited on every read, and purged
30 days after it is recorded. The purge runs in the daily connected-sites retention cron.

**Not settled.** Minimum necessary does not by itself take an office's patient contact data out of HIPAA. A dental office is a
covered entity, and a vendor that receives its patients' names, phone numbers and visit reasons is very likely a business
associate. Production stays off until counsel has answered and a business associate agreement path exists.

## Two ways to install

1. **Connected site (two lines).** The `connect.js` script line the office already pastes, plus
   `<div data-strelva-app="dental_intake"></div>` where the form should appear. The form is drawn from the live Release.
2. **Code site.** The `StrelvaIntake` component in `custom-repo-starter`
   (`<StrelvaIntake baseUrl siteKey appId="dental_intake" />`). It renders `data-strelva-app` and `data-strelva-site` on the
   server, which is what the live-page check looks for.

Both read `GET /api/v1/connect/{siteKey}/apps/dental_intake` and post to `.../intake` from the site's own verified Origin.

## What Needs you shows

- **Make Dental intake live on your website: Release N.** The full review: the questions, the insurance plans shown, who is
  told to call, whether a member ID is asked, which service times are proposed for, and that patients aren't emailed. Approve
  records the numbered Release and checks the live page; "done" means the form was seen there.
- **New patient visit: Name, Tue Oct 21 9:00 AM** (prefixed "Urgent · " for tooth pain). Approve books it through the one
  booking store and confirms it. Not yet leaves the request in Inquiries for a phone call. Patients without an email get no
  proposal; the panel says "No open time matched. Call them."

## Another vertical

A law or home-services intake is a new definition file in `src/products/vertical-intake/definitions/`, its app id in
`VERTICAL_INTAKE_APP_IDS` and `BUILT_IN_APP_IDS`, and one catalog entry. `HOME_SERVICES_FIXTURE` in the contract test proves it
without shipping one.

## What is unproven

- No office has used it. Nothing has run against production, a real site or real patients.
- The SQL passed on a disposable local cluster (`scripts/check-vertical-intake-sql.sh`); no hosted database has seen it.
- The form was exercised in jsdom, not in a browser on a live site builder.
- The live-page check cannot see a form a page draws only with JavaScript; the panel says so.
- Whether admins (a front desk) may confirm visits, member ID retention, and agency control of the flag are open questions.
