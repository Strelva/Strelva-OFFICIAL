import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/check-agency-workflow-sql.sh", "utf8");
const recovery = source.slice(source.indexOf("owner_boundary_query="), source.indexOf("while IFS= read -r migration; do"));
const predecessor = "20261017120000_owner_decision_operator_refusal.sql";
const successor = "20261023142000_two_doors_bring_in_an_agency.sql";

// Execute the actual recovery helper with an in-process psql transport. This
// proves orchestration/failure handling only; the coordinator runs native SQL.
function rehearse(mode = "current") {
  const clusterRoot = mkdtempSync(join(tmpdir(), "agency-sql-order-"));
  writeFileSync(join(clusterRoot, "owner-boundary-before.hash"), "before\n");
  const harness = `
set -euo pipefail
repo_root="$1"
cluster_root="$2"
mode="$3"
psql_args=(--no-psqlrc)
owner_claim_successor="$repo_root/supabase/migrations/${successor}"
successor_installed=true
owner_state=after
if [[ "$mode" == legacy ]]; then owner_claim_successor="$cluster_root/no-successor.sql"; successor_installed=false; fi
psql() {
  printf '%s\\n' "$*" >> "$cluster_root/calls"
  case "$*" in
    *--file=*rollback-${predecessor})
      if [[ "$successor_installed" == true ]]; then
        if [[ "$mode" == unsafe ]]; then return 0; fi
        if [[ "$mode" == wrong-refusal ]]; then printf 'unrelated_database_error\\n' >&2; return 3; fi
        printf 'rollback_wrong_order_or_function_drift: owner_decision_operator_refusal\\n' >&2
        return 3
      fi
      owner_state=before ;;
    *--file=*rollback-${successor})
      if [[ "$mode" == populated ]]; then printf 'two_doors_agency_rollback_refused: agency grants or agency decisions exist\\n' >&2; return 3; fi
      successor_installed=false ;;
    *--file=*/${predecessor}) owner_state=after ;;
    *--file=*/${successor}) successor_installed=true; if [[ "$mode" == drift ]]; then owner_state=drift; fi ;;
    *p.pronamespace*)
      if [[ "$owner_state" == drift ]]; then printf 'catalog-drift\\n'; else printf 'current-catalog\\n'; fi ;;
    *-Atc*) printf '%s\\n' "$owner_state" ;;
  esac
}
${recovery}
rehearse_owner_operator_boundary
`;
  try {
    const result = spawnSync("bash", ["-c", harness, "agency-order-test", process.cwd(), clusterRoot, mode], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (!existsSync(join(clusterRoot, "calls"))) throw new Error(result.stderr);
    const calls = readFileSync(join(clusterRoot, "calls"), "utf8");
    const files = [...calls.matchAll(/--file=.*\/(.*\.sql)/g)].map(match => match[1]);
    return { ...result, calls, files };
  } finally {
    rmSync(clusterRoot, { recursive: true, force: true });
  }
}

describe("agency workflow SQL recovery ordering", () => {
  it("proves predecessor refusal, reverses successors first, then reapplies in forward order", () => {
    const result = rehearse();
    expect(result.status, result.stderr).toBe(0);
    expect(result.files).toEqual([
      `rollback-${predecessor}`, `rollback-${successor}`, `rollback-${predecessor}`,
      predecessor, "operator-owner-decisions-schema.sql", successor,
    ]);
  });

  it("stops on a populated successor refusal before the historical inverse", () => {
    const result = rehearse("populated");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("two_doors_agency_rollback_refused");
    expect(result.files).toEqual([`rollback-${predecessor}`, `rollback-${successor}`]);
  });

  it.each(["unsafe", "wrong-refusal"])("rejects a predecessor refusal that is not the exact guard: %s", mode => {
    const result = rehearse(mode);
    expect(result.status).not.toBe(0);
    expect(result.files).toEqual([`rollback-${predecessor}`]);
  });

  it("rejects changed function definitions, owners or ACLs after reapply", () => {
    expect(rehearse("drift").status).not.toBe(0);
  });

  it("keeps predecessor-only recovery available without a wrapper", () => {
    const result = rehearse("legacy");
    expect(result.status, result.stderr).toBe(0);
    expect(result.files).toEqual([`rollback-${predecessor}`, predecessor, "operator-owner-decisions-schema.sql"]);
  });

  it("rehearses at installation before later tails and retains the final OID catalog check", () => {
    const loop = source.slice(source.indexOf("while IFS="), source.indexOf("function_catalog_query="));
    expect(loop).toContain('if [[ "$migration" == "$owner_claim_successor" ]]; then\n    rehearse_owner_operator_boundary\n    owner_boundary_rehearsed=true');
    expect(source).toContain("select p.oid::regprocedure::text,p.oid,p.proowner");
    expect(source).toContain('cmp "$cluster_root/final-functions-before.catalog" "$cluster_root/final-functions-after.catalog"');
    expect(recovery).not.toContain("|| true");
  });
});
