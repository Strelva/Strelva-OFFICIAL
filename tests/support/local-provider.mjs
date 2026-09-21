// Explicit opt-in Node preload for isolated local integration tests only.
// Resend fetches are answered here without opening a provider connection.
import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";

if (process.env.STRELVA_LOCAL_PROVIDER_PROOF !== "1") throw new Error("The local provider fixture requires explicit test opt-in.");
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.SUPABASE_URL || "").hostname)) throw new Error("The provider fixture requires isolated loopback Supabase.");
const logPath = process.env.STRELVA_LOCAL_PROVIDER_LOG;
if (!logPath) throw new Error("A private local provider evidence path is required.");
const originalFetch = globalThis.fetch;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const messages = () => existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return originalFetch(input, init);
  if (url.hostname !== "api.resend.com") throw new Error(`Local proof blocked an external fetch to ${url.hostname}.`);
  const request = new Request(input, init);
  if (request.method === "POST" && url.pathname === "/emails") {
    const body = await request.json();
    const idempotencyKey = request.headers.get("idempotency-key");
    const hash = createHash("sha256").update(idempotencyKey || randomUUID()).digest("hex");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    appendFileSync(logPath, `${JSON.stringify({ ...body, id, idempotencyKey, created_at: new Date().toISOString() })}\n`, { mode: 0o600 });
    return reply({ id });
  }
  if (request.method === "GET" && url.pathname === "/emails/receiving") {
    const readbackFailurePath = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
    if (readbackFailurePath && existsSync(readbackFailurePath)) {
      unlinkSync(readbackFailurePath);
      return reply({ name: "fixture_readback_unavailable", message: "The local provider intentionally lost one receiving read-back." }, 503);
    }
    return reply({ object: "list", has_more: false, data: [] });
  }
  if (request.method === "GET" && /^\/emails\/[^/]+$/.test(url.pathname)) {
    const readbackFailurePath = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
    if (readbackFailurePath && existsSync(readbackFailurePath)) {
      unlinkSync(readbackFailurePath);
      return reply({ name: "fixture_readback_unavailable", message: "The local provider intentionally lost one read-back." }, 503);
    }
    const found = messages().find((message) => message.id === url.pathname.split("/").at(-1));
    return found ? reply({ ...found, to: Array.isArray(found.to) ? found.to : [found.to], object: "email", last_event: "delivered" }) : reply({ name: "not_found", message: "No local provider message has that id." }, 404);
  }
  throw new Error(`The local provider fixture does not implement ${request.method} ${url.pathname}.`);
};
