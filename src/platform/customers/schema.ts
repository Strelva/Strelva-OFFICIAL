import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Table = { Row: Row; Insert: Row; Update: Row; Relationships: [] };

/**
 * Local additive schema extension for IMP-05.  The generated database types
 * deliberately remain untouched until this migration is applied and the
 * intended target schema is verified.
 */
export type CustomerDatabase = {
  public: {
    Tables: {
      users: Table;
      workspaces: Table;
      workspace_memberships: Table;
      customer_relationships: Table;
      customer_resources: Table;
      customer_assignments: Table;
      customer_mapping_audit: Table;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type CustomerDb = SupabaseClient<CustomerDatabase>;
