# Product model

The ledger below is authoritative; graphs and research reports are derived views. See [.product/README.md](.product/README.md) for maintenance.

```json product-model
{
  "schema_version": 1,
  "revision": 5,
  "product": {
    "id": "STRELVA",
    "name": "Strelva",
    "identity": "Strelva REB product: customer workspaces, managed websites, bookings, inquiries, publishing, internal apps, operator console and additive /api/v1. Separate worktrees are evidence scopes, not separate products or canonical models."
  },
  "context": {
    "intent": "Strelva makes and operates business Systems, connects them to the business and existing tools, materializes Possibilities, and creates contextual Versions; managed clients retain service while moving into business workspaces.",
    "focus": "Selected Systems/Connections/Possibilities/Versions product model; stable identity, contextual lineage, multi-System alternatives and checked Make real transitions, backed by native domain authority and evidence.",
    "constraints": [
      "Production migrations, env flags, email, conversions need Jacob's yes",
      "/api/v1 additive only",
      "Frozen reb:/x-reb-/REB_ names",
      "Must work for clients who never log in",
      "Research proposals are not accepted ADRs or production evidence",
      "Typed domains retain booking, money, permission and provider invariants",
      "Methods contain no customer records, secrets or grants",
      "Connector scopes do not override provider rights/retention or business mandates",
      "Four customer primitives are selected direction, not certification of a general System runtime",
      "Possibilities prepare isolated alternatives; Make real does not bypass authority, commercial acceptance or production stop points",
      "Contextual Versions never implicitly share customer data, credentials or grants",
      "Simple lifecycle is independent of current health and accepted obligations",
      "Audit verdicts (LIVE, SHIPPED-UNUSED, WORKS-LOCALLY, DEAD, SCAFFOLD) are local code readings plus the Sept 30 release record, not fresh production observations"
    ],
    "coverage": [
      {
        "area": "domain and rules",
        "state": "partial",
        "note": "Typed record, fact, resource, command and state contracts mapped as proposals; exact SQL/store consolidation incomplete.",
        "evidence": [
          "SRC_RECORD_CURRENT",
          "SRC_EXECUTION_CODE",
          "SRC_REVIVAL_BLUEPRINT"
        ]
      },
      {
        "area": "people, authority, and state",
        "state": "partial",
        "note": "Membership, assignment, delivery acceptance, payer and provider roles inspected in source; complete authorization matrix remains unverified.",
        "evidence": [
          "SRC_AUTHORITY_CODE",
          "SRC_DOMAIN_CODE",
          "SRC_ECONOMICS_CODE"
        ]
      },
      {
        "area": "surfaces and integrations",
        "state": "partial",
        "note": "Public structured facts, MCP boundary, Calendar synchronization and GBP rights/retention researched; actual live grants/renewal unverified.",
        "evidence": [
          "SRC_MCP_AUTH",
          "SRC_GBP_POLICY",
          "SRC_CALENDAR_SYNC"
        ]
      },
      {
        "area": "capabilities and composition",
        "state": "partial",
        "note": "Bounded app releases/standing investigations inspected; fact-publication, method upgrade and independent native-tool compositions proposed, not executed.",
        "evidence": [
          "SRC_DOMAIN_CODE",
          "SRC_EXECUTION_CODE"
        ]
      },
      {
        "area": "responsibilities and outcomes",
        "state": "partial",
        "note": "Finite completion and maintained condition separated; windowed health and recovery contract proposed; actual service measurements absent.",
        "evidence": [
          "SRC_CONTEXT_CURRENT",
          "SRC_EXECUTION_CODE"
        ]
      },
      {
        "area": "offerings and promises",
        "state": "partial",
        "note": "Current installation and provider acceptance source inspected; upgraded method distribution and new promises remain proposals.",
        "evidence": [
          "SRC_DOMAIN_CODE",
          "SRC_PARTNER_CHARTER"
        ]
      },
      {
        "area": "economics and distribution",
        "state": "partial",
        "note": "Accepted agency charter and explicit local economics schema mapped; uptake, rates, actual margin and exception costs remain unknown.",
        "evidence": [
          "SRC_PARTNER_CHARTER",
          "SRC_ECONOMICS_CODE"
        ]
      },
      {
        "area": "Systems product primitives and lineage",
        "state": "partial",
        "note": "Founder-selected nouns captured (chat-only; ADR 0011 proposed). Spine, Possibilities/Make real, Versions and health exist locally on transition/systems with shared SystemRef, unmerged and with open defects. Evolution, extraction, real-provider activation and adoption unproven.",
        "evidence": [
          "SRC_SYSTEMS_DIRECTION",
          "SRC_SYSTEMS_FOOTHOLDS",
          "SRC_SYSTEMS_CHALLENGE",
          "SRC_SYSTEMS_INTEGRATION",
          "SRC_AUDIT_LATENT",
          "SRC_ADR_0011"
        ]
      },
      {
        "area": "live tenant business",
        "state": "partial",
        "note": "Managed websites, /api/v1, client repos, Stripe, operator console, crons, proxy auth and website agent recorded from code and the Sept 30 release record. Which nine tenants pay, actual lead volume/loss and post-Sept-30 production state unknown.",
        "evidence": [
          "SRC_SEPT30_RELEASE",
          "SRC_AUDIT_WEBSITES",
          "SRC_AUDIT_PLATFORM",
          "SRC_AUDIT_CUSTOMER_OPS"
        ]
      },
      {
        "area": "product inventory and verdicts",
        "state": "partial",
        "note": "16 previously unmodeled products recorded with audit verdicts. Not yet nodes: workspace inquiries product, v1 website builder, agency website drafts, managed presence, platform customers, service requests, agent access, workspace exit/export.",
        "evidence": [
          "SRC_AUDIT_WEBSITES",
          "SRC_AUDIT_APPS",
          "SRC_AUDIT_CUSTOMER_OPS",
          "SRC_AUDIT_PLATFORM"
        ]
      }
    ]
  },
  "sources": [
    {
      "id": "SRC_REBORN",
      "kind": "doc",
      "locator": "docs/product/strelva-reborn.md on origin/main (ff817d86); absent from local main ab4f8a20",
      "observed_at": "2026-10-02",
      "claim": "Reborn plan, 48 lines; production counts from Sept 30 record: 0 workspaces, 0 tenant memberships, 1 sign-in in 30 days",
      "previous_locator": "docs/product/strelva-reborn.md (main)",
      "locator_corrected": {
        "revision": 5,
        "at": "2026-10-05",
        "source": "SRC_AUDIT_LATENT"
      }
    },
    {
      "id": "SRC_REBORN_BR",
      "kind": "git",
      "locator": "REB-reborn branch reborn-business-record, business record commit 40aa1f9e; branch head 276bb09a (origin/reborn-business-record, PR #210)",
      "observed_at": "2026-10-02",
      "claim": "Business record and convert_tenant_to_business built; proven in check:workspace-sql locally; not applied to Supabase",
      "previous_locator": "REB-reborn branch reborn-business-record commit 40aa1f9e",
      "locator_corrected": {
        "revision": 5,
        "at": "2026-10-05",
        "source": "SRC_AUDIT_LATENT"
      }
    },
    {
      "id": "SRC_BR_MIG",
      "kind": "code",
      "locator": "REB-reborn supabase/migrations/20261002120000_business_record.sql",
      "observed_at": "2026-10-02",
      "claim": "Fact keys limited to legal_name, display_name, phone, email, address, service_area, hours, links, description, owner_recipient; business_contacts dedup on (workspace_id,email) and (workspace_id,phone_key); tenant_workspace_links"
    },
    {
      "id": "SRC_PRIMS",
      "kind": "doc",
      "locator": "REB-reborn docs/research/strelva-primitives-2026-10-02.md",
      "observed_at": "2026-10-02",
      "claim": "Research proposal: nine primitives; recommends policy/availability record types and action ledger before 1.0"
    },
    {
      "id": "SRC_PROGRESS",
      "kind": "command",
      "locator": "pnpm reborn:progress on nav-three-places, 2026-10-02",
      "observed_at": "2026-10-02",
      "claim": "business_record table false on main; 98 workspace files import @/lib; 12 direct model call sites"
    },
    {
      "id": "SRC_LEADS",
      "kind": "code",
      "locator": "src/app/api/v1/leads/[tenant]/route.ts; src/lib/leads.ts:18,151-153; supabase/migrations/20260911100000_inquiry_capability_workspace.sql:34-50",
      "observed_at": "2026-10-02",
      "claim": "Leads stored only in Redis, lead:{tenant}:{id} 90-day TTL, leads:{tenant} capped 500; Postgres overlays hold only status/assignee; no caller of upsertBusinessContacts"
    },
    {
      "id": "SRC_OWNER_MSG",
      "kind": "code",
      "locator": "src/lib/email/send.ts:63-77; src/lib/email-enabled.ts:15; src/lib/delivery-email.ts:285; src/lib/approve-link.ts; src/app/api/approve/route.ts",
      "observed_at": "2026-10-02",
      "claim": "Owner email gated by EMAIL_SENDING_ENABLED (default off) or per-tenant override; new-lead email sent without tenantId so override can't enable it; HMAC one-click approve links exist, used only by Google review-reply alert"
    },
    {
      "id": "SRC_AGENT_READY",
      "kind": "code",
      "locator": "src/products/websites/site-seo.ts:34-50 (origin/main only; absent from local main); src/app/(public)/layout.tsx:76-205; src/app/api/v1/bookings/[tenant]/; src/app/robots.ts:8",
      "observed_at": "2026-10-02",
      "claim": "Hosted-site JSON-LD has no hours, no Service/Offer/ReserveAction; template JSON-LD regex-parses hours, hardcodes priceRange; public booking API idempotent via requestId but needs internal capabilityId and /api/ is disallowed in robots; no llms.txt on hosted sites, no MCP",
      "previous_locator": "src/products/websites/site-seo.ts:34-50; src/app/(public)/layout.tsx:76-205; src/app/api/v1/bookings/[tenant]/; src/app/robots.ts:8",
      "locator_corrected": {
        "revision": 5,
        "at": "2026-10-05",
        "source": "SRC_AUDIT_LATENT"
      }
    },
    {
      "id": "SRC_REVIVAL_BLUEPRINT",
      "kind": "doc",
      "locator": "docs/research/strelva-revival-domain-model-2026-10-02.md",
      "observed_at": "2026-10-02",
      "claim": "Research proposal for semantic primitives, typed domain ownership, transition contracts and staged proofs. Not normative architecture or a runtime verification."
    },
    {
      "id": "SRC_CONTEXT_CURRENT",
      "kind": "doc",
      "locator": "CONTEXT.md; ../CONTEXT.md; docs/product/strelva-reborn.md",
      "observed_at": "2026-10-02",
      "claim": "Selected managed-client default and workspace revival; native tools remain independent of website purchases; requests are not accepted commitments. Production figures are historical release-record figures, not freshly measured."
    },
    {
      "id": "SRC_PARTNER_CHARTER",
      "kind": "doc",
      "locator": "../docs/adr/0010-make-agencies-creators-and-channel-under-a-partner-charter.md",
      "observed_at": "2026-10-02",
      "claim": "Accepted agency channel direction; business ownership, distinct provider/creator/attribution roles, per-business qualification, and methods free of customer data, secrets and grants. No rates or payout implementation established."
    },
    {
      "id": "SRC_RECORD_CURRENT",
      "kind": "code",
      "locator": "../REB-reborn/src/platform/business-record/contracts.ts; ../REB-reborn/src/platform/business-record/repository.ts; branch reborn-business-record at observed worktree HEAD 276bb09a",
      "observed_at": "2026-10-02",
      "claim": "Source present in a separate worktree: typed profile facts, services, people, contacts, source/verified flags and revisions. Fact subjects are workspace-level; no policy or capacity primitive was found in the inspected contract. No tests rerun or production operation observed."
    },
    {
      "id": "SRC_DOMAIN_CODE",
      "kind": "code",
      "locator": "src/platform/offerings/types.ts; src/platform/offerings/provider-delivery.ts; src/products/applications/domain.ts; src/platform/workspaces/types.ts",
      "observed_at": "2026-10-02",
      "claim": "Local source distinguishes pinned offering installation/native resource bindings, requested/accepted/revoked provider delivery, and app candidates/releases with compatibility checks. This does not establish customer operation."
    },
    {
      "id": "SRC_AUTHORITY_CODE",
      "kind": "code",
      "locator": "src/platform/work-participation/assignments.ts; src/platform/work-context/authority.ts; src/platform/work-participation/service.ts",
      "observed_at": "2026-10-02",
      "claim": "Local source has distinct operational assignment offers, accepted/revoked states, contribution scopes, and authority ports requiring current checks. No claim of a universal grant implementation."
    },
    {
      "id": "SRC_ECONOMICS_CODE",
      "kind": "code",
      "locator": "src/platform/work-economics/types.ts; src/platform/work-economics/payer-transitions.ts",
      "observed_at": "2026-10-02",
      "claim": "Local schemas separate payer, accepted budget, reservation, usage and settlement; core ledger comment explicitly says no Stripe charge or paid-provider invocation. Presence is not live billing proof."
    },
    {
      "id": "SRC_EXECUTION_CODE",
      "kind": "code",
      "locator": "src/platform/work-execution/engine.ts; src/platform/work-execution/standing.ts; docs/architecture/ontology-phase2-governed-work.md",
      "observed_at": "2026-10-02",
      "claim": "Finite bounded execution exists in source; standing scope validates investigation.run only; governed outcomes distinguish accepted write success from read-back verified. No general autonomous operation inferred."
    },
    {
      "id": "SRC_PALANTIR",
      "kind": "web",
      "locator": "https://www.palantir.com/docs/foundry/ontology/ontology-anti-patterns",
      "observed_at": "2026-10-02",
      "claim": "Primary design guidance distinguishes source-specific types, universal objects and CRUD-sized actions as anti-patterns; architectural inspiration only."
    },
    {
      "id": "SRC_FRAPPE",
      "kind": "web",
      "locator": "https://docs.frappe.io/framework/user/en/basics/doctypes",
      "observed_at": "2026-10-02",
      "claim": "Primary DocType documentation demonstrates metadata-backed records and generated behavior; does not imply Strelva adopts the framework."
    },
    {
      "id": "SRC_TEMPORAL",
      "kind": "web",
      "locator": "https://temporal.io/blog/idempotency-and-durable-execution",
      "observed_at": "2026-10-02",
      "claim": "Primary engineering explanation of idempotency with durable execution; workflow durability does not eliminate duplicate external effects."
    },
    {
      "id": "SRC_HIGHLEVEL",
      "kind": "web",
      "locator": "https://help.gohighlevel.com/support/solutions/articles/48000982511-snapshots-overview",
      "observed_at": "2026-10-02",
      "claim": "Current primary documentation describes selective updates and linked assets; live contacts, appointments, connections and assigned phone numbers do not transfer. Copy-only characterization is too broad."
    },
    {
      "id": "SRC_DATAVERSE",
      "kind": "web",
      "locator": "https://learn.microsoft.com/en-us/power-platform/alm/solution-layers-alm",
      "observed_at": "2026-10-02",
      "claim": "Primary docs describe component-level managed/unmanaged layering, override and merge behavior; supports explicitly modeled ownership precedence."
    },
    {
      "id": "SRC_MCP_AUTH",
      "kind": "web",
      "locator": "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization",
      "observed_at": "2026-10-02",
      "claim": "Protocol authorization and resource-bound access are distinct from business mandates, outside-provider rights and completion. Refresh token issuance is discretionary."
    },
    {
      "id": "SRC_GBP_POLICY",
      "kind": "web",
      "locator": "https://developers.google.com/my-business/content/policies",
      "observed_at": "2026-10-02",
      "claim": "Current documented restrictions include indirect third-party programmatic access through a provider project; prior specific express consent for own automation; limited temporary performance content storage up to 30 days with additional restrictions. Not a legal determination or current-compliance audit."
    },
    {
      "id": "SRC_CALENDAR_SYNC",
      "kind": "web",
      "locator": "https://developers.google.com/workspace/calendar/api/guides/sync",
      "observed_at": "2026-10-02",
      "claim": "Primary docs: incremental sync with persisted cursors, pagination and deleted entries; invalid tokens return 410 requiring full resync of the provider projection, not deletion of business-owned bookings."
    },
    {
      "id": "SRC_CALENDAR_AUTH",
      "kind": "web",
      "locator": "https://developers.google.com/workspace/calendar/api/auth",
      "observed_at": "2026-10-02",
      "claim": "Primary docs: explicit user-approved scopes with narrow permission selection; event/calendar access does not create business booking authority."
    },
    {
      "id": "SRC_SCHEMA_RESERVE",
      "kind": "web",
      "locator": "https://schema.org/ReserveAction",
      "observed_at": "2026-10-02",
      "claim": "Public semantic reservation vocabulary; does not demonstrate discovery, agent traffic or successful reservations for Strelva."
    },
    {
      "id": "SRC_PRIMITIVE_DEBATE",
      "kind": "analysis",
      "locator": "PRODUCT_MODEL.md revision 3: DESIGN_SHARED_GRAMMAR; .product/views/primitive-debate.mmd",
      "observed_at": "2026-10-02",
      "claim": "Proposed classification from revision-2 evidence and an independent architecture challenge. Nine families group distinct contracts; graph is a projection. No new operational or demand evidence."
    },
    {
      "id": "SRC_SYSTEMS_DIRECTION",
      "kind": "owner_statement",
      "locator": "User message in this thread, 2026-10-04, beginning \"i instead think of soemthign liek this $latent\" and the supplied Strelva Systems model",
      "observed_at": "2026-10-04",
      "claim": "Founder selects Systems, Connections, Possibilities and Versions as the foundational product model, with Make/Connect/Explore/Make real/Version verbs, identity-preserving evolution, connected Systems, experiential alternatives and contextual lineage. This establishes intent, not general runtime capability, customer demand, low cost, pricing or commercial consent.",
      "addenda": [
        {
          "revision": 5,
          "at": "2026-10-05",
          "source": "SRC_AUDIT_LATENT",
          "note": "Chat-only evidence. Nothing durable shows which words were Jacob's; ADR 0011 (SRC_ADR_0011) is proposed. Treat it as confirming the four nouns and five verbs as founder direction only; detailed kinds and lifecycles are proposed."
        }
      ]
    },
    {
      "id": "SRC_SYSTEMS_FOOTHOLDS",
      "kind": "code",
      "locator": "src/products/applications/domain.ts: ApplicationState, compatibilityChecks, publishCandidate, rollbackRelease, applyLegacyApplicationCommand/adopt_update; src/platform/offerings/types.ts: OfferingInstallationRecord",
      "observed_at": "2026-10-04",
      "claim": "Current local source separates app candidate/release state, validates records and blocks conflicting upstream/local updates; offering installations pin definitions and native resources. This is a bounded implementation foothold, not a general System/Version/Possibility runtime; no runtime tests were rerun.",
      "addenda": [
        {
          "revision": 5,
          "at": "2026-10-05",
          "source": "SRC_AUDIT_APPS",
          "note": "The original claim's 'no runtime tests were rerun' was true at observation. On 2026-10-04 the apps lane tests were rerun locally: 339/339 pass, typecheck passes; application-use-authenticated-local runs in CI. Production use remains zero."
        }
      ]
    },
    {
      "id": "SRC_SYSTEMS_CHALLENGE",
      "kind": "analysis",
      "locator": "2026-10-04 latent analysis in this thread and primitive_challenge child review; recorded in COMP_MULTI_SYSTEM_ACTIVATION and RULE_CONTEXT_VERSION_IDENTITY",
      "observed_at": "2026-10-04",
      "claim": "Supporting design critique identifies stable customer object identity, separate revision/context semantics, local client bindings, proposed grouped activation, accepted-effect recovery and dependency/health rules. Analysis supplies proposed contracts, not operational proof."
    },
    {
      "id": "SRC_AUDIT_LATENT",
      "kind": "audit",
      "locator": "output/product-audit-2026-10-04/latent-and-runs.md",
      "observed_at": "2026-10-04",
      "claim": "Read-only audit of the model and six transition runs: re-ran all branch test counts (spine 36/36 + full 4018, make-real 11/11, versions 33/33 with 15/17 mutations killed, health 24/24); found four incompatible System ref shapes, five ranked defects with file:line, chat-only confirmation of the Systems nouns, stale locators, orphan nodes and redundant primitives. Local evidence only."
    },
    {
      "id": "SRC_AUDIT_WEBSITES",
      "kind": "audit",
      "locator": "output/product-audit-2026-10-04/websites.md",
      "observed_at": "2026-10-04",
      "claim": "Websites lane audit on REB-audit 276bb09a: tenant websites, /api/v1, domain monitor, /audit and /ai-visibility LIVE; rebuild/v2 documents/hosted publishing WORKS-LOCALLY (merged on origin/main, flag off, 3 unapplied migrations, no model composer wired); release-manifest covers 2/9 repos; pin verification 4/58 fail. 579 lane tests pass locally."
    },
    {
      "id": "SRC_AUDIT_CUSTOMER_OPS",
      "kind": "audit",
      "locator": "output/product-audit-2026-10-04/customer-ops.md",
      "observed_at": "2026-10-04",
      "claim": "Customer-ops lane audit: /api/v1/leads LIVE but Redis-only (90-day TTL, 500 cap), owner notice cannot arm (no tenantId), no operator view of client leads; workspace inquiries dark (flag unset); public v1 booking unreachable in production (four prerequisites absent); schedule history cap ~125 bookings; documents locks after 200 edits (probe-confirmed); business_contacts dedup has 0 callers. 677 lane tests pass locally."
    },
    {
      "id": "SRC_AUDIT_APPS",
      "kind": "audit",
      "locator": "output/product-audit-2026-10-04/apps.md",
      "observed_at": "2026-10-04",
      "claim": "Apps lane audit: native apps, tracker, onboarding-adjacent work, work plans, investigations and operations SHIPPED-UNUSED (0 workspaces); custom-app builds need Docker and cannot run on Vercel; work plans gated by STRELVA_PLANNING_ENABLED; background work flag off so standing work never runs; product learning SCAFFOLD; Home Finder SCAFFOLD. 339/339 lane tests pass locally."
    },
    {
      "id": "SRC_AUDIT_PLATFORM",
      "kind": "audit",
      "locator": "output/product-audit-2026-10-04/platform.md",
      "observed_at": "2026-10-04",
      "claim": "Platform lane audit: proxy/tenant auth, Stripe webhook and pay links, 26 crons (24 deployed) and tenant operator console LIVE on src/lib; src/platform SHIPPED-UNUSED; business record WORKS-LOCALLY with 0 app readers; seven capability declarations and eleven work lifecycles; PRIM_CONNECTION vs PRIM_SYSTEM_CONNECTION naming collision. Full local suite 3,982 passed."
    },
    {
      "id": "SRC_SPINE",
      "kind": "git",
      "locator": "REB-sys-spine branch transition/spine commit 0d4a3de5 (src/platform/systems; Systems migration)",
      "observed_at": "2026-10-04",
      "claim": "System spine: systems, revisions, issued outputs and system_connections tables with RLS and actor-checked RPCs; 36/36 tests, SQL checks pass locally; Supabase store test mocks rpc; migration depends on the unapplied business_record migration. Unpushed."
    },
    {
      "id": "SRC_MAKE_REAL",
      "kind": "git",
      "locator": "REB-sys-make-real branch transition/make-real commit 821f60e0 (src/platform/possibilities, src/platform/make-real)",
      "observed_at": "2026-10-04",
      "claim": "Possibilities and Make real runner with isolated effect adapters; 11/11 tests against in-memory fakes; rollback ignores unknown steps (runner.ts:415). Unpushed."
    },
    {
      "id": "SRC_VERSIONS",
      "kind": "git",
      "locator": "REB-sys-versions branch transition/versions commit 147867b0 (src/platform/system-versions)",
      "observed_at": "2026-10-04",
      "claim": "Contextual Version lineage and three-way upstream adoption, in-memory; 33 tests, 15/17 mutations killed; whole-object override loss at service.ts:343. Unpushed."
    },
    {
      "id": "SRC_HEALTH",
      "kind": "git",
      "locator": "REB-sys-health branch transition/health commit 5b92f8d7 (src/platform/system-health; scheduling pause)",
      "observed_at": "2026-10-04",
      "claim": "System health derivation and schedule pause stored in saved_product_work.payload; 24 new tests; public booking path ignores pause (public-booking-server.ts:131-150). Unpushed."
    },
    {
      "id": "SRC_SYSTEMS_INTEGRATION",
      "kind": "git",
      "locator": "REB-sys-integrate branch transition/systems head b891b295; reconciliation commits 91295360 (Versions onto spine refs), fd75c252 (Make real on spine), 62f81a87 (health reads spine lifecycle/Connections); src/platform/system-versions/refs.ts; src/platform/possibilities/refs.ts",
      "observed_at": "2026-10-05",
      "claim": "Integrated result of the six 2026-10-04 branches. Versions and Possibilities re-export the spine's SystemRef/SystemRevisionRef (inspected); full suite 4084 passing locally per orchestrator report (not rerun in this update). Unpushed (0 transition/* heads on origin). A bug-fix pass on 9 audit defects was running at observation time; none recorded as fixed."
    },
    {
      "id": "SRC_TRANSITION_MAP",
      "kind": "doc",
      "locator": "REB-sys-integrate docs/product/systems-transition.md (branch transition/systems; authored on transition/map ef3b0080)",
      "observed_at": "2026-10-04",
      "claim": "Maps every platform/product/experience module onto Systems/Connections/Possibilities/Versions; lists 12 active tenant ids against nine live clients (which nine unsettled); Twin Trees one account, two sites; Responsibility and Requested work as missing nouns. Not production evidence; audits found some details wrong."
    },
    {
      "id": "SRC_ADR_0011",
      "kind": "doc",
      "locator": "../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md (untracked in the parent repo)",
      "observed_at": "2026-10-05",
      "claim": "Durable record of the Systems/Connections/Possibilities/Versions direction; front matter status: proposed, not accepted."
    },
    {
      "id": "SRC_SEPT30_RELEASE",
      "kind": "doc",
      "locator": "docs/strelvav2-horizontal-acceptance.md:1851 #september-30-workspace-production-release (local main ab4f8a20; at docs/operations/strelvav2-horizontal-acceptance.md on origin/main)",
      "observed_at": "2026-09-30",
      "claim": "Production release record: read-only migration list matched all 84 repository migrations through 20260921220000 plus 20260930120000 applied; 14 tenants (12 active), 0 workspaces, 0 tenant memberships, 1 sign-in in 30 days; STRELVA_WORKSPACE_RELEASE on; inquiries, background work, planning, product learning and customers flags unset; deploy dpl_7MEL5Bi7... from f41e9a6f."
    },
    {
      "id": "SRC_MODEL_STORAGE",
      "kind": "command",
      "locator": "git status --short / git check-ignore / git rev-list --count main..origin/main / git ls-remote --heads origin 'transition/*' in REB, 2026-10-05",
      "observed_at": "2026-10-05",
      "claim": "PRODUCT_MODEL.md and .product/ are untracked and not gitignored; local main is 7 commits behind origin/main (ff817d86); ADRs 0006-0011 untracked in the parent repo; no transition/* branch on origin."
    }
  ],
  "nodes": [
    {
      "id": "REL_REBORN",
      "type": "release",
      "label": "Strelva Reborn 1.0.0",
      "claim": "Goal: every client moved into a business workspace (1.0.0). State: nothing deployed; Oct 2 progress 3 of 48 lines done; the website rebuild is merged on origin/main (PR #209) but not deployed.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_REBORN",
        "SRC_AUDIT_LATENT",
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "previous_claim": "Every client moved into a business workspace; nothing deployed",
        "split": {
          "goal": "confirmed intent (SRC_REBORN)",
          "progress": "3/48 lines done Oct 2 (SRC_AUDIT_LATENT)",
          "deploy": "last production deploy is the Sept 30 release; vercel.json git.deploymentEnabled false"
        }
      }
    },
    {
      "id": "PRIM_BUSINESS_RECORD",
      "type": "primitive",
      "label": "Business record",
      "claim": "One record per workspace: typed facts with provenance, services, people, deduped contacts, immutable revisions and undo",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_REBORN_BR",
        "SRC_BR_MIG",
        "SRC_PROGRESS",
        "SRC_RECORD_CURRENT",
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "environment": "local only; migration unapplied",
        "current_inspection": "Separate reborn-business-record worktree at observed HEAD 276bb09a; typed contract remains a partial implementation, not current-branch or production proof.",
        "rev5": "0 non-test importers in src/app, src/products or src/experience; only conversion scripts call it; owner_recipient unused. Spine migration depends on it (D13)."
      }
    },
    {
      "id": "PRIM_TENANT_LINK",
      "type": "primitive",
      "label": "Tenant-workspace link",
      "claim": "tenant_workspace_links keyed on stable_id; tenant row untouched; survives rename and deprovision",
      "status": "confirmed",
      "lifecycle": "deprecated",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_BR_MIG",
        "SRC_REBORN_BR",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "reclassified_as": "migration state/capability of conversion",
        "reclassification": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "A migration mechanism, not a customer or domain primitive. Also one of three overlapping workspace-tenant link tables (offering_website_bindings, website_hosted_tenant_reservations); transition map recommends tenant_workspace_links as the one.",
          "basis": "SRC_AUDIT_LATENT consolidation table"
        }
      }
    },
    {
      "id": "CAP_CONVERT",
      "type": "capability",
      "label": "Convert tenant to business",
      "claim": "Strelva operator runs one atomic convert_tenant_to_business; dry run default; apply refuses non-local DB without explicit flag",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_REBORN_BR"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "missing": [
          "full unlink rollback",
          "scrubbed prod copy",
          "leads/bookings backfill"
        ]
      }
    },
    {
      "id": "STATE_LEADS_REDIS",
      "type": "state",
      "label": "Leads in Redis only",
      "claim": "Inspected lead code writes contents to Redis with a 90-day TTL and a 500-item index cap; this creates expiry/retention exposure. Actual production data loss is unmeasured.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_LEADS",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "evidence_scope": "Source evidence only; operating readiness from revision 1 was not supported by runtime evidence. Production behavior not freshly verified.",
        "rev5": "Re-confirmed in code (leads.ts:18-19,147-153). New hosted v2 sites (SiteLeadForm.tsx, site-lead-runtime.mjs) and every workspace public booking also post into it. The workspace inquiry System reads these same Redis records. See GAP_LEADS_UNSEEN."
      }
    },
    {
      "id": "CAP_CONTACT_DEDUP",
      "type": "capability",
      "label": "Contact upsert with dedup",
      "claim": "upsertBusinessContacts merges by email then phone_key, fills missing fields, unions sources incl. inquiry/booking/website",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_LEADS",
        "SRC_BR_MIG",
        "SRC_REBORN_BR",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "callers": 0,
        "realization_scope": "Exists only on branch reborn-business-record (276bb09a, PR #210); migration 20261002120000 unapplied; 0 callers, so leads and bookings never create a contact. Previously recorded as available."
      }
    },
    {
      "id": "RULE_EMAIL_GATE",
      "type": "rule",
      "label": "Client email gate",
      "claim": "Owner-facing mail sends only when EMAIL_SENDING_ENABLED=true or per-tenant override on",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_OWNER_MSG",
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "evidence_scope": "Source evidence only; operating readiness from revision 1 was not supported by runtime evidence. Production behavior not freshly verified.",
        "rev5_violation": "src/lib/newsletter.ts:60-62 is a second Resend transport that bypasses send.ts and picks a per-tenant resendDomain (one email path, no per-client domains)."
      }
    },
    {
      "id": "CAP_APPROVE_LINK",
      "type": "capability",
      "label": "One-click approve link",
      "claim": "HMAC-signed 14-day link scoped to event/tenant/action; GET shows confirm, POST resolves via resolveEventAction",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_OWNER_MSG"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "used_by": [
          "Google review-reply alert"
        ]
      }
    },
    {
      "id": "RULE_OWNER_RECIPIENT",
      "type": "rule",
      "label": "Owner-recipient rule",
      "claim": "Owner notices resolve recipient from business record owner_recipient, falling back to tenants.owner_email",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_REBORN_BR",
        "SRC_BR_MIG"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "note": "resolver exists; no notice uses it"
      }
    },
    {
      "id": "CAP_BOOKING_API",
      "type": "capability",
      "label": "Public booking API",
      "claim": "Unauthenticated, CORS-open slot read and idempotent reservation with readback",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AGENT_READY",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "limits": [
          "needs internal capabilityId",
          "/api/ disallowed in robots",
          "not advertised in JSON-LD"
        ],
        "evidence_scope": "Source evidence only; operating readiness from revision 1 was not supported by runtime evidence. Production behavior not freshly verified.",
        "production_reachability": "Deployed but unreachable in production: a public booking needs a workspace grant, a published inquiry capability (creatable only with STRELVA_INQUIRIES_RELEASE, unset), a connected Google/Outlook calendar and an inquiry capture (public-booking-server.ts:178-276). All four are absent.",
        "limits_rev5": [
          "No native-only booking: a calendar provider is mandatory",
          "Availability is <=100 absolute ISO intervals; no weekly hours, services, buffers or lead time",
          "Schedule is one JSON row: reservations max 1000, history max 500, ~4 history entries per synced booking, so writes fail after roughly 125 bookings",
          "Every public booking is also captured as a Redis lead (90-day TTL)",
          "Health-branch pause is ignored by the public path (RISK_PUBLIC_BOOKING_PAUSE)"
        ]
      }
    },
    {
      "id": "SURF_JSONLD",
      "type": "surface",
      "label": "Structured business data on client sites",
      "claim": "Hosted JSON-LD lacks hours, services, offers, reserve action; template parses free text",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AGENT_READY"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "GAP_POLICY_AVAIL",
      "type": "gap",
      "label": "Policy and availability facts missing",
      "claim": "Inspected business fact contract has hours and services but no separate policy or bookable-capacity model; those rules remain in booking domains and are not unified.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "absent",
      "evidence": [
        "SRC_BR_MIG",
        "SRC_PRIMS",
        "SRC_RECORD_CURRENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "UNK_EMAIL_PROD",
      "type": "unknown",
      "label": "Is client email on in production?",
      "claim": "If EMAIL_SENDING_ENABLED is off, owners currently receive no lead, review or report mail",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "unknown",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "Gate defaults off and Reborn lists turning it on as needing Jacob's yes",
      "premise_ids": [
        "RULE_EMAIL_GATE",
        "SRC_REBORN"
      ],
      "details": {
        "partial_evidence": [
          "docs/architecture/operator-command-center.md:225 lists the Client audience as Paused (doc, not a production read)",
          "docs/operations/client-onboarding.md:136 records client email paused",
          "sendNewLeadEmail is called without tenantId (delivery-email.ts:283-300), so a per-tenant override cannot arm the owner notice",
          "McClear's, Leslie and RHM repos send owner form mail directly through Resend (custom-repo-starter/form-route.template.tsx); REB never sees it"
        ]
      }
    },
    {
      "id": "COMP_LEADS_TO_RECORD",
      "type": "composition",
      "label": "Leads land in the business record",
      "claim": "Bundle an inquiries table (keyed tenant stable_id, nullable workspace) into the unapplied business-record migration; lead route dual-writes contents and calls contact upsert",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [],
      "rationale": "Section 0 and section 1 both need a migration yes; the business-record migration is unapplied so one migration and one approval covers both, and contact dedup already exists",
      "premise_ids": [
        "STATE_LEADS_REDIS",
        "CAP_CONTACT_DEDUP",
        "PRIM_BUSINESS_RECORD"
      ],
      "details": {
        "validation": "SQL check proves lead row + contact merge; contract test proves /api/v1/leads response unchanged; pnpm check:custom-repos"
      }
    },
    {
      "id": "COMP_OWNER_BY_EMAIL",
      "type": "composition",
      "label": "Run the workspace from the inbox",
      "claim": "Every owner notice (lead, booking, change preview, report) carries approve/reply links reusing approve-link, recipient from owner-recipient rule",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [],
      "rationale": "Approve-link machinery exists and is proven on review replies; 1 sign-in in 30 days means email is the actual owner surface",
      "premise_ids": [
        "CAP_APPROVE_LINK",
        "RULE_OWNER_RECIPIENT",
        "RULE_EMAIL_GATE"
      ],
      "details": {
        "validation": "Local journey: lead email → approve link → action recorded; failure tests for expired/replayed token",
        "blocked_by": "UNK_EMAIL_PROD"
      }
    },
    {
      "id": "COMP_AGENT_READABLE",
      "type": "composition",
      "label": "Every converted business answerable by AI agents",
      "claim": "Generate schema.org (hours, Service/Offer, ReserveAction to booking API) and llms.txt from the business record on every hosted site",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [],
      "rationale": "Facts and services now have one typed home with provenance; booking API is already idempotent; JSON-LD generator exists but reads the wrong source",
      "premise_ids": [
        "PRIM_BUSINESS_RECORD",
        "CAP_BOOKING_API",
        "SURF_JSONLD",
        "GAP_POLICY_AVAIL"
      ],
      "details": {
        "validation": "Rich Results test on a local hosted render; AI visibility score before/after on gldf fixture",
        "not_in_reborn_scope_yet": true,
        "distribution_limit": "Schema.org/MCP availability does not prove discovery or agent traffic. Expose only permitted business-owned facts and bounded public operations; generic GBP proxy is constrained by provider policy."
      }
    },
    {
      "id": "BOTTLENECK_PROD_YES",
      "type": "constraint",
      "label": "Production gates",
      "claim": "Production migrations, activation and client conversion need Jacob approval; local research, contract design and isolated implementation can proceed without that production approval.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "blocked",
      "evidence": [
        "SRC_REBORN_BR",
        "SRC_REBORN"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "PRIM_BUSINESS",
      "type": "primitive",
      "label": "Business",
      "claim": "Business is the ownership/isolation root for its record, while payer, provider, agency attribution and actors are separate relationships.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_CONTEXT_CURRENT",
        "SRC_PARTNER_CHARTER",
        "SRC_ECONOMICS_CODE",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "selected_product_context": {
          "source": "SRC_SYSTEMS_DIRECTION",
          "role": "Shared ownership/world around Systems; payer/provider/grants retain independent meaning."
        },
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "workspaces table (the Business root), memberships, saved_product_work"
      }
    },
    {
      "id": "PRIM_RECORD_REF",
      "type": "primitive",
      "label": "Typed record reference",
      "claim": "A common business/kind/id/revision reference links typed domain records without requiring a universal mutable records table.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_RECORD_CURRENT",
        "SRC_DOMAIN_CODE",
        "SRC_PALANTIR",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "superseded_by": [
          "PRIM_SYSTEM"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Spine SystemRevisionRef + implementation.ref is this reference.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_FACT_ASSERTION",
      "type": "primitive",
      "label": "Fact assertion",
      "claim": "A fact identifies its subject, value, provenance, verifier, effective time and allowed use; imported text is a candidate until authorized.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_RECORD_CURRENT",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "gap": "Current source/verified/revision fields are a foothold, not full per-field evidence/effective-time or location semantics.",
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "primitive_debate": {
          "classification": "specialized record",
          "reason": "Provenance and effective-time justify fact assertions for selected facts; not every domain field becomes an independently verified assertion.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "superseded_by": [
          "PRIM_BUSINESS_RECORD"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Field-level contract of the business record.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_RESOURCE",
      "type": "primitive",
      "label": "Resource",
      "claim": "Persistent websites, calendars, apps, staff and locations retain lifecycle, domain ownership and health independently of installations.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_DOMAIN_CODE",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "primitive_debate": {
          "classification": "domain role",
          "reason": "Resource is a behavior of a typed domain record; avoid a second universal ID/storage hierarchy.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "superseded_by": [
          "PRIM_SYSTEM",
          "PRIM_SYSTEM_CONNECTION",
          "PRIM_CONNECTION"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Websites/apps/calendars are Systems; accounts, domains and staff are Connection targets.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_AVAILABILITY",
      "type": "primitive",
      "label": "Availability and reservation policy",
      "claim": "Open hours differ from bookable capacity; service/resource binding, buffers, lead time, timezone, exceptions and conflicts are domain constraints.",
      "status": "proposed",
      "lifecycle": "deprecated",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_RECORD_CURRENT",
        "SRC_AUDIT_LATENT",
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Consolidate and prove both booking paths against concurrent reservation, overrides, lead time and DST cases.",
        "primitive_debate": {
          "classification": "domain rule/model",
          "reason": "Reservation invariants stay in scheduling; general record shape cannot express away capacity or timezone rules.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "reclassified_as": "scheduling domain rule",
        "reclassification": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "A domain invariant, not a shared noun. Workspace scheduling has only <=100 absolute intervals; the legacy tenant weekly-hours model is richer.",
          "basis": "SRC_AUDIT_LATENT consolidation table"
        }
      }
    },
    {
      "id": "PRIM_FINITE_WORK",
      "type": "primitive",
      "label": "Finite Work",
      "claim": "A requested result preserves scope, explicit acceptance, completion-rule version, result and dispute independently of its action/event timeline.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_CONTEXT_CURRENT",
        "SRC_DOMAIN_CODE",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove a multi-action website job completes under one scope and can establish a separate ongoing responsibility.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "service_requests + delivery commitments, work-execution finite jobs",
        "consolidation": "Keep as one Commitment family under Systems. The transition map names Requested work and Responsibility as real nouns the four do not cover."
      }
    },
    {
      "id": "PRIM_OPERATION",
      "type": "primitive",
      "label": "Operation and invocation",
      "claim": "Named versioned business commands bind inputs, current authority, revision preconditions, risk and stable idempotency identity.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_EXECUTION_CODE",
        "SRC_PALANTIR",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "superseded_by": [
          "DESIGN_EXECUTION"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Runtime mechanism owned by work-execution.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_DECISION_GRANT",
      "type": "primitive",
      "label": "Decision and grant",
      "claim": "Decisions bind exact proposal versions; grants bind actor, business, records, operation, purpose and time; execution rechecks revocation.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUTHORITY_CODE",
        "SRC_EXECUTION_CODE",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "workspace grants, governed-work proposals/decisions, work-execution approvals"
      }
    },
    {
      "id": "PRIM_CONNECTION",
      "type": "integration",
      "label": "External account binding",
      "claim": "An external account binding has scopes, selected resources, secret reference, health, renewal, provider rights and retention; no implied mandate.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_GBP_POLICY",
        "SRC_CALENDAR_AUTH",
        "SRC_MCP_AUTH",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_SEPT30_RELEASE",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "previous_label": "Connection contract",
        "term_distinction": "Not the customer noun. PRIM_CONNECTION = credentials/scopes/health of one outside account (Google, Outlook, domain claim). PRIM_SYSTEM_CONNECTION = a typed relation a System has (read/act/appear/share/depend/trigger); an external account is one of its targets via spine account_binding.",
        "current_stores": [
          "Redis connections:{tenant}:{provider} (tenant Google tokens, only copy, live)",
          "workspace_calendar_connections (Postgres, encrypted; deployed schema, 0 users)",
          "domain_claims",
          "integration-registry.ts status"
        ],
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships. Tenant Google tokens in Redis serve live review features; live ingestion per tenant unverified."
      }
    },
    {
      "id": "PRIM_EVENT_OUTBOX",
      "type": "primitive",
      "label": "Event and delivery",
      "claim": "Local state changes commit durable events atomically; deliveries are at least once with consumer deduplication and reconciliation.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_TEMPORAL",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Crash between DB commit and delivery, duplicate delivery and revoke access before a retried handler; verify no lost or duplicate semantic effects.",
        "primitive_debate": {
          "classification": "shared runtime mechanism",
          "reason": "Events trigger and correlate work but are not verification, contractual acceptance or a new universal customer object.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "superseded_by": [
          "DESIGN_EXECUTION"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Runtime mechanism owned by work-execution.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_PROCEDURE_RUN",
      "type": "primitive",
      "label": "Procedure and run",
      "claim": "Reusable immutable procedures and business-scoped runs are separate; runs pin versions and checkpoint waits, effects and recovery.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_EXECUTION_CODE",
        "SRC_TEMPORAL",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "primitive_debate": {
          "classification": "definition/execution specializations",
          "reason": "Procedure belongs within reusable delivery definition; run retains pinned versions and execution history.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "superseded_by": [
          "DESIGN_EXECUTION"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Runtime mechanism owned by work-execution.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_RECEIPT_OBSERVATION",
      "type": "primitive",
      "label": "Receipt and observation",
      "claim": "Provider acceptance, verification and health observation are separate records/states with provenance, environment, freshness and permissible retention.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_EXECUTION_CODE",
        "SRC_GBP_POLICY",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "trusted/precise provider receipts, calendar event receipts, website document receipts",
        "consolidation": "Keep and make canonical: health observations and make-real receipts both reinvented it (SRC_AUDIT_LATENT)."
      }
    },
    {
      "id": "PRIM_PROVIDER_COMMITMENT",
      "type": "primitive",
      "label": "Provider commitment",
      "claim": "Provider identity and an accepted delivery obligation cannot be replaced by a permission grant.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_DOMAIN_CODE",
        "SRC_PARTNER_CHARTER",
        "SRC_AUDIT_LATENT",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "scope": "Source and accepted direction only; not proof of an operating provider agreement.",
        "consolidation": "Keep as one Commitment family under Systems. The transition map names Requested work and Responsibility as real nouns the four do not cover."
      }
    },
    {
      "id": "PRIM_ONGOING_RESP",
      "type": "responsibility",
      "label": "Maintained responsibility",
      "claim": "An accepted condition has named resources, terms, start/end, observation window, exception owner, recovery and health; stale observations cannot prove it was kept.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_CONTEXT_CURRENT",
        "SRC_EXECUTION_CODE",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove a named maintained condition, suppressed/late observation, breach and human recovery without conflating customer approval with provider acceptance.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "standing_responsibilities, service_delivery_commitments (standing work cannot run: STRELVA_BACKGROUND_WORK_RELEASE unset)",
        "consolidation": "Keep as one Commitment family under Systems. The transition map names Requested work and Responsibility as real nouns the four do not cover."
      }
    },
    {
      "id": "PRIM_OFFERING_METHOD_INSTALL",
      "type": "primitive",
      "label": "Offering, method and installation",
      "claim": "Offering packages a customer result, method authors reusable delivery, installation binds immutable versions to business resources and overrides.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_DOMAIN_CODE",
        "SRC_PARTNER_CHARTER",
        "SRC_HIGHLEVEL",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "primitive_debate": {
          "classification": "family of distinct contracts",
          "reason": "Offering is commercial packaging; method and installation are delivery definition and business binding, with independent changes.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "superseded_by": [
          "PRIM_METHOD_DEFINITION",
          "PRIM_METHOD_INSTALLATION",
          "PRIM_CONTEXT_VERSION"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Revision 3 split it into definition + installation but left the parent active, an exact duplicate; both halves now fold into PRIM_CONTEXT_VERSION.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_ECONOMIC_AGREEMENT",
      "type": "economic",
      "label": "Economic agreement and attribution",
      "claim": "Payer, accepted price/allowance, service commitment, usage, creator royalty and referral attribution remain distinct; access changes do not silently rewrite them.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_ECONOMICS_CODE",
        "SRC_PARTNER_CHARTER",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "primitive_debate": {
          "classification": "commercial authority",
          "reason": "Keep payer, price, allowance and attribution as explicit financial/relationship contracts; do not replace them with generic grants.",
          "design_id": "DESIGN_SHARED_GRAMMAR",
          "status": "proposed"
        },
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "work_allowances, payer transitions, job_economics (11 money tables; live Stripe webhook's allowance sync returns null without workspaceId metadata)"
      }
    },
    {
      "id": "DESIGN_TYPED_DOMAINS",
      "type": "architecture",
      "label": "Typed domains with shared references",
      "claim": "Use typed Postgres domain stores and a shared business/reference/command contract; bounded custom schemas extend apps without replacing booking, permission or money invariants.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "stale",
      "realization": "planned",
      "evidence": [
        "SRC_REVIVAL_BLUEPRINT",
        "SRC_PALANTIR",
        "SRC_FRAPPE",
        "SRC_RECORD_CURRENT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness.",
        "presentation_role": {
          "role": "Supporting internal architecture, not the primary customer mental model",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL",
          "source": "SRC_SYSTEMS_DIRECTION",
          "prior_graphs": "Historical views of execution contracts; not a competing product taxonomy."
        },
        "stale_reason": {
          "revision": 5,
          "reason": "Uses/preserves PRIM_RECORD_REF and PRIM_OPERATION, superseded in revision 5."
        }
      }
    },
    {
      "id": "RULE_WRITE_ACCEPTANCE",
      "type": "rule",
      "label": "Accepted write is consumed",
      "claim": "Governed-work documentation explicitly consumes accepted outside writes separately from read-back; verification failure is not authorization to repeat the effect.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "not_applicable",
      "evidence": [
        "SRC_EXECUTION_CODE"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "scope": "Documented invariant, not a runtime audit of every provider adapter."
      }
    },
    {
      "id": "RULE_CONNECTOR_RIGHTS",
      "type": "rule",
      "label": "Provider rights constrain connections",
      "claim": "GBP policy imposes documented programmatic-access and provider-content storage limits; connection permission alone does not establish permitted redistribution or permanent storage.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "not_applicable",
      "evidence": [
        "SRC_GBP_POLICY"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "CAP_APP_SCHEMAS",
      "type": "capability",
      "label": "Bounded application schema releases",
      "claim": "Local application source validates candidate fields and compatibility with existing records, blocks executable script fields and separates rehearsal from publication.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_DOMAIN_CODE",
        "SRC_AUDIT_APPS"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "scope": "Source inspected; no runtime or production certification in this research.",
        "runtime_rev5": "Apps lane: 339/339 unit tests pass locally; application-use-authenticated-local runs in CI. Production use zero (0 workspaces)."
      }
    },
    {
      "id": "CAP_STANDING_CHECKS",
      "type": "capability",
      "label": "Bounded standing investigations",
      "claim": "Current standing scope explicitly restricts operations to investigation.run and disallows positive-cost standing admission.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "blocked",
      "evidence": [
        "SRC_EXECUTION_CODE",
        "SRC_AUDIT_APPS",
        "SRC_AUDIT_PLATFORM",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "production": "Cannot run in production: STRELVA_BACKGROUND_WORK_RELEASE is unset, so /api/cron/workspace-work records a heartbeat and returns disabled every 5 minutes (288 empty invocations/day). Manual runs work locally. Previously recorded partial."
      }
    },
    {
      "id": "COMP_FACT_TO_PUBLIC",
      "type": "composition",
      "label": "Approved fact to verified public surfaces",
      "claim": "A verified fact revision drives a scoped website job, exact decision, authorized publication and per-surface read-back; future maintained accuracy stays separately accepted.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "stale",
      "realization": "planned",
      "evidence": [
        "SRC_CONTEXT_CURRENT",
        "SRC_REVIVAL_BLUEPRINT"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "One approved website fact change, stale revision denial, grant revocation and accepted-write/read-back failure before adding a second surface.",
        "outside_boundary": "GBP requires its own rights/consent checks; no implied permission from website publication.",
        "stale_reason": {
          "revision": 5,
          "reason": "Required PRIM_FACT_ASSERTION, now merged into PRIM_BUSINESS_RECORD (replacement edge EDGE_AUDIT_31)."
        }
      }
    },
    {
      "id": "COMP_AGENCY_UPGRADES",
      "type": "composition",
      "label": "Agency method with checked upgrades",
      "claim": "One immutable method version serves isolated business installations with owned overrides, scoped bindings and per-install upgrade checks.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "stale",
      "realization": "planned",
      "evidence": [
        "SRC_PARTNER_CHARTER",
        "SRC_DOMAIN_CODE",
        "SRC_HIGHLEVEL",
        "SRC_DATAVERSE"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Two isolated businesses, different overrides/connections, incompatible schema denial, permitted rollback and provider exit; no customer data or secrets in package.",
        "stale_reason": {
          "revision": 5,
          "reason": "Required PRIM_OFFERING_METHOD_INSTALL, now superseded by PRIM_CONTEXT_VERSION (replacement edge EDGE_AUDIT_32)."
        }
      }
    },
    {
      "id": "COMP_NATIVE_INDEPENDENT",
      "type": "composition",
      "label": "Native tools independently useful",
      "claim": "A business uses an app/inquiry tool without buying a website; shared contacts support later separately accepted managed follow-through.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_CONTEXT_CURRENT",
        "SRC_DOMAIN_CODE"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "validation": "Prove the described contract with two isolated businesses, failure/revocation paths, and a real domain consumer before promoting readiness."
      }
    },
    {
      "id": "DIST_AGENCY_CHANNEL",
      "type": "distribution",
      "label": "Agency creator channel",
      "claim": "Accepted charter positions agencies as creators/channel and preserves client ownership and attribution; outside adoption and rates are unproven.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_PARTNER_CHARTER"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "ECON_RESP_MEASUREMENT",
      "type": "economic",
      "label": "Measure completed and maintained work",
      "claim": "Attribute compute/provider cost, human and exception minutes, recovery cost and observation coverage to installation/version before selecting outcome prices.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_CONTEXT_CURRENT",
        "SRC_ECONOMICS_CODE"
      ],
      "rationale": "Preserve business semantics, authority and delivery evidence across capabilities without collapsing domain ownership.",
      "premise_ids": [],
      "details": {
        "formula": "Contribution per account/period = recognized revenue - compute/API costs - platform/payment costs - support/exception/recovery labor - other variable delivery costs.",
        "inputs": "Unmeasured; no numeric margin or price inferred.",
        "validation": "Shadow accepted work; measure cost and failure tails under named scope before new responsibility pricing."
      }
    },
    {
      "id": "PRIM_ACTOR_RELATIONSHIPS",
      "type": "primitive",
      "label": "Actor and relationship",
      "claim": "Identified people, service actors and agents participate through explicit business relationships; identity, contact data, payer status and agency attribution do not imply runtime authority.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUTHORITY_CODE",
        "SRC_ECONOMICS_CODE",
        "SRC_PARTNER_CHARTER",
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_PLATFORM",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Refine shared semantic contracts without turning every domain type or runtime mechanism into a universal entity.",
      "premise_ids": [],
      "details": {
        "minimum_contract": [
          "actorId",
          "actorKind",
          "sponsor/principal where delegated",
          "business relationship",
          "active/revoked state"
        ],
        "distinction": "An anonymous customer requester is not a business operator; a service principal needs explicit scope and a principal it acts for.",
        "validation": "Exercise the same website change as direct owner action, accepted finite Work and a continuing accuracy Responsibility; preserve independent lifecycles while reusing native operation contracts.",
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships.",
        "deployed_seed": "workspace_memberships, invitations, delegations, operational_assignments, agent_access tokens"
      }
    },
    {
      "id": "PRIM_METHOD_DEFINITION",
      "type": "primitive",
      "label": "Method definition",
      "claim": "A reusable immutable delivery definition may contain record schemas, named operations, procedures, interfaces and checks; it carries no client records, secrets or grants.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_PARTNER_CHARTER",
        "SRC_DOMAIN_CODE",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Refine shared semantic contracts without turning every domain type or runtime mechanism into a universal entity.",
      "premise_ids": [],
      "details": {
        "minimum_contract": [
          "definitionId",
          "version",
          "author/maintainer",
          "declared requirements",
          "schemas/operations/procedures/surfaces/checks",
          "upgrade and ownership policy"
        ],
        "distinction": "A procedure is one executable recipe within a method; a run is an execution, not an authored definition. Offering describes the commercial result independently.",
        "validation": "Exercise the same website change as direct owner action, accepted finite Work and a continuing accuracy Responsibility; preserve independent lifecycles while reusing native operation contracts.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "superseded_by": [
          "PRIM_CONTEXT_VERSION"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Becomes the lineage origin of a contextual Version; versions/mapping.ts already maps offering definitions to origins.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "PRIM_METHOD_INSTALLATION",
      "type": "primitive",
      "label": "Business installation",
      "claim": "An installation pins a reusable definition version to a business, binds its resources and connections, and retains business-owned configuration and overrides.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_DOMAIN_CODE",
        "SRC_PARTNER_CHARTER",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Refine shared semantic contracts without turning every domain type or runtime mechanism into a universal entity.",
      "premise_ids": [],
      "details": {
        "minimum_contract": [
          "installationId",
          "businessId",
          "definitionId/version",
          "resource bindings",
          "connection references",
          "configuration ownership",
          "revision/status"
        ],
        "distinction": "An installation may exist without managed service. Installing does not imply new grants, provider acceptance, price acceptance or responsibility.",
        "validation": "Exercise the same website change as direct owner action, accepted finite Work and a continuing accuracy Responsibility; preserve independent lifecycles while reusing native operation contracts.",
        "product_layer": {
          "role": "Subordinate implementation or service contract supporting customer Systems",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL"
        },
        "superseded_by": [
          "PRIM_CONTEXT_VERSION",
          "PRIM_SYSTEM"
        ],
        "superseded": {
          "revision": 5,
          "at": "2026-10-05",
          "reason": "Pinned origin, local bindings and owned overrides are the Version descendant contract; an installation is a System's origin. offering_installations is deployed schema with 0 users.",
          "basis": "Audit consolidation recommendation (SRC_AUDIT_LATENT). Model-structure change, not a founder decision; ADR 0011 remains proposed.",
          "prior_realization": "planned"
        }
      }
    },
    {
      "id": "DESIGN_SHARED_GRAMMAR",
      "type": "architecture",
      "label": "Shared contracts, typed domains, explicit promises",
      "claim": "Use a small common grammar for records, operations, authority and evidence; add commitments and versioned definitions without forcing every direct domain transaction through a managed job.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "stale",
      "realization": "planned",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE",
        "SRC_DOMAIN_CODE",
        "SRC_AUTHORITY_CODE",
        "SRC_CONTEXT_CURRENT"
      ],
      "rationale": "Refine shared semantic contracts without turning every domain type or runtime mechanism into a universal entity.",
      "premise_ids": [],
      "details": {
        "families": [
          {
            "name": "Business",
            "members": [
              "PRIM_BUSINESS"
            ],
            "question": "Whose state and systems are these?"
          },
          {
            "name": "Actor and relationship",
            "members": [
              "PRIM_ACTOR_RELATIONSHIPS"
            ],
            "question": "Who participates and in which role?"
          },
          {
            "name": "Typed record and reference",
            "members": [
              "PRIM_RECORD_REF"
            ],
            "question": "What exists and which exact version do we mean?"
          },
          {
            "name": "Operation and invocation",
            "members": [
              "PRIM_OPERATION"
            ],
            "question": "What meaningful change is allowed and which attempt performed it?"
          },
          {
            "name": "Authority",
            "members": [
              "PRIM_DECISION_GRANT"
            ],
            "question": "Who may do what, to which records, for what purpose and until when?"
          },
          {
            "name": "Connection",
            "members": [
              "PRIM_CONNECTION"
            ],
            "question": "Which outside account and resources can this business reach under which provider rights?"
          },
          {
            "name": "Evidence",
            "members": [
              "PRIM_RECEIPT_OBSERVATION"
            ],
            "question": "What was accepted, observed or independently verified?"
          },
          {
            "name": "Commitment",
            "members": [
              "PRIM_FINITE_WORK",
              "PRIM_ONGOING_RESP",
              "PRIM_PROVIDER_COMMITMENT"
            ],
            "question": "What finite result or maintained condition was accepted, by whom and under what limits?"
          },
          {
            "name": "Definition and installation",
            "members": [
              "PRIM_METHOD_DEFINITION",
              "PRIM_METHOD_INSTALLATION"
            ],
            "question": "What is reusable delivery knowledge and how is it bound to this business?"
          }
        ],
        "classification": "Nine contract families for discussion, not nine interchangeable entities, tables or customer-visible labels. Work, Responsibility, provider acceptance, definition and installation keep distinct identities and lifecycles.",
        "domain_types": [
          "contact",
          "service",
          "location",
          "inquiry",
          "booking",
          "website",
          "app record",
          "fact assertion",
          "availability policy"
        ],
        "supporting_mechanisms": [
          "typed links",
          "events/outbox",
          "execution attempts",
          "procedure runs",
          "monitoring",
          "schema migration"
        ],
        "commercial_records": [
          "offering",
          "accepted terms and limits",
          "payer agreement",
          "agency attribution",
          "creator royalty"
        ],
        "alternatives": [
          {
            "name": "Record builder",
            "result": "Defines state and interfaces for humans to operate.",
            "limit": "Does not close accepted delivery or ongoing recovery."
          },
          {
            "name": "Automation engine",
            "result": "Executes authorized procedures over records.",
            "limit": "Run success does not establish an accepted business promise."
          },
          {
            "name": "Business systems operated under explicit commitments",
            "result": "Reuses the same core for self-operated tools, finite delivery and maintained systems.",
            "choice": "Recommended direction, inferred from selected managed and agency direction; no adoption or economic proof."
          }
        ],
        "tests": [
          {
            "case": "Direct website edit",
            "needs": [
              "record",
              "operation",
              "authority",
              "evidence"
            ],
            "does_not_require": "A managed Work, offering installation or provider commitment merely to make an authorized domain change."
          },
          {
            "case": "Managed website change",
            "adds": [
              "finite Work",
              "scope/deadline acceptance",
              "provider commitment",
              "completion-rule version"
            ]
          },
          {
            "case": "Maintained website accuracy",
            "adds": [
              "Responsibility",
              "observation cadence/freshness",
              "accepted limits",
              "breach and recovery ownership"
            ]
          },
          {
            "case": "Agency method upgrade",
            "adds": [
              "method version",
              "installation",
              "resource bindings",
              "override ownership",
              "compatibility and rollback checks"
            ]
          },
          {
            "case": "Inquiry to booking",
            "rule": "Domain reservation validates availability and conflict constraints; managed Work exists only if delivery was entrusted as a finite outcome."
          }
        ],
        "validation": "Execute the same website change as direct action, accepted finite Work and a continuing accuracy Responsibility; check isolation, revocation, accepted-write/read-back failure and three independent lifecycles. Add two-business method upgrade proof.",
        "presentation_role": {
          "role": "Supporting internal architecture, not the primary customer mental model",
          "selected_model": "DESIGN_SYSTEMS_PRODUCT_MODEL",
          "source": "SRC_SYSTEMS_DIRECTION",
          "prior_graphs": "Historical views of execution contracts; not a competing product taxonomy."
        },
        "stale_reason": {
          "revision": 5,
          "reason": "Its nine contract families were consolidated under the Systems nouns in revision 5; ADR 0011 is still proposed."
        }
      }
    },
    {
      "id": "DESIGN_SYSTEMS_PRODUCT_MODEL",
      "type": "product_model",
      "label": "Systems, Connections, Possibilities, Versions",
      "claim": "Founder direction selects four customer nouns (Systems, Connections, Possibilities, Versions) and five verbs (Make, Connect, Explore, Make real, Version). Detailed kinds, lifecycles and presentation are proposed elaboration.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_ADR_0011",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "scope": "Confirmed founder direction; not shipped implementation.",
        "verbs": [
          "Make",
          "Connect",
          "Explore",
          "Make real",
          "Version"
        ],
        "root": "Business supplies shared context, people, records, permissions and connected tools.",
        "presentation": "Home presents actual Systems and Needs you; opening a System gives most space to the actual thing, with Connections, Possibilities and Versions contextual.",
        "customer_paths": [
          "business makes or deliberately changes its systems",
          "business hires Strelva to make and operate them",
          "agency creates and adapts systems for clients"
        ],
        "managed_default": "Customers who hire Strelva do not need to become software builders; creation can be performed by their provider.",
        "does_not_authorize": [
          "new brand/public marketing changes",
          "pricing or service promises",
          "production rollout",
          "live outside writes",
          "automatic grants or spend"
        ],
        "open_product": "The four selected nouns guide coherence; evidence may expose a genuinely missing concept, and must not be squeezed into the model.",
        "previous_claim": "The selected Strelva customer model is Systems, Connections, Possibilities and Versions, organized around making, connecting, exploring, making real and adapting business systems.",
        "confirmation_scope": "Confirmed only for the nouns and verbs, on chat-only evidence. ADR 0011 is status: proposed. Docs on transition/docs that say 'this section wins' or mark the primitives research superseded overstate it.",
        "realization_note": "Kept planned: no customer surface exists; supporting code is partial on transition/systems (see primitives)."
      }
    },
    {
      "id": "PRIM_SYSTEM",
      "type": "primitive",
      "label": "System",
      "claim": "A System is the enduring business-owned thing made in Strelva: its purpose and identity survive changes to content, interface, data, logic, actions and ongoing behavior.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_ADR_0011",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT",
        "SRC_SPINE"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "layer": "customer product primitive",
        "question": "What have we made?",
        "selected_definition": "Anything a business makes in Strelva that works; a draft can exist before it is ready or activated.",
        "examples": [
          "proposal",
          "website",
          "pricing calculator",
          "customer portal",
          "onboarding flow",
          "inspection report",
          "lead operation"
        ],
        "identity": "Stable System ID plus owning business; implementation category is not identity.",
        "subordinate_architecture": [
          "surface",
          "state",
          "behavior",
          "history",
          "runtime"
        ],
        "composition": "Systems can be independent and connected; not every extension needs a new System, and not every domain component becomes a separately visible System.",
        "selected_lifecycle": [
          "Draft",
          "Live",
          "Paused"
        ],
        "lifecycle_scope": "Selected simple presentation; exact state semantics and operational health remain proposed separately.",
        "validation": "Evolve one proposal System to package selection and a simulated checkout/onboarding/portal without changing its identity or silently rewriting issued/accepted terms.",
        "confirmation_scope": "The noun is confirmed founder direction (chat-only SRC_SYSTEMS_DIRECTION; ADR 0011 proposed). Detailed kinds, lifecycles and definitions in this record are proposed until ADR 0011 is accepted.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Spine (src/platform/systems): systems, revisions, issued outputs, identity trigger; canonical SystemRef {businessId, systemId} and SystemRevisionRef {revisionId, number}; adapters from saved_product_work, tenants and inquiry workspaces (from-existing.ts).",
          "known_defects": [
            "D10: A managed site's System id flips from tenant:<stableId> to saved_work:<workId> when a native website row appears, so a saved System lists twice during conversion.",
            "D12: Business A can see the inquiry workspace of a tenant now linked to business B through a stale website binding.",
            "D13: The spine migration requires business_record_assert_actor and tenant_workspace_links, which are not on main or in production."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        },
        "absorbs": [
          "PRIM_RECORD_REF (as spine SystemRevisionRef + implementation.ref)",
          "PRIM_RESOURCE (websites/apps/calendars as Systems)"
        ],
        "boundary_conflict": "Spine's from-existing.ts excludes onboarding and produces two Twin Trees Systems; the transition map and strelva-reborn.md:26 disagree. See Q_SYSTEM_BOUNDARY, Q_TWIN_TREES."
      }
    },
    {
      "id": "PRIM_SYSTEM_CONNECTION",
      "type": "primitive",
      "label": "System connection",
      "claim": "A customer Connection describes what a System knows, uses, affects, appears within, shares with, depends on or is triggered by, including other Systems and business resources.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_ADR_0011",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT",
        "SRC_SPINE"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "layer": "customer product primitive",
        "question": "What does it work with?",
        "kinds": [
          "read",
          "act",
          "appear",
          "share",
          "depend",
          "trigger"
        ],
        "targets": [
          "another System",
          "business facts/pricing",
          "person or audience",
          "external account/resource",
          "domain",
          "API"
        ],
        "relationship": "Directional typed relation; broad user vocabulary does not collapse internal meanings.",
        "binding_distinction": "Existing PRIM_CONNECTION models an external account binding underneath this broader Connection; Share is access, Appear is a placement, Depend is a data/behavior contract.",
        "validation": "Connect pricing to a proposal and website; distinguish permission, selected resource binding and propagation policy, including disconnected and stale states.",
        "confirmation_scope": "The noun is confirmed founder direction (chat-only SRC_SYSTEMS_DIRECTION; ADR 0011 proposed). Detailed kinds, lifecycles and definitions in this record are proposed until ADR 0011 is accepted.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Spine system_connections with six kinds and an account_binding target; propagation column present, freshness/failure behavior not enforced.",
          "known_defects": [
            "D11: Only the source business is checked; a user removed from the target business can reconnect a share into it and the target cannot revoke it (memory store has the same hole)."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        },
        "term_distinction": "Not the customer noun. PRIM_CONNECTION = credentials/scopes/health of one outside account (Google, Outlook, domain claim). PRIM_SYSTEM_CONNECTION = a typed relation a System has (read/act/appear/share/depend/trigger); an external account is one of its targets via spine account_binding."
      }
    },
    {
      "id": "PRIM_POSSIBILITY",
      "type": "primitive",
      "label": "Possibility",
      "claim": "A Possibility is a concrete experiential alternative to current business systems, which can affect one or several Systems and can be selected through Make real.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_ADR_0011",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT",
        "SRC_MAKE_REAL"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "layer": "customer product primitive",
        "question": "What else could it become?",
        "scope": "Business-level object with affected System references; shown contextually from each affected System.",
        "experience": "Enough of an alternative exists to open, use, change and compare it; a suggestion alone does not meet the selected promise.",
        "may_do": [
          "change existing Systems",
          "introduce a System",
          "connect Systems",
          "remove a step or System",
          "explore different business behavior"
        ],
        "selected_lifecycle": [
          "Exploring",
          "Ready"
        ],
        "make_real": "Selected customer action; exact grouped activation, authority and rollback contracts are proposed separately.",
        "validation": "Build and compare an inquiry flow and an isolated package-purchasing alternative affecting pricing/proposal/onboarding; label mocked or unavailable external effects accurately.",
        "confirmation_scope": "The noun is confirmed founder direction (chat-only SRC_SYSTEMS_DIRECTION; ADR 0011 proposed). Detailed kinds, lifecycles and definitions in this record are proposed until ADR 0011 is accepted.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "src/platform/possibilities + make-real runner pinning baselines as canonical SystemRevisionRef (fd75c252); in-memory store only.",
          "known_defects": [
            "D01: Rollback skips non-completed steps, so a payment in unknown is ignored; the activation reads 'No outside effect remains', and a restart mints new idempotency keys, allowing a second charge."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "PRIM_CONTEXT_VERSION",
      "type": "primitive",
      "label": "Contextual Version",
      "claim": "A Version is a System adapted to a different business reality, retaining shared lineage while carrying context-specific branding, data, accounts, people, permissions and rules.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_ADR_0011",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT",
        "SRC_VERSIONS"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "layer": "customer product primitive",
        "question": "Where does it need to work differently?",
        "contexts": [
          "location/market",
          "customer segment",
          "agency client",
          "franchise or business collection"
        ],
        "scope": "Single-System contextual adaptation first; a collection adaptation is selected future scope, not an operating replication capability.",
        "distinction": "A contextual Version has its own internal revisions/releases; Versions are not every edit or deployment.",
        "lineage": "Common authored improvements can become available to descendants without automatically replacing local customizations or reusing live credentials.",
        "validation": "Adapt one agency source for two isolated businesses, preserve different overrides and account bindings, propose a common fix and block an incompatible upgrade.",
        "confirmation_scope": "The noun is confirmed founder direction (chat-only SRC_SYSTEMS_DIRECTION; ADR 0011 proposed). Detailed kinds, lifecycles and definitions in this record are proposed until ADR 0011 is accepted.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "src/platform/system-versions lineage and three-way adoption reconciled onto spine refs (91295360) with projectedRevisionId for legacy revisions; in-memory store only; mapping.ts maps offering definitions/installations to origins and descendants.",
          "known_defects": [
            "D08: A whole-object override plus an upstream nested change previews the customer's value but adopts the upstream one, silently losing the edit; no test pins it."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        },
        "absorbs": [
          "PRIM_METHOD_DEFINITION (lineage origin)",
          "PRIM_METHOD_INSTALLATION (descendant with pinned origin, local bindings and owned overrides)"
        ],
        "term_collision": "docs/architecture/product-ontology.md:317 still defines Version as restorable historical state; two definitions stand until lane G fixes it."
      }
    },
    {
      "id": "RULE_CONTEXT_VERSION_IDENTITY",
      "type": "rule",
      "label": "Contextual identity and release history",
      "claim": "Represent contextual adaptation and temporal release as independent axes; cross-business descendants have distinct business-owned System identities and locally bound data/authority.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_FOOTHOLDS",
        "SRC_SYSTEMS_CHALLENGE",
        "SRC_VERSIONS",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "minimum_contract": [
          "systemId and businessId",
          "version/contextId",
          "lineage origin and baseline release",
          "local override ownership",
          "current release pointer",
          "locally selected account/resource bindings"
        ],
        "same_business": "A System may contain contextual Versions where appropriate; each version retains isolated/context-bound state and rollout decisions as required by its domain.",
        "cross_business": "An agency origin can be shared authored knowledge; client A and client B are distinct operational Systems/owners, not one mutable cross-tenant System.",
        "adoption": "A shared change is an upgrade candidate checked against local context; compatible standing update policy still requires explicit prior authority.",
        "no_implicit_copy": [
          "customer records",
          "secrets",
          "OAuth consent",
          "grants",
          "accepted commitments"
        ],
        "validation": "Two businesses, two different calendars and overrides; apply a compatible shared update, reject a conflict, and prove one client can stay pinned without cross-business access.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Lineage separate from releases; isolation enforced in service only. Ref incompatibility with spine resolved by integration (91295360).",
          "known_defects": [
            "D08: A whole-object override plus an upstream nested change previews the customer's value but adopts the upstream one, silently losing the edit; no test pins it.",
            "D09: Business isolation is enforced only in service.ts; the store returns any business's lineage row; shareSource/grantAccess do not validate businessId."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "RULE_SYSTEM_OUTPUT_IDENTITY",
      "type": "rule",
      "label": "System identity and issued outputs",
      "claim": "Keep the evolving System separate from immutable issued results or accepted agreement snapshots, even when a proposal or report is itself the first System surface.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_CHALLENGE",
        "SRC_SPINE",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "examples": "Commercial Proposal evolves to checkout and onboarding; changing its current prices cannot rewrite a proposal already issued or accepted.",
        "boundary": "Do not turn every internal artifact into another System automatically. Split or extract an independent System when its ownership, reuse, lifecycle or authority genuinely separates.",
        "validation": "Issue a proposal at one price revision, evolve its System and change future prices; retained accepted proposal remains unchanged.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Immutability triggers on revisions, issued outputs and identity exist in spine SQL only; no TS mirror test against a database.",
          "known_defects": [
            "D10: A managed site's System id flips from tenant:<stableId> to saved_work:<workId> when a native website row appears, so a saved System lists twice during conversion."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "RULE_SYSTEM_CONNECTION_CONTRACT",
      "type": "rule",
      "label": "Connection effects and propagation",
      "claim": "Each typed System connection declares direction, authority, source of truth, version/freshness expectations and failure behavior; propagation follows an explicit policy rather than updating every consumer or commitment blindly.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_CHALLENGE",
        "SRC_SPINE",
        "SRC_AUDIT_PLATFORM",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "minimum_contract": [
          "connectionId",
          "source System/context",
          "target System/resource/audience",
          "kind",
          "contract version",
          "data/actions exposed",
          "purpose and current grants",
          "binding health",
          "dependency freshness",
          "propagation policy"
        ],
        "public_meaning": "One customer noun with precise internal adapters; knowing about Stripe is different from being authorized to charge.",
        "price_change": "New proposals may follow current pricing; issued/accepted agreements pin their original terms.",
        "read_cycles": "Handle cycles and stale projections explicitly; do not equate absence of events with health.",
        "validation": "Price-change dependency test, withheld update to accepted proposal, revoked action grant and paused/stale source with visible dependent status.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Propagation column exists; freshness/failure behavior not enforced; work-context grants are the closest deployed contract.",
          "known_defects": [
            "D11: Only the source business is checked; a user removed from the target business can reconnect a share into it and the target cannot revoke it (memory store has the same hole)."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "RULE_POSSIBILITY_ISOLATION",
      "type": "rule",
      "label": "Possibility baseline and rehearsal",
      "claim": "An experiential Possibility pins the baselines and dependency revisions it changes, records candidate outputs and evidence, and defaults to isolated data and effects until currently authorized activation.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_CHALLENGE",
        "SRC_MAKE_REAL",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "minimum_contract": [
          "possibilityId and businessId",
          "intent and affected/new/removed System references",
          "baseline revisions",
          "candidate change set",
          "evaluation conditions/evidence",
          "effect mode",
          "required decisions and budgets",
          "activation progress"
        ],
        "staleness": "A relevant current-System change invalidates the old comparison/activation assumptions; refresh and rehearse or explicitly reconcile.",
        "evaluation": "Historical replay requires permitted samples and no real-world writes; synthetic performance is not measured production business impact.",
        "ready": "Ready means ready to make a decision under stated evidence/limitations; it does not imply active accounts or completed production effects.",
        "validation": "Change a baseline after rehearsal, attempt activation, and require reconciliation; prove replay cannot send, charge or mutate production.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Baseline pinning and compare-and-set exist; isolation is self-declared by the adapter's mode field.",
          "known_defects": [
            "D03: Governance judges effect.publish.data but perform sends effect.request; calendar/message/payment effects allowed without approval, against the outside-writes rule.",
            "D04: start() is non-transactional and runNext never checks activationId (orphan activations can run); rollback saves only at the end so it cannot resume; rehearsal isolation is self-declared by adapter mode."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "RULE_SYSTEM_PAUSE_HEALTH",
      "type": "rule",
      "label": "Lifecycle and operational health",
      "claim": "Draft/Live/Paused describe intended operation; verified health, degraded dependencies and required decisions remain separate, and pause preserves records and already accepted obligations.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_CHALLENGE",
        "SRC_HEALTH",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "pause": "Block new specified behavior without deleting records or pretending existing appointments/commitments ended.",
        "static_system": "For a proposal/report Live can mean available to its intended audience; it need not imply a continuously running agent.",
        "composite_system": "For ongoing behavior activation must meet declared operating checks; dependent failures can degrade a Live System.",
        "retirement": "Archive/retention/exit remain backend lifecycle concerns even if not promoted to primary customer vocabulary.",
        "validation": "Pause booking, retain existing reservations, stop new ones, and mark dependent projections stale/blocked; a retained report stays readable without a running worker.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Pause for workspace scheduling only, race-safe via revision CAS; health derivation reads heartbeat, domain monitor and scan; unknown never reads healthy. After integration health reads spine lifecycle (62f81a87), but the schedule payload pause field remains a second pause store.",
          "known_defects": [
            "D05: A paused schedule still lists public slots; the visitor's inquiry is captured, reserve fails, the receipt stays pending and the visitor is told to retry.",
            "D06: Deployed code drops the unknown pause field on read, so any save from production code un-pauses a record.",
            "D07: Pause check runs ahead of reschedule recovery and the same-time shortcut; a stale failure decays from blocked to unknown; edit time used as check time."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "COMP_SYSTEM_EVOLUTION",
      "type": "composition",
      "label": "Proposal becomes a working customer process",
      "claim": "One business System can grow from a proposal into package selection, a checkout flow, onboarding and a progress surface without forcing the customer to manage software-category migrations.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_FOOTHOLDS",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "input": "Business purpose, approved facts, permitted sample data, separately accepted action scope and spend.",
        "output": "One stable System with the new working surfaces/behavior and retained prior outputs.",
        "bottleneck": "General behavior/data/schema changes and outside effect authority are not established by the bounded app runtime.",
        "validation": "Use local/test-provider adapters; demonstrate identity persistence, prior agreement snapshot retention and denied effects before approval; no live payment or client modifications.",
        "rev5_cross_check": "Kept planned: no transition branch implements this composition; the audits found no code that evolves a System across kinds or extracts a shared System from a Possibility."
      }
    },
    {
      "id": "COMP_MULTI_SYSTEM_ACTIVATION",
      "type": "composition",
      "label": "Make real across connected Systems",
      "claim": "A multi-System Possibility activates an approved set of compatible revisions with durable per-effect progress, verification and bounded recovery, without claiming cross-provider atomicity.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_CHALLENGE",
        "SRC_EXECUTION_CODE",
        "SRC_MAKE_REAL",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "logical_operation": "One intelligible customer result spanning named Systems and their connections.",
        "steps": [
          "pin candidate and validate current baselines",
          "preflight identities, grants, provider rights and accepted budgets",
          "prepare compatible native changes and reversible staging",
          "record each authorized effect/accepted acknowledgment",
          "activate compatible references and verify end-to-end behavior",
          "retain progress and recover/escalate incomplete effects"
        ],
        "partial_failure": "If one provider accepts and another fails, preserve the accepted effect and resume only unfinished/reconcilable steps. Do not label the full Possibility live until its declared operating contract is satisfied.",
        "rollback": "Retain previous code/config/data revisions and recovery paths where possible; payments, delivered mail and other outside effects require explicit compensation or cannot be undone.",
        "scope": "Customer Make real does not manufacture provider acceptance, grant expansion, price acceptance or a production-deploy approval.",
        "validation": "Interrupt after calendar/provider acceptance, revoke message authority before retry, resume without duplicate effect, surface partial activation and preserve existing live behavior.",
        "implementation": {
          "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
          "observed": "Runner exists against fakes only; no persistence or restart test; duplicates src/platform/work-execution (see DESIGN_EXECUTION). Accepted-write-not-retried rule is right and tested.",
          "known_defects": [
            "D01: Rollback skips non-completed steps, so a payment in unknown is ignored; the activation reads 'No outside effect remains', and a restart mints new idempotency keys, allowing a second charge.",
            "D02: reconcile/rollback lack authority checks; approvals are caller-supplied strings stamped approvedBy: actor.",
            "D03: Governance judges effect.publish.data but perform sends effect.request; calendar/message/payment effects allowed without approval, against the outside-writes rule.",
            "D04: start() is non-transactional and runNext never checks activationId (orphan activations can run); rollback saves only at the end so it cannot resume; rehearsal isolation is self-declared by adapter mode."
          ],
          "defect_status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches."
        }
      }
    },
    {
      "id": "COMP_SYSTEM_EXTRACTION",
      "type": "composition",
      "label": "A Possibility creates a shared System",
      "claim": "Strelva can construct an alternative that extracts duplicated behavior or facts into a reusable System, then proposes explicit connections from the existing consumers.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "example": "Create Pricing from inconsistent website/proposal values; consumers bind to verified prices, while issued commitments keep pinned terms.",
        "guard": "Suggesting or preparing an extraction is not permission to migrate consumers or overwrite disputed business facts.",
        "validation": "Two consumers, conflicting prices, owner selection of authoritative value, explicit candidate consumer changes and protection of previously accepted terms.",
        "rev5_cross_check": "Kept planned: no transition branch implements this composition; the audits found no code that evolves a System across kinds or extracts a shared System from a Possibility."
      }
    },
    {
      "id": "DIST_SYSTEM_VERSIONS",
      "type": "distribution",
      "label": "Agency and multi-location Versions",
      "claim": "The selected distribution direction adapts working Systems across agency clients and locations through contextual Versions and shared lineage, with locally owned business records and connections.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_PARTNER_CHARTER",
        "SRC_ADR_0011"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "scope": "Confirmed intended channel and product direction; no adoption, marketplace qualification, delivery capacity or royalty rates established.",
        "future": "A collection/franchise Version can adapt several connected Systems after per-System contracts are proven.",
        "confirmation_scope": "Founder direction from chat only (SRC_SYSTEMS_DIRECTION); ADR 0011 proposed."
      }
    },
    {
      "id": "ECON_SYSTEM_COMPOUNDING",
      "type": "economic",
      "label": "Version reuse and useful learning",
      "claim": "Shared authored improvements and permission-scoped operating evidence may lower delivery cost and improve later Versions; this is a hypothesis requiring measured exception and adaptation cost.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "planned",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_ECONOMICS_CODE"
      ],
      "rationale": "Separate the selected customer product model from supporting architecture and operational proof.",
      "premise_ids": [],
      "details": {
        "measures": [
          "time and cost to first useful System",
          "adaptation and upgrade effort per Version",
          "customer-visible verified task outcomes",
          "exceptions and recovery minutes",
          "evidence quality/coverage",
          "repeated use and authorized re-use"
        ],
        "cost_claim": "Cheap or fluid generation in the founder narrative is not measured reliable production delivery cost.",
        "learning_scope": "Do not combine client data or apply learned decision rules across businesses without explicit permitted use.",
        "validation": "Measure a repeated System creation/adaptation/upgrade cycle and error/exception tails on permitted tasks; distinguish synthetic replay from real buyer value."
      }
    },
    {
      "id": "DESIGN_EXECUTION",
      "type": "architecture",
      "label": "One execution engine",
      "claim": "Operations, procedure runs and event delivery are one runtime mechanism owned by src/platform/work-execution (leased steps, unknown/accepted-final outcomes, reconcile, Postgres compare-and-set store); Make real should run on it rather than beside it.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_EXECUTION_CODE",
        "SRC_AUDIT_LATENT",
        "SRC_AUDIT_PLATFORM",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "Make-real reimplemented leases, reconcile and unknown outcomes that work-execution already has; one engine removes a second source of execution truth.",
      "premise_ids": [],
      "details": {
        "replaces": [
          "PRIM_OPERATION",
          "PRIM_PROCEDURE_RUN",
          "PRIM_EVENT_OUTBOX"
        ],
        "realization_scope": "Deployed schema, 0 production users: tables/code are in the Sept 30 production release (84/84 migrations applied per SRC_SEPT30_RELEASE, not re-verified since); production had 0 workspaces and 0 tenant memberships. work-execution engine and 20260912160000_work_responsibilities.sql are deployed; the background flag is off.",
        "naming_collision": "engine.ts calls a finite job Responsibility, colliding with standing_responsibilities.",
        "validation": "Port the make-real runner onto work-execution and pass its tests plus a process-restart test with a real provider ledger."
      }
    },
    {
      "id": "ISSUE_SYSTEMS_AUDIT_DEFECTS",
      "type": "issue",
      "label": "Open defects on transition/systems",
      "claim": "The 2026-10-04 audit found correctness and authority defects in the spine, make-real, Versions and health code that now lives on transition/systems.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "absent",
      "evidence": [
        "SRC_AUDIT_LATENT",
        "SRC_SYSTEMS_INTEGRATION"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "defects": [
          {
            "id": "D01",
            "area": "make-real",
            "where": "src/platform/make-real/runner.ts:415; view.ts:35; plan.ts:6 (as observed on 821f60e0)",
            "defect": "Rollback skips non-completed steps, so a payment in unknown is ignored; the activation reads 'No outside effect remains', and a restart mints new idempotency keys, allowing a second charge.",
            "affects": [
              "COMP_MULTI_SYSTEM_ACTIVATION",
              "PRIM_POSSIBILITY"
            ]
          },
          {
            "id": "D02",
            "area": "make-real",
            "where": "runner.ts:383 reconcile, :310 approve",
            "defect": "reconcile/rollback lack authority checks; approvals are caller-supplied strings stamped approvedBy: actor.",
            "affects": [
              "COMP_MULTI_SYSTEM_ACTIVATION"
            ]
          },
          {
            "id": "D03",
            "area": "make-real",
            "where": "governance.ts:17",
            "defect": "Governance judges effect.publish.data but perform sends effect.request; calendar/message/payment effects allowed without approval, against the outside-writes rule.",
            "affects": [
              "COMP_MULTI_SYSTEM_ACTIVATION",
              "RULE_POSSIBILITY_ISOLATION"
            ]
          },
          {
            "id": "D04",
            "area": "make-real",
            "where": "runner.ts:234, :446; rehearsal.ts:18",
            "defect": "start() is non-transactional and runNext never checks activationId (orphan activations can run); rollback saves only at the end so it cannot resume; rehearsal isolation is self-declared by adapter mode.",
            "affects": [
              "COMP_MULTI_SYSTEM_ACTIVATION",
              "RULE_POSSIBILITY_ISOLATION"
            ]
          },
          {
            "id": "D05",
            "area": "health",
            "where": "public-booking-server.ts:131-150; public-booking.ts:419,470",
            "defect": "A paused schedule still lists public slots; the visitor's inquiry is captured, reserve fails, the receipt stays pending and the visitor is told to retry.",
            "affects": [
              "RULE_SYSTEM_PAUSE_HEALTH",
              "RISK_PUBLIC_BOOKING_PAUSE",
              "CAP_BOOKING_API"
            ]
          },
          {
            "id": "D06",
            "area": "health",
            "where": "deployed scheduling payload parsing",
            "defect": "Deployed code drops the unknown pause field on read, so any save from production code un-pauses a record.",
            "affects": [
              "RULE_SYSTEM_PAUSE_HEALTH"
            ]
          },
          {
            "id": "D07",
            "area": "health",
            "where": "calendar/service.ts:399; server.ts:77; derive.ts:54; observations.ts:103,138",
            "defect": "Pause check runs ahead of reschedule recovery and the same-time shortcut; a stale failure decays from blocked to unknown; edit time used as check time.",
            "affects": [
              "RULE_SYSTEM_PAUSE_HEALTH"
            ]
          },
          {
            "id": "D08",
            "area": "versions",
            "where": "src/platform/system-versions/service.ts:343",
            "defect": "A whole-object override plus an upstream nested change previews the customer's value but adopts the upstream one, silently losing the edit; no test pins it.",
            "affects": [
              "PRIM_CONTEXT_VERSION",
              "RULE_CONTEXT_VERSION_IDENTITY"
            ]
          },
          {
            "id": "D09",
            "area": "versions",
            "where": "system-versions store getLineage",
            "defect": "Business isolation is enforced only in service.ts; the store returns any business's lineage row; shareSource/grantAccess do not validate businessId.",
            "affects": [
              "RULE_CONTEXT_VERSION_IDENTITY"
            ]
          },
          {
            "id": "D10",
            "area": "spine",
            "where": "src/platform/systems/from-existing.ts:204",
            "defect": "A managed site's System id flips from tenant:<stableId> to saved_work:<workId> when a native website row appears, so a saved System lists twice during conversion.",
            "affects": [
              "PRIM_SYSTEM",
              "RULE_SYSTEM_OUTPUT_IDENTITY"
            ]
          },
          {
            "id": "D11",
            "area": "spine",
            "where": "Systems migration :683 set_system_connection_state",
            "defect": "Only the source business is checked; a user removed from the target business can reconnect a share into it and the target cannot revoke it (memory store has the same hole).",
            "affects": [
              "PRIM_SYSTEM_CONNECTION",
              "RULE_SYSTEM_CONNECTION_CONTRACT"
            ]
          },
          {
            "id": "D12",
            "area": "spine",
            "where": "read_existing_business_systems :753 vs :757",
            "defect": "Business A can see the inquiry workspace of a tenant now linked to business B through a stale website binding.",
            "affects": [
              "PRIM_SYSTEM"
            ]
          },
          {
            "id": "D13",
            "area": "spine",
            "where": "Systems migration dependency on 20261002120000_business_record.sql",
            "defect": "The spine migration requires business_record_assert_actor and tenant_workspace_links, which are not on main or in production.",
            "affects": [
              "PRIM_SYSTEM",
              "PRIM_BUSINESS_RECORD"
            ]
          }
        ],
        "status": "Recorded open. A fix pass on 9 audit defects was running on transition/systems at observation; which of these it covers was not inspected. Line numbers are from the pre-integration branches.",
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
        "test_strength": "20 single-line deletions in runner.ts leave all 11 make-real tests green; spine's Supabase store test mocks rpc."
      }
    },
    {
      "id": "GAP_SYSTEM_REF_DIVERGENCE",
      "type": "gap",
      "label": "Four incompatible System ref shapes",
      "claim": "On 2026-10-04 spine, make-real, Versions and health each defined a different System/revision ref; integration re-based all of them on spine's SystemRef/SystemRevisionRef.",
      "status": "confirmed",
      "lifecycle": "retired",
      "freshness": "current",
      "realization": "not_applicable",
      "evidence": [
        "SRC_AUDIT_LATENT",
        "SRC_SYSTEMS_INTEGRATION"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "resolution": "Resolved on transition/systems (91295360, fd75c252, 62f81a87), unmerged and unpushed.",
        "remaining": "Two pause stores (spine lifecycle vs schedule payload) and full definition copies in Version revisions vs spine's artifact pointers were not verified as resolved."
      }
    },
    {
      "id": "RISK_PUBLIC_BOOKING_PAUSE",
      "type": "risk",
      "label": "Paused schedule still takes public bookings",
      "claim": "With the health branch, a paused schedule still lists public slots through /api/v1/bookings; the inquiry is captured, reserve fails and the visitor is told to retry, leaving an orphan lead and a pending receipt.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUDIT_LATENT",
        "SRC_HEALTH"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "where": "public-booking-server.ts:131-150; public-booking.ts:419,470",
        "trigger": "Only once someone can pause a schedule a client site uses; unpaused behavior unchanged.",
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim.",
        "defect": "D05"
      }
    },
    {
      "id": "GAP_LEADS_UNSEEN",
      "type": "gap",
      "label": "Client leads expire unseen",
      "claim": "Live client leads sit only in Redis (90-day TTL per lead, 500-entry index cap); no owner email can arm, no operator view lists client leads, and owners rarely sign in, so leads can be captured, unseen and then lost.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "absent",
      "evidence": [
        "SRC_LEADS",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_AUDIT_WEBSITES",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "facts": [
          "leads.ts:18-19,147-153 TTL and cap",
          "/admin/leads shows Strelva access requests (getDeliveryLeads), not client leads",
          "sendNewLeadEmail has no tenantId; client audience documented as paused",
          "1 sign-in in 30 days (Sept 30 record)",
          "route comment claims 'The lead is already durable at this point'; it is not"
        ],
        "inherits": [
          "hosted v2 website forms",
          "workspace public bookings",
          "workspace inquiry System"
        ],
        "unmeasured": "How many leads have expired (Q_LEAD_LOSS); whether client-repo Resend mail is a durable copy for some clients (Q_OWNER_LEAD_EMAIL).",
        "fix_order": "Reborn section 0 dual-write to Postgres (COMP_LEADS_TO_RECORD), pass tenantId, add client leads to /admin/clients/[id]."
      }
    },
    {
      "id": "OFFER_MANAGED_WEBSITES",
      "type": "offering",
      "label": "Managed websites for nine clients (tenant model)",
      "claim": "Today's revenue: nine managed-website clients run on the tenant model in src/lib, served through their sites, /api/v1 and crons rather than an owner login. Production has 14 tenants, 12 active; which nine are paying is unsettled.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_SEPT30_RELEASE",
        "SRC_AUDIT_WEBSITES",
        "SRC_AUDIT_PLATFORM",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "active_tenant_ids": [
          "cocard-anderson",
          "gldf",
          "leslie-bookkeeping",
          "mclears",
          "orange-crate",
          "rhm-innovations",
          "rohlax",
          "spacejam-storage",
          "strelva",
          "twintrees-camillus",
          "twintrees-fayetteville",
          "vermont-unlimited"
        ],
        "operating_scope": "Sept 30 release: 55/55 baseline URL match and 60/60 storefront responses byte-identical. Not re-observed 2026-10-04.",
        "grandfathered": [
          "gldf",
          "rohlax"
        ],
        "audit_verdict": "LIVE",
        "audit_call": "keep; fix the second tenant-row writer (reserve_website_hosted_tenant inserts tenants directly with 'wellness' hard-coded)",
        "systems_fit": "Each tenant becomes a managed-website System keyed on stable_id through tenant_workspace_links."
      }
    },
    {
      "id": "SURF_V1_CONTRACT",
      "type": "surface",
      "label": "/api/v1 storefront contract",
      "claim": "13 tenant-slug-keyed routes (bookings x4, collections x2, content, inquiries, leads, page-config, site-capabilities, spam-pit, track) that client sites call; additive-only, byte-checked at release.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_WEBSITES",
        "SRC_SEPT30_RELEASE",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "callers_found_by_grep": {
          "gldf": "content, page-config, site-capabilities, revalidate",
          "rohlax": "same via src/lib/reb.ts",
          "mclears-cottage": "leads, track",
          "orange-crate-brewing": "leads",
          "leslie-bookkeeping, rhm-innovations, smokin-buddha": "track",
          "cocard-anderson, vermont-unlimited": "no /api/v1 hits"
        },
        "audit_verdict": "LIVE",
        "audit_call": "fix: lead dual-write first, then add the missing repos to the manifest"
      }
    },
    {
      "id": "INT_CLIENT_REPOS",
      "type": "integration",
      "label": "Client site repos",
      "claim": "Each paid client site is its own repo and Vercel project; some import custom-repo-starter components (mclears, leslie, smokin-buddha, rhm) and some do not (gldf, rohlax, orange-crate).",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "owner_mail": "McClear's, Leslie and RHM send owner form mail directly through Resend from their own repo."
      }
    },
    {
      "id": "GAP_CLIENT_REPO_COVERAGE",
      "type": "gap",
      "label": "Client contract checks cover 2 of 9 repos",
      "claim": "release-manifest.json lists 2 of 9 client repos (gldf, rohlax) at stale version strelva-v2026.07.30.1; check:custom-repos passes 54/54 on field presence, but with pin verification 4/58 fail (gldf and rohlax checkouts off their May pins with local changes); five repos that call /api/v1 are unchecked.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "absent",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "unchecked_callers": [
          "mclears-cottage",
          "orange-crate-brewing",
          "leslie-bookkeeping",
          "rhm-innovations",
          "smokin-buddha"
        ],
        "consequence": "A System id or field added to v1 responses cannot be proven safe for 7 of 9 repos."
      }
    },
    {
      "id": "CAP_STRIPE_BILLING",
      "type": "capability",
      "label": "Stripe webhook and pay links",
      "claim": "Live billing on the tenant model: an 837-line Stripe webhook with Redis idempotency and pay links in Redis reb:paylink:* (1-year TTL). It does not know workspaces; the workspace allowance sync it calls returns null without workspaceId metadata.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "rules": [
          "A pay link is not a subscription",
          "gldf and rohlax grandfathered",
          "/pay/rohlax is a one-off"
        ],
        "unknown": "Which tenants actually pay (Q_PAYING_CLIENTS).",
        "audit_verdict": "LIVE",
        "audit_call": "keep; do not touch Stripe before conversion"
      }
    },
    {
      "id": "SURF_OPERATOR_CONSOLE",
      "type": "surface",
      "label": "Operator console",
      "claim": "/admin (18 pages, 41 API routes), super-admin gated: Overview, Clients, Accounts, Leads, Pay links, Ops, Uptime and Audit run live tenants; Internal work and Website rebuilds read workspace tables and are empty in production.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "gaps": [
          "Six operator queues across Redis and Postgres",
          "No view of client leads",
          "/admin/tenants is a redirect stub"
        ],
        "audit_verdict": "LIVE for tenants; workspace parts SHIPPED-UNUSED",
        "audit_call": "keep; merge queues keyed by System once Systems exist"
      }
    },
    {
      "id": "CAP_CRONS",
      "type": "capability",
      "label": "Scheduled jobs and heartbeat",
      "claim": "24 crons deployed (26 on origin/main/reborn); each has a route, calls requireCronRequest, is registered in CRON_MAX_AGE_SECONDS and records a heartbeat (scripted 26/26 cross-check, local).",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "additions_not_deployed": [
          "website-domain-verification every minute (1,440/day, flag-gated)",
          "website-health daily"
        ],
        "empty_runs": "workspace-work runs every 5 minutes and returns disabled",
        "count_conflict": "transition map cites 28 in heartbeat.ts",
        "audit_verdict": "LIVE"
      }
    },
    {
      "id": "RULE_PROXY_TENANT_AUTH",
      "type": "rule",
      "label": "Proxy and tenant authorization",
      "claim": "Request gating in src/proxy.ts plus requireTenantAccess/requireTenantPermission(s) in 75 app files; 40 of 41 admin APIs check isSuperAdmin (the exception is a documented alias); dev bypass hard-gated off in production.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "risk_before_rebuild_flag": "With STRELVA_WEBSITE_REBUILD_RELEASE on, the proxy reads getPublishedSiteDocument on every public tenant path (hits-only cache); matcher now also takes .html/.php/.aspx.",
        "audit_verdict": "LIVE",
        "audit_call": "keep; cache or move the redirect lookup before flipping the rebuild flag"
      }
    },
    {
      "id": "CAP_WEBSITE_AGENT",
      "type": "capability",
      "label": "Ask Strelva website agent",
      "claim": "The owner-facing agent at src/app/api/agent/route.ts defines 24 tools inline beside the 4 builders in agent-shared.ts, writing live content through approval.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_WEBSITES",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "rule_conflict": "Breaks 'one set of agent tools'; moving tools to agent-shared.ts is Reborn section 4.",
        "operating_scope": "Deployed; usage limited by owner sign-ins (1 in 30 days)."
      }
    },
    {
      "id": "PROD_WEBSITE_REBUILD",
      "type": "product",
      "label": "Website rebuild and hosted publishing",
      "claim": "Paste a URL: crawl with SSRF checks, quote-checked facts, canonical audit, immutable v2 document revisions, approval, publish to {slug}.strelva.com with receipt and health read-back, Vercel domains, export.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "state": "Merged on origin/main (PR #209, ~11.4k lines in bcdd0fe9); behind STRELVA_WEBSITE_REBUILD_RELEASE (off); 3 unapplied migrations (6 tables, ~25 RPCs); not deployed; no real business through it.",
        "fake_or_missing": [
          "No model composer, verifier or risk classifier wired; composition is a deterministic RuleComposer",
          "Hosted reservations hard-code wellness",
          "No hours/Service/ReserveAction JSON-LD or llms.txt",
          "Hits-only cache: a Postgres read per legacy page view with the flag on",
          "Tenant zero has no owner/workspace"
        ],
        "measured": "attymooney.com locally: 10 pages, 239 facts, 83.3% supported (spec target 85%), AI-readability 39 to 58.",
        "systems_fit": "The clearest Possibility -> Make real -> History in the codebase.",
        "audit_call": "keep; wire one admitted model composer and measure it, fix hard-codes and cache, fold the reservation into tenant_workspace_links, run tenant zero on preview.",
        "audit_verdict": "WORKS-LOCALLY",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_WEBSITE_AUDIT",
      "type": "product",
      "label": "Website audit (/audit)",
      "claim": "A public website diagnostic on the canonical src/lib/audit engine, the same engine scan.ts and the rebuild use, so 'one scanner' holds.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "evidence_scope": "HTTP 200 on Sept 8; usage unknown.",
        "gap": "An audit result does not start a rebuild.",
        "audit_call": "merge into the rebuild entry: paste URL, audit, rebuild it.",
        "audit_verdict": "LIVE (public page); workspace save SHIPPED-UNUSED",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_AI_VISIBILITY",
      "type": "product",
      "label": "AI visibility scorecard",
      "claim": "A public AI-visibility scorecard (/ai-visibility, 13 files) with a 'monitoring pilot'.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "fake": [
          "Citation probe (score.ts:220-245) is one ungrounded gemini-2.5-flash call: it measures model memory, not live AI search; bypasses the cost governor; model hard-coded",
          "POST /api/ai-visibility/[id]/monitor only saves a delivery lead; nothing re-scores"
        ],
        "audit_call": "fix: ground the probe with disclosed samples or relabel it a model knowledge check; build or remove the monitoring promise.",
        "audit_verdict": "LIVE page; monitoring fake",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_DOMAIN_MONITOR",
      "type": "product",
      "label": "Domain monitor",
      "claim": "Uptime and expiry checks every 30 minutes for every active tenant domain, including custom-repo and custom domains, with operator email through send.ts; heartbeat-registered.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "operating",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "evidence_scope": "In production since 0a7adabc (Aug 20); actual run history not observed.",
        "unique": "Only check covering custom-repo sites; website-health covers hosted v2 only.",
        "audit_call": "keep; feed System health.",
        "audit_verdict": "LIVE",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_NATIVE_APPS",
      "type": "product",
      "label": "Native applications",
      "claim": "Typed form plus records table (1-30 fields, 4 templates), draft/check/release/rollback and per-person use grants, stored in Postgres.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "broken": [
          "Any member can create apps (Reborn says agency/Strelva only)",
          "Records stand alone: no contacts, business record or submit notification",
          "Records written twice (rows + saved_product_work JSON copy read by investigations)",
          "Two command paths and three creation UIs",
          "'Rehearsal' is a schema check"
        ],
        "systems_fit": "The cleanest System in the codebase.",
        "audit_call": "keep; gate creation, link fields to business-record contacts, notify on submit.",
        "audit_verdict": "SHIPPED-UNUSED",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_CUSTOM_APPS",
      "type": "product",
      "label": "Custom applications",
      "claim": "Code-built internal apps compiled in a sandbox, reviewed, released and served behind CSP.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "blocked",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "blocker": "build.ts shells out to docker run; Vercel functions have no Docker, so every production build fails ('The isolated application build failed or exceeded its limits').",
        "other": [
          "No in-app link to /custom-applications/new",
          "Create UI asks owners to paste build.mjs and a USD budget",
          "Four security-definer functions were anon-executable until 20260930120000"
        ],
        "audit_call": "kill the build path; keep the CSP sandbox and release/review tables.",
        "audit_verdict": "DEAD in production (WORKS-LOCALLY)",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_TRACKER",
      "type": "product",
      "label": "Tracker",
      "claim": "Operational list: CSV import, row edits, assignees, record links and 'experiments' against a baseline, stored as one JSON snapshot.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "broken": [
          "Second record engine duplicating native applications",
          "Experiments compute from typed-in minutes, labeled operator_reported, promoted hard-coded false",
          "No tests in CI"
        ],
        "keep": "simulated/operator_reported/measured evidence vocabulary for Possibilities",
        "audit_call": "merge into native applications.",
        "audit_verdict": "SHIPPED-UNUSED",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_WORK_PLANS",
      "type": "product",
      "label": "Work plans",
      "claim": "Describe a goal, get a reviewable plan; accepting it atomically creates an app draft, tracker or document (execute_work_plan_output). The only sentence-to-working-thing path.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "blocked",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "blocker": "STRELVA_PLANNING_ENABLED unset in production; defaultGenerate throws WorkPlanUnavailableError.",
        "limits": [
          "Output space: app draft, document or one of three empty tracker templates",
          "No cost estimate"
        ],
        "audit_call": "fix: enable for Strelva/agency operators only; land a usable draft System and present it as a Possibility ('Make').",
        "audit_verdict": "SHIPPED-UNUSED (flag off), WORKS-LOCALLY",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_INVESTIGATIONS",
      "type": "product",
      "label": "Investigations (saved checks)",
      "claim": "Monitor one public page or compare two saved sources; manual runs possible.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "broken": [
          "Scheduled runs never fire (background flag off)",
          "Two-source compare is a field string diff on the JSON copy",
          "Public check captures at most 4,000 chars of server-rendered text"
        ],
        "audit_call": "merge into System health.",
        "audit_verdict": "SHIPPED-UNUSED; scheduled half DEAD in production",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_OPERATIONS",
      "type": "product",
      "label": "Operations (delegated and standing work)",
      "claim": "'What Strelva keeps running': finite delegated jobs, standing responsibilities, exact-job assignments and an operator exception inbox, with careful receipts and reconcile.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "broken": [
          "Delegation only replays steps the user wrote out in full; no worker behind it",
          "Standing scope limited to investigation.run at 0 cents and never scheduled in production",
          "inbox.ts adds a sixth operator queue"
        ],
        "audit_call": "keep the engine, receipts, assignments and website-draft adapter; retire the delegated-work composer; fold the inbox into /admin.",
        "audit_verdict": "SHIPPED-UNUSED; standing DEAD in production",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_PRODUCT_LEARNING",
      "type": "product",
      "label": "Product learning",
      "claim": "Internal R&D notebook: evidence, claims, options, strategy, brief, build, outcome; super-admin only.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "blocked",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "blocker": "STRELVA_PRODUCT_LEARNING_RELEASE unset.",
        "duplicates": "The strategy MCP and this PRODUCT_MODEL.md cover the same ground; nothing collects evidence automatically.",
        "audit_call": "kill (reversible migration needs Jacob's yes).",
        "audit_verdict": "SCAFFOLD",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_HOME_FINDER",
      "type": "product",
      "label": "Home Finder adapter",
      "claim": "Signed management adapter to the external IDX Home Finder (strelva-idx-ops), surfaced only in the gated Customers place.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "blocked",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "blocker": "Returns null without HOME_FINDER_MANAGEMENT_BASE_URL and signing key; STRELVA_CUSTOMERS_RELEASE unset; pilot needs a participating brokerage/MLS.",
        "related": "src/platform/customers (2,232 lines) is the enterprise mapping for it; 'Customers' also names the business's people in the sidebar.",
        "audit_call": "freeze; remove if the IDX pilot is dropped.",
        "audit_verdict": "SCAFFOLD",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_ONBOARDING",
      "type": "product",
      "label": "Onboarding cases",
      "claim": "Private onboarding cases for a customer, employee or supplier with requirements, uploads, review, correction and accept.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "broken": [
          "Assign stores an email and notifies nobody",
          "The onboarded person cannot get in without workspace membership",
          "Extraction handles txt/csv/json only, not PDFs or images",
          "Files stored as base64 in saved_product_work.input (2MB cap)",
          "Name collides with /onboard, /admin/onboard and inquiries/onboarding.ts"
        ],
        "boundary_conflict": "Spine excludes onboarding from Systems; the transition map calls it a System (Q_SYSTEM_BOUNDARY).",
        "audit_call": "park.",
        "audit_verdict": "SHIPPED-UNUSED",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_DOCUMENTS",
      "type": "product",
      "label": "Documents",
      "claim": "Private plain-text document with revision, edit and undo; also onboarding's attachment store.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "bug": "history.max(200): edit 201 throws ZodError too_big (probe-confirmed locally). Each receipt stores full before/after text up to 50k chars, so a row can approach ~20MB before it locks.",
        "audit_call": "fix the cap, then fold into the business-record revision pattern.",
        "audit_verdict": "SHIPPED-UNUSED; 200-edit bug",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_ASSESSMENT",
      "type": "product",
      "label": "Assessment",
      "claim": "Thin presentation and recovery layer over website-audit and AI-visibility results saved in a workspace.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "available",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "audit_call": "merge into website audit.",
        "audit_verdict": "SHIPPED-UNUSED",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    },
    {
      "id": "PROD_WORKSPACE_SCHEDULING",
      "type": "product",
      "label": "Workspace scheduling",
      "claim": "Native schedules with reservations, real Google/Outlook calendar adapters (idempotency keys, read-back, encrypted tokens) and the public v1 booking path.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "realization": "partial",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "limits": [
          "Calendar provider mandatory",
          "<=100 absolute availability intervals; no weekly hours, services, buffers, lead time",
          "One JSON row: history cap hit after ~125 synced bookings; concurrent visitors conflict on one revision",
          "Google calendar scope verification unknown"
        ],
        "legacy_twin": "Tenant booking (src/lib/booking.ts, PG bookings + Redis config) has the richer weekly-hours model; no client repo calls /api/booking and Rohlax books through Vagaro.",
        "audit_call": "fix: reservations as rows, adopt weekly hours, calendar optional.",
        "audit_verdict": "SHIPPED-UNUSED; public path unreachable",
        "verdict_scope": "Verdict from the 2026-10-04 lane audit (local code, Sept 30 release record); no production read was made."
      }
    }
  ],
  "edges": [
    {
      "id": "EDGE_01",
      "from": "REL_REBORN",
      "relation": "requires",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "REL_REBORN requires PRIM_BUSINESS_RECORD",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_REBORN"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_02",
      "from": "REL_REBORN",
      "relation": "requires",
      "to": "CAP_CONVERT",
      "claim": "REL_REBORN requires CAP_CONVERT",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_REBORN"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_03",
      "from": "CAP_CONVERT",
      "relation": "depends_on",
      "to": "PRIM_TENANT_LINK",
      "claim": "CAP_CONVERT depends_on PRIM_TENANT_LINK",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_BR_MIG"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_04",
      "from": "PRIM_BUSINESS_RECORD",
      "relation": "contains",
      "to": "CAP_CONTACT_DEDUP",
      "claim": "PRIM_BUSINESS_RECORD contains CAP_CONTACT_DEDUP",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_BR_MIG"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_05",
      "from": "COMP_LEADS_TO_RECORD",
      "relation": "fixes",
      "to": "STATE_LEADS_REDIS",
      "claim": "COMP_LEADS_TO_RECORD fixes STATE_LEADS_REDIS",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Durable Postgres copy ends TTL loss",
      "premise_ids": [
        "COMP_LEADS_TO_RECORD"
      ],
      "details": {
        "validation": "Proven by the validation path of COMP_LEADS_TO_RECORD"
      }
    },
    {
      "id": "EDGE_06",
      "from": "COMP_LEADS_TO_RECORD",
      "relation": "uses",
      "to": "CAP_CONTACT_DEDUP",
      "claim": "COMP_LEADS_TO_RECORD uses CAP_CONTACT_DEDUP",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Lead contact merges into record",
      "premise_ids": [
        "CAP_CONTACT_DEDUP"
      ],
      "details": {
        "validation": "Proven by the validation path of COMP_LEADS_TO_RECORD"
      }
    },
    {
      "id": "EDGE_07",
      "from": "COMP_OWNER_BY_EMAIL",
      "relation": "uses",
      "to": "CAP_APPROVE_LINK",
      "claim": "COMP_OWNER_BY_EMAIL uses CAP_APPROVE_LINK",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Reuse signed links",
      "premise_ids": [
        "CAP_APPROVE_LINK"
      ],
      "details": {
        "validation": "Proven by the validation path of COMP_OWNER_BY_EMAIL"
      }
    },
    {
      "id": "EDGE_08",
      "from": "COMP_OWNER_BY_EMAIL",
      "relation": "depends_on",
      "to": "RULE_EMAIL_GATE",
      "claim": "COMP_OWNER_BY_EMAIL depends_on RULE_EMAIL_GATE",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Owner mail must be enabled",
      "premise_ids": [
        "RULE_EMAIL_GATE"
      ],
      "details": {}
    },
    {
      "id": "EDGE_09",
      "from": "COMP_OWNER_BY_EMAIL",
      "relation": "uses",
      "to": "RULE_OWNER_RECIPIENT",
      "claim": "COMP_OWNER_BY_EMAIL uses RULE_OWNER_RECIPIENT",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "One recipient rule",
      "premise_ids": [
        "RULE_OWNER_RECIPIENT"
      ],
      "details": {
        "validation": "Proven by the validation path of COMP_OWNER_BY_EMAIL"
      }
    },
    {
      "id": "EDGE_10",
      "from": "COMP_AGENT_READABLE",
      "relation": "reads",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "COMP_AGENT_READABLE reads PRIM_BUSINESS_RECORD",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Single fact source",
      "premise_ids": [
        "PRIM_BUSINESS_RECORD"
      ],
      "details": {
        "validation": "Proven by the validation path of COMP_AGENT_READABLE"
      }
    },
    {
      "id": "EDGE_11",
      "from": "COMP_AGENT_READABLE",
      "relation": "advertises",
      "to": "CAP_BOOKING_API",
      "claim": "COMP_AGENT_READABLE advertises CAP_BOOKING_API",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "ReserveAction target",
      "premise_ids": [
        "CAP_BOOKING_API"
      ],
      "details": {
        "validation": "Proven by the validation path of COMP_AGENT_READABLE"
      }
    },
    {
      "id": "EDGE_12",
      "from": "COMP_AGENT_READABLE",
      "relation": "requires",
      "to": "GAP_POLICY_AVAIL",
      "claim": "COMP_AGENT_READABLE requires GAP_POLICY_AVAIL",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Agents ask price and availability",
      "premise_ids": [
        "SRC_PRIMS"
      ],
      "details": {}
    },
    {
      "id": "EDGE_13",
      "from": "PRIM_BUSINESS_RECORD",
      "relation": "blocked_by",
      "to": "BOTTLENECK_PROD_YES",
      "claim": "PRIM_BUSINESS_RECORD blocked_by BOTTLENECK_PROD_YES",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_REBORN_BR"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_14",
      "from": "SURF_JSONLD",
      "relation": "should_read",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "SURF_JSONLD should_read PRIM_BUSINESS_RECORD",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Stops regex-parsing free text",
      "premise_ids": [
        "SURF_JSONLD"
      ],
      "details": {
        "validation": "Proven by the validation path of SURF_JSONLD"
      }
    },
    {
      "id": "EDGE_REVIVAL_01",
      "from": "PRIM_BUSINESS",
      "relation": "owns",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "Business owns shared record.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_02",
      "from": "PRIM_BUSINESS_RECORD",
      "relation": "contains",
      "to": "PRIM_FACT_ASSERTION",
      "claim": "Shared facts retain assertions.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_03",
      "from": "PRIM_RECORD_REF",
      "relation": "references",
      "to": "PRIM_RESOURCE",
      "claim": "References bind persistent resources.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_04",
      "from": "PRIM_AVAILABILITY",
      "relation": "constrains",
      "to": "PRIM_RESOURCE",
      "claim": "Service/resource availability bounds reservations.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_05",
      "from": "PRIM_FINITE_WORK",
      "relation": "orchestrates",
      "to": "PRIM_OPERATION",
      "claim": "Several named operations may fulfill a finite result.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_06",
      "from": "PRIM_DECISION_GRANT",
      "relation": "authorizes",
      "to": "PRIM_OPERATION",
      "claim": "Execution requires current exact authority.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_07",
      "from": "PRIM_OPERATION",
      "relation": "requires",
      "to": "PRIM_CONNECTION",
      "claim": "External operation requires permitted account/resource binding.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_08",
      "from": "PRIM_OPERATION",
      "relation": "produces",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Invocation yields acceptance and verification records.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_09",
      "from": "PRIM_OPERATION",
      "relation": "emits",
      "to": "PRIM_EVENT_OUTBOX",
      "claim": "Local transitions emit atomic durable events.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_10",
      "from": "PRIM_PROCEDURE_RUN",
      "relation": "coordinates",
      "to": "PRIM_OPERATION",
      "claim": "Pinned procedures coordinate domain commands.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_11",
      "from": "PRIM_ONGOING_RESP",
      "relation": "evaluated_by",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Maintained condition requires windowed/fresh observation.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_12",
      "from": "PRIM_PROVIDER_COMMITMENT",
      "relation": "accepts",
      "to": "PRIM_ONGOING_RESP",
      "claim": "Provider separately accepts maintained obligations.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_13",
      "from": "PRIM_OFFERING_METHOD_INSTALL",
      "relation": "binds",
      "to": "PRIM_RESOURCE",
      "claim": "Installation maps definitions to native business resources.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_14",
      "from": "PRIM_OFFERING_METHOD_INSTALL",
      "relation": "configures",
      "to": "PRIM_PROCEDURE_RUN",
      "claim": "Installation selects procedure versions and bindings.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_15",
      "from": "PRIM_ECONOMIC_AGREEMENT",
      "relation": "bounds",
      "to": "PRIM_FINITE_WORK",
      "claim": "Accepted payer allowance/terms bound execution.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_16",
      "from": "RULE_CONNECTOR_RIGHTS",
      "relation": "constrains",
      "to": "PRIM_CONNECTION",
      "claim": "Provider permissions and terms limit external binding.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_17",
      "from": "RULE_WRITE_ACCEPTANCE",
      "relation": "constrains",
      "to": "PRIM_OPERATION",
      "claim": "Read-back failure cannot reopen an accepted effect.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_18",
      "from": "DESIGN_TYPED_DOMAINS",
      "relation": "uses",
      "to": "PRIM_RECORD_REF",
      "claim": "Common references bridge distinct typed stores.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_19",
      "from": "DESIGN_TYPED_DOMAINS",
      "relation": "preserves",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "Shared business facts do not erase domain authority.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_20",
      "from": "DESIGN_TYPED_DOMAINS",
      "relation": "preserves",
      "to": "PRIM_OPERATION",
      "claim": "Operations own semantic invariants.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_21",
      "from": "DESIGN_TYPED_DOMAINS",
      "relation": "supports",
      "to": "CAP_APP_SCHEMAS",
      "claim": "Custom schema extension stays bounded.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_22",
      "from": "COMP_FACT_TO_PUBLIC",
      "relation": "requires",
      "to": "PRIM_FACT_ASSERTION",
      "claim": "Exact fact is premise for publication.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_23",
      "from": "COMP_FACT_TO_PUBLIC",
      "relation": "requires",
      "to": "PRIM_FINITE_WORK",
      "claim": "Publication has accepted finite target.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_24",
      "from": "COMP_FACT_TO_PUBLIC",
      "relation": "requires",
      "to": "PRIM_DECISION_GRANT",
      "claim": "Current authority gates publication.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_25",
      "from": "COMP_FACT_TO_PUBLIC",
      "relation": "requires",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Surface verification proves applied result.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_26",
      "from": "COMP_AGENCY_UPGRADES",
      "relation": "requires",
      "to": "PRIM_OFFERING_METHOD_INSTALL",
      "claim": "Pinned versions and override ownership required.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_REVIVAL_27",
      "from": "COMP_AGENCY_UPGRADES",
      "relation": "requires",
      "to": "PRIM_DECISION_GRANT",
      "claim": "A method never brings pre-granted client authority.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_28",
      "from": "COMP_AGENCY_UPGRADES",
      "relation": "distributed_through",
      "to": "DIST_AGENCY_CHANNEL",
      "claim": "Charter supports creator distribution; adoption remains open.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_29",
      "from": "COMP_NATIVE_INDEPENDENT",
      "relation": "requires",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "Native tool reuses contacts within permitted purpose.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_30",
      "from": "ECON_RESP_MEASUREMENT",
      "relation": "requires",
      "to": "PRIM_ONGOING_RESP",
      "claim": "Measure versioned obligation and health window.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_31",
      "from": "ECON_RESP_MEASUREMENT",
      "relation": "requires",
      "to": "PRIM_ECONOMIC_AGREEMENT",
      "claim": "Compare measured cost to actual accepted terms.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_32",
      "from": "COMP_AGENT_READABLE",
      "relation": "requires",
      "to": "RULE_CONNECTOR_RIGHTS",
      "claim": "Structured public facts do not authorize a public upstream proxy.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_REVIVAL_33",
      "from": "PRIM_TENANT_LINK",
      "relation": "maps_to",
      "to": "PRIM_BUSINESS",
      "claim": "Legacy stable identity maps to business without renames.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [],
      "rationale": "Relationship is part of the proposed domain contract; endpoints alone do not prove this composition.",
      "premise_ids": [],
      "details": {
        "validation": "Exercise the relationship in an isolated end-to-end composition with current authority and failure evidence."
      }
    },
    {
      "id": "EDGE_DEBATE_01",
      "from": "PRIM_BUSINESS",
      "relation": "owns",
      "to": "PRIM_RECORD_REF",
      "claim": "Business owns the addressed typed domain records.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_02",
      "from": "PRIM_ACTOR_RELATIONSHIPS",
      "relation": "acts_under",
      "to": "PRIM_DECISION_GRANT",
      "claim": "Actor executes under a current scoped grant or exact decision.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back."
      }
    },
    {
      "id": "EDGE_DEBATE_03",
      "from": "PRIM_DECISION_GRANT",
      "relation": "authorizes",
      "to": "PRIM_OPERATION",
      "claim": "Current authority permits an exact operation within scope.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_04",
      "from": "PRIM_OPERATION",
      "relation": "changes",
      "to": "PRIM_RECORD_REF",
      "claim": "Authorized invocation changes typed domain state under its invariants.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_05",
      "from": "PRIM_CONNECTION",
      "relation": "enables_external_effect",
      "to": "PRIM_OPERATION",
      "claim": "Permitted selected external binding enables an outside effect; not a mandate.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_06",
      "from": "PRIM_OPERATION",
      "relation": "produces",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Invocation retains acceptance and verification evidence separately.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_07",
      "from": "PRIM_FINITE_WORK",
      "relation": "completed_against",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Versioned finite completion rule evaluates permitted evidence.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back."
      }
    },
    {
      "id": "EDGE_DEBATE_08",
      "from": "PRIM_ONGOING_RESP",
      "relation": "evaluated_over_window",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Maintained condition is assessed using fresh observations and explicit coverage.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back."
      }
    },
    {
      "id": "EDGE_DEBATE_09",
      "from": "PRIM_ONGOING_RESP",
      "relation": "initiates_scoped_recovery",
      "to": "PRIM_FINITE_WORK",
      "claim": "Breach may initiate bounded recovery work only inside accepted scope and current authority.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back."
      }
    },
    {
      "id": "EDGE_DEBATE_10",
      "from": "PRIM_PROVIDER_COMMITMENT",
      "relation": "accepts_delivery",
      "to": "PRIM_FINITE_WORK",
      "claim": "Provider separately accepts finite delivery scope and deadline.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back."
      }
    },
    {
      "id": "EDGE_DEBATE_11",
      "from": "PRIM_PROVIDER_COMMITMENT",
      "relation": "accepts_condition",
      "to": "PRIM_ONGOING_RESP",
      "claim": "Provider separately accepts maintained condition and exception ownership.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back."
      }
    },
    {
      "id": "EDGE_DEBATE_12",
      "from": "PRIM_BUSINESS",
      "relation": "owns",
      "to": "PRIM_METHOD_INSTALLATION",
      "claim": "Business retains installed records and configuration independent of provider access.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_13",
      "from": "PRIM_METHOD_INSTALLATION",
      "relation": "pins",
      "to": "PRIM_METHOD_DEFINITION",
      "claim": "Each installation selects an immutable qualified definition version.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_14",
      "from": "PRIM_METHOD_INSTALLATION",
      "relation": "binds",
      "to": "PRIM_RECORD_REF",
      "claim": "Installation binds definition requirements to native typed records/resources.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_DEBATE_15",
      "from": "PRIM_METHOD_DEFINITION",
      "relation": "declares",
      "to": "PRIM_OPERATION",
      "claim": "Reusable definition declares operation requirements; it does not grant execution permission.",
      "status": "proposed",
      "lifecycle": "retired",
      "freshness": "current",
      "evidence": [
        "SRC_PRIMITIVE_DEBATE"
      ],
      "rationale": "Proposed semantic relationship; existing local source does not establish this cross-domain composition.",
      "premise_ids": [],
      "details": {
        "validation": "Prove this relationship in the direct, finite and continuing website-change paths, including denied authority and failed read-back.",
        "retired": {
          "revision": 5,
          "reason": "Endpoint superseded in revision 5; see the endpoint's details.superseded_by."
        }
      }
    },
    {
      "id": "EDGE_SYSTEMS_01",
      "from": "PRIM_BUSINESS",
      "relation": "owns",
      "to": "PRIM_SYSTEM",
      "claim": "Business owns its Systems and shared context.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_02",
      "from": "PRIM_SYSTEM",
      "relation": "has",
      "to": "PRIM_SYSTEM_CONNECTION",
      "claim": "System exposes its directed Connections.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_03",
      "from": "PRIM_SYSTEM_CONNECTION",
      "relation": "connects_to",
      "to": "PRIM_SYSTEM",
      "claim": "A Connection may target another System; it may instead target an outside resource, audience or business record.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_04",
      "from": "PRIM_BUSINESS",
      "relation": "owns",
      "to": "PRIM_POSSIBILITY",
      "claim": "Possibility belongs at business scope so it can span several Systems.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_05",
      "from": "PRIM_POSSIBILITY",
      "relation": "changes_one_or_more",
      "to": "PRIM_SYSTEM",
      "claim": "A Possibility can change, introduce or remove one or several Systems.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_06",
      "from": "PRIM_POSSIBILITY",
      "relation": "made_real_as_change_to",
      "to": "PRIM_SYSTEM",
      "claim": "Make real brings the selected alternative into operation with previous state retained where possible.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_07",
      "from": "PRIM_SYSTEM",
      "relation": "adapted_as",
      "to": "PRIM_CONTEXT_VERSION",
      "claim": "Versions adapt Systems to contexts while retaining shared lineage.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_08",
      "from": "PRIM_CONTEXT_VERSION",
      "relation": "binds_locally",
      "to": "PRIM_SYSTEM_CONNECTION",
      "claim": "Contextual Versions receive their own resource/account/access bindings, not inherited live credentials.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_09",
      "from": "DESIGN_SYSTEMS_PRODUCT_MODEL",
      "relation": "presented_through",
      "to": "PRIM_SYSTEM",
      "claim": "Actual working Systems occupy the main customer surface.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_10",
      "from": "PRIM_SYSTEM",
      "relation": "supported_by",
      "to": "DESIGN_TYPED_DOMAINS",
      "claim": "System surface delegates typed state and invariants to native domain contracts.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_11",
      "from": "PRIM_SYSTEM_CONNECTION",
      "relation": "implemented_with",
      "to": "PRIM_CONNECTION",
      "claim": "External-act/read connections may use provider account binding; this is not the implementation of every connection kind.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_12",
      "from": "PRIM_SYSTEM_CONNECTION",
      "relation": "requires",
      "to": "RULE_SYSTEM_CONNECTION_CONTRACT",
      "claim": "Directed typed connections need explicit propagation and failure rules.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_13",
      "from": "PRIM_CONTEXT_VERSION",
      "relation": "requires",
      "to": "RULE_CONTEXT_VERSION_IDENTITY",
      "claim": "Context and revision axes remain independent and cross-business copies isolate operational state.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_14",
      "from": "PRIM_POSSIBILITY",
      "relation": "requires",
      "to": "RULE_POSSIBILITY_ISOLATION",
      "claim": "Alternatives retain baselines and bounded evaluation evidence.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_15",
      "from": "PRIM_POSSIBILITY",
      "relation": "made_real_through",
      "to": "COMP_MULTI_SYSTEM_ACTIVATION",
      "claim": "Grouped activation prepares and verifies the actual connected result.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_16",
      "from": "COMP_MULTI_SYSTEM_ACTIVATION",
      "relation": "requires",
      "to": "RULE_WRITE_ACCEPTANCE",
      "claim": "Accepted provider writes stay consumed even if subsequent verification or other steps fail.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_17",
      "from": "PRIM_SYSTEM",
      "relation": "requires",
      "to": "RULE_SYSTEM_OUTPUT_IDENTITY",
      "claim": "Evolving surface cannot silently rewrite issued results or accepted commitments.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_18",
      "from": "PRIM_SYSTEM",
      "relation": "requires",
      "to": "RULE_SYSTEM_PAUSE_HEALTH",
      "claim": "Lifecycle is distinct from current operating health and existing obligations.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_19",
      "from": "PRIM_CONTEXT_VERSION",
      "relation": "distributed_through",
      "to": "DIST_SYSTEM_VERSIONS",
      "claim": "Contextual adaptation supports agency/multi-location distribution.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation."
      }
    },
    {
      "id": "EDGE_SYSTEMS_20",
      "from": "COMP_SYSTEM_EXTRACTION",
      "relation": "prepared_as",
      "to": "PRIM_POSSIBILITY",
      "claim": "Extracting shared behavior can be experienced and evaluated before migration.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_SYSTEMS_21",
      "from": "ECON_SYSTEM_COMPOUNDING",
      "relation": "requires",
      "to": "PRIM_CONTEXT_VERSION",
      "claim": "Reuse economics depend on measured local adaptation and update costs.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Product semantics selected by founder; implementation mapping remains independently proposed.",
      "premise_ids": [],
      "details": {
        "scope": "Selected relationship in the founder product model; not observed operation.",
        "validation": "Exercise both endpoints under isolation and current authority; inspect stale state, dependency failure and recovery, rather than infer composition from their existence."
      }
    },
    {
      "id": "EDGE_AUDIT_01",
      "from": "OFFER_MANAGED_WEBSITES",
      "relation": "served_through",
      "to": "SURF_V1_CONTRACT",
      "claim": "Client sites read content and post leads/tracking through /api/v1.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_02",
      "from": "INT_CLIENT_REPOS",
      "relation": "calls",
      "to": "SURF_V1_CONTRACT",
      "claim": "Seven of nine client repos call /api/v1 routes (grep).",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_03",
      "from": "GAP_CLIENT_REPO_COVERAGE",
      "relation": "constrains",
      "to": "INT_CLIENT_REPOS",
      "claim": "Only gldf and rohlax are under contract checks.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_04",
      "from": "OFFER_MANAGED_WEBSITES",
      "relation": "billed_through",
      "to": "CAP_STRIPE_BILLING",
      "claim": "Managed-website revenue runs through the tenant Stripe webhook and pay links.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_05",
      "from": "SURF_OPERATOR_CONSOLE",
      "relation": "operates",
      "to": "OFFER_MANAGED_WEBSITES",
      "claim": "Operators run live clients from /admin.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_06",
      "from": "CAP_CRONS",
      "relation": "supports",
      "to": "OFFER_MANAGED_WEBSITES",
      "claim": "Clients are served partly through crons (reviews, monitoring, reports).",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_PLATFORM",
        "SRC_SEPT30_RELEASE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_07",
      "from": "RULE_PROXY_TENANT_AUTH",
      "relation": "constrains",
      "to": "OFFER_MANAGED_WEBSITES",
      "claim": "Every tenant request is gated by the proxy and tenant access checks.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_PLATFORM"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_08",
      "from": "CAP_WEBSITE_AGENT",
      "relation": "changes",
      "to": "OFFER_MANAGED_WEBSITES",
      "claim": "Ask Strelva writes live tenant content through approval.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_09",
      "from": "SURF_V1_CONTRACT",
      "relation": "writes",
      "to": "STATE_LEADS_REDIS",
      "claim": "/api/v1/leads stores leads only in Redis.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_LEADS",
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_10",
      "from": "GAP_LEADS_UNSEEN",
      "relation": "arises_from",
      "to": "STATE_LEADS_REDIS",
      "claim": "Expiry plus no owner email and no operator view.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_11",
      "from": "GAP_LEADS_UNSEEN",
      "relation": "affects",
      "to": "OFFER_MANAGED_WEBSITES",
      "claim": "Live client inquiries can be lost.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_12",
      "from": "COMP_LEADS_TO_RECORD",
      "relation": "fixes",
      "to": "GAP_LEADS_UNSEEN",
      "claim": "Postgres dual-write would make leads durable.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "Reborn section 0 is the audits' first fix.",
      "premise_ids": [],
      "details": {
        "validation": "Dual-write a test lead locally, expire the Redis copy and read it back from Postgres; then show it in /admin/clients/[id]."
      }
    },
    {
      "id": "EDGE_AUDIT_13",
      "from": "SURF_OPERATOR_CONSOLE",
      "relation": "omits",
      "to": "GAP_LEADS_UNSEEN",
      "claim": "No operator surface lists client leads.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_14",
      "from": "PROD_WEBSITE_REBUILD",
      "relation": "posts_to",
      "to": "SURF_V1_CONTRACT",
      "claim": "Hosted v2 site forms post to the Redis-only /api/v1/leads.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_15",
      "from": "PROD_WEBSITE_REBUILD",
      "relation": "seeds",
      "to": "PRIM_POSSIBILITY",
      "claim": "Rebuild is the clearest existing Possibility; approve+publish is Make real.",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "It builds a complete alternative beside the live site, compares before/after and publishes with receipts.",
      "premise_ids": [
        "PROD_WEBSITE_REBUILD",
        "PRIM_POSSIBILITY"
      ],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_16",
      "from": "PROD_WEBSITE_AUDIT",
      "relation": "opens",
      "to": "PROD_WEBSITE_REBUILD",
      "claim": "An audit result should start a rebuild.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "Natural top of the funnel; today the link is conceptual only.",
      "premise_ids": [],
      "details": {
        "validation": "Paste a URL, see the audit, start a rebuild from it in one flow locally."
      }
    },
    {
      "id": "EDGE_AUDIT_17",
      "from": "PROD_ASSESSMENT",
      "relation": "presents",
      "to": "PROD_WEBSITE_AUDIT",
      "claim": "Assessment presents saved audit results.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_18",
      "from": "PROD_ASSESSMENT",
      "relation": "presents",
      "to": "PROD_AI_VISIBILITY",
      "claim": "Assessment presents saved AI-visibility results.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_19",
      "from": "PROD_DOMAIN_MONITOR",
      "relation": "monitors",
      "to": "OFFER_MANAGED_WEBSITES",
      "claim": "Covers every active tenant domain.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_WEBSITES"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_20",
      "from": "RULE_SYSTEM_PAUSE_HEALTH",
      "relation": "reads",
      "to": "PROD_DOMAIN_MONITOR",
      "claim": "The health branch reuses domain monitor, heartbeat and scan summaries.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT",
        "SRC_HEALTH"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_21",
      "from": "PROD_NATIVE_APPS",
      "relation": "seeds",
      "to": "PRIM_SYSTEM",
      "claim": "Native apps already have Draft/Live/History shape.",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "draft->installed, candidate, releases and use grants map onto System lifecycle, Possibility, History and share.",
      "premise_ids": [
        "PROD_NATIVE_APPS",
        "PRIM_SYSTEM"
      ],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_22",
      "from": "PROD_TRACKER",
      "relation": "duplicates",
      "to": "PROD_NATIVE_APPS",
      "claim": "Second typed-record engine with different storage.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_23",
      "from": "PROD_WORK_PLANS",
      "relation": "creates",
      "to": "PROD_NATIVE_APPS",
      "claim": "Plan execution creates a native application draft (native-output.ts).",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_24",
      "from": "PROD_INVESTIGATIONS",
      "relation": "implements",
      "to": "CAP_STANDING_CHECKS",
      "claim": "Standing checks run investigation.run.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_EXECUTION_CODE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_25",
      "from": "PROD_OPERATIONS",
      "relation": "runs_on",
      "to": "DESIGN_EXECUTION",
      "claim": "Operations uses work-execution receipts, reconcile and assignments.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_26",
      "from": "PROD_ONBOARDING",
      "relation": "stores_files_in",
      "to": "PROD_DOCUMENTS",
      "claim": "Documents is onboarding's attachment store.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_27",
      "from": "PROD_WORKSPACE_SCHEDULING",
      "relation": "implements",
      "to": "CAP_BOOKING_API",
      "claim": "/api/v1/bookings runs on workspace scheduling.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_28",
      "from": "RISK_PUBLIC_BOOKING_PAUSE",
      "relation": "affects",
      "to": "CAP_BOOKING_API",
      "claim": "Pause is ignored by the public booking path.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_29",
      "from": "RULE_SYSTEM_PAUSE_HEALTH",
      "relation": "introduces",
      "to": "RISK_PUBLIC_BOOKING_PAUSE",
      "claim": "Pause scoped to scheduling creates the gap.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_30",
      "from": "PROD_HOME_FINDER",
      "relation": "maps_to",
      "to": "PRIM_CONNECTION",
      "claim": "Home Finder would be a connection to an external product.",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "Signed adapter to an outside system; no customer System.",
      "premise_ids": [
        "PROD_HOME_FINDER",
        "PRIM_CONNECTION"
      ],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_31",
      "from": "COMP_FACT_TO_PUBLIC",
      "relation": "requires",
      "to": "PRIM_BUSINESS_RECORD",
      "claim": "Replaces the retired requirement on PRIM_FACT_ASSERTION.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "Fact assertion merged into the business record.",
      "premise_ids": [],
      "details": {
        "validation": "Publish one approved business-record fact to a public surface and verify read-back."
      }
    },
    {
      "id": "EDGE_AUDIT_32",
      "from": "COMP_AGENCY_UPGRADES",
      "relation": "requires",
      "to": "PRIM_CONTEXT_VERSION",
      "claim": "Replaces the retired requirement on PRIM_OFFERING_METHOD_INSTALL.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT",
        "SRC_VERSIONS"
      ],
      "rationale": "Method definition/installation merged into Version origin/descendant.",
      "premise_ids": [],
      "details": {
        "validation": "Adapt one agency origin for two isolated businesses and adopt an upstream fix without override loss (D08)."
      }
    },
    {
      "id": "EDGE_AUDIT_33",
      "from": "COMP_MULTI_SYSTEM_ACTIVATION",
      "relation": "should_run_on",
      "to": "DESIGN_EXECUTION",
      "claim": "Make real should reuse work-execution instead of a second engine.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "One engine; make-real duplicates leases, reconcile and unknown outcomes.",
      "premise_ids": [],
      "details": {
        "validation": "Port runner onto work-execution with a restart test."
      }
    },
    {
      "id": "EDGE_AUDIT_34",
      "from": "DESIGN_EXECUTION",
      "relation": "produces",
      "to": "PRIM_RECEIPT_OBSERVATION",
      "claim": "Execution produces receipts and observations.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_EXECUTION_CODE"
      ],
      "rationale": "Replaces EDGE_REVIVAL_08/EDGE_DEBATE_06 after supersession.",
      "premise_ids": [],
      "details": {
        "validation": "Show one receipt per accepted effect from a work-execution run."
      }
    },
    {
      "id": "EDGE_AUDIT_35",
      "from": "PRIM_DECISION_GRANT",
      "relation": "authorizes",
      "to": "DESIGN_EXECUTION",
      "claim": "Grants authorize execution steps.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_EXECUTION_CODE",
        "SRC_AUTHORITY_CODE"
      ],
      "rationale": "Replaces EDGE_REVIVAL_06/EDGE_DEBATE_03.",
      "premise_ids": [],
      "details": {
        "validation": "Revoke a grant before retry and observe the step refused."
      }
    },
    {
      "id": "EDGE_AUDIT_36",
      "from": "PRIM_CONNECTION",
      "relation": "enables_external_effect",
      "to": "DESIGN_EXECUTION",
      "claim": "Account bindings enable outside effects.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_EXECUTION_CODE"
      ],
      "rationale": "Replaces EDGE_DEBATE_05/EDGE_REVIVAL_07.",
      "premise_ids": [],
      "details": {
        "validation": "Run a calendar write through work-execution using a bound account with renewal failure handled."
      }
    },
    {
      "id": "EDGE_AUDIT_37",
      "from": "RULE_WRITE_ACCEPTANCE",
      "relation": "constrains",
      "to": "DESIGN_EXECUTION",
      "claim": "Accepted writes are consumed and never retried.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_EXECUTION_CODE"
      ],
      "rationale": "Replaces EDGE_REVIVAL_17.",
      "premise_ids": [],
      "details": {
        "validation": "Failed read-back after provider acceptance is recorded separately and not retried."
      }
    },
    {
      "id": "EDGE_AUDIT_38",
      "from": "PRIM_FINITE_WORK",
      "relation": "orchestrates",
      "to": "DESIGN_EXECUTION",
      "claim": "Finite work is run by the execution engine.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_EXECUTION_CODE"
      ],
      "rationale": "Replaces EDGE_REVIVAL_05.",
      "premise_ids": [],
      "details": {
        "validation": "Run one service request end to end on work-execution."
      }
    },
    {
      "id": "EDGE_AUDIT_39",
      "from": "ISSUE_SYSTEMS_AUDIT_DEFECTS",
      "relation": "affects",
      "to": "COMP_MULTI_SYSTEM_ACTIVATION",
      "claim": "Make-real defects D01-D04.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_40",
      "from": "ISSUE_SYSTEMS_AUDIT_DEFECTS",
      "relation": "affects",
      "to": "PRIM_SYSTEM",
      "claim": "Spine defects D10, D12, D13.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_41",
      "from": "ISSUE_SYSTEMS_AUDIT_DEFECTS",
      "relation": "affects",
      "to": "PRIM_SYSTEM_CONNECTION",
      "claim": "Spine defect D11.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_42",
      "from": "ISSUE_SYSTEMS_AUDIT_DEFECTS",
      "relation": "affects",
      "to": "PRIM_CONTEXT_VERSION",
      "claim": "Versions defects D08-D09.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_43",
      "from": "ISSUE_SYSTEMS_AUDIT_DEFECTS",
      "relation": "affects",
      "to": "RULE_SYSTEM_PAUSE_HEALTH",
      "claim": "Health defects D05-D07.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_44",
      "from": "PRIM_SYSTEM_CONNECTION",
      "relation": "may_target",
      "to": "PRIM_CONNECTION",
      "claim": "Spine's account_binding target makes an external account one kind of Connection target.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_LATENT",
        "SRC_SPINE"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Local and unmerged: branch transition/systems at b891b295 in REB-sys-integrate; not pushed, spine SQL unapplied, make-real and Versions in-memory. Not a production claim."
      }
    },
    {
      "id": "EDGE_AUDIT_45",
      "from": "OFFER_MANAGED_WEBSITES",
      "relation": "moves_via",
      "to": "CAP_CONVERT",
      "claim": "Clients move into workspaces through tenant conversion.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_REBORN",
        "SRC_TRANSITION_MAP"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {
        "scope": "Confirmed intent; conversion is local and unapplied."
      }
    },
    {
      "id": "EDGE_AUDIT_46",
      "from": "UNK_EMAIL_PROD",
      "relation": "depends_on",
      "to": "RULE_EMAIL_GATE",
      "claim": "Whether owners get mail depends on the gate and per-tenant overrides.",
      "status": "confirmed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_OWNER_MSG",
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "",
      "premise_ids": [],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_47",
      "from": "UNK_EMAIL_PROD",
      "relation": "constrains",
      "to": "COMP_OWNER_BY_EMAIL",
      "claim": "Running the workspace from the inbox needs client mail on.",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_CUSTOMER_OPS"
      ],
      "rationale": "The composition sends owner mail.",
      "premise_ids": [
        "UNK_EMAIL_PROD",
        "COMP_OWNER_BY_EMAIL"
      ],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_48",
      "from": "COMP_SYSTEM_EVOLUTION",
      "relation": "requires",
      "to": "PRIM_SYSTEM",
      "claim": "Evolving a proposal into a process requires stable System identity.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_SYSTEMS_DIRECTION"
      ],
      "rationale": "Connects a previously orphaned composition.",
      "premise_ids": [],
      "details": {
        "validation": "Evolve one System across kinds locally without changing its id."
      }
    },
    {
      "id": "EDGE_AUDIT_49",
      "from": "PROD_CUSTOM_APPS",
      "relation": "seeds",
      "to": "PRIM_SYSTEM",
      "claim": "Artifact-backed System with immutable releases fits; the build path does not.",
      "status": "inferred",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "Releases/reviews/CSP sandbox are reusable.",
      "premise_ids": [
        "PROD_CUSTOM_APPS",
        "PRIM_SYSTEM"
      ],
      "details": {}
    },
    {
      "id": "EDGE_AUDIT_50",
      "from": "PROD_INVESTIGATIONS",
      "relation": "feeds",
      "to": "RULE_SYSTEM_PAUSE_HEALTH",
      "claim": "A saved check should be health of the System it watches.",
      "status": "proposed",
      "lifecycle": "active",
      "freshness": "current",
      "evidence": [
        "SRC_AUDIT_APPS"
      ],
      "rationale": "Audit call: merge investigations into System health.",
      "premise_ids": [],
      "details": {
        "validation": "Show a page-fingerprint change as a health observation on a website System locally."
      }
    }
  ],
  "questions": [
    {
      "id": "Q_EMAIL_PROD",
      "question": "Is EMAIL_SENDING_ENABLED or any per-tenant override on in production?",
      "affects": [
        "UNK_EMAIL_PROD",
        "COMP_OWNER_BY_EMAIL"
      ],
      "next_check": "Read prod env names (not values) via Vercel, or mail-log rows for audience client in last 30 days",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "Docs record client mail paused and the owner notice cannot arm (no tenantId); three client repos send owner mail directly. Still needs a production env-name read (Jacob's call).",
        "sources": [
          "SRC_AUDIT_CUSTOMER_OPS"
        ]
      }
    },
    {
      "id": "Q_LEAD_LOSS",
      "question": "How many leads have already expired out of Redis per tenant?",
      "affects": [
        "STATE_LEADS_REDIS"
      ],
      "next_check": "Read-only snapshot: compare leads:{tenant} oldest score with mail-log new-lead count",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "Still unmeasured. New: hosted v2 sites and public bookings feed the same store; no operator view exists.",
        "sources": [
          "SRC_AUDIT_CUSTOMER_OPS",
          "SRC_AUDIT_WEBSITES"
        ]
      }
    },
    {
      "id": "Q_MIGRATION_BUNDLE",
      "question": "Should the inquiries table and policy/availability facts ride the unapplied business-record migration?",
      "affects": [
        "COMP_LEADS_TO_RECORD",
        "GAP_POLICY_AVAIL"
      ],
      "next_check": "Jacob decision; build both into REB-reborn and prove in check:workspace-sql first",
      "status": "open"
    },
    {
      "id": "Q_SIGNIN",
      "question": "Will owners use the workspace at all?",
      "affects": [
        "COMP_OWNER_BY_EMAIL",
        "REL_REBORN"
      ],
      "next_check": "Owner action rate on email links after first converted client",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "Unchanged evidence: 1 sign-in in 30 days, 0 tenant memberships, 0 workspaces (Sept 30). Every workspace product is SHIPPED-UNUSED at best.",
        "sources": [
          "SRC_SEPT30_RELEASE",
          "SRC_AUDIT_APPS"
        ]
      }
    },
    {
      "id": "Q_MODEL_BOUNDARIES",
      "question": "Which workspace-domain contracts should supersede the legacy ontology after one real composition proves them?",
      "affects": [
        "DESIGN_TYPED_DOMAINS",
        "PRIM_FINITE_WORK",
        "PRIM_OFFERING_METHOD_INSTALL"
      ],
      "next_check": "Propose a workspace-domain ADR against existing accepted decisions; no deployed rename or silent normative replacement.",
      "status": "open"
    },
    {
      "id": "Q_CONNECTOR_RIGHTS",
      "question": "What provider data/evidence can each actual connector retain, expose and act on under current account scopes and provider terms?",
      "affects": [
        "PRIM_CONNECTION",
        "RULE_CONNECTOR_RIGHTS",
        "COMP_AGENT_READABLE"
      ],
      "next_check": "Inventory existing connectors and grants read-only; document allowed uses/retention and verify exact consent before external execution.",
      "status": "open"
    },
    {
      "id": "Q_UNIFIED_BOOKING",
      "question": "Which store becomes canonical for reservation capacity and how do both public booking paths preserve their contracts?",
      "affects": [
        "PRIM_AVAILABILITY"
      ],
      "next_check": "Trace both route families and prove capacity/timezone/concurrency parity with isolated failure tests before migration.",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "/api/v1/bookings already runs on workspace scheduling (saved_product_work); the legacy dashboard (/api/booking/list, dashboard/schedule) still reads the tenant booking store. No client repo calls /api/booking. Workspace scheduling cannot yet express weekly hours.",
        "sources": [
          "SRC_AUDIT_LATENT",
          "SRC_AUDIT_CUSTOMER_OPS"
        ]
      }
    },
    {
      "id": "Q_METHOD_OWNERSHIP",
      "question": "Which installation components are definition-owned, business-owned or overridable, and what constitutes a safe upgrade/rollback?",
      "affects": [
        "PRIM_OFFERING_METHOD_INSTALL",
        "COMP_AGENCY_UPGRADES"
      ],
      "next_check": "Exercise two local installations with conflicting overrides and an incompatible schema update; bind roles/connections independently.",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "Versions exercises two installations with conflicting overrides and exposed override loss on whole-object overrides (D08). Ownership rules beyond that untested.",
        "sources": [
          "SRC_AUDIT_LATENT",
          "SRC_VERSIONS"
        ]
      }
    },
    {
      "id": "Q_RESP_WINDOW",
      "question": "What exact condition, observation window, clock, exclusions and recovery owner define the first maintained responsibility?",
      "affects": [
        "PRIM_ONGOING_RESP",
        "ECON_RESP_MEASUREMENT"
      ],
      "next_check": "Use approved website fact publication to define technical completion separately from maintained accuracy; measure failures and exception labor.",
      "status": "open"
    },
    {
      "id": "Q_FACT_SUBJECT",
      "question": "When must verified facts become location/service/resource-specific and how are conflicts, effective dates and sensitive uses represented?",
      "affects": [
        "PRIM_FACT_ASSERTION",
        "PRIM_AVAILABILITY"
      ],
      "next_check": "Use a multi-location or multi-resource booking fixture and source conflict to qualify an additive contract.",
      "status": "open"
    },
    {
      "id": "Q_MODEL_BACKUP",
      "question": "When will the untracked canonical model and derived views be committed and shared across branches?",
      "affects": [
        "REL_REBORN"
      ],
      "next_check": "Include only these product-memory changes in a reviewed commit; reconcile canonical revision before branch merge. No commit made in this research task.",
      "status": "open",
      "risk": {
        "revision": 5,
        "at": "2026-10-05",
        "sources": [
          "SRC_MODEL_STORAGE",
          "SRC_AUDIT_LATENT"
        ],
        "facts": [
          "PRODUCT_MODEL.md (~160 KB before this revision) and .product/ are untracked and not gitignored: git clean -fd deletes them",
          "Snapshots and output/ (~117 MB) are also untracked",
          "The REB checkout is 7 commits behind origin/main (missing PR #209), so no other worktree can see the model while docs on transition/docs send agents to it",
          "ADRs 0006-0011 are untracked in the parent repo"
        ],
        "action_not_taken": "Not committed in this update by instruction. Answerable now: commit PRODUCT_MODEL.md, .product/ and the ADRs on a branch from origin/main (git only, not production)."
      }
    },
    {
      "id": "Q_SHARED_GRAMMAR_PROOF",
      "question": "Can one website change reuse the same native operation as direct owner action, finite managed Work and a continuing Responsibility without forcing their lifecycles together?",
      "affects": [
        "DESIGN_SHARED_GRAMMAR",
        "PRIM_OPERATION",
        "PRIM_FINITE_WORK",
        "PRIM_ONGOING_RESP"
      ],
      "next_check": "Run the three paths locally with exact approval/revocation and accepted-write/read-back failure; keep managed service acceptance separate from domain execution.",
      "status": "open"
    },
    {
      "id": "Q_SYSTEM_BOUNDARY",
      "question": "When should extending a System keep its identity, and when should shared reuse/ownership/lifecycle trigger an explicit new System?",
      "affects": [
        "PRIM_SYSTEM",
        "COMP_SYSTEM_EXTRACTION"
      ],
      "next_check": "Exercise proposal-to-onboarding evolution, then extract Pricing for two consumers; preserve identity, issued outputs and clear ownership in both cases.",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "Spine's from-existing.ts decided: onboarding is not a System, Twin Trees is two Systems. The transition map and strelva-reborn.md:26 say otherwise; now a decision between two written answers (see Q_TWIN_TREES).",
        "sources": [
          "SRC_AUDIT_LATENT",
          "SRC_SPINE",
          "SRC_TRANSITION_MAP"
        ]
      }
    },
    {
      "id": "Q_CONTEXT_RELEASE_AXIS",
      "question": "How do contextual Versions, isolated client System identities and temporal releases map onto current app/site version fields without breaking contracts?",
      "affects": [
        "PRIM_CONTEXT_VERSION",
        "RULE_CONTEXT_VERSION_IDENTITY"
      ],
      "next_check": "Trace native candidate/release fields and two-business source-update adoption; propose an additive mapping and migration separately, no automatic renaming.",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "On 2026-10-04 the audit found the Versions mapping did not fit spine revision ids. Integration (91295360) re-based Versions on SystemRevisionRef with deterministic projected ids for legacy revisions. Resolved locally, unmerged; product-ontology.md:317 still defines Version as history.",
        "sources": [
          "SRC_AUDIT_LATENT",
          "SRC_SYSTEMS_INTEGRATION"
        ]
      }
    },
    {
      "id": "Q_MAKE_REAL",
      "question": "What exact operating contract lets a multi-System Possibility be marked made real, and what remains usable after partial activation?",
      "affects": [
        "PRIM_POSSIBILITY",
        "COMP_MULTI_SYSTEM_ACTIVATION"
      ],
      "next_check": "Rehearse a Pricing/Proposal/Booking alternative and interrupt activation after an accepted effect; verify pinned baselines, denied authority and incomplete-state recovery.",
      "status": "open",
      "partial_answer": {
        "revision": 5,
        "at": "2026-10-05",
        "answer": "Answered locally against fakes: made_real requires every operating check to pass; partial activation is needs_attention. Unproven with real providers and process restart; D01-D04 open.",
        "sources": [
          "SRC_AUDIT_LATENT",
          "SRC_MAKE_REAL"
        ]
      }
    },
    {
      "id": "Q_SYSTEM_VALUE_COST",
      "question": "Does the System/Connections/Possibilities/Versions model make real customer work easier, and what does reliable creation/adaptation cost?",
      "affects": [
        "DESIGN_SYSTEMS_PRODUCT_MODEL",
        "ECON_SYSTEM_COMPOUNDING"
      ],
      "next_check": "Measure comprehension, time-to-useful-result, reuse/update cost and recovery labor with permitted actual tasks; do not treat synthetic comparison as demand proof.",
      "status": "open"
    },
    {
      "id": "Q_PAYING_CLIENTS",
      "question": "Which of the 12 active tenant ids are the nine paying clients, and on what billing (subscription, pay link, grandfathered)?",
      "affects": [
        "OFFER_MANAGED_WEBSITES",
        "CAP_STRIPE_BILLING"
      ],
      "next_check": "Read-only join of Stripe subscriptions/pay links to tenants (production read: Jacob's call), or Jacob names them.",
      "status": "open"
    },
    {
      "id": "Q_OWNER_LEAD_EMAIL",
      "question": "Do owners receive leads by email today (REB gate, per-tenant override, or their own repo's Resend handler), giving a durable copy outside Redis?",
      "affects": [
        "GAP_LEADS_UNSEEN",
        "UNK_EMAIL_PROD",
        "INT_CLIENT_REPOS"
      ],
      "next_check": "Production env names (not values) plus each client repo's form handler; Resend logs per sending domain.",
      "status": "open"
    },
    {
      "id": "Q_SEPT30_MIGRATIONS",
      "question": "Are all repository migrations through 20260930120000 still applied in production, and which deployed tables back each 'deployed schema, 0 users' primitive?",
      "affects": [
        "PRIM_BUSINESS",
        "PRIM_DECISION_GRANT",
        "PRIM_ACTOR_RELATIONSHIPS",
        "PRIM_FINITE_WORK",
        "PRIM_ONGOING_RESP",
        "PRIM_ECONOMIC_AGREEMENT",
        "PRIM_RECEIPT_OBSERVATION",
        "PRIM_CONNECTION"
      ],
      "next_check": "Read-only supabase migration list --linked (production read: Jacob's call); the Sept 30 record says 84/84 plus the grant fix.",
      "status": "open"
    },
    {
      "id": "Q_TWIN_TREES",
      "question": "Is Twin Trees one business with two location Versions of one website System, or two businesses/Systems?",
      "affects": [
        "PRIM_CONTEXT_VERSION",
        "PRIM_SYSTEM",
        "OFFER_MANAGED_WEBSITES"
      ],
      "next_check": "Ask Jacob/the client before conversion; spine currently produces two Systems, the map proposes one System with two Versions.",
      "status": "open"
    },
    {
      "id": "Q_SYSTEMS_DEFECTS",
      "question": "Which of the open transition/systems defects (D01-D13) does the running fix pass close, each proven by a test that fails before the fix?",
      "affects": [
        "ISSUE_SYSTEMS_AUDIT_DEFECTS",
        "COMP_MULTI_SYSTEM_ACTIVATION",
        "RULE_SYSTEM_PAUSE_HEALTH",
        "PRIM_CONTEXT_VERSION",
        "PRIM_SYSTEM"
      ],
      "next_check": "Read the fix-pass commits on transition/systems and rerun the full suite plus the named regression tests.",
      "status": "open"
    },
    {
      "id": "Q_ADR_0011",
      "question": "Will ADR 0011 be accepted, and which detailed definitions (six Connection kinds, Draft/Live/Paused, Exploring/Ready) were Jacob's words?",
      "affects": [
        "DESIGN_SYSTEMS_PRODUCT_MODEL",
        "PRIM_SYSTEM",
        "PRIM_SYSTEM_CONNECTION",
        "PRIM_POSSIBILITY",
        "PRIM_CONTEXT_VERSION"
      ],
      "next_check": "Jacob reviews ADR 0011 and marks accepted text.",
      "status": "open"
    }
  ],
  "changes": [
    {
      "revision": 1,
      "reason": "Initialize model on Reborn critical path and latent owner/agent machinery",
      "added": [
        "REL_REBORN",
        "PRIM_BUSINESS_RECORD",
        "PRIM_TENANT_LINK",
        "CAP_CONVERT",
        "STATE_LEADS_REDIS",
        "CAP_CONTACT_DEDUP",
        "RULE_EMAIL_GATE",
        "CAP_APPROVE_LINK",
        "RULE_OWNER_RECIPIENT",
        "CAP_BOOKING_API",
        "SURF_JSONLD",
        "GAP_POLICY_AVAIL",
        "UNK_EMAIL_PROD",
        "COMP_LEADS_TO_RECORD",
        "COMP_OWNER_BY_EMAIL",
        "COMP_AGENT_READABLE",
        "BOTTLENECK_PROD_YES",
        "EDGE_01",
        "EDGE_02",
        "EDGE_03",
        "EDGE_04",
        "EDGE_05",
        "EDGE_06",
        "EDGE_07",
        "EDGE_08",
        "EDGE_09",
        "EDGE_10",
        "EDGE_11",
        "EDGE_12",
        "EDGE_13",
        "EDGE_14",
        "SRC_REBORN",
        "SRC_REBORN_BR",
        "SRC_BR_MIG",
        "SRC_PRIMS",
        "SRC_PROGRESS",
        "SRC_LEADS",
        "SRC_OWNER_MSG",
        "SRC_AGENT_READY",
        "Q_EMAIL_PROD",
        "Q_LEAD_LOSS",
        "Q_MIGRATION_BUNDLE",
        "Q_SIGNIN"
      ],
      "updated": [],
      "invalidated": [],
      "retired": [],
      "sources": [
        "SRC_REBORN",
        "SRC_REBORN_BR",
        "SRC_BR_MIG",
        "SRC_PRIMS",
        "SRC_PROGRESS",
        "SRC_LEADS",
        "SRC_OWNER_MSG",
        "SRC_AGENT_READY"
      ],
      "at": "2026-10-02"
    },
    {
      "revision": 2,
      "at": "2026-10-02",
      "reason": "Extend canonical revival model through domain and composition research; preserve finite Work/provider/economic boundaries and constrain external connectors; correct source-only operating claims.",
      "added": [
        "SRC_REVIVAL_BLUEPRINT",
        "SRC_CONTEXT_CURRENT",
        "SRC_PARTNER_CHARTER",
        "SRC_RECORD_CURRENT",
        "SRC_DOMAIN_CODE",
        "SRC_AUTHORITY_CODE",
        "SRC_ECONOMICS_CODE",
        "SRC_EXECUTION_CODE",
        "SRC_PALANTIR",
        "SRC_FRAPPE",
        "SRC_TEMPORAL",
        "SRC_HIGHLEVEL",
        "SRC_DATAVERSE",
        "SRC_MCP_AUTH",
        "SRC_GBP_POLICY",
        "SRC_CALENDAR_SYNC",
        "SRC_CALENDAR_AUTH",
        "SRC_SCHEMA_RESERVE",
        "PRIM_BUSINESS",
        "PRIM_RECORD_REF",
        "PRIM_FACT_ASSERTION",
        "PRIM_RESOURCE",
        "PRIM_AVAILABILITY",
        "PRIM_FINITE_WORK",
        "PRIM_OPERATION",
        "PRIM_DECISION_GRANT",
        "PRIM_CONNECTION",
        "PRIM_EVENT_OUTBOX",
        "PRIM_PROCEDURE_RUN",
        "PRIM_RECEIPT_OBSERVATION",
        "PRIM_PROVIDER_COMMITMENT",
        "PRIM_ONGOING_RESP",
        "PRIM_OFFERING_METHOD_INSTALL",
        "PRIM_ECONOMIC_AGREEMENT",
        "DESIGN_TYPED_DOMAINS",
        "RULE_WRITE_ACCEPTANCE",
        "RULE_CONNECTOR_RIGHTS",
        "CAP_APP_SCHEMAS",
        "CAP_STANDING_CHECKS",
        "COMP_FACT_TO_PUBLIC",
        "COMP_AGENCY_UPGRADES",
        "COMP_NATIVE_INDEPENDENT",
        "DIST_AGENCY_CHANNEL",
        "ECON_RESP_MEASUREMENT",
        "EDGE_REVIVAL_01",
        "EDGE_REVIVAL_02",
        "EDGE_REVIVAL_03",
        "EDGE_REVIVAL_04",
        "EDGE_REVIVAL_05",
        "EDGE_REVIVAL_06",
        "EDGE_REVIVAL_07",
        "EDGE_REVIVAL_08",
        "EDGE_REVIVAL_09",
        "EDGE_REVIVAL_10",
        "EDGE_REVIVAL_11",
        "EDGE_REVIVAL_12",
        "EDGE_REVIVAL_13",
        "EDGE_REVIVAL_14",
        "EDGE_REVIVAL_15",
        "EDGE_REVIVAL_16",
        "EDGE_REVIVAL_17",
        "EDGE_REVIVAL_18",
        "EDGE_REVIVAL_19",
        "EDGE_REVIVAL_20",
        "EDGE_REVIVAL_21",
        "EDGE_REVIVAL_22",
        "EDGE_REVIVAL_23",
        "EDGE_REVIVAL_24",
        "EDGE_REVIVAL_25",
        "EDGE_REVIVAL_26",
        "EDGE_REVIVAL_27",
        "EDGE_REVIVAL_28",
        "EDGE_REVIVAL_29",
        "EDGE_REVIVAL_30",
        "EDGE_REVIVAL_31",
        "EDGE_REVIVAL_32",
        "EDGE_REVIVAL_33",
        "Q_MODEL_BOUNDARIES",
        "Q_CONNECTOR_RIGHTS",
        "Q_UNIFIED_BOOKING",
        "Q_METHOD_OWNERSHIP",
        "Q_RESP_WINDOW",
        "Q_FACT_SUBJECT",
        "Q_MODEL_BACKUP"
      ],
      "updated": [
        "STATE_LEADS_REDIS",
        "RULE_EMAIL_GATE",
        "CAP_BOOKING_API",
        "PRIM_BUSINESS_RECORD",
        "GAP_POLICY_AVAIL",
        "BOTTLENECK_PROD_YES",
        "COMP_AGENT_READABLE"
      ],
      "invalidated": [],
      "retired": [],
      "sources": [
        "SRC_REVIVAL_BLUEPRINT",
        "SRC_CONTEXT_CURRENT",
        "SRC_PARTNER_CHARTER",
        "SRC_RECORD_CURRENT",
        "SRC_DOMAIN_CODE",
        "SRC_AUTHORITY_CODE",
        "SRC_ECONOMICS_CODE",
        "SRC_EXECUTION_CODE",
        "SRC_PALANTIR",
        "SRC_FRAPPE",
        "SRC_TEMPORAL",
        "SRC_HIGHLEVEL",
        "SRC_DATAVERSE",
        "SRC_MCP_AUTH",
        "SRC_GBP_POLICY",
        "SRC_CALENDAR_SYNC",
        "SRC_CALENDAR_AUTH",
        "SRC_SCHEMA_RESERVE"
      ]
    },
    {
      "revision": 3,
      "at": "2026-10-02",
      "reason": "Primitive debate: classify existing candidates, make actor/method/installation explicit and save proposed semantic graph; preserve all source evidence and independent delivery/authority lifecycles.",
      "added": [
        "SRC_PRIMITIVE_DEBATE",
        "PRIM_ACTOR_RELATIONSHIPS",
        "PRIM_METHOD_DEFINITION",
        "PRIM_METHOD_INSTALLATION",
        "DESIGN_SHARED_GRAMMAR",
        "EDGE_DEBATE_01",
        "EDGE_DEBATE_02",
        "EDGE_DEBATE_03",
        "EDGE_DEBATE_04",
        "EDGE_DEBATE_05",
        "EDGE_DEBATE_06",
        "EDGE_DEBATE_07",
        "EDGE_DEBATE_08",
        "EDGE_DEBATE_09",
        "EDGE_DEBATE_10",
        "EDGE_DEBATE_11",
        "EDGE_DEBATE_12",
        "EDGE_DEBATE_13",
        "EDGE_DEBATE_14",
        "EDGE_DEBATE_15",
        "Q_SHARED_GRAMMAR_PROOF"
      ],
      "updated": [
        "PRIM_RESOURCE",
        "PRIM_FACT_ASSERTION",
        "PRIM_AVAILABILITY",
        "PRIM_EVENT_OUTBOX",
        "PRIM_PROCEDURE_RUN",
        "PRIM_ECONOMIC_AGREEMENT",
        "PRIM_OFFERING_METHOD_INSTALL"
      ],
      "invalidated": [],
      "retired": [],
      "sources": [
        "SRC_PRIMITIVE_DEBATE"
      ]
    },
    {
      "revision": 4,
      "at": "2026-10-04",
      "reason": "Adopt founder-selected Systems/Connections/Possibilities/Versions product model; keep prior execution contracts subordinate, preserve IDs/history and separate selected intent from proposed operation.",
      "added": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_FOOTHOLDS",
        "SRC_SYSTEMS_CHALLENGE",
        "DESIGN_SYSTEMS_PRODUCT_MODEL",
        "PRIM_SYSTEM",
        "PRIM_SYSTEM_CONNECTION",
        "PRIM_POSSIBILITY",
        "PRIM_CONTEXT_VERSION",
        "RULE_CONTEXT_VERSION_IDENTITY",
        "RULE_SYSTEM_OUTPUT_IDENTITY",
        "RULE_SYSTEM_CONNECTION_CONTRACT",
        "RULE_POSSIBILITY_ISOLATION",
        "RULE_SYSTEM_PAUSE_HEALTH",
        "COMP_SYSTEM_EVOLUTION",
        "COMP_MULTI_SYSTEM_ACTIVATION",
        "COMP_SYSTEM_EXTRACTION",
        "DIST_SYSTEM_VERSIONS",
        "ECON_SYSTEM_COMPOUNDING",
        "EDGE_SYSTEMS_01",
        "EDGE_SYSTEMS_02",
        "EDGE_SYSTEMS_03",
        "EDGE_SYSTEMS_04",
        "EDGE_SYSTEMS_05",
        "EDGE_SYSTEMS_06",
        "EDGE_SYSTEMS_07",
        "EDGE_SYSTEMS_08",
        "EDGE_SYSTEMS_09",
        "EDGE_SYSTEMS_10",
        "EDGE_SYSTEMS_11",
        "EDGE_SYSTEMS_12",
        "EDGE_SYSTEMS_13",
        "EDGE_SYSTEMS_14",
        "EDGE_SYSTEMS_15",
        "EDGE_SYSTEMS_16",
        "EDGE_SYSTEMS_17",
        "EDGE_SYSTEMS_18",
        "EDGE_SYSTEMS_19",
        "EDGE_SYSTEMS_20",
        "EDGE_SYSTEMS_21",
        "Q_SYSTEM_BOUNDARY",
        "Q_CONTEXT_RELEASE_AXIS",
        "Q_MAKE_REAL",
        "Q_SYSTEM_VALUE_COST"
      ],
      "updated": [
        "PRIM_BUSINESS",
        "DESIGN_SHARED_GRAMMAR",
        "DESIGN_TYPED_DOMAINS",
        "PRIM_OPERATION",
        "PRIM_DECISION_GRANT",
        "PRIM_RECEIPT_OBSERVATION",
        "PRIM_FINITE_WORK",
        "PRIM_ONGOING_RESP",
        "PRIM_METHOD_DEFINITION",
        "PRIM_METHOD_INSTALLATION",
        "PRIM_CONNECTION"
      ],
      "invalidated": [],
      "retired": [],
      "sources": [
        "SRC_SYSTEMS_DIRECTION",
        "SRC_SYSTEMS_FOOTHOLDS",
        "SRC_SYSTEMS_CHALLENGE"
      ]
    },
    {
      "revision": 5,
      "at": "2026-10-05",
      "reason": "Apply verified 2026-10-04 product audits: Systems primitives/rules/activation to partial (local, unmerged transition/systems with shared SystemRef) with open defects; deployed-but-unused primitives to partial; narrow founder confirmation to the four nouns (ADR 0011 proposed); correct contact dedup, public booking reachability, standing checks, stale locators and the Connection overload; supersede redundant primitives; add the live tenant business, the lead-loss gap and 16 unmodeled products with verdicts; update questions and record the model backup risk.",
      "added": [
        "SRC_AUDIT_LATENT",
        "SRC_AUDIT_WEBSITES",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_AUDIT_APPS",
        "SRC_AUDIT_PLATFORM",
        "SRC_SPINE",
        "SRC_MAKE_REAL",
        "SRC_VERSIONS",
        "SRC_HEALTH",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_TRANSITION_MAP",
        "SRC_ADR_0011",
        "SRC_SEPT30_RELEASE",
        "SRC_MODEL_STORAGE",
        "DESIGN_EXECUTION",
        "ISSUE_SYSTEMS_AUDIT_DEFECTS",
        "GAP_SYSTEM_REF_DIVERGENCE",
        "RISK_PUBLIC_BOOKING_PAUSE",
        "GAP_LEADS_UNSEEN",
        "OFFER_MANAGED_WEBSITES",
        "SURF_V1_CONTRACT",
        "INT_CLIENT_REPOS",
        "GAP_CLIENT_REPO_COVERAGE",
        "CAP_STRIPE_BILLING",
        "SURF_OPERATOR_CONSOLE",
        "CAP_CRONS",
        "RULE_PROXY_TENANT_AUTH",
        "CAP_WEBSITE_AGENT",
        "PROD_WEBSITE_REBUILD",
        "PROD_WEBSITE_AUDIT",
        "PROD_AI_VISIBILITY",
        "PROD_DOMAIN_MONITOR",
        "PROD_NATIVE_APPS",
        "PROD_CUSTOM_APPS",
        "PROD_TRACKER",
        "PROD_WORK_PLANS",
        "PROD_INVESTIGATIONS",
        "PROD_OPERATIONS",
        "PROD_PRODUCT_LEARNING",
        "PROD_HOME_FINDER",
        "PROD_ONBOARDING",
        "PROD_DOCUMENTS",
        "PROD_ASSESSMENT",
        "PROD_WORKSPACE_SCHEDULING",
        "EDGE_AUDIT_01",
        "EDGE_AUDIT_02",
        "EDGE_AUDIT_03",
        "EDGE_AUDIT_04",
        "EDGE_AUDIT_05",
        "EDGE_AUDIT_06",
        "EDGE_AUDIT_07",
        "EDGE_AUDIT_08",
        "EDGE_AUDIT_09",
        "EDGE_AUDIT_10",
        "EDGE_AUDIT_11",
        "EDGE_AUDIT_12",
        "EDGE_AUDIT_13",
        "EDGE_AUDIT_14",
        "EDGE_AUDIT_15",
        "EDGE_AUDIT_16",
        "EDGE_AUDIT_17",
        "EDGE_AUDIT_18",
        "EDGE_AUDIT_19",
        "EDGE_AUDIT_20",
        "EDGE_AUDIT_21",
        "EDGE_AUDIT_22",
        "EDGE_AUDIT_23",
        "EDGE_AUDIT_24",
        "EDGE_AUDIT_25",
        "EDGE_AUDIT_26",
        "EDGE_AUDIT_27",
        "EDGE_AUDIT_28",
        "EDGE_AUDIT_29",
        "EDGE_AUDIT_30",
        "EDGE_AUDIT_31",
        "EDGE_AUDIT_32",
        "EDGE_AUDIT_33",
        "EDGE_AUDIT_34",
        "EDGE_AUDIT_35",
        "EDGE_AUDIT_36",
        "EDGE_AUDIT_37",
        "EDGE_AUDIT_38",
        "EDGE_AUDIT_39",
        "EDGE_AUDIT_40",
        "EDGE_AUDIT_41",
        "EDGE_AUDIT_42",
        "EDGE_AUDIT_43",
        "EDGE_AUDIT_44",
        "EDGE_AUDIT_45",
        "EDGE_AUDIT_46",
        "EDGE_AUDIT_47",
        "EDGE_AUDIT_48",
        "EDGE_AUDIT_49",
        "EDGE_AUDIT_50",
        "Q_PAYING_CLIENTS",
        "Q_OWNER_LEAD_EMAIL",
        "Q_SEPT30_MIGRATIONS",
        "Q_TWIN_TREES",
        "Q_SYSTEMS_DEFECTS",
        "Q_ADR_0011"
      ],
      "updated": [
        "SRC_REBORN",
        "SRC_AGENT_READY",
        "SRC_REBORN_BR",
        "SRC_SYSTEMS_FOOTHOLDS",
        "SRC_SYSTEMS_DIRECTION",
        "PRIM_SYSTEM",
        "PRIM_SYSTEM_CONNECTION",
        "PRIM_POSSIBILITY",
        "PRIM_CONTEXT_VERSION",
        "PRIM_CONNECTION",
        "DESIGN_SYSTEMS_PRODUCT_MODEL",
        "DIST_SYSTEM_VERSIONS",
        "RULE_SYSTEM_OUTPUT_IDENTITY",
        "RULE_SYSTEM_CONNECTION_CONTRACT",
        "RULE_POSSIBILITY_ISOLATION",
        "RULE_CONTEXT_VERSION_IDENTITY",
        "RULE_SYSTEM_PAUSE_HEALTH",
        "COMP_MULTI_SYSTEM_ACTIVATION",
        "COMP_SYSTEM_EVOLUTION",
        "COMP_SYSTEM_EXTRACTION",
        "PRIM_BUSINESS",
        "PRIM_DECISION_GRANT",
        "PRIM_ACTOR_RELATIONSHIPS",
        "PRIM_FINITE_WORK",
        "PRIM_ONGOING_RESP",
        "PRIM_ECONOMIC_AGREEMENT",
        "PRIM_RECEIPT_OBSERVATION",
        "PRIM_PROVIDER_COMMITMENT",
        "PRIM_TENANT_LINK",
        "PRIM_AVAILABILITY",
        "CAP_CONTACT_DEDUP",
        "CAP_BOOKING_API",
        "CAP_STANDING_CHECKS",
        "CAP_APP_SCHEMAS",
        "REL_REBORN",
        "UNK_EMAIL_PROD",
        "STATE_LEADS_REDIS",
        "RULE_EMAIL_GATE",
        "PRIM_BUSINESS_RECORD",
        "Q_MAKE_REAL",
        "Q_SYSTEM_BOUNDARY",
        "Q_CONTEXT_RELEASE_AXIS",
        "Q_METHOD_OWNERSHIP",
        "Q_UNIFIED_BOOKING",
        "Q_EMAIL_PROD",
        "Q_LEAD_LOSS",
        "Q_SIGNIN",
        "Q_MODEL_BACKUP"
      ],
      "invalidated": [
        "DESIGN_TYPED_DOMAINS",
        "DESIGN_SHARED_GRAMMAR",
        "COMP_FACT_TO_PUBLIC",
        "COMP_AGENCY_UPGRADES"
      ],
      "retired": [
        "PRIM_OFFERING_METHOD_INSTALL",
        "PRIM_METHOD_DEFINITION",
        "PRIM_METHOD_INSTALLATION",
        "PRIM_RESOURCE",
        "PRIM_RECORD_REF",
        "PRIM_FACT_ASSERTION",
        "PRIM_OPERATION",
        "PRIM_PROCEDURE_RUN",
        "PRIM_EVENT_OUTBOX",
        "EDGE_REVIVAL_02",
        "EDGE_REVIVAL_03",
        "EDGE_REVIVAL_04",
        "EDGE_REVIVAL_05",
        "EDGE_REVIVAL_06",
        "EDGE_REVIVAL_07",
        "EDGE_REVIVAL_08",
        "EDGE_REVIVAL_09",
        "EDGE_REVIVAL_10",
        "EDGE_REVIVAL_13",
        "EDGE_REVIVAL_14",
        "EDGE_REVIVAL_17",
        "EDGE_REVIVAL_18",
        "EDGE_REVIVAL_20",
        "EDGE_REVIVAL_22",
        "EDGE_REVIVAL_26",
        "EDGE_DEBATE_01",
        "EDGE_DEBATE_03",
        "EDGE_DEBATE_04",
        "EDGE_DEBATE_05",
        "EDGE_DEBATE_06",
        "EDGE_DEBATE_12",
        "EDGE_DEBATE_13",
        "EDGE_DEBATE_14",
        "EDGE_DEBATE_15",
        "GAP_SYSTEM_REF_DIVERGENCE"
      ],
      "sources": [
        "SRC_AUDIT_LATENT",
        "SRC_AUDIT_WEBSITES",
        "SRC_AUDIT_CUSTOMER_OPS",
        "SRC_AUDIT_APPS",
        "SRC_AUDIT_PLATFORM",
        "SRC_SPINE",
        "SRC_MAKE_REAL",
        "SRC_VERSIONS",
        "SRC_HEALTH",
        "SRC_SYSTEMS_INTEGRATION",
        "SRC_TRANSITION_MAP",
        "SRC_ADR_0011",
        "SRC_SEPT30_RELEASE",
        "SRC_MODEL_STORAGE"
      ]
    }
  ]
}
```
