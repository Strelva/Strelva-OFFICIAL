/** Only the owning harness supplies spawn/retention. No process starts on import.
 * EXIT is not closure: final stdout/stderr can arrive before CLOSE. */
export function startRetainedNativeChild(name, { spawn, args, env, retain, timeoutMs = 15000, graceMs = 500, closeLimitMs = 2000 }) {
  const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"], env });
  let stdout = "", stderr = "", closed = false, childError = null, timedOut = false, terminationRequested = false;
  let escalation, closeLimit;
  const log = () => retain(`${name}.log`, `${stdout}\n${stderr}`);
  child.stdout.on("data", chunk => { stdout += chunk; log(); });
  child.stderr.on("data", chunk => { stderr += chunk; log(); });
  child.stdin.on("error", error => { childError ||= error.message; log(); });
  const terminate = () => {
    if (closed || terminationRequested) return;
    terminationRequested = true;
    child.kill("SIGTERM");
    escalation = setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, graceMs);
  };
  const completed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    // A kernel/spawn closure failure can never be represented as successful
    // execution. Partial diagnostics remain on disk; the harness emits no
    // final artifact-hash qualification receipt until all CLOSEs are observed.
    closeLimit = setTimeout(() => {
      if (closed) return;
      terminate();
      clearTimeout(timeout); clearTimeout(escalation);
      retain(`${name}-closure-unconfirmed.json`, JSON.stringify({ closed: false, timedOut, terminationRequested, error: childError, pid: child.pid ?? null }));
      reject(new Error(`${name}: owned child closure was not observed after bounded termination`));
    }, timeoutMs + graceMs + closeLimitMs);
    child.on("error", error => { childError = error.message; log(); });
    child.on("close", (code, signal) => {
      closed = true; clearTimeout(timeout); clearTimeout(escalation); clearTimeout(closeLimit); log();
      const result = { code, signal, error: childError, timedOut, terminationRequested, closed, stdout: stdout.trim(), stderr };
      retain(`${name}-process.json`, JSON.stringify(result, null, 2)); resolve(result);
    });
  });
  log();
  return { child, completed, output: () => stdout, done: () => closed, terminate };
}
