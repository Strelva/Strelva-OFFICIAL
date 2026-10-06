import { createServer, request, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedLookup, pinnedRequestOptions } from "@/lib/pinned-lookup";

let server: Server; let port = 0;
beforeAll(async () => {
  server = createServer((_req, res) => { res.end("pinned"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

function get(options: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "pinned.invalid", port, path: "/", ...options }, res => { let body = ""; res.on("data", chunk => { body += chunk; }); res.on("end", () => resolve(body)); });
    req.on("error", reject); req.end();
  });
}

describe("pinned socket lookup on a real Node socket (audit finding 4)", () => {
  it("reproduces the old single-address lookup failing under all:true", async () => {
    const legacy: LookupFunction = (_hostname, _options, callback) => callback(null, "127.0.0.1", 4);
    await expect(get({ lookup: legacy, autoSelectFamily: true })).rejects.toMatchObject({ code: "ERR_INVALID_IP_ADDRESS" });
  });
  it("connects to the pinned address whether Node asks for one address or all of them", async () => {
    expect(await get({ lookup: pinnedLookup("127.0.0.1"), autoSelectFamily: true })).toBe("pinned");
    expect(await get(pinnedRequestOptions("127.0.0.1"))).toBe("pinned");
  });
});
