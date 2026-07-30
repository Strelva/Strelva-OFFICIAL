/**
 * Unit tests for at-rest envelope encryption (src/lib/crypto/secrets.ts).
 *
 * Tests are isolated via beforeEach/afterEach env-var manipulation so they
 * don't bleed into each other. The module is re-imported freshly per describe
 * block where the memoized key cache needs resetting.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set SECRETS_ENC_KEY for the duration of a test; restored in afterEach. */
function withKey(key: string | undefined, fn: () => void) {
  const original = process.env.SECRETS_ENC_KEY;
  beforeEach(() => {
    if (key === undefined) {
      delete process.env.SECRETS_ENC_KEY;
    } else {
      process.env.SECRETS_ENC_KEY = key;
    }
  });
  afterEach(() => {
    if (original === undefined) {
      delete process.env.SECRETS_ENC_KEY;
    } else {
      process.env.SECRETS_ENC_KEY = original;
    }
  });
  fn();
}

// ---------------------------------------------------------------------------
// Import under test (re-imported after env mutation via dynamic import in
// tests that need a fresh module; static import covers the bulk of cases).
// ---------------------------------------------------------------------------
import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";

const TEST_KEY = "test-passphrase-abc123";
const PREFIX = "enc:v1:";

// ---------------------------------------------------------------------------
// 1. Round-trip: encrypt → decrypt recovers the original plaintext
// ---------------------------------------------------------------------------
describe("round-trip with SECRETS_ENC_KEY set", () => {
  withKey(TEST_KEY, () => {
    it("decrypts to the original plaintext", () => {
      const plain = "ghp_secret_token_value";
      const cipher = encryptSecret(plain);
      expect(cipher).toMatch(new RegExp(`^${PREFIX}`));
      expect(decryptSecret(cipher)).toBe(plain);
    });

    it("handles values with special characters", () => {
      const plain = "https://hooks.slack.com/services/T00/B00/abc+/=xyz";
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    });

    it("produces a different ciphertext on each call (random IV)", () => {
      const plain = "same-value";
      const c1 = encryptSecret(plain);
      const c2 = encryptSecret(plain);
      // Same plaintext, different ciphertext (IVs differ)
      expect(c1).not.toBe(c2);
      // Both decrypt correctly
      expect(decryptSecret(c1)).toBe(plain);
      expect(decryptSecret(c2)).toBe(plain);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Keyless pass-through: no SECRETS_ENC_KEY → identity on both sides
// ---------------------------------------------------------------------------
describe("keyless pass-through (no SECRETS_ENC_KEY)", () => {
  withKey(undefined, () => {
    it("encryptSecret returns the plaintext unchanged", () => {
      const plain = "my-plaintext-webhook";
      expect(encryptSecret(plain)).toBe(plain);
    });

    it("decryptSecret returns a non-prefixed value unchanged", () => {
      const plain = "legacy-plaintext";
      expect(decryptSecret(plain)).toBe(plain);
    });

    it("decryptSecret throws when it encounters an enc:v1: value without a key", () => {
      // Simulate a value that was encrypted when the key existed
      const fakeEnvelope = `${PREFIX}aaaaaa:bbbbbb:cccccc`;
      expect(() => decryptSecret(fakeEnvelope)).toThrow("SECRETS_ENC_KEY is not set");
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Legacy plaintext pass-through: an unencrypted stored value still reads correctly
// ---------------------------------------------------------------------------
describe("legacy plaintext pass-through (key is set)", () => {
  withKey(TEST_KEY, () => {
    it("decryptSecret returns a legacy value (no prefix) unchanged", () => {
      const legacy = "old-plaintext-stored-before-backfill";
      expect(decryptSecret(legacy)).toBe(legacy);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Tampered ciphertext → decryptSecret throws (GCM auth-tag verification)
// ---------------------------------------------------------------------------
describe("tampered ciphertext rejection", () => {
  withKey(TEST_KEY, () => {
    it("throws when the auth tag is flipped", () => {
      const plain = "important-secret";
      const cipher = encryptSecret(plain);
      // cipher = "enc:v1:<iv_b64>:<tag_b64>:<ct_b64>"
      const body = cipher.slice(PREFIX.length);
      const parts = body.split(":");
      // Flip the first character of the tag (guaranteed meaningful; base64 padding
      // is at the END of a GCM auth tag's base64, so the first char is always
      // a real encoded byte — unlike the last char which may be '=' padding that
      // Node.js ignores on decode, leaving the tag bytes identical).
      const tag = parts[1];
      parts[1] = (tag.startsWith("A") ? "B" : "A") + tag.slice(1);
      const tampered = PREFIX + parts.join(":");
      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("throws when the ciphertext body is flipped", () => {
      const plain = "another-secret";
      const cipher = encryptSecret(plain);
      const body = cipher.slice(PREFIX.length);
      const parts = body.split(":");
      const ct = parts[2];
      parts[2] = ct.slice(0, -1) + (ct.endsWith("A") ? "B" : "A");
      const tampered = PREFIX + parts.join(":");
      expect(() => decryptSecret(tampered)).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Idempotency: already-encrypted value is not double-encrypted
// ---------------------------------------------------------------------------
describe("encryptSecret idempotency", () => {
  withKey(TEST_KEY, () => {
    it("does not re-encrypt an already-enveloped value", () => {
      const plain = "original-secret";
      const encrypted = encryptSecret(plain);
      expect(encrypted.startsWith(PREFIX)).toBe(true);
      // Re-encrypting must return the same envelope unchanged
      const reEncrypted = encryptSecret(encrypted);
      expect(reEncrypted).toBe(encrypted);
      // And it still decrypts to the original
      expect(decryptSecret(reEncrypted)).toBe(plain);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. null / undefined / empty preservation
// ---------------------------------------------------------------------------
describe("null / undefined / empty preservation", () => {
  withKey(TEST_KEY, () => {
    it("encryptSecret preserves null", () => {
      expect(encryptSecret(null)).toBeNull();
    });
    it("encryptSecret preserves undefined", () => {
      expect(encryptSecret(undefined)).toBeUndefined();
    });
    it('encryptSecret preserves empty string ""', () => {
      expect(encryptSecret("")).toBe("");
    });
    it("decryptSecret preserves null", () => {
      expect(decryptSecret(null)).toBeNull();
    });
    it("decryptSecret preserves undefined", () => {
      expect(decryptSecret(undefined)).toBeUndefined();
    });
    it('decryptSecret preserves empty string ""', () => {
      expect(decryptSecret("")).toBe("");
    });
  });
});
