/**
 * What must be true before STRELVA_GOOGLE_BINDINGS=1 is safe. The flag alone
 * breaks Google reconnects: captureBindingOperation (src/lib/google-access.ts)
 * returns "failed" unless the client-records cutover is durable for both
 * provider_connections and provider_metadata. Pure and env-name only; it
 * reads no store and returns no value from the environment.
 */
type Env = Record<string, string | undefined>;

export interface FlipPrerequisite { key: string; ok: boolean; why: string }

function stores(env: Env): string[] {
  return (env.STRELVA_CLIENT_RECORDS_READ ?? "").split(",").map(item => item.trim());
}
const present = (env: Env, name: string) => (env[name] ?? "").trim() !== "";

export function googleBindingsFlipPrerequisites(env: Env = process.env): FlipPrerequisite[] {
  return [
    { key: "SECRETS_ENC_KEY", ok: present(env, "SECRETS_ENC_KEY"), why: "Bindings store tokens encrypted and refuse plaintext." },
    { key: "GOOGLE_CLIENT_ID", ok: present(env, "GOOGLE_CLIENT_ID"), why: "Google sign-in and reconnect need the OAuth client." },
    { key: "GOOGLE_CLIENT_SECRET", ok: present(env, "GOOGLE_CLIENT_SECRET"), why: "Google sign-in and reconnect need the OAuth client." },
    { key: "STRELVA_CLIENT_RECORDS_DUAL_WRITE=1", ok: env.STRELVA_CLIENT_RECORDS_DUAL_WRITE === "1", why: "A reconnect needs durable client records, which need dual write on." },
    { key: "DUAL_WRITE_PG is not 0", ok: env.DUAL_WRITE_PG !== "0", why: "DUAL_WRITE_PG=0 turns the durable client-record write off." },
    { key: "STRELVA_CLIENT_RECORDS_READ includes provider_connections", ok: stores(env).includes("provider_connections"), why: "Without it a reconnect cannot prove the connection store is durable." },
    { key: "STRELVA_CLIENT_RECORDS_READ includes provider_metadata", ok: stores(env).includes("provider_metadata"), why: "Without it a reconnect cannot prove the metadata store is durable." },
  ];
}

export function googleBindingsFlipReady(env: Env = process.env): boolean {
  return googleBindingsFlipPrerequisites(env).every(item => item.ok);
}
