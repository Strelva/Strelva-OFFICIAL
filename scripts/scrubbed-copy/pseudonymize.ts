/**
 * Deterministic pseudonymization for the scrubbed production copy.
 *
 * Every replacement is an HMAC-SHA256 of the normalized original under a local
 * salt, so the same input always maps to the same output (joins and dedupe keep
 * working) while the original cannot be read back from the copy. Replacements
 * keep the properties the conversion planner checks: a valid email stays a
 * valid lowercase email, a phone keeps its digit count and `phoneKey` identity,
 * and an invalid value stays invalid.
 *
 * Pure: no I/O. The salt is supplied by the caller (scripts/scrubbed-copy/run.ts).
 */
import { createHmac } from "node:crypto";

export const PSEUDO_EMAIL_DOMAIN = "scrubbed.strelva.test";
export const SECRET_PLACEHOLDER = "scrubbed-secret";
/** Loopback discard port: a request to it can never leave the machine. */
export const NEUTRAL_URL = "http://127.0.0.1:9/scrubbed";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\d)|\+\d{10,15}(?!\d)|(?<=tel:)[\d().\s-]{7,20}(?=[^\d]|$)/g;
const STRIPE_ID = /\b(cus|sub|si|price|prod|pi|in|ch|cs|evt|pm|seti|acct|txn|py|src|card|ba|po|tr|ii|il|plink|bps|promo|sched|subi|cn|dp|du|fee|ipi|mbur|pyr|link)_(?:test_|live_)?(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{14,}\b/g;

/** Credential shapes replaced wherever they appear, including inside text. */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bwhsec_[A-Za-z0-9+/=]{10,}/g,
  /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{6,}\b/g,
  /\bya29\.[A-Za-z0-9._-]{20,}/g,
  /\b1\/\/[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\benc:v1:[A-Za-z0-9+/=:]+/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\b(?:EAA|IGQ)[A-Za-z0-9_-]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /https:\/\/hooks\.slack\.com\/[^\s"'<>]+/g,
];
const URL_SECRET_PARAM = /([?&](?:token|access_token|refresh_token|key|api_key|apikey|secret|client_secret|signature|sig|code|password|auth)=)[^&#\s"'<>]+/gi;

const FIRST_NAMES = [
  "Avery", "Blake", "Casey", "Dana", "Ellis", "Finley", "Gray", "Harper", "Indy", "Jordan", "Kai", "Lane",
  "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Taylor", "Umber", "Vale", "Wren", "Xen",
  "Yael", "Zion", "Arden", "Brook", "Cameron", "Devon", "Emery", "Frankie", "Greer", "Hollis", "Jules", "Kendall",
  "Logan", "Marlo", "Nico", "Oren", "Peyton", "Riley", "Rowan", "Shay", "Tatum", "Toby", "Val", "West",
  "Remy", "Skyler", "Teagan", "Robin", "Phoenix", "Micah", "Lennon", "Jamie", "Hayden", "Eden", "Drew", "Charlie",
  "Bailey", "Alexis", "Rory", "Sasha",
];
const LAST_NAMES = [
  "Ashdown", "Birchfield", "Calder", "Dunmore", "Elmstead", "Fairlow", "Glenholm", "Hartwell", "Ivesdale", "Juniper",
  "Kestrel", "Larkspur", "Merriden", "Northcote", "Oakhurst", "Pemberly", "Quarry", "Redfern", "Stonebrook", "Thornby",
  "Underhill", "Vantage", "Westerly", "Yarrow", "Alderton", "Brackley", "Cobbett", "Dorley", "Everleigh", "Fenwick",
  "Galloway", "Holloway", "Inglewood", "Jessop", "Kirkland", "Lockwood", "Marlowe", "Netherby", "Orchard", "Penrose",
  "Rookwood", "Saltmarsh", "Tilbury", "Upton", "Verity", "Whitlock", "Ashby", "Brightwater", "Coldwell", "Draycott",
  "Easton", "Fernside", "Greystoke", "Hawthorne", "Ironside", "Kingsley", "Langford", "Millbrook", "Norwood", "Oldfield",
  "Prescott", "Radley", "Sherwood", "Thistle",
];
const LOREM = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore " +
  "magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo " +
  "consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint " +
  "occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum"
).split(" ");

const MAX_TEXT = 2000;

/** Same rule as the conversion planner's phoneKey (src/platform/business-record/contracts.ts). */
export function phoneDigitsKey(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return null;
}

export function isEmailLike(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Every original value the pseudonymizer replaced. Kept in memory only, for the leak check. */
export interface ReplacedOriginals {
  emails: Set<string>;
  phones: Set<string>;
  secrets: Set<string>;
}

export class Pseudonymizer {
  readonly originals: ReplacedOriginals = { emails: new Set(), phones: new Set(), secrets: new Set() };

  constructor(private readonly salt: string) {
    if (!/^[0-9a-f]{64}$/.test(salt)) throw new Error("The scrub salt must be 32 random bytes in hex.");
  }

  digest(kind: string, value: string): string {
    return createHmac("sha256", this.salt).update(`${kind}\u0000${value}`, "utf8").digest("hex");
  }

  private digits(kind: string, value: string, count: number): string {
    const hex = this.digest(kind, value) + this.digest(`${kind}:more`, value);
    let out = "";
    for (let index = 0; out.length < count; index += 1) out += String(parseInt(hex[index % hex.length]!, 16) % 10);
    return out;
  }

  /** A valid email maps to a valid lowercase pseudonym; anything else stays invalid. */
  email(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return value;
    if (normalized.endsWith(`@${PSEUDO_EMAIL_DOMAIN}`)) return normalized;
    if (!EMAIL_PATTERN.test(normalized)) return `invalid-${this.digest("email-invalid", normalized).slice(0, 10)}`;
    this.originals.emails.add(normalized);
    return `u${this.digest("email", normalized).slice(0, 16)}@${PSEUDO_EMAIL_DOMAIN}`;
  }

  /**
   * Keeps the digit count and the planner's phoneKey identity: two spellings of
   * one number map to one pseudonym. US numbers get area code 555, which is not
   * assigned; other lengths get the unassigned country code 999. Neither is
   * dialable. Invalid stays invalid; an already scrubbed number is unchanged.
   */
  phone(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const key = phoneDigitsKey(trimmed);
    if (!key) return "scrubbed-phone";
    if ((key.length === 11 && key.startsWith("1555")) || key.startsWith("999")) return trimmed;
    this.originals.phones.add(key);
    const digitCount = trimmed.replace(/[^0-9]/g, "").length;
    const tail = this.digits("phone", key, 15);
    if (digitCount === 10) return `555-${tail.slice(0, 3)}-${tail.slice(3, 7)}`;
    if (digitCount === 11 && key.startsWith("1")) return `+1 555-${tail.slice(0, 3)}-${tail.slice(3, 7)}`;
    return `+999${tail.slice(0, Math.max(4, digitCount - 3))}`;
  }

  name(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return value;
    const hex = this.digest("name", normalized);
    return `${FIRST_NAMES[parseInt(hex.slice(0, 2), 16) % FIRST_NAMES.length]} ${LAST_NAMES[parseInt(hex.slice(2, 4), 16) % LAST_NAMES.length]}`;
  }

  /** Deterministic filler of about the same length, so layouts and truncation behave alike. */
  text(value: string): string {
    if (!value.trim()) return value;
    const target = Math.min(Math.max(value.length, 3), MAX_TEXT);
    const hex = this.digest("text", value);
    const words: string[] = [];
    let length = 0;
    for (let index = 0; length < target; index += 1) {
      const word = LOREM[parseInt(hex.slice((index * 2) % 62, ((index * 2) % 62) + 2), 16) % LOREM.length]!;
      words.push(word);
      length += word.length + 1;
    }
    const sentence = words.join(" ").slice(0, target).trim();
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  /** Mixed or opaque identifiers that must stay joinable (Stripe ids, external user ids). */
  stripeId(value: string): string {
    return value.replace(STRIPE_ID, (match, prefix: string) => `${prefix}_scrubbed${this.digest("stripe", match).slice(0, 16)}`);
  }

  opaqueId(prefix: string, value: string): string {
    if (!value) return value;
    return `${prefix}_scrubbed${this.digest(`opaque:${prefix}`, value).slice(0, 16)}`;
  }

  secret(value: string): string {
    if (!value) return value;
    if (value !== SECRET_PLACEHOLDER && value.length >= 6) this.originals.secrets.add(value);
    return SECRET_PLACEHOLDER;
  }

  /** Month-day keeps its format; the year never existed in the source. */
  birthday(value: string): string {
    if (!/^\d{2}-\d{2}$/.test(value.trim())) return this.text(value);
    const day = parseInt(this.digest("birthday", value).slice(0, 4), 16);
    return `${String((day % 12) + 1).padStart(2, "0")}-${String((day % 28) + 1).padStart(2, "0")}`;
  }

  /**
   * Passes applied to every string in the copy, whatever its column or key:
   * credentials, Stripe ids, emails and formatted phone numbers.
   */
  scrubString(value: string): string {
    if (!value) return value;
    let out = value;
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern, (match) => this.secret(match));
    }
    out = out.replace(URL_SECRET_PARAM, (_match, prefix: string, offset: number, whole: string) => {
      const secretValue = whole.slice(offset + prefix.length).split(/[&#\s"'<>]/)[0] ?? "";
      if (secretValue && secretValue !== SECRET_PLACEHOLDER) this.secret(secretValue);
      return `${prefix}${SECRET_PLACEHOLDER}`;
    });
    out = this.stripeId(out);
    out = out.replace(EMAIL_IN_TEXT, (match) => this.email(match));
    out = out.replace(PHONE_IN_TEXT, (match) => {
      const leading = match.match(/^\s*/)?.[0] ?? "";
      const trailing = match.match(/\s*$/)?.[0] ?? "";
      const core = match.trim();
      return phoneDigitsKey(core) ? `${leading}${this.phone(core)}${trailing}` : match;
    });
    return out;
  }
}
