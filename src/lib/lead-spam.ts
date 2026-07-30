/**
 * Content-based spam scoring for public lead intake.
 *
 * The public lead endpoints (`/api/access-request/intake`, `/api/v1/leads/[tenant]`)
 * are unauthenticated by necessity, and bots POST gibberish straight to the API —
 * bypassing any frontend honeypot/dwell gate. So we score the CONTENT itself. The
 * observed spam (2026-07) is extremely patterned:
 *   - location   = random mixed-case gibberish ("thKtblVkgDHpLWFGVtGd") — a real
 *                  location has a space/comma ("Buffalo, NY").
 *   - website    = throwaway random-consonant domain ("https://sgchqhi.com").
 *   - business   = unpronounceable string + " LLC" ("Zbdhgvucw LLC").
 *   - description= literally "Build request: {random}".
 *   - email      = gmail dot-obfuscation ("z.u.g.o.zu.r.o.yiv.26.9@gmail.com") to
 *                  defeat the email dedup.
 * Each signal is weak alone (to avoid false-positives on unusual-but-real names);
 * we DROP only when several stack up (score >= SPAM_THRESHOLD). Verified against
 * the 41 real spam records (all >= 4) and real leads (gldf/rohlax/etc. score 0).
 */

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/** A token "looks random" if it's a long run of letters with almost no vowels
 *  (Zbdhgvucw, sgchqhi) OR flip-flops case with no word boundary (thKtblVkgDH). */
export function looksRandomToken(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 7) return false;
  const letters = s.replace(/[^a-z]/gi, "");
  if (letters.length < 7) return false;

  // Vowel-starved consonant soup (random keyboard mash).
  const vowelCount = [...letters.toLowerCase()].filter((c) => VOWELS.has(c)).length;
  const vowelRatio = vowelCount / letters.length;
  if (vowelRatio < 0.26) return true;

  // Random internal case (not camelCase): 3+ lower->UPPER or UPPER->lower flips
  // inside a single space-free token. "thKtblVkgDHpLW" flips constantly; a real
  // "McDonald" or "iPhone" flips once or twice.
  if (!/\s/.test(s)) {
    let flips = 0;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (/[a-z]/.test(a) && /[A-Z]/.test(b)) flips++;
      else if (/[A-Z]/.test(a) && /[a-z]/.test(b)) flips++;
    }
    if (flips >= 3) return true;
  }
  return false;
}

/** Strip a common legal suffix so "Zbdhgvucw LLC" is judged on "Zbdhgvucw". */
function coreName(name: string): string {
  return name
    .replace(/\b(llc|l\.l\.c\.?|inc\.?|incorporated|ltd\.?|co\.?|corp\.?|company)\b/gi, "")
    .replace(/[.,]/g, "")
    .trim();
}

/** Host label before the public suffix, e.g. https://sgchqhi.com -> "sgchqhi". */
function siteLabel(site: string): string {
  let s = site.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  s = s.split(/[/?#]/)[0] ?? s;
  const parts = s.split(".");
  // If there's a TLD, take the label right before it; else the whole gibberish.
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[0]) ?? "";
}

/** Gmail (and googlemail) ignore dots; count them in the local part — bots
 *  re-dot the SAME address to defeat email dedup. 4+ dots is a strong tell. */
function gmailDotCount(email: string): number {
  const m = /^([^@]+)@(gmail|googlemail)\.com$/i.exec(email.trim());
  if (!m) return 0;
  return (m[1]!.match(/\./g) || []).length;
}

export interface LeadSpamInput {
  businessName?: string | null;
  description?: string | null;
  location?: string | null;
  currentWebsite?: string | null;
  email?: string | null;
}

export interface LeadSpamVerdict {
  score: number;
  isSpam: boolean;
  signals: string[];
}

export const SPAM_THRESHOLD = 3;

export function scoreLeadSpam(input: LeadSpamInput): LeadSpamVerdict {
  const signals: string[] = [];
  let score = 0;

  const location = (input.location ?? "").trim();
  // Real locations carry a space or comma ("Buffalo, NY"); a long, boundary-less
  // random token here is the single strongest tell.
  if (location && !/[\s,]/.test(location) && looksRandomToken(location)) {
    score += 2;
    signals.push("gibberish-location");
  }

  const site = (input.currentWebsite ?? "").trim();
  if (site) {
    const label = siteLabel(site);
    if (looksRandomToken(label)) {
      score += 2;
      signals.push("random-website");
    } else if (!/\./.test(site) && looksRandomToken(site)) {
      // Not even a hostname — raw gibberish in the website field.
      score += 2;
      signals.push("nonurl-website");
    }
  }

  const business = coreName(input.businessName ?? "");
  if (business && looksRandomToken(business)) {
    score += 1;
    signals.push("gibberish-business");
  }

  const description = (input.description ?? "").trim();
  // The marketing form builds descriptions from need/industry and never emits
  // "Build request:"; a bot filling the raw intake contract does. Weight the
  // literal-template + random-payload combination, not the phrase alone.
  const buildReq = /^build request:\s*(.+)$/i.exec(description);
  if (buildReq && looksRandomToken(buildReq[1]!)) {
    score += 2;
    signals.push("templated-random-description");
  } else if (description && !/\s/.test(description) && looksRandomToken(description)) {
    score += 1;
    signals.push("gibberish-description");
  }

  const email = (input.email ?? "").trim();
  if (gmailDotCount(email) >= 4) {
    score += 1;
    signals.push("gmail-dot-obfuscation");
  }

  return { score, isSpam: score >= SPAM_THRESHOLD, signals };
}

/** Canonical form of an email for dedup: gmail/googlemail ignore dots and +tags,
 *  so "z.u.go1@gmail.com" and "zugo1+x@gmail.com" are one address. Everything
 *  else is just lowercased/trimmed. */
export function normalizeEmailForDedup(email: string): string {
  const e = email.trim().toLowerCase();
  const m = /^([^@]+)@(gmail|googlemail)\.com$/i.exec(e);
  if (!m) return e;
  const local = m[1]!.split("+")[0]!.replace(/\./g, "");
  return `${local}@gmail.com`;
}
