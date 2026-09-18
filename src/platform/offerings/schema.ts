import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Table = { Row: Row; Insert: Row; Update: Row; Relationships: [] };

export type OfferingDatabase = {
  public: {
    Tables: {
      users: Table;
      workspaces: Table;
      workspace_memberships: Table;
      offering_installations: Table;
      offering_website_bindings: Table;
    };
    Views: Record<string, never>;
    Functions: {
      read_offering_installations: {
        Args: {
          p_business_id: string;
          p_user_id: string;
          p_verified_email: string;
          p_installation_id: string | null;
        };
        Returns: Array<{ installation: Row | null; workspace_role: string }>;
      };
      read_offering_business_snapshot: {
        Args: { p_business_id: string; p_user_id: string; p_verified_email: string; p_installation_id: string | null };
        Returns: unknown;
      };
      bind_offering_website: {
        Args: { p_business_id: string; p_user_id: string; p_verified_email: string; p_tenant_id: string; p_idempotency_key: string; p_command_digest: string };
        Returns: Row[];
      };
      revoke_offering_website_binding: {
        Args: { p_business_id: string; p_binding_id: string; p_user_id: string; p_verified_email: string; p_expected_revision: number; p_reason: string };
        Returns: Row[];
      };
      install_offering: {
        Args: {
          p_business_id: string;
          p_user_id: string;
          p_verified_email: string;
          p_definition_id: string;
          p_definition_version: string;
          p_idempotency_key: string;
          p_command_digest: string;
          p_configuration: Record<string, unknown>;
          p_native_resources: unknown;
          p_responsibility: unknown;
          p_accepted_scope: string[];
          p_surface_ids: string[];
        };
        Returns: Row[];
      };
      prepare_staff_request_offering: {
        Args: {
          p_business_id: string;
          p_user_id: string;
          p_verified_email: string;
          p_idempotency_key: string;
          p_command_digest: string;
          p_configuration: Record<string, unknown>;
          p_responsibility: unknown;
          p_accepted_scope: string[];
          p_surface_ids: string[];
        };
        Returns: Row[];
      };
      activate_offering: {
        Args: {
          p_business_id: string;
          p_installation_id: string;
          p_user_id: string;
          p_verified_email: string;
          p_expected_revision: number;
        };
        Returns: Row[];
      };
      update_offering_configuration: {
        Args: {
          p_business_id: string;
          p_installation_id: string;
          p_user_id: string;
          p_verified_email: string;
          p_expected_revision: number;
          p_configuration: Record<string, unknown>;
        };
        Returns: Row[];
      };
      retire_offering: {
        Args: {
          p_business_id: string;
          p_installation_id: string;
          p_user_id: string;
          p_verified_email: string;
          p_expected_revision: number;
          p_reason: string;
        };
        Returns: Row[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type OfferingDb = SupabaseClient<OfferingDatabase>;
