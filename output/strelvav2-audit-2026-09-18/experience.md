# Strelva customer experience and migration audit

Date: 2026-09-18

This is a read-only audit of the local Strelva control-plane implementation from a business strategy and product experience perspective. I read `CONTEXT.md`, `~/.codex/DESIGN.md`, `DESIGN.md`, the component inventory, the current component handoff, the horizontal brief, and the horizontal acceptance ledger. I inspected the workspace, offerings, agency, managed website, and client dashboard sources. I also inspected the local preview on port 3299 with the browser accessibility tree and ran focused Vitest coverage.

The branch is internal and production is explicitly off. Local source, fixtures, and tests do not prove a production release, live provider operation, customer value, or human acceptance. Scores below are judgments about the experience represented by the available evidence. They are not completion percentages.

## Scores

| Dimension | Score | Confidence | Evidence-based judgment |
| --- | ---: | --- | --- |
| First value, from request to useful work | 4/10 | High | The planner has new horizontal route definitions, but its examples, help copy, icon mapping, and continuation labels still describe the earlier product set. Several ordinary requests fall into generic help, and a ready horizontal plan can show a business-assessment CTA. |
| Navigation and work continuity | 6/10 | High | Home, Work, Ongoing, People & access, Settings, Search, New, and Explore offerings form a coherent frame. Saved work labels omit applications, scheduling, investigations and operations. Reopen routing exists; the demonstrated defect is misleading presentation, not proven loss of the return path. |
| Business activation and offering setup | 6/10 | High | The offering directory has strong availability, permission, responsibility, assignment, and retry language. A business with an account-authorized site can still reach a Settings dead end because Settings does not link to the assignment action. |
| Agency collaboration and portfolio operations | 7/10 | High | Delegations are filtered by exact work IDs, customer ownership is visible, and failed client reads remain visible. The attention queue deliberately checks at most eight clients, which is a clear operational limit that can leave important client work outside the first queue. |
| Managed website and client handoff | 7/10 | Medium | The managed website preview uses the shared frame, account context, website sub-navigation, and an explicit fictional/no-live-actions notice. The multi-site property lookup fails soft to a fallback name without telling the user that the list failed. |
| Permission, error, and recovery trust | 8/10 | High | Read-only, unavailable, provider-requested, accepted-but-unread, retry-exactly, and revoked-access states are stated carefully in source and fixtures. The stale planner fallback and unsupported saved-work message still break continuity in some paths. |
| Component and design-system migration | 4/10 | High | Shared primitives and the shell exist, but the component record explicitly says adoption is partial. Typography, spacing ownership, field error associations, tab keyboard behavior, and page-level native controls remain open. |
| Evidence and release discipline | 8/10 | High | The records separate local implementation, fixture proof, human review, provider operation, and production. The acceptance ledger explicitly rejects completion percentages and keeps production off. |

Overall judgment: 6/10, with high confidence for the local customer journey. The horizontal capability is materially present in source, while the first-value and return paths still speak the language of the earlier product slice. The main business risk is request-to-result leakage: a customer can ask for a supported new kind of work and receive help copy, an unavailable preview, or a misleading continuation label before reaching the capability.

## Source proof

### 1. The first-value planner is only partly migrated to the horizontal model

`src/experience/workspace/workspace-start.ts:96-102` defines applications, scheduling, investigations, and operations with route-specific titles and summaries. `src/experience/workspace/workspace-start.ts:136-145` recognizes those routes through signals, and `src/experience/workspace/workspace-start.ts:284-320` returns a ready plan when the corresponding product is available.

The UI around that planner still describes the previous five paths:

- `src/experience/workspace/WorkspaceStart.tsx:26-32` offers only customer inquiries, a CSV tracker, a business check, a website improvement, and a private document.
- `src/experience/workspace/WorkspaceStart.tsx:34-49` maps icons only for inquiries, tracker, website, and document. Applications get a special label, while scheduling, investigations, and operations fall through to `FileSearch` and `Continue to business assessment`.
- `src/experience/workspace/WorkspaceStart.tsx:188-198` tells help users that the available paths are assessment, tracker, inquiries, connected website, and private document, even though the planner source supports more routes.

The pure planner reproduces the semantic gap with all horizontal products supplied as available:

```text
Build an app for staff requests       -> applications, ready, canContinue true
Build a staff request app              -> help
Help my staff request time off         -> help
Schedule follow-ups for unanswered inquiries -> scheduling, ready, canContinue true
Compare two saved sources every week   -> investigations, ready, canContinue true
Delegate these approved steps          -> operations, ready, canContinue true
```

The wording difference matters. “Build a staff request app” and “Help my staff request time off” are ordinary descriptions of a staff application or schedule. They are not obscure edge cases. The current signal set includes `build an app`, `create an app`, and `working app`, but it does not cover those forms (`workspace-start.ts:136-145`).

