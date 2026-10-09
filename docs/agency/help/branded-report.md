# Prepare an agency-branded report

[Internal 1.0 draft](../README.md). Share what was measured and what you will fix first.

## At 1.0

1. Set your agency's display name, logo, accent and reply-to address.
   [NOT BUILT — tracked in #264]
2. Open the client's AI result or outcome report. Check the client, measurement
   date, unavailable evidence and first useful action.
3. Check the agency brand on the client-facing report. Keep the **Runs on Strelva**
   credit; final white-label depth depends on #239. [NOT BUILT — tracked in #264]
4. Share the agency-branded AI scorecard. [NOT BUILT — tracked in #276]

## What you can share now

Use **Share scorecard** on a retained public AI result. Anyone with that link
can read it. It currently uses Strelva's brand.

For a private saved agency assessment, select it, open **People & access**, enter
**Client email**, and select **Create private handoff**. Use **Copy link**.
**Changed by ADR 0013 / decision 3:** "Client email" is the target label;
the older control may still say "Customer email". Engineering must align it.
Creating the link does not send email. The recipient must sign in with that
email to accept their own copy and choose whether your agency keeps read-only
access. This is not the no-account approval flow.

Do not promise a branded PDF download or a report-sending button. Neither is
present in this revision. Recurring report jobs exist; an enabled job or sent
email still does not prove the client received it.
