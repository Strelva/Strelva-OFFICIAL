// Source-authored 20261022175100 additions; actual disposable-catalog generation is UNRUN.
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
          billing_home_kind: string
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
          billing_home_kind?: string
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
          billing_home_kind?: string
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
      acting_provider_gate_predecessors: {
        Row: {
          after_hash: string | null
          before_definition: string
          signature: string
        }
        Insert: {
          after_hash?: string | null
          before_definition: string
          signature: string
        }
        Update: {
          after_hash?: string | null
          before_definition?: string
          signature?: string
        }
        Relationships: []
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
      agency_billing_intents: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_workspace_id: string
          amount_cents: number
          business_workspace_id: string
          checkout_url: string | null
          created_at: string
          currency: string
          description: string
          id: string
          idempotency_key: string
          kind: string
          last_payment_event_created: number
          last_payment_event_id: string
          last_provider_event_created: number
          last_subscription_event_created: number
          last_subscription_event_id: string
          payer_kind: string
          payer_workspace_id: string
          payment_receipt_state: string
          proposed_by: string
          provider_account_id: string | null
          provider_attempt_started_at: string | null
          provider_customer_id: string | null
          provider_object_id: string | null
          provider_price_id: string | null
          status: string
          terms_digest: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_workspace_id: string
          amount_cents: number
          business_workspace_id: string
          checkout_url?: string | null
          created_at?: string
          currency: string
          description: string
          id?: string
          idempotency_key: string
          kind: string
          last_payment_event_created?: number
          last_payment_event_id?: string
          last_provider_event_created?: number
          last_subscription_event_created?: number
          last_subscription_event_id?: string
          payer_kind: string
          payer_workspace_id: string
          payment_receipt_state?: string
          proposed_by: string
          provider_account_id?: string | null
          provider_attempt_started_at?: string | null
          provider_customer_id?: string | null
          provider_object_id?: string | null
          provider_price_id?: string | null
          status?: string
          terms_digest: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_workspace_id?: string
          amount_cents?: number
          business_workspace_id?: string
          checkout_url?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          idempotency_key?: string
          kind?: string
          last_payment_event_created?: number
          last_payment_event_id?: string
          last_provider_event_created?: number
          last_subscription_event_created?: number
          last_subscription_event_id?: string
          payer_kind?: string
          payer_workspace_id?: string
          payment_receipt_state?: string
          proposed_by?: string
          provider_account_id?: string | null
          provider_attempt_started_at?: string | null
          provider_customer_id?: string | null
          provider_object_id?: string | null
          provider_price_id?: string | null
          status?: string
          terms_digest?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_billing_intents_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_billing_intents_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_billing_intents_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_billing_intents_payer_workspace_id_fkey"
            columns: ["payer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_billing_intents_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_billing_provider_events: {
        Row: {
          account_id: string
          created_at: string
          event_created: number
          event_id: string
          event_status: string
          evidence: Json
          intent_id: string | null
          provider_object_id: string
          review_reason: string | null
          verification_result: string
        }
        Insert: {
          account_id: string
          created_at?: string
          event_created: number
          event_id: string
          event_status: string
          evidence?: Json
          intent_id?: string | null
          provider_object_id: string
          review_reason?: string | null
          verification_result?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          event_created?: number
          event_id?: string
          event_status?: string
          evidence?: Json
          intent_id?: string | null
          provider_object_id?: string
          review_reason?: string | null
          verification_result?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_billing_provider_events_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "agency_billing_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_add_quota: {
        Row: {
          additions: number
          agency_workspace_id: string
          day: string
        }
        Insert: {
          additions?: number
          agency_workspace_id: string
          day: string
        }
        Update: {
          additions?: number
          agency_workspace_id?: string
          day?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_add_quota_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_additions: {
        Row: {
          added_at: string
          added_by: string
          agency_workspace_id: string
          command_digest: string
          command_id: string
          customer_workspace_id: string
          facts_seeded: number
          id: string
          prospect_id: string | null
          source_kind: string
          source_url: string | null
        }
        Insert: {
          added_at?: string
          added_by: string
          agency_workspace_id: string
          command_digest: string
          command_id: string
          customer_workspace_id: string
          facts_seeded: number
          id?: string
          prospect_id?: string | null
          source_kind: string
          source_url?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string
          agency_workspace_id?: string
          command_digest?: string
          command_id?: string
          customer_workspace_id?: string
          facts_seeded?: number
          id?: string
          prospect_id?: string | null
          source_kind?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_additions_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_additions_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_additions_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_additions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_owner_claims: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_workspace_id: string
          created_at: string
          created_by: string
          customer_workspace_id: string
          delivery: Json
          expires_at: string
          id: string
          recipient_email: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_workspace_id: string
          created_at?: string
          created_by: string
          customer_workspace_id: string
          delivery: Json
          expires_at: string
          id?: string
          recipient_email: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_workspace_id?: string
          created_at?: string
          created_by?: string
          customer_workspace_id?: string
          delivery?: Json
          expires_at?: string
          id?: string
          recipient_email?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_owner_claims_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_owner_claims_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_owner_claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_owner_claims_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_owner_claims_revoked_by_fkey"
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
      agency_created_application_predecessors: {
        Row: {
          after_sha256: string
          before_definition: string
          signature: string
        }
        Insert: {
          after_sha256: string
          before_definition: string
          signature: string
        }
        Update: {
          after_sha256?: string
          before_definition?: string
          signature?: string
        }
        Relationships: []
      }
      agency_handoff_receipts: {
        Row: {
          agency_workspace_id: string
          business_workspace_id: string
          created_at: string
          id: string
          kind: string
          reference_id: string
        }
        Insert: {
          agency_workspace_id: string
          business_workspace_id: string
          created_at?: string
          id?: string
          kind: string
          reference_id: string
        }
        Update: {
          agency_workspace_id?: string
          business_workspace_id?: string
          created_at?: string
          id?: string
          kind?: string
          reference_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_handoff_receipts_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_handoff_receipts_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      agency_package_commands: {
        Row: {
          agency_workspace_id: string
          command_digest: string
          command_id: string
          created_at: string
          created_by: string
          input_digest: string
          source_revision_id: string
          source_system_id: string
        }
        Insert: {
          agency_workspace_id: string
          command_digest: string
          command_id: string
          created_at?: string
          created_by: string
          input_digest: string
          source_revision_id: string
          source_system_id: string
        }
        Update: {
          agency_workspace_id?: string
          command_digest?: string
          command_id?: string
          created_at?: string
          created_by?: string
          input_digest?: string
          source_revision_id?: string
          source_system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_package_commands_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_package_commands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_package_commands_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_package_commands_source_system_id_fkey"
            columns: ["source_system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_package_handoffs: {
        Row: {
          agency_workspace_id: string
          created_at: string
          definitions: Json
          id: string
          provider_id: string
        }
        Insert: {
          agency_workspace_id: string
          created_at?: string
          definitions: Json
          id?: string
          provider_id: string
        }
        Update: {
          agency_workspace_id?: string
          created_at?: string
          definitions?: Json
          id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_package_handoffs_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_package_handoffs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_prospect_quota: {
        Row: {
          checks: number
          day: string
          leads: number
          workspace_id: string
        }
        Insert: {
          checks?: number
          day: string
          leads?: number
          workspace_id: string
        }
        Update: {
          checks?: number
          day?: string
          leads?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_prospect_quota_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "agency_prospecting_profiles"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      agency_prospecting_profiles: {
        Row: {
          contact_email: string
          contact_url: string
          daily_check_quota: number
          daily_lead_quota: number
          enabled: boolean
          slug: string
          workspace_id: string
        }
        Insert: {
          contact_email: string
          contact_url: string
          daily_check_quota?: number
          daily_lead_quota?: number
          enabled?: boolean
          slug: string
          workspace_id: string
        }
        Update: {
          contact_email?: string
          contact_url?: string
          daily_check_quota?: number
          daily_lead_quota?: number
          enabled?: boolean
          slug?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_prospecting_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_release_flag_ceiling_history: {
        Row: {
          after_state: Json
          before_state: Json | null
          changed_at: string
          changed_by: string
          flag: string
          id: string
          reason: string
          workspace_id: string
        }
        Insert: {
          after_state: Json
          before_state?: Json | null
          changed_at?: string
          changed_by: string
          flag: string
          id?: string
          reason: string
          workspace_id: string
        }
        Update: {
          after_state?: Json
          before_state?: Json | null
          changed_at?: string
          changed_by?: string
          flag?: string
          id?: string
          reason?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_release_flag_ceiling_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_release_flag_ceiling_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_release_flag_ceilings: {
        Row: {
          agency_workspace_id: string
          changed_at: string
          changed_by: string
          flag: string
          max_state: string
          revision: number
          system_id: string
          verification_effect: string
          workspace_id: string
        }
        Insert: {
          agency_workspace_id: string
          changed_at?: string
          changed_by: string
          flag: string
          max_state: string
          revision?: number
          system_id: string
          verification_effect: string
          workspace_id: string
        }
        Update: {
          agency_workspace_id?: string
          changed_at?: string
          changed_by?: string
          flag?: string
          max_state?: string
          revision?: number
          system_id?: string
          verification_effect?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_release_flag_ceilings_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_release_flag_ceilings_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_release_flag_ceilings_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_release_flag_ceilings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      agent_business_discovery_coverage: {
        Row: {
          calendar_key: string
          first_observed_at: string
        }
        Insert: {
          calendar_key: string
          first_observed_at: string
        }
        Update: {
          calendar_key?: string
          first_observed_at?: string
        }
        Relationships: []
      }
      agent_business_discovery_days: {
        Row: {
          calendar_key: string
          calls: number
          day: string
        }
        Insert: {
          calendar_key: string
          calls?: number
          day: string
        }
        Update: {
          calendar_key?: string
          calls?: number
          day?: string
        }
        Relationships: []
      }
      agent_channel_consent_receipts: {
        Row: {
          at: string
          changed_by: string
          consented: boolean
          id: string
          reason: string
          workspace_id: string
        }
        Insert: {
          at?: string
          changed_by: string
          consented: boolean
          id?: string
          reason: string
          workspace_id: string
        }
        Update: {
          at?: string
          changed_by?: string
          consented?: boolean
          id?: string
          reason?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_channel_consent_receipts_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_channel_consent_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_channel_consents: {
        Row: {
          changed_at: string
          changed_by: string
          consented: boolean
          workspace_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          consented?: boolean
          workspace_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          consented?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_channel_consents_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_channel_consents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_payment_policies: {
        Row: {
          agreement_version: string
          approved_at: string
          approved_by: string
          currency: string
          daily_cents: number
          per_payment_cents: number
          workspace_id: string
        }
        Insert: {
          agreement_version: string
          approved_at: string
          approved_by: string
          currency: string
          daily_cents: number
          per_payment_cents: number
          workspace_id: string
        }
        Update: {
          agreement_version?: string
          approved_at?: string
          approved_by?: string
          currency?: string
          daily_cents?: number
          per_payment_cents?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_payment_policies_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_payment_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_payment_reservations: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          day: string
          payment_id: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          day?: string
          payment_id: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          day?: string
          payment_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_payment_reservations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_payment_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_quote_receipts: {
        Row: {
          amount_cents: number
          at: string
          currency: string
          id: string
          lead_id: string
          owner_id: string
          request_id: string
          terms: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          at?: string
          currency: string
          id?: string
          lead_id: string
          owner_id: string
          request_id: string
          terms: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          at?: string
          currency?: string
          id?: string
          lead_id?: string
          owner_id?: string
          request_id?: string
          terms?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_quote_receipts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "tenant_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quote_receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_quote_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      ask_business_record_drafts: {
        Row: {
          asked_on_behalf: string | null
          created_at: string
          created_by: string
          expected_revision: number
          id: string
          idempotency_key: string
          patch: Json
          receipt: Json | null
          status: string
          summary: string
          system_id: string | null
          workspace_id: string
        }
        Insert: {
          asked_on_behalf?: string | null
          created_at?: string
          created_by: string
          expected_revision: number
          id?: string
          idempotency_key: string
          patch: Json
          receipt?: Json | null
          status?: string
          summary: string
          system_id?: string | null
          workspace_id: string
        }
        Update: {
          asked_on_behalf?: string | null
          created_at?: string
          created_by?: string
          expected_revision?: number
          id?: string
          idempotency_key?: string
          patch?: Json
          receipt?: Json | null
          status?: string
          summary?: string
          system_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_business_record_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_business_record_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      assistant_authorization_codes: {
        Row: {
          agency_id: string | null
          challenge: string
          client_id: string
          client_name: string
          code_hash: string
          consumed_at: string | null
          expires_at: string
          redirect_uri: string
          resource: string
          scopes: string[]
          seat_id: string | null
          user_id: string
          verified_email: string
          workspace_id: string
        }
        Insert: {
          agency_id?: string | null
          challenge: string
          client_id: string
          client_name?: string
          code_hash: string
          consumed_at?: string | null
          expires_at?: string
          redirect_uri: string
          resource: string
          scopes: string[]
          seat_id?: string | null
          user_id: string
          verified_email: string
          workspace_id: string
        }
        Update: {
          agency_id?: string | null
          challenge?: string
          client_id?: string
          client_name?: string
          code_hash?: string
          consumed_at?: string | null
          expires_at?: string
          redirect_uri?: string
          resource?: string
          scopes?: string[]
          seat_id?: string | null
          user_id?: string
          verified_email?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_authorization_codes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_authorization_codes_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "provider_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_authorization_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_authorization_codes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_connections: {
        Row: {
          agency_id: string | null
          client_id: string
          client_name: string
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          resource: string
          revoked_at: string | null
          scopes: string[]
          seat_id: string | null
          user_id: string
          verified_email: string
          workspace_id: string
        }
        Insert: {
          agency_id?: string | null
          client_id: string
          client_name: string
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          resource: string
          revoked_at?: string | null
          scopes: string[]
          seat_id?: string | null
          user_id: string
          verified_email: string
          workspace_id: string
        }
        Update: {
          agency_id?: string | null
          client_id?: string
          client_name?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          resource?: string
          revoked_at?: string | null
          scopes?: string[]
          seat_id?: string | null
          user_id?: string
          verified_email?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_connections_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_connections_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "provider_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_refresh_tokens: {
        Row: {
          connection_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          scopes: string[]
          token_hash: string
        }
        Insert: {
          connection_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          scopes: string[]
          token_hash: string
        }
        Update: {
          connection_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          scopes?: string[]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_refresh_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "assistant_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_tokens: {
        Row: {
          agency_id: string | null
          client_id: string
          connection_id: string | null
          created_at: string
          expires_at: string
          resource: string
          revoked_at: string | null
          scopes: string[]
          seat_id: string | null
          token_hash: string
          user_id: string
          verified_email: string
          workspace_id: string
        }
        Insert: {
          agency_id?: string | null
          client_id: string
          connection_id?: string | null
          created_at?: string
          expires_at?: string
          resource: string
          revoked_at?: string | null
          scopes: string[]
          seat_id?: string | null
          token_hash: string
          user_id: string
          verified_email: string
          workspace_id: string
        }
        Update: {
          agency_id?: string | null
          client_id?: string
          connection_id?: string | null
          created_at?: string
          expires_at?: string
          resource?: string
          revoked_at?: string | null
          scopes?: string[]
          seat_id?: string | null
          token_hash?: string
          user_id?: string
          verified_email?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tokens_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "assistant_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_tokens_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "provider_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_website_proposals: {
        Row: {
          content_hash: string
          created_at: string
          request_hash: string
          request_id: string
          revision: number
          summary: string
          user_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          request_hash: string
          request_id: string
          revision: number
          summary: string
          user_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          request_hash?: string
          request_id?: string
          revision?: number
          summary?: string
          user_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_website_proposals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_website_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_website_proposals_workspace_id_website_work_id_r_fkey"
            columns: ["workspace_id", "website_work_id", "revision"]
            isOneToOne: false
            referencedRelation: "website_documents"
            referencedColumns: ["workspace_id", "website_work_id", "revision"]
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
      booking_calendar_health_actions: {
        Row: {
          connection_id: string
          delivery_reason: string | null
          delivery_status: string
          finished_at: string | null
          id: string
          kind: string
          last_attempt_day: string | null
          opened_at: string
          provider_message_id: string | null
          resolved_at: string | null
          revision_hash: string
          state: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          delivery_reason?: string | null
          delivery_status?: string
          finished_at?: string | null
          id?: string
          kind?: string
          last_attempt_day?: string | null
          opened_at?: string
          provider_message_id?: string | null
          resolved_at?: string | null
          revision_hash: string
          state?: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          delivery_reason?: string | null
          delivery_status?: string
          finished_at?: string | null
          id?: string
          kind?: string
          last_attempt_day?: string | null
          opened_at?: string
          provider_message_id?: string | null
          resolved_at?: string | null
          revision_hash?: string
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_calendar_health_actions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "workspace_calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_calendar_health_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_inquiry_offers: {
        Row: {
          booking_id: string | null
          buffer_minutes: number
          created_at: string
          customer: Json
          expires_at: string
          id: string
          inquiry_id: string
          offer_key: string
          selected_start: string | null
          service_name: string
          service_ref: string
          slots: Json
          tenant_stable_id: string
          timezone: string
          token_ciphertext: string
          token_hash: string
        }
        Insert: {
          booking_id?: string | null
          buffer_minutes: number
          created_at?: string
          customer: Json
          expires_at: string
          id?: string
          inquiry_id: string
          offer_key: string
          selected_start?: string | null
          service_name: string
          service_ref: string
          slots: Json
          tenant_stable_id: string
          timezone: string
          token_ciphertext: string
          token_hash: string
        }
        Update: {
          booking_id?: string | null
          buffer_minutes?: number
          created_at?: string
          customer?: Json
          expires_at?: string
          id?: string
          inquiry_id?: string
          offer_key?: string
          selected_start?: string | null
          service_name?: string
          service_ref?: string
          slots?: Json
          tenant_stable_id?: string
          timezone?: string
          token_ciphertext?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_inquiry_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "business_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_inquiry_offers_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
        ]
      }
      booking_instant_policies: {
        Row: {
          business_service_id: string | null
          calendar_key: string | null
          created_at: string
          decided_at: string | null
          id: string
          revision: number
          service_policy_revision: number | null
          settings_revision: number
          status: string
          tenant_stable_id: string | null
          workspace_id: string
        }
        Insert: {
          business_service_id?: string | null
          calendar_key?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          revision?: number
          service_policy_revision?: number | null
          settings_revision: number
          status?: string
          tenant_stable_id?: string | null
          workspace_id: string
        }
        Update: {
          business_service_id?: string | null
          calendar_key?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          revision?: number
          service_policy_revision?: number | null
          settings_revision?: number
          status?: string
          tenant_stable_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_instant_policies_business_service_id_fkey"
            columns: ["business_service_id"]
            isOneToOne: false
            referencedRelation: "business_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_instant_policies_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "booking_instant_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_service_policies: {
        Row: {
          bookable: boolean
          buffer_minutes: number
          business_service_id: string
          calendar_key: string | null
          intake: Json
          mode: string
          revision: number
          tenant_stable_id: string | null
          workspace_id: string
        }
        Insert: {
          bookable?: boolean
          buffer_minutes: number
          business_service_id: string
          calendar_key?: string | null
          intake?: Json
          mode?: string
          revision?: number
          tenant_stable_id?: string | null
          workspace_id: string
        }
        Update: {
          bookable?: boolean
          buffer_minutes?: number
          business_service_id?: string
          calendar_key?: string | null
          intake?: Json
          mode?: string
          revision?: number
          tenant_stable_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_service_policies_business_service_id_fkey"
            columns: ["business_service_id"]
            isOneToOne: false
            referencedRelation: "business_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_policies_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "booking_service_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          bookable_hours: Json | null
          bookable_overrides: Json | null
          buffer_minutes: number
          calendar_key: string
          cancellation_cutoff_hours: number
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
          cancellation_cutoff_hours?: number
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
          cancellation_cutoff_hours?: number
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
      bundle_maintenance_attachments: {
        Row: {
          approved_by: string
          binding_id: string
          bundle_id: string
          created_at: string
          hours_source: string
          id: string
          location_id: string
          reply_policy: string
          standing_versions: Json
        }
        Insert: {
          approved_by: string
          binding_id: string
          bundle_id: string
          created_at?: string
          hours_source: string
          id?: string
          location_id: string
          reply_policy: string
          standing_versions: Json
        }
        Update: {
          approved_by?: string
          binding_id?: string
          bundle_id?: string
          created_at?: string
          hours_source?: string
          id?: string
          location_id?: string
          reply_policy?: string
          standing_versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bundle_maintenance_attachments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_maintenance_attachments_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "workspace_account_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_maintenance_attachments_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: true
            referencedRelation: "responsibility_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_maintenance_event_links: {
        Row: {
          created_at: string
          event_id: string
          preparation_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          preparation_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          preparation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_maintenance_event_links_preparation_id_fkey"
            columns: ["preparation_id"]
            isOneToOne: true
            referencedRelation: "bundle_maintenance_preparations"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_maintenance_preparations: {
        Row: {
          action: string
          attachment_id: string
          created_at: string
          cycle_key: string
          draft: Json
          id: string
          prepared_by: string
          prepared_email: string
          record_revision: number
          target_ref: string
        }
        Insert: {
          action: string
          attachment_id: string
          created_at?: string
          cycle_key: string
          draft: Json
          id?: string
          prepared_by: string
          prepared_email: string
          record_revision: number
          target_ref: string
        }
        Update: {
          action?: string
          attachment_id?: string
          created_at?: string
          cycle_key?: string
          draft?: Json
          id?: string
          prepared_by?: string
          prepared_email?: string
          record_revision?: number
          target_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_maintenance_preparations_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "bundle_maintenance_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_maintenance_preparations_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_attribution_change_permissions: {
        Row: {
          business_workspace_id: string
          completed_by: string
          provider_id: string
          request_id: string
        }
        Insert: {
          business_workspace_id: string
          completed_by: string
          provider_id: string
          request_id: string
        }
        Update: {
          business_workspace_id?: string
          completed_by?: string
          provider_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_attribution_change_permissi_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attribution_change_permissions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attribution_change_permissions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attribution_change_permissions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "provider_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      business_attribution_endings: {
        Row: {
          attribution_id: string
          ended_by: string
          provider_change_request_id: string | null
          receipt: Json
          to_at: string
          workspace_exit_request_id: string | null
        }
        Insert: {
          attribution_id: string
          ended_by: string
          provider_change_request_id?: string | null
          receipt: Json
          to_at: string
          workspace_exit_request_id?: string | null
        }
        Update: {
          attribution_id?: string
          ended_by?: string
          provider_change_request_id?: string | null
          receipt?: Json
          to_at?: string
          workspace_exit_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_attribution_endings_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: true
            referencedRelation: "business_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attribution_endings_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attribution_endings_provider_change_request_id_fkey"
            columns: ["provider_change_request_id"]
            isOneToOne: false
            referencedRelation: "provider_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attribution_endings_workspace_exit_request_id_fkey"
            columns: ["workspace_exit_request_id"]
            isOneToOne: false
            referencedRelation: "workspace_exit_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      business_attributions: {
        Row: {
          agency_workspace_id: string
          business_workspace_id: string
          command_id: string
          confirmed_by: string
          from_at: string
          id: string
          provider_snapshot_id: string
          receipt: Json
          source: string
          source_receipt: Json
        }
        Insert: {
          agency_workspace_id: string
          business_workspace_id: string
          command_id: string
          confirmed_by: string
          from_at?: string
          id?: string
          provider_snapshot_id: string
          receipt: Json
          source: string
          source_receipt: Json
        }
        Update: {
          agency_workspace_id?: string
          business_workspace_id?: string
          command_id?: string
          confirmed_by?: string
          from_at?: string
          id?: string
          provider_snapshot_id?: string
          receipt?: Json
          source?: string
          source_receipt?: Json
        }
        Relationships: [
          {
            foreignKeyName: "business_attributions_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attributions_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attributions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_attributions_provider_snapshot_id_fkey"
            columns: ["provider_snapshot_id"]
            isOneToOne: false
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      business_booking_access: {
        Row: {
          agent_name: string | null
          booking_id: string
          confirm_ciphertext: string | null
          confirm_hash: string | null
          confirm_until: string | null
          confirmed_at: string | null
          manage_ciphertext: string
          manage_hash: string
          status_ciphertext: string | null
          status_hash: string | null
        }
        Insert: {
          agent_name?: string | null
          booking_id: string
          confirm_ciphertext?: string | null
          confirm_hash?: string | null
          confirm_until?: string | null
          confirmed_at?: string | null
          manage_ciphertext: string
          manage_hash: string
          status_ciphertext?: string | null
          status_hash?: string | null
        }
        Update: {
          agent_name?: string | null
          booking_id?: string
          confirm_ciphertext?: string | null
          confirm_hash?: string | null
          confirm_until?: string | null
          confirmed_at?: string | null
          manage_ciphertext?: string
          manage_hash?: string
          status_ciphertext?: string | null
          status_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_access_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "business_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      business_booking_calendar_mirrors: {
        Row: {
          booking_id: string
          calendar_id: string
          claim_token: string | null
          claim_until: string | null
          detail: string | null
          external_event_id: string | null
          provider: string
          status: string
          updated_at: string
          work_id: string
        }
        Insert: {
          booking_id: string
          calendar_id: string
          claim_token?: string | null
          claim_until?: string | null
          detail?: string | null
          external_event_id?: string | null
          provider: string
          status?: string
          updated_at?: string
          work_id: string
        }
        Update: {
          booking_id?: string
          calendar_id?: string
          claim_token?: string | null
          claim_until?: string | null
          detail?: string | null
          external_event_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_calendar_mirrors_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "business_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_booking_calendar_mirrors_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      business_booking_email_events: {
        Row: {
          actor_email: string
          actor_id: string
          before_state: string
          created_at: string
          id: string
          reason: string
          state: string
          workspace_id: string
        }
        Insert: {
          actor_email: string
          actor_id: string
          before_state: string
          created_at?: string
          id?: string
          reason: string
          state: string
          workspace_id: string
        }
        Update: {
          actor_email?: string
          actor_id?: string
          before_state?: string
          created_at?: string
          id?: string
          reason?: string
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_email_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_booking_email_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_booking_email_settings: {
        Row: {
          state: string
          updated_at: string
          updated_by: string
          workspace_id: string
        }
        Insert: {
          state: string
          updated_at?: string
          updated_by: string
          workspace_id: string
        }
        Update: {
          state?: string
          updated_at?: string
          updated_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_email_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_booking_email_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      business_booking_update_epoch: {
        Row: {
          id: boolean
          starts_at: string
        }
        Insert: {
          id?: boolean
          starts_at?: string
        }
        Update: {
          id?: boolean
          starts_at?: string
        }
        Relationships: []
      }
      business_booking_updates: {
        Row: {
          audience: string
          detail: string | null
          history_id: string
          id: string
          provider_message_id: string | null
          status: string
        }
        Insert: {
          audience: string
          detail?: string | null
          history_id: string
          id?: string
          provider_message_id?: string | null
          status?: string
        }
        Update: {
          audience?: string
          detail?: string | null
          history_id?: string
          id?: string
          provider_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_booking_updates_history_id_fkey"
            columns: ["history_id"]
            isOneToOne: false
            referencedRelation: "business_booking_history"
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
          requested_at: string | null
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
          requested_at?: string | null
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
          requested_at?: string | null
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
      business_outcome_report_deliveries: {
        Row: {
          month: string
          reserved_at: string
          settled_at: string | null
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          month: string
          reserved_at?: string
          settled_at?: string | null
          status: string
          token: string
          workspace_id: string
        }
        Update: {
          month?: string
          reserved_at?: string
          settled_at?: string | null
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_outcome_report_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_owner_recipient_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          created_at: string
          decision_id: string | null
          email: string | null
          event: string
          id: number
          name: string | null
          pending: boolean | null
          previous_trusted: string | null
          revision_sequence: number | null
          source: string | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          created_at?: string
          decision_id?: string | null
          email?: string | null
          event: string
          id?: never
          name?: string | null
          pending?: boolean | null
          previous_trusted?: string | null
          revision_sequence?: number | null
          source?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          decision_id?: string | null
          email?: string | null
          event?: string
          id?: never
          name?: string | null
          pending?: boolean | null
          previous_trusted?: string | null
          revision_sequence?: number | null
          source?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      business_owner_recipient_trust: {
        Row: {
          decision_id: string | null
          email: string
          name: string | null
          revision_sequence: number | null
          source: string | null
          tenant_stable_id: string | null
          trusted_at: string
          trusted_via: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          decision_id?: string | null
          email: string
          name?: string | null
          revision_sequence?: number | null
          source?: string | null
          tenant_stable_id?: string | null
          trusted_at?: string
          trusted_via: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          decision_id?: string | null
          email?: string
          name?: string | null
          revision_sequence?: number | null
          source?: string | null
          tenant_stable_id?: string | null
          trusted_at?: string
          trusted_via?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: []
      }
      business_pages: {
        Row: {
          created_at: string
          handle: string
          published: boolean
          published_at: string | null
          updated_at: string
          updated_by: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          handle: string
          published?: boolean
          published_at?: string | null
          updated_at?: string
          updated_by: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          handle?: string
          published?: boolean
          published_at?: string | null
          updated_at?: string
          updated_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payment_attempts: {
        Row: {
          payment_id: string
          started_at: string
        }
        Insert: {
          payment_id: string
          started_at?: string
        }
        Update: {
          payment_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payment_channels: {
        Row: {
          channel: string
          created_at: string
          payment_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          payment_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_payment_channels_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payment_events: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          kind: string
          merchant_account_id: string
          payment_id: string
          provider_event_id: string
          provider_object_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          kind: string
          merchant_account_id: string
          payment_id: string
          provider_event_id: string
          provider_object_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: string
          merchant_account_id?: string
          payment_id?: string
          provider_event_id?: string
          provider_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payment_provider_bindings: {
        Row: {
          account_id: string
          checkout_id: string | null
          payment_id: string
          provider_id: string
        }
        Insert: {
          account_id: string
          checkout_id?: string | null
          payment_id: string
          provider_id: string
        }
        Update: {
          account_id?: string
          checkout_id?: string | null
          payment_id?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_payment_provider_bindings_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payment_requests: {
        Row: {
          accepted_terms: string | null
          agent_quote_receipt_id: string | null
          amount_cents: number
          cancellation_policy: Json
          currency: string
          expires_at: string
          id: string
          idempotency_key: string
          issued_at: string
          issued_by: string
          kind: string
          lines: Json
          source_record_id: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_terms?: string | null
          agent_quote_receipt_id?: string | null
          amount_cents: number
          cancellation_policy?: Json
          currency: string
          expires_at: string
          id?: string
          idempotency_key: string
          issued_at?: string
          issued_by: string
          kind: string
          lines: Json
          source_record_id: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_terms?: string | null
          agent_quote_receipt_id?: string | null
          amount_cents?: number
          cancellation_policy?: Json
          currency?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          issued_at?: string
          issued_by?: string
          kind?: string
          lines?: Json
          source_record_id?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_payment_requests_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_payment_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payments: {
        Row: {
          amount_cents: number
          application_fee_cents: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          merchant_account_id: string
          purpose: string
          reference_id: string | null
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          application_fee_cents?: number
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          merchant_account_id: string
          purpose: string
          reference_id?: string | null
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          application_fee_cents?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          merchant_account_id?: string
          purpose?: string
          reference_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      business_record_confirmed: {
        Row: {
          confirmed_at: string
          confirmed_by_kind: string
          decision_id: string | null
          entity: string
          entity_id: string
          revision_sequence: number | null
          state: Json
          workspace_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by_kind: string
          decision_id?: string | null
          entity: string
          entity_id: string
          revision_sequence?: number | null
          state: Json
          workspace_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by_kind?: string
          decision_id?: string | null
          entity?: string
          entity_id?: string
          revision_sequence?: number | null
          state?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_record_confirmed_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_record_confirmed_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      business_record_fact_confirmations: {
        Row: {
          changes: Json
          confirmed_at: string
          decided_by: string
          decided_by_kind: string
          decision_id: string
          record_revision: number
          revision_hash: string
          workspace_id: string
        }
        Insert: {
          changes: Json
          confirmed_at?: string
          decided_by: string
          decided_by_kind: string
          decision_id: string
          record_revision: number
          revision_hash: string
          workspace_id: string
        }
        Update: {
          changes?: Json
          confirmed_at?: string
          decided_by?: string
          decided_by_kind?: string
          decision_id?: string
          record_revision?: number
          revision_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_record_fact_confirmations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: true
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_record_fact_confirmations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_records"
            referencedColumns: ["workspace_id"]
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
      business_refund_receipts: {
        Row: {
          provider_refund_id: string
          refund_request_id: string
        }
        Insert: {
          provider_refund_id: string
          refund_request_id: string
        }
        Update: {
          provider_refund_id?: string
          refund_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_refund_receipts_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: true
            referencedRelation: "business_refund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      business_refund_requests: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          idempotency_key: string
          payment_id: string
          requested_by: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          idempotency_key: string
          payment_id: string
          requested_by: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          payment_id?: string
          requested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_refund_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_refund_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_responsibility_report_state: {
        Row: {
          business_workspace_id: string
          cadence: string
          provider_workspace_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          business_workspace_id: string
          cadence: string
          provider_workspace_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          business_workspace_id?: string
          cadence?: string
          provider_workspace_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_responsibility_report_state_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_responsibility_report_state_provider_workspace_id_fkey"
            columns: ["provider_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_responsibility_report_state_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      catalog_report_receipts: {
        Row: {
          created_at: string
          id: string
          kind: string
          period: string
          provider_message_id: string | null
          reason: string | null
          recipient: string | null
          status: string
          tenant_stable_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          period: string
          provider_message_id?: string | null
          reason?: string | null
          recipient?: string | null
          status: string
          tenant_stable_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          period?: string
          provider_message_id?: string | null
          reason?: string | null
          recipient?: string | null
          status?: string
          tenant_stable_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_report_receipts_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "catalog_report_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_search_connections: {
        Row: {
          checked_at: string
          clicks: number | null
          impressions: number | null
          status: string
          tenant_stable_id: string
          unreachable_since: string | null
        }
        Insert: {
          checked_at: string
          clicks?: number | null
          impressions?: number | null
          status: string
          tenant_stable_id: string
          unreachable_since?: string | null
        }
        Update: {
          checked_at?: string
          clicks?: number | null
          impressions?: number | null
          status?: string
          tenant_stable_id?: string
          unreachable_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_search_connections_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
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
      client_resource_mandates: {
        Row: {
          agency_workspace_id: string
          customer_workspace_id: string
          effect: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          ended_by_kind: string | null
          grant_note: string | null
          granted_at: string
          granted_by: string
          granted_by_kind: string
          granter_is_agency_member: boolean
          id: string
          resource_kind: string
          resource_ref: string
          status: string
        }
        Insert: {
          agency_workspace_id: string
          customer_workspace_id: string
          effect: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_kind?: string | null
          grant_note?: string | null
          granted_at?: string
          granted_by: string
          granted_by_kind: string
          granter_is_agency_member: boolean
          id?: string
          resource_kind: string
          resource_ref: string
          status?: string
        }
        Update: {
          agency_workspace_id?: string
          customer_workspace_id?: string
          effect?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_kind?: string | null
          grant_note?: string | null
          granted_at?: string
          granted_by?: string
          granted_by_kind?: string
          granter_is_agency_member?: boolean
          id?: string
          resource_kind?: string
          resource_ref?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_resource_mandates_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_resource_mandates_customer_workspace_id_fkey"
            columns: ["customer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_resource_mandates_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_resource_mandates_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
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
      connect_webhook_events: {
        Row: {
          account_id: string
          event_id: string
          event_type: string
          payload_hash: string
          processed_at: string
        }
        Insert: {
          account_id: string
          event_id: string
          event_type: string
          payload_hash: string
          processed_at?: string
        }
        Update: {
          account_id?: string
          event_id?: string
          event_type?: string
          payload_hash?: string
          processed_at?: string
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          capabilities: Json
          configurations: string[]
          dashboard: string
          generation: number
          profile_version: string | null
          requirements: Json
          state: string
          stripe_account_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          capabilities?: Json
          configurations?: string[]
          dashboard?: string
          generation?: number
          profile_version?: string | null
          requirements?: Json
          state?: string
          stripe_account_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          capabilities?: Json
          configurations?: string[]
          dashboard?: string
          generation?: number
          profile_version?: string | null
          requirements?: Json
          state?: string
          stripe_account_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_inquiry_owner_notice_repairs: {
        Row: {
          accepted_at: string | null
          actor_id: string
          created_at: string
          gate_tenant_id: string | null
          id: string
          lead_row_id: string
          provider_event_at: string | null
          provider_message_id: string | null
          recipient: string
          status: string
          subject: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          actor_id: string
          created_at?: string
          gate_tenant_id?: string | null
          id?: string
          lead_row_id: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient: string
          status?: string
          subject: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          actor_id?: string
          created_at?: string
          gate_tenant_id?: string | null
          id?: string
          lead_row_id?: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient?: string
          status?: string
          subject?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_inquiry_owner_notice_repairs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_inquiry_owner_notice_repairs_lead_row_id_fkey"
            columns: ["lead_row_id"]
            isOneToOne: false
            referencedRelation: "tenant_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_inquiry_owner_notice_repairs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_inquiry_owner_notices: {
        Row: {
          accepted_at: string | null
          connected_site_id: string
          created_at: string
          lead_row_id: string
          provider_event_at: string | null
          provider_message_id: string | null
          recipient: string | null
          status: string
          subject: string
          tenant_id: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          connected_site_id: string
          created_at?: string
          lead_row_id: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          status?: string
          subject: string
          tenant_id?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          connected_site_id?: string
          created_at?: string
          lead_row_id?: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          status?: string
          subject?: string
          tenant_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_inquiry_owner_notices_lead_row_id_fkey"
            columns: ["lead_row_id"]
            isOneToOne: true
            referencedRelation: "tenant_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_inquiry_owner_notices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      creator_listings: {
        Row: {
          agreement_version: string | null
          created_at: string
          creator_workspace_id: string
          definition_id: string
          id: string
          maintainer_state: string
          rate_reference: string | null
          source_revision_id: string
        }
        Insert: {
          agreement_version?: string | null
          created_at?: string
          creator_workspace_id: string
          definition_id: string
          id?: string
          maintainer_state: string
          rate_reference?: string | null
          source_revision_id: string
        }
        Update: {
          agreement_version?: string | null
          created_at?: string
          creator_workspace_id?: string
          definition_id?: string
          id?: string
          maintainer_state?: string
          rate_reference?: string | null
          source_revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_listings_creator_workspace_id_fkey"
            columns: ["creator_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_royalty_terms: {
        Row: {
          agreement_version: string | null
          effective_from: string
          id: string
          listing_id: string
          maintainer_state: string
          rate_reference: string | null
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          agreement_version?: string | null
          effective_from: string
          id?: string
          listing_id: string
          maintainer_state: string
          rate_reference?: string | null
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          agreement_version?: string | null
          effective_from?: string
          id?: string
          listing_id?: string
          maintainer_state?: string
          rate_reference?: string | null
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_royalty_terms_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "creator_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_royalty_terms_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
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
      custom_sandbox_runtime_qualifications: {
        Row: {
          application_version: number
          candidate_revision: number
          checks: Json
          id: string
          image: string
          policy_version: string
          project_id: string
          reviewed_at: string
          reviewed_by: string
          source_digest: string
          team_id: string
          work_id: string
        }
        Insert: {
          application_version: number
          candidate_revision: number
          checks: Json
          id?: string
          image: string
          policy_version: string
          project_id: string
          reviewed_at?: string
          reviewed_by: string
          source_digest: string
          team_id: string
          work_id: string
        }
        Update: {
          application_version?: number
          candidate_revision?: number
          checks?: Json
          id?: string
          image?: string
          policy_version?: string
          project_id?: string
          reviewed_at?: string
          reviewed_by?: string
          source_digest?: string
          team_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_sandbox_runtime_qualifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_sandbox_runtime_qualifications_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
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
      enterprise_unit_audit: {
        Row: {
          action: string
          actor_id: string
          detail: Json
          id: number
          occurred_at: string
          organization_workspace_id: string
          row_revision: number
          unit_id: string
        }
        Insert: {
          action: string
          actor_id: string
          detail: Json
          id?: never
          occurred_at?: string
          organization_workspace_id: string
          row_revision: number
          unit_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          detail?: Json
          id?: never
          occurred_at?: string
          organization_workspace_id?: string
          row_revision?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_unit_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_unit_audit_organization_workspace_id_fkey"
            columns: ["organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_unit_audit_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "enterprise_units"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_unit_versions: {
        Row: {
          bound_at: string
          bound_by: string
          unit_id: string
          version_id: string
        }
        Insert: {
          bound_at?: string
          bound_by: string
          unit_id: string
          version_id: string
        }
        Update: {
          bound_at?: string
          bound_by?: string
          unit_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_unit_versions_bound_by_fkey"
            columns: ["bound_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_unit_versions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "enterprise_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_unit_versions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_units: {
        Row: {
          business_workspace_id: string
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          organization_workspace_id: string
          parent_id: string | null
          row_revision: number
          status: string
          updated_at: string
        }
        Insert: {
          business_workspace_id: string
          created_at?: string
          created_by: string
          id: string
          kind: string
          name: string
          organization_workspace_id: string
          parent_id?: string | null
          row_revision?: number
          status?: string
          updated_at?: string
        }
        Update: {
          business_workspace_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          name?: string
          organization_workspace_id?: string
          parent_id?: string | null
          row_revision?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_units_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_units_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_units_organization_workspace_id_fkey"
            columns: ["organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_units_parent_id_organization_workspace_id_fkey"
            columns: ["parent_id", "organization_workspace_id"]
            isOneToOne: false
            referencedRelation: "enterprise_units"
            referencedColumns: ["id", "organization_workspace_id"]
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
      google_listing_controls: {
        Row: {
          access_pending: boolean
          location_id: string
          paused: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_pending?: boolean
          location_id: string
          paused?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_pending?: boolean
          location_id?: string
          paused?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_listing_controls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_listing_receipt_payloads: {
        Row: {
          expires_at: string
          payload: Json
          receipt_id: string
          workspace_id: string
        }
        Insert: {
          expires_at: string
          payload: Json
          receipt_id: string
          workspace_id: string
        }
        Update: {
          expires_at?: string
          payload?: Json
          receipt_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_listing_receipt_payloads_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "google_listing_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_listing_receipt_payloads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_listing_receipts: {
        Row: {
          action: string
          after_origin: string
          after_state: Json | null
          authored_input: Json | null
          authority: Json
          before_origin: string
          before_state: Json | null
          binding_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          intent_digest: string | null
          location_id: string
          provider_payload_expires_at: string | null
          provider_ref: string | null
          readback: string | null
          status: string
          target_ref: string | null
          undo: Json | null
          undo_origin: string
          undoes_receipt_id: string | null
          undone_by_receipt_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action: string
          after_origin?: string
          after_state?: Json | null
          authored_input?: Json | null
          authority: Json
          before_origin?: string
          before_state?: Json | null
          binding_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          intent_digest?: string | null
          location_id: string
          provider_payload_expires_at?: string | null
          provider_ref?: string | null
          readback?: string | null
          status?: string
          target_ref?: string | null
          undo?: Json | null
          undo_origin?: string
          undoes_receipt_id?: string | null
          undone_by_receipt_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action?: string
          after_origin?: string
          after_state?: Json | null
          authored_input?: Json | null
          authority?: Json
          before_origin?: string
          before_state?: Json | null
          binding_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          intent_digest?: string | null
          location_id?: string
          provider_payload_expires_at?: string | null
          provider_ref?: string | null
          readback?: string | null
          status?: string
          target_ref?: string | null
          undo?: Json | null
          undo_origin?: string
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
      home_finder_binding_audit: {
        Row: {
          action: string
          actor_id: string | null
          binding_id: string
          detail: Json
          id: number
          occurred_at: string
          row_revision: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          binding_id: string
          detail?: Json
          id?: never
          occurred_at?: string
          row_revision: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          binding_id?: string
          detail?: Json
          id?: never
          occurred_at?: string
          row_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "home_finder_binding_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_finder_binding_audit_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "home_finder_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      home_finder_bindings: {
        Row: {
          agency_workspace_id: string
          approved_origin: string
          brokerage_name: string
          business_workspace_id: string
          created_at: string
          created_by: string
          external_installation_id: string
          id: string
          input_digest: string
          license_expires_at: string
          license_reference: string
          qualified_at: string | null
          readiness: Json | null
          row_revision: number
          source_name: string
          status: string
          system_id: string
        }
        Insert: {
          agency_workspace_id: string
          approved_origin: string
          brokerage_name: string
          business_workspace_id: string
          created_at?: string
          created_by: string
          external_installation_id: string
          id: string
          input_digest: string
          license_expires_at: string
          license_reference: string
          qualified_at?: string | null
          readiness?: Json | null
          row_revision?: number
          source_name: string
          status?: string
          system_id: string
        }
        Update: {
          agency_workspace_id?: string
          approved_origin?: string
          brokerage_name?: string
          business_workspace_id?: string
          created_at?: string
          created_by?: string
          external_installation_id?: string
          id?: string
          input_digest?: string
          license_expires_at?: string
          license_reference?: string
          qualified_at?: string | null
          readiness?: Json | null
          row_revision?: number
          source_name?: string
          status?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_finder_bindings_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_finder_bindings_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_finder_bindings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_finder_bindings_system_id_business_workspace_id_fkey"
            columns: ["system_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id", "business_workspace_id"]
          },
        ]
      }
      home_finder_configuration_commands: {
        Row: {
          actor_id: string
          binding_id: string
          command_id: string
          created_at: string
          input_digest: string
          result: Json
        }
        Insert: {
          actor_id: string
          binding_id: string
          command_id: string
          created_at?: string
          input_digest: string
          result: Json
        }
        Update: {
          actor_id?: string
          binding_id?: string
          command_id?: string
          created_at?: string
          input_digest?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "home_finder_configuration_commands_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_finder_configuration_commands_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "home_finder_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      home_finder_intake_receipts: {
        Row: {
          binding_id: string
          binding_revision: number
          input_digest: string
          provider_reference: string | null
          started_at: string
          status: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          binding_id: string
          binding_revision: number
          input_digest: string
          provider_reference?: string | null
          started_at?: string
          status: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          binding_id?: string
          binding_revision?: number
          input_digest?: string
          provider_reference?: string | null
          started_at?: string
          status?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_finder_intake_receipts_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "home_finder_bindings"
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
      inquiry_booking_offers: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          lead_row_id: string
          requested_by: string | null
          service_id: string
          service_name: string
          slots: Json
          time_zone: string
          witness: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          lead_row_id: string
          requested_by?: string | null
          service_id: string
          service_name: string
          slots: Json
          time_zone: string
          witness: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          lead_row_id?: string
          requested_by?: string | null
          service_id?: string
          service_name?: string
          slots?: Json
          time_zone?: string
          witness?: Json
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_booking_offers_lead_row_id_fkey"
            columns: ["lead_row_id"]
            isOneToOne: false
            referencedRelation: "tenant_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_booking_offers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_business_fact_proposals: {
        Row: {
          baseline: Json | null
          created_at: string
          decision_id: string | null
          fact_key: string
          fact_value: Json
          id: string
          proposed_by: string
          provenance: string
          revision_hash: string
          state: string
          workspace_id: string
        }
        Insert: {
          baseline?: Json | null
          created_at?: string
          decision_id?: string | null
          fact_key: string
          fact_value: Json
          id?: string
          proposed_by: string
          provenance: string
          revision_hash: string
          state?: string
          workspace_id: string
        }
        Update: {
          baseline?: Json | null
          created_at?: string
          decision_id?: string | null
          fact_key?: string
          fact_value?: Json
          id?: string
          proposed_by?: string
          provenance?: string
          revision_hash?: string
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_business_fact_proposals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_business_fact_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_business_fact_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_decision_notice_claims: {
        Row: {
          accepted_at: string | null
          created_at: string
          decision_id: string
          provider_event_at: string | null
          provider_message_id: string | null
          recipient: string
          revision_hash: string
          status: string
          subject: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          decision_id: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient: string
          revision_hash: string
          status?: string
          subject?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          decision_id?: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient?: string
          revision_hash?: string
          status?: string
          subject?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_decision_notice_claims_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: true
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_decision_notice_claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_decision_notice_events: {
        Row: {
          decision_id: string
          event_at: string
          provider_event_id: string
          provider_message_id: string
          status: string
        }
        Insert: {
          decision_id: string
          event_at: string
          provider_event_id: string
          provider_message_id: string
          status: string
        }
        Update: {
          decision_id?: string
          event_at?: string
          provider_event_id?: string
          provider_message_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_decision_notice_events_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "inquiry_decision_notice_claims"
            referencedColumns: ["decision_id"]
          },
        ]
      }
      inquiry_engine_reply_claims: {
        Row: {
          attempt_id: string
          claimed_at: string
          lead_row_id: string
          released_at: string | null
        }
        Insert: {
          attempt_id: string
          claimed_at?: string
          lead_row_id: string
          released_at?: string | null
        }
        Update: {
          attempt_id?: string
          claimed_at?: string
          lead_row_id?: string
          released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_engine_reply_claims_lead_row_id_fkey"
            columns: ["lead_row_id"]
            isOneToOne: true
            referencedRelation: "tenant_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_events: {
        Row: {
          actor: string
          actor_id: string | null
          at: string
          connected_site_id: string | null
          dedupe_key: string | null
          detail: Json
          id: string
          kind: string
          lead_id: string
          retain_until: string | null
          retention_minimized_at: string | null
          tenant_stable_id: string | null
          workspace_id: string | null
        }
        Insert: {
          actor: string
          actor_id?: string | null
          at?: string
          connected_site_id?: string | null
          dedupe_key?: string | null
          detail?: Json
          id?: string
          kind: string
          lead_id: string
          retain_until?: string | null
          retention_minimized_at?: string | null
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor?: string
          actor_id?: string | null
          at?: string
          connected_site_id?: string | null
          dedupe_key?: string | null
          detail?: Json
          id?: string
          kind?: string
          lead_id?: string
          retain_until?: string | null
          retention_minimized_at?: string | null
          tenant_stable_id?: string | null
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
      inquiry_retention_receipts: {
        Row: {
          connected_site_id: string | null
          id: string
          minimized_at: string
          minimized_count: number
          retain_until: string
          tenant_stable_id: string | null
        }
        Insert: {
          connected_site_id?: string | null
          id?: string
          minimized_at?: string
          minimized_count: number
          retain_until: string
          tenant_stable_id?: string | null
        }
        Update: {
          connected_site_id?: string | null
          id?: string
          minimized_at?: string
          minimized_count?: number
          retain_until?: string
          tenant_stable_id?: string | null
        }
        Relationships: []
      }
      inquiry_workspace_message_events: {
        Row: {
          actor_id: string
          at: string
          id: string
          message_id: string
          provider_event_id: string | null
          provider_message_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          at?: string
          id?: string
          message_id: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          at?: string
          id?: string
          message_id?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_workspace_message_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_workspace_message_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "inquiry_workspace_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_workspace_message_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_workspace_messages: {
        Row: {
          accepted_at: string | null
          body: string
          created_at: string
          digest: string
          id: string
          lead_row_id: string
          provider_event_at: string | null
          provider_message_id: string | null
          recipient: string
          request_id: string
          requested_by: string
          status: string
          subject: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          body: string
          created_at?: string
          digest: string
          id?: string
          lead_row_id: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient: string
          request_id: string
          requested_by: string
          status?: string
          subject: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          body?: string
          created_at?: string
          digest?: string
          id?: string
          lead_row_id?: string
          provider_event_at?: string | null
          provider_message_id?: string | null
          recipient?: string
          request_id?: string
          requested_by?: string
          status?: string
          subject?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_workspace_messages_lead_row_id_fkey"
            columns: ["lead_row_id"]
            isOneToOne: true
            referencedRelation: "tenant_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_workspace_messages_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_workspace_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      internal_tool_contact_conflicts: {
        Row: {
          created_at: string
          email_contact_id: string
          field_id: string
          id: string
          phone_contact_id: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email_contact_id: string
          field_id: string
          id?: string
          phone_contact_id: string
          work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email_contact_id?: string
          field_id?: string
          id?: string
          phone_contact_id?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_tool_contact_conflicts_email_contact_id_fkey"
            columns: ["email_contact_id"]
            isOneToOne: false
            referencedRelation: "business_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tool_contact_conflicts_phone_contact_id_fkey"
            columns: ["phone_contact_id"]
            isOneToOne: false
            referencedRelation: "business_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tool_contact_conflicts_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tool_contact_conflicts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_tool_notices: {
        Row: {
          attempts: number
          created_at: string
          created_by: string
          delivery: Json | null
          delivery_lease: string | null
          delivery_lease_until: string | null
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
          delivery?: Json | null
          delivery_lease?: string | null
          delivery_lease_until?: string | null
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
          delivery?: Json | null
          delivery_lease?: string | null
          delivery_lease_until?: string | null
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
      investigation_history_events: {
        Row: {
          event: Json
          ordinal: number
          revision: number
          run: Json | null
          work_id: string
        }
        Insert: {
          event: Json
          ordinal?: never
          revision: number
          run?: Json | null
          work_id: string
        }
        Update: {
          event?: Json
          ordinal?: never
          revision?: number
          run?: Json | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_history_events_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
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
      invoice_money_evidence: {
        Row: {
          account_id: string
          created_at: string
          event_id: string
          id: string
          invoice_id: string
          line_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          event_id: string
          id?: string
          invoice_id: string
          line_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          event_id?: string
          id?: string
          invoice_id?: string
          line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_money_evidence_account_id_line_id_fkey"
            columns: ["account_id", "line_id"]
            isOneToOne: false
            referencedRelation: "invoice_split_sources"
            referencedColumns: ["source_account_id", "invoice_line_id"]
          },
        ]
      }
      invoice_split_attributions: {
        Row: {
          attribution_id: string | null
          business_workspace_id: string
          invoice_line_id: string
          receipt: Json
          source_account_id: string
        }
        Insert: {
          attribution_id?: string | null
          business_workspace_id: string
          invoice_line_id: string
          receipt: Json
          source_account_id: string
        }
        Update: {
          attribution_id?: string | null
          business_workspace_id?: string
          invoice_line_id?: string
          receipt?: Json
          source_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_split_attributions_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "business_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_split_attributions_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_split_attributions_source_account_id_invoice_line__fkey"
            columns: ["source_account_id", "invoice_line_id"]
            isOneToOne: true
            referencedRelation: "invoice_split_sources"
            referencedColumns: ["source_account_id", "invoice_line_id"]
          },
        ]
      }
      invoice_split_sources: {
        Row: {
          basis_cents: number
          business_workspace_id: string
          charge_id: string
          created_at: string
          currency: string
          customer_id: string
          invoice_line_id: string
          payer_kind: string
          payer_workspace_id: string
          period_end: string
          period_start: string
          source_account_id: string
          subscription_id: string | null
          subscription_item_id: string | null
        }
        Insert: {
          basis_cents: number
          business_workspace_id: string
          charge_id: string
          created_at?: string
          currency: string
          customer_id: string
          invoice_line_id: string
          payer_kind: string
          payer_workspace_id: string
          period_end: string
          period_start: string
          source_account_id: string
          subscription_id?: string | null
          subscription_item_id?: string | null
        }
        Update: {
          basis_cents?: number
          business_workspace_id?: string
          charge_id?: string
          created_at?: string
          currency?: string
          customer_id?: string
          invoice_line_id?: string
          payer_kind?: string
          payer_workspace_id?: string
          period_end?: string
          period_start?: string
          source_account_id?: string
          subscription_id?: string | null
          subscription_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_split_sources_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_split_sources_payer_workspace_id_fkey"
            columns: ["payer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      legacy_google_operation_watermarks: {
        Row: {
          latest_started_at: string
          tenant_stable_id: string
        }
        Insert: {
          latest_started_at: string
          tenant_stable_id: string
        }
        Update: {
          latest_started_at?: string
          tenant_stable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_google_operation_watermarks_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
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
      money_agreements: {
        Row: {
          approved_at: string
          approved_by: string
          beneficiary_workspace_id: string
          effective_from: string
          effective_until: string | null
          id: string
          kind: string
          rate_bps: number
          rate_reference: string
          version: string
        }
        Insert: {
          approved_at: string
          approved_by: string
          beneficiary_workspace_id: string
          effective_from: string
          effective_until?: string | null
          id?: string
          kind: string
          rate_bps: number
          rate_reference: string
          version: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          beneficiary_workspace_id?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          kind?: string
          rate_bps?: number
          rate_reference?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_agreements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_agreements_beneficiary_workspace_id_fkey"
            columns: ["beneficiary_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      money_reconciliation_issues: {
        Row: {
          account_id: string
          created_at: string
          event_id: string
          event_type: string
          object_id: string | null
          reason: string
        }
        Insert: {
          account_id: string
          created_at?: string
          event_id: string
          event_type: string
          object_id?: string | null
          reason: string
        }
        Update: {
          account_id?: string
          created_at?: string
          event_id?: string
          event_type?: string
          object_id?: string | null
          reason?: string
        }
        Relationships: []
      }
      money_reconciliation_resolutions: {
        Row: {
          account_id: string
          created_at: string
          event_id: string
          evidence_id: string | null
          evidence_kind: string | null
          id: string
          kind: string
          note: string
          reason: string
          reviewed_by: string
        }
        Insert: {
          account_id: string
          created_at?: string
          event_id: string
          evidence_id?: string | null
          evidence_kind?: string | null
          id?: string
          kind: string
          note: string
          reason: string
          reviewed_by: string
        }
        Update: {
          account_id?: string
          created_at?: string
          event_id?: string
          evidence_id?: string | null
          evidence_kind?: string | null
          id?: string
          kind?: string
          note?: string
          reason?: string
          reviewed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_reconciliation_resolution_account_id_event_id_reason_fkey"
            columns: ["account_id", "event_id", "reason"]
            isOneToOne: true
            referencedRelation: "money_reconciliation_issues"
            referencedColumns: ["account_id", "event_id", "reason"]
          },
          {
            foreignKeyName: "money_reconciliation_resolutions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_contact_sync: {
        Row: {
          contact_id: string | null
          email: string
          failure_code: string | null
          status: string
          tenant_stable_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          email: string
          failure_code?: string | null
          status: string
          tenant_stable_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          email?: string
          failure_code?: string | null
          status?: string
          tenant_stable_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_contact_sync_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "business_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_contact_sync_workspace_id_fkey"
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
          creator_workspace_id: string | null
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
          source_revision_id: string | null
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
          version_lineage_id: string | null
        }
        Insert: {
          accepted_scope: string[]
          business_workspace_id: string
          command_digest: string
          configuration?: Json
          creator_workspace_id?: string | null
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
          source_revision_id?: string | null
          status?: string
          surface_ids: string[]
          updated_at?: string
          updated_by: string
          version_lineage_id?: string | null
        }
        Update: {
          accepted_scope?: string[]
          business_workspace_id?: string
          command_digest?: string
          configuration?: Json
          creator_workspace_id?: string | null
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
          source_revision_id?: string | null
          status?: string
          surface_ids?: string[]
          updated_at?: string
          updated_by?: string
          version_lineage_id?: string | null
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
            foreignKeyName: "offering_installations_creator_workspace_id_fkey"
            columns: ["creator_workspace_id"]
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
            foreignKeyName: "offering_installations_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_installations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_installations_version_lineage_id_fkey"
            columns: ["version_lineage_id"]
            isOneToOne: true
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_package_sources: {
        Row: {
          definition_id: string
          definition_version: string
          source_revision_id: string
        }
        Insert: {
          definition_id: string
          definition_version: string
          source_revision_id: string
        }
        Update: {
          definition_id?: string
          definition_version?: string
          source_revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_package_sources_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: true
            referencedRelation: "system_version_source_revisions"
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
      operator_action_approvals: {
        Row: {
          action_kind: string
          approved_at: string
          approved_by: string
          approved_email: string
          consumed_at: string | null
          consumed_by: string | null
          expires_at: string
          id: string
          target: Json
          workspace_id: string
        }
        Insert: {
          action_kind: string
          approved_at?: string
          approved_by: string
          approved_email: string
          consumed_at?: string | null
          consumed_by?: string | null
          expires_at: string
          id?: string
          target: Json
          workspace_id: string
        }
        Update: {
          action_kind?: string
          approved_at?: string
          approved_by?: string
          approved_email?: string
          consumed_at?: string | null
          consumed_by?: string | null
          expires_at?: string
          id?: string
          target?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_action_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_action_approvals_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_action_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_google_write_attempts: {
        Row: {
          acceptance: string
          attempt_id: string
          command_key: string
          receipt_id: string | null
          request: Json
          started_at: string
          tenant_id: string
          write_kind: string
        }
        Insert: {
          acceptance?: string
          attempt_id?: string
          command_key: string
          receipt_id?: string | null
          request: Json
          started_at?: string
          tenant_id: string
          write_kind: string
        }
        Update: {
          acceptance?: string
          attempt_id?: string
          command_key?: string
          receipt_id?: string | null
          request?: Json
          started_at?: string
          tenant_id?: string
          write_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_google_write_attempts_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "outside_write_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_queue_effort_context: {
        Row: {
          entry_id: string
          kind: string
          source_ref: string
          system_id: string | null
          system_label: string | null
        }
        Insert: {
          entry_id: string
          kind: string
          source_ref: string
          system_id?: string | null
          system_label?: string | null
        }
        Update: {
          entry_id?: string
          kind?: string
          source_ref?: string
          system_id?: string | null
          system_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_queue_effort_context_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "business_effort_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_queue_effort_context_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
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
      owner_decision_link_bindings: {
        Row: {
          bound_at: string
          decision_id: string
          recipient: string
          workspace_id: string
        }
        Insert: {
          bound_at?: string
          decision_id: string
          recipient: string
          workspace_id: string
        }
        Update: {
          bound_at?: string
          decision_id?: string
          recipient?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_decision_link_bindings_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_decision_link_sessions: {
        Row: {
          created_at: string
          decision_id: string
          intended_decision: string
          provider_assignment_id: string | null
          recipient: string
          revision_hash: string
          session_id: string
          website_hash: string | null
          website_revision: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          decision_id: string
          intended_decision?: string
          provider_assignment_id?: string | null
          recipient: string
          revision_hash: string
          session_id: string
          website_hash?: string | null
          website_revision?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          decision_id?: string
          intended_decision?: string
          provider_assignment_id?: string | null
          recipient?: string
          revision_hash?: string
          session_id?: string
          website_hash?: string | null
          website_revision?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_decision_link_sessions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_decision_link_sessions_provider_assignment_id_fkey"
            columns: ["provider_assignment_id"]
            isOneToOne: false
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_decision_link_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "strelva_service_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_decision_link_sessions_workspace_id_fkey"
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
      payment_request_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          payment_id: string | null
          request_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payment_id?: string | null
          request_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payment_id?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_request_actions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "business_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_request_actions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "business_payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_collection_periods: {
        Row: {
          line_id: string
          period_end: string
          period_start: string
        }
        Insert: {
          line_id: string
          period_end: string
          period_start: string
        }
        Update: {
          line_id?: string
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_collection_periods_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: true
            referencedRelation: "platform_collection_terms"
            referencedColumns: ["line_id"]
          },
        ]
      }
      platform_collection_prices: {
        Row: {
          amount_cents: number
          approved_at: string
          approved_by: string
          currency: string
          definition_id: string | null
          effective_from: string
          effective_until: string | null
          version: string
        }
        Insert: {
          amount_cents: number
          approved_at: string
          approved_by: string
          currency: string
          definition_id?: string | null
          effective_from: string
          effective_until?: string | null
          version: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string
          approved_by?: string
          currency?: string
          definition_id?: string | null
          effective_from?: string
          effective_until?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_collection_prices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_collection_settlements: {
        Row: {
          amount_cents: number
          charge_id: string
          collection_id: string
          created_at: string
          currency: string
          event_id: string
          payment_intent_id: string
        }
        Insert: {
          amount_cents: number
          charge_id: string
          collection_id: string
          created_at?: string
          currency: string
          event_id: string
          payment_intent_id: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string
          collection_id?: string
          created_at?: string
          currency?: string
          event_id?: string
          payment_intent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_collection_settlements_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: true
            referencedRelation: "platform_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_collection_terms: {
        Row: {
          accepted_at: string
          accepted_by: string
          agreement_version: string
          amount_cents: number
          business_workspace_id: string
          currency: string
          customer_id: string
          installation_id: string | null
          line_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          agreement_version: string
          amount_cents: number
          business_workspace_id: string
          currency: string
          customer_id: string
          installation_id?: string | null
          line_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          agreement_version?: string
          amount_cents?: number
          business_workspace_id?: string
          currency?: string
          customer_id?: string
          installation_id?: string | null
          line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_collection_terms_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_collection_terms_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_collection_terms_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "offering_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_collections: {
        Row: {
          agreement_version: string
          amount_cents: number
          business_workspace_id: string
          created_at: string
          currency: string
          customer_id: string
          id: string
          idempotency_key: string
          installation_id: string | null
          invoice_line_id: string
        }
        Insert: {
          agreement_version: string
          amount_cents: number
          business_workspace_id: string
          created_at?: string
          currency: string
          customer_id: string
          id?: string
          idempotency_key: string
          installation_id?: string | null
          invoice_line_id: string
        }
        Update: {
          agreement_version?: string
          amount_cents?: number
          business_workspace_id?: string
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          installation_id?: string | null
          invoice_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_collections_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_collections_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "offering_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_operator_read_audit: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          reader_name: string
          scope: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          reader_name: string
          scope?: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          reader_name?: string
          scope?: string
        }
        Relationships: []
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
      private_application_sources: {
        Row: {
          source_system_id: string
        }
        Insert: {
          source_system_id: string
        }
        Update: {
          source_system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_application_sources_source_system_id_fkey"
            columns: ["source_system_id"]
            isOneToOne: true
            referencedRelation: "system_version_sources"
            referencedColumns: ["system_id"]
          },
        ]
      }
      private_definition_function_receipts: {
        Row: {
          acl: Json
          body_sha256: string
          signature: string
        }
        Insert: {
          acl: Json
          body_sha256: string
          signature: string
        }
        Update: {
          acl?: Json
          body_sha256?: string
          signature?: string
        }
        Relationships: []
      }
      private_definition_predecessors: {
        Row: {
          after_acl: Json | null
          after_sha256: string | null
          before_acl: unknown[]
          before_definition: string
          signature: string
        }
        Insert: {
          after_acl?: Json | null
          after_sha256?: string | null
          before_acl: unknown[]
          before_definition: string
          signature: string
        }
        Update: {
          after_acl?: Json | null
          after_sha256?: string | null
          before_acl?: unknown[]
          before_definition?: string
          signature?: string
        }
        Relationships: []
      }
      private_source_install_grants: {
        Row: {
          grant_id: string
        }
        Insert: {
          grant_id: string
        }
        Update: {
          grant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_source_install_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "system_package_install_grants"
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
      prospects: {
        Row: {
          agency_workspace_id: string
          business: string
          created_at: string
          email: string
          grade: string
          id: string
          name: string
          result_id: string
          score: number
          source: string
          url: string | null
        }
        Insert: {
          agency_workspace_id: string
          business: string
          created_at?: string
          email: string
          grade: string
          id?: string
          name: string
          result_id: string
          score: number
          source: string
          url?: string | null
        }
        Update: {
          agency_workspace_id?: string
          business?: string
          created_at?: string
          email?: string
          grade?: string
          id?: string
          name?: string
          result_id?: string
          score?: number
          source?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "agency_prospecting_profiles"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      provider_change_cancellations: {
        Row: {
          cancelled_at: string
          cancelled_by: string
          request_id: string
          verified_email: string
        }
        Insert: {
          cancelled_at?: string
          cancelled_by: string
          request_id: string
          verified_email: string
        }
        Update: {
          cancelled_at?: string
          cancelled_by?: string
          request_id?: string
          verified_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_change_cancellations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_cancellations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "provider_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_change_policy: {
        Row: {
          approved_at: string
          approved_by: string
          response_window_seconds: number
          version: string
        }
        Insert: {
          approved_at: string
          approved_by: string
          response_window_seconds: number
          version: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          response_window_seconds?: number
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_change_policy_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_change_requests: {
        Row: {
          business_workspace_id: string
          id: string
          idempotency_key: string
          new_agency_workspace_id: string | null
          old_provider_id: string | null
          payer_transition_id: string | null
          policy_version: string | null
          requested_at: string
          requested_by: string
          respond_by: string | null
          status: string
        }
        Insert: {
          business_workspace_id: string
          id?: string
          idempotency_key: string
          new_agency_workspace_id?: string | null
          old_provider_id?: string | null
          payer_transition_id?: string | null
          policy_version?: string | null
          requested_at?: string
          requested_by: string
          respond_by?: string | null
          status: string
        }
        Update: {
          business_workspace_id?: string
          id?: string
          idempotency_key?: string
          new_agency_workspace_id?: string | null
          old_provider_id?: string | null
          payer_transition_id?: string | null
          policy_version?: string | null
          requested_at?: string
          requested_by?: string
          respond_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_change_requests_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_requests_new_agency_workspace_id_fkey"
            columns: ["new_agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_requests_old_provider_id_fkey"
            columns: ["old_provider_id"]
            isOneToOne: false
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_requests_payer_transition_id_fkey"
            columns: ["payer_transition_id"]
            isOneToOne: false
            referencedRelation: "workspace_payer_transitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_requests_policy_version_fkey"
            columns: ["policy_version"]
            isOneToOne: false
            referencedRelation: "provider_change_policy"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "provider_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_change_responses: {
        Row: {
          agency_workspace_id: string
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          note: string
          request_id: string
          responded_by: string
        }
        Insert: {
          agency_workspace_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          note: string
          request_id: string
          responded_by: string
        }
        Update: {
          agency_workspace_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          note?: string
          request_id?: string
          responded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_change_responses_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "provider_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_change_responses_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_client_queue_catalog_guard: {
        Row: {
          definition_hash: string
        }
        Insert: {
          definition_hash: string
        }
        Update: {
          definition_hash?: string
        }
        Relationships: []
      }
      provider_completion_cleanup_receipts: {
        Row: {
          agency_workspace_id: string
          business_workspace_id: string
          ended_at: string
          ended_by: string | null
          provider_id: string
          receipt: Json
        }
        Insert: {
          agency_workspace_id: string
          business_workspace_id: string
          ended_at: string
          ended_by?: string | null
          provider_id: string
          receipt: Json
        }
        Update: {
          agency_workspace_id?: string
          business_workspace_id?: string
          ended_at?: string
          ended_by?: string | null
          provider_id?: string
          receipt?: Json
        }
        Relationships: [
          {
            foreignKeyName: "provider_completion_cleanup_receipts_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_completion_cleanup_receipts_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_completion_cleanup_receipts_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_completion_cleanup_receipts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_completion_rollback_state: {
        Row: {
          definition: string
          normalized_acl: Json
          owner_name: string
          signature: string
        }
        Insert: {
          definition: string
          normalized_acl: Json
          owner_name: string
          signature: string
        }
        Update: {
          definition?: string
          normalized_acl?: Json
          owner_name?: string
          signature?: string
        }
        Relationships: []
      }
      provider_disconnect_receipts: {
        Row: {
          actor_user_id: string | null
          cleared_stores: string[]
          connection_source: string
          created_at: string
          id: string
          local_cleanup_status: string
          provider: string
          revocation_error_code: string | null
          revocation_outcome: string
          tenant_stable_id: string | null
          workspace_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          cleared_stores?: string[]
          connection_source: string
          created_at?: string
          id?: string
          local_cleanup_status: string
          provider: string
          revocation_error_code?: string | null
          revocation_outcome: string
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          cleared_stores?: string[]
          connection_source?: string
          created_at?: string
          id?: string
          local_cleanup_status?: string
          provider?: string
          revocation_error_code?: string | null
          revocation_outcome?: string
          tenant_stable_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      provider_exit_completion_permissions: {
        Row: {
          business_workspace_id: string
          ended_by: string
          provider_id: string
          workspace_exit_request_id: string
        }
        Insert: {
          business_workspace_id: string
          ended_by: string
          provider_id: string
          workspace_exit_request_id: string
        }
        Update: {
          business_workspace_id?: string
          ended_by?: string
          provider_id?: string
          workspace_exit_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_exit_completion_permiss_workspace_exit_request_id_fkey"
            columns: ["workspace_exit_request_id"]
            isOneToOne: true
            referencedRelation: "workspace_exit_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_exit_completion_permissions_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_exit_completion_permissions_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_exit_completion_permissions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
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
      public_booking_requests: {
        Row: {
          created_at: string
          customer_email: string
          end_at: string
          expires_at: string
          fingerprint: string
          request_id: string
          start_at: string
          state: string
          tenant_stable_id: string
          token_ciphertext: string
          token_hash: string
          visitor: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          end_at: string
          expires_at?: string
          fingerprint: string
          request_id: string
          start_at: string
          state?: string
          tenant_stable_id: string
          token_ciphertext: string
          token_hash: string
          visitor: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          end_at?: string
          expires_at?: string
          fingerprint?: string
          request_id?: string
          start_at?: string
          state?: string
          tenant_stable_id?: string
          token_ciphertext?: string
          token_hash?: string
          visitor?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_booking_requests_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "public_booking_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          email_confirmation_expires_at: string | null
          email_confirmation_required: boolean
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
          email_confirmation_expires_at?: string | null
          email_confirmation_required?: boolean
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
          email_confirmation_expires_at?: string | null
          email_confirmation_required?: boolean
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
      publishing_google_outages: {
        Row: {
          binding_id: string
          browser_hash: string | null
          consumed_at: string | null
          expires_at: string
          id: string
          initiated_at: string | null
          notice_accepted_at: string | null
          notice_status: string
          opened_at: string
          provider_message_id: string | null
          recipient: string
          restored_at: string | null
          state_hash: string | null
          workspace_id: string
        }
        Insert: {
          binding_id: string
          browser_hash?: string | null
          consumed_at?: string | null
          expires_at?: string
          id?: string
          initiated_at?: string | null
          notice_accepted_at?: string | null
          notice_status?: string
          opened_at?: string
          provider_message_id?: string | null
          recipient: string
          restored_at?: string | null
          state_hash?: string | null
          workspace_id: string
        }
        Update: {
          binding_id?: string
          browser_hash?: string | null
          consumed_at?: string | null
          expires_at?: string
          id?: string
          initiated_at?: string | null
          notice_accepted_at?: string | null
          notice_status?: string
          opened_at?: string
          provider_message_id?: string | null
          recipient?: string
          restored_at?: string | null
          state_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_google_outages_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: true
            referencedRelation: "workspace_account_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_google_outages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      responsibility_bundle_members: {
        Row: {
          bundle_id: string
          responsibility_key: string
          standing_responsibility_id: string
        }
        Insert: {
          bundle_id: string
          responsibility_key: string
          standing_responsibility_id: string
        }
        Update: {
          bundle_id?: string
          responsibility_key?: string
          standing_responsibility_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_bundle_members_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "responsibility_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibility_bundle_members_standing_responsibility_id_fkey"
            columns: ["standing_responsibility_id"]
            isOneToOne: true
            referencedRelation: "standing_responsibilities"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibility_bundles: {
        Row: {
          business_workspace_id: string
          command: Json
          created_at: string
          id: string
          idempotency_key: string
          provider_workspace_id: string
          service_request_id: string
        }
        Insert: {
          business_workspace_id: string
          command: Json
          created_at?: string
          id?: string
          idempotency_key: string
          provider_workspace_id: string
          service_request_id: string
        }
        Update: {
          business_workspace_id?: string
          command?: Json
          created_at?: string
          id?: string
          idempotency_key?: string
          provider_workspace_id?: string
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_bundles_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibility_bundles_provider_workspace_id_fkey"
            columns: ["provider_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibility_bundles_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibility_meter_capture_attempts: {
        Row: {
          attempted_at: string
          business_workspace_id: string
          month: string
          status: string
        }
        Insert: {
          attempted_at: string
          business_workspace_id: string
          month: string
          status: string
        }
        Update: {
          attempted_at?: string
          business_workspace_id?: string
          month?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_meter_capture_attempt_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibility_meter_months: {
        Row: {
          business_workspace_id: string
          captured_at: string
          month: string
          snapshot: Json
        }
        Insert: {
          business_workspace_id: string
          captured_at?: string
          month: string
          snapshot: Json
        }
        Update: {
          business_workspace_id?: string
          captured_at?: string
          month?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_meter_months_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibility_meter_periods: {
        Row: {
          business_workspace_id: string
          capture_day: string
          captured_at: string
          id: string
          month: string
          snapshot: Json
        }
        Insert: {
          business_workspace_id: string
          capture_day?: string
          captured_at?: string
          id?: string
          month: string
          snapshot: Json
        }
        Update: {
          business_workspace_id?: string
          capture_day?: string
          captured_at?: string
          id?: string
          month?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "responsibility_meter_periods_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_splits: {
        Row: {
          agreement_version: string | null
          amount_cents: number
          attribution_id: string | null
          basis_cents: number
          beneficiary_kind: string
          beneficiary_workspace_id: string | null
          business_workspace_id: string
          created_at: string
          currency: string
          event_key: string
          id: string
          installation_id: string | null
          invoice_line_id: string
          maintainer_state: string | null
          original_split_id: string | null
          period_end: string
          period_start: string
          rate_bps: number | null
          rate_reference: string | null
          source_account_id: string
          source_charge_id: string
          source_revision_id: string | null
        }
        Insert: {
          agreement_version?: string | null
          amount_cents: number
          attribution_id?: string | null
          basis_cents: number
          beneficiary_kind: string
          beneficiary_workspace_id?: string | null
          business_workspace_id: string
          created_at?: string
          currency: string
          event_key: string
          id?: string
          installation_id?: string | null
          invoice_line_id: string
          maintainer_state?: string | null
          original_split_id?: string | null
          period_end: string
          period_start: string
          rate_bps?: number | null
          rate_reference?: string | null
          source_account_id: string
          source_charge_id: string
          source_revision_id?: string | null
        }
        Update: {
          agreement_version?: string | null
          amount_cents?: number
          attribution_id?: string | null
          basis_cents?: number
          beneficiary_kind?: string
          beneficiary_workspace_id?: string | null
          business_workspace_id?: string
          created_at?: string
          currency?: string
          event_key?: string
          id?: string
          installation_id?: string | null
          invoice_line_id?: string
          maintainer_state?: string | null
          original_split_id?: string | null
          period_end?: string
          period_start?: string
          rate_bps?: number | null
          rate_reference?: string | null
          source_account_id?: string
          source_charge_id?: string
          source_revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_splits_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "workspace_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_beneficiary_workspace_id_fkey"
            columns: ["beneficiary_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_original_split_id_fkey"
            columns: ["original_split_id"]
            isOneToOne: false
            referencedRelation: "revenue_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author: string
          created_at: string
          external_id: string | null
          id: string
          provider_content: Json | null
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
          provider_content?: Json | null
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
          provider_content?: Json | null
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
      sandbox_build_attempts: {
        Row: {
          admitted_by: string
          application_version: number
          at: string
          attempt_name: string
          candidate_revision: number
          execution_key: string
          id: string
          image: string
          job_id: string
          maximum_cents: number
          project_id: string
          source_digest: string
          team_id: string
          work_id: string
          workspace_id: string
        }
        Insert: {
          admitted_by: string
          application_version: number
          at?: string
          attempt_name: string
          candidate_revision: number
          execution_key: string
          id?: string
          image: string
          job_id: string
          maximum_cents: number
          project_id: string
          source_digest: string
          team_id: string
          work_id: string
          workspace_id: string
        }
        Update: {
          admitted_by?: string
          application_version?: number
          at?: string
          attempt_name?: string
          candidate_revision?: number
          execution_key?: string
          id?: string
          image?: string
          job_id?: string
          maximum_cents?: number
          project_id?: string
          source_digest?: string
          team_id?: string
          work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_build_attempts_admitted_by_fkey"
            columns: ["admitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_build_attempts_job_id_execution_key_fkey"
            columns: ["job_id", "execution_key"]
            isOneToOne: false
            referencedRelation: "job_economics_executions"
            referencedColumns: ["job_id", "execution_key"]
          },
          {
            foreignKeyName: "sandbox_build_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_economics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_build_attempts_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_build_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_build_billing_evidence: {
        Row: {
          at: string
          attempt_id: string
          billable_usd: string
          currency: string
          id: string
          provider_reference: string
          session_id: string
        }
        Insert: {
          at?: string
          attempt_id: string
          billable_usd: string
          currency: string
          id?: string
          provider_reference: string
          session_id: string
        }
        Update: {
          at?: string
          attempt_id?: string
          billable_usd?: string
          currency?: string
          id?: string
          provider_reference?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_build_billing_evidence_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "sandbox_build_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_build_observations: {
        Row: {
          at: string
          attempt_id: string
          id: string
          kind: string
          payload: Json
          session_id: string | null
        }
        Insert: {
          at?: string
          attempt_id: string
          id?: string
          kind: string
          payload: Json
          session_id?: string | null
        }
        Update: {
          at?: string
          attempt_id?: string
          id?: string
          kind?: string
          payload?: Json
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_build_observations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "sandbox_build_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_build_runtime_bindings: {
        Row: {
          attempt_id: string
          qualification_id: string
        }
        Insert: {
          attempt_id: string
          qualification_id: string
        }
        Update: {
          attempt_id?: string
          qualification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_build_runtime_bindings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "sandbox_build_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_build_runtime_bindings_qualification_id_fkey"
            columns: ["qualification_id"]
            isOneToOne: false
            referencedRelation: "custom_sandbox_runtime_qualifications"
            referencedColumns: ["id"]
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
      split_attribution_rollback_state: {
        Row: {
          acl_hash: string
          definition_hash: string
          signature: string
        }
        Insert: {
          acl_hash: string
          definition_hash: string
          signature: string
        }
        Update: {
          acl_hash?: string
          definition_hash?: string
          signature?: string
        }
        Relationships: []
      }
      split_loss_receipts: {
        Row: {
          charge_basis: number
          charge_id: string
          created_at: string
          event_key: string
          loss_cents: number
          source_account_id: string
        }
        Insert: {
          charge_basis: number
          charge_id: string
          created_at?: string
          event_key: string
          loss_cents: number
          source_account_id: string
        }
        Update: {
          charge_basis?: number
          charge_id?: string
          created_at?: string
          event_key?: string
          loss_cents?: number
          source_account_id?: string
        }
        Relationships: []
      }
      split_payout_authorizations: {
        Row: {
          approved_at: string
          approved_by: string
          payout_id: string
          profile_version: string
        }
        Insert: {
          approved_at: string
          approved_by: string
          payout_id: string
          profile_version: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          payout_id?: string
          profile_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_payout_authorizations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_payout_authorizations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: true
            referencedRelation: "split_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_payouts: {
        Row: {
          agreement_version: string
          amount_cents: number
          created_at: string
          currency: string
          id: string
          mode: string
          recipient_account_id: string
          source_account_id: string
          source_transaction: string
          split_id: string
        }
        Insert: {
          agreement_version: string
          amount_cents: number
          created_at?: string
          currency: string
          id?: string
          mode?: string
          recipient_account_id: string
          source_account_id: string
          source_transaction: string
          split_id: string
        }
        Update: {
          agreement_version?: string
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          mode?: string
          recipient_account_id?: string
          source_account_id?: string
          source_transaction?: string
          split_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_payouts_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: true
            referencedRelation: "revenue_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      split_reconciliation_leases: {
        Row: {
          charge_id: string
          expires_at: string
          generation: number
          source_account: string
        }
        Insert: {
          charge_id: string
          expires_at: string
          generation: number
          source_account: string
        }
        Update: {
          charge_id?: string
          expires_at?: string
          generation?: number
          source_account?: string
        }
        Relationships: []
      }
      split_recovery_attempts: {
        Row: {
          recovery_id: string
          started_at: string
        }
        Insert: {
          recovery_id: string
          started_at?: string
        }
        Update: {
          recovery_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_recovery_attempts_recovery_id_fkey"
            columns: ["recovery_id"]
            isOneToOne: true
            referencedRelation: "split_recovery_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_recovery_payouts: {
        Row: {
          amount_cents: number
          authorized_by: string
          created_at: string
          id: string
          idempotency_key: string
          payout_id: string
          profile_version: string
          restoration_id: string
        }
        Insert: {
          amount_cents: number
          authorized_by: string
          created_at?: string
          id?: string
          idempotency_key: string
          payout_id: string
          profile_version: string
          restoration_id: string
        }
        Update: {
          amount_cents?: number
          authorized_by?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          payout_id?: string
          profile_version?: string
          restoration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_recovery_payouts_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_recovery_payouts_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "split_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_recovery_payouts_restoration_id_fkey"
            columns: ["restoration_id"]
            isOneToOne: false
            referencedRelation: "revenue_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      split_recovery_receipts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          recovery_id: string
          transfer_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          recovery_id: string
          transfer_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          recovery_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_recovery_receipts_recovery_id_fkey"
            columns: ["recovery_id"]
            isOneToOne: true
            referencedRelation: "split_recovery_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_recovery_reversal_receipts: {
        Row: {
          amount_cents: number
          created_at: string
          provider_reversal_id: string
          reversal_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          provider_reversal_id: string
          reversal_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          provider_reversal_id?: string
          reversal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_recovery_reversal_receipts_reversal_id_fkey"
            columns: ["reversal_id"]
            isOneToOne: true
            referencedRelation: "split_recovery_reversals"
            referencedColumns: ["id"]
          },
        ]
      }
      split_recovery_reversals: {
        Row: {
          amount_cents: number
          id: string
          loss_id: string
          recovery_id: string
          started_at: string
        }
        Insert: {
          amount_cents: number
          id?: string
          loss_id: string
          recovery_id: string
          started_at?: string
        }
        Update: {
          amount_cents?: number
          id?: string
          loss_id?: string
          recovery_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_recovery_reversals_loss_id_fkey"
            columns: ["loss_id"]
            isOneToOne: false
            referencedRelation: "revenue_splits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_recovery_reversals_recovery_id_fkey"
            columns: ["recovery_id"]
            isOneToOne: false
            referencedRelation: "split_recovery_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_transfer_attempts: {
        Row: {
          payout_id: string
          started_at: string
        }
        Insert: {
          payout_id: string
          started_at?: string
        }
        Update: {
          payout_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_transfer_attempts_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: true
            referencedRelation: "split_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_transfer_receipts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          payout_id: string
          transfer_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          payout_id: string
          transfer_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          payout_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_transfer_receipts_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: true
            referencedRelation: "split_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      split_transfer_reversal_receipts: {
        Row: {
          amount_cents: number
          created_at: string
          reversal_id: string
          reversal_request_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          reversal_id: string
          reversal_request_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          reversal_id?: string
          reversal_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_transfer_reversal_receipts_reversal_request_id_fkey"
            columns: ["reversal_request_id"]
            isOneToOne: true
            referencedRelation: "split_transfer_reversals"
            referencedColumns: ["id"]
          },
        ]
      }
      split_transfer_reversals: {
        Row: {
          amount_cents: number
          id: string
          loss_event: string
          payout_id: string
          started_at: string
        }
        Insert: {
          amount_cents: number
          id?: string
          loss_event: string
          payout_id: string
          started_at?: string
        }
        Update: {
          amount_cents?: number
          id?: string
          loss_event?: string
          payout_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_transfer_reversals_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "split_payouts"
            referencedColumns: ["id"]
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
          business_workspace_id: string | null
          client_billing_state: string | null
          client_payment_status: string | null
          client_plan_key: string | null
          created_at: string
          ended_at: string | null
          id: number
          line_state: string
          stripe_item_id: string | null
          stripe_price_id: string | null
          subscription_id: string
          tenant_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          business_workspace_id?: string | null
          client_billing_state?: string | null
          client_payment_status?: string | null
          client_plan_key?: string | null
          created_at?: string
          ended_at?: string | null
          id?: number
          line_state?: string
          stripe_item_id?: string | null
          stripe_price_id?: string | null
          subscription_id: string
          tenant_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          business_workspace_id?: string | null
          client_billing_state?: string | null
          client_payment_status?: string | null
          client_plan_key?: string | null
          created_at?: string
          ended_at?: string | null
          id?: number
          line_state?: string
          stripe_item_id?: string | null
          stripe_price_id?: string | null
          subscription_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
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
            isOneToOne: true
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
      super_admin_access_events: {
        Row: {
          action: string
          actor_email: string
          actor_user_id: string
          break_glass: boolean
          id: number
          occurred_at: string
          reason: string
          target_email: string
          target_user_id: string
          via: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_user_id: string
          break_glass?: boolean
          id?: never
          occurred_at?: string
          reason: string
          target_email: string
          target_user_id: string
          via: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_user_id?: string
          break_glass?: boolean
          id?: never
          occurred_at?: string
          reason?: string
          target_email?: string
          target_user_id?: string
          via?: string
        }
        Relationships: []
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
      system_bundle_components: {
        Row: {
          bundle_id: string
          capability_id: string | null
          component_key: string
          request_id: string | null
          version_id: string
          work_id: string | null
        }
        Insert: {
          bundle_id: string
          capability_id?: string | null
          component_key: string
          request_id?: string | null
          version_id: string
          work_id?: string | null
        }
        Update: {
          bundle_id?: string
          capability_id?: string | null
          component_key?: string
          request_id?: string | null
          version_id?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_components_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "system_bundle_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_components_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_components_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_draft_permissions: {
        Row: {
          grant_id: string
          work_id: string
        }
        Insert: {
          grant_id: string
          work_id: string
        }
        Update: {
          grant_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_draft_permissions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "system_package_install_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_draft_permissions_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: true
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_installations: {
        Row: {
          business_workspace_id: string
          command_digest: string
          command_id: string
          created_at: string
          created_by: string
          id: string
          receipt: Json | null
          source_revision_id: string
        }
        Insert: {
          business_workspace_id: string
          command_digest: string
          command_id: string
          created_at?: string
          created_by: string
          id?: string
          receipt?: Json | null
          source_revision_id: string
        }
        Update: {
          business_workspace_id?: string
          command_digest?: string
          command_id?: string
          created_at?: string
          created_by?: string
          id?: string
          receipt?: Json | null
          source_revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_installations_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_installations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_installations_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_native_bindings: {
        Row: {
          created_at: string
          inquiry_tenant_stable_id: string | null
          version_id: string
          website_page_path: string | null
          website_work_id: string | null
        }
        Insert: {
          created_at?: string
          inquiry_tenant_stable_id?: string | null
          version_id: string
          website_page_path?: string | null
          website_work_id?: string | null
        }
        Update: {
          created_at?: string
          inquiry_tenant_stable_id?: string | null
          version_id?: string
          website_page_path?: string | null
          website_work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_native_bindings_inquiry_tenant_stable_id_fkey"
            columns: ["inquiry_tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "system_bundle_native_bindings_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_native_bindings_website_work_id_fkey"
            columns: ["website_work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_native_preparations: {
        Row: {
          created_at: string
          definition: Json
          id: string
          native_capability_id: string | null
          native_hash: string | null
          native_request_id: string | null
          native_revision: number
          native_work_id: string
          prepared_by: string
          row_revision: number
          source_revision_id: string
          version_id: string
        }
        Insert: {
          created_at?: string
          definition: Json
          id?: string
          native_capability_id?: string | null
          native_hash?: string | null
          native_request_id?: string | null
          native_revision: number
          native_work_id: string
          prepared_by: string
          row_revision: number
          source_revision_id: string
          version_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          native_capability_id?: string | null
          native_hash?: string | null
          native_request_id?: string | null
          native_revision?: number
          native_work_id?: string
          prepared_by?: string
          row_revision?: number
          source_revision_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_native_preparations_native_work_id_fkey"
            columns: ["native_work_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_native_preparations_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_native_preparations_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_native_preparations_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "system_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_native_rehearsals: {
        Row: {
          artifacts: Json
          created_at: string
          created_by: string
          revision_id: string
        }
        Insert: {
          artifacts: Json
          created_at?: string
          created_by: string
          revision_id: string
        }
        Update: {
          artifacts?: Json
          created_at?: string
          created_by?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_native_rehearsals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_native_rehearsals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: true
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_native_release_receipts: {
        Row: {
          created_at: string
          native_receipt_id: string
          owner_id: string
          preparation_id: string
          release_number: number
          verified_at: string
        }
        Insert: {
          created_at?: string
          native_receipt_id: string
          owner_id: string
          preparation_id: string
          release_number: number
          verified_at: string
        }
        Update: {
          created_at?: string
          native_receipt_id?: string
          owner_id?: string
          preparation_id?: string
          release_number?: number
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_native_release_receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_native_release_receipts_preparation_id_fkey"
            columns: ["preparation_id"]
            isOneToOne: true
            referencedRelation: "system_bundle_native_preparations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bundle_target_scopes: {
        Row: {
          created_at: string
          grant_id: string
          granted_by: string
          targets: Json
        }
        Insert: {
          created_at?: string
          grant_id: string
          granted_by: string
          targets: Json
        }
        Update: {
          created_at?: string
          grant_id?: string
          granted_by?: string
          targets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_bundle_target_scopes_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "system_package_install_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_bundle_target_scopes_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
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
      system_package_install_grants: {
        Row: {
          agency_workspace_id: string
          business_workspace_id: string
          command_id: string
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          source_revision_id: string
          status: string
          work_id: string
        }
        Insert: {
          agency_workspace_id: string
          business_workspace_id: string
          command_id: string
          created_at?: string
          expires_at: string
          granted_by: string
          id?: string
          source_revision_id: string
          status?: string
          work_id?: string
        }
        Update: {
          agency_workspace_id?: string
          business_workspace_id?: string
          command_id?: string
          created_at?: string
          expires_at?: string
          granted_by?: string
          id?: string
          source_revision_id?: string
          status?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_package_install_grants_agency_workspace_id_fkey"
            columns: ["agency_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_package_install_grants_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_package_install_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_package_install_grants_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
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
      system_revision_qualifications: {
        Row: {
          checked_at: string
          evidence: Json
          human_state: string
          review_note: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_policy_version: string | null
          revision_id: string
        }
        Insert: {
          checked_at?: string
          evidence: Json
          human_state?: string
          review_note?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_policy_version?: string | null
          revision_id: string
        }
        Update: {
          checked_at?: string
          evidence?: Json
          human_state?: string
          review_note?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_policy_version?: string | null
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_revision_qualifications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_revision_qualifications_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: true
            referencedRelation: "system_version_source_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_revision_reviewers: {
        Row: {
          active: boolean
          policy_version: string
          user_id: string
        }
        Insert: {
          active?: boolean
          policy_version: string
          user_id: string
        }
        Update: {
          active?: boolean
          policy_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_revision_reviewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      system_version_native_applications: {
        Row: {
          business_workspace_id: string
          synced_design_revision: number
          version_id: string
          work_id: string
        }
        Insert: {
          business_workspace_id: string
          synced_design_revision?: number
          version_id: string
          work_id: string
        }
        Update: {
          business_workspace_id?: string
          synced_design_revision?: number
          version_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_native_applica_work_id_business_workspace_i_fkey"
            columns: ["work_id", "business_workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "system_version_native_applications_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_native_applications_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
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
      system_version_preparations: {
        Row: {
          business_workspace_id: string
          created_at: string
          id: string
          owner_decision_id: string
          prepared_by: string
          row_revision: number
          source_revision: number
          version_id: string
        }
        Insert: {
          business_workspace_id: string
          created_at?: string
          id?: string
          owner_decision_id: string
          prepared_by: string
          row_revision: number
          source_revision: number
          version_id: string
        }
        Update: {
          business_workspace_id?: string
          created_at?: string
          id?: string
          owner_decision_id?: string
          prepared_by?: string
          row_revision?: number
          source_revision?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_preparations_business_workspace_id_fkey"
            columns: ["business_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_preparations_owner_decision_id_fkey"
            columns: ["owner_decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_preparations_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_version_preparations_version_id_fkey"
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
          creator_workspace_id: string
          declaration: Json | null
          definition: Json
          id: string
          label: string | null
          locked_paths: string[]
          number: number
          published_at: string
          published_by: string
          requires_binding_kinds: string[]
          source_system_id: string
          summary: string
        }
        Insert: {
          creator_workspace_id: string
          declaration?: Json | null
          definition: Json
          id: string
          label?: string | null
          locked_paths?: string[]
          number: number
          published_at: string
          published_by: string
          requires_binding_kinds?: string[]
          source_system_id: string
          summary: string
        }
        Update: {
          creator_workspace_id?: string
          declaration?: Json | null
          definition?: Json
          id?: string
          label?: string | null
          locked_paths?: string[]
          number?: number
          published_at?: string
          published_by?: string
          requires_binding_kinds?: string[]
          source_system_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_version_source_revisions_creator_workspace_id_fkey"
            columns: ["creator_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
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
          creator_workspace_id: string
          hidden: boolean
          listing_state: string
          system_id: string
        }
        Insert: {
          business_workspace_id: string
          created_at?: string
          created_by: string
          creator_workspace_id: string
          hidden?: boolean
          listing_state?: string
          system_id: string
        }
        Update: {
          business_workspace_id?: string
          created_at?: string
          created_by?: string
          creator_workspace_id?: string
          hidden?: boolean
          listing_state?: string
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
            foreignKeyName: "system_version_sources_creator_workspace_id_fkey"
            columns: ["creator_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          creator_workspace_id: string
          current_release: number | null
          id: string
          installed_source_revision_id: string
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
          creator_workspace_id: string
          current_release?: number | null
          id: string
          installed_source_revision_id: string
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
          creator_workspace_id?: string
          current_release?: number | null
          id?: string
          installed_source_revision_id?: string
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
            foreignKeyName: "system_versions_creator_workspace_id_fkey"
            columns: ["creator_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_versions_installed_source_revision_id_fkey"
            columns: ["installed_source_revision_id"]
            isOneToOne: false
            referencedRelation: "system_version_source_revisions"
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
      tenant_deprovision_cleanup: {
        Row: {
          created_at: string
          database_receipt: Json
          provider_complete: boolean
          receipt_id: string
          redis_complete: boolean
          revision: number
          summary: Json
          tenant_id: string
          tenant_stable_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          database_receipt: Json
          provider_complete?: boolean
          receipt_id?: string
          redis_complete?: boolean
          revision?: number
          summary?: Json
          tenant_id: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          database_receipt?: Json
          provider_complete?: boolean
          receipt_id?: string
          redis_complete?: boolean
          revision?: number
          summary?: Json
          tenant_id?: string
          tenant_stable_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenant_deprovision_retention_receipts: {
        Row: {
          created_at: string
          id: string
          policy: string
          retained_counts: Json
          tenant_slug: string
          tenant_stable_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          policy?: string
          retained_counts: Json
          tenant_slug: string
          tenant_stable_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          policy?: string
          retained_counts?: Json
          tenant_slug?: string
          tenant_stable_id?: string | null
        }
        Relationships: []
      }
      tenant_lead_purges: {
        Row: {
          id: string
          inquiry_purge_version: string | null
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
          inquiry_purge_version?: string | null
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
          inquiry_purge_version?: string | null
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
          agent_name: string | null
          agent_request_digest: string | null
          agent_request_id: string | null
          agent_status_ciphertext: string | null
          agent_status_expires_at: string | null
          agent_status_hash: string | null
          agent_workspace_id: string | null
          capability_id: string | null
          capability_version: number | null
          captured_at: string
          connected_site_id: string | null
          contact_id: string | null
          email: string | null
          fields: Json | null
          held_reason: string | null
          id: string
          inquiry_type: string
          intake_state: string
          intake_state_at: string | null
          lead_id: string
          message: string | null
          name: string
          origin: string | null
          quote_service_id: string | null
          recorded_at: string
          recorded_via: string
          reply_by: string | null
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
          agent_name?: string | null
          agent_request_digest?: string | null
          agent_request_id?: string | null
          agent_status_ciphertext?: string | null
          agent_status_expires_at?: string | null
          agent_status_hash?: string | null
          agent_workspace_id?: string | null
          capability_id?: string | null
          capability_version?: number | null
          captured_at: string
          connected_site_id?: string | null
          contact_id?: string | null
          email?: string | null
          fields?: Json | null
          held_reason?: string | null
          id?: string
          inquiry_type?: string
          intake_state?: string
          intake_state_at?: string | null
          lead_id: string
          message?: string | null
          name: string
          origin?: string | null
          quote_service_id?: string | null
          recorded_at?: string
          recorded_via: string
          reply_by?: string | null
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
          agent_name?: string | null
          agent_request_digest?: string | null
          agent_request_id?: string | null
          agent_status_ciphertext?: string | null
          agent_status_expires_at?: string | null
          agent_status_hash?: string | null
          agent_workspace_id?: string | null
          capability_id?: string | null
          capability_version?: number | null
          captured_at?: string
          connected_site_id?: string | null
          contact_id?: string | null
          email?: string | null
          fields?: Json | null
          held_reason?: string | null
          id?: string
          inquiry_type?: string
          intake_state?: string
          intake_state_at?: string | null
          lead_id?: string
          message?: string | null
          name?: string
          origin?: string | null
          quote_service_id?: string | null
          recorded_at?: string
          recorded_via?: string
          reply_by?: string | null
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
            foreignKeyName: "tenant_leads_agent_workspace_id_fkey"
            columns: ["agent_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "tenant_leads_quote_service_id_fkey"
            columns: ["quote_service_id"]
            isOneToOne: false
            referencedRelation: "business_services"
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
      tenant_newsletter_teardown_function_journal: {
        Row: {
          after_acl: Json | null
          after_definition: string | null
          before_acl: unknown[] | null
          before_definition: string | null
          owner_id: unknown
          signature: string
        }
        Insert: {
          after_acl?: Json | null
          after_definition?: string | null
          before_acl?: unknown[] | null
          before_definition?: string | null
          owner_id: unknown
          signature: string
        }
        Update: {
          after_acl?: Json | null
          after_definition?: string | null
          before_acl?: unknown[] | null
          before_definition?: string | null
          owner_id?: unknown
          signature?: string
        }
        Relationships: []
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
      tenant_track_signing_keys: {
        Row: {
          created_at: string
          previous_public_key: string | null
          previous_valid_until: string | null
          public_key: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          previous_public_key?: string | null
          previous_valid_until?: string | null
          public_key: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          previous_public_key?: string | null
          previous_valid_until?: string | null
          public_key?: string
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
      website_cutover_undos: {
        Row: {
          command_id: string
          created_at: string
          publication_id: string
          receipt: Json
          restored_by: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          command_id: string
          created_at?: string
          publication_id: string
          receipt: Json
          restored_by: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          command_id?: string
          created_at?: string
          publication_id?: string
          receipt?: Json
          restored_by?: string
          tenant_stable_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_cutover_undos_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: true
            referencedRelation: "website_linked_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_cutover_undos_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_cutover_undos_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
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
      website_domain_requests: {
        Row: {
          created_at: string
          created_by: string
          decision_id: string | null
          expires_at: string
          hostname: string
          id: string
          published_hash: string
          published_revision: number
          receipt_email: Json | null
          records: Json
          result: Json | null
          revision_hash: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          decision_id?: string | null
          expires_at?: string
          hostname: string
          id: string
          published_hash: string
          published_revision: number
          receipt_email?: Json | null
          records: Json
          result?: Json | null
          revision_hash: string
          tenant_stable_id: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          decision_id?: string | null
          expires_at?: string
          hostname?: string
          id?: string
          published_hash?: string
          published_revision?: number
          receipt_email?: Json | null
          records?: Json
          result?: Json | null
          revision_hash?: string
          tenant_stable_id?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_domain_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_domain_requests_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "owner_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_domain_requests_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "website_domain_requests_website_work_id_workspace_id_fkey"
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
      website_model_allowances: {
        Row: {
          consumed: number
          maximum: number
          updated_at: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          consumed?: number
          maximum: number
          updated_at?: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          consumed?: number
          maximum?: number
          updated_at?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_model_allowances_website_work_id_workspace_id_fkey"
            columns: ["website_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      website_native_fact_reviews: {
        Row: {
          claim_token: string
          claimed_at: string
          claimed_by: string
          event_id: string | null
          finished_at: string | null
          record_revision: number
          status: string
          tenant_stable_id: string
          workspace_id: string
        }
        Insert: {
          claim_token: string
          claimed_at?: string
          claimed_by: string
          event_id?: string | null
          finished_at?: string | null
          record_revision: number
          status?: string
          tenant_stable_id: string
          workspace_id: string
        }
        Update: {
          claim_token?: string
          claimed_at?: string
          claimed_by?: string
          event_id?: string | null
          finished_at?: string | null
          record_revision?: number
          status?: string
          tenant_stable_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_native_fact_reviews_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_native_fact_reviews_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
          },
          {
            foreignKeyName: "website_native_fact_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_rebuild_origins: {
        Row: {
          connected_site_id: string
          created_at: string
          website_work_id: string
          workspace_id: string
        }
        Insert: {
          connected_site_id: string
          created_at?: string
          website_work_id: string
          workspace_id: string
        }
        Update: {
          connected_site_id?: string
          created_at?: string
          website_work_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_rebuild_origins_connected_site_id_workspace_id_fkey"
            columns: ["connected_site_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "connected_sites"
            referencedColumns: ["id", "business_workspace_id"]
          },
          {
            foreignKeyName: "website_rebuild_origins_website_work_id_workspace_id_fkey"
            columns: ["website_work_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "saved_product_work"
            referencedColumns: ["id", "workspace_id"]
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
      workspace_collection_entries: {
        Row: {
          data: Json
          slug: string
          status: string
          system_id: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          data: Json
          slug: string
          status: string
          system_id: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          data?: Json
          slug?: string
          status?: string
          system_id?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_collection_entries_workspace_id_fkey"
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
      workspace_exit_handoff_receipts: {
        Row: {
          completed_at: string
          completed_by: string
          evidence: string
          export_build_id: string | null
          kind: string
          tenant_stable_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          evidence: string
          export_build_id?: string | null
          kind: string
          tenant_stable_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          evidence?: string
          export_build_id?: string | null
          kind?: string
          tenant_stable_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_exit_handoff_receipts_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_exit_handoff_receipts_export_build_id_fkey"
            columns: ["export_build_id"]
            isOneToOne: false
            referencedRelation: "workspace_export_builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_exit_handoff_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          provider_content_expires_at: string | null
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
          provider_content_expires_at?: string | null
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
          provider_content_expires_at?: string | null
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
      workspace_export_recovery: {
        Row: {
          attempts: number
          build_id: string
          created_at: string
          delivered_at: string | null
          delivery_attempts: number
          delivery_failure: string | null
          delivery_state: string
          lease_token: string | null
          lease_until: string | null
          tenant_ids: Json
          token_ciphertext: string | null
          verified_email: string
        }
        Insert: {
          attempts?: number
          build_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          delivery_failure?: string | null
          delivery_state?: string
          lease_token?: string | null
          lease_until?: string | null
          tenant_ids?: Json
          token_ciphertext?: string | null
          verified_email: string
        }
        Update: {
          attempts?: number
          build_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          delivery_failure?: string | null
          delivery_state?: string
          lease_token?: string | null
          lease_until?: string | null
          tenant_ids?: Json
          token_ciphertext?: string | null
          verified_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_export_recovery_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: true
            referencedRelation: "workspace_export_builds"
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
      workspace_newsletter_batch_receipts: {
        Row: {
          accepted_count: number
          batch_id: string
          claim_token: string
          created_at: string
          detail: string
          id: string
          provider_message_ids: Json
          status: string
          suppressed_count: number
        }
        Insert: {
          accepted_count: number
          batch_id: string
          claim_token: string
          created_at?: string
          detail: string
          id?: string
          provider_message_ids?: Json
          status: string
          suppressed_count: number
        }
        Update: {
          accepted_count?: number
          batch_id?: string
          claim_token?: string
          created_at?: string
          detail?: string
          id?: string
          provider_message_ids?: Json
          status?: string
          suppressed_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_newsletter_batch_receipts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "workspace_newsletter_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_newsletter_batches: {
        Row: {
          batch_number: number
          claim_token: string | null
          claim_until: string | null
          id: string
          issue_id: string
          next_attempt_at: string | null
          recipients: Json
          send_recipients: Json | null
          state: string
        }
        Insert: {
          batch_number: number
          claim_token?: string | null
          claim_until?: string | null
          id?: string
          issue_id: string
          next_attempt_at?: string | null
          recipients: Json
          send_recipients?: Json | null
          state?: string
        }
        Update: {
          batch_number?: number
          claim_token?: string | null
          claim_until?: string | null
          id?: string
          issue_id?: string
          next_attempt_at?: string | null
          recipients?: Json
          send_recipients?: Json | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_newsletter_batches_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "workspace_newsletter_deliveries"
            referencedColumns: ["issue_id"]
          },
        ]
      }
      workspace_newsletter_deliveries: {
        Row: {
          created_at: string
          issue_id: string
        }
        Insert: {
          created_at?: string
          issue_id: string
        }
        Update: {
          created_at?: string
          issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_newsletter_deliveries_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: true
            referencedRelation: "workspace_newsletter_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_newsletter_issues: {
        Row: {
          accepted_count: number
          approved_at: string
          approved_by: string
          body: string
          draft_hash: string
          event_id: string
          failure_count: number
          id: string
          state: string
          subject: string
          suppressed_count: number
          system_id: string
          tenant_id: string | null
          workspace_id: string
        }
        Insert: {
          accepted_count?: number
          approved_at?: string
          approved_by: string
          body: string
          draft_hash: string
          event_id: string
          failure_count?: number
          id?: string
          state?: string
          subject: string
          suppressed_count: number
          system_id: string
          tenant_id?: string | null
          workspace_id: string
        }
        Update: {
          accepted_count?: number
          approved_at?: string
          approved_by?: string
          body?: string
          draft_hash?: string
          event_id?: string
          failure_count?: number
          id?: string
          state?: string
          subject?: string
          suppressed_count?: number
          system_id?: string
          tenant_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_newsletter_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_newsletter_issues_workspace_id_fkey"
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
      workspace_operator_audit_events: {
        Row: {
          action: string
          actor_email: string
          actor_user_id: string
          id: string
          metadata: Json
          occurred_at: string
          target_id: string | null
          target_type: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_user_id: string
          id?: string
          metadata?: Json
          occurred_at?: string
          target_id?: string | null
          target_type: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_user_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          target_id?: string | null
          target_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_operator_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_operator_audit_events_workspace_id_fkey"
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
          agency_brand: Json | null
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          agency_brand?: Json | null
          created_at?: string
          created_by: string
          id?: string
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          agency_brand?: Json | null
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
      super_admin_access_review: {
        Row: {
          email: string | null
          granted_at: string | null
          granted_by: string | null
          granted_by_email: string | null
          last_activity_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_agency_client_owner_claim: {
        Args: {
          p_actor_id: string
          p_token_hash: string
          p_verified_email: string
        }
        Returns: Json
      }
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
      accept_platform_collection_terms: {
        Args: {
          p_agreement: string
          p_amount: number
          p_business_id: string
          p_currency: string
          p_customer_id: string
          p_installation_id?: string
          p_line_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      accept_public_payment_request: {
        Args: {
          p_hash: string
        }
        Returns: Json
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
      access_review_reader: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      access_review_require: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      access_review_token_live: {
        Args: {
          p_token_id: string
        }
        Returns: boolean
      }
      access_review_units: {
        Args: {
          p_organization: boolean
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string[]
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
      accrue_invoice_splits: {
        Args: {
          p_basis: number
          p_business_id: string
          p_charge_id: string
          p_currency: string
          p_installation_id?: string
          p_line_id: string
          p_period_end: string
          p_period_start: string
          p_source_account: string
          p_source_revision_id?: string
        }
        Returns: Json
      }
      accrue_invoice_splits_before_attribution: {
        Args: {
          p_basis: number
          p_business_id: string
          p_charge_id: string
          p_currency: string
          p_installation_id?: string
          p_line_id: string
          p_period_end: string
          p_period_start: string
          p_source_account: string
          p_source_revision_id?: string
        }
        Returns: Json
      }
      accrue_invoice_splits_before_loss: {
        Args: {
          p_basis: number
          p_business_id: string
          p_charge_id: string
          p_currency: string
          p_installation_id?: string
          p_line_id: string
          p_period_end: string
          p_period_start: string
          p_source_account: string
          p_source_revision_id?: string
        }
        Returns: Json
      }
      accrue_invoice_splits_provider_v1: {
        Args: {
          p_basis: number
          p_business_id: string
          p_charge_id: string
          p_currency: string
          p_installation_id?: string
          p_line_id: string
          p_period_end: string
          p_period_start: string
          p_source_account: string
          p_source_revision_id?: string
        }
        Returns: Json
      }
      acknowledge_payment_follow_up: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      acknowledge_provider_change_notice: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      acknowledge_provider_change_notice_before_completion_cleanup: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      acknowledge_provider_change_notice_before_response: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      acquire_split_reconciliation: {
        Args: {
          p_account: string
          p_charge: string
        }
        Returns: number
      }
      acting_provider: {
        Args: {
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      acting_provider_assert: {
        Args: {
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      acting_provider_check: {
        Args: {
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Record<string, unknown>
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
          creator_workspace_id: string | null
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
          source_revision_id: string | null
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
          version_lineage_id: string | null
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
      after_connected_lead_capture: {
        Args: {
          p_lead_row_id: string
        }
        Returns: Json
      }
      after_tenant_lead_capture: {
        Args: {
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      agency_add_client: {
        Args: {
          p_agency_workspace_id: string
          p_command_digest: string
          p_command_id: string
          p_input: Json
          p_user_id: string
          p_verified_email: string
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
      agency_billing_ensure: {
        Args: {
          p_agency_id: string
        }
        Returns: string
      }
      agency_billing_intent_command: {
        Args: {
          p_actor_id: string
          p_command: Json
          p_verified_email: string
        }
        Returns: Json
      }
      agency_billing_recipient: {
        Args: {
          p_agency_workspace_id: string
        }
        Returns: Json
      }
      agency_billing_sync_client: {
        Args: {
          p_business_id: string
        }
        Returns: undefined
      }
      agency_can_author_created_application: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: boolean
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
      agency_can_read_package_work: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      agency_client_add_limits: {
        Args: never
        Returns: Record<string, unknown>
      }
      agency_client_addition_json: {
        Args: {
          a: unknown
          p_replayed: boolean
        }
        Returns: Json
      }
      agency_client_assert_actor: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
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
      agency_client_overview_v2: {
        Args: {
          p_agency_workspace_id: string
          p_cursor?: string
          p_limit?: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      agency_client_waiting_for_owner: {
        Args: {
          p_customer_workspace_id: string
        }
        Returns: boolean
      }
      agency_created_application_work_ids: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string[]
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
      agency_package_assert_shareable: {
        Args: {
          p_value: Json
        }
        Returns: undefined
      }
      agency_package_command_digest: {
        Args: {
          p_command_id: string
          p_expected_revision: number
          p_fingerprint: string
          p_summary: string
          p_system_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      agency_prospect_admit: {
        Args: {
          p_workspace_id: string
        }
        Returns: undefined
      }
      agency_prospect_capture: {
        Args: {
          p_business: string
          p_email: string
          p_grade: string
          p_name: string
          p_result_id: string
          p_score: number
          p_source: string
          p_url: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      agency_prospect_list: {
        Args: {
          p_email: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          agency_workspace_id: string
          business: string
          created_at: string
          email: string
          grade: string
          id: string
          name: string
          result_id: string
          score: number
          source: string
          url: string | null
        }[]
      }
      agency_prospect_member: {
        Args: {
          p_workspace_id: string
        }
        Returns: boolean
      }
      agency_prospecting_profile: {
        Args: {
          p_slug: string
        }
        Returns: {
          contact_email: string
          contact_url: string
          name: string
          slug: string
          workspace_id: string
        }[]
      }
      agency_release_flag_read_scope: {
        Args: {
          p_agency_id: string
          p_email: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      agency_release_flag_rows: {
        Args: {
          p_agency_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      agency_release_flag_scope: {
        Args: {
          p_agency_id: string
          p_email: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      agency_release_flag_system_kind: {
        Args: {
          p_flag: string
        }
        Returns: string
      }
      agency_team_require: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_write: boolean
        }
        Returns: string
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
      agent_oauth_grant_live: {
        Args: {
          p_agency: string
          p_email: string
          p_seat: string
          p_user: string
          p_workspace: string
        }
        Returns: boolean
      }
      agent_website_proposal_receipt: {
        Args: {
          p_row: unknown
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
      append_website_system_release: {
        Args: {
          p_actor: string
          p_at: string
          p_implementation: Json
          p_release_key: string
          p_summary: string
          p_system_id: string
          p_workspace_id: string
        }
        Returns: number
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
      apply_agency_billing_provider_event: {
        Args: {
          p_account_id: string
          p_event_id: string
        }
        Returns: Json
      }
      apply_legacy_google_operation: {
        Args: {
          p_input: Json
          p_kind: string
          p_pin: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      approve_native_workspace_newsletter_issue: {
        Args: {
          p_input: Json
        }
        Returns: Json
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
      approve_website_document_for_agency: {
        Args: {
          p_agency_workspace_id: string
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
      approve_website_domain_request: {
        Args: {
          p_decision_id: string
          p_id: string
          p_revision_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      approve_workspace_newsletter_issue: {
        Args: {
          p_input: Json
        }
        Returns: Json
      }
      archive_investigation_snapshot: {
        Args: {
          p_payload: Json
          p_work_id: string
        }
        Returns: undefined
      }
      ask_business_draft_json: {
        Args: {
          p: unknown
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
      assert_acting_provider: {
        Args: {
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      assert_agency_billing_mutation: {
        Args: {
          p_accepted_email: string
          p_account_id: string
          p_actor_id: string
          p_generation: number
          p_intent_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      assert_agent_payment_admission: {
        Args: {
          p_account: string
          p_generation: number
          p_payment_id: string
        }
        Returns: boolean
      }
      assert_business_checkout_admission: {
        Args: {
          p_accepted_email: string | null
          p_account: string
          p_actor_id: string | null
          p_generation: number
          p_payment_id: string
          p_verified_email: string | null
        }
        Returns: boolean
      }
      assert_current_provider_payer: {
        Args: {
          p_agency: string
          p_business: string
          p_transition: string
        }
        Returns: undefined
      }
      assert_custom_sandbox_runtime: {
        Args: {
          p_digest: string
          p_email: string
          p_image: string
          p_policy: string
          p_project: string
          p_revision: number
          p_team: string
          p_user: string
          p_version: number
          p_work: string
        }
        Returns: boolean
      }
      assert_owner_decision_link: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_revision_hash: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: {
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
      }
      assert_recovery_settlement: {
        Args: {
          p_available: number
          p_currency: string
          p_recovery: string
        }
        Returns: undefined
      }
      assert_split_transfer_settlement: {
        Args: {
          p_available: number
          p_currency: string
          p_payout_id: string
        }
        Returns: undefined
      }
      assert_tenant_inquiry_export: {
        Args: {
          p_tenant_id: string
        }
        Returns: undefined
      }
      assert_website_owner_link: {
        Args: {
          p_content_hash: string
          p_decision_id: string
          p_recipient: string
          p_revision: number
          p_revision_hash: string
          p_session_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      attach_keep_me_found_maintenance: {
        Args: {
          p_binding_id: string
          p_bundle_id: string
          p_hours_source: string
          p_location_id: string
          p_reply_policy: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      authorize_agency_client_add: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
      }
      authorize_inquiry_operator_actor: {
        Args: {
          p_actor_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      authorize_inquiry_owner_link_decision: {
        Args: {
          p_event_id: string
          p_recipient: string
          p_revision: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      authorize_inquiry_owner_link_message_action: {
        Args: {
          p_action: string
          p_event_id: string
          p_recipient: string
          p_revision: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      authorize_inquiry_owner_link_publication: {
        Args: {
          p_action?: string
          p_claim_id: string
          p_event_id: string
          p_recipient: string
          p_revision: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      authorize_inquiry_owner_notice_repair: {
        Args: {
          p_actor_id: string
          p_lead_id: string
          p_recipient_digest: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      authorize_inquiry_publication_actor: {
        Args: {
          p_actor_id: string
          p_claim_id: string
          p_event_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      authorize_owner_decision_link_run: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_revision_hash: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      authorize_platform_operator_read: {
        Args: {
          p_reader_name: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      authorize_split_recovery: {
        Args: {
          p_amount: number
          p_email: string
          p_key: string
          p_payout: string
          p_profile: string
          p_restoration: string
          p_user: string
        }
        Returns: Json
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
      authorize_website_domain_request: {
        Args: {
          p_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      backfill_newsletter_contacts: {
        Args: {
          p_after?: string
          p_apply?: boolean
          p_limit?: number
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      begin_home_finder_intake: {
        Args: {
          p_binding_id: string
          p_digest: string
          p_revision: number
          p_submission_id: string
        }
        Returns: Json
      }
      begin_operator_google_write: {
        Args: {
          p_command: Json
        }
        Returns: Json
      }
      begin_qualified_sandbox_build_attempt: {
        Args: {
          p_attempt: string
          p_email: string
          p_user: string
        }
        Returns: undefined
      }
      begin_sandbox_build_attempt: {
        Args: {
          p_attempt: string
          p_email: string
          p_user: string
        }
        Returns: Json
      }
      bind_business_payment_provider: {
        Args: {
          p_account: string
          p_checkout?: string
          p_currency: string
          p_payment_id: string
          p_provider: string
        }
        Returns: undefined
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
      booking_calendar_mirror_candidates: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      booking_email_identity: {
        Args: {
          p_email: string
        }
        Returns: string
      }
      booking_json: {
        Args: {
          b: unknown
        }
        Returns: Json
      }
      booking_json_before_agent_visibility: {
        Args: {
          b: unknown
        }
        Returns: Json
      }
      booking_json_before_w6: {
        Args: {
          b: unknown
        }
        Returns: Json
      }
      booking_parity_streak: {
        Args: never
        Returns: Json
      }
      booking_service_policy_json: {
        Args: {
          p_tenant: string
        }
        Returns: Json
      }
      booking_setup_authorize: {
        Args: {
          p_email: string
          p_tenant_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
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
      bootstrap_super_admin: {
        Args: {
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      bulk_set_agency_client_staff: {
        Args: {
          p_active: boolean
          p_agency_workspace_id: string
          p_staff_user_ids: string[]
          p_user_id: string
          p_verified_email: string
          p_workspace_ids: string[]
        }
        Returns: Json
      }
      bundle_maintenance_holds: {
        Args: {
          p_attachment_id: string
          p_email: string
          p_user_id: string
        }
        Returns: Json
      }
      business_agency_seat: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      business_attribution_receipt: {
        Args: {
          p_attribution: unknown
        }
        Returns: Json
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
      business_confirmed_facts: {
        Args: {
          p_workspace_id: string
        }
        Returns: {
          fact_key: string
          value: Json
          verified: boolean
        }[]
      }
      business_confirmed_public_facts: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      business_confirmed_services: {
        Args: {
          p_workspace_id: string
        }
        Returns: {
          active: boolean
          description: string
          duration_minutes: number
          external_ref: string
          id: string
          name: string
          position: number
          price_text: string
          verified: boolean
        }[]
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
      business_effort_read_operator: {
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
      business_fact_confirmation_json: {
        Args: {
          r: unknown
        }
        Returns: Json
      }
      business_inquiry_outcomes: {
        Args: {
          p_from: string
          p_to: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      business_inquiry_outcomes_for_tenant: {
        Args: {
          p_from: string
          p_tenant_id: string
          p_to: string
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
      business_outcome_month_before_w6: {
        Args: {
          p_month: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      business_outcome_month_inquiries: {
        Args: {
          p_month: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      business_owner_recipient_actor_kind: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_workspace_id: string
        }
        Returns: string
      }
      business_owner_recipient_set_trust: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_decision_id: string
          p_email: string
          p_name: string
          p_revision_sequence: number
          p_source: string
          p_tenant_stable_id: string
          p_verified: boolean
          p_via: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      business_page_json: {
        Args: {
          p: unknown
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
      business_payment_outcome_month: {
        Args: {
          p_include_inquiries?: boolean
          p_month: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      business_record_owner_actor: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      business_record_public_content: {
        Args: {
          p_entity: string
          p_state: Json
        }
        Returns: Json
      }
      business_record_read_actor: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: string
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
      business_trusted_owner_recipient: {
        Args: {
          p_workspace_id: string
        }
        Returns: string
      }
      call_agent_protected_tool: {
        Args: {
          p_args: Json
          p_resource: string
          p_token_hash: string
          p_tool: string
          p_workspace_id: string
        }
        Returns: Json
      }
      cancel_provider_change: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      cancel_provider_change_before_completion_cleanup: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      cancel_public_booking_request: {
        Args: {
          p_request_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      change_enterprise_unit: {
        Args: {
          p_input: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      change_native_booking: {
        Args: {
          p_change: Json
          p_hash: string
        }
        Returns: Json
      }
      change_native_booking_before_service_policy: {
        Args: {
          p_change: Json
          p_hash: string
        }
        Returns: Json
      }
      change_native_booking_before_w6: {
        Args: {
          p_change: Json
          p_hash: string
        }
        Returns: Json
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
      change_workspace_booking_status: {
        Args: {
          p_email: string
          p_ref: string
          p_scope: string
          p_status: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      check_bundle_maintenance_attachment: {
        Args: {
          p_attachment_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      check_bundle_maintenance_event: {
        Args: {
          p_binding_id: string
          p_business_id: string
          p_draft: Json
          p_event_id: string
          p_location_id: string
          p_preparation_id: string
        }
        Returns: boolean
      }
      check_google_listing_record_revision: {
        Args: {
          p_revision: number
          p_workspace_id: string
        }
        Returns: boolean
      }
      check_google_make_real_service_authority: {
        Args: {
          p_activation_id?: string
          p_decision_id: string
          p_mode?: string
          p_possibility_id?: string
          p_request: Json
          p_session_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      check_public_booking_budget: {
        Args: {
          p_booking_id?: string
          p_business: string
          p_email: string
          p_end: string
          p_fingerprint: string
          p_start: string
        }
        Returns: undefined
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
      choose_business_provider_before_change: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      choose_business_provider_before_completion_cleanup: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      choose_inquiry_booking_offer: {
        Args: {
          p_access: Json
          p_hash: string
          p_start: string
        }
        Returns: Json
      }
      choose_inquiry_booking_offer_before_public_admission: {
        Args: {
          p_access: Json
          p_hash: string
          p_start: string
        }
        Returns: Json
      }
      choose_inquiry_booking_slot: {
        Args: {
          p_offer_id: string
          p_slot_index: number
        }
        Returns: Json
      }
      claim_booking_calendar_health: {
        Args: {
          p_day: string
          p_id: string
          p_revision: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      claim_booking_messages: {
        Args: {
          p_limit: number
          p_now: string
        }
        Returns: Json
      }
      claim_booking_messages_before_w6: {
        Args: {
          p_limit: number
          p_now: string
        }
        Returns: Json
      }
      claim_booking_updates: {
        Args: {
          p_agent: boolean
          p_booking_id: string
          p_limit: number
          p_owner: boolean
        }
        Returns: Json
      }
      claim_booking_updates_before_public_admission: {
        Args: {
          p_agent: boolean
          p_booking_id: string
          p_limit: number
          p_owner: boolean
        }
        Returns: Json
      }
      claim_business_payment_channel: {
        Args: {
          p_channel: string
          p_payment_id: string
        }
        Returns: undefined
      }
      claim_connected_inquiry_owner_notice: {
        Args: {
          p_lead_row_id: string
          p_site_id: string
          p_subject: string
          p_workspace_id: string
        }
        Returns: Json
      }
      claim_connected_inquiry_owner_notice_repair: {
        Args: {
          p_lead_row_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      claim_engine_inquiry_reply: {
        Args: {
          p_attempt_id: string
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      claim_inquiry_decision_notice: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_revision: string
          p_workspace_id: string
        }
        Returns: Json
      }
      claim_inquiry_decision_notice_v2: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_revision: string
          p_subject: string
          p_workspace_id: string
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
      claim_internal_tool_submit_notice: {
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
      claim_native_website_fact_review: {
        Args: {
          p_claim_token: string
          p_record_revision: number
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
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
      claim_pending_business_owner: {
        Args: {
          p_actor_id: string
          p_tenant_id: string
          p_verified_email: string
        }
        Returns: string
      }
      claim_public_booking_request: {
        Args: {
          p_request: Json
          p_tenant_id: string
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
      claim_workspace_export_recovery: {
        Args: {
          p_build_id?: string
        }
        Returns: Json
      }
      claim_workspace_inquiry_reply: {
        Args: {
          p_body: string
          p_digest: string
          p_lead_row_id: string
          p_request_id: string
          p_subject: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      claim_workspace_inquiry_reply_v2: {
        Args: {
          p_body: string
          p_digest: string
          p_is_commitment: boolean
          p_lead_row_id: string
          p_request_id: string
          p_subject: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      client_record_parity_streak: {
        Args: {
          p_store: string
        }
        Returns: Json
      }
      client_resource_assert: {
        Args: {
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
        }
        Returns: string
      }
      client_resource_kinds: {
        Args: {
          p_effect: string
        }
        Returns: string[]
      }
      client_resource_mandate_insert: {
        Args: {
          p_agency_workspace_id: string
          p_by: string
          p_effect: string
          p_kind: string
          p_note: string
          p_ref: string
          p_resource_kind: string
          p_workspace_id: string
        }
        Returns: Record<string, unknown>
      }
      client_resource_mandate_json: {
        Args: {
          m: unknown
        }
        Returns: Json
      }
      client_resource_ref: {
        Args: {
          p_kind: string
          p_ref: string
        }
        Returns: string
      }
      client_resource_website_belongs: {
        Args: {
          p_system_id: string
          p_workspace_id: string
        }
        Returns: boolean
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
      commit_agent_website_candidate: {
        Args: {
          p_content_hash: string
          p_document: Json
          p_expected_candidate_hash: string
          p_expected_document_revision: number
          p_expected_work_revision: number
          p_payload: Json
          p_request_hash: string
          p_request_id: string
          p_resource: string
          p_summary: string
          p_token_hash: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_bundle_native_preparation: {
        Args: {
          p_artifact: Json
          p_expected_revision: number
          p_expected_work_revision: number
          p_row_revision: number
          p_user_id: string
          p_verified_email: string
          p_version_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_legacy_google_binding_operation: {
        Args: {
          p_input: Json
          p_pin: Json
        }
        Returns: Json
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
      complete_operator_google_write: {
        Args: {
          p_attempt_id: string
          p_receipt: Json
        }
        Returns: Json
      }
      complete_provider_change: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      complete_provider_change_before_attribution: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      complete_provider_change_before_completion_cleanup: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      complete_provider_change_without_payer: {
        Args: {
          p_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      complete_workspace_exit_before_completion_cleanup: {
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
      complete_workspace_exit_with_handoff: {
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
      complete_workspace_export_build_before_review_retention: {
        Args: {
          p_build_id: string
          p_category_counts: Json
          p_manifest: Json
          p_token_hash: string
        }
        Returns: Json
      }
      configure_booking_setup: {
        Args: {
          p_email: string
          p_settings: Json
          p_tenant_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      configure_booking_setup_before_service_policy: {
        Args: {
          p_email: string
          p_settings: Json
          p_tenant_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      configure_home_finder: {
        Args: {
          p_digest: string
          p_input: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      confirm_agent_booking: {
        Args: {
          p_force_request: boolean
          p_hash: string
        }
        Returns: Json
      }
      confirm_agent_booking_before_public_admission: {
        Args: {
          p_force_request: boolean
          p_hash: string
        }
        Returns: Json
      }
      confirm_agent_booking_before_service_policy: {
        Args: {
          p_force_request: boolean
          p_hash: string
        }
        Returns: Json
      }
      confirm_ask_business_draft_entities: {
        Args: {
          p_decision_id?: string
          p_draft_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      confirm_business_facts: {
        Args: {
          p_decision_id: string
          p_revision_hash: string
          p_workspace_id: string
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
      confirm_inquiry_business_fact: {
        Args: {
          p_decision_id: string
          p_proposal_id: string
          p_revision_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      connect_assert_manager: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      connect_assert_reader: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: undefined
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
      connected_account_by_stripe_id: {
        Args: {
          p_account_id: string
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
      consume_operator_action_approval: {
        Args: {
          p_action_kind: string
          p_approval_id: string
          p_operator_user_id: string
          p_target: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      consume_public_booking_request: {
        Args: {
          p_hash: string
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
      correct_inquiry_business_fact: {
        Args: {
          p_key: string
          p_user_id: string
          p_value: Json
          p_workspace_id: string
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
      create_keep_me_found_bundle: {
        Args: {
          p_business_id: string
          p_every_seconds: number
          p_idempotency_key: string
          p_investigations: Json
          p_next_at: string
          p_provider_id: string
          p_service_request_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      create_keep_me_found_maintenance_bundle: {
        Args: {
          p_binding_id: string
          p_business_id: string
          p_every_seconds: number
          p_idempotency_key: string
          p_investigations: Json
          p_location_id: string
          p_next_at: string
          p_provider_id: string
          p_service_request_id: string
          p_user_id: string
          p_verified_email: string
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
      create_operator_action_approval: {
        Args: {
          p_action_kind: string
          p_approver_user_id: string
          p_audit_context: Json
          p_target: Json
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
      create_operator_owner_invitation_approved: {
        Args: {
          p_approval_id: string
          p_audit_context: Json
          p_expires_at: string
          p_operator_user_id: string
          p_recipient_email: string
          p_send_email: boolean
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
          agency_brand: Json | null
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          updated_at: string
        }[]
      }
      create_private_version_system_command: {
        Args: {
          p_command_id: string
          p_kind: string
          p_lineage: Json
          p_name: string
          p_native_payload: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      create_version_system_command:
        | {
          Args: {
            p_command_id: string
            p_kind: string
            p_lineage: Json
            p_name: string
            p_user_id: string
            p_verified_email: string
          }
          Returns: Json
        }
        | {
          Args: {
            p_command_id: string
            p_kind: string
            p_lineage: Json
            p_name: string
            p_native_payload: Json
            p_user_id: string
            p_verified_email: string
          }
          Returns: Json
        }
      create_version_system_command_private_core: {
        Args: {
          p_command_id: string
          p_kind: string
          p_lineage: Json
          p_name: string
          p_native_payload: Json
          p_user_id: string
          p_verified_email: string
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
      create_workspace_manual_booking: {
        Args: {
          p_booking: Json
          p_email: string
          p_tenant_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      customer_imported_review_content: {
        Args: {
          p: Json
          p_external_id: string
        }
        Returns: boolean
      }
      decide_booking_instant_policy: {
        Args: {
          p_decision: string
          p_email: string
          p_owner_link: boolean
          p_policy_id: string
          p_revision: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      decide_booking_instant_policy_before_service_policy: {
        Args: {
          p_decision: string
          p_email: string
          p_owner_link: boolean
          p_policy_id: string
          p_revision: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      decide_operator_held_inquiry: {
        Args: {
          p_decision: string
          p_lead_row_id: string
          p_user_id: string
          p_verified_email: string
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
      deprovision_tenant_guarded: {
        Args: {
          p_force?: boolean
          p_require_inquiry_export?: boolean
          p_retain_receipts?: boolean
          p_tenant_id: string
        }
        Returns: Json
      }
      deprovision_tenant_guarded_before_cleanup: {
        Args: {
          p_force?: boolean
          p_require_inquiry_export?: boolean
          p_retain_receipts?: boolean
          p_tenant_id: string
        }
        Returns: Json
      }
      deprovision_tenant_rows: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      deprovision_tenant_rows_after_inquiry_export: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      deprovision_tenant_rows_retained: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      deprovision_tenant_rows_retained_after_inquiry_export: {
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
      designate_strelva_agency_workspace_audited: {
        Args: {
          p_audit_context: Json
          p_operator_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      disconnect_agent_oauth_connection: {
        Args: {
          p_connection_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      disconnect_workspace_calendar_connection: {
        Args: {
          p_provider: string
          p_revocation_error_code: string
          p_revocation_outcome: string
          p_user_id: string
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
      edit_internal_tool_use_record: {
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
          p_business_id: string
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      end_business_provider_before_completion_cleanup: {
        Args: {
          p_business_id: string
          p_reason: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      end_business_provider_before_notice: {
        Args: {
          p_reason: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      end_client_resource_mandate: {
        Args: {
          p_mandate_id: string
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
      enqueue_workspace_export_recovery: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      ensure_native_business_billing_home: {
        Args: {
          p_workspace_id: string
        }
        Returns: string
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
      enterprise_read_require: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      enterprise_require: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: string
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
      exchange_agent_oauth_code: {
        Args: {
          p_challenge: string
          p_client_id: string
          p_code_hash: string
          p_redirect_uri: string
          p_resource: string
          p_token_hash: string
        }
        Returns: Json
      }
      exchange_agent_oauth_connection_code: {
        Args: {
          p_challenge: string
          p_client_id: string
          p_code_hash: string
          p_redirect_uri: string
          p_refresh_hash: string
          p_resource: string
          p_token_hash: string
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
      execute_system_work_plan_output: {
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
      expire_business_payment_holds: {
        Args: {
          p_limit?: number
        }
        Returns: number
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
      export_workspace_archive_snapshot: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_archive_snapshot_base: {
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
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category_before_enterprise: {
        Args: {
          p_category: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category_before_extended_money: {
        Args: {
          p_category: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category_before_investigation_history: {
        Args: {
          p_category: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category_before_money: {
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
      export_workspace_v3_category_before_recoveries: {
        Args: {
          p_category: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category_before_split_attribution: {
        Args: {
          p_category: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_workspace_v3_category_before_w6: {
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
      file_failed_system_plan_request: {
        Args: {
          p_digest: string
          p_goal: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      find_client_calendly_tenant: {
        Args: {
          p_user_uri: string
        }
        Returns: string
      }
      find_inquiry_delivery_reply_target: {
        Args: {
          p_reply_to: string
        }
        Returns: Json
      }
      finish_booking_calendar_health: {
        Args: {
          p_id: string
          p_provider: string
          p_reason: string
          p_status: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      finish_booking_calendar_mirror: {
        Args: {
          p_booking_id: string
          p_detail: string
          p_event_id: string
          p_status: string
          p_token: string
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
      finish_booking_update: {
        Args: {
          p_detail: string
          p_id: string
          p_provider: string
          p_status: string
        }
        Returns: undefined
      }
      finish_connected_inquiry_owner_notice: {
        Args: {
          p_accepted_at: string
          p_lead_row_id: string
          p_provider_message_id: string
          p_status: string
        }
        Returns: boolean
      }
      finish_connected_inquiry_owner_notice_repair: {
        Args: {
          p_accepted_at: string
          p_provider_message_id: string
          p_repair_id: string
          p_status: string
        }
        Returns: boolean
      }
      finish_home_finder_intake: {
        Args: {
          p_binding_id: string
          p_digest: string
          p_reference: string
          p_status: string
          p_submission_id: string
        }
        Returns: undefined
      }
      finish_inquiry_decision_notice: {
        Args: {
          p_accepted_at: string
          p_decision_id: string
          p_provider_message_id: string
          p_reason: string
          p_status: string
          p_workspace_id: string
        }
        Returns: boolean
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
      finish_internal_tool_notice_delivery: {
        Args: {
          p_lease: string
          p_notice_id: string
          p_provider_message_id: string
          p_status: string
          p_workspace_id: string
        }
        Returns: boolean
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
      finish_public_booking_request: {
        Args: {
          p_request_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      finish_split_reconciliation: {
        Args: {
          p_account: string
          p_basis: number
          p_charge: string
          p_generation: number
          p_loss: number
          p_snapshot: string
        }
        Returns: Json
      }
      finish_tenant_deprovision_cleanup: {
        Args: {
          p_expected_revision: number
          p_provider_complete: boolean
          p_receipt_id: string
          p_redis_complete: boolean
          p_summary: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      finish_workspace_inquiry_reply: {
        Args: {
          p_accepted_at: string
          p_message_id: string
          p_provider_message_id: string
          p_status: string
        }
        Returns: Json
      }
      freeze_platform_collection_period: {
        Args: {
          p_end: string
          p_line_id: string
          p_start: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
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
      google_listing_control_json: {
        Args: {
          c: unknown
        }
        Returns: Json
      }
      google_listing_receipt_json: {
        Args: {
          r: unknown
        }
        Returns: Json
      }
      google_review_archive_deadline: {
        Args: {
          p: Json
        }
        Returns: string
      }
      google_review_build_deadline: {
        Args: {
          p_build_id: string
        }
        Returns: string
      }
      google_review_content_live: {
        Args: {
          p: Json
        }
        Returns: boolean
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
      grant_agency_application_draft_edit_before_completion_cleanup: {
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
      grant_client_resource_mandate: {
        Args: {
          p_agency_workspace_id: string
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      grant_private_application_install: {
        Args: {
          p_agency_workspace_id: string
          p_command_id: string
          p_expires_at: string
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      grant_super_admin: {
        Args: {
          p_actor_user_id?: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      grant_system_bundle_targets: {
        Args: {
          p_grant_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      grant_system_package_install: {
        Args: {
          p_agency_workspace_id: string
          p_command_id: string
          p_expires_at: string
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      grant_system_package_install_before_completion_cleanup: {
        Args: {
          p_agency_workspace_id: string
          p_command_id: string
          p_expires_at: string
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      grant_system_package_install_snapshot_core: {
        Args: {
          p_agency_workspace_id: string
          p_command_id: string
          p_expires_at: string
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      hold_agent_booking: {
        Args: {
          p_access: Json
          p_booking: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      hold_agent_booking_before_channel_policy: {
        Args: {
          p_access: Json
          p_booking: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      hold_tenant_lead_as_spam: {
        Args: {
          p_spam: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      home_finder_binding_json: {
        Args: {
          b: unknown
        }
        Returns: Json
      }
      home_finder_current: {
        Args: {
          b: unknown
        }
        Returns: boolean
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
      inquiry_assert_operator: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      inquiry_booking_offer_json: {
        Args: {
          o: unknown
        }
        Returns: Json
      }
      inquiry_booking_read_witness: {
        Args: {
          p_inquiry_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      inquiry_booking_witness: {
        Args: {
          p_inquiry_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      inquiry_business_fact_revision: {
        Args: {
          p_proposal_id: string
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
      inquiry_lead_event_write: {
        Args: {
          p_actor: string
          p_actor_id: string
          p_dedupe: string
          p_detail: Json
          p_kind: string
          p_lead: unknown
        }
        Returns: boolean
      }
      inquiry_lead_json: {
        Args: {
          l: unknown
        }
        Returns: Json
      }
      inquiry_outcome_cohort: {
        Args: {
          p_from: string
          p_to: string
          p_workspace_id: string
        }
        Returns: Json
      }
      inquiry_read_member: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      inquiry_reply_text_has_commitment: {
        Args: {
          p_text: string
        }
        Returns: boolean
      }
      inquiry_safe_timestamp: {
        Args: {
          p_value: string
        }
        Returns: string
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
      install_home_finder: {
        Args: {
          p_digest: string
          p_input: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
          creator_workspace_id: string | null
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
          source_revision_id: string | null
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
          version_lineage_id: string | null
        }[]
      }
      install_system_bundle: {
        Args: {
          p_command_id: string
          p_expected_inquiry_revision: number
          p_expected_website_document_revision: number
          p_expected_website_work_revision: number
          p_inquiry_state: Json
          p_name: string
          p_parts: Json
          p_source_number: number
          p_source_revision_id: string
          p_source_system_id: string
          p_source_workspace_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      install_system_bundle_native_binding_core: {
        Args: {
          p_command_id: string
          p_expected_inquiry_revision: number
          p_expected_website_document_revision: number
          p_expected_website_work_revision: number
          p_inquiry_state: Json
          p_name: string
          p_parts: Json
          p_source_number: number
          p_source_revision_id: string
          p_source_system_id: string
          p_source_workspace_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      issue_agency_client_owner_claim: {
        Args: {
          p_agency_workspace_id: string
          p_customer_workspace_id: string
          p_expires_at: string
          p_recipient_email: string
          p_token_hash: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      issue_agent_oauth_code: {
        Args: {
          p_agency_id: string
          p_challenge: string
          p_client_id: string
          p_code_hash: string
          p_redirect_uri: string
          p_resource: string
          p_scopes: string[]
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      issue_agent_oauth_connection_code: {
        Args: {
          p_agency_id: string
          p_challenge: string
          p_client_id: string
          p_client_name: string
          p_code_hash: string
          p_redirect_uri: string
          p_resource: string
          p_scopes: string[]
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      issue_booking_access: {
        Args: {
          p_access: Json
          p_ref: string
          p_tenant_id: string
        }
        Returns: Json
      }
      issue_booking_access_before_public_admission: {
        Args: {
          p_access: Json
          p_ref: string
          p_tenant_id: string
        }
        Returns: Json
      }
      issue_business_payment_request: {
        Args: {
          p_amount: number
          p_currency: string
          p_expires: string
          p_hash: string
          p_key: string
          p_kind: string
          p_lines: Json
          p_policy: Json
          p_source_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      issue_inquiry_booking_offer: {
        Args: {
          p_offer: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      issue_payment_from_agent_quote: {
        Args: {
          p_expires: string
          p_hash: string
          p_key: string
          p_quote_receipt_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      lapse_booking_requests_before_w6: {
        Args: {
          p_limit: number
          p_now: string
        }
        Returns: Json
      }
      lease_internal_tool_notice: {
        Args: {
          p_delivery?: Json
          p_notice_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      legacy_google_canonical_json: {
        Args: {
          p_value: Json
        }
        Returns: string
      }
      legacy_google_commit: {
        Args: {
          p_input: Json
          p_kind: string | null
          p_pin: Json
          p_user_id: string | null
          p_verified_email: string | null
        }
        Returns: Json
      }
      legacy_google_location_digest: {
        Args: {
          p_binding_id: string | null
        }
        Returns: string
      }
      link_bundle_maintenance_event: {
        Args: {
          p_event_id: string
          p_preparation_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      link_offering_installation_version: {
        Args: {
          i: unknown
          p_migrating: boolean
        }
        Returns: string
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
      list_agency_client_additions: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      list_agent_oauth_connections: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_agent_website_proposals: {
        Args: {
          p_resource: string
          p_token_hash: string
          p_work_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_agent_websites: {
        Args: {
          p_resource: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
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
      list_ask_business_drafts: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      list_business_fact_review_workspaces: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      list_business_outcome_reports: {
        Args: {
          p_month: string
          p_tenant_ids: string[]
        }
        Returns: Json
      }
      list_connected_inquiry_owner_notices_not_told: {
        Args: never
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
      list_inquiry_owner_notices_not_told: {
        Args: {
          p_tenant_ids: string[]
        }
        Returns: Json
      }
      list_internal_tool_notice_retries: {
        Args: never
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
      list_published_business_pages: {
        Args: never
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
      list_system_work_plan_outputs: {
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
      list_website_change_requests: {
        Args: {
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      list_website_domain_requests: {
        Args: {
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
      lock_agency_created_application: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      lock_agent_oauth_token: {
        Args: {
          p_resource: string
          p_scope: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: {
          agency_id: string | null
          client_id: string
          connection_id: string | null
          created_at: string
          expires_at: string
          resource: string
          revoked_at: string | null
          scopes: string[]
          seat_id: string | null
          token_hash: string
          user_id: string
          verified_email: string
          workspace_id: string
        }
      }
      lock_system_package_install_grant: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: boolean
      }
      lock_system_package_install_grant_private_core: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: boolean
      }
      lock_system_revision_qualification: {
        Args: {
          p_revision_id: string
        }
        Returns: boolean
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
      make_real_compensation_transition_valid: {
        Args: {
          event_kind: string
          n: Json
          o: Json
          rolling_back: boolean
        }
        Returns: boolean
      }
      make_real_read_actor: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: undefined
      }
      manage_agency_brand: {
        Args: {
          p_brand?: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      manage_agency_team_member: {
        Args: {
          p_agency_workspace_id: string
          p_role: string
          p_staff_user_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      manage_connected_account: {
        Args: {
          p_action: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
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
      mark_workspace_booking_no_show: {
        Args: {
          p_ref: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
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
      migrate_offering_installation_versions: {
        Args: {
          p_operator_email: string
        }
        Returns: number
      }
      money_assert_operator: {
        Args: {
          p_email: string
          p_user: string
        }
        Returns: undefined
      }
      money_assert_operator_writer: {
        Args: {
          p_email: string
          p_user: string
        }
        Returns: undefined
      }
      mutate_google_binding_generation: {
        Args: {
          p_binding_id: string
          p_expected_updated_at: string
          p_mutation: Json
        }
        Returns: string
      }
      mutate_tenant_provider_connection: {
        Args: {
          p_captured_at: string
          p_expected_payload: Json
          p_payload: Json
          p_payload_hash: string
          p_provider: string
          p_tenant_id: string
        }
        Returns: Json
      }
      native_publishing_require_system: {
        Args: {
          p_kind: string
          p_system_id: string
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
      needs_you_provider_id: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
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
      newsletter_contact_assert_link: {
        Args: {
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      newsletter_contact_project: {
        Args: {
          p_email: string
          p_name: string
          p_seen_at: string
          p_tenant_stable_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      note_google_listing_access: {
        Args: {
          p_location_id: string
          p_pending: boolean
          p_workspace_id: string
        }
        Returns: Json
      }
      observe_home_finder: {
        Args: {
          p_binding_id: string
          p_qualified: boolean
          p_readiness: Json
          p_revision: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      offering_package_behavior: {
        Args: {
          p_definition: Json
        }
        Returns: Json
      }
      offering_package_definition: {
        Args: {
          p_id: string
          p_version: string
        }
        Returns: Json
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
      operator_audit_context_valid: {
        Args: {
          p_context: Json
        }
        Returns: boolean
      }
      operator_email_identity: {
        Args: {
          p_email: string
        }
        Returns: string
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
      operator_owner_invitation_trusted_recipient: {
        Args: {
          p_workspace_id: string
        }
        Returns: string
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
      operator_queue_read_operator: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      outside_write_receipt_row: {
        Args: {
          p_id: string
        }
        Returns: Json
      }
      owner_decision_execution_effects: {
        Args: {
          p_kind: string
          p_lifecycle: string
          p_source_id: string
        }
        Returns: string[]
      }
      owner_decision_json: {
        Args: {
          d: unknown
        }
        Returns: Json
      }
      owner_decision_provider_holds: {
        Args: {
          p_effects: string[]
          p_provider_id: string
          p_workspace_id: string
        }
        Returns: boolean
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
      persist_investigation_history: {
        Args: {
          p_existing: Json
          p_payload: Json
          p_work_id: string
        }
        Returns: undefined
      }
      platform_operator_read_actor: {
        Args: {
          p_reader_name: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
      }
      platform_operator_read_audit_check_roles: {
        Args: never
        Returns: undefined
      }
      platform_operator_read_audit_fingerprint: {
        Args: never
        Returns: Json
      }
      platform_provider_for_resource: {
        Args: {
          p_agency_workspace_id: string
          p_effect: string
          p_resource_kind: string
          p_resource_ref: string
          p_workspace_id: string
        }
        Returns: string
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
      prepare_agent_payment_attempt: {
        Args: {
          p_account: string
          p_payment_id: string
        }
        Returns: Json
      }
      prepare_approved_split_transfer: {
        Args: {
          p_payout_id: string
        }
        Returns: Json
      }
      prepare_booking_calendar_mirror: {
        Args: {
          p_booking_id: string
          p_token: string
        }
        Returns: Json
      }
      prepare_business_checkout: {
        Args: {
          p_payment_id: string
        }
        Returns: Json
      }
      prepare_inquiry_booking_offer: {
        Args: {
          p_inquiry_id: string
          p_service_id: string
          p_slots: Json
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_witness: Json
        }
        Returns: Json
      }
      prepare_qualified_sandbox_build_attempt: {
        Args: {
          p_digest: string
          p_email: string
          p_image: string
          p_name: string
          p_policy: string
          p_project: string
          p_revision: number
          p_team: string
          p_user: string
          p_version: number
          p_work: string
        }
        Returns: Json
      }
      prepare_recovery_reversal: {
        Args: {
          p_loss: string
          p_recovery: string
        }
        Returns: Json
      }
      prepare_sandbox_build_attempt: {
        Args: {
          p_digest: string
          p_email: string
          p_image: string
          p_name: string
          p_project: string
          p_revision: number
          p_team: string
          p_user: string
          p_version: number
          p_work: string
        }
        Returns: Json
      }
      prepare_split_recovery: {
        Args: {
          p_recovery: string
        }
        Returns: Json
      }
      prepare_split_transfer_reversal: {
        Args: {
          p_loss_event: string
          p_payout_id: string
        }
        Returns: Json
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
          creator_workspace_id: string | null
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
          source_revision_id: string | null
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
          version_lineage_id: string | null
        }[]
      }
      prepare_website_domain_request: {
        Args: {
          p_hostname: string
          p_id: string
          p_published_hash: string
          p_published_revision: number
          p_records: Json
          p_revision_hash: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      preview_tenant_unlink: {
        Args: {
          p_operator_email: string
          p_tenant_id: string
        }
        Returns: Json
      }
      project_google_review_event: {
        Args: {
          p: Json
        }
        Returns: Json
      }
      project_google_review_row: {
        Args: {
          p: Json
        }
        Returns: Json
      }
      provider_email_send_allowed: {
        Args: {
          p_agency_workspace_id: string
          p_sender: string
          p_workspace_id: string
        }
        Returns: boolean
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
      provider_seat_read_role: {
        Args: {
          p_lock: boolean
          p_user_id: string
          p_workspace_id: string
        }
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
      publish_agency_package: {
        Args: {
          p_command_id: string
          p_expected_revision: number
          p_revision: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      publish_native_workspace_collection: {
        Args: {
          p_input: Json
        }
        Returns: Json
      }
      publish_private_application_source: {
        Args: {
          p_command_id: string
          p_expected_revision: number
          p_revision: Json
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      publish_website_by_owner_link: {
        Args: {
          p_content_hash: string
          p_decision_id: string
          p_receipt: Json
          p_recipient: string
          p_revision: number
          p_revision_hash: string
          p_session_id: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
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
      publish_website_document_bundle_core: {
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
      publish_website_document_to_linked_tenant_bundle_core: {
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
      publish_workspace_collection: {
        Args: {
          p_input: Json
        }
        Returns: Json
      }
      publishing_google_reconnect: {
        Args: {
          p_action: string
          p_id?: string
          p_input?: Json
        }
        Returns: Json
      }
      publishing_require_tenant: {
        Args: {
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      purge_connected_site_records: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      purge_expired_google_receipt_payloads: {
        Args: {
          p_limit?: number
        }
        Returns: number
      }
      purge_expired_tenant_leads: {
        Args: {
          p_limit: number
        }
        Returns: Json
      }
      purge_google_review_content: {
        Args: never
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
      qualify_custom_sandbox_runtime: {
        Args: {
          p_checks: Json
          p_digest: string
          p_email: string
          p_image: string
          p_policy: string
          p_project: string
          p_reviewer: string
          p_revision: number
          p_team: string
          p_work: string
        }
        Returns: string
      }
      read_access_review: {
        Args: {
          p_organization?: boolean
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
      read_agency_billing: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agency_client_owner_claim: {
        Args: {
          p_token_hash: string
        }
        Returns: Json
      }
      read_agency_created_application: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agency_google_listing_readback_failures: {
        Args: {
          p_agency_workspace_id: string
          p_limit: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_agency_handoffs: {
        Args: {
          p_agency_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      read_agency_package_command: {
        Args: {
          p_command_id: string
          p_expected_revision: number
          p_fingerprint: string
          p_summary: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agency_provider_seats: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_agency_release_flags: {
        Args: {
          p_agency_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agency_team: {
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
      read_agent_booking_outcomes: {
        Args: {
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: Json
      }
      read_agent_booking_proof: {
        Args: {
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: number
      }
      read_agent_business_profile: {
        Args: {
          p_scope: string
        }
        Returns: Json
      }
      read_agent_channel_alarms: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_agent_channel_health: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agent_channel_policy: {
        Args: {
          p_scope: string
        }
        Returns: Json
      }
      read_agent_inquiry_status: {
        Args: {
          p_scope: string
          p_status_hash: string
        }
        Returns: Json
      }
      read_agent_oauth_choices: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_agent_oauth_connection: {
        Args: {
          p_resource: string
          p_token_hash: string
        }
        Returns: Json
      }
      read_agent_oauth_principal: {
        Args: {
          p_resource: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agent_quote_payment_terms: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agent_website_proposal_retry: {
        Args: {
          p_request_hash: string
          p_request_id: string
          p_resource: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_agent_website_work: {
        Args: {
          p_resource: string
          p_scope?: string
          p_token_hash: string
          p_work_id: string
          p_workspace_id: string
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
      read_audited_platform_operator_detail: {
        Args: {
          p_business_id?: string
          p_from?: string
          p_limit?: number
          p_reader_name: string
          p_tenant_id?: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id?: string
        }
        Returns: Json
      }
      read_audited_platform_operator_source: {
        Args: {
          p_reader_name: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_booking_business_details: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_booking_instant_policies: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_booking_instant_policies_before_service_policy: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_booking_setup: {
        Args: {
          p_email: string
          p_tenant_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_bundle_maintenance_receipts: {
        Args: {
          p_business_id: string
          p_from: string
          p_to: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_bundle_native_preparation: {
        Args: {
          p_row_revision: number
          p_user_id: string
          p_verified_email: string
          p_version_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_attributions: {
        Args: {
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
      read_business_booking_email: {
        Args: {
          p_workspace_id: string
        }
        Returns: string
      }
      read_business_booking_email_history: {
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
      read_business_fact_review: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_money: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_page: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_payment_provider: {
        Args: {
          p_account: string
          p_payment_id: string
        }
        Returns: Json
      }
      read_business_payment_sources: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_policies: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_business_portfolio_billing: {
        Args: {
          p_tenant_ids: string[]
        }
        Returns: Json
      }
      read_business_provider_identity: {
        Args: {
          p_business_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_business_public_facts: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
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
      read_business_versions_sibling_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_catalog_report_failures: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_catalog_report_receipts: {
        Args: {
          p_since: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_catalog_search_connection: {
        Args: {
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_catalog_tool_contact_conflicts: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_catalog_tool_notice_failures: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_catalog_tool_notices: {
        Args: {
          p_since: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_catalog_tool_releases: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_client_resource_mandates: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_confirmed_business_facts: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_connected_account: {
        Args: {
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
      read_connected_site_inquiries_v2: {
        Args: {
          p_limit: number
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_connected_site_schema_conflict: {
        Args: {
          p_site_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_creator_maintenance_operations: {
        Args: {
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
      read_enterprise_unit_versions: {
        Args: {
          p_organization_id: string
          p_unit_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_enterprise_units: {
        Args: {
          p_organization_id: string
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
      read_finite_job_sources: {
        Args: {
          p_business_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_google_binding_for_tenant: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_google_listing_control: {
        Args: {
          p_location_id: string
          p_workspace_id: string
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
      read_google_listing_readback_failures_v2: {
        Args: {
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
      read_google_listing_receipt_by_key: {
        Args: {
          p_idempotency_key: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_home_finder_bindings: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_home_finder_probe: {
        Args: {
          p_binding_id: string
        }
        Returns: Json
      }
      read_home_finder_public: {
        Args: {
          p_binding_id: string
        }
        Returns: Json
      }
      read_home_finder_receipt_scope: {
        Args: {
          p_binding_id: string
          p_submission_id: string
        }
        Returns: Json
      }
      read_hosted_website_business_facts: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_inquiry_booking_handoff: {
        Args: {
          p_inquiry_id: string
          p_row_id: string
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_inquiry_booking_offer:
        | {
          Args: {
            p_offer_id: string
          }
          Returns: Json
        }
        | {
          Args: {
            p_hash: string
          }
          Returns: Json
        }
      read_inquiry_booking_receipt: {
        Args: {
          p_inquiry_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_inquiry_business_context: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_inquiry_business_facts: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_inquiry_message_owner_policy: {
        Args: {
          p_business_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      read_inquiry_workspace_booking_context: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_inquiry_workspace_bookings: {
        Args: {
          p_from: string
          p_to: string
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
      read_internal_tool_use_link_labels: {
        Args: {
          p_grant_id: string
          p_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      read_investigation_runs: {
        Args: {
          p_before_revision?: number
          p_limit?: number
          p_request_id?: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      read_legacy_google_operation: {
        Args: {
          p_tenant_id: string
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
      read_money_reconciliation: {
        Args: {
          p_email: string
          p_limit?: number
          p_user: string
        }
        Returns: Json
      }
      read_native_booking_access: {
        Args: {
          p_hash: string
          p_kind: string
        }
        Returns: Json
      }
      read_native_booking_workspaces: {
        Args: never
        Returns: Json
      }
      read_native_workspace_collection: {
        Args: {
          p_system_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_native_workspace_collection_receipts: {
        Args: {
          p_system_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_native_workspace_google_binding: {
        Args: {
          p_workspace_id: string
        }
        Returns: Json
      }
      read_native_workspace_newsletter_issues: {
        Args: {
          p_system_id: string
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
      read_operator_agency_release_flags: {
        Args: {
          p_agency_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_operator_google_uncertainty: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_operator_held_inquiries: {
        Args: {
          p_before: string
          p_before_id: string
          p_limit: number
          p_state: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_operator_inquiry_notice_issues: {
        Args: {
          p_before: string
          p_before_id: string
          p_limit: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_operator_inquiry_review_audited: {
        Args: {
          p_before: string
          p_before_id: string
          p_limit: number
          p_user_id: string
          p_verified_email: string
          p_view: string
        }
        Returns: Json
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
      read_operator_queue_context_v2: {
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
      read_owner_decision_source_for_delivery: {
        Args: {
          p_lifecycle: string
          p_source_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_owner_decision_website_preview: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_revision_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_payment_follow_ups: {
        Args: {
          p_user_id: string
          p_verified_email: string
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
      read_provider_booking_evidence: {
        Args: {
          p_date: string
          p_user_id: string
          p_verified_email: string
          p_view: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_provider_change_requests: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_provider_change_requests_before_cancel: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_provider_client_queue: {
        Args: {
          p_after_at?: string
          p_after_key?: string
          p_agency_workspace_id: string
          p_limit?: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      read_public_booking_request: {
        Args: {
          p_request_id: string
          p_tenant_id: string
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
      read_public_payment_request: {
        Args: {
          p_hash: string
        }
        Returns: Json
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
      read_published_business_page: {
        Args: {
          p_handle: string
        }
        Returns: Json
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
      read_responsibility_bundle_state: {
        Args: {
          p_business_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_responsibility_domain_evidence: {
        Args: {
          p_business_id: string
          p_from: string
          p_to: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_responsibility_month_evidence: {
        Args: {
          p_business_id: string
          p_month: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_responsibility_proof_for_tenant: {
        Args: {
          p_from: string
          p_tenant_id: string
          p_to: string
        }
        Returns: Json
      }
      read_responsibility_proof_rows: {
        Args: {
          p_business_id: string
          p_from: string
          p_to: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_sandbox_build_attempt: {
        Args: {
          p_attempt: string
          p_email: string
          p_user: string
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
      read_service_request_providers: {
        Args: {
          p_business_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      read_source_transfer_ids: {
        Args: {
          p_charge: string
        }
        Returns: Json
      }
      read_split_payout_candidates: {
        Args: {
          p_limit?: number
        }
        Returns: Json
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
      read_system_bundle_install_receipt: {
        Args: {
          p_command_id: string
          p_name: string
          p_revision_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_bundle_qualification_source: {
        Args: {
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_bundle_target_choices: {
        Args: {
          p_command_id: string
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_bundle_targets: {
        Args: {
          p_command_id: string
          p_revision_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_package_creator: {
        Args: {
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_package_install_grants: {
        Args: {
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_package_listings: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_system_package_source: {
        Args: {
          p_system_id: string
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
      read_system_work_plan: {
        Args: {
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
      read_system_work_plan_output: {
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
      read_tenant_booking_context_before_service_policy: {
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
      read_tenant_booking_policy: {
        Args: {
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_booking_policy_before_service_policy: {
        Args: {
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
      read_tenant_business_context: {
        Args: {
          p_tenant_id: string
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
      read_tenant_client_records_page: {
        Args: {
          p_after_record_id: string
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
      read_tenant_lead_presence: {
        Args: {
          p_lead_ids: string[]
          p_tenant_id: string
        }
        Returns: Json
      }
      read_tenant_lead_summary: {
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
      read_tenant_leads_page: {
        Args: {
          p_before: string
          p_before_id: string
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
      read_version_actor_bundle_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_version_actor_package_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_version_binding_choices: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_version_native_runtime: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_version_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_version_native_runtime_bundle_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_version_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_website_agency_publish_permission: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
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
      read_workspace_booking_evidence: {
        Args: {
          p_from: string
          p_tenant_id: string
          p_to: string
          p_user_id: string
          p_verified_email: string
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
      read_workspace_collection_receipts: {
        Args: {
          p_system_id: string
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_exit_handoff_plan: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_exit_handoff_plan_before_evidence: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_exit_handoff_plan_before_home_finder: {
        Args: {
          p_user_id: string
          p_verified_email: string
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
      read_workspace_export_build_part_before_review_retention: {
        Args: {
          p_build_id: string
          p_part: number
          p_token_hash: string
        }
        Returns: Json
      }
      read_workspace_export_owner_part: {
        Args: {
          p_build_id: string
          p_part: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_workspace_export_owner_part_before_review_retention: {
        Args: {
          p_build_id: string
          p_part: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      read_workspace_export_owner_status: {
        Args: {
          p_build_id: string
          p_user_id: string
          p_verified_email: string
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
      read_workspace_inquiry_inbox_page: {
        Args: {
          p_before: string
          p_before_id: string
          p_limit: number
          p_states: string[]
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_inquiry_leads_with_receipts: {
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
      read_workspace_inquiry_reply_receipts: {
        Args: {
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
      read_workspace_manual_booking_context: {
        Args: {
          p_email: string
          p_tenant_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_workspace_newsletter_issues: {
        Args: {
          p_tenant_id: string
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
      receive_agent_inquiry: {
        Args: {
          p_digest: string
          p_input: Json
          p_scope: string
          p_spam_reason: string
          p_status_ciphertext: string
          p_status_hash: string
        }
        Returns: Json
      }
      receive_agent_inquiry_before_channel_policy: {
        Args: {
          p_digest: string
          p_input: Json
          p_scope: string
          p_spam_reason: string
          p_status_ciphertext: string
          p_status_hash: string
        }
        Returns: Json
      }
      reconcile_bundle_inquiry_releases: {
        Args: {
          p_capability_id: string
          p_workspace_id: string
        }
        Returns: number
      }
      reconcile_bundle_native_releases: {
        Args: {
          p_work_id: string
          p_workspace_id: string
        }
        Returns: number
      }
      reconcile_sandbox_build_billing: {
        Args: {
          p_evidence: string
        }
        Returns: Json
      }
      reconcile_split_loss: {
        Args: {
          p_charge_basis: number
          p_charge_id: string
          p_cumulative_loss: number
          p_event_key: string
          p_source_account: string
        }
        Returns: Json
      }
      reconcile_split_loss_before_receipt: {
        Args: {
          p_charge_basis: number
          p_charge_id: string
          p_cumulative_loss: number
          p_event_key: string
          p_source_account: string
        }
        Returns: Json
      }
      reconcile_website_system_releases: {
        Args: {
          p_content_reading?: boolean
          p_origin_kind: string
          p_origin_ref: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: number
      }
      record_agency_billing_checkout: {
        Args: {
          p_account_id: string
          p_intent_id: string
          p_object_id: string
          p_url: string
        }
        Returns: Json
      }
      record_agency_billing_provider_event: {
        Args: {
          p_account_id: string
          p_created: number
          p_event_id: string
          p_evidence?: Json
          p_object_id: string
          p_status: string
        }
        Returns: Json
      }
      record_agency_billing_terms: {
        Args: {
          p_account_id: string
          p_customer_id: string
          p_intent_id: string
          p_price_id: string
        }
        Returns: Json
      }
      record_agency_billing_terms_authorized: {
        Args: {
          p_accepted_email: string
          p_account_id: string
          p_actor_id: string
          p_customer_id: string
          p_generation: number
          p_intent_id: string
          p_price_id: string
          p_verified_email: string
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
      record_agent_business_discovery: {
        Args: {
          p_scopes: string[]
        }
        Returns: number
      }
      record_agent_quote: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_lead_id: string
          p_request_id: string
          p_terms: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_booking_parity_batch: {
        Args: {
          p_reports: Json
        }
        Returns: Json
      }
      record_business_attribution: {
        Args: {
          p_agency_workspace_id: string
          p_command_id: string
          p_expected_provider_id: string
          p_source: string
          p_source_receipt: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
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
      record_business_outcome_report_delivery: {
        Args: {
          p_month: string
          p_status: string
          p_token: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_business_payment_event: {
        Args: {
          p_account_id: string
          p_amount: number
          p_currency?: string
          p_event_id: string
          p_kind: string
          p_object_id: string
          p_payment_id: string
          p_source_intent?: string
        }
        Returns: Json
      }
      record_business_payment_event_before_currency: {
        Args: {
          p_account_id: string
          p_amount: number
          p_event_id: string
          p_kind: string
          p_object_id: string
          p_payment_id: string
        }
        Returns: Json
      }
      record_business_refund_receipt: {
        Args: {
          p_refund_id: string
          p_request_id: string
        }
        Returns: undefined
      }
      record_catalog_report_receipt: {
        Args: {
          p_kind: string
          p_period: string
          p_provider_message_id: string
          p_reason: string
          p_recipient: string
          p_status: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      record_catalog_search_connection: {
        Args: {
          p_clicks: number
          p_impressions: number
          p_status: string
          p_tenant_id: string
        }
        Returns: boolean
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
      record_connected_account: {
        Args: {
          p_account_id: string
          p_capabilities: Json
          p_configurations: string[]
          p_profile_version: string
          p_ready: boolean
          p_requirements: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      record_connected_inquiry_owner_notice_event: {
        Args: {
          p_accepted_at: string
          p_event_at: string
          p_event_id: string
          p_lead_row_id: string
          p_provider_message_id: string
          p_recipients: string[]
          p_status: string
          p_subject: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_connected_inquiry_owner_notice_repair_event: {
        Args: {
          p_accepted_at: string
          p_event_at: string
          p_event_id: string
          p_lead_row_id: string
          p_provider_message_id: string
          p_recipients: string[]
          p_repair_id: string
          p_status: string
          p_subject: string
          p_workspace_id: string
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
      record_connected_site_inquiry_v2: {
        Args: {
          p_lead: Json
          p_origin: string
          p_public_key: string
        }
        Returns: Json
      }
      record_connected_site_schema_conflict: {
        Args: {
          p_item: Json
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
      record_connected_site_spam_v2: {
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
      record_conversion_resource_mandate: {
        Args: {
          p_agency_workspace_id: string
          p_effect: string
          p_note: string
          p_operator_email: string
          p_resource_kind: string
          p_resource_ref: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_creator_maintenance_from_workspace: {
        Args: {
          p_agreement: string | null
          p_effective: string
          p_listing_id: string
          p_rate: string | null
          p_source_revision_id: string
          p_state: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_creator_royalty_maintenance: {
        Args: {
          p_agreement: string
          p_effective: string
          p_listing_id: string
          p_rate: string
          p_state: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      record_creator_royalty_maintenance_before_identity: {
        Args: {
          p_agreement: string
          p_effective: string
          p_listing_id: string
          p_rate: string
          p_state: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      record_google_listing_receipt: {
        Args: {
          p_input: Json
        }
        Returns: Json
      }
      record_inquiry_decision_notice_event: {
        Args: {
          p_accepted_at: string
          p_decision_id: string
          p_event_at: string
          p_event_id: string
          p_provider_message_id: string
          p_recipients: string[]
          p_status: string
          p_subject: string
          p_workspace_id: string
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
      record_invoice_money_evidence: {
        Args: {
          p_account: string
          p_event: string
          p_invoice: string
          p_line: string
        }
        Returns: undefined
      }
      record_invoice_split_source: {
        Args: {
          p_account: string
          p_basis: number
          p_business: string
          p_charge: string
          p_currency: string
          p_customer: string
          p_end: string
          p_item: string
          p_line: string
          p_payer: string
          p_start: string
          p_subscription: string
        }
        Returns: Json
      }
      record_model_calls: {
        Args: {
          p_calls: Json
        }
        Returns: number
      }
      record_money_reconciliation_issue: {
        Args: {
          p_account: string
          p_event: string
          p_object: string
          p_reason: string
          p_type: string
        }
        Returns: undefined
      }
      record_native_website_fact_review: {
        Args: {
          p_claim_token: string
          p_event_id: string
          p_status: string
        }
        Returns: Json
      }
      record_operator_queue_effort: {
        Args: {
          p_business_id: string
          p_category: string
          p_entry_id: string
          p_minutes: number
          p_note: string
          p_occurred_on: string
          p_queue: Json
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      record_platform_collection_settlement: {
        Args: {
          p_amount: number
          p_charge: string
          p_currency: string
          p_customer: string
          p_event: string
          p_id: string
          p_intent: string
        }
        Returns: Json
      }
      record_recovery_reversal: {
        Args: {
          p_amount: number
          p_id: string
          p_provider: string
        }
        Returns: undefined
      }
      record_sandbox_build_billing_evidence: {
        Args: {
          p_attempt: string
          p_currency: string
          p_project: string
          p_reference: string
          p_session: string
          p_team: string
          p_usd: string
        }
        Returns: string
      }
      record_sandbox_build_observation: {
        Args: {
          p_attempt: string
          p_kind: string
          p_name: string
          p_payload: Json
          p_project: string
          p_session: string
          p_team: string
        }
        Returns: string
      }
      record_split_recovery: {
        Args: {
          p_amount: number
          p_currency: string
          p_recovery: string
          p_transfer: string
        }
        Returns: undefined
      }
      record_split_transfer: {
        Args: {
          p_amount: number
          p_currency: string
          p_payout_id: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      record_split_transfer_reversal: {
        Args: {
          p_amount: number
          p_id: string
          p_reversal_id: string
        }
        Returns: undefined
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
      record_system_bundle_qualification: {
        Args: {
          p_artifacts: Json
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      record_system_revision_qualification: {
        Args: {
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
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
      record_tenant_booking_before_w6: {
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
      record_tenant_lead_read_parity: {
        Args: {
          p_mismatched: number
          p_missing: number
          p_postgres_count: number
          p_redis_count: number
          p_tenant_id: string
        }
        Returns: Json
      }
      record_tenant_provider_disconnect: {
        Args: {
          p_actor_user_id: string
          p_cleared_stores: string[]
          p_local_cleanup_status: string
          p_provider: string
          p_revocation_error_code: string
          p_revocation_outcome: string
          p_tenant_id: string
        }
        Returns: Json
      }
      record_version_preparation: {
        Args: {
          p_owner_decision_id: string
          p_row_revision: number
          p_user_id: string
          p_verified_email: string
          p_version_id: string
          p_workspace_id: string
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
      record_website_domain_request: {
        Args: {
          p_id: string
          p_receipt_email: Json
          p_result: Json
          p_workspace_id: string
        }
        Returns: Json
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
      record_workspace_exit_handoff: {
        Args: {
          p_evidence: string
          p_export_build_id?: string
          p_kind: string
          p_tenant_stable_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_workspace_inquiry_booking: {
        Args: {
          p_row_id: string
          p_service_id: string
          p_service_name: string
          p_slot: Json
          p_time_zone: string
          p_witness: Json
        }
        Returns: Json
      }
      record_workspace_inquiry_provider_event: {
        Args: {
          p_accepted_at: string
          p_event_at: string
          p_event_id: string
          p_message_id: string
          p_provider_message_id: string
          p_recipients: string[]
          p_status: string
          p_subject: string
          p_workspace_id: string
        }
        Returns: Json
      }
      record_workspace_operator_audit: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_metadata: Json
          p_target_id: string
          p_target_type: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      recover_agent_payment_provider: {
        Args: {
          p_account: string
          p_amount: number
          p_currency: string
          p_payment_id: string
          p_provider: string
        }
        Returns: boolean
      }
      refresh_agent_oauth_connection: {
        Args: {
          p_client_id: string
          p_next_refresh_hash: string
          p_refresh_hash: string
          p_resource: string
          p_scopes: string[]
          p_token_hash: string
        }
        Returns: Json
      }
      refresh_home_finder_probe: {
        Args: {
          p_binding_id: string
          p_qualified: boolean
          p_readiness: Json
          p_revision: number
        }
        Returns: undefined
      }
      register_creator_listing: {
        Args: {
          p_agreement_version?: string
          p_creator_workspace_id: string
          p_definition_id: string
          p_rate_reference?: string
          p_source_revision_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      register_offering_package_source: {
        Args: {
          p_definition_id: string
          p_definition_version: string
          p_operator_email: string
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
      release_public_record_booking_claim: {
        Args: {
          p_reservation_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      release_rejected_engine_inquiry_reply: {
        Args: {
          p_attempt_id: string
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      repath_converted_tenant_provider: {
        Args: {
          p_agency_workspace_id: string
          p_apply: boolean
          p_operator_email: string
          p_selection_basis: string
          p_staff_emails: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      request_provider_change: {
        Args: {
          p_key: string
          p_new_agency_id: string
          p_payer_transition_id?: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      request_provider_change_before_completion_cleanup: {
        Args: {
          p_key: string
          p_new_agency_id: string
          p_payer_transition_id?: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      request_provider_change_without_payer: {
        Args: {
          p_key: string
          p_new_agency_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      require_agency_authoring_scope: {
        Args: {
          p_agency_workspace_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      require_private_application_source_share: {
        Args: {
          p_source_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      require_system_package_install_scope: {
        Args: {
          p_command_id: string
          p_revision: number
          p_source_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      require_system_package_install_scope_private_core: {
        Args: {
          p_command_id: string
          p_revision: number
          p_source_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      require_system_package_revision_scope: {
        Args: {
          p_review: boolean
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      require_system_work_plan_actor: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      reserve_agent_payment_request: {
        Args: {
          p_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      reserve_bundle_maintenance_preparation: {
        Args: {
          p_attachment_id: string
          p_cycle_key: string
          p_draft: Json
          p_record_revision: number
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      reserve_business_outcome_report_delivery: {
        Args: {
          p_month: string
          p_workspace_id: string
        }
        Returns: Json
      }
      reserve_business_payment: {
        Args: {
          p_amount: number
          p_currency: string
          p_key: string
          p_purpose: string
          p_reference?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      reserve_business_refund: {
        Args: {
          p_amount: number
          p_key: string
          p_payment_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      reserve_platform_collection: {
        Args: {
          p_agreement: string
          p_amount: number
          p_business_id: string
          p_currency: string
          p_customer_id: string
          p_installation_id?: string
          p_key: string
          p_line_id: string
        }
        Returns: Json
      }
      reserve_split_payout_dry_run: {
        Args: {
          p_agreement: string
          p_amount: number
          p_available: number
          p_charge: string
          p_currency: string
          p_recipient: string
          p_split_id: string
        }
        Returns: Json
      }
      reserve_website_by_owner_link: {
        Args: {
          p_content_hash: string
          p_decision_id: string
          p_recipient: string
          p_revision: number
          p_revision_hash: string
          p_session_id: string
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
          p_maximum: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: number
      }
      resolve_ask_business_draft: {
        Args: {
          p_decision: string
          p_draft_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      resolve_ask_business_draft_by_owner_link: {
        Args: {
          p_decision: string
          p_decision_id: string
          p_draft_id: string
          p_recipient: string
          p_revision_hash: string
          p_session_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
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
      resolve_invoice_business_line: {
        Args: {
          p_basis: number
          p_currency: string
          p_item: string
          p_payer_workspace: string
          p_subscription: string
        }
        Returns: string
      }
      resolve_money_reconciliation: {
        Args: {
          p_account: string
          p_email: string
          p_event: string
          p_evidence_id?: string
          p_evidence_kind?: string
          p_kind: string
          p_note: string
          p_reason: string
          p_user: string
        }
        Returns: Json
      }
      resolve_owner_brand: {
        Args: {
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
      resolve_workspace_inquiry_booking_lead: {
        Args: {
          p_row_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      respond_provider_change: {
        Args: {
          p_key: string
          p_kind: string
          p_note: string
          p_request_id: string
          p_user_id: string
          p_verified_email: string
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
      responsibility_assert_actor: {
        Args: {
          p_business_id: string
          p_provider_only?: boolean
          p_user_id: string
          p_verified_email: string
        }
        Returns: string
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
          creator_workspace_id: string | null
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
          source_revision_id: string | null
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
          version_lineage_id: string | null
        }[]
      }
      review_system_revision_qualification: {
        Args: {
          p_approve: boolean
          p_note: string
          p_revision_id: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      revoke_access_review_entry: {
        Args: {
          p_business_id: string
          p_kind: string
          p_organization: boolean
          p_record_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      revoke_agent_oauth_client_token: {
        Args: {
          p_client_id: string
          p_token_hash: string
        }
        Returns: boolean
      }
      revoke_agent_oauth_token: {
        Args: {
          p_token_hash: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: boolean
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
      revoke_home_finder: {
        Args: {
          p_binding_id: string
          p_revision: number
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
      revoke_operator_owner_invitation_audited: {
        Args: {
          p_audit_context: Json
          p_invitation_id: string
          p_operator_user_id: string
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
      revoke_super_admin: {
        Args: {
          p_actor_user_id?: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      revoke_system_package_install: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      revoke_system_package_install_snapshot_core: {
        Args: {
          p_grant_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
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
      rotate_tenant_track_signing_key: {
        Args: {
          p_public_key: string | null
          p_tenant_id: string
        }
        Returns: undefined
      }
      sandbox_build_rollback_assert_unused: {
        Args: never
        Returns: undefined
      }
      save_ask_business_draft: {
        Args: {
          p_asked_on_behalf?: string
          p_expected_revision: number
          p_idempotency_key: string
          p_patch: Json
          p_summary: string
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
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
      save_system_version_native_core: {
        Args: {
          p_expected_row_revision: number
          p_lineage: Json
          p_user_id: string
          p_verified_email: string
          p_version_id: string
        }
        Returns: Json
      }
      save_system_version_owner_grants_core: {
        Args: {
          p_expected_row_revision: number
          p_lineage: Json
          p_user_id: string
          p_verified_email: string
          p_version_id: string
        }
        Returns: Json
      }
      save_system_version_package_core: {
        Args: {
          p_expected_row_revision: number
          p_lineage: Json
          p_user_id: string
          p_verified_email: string
          p_version_id: string
        }
        Returns: Json
      }
      save_system_version_qualification_snapshot_core: {
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
      save_system_work_plan: {
        Args: {
          p_input: Json
          p_payload: Json
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
      service_request_assert_agency_client: {
        Args: {
          p_agency_id: string
          p_business_id: string
          p_lock: boolean
          p_user_id: string
          p_verified_email: string
        }
        Returns: undefined
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
      set_agency_release_flag_ceiling: {
        Args: {
          p_agency_id: string
          p_expected_revision: number
          p_flag: string
          p_max_state: string
          p_reason: string
          p_system_id: string
          p_user_id: string
          p_verification_effect: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_agency_workspace_release_flag: {
        Args: {
          p_agency_id: string
          p_ceiling_revision: number
          p_expected_revision: number
          p_flag: string
          p_reason: string
          p_state: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_agent_channel_consent: {
        Args: {
          p_consented: boolean
          p_reason: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      set_business_booking_email: {
        Args: {
          p_reason: string
          p_state: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_business_page: {
        Args: {
          p_handle: string
          p_published: boolean
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
      set_google_listing_paused: {
        Args: {
          p_location_id: string
          p_paused: boolean
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
      set_private_application_source_share: {
        Args: {
          p_business_id: string
          p_shared: boolean
          p_system_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_provider_responsibility_cadence: {
        Args: {
          p_business_id: string
          p_cadence: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
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
      set_system_package_listing: {
        Args: {
          p_state: string
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
      set_tenant_booking_status_before_cutoff: {
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
      set_workspace_release_flag_approved: {
        Args: {
          p_approval_id: string
          p_expected_revision: number
          p_flag: string
          p_operator_user_id: string
          p_reason: string
          p_state: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_workspace_release_flag_before_agency: {
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
      snapshot_due_responsibility_meters: {
        Args: {
          p_limit?: number
        }
        Returns: Json
      }
      snapshot_responsibility_meter: {
        Args: {
          p_business_id: string
          p_month: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      snapshot_responsibility_meter_preview_v1: {
        Args: {
          p_business_id: string
          p_month: string
          p_user_id: string
          p_verified_email: string
        }
        Returns: Json
      }
      split_reserved_net: {
        Args: {
          p_split: string
        }
        Returns: number
      }
      stage_inquiry_business_fact: {
        Args: {
          p_key: string
          p_provenance: string
          p_user_id: string
          p_value: Json
          p_workspace_id: string
        }
        Returns: string
      }
      start_workspace_export_build: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      start_workspace_export_build_before_owner_rule: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      store_google_receipt_payload: {
        Args: {
          p_expires_at: string
          p_fields: Json
          p_receipt_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      strelva_make_real_link_session: {
        Args: {
          p_decision_id: string
          p_recipient: string
          p_workspace_id: string
        }
        Returns: Json
      }
      strelva_owner_decision_link_session:
        | {
          Args: {
            p_decision_id: string
            p_recipient: string
            p_revision_hash: string
            p_workspace_id: string
          }
          Returns: Json
        }
        | {
          Args: {
            p_decision: string
            p_decision_id: string
            p_recipient: string
            p_revision_hash: string
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
      submit_internal_tool_member_record: {
        Args: {
          p_expected_records_revision: number
          p_expected_release_version: number
          p_links: Json
          p_record_id: string
          p_user_id: string
          p_values: Json
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      submit_internal_tool_use_record: {
        Args: {
          p_grant_id: string
          p_idempotency_key: string
          p_record: Json
          p_release_version: number
          p_user_id: string
          p_verified_email: string
          p_work_id: string
        }
        Returns: Json
      }
      subscribe_newsletter_contact: {
        Args: {
          p_email: string
          p_name: string
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
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
      super_admin_manager_actor: {
        Args: {
          p_actor_user_id?: string
        }
        Returns: string
      }
      sync_booking_calendar_health: {
        Args: {
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
      system_actor_scope_bundle_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: Record<string, unknown>
      }
      system_actor_scope_package_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: Record<string, unknown>
      }
      system_actor_scope_private_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: Record<string, unknown>
      }
      system_bundle_assert_native_publication: {
        Args: {
          p_document: Json
          p_work_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      system_bundle_assert_scope: {
        Args: {
          p_command_id: string
          p_revision_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      system_bundle_component_definition: {
        Args: {
          p_definition: Json
          p_version_id: string
        }
        Returns: Json
      }
      system_bundle_native_draft_active: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_work_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      system_bundle_native_receipt: {
        Args: {
          p: unknown
        }
        Returns: Json
      }
      system_bundle_read_scope: {
        Args: {
          p_command_id: string
          p_revision_id: string
          p_targets: Json
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      system_bundle_read_work_ids: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string[]
      }
      system_bundle_working_definition: {
        Args: {
          v: unknown
        }
        Returns: Json
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
      system_package_assert_declaration: {
        Args: {
          p_bindings: string[]
          p_declaration: Json
          p_definition: Json
        }
        Returns: undefined
      }
      system_package_behavior: {
        Args: {
          p_bindings: string[]
          p_definition: Json
        }
        Returns: Json
      }
      system_package_behavior_bundle_core: {
        Args: {
          p_bindings: string[]
          p_definition: Json
        }
        Returns: Json
      }
      system_package_behavior_native_core: {
        Args: {
          p_bindings: string[]
          p_definition: Json
        }
        Returns: Json
      }
      system_package_install_grant_active: {
        Args: {
          g: unknown
          p_user_id: string
          p_verified_email: string
        }
        Returns: boolean
      }
      system_package_install_grant_active_private_core: {
        Args: {
          g: unknown
          p_user_id: string
          p_verified_email: string
        }
        Returns: boolean
      }
      system_package_read_work_ids: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string[]
      }
      system_package_rehearsal: {
        Args: {
          p_definition: Json
        }
        Returns: Json
      }
      system_package_rehearsal_bundle_core: {
        Args: {
          p_definition: Json
        }
        Returns: Json
      }
      system_package_rehearsal_native_core: {
        Args: {
          p_definition: Json
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
      system_read_load: {
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
      system_read_scope: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: Record<string, unknown>
      }
      system_read_scope_package_core: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
          p_write: boolean
        }
        Returns: Record<string, unknown>
      }
      system_revision_is_qualified: {
        Args: {
          p_revision_id: string
        }
        Returns: boolean
      }
      system_revision_json: {
        Args: {
          r: unknown
        }
        Returns: Json
      }
      system_revision_qualification_json: {
        Args: {
          p_revision_id: string
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
      system_version_access_private_core: {
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
      system_version_json_bundle_core: {
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
      system_version_read_access: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_write: boolean
          v: unknown
        }
        Returns: Record<string, unknown>
      }
      system_version_revision_json: {
        Args: {
          p_workspace_id: string
          r: unknown
        }
        Returns: Json
      }
      system_version_sibling_changes: {
        Args: {
          p_version: unknown
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
      system_version_validate_locks: {
        Args: {
          p_definition: Json
          p_paths: Json
        }
        Returns: undefined
      }
      tenant_agency_seat: {
        Args: {
          p_tenant_id: string
          p_user_id: string
        }
        Returns: string
      }
      tenant_cleanup_receipt: {
        Args: {
          p_slug: string
        }
        Returns: Json
      }
      tenant_cleanup_teardown_blockers: {
        Args: {
          p_tenant_id: string
        }
        Returns: {
          booking_grants: number
          bookings: number
          newsletter_issues: number
          publications: number
          reservations: number
        }[]
      }
      tenant_cleanup_teardown_blockers_before_newsletter: {
        Args: {
          p_tenant_id: string
        }
        Returns: {
          booking_grants: number
          bookings: number
          publications: number
          reservations: number
        }[]
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
      tenant_conversion_provider_route: {
        Args: {
          p_agency_workspace_id: string
          p_apply: boolean
          p_customer_workspace_id: string
          p_operator_id: string
          p_repath_only: boolean
          p_selection_basis: string
          p_staff_emails: Json
        }
        Returns: Json
      }
      tenant_lead_read_parity_streak: {
        Args: never
        Returns: Json
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
      undo_website_linked_cutover: {
        Args: {
          p_command_id: string
          p_content_hash: string
          p_domain_restored: boolean
          p_fallback_verified: boolean
          p_revision: number
          p_tenant_id: string
          p_user_id: string
          p_verified_email: string
          p_work_id: string
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
          creator_workspace_id: string | null
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
          source_revision_id: string | null
          status: string
          surface_ids: string[]
          updated_at: string
          updated_by: string
          version_lineage_id: string | null
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
      validate_agent_oauth_token: {
        Args: {
          p_resource: string
          p_scope: string
          p_token_hash: string
          p_workspace_id: string
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
      verify_connected_inquiry_owner_notice_repair: {
        Args: {
          p_repair_id: string
        }
        Returns: boolean
      }
      verify_invoice_split_source: {
        Args: {
          p_account: string
          p_business: string
          p_customer: string
          p_subscription: string
        }
        Returns: boolean
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
      website_document_assert_actor_bundle_core: {
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
      website_document_read_actor: {
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
      website_document_read_actor_package_core: {
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
      website_domain_request_json: {
        Args: {
          r: unknown
        }
        Returns: Json
      }
      website_rebuild_connected_origin: {
        Args: {
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
      work_allowance_assert_read_identity: {
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
      work_payer_can_sign: {
        Args: {
          p_actor: string
          p_business: string
          p_kind: string
          p_party: string
          p_signer: string
        }
        Returns: boolean
      }
      work_payer_can_sign_writer: {
        Args: {
          p_actor: string
          p_business: string
          p_kind: string
          p_party: string
          p_signer: string
        }
        Returns: boolean
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
      workspace_export_v3_categories_before_enterprise: {
        Args: never
        Returns: string[]
      }
      workspace_export_v3_categories_before_extended_money: {
        Args: never
        Returns: string[]
      }
      workspace_export_v3_categories_before_money: {
        Args: never
        Returns: string[]
      }
      workspace_export_v3_categories_before_recoveries: {
        Args: never
        Returns: string[]
      }
      workspace_export_v3_read_role: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
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
      workspace_inquiry_reply_permission: {
        Args: {
          p_lead_row_id: string
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: string
      }
      workspace_make_systems_authority: {
        Args: {
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      workspace_newsletter_sender: {
        Args: {
          p_action: string
          p_id?: string
          p_input?: Json
        }
        Returns: Json
      }
      workspace_newsletter_sender_legacy_target: {
        Args: {
          p_action: string
          p_id?: string
          p_input?: Json
        }
        Returns: Json
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
          can_respond: boolean
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
          can_respond: boolean
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
      write_operator_content: {
        Args: {
          p_data: Json
          p_section: string
          p_tenant_id: string
        }
        Returns: Json
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
      write_workspace_export_recovery: {
        Args: {
          p_args: Json
          p_build_id: string
          p_lease_token: string
          p_operation: string
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
