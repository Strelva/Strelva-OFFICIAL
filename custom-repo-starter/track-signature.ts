import { createPrivateKey, sign } from "node:crypto";

const TIMESTAMP_HEADER = "x-reb-track-timestamp";
const SIGNATURE_HEADER = "x-reb-track-signature";
const ORIGIN_HEADER = "x-reb-track-origin";

/** Sign the exact JSON body, tenant path, site origin, and current timestamp. Server-only. */
export function createTrackSignatureHeaders(input: {
  tenant: string;
  origin: string;
  rawBody: string;
  privateKeyBase64?: string;
  timestamp?: string;
}): Record<string, string> | null {
  const encodedKey = input.privateKeyBase64 ?? process.env.REB_TRACKING_PRIVATE_KEY;
  if (!encodedKey) return null;

  try {
    const privateKey = createPrivateKey({
      key: Buffer.from(encodedKey, "base64"),
      format: "der",
      type: "pkcs8",
    });
    if (privateKey.asymmetricKeyType !== "ed25519") return null;

    const timestamp = input.timestamp ?? Date.now().toString();
    const payload = `strelva-track-v1\n${input.tenant}\n${timestamp}\n${input.origin}\n${input.rawBody}`;
    const signature = sign(null, Buffer.from(payload), privateKey).toString("base64");
    return {
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: signature,
      [ORIGIN_HEADER]: input.origin,
    };
  } catch {
    return null;
  }
}
