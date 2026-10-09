/** Exact finite Python environment shared by both frozen fb740 harness callers. */
export function proofEnvironment(input = process.env) {
  if (input.STRELVA_LOCAL_AUTH_PROOF !== '1' || input.STRELVA_PRIVATE_AUTHORITY_PROOF !== '1') throw new Error('Closed owned Auth window required.');
  /** @type {NodeJS.ProcessEnv} */
  const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C', NODE_ENV: 'test' };
  for (const name of ['STRELVA_LOCAL_AUTH_PROOF', 'STRELVA_AUTH_STACK_DIR', 'STRELVA_LOCAL_DB_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'STRELVA_PRIVATE_SOURCE_PROOF_DIR']) {
    const value = input[name]; if (!value) throw new Error(`Missing owned proof value: ${name}`); env[name] = value;
  }
  if (env.SUPABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Owned Auth API bindings differ.');
  const auth = new URL(env.SUPABASE_URL);
  if (auth.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(auth.hostname) || auth.username || auth.password) throw new Error('Owned loopback Auth API required.');
  return env;
}
