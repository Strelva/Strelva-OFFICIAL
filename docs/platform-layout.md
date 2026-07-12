# Strelva Platform Layout — Three Audiences, One Engine

**Date:** Jul 8 2026 · **Purpose:** solidify how the platform is organized — who sees what, admin-side vs client-side, and where the feature system fits. Written after the full-repo audit.

---

## The mental model: yes, it's basically GHL — with three deliberate differences

The right skeleton to picture is **GoHighLevel**: an agency runs many client sub-accounts, each sub-account has a set of features toggled on, and verticals are set up from reusable snapshots. Strelva is structurally the same shape. So lean into that model — it's proven and everyone in the space understands it.

But Strelva is deliberately different from GHL in three ways, and these differences *are* the product:
1. **Owner-facing, not just operator.** GHL is a tool the agency uses *for* the client; the client rarely logs in. Strelva's whole thesis is the **business owner** logs in, sees proof, and texts the AI. The owner dashboard is a first-class product, not an afterthought.
2. **Design-forward.** GHL is powerful and overwhelming/ugly. Strelva wins on a dashboard and sites an owner would actually enjoy.
3. **Vertical depth.** GHL is generic and horizontal. Strelva goes *deep* on one vertical at a time (wellness first) via feature-sets, rather than a shallow everything-tool.

Structure from GHL. Differentiate on owner-experience, design, and depth.

---

## The three audiences (this is the admin-vs-client split, made clean)

Everything in the platform serves one of three people. Keep them mentally separate — it's the cleanest way to organize the whole thing.

### 1. OPERATOR layer — you + Jacob (the "agency")
**Where:** `admin.strelva.com` · **GHL analogy:** the agency dashboard.
The command center for running the whole portfolio. **This is the admin side.**
- Client list · client cockpit (KPIs, health, reviews, visibility, config) · **feature management** (toggle a client's features) · portfolio actions (clear every client's queue) · leads · onboarding/provisioning · operator AI agent · operator CRM.
- Audit found this layer is genuinely strong (cockpit 85, portfolio-actions 84, operator agent 83).

### 2. OWNER layer — the business owner (the "sub-account")
**Where:** `app.strelva.com` / their dashboard · **GHL analogy:** a location/sub-account.
The Business OS the client logs into. **This is the client side.** Its contents are the **Features** (below).

### 3. MEMBER layer — the client's own customers (net-new, for wellness)
**Where:** the studio's public site (e.g. `covewellness.com`) · **GHL analogy:** none — GHL doesn't do this well.
The end-customer's logged-in experience: book a class, buy/spend a pack, manage membership. **This is where Strelva goes beyond GHL**, and it's the greenfield build for the wellness set. Own auth lane, `studio_members` table (see `studio-vertical-architecture.md`).

---

## The Features (the client side, organized)

The owner dashboard = **Business Info** (top) + **Features** (middle) + **Profile** (bottom). Features come in three kinds:

| Kind | Locked? | Examples | GHL analogy |
|------|---------|----------|-------------|
| **Core** | 🔒 Yes | Today, Ask Strelva, Website, Analytics | the always-on base of every sub-account |
| **Conditional** | No | Google Business (physical location), Reviews | features gated by a property/connection |
| **Vertical set** | No | Wellness {Schedule, Members, Roster} (Packages deferred until built — pulled from nav so it isn't a "Coming soon" dead end) · E-commerce {Products, Orders, Storefront} | a **snapshot** — a bundle you apply per vertical |

A vertical set is exactly GHL's "snapshot" idea: a named bundle of features you switch on together for a business type.

### How features actually work today (verified, and where it's thin)
- `tenants.features[]` is the enabled-feature store; `dashboard-surfaces.ts` resolves which tabs show from it + presence-profile + connections.
- **But it's barely wired:** the create path whitelists only 3 features (`commerce`, `booking`, `newsletter`); the edit path accepts none; there's **no operator toggle UI** and **no locked-core concept.**
- **Features ≠ billing tiers.** Tiers ($99/$199/$499) are packaging; the platform serves whatever the client's custom repo builds. Features are a *dashboard-surface* concern, not a billing gate.
- The fix = the feature registry + `CORE_FEATURES` lock + a toggle UI in `TenantEditor` (see `admin-feature-management-architecture.md`). That turns today's ad-hoc array into a real, GHL-style feature/snapshot system.

---

## The data spine (how the three audiences map to tables)

- **Operator** → `super_admins`.
- **Owner + staff** → `tenants` (the sub-account) + `users` + `memberships` (roles). One tenant = one business.
- **Members** → `studio_members` (net-new; own auth lane, never a staff role).
- A tenant's enabled features → `tenants.features[]` (to be driven by the registry).
- A vertical set's data (classes, packs, plans) → the bounded `studio/` module tables (net-new).

---

## Why this organization matters

1. **It makes "admin vs client" unambiguous:** operator layer = admin (`/admin`), owner layer = client (`/dashboard`), member layer = the client's customers (their site). Three surfaces, three audiences, one engine underneath.
2. **It gives verticals a clean home:** a new vertical = a new feature-set (snapshot) + its module. Wellness is the first; trades/others are later snapshots on the same rails.
3. **It keeps billing and capability separate:** features control what a client *sees/does*; Stripe tiers control what they *pay*. Conflating them is the trap.
4. **It matches a model the market already understands (GHL)** while differentiating on the three things GHL is weak at — which is exactly where Strelva's wedge lives.

## Related
- `admin-feature-management-architecture.md` — how to build the feature toggle + core lock
- `studio-vertical-architecture.md` — the wellness feature-set / studio module
- `wellness-status.md` — current status + plan
- vault `dashboard-feature-model.md` — the Features mental model
