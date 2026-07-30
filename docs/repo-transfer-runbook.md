# Repo Transfer Runbook (client handoff)

This is the procedure for honoring the ownership promise: on the monthly subscription plan, the **repo and all files transfer on request** — and the domain was the client's from day one. "You leave with everything."

> **Pricing note:** The two-door (build-fee) offer referenced in `docs/strategy/website-offer-two-door.md` was superseded on 2026-06-26 by a pure 3-tier monthly subscription (Presence $99 / Growth $199 / Scale $499, no upfront fee). The ownership promise and transfer procedure below are unchanged regardless of pricing model.

The goal of a transfer is a **frozen, self-contained repo that runs on the client's own infrastructure with no dependency on Strelva's `/api/v1` control plane.** This doc is the checklist to get there.

Scope: this covers the client's **site repo** (the per-client custom repo, e.g. Rohlax, GLDF). It does **not** transfer the Strelva platform itself — the platform source, dashboard, AI agent, and control plane stay with Strelva. That distinction is reflected in the Ownership Center ("Strelva manages") and is true to the contract.

---

## Step 0 — Per-client dependency audit (do this first)

Before promising a clean transfer, audit what the specific repo actually depends on. A repo that reads a third-party service Strelva provisioned will **break silently** after transfer if that dependency isn't resolved or migrated with it.

- Enumerate the tenant's external dependencies. These are tracked in code: `getCustomRepoDependencies(tenant)` in `src/lib/custom-repos.ts` returns `tenant.customRepo.externalDependencies`, merged with hard-coded per-client defaults.
- **GLDF specifically depends on a paused Supabase instance.** See `src/lib/custom-repos.ts` (~lines 34–44): `GLDF_SUPABASE_PAUSE` — "Rewards, customer account, and cart data for the GLDF custom storefront", status `paused`, severity `critical`. Until that Supabase is resumed in (or migrated to) the client's own account, the storefront's rewards/account/cart paths fail. Do not transfer GLDF without resolving this.
- For each dependency, decide: **migrate to client account**, **replace**, or **document as the client's to re-provision**. Record the outcome with the transfer.

`getBlockingCustomRepoDependencies(tenant)` already filters for the `critical`/`paused`/`failing` ones — treat a non-empty list as a hard blocker for "runs frozen on its own."

---

## Step 1 — Export final content and bake it into `content-defaults.ts`

The transferred repo must render without ever calling Strelva. The custom-repo client is already built for this:

- In `custom-repo-starter/scaffold-client.ts`, `getScaffoldBaseUrl()` returns `null` when neither `SCAFFOLD_API_URL` nor the legacy `REB_API_URL` is set.
- Every fetcher — `fetchScaffoldContent`, `fetchScaffoldPageConfig`, `fetchScaffoldSiteCapabilities` — short-circuits and returns its `fallback` argument the moment the base URL is `null` (`if (!baseUrl) return fallback;`). It also returns `fallback` on any non-OK response or thrown error.
- That `fallback` is the value from `custom-repo-starter/content-defaults.ts` (`defaultHero`, `defaultServices`, … or the full `defaults` map).

So the freeze procedure is: **make the defaults equal the final live content, then remove the control-plane env var.** The starter's own Ship Checklist already lists "Scaffold Web content fallback works without `SCAFFOLD_API_URL`" — this is an intended, tested capability, not a hack.

