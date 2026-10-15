# Vertical intake

A vertical intake is a fixed new-customer form for one kind of business, bound to that business's confirmed facts, the one lead store, the booking store and the owner's decisions. "Vertical intake" is an internal word. Owners see the App's own name ("Dental intake"). The words "template" and "Ready-made" never appear on screen (GLOSSARY: App).

Release 1 ships Dental intake behind the `vertical_intake` workspace flag (`STRELVA_VERTICAL_INTAKE_RELEASE`, default off).

## Shape

- `contracts.ts` is pure (a domain root): the definition type, `assertIntakeDefinition`, `publicIntakeForm`, `validateIntakeAnswers`, `intakeReviewLines`.
- `definitions/` holds plain data, one file per vertical. `intakeDefinition(appId)` looks one up.
- `office.ts` and `preferences.ts` are pure: hours now, and picking a visit time that matches a patient's preferred days and times.
- `server.ts` is the only server entry (store, service, readiness, live check, release gates).

## Adding a law or home-services intake

1. A new definition file in `definitions/` (fields, fact-sourced options, triage rules).
2. Its app id in `VERTICAL_INTAKE_APP_IDS` and in the App release contract's `BUILT_IN_APP_IDS`.
3. One catalog entry in `src/platform/app-releases/catalog.ts`.

No new tables. The test fixture `HOME_SERVICES_FIXTURE` in `src/__tests__/vertical-intake-contracts.test.ts` proves a second vertical validates and renders without shipping it.

## Forbidden fields

`assertIntakeDefinition` runs for every definition at module load. It rejects any field id or label matching `FORBIDDEN_FIELD_PATTERN` (SSN, birth date, diagnosis, medication, allergy, medical or health history, prescription, x-ray), so a clinical or identity question cannot ship by accident.

## HIPAA posture

Strelva is not a HIPAA-covered system and has no BAA program. The App collects only the minimum non-clinical facts: contact details, new or returning, insurance plan from the office's list, a reason from a fixed list, preferred days and times, and an optional 500-character note that tells patients not to include medical details. Minimum necessary does not by itself take an office's patient contact data out of HIPAA. Production stays off until counsel has answered and a BAA path exists.

## The sensitive field

The insurance member ID field is hidden and refused unless all three hold: `STRELVA_INTAKE_SENSITIVE_FIELDS=1`, `SECRETS_ENC_KEY` is set, and the install turns on `collectMemberId`. It is stored only as ciphertext, readable only by the business's own owner or admin members (never agency seats), every read is audited, and it is purged after 30 days.

## Email

Nothing here sends email. With customer email off, the copy says "The office calls them back."
