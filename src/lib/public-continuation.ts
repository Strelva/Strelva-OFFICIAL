import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const PUBLIC_CONTINUATION_COOKIE = "strelva_public_continuation";
export const PUBLIC_CONTINUATION_NEXT = "/workspace/account?continue=public";

const briefSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  businessName: z.string().trim().min(1).max(80),
  request: z.string().trim().min(1).max(2_000),
  result: z.string().trim().min(1).max(2_000),
  resultTitle: z.string().trim().min(1).max(160),
  scope: z.string().trim().min(1).max(1_000),
  review: z.boolean(),
  fileNames: z.array(z.string().trim().min(1).max(255)).max(5),
}).strict();

export type PublicContinuation = z.infer<typeof briefSchema>;

const MAX_PLAINTEXT_BYTES = 2_700;

function key(): Buffer | null {
  const secret = process.env.PUBLIC_CONTINUATION_SECRET || process.env.INTERNAL_API_SECRET;
  return secret ? createHash("sha256").update("strelva:public-continuation:v1\0").update(secret).digest() : null;
}

export function parsePublicContinuation(value: unknown): PublicContinuation | null {
  const parsed = briefSchema.safeParse(value);
  if (!parsed.success) return null;
  const bytes = Buffer.byteLength(JSON.stringify(parsed.data), "utf8");
  return bytes <= MAX_PLAINTEXT_BYTES ? parsed.data : null;
}

export function sealPublicContinuation(value: PublicContinuation): string | null {
  const parsed = parsePublicContinuation(value);
  const encryptionKey = key();
  if (!parsed || !encryptionKey) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function openPublicContinuation(value: string | undefined): PublicContinuation | null {
  const encryptionKey = key();
  if (!value || !encryptionKey || value.length > 4_000) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url")) as [Buffer, Buffer, Buffer];
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return parsePublicContinuation(JSON.parse(plaintext));
  } catch {
    return null;
  }
}

export function publicContinuationText(brief: PublicContinuation): string {
  const files = brief.fileNames.length ? brief.fileNames.join(", ") : "None";
  return [
    `Business context: ${brief.businessName}`,
    "",
    "Request",
    brief.request,
    "",
    "Successful result",
    brief.result,
    "",
    "Prepared scope",
    brief.scope,
    "",
    `Review before activation: ${brief.review ? "Yes" : "Rules still need agreement"}`,
    `File names selected locally: ${files}`,
    "",
    "No file contents were uploaded. No system was connected, work accepted, or change activated by importing this brief.",
  ].join("\n");
}
