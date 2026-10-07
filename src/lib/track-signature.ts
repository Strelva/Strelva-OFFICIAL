import { createPublicKey, verify as verifySignature } from "node:crypto";

export const TRACK_SIGNATURE_HEADERS = {
  timestamp: "x-reb-track-timestamp",
  signature: "x-reb-track-signature",
} as const;

export const TRACK_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export function normalizeTrackPublicKey(value: string): string | null {
  try {
    const key = createPublicKey(value.trim());
    if (key.asymmetricKeyType !== "ed25519") return null;
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch {
    return null;
  }
}

export function trackSignaturePayload(input: {
  tenant: string;
  origin: string;
  timestamp: string;
  rawBody: string;
}): string {
  return `strelva-track-v1\n${input.tenant}\n${input.timestamp}\n${input.origin}\n${input.rawBody}`;
}

export function verifyTrackSignature(input: {
  publicKey: string;
  tenant: string;
  origin: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
}): boolean {
  if (!input.timestamp || !/^\d{13}$/.test(input.timestamp) || !input.signature) return false;
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs((input.now ?? Date.now()) - timestamp) > TRACK_SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const signature = Buffer.from(input.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== input.signature) return false;

  try {
    const publicKey = createPublicKey(input.publicKey);
    if (publicKey.asymmetricKeyType !== "ed25519") return false;
    return verifySignature(
      null,
      Buffer.from(trackSignaturePayload({
        tenant: input.tenant,
        origin: input.origin,
        timestamp: input.timestamp,
        rawBody: input.rawBody,
      })),
      publicKey,
      signature,
    );
  } catch {
    return false;
  }
}
