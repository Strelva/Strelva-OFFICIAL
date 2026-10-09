/** Actual HTTP read-back for the closed, disposable native journey runner.
 * Production public reads retain the pinned-public transport. This path may
 * read only this runner's sites host on its own app socket, without cookies,
 * credentials, redirects or a browser-supplied destination. */
export async function fetchOwnedProofWebsite(target: { tenantId: string; url: string }, read?: typeof fetch): Promise<string | null | undefined> {
  if (process.env.NODE_ENV === "production" || process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_FULL_MODEL_PROFILE !== "full-native") return undefined;
  let app: URL; let sites: URL; let url: URL;
  try {
    app = new URL(process.env.NEXT_PUBLIC_APP_URL || "");
    sites = new URL(process.env.NEXT_PUBLIC_SITES_PATH_ORIGIN || "");
    url = new URL(target.url);
  } catch { return undefined; }
  if (app.protocol !== "http:" || app.hostname !== "localhost" || !app.port || app.pathname !== "/" || app.username || app.password || app.search || app.hash
    || sites.protocol !== "http:" || sites.hostname !== "sites.localhost" || sites.port !== app.port || sites.pathname !== "/" || sites.username || sites.password || sites.search || sites.hash
    || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(target.tenantId)
    || url.origin !== sites.origin || url.pathname !== `/sites/${target.tenantId}/` || url.username || url.password || url.search || url.hash) return undefined;
  if (!read) return readOwnedSocket(app, sites, target.tenantId);
  try {
    // Request the canonical no-trailing-slash route. Node does not resolve
    // *.localhost; the Host reaches the real sites routing on the owned socket.
    const response = await read(new URL(`/sites/${target.tenantId}`, app.origin), {
      method: "GET", headers: { host: sites.host }, credentials: "omit", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("text/html") || !response.body) return null;
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2_000_000) { await reader.cancel(); return null; }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(body);
  } catch { return null; }
}

/** Node fetch can discard a custom Host. The strict path renderer must receive
 * the configured sites Host while the socket remains this runner's app. */
async function readOwnedSocket(app: URL, sites: URL, tenantId: string): Promise<string | null> {
  const { request } = await import("node:http");
  return new Promise(resolve => {
    const connection = request(new URL(`/sites/${tenantId}`, app.origin), {
      method: "GET", headers: { host: sites.host }, agent: false, signal: AbortSignal.timeout(8000),
    }, response => {
      if (response.statusCode !== 200 || !response.headers["content-type"]?.startsWith("text/html")) {
        response.destroy(); resolve(null); return;
      }
      const chunks: Buffer[] = []; let bytes = 0; let failed = false;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) { failed = true; response.destroy(); resolve(null); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(failed ? null : Buffer.concat(chunks, bytes).toString("utf8")));
      response.on("error", () => resolve(null));
      response.on("aborted", () => resolve(null));
    });
    connection.on("error", () => resolve(null));
    connection.end();
  });
}
