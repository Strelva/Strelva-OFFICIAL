# Connect an existing site

[Internal 1.0 draft](../README.md). You need access to the site's header code
and a business workspace where connected sites are enabled.

The current screen requires a confirmed-email business owner or admin. Connecting
through ordinary agency access depends on [NOT BUILT — tracked in #255].

1. On the business Home, select **Bring it into Strelva** under **Already have a
   website?**, or **Connect it** under **Have another website?**.
   The direct page is `/workspace/site?workspaceId=<business-id>`.
2. Enter **Your site's address**. Use its public HTTPS address. Choose **Built with**.
3. Select **Get my two lines**. Copy both displayed lines.
4. Paste them into the site's header code on every page. Publish with the
   site's existing builder or host.
5. Select **Check my site**. Wait for **[host] is connected**.
6. Select **Open your website**. Review its last-30-days activity and inquiries.

If the check fails, confirm the lines are in the published page at the address
you entered, then retry. One verified host can belong to one business at a time.

## What the script does

It counts visits and contact taps. It can copy supported contact-form submissions
into Strelva without replacing the form's original submission. Test the actual
form; embedded third-party forms may not be visible to the script.

It fills elements marked `data-strelva-fact` with confirmed business facts.
It can add business structured data when it does not detect existing business
structured data. It does not rewrite your hosted pages or change DNS.

Optional setup for your web person:

- Add `data-strelva-capture="off"` to the script to stop copying the site's forms.
- Add `data-strelva-ignore` to a form to exclude it.
- Add `<div data-strelva-form></div>` where you want a Strelva inquiry form.
- For consent-controlled startup, add `data-strelva-consent="required"` and
  call `window.strelva.consent(true)` after consent. Without that attribute,
  the script starts immediately.

The script uses session storage, not cookies. It sends no keystrokes or URL query
strings. Form capture sends submitted fields. Verify the site's disclosure and
consent setup before enabling it for visitors.

Installation on a real site builder remains unproven. The platform choice does
not install the script for you.
