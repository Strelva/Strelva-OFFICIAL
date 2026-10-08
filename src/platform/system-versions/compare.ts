/**
 * Generic three-way compare for shareable System definitions.
 *
 * This is the inquiry pattern update rule (src/products/inquiries/
 * inquiry-pattern-updates.ts) lifted out of the inquiry domain: lists are one
 * value, a path both sides changed is a conflict, and nothing local is ever
 * overwritten without an explicit choice. The inquiry module now uses
 * `collectChangedPaths` from here, so both paths share one diff rule.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function objectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Append every leaf path that differs between two values. Arrays are compared
 * as whole values so an added or removed list item cannot leave a partial
 * merge behind. `ignorePaths` names exact paths carried elsewhere (for
 * example a version pin) that should never be merged as data.
 */
export function collectChangedPaths(
  before: unknown,
  after: unknown,
  path: string,
  output: string[],
  ignorePaths: ReadonlySet<string> = new Set(),
): void {
  if (jsonEqual(before, after)) return;
  if (Array.isArray(before) || Array.isArray(after)) {
    output.push(path);
    return;
  }
  if (ignorePaths.has(path)) return;
  if (objectLike(before) && objectLike(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      collectChangedPaths(before[key], after[key], path ? `${path}.${key}` : key, output, ignorePaths);
    }
    return;
  }
  output.push(path);
}

export function changedPaths(before: unknown, after: unknown, ignorePaths?: ReadonlySet<string>): string[] {
  const output: string[] = [];
  collectChangedPaths(before, after, "", output, ignorePaths);
  return output.filter(Boolean);
}

/** `undefined` means the path is absent. */
export function readPath(value: unknown, path: string): JsonValue | undefined {
  if (path === "*") return cloneJson(value as JsonValue);
  if (!path) return value as JsonValue;
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!objectLike(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return cloneJson(current as JsonValue);
}

export function writePath(target: JsonObject, path: string, value: JsonValue | undefined): void {
  if (path === "*") {
    if (!objectLike(value)) throw new Error("A restored definition must be an object.");
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, cloneJson(value));
    return;
  }
  const parts = path.split(".");
  let current: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!objectLike(next)) throw new Error(`The definition path ${path} cannot be written.`);
    current = next;
  }
  const last = parts.at(-1)!;
  if (value === undefined) delete current[last];
  else current[last] = cloneJson(value);
}

