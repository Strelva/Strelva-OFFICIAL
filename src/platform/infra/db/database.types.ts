export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_memberships: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: number
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: number
          role: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: number
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          billing_email: string | null
          billing_sources: Json
          billing_type: string | null
          created_at: string
          created_via: string | null
          grandfathered_terms: string | null
          id: string
          monthly_cents: number | null
          name: string
          notes: string | null
          payer_kind: string
          payer_workspace_id: string | null
          payment_status: string | null
          payment_updated_at: string | null
          phone: string | null
          plan_key: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          status: string
          stripe_customer_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          billing_email?: string | null
          billing_sources?: Json
          billing_type?: string | null
          created_at?: string
          created_via?: string | null
          grandfathered_terms?: string | null
          id?: string
          monthly_cents?: number | null
          name: string
          notes?: string | null
          payer_kind?: string
          payer_workspace_id?: string | null
          payment_status?: string | null
          payment_updated_at?: string | null
          phone?: string | null
          plan_key?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          billing_email?: string | null
          billing_sources?: Json
          billing_type?: string | null
          created_at?: string
          created_via?: string | null
          grandfathered_terms?: string | null
          id?: string
          monthly_cents?: number | null
          name?: string
          notes?: string | null
          payer_kind?: string
          payer_workspace_id?: string | null
          payment_status?: string | null
          payment_updated_at?: string | null
          phone?: string | null
          plan_key?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payer_workspace_id_fkey"
            columns: ["payer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          actor: string | null
          changes: Json | null
          created_at: string
          event_status: string | null
          governance_reason: string | null
          id: string
          risk_level: string | null
          section: string | null
          snapshot: Json | null
          tenant_id: string
          tenant_stable_id: string | null
          text: string | null
          time: string
          type: string | null
        }
        Insert: {
          actor?: string | null
          changes?: Json | null
          created_at?: string
          event_status?: string | null
          governance_reason?: string | null
          id?: string
          risk_level?: string | null
          section?: string | null
          snapshot?: Json | null
          tenant_id: string
          tenant_stable_id?: string | null
          text?: string | null
          time: string
          type?: string | null
        }
        Update: {
          actor?: string | null
          changes?: Json | null
          created_at?: string
          event_status?: string | null
          governance_reason?: string | null
          id?: string
          risk_level?: string | null
          section?: string | null
          snapshot?: Json | null
          tenant_id?: string
          tenant_stable_id?: string | null
          text?: string | null
          time?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      agency_application_draft_grants: {
        Row: {
          agency_workspace_id: string
          application_work_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          installation_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agency_workspace_id: string
          application_work_id: string
          assignment_id: string
          business_workspace_id: string
          created_at?: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id?: string
          installation_id: string
          operator_user_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agency_workspace_id?: string
          application_work_id?: string
          assignment_id?: string
          business_workspace_id?: string
          created_at?: string
          delivery_id?: string
          expires_at?: string
          granted_by?: string
          id?: string
          installation_id?: string
          operator_user_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_application_draft_gran_installation_id_business_wor_fkey"
            columns: ["installation_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "offering_installations"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_application_work_id_fkey"
            columns: ["application_work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "offering_provider_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_application_draft_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_staff: {
        Row: {
          agency_workspace_id: string
          assigned_at: string
          assigned_by: string
          customer_workspace_id: string
          ended_at: string | null
          ended_by: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          agency_workspace_id: string
          assigned_at?: string
          assigned_by: string
          customer_workspace_id: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          agency_workspace_id?: string
          assigned_at?: string
          assigned_by?: string
          customer_workspace_id?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_staff_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_staff_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_staff_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_staff_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_managed_website_draft_grants: {
        Row: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at?: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id?: string
          managed_website_binding_id: string
          operator_user_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agency_workspace_id?: string
          assignment_id?: string
          business_workspace_id?: string
          created_at?: string
          delivery_id?: string
          expires_at?: string
          granted_by?: string
          id?: string
          managed_website_binding_id?: string
          operator_user_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_managed_website_draft_gr_managed_website_binding_id_fkey"
            columns: ["managed_website_binding_id"]
            isOneToOne: false
            referencedRelation: "offering_website_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "offering_provider_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_managed_website_draft_preparations: {
        Row: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          consumed_at: string | null
          created_at: string
          data: Json
          delivery_id: string
          expected_hash: string
          expected_revision: number
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revision_id: string | null
          section: string
          status: string
          tenant_id: string
        }
        Insert: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          consumed_at?: string | null
          created_at?: string
          data: Json
          delivery_id: string
          expected_hash: string
          expected_revision: number
          id?: string
          managed_website_binding_id: string
          operator_user_id: string
          revision_id?: string | null
          section: string
          status?: string
          tenant_id: string
        }
        Update: {
          agency_workspace_id?: string
          assignment_id?: string
          business_workspace_id?: string
          consumed_at?: string | null
          created_at?: string
          data?: Json
          delivery_id?: string
          expected_hash?: string
          expected_revision?: number
          id?: string
          managed_website_binding_id?: string
          operator_user_id?: string
          revision_id?: string | null
          section?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_managed_website_draft_pr_managed_website_binding_id_fkey"
            columns: ["managed_website_binding_id"]
            isOneToOne: false
            referencedRelation: "offering_website_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_prepara_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_preparati_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_preparations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_preparations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "offering_provider_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_preparations_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_preparations_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "agency_managed_website_draft_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_managed_website_draft_revisions: {
        Row: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          data: Json
          data_hash: string
          delivery_id: string
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revision: number
          section: string
          tenant_id: string
        }
        Insert: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at?: string
          data: Json
          data_hash: string
          delivery_id: string
          id?: string
          managed_website_binding_id: string
          operator_user_id: string
          revision: number
          section: string
          tenant_id: string
        }
        Update: {
          agency_workspace_id?: string
          assignment_id?: string
          business_workspace_id?: string
          created_at?: string
          data?: Json
          data_hash?: string
          delivery_id?: string
          id?: string
          managed_website_binding_id?: string
          operator_user_id?: string
          revision?: number
          section?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_managed_website_draft_re_managed_website_binding_id_fkey"
            columns: ["managed_website_binding_id"]
            isOneToOne: false
            referencedRelation: "offering_website_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_revisio_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_revisions_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_revisions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_revisions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "offering_provider_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_managed_website_draft_revisions_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_verifications: {
        Row: {
          agency_workspace_id: string
          effect: string
          evidence: Json
          id: string
          reason: string | null
          recorded_at: string
          sequence: number
          status: string
          verified_by: string
          verifier_is_agency_member: boolean
        }
        Insert: {
          agency_workspace_id: string
          effect: string
          evidence?: Json
          id?: string
          reason?: string | null
          recorded_at?: string
          sequence?: never
          status: string
          verified_by: string
          verifier_is_agency_member: boolean
        }
        Update: {
          agency_workspace_id?: string
          effect?: string
          evidence?: Json
          id?: string
          reason?: string | null
          recorded_at?: string
          sequence?: never
          status?: string
          verified_by?: string
          verifier_is_agency_member?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agency_verifications_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_candidate_versions: {
        Row: {
          created_at: string
          spec: Json
          version: number
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          spec: Json
          version: number
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          spec?: Json
          version?: number
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_candidate_versions_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      application_records: {
        Row: {
          created_at: string
          created_by: string | null
          edit_history: Json
          record_id: string
          record_revision: number
          record_source: string
          updated_at: string
          values: Json
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          edit_history?: Json
          record_id: string
          record_revision?: number
          record_source?: string
          updated_at?: string
          values: Json
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          edit_history?: Json
          record_id?: string
          record_revision?: number
          record_source?: string
          updated_at?: string
          values?: Json
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_records_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "application_states"
            referencedColumns: ["work_id", "workspace_id"]
          },
        ]
      }
      application_releases: {
        Row: {
          publication_source: string
          published_at: string | null
          published_by: string | null
          spec: Json
          version: number
          work_id: string
          workspace_id: string
        }
        Insert: {
          publication_source?: string
          published_at?: string | null
          published_by?: string | null
          spec: Json
          version: number
          work_id: string
          workspace_id: string
        }
        Update: {
          publication_source?: string
          published_at?: string | null
          published_by?: string | null
          spec?: Json
          version?: number
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_releases_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "application_states"
            referencedColumns: ["work_id", "workspace_id"]
          },
        ]
      }
      application_states: {
        Row: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          candidate_design_revision?: number
          candidate_rehearsal?: Json | null
          candidate_spec: Json
          candidate_spec_version?: number
          candidate_versions?: Json
          created_at?: string
          current_release_version?: number | null
          lifecycle_status?: string
          records_revision?: number
          updated_at?: string
          work_id: string
          workspace_id: string
        }
        Update: {
          candidate_design_revision?: number
          candidate_rehearsal?: Json | null
          candidate_spec?: Json
          candidate_spec_version?: number
          candidate_versions?: Json
          created_at?: string
          current_release_version?: number | null
          lifecycle_status?: string
          records_revision?: number
          updated_at?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_states_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_states_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "application_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      application_use_edits: {
        Row: {
          actor_id: string
          created_at: string
          expected_record_revision: number
          grant_id: string
          id: string
          idempotency_key: string
          input_digest: string
          new_record_revision: number
          record_id: string
          release_version: number
          work_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          expected_record_revision: number
          grant_id: string
          id?: string
          idempotency_key: string
          input_digest: string
          new_record_revision: number
          record_id: string
          release_version: number
          work_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          expected_record_revision?: number
          grant_id?: string
          id?: string
          idempotency_key?: string
          input_digest?: string
          new_record_revision?: number
          record_id?: string
          release_version?: number
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_use_edits_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_use_edits_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "application_use_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_use_edits_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      application_use_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          revoked_at: string | null
          revoked_by: string | null
          status: string
          views: string[]
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by: string
          id?: string
          purpose: string
          recipient_email: string
          record_edit_scope?: string
          record_read_scope?: string
          record_submit?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          views: string[]
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by?: string
          id?: string
          purpose?: string
          recipient_email?: string
          record_edit_scope?: string
          record_read_scope?: string
          record_submit?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          views?: string[]
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_use_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_use_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_use_grants_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      application_use_submissions: {
        Row: {
          actor_id: string
          created_at: string
          grant_id: string
          id: string
          idempotency_key: string
          input_digest: string
          record_id: string
          release_version: number
          work_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          grant_id: string
          id?: string
          idempotency_key: string
          input_digest: string
          record_id: string
          release_version: number
          work_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          grant_id?: string
          id?: string
          idempotency_key?: string
          input_digest?: string
          record_id?: string
          release_version?: number
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_use_submissions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_use_submissions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "application_use_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_use_submissions_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      ask_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          message_count: number
          system_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          message_count?: number
          system_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          message_count?: number
          system_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ask_messages: {
        Row: {
          actor_id: string
          asked_on_behalf: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          result: Json | null
          role: string
          seq: number
          workspace_id: string
        }
        Insert: {
          actor_id: string
          asked_on_behalf?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          result?: Json | null
          role: string
          seq: number
          workspace_id: string
        }
        Update: {
          actor_id?: string
          asked_on_behalf?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          result?: Json | null
          role?: string
          seq?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_messages_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_messages_conversation_id_workspace_id_fkey"
            columns: ["conversation_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "ask_conversations"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_is_super_admin: boolean
          actor_type: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string
          tenant_id: string
          tenant_stable_id: string | null
          time: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_is_super_admin?: boolean
          actor_type?: string | null
          actor_user_id?: string | null
          created_at?: string
          id: string
          metadata?: Json | null
          target_id?: string | null
          target_type: string
          tenant_id: string
          tenant_stable_id?: string | null
          time: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_is_super_admin?: boolean
          actor_type?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      authority_parity_calls: {
        Row: {
          name: string
          stmt: string
          tier: string
        }
        Insert: {
          name: string
          stmt: string
          tier: string
        }
        Update: {
          name?: string
          stmt?: string
          tier?: string
        }
        Relationships: []
      }
      auto_approval_streaks: {
        Row: {
          streak_count: number
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
        }
        Insert: {
          streak_count?: number
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Update: {
          streak_count?: number
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_approval_streaks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_approval_streaks_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          bookable_hours: Json | null
          bookable_overrides: Json | null
          buffer_minutes: number
          calendar_key: string
          default_length_minutes: number
          legacy_requires_payment: boolean
          max_advance_days: number
          max_per_day: number | null
          min_notice_minutes: number
          mode: string
          recorded_via: string
          revision: number
          tenant_stable_id: string | null
          timezone: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          bookable_hours?: Json | null
          bookable_overrides?: Json | null
          buffer_minutes?: number
          calendar_key: string
          default_length_minutes?: number
          legacy_requires_payment?: boolean
          max_advance_days?: number
          max_per_day?: number | null
          min_notice_minutes?: number
          mode?: string
          recorded_via: string
          revision?: number
          tenant_stable_id?: string | null
          timezone?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          bookable_hours?: Json | null
          bookable_overrides?: Json | null
          buffer_minutes?: number
          calendar_key?: string
          default_length_minutes?: number
          legacy_requires_payment?: boolean
          max_advance_days?: number
          max_per_day?: number | null
          min_notice_minutes?: number
          mode?: string
          recorded_via?: string
          revision?: number
          tenant_stable_id?: string | null
          timezone?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancelled_at: string | null
          client_email: string
          client_name: string
          client_phone: string
          created_at: string
          date: string
          end_time: string
          id: string
          notes: string | null
          service_id: string
          service_name: string
          start_time: string
          status: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          client_email: string
          client_name: string
          client_phone: string
          created_at?: string
          date: string
          end_time: string
          id: string
          notes?: string | null
          service_id: string
          service_name: string
          start_time: string
          status: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          notes?: string | null
          service_id?: string
          service_name?: string
          start_time?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      build_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_email: string | null
          lead_slug: string | null
          pay_slug: string | null
          session_id: string
          tenant_id: string | null
          tenant_stable_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          lead_slug?: string | null
          pay_slug?: string | null
          session_id: string
          tenant_id?: string | null
          tenant_stable_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          lead_slug?: string | null
          pay_slug?: string | null
          session_id?: string
          tenant_id?: string | null
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "build_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_payments_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      business_booking_history: {
        Row: {
          actor: string
          at: string
          booking_id: string
          from_status: string | null
          id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor: string
          at?: string
          booking_id: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor?: string
          at?: string
          booking_id?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "business_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      business_booking_messages: {
        Row: {
          booking_id: string
          claimed_at: string
          detail: string | null
          finished_at: string | null
          id: string
          kind: string
          provider_message_id: string | null
          status: string
        }
        Insert: {
          booking_id: string
          claimed_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          provider_message_id?: string | null
          status?: string
        }
        Update: {
          booking_id?: string
          claimed_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          provider_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "business_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      business_bookings: {
        Row: {
          block_end_at: string
          buffer_minutes: number
          business_service_id: string | null
          calendar_key: string
          cancelled_at: string | null
          contact_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          end_at: string
          external_ref: string | null
          external_source: string | null
          id: string
          inquiry_id: string | null
          intake_answers: Json
          legacy_id: string | null
          manage_token_hash: string | null
          origin: string
          public_reservation_id: string | null
          recorded_via: string
          request_fingerprint: string | null
          service_name_at_booking: string
          service_ref: string | null
          start_at: string
          status: string
          system_id: string | null
          tenant_slug_at_booking: string | null
          tenant_stable_id: string | null
          time_zone: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          block_end_at: string
          buffer_minutes?: number
          business_service_id?: string | null
          calendar_key: string
          cancelled_at?: string | null
          contact_id?: string | null
          created_at: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          end_at: string
          external_ref?: string | null
          external_source?: string | null
          id?: string
          inquiry_id?: string | null
          intake_answers?: Json
          legacy_id?: string | null
          manage_token_hash?: string | null
          origin: string
          public_reservation_id?: string | null
          recorded_via: string
          request_fingerprint?: string | null
          service_name_at_booking: string
          service_ref?: string | null
          start_at: string
          status: string
          system_id?: string | null
          tenant_slug_at_booking?: string | null
          tenant_stable_id?: string | null
          time_zone: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          block_end_at?: string
          buffer_minutes?: number
          business_service_id?: string | null
          calendar_key?: string
          cancelled_at?: string | null
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          end_at?: string
          external_ref?: string | null
          external_source?: string | null
          id?: string
          inquiry_id?: string | null
          intake_answers?: Json
          legacy_id?: string | null
          manage_token_hash?: string | null
          origin?: string
          public_reservation_id?: string | null
          recorded_via?: string
          request_fingerprint?: string | null
          service_name_at_booking?: string
          service_ref?: string | null
          start_at?: string
          status?: string
          system_id?: string | null
          tenant_slug_at_booking?: string | null
          tenant_stable_id?: string | null
          time_zone?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_bookings_business_service_id_fkey"
            columns: ["business_service_id"]
            isOneToOne: false
            referencedRelation: "business_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "business_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_bookings_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_contacts: {
        Row: {
          created_at: string
          email: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          name: string | null
          phone: string | null
          phone_key: string | null
          sources: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_seen_at: string
          id?: string
          last_seen_at: string
          name?: string | null
          phone?: string | null
          phone_key?: never
          sources: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          phone?: string | null
          phone_key?: never
          sources?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      business_effort_entries: {
        Row: {
          business_workspace_id: string
          category: string
          id: string
          minutes: number
          note: string | null
          occurred_on: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          business_workspace_id: string
          category: string
          id: string
          minutes: number
          note?: string | null
          occurred_on: string
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          business_workspace_id?: string
          category?: string
          id?: string
          minutes?: number
          note?: string | null
          occurred_on?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_effort_entries_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_effort_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_effort_voids: {
        Row: {
          entry_id: string
          reason: string
          voided_at: string
          voided_by: string
        }
        Insert: {
          entry_id: string
          reason: string
          voided_at?: string
          voided_by: string
        }
        Update: {
          entry_id?: string
          reason?: string
          voided_at?: string
          voided_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_effort_voids_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "business_effort_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_effort_voids_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_people: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role_title: string | null
          source: string
          updated_at: string
          updated_by: string
          user_id: string | null
          verified: boolean
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role_title?: string | null
          source: string
          updated_at?: string
          updated_by: string
          user_id?: string | null
          verified?: boolean
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role_title?: string | null
          source?: string
          updated_at?: string
          updated_by?: string
          user_id?: string | null
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_people_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_people_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_people_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      business_policies: {
        Row: {
          policy_key: string
          source: string
          updated_at: string
          updated_by: string
          value: Json
          verified: boolean
          workspace_id: string
        }
        Insert: {
          policy_key: string
          source: string
          updated_at: string
          updated_by: string
          value: Json
          verified: boolean
          workspace_id: string
        }
        Update: {
          policy_key?: string
          source?: string
          updated_at?: string
          updated_by?: string
          value?: Json
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_policies_workspace_id_policy_key_fkey"
            columns: ["workspace_id", "policy_key"]
            isOneToOne: true
            referencedRelation: "business_record_facts"
            referencedColumns: ["workspace_id", "fact_key"]
          },
        ]
      }
      business_record_facts: {
        Row: {
          fact_key: string
          source: string
          updated_at: string
          updated_by: string
          value: Json
          verified: boolean
          workspace_id: string
        }
        Insert: {
          fact_key: string
          source: string
          updated_at?: string
          updated_by: string
          value: Json
          verified?: boolean
          workspace_id: string
        }
        Update: {
          fact_key?: string
          source?: string
          updated_at?: string
          updated_by?: string
          value?: Json
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_record_facts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_record_facts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      business_record_revisions: {
        Row: {
          actor_id: string
          actor_kind: string
          changes: Json
          command_digest: string
          command_id: string
          created_at: string
          record_revision: number
          result: Json
          sequence: number
          source: string
          undo_of_sequence: number | null
          workspace_id: string
        }
        Insert: {
          actor_id: string
          actor_kind: string
          changes: Json
          command_digest: string
          command_id: string
          created_at?: string
          record_revision: number
          result: Json
          sequence: number
          source: string
          undo_of_sequence?: number | null
          workspace_id: string
        }
        Update: {
          actor_id?: string
          actor_kind?: string
          changes?: Json
          command_digest?: string
          command_id?: string
          created_at?: string
          record_revision?: number
          result?: Json
          sequence?: number
          source?: string
          undo_of_sequence?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_record_revisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_record_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "business_record_revisions_workspace_id_undo_of_sequence_fkey"
            columns: ["workspace_id", "undo_of_sequence"]
            isOneToOne: true
            referencedRelation: "business_record_revisions"
            referencedColumns: ["workspace_id", "sequence"]
          },
        ]
      }
      business_records: {
        Row: {
          created_at: string
          created_by: string
          last_sequence: number
          revision: number
          updated_at: string
          updated_by: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          last_sequence?: number
          revision?: number
          updated_at?: string
          updated_by: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          last_sequence?: number
          revision?: number
          updated_at?: string
          updated_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_services: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number | null
          external_ref: string | null
          id: string
          name: string
          position: number
          price_text: string | null
          source: string
          updated_at: string
          updated_by: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number | null
          external_ref?: string | null
          id?: string
          name: string
          position?: number
          price_text?: string | null
          source: string
          updated_at?: string
          updated_by: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number | null
          external_ref?: string | null
          id?: string
          name?: string
          position?: number
          price_text?: string | null
          source?: string
          updated_at?: string
          updated_by?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_services_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          role: string
          tenant_id: string
          tenant_stable_id: string | null
          thread_id: string
          tool_calls: Json | null
          tool_results: Json | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          tenant_stable_id?: string | null
          thread_id: string
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          thread_id?: string
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          client_id: string
          created_at: string
          messages: Json
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          messages?: Json
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          messages?: Json
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          tenant_stable_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          tenant_stable_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      collection_entries: {
        Row: {
          created_at: string
          data: Json
          id: string
          slug: string
          status: string
          tenant_id: string
          tenant_stable_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          slug: string
          status?: string
          tenant_id: string
          tenant_stable_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          slug?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_entries_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      connected_site_events: {
        Row: {
          business_workspace_id: string
          dedupe_key: string
          id: string
          kind: string
          occurred_at: string
          page_path: string | null
          received_at: string
          referrer_host: string | null
          session_id: string | null
          site_id: string
          target: string | null
        }
        Insert: {
          business_workspace_id: string
          dedupe_key: string
          id?: string
          kind: string
          occurred_at: string
          page_path?: string | null
          received_at?: string
          referrer_host?: string | null
          session_id?: string | null
          site_id: string
          target?: string | null
        }
        Update: {
          business_workspace_id?: string
          dedupe_key?: string
          id?: string
          kind?: string
          occurred_at?: string
          page_path?: string | null
          received_at?: string
          referrer_host?: string | null
          session_id?: string | null
          site_id?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connected_site_events_site_id_business_workspace_id_fkey"
            columns: ["site_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "connected_sites"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      connected_sites: {
        Row: {
          allowed_origins: string[]
          business_workspace_id: string
          capture_forms: boolean
          created_at: string
          created_by: string
          first_event_at: string | null
          id: string
          inject_schema: boolean
          label: string
          last_event_at: string | null
          platform: string
          public_key: string
          revoked_at: string | null
          site_host: string
          site_url: string
          status: string
          updated_at: string
          verification_token: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          allowed_origins: string[]
          business_workspace_id: string
          capture_forms?: boolean
          created_at?: string
          created_by: string
          first_event_at?: string | null
          id?: string
          inject_schema?: boolean
          label: string
          last_event_at?: string | null
          platform?: string
          public_key: string
          revoked_at?: string | null
          site_host: string
          site_url: string
          status?: string
          updated_at?: string
          verification_token: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          allowed_origins?: string[]
          business_workspace_id?: string
          capture_forms?: boolean
          created_at?: string
          created_by?: string
          first_event_at?: string | null
          id?: string
          inject_schema?: boolean
          label?: string
          last_event_at?: string | null
          platform?: string
          public_key?: string
          revoked_at?: string | null
          site_host?: string
          site_url?: string
          status?: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connected_sites_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_sites_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          data: Json
          section: string
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          data: Json
          section: string
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          data?: Json
          section?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      content_versions: {
        Row: {
          author: string
          changes: Json | null
          created_at: string
          data: Json
          id: string
          request_id: string | null
          section: string
          status: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          author: string
          changes?: Json | null
          created_at?: string
          data: Json
          id: string
          request_id?: string | null
          section: string
          status: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          author?: string
          changes?: Json | null
          created_at?: string
          data?: Json
          id?: string
          request_id?: string | null
          section?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      custom_application_artifacts: {
        Row: {
          application_version: number
          artifact_digest: string
          built_at: string
          created_at: string
          duration_ms: number
          html: string
          image: string
          limits: Json
          source_digest: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          application_version: number
          artifact_digest: string
          built_at: string
          created_at?: string
          duration_ms: number
          html: string
          image: string
          limits: Json
          source_digest: string
          work_id: string
          workspace_id: string
        }
        Update: {
          application_version?: number
          artifact_digest?: string
          built_at?: string
          created_at?: string
          duration_ms?: number
          html?: string
          image?: string
          limits?: Json
          source_digest?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_application_artifacts_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "custom_application_states"
            referencedColumns: ["work_id", "workspace_id"]
          },
        ]
      }
      custom_application_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          release_version: number
          revoked_at: string | null
          revoked_by: string | null
          status: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by: string
          id?: string
          purpose: string
          recipient_email: string
          release_version: number
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by?: string
          id?: string
          purpose?: string
          recipient_email?: string
          release_version?: number
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_application_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_grants_work_id_workspace_id_release_ver_fkey"
            columns: ["work_id", "workspace_id", "release_version"]
            isOneToOne: false
            referencedRelation: "custom_application_releases"
            referencedColumns: ["work_id", "workspace_id", "version"]
          },
        ]
      }
      custom_application_releases: {
        Row: {
          application_version: number
          artifact_digest: string
          published_at: string
          published_by: string
          version: number
          work_id: string
          workspace_id: string
        }
        Insert: {
          application_version: number
          artifact_digest: string
          published_at?: string
          published_by: string
          version: number
          work_id: string
          workspace_id: string
        }
        Update: {
          application_version?: number
          artifact_digest?: string
          published_at?: string
          published_by?: string
          version?: number
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_application_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_releases_work_id_workspace_id_applicati_fkey"
            columns: ["work_id", "workspace_id", "application_version"]
            isOneToOne: false
            referencedRelation: "custom_application_artifacts"
            referencedColumns: ["work_id", "workspace_id", "application_version"]
          },
        ]
      }
      custom_application_reviews: {
        Row: {
          application_version: number
          artifact_digest: string
          checks: Json
          reviewed_at: string
          reviewed_by: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          application_version: number
          artifact_digest: string
          checks: Json
          reviewed_at?: string
          reviewed_by: string
          work_id: string
          workspace_id: string
        }
        Update: {
          application_version?: number
          artifact_digest?: string
          checks?: Json
          reviewed_at?: string
          reviewed_by?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_application_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_reviews_work_id_workspace_id_applicatio_fkey"
            columns: ["work_id", "workspace_id", "application_version"]
            isOneToOne: false
            referencedRelation: "custom_application_artifacts"
            referencedColumns: ["work_id", "workspace_id", "application_version"]
          },
        ]
      }
      custom_application_states: {
        Row: {
          budget_estimate_cents: number | null
          budget_job_id: string | null
          budget_max_authorized_cents: number | null
          candidate_files: Json
          candidate_revision: number
          candidate_source_digest: string
          candidate_title: string
          candidate_version: number
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          maintenance_owner: string
          updated_at: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          budget_estimate_cents?: number | null
          budget_job_id?: string | null
          budget_max_authorized_cents?: number | null
          candidate_files: Json
          candidate_revision?: number
          candidate_source_digest: string
          candidate_title: string
          candidate_version?: number
          created_at?: string
          current_release_version?: number | null
          lifecycle_status?: string
          maintenance_owner: string
          updated_at?: string
          work_id: string
          workspace_id: string
        }
        Update: {
          budget_estimate_cents?: number | null
          budget_job_id?: string | null
          budget_max_authorized_cents?: number | null
          candidate_files?: Json
          candidate_revision?: number
          candidate_source_digest?: string
          candidate_title?: string
          candidate_version?: number
          created_at?: string
          current_release_version?: number | null
          lifecycle_status?: string
          maintenance_owner?: string
          updated_at?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_application_states_budget_job_id_fkey"
            columns: ["budget_job_id"]
            isOneToOne: false
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_states_maintenance_owner_fkey"
            columns: ["maintenance_owner"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_states_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_application_states_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      customer_assignments: {
        Row: {
          allowed_operations: string[]
          created_at: string
          customer_relationship_id: string
          customer_resource_id: string | null
          grant_source: string
          granted_by: string
          id: string
          organization_workspace_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          updated_by: string
          user_id: string
          version: number
        }
        Insert: {
          allowed_operations: string[]
          created_at?: string
          customer_relationship_id: string
          customer_resource_id?: string | null
          grant_source: string
          granted_by: string
          id?: string
          organization_workspace_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          user_id: string
          version?: number
        }
        Update: {
          allowed_operations?: string[]
          created_at?: string
          customer_relationship_id?: string
          customer_resource_id?: string | null
          grant_source?: string
          granted_by?: string
          id?: string
          organization_workspace_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_assignments_customer_relationship_id_organization_fkey"
            columns: ["customer_relationship_id", "organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "customer_relationships"
            referencedColumns: ["id", "organization_workspace_id"]
          },
          {
            foreignKeyName: "customer_assignments_customer_resource_id_customer_relatio_fkey"
            columns: ["customer_resource_id", "customer_relationship_id", "organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "customer_resources"
            referencedColumns: ["id", "customer_relationship_id", "organization_workspace_id"]
          },
          {
            foreignKeyName: "customer_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assignments_organization_workspace_id_user_id_fkey"
            columns: ["organization_workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["workspace_id", "user_id"]
          },
          {
            foreignKeyName: "customer_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_mapping_audit: {
        Row: {
          action: string
          actor_id: string | null
          evidence_reference: string | null
          id: string
          occurred_at: string
          organization_workspace_id: string
          provenance_source: string | null
          record_id: string
          record_type: string
          record_version: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          evidence_reference?: string | null
          id?: string
          occurred_at?: string
          organization_workspace_id: string
          provenance_source?: string | null
          record_id: string
          record_type: string
          record_version: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          evidence_reference?: string | null
          id?: string
          occurred_at?: string
          organization_workspace_id?: string
          provenance_source?: string | null
          record_id?: string
          record_type?: string
          record_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_mapping_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_mapping_audit_organization_workspace_id_fkey"
            columns: ["organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_relationships: {
        Row: {
          created_at: string
          customer_kind: string
          customer_workspace_id: string | null
          display_domain: string | null
          display_name: string
          evidence_reference: string | null
          id: string
          organization_workspace_id: string
          provenance_source: string
          recorded_by: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          customer_kind: string
          customer_workspace_id?: string | null
          display_domain?: string | null
          display_name: string
          evidence_reference?: string | null
          id?: string
          organization_workspace_id: string
          provenance_source: string
          recorded_by: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          customer_kind?: string
          customer_workspace_id?: string | null
          display_domain?: string | null
          display_name?: string
          evidence_reference?: string | null
          id?: string
          organization_workspace_id?: string
          provenance_source?: string
          recorded_by?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_relationships_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_relationships_organization_workspace_id_fkey"
            columns: ["organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_relationships_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_relationships_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_relationships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_resources: {
        Row: {
          created_at: string
          customer_relationship_id: string
          display_label: string | null
          evidence_reference: string | null
          id: string
          organization_workspace_id: string
          provenance_source: string
          recorded_by: string
          resource_kind: string
          resource_reference: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          customer_relationship_id: string
          display_label?: string | null
          evidence_reference?: string | null
          id?: string
          organization_workspace_id: string
          provenance_source: string
          recorded_by: string
          resource_kind: string
          resource_reference: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          customer_relationship_id?: string
          display_label?: string | null
          evidence_reference?: string | null
          id?: string
          organization_workspace_id?: string
          provenance_source?: string
          recorded_by?: string
          resource_kind?: string
          resource_reference?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_resources_customer_relationship_id_organization_w_fkey"
            columns: ["customer_relationship_id", "organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "customer_relationships"
            referencedColumns: ["id", "organization_workspace_id"]
          },
          {
            foreignKeyName: "customer_resources_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_resources_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_resources_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_policies: {
        Row: {
          change_kind: string
          layer: string
          route: string
          set_by: string
          set_reason: string
          system_key: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          change_kind: string
          layer: string
          route: string
          set_by: string
          set_reason: string
          system_key?: string
          updated_at?: string
          version: number
          workspace_id: string
        }
        Update: {
          change_kind?: string
          layer?: string
          route?: string
          set_by?: string
          set_reason?: string
          system_key?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_policies_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_policy_history: {
        Row: {
          change_kind: string
          created_at: string
          id: string
          layer: string
          new_route: string | null
          old_route: string | null
          set_by: string
          set_reason: string
          system_key: string
          version: number
          workspace_id: string
        }
        Insert: {
          change_kind: string
          created_at?: string
          id?: string
          layer: string
          new_route?: string | null
          old_route?: string | null
          set_by: string
          set_reason: string
          system_key: string
          version: number
          workspace_id: string
        }
        Update: {
          change_kind?: string
          created_at?: string
          id?: string
          layer?: string
          new_route?: string | null
          old_route?: string | null
          set_by?: string
          set_reason?: string
          system_key?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_policy_history_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_policy_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_policy_tenant_imports: {
        Row: {
          change_kind: string
          imported_at: string
          imported_by: string
          imported_via: string
          not_migrated: string | null
          tenant_stable_id: string
          today_value: string
          workspace_id: string
        }
        Insert: {
          change_kind: string
          imported_at?: string
          imported_by: string
          imported_via: string
          not_migrated?: string | null
          tenant_stable_id: string
          today_value: string
          workspace_id: string
        }
        Update: {
          change_kind?: string
          imported_at?: string
          imported_by?: string
          imported_via?: string
          not_migrated?: string | null
          tenant_stable_id?: string
          today_value?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_policy_tenant_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_policy_tenant_imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          action: string
          actor: string
          decided_at: string
          id: string
          proposal_id: string
        }
        Insert: {
          action: string
          actor: string
          decided_at?: string
          id?: string
          proposal_id: string
        }
        Update: {
          action?: string
          actor?: string
          decided_at?: string
          id?: string
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_leads: {
        Row: {
          business_name: string | null
          current_website: string | null
          delivery_status: string
          description: string | null
          email: string
          id: string
          location: string | null
          phone: string | null
          plan: string | null
          referred_by: string | null
          status_token: string | null
          status_updated_at: string
          submitted_at: string
        }
        Insert: {
          business_name?: string | null
          current_website?: string | null
          delivery_status?: string
          description?: string | null
          email: string
          id?: string
          location?: string | null
          phone?: string | null
          plan?: string | null
          referred_by?: string | null
          status_token?: string | null
          status_updated_at?: string
          submitted_at?: string
        }
        Update: {
          business_name?: string | null
          current_website?: string | null
          delivery_status?: string
          description?: string | null
          email?: string
          id?: string
          location?: string | null
          phone?: string | null
          plan?: string | null
          referred_by?: string | null
          status_token?: string | null
          status_updated_at?: string
          submitted_at?: string
        }
        Relationships: []
      }
      document_revisions: {
        Row: {
          created_at: string
          receipt: Json
          revision: number
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          receipt: Json
          revision: number
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          receipt?: Json
          revision?: number
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      domain_claims: {
        Row: {
          created_at: string
          dns_status: string | null
          domain: string
          error: string | null
          registration_attempt: string | null
          role: string
          ssl_status: string | null
          status: string
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
          vercel_project_id: string | null
          verification: string[] | null
        }
        Insert: {
          created_at?: string
          dns_status?: string | null
          domain: string
          error?: string | null
          registration_attempt?: string | null
          role: string
          ssl_status?: string | null
          status: string
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
          vercel_project_id?: string | null
          verification?: string[] | null
        }
        Update: {
          created_at?: string
          dns_status?: string | null
          domain?: string
          error?: string | null
          registration_attempt?: string | null
          role?: string
          ssl_status?: string | null
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
          vercel_project_id?: string | null
          verification?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_claims_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      draft_content: {
        Row: {
          created_at: string
          data: Json
          section: string
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          section: string
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          section?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_content_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_content_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      draft_page_config: {
        Row: {
          created_at: string
          page_name: string
          sections: Json
          seo: Json | null
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          page_name: string
          sections: Json
          seo?: Json | null
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          page_name?: string
          sections?: Json
          seo?: Json | null
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_page_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_page_config_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      execution_attempts: {
        Row: {
          attempt_no: number
          finished_at: string | null
          id: string
          idempotency_key: string | null
          proposal_id: string
          provider_receipt: Json | null
          started_at: string
          status: string
        }
        Insert: {
          attempt_no?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          proposal_id: string
          provider_receipt?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          attempt_no?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          proposal_id?: string
          provider_receipt?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_attempts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      google_listing_receipts: {
        Row: {
          action: string
          after_state: Json | null
          authority: Json
          before_state: Json | null
          binding_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          location_id: string
          provider_ref: string | null
          readback: string | null
          status: string
          target_ref: string | null
          undo: Json | null
          undoes_receipt_id: string | null
          undone_by_receipt_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action: string
          after_state?: Json | null
          authority: Json
          before_state?: Json | null
          binding_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          location_id: string
          provider_ref?: string | null
          readback?: string | null
          status?: string
          target_ref?: string | null
          undo?: Json | null
          undoes_receipt_id?: string | null
          undone_by_receipt_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action?: string
          after_state?: Json | null
          authority?: Json
          before_state?: Json | null
          binding_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          location_id?: string
          provider_ref?: string | null
          readback?: string | null
          status?: string
          target_ref?: string | null
          undo?: Json | null
          undoes_receipt_id?: string | null
          undone_by_receipt_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_listing_receipts_binding_id_workspace_id_fkey"
            columns: ["binding_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_account_bindings"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "google_listing_receipts_undoes_receipt_id_fkey"
            columns: ["undoes_receipt_id"]
            isOneToOne: false
            referencedRelation: "google_listing_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_listing_receipts_undone_by_receipt_id_fkey"
            columns: ["undone_by_receipt_id"]
            isOneToOne: false
            referencedRelation: "google_listing_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_listing_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          actions: Json | null
          created_at: string
          detail: string | null
          id: string
          read: boolean
          section: string | null
          tenant_id: string
          tenant_stable_id: string | null
          time: string
          title: string
          type: string
        }
        Insert: {
          actions?: Json | null
          created_at?: string
          detail?: string | null
          id: string
          read?: boolean
          section?: string | null
          tenant_id: string
          tenant_stable_id?: string | null
          time: string
          title: string
          type: string
        }
        Update: {
          actions?: Json | null
          created_at?: string
          detail?: string | null
          id?: string
          read?: boolean
          section?: string | null
          tenant_id?: string
          tenant_stable_id?: string | null
          time?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_items_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      inquiry_events: {
        Row: {
          actor: string
          actor_id: string | null
          at: string
          dedupe_key: string | null
          detail: Json
          id: string
          kind: string
          lead_id: string
          tenant_stable_id: string
          workspace_id: string | null
        }
        Insert: {
          actor: string
          actor_id?: string | null
          at?: string
          dedupe_key?: string | null
          detail?: Json
          id?: string
          kind: string
          lead_id: string
          tenant_stable_id: string
          workspace_id?: string | null
        }
        Update: {
          actor?: string
          actor_id?: string | null
          at?: string
          dedupe_key?: string | null
          detail?: Json
          id?: string
          kind?: string
          lead_id?: string
          tenant_stable_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_publication_claims: {
        Row: {
          acceptance_id: string | null
          accepted_at: string | null
          action: string
          actor_id: string | null
          business_id: string
          capability_id: string
          change_id: string
          claim_token_hash: string
          command_digest: string
          created_at: string
          failure_reason: string | null
          governance_event_id: string | null
          id: string
          idempotency_key: string
          provider_receipt: Json | null
          request_id: string
          status: string
          tenant_id: string
          tenant_stable_id: string
          updated_at: string
          version: number
        }
        Insert: {
          acceptance_id?: string | null
          accepted_at?: string | null
          action: string
          actor_id?: string | null
          business_id: string
          capability_id: string
          change_id: string
          claim_token_hash: string
          command_digest: string
          created_at?: string
          failure_reason?: string | null
          governance_event_id?: string | null
          id?: string
          idempotency_key: string
          provider_receipt?: Json | null
          request_id: string
          status?: string
          tenant_id: string
          tenant_stable_id?: string
          updated_at?: string
          version: number
        }
        Update: {
          acceptance_id?: string | null
          accepted_at?: string | null
          action?: string
          actor_id?: string | null
          business_id?: string
          capability_id?: string
          change_id?: string
          claim_token_hash?: string
          command_digest?: string
          created_at?: string
          failure_reason?: string | null
          governance_event_id?: string | null
          id?: string
          idempotency_key?: string
          provider_receipt?: Json | null
          request_id?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_publication_claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_publication_claims_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      inquiry_record_overlays: {
        Row: {
          assignee_id: string | null
          business_id: string
          capability_id: string
          created_at: string
          inquiry_id: string
          status: string
          tenant_id: string
          tenant_stable_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_id?: string | null
          business_id: string
          capability_id: string
          created_at?: string
          inquiry_id: string
          status: string
          tenant_id: string
          tenant_stable_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_id?: string | null
          business_id?: string
          capability_id?: string
          created_at?: string
          inquiry_id?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_record_overlays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_record_overlays_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      inquiry_workspaces: {
        Row: {
          business_id: string
          created_at: string
          id: string
          revision: number
          state: Json
          state_version: number
          tenant_id: string
          tenant_stable_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          revision?: number
          state: Json
          state_version?: number
          tenant_id: string
          tenant_stable_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          revision?: number
          state?: Json
          state_version?: number
          tenant_id?: string
          tenant_stable_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_workspaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_workspaces_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          api_key: string | null
          data: Json | null
          expires_at: string | null
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          scopes: Json | null
          status: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          access_token?: string | null
          api_key?: string | null
          data?: Json | null
          expires_at?: string | null
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          scopes?: Json | null
          status?: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          access_token?: string | null
          api_key?: string | null
          data?: Json | null
          expires_at?: string | null
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          scopes?: Json | null
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      internal_tool_notices: {
        Row: {
          attempts: number
          created_at: string
          created_by: string
          detail: string | null
          field_id: string
          id: string
          person_id: string | null
          provider_message_id: string | null
          recipient_email: string | null
          record_id: string
          status: string
          updated_at: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by: string
          detail?: string | null
          field_id: string
          id?: string
          person_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          record_id: string
          status?: string
          updated_at?: string
          work_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string
          detail?: string | null
          field_id?: string
          id?: string
          person_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          record_id?: string
          status?: string
          updated_at?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_tool_notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tool_notices_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "business_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tool_notices_work_id_record_id_fkey"
            columns: ["work_id", "record_id"]
            isOneToOne: true
            referencedRelation: "application_records"
            referencedColumns: ["work_id", "record_id"]
          },
          {
            foreignKeyName: "internal_tool_notices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          claimed_at: string | null
          email: string
          expires_at: string
          id: number
          invited_at: string
          invited_by: string | null
          role: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          email: string
          expires_at?: string
          id?: number
          invited_at?: string
          invited_by?: string | null
          role: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          email?: string
          expires_at?: string
          id?: number
          invited_at?: string
          invited_by?: string | null
          role?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      job_economics: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          actual_cents: number | null
          actual_known: boolean
          business_id: string | null
          capability_id: string | null
          created_at: string
          created_by: string
          currency: string
          estimate_cents: number | null
          id: string
          max_authorized_cents: number
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          product_id: string
          request_id: string | null
          reserved_cents: number
          resource_kind: string
          status: string
          strelva_retry_cents: number
          tenant_id: string | null
          updated_at: string
          used_cents: number
          work_id: string | null
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          actual_cents?: number | null
          actual_known?: boolean
          business_id?: string | null
          capability_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          estimate_cents?: number | null
          id?: string
          max_authorized_cents: number
          payer_id: string
          payer_kind?: string
          payer_workspace_id?: string | null
          product_id: string
          request_id?: string | null
          reserved_cents?: number
          resource_kind: string
          status?: string
          strelva_retry_cents?: number
          tenant_id?: string | null
          updated_at?: string
          used_cents?: number
          work_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          actual_cents?: number | null
          actual_known?: boolean
          business_id?: string | null
          capability_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          estimate_cents?: number | null
          id?: string
          max_authorized_cents?: number
          payer_id?: string
          payer_kind?: string
          payer_workspace_id?: string | null
          product_id?: string
          request_id?: string | null
          reserved_cents?: number
          resource_kind?: string
          status?: string
          strelva_retry_cents?: number
          tenant_id?: string | null
          updated_at?: string
          used_cents?: number
          work_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_economics_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_payer_workspace_id_fkey"
            columns: ["payer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "job_economics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_economics_executions: {
        Row: {
          amount_cents: number | null
          attribution: string
          billable_cents: number | null
          created_at: string
          created_by: string
          effect: string | null
          execution_key: string
          finished_at: string | null
          job_id: string
          kind: string
          maximum_cents: number
          reconciliation_reference: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          amount_cents?: number | null
          attribution: string
          billable_cents?: number | null
          created_at?: string
          created_by: string
          effect?: string | null
          execution_key: string
          finished_at?: string | null
          job_id: string
          kind: string
          maximum_cents: number
          reconciliation_reference?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number | null
          attribution?: string
          billable_cents?: number | null
          created_at?: string
          created_by?: string
          effect?: string | null
          execution_key?: string
          finished_at?: string | null
          job_id?: string
          kind?: string
          maximum_cents?: number
          reconciliation_reference?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_economics_executions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
        ]
      }
      job_economics_reservations: {
        Row: {
          amount_cents: number
          command_digest: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          job_id: string
        }
        Insert: {
          amount_cents: number
          command_digest: string
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          job_id: string
        }
        Update: {
          amount_cents?: number
          command_digest?: string
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_economics_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_reservations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
        ]
      }
      job_economics_usage: {
        Row: {
          amount_cents: number | null
          attribution: string
          command_digest: string
          created_at: string
          id: string
          idempotency_key: string
          job_id: string
          kind: string
          recorded_by: string
          source: string
        }
        Insert: {
          amount_cents?: number | null
          attribution: string
          command_digest: string
          created_at?: string
          id?: string
          idempotency_key: string
          job_id: string
          kind: string
          recorded_by: string
          source?: string
        }
        Update: {
          amount_cents?: number | null
          attribution?: string
          command_digest?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          job_id?: string
          kind?: string
          recorded_by?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_economics_usage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_economics_usage_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_log: {
        Row: {
          error: string | null
          id: string
          kind: string
          message_id: string | null
          ok: boolean
          recipient_email: string | null
          tenant_id: string
          tenant_stable_id: string | null
          ts: string
        }
        Insert: {
          error?: string | null
          id?: string
          kind: string
          message_id?: string | null
          ok: boolean
          recipient_email?: string | null
          tenant_id: string
          tenant_stable_id?: string | null
          ts?: string
        }
        Update: {
          error?: string | null
          id?: string
          kind?: string
          message_id?: string | null
          ok?: boolean
          recipient_email?: string | null
          tenant_id?: string
          tenant_stable_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_log_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      memberships: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: number
          role: string
          tenant_id: string
          tenant_stable_id: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: number
          role: string
          tenant_id: string
          tenant_stable_id?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: number
          role?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      model_call_log: {
        Row: {
          actor_kind: string
          attempt: number
          called_at: string
          cost_source: string
          cost_usd: number | null
          error_kind: string | null
          id: string
          input_tokens: number | null
          latency_ms: number
          model_label: string
          outcome: string
          output_tokens: number | null
          price_table_version: string | null
          purpose: string
          recorded_at: string
          step: number
          system_id: string | null
          tenant_slug_at_call: string | null
          tenant_stable_id: string | null
          workspace_id: string | null
        }
        Insert: {
          actor_kind: string
          attempt: number
          called_at: string
          cost_source: string
          cost_usd?: number | null
          error_kind?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms: number
          model_label: string
          outcome: string
          output_tokens?: number | null
          price_table_version?: string | null
          purpose: string
          recorded_at?: string
          step: number
          system_id?: string | null
          tenant_slug_at_call?: string | null
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor_kind?: string
          attempt?: number
          called_at?: string
          cost_source?: string
          cost_usd?: number | null
          error_kind?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number
          model_label?: string
          outcome?: string
          output_tokens?: number | null
          price_table_version?: string | null
          purpose?: string
          recorded_at?: string
          step?: number
          system_id?: string | null
          tenant_slug_at_call?: string | null
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_call_log_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "model_call_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          email: string
          name: string | null
          status: string
          subscribed_at: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          email: string
          name?: string | null
          status?: string
          subscribed_at?: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          email?: string
          name?: string | null
          status?: string
          subscribed_at?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_subscribers_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      offering_installations: {
        Row: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration: Json
          definition_id: string
          definition_version: string
          id: string
          idempotency_key: string
          installed_at: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          revision: number
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
        }
        Insert: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration?: Json
          definition_id: string
          definition_version: string
          id?: string
          idempotency_key: string
          installed_at?: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          revision?: number
          status?: string
          surface_ids: string[]
          updated_at?: string
          updated_by: string
        }
        Update: {
          accepted_scope?: string[]
          business_workspace_id?: string
          command_digest?: string
          configuration?: Json
          definition_id?: string
          definition_version?: string
          id?: string
          idempotency_key?: string
          installed_at?: string
          installed_by?: string
          native_resources?: Json
          responsibility?: Json
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          revision?: number
          status?: string
          surface_ids?: string[]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_installations_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_installations_installed_by_fkey"
            columns: ["installed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_installations_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_installations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_provider_deliveries: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at: string
          history: Json
          id?: string
          idempotency_key: string
          installation_id: string
          requested_at?: string
          requested_by: string
          revision?: number
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope: string[]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assignment_id?: string
          business_workspace_id?: string
          command_digest?: string
          customer_decision?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string
          history?: Json
          id?: string
          idempotency_key?: string
          installation_id?: string
          requested_at?: string
          requested_by?: string
          revision?: number
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_provider_deliveries_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_provider_deliveries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_provider_deliveries_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_provider_deliveries_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_provider_deliveries_installation_id_business_work_fkey"
            columns: ["installation_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "offering_installations"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "offering_provider_deliveries_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_provider_deliveries_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_website_bindings: {
        Row: {
          business_workspace_id: string
          command_digest: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          site_name_at_binding: string
          status: string
          tenant_id_at_binding: string
          tenant_stable_id: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          business_workspace_id: string
          command_digest: string
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          revision?: number
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          site_name_at_binding: string
          status?: string
          tenant_id_at_binding: string
          tenant_stable_id?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          business_workspace_id?: string
          command_digest?: string
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          revision?: number
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          site_name_at_binding?: string
          status?: string
          tenant_id_at_binding?: string
          tenant_stable_id?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_website_bindings_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_website_bindings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_website_bindings_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_website_bindings_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "offering_website_bindings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_revisions: {
        Row: {
          created_at: string
          entry: Json
          revision: number
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          entry: Json
          revision: number
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          entry?: Json
          revision?: number
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_revisions_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      operational_assignments: {
        Row: {
          accepted_at: string | null
          active_actor_id: string | null
          active_attempt: number | null
          active_lease_id: string | null
          active_started_at: string | null
          active_step_id: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id: string | null
          expires_at: string
          id: string
          offer_key: string
          offered_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          sponsor_email: string
          sponsor_id: string
          status: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          active_actor_id?: string | null
          active_attempt?: number | null
          active_lease_id?: string | null
          active_started_at?: string | null
          active_step_id?: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id?: string | null
          expires_at: string
          id?: string
          offer_key: string
          offered_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: Json
          sponsor_email: string
          sponsor_id: string
          status?: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          active_actor_id?: string | null
          active_attempt?: number | null
          active_lease_id?: string | null
          active_started_at?: string | null
          active_step_id?: string | null
          assignee_email?: string
          assignee_kind?: string
          assignee_user_id?: string
          assignee_workspace_id?: string | null
          expires_at?: string
          id?: string
          offer_key?: string
          offered_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: Json
          sponsor_email?: string
          sponsor_id?: string
          status?: string
          work_id?: string
          work_scope?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_assignments_active_actor_id_fkey"
            columns: ["active_actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_assignee_workspace_id_fkey"
            columns: ["assignee_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_queue_mark_events: {
        Row: {
          action: string
          actor_user_id: string
          command_id: string
          created_at: string
          id: string
          payload: Json
          source: string
          source_ref: string
        }
        Insert: {
          action: string
          actor_user_id: string
          command_id: string
          created_at?: string
          id?: string
          payload?: Json
          source: string
          source_ref: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          command_id?: string
          created_at?: string
          id?: string
          payload?: Json
          source?: string
          source_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_queue_mark_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_queue_marks: {
        Row: {
          assignee_user_id: string | null
          closed_at: string | null
          closed_reason: string | null
          closed_receipt_id: string | null
          closed_state: string | null
          owner_told_at: string | null
          owner_told_via: string | null
          pinned_until: string | null
          revision: number
          snooze_reason: string | null
          snoozed_until: string | null
          source: string
          source_ref: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          assignee_user_id?: string | null
          closed_at?: string | null
          closed_reason?: string | null
          closed_receipt_id?: string | null
          closed_state?: string | null
          owner_told_at?: string | null
          owner_told_via?: string | null
          pinned_until?: string | null
          revision?: number
          snooze_reason?: string | null
          snoozed_until?: string | null
          source: string
          source_ref: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          assignee_user_id?: string | null
          closed_at?: string | null
          closed_reason?: string | null
          closed_receipt_id?: string | null
          closed_state?: string | null
          owner_told_at?: string | null
          owner_told_via?: string | null
          pinned_until?: string | null
          revision?: number
          snooze_reason?: string | null
          snoozed_until?: string | null
          source?: string
          source_ref?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_queue_marks_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_queue_marks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      outcomes: {
        Row: {
          created_at: string
          detail: string | null
          execution_attempt_id: string
          id: string
          success: boolean
          verified: boolean | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          execution_attempt_id: string
          id?: string
          success: boolean
          verified?: boolean | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          execution_attempt_id?: string
          id?: string
          success?: boolean
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_execution_attempt_id_fkey"
            columns: ["execution_attempt_id"]
            isOneToOne: false
            referencedRelation: "execution_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      outside_write_receipts: {
        Row: {
          acceptance: string
          acceptance_detail: string | null
          accepted_at: string | null
          actor: string
          before_state: Json | null
          command_key: string
          created_at: string
          id: string
          provider: string
          provider_ref: string | null
          readback: string
          readback_at: string | null
          readback_detail: string | null
          request: Json
          subject: string
          system_id: string | null
          tenant_id: string | null
          tenant_stable_id: string | null
          undo: string
          undo_label: string
          workspace_id: string | null
          write_kind: string
        }
        Insert: {
          acceptance: string
          acceptance_detail?: string | null
          accepted_at?: string | null
          actor: string
          before_state?: Json | null
          command_key: string
          created_at?: string
          id?: string
          provider: string
          provider_ref?: string | null
          readback: string
          readback_at?: string | null
          readback_detail?: string | null
          request: Json
          subject: string
          system_id?: string | null
          tenant_id?: string | null
          tenant_stable_id?: string | null
          undo: string
          undo_label: string
          workspace_id?: string | null
          write_kind: string
        }
        Update: {
          acceptance?: string
          acceptance_detail?: string | null
          accepted_at?: string | null
          actor?: string
          before_state?: Json | null
          command_key?: string
          created_at?: string
          id?: string
          provider?: string
          provider_ref?: string | null
          readback?: string
          readback_at?: string | null
          readback_detail?: string | null
          request?: Json
          subject?: string
          system_id?: string | null
          tenant_id?: string | null
          tenant_stable_id?: string | null
          undo?: string
          undo_label?: string
          workspace_id?: string | null
          write_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "outside_write_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_decision_deliveries: {
        Row: {
          created_at: string
          decision_id: string
          id: string
          kind: string
          provider_message_id: string | null
          reason: string | null
          recipient: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          decision_id: string
          id?: string
          kind: string
          provider_message_id?: string | null
          reason?: string | null
          recipient?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          decision_id?: string
          id?: string
          kind?: string
          provider_message_id?: string | null
          reason?: string | null
          recipient?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_decision_deliveries_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_decision_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_decisions: {
        Row: {
          admin_may_decide: boolean
          approve_effect: string
          change_kind: string
          decided_at: string | null
          decided_by: string | null
          decided_by_kind: string | null
          delivery_state: string
          detail: string | null
          expires_at: string
          id: string
          not_yet_effect: string
          open_href: string | null
          opened_at: string
          opened_by: string | null
          operator_note: string | null
          outcome: string | null
          outcome_reason: string | null
          receipt_ref: string | null
          reminded_1_at: string | null
          reminded_2_at: string | null
          revision_hash: string
          route: string
          sign_in_required: boolean
          source_id: string
          source_lifecycle: string
          state: string
          system_id: string | null
          title: string
          updated_at: string
          urgent: boolean
          workspace_id: string
        }
        Insert: {
          admin_may_decide?: boolean
          approve_effect: string
          change_kind: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_kind?: string | null
          delivery_state?: string
          detail?: string | null
          expires_at: string
          id?: string
          not_yet_effect: string
          open_href?: string | null
          opened_at?: string
          opened_by?: string | null
          operator_note?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          receipt_ref?: string | null
          reminded_1_at?: string | null
          reminded_2_at?: string | null
          revision_hash: string
          route: string
          sign_in_required: boolean
          source_id: string
          source_lifecycle: string
          state?: string
          system_id?: string | null
          title: string
          updated_at?: string
          urgent?: boolean
          workspace_id: string
        }
        Update: {
          admin_may_decide?: boolean
          approve_effect?: string
          change_kind?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_kind?: string | null
          delivery_state?: string
          detail?: string | null
          expires_at?: string
          id?: string
          not_yet_effect?: string
          open_href?: string | null
          opened_at?: string
          opened_by?: string | null
          operator_note?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          receipt_ref?: string | null
          reminded_1_at?: string | null
          reminded_2_at?: string | null
          revision_hash?: string
          route?: string
          sign_in_required?: boolean
          source_id?: string
          source_lifecycle?: string
          state?: string
          system_id?: string | null
          title?: string
          updated_at?: string
          urgent?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_decisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      page_config: {
        Row: {
          page_name: string
          sections: Json
          seo: Json | null
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          page_name: string
          sections: Json
          seo?: Json | null
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          page_name?: string
          sections?: Json
          seo?: Json | null
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "page_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_config_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      pay_links: {
        Row: {
          amount_cents: number | null
          client_name: string
          created_at: string
          created_by: string | null
          custom_copy: string | null
          door: string
          lead_slug: string | null
          max_cents: number | null
          min_cents: number | null
          return_url: string | null
          slug: string
          tenant_id: string | null
          tenant_stable_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          client_name: string
          created_at?: string
          created_by?: string | null
          custom_copy?: string | null
          door: string
          lead_slug?: string | null
          max_cents?: number | null
          min_cents?: number | null
          return_url?: string | null
          slug: string
          tenant_id?: string | null
          tenant_stable_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          custom_copy?: string | null
          door?: string
          lead_slug?: string | null
          max_cents?: number | null
          min_cents?: number | null
          return_url?: string | null
          slug?: string
          tenant_id?: string | null
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pay_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_links_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      platform_workspaces: {
        Row: {
          role: string
          set_at: string
          set_by: string
          workspace_id: string
        }
        Insert: {
          role: string
          set_at?: string
          set_by: string
          workspace_id: string
        }
        Update: {
          role?: string
          set_at?: string
          set_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_workspaces_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_workspaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          body: string | null
          created_at: string
          entity_type: string
          id: string
          kind: string | null
          payload: Json | null
          source: string
          status: string
          tenant_id: string
          tenant_stable_id: string | null
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_type: string
          id: string
          kind?: string | null
          payload?: Json | null
          source: string
          status?: string
          tenant_id: string
          tenant_stable_id?: string | null
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          kind?: string | null
          payload?: Json | null
          source?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      provider_seats: {
        Row: {
          agency_workspace_id: string
          customer_workspace_id: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          granted_at: string
          granted_by: string
          granted_by_kind: string
          id: string
          status: string
        }
        Insert: {
          agency_workspace_id: string
          customer_workspace_id: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          granted_at?: string
          granted_by: string
          granted_by_kind: string
          id?: string
          status?: string
        }
        Update: {
          agency_workspace_id?: string
          customer_workspace_id?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          granted_at?: string
          granted_by?: string
          granted_by_kind?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_seats_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_seats_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_seats_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_seats_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      public_continuation_imports: {
        Row: {
          continuation_id: string
          created_at: string
          imported_by: string
          work_id: string | null
          workspace_id: string
        }
        Insert: {
          continuation_id: string
          created_at?: string
          imported_by: string
          work_id?: string | null
          workspace_id: string
        }
        Update: {
          continuation_id?: string
          created_at?: string
          imported_by?: string
          work_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_continuation_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_continuation_imports_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      public_website_booking_grants: {
        Row: {
          business_workspace_id: string
          capability_id: string
          capability_version: number
          created_at: string
          display_name: string
          id: string
          inquiry_capability_id: string
          inquiry_version: number
          provider: string
          published_at: string
          published_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_stable_id: string
          time_zone: string
          updated_at: string
          work_id: string
        }
        Insert: {
          business_workspace_id: string
          capability_id: string
          capability_version: number
          created_at?: string
          display_name: string
          id?: string
          inquiry_capability_id: string
          inquiry_version: number
          provider: string
          published_at?: string
          published_by: string
          revision?: number
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          tenant_stable_id: string
          time_zone: string
          updated_at?: string
          work_id: string
        }
        Update: {
          business_workspace_id?: string
          capability_id?: string
          capability_version?: number
          created_at?: string
          display_name?: string
          id?: string
          inquiry_capability_id?: string
          inquiry_version?: number
          provider?: string
          published_at?: string
          published_by?: string
          revision?: number
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          tenant_stable_id?: string
          time_zone?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_website_booking_grants_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_website_booking_grants_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_website_booking_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_website_booking_grants_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "public_website_booking_grants_work_id_business_workspace_i_fkey"
            columns: ["work_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      public_website_bookings: {
        Row: {
          booking_id: string | null
          business_workspace_id: string
          calendar_request_id: string
          capability_id: string
          capability_version: number
          created_at: string
          end_at: string
          expected_revision: number
          grant_id: string
          id: string
          inquiry_id: string
          management_token_ciphertext: string
          management_token_hash: string
          provider: string
          request_fingerprint: string | null
          request_id_hash: string
          slot_end_at: string | null
          slot_id: string | null
          slot_start_at: string | null
          start_at: string
          status: string
          tenant_id_at_reservation: string
          tenant_stable_id: string
          time_zone: string
          title: string
          updated_at: string
          work_id: string
        }
        Insert: {
          booking_id?: string | null
          business_workspace_id: string
          calendar_request_id: string
          capability_id: string
          capability_version: number
          created_at?: string
          end_at: string
          expected_revision: number
          grant_id: string
          id: string
          inquiry_id: string
          management_token_ciphertext: string
          management_token_hash: string
          provider: string
          request_fingerprint?: string | null
          request_id_hash: string
          slot_end_at?: string | null
          slot_id?: string | null
          slot_start_at?: string | null
          start_at: string
          status: string
          tenant_id_at_reservation: string
          tenant_stable_id: string
          time_zone: string
          title: string
          updated_at?: string
          work_id: string
        }
        Update: {
          booking_id?: string | null
          business_workspace_id?: string
          calendar_request_id?: string
          capability_id?: string
          capability_version?: number
          created_at?: string
          end_at?: string
          expected_revision?: number
          grant_id?: string
          id?: string
          inquiry_id?: string
          management_token_ciphertext?: string
          management_token_hash?: string
          provider?: string
          request_fingerprint?: string | null
          request_id_hash?: string
          slot_end_at?: string | null
          slot_id?: string | null
          slot_start_at?: string | null
          start_at?: string
          status?: string
          tenant_id_at_reservation?: string
          tenant_stable_id?: string
          time_zone?: string
          title?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_website_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "business_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_website_bookings_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_website_bookings_grant_id_business_workspace_id_fkey"
            columns: ["grant_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "public_website_booking_grants"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "public_website_bookings_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "public_website_booking_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_website_bookings_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "public_website_bookings_work_id_business_workspace_id_fkey"
            columns: ["work_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          captured_at: string
          metrics: Json
          period: string
          period_type: string
          schema_version: number
          tenant_id: string
        }
        Insert: {
          captured_at?: string
          metrics: Json
          period: string
          period_type?: string
          schema_version?: number
          tenant_id: string
        }
        Update: {
          captured_at?: string
          metrics?: Json
          period?: string
          period_type?: string
          schema_version?: number
          tenant_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author: string
          created_at: string
          external_id: string | null
          id: string
          rating: number | null
          replied_at: string | null
          reply: string | null
          review_date: string | null
          source: string
          tenant_id: string
          tenant_stable_id: string | null
          text: string
        }
        Insert: {
          author?: string
          created_at?: string
          external_id?: string | null
          id?: string
          rating?: number | null
          replied_at?: string | null
          reply?: string | null
          review_date?: string | null
          source: string
          tenant_id: string
          tenant_stable_id?: string | null
          text?: string
        }
        Update: {
          author?: string
          created_at?: string
          external_id?: string | null
          id?: string
          rating?: number | null
          replied_at?: string | null
          reply?: string | null
          review_date?: string | null
          source?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      reward_members: {
        Row: {
          badges: Json | null
          birthday: string | null
          created_at: string
          display_name: string | null
          email: string
          favorite_fruit: string | null
          stars_available: number
          stars_lifetime: number
          subscription_bonus_claimed: boolean
          tenant_id: string
          tenant_stable_id: string | null
          tier: string | null
          tier_override: string | null
        }
        Insert: {
          badges?: Json | null
          birthday?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          favorite_fruit?: string | null
          stars_available?: number
          stars_lifetime?: number
          subscription_bonus_claimed?: boolean
          tenant_id: string
          tenant_stable_id?: string | null
          tier?: string | null
          tier_override?: string | null
        }
        Update: {
          badges?: Json | null
          birthday?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          favorite_fruit?: string | null
          stars_available?: number
          stars_lifetime?: number
          subscription_bonus_claimed?: boolean
          tenant_id?: string
          tenant_stable_id?: string | null
          tier?: string | null
          tier_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_members_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      reward_transactions: {
        Row: {
          amount: number
          created_at: string
          email: string
          id: string
          reason: string | null
          tenant_id: string
          tenant_stable_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          email: string
          id?: string
          reason?: string | null
          tenant_id: string
          tenant_stable_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
          tenant_id?: string
          tenant_stable_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_transactions_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      saved_product_work: {
        Row: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          input?: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id?: string | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          input?: Json | null
          payload?: Json
          product_id?: string
          resource_kind?: string
          source_work_id?: string | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_product_work_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_product_work_source_work_id_fkey"
            columns: ["source_work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_product_work_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_history: {
        Row: {
          grade: string | null
          id: string
          overall_score: number | null
          scanned_at: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          grade?: string | null
          id?: string
          overall_score?: number | null
          scanned_at?: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          grade?: string | null
          id?: string
          overall_score?: number | null
          scanned_at?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_history_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      scan_results: {
        Row: {
          categories: Json | null
          grade: string | null
          id: string
          overall_score: number | null
          scanned_at: string
          tenant_id: string
          tenant_stable_id: string | null
          url: string | null
        }
        Insert: {
          categories?: Json | null
          grade?: string | null
          id?: string
          overall_score?: number | null
          scanned_at?: string
          tenant_id: string
          tenant_stable_id?: string | null
          url?: string | null
        }
        Update: {
          categories?: Json | null
          grade?: string | null
          id?: string
          overall_score?: number | null
          scanned_at?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_results_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      search_console_data: {
        Row: {
          fetched_at: string
          queries: Json
          tenant_id: string
          tenant_stable_id: string | null
          total_clicks: number
          total_impressions: number
        }
        Insert: {
          fetched_at?: string
          queries: Json
          tenant_id: string
          tenant_stable_id?: string | null
          total_clicks?: number
          total_impressions?: number
        }
        Update: {
          fetched_at?: string
          queries?: Json
          tenant_id?: string
          tenant_stable_id?: string | null
          total_clicks?: number
          total_impressions?: number
        }
        Relationships: [
          {
            foreignKeyName: "search_console_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_console_data_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      service_request_commands: {
        Row: {
          business_workspace_id: string
          command_digest: string
          created_at: string
          idempotency_key: string
          request_id: string
        }
        Insert: {
          business_workspace_id: string
          command_digest: string
          created_at?: string
          idempotency_key: string
          request_id: string
        }
        Update: {
          business_workspace_id?: string
          command_digest?: string
          created_at?: string
          idempotency_key?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_commands_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_commands_request_id_business_workspace_id_fkey"
            columns: ["request_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      service_requests: {
        Row: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }
        Insert: {
          acceptance_note?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          business_workspace_id: string
          context?: Json
          created_at?: string
          created_by: string
          delivery_commitment?: Json | null
          delivery_id?: string | null
          history?: Json
          id?: string
          installation_id?: string | null
          outcome: string
          provider_acceptance?: string
          provider_agency_workspace_id?: string | null
          provider_kind: string
          request_text: string
          revision?: number
          scope: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          acceptance_note?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          business_workspace_id?: string
          context?: Json
          created_at?: string
          created_by?: string
          delivery_commitment?: Json | null
          delivery_id?: string | null
          history?: Json
          id?: string
          installation_id?: string | null
          outcome?: string
          provider_acceptance?: string
          provider_agency_workspace_id?: string | null
          provider_kind?: string
          request_text?: string
          revision?: number
          scope?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "offering_provider_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_installation_id_business_workspace_id_fkey"
            columns: ["installation_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "offering_installations"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "service_requests_provider_agency_workspace_id_fkey"
            columns: ["provider_agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      site_metrics: {
        Row: {
          count: number
          day: string
          metric: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          count?: number
          day: string
          metric: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          count?: number
          day?: string
          metric?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_metrics_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      site_snapshots: {
        Row: {
          actor_email: string | null
          actor_is_super_admin: boolean | null
          actor_type: string | null
          actor_user_id: string | null
          author: string
          created_at: string
          data: Json
          id: string
          label: string
          reason: string
          restored_at: string | null
          sections: string[]
          status: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_is_super_admin?: boolean | null
          actor_type?: string | null
          actor_user_id?: string | null
          author: string
          created_at?: string
          data: Json
          id: string
          label: string
          reason: string
          restored_at?: string | null
          sections: string[]
          status: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_is_super_admin?: boolean | null
          actor_type?: string | null
          actor_user_id?: string | null
          author?: string
          created_at?: string
          data?: Json
          id?: string
          label?: string
          reason?: string
          restored_at?: string | null
          sections?: string[]
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_snapshots_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_snapshots_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      social_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          platform: string
          published_at: string | null
          scheduled_for: string | null
          status: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id: string
          image_url?: string | null
          platform: string
          published_at?: string | null
          scheduled_for?: string | null
          status: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          platform?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      standing_responsibilities: {
        Row: {
          created_at: string
          id: string
          next_trigger_at: string | null
          owner_id: string
          payload: Json
          revision: number
          status: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          next_trigger_at?: string | null
          owner_id: string
          payload: Json
          revision: number
          status: string
          updated_at?: string
          version: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          next_trigger_at?: string | null
          owner_id?: string
          payload?: Json
          revision?: number
          status?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standing_responsibilities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_responsibilities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      standing_responsibility_jobs: {
        Row: {
          accepted_at: string
          cancelled_at: string | null
          created_at: string
          finite_work_id: string
          id: string
          policy_version: number
          standing_responsibility_id: string
          status: string
          trigger_key: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string
          cancelled_at?: string | null
          created_at?: string
          finite_work_id: string
          id?: string
          policy_version: number
          standing_responsibility_id: string
          status?: string
          trigger_key: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string
          cancelled_at?: string | null
          created_at?: string
          finite_work_id?: string
          id?: string
          policy_version?: number
          standing_responsibility_id?: string
          status?: string
          trigger_key?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standing_responsibility_jobs_finite_work_id_workspace_id_fkey"
            columns: ["finite_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "standing_responsibility_jobs_standing_responsibility_id_fkey"
            columns: ["standing_responsibility_id"]
            isOneToOne: false
            referencedRelation: "standing_responsibilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_responsibility_jobs_standing_responsibility_id_wo_fkey"
            columns: ["standing_responsibility_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "standing_responsibilities"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "standing_responsibility_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      standing_responsibility_receipts: {
        Row: {
          attempt: number
          created_at: string
          effect: string
          finished_at: string | null
          id: string
          reason: string | null
          result: Json | null
          run_id: string
          status: string
          step_id: string
        }
        Insert: {
          attempt: number
          created_at?: string
          effect: string
          finished_at?: string | null
          id?: string
          reason?: string | null
          result?: Json | null
          run_id: string
          status: string
          step_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          effect?: string
          finished_at?: string | null
          id?: string
          reason?: string | null
          result?: Json | null
          run_id?: string
          status?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standing_responsibility_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "standing_responsibility_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      standing_responsibility_runs: {
        Row: {
          attempt: number
          cancelled_at: string | null
          created_at: string
          finite_work_id: string
          id: string
          job_id: string
          last_error: string | null
          policy_version: number
          standing_responsibility_id: string
          status: string
          trigger_key: string
          updated_at: string
          wake_at: string | null
          workspace_id: string
        }
        Insert: {
          attempt?: number
          cancelled_at?: string | null
          created_at?: string
          finite_work_id: string
          id?: string
          job_id: string
          last_error?: string | null
          policy_version: number
          standing_responsibility_id: string
          status?: string
          trigger_key: string
          updated_at?: string
          wake_at?: string | null
          workspace_id: string
        }
        Update: {
          attempt?: number
          cancelled_at?: string | null
          created_at?: string
          finite_work_id?: string
          id?: string
          job_id?: string
          last_error?: string | null
          policy_version?: number
          standing_responsibility_id?: string
          status?: string
          trigger_key?: string
          updated_at?: string
          wake_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standing_responsibility_runs_finite_work_id_workspace_id_fkey"
            columns: ["finite_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "standing_responsibility_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "standing_responsibility_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_responsibility_runs_job_id_standing_responsibilit_fkey"
            columns: ["job_id", "standing_responsibility_id"]
            isOneToOne: false
            referencedRelation: "standing_responsibility_jobs"
            referencedColumns: ["id", "standing_responsibility_id"]
          },
          {
            foreignKeyName: "standing_responsibility_runs_standing_responsibility_id_fkey"
            columns: ["standing_responsibility_id"]
            isOneToOne: false
            referencedRelation: "standing_responsibilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_responsibility_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      strelva_agency_workspace: {
        Row: {
          designated_at: string
          designated_by: string
          singleton: boolean
          workspace_id: string
        }
        Insert: {
          designated_at?: string
          designated_by: string
          singleton?: boolean
          workspace_id: string
        }
        Update: {
          designated_at?: string
          designated_by?: string
          singleton?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strelva_agency_workspace_designated_by_fkey"
            columns: ["designated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strelva_agency_workspace_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      strelva_service_actions: {
        Row: {
          action: string
          actor_label: string
          created_at: string
          detail: string | null
          id: string
          on_behalf_role: string | null
          on_behalf_user_id: string | null
          provider_workspace_id: string | null
          purpose: string
          session_id: string | null
          subject: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_label?: string
          created_at?: string
          detail?: string | null
          id?: string
          on_behalf_role?: string | null
          on_behalf_user_id?: string | null
          provider_workspace_id?: string | null
          purpose: string
          session_id?: string | null
          subject?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_label?: string
          created_at?: string
          detail?: string | null
          id?: string
          on_behalf_role?: string | null
          on_behalf_user_id?: string | null
          provider_workspace_id?: string | null
          purpose?: string
          session_id?: string | null
          subject?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strelva_service_actions_on_behalf_user_id_fkey"
            columns: ["on_behalf_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strelva_service_actions_provider_workspace_id_fkey"
            columns: ["provider_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strelva_service_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strelva_service_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strelva_service_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          amount_cents: number | null
          created_at: string
          id: number
          stripe_item_id: string | null
          stripe_price_id: string | null
          subscription_id: string
          tenant_id: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          id?: number
          stripe_item_id?: string | null
          stripe_price_id?: string | null
          subscription_id: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          id?: number
          stripe_item_id?: string | null
          stripe_price_id?: string | null
          subscription_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string
          amount_cents: number | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          id: string
          plan: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          action: string
          created_at: string
          description: string
          id: string
          section: string | null
          status: string
          tenant_id: string
          tenant_stable_id: string | null
          title: string
          type: string
        }
        Insert: {
          action?: string
          created_at?: string
          description?: string
          id: string
          section?: string | null
          status?: string
          tenant_id: string
          tenant_stable_id?: string | null
          title: string
          type: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          id?: string
          section?: string | null
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      super_admins: {
        Row: {
          email: string
          granted_at: string
          granted_by: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          email: string
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          email?: string
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_connections: {
        Row: {
          business_workspace_id: string
          command_digest: string
          command_id: string
          contract_version: number
          created_at: string
          created_by: string
          id: string
          kind: string
          propagation: string
          purpose: string | null
          source_system_id: string
          state: string
          target_business_workspace_id: string | null
          target_key: string
          target_ref: string | null
          target_system_id: string | null
          target_type: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          business_workspace_id: string
          command_digest: string
          command_id: string
          contract_version?: number
          created_at?: string
          created_by: string
          id?: string
          kind: string
          propagation: string
          purpose?: string | null
          source_system_id: string
          state?: string
          target_business_workspace_id?: string | null
          target_key: string
          target_ref?: string | null
          target_system_id?: string | null
          target_type: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          business_workspace_id?: string
          command_digest?: string
          command_id?: string
          contract_version?: number
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          propagation?: string
          purpose?: string | null
          source_system_id?: string
          state?: string
          target_business_workspace_id?: string | null
          target_key?: string
          target_ref?: string | null
          target_system_id?: string | null
          target_type?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_connections_source_system_id_business_workspace_id_fkey"
            columns: ["source_system_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "system_connections_target_system_id_target_business_worksp_fkey"
            columns: ["target_system_id", "target_business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "system_connections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_outputs: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          command_digest: string
          command_id: string
          id: string
          issued_at: string
          issued_by: string
          kind: string
          revision_id: string
          revision_number: number
          snapshot_hash: string
          status: string
          system_id: string
          title: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_workspace_id: string
          command_digest: string
          command_id: string
          id?: string
          issued_at?: string
          issued_by: string
          kind: string
          revision_id: string
          revision_number: number
          snapshot_hash: string
          status?: string
          system_id: string
          title: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_workspace_id?: string
          command_digest?: string
          command_id?: string
          id?: string
          issued_at?: string
          issued_by?: string
          kind?: string
          revision_id?: string
          revision_number?: number
          snapshot_hash?: string
          status?: string
          system_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_outputs_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_outputs_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_outputs_revision_id_system_id_revision_number_fkey"
            columns: ["revision_id", "system_id", "revision_number"]
            isOneToOne: false
            referencedRelation: "system_revisions"
            referencedColumns: ["id", "system_id", "number"]
          },
          {
            foreignKeyName: "system_outputs_system_id_business_workspace_id_fkey"
            columns: ["system_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      system_possibilities: {
        Row: {
          activation_id: string | null
          body: Json
          business_workspace_id: string
          candidate_revision: number
          created_at: string
          created_by: string
          id: string
          last_activity_at: string
          revision: number
          source_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activation_id?: string | null
          body: Json
          business_workspace_id: string
          candidate_revision: number
          created_at?: string
          created_by: string
          id: string
          last_activity_at?: string
          revision: number
          source_ref?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          activation_id?: string | null
          body?: Json
          business_workspace_id?: string
          candidate_revision?: number
          created_at?: string
          created_by?: string
          id?: string
          last_activity_at?: string
          revision?: number
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_possibilities_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_possibilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_possibility_events: {
        Row: {
          actor_id: string
          at: string
          business_workspace_id: string
          created_at: string
          detail: string | null
          id: number
          kind: string
          possibility_id: string
          revision: number
        }
        Insert: {
          actor_id: string
          at: string
          business_workspace_id: string
          created_at?: string
          detail?: string | null
          id?: number
          kind: string
          possibility_id: string
          revision: number
        }
        Update: {
          actor_id?: string
          at?: string
          business_workspace_id?: string
          created_at?: string
          detail?: string | null
          id?: number
          kind?: string
          possibility_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_possibility_events_possibility_id_business_workspac_fkey"
            columns: ["possibility_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "system_possibilities"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      system_possibility_pins: {
        Row: {
          business_workspace_id: string
          possibility_id: string
          revision_id: string
          system_id: string
        }
        Insert: {
          business_workspace_id: string
          possibility_id: string
          revision_id: string
          system_id: string
        }
        Update: {
          business_workspace_id?: string
          possibility_id?: string
          revision_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_possibility_pins_possibility_id_business_workspace__fkey"
            columns: ["possibility_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "system_possibilities"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "system_possibility_pins_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "system_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_possibility_pins_system_id_business_workspace_id_fkey"
            columns: ["system_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      system_revision_contents: {
        Row: {
          business_workspace_id: string
          content: Json
          content_hash: string
          created_at: string
          created_by: string
        }
        Insert: {
          business_workspace_id: string
          content: Json
          content_hash: string
          created_at?: string
          created_by: string
        }
        Update: {
          business_workspace_id?: string
          content?: Json
          content_hash?: string
          created_at?: string
          created_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_revision_contents_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_revision_contents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_revisions: {
        Row: {
          business_workspace_id: string
          command_digest: string
          command_id: string
          created_at: string
          created_by: string
          id: string
          implementation: Json
          number: number
          summary: string | null
          system_id: string
        }
        Insert: {
          business_workspace_id: string
          command_digest: string
          command_id: string
          created_at?: string
          created_by: string
          id?: string
          implementation: Json
          number: number
          summary?: string | null
          system_id: string
        }
        Update: {
          business_workspace_id?: string
          command_digest?: string
          command_id?: string
          created_at?: string
          created_by?: string
          id?: string
          implementation?: Json
          number?: number
          summary?: string | null
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_revisions_system_id_business_workspace_id_fkey"
            columns: ["system_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      system_version_bindings: {
        Row: {
          bound_at: string
          bound_by: string
          connection_ref: string
          id: string
          kind: string
          owner_workspace_id: string
          released_at: string | null
          version_id: string
        }
        Insert: {
          bound_at: string
          bound_by: string
          connection_ref: string
          id?: string
          kind: string
          owner_workspace_id: string
          released_at?: string | null
          version_id: string
        }
        Update: {
          bound_at?: string
          bound_by?: string
          connection_ref?: string
          id?: string
          kind?: string
          owner_workspace_id?: string
          released_at?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_bindings_bound_by_fkey"
            columns: ["bound_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_bindings_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_bindings_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_version_decisions: {
        Row: {
          choice: string
          decided_at: string
          decided_by: string
          position: number
          reason: string | null
          resolutions: Json
          source_revision: number
          version_id: string
        }
        Insert: {
          choice: string
          decided_at: string
          decided_by: string
          position: number
          reason?: string | null
          resolutions?: Json
          source_revision: number
          version_id: string
        }
        Update: {
          choice?: string
          decided_at?: string
          decided_by?: string
          position?: number
          reason?: string | null
          resolutions?: Json
          source_revision?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_decisions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_version_grants: {
        Row: {
          granted_at: string
          granted_by: string
          grantee_workspace_id: string
          position: number
          revoked_at: string | null
          scope: string
          version_id: string
        }
        Insert: {
          granted_at: string
          granted_by: string
          grantee_workspace_id: string
          position: number
          revoked_at?: string | null
          scope: string
          version_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          grantee_workspace_id?: string
          position?: number
          revoked_at?: string | null
          scope?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_grants_grantee_workspace_id_fkey"
            columns: ["grantee_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_grants_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_version_overrides: {
        Row: {
          path: string
          position: number
          set_at: string
          set_by: string
          value: Json
          version_id: string
        }
        Insert: {
          path: string
          position: number
          set_at: string
          set_by: string
          value: Json
          version_id: string
        }
        Update: {
          path?: string
          position?: number
          set_at?: string
          set_by?: string
          value?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_overrides_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_overrides_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_version_releases: {
        Row: {
          baseline_revision: number
          definition: Json
          number: number
          override_paths: string[]
          released_at: string
          released_by: string
          system_revision_id: string
          version_id: string
        }
        Insert: {
          baseline_revision: number
          definition: Json
          number: number
          override_paths?: string[]
          released_at: string
          released_by: string
          system_revision_id: string
          version_id: string
        }
        Update: {
          baseline_revision?: number
          definition?: Json
          number?: number
          override_paths?: string[]
          released_at?: string
          released_by?: string
          system_revision_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_releases_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_releases_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_version_source_revisions: {
        Row: {
          definition: Json
          id: string
          label: string | null
          number: number
          published_at: string
          published_by: string
          requires_binding_kinds: string[]
          source_system_id: string
          summary: string
        }
        Insert: {
          definition: Json
          id: string
          label?: string | null
          number: number
          published_at: string
          published_by: string
          requires_binding_kinds?: string[]
          source_system_id: string
          summary: string
        }
        Update: {
          definition?: Json
          id?: string
          label?: string | null
          number?: number
          published_at?: string
          published_by?: string
          requires_binding_kinds?: string[]
          source_system_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_source_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_source_revisions_source_system_id_fkey"
            columns: ["source_system_id"]
            isOneToOne: false
            referencedRelation: "system_version_sources"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_version_source_shares: {
        Row: {
          grantee_workspace_id: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          shared_at: string
          shared_by: string
          source_system_id: string
        }
        Insert: {
          grantee_workspace_id: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          shared_at?: string
          shared_by: string
          source_system_id: string
        }
        Update: {
          grantee_workspace_id?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          shared_at?: string
          shared_by?: string
          source_system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_source_shares_grantee_workspace_id_fkey"
            columns: ["grantee_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_source_shares_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_source_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_source_shares_source_system_id_fkey"
            columns: ["source_system_id"]
            isOneToOne: false
            referencedRelation: "system_version_sources"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_version_sources: {
        Row: {
          business_workspace_id: string
          created_at: string
          created_by: string
          hidden: boolean
          system_id: string
        }
        Insert: {
          business_workspace_id: string
          created_at?: string
          created_by: string
          hidden?: boolean
          system_id: string
        }
        Update: {
          business_workspace_id?: string
          created_at?: string
          created_by?: string
          hidden?: boolean
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_sources_system_id_business_workspace_id_fkey"
            columns: ["system_id", "business_workspace_id"]
            isOneToOne: true
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      system_versions: {
        Row: {
          baseline_definition: Json
          baseline_revision: number
          baseline_revision_id: string
          business_workspace_id: string
          context_kind: string
          context_label: string
          created_at: string
          created_by: string
          current_release: number | null
          id: string
          local_data: Json
          row_revision: number
          source_system_id: string
          source_workspace_id: string
          updated_at: string
          version_system_id: string
        }
        Insert: {
          baseline_definition: Json
          baseline_revision: number
          baseline_revision_id: string
          business_workspace_id: string
          context_kind: string
          context_label: string
          created_at: string
          created_by: string
          current_release?: number | null
          id: string
          local_data?: Json
          row_revision?: number
          source_system_id: string
          source_workspace_id: string
          updated_at: string
          version_system_id: string
        }
        Update: {
          baseline_definition?: Json
          baseline_revision?: number
          baseline_revision_id?: string
          business_workspace_id?: string
          context_kind?: string
          context_label?: string
          created_at?: string
          created_by?: string
          current_release?: number | null
          id?: string
          local_data?: Json
          row_revision?: number
          source_system_id?: string
          source_workspace_id?: string
          updated_at?: string
          version_system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_versions_baseline_revision_id_source_system_id_fkey"
            columns: ["baseline_revision_id", "source_system_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id", "source_system_id"]
          },
          {
            foreignKeyName: "system_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_versions_source_system_id_source_workspace_id_fkey"
            columns: ["source_system_id", "source_workspace_id"]
            isOneToOne: false
            referencedRelation: "system_version_sources"
            referencedColumns: ["system_id", "business_workspace_id"]
          },
          {
            foreignKeyName: "system_versions_version_system_id_business_workspace_id_fkey"
            columns: ["version_system_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      systems: {
        Row: {
          business_workspace_id: string
          change_number: number
          command_digest: string
          command_id: string
          created_at: string
          created_by: string
          current_revision_id: string | null
          current_revision_number: number | null
          id: string
          kind: string
          lifecycle: string
          name: string
          origin_kind: string | null
          origin_ref: string | null
          purpose: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          business_workspace_id: string
          change_number?: number
          command_digest: string
          command_id: string
          created_at?: string
          created_by: string
          current_revision_id?: string | null
          current_revision_number?: number | null
          id?: string
          kind: string
          lifecycle?: string
          name: string
          origin_kind?: string | null
          origin_ref?: string | null
          purpose?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          business_workspace_id?: string
          change_number?: number
          command_digest?: string
          command_id?: string
          created_at?: string
          created_by?: string
          current_revision_id?: string | null
          current_revision_number?: number | null
          id?: string
          kind?: string
          lifecycle?: string
          name?: string
          origin_kind?: string | null
          origin_ref?: string | null
          purpose?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "systems_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_current_revision_fk"
            columns: ["current_revision_id", "id", "current_revision_number"]
            isOneToOne: false
            referencedRelation: "system_revisions"
            referencedColumns: ["id", "system_id", "number"]
          },
          {
            foreignKeyName: "systems_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_analytics_config: {
        Row: {
          config_updated_at: string | null
          ga4_property_id: string | null
          gsc_property: string | null
          recorded_via: string
          tenant_stable_id: string
          updated_at: string
        }
        Insert: {
          config_updated_at?: string | null
          ga4_property_id?: string | null
          gsc_property?: string | null
          recorded_via: string
          tenant_stable_id: string
          updated_at?: string
        }
        Update: {
          config_updated_at?: string | null
          ga4_property_id?: string | null
          gsc_property?: string | null
          recorded_via?: string
          tenant_stable_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_analytics_config_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      tenant_client_record_parity: {
        Row: {
          checked_at: string
          checked_on: string
          mismatched: number
          missing: number
          ok: boolean
          postgres_count: number
          redis_count: number
          store: string
          tenant_stable_id: string
        }
        Insert: {
          checked_at?: string
          checked_on: string
          mismatched: number
          missing: number
          ok: boolean
          postgres_count: number
          redis_count: number
          store: string
          tenant_stable_id: string
        }
        Update: {
          checked_at?: string
          checked_on?: string
          mismatched?: number
          missing?: number
          ok?: boolean
          postgres_count?: number
          redis_count?: number
          store?: string
          tenant_stable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_client_record_parity_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      tenant_client_records: {
        Row: {
          captured_at: string
          connected_site_id: string | null
          id: string
          payload: Json
          payload_hash: string
          record_id: string
          recorded_at: string
          recorded_via: string
          removed_at: string | null
          store: string
          tenant_stable_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          captured_at: string
          connected_site_id?: string | null
          id?: string
          payload: Json
          payload_hash: string
          record_id: string
          recorded_at?: string
          recorded_via: string
          removed_at?: string | null
          store: string
          tenant_stable_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          captured_at?: string
          connected_site_id?: string | null
          id?: string
          payload?: Json
          payload_hash?: string
          record_id?: string
          recorded_at?: string
          recorded_via?: string
          removed_at?: string | null
          store?: string
          tenant_stable_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_client_records_connected_site_id_fkey"
            columns: ["connected_site_id"]
            isOneToOne: false
            referencedRelation: "connected_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_client_records_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      tenant_lead_purges: {
        Row: {
          id: string
          purged_at: string
          purged_count: number
          retain_until: string
          site_name: string | null
          tenant_deleted_at: string
          tenant_slug: string
          tenant_stable_id: string
        }
        Insert: {
          id?: string
          purged_at?: string
          purged_count: number
          retain_until: string
          site_name?: string | null
          tenant_deleted_at: string
          tenant_slug: string
          tenant_stable_id: string
        }
        Update: {
          id?: string
          purged_at?: string
          purged_count?: number
          retain_until?: string
          site_name?: string | null
          tenant_deleted_at?: string
          tenant_slug?: string
          tenant_stable_id?: string
        }
        Relationships: []
      }
      tenant_leads: {
        Row: {
          capability_id: string | null
          capability_version: number | null
          captured_at: string
          connected_site_id: string | null
          contact_id: string | null
          email: string | null
          fields: Json | null
          held_reason: string | null
          id: string
          intake_state: string
          intake_state_at: string | null
          lead_id: string
          message: string | null
          name: string
          recorded_at: string
          recorded_via: string
          retain_until: string | null
          site_name_at_delete: string | null
          source: string | null
          submission_hash: string
          tenant_deleted_at: string | null
          tenant_slug_at_capture: string
          tenant_stable_id: string | null
          workspace_id: string | null
        }
        Insert: {
          capability_id?: string | null
          capability_version?: number | null
          captured_at: string
          connected_site_id?: string | null
          contact_id?: string | null
          email?: string | null
          fields?: Json | null
          held_reason?: string | null
          id?: string
          intake_state?: string
          intake_state_at?: string | null
          lead_id: string
          message?: string | null
          name: string
          recorded_at?: string
          recorded_via: string
          retain_until?: string | null
          site_name_at_delete?: string | null
          source?: string | null
          submission_hash: string
          tenant_deleted_at?: string | null
          tenant_slug_at_capture: string
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          capability_id?: string | null
          capability_version?: number | null
          captured_at?: string
          connected_site_id?: string | null
          contact_id?: string | null
          email?: string | null
          fields?: Json | null
          held_reason?: string | null
          id?: string
          intake_state?: string
          intake_state_at?: string | null
          lead_id?: string
          message?: string | null
          name?: string
          recorded_at?: string
          recorded_via?: string
          retain_until?: string | null
          site_name_at_delete?: string | null
          source?: string | null
          submission_hash?: string
          tenant_deleted_at?: string | null
          tenant_slug_at_capture?: string
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_leads_connected_site_id_fkey"
            columns: ["connected_site_id"]
            isOneToOne: false
            referencedRelation: "connected_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "business_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_report_state: {
        Row: {
          cadence: string | null
          last_sent_at: string | null
          recorded_via: string
          tenant_stable_id: string
          updated_at: string
        }
        Insert: {
          cadence?: string | null
          last_sent_at?: string | null
          recorded_via: string
          tenant_stable_id: string
          updated_at?: string
        }
        Update: {
          cadence?: string | null
          last_sent_at?: string | null
          recorded_via?: string
          tenant_stable_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_report_state_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      tenant_workspace_links: {
        Row: {
          command_digest: string
          command_id: string
          id: string
          linked_at: string
          linked_by: string
          receipt: Json
          tenant_slug_at_link: string
          tenant_stable_id: string | null
          workspace_id: string
        }
        Insert: {
          command_digest: string
          command_id: string
          id?: string
          linked_at?: string
          linked_by: string
          receipt: Json
          tenant_slug_at_link: string
          tenant_stable_id?: string | null
          workspace_id: string
        }
        Update: {
          command_digest?: string
          command_id?: string
          id?: string
          linked_at?: string
          linked_by?: string
          receipt?: Json
          tenant_slug_at_link?: string
          tenant_stable_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_workspace_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_workspace_links_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "tenant_workspace_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_workspace_unlinks: {
        Row: {
          command_digest: string
          command_id: string
          id: string
          link_command_id: string
          link_id: string
          receipt: Json
          tenant_slug_at_unlink: string
          tenant_stable_id: string
          unlinked_at: string
          unlinked_by: string
          workspace_id: string
        }
        Insert: {
          command_digest: string
          command_id: string
          id?: string
          link_command_id: string
          link_id: string
          receipt: Json
          tenant_slug_at_unlink: string
          tenant_stable_id: string
          unlinked_at?: string
          unlinked_by: string
          workspace_id: string
        }
        Update: {
          command_digest?: string
          command_id?: string
          id?: string
          link_command_id?: string
          link_id?: string
          receipt?: Json
          tenant_slug_at_unlink?: string
          tenant_stable_id?: string
          unlinked_at?: string
          unlinked_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_workspace_unlinks_unlinked_by_fkey"
            columns: ["unlinked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          account_id: string | null
          active: boolean
          admin_domain: string | null
          auto_approve_threshold: number | null
          auto_publish: boolean
          behold_feed_id: string | null
          billing_type: string | null
          booking_provider: string | null
          booking_url: string | null
          branding: Json | null
          business_hours: Json | null
          business_rules: string | null
          commitment_ends_at: string | null
          created_at: string
          custom_domains: string[] | null
          custom_repo: Json | null
          delivery_model: string
          features: string[] | null
          google_search_console_key: string | null
          id: string
          industry: string | null
          instagram_access_token: string | null
          integrations: string[] | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          personality: string | null
          plan_currency: string | null
          plan_monthly_cents: number | null
          plan_override: string | null
          production_domain: string | null
          referred_by: string | null
          resend_domain: string | null
          revalidate_url: string | null
          revalidation_secret: string | null
          reviews_config: Json | null
          site_capabilities: Json | null
          site_name: string
          site_url: string | null
          slack_webhook_url: string | null
          social_config: Json | null
          stable_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_past_due_since: string | null
          subscription_plan: string | null
          subscription_started_at: string | null
          subscription_status: string
          template: string | null
          updated_at: string
          visibility: Json | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          admin_domain?: string | null
          auto_approve_threshold?: number | null
          auto_publish?: boolean
          behold_feed_id?: string | null
          billing_type?: string | null
          booking_provider?: string | null
          booking_url?: string | null
          branding?: Json | null
          business_hours?: Json | null
          business_rules?: string | null
          commitment_ends_at?: string | null
          created_at?: string
          custom_domains?: string[] | null
          custom_repo?: Json | null
          delivery_model?: string
          features?: string[] | null
          google_search_console_key?: string | null
          id: string
          industry?: string | null
          instagram_access_token?: string | null
          integrations?: string[] | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          personality?: string | null
          plan_currency?: string | null
          plan_monthly_cents?: number | null
          plan_override?: string | null
          production_domain?: string | null
          referred_by?: string | null
          resend_domain?: string | null
          revalidate_url?: string | null
          revalidation_secret?: string | null
          reviews_config?: Json | null
          site_capabilities?: Json | null
          site_name: string
          site_url?: string | null
          slack_webhook_url?: string | null
          social_config?: Json | null
          stable_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_past_due_since?: string | null
          subscription_plan?: string | null
          subscription_started_at?: string | null
          subscription_status?: string
          template?: string | null
          updated_at?: string
          visibility?: Json | null
        }
        Update: {
          account_id?: string | null
          active?: boolean
          admin_domain?: string | null
          auto_approve_threshold?: number | null
          auto_publish?: boolean
          behold_feed_id?: string | null
          billing_type?: string | null
          booking_provider?: string | null
          booking_url?: string | null
          branding?: Json | null
          business_hours?: Json | null
          business_rules?: string | null
          commitment_ends_at?: string | null
          created_at?: string
          custom_domains?: string[] | null
          custom_repo?: Json | null
          delivery_model?: string
          features?: string[] | null
          google_search_console_key?: string | null
          id?: string
          industry?: string | null
          instagram_access_token?: string | null
          integrations?: string[] | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          personality?: string | null
          plan_currency?: string | null
          plan_monthly_cents?: number | null
          plan_override?: string | null
          production_domain?: string | null
          referred_by?: string | null
          resend_domain?: string | null
          revalidate_url?: string | null
          revalidation_secret?: string | null
          reviews_config?: Json | null
          site_capabilities?: Json | null
          site_name?: string
          site_url?: string | null
          slack_webhook_url?: string | null
          social_config?: Json | null
          stable_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_past_due_since?: string | null
          subscription_plan?: string | null
          subscription_started_at?: string | null
          subscription_status?: string
          template?: string | null
          updated_at?: string
          visibility?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_track_signing_keys: {
        Row: {
          created_at: string
          public_key: string
          previous_public_key: string | null
          previous_valid_until: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          public_key: string
          previous_public_key?: string | null
          previous_valid_until?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          public_key?: string
          previous_public_key?: string | null
          previous_valid_until?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_track_signing_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_events: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json | null
          resolved_at: string | null
          source: string
          status: string
          tenant_id: string
          tenant_stable_id: string | null
          title: string | null
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resolved_at?: string | null
          source: string
          status?: string
          tenant_id: string
          tenant_stable_id?: string | null
          title?: string | null
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resolved_at?: string | null
          source?: string
          status?: string
          tenant_id?: string
          tenant_stable_id?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "unified_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_events_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      users: {
        Row: {
          clerk_id: string | null
          created_at: string
          email: string
          id: string
          verified_at: string | null
        }
        Insert: {
          clerk_id?: string | null
          created_at?: string
          email: string
          id?: string
          verified_at?: string | null
        }
        Update: {
          clerk_id?: string | null
          created_at?: string
          email?: string
          id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      website_change_receipts: {
        Row: {
          commit_sha: string | null
          deployment_url: string | null
          id: string
          kind: string
          note: string | null
          preview_url: string | null
          read_back: string | null
          recorded_at: string
          recorded_by: string
          request_id: string
          system_id: string
          workspace_id: string
        }
        Insert: {
          commit_sha?: string | null
          deployment_url?: string | null
          id?: string
          kind: string
          note?: string | null
          preview_url?: string | null
          read_back?: string | null
          recorded_at?: string
          recorded_by: string
          request_id: string
          system_id: string
          workspace_id: string
        }
        Update: {
          commit_sha?: string | null
          deployment_url?: string | null
          id?: string
          kind?: string
          note?: string | null
          preview_url?: string | null
          read_back?: string | null
          recorded_at?: string
          recorded_by?: string
          request_id?: string
          system_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_change_receipts_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_change_receipts_request_id_workspace_id_fkey"
            columns: ["request_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "website_change_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_crawl_pages: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          html_bytes: number
          page: Json
          source_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          html_bytes: number
          page: Json
          source_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          html_bytes?: number
          page?: Json
          source_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_crawl_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_crawl_pages_website_work_id_workspace_id_fkey"
            columns: ["website_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      website_document_heads: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_hash: string | null
          approved_revision: number | null
          revision: number
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_hash?: string | null
          approved_revision?: number | null
          revision: number
          website_work_id: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_hash?: string | null
          approved_revision?: number | null
          revision?: number
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_document_heads_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_document_heads_workspace_id_website_work_id_revisi_fkey"
            columns: ["workspace_id", "website_work_id", "revision"]
            isOneToOne: false
            referencedRelation: "website_documents"
            referencedColumns: ["workspace_id", "website_work_id", "revision"]
          },
        ]
      }
      website_document_health: {
        Row: {
          checked_at: string
          content_hash: string
          observed_hash: string | null
          revision: number
          status: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          checked_at: string
          content_hash: string
          observed_hash?: string | null
          revision: number
          status: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          checked_at?: string
          content_hash?: string
          observed_hash?: string | null
          revision?: number
          status?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_document_health_workspace_id_website_work_id_revis_fkey"
            columns: ["workspace_id", "website_work_id", "revision"]
            isOneToOne: false
            referencedRelation: "website_documents"
            referencedColumns: ["workspace_id", "website_work_id", "revision"]
          },
        ]
      }
      website_document_publications: {
        Row: {
          content_hash: string
          published_at: string
          receipt: Json
          revision: number
          tenant_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          published_at?: string
          receipt: Json
          revision: number
          tenant_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          published_at?: string
          receipt?: Json
          revision?: number
          tenant_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_document_publications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_document_publications_workspace_id_website_work_id_fkey"
            columns: ["workspace_id", "website_work_id", "revision"]
            isOneToOne: false
            referencedRelation: "website_documents"
            referencedColumns: ["workspace_id", "website_work_id", "revision"]
          },
        ]
      }
      website_document_receipts: {
        Row: {
          created_at: string
          id: string
          receipt: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          receipt: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          receipt?: Json
          revision?: number
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_document_receipts_workspace_id_website_work_id_rev_fkey"
            columns: ["workspace_id", "website_work_id", "revision"]
            isOneToOne: false
            referencedRelation: "website_documents"
            referencedColumns: ["workspace_id", "website_work_id", "revision"]
          },
        ]
      }
      website_documents: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          document: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          document: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          document?: Json
          revision?: number
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_documents_website_work_id_workspace_id_fkey"
            columns: ["website_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      website_domain_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          expires_at: string
          hostname: string
          id: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          expires_at: string
          hostname: string
          id?: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          expires_at?: string
          hostname?: string
          id?: string
          tenant_stable_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_domain_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_domain_approvals_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "website_domain_approvals_website_work_id_workspace_id_fkey"
            columns: ["website_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      website_hosted_tenant_reservations: {
        Row: {
          created_at: string
          created_by: string
          tenant_id: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          tenant_id: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          tenant_id?: string
          tenant_stable_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_hosted_tenant_reserva_website_work_id_workspace_id_fkey"
            columns: ["website_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "website_hosted_tenant_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_hosted_tenant_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_hosted_tenant_reservations_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      website_linked_publications: {
        Row: {
          content_hash: string
          fallback_until: string
          id: string
          prior_delivery_model: string
          published_at: string
          published_by: string
          revision: number
          tenant_slug_at_publication: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          fallback_until: string
          id?: string
          prior_delivery_model: string
          published_at?: string
          published_by: string
          revision: number
          tenant_slug_at_publication: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          fallback_until?: string
          id?: string
          prior_delivery_model?: string
          published_at?: string
          published_by?: string
          revision?: number
          tenant_slug_at_publication?: string
          tenant_stable_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_linked_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_linked_publications_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "website_linked_publications_workspace_id_website_work_id_r_fkey"
            columns: ["workspace_id", "website_work_id", "revision"]
            isOneToOne: false
            referencedRelation: "website_documents"
            referencedColumns: ["workspace_id", "website_work_id", "revision"]
          },
        ]
      }
      weekly_briefs: {
        Row: {
          booking_clicks: Json | null
          created_at: string
          id: string
          page_views: Json | null
          sections: Json | null
          stale_sections: Json | null
          stats: Json | null
          summary: string | null
          tenant_id: string
          tenant_stable_id: string | null
          top_services: Json | null
          week_end: string
          week_start: string
        }
        Insert: {
          booking_clicks?: Json | null
          created_at?: string
          id?: string
          page_views?: Json | null
          sections?: Json | null
          stale_sections?: Json | null
          stats?: Json | null
          summary?: string | null
          tenant_id: string
          tenant_stable_id?: string | null
          top_services?: Json | null
          week_end: string
          week_start: string
        }
        Update: {
          booking_clicks?: Json | null
          created_at?: string
          id?: string
          page_views?: Json | null
          sections?: Json | null
          stale_sections?: Json | null
          stats?: Json | null
          summary?: string | null
          tenant_id?: string
          tenant_stable_id?: string | null
          top_services?: Json | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_briefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_briefs_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      work_allowance_ledger: {
        Row: {
          allowance_id: string
          command_digest: string
          contribution_reference: string | null
          created_at: string
          created_by: string
          event_kind: string
          id: string
          idempotency_key: string
          reservation_id: string | null
          unit_kind: string
          units: number
        }
        Insert: {
          allowance_id: string
          command_digest: string
          contribution_reference?: string | null
          created_at?: string
          created_by: string
          event_kind: string
          id?: string
          idempotency_key: string
          reservation_id?: string | null
          unit_kind: string
          units: number
        }
        Update: {
          allowance_id?: string
          command_digest?: string
          contribution_reference?: string | null
          created_at?: string
          created_by?: string
          event_kind?: string
          id?: string
          idempotency_key?: string
          reservation_id?: string | null
          unit_kind?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_allowance_ledger_allowance_id_fkey"
            columns: ["allowance_id"]
            isOneToOne: false
            referencedRelation: "work_allowances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_ledger_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "work_allowance_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_allowance_reservations: {
        Row: {
          actual_cost_cents: number | null
          allowance_id: string
          cap_cost_cents: number | null
          consumed_units: number
          created_at: string
          created_by: string
          execution_key: string
          id: string
          job_id: string
          requested_units: number
          reserved_cap_cents: number
          reserved_units: number
          settled_at: string | null
          status: string
          unit_kind: string
        }
        Insert: {
          actual_cost_cents?: number | null
          allowance_id: string
          cap_cost_cents?: number | null
          consumed_units?: number
          created_at?: string
          created_by: string
          execution_key: string
          id?: string
          job_id: string
          requested_units: number
          reserved_cap_cents: number
          reserved_units: number
          settled_at?: string | null
          status?: string
          unit_kind: string
        }
        Update: {
          actual_cost_cents?: number | null
          allowance_id?: string
          cap_cost_cents?: number | null
          consumed_units?: number
          created_at?: string
          created_by?: string
          execution_key?: string
          id?: string
          job_id?: string
          requested_units?: number
          reserved_cap_cents?: number
          reserved_units?: number
          settled_at?: string | null
          status?: string
          unit_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_allowance_reservations_allowance_id_fkey"
            columns: ["allowance_id"]
            isOneToOne: false
            referencedRelation: "work_allowances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_reservations_job_id_execution_key_fkey"
            columns: ["job_id", "execution_key"]
            isOneToOne: true
            referencedRelation: "job_economics_executions"
            referencedColumns: ["job_id", "execution_key"]
          },
        ]
      }
      work_allowance_subcent_remainders: {
        Row: {
          allowance_id: string
          remainder_cents: number
          updated_at: string
        }
        Insert: {
          allowance_id: string
          remainder_cents: number
          updated_at?: string
        }
        Update: {
          allowance_id?: string
          remainder_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_allowance_subcent_remainders_allowance_id_fkey"
            columns: ["allowance_id"]
            isOneToOne: true
            referencedRelation: "work_allowances"
            referencedColumns: ["id"]
          },
        ]
      }
      work_allowance_subscription_entitlements: {
        Row: {
          allowance_id: string | null
          config_key: string
          created_at: string
          grants: Json | null
          id: string
          last_event_created: number
          last_event_id: string
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          period_end: string
          period_start: string
          source: string
          spending_cap_cents: number | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string
          terms_digest: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allowance_id?: string | null
          config_key: string
          created_at?: string
          grants?: Json | null
          id?: string
          last_event_created: number
          last_event_id: string
          payer_id: string
          payer_kind?: string
          payer_workspace_id?: string | null
          period_end: string
          period_start: string
          source?: string
          spending_cap_cents?: number | null
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id: string
          terms_digest: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allowance_id?: string | null
          config_key?: string
          created_at?: string
          grants?: Json | null
          id?: string
          last_event_created?: number
          last_event_id?: string
          payer_id?: string
          payer_kind?: string
          payer_workspace_id?: string | null
          period_end?: string
          period_start?: string
          source?: string
          spending_cap_cents?: number | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string
          terms_digest?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_allowance_subscription_entitlement_payer_workspace_id_fkey"
            columns: ["payer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_subscription_entitlements_allowance_id_fkey"
            columns: ["allowance_id"]
            isOneToOne: false
            referencedRelation: "work_allowances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_subscription_entitlements_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowance_subscription_entitlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_allowances: {
        Row: {
          award_digest: string
          award_key: string
          cap_accepted_at: string | null
          cap_accepted_by: string | null
          created_at: string
          created_by: string
          id: string
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          period_end: string
          period_start: string
          source: string
          spending_cap_cents: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          award_digest: string
          award_key: string
          cap_accepted_at?: string | null
          cap_accepted_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          payer_id: string
          payer_kind?: string
          payer_workspace_id?: string | null
          period_end: string
          period_start: string
          source?: string
          spending_cap_cents: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          award_digest?: string
          award_key?: string
          cap_accepted_at?: string | null
          cap_accepted_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          payer_id?: string
          payer_kind?: string
          payer_workspace_id?: string | null
          period_end?: string
          period_start?: string
          source?: string
          spending_cap_cents?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_allowances_cap_accepted_by_fkey"
            columns: ["cap_accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowances_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowances_payer_workspace_id_fkey"
            columns: ["payer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_allowances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_plan_output_executions: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          idempotency_key: string
          input_digest: string
          native_product_id: string
          native_resource_kind: string
          native_work_id: string
          operation_id: string
          output_id: string
          plan_revision: number
          plan_work_id: string
          receipt: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          input_digest: string
          native_product_id: string
          native_resource_kind: string
          native_work_id: string
          operation_id: string
          output_id: string
          plan_revision: number
          plan_work_id: string
          receipt: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          input_digest?: string
          native_product_id?: string
          native_resource_kind?: string
          native_work_id?: string
          operation_id?: string
          output_id?: string
          plan_revision?: number
          plan_work_id?: string
          receipt?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_plan_output_executions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_plan_output_executions_native_work_id_workspace_id_fkey"
            columns: ["native_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_plan_output_executions_plan_work_id_workspace_id_fkey"
            columns: ["plan_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      work_provider_receipts: {
        Row: {
          attribution: string
          billable_cents: number
          billable_usd: number
          billable_usd_text: string
          evidence_reference: string
          execution_key: string
          id: string
          job_id: string
          kind: string
          maximum_cents: number
          provider: string
          recorded_at: string
          request_id: string
          settlement_cents: number
        }
        Insert: {
          attribution: string
          billable_cents: number
          billable_usd: number
          billable_usd_text: string
          evidence_reference: string
          execution_key: string
          id?: string
          job_id: string
          kind: string
          maximum_cents: number
          provider: string
          recorded_at?: string
          request_id: string
          settlement_cents: number
        }
        Update: {
          attribution?: string
          billable_cents?: number
          billable_usd?: number
          billable_usd_text?: string
          evidence_reference?: string
          execution_key?: string
          id?: string
          job_id?: string
          kind?: string
          maximum_cents?: number
          provider?: string
          recorded_at?: string
          request_id?: string
          settlement_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_provider_receipts_job_id_execution_key_fkey"
            columns: ["job_id", "execution_key"]
            isOneToOne: true
            referencedRelation: "job_economics_executions"
            referencedColumns: ["job_id", "execution_key"]
          },
          {
            foreignKeyName: "work_provider_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
        ]
      }
      work_provider_subcent_remainders: {
        Row: {
          job_id: string
          remainder_cents: number
          updated_at: string
        }
        Insert: {
          job_id: string
          remainder_cents: number
          updated_at?: string
        }
        Update: {
          job_id?: string
          remainder_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_provider_subcent_remainders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
        ]
      }
      work_retry_subcent_remainders: {
        Row: {
          job_id: string
          remainder_cents: number
          updated_at: string
        }
        Insert: {
          job_id: string
          remainder_cents: number
          updated_at?: string
        }
        Update: {
          job_id?: string
          remainder_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_retry_subcent_remainders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_account_bindings: {
        Row: {
          access_token_ciphertext: string | null
          created_at: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          migrated_from: string
          origin_tenant_stable_id: string | null
          provider: string
          refresh_token_ciphertext: string | null
          scopes: string[] | null
          status: string
          subject: string | null
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          migrated_from: string
          origin_tenant_stable_id?: string | null
          provider: string
          refresh_token_ciphertext?: string | null
          scopes?: string[] | null
          status?: string
          subject?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          migrated_from?: string
          origin_tenant_stable_id?: string | null
          provider?: string
          refresh_token_ciphertext?: string | null
          scopes?: string[] | null
          status?: string
          subject?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_account_bindings_origin_tenant_stable_id_fkey"
            columns: ["origin_tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "workspace_account_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_agent_access_events: {
        Row: {
          action: string
          contribution_id: string | null
          event_key: string
          grant_id: string
          id: string
          idempotency_key: string | null
          issuer_user_id: string
          occurred_at: string
          token_id: string
          work_id: string
        }
        Insert: {
          action: string
          contribution_id?: string | null
          event_key: string
          grant_id: string
          id?: string
          idempotency_key?: string | null
          issuer_user_id: string
          occurred_at?: string
          token_id: string
          work_id: string
        }
        Update: {
          action?: string
          contribution_id?: string | null
          event_key?: string
          grant_id?: string
          id?: string
          idempotency_key?: string | null
          issuer_user_id?: string
          occurred_at?: string
          token_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agent_access_events_issuer_user_id_fkey"
            columns: ["issuer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_access_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "workspace_agent_access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_access_events_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_agent_access_tokens: {
        Row: {
          agent_label: string
          created_at: string
          expires_at: string
          grant_id: string
          id: string
          issuer_email: string
          issuer_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          work_id: string
        }
        Insert: {
          agent_label: string
          created_at?: string
          expires_at: string
          grant_id: string
          id: string
          issuer_email: string
          issuer_user_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          work_id: string
        }
        Update: {
          agent_label?: string
          created_at?: string
          expires_at?: string
          grant_id?: string
          id?: string
          issuer_email?: string
          issuer_user_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agent_access_tokens_issuer_user_id_fkey"
            columns: ["issuer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_access_tokens_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_access_tokens_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_calendar_connections: {
        Row: {
          access_token_ciphertext: string | null
          calendar_id: string
          calendar_name: string
          created_at: string
          created_by: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          provider: string
          refresh_token_ciphertext: string | null
          reminder_policy: Json
          scopes: string[]
          status: string
          time_zone: string
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          calendar_id: string
          calendar_name: string
          created_at?: string
          created_by: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider: string
          refresh_token_ciphertext?: string | null
          reminder_policy?: Json
          scopes?: string[]
          status?: string
          time_zone: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          calendar_id?: string
          calendar_name?: string
          created_at?: string
          created_by?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          refresh_token_ciphertext?: string | null
          reminder_policy?: Json
          scopes?: string[]
          status?: string
          time_zone?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_calendar_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_calendar_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_calendar_event_receipts: {
        Row: {
          attempted_at: string | null
          calendar_id: string
          created_at: string
          end_at: string
          external_event_id: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          observed_at: string | null
          operation: string
          provider: string
          reminder_policy: Json
          request_id: string
          revision: number
          start_at: string
          status: string
          time_zone: string
          title: string
          updated_at: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          attempted_at?: string | null
          calendar_id: string
          created_at?: string
          end_at: string
          external_event_id?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          observed_at?: string | null
          operation: string
          provider: string
          reminder_policy?: Json
          request_id: string
          revision: number
          start_at: string
          status: string
          time_zone: string
          title: string
          updated_at?: string
          work_id: string
          workspace_id: string
        }
        Update: {
          attempted_at?: string | null
          calendar_id?: string
          created_at?: string
          end_at?: string
          external_event_id?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          observed_at?: string | null
          operation?: string
          provider?: string
          reminder_policy?: Json
          request_id?: string
          revision?: number
          start_at?: string
          status?: string
          time_zone?: string
          title?: string
          updated_at?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_calendar_event_receipts_work_id_workspace_id_fkey"
            columns: ["work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_calendar_event_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_creation_receipts: {
        Row: {
          command_digest: string
          command_id: string
          created_at: string
          request_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          command_digest: string
          command_id: string
          created_at?: string
          request_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          command_digest?: string
          command_id?: string
          created_at?: string
          request_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_creation_receipts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_creation_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_creation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_delegations: {
        Row: {
          accepted_by: string
          agency_workspace_id: string
          created_at: string
          customer_work_id: string
          customer_workspace_id: string
          granted_by: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }
        Insert: {
          accepted_by: string
          agency_workspace_id: string
          created_at?: string
          customer_work_id: string
          customer_workspace_id: string
          granted_by: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string[]
          status?: string
        }
        Update: {
          accepted_by?: string
          agency_workspace_id?: string
          created_at?: string
          customer_work_id?: string
          customer_workspace_id?: string
          granted_by?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_delegations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_delegations_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_delegations_customer_work_id_customer_workspace__fkey"
            columns: ["customer_work_id", "customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_delegations_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_delegations_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_delegations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_exit_requests: {
        Row: {
          command_digest: string
          completed_at: string
          created_at: string
          future_work: string
          id: string
          idempotency_key: string
          maintained_resource_action: string
          notes: string | null
          provider_participation: string
          requested_by: string
          state: Json
          successor_user_id: string | null
          workspace_id: string
        }
        Insert: {
          command_digest: string
          completed_at: string
          created_at?: string
          future_work: string
          id?: string
          idempotency_key: string
          maintained_resource_action: string
          notes?: string | null
          provider_participation: string
          requested_by: string
          state: Json
          successor_user_id?: string | null
          workspace_id: string
        }
        Update: {
          command_digest?: string
          completed_at?: string
          created_at?: string
          future_work?: string
          id?: string
          idempotency_key?: string
          maintained_resource_action?: string
          notes?: string | null
          provider_participation?: string
          requested_by?: string
          state?: Json
          successor_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_exit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_exit_requests_successor_user_id_fkey"
            columns: ["successor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_exit_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_export_build_parts: {
        Row: {
          body: string
          build_id: string
          part: number
        }
        Insert: {
          body: string
          build_id: string
          part: number
        }
        Update: {
          body?: string
          build_id?: string
          part?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_export_build_parts_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "workspace_export_builds"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_export_builds: {
        Row: {
          byte_size: number
          completed_at: string | null
          created_at: string
          deliver_to: string | null
          download_token_hash: string | null
          expires_at: string | null
          failure: string | null
          id: string
          manifest: Json | null
          part_count: number
          requested_by: string
          requester_role: string
          schema_version: number
          status: string
          workspace_id: string
        }
        Insert: {
          byte_size?: number
          completed_at?: string | null
          created_at?: string
          deliver_to?: string | null
          download_token_hash?: string | null
          expires_at?: string | null
          failure?: string | null
          id?: string
          manifest?: Json | null
          part_count?: number
          requested_by: string
          requester_role: string
          schema_version?: number
          status?: string
          workspace_id: string
        }
        Update: {
          byte_size?: number
          completed_at?: string | null
          created_at?: string
          deliver_to?: string | null
          download_token_hash?: string | null
          expires_at?: string | null
          failure?: string | null
          id?: string
          manifest?: Json | null
          part_count?: number
          requested_by?: string
          requester_role?: string
          schema_version?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_export_builds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_export_builds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_export_receipts: {
        Row: {
          byte_size: number
          category_counts: Json
          created_at: string
          id: string
          requested_by: string
          schema_version: number
          workspace_id: string
        }
        Insert: {
          byte_size: number
          category_counts: Json
          created_at?: string
          id?: string
          requested_by: string
          schema_version: number
          workspace_id: string
        }
        Update: {
          byte_size?: number
          category_counts?: Json
          created_at?: string
          id?: string
          requested_by?: string
          schema_version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_export_receipts_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_export_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_google_locations: {
        Row: {
          account_id: string
          binding_id: string
          created_at: string
          id: string
          is_primary: boolean
          location_id: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          binding_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          binding_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_google_locations_binding_id_workspace_id_fkey"
            columns: ["binding_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_account_bindings"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      workspace_handoffs: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_destination_kind: string | null
          accepted_destination_name: string | null
          agency_workspace_id: string
          created_at: string
          created_by: string
          customer_work_id: string | null
          customer_workspace_id: string | null
          delegation_id: string | null
          expires_at: string
          id: string
          recipient_email: string
          revoked_at: string | null
          revoked_by: string | null
          source_work_id: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_destination_kind?: string | null
          accepted_destination_name?: string | null
          agency_workspace_id: string
          created_at?: string
          created_by: string
          customer_work_id?: string | null
          customer_workspace_id?: string | null
          delegation_id?: string | null
          expires_at: string
          id?: string
          recipient_email: string
          revoked_at?: string | null
          revoked_by?: string | null
          source_work_id: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_destination_kind?: string | null
          accepted_destination_name?: string | null
          agency_workspace_id?: string
          created_at?: string
          created_by?: string
          customer_work_id?: string | null
          customer_workspace_id?: string | null
          delegation_id?: string | null
          expires_at?: string
          id?: string
          recipient_email?: string
          revoked_at?: string | null
          revoked_by?: string | null
          source_work_id?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_handoffs_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_handoffs_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_handoffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_handoffs_customer_work_id_customer_workspace_id_fkey"
            columns: ["customer_work_id", "customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_handoffs_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_handoffs_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "workspace_delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_handoffs_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_handoffs_source_work_id_agency_workspace_id_fkey"
            columns: ["source_work_id", "agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          issued_by_kind: string
          recipient_email: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          issued_by_kind?: string
          recipient_email: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          status?: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          issued_by_kind?: string
          recipient_email?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memberships: {
        Row: {
          created_at: string
          created_by: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_operations: {
        Row: {
          attempts: number
          created_at: string
          created_by: string
          id: string
          input: Json
          lease_id: string | null
          lease_until: string | null
          product_id: string
          result: Json | null
          status: string
          updated_at: string
          work_id: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by: string
          id: string
          input: Json
          lease_id?: string | null
          lease_until?: string | null
          product_id: string
          result?: Json | null
          status?: string
          updated_at?: string
          work_id?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string
          id?: string
          input?: Json
          lease_id?: string | null
          lease_until?: string | null
          product_id?: string
          result?: Json | null
          status?: string
          updated_at?: string
          work_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_operations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_operations_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_payer_transitions: {
        Row: {
          accepted_at: string | null
          id: string
          proposed_at: string
          proposed_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          successor_email: string | null
          successor_kind: string
          successor_user_id: string | null
          successor_workspace_id: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          proposed_at?: string
          proposed_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          successor_email?: string | null
          successor_kind?: string
          successor_user_id?: string | null
          successor_workspace_id?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          proposed_at?: string
          proposed_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          successor_email?: string | null
          successor_kind?: string
          successor_user_id?: string | null
          successor_workspace_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_payer_transitions_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_payer_transitions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_payer_transitions_successor_user_id_fkey"
            columns: ["successor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_payer_transitions_successor_workspace_id_fkey"
            columns: ["successor_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_payer_transitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_providers: {
        Row: {
          customer_workspace_id: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          provider_workspace_id: string
          source: string
          started_at: string
          started_by: string
          status: string
        }
        Insert: {
          customer_workspace_id: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          provider_workspace_id: string
          source: string
          started_at?: string
          started_by: string
          status?: string
        }
        Update: {
          customer_workspace_id?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          provider_workspace_id?: string
          source?: string
          started_at?: string
          started_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_providers_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_providers_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_providers_provider_workspace_id_fkey"
            columns: ["provider_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_providers_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_release_flag_changes: {
        Row: {
          changed_at: string
          changed_by: string
          from_state: string | null
          id: string
          reason: string
          subject: string
          tester_user_id: string | null
          to_state: string
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          from_state?: string | null
          id?: string
          reason: string
          subject: string
          tester_user_id?: string | null
          to_state: string
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          from_state?: string | null
          id?: string
          reason?: string
          subject?: string
          tester_user_id?: string | null
          to_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_release_flag_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_release_flag_changes_tester_user_id_fkey"
            columns: ["tester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_release_flag_changes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_release_flags: {
        Row: {
          changed_at: string
          changed_by: string
          flag: string
          revision: number
          state: string
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          flag: string
          revision?: number
          state: string
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          flag?: string
          revision?: number
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_release_flags_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_release_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_release_testers: {
        Row: {
          added_at: string
          added_by: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          user_id: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_release_testers_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_release_testers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_release_testers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_work_context: {
        Row: {
          payload: Json
          updated_at: string
          work_id: string
        }
        Insert: {
          payload: Json
          updated_at?: string
          work_id: string
        }
        Update: {
          payload?: Json
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_work_context_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_work_participation: {
        Row: {
          payload: Json
          updated_at: string
          work_id: string
        }
        Insert: {
          payload: Json
          updated_at?: string
          work_id: string
        }
        Update: {
          payload?: Json
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_work_participation_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      rotate_tenant_track_signing_key: {
        Args: {
          p_public_key: string | null
          p_tenant_id: string
        }
        Returns: undefined
      }
      business_policy_integer_valid: {
        Args: {
          hi: number
          lo: number
          v: Json
        }
        Returns: boolean
      }
      business_policy_valid: {
        Args: {
          p_key: string
          p_value: Json
        }
        Returns: boolean
      }
      read_business_policies: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_hosted_website_business_facts: { Args: { p_tenant_id: string }; Returns: Json };
      accept_operational_assignment: {
        Args: {
          p_assignment_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          active_actor_id: string | null
          active_attempt: number | null
          active_lease_id: string | null
          active_started_at: string | null
          active_step_id: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id: string | null
          expires_at: string
          id: string
          offer_key: string
          offered_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          sponsor_email: string
          sponsor_id: string
          status: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }[]
      }
      accept_provider_delivery: {
        Args: {
          p_delivery_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }[]
      }
      accept_system_output: {
        Args: {
          p_output_id: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      accept_workspace_handoff:
        | {
          Args: {
            p_allow_agency_access: boolean
            p_token_hash: string
            p_user_id: string
            p_verified_email: string
          }
          Returns: {
            already_accepted: boolean
            customer_work_id: string
            customer_workspace_id: string
            delegation_id: string
            handoff_id: string
          }[]
        }
        | {
          Args: {
            p_allow_agency_access: boolean
            p_customer_workspace_id: string
            p_customer_workspace_name: string
            p_token_hash: string
            p_user_id: string
            p_verified_email: string
          }
          Returns: {
            already_accepted: boolean
            customer_work_id: string
            customer_workspace_id: string
            delegation_id: string
            handoff_id: string
          }[]
        }
      accept_workspace_handoff_pre_website_documents: {
        Args: {
          p_allow_agency_access: boolean
          p_customer_workspace_id: string
          p_customer_workspace_name: string
          p_token_hash: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          already_accepted: boolean
          customer_work_id: string
          customer_workspace_id: string
          delegation_id: string
          handoff_id: string
        }[]
      }
      accept_workspace_invitation: {
        Args: {
          p_actor_id: string
          p_token_hash: string
          p_verified_email: string
        }
        Returns: {
          already_accepted: boolean
          applied_role: string
          invitation_id: string
          invitation_status: string
          invited_role: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      account_binding_ciphertext_valid: {
        Args: {
          p_value: string
        }
        Returns: boolean
      }
      account_binding_json: {
        Args: {
          b: unknown
          p_with_secrets: boolean
        }
        Returns: Json
      }
      activate_offering: {
        Args: {
          p_business_id: string
          p_expected_revision: number
          p_installation_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration: Json
          definition_id: string
          definition_version: string
          id: string
          idempotency_key: string
          installed_at: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          revision: number
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
        }[]
      }
      admit_standing_responsibility: {
        Args: {
          p_expected_version: number
          p_next_trigger_at: string
          p_payload: Json
          p_standing_id: string
          p_trigger_key: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          job: unknown
          replayed: boolean
          run: unknown
        }[]
      }
      adopt_application_source_update: {
        Args: {
          p_expected_revision: number
          p_source_version: number
          p_source_work_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      adopt_converted_tenant_systems: {
        Args: {
          p_link_id: string
        }
        Returns: number
      }
      adopt_system_with_revision: {
        Args: {
          p_actor: string
          p_implementation: Json
          p_kind: string
          p_live: boolean
          p_name: string
          p_origin_kind: string
          p_origin_ref: string
          p_workspace_id: string
        }
        Returns: number
      }
      after_tenant_lead_capture: {
        Args: {
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      agency_application_draft_edit_assert: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      agency_application_draft_target: {
        Args: {
          p_delivery_id: string
          p_work_id: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          delivery_id: string
          expires_at: string
          installation_id: string
          operator_user_id: string
        }[]
      }
      agency_billing_recipient: {
        Args: {
          p_agency_workspace_id: string
        }
        Returns: Json
      }
      agency_can_read_assigned_work: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      agency_client_overview: {
        Args: {
          p_agency_workspace_id: string
          p_cursor: string
          p_limit: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      agency_effect_allowed: {
        Args: {
          p_agency_workspace_id: string
          p_effect: string
        }
        Returns: boolean
      }
      agency_effect_names: {
        Args: never
        Returns: string[]
      }
      agency_managed_website_delivery_target: {
        Args: {
          p_binding_id: string
          p_delivery_id: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          delivery_id: string
          expires_at: string
          managed_website_binding_id: string
          operator_user_id: string
          sponsor_user_id: string
          tenant_id: string
          tenant_stable_id: string
        }[]
      }
      agency_managed_website_draft_identity: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      agency_managed_website_draft_section_allowed: {
        Args: {
          p_binding_id: string
          p_delivery_id: string
          p_section: string
        }
        Returns: boolean
      }
      agency_managed_website_lock_target: {
        Args: {
          p_binding_id: string
          p_delivery_id: string
        }
        Returns: undefined
      }
      agency_overview_client: {
        Args: {
          p_agency_workspace_id: string
          p_provider: boolean
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      agency_overview_providers: {
        Args: {
          p_agency_workspace_id: string
        }
        Returns: Record<string, unknown>
      }
      agency_overview_queue: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      agency_verification_state: {
        Args: {
          p_agency_workspace_id: string
        }
        Returns: Json
      }
      agency_website_document_target: {
        Args: {
          p_binding_id: string
          p_section: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      allow_agency_website_draft_step: {
        Args: {
          p_step: Json
        }
        Returns: boolean
      }
      app_is_super_admin: {
        Args: never
        Returns: boolean
      }
      app_tenant_ids: {
        Args: never
        Returns: string[]
      }
      app_tenant_stable_ids: {
        Args: never
        Returns: string[]
      }
      append_ask_message: {
        Args: {
          p_asked_on_behalf: string
          p_content: string
          p_conversation_id: string
          p_result: Json
          p_role: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      append_website_document: {
        Args: {
          p_content_hash: string
          p_document: Json
          p_expected_revision: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          content_hash: string
          created_at: string
          created_by: string
          document: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }[]
      }
      append_workspace_export_build_part: {
        Args: {
          p_body: string
          p_build_id: string
          p_part: number
        }
        Returns: undefined
      }
      application_assert_identity: {
        Args: {
          p_manager?: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      application_is_valid_date_only: {
        Args: {
          p_value: string
        }
        Returns: boolean
      }
      application_issue_use_grant: {
        Args: {
          p_expires_at: string
          p_purpose: string
          p_recipient_email: string
          p_record_edit_scope: string
          p_record_read_scope: string
          p_record_submit: boolean
          p_user_id: string
          p_verified_email: string
          p_views: string[]
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          revoked_at: string | null
          revoked_by: string | null
          status: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      application_lock: {
        Args: {
          p_work_id: string
        }
        Returns: undefined
      }
      application_lock_work: {
        Args: {
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      application_runtime_snapshot: {
        Args: {
          p_work_id: string
        }
        Returns: Json
      }
      application_touch_compatibility: {
        Args: {
          p_kind: string
          p_patch: Json
          p_user_id: string
          p_work_id: string
        }
        Returns: undefined
      }
      application_use_distinct_views: {
        Args: {
          value: string[]
        }
        Returns: boolean
      }
      approve_website_document: {
        Args: {
          p_content_hash: string
          p_revision: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      approve_website_domain_change: {
        Args: {
          p_hostname: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ask_history_actor_role: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      authorize_website_domain_change: {
        Args: {
          p_action: string
          p_hostname: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      bind_offering_website: {
        Args: {
          p_business_id: string
          p_command_digest: string
          p_idempotency_key: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          actor_has_tenant_access: boolean
          business_workspace_id: string
          created_at: string
          created_by: string
          id: string
          revision: number
          revocation_reason: string
          revoked_at: string
          revoked_by: string
          site_name: string
          status: string
          tenant_active: boolean
          tenant_id: string
          updated_at: string
          updated_by: string
        }[]
      }
      booking_json: {
        Args: {
          b: unknown
        }
        Returns: Json
      }
      booking_tenant: {
        Args: {
          p_tenant_id: string
        }
        Returns: {
          system_id: string
          system_lifecycle: string
          tenant_stable_id: string
          workspace_id: string
        }[]
      }
      business_billing_json: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      business_billing_payment_status: {
        Args: {
          p_status: string
        }
        Returns: string
      }
      business_billing_state_from: {
        Args: {
          p_billing: Json
        }
        Returns: string
      }
      business_billing_state_rank: {
        Args: {
          p_state: string
        }
        Returns: number
      }
      business_contact_phone_key: {
        Args: {
          p_phone: string
        }
        Returns: string
      }
      business_contact_sources: {
        Args: never
        Returns: string[]
      }
      business_effort_assert_operator: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      business_effort_row: {
        Args: {
          p_entry_id: string
        }
        Returns: Json
      }
      business_outcome_month: {
        Args: {
          p_month: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      business_payer_apply: {
        Args: {
          p_workspace_id: string
        }
        Returns: undefined
      }
      business_payer_party: {
        Args: {
          p_workspace_id: string
        }
        Returns: Record<string, unknown>
      }
      business_record_agency_work_ids: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: string[]
      }
      business_record_apply: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_command_digest: string
          p_command_id: string
          p_contacts: Json
          p_patch: Json
          p_source: string
          p_undo_of: number
          p_workspace_id: string
        }
        Returns: Json
      }
      business_record_assert_actor: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: string
      }
      business_record_begin_write: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_source: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Record<string, unknown>
      }
      business_record_email_valid: {
        Args: {
          p_email: string
        }
        Returns: boolean
      }
      business_record_entity_state: {
        Args: {
          p_entity: string
          p_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      business_record_entity_write: {
        Args: {
          p_actor_id: string
          p_entity: string
          p_id: string
          p_state: Json
          p_workspace_id: string
        }
        Returns: undefined
      }
      business_record_fact_valid: {
        Args: {
          p_key: string
          p_value: Json
        }
        Returns: boolean
      }
      business_record_revision_touches_contacts: {
        Args: {
          p_changes: Json
        }
        Returns: boolean
      }
      business_record_sources: {
        Args: never
        Returns: string[]
      }
      business_record_text_valid: {
        Args: {
          p_max: number
          p_min: number
          p_value: Json
        }
        Returns: boolean
      }
      business_record_time_valid: {
        Args: {
          p_value: Json
        }
        Returns: boolean
      }
      change_service_delivery_commitment: {
        Args: {
          p_change: Json
          p_command_digest: string
          p_expected_revision: number
          p_idempotency_key: string
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      checkpoint_operational_assignment: {
        Args: {
          p_assignment_id: string
          p_expected_revision: number
          p_payload: Json
          p_phase: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      choose_business_provider: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      claim_booking_messages: {
        Args: {
          p_limit: number
          p_now: string
        }
        Returns: Json
      }
      claim_internal_tool_notice: {
        Args: {
          p_field_id: string
          p_record_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      claim_owner_decision: {
        Args: {
          p_by_kind: string
          p_decision: string
          p_decision_id: string
          p_recipient: string
          p_revision_hash: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      claim_website_rebuild: {
        Args: {
          p_domain_key: string
          p_input: Json
          p_payload: Json
          p_request_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      client_record_parity_streak: {
        Args: {
          p_store: string
        }
        Returns: Json
      }
      commit_agency_website_document_candidate: {
        Args: {
          p_binding_id: string
          p_content_hash: string
          p_document: Json
          p_expected_candidate_hash: string
          p_expected_candidate_revision: number
          p_expected_document_revision: number
          p_expected_work_revision: number
          p_payload: Json
          p_section: string
          p_subscription_exemption?: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      commit_website_document_candidate: {
        Args: {
          p_content_hash: string
          p_document: Json
          p_expected_document_revision: number
          p_expected_work_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      commit_work_auxiliary: {
        Args: {
          p_domain: string
          p_expected_revision: number
          p_expected_work_revision: string
          p_intent: string
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: undefined
      }
      complete_workspace_exit: {
        Args: {
          p_command_digest: string
          p_future_work: string
          p_idempotency_key: string
          p_maintained_resources: Json
          p_notes?: string
          p_provider_participation: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      complete_workspace_exit_base: {
        Args: {
          p_command_digest: string
          p_future_work: string
          p_idempotency_key: string
          p_maintained_resources: Json
          p_notes?: string
          p_provider_participation: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      complete_workspace_export_build: {
        Args: {
          p_build_id: string
          p_category_counts: Json
          p_manifest: Json
          p_token_hash: string
        }
        Returns: Json
      }
      confirm_connected_site_verification: {
        Args: {
          p_observed: string[]
          p_site_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      confirm_google_listing_receipt: {
        Args: {
          p_readback: string
          p_receipt_id: string
          p_status: string
          p_workspace_id: string
        }
        Returns: Json
      }
      connect_system: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_input: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      connected_site_assert_actor: {
        Args: {
          p_manage: boolean
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      connected_site_for_write: {
        Args: {
          p_origin: string
          p_public_key: string
        }
        Returns: {
          allowed_origins: string[]
          business_workspace_id: string
          capture_forms: boolean
          created_at: string
          created_by: string
          first_event_at: string | null
          id: string
          inject_schema: boolean
          label: string
          last_event_at: string | null
          platform: string
          public_key: string
          revoked_at: string | null
          site_host: string
          site_url: string
          status: string
          updated_at: string
          verification_token: string
          verified_at: string | null
          verified_by: string | null
        }
      }
      connected_site_json: {
        Args: {
          p_manage: boolean
          s: unknown
        }
        Returns: Json
      }
      convert_tenant_to_business: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_import: Json
          p_operator_email: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_business_system: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_input: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_connected_site: {
        Args: {
          p_input: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_make_real_activation: {
        Args: {
          p_activation: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_operator_owner_invitation: {
        Args: {
          p_expires_at: string
          p_operator_email: string
          p_recipient_email: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_owned_workspace: {
        Args: {
          p_kind: string
          p_name: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          updated_at: string
        }[]
      }
      create_product_learning_work: {
        Args: {
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      create_system_possibility: {
        Args: {
          p_body: Json
          p_source_ref: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_system_version: {
        Args: {
          p_lineage: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      create_system_version_source: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_input: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      create_workspace_handoff: {
        Args: {
          p_expires_at: string
          p_recipient_email: string
          p_source_work_id: string
          p_token_hash: string
          p_user_id: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_destination_kind: string | null
          accepted_destination_name: string | null
          agency_workspace_id: string
          created_at: string
          created_by: string
          customer_work_id: string | null
          customer_workspace_id: string | null
          delegation_id: string | null
          expires_at: string
          id: string
          recipient_email: string
          revoked_at: string | null
          revoked_by: string | null
          source_work_id: string
          status: string
          token_hash: string
        }[]
      }
      create_workspace_invitation: {
        Args: {
          p_actor_id: string
          p_expires_at: string
          p_recipient_email: string
          p_role: string
          p_token_hash: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          issued_by_kind: string
          recipient_email: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          token_hash: string
          workspace_id: string
        }[]
      }
      custom_application_artifact_summary: {
        Args: {
          p_application_version: number
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_assert_identity: {
        Args: {
          p_manager?: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
      }
      custom_application_digest: {
        Args: {
          p_application_version: number
          p_html: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      custom_application_grant: {
        Args: {
          p_expires_at: string
          p_purpose: string
          p_recipient_email: string
          p_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          release_version: number
          revoked_at: string | null
          revoked_by: string | null
          status: string
          work_id: string
          workspace_id: string
        }
      }
      custom_application_list_grants: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          release_version: number
          revoked_at: string | null
          revoked_by: string | null
          status: string
          work_id: string
          workspace_id: string
        }[]
      }
      custom_application_preview: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_read: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_release: {
        Args: {
          p_expected_candidate_revision: number
          p_expected_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_retire: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_review: {
        Args: {
          p_artifact_digest: string
          p_checks: Json
          p_expected_candidate_revision: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_revoke_grant: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: undefined
      }
      custom_application_rollback: {
        Args: {
          p_expected_release_version: number
          p_target_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_set_budget: {
        Args: {
          p_estimate_cents: number
          p_job_id: string
          p_max_authorized_cents: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      custom_application_sha256: {
        Args: {
          p_value: string
        }
        Returns: string
      }
      custom_application_source_digest: {
        Args: {
          p_files: Json
        }
        Returns: string
      }
      custom_application_state_json: {
        Args: {
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_store_artifact: {
        Args: {
          p_application_version: number
          p_artifact_digest: string
          p_built_at: string
          p_duration_ms: number
          p_expected_candidate_revision: number
          p_html: string
          p_image: string
          p_limits: Json
          p_source_digest: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_touch_work: {
        Args: {
          p_actor_id: string
          p_kind: string
          p_work_id: string
        }
        Returns: undefined
      }
      custom_application_update_candidate: {
        Args: {
          p_expected_candidate_revision: number
          p_files: Json
          p_title: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_use: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      custom_application_validate_files: {
        Args: {
          p_files: Json
          p_source_digest: string
        }
        Returns: undefined
      }
      decide_held_workspace_lead: {
        Args: {
          p_decision: string
          p_lead_row_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      decide_provider_delivery: {
        Args: {
          p_decision: string
          p_delivery_id: string
          p_expected_revision: number
          p_note: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }[]
      }
      decide_workspace_booking_request: {
        Args: {
          p_actor: string
          p_booking_id: string
          p_decision: string
          p_workspace_id: string
        }
        Returns: Json
      }
      deprovision_tenant_rows: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      designate_strelva_agency_workspace: {
        Args: {
          p_operator_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      due_make_real_activations: {
        Args: {
          p_grace_seconds: number
          p_limit: number
        }
        Returns: Json
      }
      due_make_real_activations_for_service: {
        Args: {
          p_grace_seconds: number
          p_limit: number
        }
        Returns: Json
      }
      due_workspace_work: {
        Args: {
          p_limit?: number
        }
        Returns: {
          email: string
          id: string
          product_id: string
          user_id: string
        }[]
      }
      edit_application_use_record: {
        Args: {
          p_expected_record_revision: number
          p_grant_id: string
          p_idempotency_key: string
          p_record: Json
          p_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          records: Json
          release_version: number
          released_spec: Json
          revoked_at: string
          status: string
          title: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      end_business_provider: {
        Args: {
          p_reason: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      end_provider_seat: {
        Args: {
          p_agency_workspace_id: string
          p_reason: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      enter_customer_business: {
        Args: {
          p_business_id: string
          p_command_digest: string
          p_command_id: string
          p_name: string
          p_request_text: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      escalate_owner_decision: {
        Args: {
          p_decision_id: string
          p_note: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      execute_agency_managed_website_draft: {
        Args: {
          p_binding_id: string
          p_section: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          assignment_id: string
          data: Json
          data_hash: string
          managed_website_binding_id: string
          preparation_id: string
          revision: number
          revision_id: string
          section: string
          tenant_id: string
        }[]
      }
      execute_agency_managed_website_draft_server: {
        Args: {
          p_binding_id: string
          p_section: string
          p_subscription_exemption: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          assignment_id: string
          data: Json
          data_hash: string
          managed_website_binding_id: string
          preparation_id: string
          revision: number
          revision_id: string
          section: string
          tenant_id: string
        }[]
      }
      execute_work_plan_output: {
        Args: {
          p_idempotency_key: string
          p_input_digest: string
          p_native_input: Json
          p_native_payload: Json
          p_native_product_id: string
          p_native_resource_kind: string
          p_native_title: string
          p_operation_id: string
          p_output_id: string
          p_plan_revision: number
          p_plan_work_id: string
          p_source_references: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          execution_id: string
          native_product_id: string
          native_resource_kind: string
          native_work_id: string
          output_id: string
          plan_revision: number
          plan_work_id: string
          receipt: Json
          replayed: boolean
          status: string
        }[]
      }
      expire_booking_holds: {
        Args: {
          p_now: string
        }
        Returns: Json
      }
      expire_owner_decision: {
        Args: {
          p_decision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_public_website_bookings: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_snapshot: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_snapshot_base: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_snapshot_pre_website_documents: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category: {
        Args: {
          p_category: string
          p_limit: number
          p_offset: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      fail_workspace_export_build: {
        Args: {
          p_build_id: string
          p_failure: string
        }
        Returns: undefined
      }
      finish_booking_message: {
        Args: {
          p_detail: string
          p_message_id: string
          p_provider_message_id: string
          p_status: string
        }
        Returns: Json
      }
      finish_internal_tool_notice: {
        Args: {
          p_detail: string
          p_notice_id: string
          p_provider_message_id: string
          p_status: string
          p_workspace_id: string
        }
        Returns: Json
      }
      finish_owner_decision: {
        Args: {
          p_decision_id: string
          p_outcome: string
          p_reason: string
          p_receipt_ref: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_job_economics: {
        Args: {
          p_actor_id: string
          p_job_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          actual_cents: number | null
          actual_known: boolean
          business_id: string | null
          capability_id: string | null
          created_at: string
          created_by: string
          currency: string
          estimate_cents: number | null
          id: string
          max_authorized_cents: number
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          product_id: string
          request_id: string | null
          reserved_cents: number
          resource_kind: string
          status: string
          strelva_retry_cents: number
          tenant_id: string | null
          updated_at: string
          used_cents: number
          work_id: string | null
          workspace_id: string | null
        }[]
      }
      google_listing_receipt_json: {
        Args: {
          r: unknown
        }
        Returns: Json
      }
      grant_agency_application_draft_edit: {
        Args: {
          p_delivery_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          agency_workspace_id: string
          application_work_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          installation_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
        }[]
      }
      grant_agency_managed_website_draft_edit: {
        Args: {
          p_binding_id: string
          p_delivery_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }[]
      }
      grant_agency_managed_website_draft_edit_server: {
        Args: {
          p_binding_id: string
          p_delivery_id: string
          p_subscription_exemption: boolean
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }[]
      }
      grant_application_use: {
        Args: {
          p_expires_at: string
          p_purpose: string
          p_recipient_email: string
          p_record_read_scope: string
          p_record_submit: boolean
          p_user_id: string
          p_verified_email: string
          p_views: string[]
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          revoked_at: string | null
          revoked_by: string | null
          status: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      grant_application_use_with_edit: {
        Args: {
          p_expires_at: string
          p_purpose: string
          p_recipient_email: string
          p_record_edit_scope: string
          p_record_read_scope: string
          p_record_submit: boolean
          p_user_id: string
          p_verified_email: string
          p_views: string[]
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          revoked_at: string | null
          revoked_by: string | null
          status: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      hold_tenant_lead_as_spam: {
        Args: {
          p_spam: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      import_public_continuation: {
        Args: {
          p_continuation_id: string
          p_input: Json
          p_payload: Json
          p_title: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          already_imported: boolean
          work_id: string
          workspace_id: string
        }[]
      }
      increment_site_metric: {
        Args: {
          p_day: string
          p_metric: string
          p_tenant_id: string
        }
        Returns: number
      }
      inquiry_assert_member: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      inquiry_event_write: {
        Args: {
          p_actor: string
          p_actor_id: string
          p_dedupe: string
          p_detail: Json
          p_kind: string
          p_lead_id: string
          p_stable: string
          p_workspace: string
        }
        Returns: boolean
      }
      inquiry_lead_json: {
        Args: {
          l: unknown
        }
        Returns: Json
      }
      inspect_workspace_invitation: {
        Args: {
          p_token_hash: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          recipient_email: string
          role: string
          status: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      install_offering: {
        Args: {
          p_accepted_scope: string[]
          p_business_id: string
          p_command_digest: string
          p_configuration: Json
          p_definition_id: string
          p_definition_version: string
          p_idempotency_key: string
          p_native_resources: Json
          p_responsibility: Json
          p_surface_ids: string[]
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration: Json
          definition_id: string
          definition_version: string
          id: string
          idempotency_key: string
          installed_at: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          revision: number
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
        }[]
      }
      issue_agent_access_token: {
        Args: {
          p_agent_label: string
          p_expected_revision: number
          p_expected_work_revision: string
          p_expires_at: string
          p_grant_id: string
          p_payload: Json
          p_scopes: string[]
          p_token_hash: string
          p_token_id: string
          p_token_prefix: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: undefined
      }
      issue_system_output: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_input: Json
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      job_economics_command: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          actual_cents: number | null
          actual_known: boolean
          business_id: string | null
          capability_id: string | null
          created_at: string
          created_by: string
          currency: string
          estimate_cents: number | null
          id: string
          max_authorized_cents: number
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          product_id: string
          request_id: string | null
          reserved_cents: number
          resource_kind: string
          status: string
          strelva_retry_cents: number
          tenant_id: string | null
          updated_at: string
          used_cents: number
          work_id: string | null
          workspace_id: string | null
        }[]
      }
      job_economics_command_with_payer_authority: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          actual_cents: number | null
          actual_known: boolean
          business_id: string | null
          capability_id: string | null
          created_at: string
          created_by: string
          currency: string
          estimate_cents: number | null
          id: string
          max_authorized_cents: number
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          product_id: string
          request_id: string | null
          reserved_cents: number
          resource_kind: string
          status: string
          strelva_retry_cents: number
          tenant_id: string | null
          updated_at: string
          used_cents: number
          work_id: string | null
          workspace_id: string | null
        }[]
      }
      job_economics_create_with_payer_transition: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          actual_cents: number | null
          actual_known: boolean
          business_id: string | null
          capability_id: string | null
          created_at: string
          created_by: string
          currency: string
          estimate_cents: number | null
          id: string
          max_authorized_cents: number
          payer_id: string
          payer_kind: string
          payer_workspace_id: string | null
          product_id: string
          request_id: string | null
          reserved_cents: number
          resource_kind: string
          status: string
          strelva_retry_cents: number
          tenant_id: string | null
          updated_at: string
          used_cents: number
          work_id: string | null
          workspace_id: string | null
        }[]
      }
      job_economics_execution_command: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: Json
      }
      job_economics_payer_inbox: {
        Args: {
          p_actor_id: string
          p_verified_email: string
        }
        Returns: {
          actual_cents: number
          actual_known: boolean
          created_at: string
          estimate_cents: number
          id: string
          max_authorized_cents: number
          product_id: string
          reserved_cents: number
          resource_kind: string
          status: string
          used_cents: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      lapse_booking_requests: {
        Args: {
          p_limit: number
          p_now: string
        }
        Returns: Json
      }
      link_service_request_delivery: {
        Args: {
          p_business_id: string
          p_command_digest: string
          p_delivery_id: string
          p_expected_revision: number
          p_idempotency_key: string
          p_installation_id: string
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      list_agency_application_draft_work: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          application_title: string
          application_work_id: string
          assignment_expires_at: string
          assignment_id: string
          customer_workspace_id: string
          customer_workspace_name: string
          delivery_id: string
          draft_grant_expires_at: string
          draft_grant_status: string
        }[]
      }
      list_agency_managed_website_draft_work: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          assignment_expires_at: string
          assignment_id: string
          customer_workspace_id: string
          customer_workspace_name: string
          delivery_id: string
          draft_grant_expires_at: string
          draft_grant_status: string
          managed_website_binding_id: string
          site_name: string
          tenant_id: string
        }[]
      }
      list_application_use_grants: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          revoked_at: string | null
          revoked_by: string | null
          status: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      list_ask_conversations: {
        Args: {
          p_limit: number
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_connected_sites: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_decision_policy_businesses: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      list_open_owner_decisions_for_delivery: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      list_owner_decisions: {
        Args: {
          p_include_closed: boolean
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_owner_decisions_not_told: {
        Args: {
          p_limit: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      list_provided_clients: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      list_system_possibilities: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_website_change_requests: {
        Args: {
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_work_plan_outputs: {
        Args: {
          p_plan_work_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          execution_id: string
          native_product_id: string
          native_resource_kind: string
          native_work_id: string
          output_id: string
          plan_revision: number
          plan_work_id: string
          receipt: Json
          replayed: boolean
          status: string
        }[]
      }
      make_real_activation_actor: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: undefined
      }
      make_real_activation_is_count: {
        Args: {
          p_value: Json
        }
        Returns: boolean
      }
      make_real_activation_is_time: {
        Args: {
          p_value: Json
        }
        Returns: boolean
      }
      make_real_activation_set_writer: {
        Args: {
          p_on: boolean
        }
        Returns: undefined
      }
      make_real_activation_shape_valid: {
        Args: {
          p: Json
          p_workspace_id: string
        }
        Returns: boolean
      }
      make_real_activation_step_frame: {
        Args: {
          p_step: Json
        }
        Returns: Json
      }
      manage_published_website_tenant: {
        Args: {
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      manage_website_document: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      mark_tenant_report_sent: {
        Args: {
          p_sent_at: string
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
      mark_workspace_calendar_connection_error: {
        Args: {
          p_message: string
          p_provider: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      needs_you_change_kinds: {
        Args: never
        Returns: string[]
      }
      needs_you_kind_default: {
        Args: {
          p_kind: string
        }
        Returns: string
      }
      needs_you_kind_floor: {
        Args: {
          p_kind: string
        }
        Returns: string
      }
      needs_you_linked_tenants: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      needs_you_member_role: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      needs_you_operator_id: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
      }
      needs_you_owner_actor: {
        Args: {
          p_recipient: string
          p_workspace_id: string
        }
        Returns: Json
      }
      needs_you_route_rank: {
        Args: {
          p_route: string
        }
        Returns: number
      }
      needs_you_sign_in_kind: {
        Args: {
          p_kind: string
        }
        Returns: boolean
      }
      needs_you_strelva_route: {
        Args: {
          p_kind: string
          p_system_key: string
          p_workspace_id: string
        }
        Returns: string
      }
      needs_you_tenant_link: {
        Args: {
          p_tenant_id: string
        }
        Returns: Record<string, unknown>
      }
      observe_system_revision: {
        Args: {
          p_implementation: Json
          p_summary: string
          p_system_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      observe_tenant_content: {
        Args: {
          p_tenant_id: string
          p_version_ref: string
        }
        Returns: number
      }
      offer_agency_operational_assignment: {
        Args: {
          p_agency_workspace_id: string
          p_assignee_email: string
          p_assignee_kind: string
          p_expires_at: string
          p_idempotency_key: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          accepted_at: string | null
          active_actor_id: string | null
          active_attempt: number | null
          active_lease_id: string | null
          active_started_at: string | null
          active_step_id: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id: string | null
          expires_at: string
          id: string
          offer_key: string
          offered_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          sponsor_email: string
          sponsor_id: string
          status: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }[]
      }
      offer_operational_assignment: {
        Args: {
          p_assignee_email: string
          p_assignee_kind: string
          p_expires_at: string
          p_idempotency_key: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          accepted_at: string | null
          active_actor_id: string | null
          active_attempt: number | null
          active_lease_id: string | null
          active_started_at: string | null
          active_step_id: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id: string | null
          expires_at: string
          id: string
          offer_key: string
          offered_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          sponsor_email: string
          sponsor_id: string
          status: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }[]
      }
      offering_assert_actor: {
        Args: {
          p_business_id: string
          p_manage: boolean
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
      }
      offering_assert_install_payload: {
        Args: {
          p_accepted_scope: string[]
          p_business_id: string
          p_configuration: Json
          p_definition_id: string
          p_definition_version: string
          p_native_resources: Json
          p_responsibility: Json
          p_surface_ids: string[]
        }
        Returns: undefined
      }
      offering_assert_metadata: {
        Args: {
          p_accepted_scope: string[]
          p_configuration: Json
          p_responsibility: Json
          p_surface_ids: string[]
        }
        Returns: undefined
      }
      open_owner_decision: {
        Args: {
          p_item: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      open_owner_decision_as_service: {
        Args: {
          p_item: Json
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      operational_assignment_work_scope: {
        Args: {
          p_payload: Json
        }
        Returns: Json
      }
      operator_owner_invitation_assert: {
        Args: {
          p_operator_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      operator_owner_invitation_tenants: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      operator_queue_assert_operator: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      operator_queue_mark_row: {
        Args: {
          p_source: string
          p_source_ref: string
        }
        Returns: Json
      }
      outside_write_receipt_row: {
        Args: {
          p_id: string
        }
        Returns: Json
      }
      owner_decision_json: {
        Args: {
          d: unknown
        }
        Returns: Json
      }
      patch_business_record: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_expected_revision: number
          p_patch: Json
          p_source: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      pause_tenant_systems: {
        Args: {
          p_tenant_id: string
        }
        Returns: number
      }
      platform_serves_business: {
        Args: {
          p_effect: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      platform_service_effect: {
        Args: {
          p_purpose: string
        }
        Returns: string
      }
      platform_service_identity: {
        Args: {
          p_provider_workspace_id: string
          p_workspace_id: string
        }
        Returns: Record<string, unknown>
      }
      platform_service_identity_holds: {
        Args: {
          p_provider_workspace_id: string
          p_role: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      platform_service_session_holds: {
        Args: {
          p_session: unknown
        }
        Returns: boolean
      }
      platform_serving_provider: {
        Args: {
          p_effect: string
          p_workspace_id: string
        }
        Returns: string
      }
      prepare_agency_managed_website_draft: {
        Args: {
          p_assignment_id: string
          p_binding_id: string
          p_data: Json
          p_expected_hash: string
          p_expected_revision: number
          p_section: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          consumed_at: string | null
          created_at: string
          data: Json
          delivery_id: string
          expected_hash: string
          expected_revision: number
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revision_id: string | null
          section: string
          status: string
          tenant_id: string
        }[]
      }
      prepare_agency_managed_website_draft_server: {
        Args: {
          p_assignment_id: string
          p_binding_id: string
          p_data: Json
          p_expected_hash: string
          p_expected_revision: number
          p_section: string
          p_subscription_exemption: boolean
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          consumed_at: string | null
          created_at: string
          data: Json
          delivery_id: string
          expected_hash: string
          expected_revision: number
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revision_id: string | null
          section: string
          status: string
          tenant_id: string
        }[]
      }
      prepare_staff_request_offering: {
        Args: {
          p_accepted_scope: string[]
          p_business_id: string
          p_command_digest: string
          p_configuration: Json
          p_idempotency_key: string
          p_responsibility: Json
          p_surface_ids: string[]
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration: Json
          definition_id: string
          definition_version: string
          id: string
          idempotency_key: string
          installed_at: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          revision: number
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
        }[]
      }
      preview_tenant_unlink: {
        Args: {
          p_operator_email: string
          p_tenant_id: string
        }
        Returns: Json
      }
      provider_seat_assert_owner: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      provider_seat_businesses: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          role: string
          workspace_id: string
        }[]
      }
      provider_seat_direct_role: {
        Args: never
        Returns: string
      }
      provider_seat_role: {
        Args: {
          p_lock: boolean
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      prune_website_crawl_pages: {
        Args: never
        Returns: {
          removed: number
        }[]
      }
      publish_application_candidate: {
        Args: {
          p_expected_candidate_revision: number
          p_expected_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      publish_public_website_booking_grant: {
        Args: {
          p_business_id: string
          p_capability_id: string
          p_capability_version: number
          p_display_name: string
          p_inquiry_capability_id: string
          p_inquiry_version: number
          p_provider: string
          p_tenant_id: string
          p_time_zone: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          business_workspace_id: string
          capability_id: string
          capability_version: number
          created_at: string
          display_name: string
          id: string
          inquiry_capability_id: string
          inquiry_version: number
          provider: string
          published_at: string
          published_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_stable_id: string
          time_zone: string
          updated_at: string
          work_id: string
        }[]
      }
      publish_system_version_source_revision: {
        Args: {
          p_revision: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      publish_website_document: {
        Args: {
          p_content_hash: string
          p_receipt: Json
          p_revision: number
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      publish_website_document_to_linked_tenant: {
        Args: {
          p_content_hash: string
          p_receipt: Json
          p_revision: number
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      purge_connected_site_records: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      purge_expired_tenant_leads: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      put_system_revision_content: {
        Args: {
          p_content: Json
          p_content_hash: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      put_system_version_source: {
        Args: {
          p_shared_with: string[]
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agency_application_draft_edit: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          agency_workspace_id: string
          application_work_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          installation_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
        }[]
      }
      read_agency_managed_website_draft_edit: {
        Args: {
          p_binding_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }[]
      }
      read_agency_managed_website_draft_preparation: {
        Args: {
          p_binding_id: string
          p_section: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          consumed_at: string | null
          created_at: string
          data: Json
          delivery_id: string
          expected_hash: string
          expected_revision: number
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revision_id: string | null
          section: string
          status: string
          tenant_id: string
        }[]
      }
      read_agency_managed_website_draft_preparation_server: {
        Args: {
          p_binding_id: string
          p_section: string
          p_subscription_exemption: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          consumed_at: string | null
          created_at: string
          data: Json
          delivery_id: string
          expected_hash: string
          expected_revision: number
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revision_id: string | null
          section: string
          status: string
          tenant_id: string
        }[]
      }
      read_agency_managed_website_draft_state: {
        Args: {
          p_binding_id: string
          p_section: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          data: Json
          data_hash: string
          revision: number
          section: string
          tenant_id: string
        }[]
      }
      read_agency_managed_website_draft_tenant: {
        Args: {
          p_binding_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          account_id: string | null
          active: boolean
          admin_domain: string | null
          auto_approve_threshold: number | null
          auto_publish: boolean
          behold_feed_id: string | null
          billing_type: string | null
          booking_provider: string | null
          booking_url: string | null
          branding: Json | null
          business_hours: Json | null
          business_rules: string | null
          commitment_ends_at: string | null
          created_at: string
          custom_domains: string[] | null
          custom_repo: Json | null
          delivery_model: string
          features: string[] | null
          google_search_console_key: string | null
          id: string
          industry: string | null
          instagram_access_token: string | null
          integrations: string[] | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          personality: string | null
          plan_currency: string | null
          plan_monthly_cents: number | null
          plan_override: string | null
          production_domain: string | null
          referred_by: string | null
          resend_domain: string | null
          revalidate_url: string | null
          revalidation_secret: string | null
          reviews_config: Json | null
          site_capabilities: Json | null
          site_name: string
          site_url: string | null
          slack_webhook_url: string | null
          social_config: Json | null
          stable_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_past_due_since: string | null
          subscription_plan: string | null
          subscription_started_at: string | null
          subscription_status: string
          template: string | null
          updated_at: string
          visibility: Json | null
        }[]
      }
      read_agency_provider_seats: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_agency_verification: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_agency_verification_history: {
        Args: {
          p_agency_workspace_id: string
          p_operator_email: string
        }
        Returns: Json
      }
      read_agency_website_document_candidate: {
        Args: {
          p_binding_id: string
          p_section?: string
          p_subscription_exemption?: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id?: string
        }
        Returns: Json
      }
      read_application_use: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_read_scope: string
          record_submit: boolean
          records: Json
          release_version: number
          released_spec: Json
          revoked_at: string
          status: string
          title: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      read_application_use_v2: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          records: Json
          release_version: number
          released_spec: Json
          revoked_at: string
          status: string
          title: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      read_ask_conversation: {
        Args: {
          p_conversation_id: string
          p_limit: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_billing: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_contacts: {
        Args: {
          p_limit?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_effort: {
        Args: {
          p_business_id: string
          p_from: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_business_publishing: {
        Args: {
          p_limit: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_record: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_record_history: {
        Args: {
          p_limit?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_system: {
        Args: {
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_systems: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_versions: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_connected_site_activity: {
        Args: {
          p_days: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_connected_site_context: {
        Args: {
          p_public_key: string
        }
        Returns: Json
      }
      read_connected_site_inquiries: {
        Args: {
          p_limit: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_decision_policies: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_decision_policy_state: {
        Args: {
          p_kind: string
          p_system_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_effort_businesses: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_existing_business_systems: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_google_binding_for_tenant: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_google_listing_readback_failures: {
        Args: {
          p_limit: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_google_listing_receipt: {
        Args: {
          p_receipt_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_inquiry_workspace_exit: {
        Args: {
          p_tenant_stable_id: string
        }
        Returns: {
          exit_completed: boolean
          installation_id: string
          installation_status: string
          workspace_id: string
        }[]
      }
      read_internal_tool_notices: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_make_real_activation: {
        Args: {
          p_activation_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_offering_business_snapshot: {
        Args: {
          p_business_id: string
          p_installation_id?: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_offering_installations: {
        Args: {
          p_business_id: string
          p_installation_id?: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          installation: Json
          workspace_role: string
        }[]
      }
      read_operational_assignment: {
        Args: {
          p_access?: string
          p_assignment_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_operational_assignment_for_work: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          accepted_at: string | null
          active_actor_id: string | null
          active_attempt: number | null
          active_lease_id: string | null
          active_started_at: string | null
          active_step_id: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id: string | null
          expires_at: string
          id: string
          offer_key: string
          offered_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          sponsor_email: string
          sponsor_id: string
          status: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }[]
      }
      read_operator_owner_invitation_state: {
        Args: {
          p_operator_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_operator_queue_context: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_outside_write_receipts: {
        Args: {
          p_limit: number
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_owner_decision: {
        Args: {
          p_decision_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_platform_workspace: {
        Args: {
          p_role: string
        }
        Returns: string
      }
      read_provider_deliveries: {
        Args: {
          p_business_id: string
          p_delivery_id?: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }[]
      }
      read_provider_delivery: {
        Args: {
          p_delivery_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }[]
      }
      read_public_booking_by_manage_token: {
        Args: {
          p_token_hash: string
        }
        Returns: Json
      }
      read_public_continuation_import: {
        Args: {
          p_continuation_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          work_id: string
          workspace_id: string
        }[]
      }
      read_public_website_booking_grants: {
        Args: {
          p_business_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          business_workspace_id: string
          capability_id: string
          capability_version: number
          created_at: string
          display_name: string
          id: string
          inquiry_capability_id: string
          inquiry_version: number
          provider: string
          published_at: string
          published_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_stable_id: string
          time_zone: string
          updated_at: string
          work_id: string
        }[]
      }
      read_published_website_documents: {
        Args: {
          p_tenant_id?: string
        }
        Returns: {
          content_hash: string
          created_at: string
          created_by: string
          document: Json
          receipt: Json
          revision: number
          tenant_id: string
          website_work_id: string
          workspace_id: string
        }[]
      }
      read_ready_system_possibilities: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_service_delivery_permissions: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_service_delivery_work: {
        Args: {
          p_agency_workspace_id?: string
          p_provider_kind: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      read_service_request: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      read_service_requests_for_agency: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      read_service_requests_for_business: {
        Args: {
          p_business_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      read_service_requests_for_strelva: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      read_strelva_handled: {
        Args: {
          p_since: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_possibility: {
        Args: {
          p_possibility_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_possibility_preview: {
        Args: {
          p_candidate_revision: number
          p_possibility_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_revision_content: {
        Args: {
          p_content_hash: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_version: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_version_id: string
        }
        Returns: Json
      }
      read_system_version_connection_owner: {
        Args: {
          p_connection_ref: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
      }
      read_system_version_for_system: {
        Args: {
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_version_source: {
        Args: {
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_version_source_revisions: {
        Args: {
          p_number: number
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_tenant_analytics_config: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_binding_target: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_booking_context: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_booking_history: {
        Args: {
          p_ref: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_bookings: {
        Args: {
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: Json
      }
      read_tenant_client_record_digests: {
        Args: {
          p_store: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_client_records: {
        Args: {
          p_before: string
          p_limit: number
          p_store: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_decision_routes: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_lead: {
        Args: {
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_lead_digests: {
        Args: {
          p_since: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_leads: {
        Args: {
          p_before: string
          p_limit: number
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_report_state: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_workspace_link: {
        Args: {
          p_operator_email: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_version_actor: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_website_crawl_pages: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          expires_at: string
          html_bytes: number
          page: Json
          source_id: string
          website_work_id: string
          workspace_id: string
        }[]
      }
      read_website_current_tenant: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          delivery_model: string
          source: string
          tenant_id: string
        }[]
      }
      read_website_document_receipts: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          receipt: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }[]
      }
      read_website_documents: {
        Args: {
          p_all?: boolean
          p_revision?: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          content_hash: string
          created_at: string
          created_by: string
          document: Json
          revision: number
          website_work_id: string
          workspace_id: string
        }[]
      }
      read_website_domain_approvals: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          approved_at: string
          approved_by: string
          current: boolean
          expires_at: string
          hostname: string
        }[]
      }
      read_website_linked_publications: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          content_hash: string
          fallback_until: string
          prior_delivery_model: string
          published_at: string
          published_by: string
          revision: number
          tenant_id: string
          tenant_slug_at_publication: string
        }[]
      }
      read_work_allowances: {
        Args: {
          p_actor_id: string
          p_allowance_id?: string
          p_verified_email: string
          p_workspace_id?: string
        }
        Returns: Json
      }
      read_work_auxiliary: {
        Args: {
          p_domain: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      read_work_granted_source: {
        Args: {
          p_operation: string
          p_source_work_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      read_work_plan_output: {
        Args: {
          p_idempotency_key: string
          p_input_digest: string
          p_operation_id: string
          p_output_id: string
          p_plan_revision: number
          p_plan_work_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          execution_id: string
          native_product_id: string
          native_resource_kind: string
          native_work_id: string
          output_id: string
          plan_revision: number
          plan_work_id: string
          receipt: Json
          replayed: boolean
          status: string
        }[]
      }
      read_workspace_booking: {
        Args: {
          p_booking_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_booking_requests: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_exit_state: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_export_build: {
        Args: {
          p_build_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_workspace_export_build_part: {
        Args: {
          p_build_id: string
          p_part: number
          p_token_hash: string
        }
        Returns: Json
      }
      read_workspace_inquiry_events: {
        Args: {
          p_lead_row_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_leads: {
        Args: {
          p_before: string
          p_limit: number
          p_states: string[]
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_release_flag_history: {
        Args: {
          p_limit: number
          p_operator_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_release_flags: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_tenant_links: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_version_sources: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_agency_verification: {
        Args: {
          p_agency_workspace_id: string
          p_effect: string
          p_evidence: Json
          p_operator_email: string
          p_reason: string
          p_status: string
        }
        Returns: Json
      }
      record_business_billing_payment: {
        Args: {
          p_current_period_end: string
          p_status: string
          p_stripe_subscription_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_business_effort: {
        Args: {
          p_business_id: string
          p_category: string
          p_entry_id: string
          p_minutes: number
          p_note: string
          p_occurred_on: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      record_client_record_parity: {
        Args: {
          p_mismatched: number
          p_missing: number
          p_postgres_count: number
          p_redis_count: number
          p_store: string
          p_tenant_id: string
        }
        Returns: Json
      }
      record_connected_site_events: {
        Args: {
          p_events: Json
          p_origin: string
          p_public_key: string
        }
        Returns: number
      }
      record_connected_site_inquiry: {
        Args: {
          p_lead: Json
          p_origin: string
          p_public_key: string
        }
        Returns: Json
      }
      record_connected_site_spam: {
        Args: {
          p_captured_at: string
          p_origin: string
          p_payload: Json
          p_payload_hash: string
          p_public_key: string
          p_record_id: string
        }
        Returns: Json
      }
      record_google_listing_receipt: {
        Args: {
          p_input: Json
        }
        Returns: Json
      }
      record_inquiry_event: {
        Args: {
          p_actor: string
          p_actor_id: string
          p_dedupe_key: string
          p_detail: Json
          p_kind: string
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      record_model_calls: {
        Args: {
          p_calls: Json
        }
        Returns: number
      }
      record_outside_write_readback: {
        Args: {
          p_detail: string
          p_readback: string
          p_receipt_id: string
        }
        Returns: Json
      }
      record_outside_write_receipt: {
        Args: {
          p_receipt: Json
        }
        Returns: Json
      }
      record_owner_decision_delivery: {
        Args: {
          p_decision_id: string
          p_kind: string
          p_provider_message_id: string
          p_reason: string
          p_recipient: string
          p_status: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_standing_responsibility_run: {
        Args: {
          p_attempt: number
          p_cancelled_at: string
          p_last_error: string
          p_receipts: Json
          p_run_id: string
          p_status: string
          p_user_id: string
          p_verified_email: string
          p_wake_at: string
        }
        Returns: {
          attempt: number
          cancelled_at: string | null
          created_at: string
          finite_work_id: string
          id: string
          job_id: string
          last_error: string | null
          policy_version: number
          standing_responsibility_id: string
          status: string
          trigger_key: string
          updated_at: string
          wake_at: string | null
          workspace_id: string
        }[]
      }
      record_strelva_service_action: {
        Args: {
          p_action: string
          p_detail: string
          p_session_id: string
          p_subject: string
          p_workspace_id: string
        }
        Returns: string
      }
      record_system_revision: {
        Args: {
          p_activate: boolean
          p_command_digest: string
          p_command_id: string
          p_expected_change: number
          p_input: Json
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_tenant_booking: {
        Args: {
          p_booking: Json
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
      record_tenant_client_record: {
        Args: {
          p_captured_at: string
          p_mode: string
          p_payload: Json
          p_payload_hash: string
          p_record_id: string
          p_store: string
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
      record_tenant_lead: {
        Args: {
          p_lead: Json
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
      record_website_change_receipt: {
        Args: {
          p_details: Json
          p_kind: string
          p_request_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_website_document_health: {
        Args: {
          p_checked_at: string
          p_content_hash: string
          p_observed_hash?: string
          p_revision: number
          p_status: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      record_work_provider_receipt: {
        Args: {
          p_receipt: Json
        }
        Returns: Json
      }
      record_work_provider_receipt_decimal: {
        Args: {
          p_receipt: Json
        }
        Returns: Json
      }
      record_workspace_booking: {
        Args: {
          p_booking: Json
          p_via: string
          p_workspace_id: string
        }
        Returns: Json
      }
      rehearse_application_candidate: {
        Args: {
          p_expected_design_revision: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      request_provider_delivery: {
        Args: {
          p_assignment_id: string
          p_business_id: string
          p_command_digest: string
          p_idempotency_key: string
          p_installation_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }[]
      }
      reserve_website_hosted_tenant: {
        Args: {
          p_content_hash: string
          p_revision: number
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          tenant_id: string
        }[]
      }
      reserve_website_model_call: {
        Args: {
          p_workspace_id: string
          p_work_id: string
          p_user_id: string
          p_verified_email: string
          p_maximum: number
        }
        Returns: number
      }
      claim_native_website_fact_review: {
        Args: {
          p_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_tenant_id: string
          p_record_revision: number
          p_claim_token: string
        }
        Returns: boolean
      }
      record_native_website_fact_review: {
        Args: { p_claim_token: string; p_status: string; p_event_id: string | null }
        Returns: Json
      }
      resolve_billing_workspace: {
        Args: {
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      resolve_business_owner_recipient: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      resolve_connected_site: {
        Args: {
          p_public_key: string
        }
        Returns: Json
      }
      resolve_internal_tool_links: {
        Args: {
          p_links: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      resolve_tenant_owner_entry: {
        Args: {
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      resolve_tenant_owner_recipient: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      respond_service_request: {
        Args: {
          p_command_digest: string
          p_decision: string
          p_expected_revision: number
          p_idempotency_key: string
          p_note: string
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      retain_website_crawl_page: {
        Args: {
          p_page: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      retire_application: {
        Args: {
          p_expected_design_revision: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      retire_offering: {
        Args: {
          p_business_id: string
          p_expected_revision: number
          p_installation_id: string
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration: Json
          definition_id: string
          definition_version: string
          id: string
          idempotency_key: string
          installed_at: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          revision: number
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
        }[]
      }
      revoke_agency_application_draft_edit: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          application_work_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          installation_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
        }[]
      }
      revoke_agency_managed_website_draft_edit: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          agency_workspace_id: string
          assignment_id: string
          business_workspace_id: string
          created_at: string
          delivery_id: string
          expires_at: string
          granted_by: string
          id: string
          managed_website_binding_id: string
          operator_user_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }[]
      }
      revoke_agent_access_token: {
        Args: {
          p_expected_revision: number
          p_expected_work_revision: string
          p_payload: Json
          p_revoked_at: string
          p_token_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: undefined
      }
      revoke_application_use: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: undefined
      }
      revoke_connected_site: {
        Args: {
          p_site_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      revoke_offering_website_binding: {
        Args: {
          p_binding_id: string
          p_business_id: string
          p_expected_revision: number
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          actor_has_tenant_access: boolean
          business_workspace_id: string
          created_at: string
          created_by: string
          id: string
          revision: number
          revocation_reason: string
          revoked_at: string
          revoked_by: string
          site_name: string
          status: string
          tenant_active: boolean
          tenant_id: string
          updated_at: string
          updated_by: string
        }[]
      }
      revoke_operational_assignment: {
        Args: {
          p_assignment_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          active_actor_id: string | null
          active_attempt: number | null
          active_lease_id: string | null
          active_started_at: string | null
          active_step_id: string | null
          assignee_email: string
          assignee_kind: string
          assignee_user_id: string
          assignee_workspace_id: string | null
          expires_at: string
          id: string
          offer_key: string
          offered_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          sponsor_email: string
          sponsor_id: string
          status: string
          work_id: string
          work_scope: Json
          workspace_id: string
        }[]
      }
      revoke_operator_owner_invitation: {
        Args: {
          p_invitation_id: string
          p_operator_email: string
        }
        Returns: string
      }
      revoke_provider_delivery: {
        Args: {
          p_delivery_id: string
          p_expected_revision: number
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          assignment_id: string
          business_workspace_id: string
          command_digest: string
          customer_decision: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          history: Json
          id: string
          idempotency_key: string
          installation_id: string
          requested_at: string
          requested_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          status: string
        }[]
      }
      revoke_public_website_booking_grant: {
        Args: {
          p_business_id: string
          p_grant_id: string
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          business_workspace_id: string
          capability_id: string
          capability_version: number
          created_at: string
          display_name: string
          id: string
          inquiry_capability_id: string
          inquiry_version: number
          provider: string
          published_at: string
          published_by: string
          revision: number
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          tenant_stable_id: string
          time_zone: string
          updated_at: string
          work_id: string
        }[]
      }
      revoke_workspace_calendar_connection: {
        Args: {
          p_provider: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      revoke_workspace_delegation: {
        Args: {
          p_delegation_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      revoke_workspace_handoff: {
        Args: {
          p_handoff_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      revoke_workspace_invitation: {
        Args: {
          p_actor_id: string
          p_invitation_id: string
          p_verified_email: string
        }
        Returns: string
      }
      rollback_application_release: {
        Args: {
          p_expected_design_revision: number
          p_expected_release_version: number
          p_target_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      save_make_real_activation: {
        Args: {
          p_activation: Json
          p_activation_id: string
          p_expected_revision: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      save_service_request: {
        Args: {
          p_business_id: string
          p_command_digest: string
          p_context: Json
          p_expected_revision: number
          p_idempotency_key: string
          p_outcome: string
          p_provider: Json
          p_request_id: string
          p_request_text: string
          p_scope: string[]
          p_status: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      save_system_possibility: {
        Args: {
          p_body: Json
          p_expected_revision: number
          p_possibility_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      save_system_version: {
        Args: {
          p_expected_row_revision: number
          p_lineage: Json
          p_user_id: string
          p_verified_email: string
          p_version_id: string
        }
        Returns: Json
      }
      save_system_work: {
        Args: {
          p_input: Json
          p_payload: Json
          p_product_id: string
          p_resource_kind: string
          p_source_work_id: string
          p_title: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      save_workspace_calendar_connection: {
        Args: {
          p_access_token_ciphertext: string
          p_calendar_id: string
          p_calendar_name: string
          p_provider: string
          p_refresh_token_ciphertext: string
          p_reminder_policy: Json
          p_scopes: string[]
          p_status: string
          p_time_zone: string
          p_token_expires_at: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          access_token_ciphertext: string | null
          calendar_id: string
          calendar_name: string
          created_at: string
          created_by: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          provider: string
          refresh_token_ciphertext: string | null
          reminder_policy: Json
          scopes: string[]
          status: string
          time_zone: string
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      save_workspace_calendar_event_receipt: {
        Args: {
          p_receipt: Json
          p_user_id: string
        }
        Returns: {
          attempted_at: string | null
          calendar_id: string
          created_at: string
          end_at: string
          external_event_id: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          observed_at: string | null
          operation: string
          provider: string
          reminder_policy: Json
          request_id: string
          revision: number
          start_at: string
          status: string
          time_zone: string
          title: string
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      save_workspace_work: {
        Args: {
          p_input: Json
          p_payload: Json
          p_product_id: string
          p_resource_kind: string
          p_source_work_id: string
          p_title: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      service_request_assert_customer: {
        Args: {
          p_business_id: string
          p_manage: boolean
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
      }
      service_request_assert_payload: {
        Args: {
          p_context: Json
          p_outcome: string
          p_provider: Json
          p_request_text: string
          p_scope: string[]
          p_status: string
        }
        Returns: undefined
      }
      service_request_assert_provider: {
        Args: {
          p_agency_workspace_id: string
          p_provider_kind: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      set_agency_client_staff: {
        Args: {
          p_active: boolean
          p_agency_workspace_id: string
          p_staff_user_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_decision_policy: {
        Args: {
          p_expected_version: number
          p_kind: string
          p_layer: string
          p_reason: string
          p_route: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_platform_workspace: {
        Args: {
          p_operator_email: string
          p_role: string
          p_workspace_id: string
        }
        Returns: string
      }
      set_system_connection_state: {
        Args: {
          p_connection_id: string
          p_state: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_system_current_revision: {
        Args: {
          p_expected_current: string
          p_revision_id: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_tenant_booking_hours: {
        Args: {
          p_hours: Json
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_tenant_booking_status: {
        Args: {
          p_actor: string
          p_reason: string
          p_ref: string
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_tenant_decision_route: {
        Args: {
          p_kind: string
          p_layer: string
          p_not_migrated: string
          p_route: string
          p_tenant_id: string
          p_today_value: string
          p_user_id: string
          p_verified_email: string
          p_via: string
        }
        Returns: Json
      }
      set_tenant_report_cadence: {
        Args: {
          p_cadence: string
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
      set_workspace_account_binding_status: {
        Args: {
          p_binding_id: string
          p_checked_at: string
          p_error: string
          p_status: string
        }
        Returns: undefined
      }
      set_workspace_release_flag: {
        Args: {
          p_expected_revision: number
          p_flag: string
          p_operator_email: string
          p_reason: string
          p_state: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_workspace_release_tester: {
        Args: {
          p_operator_email: string
          p_present: boolean
          p_reason: string
          p_tester_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      settle_google_listing_receipt: {
        Args: {
          p_input: Json
          p_receipt_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      site_metric_summary: {
        Args: {
          p_tenant_id: string
          p_today: string
        }
        Returns: {
          last7: number
          metric: string
          prev7: number
          today: number
          total: number
        }[]
      }
      start_workspace_export_build: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      strelva_make_real_link_session: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_workspace_id: string
        }
        Returns: Json
      }
      strelva_runs_business: {
        Args: {
          p_workspace_id: string
        }
        Returns: boolean
      }
      strelva_service_reader: {
        Args: {
          p_purpose: string
          p_workspace_id: string
        }
        Returns: Json
      }
      strelva_service_session: {
        Args: {
          p_purpose: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: {
          action: string
          actor_label: string
          created_at: string
          detail: string | null
          id: string
          on_behalf_role: string | null
          on_behalf_user_id: string | null
          provider_workspace_id: string | null
          purpose: string
          session_id: string | null
          subject: string | null
          workspace_id: string
        }
      }
      submit_application_record: {
        Args: {
          p_expected_records_revision: number
          p_expected_release_version: number
          p_record_id: string
          p_user_id: string
          p_values: Json
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          edit_history: Json
          record_id: string
          record_revision: number
          record_source: string
          updated_at: string
          values: Json
          work_id: string
          workspace_id: string
        }[]
      }
      submit_application_record_internal: {
        Args: {
          p_actor_id: string
          p_expected_records_revision: number
          p_expected_release_version: number
          p_record_id: string
          p_values: Json
          p_work_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          edit_history: Json
          record_id: string
          record_revision: number
          record_source: string
          updated_at: string
          values: Json
          work_id: string
          workspace_id: string
        }[]
      }
      submit_application_use_record: {
        Args: {
          p_grant_id: string
          p_idempotency_key: string
          p_record: Json
          p_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_read_scope: string
          record_submit: boolean
          records: Json
          release_version: number
          released_spec: Json
          revoked_at: string
          status: string
          title: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      submit_application_use_record_v2: {
        Args: {
          p_grant_id: string
          p_idempotency_key: string
          p_record: Json
          p_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: {
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          purpose: string
          recipient_email: string
          record_edit_scope: string
          record_read_scope: string
          record_submit: boolean
          records: Json
          release_version: number
          released_spec: Json
          revoked_at: string
          status: string
          title: string
          views: string[]
          work_id: string
          workspace_id: string
        }[]
      }
      subscription_allowance_projection_json: {
        Args: {
          p_disposition: string
          p_entitlement: unknown
        }
        Returns: Json
      }
      summarize_model_call_costs: {
        Args: {
          p_since: string
          p_workspace_id: string
        }
        Returns: Json
      }
      sync_subscription_allowance_entitlement: {
        Args: {
          p_entitlement: Json
        }
        Returns: Json
      }
      system_actor_scope: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: Record<string, unknown>
      }
      system_command_valid: {
        Args: {
          p_command_digest: string
          p_command_id: string
        }
        Returns: undefined
      }
      system_connection_in_scope: {
        Args: {
          c: unknown
          p_work_ids: string[]
          p_workspace_id: string
        }
        Returns: boolean
      }
      system_connection_json: {
        Args: {
          c: unknown
        }
        Returns: Json
      }
      system_in_scope: {
        Args: {
          p_origin_kind: string
          p_origin_ref: string
          p_work_ids: string[]
          p_workspace_id: string
        }
        Returns: boolean
      }
      system_json: {
        Args: {
          s: unknown
        }
        Returns: Json
      }
      system_load: {
        Args: {
          p_lock: boolean
          p_system_id: string
          p_work_ids: string[]
          p_workspace_id: string
        }
        Returns: {
          business_workspace_id: string
          change_number: number
          command_digest: string
          command_id: string
          created_at: string
          created_by: string
          current_revision_id: string | null
          current_revision_number: number | null
          id: string
          kind: string
          lifecycle: string
          name: string
          origin_kind: string | null
          origin_ref: string | null
          purpose: string | null
          updated_at: string
          updated_by: string
        }
      }
      system_origin_id: {
        Args: {
          p_kind: string
          p_ref: string
          p_workspace_id: string
        }
        Returns: string
      }
      system_origin_kinds: {
        Args: never
        Returns: string[]
      }
      system_output_json: {
        Args: {
          o: unknown
        }
        Returns: Json
      }
      system_possibility_body_valid: {
        Args: {
          p: Json
          p_workspace_id: string
        }
        Returns: boolean
      }
      system_possibility_in_scope: {
        Args: {
          p_id: string
          p_work_ids: string[]
          p_workspace_id: string
        }
        Returns: boolean
      }
      system_possibility_json: {
        Args: {
          p: unknown
          p_history: number
        }
        Returns: Json
      }
      system_possibility_time: {
        Args: {
          p_at: string
        }
        Returns: string
      }
      system_possibility_write_pins: {
        Args: {
          p_body: Json
          p_id: string
          p_work_ids: string[]
          p_workspace_id: string
        }
        Returns: undefined
      }
      system_revision_json: {
        Args: {
          r: unknown
        }
        Returns: Json
      }
      system_scope_tenants: {
        Args: {
          p_work_ids: string[]
          p_workspace_id: string
        }
        Returns: string[]
      }
      system_version_access: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_write: boolean
          v: unknown
        }
        Returns: Record<string, unknown>
      }
      system_version_actor_workspaces: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: string[]
      }
      system_version_assert_source_manager: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      system_version_connection_holder: {
        Args: {
          p_connection_ref: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
      }
      system_version_connection_owner: {
        Args: {
          p_connection_ref: string
        }
        Returns: string
      }
      system_version_json: {
        Args: {
          p_access: string
          p_user_id: string
          p_verified_email: string
          v: unknown
        }
        Returns: Json
      }
      system_version_member_role: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      system_version_revision_json: {
        Args: {
          p_workspace_id: string
          r: unknown
        }
        Returns: Json
      }
      system_version_source_json: {
        Args: {
          p_user_id: string
          p_verified_email: string
          src: unknown
        }
        Returns: Json
      }
      system_version_source_visible: {
        Args: {
          p_source_system_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: boolean
      }
      system_version_ts: {
        Args: {
          p_value: string
        }
        Returns: string
      }
      system_version_uuid: {
        Args: {
          p_text: string
        }
        Returns: string
      }
      tenant_client_record_workspace: {
        Args: {
          p_tenant_stable_id: string
        }
        Returns: string
      }
      tenant_conversion_assert_operator: {
        Args: {
          p_operator_email: string
        }
        Returns: string
      }
      tenant_lead_retention: {
        Args: never
        Returns: unknown
      }
      tenant_lead_workspace: {
        Args: {
          p_tenant_stable_id: string
        }
        Returns: string
      }
      tenant_teardown_blockers: {
        Args: {
          p_tenant_id: string
        }
        Returns: {
          publications: number
          reservations: number
        }[]
      }
      tenant_teardown_tables: {
        Args: never
        Returns: string[]
      }
      tenant_unlink_plan: {
        Args: {
          p_link_id: string
        }
        Returns: Json
      }
      tenant_unlink_plan_before_systems: {
        Args: {
          p_link_id: string
        }
        Returns: Json
      }
      transition_system_lifecycle: {
        Args: {
          p_expected_change: number
          p_system_id: string
          p_to: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      undo_business_record_revision: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_sequence: number
          p_source: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      unlink_tenant_from_business: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_operator_email: string
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      update_application_candidate: {
        Args: {
          p_expected_design_revision: number
          p_spec: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          candidate_design_revision: number
          candidate_rehearsal: Json | null
          candidate_spec: Json
          candidate_spec_version: number
          candidate_versions: Json
          created_at: string
          current_release_version: number | null
          lifecycle_status: string
          records_revision: number
          updated_at: string
          work_id: string
          workspace_id: string
        }[]
      }
      update_bounded_product_work: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_product_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_business_system: {
        Args: {
          p_expected_change: number
          p_patch: Json
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      update_connected_site: {
        Args: {
          p_patch: Json
          p_site_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      update_document_work: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_offering_configuration: {
        Args: {
          p_business_id: string
          p_configuration: Json
          p_expected_revision: number
          p_installation_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration: Json
          definition_id: string
          definition_version: string
          id: string
          idempotency_key: string
          installed_at: string
          installed_by: string
          native_resources: Json
          responsibility: Json
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          revision: number
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
        }[]
      }
      update_onboarding_work: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_product_learning_work: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_standing_responsibility: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_standing_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          next_trigger_at: string | null
          owner_id: string
          payload: Json
          revision: number
          status: string
          updated_at: string
          version: number
          workspace_id: string
        }[]
      }
      update_tracker_work: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_work_responsibility: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_work_responsibility_unchecked: {
        Args: {
          p_expected_revision: number
          p_payload: Json
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          id: string
          input: Json | null
          payload: Json
          product_id: string
          resource_kind: string
          source_work_id: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }[]
      }
      update_workspace_account_binding_tokens: {
        Args: {
          p_access_ciphertext: string
          p_binding_id: string
          p_expires_at: string
          p_refresh_ciphertext: string
        }
        Returns: undefined
      }
      upsert_business_contacts: {
        Args: {
          p_command_digest: string
          p_command_id: string
          p_contacts: Json
          p_source: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      upsert_tenant_booking_settings: {
        Args: {
          p_settings: Json
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
      upsert_workspace_account_binding: {
        Args: {
          p_input: Json
          p_mode: string
        }
        Returns: Json
      }
      upsert_workspace_google_location: {
        Args: {
          p_account_id: string
          p_binding_id: string
          p_location_id: string
          p_title: string
        }
        Returns: Json
      }
      validate_application_record: {
        Args: {
          p_record_id: string
          p_spec: Json
          p_values: Json
        }
        Returns: undefined
      }
      validate_application_spec: {
        Args: {
          p_spec: Json
        }
        Returns: undefined
      }
      void_business_effort: {
        Args: {
          p_entry_id: string
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      website_business_template: {
        Args: {
          p_workspace_id: string
        }
        Returns: {
          industry: string
          template: string
        }[]
      }
      website_catalog_native_section: {
        Args: {
          p_type: string
        }
        Returns: string
      }
      website_change_actor_role: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      website_document_assert_actor: {
        Args: {
          p_manage: boolean
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: undefined
      }
      website_document_assert_launch_owner: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      website_document_launch_authority: {
        Args: {
          p_user_id: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      withdraw_idle_system_possibilities: {
        Args: {
          p_idle_days: number
          p_limit: number
        }
        Returns: Json
      }
      withdraw_owner_decision: {
        Args: {
          p_decision_id: string
          p_reason: string
          p_workspace_id: string
        }
        Returns: Json
      }
      withdraw_service_request: {
        Args: {
          p_business_id: string
          p_command_digest: string
          p_expected_revision: number
          p_idempotency_key: string
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          business_workspace_id: string
          context: Json
          created_at: string
          created_by: string
          delivery_commitment: Json | null
          delivery_id: string | null
          history: Json
          id: string
          installation_id: string | null
          outcome: string
          provider_acceptance: string
          provider_agency_workspace_id: string | null
          provider_kind: string
          request_text: string
          revision: number
          scope: string[]
          status: string
          updated_at: string
        }[]
      }
      work_allowance_accept_cap: {
        Args: {
          p_actor_id: string
          p_allowance_id: string
          p_verified_email: string
        }
        Returns: string
      }
      work_allowance_assert_identity: {
        Args: {
          p_actor_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      work_allowance_execution_command: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: Json
      }
      work_allowance_operator_command: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: string
      }
      work_allowance_reservation_json: {
        Args: {
          p_disposition: string
          p_reservation: unknown
        }
        Returns: Json
      }
      work_auxiliary_revision: {
        Args: {
          p_work: unknown
        }
        Returns: string
      }
      workspace_exit_completed: {
        Args: {
          p_workspace_id: string
        }
        Returns: boolean
      }
      workspace_exit_resources_stopped: {
        Args: {
          p_workspace_id: string
        }
        Returns: boolean
      }
      workspace_export_v3_categories: {
        Args: never
        Returns: string[]
      }
      workspace_export_v3_role: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      workspace_export_v3_tenant_rows: {
        Args: {
          p_limit: number
          p_offset: number
          p_order: string
          p_table: string
          p_workspace_id: string
        }
        Returns: Json
      }
      workspace_make_systems_authority: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      workspace_operation: {
        Args: {
          p_action: string
          p_id: string
          p_input?: Json
          p_lease_id?: string
          p_product_id?: string
          p_resource_kind?: string
          p_result?: Json
          p_title?: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          attempts: number
          created_at: string
          created_by: string
          id: string
          input: Json
          lease_id: string | null
          lease_until: string | null
          product_id: string
          result: Json | null
          status: string
          updated_at: string
          work_id: string | null
          workspace_id: string
        }[]
      }
      workspace_payer_transition_command: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: {
          accepted_at: string | null
          id: string
          proposed_at: string
          proposed_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          successor_email: string | null
          successor_kind: string
          successor_user_id: string | null
          successor_workspace_id: string | null
          workspace_id: string
        }[]
      }
      workspace_payer_transition_inbox: {
        Args: {
          p_actor_id: string
          p_verified_email: string
        }
        Returns: {
          accepted_at: string
          id: string
          proposed_at: string
          proposed_by: string
          proposer_email: string
          resolved_at: string
          resolved_by: string
          status: string
          successor_email: string
          successor_kind: string
          successor_user_id: string
          successor_workspace_id: string
          successor_workspace_name: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      workspace_payer_transition_snapshot: {
        Args: {
          p_actor_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: {
          accepted_at: string
          id: string
          proposed_at: string
          proposed_by: string
          proposer_email: string
          resolved_at: string
          resolved_by: string
          status: string
          successor_email: string
          successor_kind: string
          successor_user_id: string
          successor_workspace_id: string
          successor_workspace_name: string
          workspace_id: string
        }[]
      }
      workspace_release_assert_operator: {
        Args: {
          p_operator_email: string
        }
        Returns: string
      }
      workspace_release_assert_workspace: {
        Args: {
          p_workspace_id: string
        }
        Returns: undefined
      }
      workspace_release_flag_names: {
        Args: never
        Returns: string[]
      }
      workspace_require: {
        Args: {
          p_permission: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      workspace_require_make_systems: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      workspace_role_allows: {
        Args: {
          p_permission: string
          p_role: string
        }
        Returns: boolean
      }
      write_operator_queue_mark: {
        Args: {
          p_action: string
          p_command_id: string
          p_payload: Json
          p_priority: string
          p_source: string
          p_source_ref: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      write_tenant_analytics_config: {
        Args: {
          p_config: Json
          p_tenant_id: string
          p_via: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
