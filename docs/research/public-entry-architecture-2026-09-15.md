# Public Strelva and getting started

Date: September 15, 2026. Status: research and proposed design for Jacob's review.
Scope: public discovery, offering presentation, trials, signup, invitations and first arrival from [todo.md](../../todo.md). No product decision is marked accepted by this report.

## Recommendation

Lead with a few concrete examples people can inspect and change. Keep a plain-language request alongside them. Continue into the same result when someone chooses to save or use it. Reveal connections, business selection, costs and human help at the action that needs them.

This is the strongest design hypothesis for the selected direction. Reference interfaces establish precedent, not conversion performance or customer preference for Strelva.

The visible experience should have few concepts: choose something useful, try it, keep it, put it to work. The underlying offerings can combine software, analysis, records and service in different ways. Customers should not have to assemble those parts to begin.

## Evidence and constraints

- The [September 15 product brief](../horizontal-product-brief-2026-09-11.md) calls for useful entry before organization setup, people who need help discovering what to do, and fluid self-service, agency and Strelva involvement. It does not select a chat-first entrance or the first released offerings.
- The [local marketing source](../../../strelva-marketing/src/app/page.tsx) leads with account creation and contains an editable intake preview, public diagnostics and a separate agency path.
- [BuildPreview](../../../strelva-marketing/src/components/product/BuildPreview.tsx) has Build, Improve and Manage modes. Build changes a welcome message in local component state, then routes the text to an implementation inquiry. It does not save a usable application. This is source inspection, not a fresh local browser test.
- The [marketing design record](../../../strelva-marketing/DESIGN.md) selects the continuous Buffalo dusk setting, Fraunces display type, DM Sans interface type, soft surfaces and restrained responsive motion. Those visual choices can support the proposed architecture.
- On September 15, direct browser inspection of [public Strelva](https://www.strelva.com/) showed Websites, Operations, Labs, quote-led entry and a website dashboard illustration. The page also displayed both a separately quoted build and a free-build statement. This verifies displayed claims only, not actual agreements or delivery. The deployed revision was not identified.
- The referenced PRODUCT_STRATEGY.md could not be located in the workspace, Desktop or agent configuration searches. The explicit user instructions, todo.md and latest product brief govern this proposal; no missing standard is presumed read.

## Reference findings

Mobbin screenshots were visually inspected. Flow observations below concern the returned preview screens, not independently exercised full flows.

| Reference | Observed presentation | Application to Strelva |
| --- | --- | --- |
| [Lovable public entrance](https://mobbin.com/screens/3253bd66-7ca3-498d-9c9b-f781152b374d) | A large request field under one headline, with templates below. | Direct entry for people with an intention. Keep recognizable examples visible for people who do not know what to ask. |
| [monday.com interactive section](https://mobbin.com/sites/sections/cb5efa4f-8757-45c7-a26f-ffadd272a4fb) | An embedded board invites visitors to change columns and items. | Make the object understandable through a small real interaction. A screenshot alone cannot demonstrate the change experience. |
| [Framer capability section](https://mobbin.com/sites/sections/556c62ee-b2af-4993-b400-187d98f1fd72) | Publish, Layout, Breakpoints and Animations sit above one large product view. | Show depth through one stable stage whose contents change with selection. The screenshot does not prove tab behavior. |
| [Affinity studio section](https://mobbin.com/sites/sections/2413e6dd-120f-418c-8355-710867916366) | Vector, Pixel, Layout and Customized choices share one product preview. | Different abilities can belong to one recognizable product. Strelva's initial choices should describe business results rather than technical studios. |
| [Notion resource gallery](https://mobbin.com/screens/44453ef6-a197-4976-97ef-dbd753bb7559) | Featured collections precede a gallery of recognizable template previews. | Curate examples before exposing a full catalog. A permanent marketplace is premature without enough distinct useful offerings. |
| [Krea onboarding](https://mobbin.com/flows/32308f53-effc-48fb-9472-6b5d8a11614b) | The preview shows a capability home before authentication, account creation, and a similar home afterward. | Preserve orientation through identity entry. These previews do not establish that an anonymous creation survives signup. |
| [Higgsfield onboarding](https://mobbin.com/flows/312eb4a1-09f8-49eb-a071-93909f143870) | Preview screens include email verification, AI experience and acquisition-source questions. | Each pre-value question needs a specific benefit to the task. These screenshots provide no evidence that the extra questions improve activation. |

[Tally's public site](https://tally.so/) offers form creation alongside account entry. Its [input-block documentation](https://tally.so/help/input-blocks) shows how a familiar form can contain many kinds of building blocks. This is a useful precedent for compositional depth behind a recognizable object; Strelva still needs its own continuation mechanism.

[NN/g's progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) supports deferring secondary options. Its [recognition guidance](https://www.nngroup.com/articles/ten-usability-heuristics/) supports visible choices that reduce the need to recall what is possible. Neither selects Strelva's offering mix or proves this particular layout.

## Five materially different architectures

These change the initial interaction, not just visual styling.

| Option | First screen and interaction | Next screen | Advantage | Cost or uncertainty |
| --- | --- | --- | --- | --- |
| 1. Request first | Large request field with three example prompts. Visitor describes an intended result. | Interpreted request and a prepared result or one necessary question. | Fast for a visitor with a clear need; can accommodate unusual requests. | Requires visitors to formulate the work and requires reliable qualification of unsupported requests. |
| 2. Examples first | Three concrete result choices beside one large interactive example. Visitor changes a field, inspects a finding or tries a sample action. | The same result opens in a dedicated trial with Save or Use. | Shows what Strelva does before asking the visitor to explain their business. | Example selection shapes perceived scope; shallow demonstrations would misrepresent the product. |
| 3. Business context first | Website address or a short business description, with an option to explore a sample business. | A small set of sourced observations and suggested improvements; visitor chooses one. | Can identify opportunities the visitor did not know to request. | Adds research latency, coverage gaps and potentially weak suggestions. A website cannot establish internal business needs. |
| 4. Offering catalog first | Search and a small curated catalog with result previews and availability. | Offering detail and its appropriate trial or service request. | Clear, shareable, scales to a broad stable offering set. | Makes the visitor shop and compare before receiving value; an immature catalog looks sparse or padded. |
| 5. Open a sample business | A labeled sample business with an intake, tracker, website and document already in use. | Visitor opens one item, makes a change and chooses to use its starting configuration. | Makes shared context and modularity tangible across several kinds of work. | The largest orientation burden; sample activity must never appear to be actual customer evidence. |

Recommend option 2 as the default, with the request field from option 1 as an alternate entrance. Keep option 3 available for visitors who provide context and option 4 as deeper discovery. Option 5 deserves a separate comparison because it reveals more of the horizontal product, but it need not be the homepage.

## Proposed navigation and page composition

Desktop header: Strelva, Explore, Pricing, For agencies, Help, Sign in. The logo returns home. The main action belongs with the selected example. Avoid repeating a generic account-creation button beside a more specific next action.

Explore replaces separate top-level Product, Examples and Free tools destinations. It opens a readable page of examples and useful offerings, with a free-to-try filter when there is enough content to justify it. Individual offerings retain stable URLs for sharing and direct discovery. About, guides, proof and legal pages remain reachable through supporting navigation.

Homepage order:

1. A short explanation of what people can accomplish with Strelva, using approved capability claims.
2. One large result preview and a short selector of concrete examples. Candidate examples for design review: check a website, adapt an intake form, organize a tracker. These are not a selected release list.
3. A nearby request field for a different need. Interpret a request before asking for contact details unless delivery genuinely requires a person.
4. A compact explanation of adapting the result, using it with existing systems and involving other people. Attach each claim to an actual example.
5. Available offerings and permitted customer proof. Distinguish illustrative examples from customer evidence.
6. Pricing explanation, agency link, help and essential questions.

Preserve the selected Buffalo setting as atmosphere around the work. Give the actual example an opaque, readable surface. Show a useful interaction earlier in the page. Do not require a long scroll through audience imagery to reach the first meaningful choice.

On phones, use a menu for secondary navigation, a vertically stacked example selector and one readable result. Open edits inline or in a sheet; never shrink a desktop dashboard to fit. Return to the same example and scroll position. A bottom action can appear when the relevant result is in view, provided it does not cover fields or the keyboard.

## Surface map and destinations

Paths below describe proposed ownership and behavior. They are not claims of deployed routes.

| Surface | Content and action | Continuation |
| --- | --- | --- |
| Public home | One explanation, examples, optional request | Selected example or interpreted request |
| Explore | Curated offerings, previews, search when useful, availability | Canonical offering detail |
| Offering detail | Result first, try action, requirements, price basis, ongoing responsibility and limits | Trial, connection explanation, or scoped service request |
| Trial/result | The usable object, limited editing, clear sample/actual status, Save or Use | Identity only when required, then same result |
| Pricing | What is included, what uses allowance, what requires an agreement | Return to the chosen offering with intent preserved |
| For agencies | The same offerings in client work, ownership and collaboration illustrated | Selected offering or contextual agency inquiry |
| Help/contact | Help tied to the affected offering or failed action | Recover the trial or submit a deliberate request |
| Authentication/recovery | Identity, verification and recovery with intended destination visible | Saved result, invited work or existing business |
| Invitation acceptance | Inviter, business, intended access and correct identity | Exact invited work; no generic onboarding detour |
| First signed-in arrival | Continue selected result; choose business when saving ownership requires it | Result in the business, with a persistent return link |

Offering details use one stable layout, but their actions differ. A free assessment can Run a check. A sample can Try the example. A connection-dependent action explains the account and access before Connect. A service can Request help with explicit acceptance still pending. An unavailable capability can receive a request without appearing installable.

Price, required access, data destination and provider responsibility stay visible before the relevant commitment. They must not disappear into a generic More details disclosure.

## Concrete first-use journey

Illustrative journey for a qualified intake offering, not a claim of released capability:

1. Visitor chooses Client intake on the homepage. A sample form appears with an editable welcome message and two fields. It is labeled as sample data.
2. Visitor changes the message and submits a sample response. The result displays where that sample goes. No business recipient is contacted.
3. Use this opens the same configuration in an app-owned trial. It does not reset to an unrelated dashboard.
4. Save asks for sign-in or account creation. Cancel returns to the trial unchanged. Verification preserves the pending continuation.
5. Saving requires an explicit business destination. Show an existing eligible business, or a minimal business-creation choice. Do not create another business for an existing managed client automatically.
6. The same form opens as private saved work. The visitor can keep editing. Publishing, recipients, connections, spending and help are introduced as the visitor chooses to put it to work.
7. Returning through the saved URL opens this form in this business. A missing or inaccessible result gets an explicit recovery state.

The website-check path can be shorter: public input, result, Save, identity, business destination, same result. A managed website customer signing in should reach their existing site and agreement. An employee or invited collaborator should reach the assigned work directly.

## How modularity stays deep

Share the surrounding experience: navigation, result identity, continuation, factual offering summary, authentication return, business destination, permission explanation and error recovery. Let the result supply its native preview and controls: audit findings, editable form, tracker rows, website comparison or proposed service scope.

An offering definition needs enough information to choose the correct UI: supported result, release status, trial mode, required inputs and connections, cost basis, accepted provider responsibility, allowed next actions and canonical result destination. Reuse the existing offering and work records where they fit. Do not build a second public catalog authority or universal execution engine.

Composition should be visible in the result when useful. An intake can gain a status view, a customer confirmation or delegated review as the owner asks for those outcomes. Each addition presents its new data, permissions, cost and maintenance consequences. Adding a feature must not silently grant a connection or accept service.

The marketing site may host disposable examples. Any trial that promises Save or Use needs app-owned persistence and an explicit continuation reference. Carry an opaque, expiring reference across domains; do not put private drafts or uploads in query strings. Claim it for the authenticated person and chosen business with ownership checks and duplicate-safe completion.

Current BuildPreview's local state and inquiry URL are enough for its labeled demonstration. They do not meet that durable continuation requirement. Existing diagnostic recovery and saved-work mechanisms are the first reuse candidates; confirm their fit before generalizing them to editable apps.

## Required states and proof

- Anonymous retention: disclose its actual duration and recovery limit. Sign in before retaining private uploads if anonymous storage cannot meet the boundary. Do not promise cross-device continuity without a recoverable reference.
- Trial failure: preserve editable input, identify the failed step, offer retry or a labeled example. Do not show invented output as a successful run.
- Wrong account or invitation: retain the intended destination while allowing account switching. A URL does not grant access.
- Expired verification or continuation: allow recovery if the source remains; otherwise say exactly what was lost and what can be recreated.
- Connected software: explain which account, which data and which actions are requested before connection. A successful connection does not authorize external writes.
- Unavailable offering: preserve a capability request, with no accepted delivery date or provider commitment.
- Existing customer: preserve business, site and agreement; distinguish choosing another business from creating one.

The next discriminating test is a rendered comparison of the five entrances using the same example content. Ask visitors to identify a useful result, try a change, explain what happens next, save it and return. Compare hesitation, wrong expectations, lost context and ability to recover, rather than preference for a screenshot alone.

Then exercise the selected path on desktop and phone with a new visitor, a returning website client and an invited collaborator. Include a failed trial and an expired sign-in. Backend proof must separately cover persistence, business isolation and duplicate-safe saving. No such new prototype or journey test was performed for this report.

## Decisions for Jacob

1. Whether the default entrance should be examples, a request, business context, a catalog or a sample business.
2. Which concrete offerings can represent the initial range and actually continue into use.
3. Which useful actions can be anonymous, and what must require identity or explicit agreement.

Research supports reducing upfront choices and preserving the result through entry. The strongest unresolved dependency is the set of offerings qualified for a real trial-to-use journey. Visual polish cannot settle that release decision.
