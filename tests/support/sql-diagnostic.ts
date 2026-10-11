/** Never forward execFileSync's message/cause: both contain credential argv. */
export function localSqlFailure(error: unknown, connectionUrl: string): Error {
  const failure = error && typeof error === "object" ? error as { stderr?: unknown; status?: unknown; code?: unknown } : {};
  const stderr = typeof failure.stderr === "string" ? failure.stderr : Buffer.isBuffer(failure.stderr) ? failure.stderr.toString("utf8") : "";
  const url = new URL(connectionUrl);
  let decodedPassword = url.password;
  try { decodedPassword = decodeURIComponent(url.password); } catch { /* Keep the raw password redaction for malformed encodings. */ }
  const secrets = [connectionUrl, url.password, decodedPassword].filter(Boolean).sort((a, b) => b.length - a.length);
  let diagnostic = stderr.slice(0, 4096)
    .split(/\r?\n/).filter(line => /^\s*(?:ERROR|FATAL|SQLSTATE|HINT):/i.test(line)).slice(0, 3).join("\n");
  for (const secret of secrets) diagnostic = diagnostic.replaceAll(secret, "[redacted]");
  diagnostic = diagnostic.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URL]")
    .replace(/\bpassword\s*=\s*(?:'[^']*'|"[^"]*"|[^\s]+)/gi, "password=[redacted]").slice(0, 1000);
  const status = typeof failure.status === "number" ? ` (exit ${failure.status})` : "";
  return new Error(`Local SQL fixture failed${status}: ${diagnostic || "No safe SQL diagnostic was returned."}`);
}
