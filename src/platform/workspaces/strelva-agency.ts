import { z } from "zod";

/** One configured ordinary agency owns the legacy merchant and sales intake. */
export function strelvaAgencyWorkspaceId(): string | null {
  const parsed = z.string().uuid().safeParse(process.env.STRELVA_AGENCY_WORKSPACE_ID?.trim());
  return parsed.success ? parsed.data : null;
}
