export type AppRole = 'admin' | 'client' | 'freelancer'

export type SocialContentStatus =
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'changes_requested'
  | 'scheduled'
  | 'published'

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'cancelled'

export type AssignmentStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface Client {
  id: string
  owner_user_id: string | null
  company_name: string
  contact_name: string | null
  email: string | null
  website_url: string | null
  niche: string | null
  revenue_value: number | null
  revenue_type: 'recurring' | 'one_off' | null
  created_at: string
}

export interface ClientService {
  id: string
  client_id: string
  service_slug: string
  config: Record<string, unknown>
  active: boolean
  created_at: string
}

export interface ServiceContract {
  id: string
  client_id: string
  service_slug: string
  start_date: string | null
  duration_months: number | null
  end_date: string | null
  created_at: string
}

export interface Contract {
  id: string
  client_id: string | null
  title: string
  status: ContractStatus
  pdf_path: string | null
  access_token: string
  signer_name: string | null
  signer_email: string | null
  sent_at: string | null
  signed_at: string | null
  created_at: string
}

export interface ContractSignature {
  id: string
  contract_id: string
  signer_name: string
  signer_email: string
  signer_phone: string | null
  signer_address: string | null
  signer_vat: string | null
  signature_url: string | null
  signed_at: string
}

export interface ContractEvent {
  id: string
  contract_id: string
  event_type: string
  description: string | null
  created_at: string
}

export interface SocialContentItem {
  id: string
  client_id: string
  title: string
  body: string | null
  platform: string | null
  content_type: string | null
  status: SocialContentStatus
  scheduled_date: string | null
  planned_date: string | null
  caption: string | null
  script: string | null
  media_notes: string | null
  client_feedback: string | null
  reviewed_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string | null
}

export interface Partner {
  id: string
  user_id: string | null
  email: string
  name: string
  company: string | null
  phone: string | null
  vat_number: string | null
  roles: string[]
  hourly_rate: number | null
  commission_pct: number
  region: string | null
  active: boolean
  created_at: string
}

export interface Assignment {
  id: string
  freelancer_id: string | null
  client_id: string | null
  title: string
  description: string | null
  service_slug: string | null
  status: AssignmentStatus
  budget: number | null
  payout: number | null
  deadline: string | null
  created_at: string
}

export interface WebdesignChangeRequest {
  id: string
  client_id: string
  title: string
  description: string | null
  kind: string
  status: string
  image_urls: string[]
  admin_notes: string | null
  created_at: string
  updated_at: string | null
}

export interface UserRole {
  id: string
  user_id: string
  role: AppRole
  created_at: string
}

type R = []  // empty Relationships

// Supabase Database type — must match actual DB schema
export type Database = {
  public: {
    Tables: {
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client>; Relationships: R }
      client_services: { Row: ClientService; Insert: Partial<ClientService>; Update: Partial<ClientService>; Relationships: R }
      service_contracts: { Row: ServiceContract; Insert: Partial<ServiceContract>; Update: Partial<ServiceContract>; Relationships: R }
      contracts: { Row: Contract; Insert: Partial<Contract>; Update: Partial<Contract>; Relationships: R }
      contract_signatures: { Row: ContractSignature; Insert: Partial<ContractSignature>; Update: Partial<ContractSignature>; Relationships: R }
      contract_events: { Row: ContractEvent; Insert: Partial<ContractEvent>; Update: Partial<ContractEvent>; Relationships: R }
      social_content_items: { Row: SocialContentItem; Insert: Partial<SocialContentItem>; Update: Partial<SocialContentItem>; Relationships: R }
      freelancers: { Row: Partner; Insert: Partial<Partner>; Update: Partial<Partner>; Relationships: R }
      freelancer_assignments: { Row: Assignment; Insert: Partial<Assignment>; Update: Partial<Assignment>; Relationships: R }
      webdesign_change_requests: { Row: WebdesignChangeRequest; Insert: Partial<WebdesignChangeRequest>; Update: Partial<WebdesignChangeRequest>; Relationships: R }
      user_roles: { Row: UserRole; Insert: Partial<UserRole>; Update: Partial<UserRole>; Relationships: R }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
