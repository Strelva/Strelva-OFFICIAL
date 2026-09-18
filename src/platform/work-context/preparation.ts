/**
 * Safe context preparation runs only after a caller has acquired a source
 * through its native authority path. It is defense in depth for accidental
 * secret disclosure, not a substitute for membership, consent, source grants,
 * provider scopes, or model-provider data controls.
 */

export const SAFE_CONTEXT_LIMITS = Object.freeze({
  maxTitleCharacters: 160,
  maxFieldCharacters: 3_000,
  maxPayloadDepth: 10,
  maxPayloadEntries: 500,
});

export interface ContextSourceProvenance {
  workId: string;
  workspaceId: string;
  title: string;
  revision: string;
}

export interface PreparedContextSourceProvenance extends ContextSourceProvenance {
  title: string;
}

export interface PreparedContextEvidence {
  provenance: PreparedContextSourceProvenance;
  label: string;
  value: string;
  redacted: boolean;
}

export class ContextSourceIsolationError extends Error {
  readonly sourceWorkId: string;

  constructor(sourceWorkId: string) {
    super("The context source belongs to another workspace.");
    this.name = "ContextSourceIsolationError";
    this.sourceWorkId = sourceWorkId;
  }
}

const sensitiveNamePattern = /(?:api[\s_-]*key|access[\s_-]*key|client[\s_-]*secret|secret|password|passcode|token|credential|authorization|cookie|private[\s_-]*key|ssh[\s_-]*key|social[\s_-]*security|ssn|credit[\s_-]*card|card[\s_-]*number)/i;

const secretPatterns: ReadonlyArray<RegExp> = [
  /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/gi,
  /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|pk|ghp|github_pat|xox[baprs])[_-][a-z0-9_-]{8,}\b/gi,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
];

const namedSecretPattern = new RegExp(
  `((?:api[\\s_-]*key|access[\\s_-]*key|client[\\s_-]*secret|secret|password|passcode|token|credential|authorization|cookie|private[\\s_-]*key|ssh[\\s_-]*key|social[\\s_-]*security|ssn|credit[\\s_-]*card|card[\\s_-]*number)[\\s\"']*(?::|=|\\bis\\b)\\s*)(\"[^\"]*\"|'[^']*'|[^\\s,;\"'}]+)`,
  "gi",
);

function clip(value: string, maxCharacters: number): string {
  const clean = value.replace(/\u0000/g, "").trim();
  if (clean.length <= maxCharacters) return clean;
  const suffix = "… [truncated]";
  return `${clean.slice(0, Math.max(1, maxCharacters - suffix.length)).trimEnd()}${suffix}`.slice(0, maxCharacters);
}

export function isSensitiveContextFieldName(value: string): boolean {
  return sensitiveNamePattern.test(value);
}

export function prepareContextText(input: {
  value: string;
  maxCharacters?: number;
  fieldName?: string;
}): { value: string; redacted: boolean } {
  const maxCharacters = input.maxCharacters ?? SAFE_CONTEXT_LIMITS.maxFieldCharacters;
  if (input.fieldName && isSensitiveContextFieldName(input.fieldName)) {
    return { value: "[redacted]", redacted: true };
  }

  let value = input.value.replace(/\u0000/g, "");
  let redacted = false;
  for (const pattern of secretPatterns) {
    value = value.replace(pattern, () => {
      redacted = true;
      return "[redacted]";
    });
  }
  value = value.replace(namedSecretPattern, (_match, prefix: string) => {
    redacted = true;
    return `${prefix}[redacted]`;
  });
  return { value: clip(value, maxCharacters), redacted };
}

export function prepareContextProvenance(
  source: ContextSourceProvenance,
  expectedWorkspaceId: string,
): PreparedContextSourceProvenance {
  if (source.workspaceId !== expectedWorkspaceId) {
    throw new ContextSourceIsolationError(source.workId);
  }
  const preparedTitle = prepareContextText({
    value: source.title,
    maxCharacters: SAFE_CONTEXT_LIMITS.maxTitleCharacters,
  });
  return {
    ...source,
    title: preparedTitle.value || "Untitled work",
  };
}

export function prepareContextEvidence(input: {
  source: ContextSourceProvenance;
  expectedWorkspaceId: string;
  label: string;
  value: string;
  maxLabelCharacters: number;
  maxValueCharacters: number;
  fieldName?: string;
}): PreparedContextEvidence {
  const provenance = prepareContextProvenance(input.source, input.expectedWorkspaceId);
  const label = prepareContextText({ value: input.label, maxCharacters: input.maxLabelCharacters });
  const value = prepareContextText({
    value: input.value,
    maxCharacters: input.maxValueCharacters,
    fieldName: input.fieldName,
  });
  return {
    provenance,
    label: label.value,
    value: value.value,
    redacted: label.redacted || value.redacted,
  };
}

/**
 * Preserve the source payload's useful shape while removing likely secret
 * values. Limits keep an already-authorized source from becoming an unbounded
 * context transfer. Callers must not treat this heuristic projection as proof
 * that arbitrary input contains no sensitive data.
 */
export function prepareContextPayload(payload: unknown): unknown {
  let entries = 0;
  const seen = new WeakSet<object>();

  function visit(value: unknown, fieldName: string | undefined, depth: number): unknown {
    if (entries >= SAFE_CONTEXT_LIMITS.maxPayloadEntries) return "[context limit reached]";
    entries += 1;
    if (depth > SAFE_CONTEXT_LIMITS.maxPayloadDepth) return "[context depth limit reached]";
    if (typeof value === "string") {
      return prepareContextText({ value, fieldName }).value;
    }
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value !== "object") return String(value);
    if (seen.has(value)) return "[circular context value]";
    seen.add(value);
    if (Array.isArray(value)) {
      const remaining = Math.max(0, SAFE_CONTEXT_LIMITS.maxPayloadEntries - entries);
      const prepared = value.slice(0, remaining).map(item => visit(item, fieldName, depth + 1));
      if (value.length > prepared.length) prepared.push("[context limit reached]");
      return prepared;
    }

    const prepared: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (entries >= SAFE_CONTEXT_LIMITS.maxPayloadEntries) {
        prepared.__context_limit__ = "[context limit reached]";
        break;
      }
      if (isSensitiveContextFieldName(key)) {
        entries += 1;
        prepared[key] = "[redacted]";
      } else {
        prepared[key] = visit(item, key, depth + 1);
      }
    }
    return prepared;
  }

  return visit(payload, undefined, 0);
}

export function prepareContextFact(input: {
  key: string;
  value: string;
  excerpt: string;
}): { key: string; value: string; excerpt: string; redacted: boolean } {
  const value = prepareContextText({ value: input.value, fieldName: input.key });
  const excerpt = prepareContextText({ value: input.excerpt, fieldName: input.key });
  return {
    key: input.key,
    value: value.value || "[empty]",
    excerpt: excerpt.value || "[empty]",
    redacted: value.redacted || excerpt.redacted,
  };
}
