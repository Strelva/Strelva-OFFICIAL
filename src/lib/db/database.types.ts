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
      app_is_super_admin: { Args: never; Returns: boolean }
      app_tenant_ids: { Args: never; Returns: string[] }
      app_tenant_stable_ids: { Args: never; Returns: string[] }
      increment_site_metric: {
        Args: { p_day: string; p_metric: string; p_tenant_id: string }
        Returns: number
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
