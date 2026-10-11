# Move your book in a week

Internal 1.0 onboarding playbook for [#415](https://github.com/Strelva/Strelva-OFFICIAL/issues/415).
[Draft status and source evidence](./README.md). A week is the plan, not a proven
time-to-completion promise. Marked steps cannot run in this revision.

Bring the sites you already manage. Keep their hosting. Start with a measured
problem and finish with one approved, checked improvement.

## Before day one

List each client's name, public URL, owner email and who can publish header code.
Confirm the work each client authorizes. Pick one first client whose site you
can edit and whose owner can review the result. Keep DNS, hosting moves and
billing changes out of this onboarding unless separately agreed.

Use an ordinary agency account. Platform support powers are not part of the plan.

## Day 1 — Set up your agency

1. [Create your agency](./help/create-agency.md) through the agency signup path.
   [NOT BUILT — tracked in #258]
2. Set your agency brand. [NOT BUILT — tracked in #264]
3. Start [verification](./help/verify-agency.md) for the effects you need.
   [NOT BUILT — tracked in #254]
4. [Assign staff to clients](./help/assign-team.md) if you have a team.
   [NOT BUILT — tracked in #261]

Done when: the agency workspace exists, the client roster is ready and the
remaining verification requirements are known. Do not promise a review deadline;
criteria and reviewer still depend on #233.

## Day 2 — Add the book and establish a baseline

1. [Import your list and run the batch AI check](./help/check-book.md).
   Review the dry run first. [NOT BUILT — tracked in #260]
2. Review every result, including failed, partial and unmeasured checks.
3. [Add clients from their URLs or prospects](./help/add-client.md).
   [NOT BUILT — tracked in #259]
4. Give each owner their agency-issued claim link when that flow is available.
   [NOT BUILT — tracked in #262]

Current fallback: [check one business at a time](./help/check-ai-visibility.md).
That produces assessments, not agency relationships or an imported client book.

Done when: every client has a baseline or a named reason it could not be measured.
Choose the first useful fix from the evidence, not just the lowest grade.

## Day 3 — Connect existing sites

1. [Connect each existing site](./help/connect-site.md) using its two header lines.
   Agency access to the connection flow remains [NOT BUILT — tracked in #255].
2. Publish those lines with the site's current builder. Check the site in Strelva.
3. On an authorized test site, make a visit and submit a test inquiry through
   the actual form. Check the activity and inquiry record; remove test noise from
   any client report.

Done when: each attempted connection is verified or has a specific blocker.
Record builder limitations. Adding a script does not move hosting or edit pages.

## Day 4 — Put evidence in the client's hands

1. [Prepare each report](./help/branded-report.md). Keep the measured date,
   unavailable checks and first proposed fix visible.
2. Check the agency brand on the report. [NOT BUILT — tracked in #264]
3. Share the agency-branded AI scorecard. [NOT BUILT — tracked in #276]

Current options: share a public Strelva scorecard, or create a private assessment
handoff for a named signed-in recipient. A handoff link does not send an email.
Do not promise a branded PDF or automatic agency report delivery.

Done when: the client can read the baseline and understand the proposed change.
One Gemini answer is not proof of visibility across all AI systems.

## Day 5 — Prepare the first pushed improvement

1. Choose a source with a newer revision and a linked client Version. If none
   exists, record that prerequisite; Library has no source-creation screen here.
2. [Open Library and review the Versions](./help/push-improvements.md).
   Use **Review all** for ready Versions through ordinary delegated agency access.
   [NOT BUILT — tracked in #325]
3. Read each prepared, skipped or failed result. Hold conflicts and missing
   accounts for review. Do not force them through.

Done when: one exact improvement is ready for owner review. **Prepared** does
not mean published, and a Version update does not edit an arbitrary connected site.

## Day 6 — Get approval and check the outcome

1. Have the owner [approve the pushed Version by email](./help/approve-by-email.md)
   without an account. [NOT BUILT — tracked in #273]
2. For a website supported by Strelva's publication path, publish through the
   verified agency path with the required owner approval.
   [NOT BUILT — tracked in #263]
3. Review the receipt and read the actual live target. Integrated Version
   publication receipts remain [NOT BUILT — tracked in #497].
4. Run the AI check again if it can measure the changed evidence. Keep both
   runs and their limitations. Do not call a score change a causal result.

For hosted pages on an existing builder, an authorized edit still happens in
that builder. Do not report a pushed Version as proof that those pages changed.
If verification, approval or publication is blocked, keep the improvement prepared
and tell the client exactly what remains.

Done when: the outcome is confirmed at its actual target, or recorded as failed,
partial or unproven. Do not send a success report based on approval alone.

## Day 7 — Leave the client in control

1. Show the client the baseline, proposed change, decision and observed result.
2. Explain [export](./help/export-data.md) and [exit](./help/leave-or-change-agency.md).
   The current JSON download is a limited snapshot, not a complete site backup.
3. Explain the agency-change flow and the agency-requested export delivered
   only to the owner.
   These remain [NOT BUILT — tracked in #293] and [NOT BUILT — tracked in #295].
4. Record what remains blocked and who takes the next action. Agree the next
   review with the client; do not turn a monitoring-pilot request into a service promise.

Done when: the client knows what changed, what is still unproven and how to keep
their data. Do not execute an exit just to demonstrate it; rehearse that permanent
choice in an isolated test workspace.

## Internal completion record

Keep the attempted clients, connection blockers, measurement status, report
delivery evidence, prepared Version, owner decision and live outcome together.
Save the exact next action for each unfinished client. No step here selects a
price, changes billing or authorizes a live write.

#414 and #415 remain open until the marked dependencies are built and this
journey is re-verified with an outside agency and an owner who never signs in.
