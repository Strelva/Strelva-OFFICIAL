import { request as httpsRequest } from "node:https";
import { pinnedRequestOptions } from "@/platform/infra/pinned-lookup";
import { validateUrlSafety } from "@/platform/infra/public-url-safety";

export interface PostResult { status: number }

const RESPONSE_CAP_BYTES = 2048;

/**
 * One HTTPS POST to an outside maker's address. https on port 443 only, no
 * credentials in the address, DNS validated and pinned for the socket, redirects
 * never followed (the 3xx status is returned), and at most 2048 bytes of the
 * answer read. The overall deadline is `timeoutMs`.
 */
export async function postPinned(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  options: {
    timeoutMs: number;
    validate?: (url: string) => Promise<{ address: string }>;
    request?: typeof httpsRequest;
  },
): Promise<PostResult> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("address not allowed"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port !== "" && url.port !== "443")) throw new Error("address not allowed");
  let address: string;
  try { address = (await (options.validate ?? validateUrlSafety)(url.href)).address; } catch { throw new Error("address not allowed"); }
  const send = options.request ?? httpsRequest;

  return new Promise<PostResult>((resolve, reject) => {
    let finished = false;
    let status = 0;
    const req = send({
      ...pinnedRequestOptions(address),
      protocol: "https:",
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      servername: url.hostname.replace(/^\[|\]$/g, ""),
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)), "Accept-Encoding": "identity" },
    }, (res) => {
      status = res.statusCode ?? 0;
      let read = 0;
      const settle = () => { if (finished) return; finished = true; clearTimeout(timer); req.destroy(); resolve({ status }); };
      res.on("data", (chunk: Buffer | string) => {
        read += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
        if (read >= RESPONSE_CAP_BYTES) { res.destroy(); settle(); }
      });
      res.on("end", settle);
      res.on("close", settle);
      res.on("error", settle);
    });
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      req.destroy();
      reject(new Error("timed out"));
    }, options.timeoutMs);
    req.on("error", (error: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });
    req.end(body);
  });
}
