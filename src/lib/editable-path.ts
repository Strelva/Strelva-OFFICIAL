function parseEditablePathPart(part: string): { key: string; index?: string } {
  const match = part.match(/^([^\[]+)(?:\[([^\]]+)\])?$/);
  if (!match) return { key: part };
  return { key: match[1]!, index: match[2] };
}

function resolveEditableArrayIndex(array: unknown[], index: string | undefined): number {
  if (!index) return -1;
  if (index === "featured") {
    const found = array.findIndex(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>).featured === true
    );
    return found >= 0 ? found : 0;
  }
  const parsed = Number(index);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function getEditablePathValue(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = source;

  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    const { key, index } = parseEditablePathPart(part);
    const record = current as Record<string, unknown>;
    const value = record[key];

    if (index !== undefined) {
      if (!Array.isArray(value)) return undefined;
      current = value[resolveEditableArrayIndex(value, index)];
    } else {
      current = value;
    }
  }

  return current;
}

export function setEditablePathValue(
  source: Record<string, unknown>,
  path: string,
  value: string
): Record<string, unknown> {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return source;

  function apply(current: unknown, index: number): unknown {
    const { key, index: arrayIndex } = parseEditablePathPart(parts[index]!);
    const isLast = index === parts.length - 1;
    const nextObject =
      current && typeof current === "object" && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {};

    if (arrayIndex !== undefined) {
      const existing = nextObject[key];
      const array = Array.isArray(existing) ? [...existing] : [];
      const itemIndex = resolveEditableArrayIndex(array, arrayIndex);
      array[itemIndex] = isLast
        ? value
        : apply(array[itemIndex] ?? {}, index + 1);
      nextObject[key] = array;
      return nextObject;
    }

    nextObject[key] = isLast ? value : apply(nextObject[key] ?? {}, index + 1);
    return nextObject;
  }

  return apply(source, 0) as Record<string, unknown>;
}

export function formatEditablePathValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
