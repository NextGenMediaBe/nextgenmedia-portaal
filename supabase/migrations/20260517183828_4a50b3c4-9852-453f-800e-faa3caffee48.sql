
CREATE TYPE public.signing_status AS ENUM ('draft','sent','viewed','signed','expired','cancelled');
CREATE TYPE public.contract_event_type AS ENUM ('created','sent','viewed','signed','downloaded','cancelled','reminded');

CREATE TABLE public.terms_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX terms_only_one_current ON public.terms_versions ((is_current)) WHERE is_current = true;
ALTER TABLE public.terms_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terms admin all" ON public.terms_versions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "terms auth read" ON public.terms_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms_version_id UUID REFERENCES public.terms_versions(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates admin all" ON public.contract_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status public.signing_status NOT NULL DEFAULT 'draft',
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_html TEXT NOT NULL,
  terms_version_id UUID REFERENCES public.terms_versions(id) ON DELETE SET NULL,
  pdf_path TEXT,
  access_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  token_expires_at TIMESTAMPTZ,
  signer_name TEXT,
  signer_email TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contracts_client_idx ON public.contracts(client_id);
CREATE INDEX contracts_status_idx ON public.contracts(status);
CREATE INDEX contracts_token_idx ON public.contracts(access_token);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts admin all" ON public.contracts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "contracts owner read" ON public.contracts FOR SELECT TO authenticated
  USING (client_id = current_client_id());
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signature_data TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signatures_contract_idx ON public.contract_signatures(contract_id);
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signatures admin all" ON public.contract_signatures FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "signatures owner read" ON public.contract_signatures FOR SELECT TO authenticated
  USING (contract_id IN (SELECT id FROM public.contracts WHERE client_id = current_client_id()));

CREATE TABLE public.contract_terms_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  terms_version_id UUID NOT NULL REFERENCES public.terms_versions(id),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_ip TEXT
);
ALTER TABLE public.contract_terms_acceptance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tos accept admin all" ON public.contract_terms_acceptance FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "tos accept owner read" ON public.contract_terms_acceptance FOR SELECT TO authenticated
  USING (contract_id IN (SELECT id FROM public.contracts WHERE client_id = current_client_id()));

CREATE TABLE public.contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event_type public.contract_event_type NOT NULL,
  actor_email TEXT,
  ip TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_contract_idx ON public.contract_events(contract_id, created_at DESC);
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events admin all" ON public.contract_events FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "events owner read" ON public.contract_events FOR SELECT TO authenticated
  USING (contract_id IN (SELECT id FROM public.contracts WHERE client_id = current_client_id()));

INSERT INTO storage.buckets (id, name, public) VALUES ('contracts','contracts', false)
  ON CONFLICT (id) DO NOTHING;
CREATE POLICY "contracts bucket admin all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'contracts' AND has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'contracts' AND has_role(auth.uid(),'admin'));

INSERT INTO public.terms_versions (version, title, content, is_current) VALUES
('v1.0','Algemene Voorwaarden v1.0',
'<h2>Algemene Voorwaarden</h2><p>Deze algemene voorwaarden zijn van toepassing op alle overeenkomsten tussen opdrachtgever en NextGenMedia.</p><h3>1. Toepasselijkheid</h3><p>Door ondertekening van het contract verklaart de opdrachtgever akkoord te gaan met deze voorwaarden.</p><h3>2. Betaling</h3><p>Facturen dienen binnen 14 dagen na factuurdatum voldaan te worden.</p><h3>3. Opzegging</h3><p>Opzegging dient schriftelijk te gebeuren met inachtneming van de contractuele opzegtermijn.</p><h3>4. Aansprakelijkheid</h3><p>De aansprakelijkheid van NextGenMedia is beperkt tot het factuurbedrag van de betreffende opdracht.</p><h3>5. Toepasselijk recht</h3><p>Op deze overeenkomst is Belgisch recht van toepassing.</p>',
true);

INSERT INTO public.contract_templates (name, slug, description, category, body, variables, terms_version_id) VALUES
('Social Media Contract','social-media','Maandelijkse social media beheer overeenkomst','social-media',
'<h1>Social Media Beheer Overeenkomst</h1><p>Tussen <strong>NextGenMedia</strong> en <strong>{{company_name}}</strong>, vertegenwoordigd door {{client_name}} ({{email}}).</p><h2>Opdracht</h2><p>Maandelijks beheer van social media kanalen vanaf {{start_date}} tot {{end_date}}.</p><h2>Vergoeding</h2><p>Maandelijkse retainer van € {{price}}. {{payment_terms}}</p><h2>Deliverables</h2><p>{{deliverables}}</p><h2>Jurisdictie</h2><p>{{jurisdiction}}</p><p>Datum: {{today_date}}</p>',
'[{"name":"company_name","label":"Bedrijfsnaam","type":"text","required":true},{"name":"client_name","label":"Contactpersoon","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"start_date","label":"Startdatum","type":"date","required":true},{"name":"end_date","label":"Einddatum","type":"date","required":true},{"name":"price","label":"Maandbedrag (€)","type":"number","required":true},{"name":"payment_terms","label":"Betalingsvoorwaarden","type":"text","required":false,"default":"Maandelijks factureerbaar, te voldoen binnen 14 dagen."},{"name":"deliverables","label":"Deliverables","type":"textarea","required":true},{"name":"jurisdiction","label":"Jurisdictie","type":"text","required":false,"default":"België"}]'::jsonb,
(SELECT id FROM public.terms_versions WHERE version='v1.0')),

