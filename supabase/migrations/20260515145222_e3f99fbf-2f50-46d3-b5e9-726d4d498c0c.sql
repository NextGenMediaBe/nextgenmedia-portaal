
-- 1. Add 'client' enum value if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'app_role'::regtype AND enumlabel = 'client') THEN
    ALTER TYPE app_role ADD VALUE 'client';
  END IF;
END $$;

-- 2. Extend quote_requests
ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS client_user_id uuid,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS step_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_estimate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_monthly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_visible_total numeric,
  ADD COLUMN IF NOT EXISTS client_visible_monthly numeric,
  ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS planning_notes text,
  ADD COLUMN IF NOT EXISTS scheduled_start date;

CREATE INDEX IF NOT EXISTS idx_quote_requests_client_user ON public.quote_requests(client_user_id);

-- 3. RLS — clients see only their own quote requests
DROP POLICY IF EXISTS "quote_requests_client_read" ON public.quote_requests;
CREATE POLICY "quote_requests_client_read" ON public.quote_requests
FOR SELECT TO authenticated
USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS "quote_requests_client_insert" ON public.quote_requests;
CREATE POLICY "quote_requests_client_insert" ON public.quote_requests
FOR INSERT TO authenticated
WITH CHECK (client_user_id = auth.uid());

-- 4. quote_uploads — allow client to read their own uploads
DROP POLICY IF EXISTS "quote_uploads_client_read" ON public.quote_uploads;
CREATE POLICY "quote_uploads_client_read" ON public.quote_uploads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quote_requests q
    WHERE q.id = quote_uploads.quote_id AND q.client_user_id = auth.uid()
  )
);

-- 5. quote_items — clients see their own items only AFTER admin sent the quote
DROP POLICY IF EXISTS "quote_items_client_read_after_send" ON public.quote_items;
CREATE POLICY "quote_items_client_read_after_send" ON public.quote_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quote_requests q
    WHERE q.id = quote_items.quote_id
      AND q.client_user_id = auth.uid()
      AND q.quote_sent_at IS NOT NULL
  )
);

-- 6. Storage policy: allow authenticated client to upload to their own folder
DO $$ BEGIN
  -- public bucket policies
  CREATE POLICY "quote-uploads client upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'quote-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "quote-uploads client read own"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'quote-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Service intake templates
CREATE TABLE IF NOT EXISTS public.service_intake_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_intake_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intake templates auth read" ON public.service_intake_templates;
CREATE POLICY "intake templates auth read" ON public.service_intake_templates
FOR SELECT TO authenticated USING (active = true);