This creates three user-visible outcomes for the same horizontal product family: generic help, a blocked unavailable state in the fixture, or a ready plan whose UI points toward a business assessment. The planner promise says the system will show the shape and then take the user to the supported flow (`WorkspaceStart.tsx:169-180`), so this is a product contract problem rather than a cosmetic inconsistency.

Possible product directions remain open:

1. Make the planner route-complete. Add examples and synonyms for the new jobs, give every route its own icon and continuation label, and keep the capability available when the workspace actually has the product.
2. Keep new routes out of the planner until their entitlement and fixture paths are ready. Send those requests to a clearly labeled offerings or “ask about this path” state instead of presenting them as ready.
3. Make the planner explicitly outcome-first with a small set of route choices after the request. This reduces dependence on exact phrases while keeping unsupported paths honest.

### 2. The local managed fixture cannot demonstrate the new horizontal routes

`src/experience/workspace/preview/fixture.ts:65-76` supplies AI Visibility, Managed Websites, Inquiry work, Spreadsheet tracker, Documents, and Home Finder. It does not include applications, scheduling, investigations, or operations. `src/experience/workspace/WorkspaceLayout.tsx:300-309` marks the horizontal flows as mounted when `onHorizontal` exists, but `workspace-start.ts:177-181` also requires an available product record.

In the rendered managed preview at `http://127.0.0.1:3299/preview/strelva?scenario=managed&view=start`, entering “Build an app for staff requests” produced “A private working application,” then the status “This a private working application is not available in this workspace yet.” The actions were “Prepare a plan” and “Ask about this path.” This is a valid blocked-state rendering, but it means the current primary preview cannot prove the advertised horizontal capability. The fixture is evidence of local presentation state, not production entitlement.

The blocked message also exposes a small source-level copy defect: `workspace-start.ts:271-277` prefixes the route title with “This” even when the title already starts with the article “A,” producing “This a private working application.”

Possible directions are to add representative horizontal product records to the managed fixture and test both available and unavailable states, or to label the preview as an older capability set and route reviewers to a fixture that explicitly includes the horizontal products. Leaving the source mounted and the fixture silent makes review results depend on which scenario a reviewer happens to choose.

### 3. Business Settings has a dead end when the account already has the needed site

The business Home source deliberately shows account-authorized but unassigned sites (`src/experience/workspace/BusinessHome.tsx:346-350`). `src/experience/workspace/WorkspaceBusinessSettings.tsx:68-87` only renders business website links when `sites.length` contains assigned sites. With no assignment, it says that business information, connections, and domains become available after an authorized website installation is linked. It provides no link to the assignment surface.

The offering directory already owns the needed action: `src/experience/workspace/WorkspaceOfferings.tsx:478-485` explains that account authorization is not a business installation and exposes “Assign to this business” for an authorized site. The two surfaces therefore have the right boundary but no handoff between them.

Rendered business preview evidence confirms the gap. Home showed Harbor Dental under “Authorized sites” with “Unassigned managed site.” Settings then showed “No managed website is linked to this business…” and only the personal-account link and usage section. There was no route from that Settings state to assignment or Explore offerings.

This is an activation problem. A customer who has found the resource cannot tell whether they lack permission, need to install an offering, or should assign the site. Possible directions are to link Settings directly to Explore offerings with the business preselected, show the assignment action inline in Settings, or keep Settings empty but provide an explicit “Assign an authorized website” next action. The ownership boundary should remain visible in all three options.

### 4. The Work and Home surfaces have no single presentation registry for new work

`src/experience/workspace/WorkspaceLayout.tsx:148-154` maps only tracker experiments, documents, work plans, and trackers before falling back to “Saved work · view unavailable.” The Work list uses that mapping at `WorkspaceLayout.tsx:313-318`. The empty state says to start a document, tracker, or assessment at `WorkspaceLayout.tsx:377-382`.

Home has a similarly partial vocabulary. Its starter list includes an application and ongoing work (`BusinessHome.tsx:137-142`), but its counts only cover attention, saved work, applications, and documents (`BusinessHome.tsx:144-149`). The destination labels cover operations but do not provide a complete representation for scheduling or investigations (`BusinessHome.tsx:125-129`). The runtime can open the horizontal views (`WorkspaceApp.tsx:745-762`), and it honestly says when an unknown saved record is unavailable (`WorkspaceApp.tsx:770-772`), but that unknown-record fallback does not prove supported horizontal records cannot reopen. The primary agent checked the horizontal mapping in result.ts:120 and WorkspaceApp.tsx:316; this audit establishes a label defect, not a broken reopen operation.

The business consequence is misleading return-path guidance. A user can create or reach a schedule, investigation, or application, then return to Work and see a generic or unavailable method. This weakens the product promise that requests, plans, results, decisions, and receipts stay in one workspace.

Possible directions are to centralize route title, icon, method, and reopen behavior in one registry used by planner, Home, Work, and detail routes; to add explicit “not available in this release” rows with a route to the plan or offerings; or to keep a new route out of creation until its saved-work projection is complete.

### 5. Agency access is carefully bounded, with a visible portfolio limit

