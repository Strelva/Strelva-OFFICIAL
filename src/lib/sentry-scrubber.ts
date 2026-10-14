import { isPrivateWorkspaceLocation } from "./workspace-privacy";

const REDACTED = "[Redacted]";
const REDACTED_TOKEN = "[token]";

const SECRET_ENV_NAME = /(?:SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|(?:^|_)KEY(?:_|$)|AUTHORIZATION|(?:DATABASE|POSTGRES|REDIS|KV)_|WEBHOOK_URL)/i;
const PUBLIC_KEY_NAME = /(?:^|_)(?:ANON|PUBLIC|PUBLISHABLE)_KEY(?:_|$)/i;

const SENSITIVE_HEADER_NAME = /^(?:cookie|set-cookie|authorization|proxy-authorization|www-authenticate|api-key|x-api-key|stripe-signature|x-[a-z0-9-]*(?:auth|token|secret|signature|key)[a-z0-9-]*)$/i;
const SENSITIVE_PROPERTY_NAME = /(?:authorization|cookie|(?:access|refresh|id)?token(?:hash|digest)?|secret|password|passwd|credential|api[_-]?key|private[_-]?key|signature|session[_-]?key)/i;

const PII_PROPERTY_NAME = /^(?:user|email|emailaddress|phone|phonenumber|ipaddress|remoteaddr|firstname|lastname|fullname|displayname|address|streetaddress|customername|businessname|contactname)$/i;

const TOKEN_ROUTE_PREFIXES = [
  ["b"],
  ["book-inquiry"],
  ["inquiry-booking"],
  ["try"],
  ["delivery"],
  ["workspace", "invitations", "accept"],
  ["api", "workspace-invitations", "accept"],
  ["api", "websites", "shared"],
] as const;

const TOKEN_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{5,}){2,4}\b/g,
  /\bya29\.[A-Za-z0-9_-]{10,}\b/gi,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/gi,
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/gi,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bwhsec_[A-Za-z0-9]{16,}\b/g,
  /\bre_[A-Za-z0-9]{16,}\b/g,
  /\b(?:IG[A-Z0-9_-]{20,}|EA[A-Z0-9]{20,})\b/g,
];

const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const EMBEDDED_URL = /[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+|\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/\[\]-]+)(?:\?[^\s"'<>]*)?(?:#[^\s"'<>]*)?/gi;

type MutableRecord = Record<string, unknown>;

/** Return runtime env values whose names identify them as credentials or signing secrets. */
export function readSentrySecretValues(environment: Record<string, string | undefined>): string[] {
  return [...new Set(Object.entries(environment)
    .filter(([name, value]) =>
      value && value.length >= 8 &&
      !name.startsWith("NEXT_PUBLIC_") &&
      !PUBLIC_KEY_NAME.test(name) &&
      SECRET_ENV_NAME.test(name),
    )
    .map(([, value]) => value as string))]
    .sort((left, right) => right.length - left.length);
}

/** Scrub an event in place so every Sentry event callback can use the same policy. */
export function scrubSentryEvent<T>(event: T, secretValues: readonly string[] = [], privatePage = false): T {
  const record = asRecord(event);
  if (record && (privatePage || isPrivateSentryLocation(asRecord(record.request)?.url) || isPrivateSentryLocation(record.transaction))) {
    scrubPrivateEvent(record);
  }
  scrubValue(event, secretValues, new WeakSet<object>());
  return event;
}

/** Scrub a breadcrumb in place before it can be attached to an event. */
export function scrubSentryBreadcrumb<T>(breadcrumb: T, secretValues: readonly string[] = [], privatePage = false): T {
  const record = asRecord(breadcrumb);
  if (record && (privatePage || Object.values(asRecord(record.data) ?? {}).some(isPrivateSentryLocation))) {
    scrubPrivateBreadcrumb(record);
  }
  scrubValue(breadcrumb, secretValues, new WeakSet<object>());
  return breadcrumb;
}

function scrubValue(value: unknown, secretValues: readonly string[], seen: WeakSet<object>, parentKey = ""): unknown {
  if (typeof value === "string") return scrubString(value, secretValues);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = scrubValue(value[index], secretValues, seen, parentKey);
    }
    return value;
  }

  const record = value as MutableRecord;
  for (const key of Object.keys(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const isHeader = parentKey.toLowerCase() === "headers";

    if ((isHeader && SENSITIVE_HEADER_NAME.test(key)) || normalizedKey === "cookies" ||
      ["query", "querystring", "httpquery", "urlquery", "fragment", "httpfragment", "urlfragment"].includes(normalizedKey)) {
      delete record[key];
      continue;
    }

    if (normalizedKey === "user") {
      delete record[key];
      continue;
    }

    if (SENSITIVE_PROPERTY_NAME.test(key) || PII_PROPERTY_NAME.test(normalizedKey)) {
      record[key] = REDACTED;
      continue;
    }

    record[key] = scrubValue(record[key], secretValues, seen, key);
  }
  return record;
}

function scrubString(value: string, secretValues: readonly string[]): string {
  let scrubbed = value;

  for (const secret of secretValues) {
    if (secret) scrubbed = scrubbed.replaceAll(secret, REDACTED);
  }

  scrubbed = scrubbed.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED);
  scrubbed = scrubbed.replace(/(?:\+?\d[\s().-]*){10,15}/g, (candidate) => candidate.replace(/\D/g, "").length >= 10 ? REDACTED : candidate);
  scrubbed = scrubbed.replace(BEARER_VALUE, `Bearer ${REDACTED}`);
  for (const pattern of TOKEN_PATTERNS) scrubbed = scrubbed.replace(pattern, REDACTED);
  scrubbed = scrubbed.replace(/\b[A-Za-z0-9_-]{32,}\b/g, (candidate) => isOpaqueToken(candidate) ? REDACTED : candidate);
  scrubbed = scrubbed.replace(EMBEDDED_URL, (candidate) => redactUrl(candidate));
  return scrubbed;
}

