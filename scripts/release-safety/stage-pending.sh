#!/usr/bin/env bash
# Offline staging for a Supabase CLI push of every forward migration a target
# has not applied. Copies config.toml (+ its auth templates) and ONLY timestamped forward files (never
# rollback-*, verify-* or other companions) into a fresh directory, then writes
# a receipt with each pending file's sha256 and every pinned digest it checked.
#
#   bash scripts/release-safety/stage-pending.sh <applied-versions.txt> <fresh-out-dir> [through-version]
#
# With [through-version], pending files after that version are left out, so a
# push can stop at a reviewed boundary; the next staging picks up from there.
#
# <applied-versions.txt>: one 14-digit version per line from a freshly reviewed
# read of supabase_migrations.schema_migrations. Every applied version must exist
# here as a file; every pending file must be pinned in batches.json with a
# matching sha256 and a rollback whose sha256 also matches. No network, no
# Supabase link, no push: staging grants no deployment authority.
set -euo pipefail
APPLIED=$1; OUT=$2; THROUGH=${3:-99999999999999}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MIG=$ROOT/supabase/migrations
[ -e "$OUT" ] && { echo "Refusing: $OUT already exists; staging needs a fresh directory." >&2; exit 1; }
grep -Eqv '^[0-9]{14}$' "$APPLIED" && { echo "Refusing: applied list must hold only 14-digit versions." >&2; exit 1; }
[[ "$THROUGH" =~ ^[0-9]{14}$ ]] || { echo "Refusing: through-version must be 14 digits." >&2; exit 1; }
python3 -I - "$ROOT" "$APPLIED" "$OUT" "$THROUGH" <<'PY'
import hashlib, json, os, re, shutil, sys
root, applied_path, out, through = sys.argv[1:5]
mig = os.path.join(root, "supabase", "migrations")
applied = [l.strip() for l in open(applied_path) if l.strip()]
if len(set(applied)) != len(applied): sys.exit("Refusing: duplicate applied versions.")
forwards = sorted(f for f in os.listdir(mig) if re.fullmatch(r"\d{14}_[A-Za-z0-9_]+\.sql", f))
held_back = [f for f in forwards if f[:14] > through and f[:14] not in set(l.strip() for l in open(applied_path))]
forwards = [f for f in forwards if f not in held_back]
by_version = {}
for f in forwards:
    if f[:14] in by_version: sys.exit(f"Refusing: duplicate version {f[:14]}.")
    by_version[f[:14]] = f
missing = sorted(set(applied) - set(by_version))
if missing: sys.exit(f"Refusing: target history has versions with no file here: {missing}")
pending = [f for f in forwards if f[:14] not in set(applied)]
if pending and min(p[:14] for p in pending) < max(applied):
    sys.exit("Refusing: a pending file predates the newest applied version; this needs --include-all and its own review.")
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
manifest = json.load(open(os.path.join(root, "scripts", "release-safety", "batches.json")))
pinned = {}
for step in manifest["proposed"]:
    for item in step.get("items", []):
        pinned[item["file"]] = item
receipt = []
for f in pending:
    item = pinned.get(f)
    if not item: sys.exit(f"Refusing: {f} is not pinned in batches.json.")
    if item.get("sha256") != sha(os.path.join(mig, f)): sys.exit(f"Refusing: {f} digest differs from batches.json.")
    rb = item.get("rollback")
    if not rb or item.get("rollbackSha256") != sha(os.path.join(mig, rb)): sys.exit(f"Refusing: {f} has no pinned, matching rollback.")
    receipt.append({"file": f, "sha256": item["sha256"], "rollback": rb, "rollbackSha256": item["rollbackSha256"]})
os.makedirs(os.path.join(out, "supabase", "migrations"), mode=0o700)
shutil.copy2(os.path.join(root, "supabase", "config.toml"), os.path.join(out, "supabase", "config.toml"))
# config.toml references auth email templates by path; the CLI refuses to load without them.
if os.path.isdir(os.path.join(root, "supabase", "templates")):
    shutil.copytree(os.path.join(root, "supabase", "templates"), os.path.join(out, "supabase", "templates"))
for f in forwards: shutil.copy2(os.path.join(mig, f), os.path.join(out, "supabase", "migrations", f))
with open(os.path.join(out, "pending-receipt.json"), "w") as fh:
    json.dump({"appliedCount": len(applied), "stagedForwardCount": len(forwards), "pending": receipt,
               "heldBack": held_back,
               "deploymentAuthorized": False}, fh, indent=2)
    fh.write("\n")
print(f"staged {len(forwards)} forward files; {len(pending)} pending; {len(held_back)} held back:")
for r in receipt: print(f"  {r['file']}  {r['sha256']}")
PY
