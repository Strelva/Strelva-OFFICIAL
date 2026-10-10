/** Release preparation only. These rules do not change runtime email policy. */
export const CLIENT_SEND_FLAGS = [
  "EMAIL_SENDING_ENABLED",
  "CUSTOMER_EMAIL_ENABLED",
  "STRELVA_BOOKING_OWNER_NOTICE",
  "STRELVA_BOOKING_REMINDERS",
  "STRELVA_MAKE_REAL_OWNER_LINK_RELEASE",
] as const;

export function silentRolloutEnvStops(env: Record<string, string | undefined>): string[] {
  const stops: string[] = [];
  for (const name of CLIENT_SEND_FLAGS) {
    const value = env[name]?.trim().toLowerCase();
    // Fail closed on malformed values too; never print a supplied value.
    if (value && !["0", "false", "off", "no"].includes(value)) {
      stops.push(`${name} must be absent or off for a silent rollout.`);
    }
  }
  return stops;
}

/** Literal dotenv subset: reject expansion/duplicate keys rather than guess a deployment value. */
export function parseRolloutEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid env assignment at line ${index + 1}.`);
    const key = match[1]!;
    const rhs = match[2]!;
    if (Object.hasOwn(env, key)) throw new Error(`Duplicate env name: ${key}.`);
    let value: string;
    if (rhs.startsWith('"') || rhs.startsWith("'")) {
      const quoted = /^(["'])(.*?)\1\s*(?:#.*)?$/.exec(rhs);
      if (!quoted) throw new Error(`Invalid quoted env assignment at line ${index + 1}.`);
      value = quoted[2]!;
    } else value = rhs.replace(/\s+#.*$/, "").trim();
    if (/[$`\\]/.test(value)) throw new Error(`Env expansion is unsupported at line ${index + 1}.`);
    env[key] = value;
  }
  return env;
}