function isOpaqueToken(candidate: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(candidate)) return false;
  if (/^[a-f0-9]{32,}$/i.test(candidate)) return true;

  const characterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[_-]/].filter((pattern) => pattern.test(candidate)).length;
  return candidate.length >= 48 || characterClasses >= 3;
}

function redactUrl(value: string): string {
  const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  try {
    const parsed = new URL(value, "https://sentry.invalid");
    parsed.username = "";
    parsed.password = "";
    parsed.pathname = isPrivateSentryLocation(parsed.pathname)
      ? privateRoute(parsed.pathname)
      : redactTokenPath(parsed.pathname);
    parsed.search = "";
    parsed.hash = "";

    if (isAbsolute) return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    return parsed.pathname;
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function redactTokenPath(pathname: string): string {
  const segments = pathname.split("/");

  for (const prefix of TOKEN_ROUTE_PREFIXES) {
    for (let start = 0; start <= segments.length - prefix.length; start += 1) {
      if (!prefix.every((segment, offset) => (segments[start + offset] ?? "").toLowerCase() === segment)) continue;
      const tokenIndex = start + prefix.length;
      if (segments[tokenIndex] && segments[tokenIndex] !== REDACTED_TOKEN) segments[tokenIndex] = REDACTED_TOKEN;
    }
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment && segment !== REDACTED_TOKEN && looksLikeToken(segment)) segments[index] = REDACTED_TOKEN;
  }

  return segments.join("/");
}

function looksLikeToken(segment: string): boolean {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the encoded segment; generic token detection still applies.
  }
  return TOKEN_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(decoded);
  }) || isOpaqueToken(decoded);
}

// Private work sends diagnostics, never arbitrary business content. An allowlist
// also covers future SDK fields without silently admitting a new payload shape.
function asRecord(value: unknown): MutableRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MutableRecord : undefined;
}

function keep(record: MutableRecord, keys: readonly string[]): void {
  for (const key of Object.keys(record)) if (!keys.includes(key)) delete record[key];
}

function isPrivateSentryLocation(value: unknown): boolean {
  return isPrivateWorkspaceLocation(value) || typeof value === "string" &&
    /(?:^|\/)(?:api\/(?:workspace-[a-z-]+|agency(?:-[a-z-]+)?)|agency)(?:[/?#\s]|$)/i.test(value);
}

function privateRoute(value: string): string {
  // No hostname, business slug, resource id or token is needed to locate code.
  const match = value.match(/\/(?:api\/)?(?:workspace(?:-[a-z-]+)?|inquiry-workspace|business|agency(?:-[a-z-]+)?)(?=[/?#\s]|$)|\/preview\/strelva\/inquiries(?=[/?#\s]|$)/i);
  return match ? `${match[0]}/[private]` : "/[private]";
}

function scrubPrivateBreadcrumb(record: MutableRecord): void {
  keep(record, ["type", "category", "level", "timestamp"]);
}

function scrubPrivateEvent(record: MutableRecord): void {
  keep(record, ["event_id", "timestamp", "start_timestamp", "platform", "release", "environment", "level", "type", "request", "transaction", "exception", "breadcrumbs", "contexts", "spans"]);
  if (typeof record.transaction === "string") record.transaction = privateRoute(record.transaction);
  const request = asRecord(record.request);
  if (request) {
    keep(request, ["method", "url"]);
    if (typeof request.url === "string") request.url = privateRoute(request.url);
  }
  const exceptionRecord = asRecord(record.exception);
  if (exceptionRecord) keep(exceptionRecord, ["values"]);
  const values = exceptionRecord?.values;
  if (Array.isArray(values)) for (const exception of values) {
    const error = asRecord(exception);
    if (!error) continue;
    keep(error, ["type", "stacktrace"]);
    const stack = asRecord(error.stacktrace);
    if (stack) {
      keep(stack, ["frames"]);
      if (Array.isArray(stack.frames)) for (const frame of stack.frames) {
        const source = asRecord(frame);
        if (source) keep(source, ["filename", "abs_path", "function", "module", "lineno", "colno", "in_app"]);
      }
    }
  }
  const contexts = asRecord(record.contexts);
  if (contexts) {
    keep(contexts, ["trace"]);
    const trace = asRecord(contexts.trace);
    if (trace) keep(trace, ["trace_id", "span_id", "parent_span_id", "op", "status", "origin"]);
  }
  if (Array.isArray(record.breadcrumbs)) for (const breadcrumb of record.breadcrumbs) {
    const item = asRecord(breadcrumb);
    if (item) scrubPrivateBreadcrumb(item);
  }
  if (Array.isArray(record.spans)) for (const span of record.spans) {
    const item = asRecord(span);
    if (item) keep(item, ["trace_id", "span_id", "parent_span_id", "op", "status", "origin", "start_timestamp", "timestamp"]);
  }
}
