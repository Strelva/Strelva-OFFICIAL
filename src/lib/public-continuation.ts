import { z } from "zod";
// The one secrets path (AGENTS.md): sealing goes through crypto/secrets.ts.
import { deriveSealKey, openWithKey, sealWithKey } from "@/platform/infra/crypto/secrets";

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
  return secret ? deriveSealKey("strelva:public-continuation:v1", secret) : null;
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
  return sealWithKey(encryptionKey, JSON.stringify(parsed));
}

export function openPublicContinuation(value: string | undefined): PublicContinuation | null {
  const encryptionKey = key();
  if (!value || !encryptionKey || value.length > 4_000) return null;
  const plaintext = openWithKey(encryptionKey, value);
  if (plaintext === null) return null;
  try {
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
