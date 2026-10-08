# Agency help and onboarding

Internal 1.0 drafts for [#414](https://github.com/Strelva/Strelva-OFFICIAL/issues/414)
and [#415](https://github.com/Strelva/Strelva-OFFICIAL/issues/415). Source checked
on 2026-10-07 at `115448a9`. These files ship in REB; they are not a published
help site or proof of production availability.

The promise: bring the sites you already run, find the first useful improvement,
and keep each business in control of its data and decisions. Connecting a site
does not move its hosting or give Strelva permission to edit its pages.

Steps marked `[NOT BUILT — tracked in #N]` describe the intended 1.0 flow.
They cannot be followed in this revision. Their final screen labels and behavior
must be checked after integration. Unmarked steps have matching source code;
they still need the relevant release gates and permissions.

## Help articles

- [Create your agency workspace](./help/create-agency.md)
- [Add a client](./help/add-client.md)
- [Assign your team](./help/assign-team.md)
- [Verify your agency](./help/verify-agency.md)
- [Connect an existing site](./help/connect-site.md)
- [Run an AI visibility check](./help/check-ai-visibility.md)
- [Check your book in a batch](./help/check-book.md)
- [Prepare an agency-branded report](./help/branded-report.md)
- [Push an improvement to client Versions](./help/push-improvements.md)
- [Approve an improvement by email](./help/approve-by-email.md)
- [Export your data](./help/export-data.md)
- [Leave or change agency](./help/leave-or-change-agency.md)

[Move your book in a week](./move-your-book-in-a-week.md) puts these tasks in order.
[Source verification](./verification.md) records the evidence and remaining checks.

## Release and handoff

Keep #414 and #415 open. Remove a marker only after its dependency is built,
integrated, and the instructions have been followed against that code. Verify
with an ordinary outside agency and an owner who never signs in. Do not use
platform-operator powers as an agency workaround.

Next action: integrate the dependencies listed in the verification ledger,
recheck the affected articles, then rehearse the whole week on an authorized test
business. Live email, provider writes, payments, deployment and DNS need separate
authorization. A week is an onboarding plan, not a proven completion guarantee.
