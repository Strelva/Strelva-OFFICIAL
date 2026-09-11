# Strelva major-release specifications

Prepared September 8, 2026. Author: Astra. Status: proposed specification package for Jacob's review. This package defines implementation and acceptance work; it does not authorize implementation, a release version, prices, production changes, or deployment.

The release brings people, managed clients, Enterprise agencies, and their customers into one Strelva interface. The governing requirement is simple functionality with deep modules: a few understandable objects and actions, with substantial coherent responsibility contained beneath them. Selected Home Finder capabilities belong in the Enterprise preparation. Customers is in scope; the earlier recommendation to defer it is superseded. The buyer still uses a brokerage-branded Home Finder embed, and Strelva operators retain a restricted console.

## Reading order

| Specification | Covers |
| --- | --- |
| [01 — Release](./01-release.md) | Intended result, selected direction, scope, exclusions, evidence, release composition |
| [02 — People and authority](./02-people-and-authority.md) | People, organizations, customers, ownership, permissions, Enterprise, payer and service boundaries |
| [03 — Deep modules](./03-deep-modules.md) | Responsibilities, small operation contracts, failure semantics, source ownership and consolidation |
| [04 — Surfaces](./04-surfaces.md) | Complete affected page inventory, intent, content, actions, states, navigation, UI and browser acceptance |
| [05 — Home Finder](./05-home-finder.md) | Existing IDX capabilities, Enterprise adapter, installation authorization, safe receipts, buyer journey and live gates |
| [06 — Data and release operations](./06-data-and-release.md) | Data, APIs, authentication, compatibility, migration, security, observability, deployment and rollback |
| [07 — Delivery and decisions](./07-delivery-and-decisions.md) | Prioritized implementation, exact conditional deletion plan, acceptance matrix and unresolved decisions |

Read 01 and 02 before implementing any behavior. Read 05 before exposing an installation or inquiry receipt. Read 06 before preparing a migration or release. Each implementation change must identify its requirement and acceptance IDs.

## Status and requirement language

- **Selected**: Jacob's direction from this session or an explicit current repository decision.
- **Existing**: directly inspected local source; not a claim of deployment, use, or commercial acceptance.
- **Proposed**: a concrete implementation or policy recommendation requiring review where it affects product direction or authority.
- **New**: implementation absent from the inspected boundary. A new requirement can be proposed without being accepted.
- **Blocked**: an identified prerequisite is unproven or failing; the named evidence must close it.
- **Deferred**: outside this release's proposed implementation baseline; existing behavior stays intact.

“Must” specifies a requirement for the proposed implementation, not permission to execute it. Requirement prefixes are `REL`, `AUTH`, `MOD`, `UI`, `HF`, and `OPS`; acceptance IDs are `AC`; implementation slices are `IMP`; deletions are `DEL`; consequential decisions are `DEC`. Every requirement prefix is mapped to acceptance in specification 07. Example paths and contract names marked proposed are not claims that files or endpoints exist.

## Sources and precedence

The session's latest agency/Enterprise and functional-consolidation direction supersedes the earlier deferral of Customers and resolves the earlier unsettled commercial classification of agencies. Other durable authority and provider constraints remain intact. Unselected policies in this package must not silently become product facts.

Primary local context is [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md), [DESIGN.md](../../DESIGN.md), [company context](../../../CONTEXT.md), and the global [design instructions](/Users/jacobrhinehart/.codex/DESIGN.md). Implementation and focused tests outrank stale descriptive passages. The [Enterprise interface specification](../enterprise-customer-interface-spec.md) and [interface study](../prototypes/enterprise-interface/index.html) are proposed design evidence. The study's persona and state controls are review controls, not shipped permissions or workflows.

The [functional review](../deep-module-review-2026-09-08.md), [earlier release scope](../deep-module-release-scope-2026-09-08.md), and [migration record](../product-work-migration-2026-09-06.md) retain dated findings. Their old test counts, temporary environment failures, navigation descriptions, and Customers deferral are not the current release verdict. [Specification 06](./06-data-and-release.md) defines the fresh evidence required.

This package changes documentation only. It creates no customers, grants, installations, subscriptions, invitations, provider enrollments, or production records. It does not merge the Websites and IDX runtimes, turn the common interface into a general execution engine, or imply that a paid offering has been selected.