('Marketing Retainer','marketing-retainer','Maandelijkse marketing consultancy retainer','consultancy',
'<h1>Marketing Retainer Overeenkomst</h1><p>Tussen NextGenMedia en {{company_name}}, vertegenwoordigd door {{client_name}}.</p><h2>Scope</h2><p>{{deliverables}}</p><h2>Duur en vergoeding</h2><p>Periode: {{start_date}} – {{end_date}}. Maandelijks bedrag: € {{price}}.</p><p>{{payment_terms}}</p><p>Datum: {{today_date}}</p>',
'[{"name":"company_name","label":"Bedrijfsnaam","type":"text","required":true},{"name":"client_name","label":"Contactpersoon","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"start_date","label":"Start","type":"date","required":true},{"name":"end_date","label":"Einde","type":"date","required":true},{"name":"price","label":"Maandbedrag (€)","type":"number","required":true},{"name":"deliverables","label":"Scope / Deliverables","type":"textarea","required":true},{"name":"payment_terms","label":"Betalingsvoorwaarden","type":"text","required":false,"default":"Maandelijks vooraf factureerbaar."}]'::jsonb,
(SELECT id FROM public.terms_versions WHERE version='v1.0')),

('Webdesign Overeenkomst','webdesign-agreement','Eenmalig webdesign project','webdesign',
'<h1>Webdesign Overeenkomst</h1><p>Opdrachtgever: {{company_name}} ({{client_name}}, {{email}}).</p><h2>Project</h2><p>{{deliverables}}</p><h2>Planning</h2><p>Startdatum: {{start_date}} — verwachte oplevering: {{end_date}}.</p><h2>Investering</h2><p>Totaalprijs: € {{price}}. {{payment_terms}}</p><p>Datum: {{today_date}}</p>',
'[{"name":"company_name","label":"Bedrijfsnaam","type":"text","required":true},{"name":"client_name","label":"Contactpersoon","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"start_date","label":"Startdatum","type":"date","required":true},{"name":"end_date","label":"Opleverdatum","type":"date","required":true},{"name":"price","label":"Totaalprijs (€)","type":"number","required":true},{"name":"deliverables","label":"Project scope","type":"textarea","required":true},{"name":"payment_terms","label":"Betaling","type":"text","required":false,"default":"50% bij start, 50% bij oplevering."}]'::jsonb,
(SELECT id FROM public.terms_versions WHERE version='v1.0')),

('Geheimhoudingsverklaring (NDA)','nda','Wederzijdse geheimhouding','legal',
'<h1>Non-Disclosure Agreement</h1><p>Tussen NextGenMedia en <strong>{{company_name}}</strong>, vertegenwoordigd door {{client_name}} ({{email}}).</p><h2>Vertrouwelijkheid</h2><p>Beide partijen verbinden zich tot strikte geheimhouding van alle uitgewisselde informatie.</p><h2>Duur</h2><p>Deze NDA geldt vanaf {{start_date}} en blijft van kracht tot {{end_date}}.</p><h2>Jurisdictie</h2><p>{{jurisdiction}}</p><p>Datum: {{today_date}}</p>',
'[{"name":"company_name","label":"Bedrijfsnaam","type":"text","required":true},{"name":"client_name","label":"Contactpersoon","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"start_date","label":"Ingangsdatum","type":"date","required":true},{"name":"end_date","label":"Einddatum","type":"date","required":true},{"name":"jurisdiction","label":"Jurisdictie","type":"text","required":false,"default":"België"}]'::jsonb,
(SELECT id FROM public.terms_versions WHERE version='v1.0')),

('Freelance Overeenkomst','freelance','Overeenkomst met externe freelancer','freelance',
'<h1>Freelance Overeenkomst</h1><p>Tussen NextGenMedia en {{client_name}} ({{email}}).</p><h2>Opdracht</h2><p>{{deliverables}}</p><h2>Periode</h2><p>Van {{start_date}} tot {{end_date}}.</p><h2>Vergoeding</h2><p>Totaalbedrag: € {{price}}. {{payment_terms}}</p><p>Datum: {{today_date}}</p>',
'[{"name":"client_name","label":"Freelancer naam","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"start_date","label":"Start","type":"date","required":true},{"name":"end_date","label":"Einde","type":"date","required":true},{"name":"price","label":"Totaalvergoeding (€)","type":"number","required":true},{"name":"deliverables","label":"Opdrachtomschrijving","type":"textarea","required":true},{"name":"payment_terms","label":"Betaling","type":"text","required":false,"default":"Te factureren na oplevering, betaling binnen 30 dagen."}]'::jsonb,
(SELECT id FROM public.terms_versions WHERE version='v1.0')),

('Influencer Overeenkomst','influencer','Samenwerkingscontract met influencer','marketing',
'<h1>Influencer Samenwerking</h1><p>Tussen NextGenMedia (namens {{company_name}}) en {{client_name}} ({{email}}).</p><h2>Campagne</h2><p>{{deliverables}}</p><h2>Periode en vergoeding</h2><p>Campagne loopt van {{start_date}} tot {{end_date}}. Vergoeding: € {{price}}.</p><p>{{payment_terms}}</p><p>Datum: {{today_date}}</p>',
'[{"name":"company_name","label":"Merk / Adverteerder","type":"text","required":true},{"name":"client_name","label":"Influencer","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"start_date","label":"Start campagne","type":"date","required":true},{"name":"end_date","label":"Einde campagne","type":"date","required":true},{"name":"price","label":"Vergoeding (€)","type":"number","required":true},{"name":"deliverables","label":"Verwachte content","type":"textarea","required":true},{"name":"payment_terms","label":"Betaling","type":"text","required":false,"default":"Te voldoen binnen 30 dagen na publicatie."}]'::jsonb,
(SELECT id FROM public.terms_versions WHERE version='v1.0'));
