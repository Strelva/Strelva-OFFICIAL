# Connect an existing site

[Internal 1.0 draft](../README.md). You need access to the site's header code
and a business workspace where connected sites are enabled.

A confirmed-email business owner or admin can connect a site. So can a staffed
agency seat holder whose website scope is **Prepare** or **Full control**
(Clients, then the client). Connections records whose account installed the
script: the business, or the agency when an agency did it. Every agency takes
this same path.

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

## Changes on a client's site

This needs **Keep your site** turned on for the business. Strelva never edits
the site and can't sign in to the builder: your agency makes the edit in the
builder's own editor.

1. A request arrives (the owner asks on the System page, or in Ask). Open it
   from the Queue and select **Accept**.
2. Select **Plan this change**. Fill in the page, what to change, and what the
   page should say afterwards. Strelva writes the steps for the client's
   builder. Leave **The owner should say yes first** on, unless it's a fix the
   owner doesn't need to approve, like a typo or a broken link.
3. **Save the plan.** The owner sees it in Needs you and chooses **Make it live**
   or **Not yet**. Owner email for this is off, so the screen says they weren't
   emailed; they see it when they sign in.
4. When it's ready, follow the steps in the builder and publish. You can copy
   the task for your own agent.
5. Select **Mark done**. Strelva reads the live page. When it sees the new text,
   it records a numbered Release and the change appears in What changed, with
   your agency's name.

If Strelva doesn't see the change, **Check again** after the builder finishes
publishing. Some builders draw text in the browser, which Strelva can't read.
**Record without confirmation** records a Release that says Strelva didn't see
the change live.

Under **Clients**, **Client websites** shows what each client's site is built
with, whether the two lines are installed and reporting, and copies the steps
for each builder. The edit steps haven't yet been followed on a live account of
every builder; menus move.
