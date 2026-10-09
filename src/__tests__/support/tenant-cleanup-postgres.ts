import { execFileSync } from "node:child_process";

/** Existing, fully migrated coordinator-owned disposable cluster only. No schema
 * fabrication, missing-table substitutes, remote DSNs or database startup. */
export function tenantCleanupPostgres(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(value => typeof value === "string")) throw new Error("cleanup_psql_requires_json_argv");
  const argv: string[] = parsed;
  const host = argv[argv.indexOf("-h") + 1];
  if (!argv.includes("-h") || !(host === "127.0.0.1" || host === "localhost" || /^\/(private\/)?tmp\//.test(host))) throw new Error("cleanup_psql_requires_disposable_local_host");
  if (!argv.includes("-d") || argv.some(value => /postgres(?:ql)?:\/\/|service=|host=/.test(value))) throw new Error("cleanup_psql_requires_explicit_local_database");
  const base = [...argv, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const signatures: Record<string, Record<string, string>> = {
    tenant_cleanup_receipt: { p_slug: "text" },
    deprovision_tenant_guarded: { p_tenant_id: "text", p_force: "boolean", p_require_inquiry_export: "boolean", p_retain_receipts: "boolean" },
    finish_tenant_deprovision_cleanup: { p_tenant_id: "text", p_receipt_id: "uuid", p_redis_complete: "boolean", p_provider_complete: "boolean", p_summary: "jsonb", p_expected_revision: "bigint" },
    record_tenant_client_record: { p_tenant_id: "text", p_store: "text", p_record_id: "text", p_payload: "jsonb", p_payload_hash: "text", p_captured_at: "timestamptz", p_via: "text", p_mode: "text" },
  };
  const execute = (sql: string, values: string[] = []) => execFileSync("psql", [...base, ...values.flatMap((value, i) => ["-v", `v${i}=${value}`])], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  return {
    query: execute,
    from(): never { throw new Error("cleanup_retry_adapter_has_no_table_fallback"); },
    async rpc(name: string, args: Record<string, unknown>) {
      const types = signatures[name];
      if (!types || Object.keys(args).some(key => !types[key])) throw new Error(`cleanup_rpc_not_supported:${name}`);
      const values: string[] = [];
      const params = Object.entries(args).map(([key, value]) => {
        if (value === null || value === undefined) return `${key} => null::${types[key]}`;
        const index = values.push(typeof value === "object" ? JSON.stringify(value) : String(value)) - 1;
        return `${key} => :'v${index}'::${types[key]}`;
      });
      try {
        return { data: JSON.parse(execute(`set role service_role; select public.${name}(${params.join(",")});`, values)), error: null };
      } catch (error) {
        return { data: null, error: { message: String((error as { stderr?: string }).stderr ?? error) } };
      }
    },
  };
}