The agency model is one of the strongest parts of the local experience. `src/experience/workspace/agency-home.ts:39-71` derives clients only from active delegations naming the selected agency, limits the initial set to eight, and reports the omitted count. `src/experience/workspace/agency-home.ts:89-121` rechecks each client through the workspace endpoint, verifies the returned workspace and work IDs, and preserves failed client reads as visible state. `src/experience/workspace/AgencyHome.tsx:116-137` explains that customers keep ownership, surfaces unavailable clients, and tells the user when the queue covers only the first part of the portfolio.

The rendered agency fixture showed one client with a proposed review and one client whose shared-work check was unavailable. It also showed “Opening a client keeps you inside the access that customer granted.” This is good trust communication.

The strategic tradeoff is operational: the attention queue checks at most eight clients (`MAX_AGENCY_CLIENT_LOADS`), then asks the agency to use the workspace switcher for the others. That is safe and bounded, but it means the agency’s primary queue is not a complete portfolio queue. Possible directions are a full list with per-client loading and unavailable states, a background scan with explicit freshness, or retaining the cap while making the omitted-client action more central than a small note.

### 6. Managed website continuity is coherent in preview, with one fail-soft ambiguity

`src/components/dashboard/ConversationShell.tsx:58-92` puts the managed client surface inside the shared shell, preserves account context, exposes Ask Strelva, and mounts the website section navigation. `src/app/dashboard/layout.tsx:124-162` independently guards queue, connection, product, and surface reads so one provider failure does not take down the entire dashboard.

The rendered website preview at `http://127.0.0.1:3299/preview/strelva/website/dashboard/site` showed Elmwood Studio, Today, Ask Strelva, Website, Google Business Connect, Analytics, Reports, Reviews, Website settings, and the Website sub-navigation. It also stated “Local interface preview · fictional business · no live actions” and labeled the draft cards as preview only. This preserves the website boundary and does not imply a live provider result.

`src/components/dashboard/PropertySwitcher.tsx:13-26` catches a failed authorized-property lookup and renders the current fallback name as if it were ordinary single-site context. That avoids a hard failure, but the user receives no indication that multi-site context could not be loaded. A small unavailable notice or disabled switcher would make the continuity boundary easier to judge without exposing infrastructure details.

## Rendered proof and positive evidence

- The shared frame presents Home, Work, Ongoing, People & access, Settings, New, Search, Explore offerings, Help, and Account consistently in the local preview (`src/experience/app-frame/StrelvaSidebar.tsx:19-31`, `85-111`).
- Explore offerings gives the business a clear distinction between “What this business can use,” availability, website assignments, and products. The rendered business preview said availability does not grant access or promise a provider, and exposed “Assign to this business.” This matches `WorkspaceOfferings.tsx:478-485` and `520-531`.
- The install form names responsibility, required resources, accepted scope, and exact retry behavior (`WorkspaceOfferings.tsx:407-440`). The provider-requested state explicitly says that a request does not confirm provider acceptance. This is strong trust and business-boundary copy.
- The agency preview made customer ownership, delegated access, unavailable reads, and private agency work visible together. The source filters exact delegated work IDs before displaying client work.
- The managed website preview kept website-specific navigation and data inside the website surface while retaining a route back to the workspace. It did not imply a production website or live publish action.

## Migration and strategy implications

The product is moving from a small catalog of vertical work types toward a control plane organized around business results, reusable capabilities, ongoing responsibilities, and governed website changes. The source architecture already reflects that move: new route copy, horizontal runtime views, offering installations, work plans, assignments, allowances, and scoped agency handoffs are present.

The customer-facing vocabulary has not completed the same move. The first-value planner and Work empty state still teach the earlier catalog. The result is a split experience in which the underlying capability feels broader than the product’s invitation and re-entry model. That is the main migration risk because it affects acquisition, activation, and retention at once.

The strongest current strategic asset is trust around boundaries. Availability is separated from entitlement, provider requests are separated from provider acceptance, customer ownership is separated from agency access, and failed reads remain visible. Those rules should survive any planner or navigation rewrite.

The decisions that materially change the next experience are:

1. Whether applications, scheduling, investigations, and operations are customer-ready capabilities in the current workspace entitlement model, or local capabilities that should remain discoverable through a clearly marked preview/ask path.
2. Whether Settings is the owner of business website activation or whether Explore offerings owns it. The current split explains the boundary but does not complete the action.
3. Whether agency operations need a complete attention queue or can operate with an eight-client active scan and explicit handoffs.
4. Whether the new result vocabulary should replace the legacy planner examples now, or whether the team wants a staged migration with separate entry points.

## Verification and limits

Focused tests passed locally:

```text
7 test files passed
87 tests passed
```

The command covered workspace start, workspace home, agency home, workspace routes, product discovery, workspace presentation, and dashboard IA drift. The parent agent separately confirmed `pnpm typecheck` passes. Browser inspection used the local preview server on port 3299 and fictional data. No production action, external write, live provider call, customer interview, physical-device check, or screen-reader acceptance was performed. No completion percentage is asserted.
