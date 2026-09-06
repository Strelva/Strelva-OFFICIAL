import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Table = { Row: Row; Insert: Row; Update: Row; Relationships: [] };

/** Local schema extension until the live migration is applied and generated types regenerate. */
export type WorkspaceDatabase = {
  public: {
    Tables: {
      workspaces: Table;
      workspace_memberships: Table;
      saved_product_work: Table;
      workspace_delegations: Table;
      workspace_handoffs: Table;
    };
    Views: Record<string, never>;
    Functions: {
      create_owned_workspace: {
        Args: {
          p_user_id: string;
          p_verified_email: string;
          p_kind: string;
          p_name: string;
        };
        Returns: Row[];
      };
      accept_workspace_handoff: {
        Args: {
          p_token_hash: string;
          p_user_id: string;
          p_verified_email: string;
          p_allow_agency_access: boolean;
        };
        Returns: Array<{
          handoff_id: string;
          customer_workspace_id: string;
          customer_work_id: string;
          delegation_id: string | null;
          already_accepted: boolean;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type WorkspaceDb = SupabaseClient<WorkspaceDatabase>;
