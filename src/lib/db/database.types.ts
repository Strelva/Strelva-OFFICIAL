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
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          status: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
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
          request_id: string | null
          changes: Json | null
          created_at: string
          data: Json
          id: string
          section: string
          status: string
          tenant_id: string
          tenant_stable_id: string | null
        }
        Insert: {
          author: string
          request_id?: string | null
          changes?: Json | null
          created_at?: string
          data: Json
          id: string
          section: string
          status: string
          tenant_id: string
          tenant_stable_id?: string | null
        }
        Update: {
          author?: string
          request_id?: string | null
          changes?: Json | null
          created_at?: string
          data?: Json
          id?: string
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
      super_admin_bootstrap: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
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
      tenant_leads: {
        Row: {
          capability_id: string | null
          capability_version: number | null
          captured_at: string
          email: string | null
          fields: Json | null
          id: string
          lead_id: string
          message: string | null
          name: string
          recorded_at: string
          recorded_via: string
          source: string | null
          submission_hash: string
          tenant_slug_at_capture: string
          tenant_stable_id: string
          workspace_id: string | null
        }
        Insert: {
          capability_id?: string | null
          capability_version?: number | null
          captured_at: string
          email?: string | null
          fields?: Json | null
          id?: string
          lead_id: string
          message?: string | null
          name: string
          recorded_at?: string
          recorded_via: string
          source?: string | null
          submission_hash: string
          tenant_slug_at_capture: string
          tenant_stable_id: string
          workspace_id?: string | null
        }
        Update: {
          capability_id?: string | null
          capability_version?: number | null
          captured_at?: string
          email?: string | null
          fields?: Json | null
          id?: string
          lead_id?: string
          message?: string | null
          name?: string
          recorded_at?: string
          recorded_via?: string
          source?: string | null
          submission_hash?: string
          tenant_slug_at_capture?: string
          tenant_stable_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_leads_tenant_stable_id_fkey"
            columns: ["tenant_stable_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["stable_id"]
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
          id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      app_is_super_admin: { Args: never; Returns: boolean }
      app_tenant_ids: { Args: never; Returns: string[] }
      app_tenant_stable_ids: { Args: never; Returns: string[] }
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
      business_contact_phone_key: {
        Args: { p_phone: string }
        Returns: string
      }
      business_contact_sources: { Args: never; Returns: string[] }
      business_record_email_valid: {
        Args: { p_email: string }
        Returns: boolean
      }
      business_record_fact_valid: {
        Args: { p_key: string; p_value: Json }
        Returns: boolean
      }
      business_record_sources: { Args: never; Returns: string[] }
      business_record_text_valid: {
        Args: { p_max: number; p_min: number; p_value: Json }
        Returns: boolean
      }
      business_record_time_valid: {
        Args: { p_value: Json }
        Returns: boolean
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
      export_workspace_snapshot: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      increment_site_metric: {
        Args: { p_day: string; p_metric: string; p_tenant_id: string }
        Returns: number
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
      preview_tenant_unlink: {
        Args: { p_operator_email: string; p_tenant_id: string }
        Returns: Json
      }
      prune_website_crawl_pages: { Args: never; Returns: number }
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
      read_business_contacts: {
        Args: {
          p_limit?: number
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
      read_existing_business_systems: {
        Args: {
          p_user_id: string
          p_verified_email: string
          p_workspace_id: string
        }
        Returns: Json
      }
      read_published_website_documents: {
        Args: { p_tenant_id?: string }
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
      read_tenant_leads: {
        Args: { p_before: string; p_limit: number; p_tenant_id: string }
        Returns: Json
      }
      read_tenant_workspace_link: {
        Args: { p_operator_email: string; p_tenant_id: string }
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
      record_tenant_lead: {
        Args: { p_lead: Json; p_tenant_id: string; p_via: string }
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
        Returns: string[]
      }
      resolve_business_owner_recipient: {
        Args: { p_workspace_id: string }
        Returns: Json
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
      site_metric_summary: {
        Args: { p_tenant_id: string; p_today: string }
        Returns: {
          last7: number
          metric: string
          prev7: number
          today: number
          total: number
        }[]
      }
      system_origin_id: {
        Args: { p_kind: string; p_ref: string; p_workspace_id: string }
        Returns: string
      }
      system_origin_kinds: { Args: never; Returns: string[] }
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