1. Export the final content as the tenant: `GET /api/tenant-export/content` (authenticated, tenant-scoped). The payload contains `content` (every section's current value, keyed by section name) and `pageConfig`. Section names line up 1:1 with the keys of the `ContentMap` / `defaults` in `content-defaults.ts`.
2. For each section in the export's `content`, replace the corresponding `default*` export in the repo's `content-defaults.ts` with the exported value. Update the aggregate `defaults` map to match.
3. If the repo reads page config, fold the exported `pageConfig` into whatever local page-config default the repo uses (the starter ships content defaults; page config is read via `fetchScaffoldPageConfig(fallback)` — give it a real frozen fallback).
4. Remove `SCAFFOLD_API_URL` / `REB_API_URL` (and `NEXT_PUBLIC_SCAFFOLD_API_URL`) from the repo's env. With no base URL, every fetch returns the now-real defaults. Confirm with the starter's checklist: build passes and the site renders correct content with the control-plane URL unset.
5. (Optional) delete the revalidation route — with no control plane pushing updates, `/api/v1/revalidate` is dead weight. Leaving it is harmless; removing it reduces surface.

After this step the repo is **frozen**: it renders the final content from local source, and nothing it does on a page request touches Strelva.

---

## Step 2 — Export assets and download the actual files (manifest gap)

**Known gap:** `GET /api/tenant-export/assets` returns a **URL manifest, not file bytes.** Read `src/app/api/tenant-export/assets/route.ts`: the payload is `referencedUrls` (every `https://` URL found in content) plus `libraryAssets` (tenant media from Vercel Blob via `collectTenantMedia` — Sanity is no longer a data source; the Sanity teardown is complete as of 2026-07-10). The endpoint's own checklist says "Download original files from each listed URL before changing DNS." Nobody has automated that download yet.

Until that's productized, the runbook does it by hand:

1. Pull the manifest: `GET /api/tenant-export/assets` → save `<tenant>-asset-manifest.json`.
2. Download every file referenced. Extract the URLs and fetch them, e.g.:
   ```bash
   jq -r '.referencedUrls[], .libraryAssets[].url' <tenant>-asset-manifest.json \
     | sort -u > asset-urls.txt
   wget -i asset-urls.txt -P ./transferred-assets --content-disposition
   ```
3. Commit the downloaded files into the transferred repo (e.g. `public/` or the repo's asset dir) and **rewrite the image URLs in `content-defaults.ts` to the local/self-hosted paths** so the frozen repo is not still hot-linking Strelva's Vercel Blob / Sanity CDN. A repo that "runs frozen" but still points every image at Strelva-hosted URLs is not actually independent.
4. If `libraryStatus` came back `unavailable`, ask whether any source files exist that no public URL represents (the manifest can't see those) before declaring the asset export complete.

> **Productize later:** an asset-export-as-zip endpoint (server-side fetch of each URL, streamed as an archive) would remove this manual step. Tracked here as the gap, not built.

---

## Step 3 — GitHub repo transfer

1. Transfer the repository to the client's GitHub org/account (GitHub Settings → Danger Zone → Transfer ownership), or push a clean copy into a repo they own if Strelva's account history should not travel with it.
2. After transfer, **remove Strelva's access**: drop Strelva users/teams from collaborators, and delete any **deploy keys** and **machine/bot tokens** that were scoped to Strelva.
3. Remove or rotate any GitHub Actions secrets that pointed back at Strelva infra.

---

## Step 4 — Env / secrets inventory and rotation

Inventory every secret the repo carried and rotate or hand off each. The custom-repo-starter defines the baseline categories (`custom-repo-starter/README.md`, "Required Environment"):

- **`TENANT_ID`** — the tenant slug. Travels with the repo; not secret. Keep as-is.
- **`SCAFFOLD_API_URL` / `REB_API_URL`** (and `NEXT_PUBLIC_SCAFFOLD_API_URL`) — control-plane base URL. **Removed in Step 1** so the repo runs frozen. Do not carry it into the client's deploy.
- **`REVALIDATION_SECRET`** — the HMAC shared secret used by the wire-level `x-reb-timestamp` / `x-reb-signature` revalidation handshake. **Rotate/retire it.** Once the control plane no longer pushes to this repo, the secret should be invalidated on Strelva's side so an old key can't sign requests.
- **Per-client third-party secrets** (from Step 0's audit) — e.g. Supabase keys for GLDF, any booking/integration tokens, Stripe keys on the public site if the repo uses payment links. Each must be **re-issued under the client's own accounts** and the Strelva-issued values revoked.

Rule of thumb: any secret that was ever in Strelva's hands is considered compromised for the client's purposes and gets rotated, not just copied.

---

## Step 5 — Vercel project transfer (or fresh deploy on the client's account)

Two valid paths — pick based on whether the client wants the existing project's history:

- **Transfer the Vercel project** to the client's Vercel team (Vercel Project Settings → Transfer). Then re-set env vars under their account (the frozen set from Step 4: effectively just `TENANT_ID` plus any client-owned third-party keys), and re-point the domain's deployment to their team.
- **Fresh deploy** — the client connects the transferred GitHub repo to their own Vercel (or other host) and deploys clean. Often simpler than a project transfer and guarantees no Strelva-account residue.

Either way, set the env to the **frozen** set (no `SCAFFOLD_API_URL`), confirm the production build passes, and verify the live deploy renders the baked-in content with no control-plane calls in the network log.

---

## Step 6 — Domain: already theirs

The domain has been registered in the client's name since day one (see `docs/domain-setup.md`, Step 0). There is **no domain move** in a handoff — only an access change:

1. Confirm the registrar/DNS account is genuinely client-owned. (For early clients set up before the day-one rule, this may need the `docs/domain-setup.md` migration **before** transfer — e.g. Rohlax's Cloudflare account ownership.)
2. Re-point DNS to the client's new deploy (Step 5) while the old deploy is still live; cut over only after the new one is confirmed.
3. **Remove Strelva's DNS-edit member role** from the client's Cloudflare/registrar account once their deploy is serving.

---

## Done = verified

- [ ] Step 0 dependency audit clean (no `critical`/`paused`/`failing` external deps unresolved)
- [ ] `content-defaults.ts` holds the final exported content; repo builds and renders with `SCAFFOLD_API_URL` unset
- [ ] Assets downloaded from the manifest and self-hosted; no image URL points back at Strelva
- [ ] Repo owned by the client's GitHub org; Strelva collaborators/deploy keys removed
- [ ] All Strelva-issued secrets rotated/retired; `REVALIDATION_SECRET` invalidated on the control plane
- [ ] Deploy live on the client's own Vercel (or host); no `/api/v1` calls in the network log
- [ ] DNS serving the client deploy; Strelva DNS-edit role removed
