/**
 * Envelope encryption for at-rest provider secrets (AES-256-GCM).
 *
 * STAGED / backward-compatible by design:
 *   - Writes stay PLAINTEXT until `SECRETS_ENC_KEY` is set — deploying this code
 *     changes nothing (`encryptSecret` is a pass-through with no key). Once the
 *     key is set, new writes encrypt and a one-shot backfill re-encrypts existing
 *     rows (`scripts/backfill-secret-encryption.ts`).
 *   - Reads are dual-mode: a legacy plaintext value (no `enc:v1:` prefix) is
 *     returned unchanged, an encrypted value is decrypted. So a mixed table
 *     (some encrypted, some not) reads correctly at any point in the rollout.
 *
 * The two functions are generic string-in/string-out and preserve
 * null vs undefined vs "" exactly — the tenant mapper distinguishes them.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

/**
 * Module-level key cache. The raw env var is read once at first call and the
 * derived 32-byte SHA-256 key is stored. Subsequent calls return the cached
 * buffer instead of re-hashing on every encrypt/decrypt (rowToTenant calls
 * decryptSecret 4 times per row; loadTenants maps over all tenants).
 *
 * The cache is keyed on the raw passphrase so a hot-reload that changes
 * SECRETS_ENC_KEY (unusual but possible in some test harnesses) picks up the
 * new value rather than serving a stale derivation.
 */
let _cachedRaw: string | undefined;
let _cachedKey: Buffer | null = null;

/**
 * The AES-256 key derived from `SECRETS_ENC_KEY`, or null when unset/empty.
 * SHA-256 of the raw passphrase yields a 32-byte key from any-length input.
 * Memoized at the module level so derivation runs at most once per process.
 */
function getKey(): Buffer | null {
  const raw = process.env.SECRETS_ENC_KEY;
  if (!raw) {
    _cachedRaw = undefined;
    _cachedKey = null;
    return null;
  }
  if (raw !== _cachedRaw) {
    _cachedRaw = raw;
    _cachedKey = createHash("sha256").update(raw).digest();
  }
  return _cachedKey;
}

export function encryptSecret(plaintext: string): string;
export function encryptSecret(plaintext: null): null;
export function encryptSecret(plaintext: undefined): undefined;
export function encryptSecret(plaintext: string | null | undefined): string | null | undefined;
export function encryptSecret(plaintext: string | null | undefined): string | null | undefined {
  // Preserve null / undefined / "" exactly (callers rely on the distinction).
  if (plaintext == null || plaintext === "") return plaintext;
  // Idempotent: never double-encrypt an already-enveloped value.
  if (plaintext.startsWith(PREFIX)) return plaintext;
  // INERT when no key set — staged rollout keeps writes plaintext until activated.
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(value: string): string;
export function decryptSecret(value: null): null;
export function decryptSecret(value: undefined): undefined;
export function decryptSecret(value: string | null | undefined): string | null | undefined;
export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "") return value;
  // Legacy plaintext (no prefix) passes through — this is the dual-read that makes
  // the layer backward compatible during and after backfill.
  if (!value.startsWith(PREFIX)) return value;
  // A prefixed value can only have been written with a key; missing key = misconfig.
  const key = getKey();
  if (!key) throw new Error("SECRETS_ENC_KEY is not set but an encrypted secret was read");

  const body = value.slice(PREFIX.length);
  const [ivB64, tagB64, ctB64] = body.split(":"); // base64 has no ":", so split is safe
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
