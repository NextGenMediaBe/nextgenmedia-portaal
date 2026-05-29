-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: archived clients, revenue entries, contract signature zone
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Soft-delete support on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_archived_at
  ON public.clients (archived_at);

-- 2. Revenue entries
CREATE TABLE IF NOT EXISTS public.revenue_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_slug     text,
  type             text NOT NULL CHECK (type IN ('recurring', 'one_time')),
  -- Recurring fields
  amount_per_month numeric(10,2),
  start_month      date,
  end_month        date,
  -- One-time fields
  amount           numeric(10,2),
  transaction_month date,
  -- Meta
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_entries_client
  ON public.revenue_entries (client_id);

CREATE INDEX IF NOT EXISTS idx_revenue_entries_type
  ON public.revenue_entries (type);

ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue admin all"
  ON public.revenue_entries FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 3. Contract signature zone columns
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS sig_page    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sig_x_pct   numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS sig_y_pct   numeric NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS sig_width   numeric NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS sig_height  numeric NOT NULL DEFAULT 60;
