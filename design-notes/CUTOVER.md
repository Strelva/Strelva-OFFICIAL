# Cutover: xa/build-20261015 to production

October 16, 2026. Prepared for the main session, which runs it. Nothing in this
file has been run against production. Every step that changes production
(migrations, env, deploy, promote, push, owner-email confirmations, any data
fix) needs Jacob's yes for that step (AGENTS.md "Needs Jacob's yes").

- **Build:** `xa/build-20261015` at `620bf6d36b959e04a42184e531938caa2b5bcbf7`,
  plus this runbook's docs-only commit. Deploy the branch head. Before you build,
  `git diff --stat 620bf6d36 HEAD` must show only `design-notes/CUTOVER.md`.
- **Production now:** `dpl_J975Jk1c1q78SWn4MfxRvn49TXSn`, built from
  `e453ce36e` (Oct 15, sign-in email). This is the **rollback target**.
- **Inputs:** [MIGRATION-PLAN.md](./MIGRATION-PLAN.md) (29 held files),
  [SWITCH-ON.md](./SWITCH-ON.md) and
  [`scripts/release-safety/switch-on.json`](../scripts/release-safety/switch-on.json)
  (phases A to K), the Oct 14/15 prebuilt path, the
  [release checklist](../docs/operations/horizontal-release-checklist-2026-09-11.md#september-21-production-preparation).

## Shape

| Step | What | Changes prod | Undo |
| --- | --- | --- | --- |
| 0 | Preflight: health, deployment, history, backup, disk, git, rehearsal of migration 29, baselines | no (read-only) | none needed |
| 1 | One `supabase db push` of 29 files, verified | schema, plus 3 tenant `custom_repo` keys | 5c, guarded per file |
| 2 | Env phases A to J (deploy 1) | Vercel env only (inert until a deploy) | 5b |
| 3 | Prebuilt build, candidate deploy without domains, smoke, parity, promote | live traffic | 5a: promote `dpl_J975…` |
| 4 | Watch: errors, health, client sites, email | no | 5 |
| 3K/4K | Deploy 2: phase K, owner claim + Needs you email | live email | 5a: promote deploy 1 |
| 6 | Git: fast-forward `main` after the watch holds | public repo | none (never force) |

Deploy 2 is separate, and it waits until Jacob has confirmed at least one exact
owner address for an exact business. If he hasn't, stop after step 4. Every
owner stream send stays held, and Home still shows every decision.

## Variables (set once, in one shell)

```sh
export REPO=/Users/jacobrhinehart/Desktop/strelva/REB-xa-build
export REF=zthifbnrtsirdekzzlxs                     # Supabase production
export TEAM=team_CXZExgSqBSV3zeOqPfmLcclS           # Vercel team
export PROJECT=strelva-admin                        # prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb
export PROD=https://app.strelva.com
export ROLLBACK_DPL=dpl_J975Jk1c1q78SWn4MfxRvn49TXSn
export TS=$(date -u +%Y%m%dT%H%M%SZ)
export W=/private/tmp/strelva-cutover-$TS           # logs, captures, env files. Outside git.
export STAGE=/private/tmp/strelva-stage-$TS         # created by stage-pending.sh; must not exist yet
export VC="npx --yes vercel"                        # CLI is not on PATH here. Never add it to package.json.
export PG17=/opt/homebrew/opt/postgresql@17/bin
mkdir -p $W && chmod 700 $W && cd $REPO
```

**Database sessions.** Get the CLI's temporary login role the way the Oct 16
rehearsal did. Never print the values.

```sh
mkdir -p $W/link/supabase && cp supabase/config.toml $W/link/supabase/
supabase link --project-ref $REF --workdir $W/link
supabase db dump --linked --dry-run --workdir $W/link 2>/dev/null | grep -E '^export PG' > $W/pg.env
chmod 600 $W/pg.env; set -a; . $W/pg.env; set +a
RO() { PGOPTIONS='-c default_transaction_read_only=on' $PG17/psql -X -q -At -v ON_ERROR_STOP=1 -c 'set role postgres' "$@"; }
RW() { $PG17/psql -X -q -At -v ON_ERROR_STOP=1 -c 'set role postgres' "$@"; }   # step 5c and confirmations only
```

If `$W/pg.env` comes out empty, the CLI's output format has changed. **STOP**:
don't hand-type a connection string, and don't reset the database password.

---

## 0. Preflight (read-only)

Every check here only reads. If any check fails, stop and don't start step 1.

**0.1 Production health and deployment**

```sh
curl -sS -o $W/health-before.json -w '%{http_code}\n' $PROD/api/health        # expect 200
python3 -I -c "import json;d=json.load(open('$W/health-before.json'));print(d['status'],d['version'])"   # expect ok 1.0.0
$VC whoami --scope $TEAM
$VC inspect $PROD --scope $TEAM 2>&1 | tee $W/inspect-before.txt | grep -E '^\s+id\s'   # expect dpl_J975Jk1c1q78SWn4MfxRvn49TXSn
```

STOP if health isn't 200/ok, or if production isn't `dpl_J975…`. Someone else
deployed. Find out what changed and reset the rollback target first.

Baseline error rate: Vercel MCP `get_runtime_errors` (projectId
`prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb`, teamId `team_CXZExgSqBSV3zeOqPfmLcclS`, last
24 h). Save the count per route to `$W/errors-before.txt`. Step 4 compares
against it.

**0.2 Applied migrations**

```sh
RO -c 'select version from supabase_migrations.schema_migrations order by 1' > $STAGE.applied
wc -l < $STAGE.applied                                 # expect 400
tail -1 $STAGE.applied                                 # expect 20261025170000
awk '$1>="20261026100000"' $STAGE.applied | wc -l      # expect 0
RO -f scripts/release-safety/catalog-wide.sql | tee $W/catalog-before.tsv | shasum -a 256
# expect c35129dd6918d7edce9674a517a2df3e4ef680184595cda000644df7d73b5d99 (10,099 lines)
```

STOP if you don't get 400 rows, the newest version isn't `20261025170000`, or
the digest is different. The schema has moved since the Oct 16 rehearsal, so
re-rehearse (0.6) before anything else.

**0.3 Backup and PITR for `zthifbnrtsirdekzzlxs`**

```sh
supabase backups list --project-ref $REF -o json > $W/backups.json
python3 -I -c "
import json;d=json.load(open('$W/backups.json'));b=d.get('backups',[])
print('pitr_enabled',d.get('pitr_enabled'),'walg',d.get('walg_enabled'),'count',len(b))
print('newest',max((x.get('inserted_at','') for x in b),default='none'))"
```

Go only if either PITR is enabled (WAL-G on), or the newest physical backup
status is `COMPLETED` and is under 24 h old. Write the newest backup time into
`$W/backups.json` notes. That time is the data floor for a worst-case restore.
STOP if neither is true. Supabase has no on-demand physical backup from the
CLI, and a full data `pg_dump` is a production data read that needs its own
yes. Ask Jacob which one he wants.

**0.4 Disk**

```sh
df -h / | tail -1      # Avail must be >= 10 GiB (vercel build + .vercel/output + .next ~ 4-6 GiB)
```

STOP below 10 GiB. Free space by removing this worktree's `.next` and any old
`/private/tmp/strelva-*` directories, never anything in another session's
worktree.

**0.5 Git state and how the build reaches `main`**

```sh
git -C $REPO status --short                                   # expect empty
git -C $REPO fetch origin main
git -C $REPO rev-parse origin/main                            # e453ce36e3b28a974e464b1722ce54bb115aebcd on Oct 16
git -C $REPO merge-base --is-ancestor origin/main HEAD && echo FF-OK
git -C $REPO rev-list --count HEAD..origin/main               # commits on main not in the build: expect 0
git -C $REPO rev-list --count origin/main..HEAD               # build ahead of main: 322 on Oct 16 (275 non-merge, + this runbook)
git -C $REPO merge-base --is-ancestor c226a8e95 HEAD && echo BASE-OK
gitleaks detect --log-opts="origin/main..HEAD" --no-banner --redact --source $REPO   # expect "no leaks found"
```

What was true on Oct 16 (read by the runbook author):

- `origin/main` is `e453ce36e`, which is exactly the production source. It is an
  ancestor of the build (merge-base `e453ce36e`). The build is based on
  `c226a8e95`, which itself descends from `e453ce36e`. **0 commits on main are
  missing from the build**, so main reaches the build by a **fast-forward**. No
  merge commit and no conflict resolution are needed.
- The worktree's local `main` ref is stale (`ab4f8a20e`, Sept 30). Ignore it and
  always compare with `origin/main`.
- `Strelva/Strelva-OFFICIAL` is **public**, and `main` is **not branch-protected**.
  `gitleaks` over `e453ce36e..HEAD` (273 commits) found no leaks.
- `vercel.json` has `git.deploymentEnabled: false`, so a push never deploys. But a
  push to `main` triggers GitHub Actions: `ci.yml` (src changed, so paths-ignore
  doesn't skip it) and `security.yml`. A PR into main would also run
  `launch-verification.yml` and `self-service-review.yml`. Per Jacob, hosted CI
  is **not** the gate (no CI credits; prove locally). A red hosted run doesn't
  block or undo the cutover. Note it and move on.

STOP if `HEAD..origin/main` is not 0. Someone landed on main after Oct 16. Merge
`origin/main` into the build, rerun 0.7, and redo this step. Also STOP if
gitleaks reports anything: the repo is public. The push itself is step 6, after
the watch. Main never runs ahead of production.

**0.6 Rehearse migration 29 (it missed the Oct 16 rehearsal)**

This needs a fresh **schema-only** read of production (no rows), which needs
the same separate yes as Oct 16.

```sh
IN=$W/rehearsal-in; mkdir -p $IN && chmod 700 $IN
PGOPTIONS='-c default_transaction_read_only=on' $PG17/pg_dump --schema-only > $IN/prod-schema.sql
grep -cE '^(COPY|INSERT) ' $IN/prod-schema.sql                                     # expect 0
RO -F $'\t' -c 'select version, name from supabase_migrations.schema_migrations order by 1' > $IN/applied.tsv
RO -F '|' -c 'select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls from pg_roles order by 1' > $IN/roleattrs.txt
RO -F '|' -c 'select r.rolname, m.rolname, a.admin_option, a.inherit_option, a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member order by 1,2' > $IN/members.txt
STRELVA_PG_BIN=$PG17 bash scripts/release-safety/rehearse-pending-on-restored-schema.sh $IN $W/rehearsal-out 2>&1 | tee $W/rehearsal.log
```

Expect `pending: 29 files`, `forward 1: 29 applied`, `rollback: 29 reversed`,
`C2 == C0` and `C3 == C1`, with exit 0. The only restore errors should be the
11 errors from `supabase_vault`. STOP on any other result. Then, still offline:

```sh
STRELVA_PG_BIN=$PG17 pnpm check:release-safety
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:owner-email-sql
```

After use, delete `$IN` and `$W/rehearsal-out`. The dump stays out of git.

**0.7 Local gates at the deploy SHA**

```sh
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm check:custom-repos
pnpm exec vitest run src/__tests__/switch-on-plan.test.ts src/__tests__/owner-email-switch-on.test.ts
```

The suite was green at `7921daef5`. Rerun it at the head, because three commits
since then touched smokes and the browser manifest. The UI gate is the main
session's re-walk of the final SHA against the anti-slop rules: zero open
mustFix. [REVIEW.md](../../design/xa-build-2026-10-15/REVIEW.md) predates the 8
fix lanes. STOP if any gate is red.

**0.8 Flags, overrides and backfill rows, read-only**

```sh
$VC link --yes --project $PROJECT --scope $TEAM
$VC env pull $W/env-before --environment=production --yes --scope $TEAM
chmod 600 $W/env-before
pnpm tsx scripts/prod-flag-report.ts $W/env-before > $W/flags-before.txt          # names and states only
```

- Fill each `unknown` `from` in switch-on.json into `$W/flags-before.txt`. That
  becomes the real rollback value for each name.
- STOP if any `mustStayUnset` name reads anything but unset or off.
- STOP if a phase A to K name currently reads `off` on purpose (an explicit
  `0`/`false` that a vault entry explains). Flipping it reverses an earlier
  decision, so ask Jacob.
- On a flag currently `operators` or `workspace`, phase `1` widens it to every
  business except rows set to off. That is the plan. Record it.
- `stops` must be empty now. STRELVA_MAKE_REAL_OWNER_LINK_RELEASE will show up as
  a stop only after deploy 2, and that one is expected.

Per-tenant client email overrides (every one must be `inherit`, `off` or absent):

```sh
RO -c "select t.id, coalesce(r.payload->>'value','(none)') from public.tenants t
       left join public.tenant_client_records r on r.tenant_stable_id=t.stable_id
        and r.store='tenant_settings' and r.record_id='client_email' and r.removed_at is null
       where t.active order by 1" | tee $W/client-email-pg.txt
( set -a; . $W/env-before; set +a
  curl -sS -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
    "$UPSTASH_REDIS_REST_URL/scan/0/match/reb:client-email:*/count/1000" ) > $W/client-email-redis-keys.json
```

Read each listed key with `/get/<key>`. If the pulled Upstash token is an
11-character Secret placeholder, read the keys in the Upstash console instead.
An `on` arms every client email for that tenant. Set it to `inherit` before
deploy 2 (that's a production data write, so it needs the yes), and record the
old value.

Backfill pre-flight (MIGRATION-PLAN "What the backfill touches"):

```sh
RO -c "select id, jsonb_typeof(custom_repo), custom_repo ? 'contentSource', custom_repo->>'contentSource', custom_repo ? 'declarationCheckedAt'
       from public.tenants where id in ('gldf','rohlax','rhm-innovations') order by id" | tee $W/backfill-pre.txt
```

STOP unless every shape is `object` or empty (NULL). An `array` or `scalar`
would be concatenated rather than merged. A row whose source is already `repo`
stays `repo`, and check 13b will read false. Decide that case with Jacob
before the push.

**0.9 Storefront and client-site baselines**

```sh
TENANTS=$(RO -c "select string_agg(id, ',' order by id) from public.tenants where active"); echo "$TENANTS" | tr ',' '\n' | wc -l   # expect 14 (70 reads)
RO -F ' ' -c "select id, production_domain from public.tenants where active and production_domain is not null order by 1" > $W/client-sites.txt
wc -l < $W/client-sites.txt                                                            # the client sites (9 expected)
npx tsx scripts/storefront-parity.ts capture --base=$PROD --tenants=$TENANTS --out=$W/parity-0-before.json --i-have-jacobs-yes
while read -r id dom; do printf '%s %s ' "$id" "$dom"; curl -sS -o $W/site-$id-before.html -w '%{http_code}\n' "https://$dom/"; done < $W/client-sites.txt | tee $W/sites-before.txt
```

STOP if the active count isn't 14 and you can't explain the difference (the Oct
14 gate was 70/70), or if any client site doesn't return 200 now. Don't start
anything on top of a site that's already down.

**0.10 Sign-in on the candidate host**

```sh
curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/$REF/config/auth \
  | python3 -I -c "import json,sys;d=json.load(sys.stdin);print(d.get('site_url'));print(d.get('uri_allow_list'))"
```

If `uri_allow_list` covers `https://*.vercel.app` (or the team's
`strelva-admin-*` pattern), or if sign-in uses the email code
(`STRELVA_AUTH_EMAIL_CODE` on), the signed-in candidate smoke in 3.5 can run on
the candidate. If neither is true, **do not change Auth settings** (that's a
production setting). Run the signed-in part on `$PROD` straight after the
promote, with 5a ready to go (3.7).

---

## 1. Migrations (29 files, one push, filename order)

Yes needed: "apply the 29 held migrations". The rehearsed path is one push. The
release-order trap goes first in the checks, not in a separate push: `20261026160000_sites_atomic_publish`
(`publish_site_drafts`, which the new build calls) and
`20261027120100_site_content_source_backfill` (gldf, rohlax, rhm-innovations
read as native editing) must be applied and verified **before** the new build
serves traffic. All 29 files are additive for the code that's live now
(`dpl_J975…`), so schema first, then code.

**1.1 Stage, link, dry run**

```sh
bash scripts/release-safety/stage-pending.sh $STAGE.applied $STAGE | tee $W/stage.log
python3 -I -c "import json;d=json.load(open('$STAGE/pending-receipt.json'));print(d['appliedCount'],len(d['pending']),d['pending'][0]['file'],d['pending'][-1]['file'])"
# expect: 400 29 20261026100000_conn_core_holders.sql 20261028120000_owner_email_confirmations.sql
supabase link --project-ref $REF --workdir $STAGE
supabase db push --workdir $STAGE --linked --dry-run 2>&1 | tee $W/push-dry-run.log
```

Verify that the dry-run list matches `pending-receipt.json` exactly: 29 names
in the same order. This was checked offline on Oct 16: with a simulated
400-version applied list, staging produced exactly these 29 and refused nothing.
STOP if the lists differ, or if staging refused anything (unpinned file,
digest mismatch, missing rollback, or a pending file older than the newest
applied version). Never use `--include-all`.

**1.2 Keep the window short (risk R2).** From here until 3.6, make no operator
tenant edits through the live code. A tenant save writes `custom_repo` whole and
would drop the backfill. Tell Jacob the window is open.

**1.3 Push**

```sh
supabase db push --workdir $STAGE --linked 2>&1 | tee $W/push.log
```

Every file except #28 sets `lock_timeout = 3s`. A lock wait shows up as a clean
3 s failure of that one file. Each file is its own transaction.

- **Partial stop:** the files already applied stay applied. Fix the cause (on a
  lock timeout, just retry), then rerun 0.2's history read into a fresh
  `$STAGE.applied` with a new `$STAGE`, and repeat 1.1 to 1.3. Staging picks up
  from the new history.
- **R4:** `already exists` on retry means a file committed but its history row
  is missing. Confirm with the verify rows below, then run
  `supabase migration repair --status applied <version> --linked --workdir $STAGE`.
  Never repair blind.

**1.4 Verify (read-only), the trap first**

```sh
RO -c 'begin read only' -f scripts/release-safety/verify-pending-20261016.sql -c rollback | tee $W/verify-28.txt
grep -E ' 06 |^publish_site_drafts|^13b ' $W/verify-28.txt   # the trap rows (fn 06 x2, triggers 06, grants, 13b): all must end in |t
grep -c '|f$' $W/verify-28.txt                 # expect exactly 1: the "history: 428 rows" row (see below)
```

`verify-pending-20261016.sql` was written for 28 files. Its first row expects
428 rows with newest `20261028110000`, so it reads `f` once migration 29 lands.
Every other row (2 history, 26 fingerprints, 11 tables, touch triggers, flag
names, `publish_site_drafts` grants, backfill 13b, 10 guard schemas) must read
`t`. Then check the full history and migration 29:

```sh
RO -c 'begin read only' -c "
select 'history: 429 rows, newest 20261028120000', (select count(*)=429 and max(version)='20261028120000' from supabase_migrations.schema_migrations)
union all select 'history: 29 packet versions', (select count(*)=29 from supabase_migrations.schema_migrations where version between '20261026100000' and '20261028120000')
union all select '29 table', to_regclass('public.owner_email_confirmations') is not null
union all select '29 rls', (select relrowsecurity from pg_class where oid='public.owner_email_confirmations'::regclass)
union all select '29 four functions', (select count(*)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('owner_email_confirmations_forget','owner_email_confirmed','confirm_owner_email','revoke_owner_email_confirmation'))
union all select '29 forget trigger', exists(select 1 from pg_trigger where tgname='workspaces_forget_owner_email_confirmations' and not tgisinternal)
union all select '29 service_role reads', has_function_privilege('service_role','public.owner_email_confirmed(uuid,text)','execute')
union all select '29 authenticated cannot read', not has_function_privilege('authenticated','public.owner_email_confirmed(uuid,text)','execute')
union all select '29 anon cannot confirm', not has_function_privilege('anon','public.confirm_owner_email(uuid,text,uuid,text,text)','execute')
union all select '29 no confirmations yet', (select count(*)=0 from public.owner_email_confirmations)
union all select 'flags off: no vertical_intake rows', (select count(*)=0 from public.workspace_release_flags where flag='vertical_intake')" -c rollback | tee $W/verify-29.txt
grep -c '|f$' $W/verify-29.txt                 # expect 0
```

Also check that the current production code still serves:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' $PROD/api/health                          # 200
npx tsx scripts/storefront-parity.ts capture --base=$PROD --tenants=$TENANTS --out=$W/parity-1-after-migrations.json --i-have-jacobs-yes
npx tsx scripts/storefront-parity.ts compare $W/parity-0-before.json $W/parity-1-after-migrations.json   # 70 of 70 identical, exit 0
```

STOP on any of these:

- a trap row isn't `t`
- any other row is `f` (apart from the one known 28-file history row)
- health isn't 200
- parity differs

None of the 29 files changes a v1 storefront read, because the capability
manifest doesn't read `contentSource`. A difference therefore means either a
client edited content (re-baseline that tenant and compare again) or a real
regression (5c, after Jacob's call).

**Per-file proof:** `verify-28.txt` labels its rows by plan step number, and
the history read confirms each version:
`RO -c "select version from supabase_migrations.schema_migrations where version >= '20261026100000' order by 1"`
should list the 29 versions in [MIGRATION-PLAN.md's table](./MIGRATION-PLAN.md#the-28-steps),
plus `20261028120000`.

---

## 2. Env flags for deploy 1 (phases A to J)

Yes needed: "set phases A to J". Env changes do nothing until a new deploy, and
the live `dpl_J975…` keeps its own env snapshot. Set them only after step 1 has
verified, in the dependency order of switch-on.json. A comes first and needs no
migration. B to J each wait for the migrations named in their `requires`, all
of which 1.4 has just proven.

```sh
python3 -I - > $W/deploy1-env.tsv <<'PY'
import json
d = json.load(open('scripts/release-safety/switch-on.json'))
for p in d['phases']:
    if p['deploy'] == 1:
        for c in p['changes']:
            print(p['phase'], c['name'], c['to'], sep='\t')
PY
wc -l < $W/deploy1-env.tsv                                     # expect 36 (A 22, B 2, C 1, D 3, E 1, F 1, G 1, H 2, I 1, J 2)
cut -f2 $W/deploy1-env.tsv | grep -xFf <(python3 -I -c "import json;print('\n'.join(json.load(open('scripts/release-safety/switch-on.json'))['mustStayUnset']))") && echo STOP-OVERLAP
while IFS=$'\t' read -r phase name value; do
  echo "phase $phase $name"
  printf '%s' "$value" | $VC env add "$name" production --force --scope $TEAM || { echo "FAILED $name"; break; }
done < $W/deploy1-env.tsv 2>&1 | tee $W/env-deploy1.log
```

If your CLI has no `--force`, run `$VC env rm "$name" production --yes --scope $TEAM`
before each `add`, but only for names that 0.8 showed as set. Add the flags as
plain values, never as Sensitive. A Sensitive flag pulls back as the 11-character
placeholder, step 3.2 then drops it, and any page rendered at build time loses
it.

**Verify:**

```sh
$VC env pull $W/env-deploy1 --environment=production --yes --scope $TEAM && chmod 600 $W/env-deploy1
pnpm tsx scripts/prod-flag-report.ts $W/env-deploy1 > $W/flags-deploy1.txt
diff $W/flags-before.txt $W/flags-deploy1.txt
```

The diff must show exactly the 36 phase names: 35 moving to `on`, plus
`STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE` as `set (value hidden)`
or `pending`, and nothing else. Every `mustStayUnset` name must still be unset
or off, `EMAIL_SENDING_ENABLED` and `CUSTOMER_EMAIL_ENABLED` above all.
`STRELVA_VERTICAL_INTAKE_RELEASE` must stay unset (Dental waits for counsel).
None of the phase K names (`STRELVA_OWNER_EMAIL_*`, claim/invitation/link
email) may be set yet. `stops` must be empty. STOP on any extra difference, and
put that name back first (5b).

**What stays honest with these flags on:** Google Business Profile writes read
as "Google hasn't approved…" (`pending` is not approval). HighLevel, Microsoft
and Instagram connections say Strelva hasn't switched them on yet, because
their provider keys are absent. Dental isn't offered at all. Money shows no
price, and the $0 AI cap stays as is (`STRELVA_FREE_MONTHLY_AI_CAP_USD`
unchanged). No booking, inquiry, reminder or marketing email goes out.

---

## 3. Build, candidate, smoke, promote (deploy 1)

Yes needed: "deploy and promote".

**3.1 Pull for the build**

```sh
cd $REPO && rm -rf .next .vercel/output
$VC pull --yes --environment=production --scope $TEAM          # writes .vercel/.env.production.local
```

**3.2 Drop only the exact Secret placeholder lines.** Vercel pulls Sensitive
values as one shared 11-character placeholder. Find that string by its shape,
never by eye, and remove only the lines that equal it. On Oct 15, a looser
filter dropped real `1` flags.

```sh
python3 -I - .vercel/.env.production.local <<'PY'
import collections, re, sys
path = sys.argv[1]; lines = open(path).read().splitlines()
val = lambda l: (re.match(r'^[A-Z0-9_]+=(.*)$', l) or [None, None])[1]
strip = lambda v: v[1:-1] if v and len(v) >= 2 and v[0] == v[-1] == '"' else v
counts = collections.Counter(strip(val(l)) for l in lines if val(l) is not None and len(strip(val(l))) == 11)
ph, n = counts.most_common(1)[0] if counts else (None, 0)
if n < 3: sys.exit(f"STOP: no shared 11-char placeholder found (top count {n}); do not filter")
keep = [l for l in lines if strip(val(l)) != ph]
dropped = [l.split('=')[0] for l in lines if strip(val(l)) == ph]
open(path, 'w').write('\n'.join(keep) + '\n')
print(len(dropped), 'placeholder lines dropped:', ', '.join(sorted(dropped)))
PY
pnpm tsx scripts/prod-flag-report.ts .vercel/.env.production.local | diff - $W/flags-deploy1.txt   # flags section must match
```

Every dropped name must be a credential (keys, tokens, secrets, DSNs). STOP if
any `STRELVA_*`/`REB_*` switch, `EMAIL_*` or flag name appears among them.
Sensitive values still reach the deployment at runtime from the project. Only
values used at build time are missing.

**3.3 Build and deploy without domains**

```sh
$VC build --prod --scope $TEAM 2>&1 | tee $W/build1.log | tail -5        # must end "Build Completed"
$VC deploy --prebuilt --prod --skip-domain --scope $TEAM 2>&1 | tee $W/deploy1.log
export CAND=$(grep -Eo 'https://[a-z0-9-]+\.vercel\.app' $W/deploy1.log | tail -1); echo $CAND
$VC inspect $CAND --scope $TEAM | grep -E '^\s+id\s' | tee $W/cand1-id.txt   # dpl_… (deploy 1)
git -C $REPO rev-parse HEAD > $W/deploy-sha.txt
rm -f .vercel/.env.production.local
```

`--skip-domain` keeps `app.strelva.com`, the crons and client traffic on
`dpl_J975…` until the promote. STOP if the build fails. Fix it locally, rerun
0.7, and build again. Nothing in production has changed yet except the
(compatible) schema and inert env.

**3.4 Smoke the candidate (protected URL)**

Export `VERCEL_AUTOMATION_BYPASS_SECRET` from the project's Deployment
Protection settings into this shell. Never print it.

```sh
H="x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"
curl -sS -H "$H" $CAND/api/health | tee $W/cand-health.json                           # 200, status ok, version 1.0.0
for p in /sign-in /sign-up /robots.txt; do printf '%s ' $p; curl -sS -o /dev/null -w '%{http_code}\n' -H "$H" $CAND$p; done   # 200 each
npx tsx scripts/storefront-parity.ts capture --base=$CAND --tenants=$TENANTS --out=$W/parity-2-candidate.json --i-have-jacobs-yes
npx tsx scripts/storefront-parity.ts compare $W/parity-1-after-migrations.json $W/parity-2-candidate.json   # 70 of 70 identical, exit 0
```

**Public booking page:** pick, in 0.9, one active tenant whose site has a
booking page, and record its tenant id as `$BT`.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' -H "$H" -H "x-tenant: $BT" "$CAND/api/booking/availability?date=$(date -v+1d +%F)"   # 200 or the same status prod gives
curl -sS -o /dev/null -w '%{http_code}\n' -H "x-tenant: $BT" "$PROD/api/booking/availability?date=$(date -v+1d +%F)"
```

Then open that tenant's booking page in a browser on the candidate, using the
bypass cookie (`$CAND/?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true`).
It must wear the **business's** brand, not Strelva ink, and say in one sentence
that no confirmation email is sent. Don't book a real slot.

**3.5 Signed-in smoke (Jacob's own accounts only, never a client owner's)**

On the candidate, if 0.10 allows it, otherwise as 3.7:

- **Sign-in:** the email code or link arrives (Supabase Auth SMTP), and you land
  in the right place.
- **Owner Home** (`/workspace`, on a business Jacob owns): the Home composer, the
  waiting decisions, one ink primary. If the business has a $0 AI cap, Ask
  shows the waitlist sentence ("we'll tell you when plans open") and doesn't
  dead-end. No `$` anywhere, and no "workspace" in the copy.
- **Agency Home** (`/workspace`, Strelva Agency selected): the client list
  loads, and owner reach says why an owner can't be emailed.
- **Make it live:** open a Possibility, but don't make it live on a client's
  System. The yes is XaYes, with Undo after.
- **Connections:** Google Business Profile reads "waiting on Google", and the
  HighLevel, Microsoft and Instagram connections read "not switched on yet".

STOP on any 5xx, a page crash, a dead-end wall in place of a path, a price, or
a missing Undo. Fix it, and repeat from 3.1. The candidate is disposable.

**3.6 Promote**

```sh
$VC promote $CAND --scope $TEAM --yes 2>&1 | tee $W/promote1.log
$VC inspect $PROD --scope $TEAM | grep -E '^\s+id\s'          # must equal $W/cand1-id.txt
curl -sS -o /dev/null -w '%{http_code}\n' $PROD/api/health     # 200
sleep 65    # reb:tenants:all TTL is 60 s (R2)
RO -c 'begin read only' -f scripts/release-safety/verify-pending-20261016.sql -c rollback | grep '^13b '   # must end |t
npx tsx scripts/storefront-parity.ts capture --base=$PROD --tenants=$TENANTS --out=$W/parity-3-after-promote.json --i-have-jacobs-yes
npx tsx scripts/storefront-parity.ts compare $W/parity-1-after-migrations.json $W/parity-3-after-promote.json   # 70 of 70, exit 0
```

The R2 window closes here. If 13b reads `f`, a tenant save during the window
dropped the backfill. Re-running the migration's own UPDATE (MIGRATION-PLAN
"What the backfill touches") is idempotent, but it is a production data fix, so
get Jacob's yes first. Until then those sites show "Ask for a change" in place
of native editing. Nothing breaks.

STOP on a parity difference or a failed health check. Go straight to 5a, and
don't investigate first.

**3.7 Signed-in smoke on production (only if 3.5 couldn't run on the candidate)**

Run the 3.5 list on `$PROD` within 10 minutes of the promote. Any STOP item
means 5a immediately.

---

## 4. Post-promote watch

Watch closely for the first 15 minutes, check again at 1 h, and once more at
24 h. Save each read to `$W/watch-<time>.txt`.

1. **Runtime errors:** Vercel MCP `get_runtime_errors` on the new deployment,
   compared with `$W/errors-before.txt`. Use `get_runtime_logs` (filter `500`,
   `/api/v1/`, `[email]`) to dig. STOP (5a) on:
   - any 5xx on `/api/v1/*` (client sites read it)
   - a new error class on `/workspace`, `/api/approve`, sign-in or booking
   - an error rate more than 2x the 24 h baseline

   An error that only appears behind one flag means 5b for that flag (fresh
   deploy) or 5a.
2. **Health:** `curl -sS $PROD/api/health` returns 200 with `ok` at each check.
   `degraded` with a named check means investigate. `down` or 503 means 5a.
3. **Client sites:** these are the 9 sites in `$W/client-sites.txt`.
   ```sh
   while read -r id dom; do printf '%s %s ' "$id" "$dom"; curl -sS -o $W/site-$id-after.html -w '%{http_code}\n' "https://$dom/"; done < $W/client-sites.txt | diff $W/sites-before.txt -
   for f in $W/site-*-before.html; do a=${f/-before/-after}; diff <(grep -o '<title>[^<]*' $f) <(grep -o '<title>[^<]*' $a) >/dev/null || echo "TITLE CHANGED $f"; done
   npx tsx scripts/storefront-parity.ts capture --base=$PROD --tenants=$TENANTS --out=$W/parity-4-watch.json --i-have-jacobs-yes
   npx tsx scripts/storefront-parity.ts compare $W/parity-1-after-migrations.json $W/parity-4-watch.json
   ```
   Every status must stay as it was, the titles must match, and parity must be
   70/70. A client's own content edit shows up as one tenant's
   content read changing. Confirm it in that tenant's History before calling it
   a regression. A site that is down, or whose v1 reads changed without an edit,
   means 5a.
4. **Email (deploy 1):** no owner stream is open yet. In the logs, every
   `[email] owner-stream` line must be `suppressed`, and there must be **no**
   `[email] accepted audience=` line for client or customer audiences. Operator
   alerts and the prospect `/audit` mail are unchanged and expected. Sign-in
   codes go through Supabase Auth, not this path. Resend (`updates.strelva.com`)
   should show no owner or customer sends since the promote. Any accepted
   client-audience send means 5a now, and then find the gate it went through.
5. **Crons:** `/api/cron/app-events` (new, every 5 min) and
   `website-domain-verification` (now every 5 min) answer 200 and stay inside
   their `CRON_MAX_AGE_SECONDS`.

**Deploy 1 is done** when 15 minutes pass with nothing above firing. Record the
deploy 1 id in `$W/cand1-id.txt` as the new last-good, then do step 6.

---

## 3K. Deploy 2: owner claim and Needs you email

Run this only once all four of these hold: deploy 1 has passed its 1 h watch,
Jacob has said yes to email, he has confirmed at least one exact owner address
for an exact business, and step 0.8 found no `on` override (or it has since
been set to `inherit`).

**3K.1 Record each confirmation Jacob gives** (production data write, yes per
address). Use his operator account:

```sh
RW -c "select public.confirm_owner_email('<operator user id>'::uuid, '<operator verified email>', '<business workspace id>'::uuid, '<owner email>', '<how Jacob confirmed it, e.g. by phone Oct 16>')"
RO -c "select workspace_id, confirmed_at, note from public.owner_email_confirmations where revoked_at is null order by confirmed_at"   # no address printed
```

The six candidate addresses in the vault (site contact info for Leslie,
McLears, Orange Crate, RHM, Smokin Buddha and Vermont) are **unconfirmed**.
Never record or type them unless Jacob confirms that exact address for that
exact business. Cocard has none. An address that's only on file never counts.
Staff addresses are refused even if someone records them.

**3K.2 Phase K env, in the order it's written** (switch time first, streams
second, then the releases):

```sh
export SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo $SINCE > $W/owner-email-since.txt
python3 -I - > $W/deploy2-env.tsv <<'PY'
import json
for p in json.load(open('scripts/release-safety/switch-on.json'))['phases']:
    if p['deploy'] == 2:
        for c in p['changes']: print(p['phase'], c['name'], c['to'], sep='\t')
PY
wc -l < $W/deploy2-env.tsv       # expect 9; first two lines STRELVA_OWNER_EMAIL_SINCE, STRELVA_OWNER_EMAIL_STREAMS
while IFS=$'\t' read -r phase name value; do
  [ "$name" = STRELVA_OWNER_EMAIL_SINCE ] && value=$SINCE
  printf '%s' "$value" | $VC env add "$name" production --force --scope $TEAM || { echo "FAILED $name"; break; }
done < $W/deploy2-env.tsv 2>&1 | tee $W/env-deploy2.log
$VC env pull $W/env-deploy2 --environment=production --yes --scope $TEAM && chmod 600 $W/env-deploy2
pnpm tsx scripts/prod-flag-report.ts $W/env-deploy2 | diff $W/flags-deploy1.txt -
```

The diff must show exactly the 9 phase K names, and nothing else.
`STRELVA_OWNER_EMAIL_STREAMS` must be exactly `owner_claim,needs_you`, with
`needs_you_reminders` absent. `EMAIL_SENDING_ENABLED` and
`CUSTOMER_EMAIL_ENABLED` must still be unset. The only expected stop is
STRELVA_MAKE_REAL_OWNER_LINK_RELEASE (`scripts/silent-rollout.ts`), because
Jacob's Oct 15 email call supersedes that preflight for this deploy. Any other
stop means STOP.

`SINCE` is set to the moment you start the deploy 2 build. It's slightly before
the promote, which is the safe direction: anything opened before it is held, not
mailed.

**3K.3 Build, deploy, smoke, promote.** Repeat 3.1 to 3.6, with
`deploy2.log`, `cand2-id.txt` and `parity-5-candidate2.json`. In 3.4, also
check that the agency and operator claim screens say "Strelva didn't email …:
Strelva hasn't confirmed it's the owner's address yet. Copy the link and send
it yourself." for an unconfirmed owner.

## 4K. Email watch (deploy 2)

Run the whole of step 4, plus:

- Every `[email] owner-stream <stream> <outcome> workspace=<id> recipient=<hash> message=<id> | reason=<why>`
  line names `owner_claim` or `needs_you`, and nothing else.
- Every `accepted` line has a workspace with an active confirmation (3K.1) or
  the business's own verified, signed-in owner. Everything else reads
  `suppressed` with a reason: `owner_email_unconfirmed`,
  `owner_contact_staff_reason`, `opened_before_owner_email_on`, a tenant `off`
  override, or the transport's own hold.
- No backfill: decisions opened before `$SINCE` show `opened_before_owner_email_on`
  once each and stay on Home.
- Resend `updates.strelva.com`: the number of sends since the promote equals the
  number of `accepted` owner-stream lines. No booking, inquiry, reminder,
  report, export, domain or marketing mail appears.
- Home still shows every waiting decision for every business.

Any accepted send to an unconfirmed workspace, any other stream or kind, or a
burst (more than about 5 sends in the first 15 minutes, given how few owners
are confirmed) means **5a to deploy 1 at once**. Promoting deploy 1 takes away
every stream in one step. Then find the cause.

---

## 5. Rollback ladder

Use the cheapest rung that removes the harm. Code goes back before data: the
old code tolerates the new schema, but the new code needs the new schema.

**5a. Promote the previous deployment** (seconds, no build). This is the first
rung for anything user-visible.

```sh
$VC promote $ROLLBACK_DPL --scope $TEAM --yes          # from deploy 1: back to dpl_J975… (e453ce36e)
$VC promote $(awk '{print $2}' $W/cand1-id.txt) --scope $TEAM --yes   # from deploy 2: back to deploy 1 (email off, UI kept)
$VC inspect $PROD --scope $TEAM | grep -E '^\s+id\s'; curl -sS -o /dev/null -w '%{http_code}\n' $PROD/api/health
npx tsx scripts/storefront-parity.ts capture --base=$PROD --tenants=$TENANTS --out=$W/parity-rollback.json --i-have-jacobs-yes
npx tsx scripts/storefront-parity.ts compare $W/parity-1-after-migrations.json $W/parity-rollback.json
```

If `promote` refuses a `dpl_` id, pass that deployment's URL from
`$VC inspect $ROLLBACK_DPL`. A deployment keeps the env it was built with, so
`dpl_J975…` runs with none of the new flags, even though they are still set on
the project. The 29 migrations stay. They were proven additive for `e453ce36e`
(MIGRATION-PLAN "release-order trap"). After `vercel rollback` or a promote
back, check that the project hasn't switched off production-domain
auto-assignment for the next deploy. It doesn't matter here, since every
deploy uses `--skip-domain` plus `promote`.

**5b. Flag rollbacks** (take effect only on a fresh deploy, so they go with 5a
or come before the next build). For each name, use the value read in 0.8. An
empty rollback in switch-on.json means the name was unset:

```sh
$VC env rm <NAME> production --yes --scope $TEAM                                # was unset
printf '%s' '<value from flags-before>' | $VC env add <NAME> production --force --scope $TEAM   # was set
```

- Email: to stop every owner stream send, remove `STRELVA_OWNER_EMAIL_STREAMS`
  and deploy fresh, or use 5a to deploy 1. To stop one address without a
  deploy, revoke it:
  `RW -c "select public.revoke_owner_email_confirmation('<operator user id>'::uuid, '<operator verified email>', '<workspace id>'::uuid, '<owner email>')"`.
  To silence one tenant, set `reb:client-email:<tenant>` to `off` (a data
  write).
- Before any later deploy from this branch, the project env has to match what
  you intend. After a rollback, either revert the names (5b) or knowingly keep
  them.

**5c. Migration rollbacks** (needs Jacob's yes, and only after 5a, never while
the new build is live). Work in strict reverse order, from 29 down to the file
that's needed, one file per transaction:

```sh
python3 -I -c "import json;[print(p['file'][:14], p['rollback']) for p in reversed(json.load(open('$STAGE/pending-receipt.json'))['pending'])]" > $W/rollback-order.txt
while read -r v rb; do
  extra=; [ "$v" = 20261026160000 ] && extra=--single-transaction        # step 6's rollback has no BEGIN
  echo "rolling back $v"; RW $extra -f supabase/migrations/$rb || { echo "REFUSED $v"; break; }
  supabase migration repair --status reverted $v --linked --workdir $STAGE
  [ "$v" = "<stop at version N>" ] && break
done < $W/rollback-order.txt
```

Verify with `RO -f scripts/release-safety/catalog-wide.sql | shasum -a 256`.
After a full rollback of all 29, the result must equal 0.2's digest
(`c35129dd…`). History must be back to 400 rows with newest `20261025170000`.

Which rungs are really available:

| Kind | Files (plan step #) | Note |
| --- | --- | --- |
| Clean while unused | 3, 4, 5, 6, 9, 11, 14, 15, 18, 20, 27, 28 | Guarded on drift or a later caller. #6 keeps publications already made. #28 is md5-guarded. |
| Refuse once used (forward-only in practice) | 1, 2, 7, 8, 16, 17, 22, 23, 25, 26 | Refuse on rows: holders, OAuth attempts, AI controls, pay links, keep-your-site history, released steps, listing data, care reports, insurance facts, intake releases. Flag off (5b) instead. |
| Delete evidence (forward-only once used) | 10, 12, 19, 21, 23, 24 | Delete policy `owner_decisions` receipts or flag rows and change history. Use them only before first use. |
| Not exact | 13 | Removes `contentSource=strelva`. NULL comes back as `{}`. Roll the code back first. |
| Loses data | 29 | Drops `owner_email_confirmations`. Capture the confirmations first (workspace ids, notes, and the addresses Jacob gave, kept outside git). Without it every stream send is held. |

The default after any incident is to leave the schema, switch flags off, and
promote back. A migration rollback is a pre-use escape hatch. The full restore
(PITR or backup from 0.3) is the last rung. It throws away every write since
the restore point, so only Jacob calls it.

---

## 6. Git: land the build on `main` (after the deploy 1 watch)

Yes needed: "push main". This is a fast-forward only. Never use `--force`.

```sh
git -C $REPO fetch origin main
git -C $REPO merge-base --is-ancestor origin/main HEAD || echo STOP-NOT-FF
[ "$(git -C $REPO rev-parse HEAD)" = "$(cat $W/deploy-sha.txt)" ] || echo STOP-HEAD-IS-NOT-WHAT-WAS-DEPLOYED
git -C $REPO push origin HEAD:refs/heads/main
git -C $REPO fetch origin main && git -C $REPO rev-parse origin/main   # equals $W/deploy-sha.txt
```

- The push triggers `ci.yml` and `security.yml` on GitHub Actions. They aren't
  the gate. A red run doesn't undo anything, so record it in the release note.
  No Vercel deploy follows, because git deployments are off.
- If main moved in the meantime (`STOP-NOT-FF`), don't merge on main. Merge
  `origin/main` into the branch, rerun 0.7 and 3.4 parity on a new candidate,
  and redo deploy 1 before pushing.
- Afterwards: the marketing repo's `APP_REVIEW_SHA` should name the new main SHA.
  That's a separate repo and a separate push, and it needs Jacob's yes. The
  version stays `1.0.0`. Bumping it, for example to 1.1.0 for the XA build, is
  a versioning call for Jacob (VERSIONING.md: both repos, a changelog and a
  tag), and this cutover doesn't make it.

---

## Every STOP condition

Preflight:

1. Production health isn't 200/ok, or production isn't `dpl_J975…`.
2. The history isn't exactly 400 rows with newest `20261025170000`, or there's
   any applied version at or after `20261026100000`.
3. The catalog digest isn't `c35129dd…` before a fresh rehearsal.
4. Neither PITR nor a completed physical backup under 24 h old exists.
5. Less than 10 GiB of disk is free.
6. The worktree is dirty, `HEAD..origin/main` isn't 0, `origin/main` isn't an
   ancestor of HEAD, or gitleaks finds anything.
7. The migration 29 rehearsal isn't exit 0 with C2 == C0 and C3 == C1, or
   `check:release-safety` or `check:owner-email-sql` fails.
8. Lint, typecheck, test or `check:custom-repos` is red, or the final UI re-walk
   has an open mustFix.
9. A `mustStayUnset` name is set to anything but off, a phase name is `off`
   because of an earlier decision, or the flag report has `stops`.
10. A `reb:client-email:*` or `tenant_settings` value is `on`. This blocks
    deploy 2 until it's set to `inherit`.
11. A backfill row's `custom_repo` is an array or scalar, or a row is already
    `repo` with nobody having decided what to do about it.
12. The active tenant count isn't 14 and you can't explain why, or a client site
    is already failing.
13. `$W/pg.env` is empty after the dump dry run.

Migrations:

14. The staging receipt isn't 29 files from `20261026100000` to
    `20261028120000`, staging refused anything, or the dry run differs from
    the receipt.
15. The push fails for a reason other than a lock timeout, or `already exists`
    shows up and the verify rows can't explain it.
16. A trap row (06, 13b) isn't `t`, any 28-file row other than the known
    history row is `f`, any migration 29 row is `f`, health drops, or parity
    changes after the push.

Env:

17. The flag report diff has any name beyond the planned 36 (deploy 1) or 9
    (deploy 2).
18. `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED`, or
    `STRELVA_VERTICAL_INTAKE_RELEASE` is set.
19. A money, GBP-write or provider-key name changes.
20. `STRELVA_OWNER_EMAIL_STREAMS` is anything other than `owner_claim,needs_you`.

Build and promote:

21. No shared 11-character placeholder is found, or a switch or flag name is
    among the dropped lines.
22. The build fails.
23. Candidate health isn't 200/ok, a page returns 5xx, or candidate parity
    isn't 70/70.
24. A signed-in smoke shows a crash, a price, a dead end, a missing Undo, or
    builder words.
25. The promoted id doesn't match the candidate, 13b reads `f` (data fix with a
    yes), or parity isn't 70/70 after the promote.

Watch (5a on any of these):

26. A 5xx on `/api/v1/*`, a new error class on the owner, agency, approve,
    sign-in or booking paths, errors above 2x baseline, health 503 or down, a
    client site down, or a v1 read that changed without an edit.
27. Any accepted client or customer email in deploy 1.
28. In deploy 2: an accepted send to an unconfirmed workspace, a stream other
    than `owner_claim`/`needs_you`, any booking, inquiry, reminder, report or
    marketing send, a burst, or Home missing a waiting decision.

Deploy 2 never starts without Jacob's email yes and at least one confirmation
he gave for an exact address. None of the six vault candidates is ever
recorded or mailed unless Jacob confirms it.

Git:

29. Main isn't a fast-forward at push time, or HEAD isn't the SHA that was deployed.

## What this runbook has and hasn't proven

- **Read locally on Oct 16, without touching production:**
  - `origin/main` is `e453ce36e` and is an ancestor of the build, with 0
    commits missing from the build.
  - The repo is public and `main` is unprotected.
  - gitleaks scanned `e453ce36e..HEAD` (273 commits) and found nothing.
  - `vercel.json` has git deployments off.
  - `stage-pending.sh` with a simulated 400-version history stages exactly the
    29 files.
  - `verify-pending-20261016.sql` expects 428/`20261028110000`, so its first
    row reads `f` after migration 29 (handled in 1.4).
- **Not proven:**
  - Migration 29 has not been rehearsed on production's schema (0.6 does that).
  - The migration 29 SQL in 1.4 hasn't been run anywhere.
  - Nothing above has run against production.
  - The candidate sign-in host allowance hasn't been read.
  - The `vercel env add --force` and `promote <dpl id>` behaviour depends on the
    CLI version `npx` resolves. Check it with `$VC --version` in 0.1.
  - The waitlist path for the $0 cap and the final UI re-walk belong to the
    main session's gates. This file doesn't verify them.

When it's finished, run `rm -rf $W $STAGE $STAGE.applied $REPO/.vercel/output $REPO/.next`.
The `$W` env files hold production secrets, so make sure they're gone.
