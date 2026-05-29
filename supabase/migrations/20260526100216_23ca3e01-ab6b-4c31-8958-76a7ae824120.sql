
CREATE TABLE IF NOT EXISTS public.partner_inbound_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  title text NOT NULL,
  service_type text NOT NULL,
  description text,
  budget numeric,
  desired_deadline date,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  partner_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_inbound_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_inbound admin all"
ON public.partner_inbound_requests
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "partner_inbound partner read own"
ON public.partner_inbound_requests
FOR SELECT TO authenticated
USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE POLICY "partner_inbound partner insert own"
ON public.partner_inbound_requests
FOR INSERT TO authenticated
WITH CHECK (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_partner_inbound_updated
BEFORE UPDATE ON public.partner_inbound_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_partner_inbound_freelancer ON public.partner_inbound_requests(freelancer_id);
CREATE INDEX idx_partner_inbound_status ON public.partner_inbound_requests(status);
