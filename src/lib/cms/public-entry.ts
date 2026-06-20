/**
 * The public (v1 contract) shape of a collection entry. snake_case Postgres row
 * -> camelCase wire shape, tenant_id dropped. Locked by the v1 contract tests.
 */
import type { Row } from "../db/client";

export interface PublicCollectionEntry {
  slug: string;
  type: string;
  status: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

export function toPublicEntry(row: Row<"collection_entries">): PublicCollectionEntry {
  return {
    slug: row.slug,
    type: row.type,
    status: row.status,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
