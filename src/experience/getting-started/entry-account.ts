/** The signed-in person's name for the entry frame's top right; their email when no name is known. */
export function entryAccountName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): string | null {
  const meta = user?.user_metadata;
  const named = [meta?.full_name, meta?.name].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return named?.trim() || user?.email?.trim() || null;
}
