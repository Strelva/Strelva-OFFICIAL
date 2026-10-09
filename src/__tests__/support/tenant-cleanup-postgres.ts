import { execFileSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Existing, fully migrated coordinator-owned disposable cluster only. No schema
 * fabrication, missing-table substitutes, remote DSNs or database startup. */
export function cleanupConnectionArgs(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(value => typeof value === "string") || parsed.length % 2 !== 0) throw new Error("cleanup_psql_requires_json_connection_pairs");
  const options = new Map<string, string>();
  for (let index = 0; index < parsed.length; index += 2) {
    const flag: string = parsed[index], value: string = parsed[index + 1];
    if (!["-h", "-p", "-U", "-d"].includes(flag) || options.has(flag)) throw new Error("cleanup_psql_duplicate_or_unsupported_option");
    options.set(flag, value);
  }
  const host = options.get("-h");
  if (!host || !(host === "127.0.0.1" || host === "localhost" || (/^\/(private\/)?tmp\//.test(host) && resolve(host) === host))) throw new Error("cleanup_psql_requires_disposable_local_host");
  for (const flag of ["-U", "-d"]) if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(options.get(flag) ?? "")) throw new Error("cleanup_psql_requires_explicit_local_identity");
  const port = options.get("-p");
  if (port !== undefined && (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error("cleanup_psql_invalid_port");
  // Reconstruct singular allowlisted argv; never forward caller-provided flags.
  return ["-h", host, ...(port ? ["-p", port] : []), "-U", options.get("-U")!, "-d", options.get("-d")!];
}

export function cleanupProcessEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // PGHOSTADDR/PGSERVICE/PGOPTIONS can override a seemingly local -h. This
  // fixture uses local trust auth and passes every connection field explicitly.
  return Object.fromEntries(Object.entries(input).filter(([name]) => !/^(PG|PSQL)/i.test(name)));
}

export function tenantCleanupPostgres(raw: string) {
  const argv = cleanupConnectionArgs(raw);
  const host = argv[1]!;
  if (host.startsWith("/")) {
    const canonical = realpathSync(host);
    const info = statSync(canonical);
    if (!/^\/(private\/)?tmp\//.test(canonical) || !info.isDirectory() || info.uid !== process.getuid?.()) throw new Error("cleanup_psql_socket_directory_not_owned");
  }
  const base = [...argv, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const signatures: Record<string, Record<string, string>> = {
    tenant_cleanup_receipt: { p_slug: "text" },
    deprovision_tenant_guarded: { p_tenant_id: "text", p_force: "boolean", p_require_inquiry_export: "boolean", p_retain_receipts: "boolean" },
    finish_tenant_deprovision_cleanup: { p_tenant_id: "text", p_receipt_id: "uuid", p_redis_complete: "boolean", p_provider_complete: "boolean", p_summary: "jsonb", p_expected_revision: "bigint" },
    record_tenant_client_record: { p_tenant_id: "text", p_store: "text", p_record_id: "text", p_payload: "jsonb", p_payload_hash: "text", p_captured_at: "timestamptz", p_via: "text", p_mode: "text" },
  };
  const execute = (sql: string, values: string[] = []) => execFileSync("psql", [...base, ...values.flatMap((value, i) => ["-v", `v${i}=${value}`])], { input: sql, env: cleanupProcessEnvironment(process.env), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
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