DROP POLICY IF EXISTS "intake templates admin all" ON public.service_intake_templates;
CREATE POLICY "intake templates admin all" ON public.service_intake_templates
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 8. Seed intake templates for the 5 core services
INSERT INTO public.service_intake_templates (service_slug, label, description, sort_order, steps) VALUES
('webdesign', 'Webdesign', 'Website, webshop of platform op maat', 1, '[
  {"id":"type","title":"Type project","fields":[{"key":"site_type","label":"Wat heb je nodig?","type":"radio","options":["Onepager","Multipager website","Webshop","Custom platform/dashboard"],"required":true}]},
  {"id":"functions","title":"Gewenste functionaliteiten","fields":[{"key":"features","label":"Selecteer alles wat van toepassing is","type":"checkboxes","options":["CRM","SEO","Boekingssysteem","Webshop","Dashboard","Meertaligheid","Blog","Klantenlogin","Live chat","API-integraties"]}]},
  {"id":"scope","title":"Omvang","fields":[{"key":"pages","label":"Geschat aantal paginas","type":"number"},{"key":"languages","label":"Aantal talen","type":"number"}]},
  {"id":"uploads","title":"Bestanden","fields":[{"key":"uploads","label":"Briefing, huisstijl, referenties","type":"uploads"}]},
  {"id":"planning","title":"Planning","fields":[{"key":"deadline","label":"Gewenste lanceerdatum","type":"date"},{"key":"urgency","label":"Urgentie","type":"radio","options":["Geen haast","Standaard","Spoed"]}]},
  {"id":"notes","title":"Opmerkingen","fields":[{"key":"notes","label":"Extra info","type":"textarea"}]}
]'::jsonb),
('fotografie', 'Fotografie', 'Bedrijfsfotografie, productshoots, events', 2, '[
  {"id":"type","title":"Type shoot","fields":[{"key":"shoot_type","label":"Wat wil je laten fotograferen?","type":"radio","options":["Bedrijfsportret","Productfotografie","Event","Locatie","Andere"],"required":true}]},
  {"id":"scope","title":"Omvang","fields":[{"key":"hours","label":"Geschatte duur (uren)","type":"number"},{"key":"deliverables","label":"Aantal eindbeelden","type":"number"},{"key":"locations","label":"Aantal locaties","type":"number"}]},
  {"id":"extras","title":"Extras","fields":[{"key":"extras","label":"Selecteer wat van toepassing is","type":"checkboxes","options":["Retouching","Drone","Studio","Make-up","Models"]}]},
  {"id":"uploads","title":"Bestanden","fields":[{"key":"uploads","label":"Moodboard, referenties","type":"uploads"}]},
  {"id":"planning","title":"Planning","fields":[{"key":"deadline","label":"Gewenste shootdatum","type":"date"}]},
  {"id":"notes","title":"Opmerkingen","fields":[{"key":"notes","label":"Extra info","type":"textarea"}]}
]'::jsonb),
('videografie', 'Videografie', 'Reels, bedrijfsvideos, commercials', 3, '[
  {"id":"type","title":"Type video","fields":[{"key":"video_type","label":"Wat heb je nodig?","type":"radio","options":["Reel/Short","Bedrijfsvideo","Commercial","Aftermovie","Interview"],"required":true}]},
  {"id":"scope","title":"Omvang","fields":[{"key":"duration","label":"Lengte (seconden)","type":"number"},{"key":"versions","label":"Aantal varianten","type":"number"}]},
  {"id":"extras","title":"Productie-elementen","fields":[{"key":"extras","label":"Selecteer wat van toepassing is","type":"checkboxes","options":["Scriptwriting","Voice-over","Acteurs","Drone","Animatie/Motion","Ondertiteling"]}]},
  {"id":"uploads","title":"Bestanden","fields":[{"key":"uploads","label":"Briefing, referenties","type":"uploads"}]},
  {"id":"planning","title":"Planning","fields":[{"key":"deadline","label":"Gewenste opleverdatum","type":"date"}]},
  {"id":"notes","title":"Opmerkingen","fields":[{"key":"notes","label":"Extra info","type":"textarea"}]}
]'::jsonb),
('social-media', 'Social Media Beheer', 'Maandelijkse contentcreatie en planning', 4, '[
  {"id":"type","title":"Pakket","fields":[{"key":"package","label":"Welk niveau zoek je?","type":"radio","options":["Starter","Groei","Premium"],"required":true}]},
  {"id":"channels","title":"Platforms","fields":[{"key":"platforms","label":"Selecteer platforms","type":"checkboxes","options":["Instagram","TikTok","LinkedIn","Facebook","YouTube"]}]},
  {"id":"volume","title":"Volume","fields":[{"key":"posts","label":"Posts per maand","type":"number"},{"key":"reels","label":"Reels per maand","type":"number"},{"key":"stories","label":"Stories per maand","type":"number"}]},
  {"id":"uploads","title":"Bestanden","fields":[{"key":"uploads","label":"Huisstijl, beeldbank, referenties","type":"uploads"}]},
  {"id":"planning","title":"Start","fields":[{"key":"deadline","label":"Gewenste startdatum","type":"date"}]},
  {"id":"notes","title":"Opmerkingen","fields":[{"key":"notes","label":"Extra info","type":"textarea"}]}
]'::jsonb),
('branding', 'Branding & Identiteit', 'Logo, huisstijl, brand guidelines', 5, '[
  {"id":"type","title":"Scope","fields":[{"key":"branding_type","label":"Wat heb je nodig?","type":"radio","options":["Enkel logo","Logo + huisstijl","Volledige rebranding","Brand guidelines"],"required":true}]},
  {"id":"deliverables","title":"Onderdelen","fields":[{"key":"items","label":"Wat moet er opgeleverd worden?","type":"checkboxes","options":["Logo","Visitekaartjes","Briefpapier","Social templates","Pitch deck","Brand book","Iconenset","Patterns"]}]},
  {"id":"uploads","title":"Bestanden","fields":[{"key":"uploads","label":"Inspiratie, oude logos","type":"uploads"}]},
  {"id":"planning","title":"Planning","fields":[{"key":"deadline","label":"Gewenste opleverdatum","type":"date"}]},
  {"id":"notes","title":"Opmerkingen","fields":[{"key":"notes","label":"Extra info","type":"textarea"}]}
]'::jsonb)
ON CONFLICT (service_slug) DO NOTHING;
