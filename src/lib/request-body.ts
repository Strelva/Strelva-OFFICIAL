export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readOptionalJsonObject(
  request: Request
): Promise<Record<string, unknown> | null | undefined> {
  try {
    const raw = await request.text();
    if (!raw.trim()) return undefined;

    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readJsonArray(request: Request): Promise<unknown[] | null> {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) return null;
    return body;
  } catch {
    return null;
  }
}
