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
      client_services: {
        Row: {
          active: boolean
          client_id: string
          config: Json
          created_at: string
          id: string
          service_slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id: string
          config?: Json
          created_at?: string
          id?: string
          service_slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string
          config?: Json
          created_at?: string
          id?: string
          service_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived: boolean
          company_name: string
          contract_end: string
          contract_months: number
          contract_start: string
          created_at: string
          generation_status: string
          id: string
          live_start_date: string | null
          niche: string
          owner_user_id: string | null
          platforms: string[]
          posts_per_month: number
          reels_per_month: number
          status: string
          stories_per_month: number
          website_url: string | null
        }
        Insert: {
          archived?: boolean
          company_name: string
          contract_end?: string
          contract_months?: number
          contract_start?: string
          created_at?: string
          generation_status?: string
          id?: string
          live_start_date?: string | null
          niche: string
          owner_user_id?: string | null
          platforms?: string[]
          posts_per_month?: number
          reels_per_month?: number
          status?: string
          stories_per_month?: number
          website_url?: string | null
        }
        Update: {
          archived?: boolean
          company_name?: string
          contract_end?: string
          contract_months?: number
          contract_start?: string
          created_at?: string
          generation_status?: string
          id?: string
          live_start_date?: string | null
          niche?: string
          owner_user_id?: string | null
          platforms?: string[]
          posts_per_month?: number
          reels_per_month?: number
          status?: string
          stories_per_month?: number
          website_url?: string | null
        }
        Relationships: []
      }
      contract_events: {
        Row: {
          actor_email: string | null
          contract_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["contract_event_type"]
          id: string
          ip: string | null
          meta: Json
        }
        Insert: {
          actor_email?: string | null
          contract_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["contract_event_type"]
          id?: string
          ip?: string | null
          meta?: Json
        }
        Update: {
          actor_email?: string | null
          contract_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["contract_event_type"]
          id?: string
          ip?: string | null
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_service_contracts: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          service_contract_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          service_contract_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          service_contract_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_service_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_service_contracts_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          contract_id: string
          id: string
          ip_address: string | null
          signature_data: string
          signed_at: string
          signer_email: string
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          contract_id: string
          id?: string
          ip_address?: string | null
          signature_data: string
          signed_at?: string
          signer_email: string
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          contract_id?: string
          id?: string
          ip_address?: string | null
          signature_data?: string
          signed_at?: string
          signer_email?: string
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          access_token: string
          client_id: string | null
          confirmation_pdf_path: string | null
          created_at: string
          created_by: string | null
          id: string
          pdf_path: string | null
          rendered_html: string | null
          sent_at: string | null
          service_contract_id: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signer_data: Json
          signer_email: string | null
          signer_name: string | null
          status: Database["public"]["Enums"]["signing_status"]
          title: string
          token_expires_at: string | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          access_token?: string
          client_id?: string | null
          confirmation_pdf_path?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_path?: string | null
          rendered_html?: string | null
          sent_at?: string | null
          service_contract_id?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_data?: Json
          signer_email?: string | null
          signer_name?: string | null
          status?: Database["public"]["Enums"]["signing_status"]
          title: string
          token_expires_at?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          access_token?: string
          client_id?: string | null
          confirmation_pdf_path?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_path?: string | null
          rendered_html?: string | null
          sent_at?: string | null
          service_contract_id?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_data?: Json
          signer_email?: string | null
          signer_name?: string | null
          status?: Database["public"]["Enums"]["signing_status"]
          title?: string
          token_expires_at?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      design_intakes: {
        Row: {
          audience: string | null
          client_id: string
          colors: string | null
          competitors: string | null
          created_at: string
          goals: string | null
          id: string
          inspirations: string | null
          mission: string | null
          references: string | null
          service_contract_id: string | null
          status: string
          style: string | null
          updated_at: string
        }
        Insert: {
          audience?: string | null
          client_id: string
          colors?: string | null
          competitors?: string | null
          created_at?: string
          goals?: string | null
          id?: string
          inspirations?: string | null
          mission?: string | null
          references?: string | null
          service_contract_id?: string | null
          status?: string
          style?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string | null
          client_id?: string
          colors?: string | null
          competitors?: string | null
          created_at?: string
          goals?: string | null
          id?: string
          inspirations?: string | null
          mission?: string | null
          references?: string | null
          service_contract_id?: string | null
          status?: string
          style?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      freelancer_assignments: {
        Row: {
          agreed_rate: number | null
          budget: number | null
          claimed_at: string | null
          client_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          estimated_hours: number | null
          freelancer_id: string | null
          id: string
          notes: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          roles: Database["public"]["Enums"]["freelancer_role"][]
          scheduled_date: string | null
          service_contract_id: string | null
          status: string
          title: string | null
        }
        Insert: {
          agreed_rate?: number | null
          budget?: number | null
          claimed_at?: string | null
          client_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          estimated_hours?: number | null
          freelancer_id?: string | null
          id?: string
          notes?: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          roles?: Database["public"]["Enums"]["freelancer_role"][]
          scheduled_date?: string | null
          service_contract_id?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          agreed_rate?: number | null
          budget?: number | null
          claimed_at?: string | null
          client_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          estimated_hours?: number | null
          freelancer_id?: string | null
          id?: string
          notes?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"]
          roles?: Database["public"]["Enums"]["freelancer_role"][]
          scheduled_date?: string | null
          service_contract_id?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_assignments_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_assignments_service_contract_id_fkey"
            columns: ["service_contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancers: {
        Row: {
          bio: string | null
          company_name: string | null
          created_at: string
          default_commission_pct: number | null
          email: string
          full_name: string
          hourly_rate: number | null
          iban: string | null
          id: string
          metadata: Json
          notes: string | null
          phone: string | null
          region: string | null
          roles: Database["public"]["Enums"]["freelancer_role"][]
          status: Database["public"]["Enums"]["freelancer_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          company_name?: string | null
          created_at?: string
          default_commission_pct?: number | null
          email: string
          full_name: string
          hourly_rate?: number | null
          iban?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          region?: string | null
          roles?: Database["public"]["Enums"]["freelancer_role"][]
          status?: Database["public"]["Enums"]["freelancer_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          company_name?: string | null
          created_at?: string
          default_commission_pct?: number | null
          email?: string
          full_name?: string
          hourly_rate?: number | null
          iban?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          region?: string | null
          roles?: Database["public"]["Enums"]["freelancer_role"][]
          status?: Database["public"]["Enums"]["freelancer_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      package_options: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          group_label: string | null
          id: string
          metadata: Json
          name: string
          package_id: string
          price: number
          price_type: string
          price_unit: string | null
          selection: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          group_label?: string | null
          id?: string
          metadata?: Json
          name: string
          package_id: string
          price?: number
          price_type?: string
          price_unit?: string | null
          selection?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          group_label?: string | null
          id?: string
          metadata?: Json
          name?: string
          package_id?: string
          price?: number
          price_type?: string
          price_unit?: string | null
          selection?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_options_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_inbound_requests: {
        Row: {
          admin_notes: string | null
          attachments: Json
          budget: number | null
          created_at: string
          description: string | null
          desired_deadline: string | null
          freelancer_id: string
          id: string
          partner_notes: string | null
          service_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          attachments?: Json
          budget?: number | null
          created_at?: string
          description?: string | null
          desired_deadline?: string | null
          freelancer_id: string
          id?: string
          partner_notes?: string | null
          service_type: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          attachments?: Json
          budget?: number | null
          created_at?: string
          description?: string | null
          desired_deadline?: string | null
          freelancer_id?: string
          id?: string
          partner_notes?: string | null
          service_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_inbound_requests_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_ledger_entries: {
        Row: {
          amount: number
          assignment_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          freelancer_id: string
          id: string
          kind: Database["public"]["Enums"]["partner_ledger_kind"]
          metadata: Json
          occurred_on: string
          settlement_id: string | null
          status: Database["public"]["Enums"]["partner_ledger_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          freelancer_id: string
          id?: string
          kind: Database["public"]["Enums"]["partner_ledger_kind"]
          metadata?: Json
          occurred_on?: string
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["partner_ledger_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          freelancer_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["partner_ledger_kind"]
          metadata?: Json
          occurred_on?: string
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["partner_ledger_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_ledger_entries_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_settlements: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          freelancer_id: string
          id: string
          net_amount: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_owed_by_partner: number
          total_owed_to_partner: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          freelancer_id: string
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          total_owed_by_partner?: number
          total_owed_to_partner?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          freelancer_id?: string
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total_owed_by_partner?: number
          total_owed_to_partner?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_settlements_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "freelancers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_tasks: {
        Row: {
          assigned_freelancer_id: string | null
          client_id: string
          created_at: string
          deadline: string | null
          id: string
          notes: string | null
          scheduled_for: string | null
          service_contract_id: string | null
          social_content_item_id: string | null
          status: string
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          assigned_freelancer_id?: string | null
          client_id: string
          created_at?: string
          deadline?: string | null
          id?: string
          notes?: string | null
          scheduled_for?: string | null
          service_contract_id?: string | null
          social_content_item_id?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_freelancer_id?: string | null
          client_id?: string
          created_at?: string
          deadline?: string | null
          id?: string
          notes?: string | null
          scheduled_for?: string | null
          service_contract_id?: string | null
          social_content_item_id?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_contracts: {
        Row: {
          activated_at: string | null
          client_id: string
          config: Json
          created_at: string
          end_date: string | null
          hourly_rate: number | null
          hours_purchased: number | null
          hours_used: number | null
          id: string
          maintenance_included: boolean
          model: Database["public"]["Enums"]["contract_model"]
          monthly_fee: number | null
          notes: string | null
          renewal_reminder_at: string | null
          service_slug: string
          setup_fee: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          client_id: string
          config?: Json
          created_at?: string
          end_date?: string | null
          hourly_rate?: number | null
          hours_purchased?: number | null
          hours_used?: number | null
          id?: string
          maintenance_included?: boolean
          model: Database["public"]["Enums"]["contract_model"]
          monthly_fee?: number | null
          notes?: string | null
          renewal_reminder_at?: string | null
          service_slug: string
          setup_fee?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          client_id?: string
          config?: Json
          created_at?: string
          end_date?: string | null
          hourly_rate?: number | null
          hours_purchased?: number | null
          hours_used?: number | null
          id?: string
          maintenance_included?: boolean
          model?: Database["public"]["Enums"]["contract_model"]
          monthly_fee?: number | null
          notes?: string | null
          renewal_reminder_at?: string | null
          service_slug?: string
          setup_fee?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Relationships: []
      }
      service_intake_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          label: string
          service_slug: string
          sort_order: number
          steps: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          label: string
          service_slug: string
          sort_order?: number
          steps?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          service_slug?: string
          sort_order?: number
          steps?: Json
          updated_at?: string
        }
        Relationships: []
      }
      service_packages: {
        Row: {
          active: boolean
          base_price: number | null
          billing_cycle: string | null
          category_id: string
          created_at: string
          description: string | null
          features: Json
          highlight: boolean
          id: string
          metadata: Json
          name: string
          price_type: string
          price_unit: string | null
          slug: string
          sort_order: number
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price?: number | null
          billing_cycle?: string | null
          category_id: string
          created_at?: string
          description?: string | null
          features?: Json
          highlight?: boolean
          id?: string
          metadata?: Json
          name: string
          price_type?: string
          price_unit?: string | null
          slug: string
          sort_order?: number
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number | null
          billing_cycle?: string | null
          category_id?: string
          created_at?: string
          description?: string | null
          features?: Json
          highlight?: boolean
          id?: string
          metadata?: Json
          name?: string
          price_type?: string
          price_unit?: string | null
          slug?: string
          sort_order?: number
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      social_content_items: {
        Row: {
          caption: string | null
          client_feedback: string | null
          client_id: string
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          media_notes: string | null
          planned_date: string
          platform: string
          published_at: string | null
          reviewed_at: string | null
          script: string | null
          service_contract_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          client_feedback?: string | null
          client_id: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          media_notes?: string | null
          planned_date: string
          platform?: string
          published_at?: string | null
          reviewed_at?: string | null
          script?: string | null
          service_contract_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          client_feedback?: string | null
          client_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          media_notes?: string | null
          planned_date?: string
          platform?: string
          published_at?: string | null
          reviewed_at?: string | null
          script?: string | null
          service_contract_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webdesign_change_requests: {
        Row: {
          admin_notes: string | null
          attachments: Json
          categories: string[]
          client_id: string
          color_changes: string | null
          created_at: string
          description: string
          estimated_cost: number | null
          estimated_hours: number | null
          extra_features: string | null
          hourly_rate: number
          id: string
          image_notes: string | null
          kind: string
          other_notes: string | null
          pages_count: number | null
          service_contract_id: string | null
          status: string
          text_changes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          attachments?: Json
          categories?: string[]
          client_id: string
          color_changes?: string | null
          created_at?: string
          description: string
          estimated_cost?: number | null
          estimated_hours?: number | null
          extra_features?: string | null
          hourly_rate?: number
          id?: string
          image_notes?: string | null
          kind?: string
          other_notes?: string | null
          pages_count?: number | null
          service_contract_id?: string | null
          status?: string
          text_changes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          attachments?: Json
          categories?: string[]
          client_id?: string
          color_changes?: string | null
          created_at?: string
          description?: string
          estimated_cost?: number | null
          estimated_hours?: number | null
          extra_features?: string | null
          hourly_rate?: number
          id?: string
          image_notes?: string | null
          kind?: string
          other_notes?: string | null
          pages_count?: number | null
          service_contract_id?: string | null
          status?: string
          text_changes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      client_has_active_service: {
        Args: { _client_id: string; _service_slug: string }
        Returns: boolean
      }
      current_client_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client" | "freelancer"
      contract_event_type:
        | "created"
        | "sent"
        | "viewed"
        | "signed"
        | "downloaded"
        | "cancelled"
        | "reminded"
      contract_model:
        | "social_recurring"
        | "webdesign_project"
        | "webdesign_maintenance"
        | "consultancy_hours"
        | "design_project"
        | "ads_retainer"
        | "photo_video_project"
      contract_status:
        | "draft"
        | "active"
        | "paused"
        | "ended"
        | "pending_renewal"
        | "pending"
      freelancer_role:
        | "photographer"
        | "videographer"
        | "editor"
        | "designer"
        | "copywriter"
        | "developer"
        | "strategist"
        | "other"
      freelancer_status: "pending" | "active" | "inactive"
      partner_ledger_kind:
        | "payout_owed"
        | "commission_owed"
        | "service_billed"
        | "manual_credit"
        | "manual_debit"
        | "settlement"
      partner_ledger_status: "pending" | "settled" | "cancelled"
      signing_status:
        | "draft"
        | "sent"
        | "viewed"
        | "signed"
        | "expired"
        | "cancelled"
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
    Enums: {
      app_role: ["admin", "client", "freelancer"],
      contract_event_type: [
        "created",
        "sent",
        "viewed",
        "signed",
        "downloaded",
        "cancelled",
        "reminded",
      ],
      contract_model: [
        "social_recurring",
        "webdesign_project",
        "webdesign_maintenance",
        "consultancy_hours",
        "design_project",
        "ads_retainer",
        "photo_video_project",
      ],
      contract_status: [
        "draft",
        "active",
        "paused",
        "ended",
        "pending_renewal",
        "pending",
      ],
      freelancer_role: [
        "photographer",
        "videographer",
        "editor",
        "designer",
        "copywriter",
        "developer",
        "strategist",
        "other",
      ],
      freelancer_status: ["pending", "active", "inactive"],
      partner_ledger_kind: [
        "payout_owed",
        "commission_owed",
        "service_billed",
        "manual_credit",
        "manual_debit",
        "settlement",
      ],
      partner_ledger_status: ["pending", "settled", "cancelled"],
      signing_status: [
        "draft",
        "sent",
        "viewed",
        "signed",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