function overlaps(left: string, right: string): boolean {
  return left === "*" || right === "*" || left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

export type ThreeWayConflictReason =
  /** Both sides changed the same value. */
  | "overlapping_edit"
  /** One side replaced or removed the structure the other side changed. */
  | "incompatible_override";

export interface ThreeWayChange {
  path: string;
  base: JsonValue | undefined;
  upstream: JsonValue | undefined;
  local: JsonValue | undefined;
  action: "apply_upstream" | "keep_local" | "already_matching" | "conflict";
}

export interface ThreeWayConflict {
  /** The shallowest path covering both sides' changes. Choices act on this path. */
  path: string;
  reason: ThreeWayConflictReason;
  base: JsonValue | undefined;
  upstream: JsonValue | undefined;
  local: JsonValue | undefined;
}

export interface ThreeWayResult {
  upstreamPaths: string[];
  localPaths: string[];
  changes: ThreeWayChange[];
  conflicts: ThreeWayConflict[];
  /** Local plus every non-conflicting upstream change. Conflicts keep local. */
  merged: JsonObject;
}

export interface ThreeWayInput {
  base: JsonObject;
  upstream: JsonObject;
  local: JsonObject;
  ignorePaths?: ReadonlySet<string>;
  /**
   * The paths the customer actually edited (for example override paths).
   * When given, each one is a single unit of local change: an override that
   * replaced `form` as a whole conflicts with any upstream change inside
   * `form`, instead of being reduced to the leaves that happen to differ.
   * Adoption rebuilds local state from these paths, so detection must use
   * them too or preview and adoption disagree.
   */
  localEditPaths?: readonly string[];
}

export function threeWayCompare(input: ThreeWayInput): ThreeWayResult {
  const upstreamPaths = changedPaths(input.base, input.upstream, input.ignorePaths);
  const localPaths = input.localEditPaths
    ? [...new Set(input.localEditPaths)]
      .filter((path) => !jsonEqual(readPath(input.base, path), readPath(input.local, path)))
      .sort()
    : changedPaths(input.base, input.local, input.ignorePaths);
  const merged = cloneJson(input.local);
  const changes: ThreeWayChange[] = [];
  const conflicts = new Map<string, ThreeWayConflict>();

  for (const path of upstreamPaths) {
    const touching = localPaths.filter((localPath) => overlaps(path, localPath));
    const entry = {
      path,
      base: readPath(input.base, path),
      upstream: readPath(input.upstream, path),
      local: readPath(input.local, path),
    };
    if (touching.length === 0) {
      writePath(merged, path, entry.upstream);
      changes.push({ ...entry, action: "apply_upstream" });
      continue;
    }
    const conflictPath = touching.includes("*") ? "*" : [path, ...touching].sort((left, right) => left.length - right.length)[0]!;
    const upstreamAtConflict = readPath(input.upstream, conflictPath);
    const localAtConflict = readPath(input.local, conflictPath);
    if (jsonEqual(upstreamAtConflict, localAtConflict)) {
      changes.push({ ...entry, action: "already_matching" });
      continue;
    }
    changes.push({ ...entry, action: "conflict" });
    if (!conflicts.has(conflictPath)) {
      conflicts.set(conflictPath, {
        path: conflictPath,
        reason: touching.every((localPath) => localPath === path) ? "overlapping_edit" : "incompatible_override",
        base: readPath(input.base, conflictPath),
        upstream: upstreamAtConflict,
        local: localAtConflict,
      });
    }
  }

  for (const path of localPaths) {
    if (upstreamPaths.some((upstreamPath) => overlaps(path, upstreamPath))) continue;
    changes.push({
      path,
      base: readPath(input.base, path),
      upstream: readPath(input.upstream, path),
      local: readPath(input.local, path),
      action: "keep_local",
    });
  }

  return { upstreamPaths, localPaths, changes, conflicts: [...conflicts.values()], merged };
}

const SECRET_LIKE = /(?:-----BEGIN [^-]+ KEY-----|\b(?:sk|pk|ghp|xox[baprs])-[-_A-Za-z0-9]+|\b(?:api[_-]?key|secret|password|token|authorization)\s*[:=])/i;
const SENSITIVE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "accessToken",
  "apiKey",
  "bindings",
  "connections",
  "credentials",
  "customerRecords",
  "grant",
  "grants",
  "oauth",
  "password",
  "records",
  "refreshToken",
  "secret",
  "secrets",
  "token",
]);

/**
 * A shareable definition carries shape and rules only. Records, bindings,
 * grants and secrets belong to one business and are never part of lineage.
 */
export function assertShareableDefinition(value: unknown, path = "definition"): asserts value is JsonObject {
  if (!objectLike(value)) throw new Error(`The shareable ${path} must be an object.`);
  const visit = (node: unknown, at: string): void => {
    if (node === null || typeof node === "boolean") return;
    if (typeof node === "number") {
      if (!Number.isFinite(node)) throw new Error(`The shareable ${at} is invalid.`);
      return;
    }
    if (typeof node === "string") {
      if (SECRET_LIKE.test(node)) throw new Error(`The shareable ${at} contains secret data.`);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${at}.${index}`));
      return;
    }
    if (objectLike(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (SENSITIVE_KEYS.has(key)) throw new Error(`The shareable ${at} cannot include ${key}.`);
        visit(child, `${at}.${key}`);
      }
      return;
    }
    throw new Error(`The shareable ${at} is invalid.`);
  };
  visit(value, path);
}
