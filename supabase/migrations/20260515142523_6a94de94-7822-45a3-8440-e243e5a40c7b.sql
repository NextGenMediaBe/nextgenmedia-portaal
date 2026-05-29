
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'freelancer';
EXCEPTION WHEN others THEN NULL; END $$;

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, name text NOT NULL, description text, icon text,
  sort_order int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  slug text NOT NULL, name text NOT NULL, subtitle text, description text,
  price_type text NOT NULL DEFAULT 'fixed', base_price numeric(10,2),
  price_unit text, billing_cycle text,
  highlight boolean NOT NULL DEFAULT false, sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  features jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE TABLE public.package_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  group_label text, name text NOT NULL, description text,
  price_type text NOT NULL DEFAULT 'fixed', price numeric(10,2) NOT NULL DEFAULT 0,
  price_unit text, selection text NOT NULL DEFAULT 'optional',
  sort_order int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('QT-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  status text NOT NULL DEFAULT 'new',
  company_name text, contact_name text NOT NULL, email text NOT NULL,
  phone text, vat_number text, message text,
  estimated_total numeric(12,2) NOT NULL DEFAULT 0,
  estimated_monthly numeric(12,2) NOT NULL DEFAULT 0,
  admin_notes text, assigned_admin uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  package_snapshot jsonb NOT NULL,
  selected_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantity int NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  line_monthly numeric(12,2) NOT NULL DEFAULT 0,
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quote_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL, filename text NOT NULL,
  mime_type text, size_bytes int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.freelancer_role AS ENUM ('photographer','videographer','editor','designer','copywriter','developer','strategist','other');
CREATE TYPE public.freelancer_status AS ENUM ('pending','active','inactive');

CREATE TABLE public.freelancers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE, email text NOT NULL UNIQUE,
  full_name text NOT NULL, phone text,
  roles freelancer_role[] NOT NULL DEFAULT '{}',
  hourly_rate numeric(10,2), bio text, region text,
  status freelancer_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.freelancer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quote_requests(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  role freelancer_role NOT NULL,
  status text NOT NULL DEFAULT 'invited', notes text,
  scheduled_date date, estimated_hours numeric(6,2), agreed_rate numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_service_categories_updated BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_service_packages_updated BEFORE UPDATE ON public.service_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_quote_requests_updated BEFORE UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_freelancers_updated BEFORE UPDATE ON public.freelancers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelancer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog public read categories" ON public.service_categories FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "catalog public read packages" ON public.service_packages FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "catalog public read options" ON public.package_options FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "catalog admin all categories" ON public.service_categories FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "catalog admin all packages" ON public.service_packages FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "catalog admin all options" ON public.package_options FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "quotes admin all" ON public.quote_requests FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "quote items admin all" ON public.quote_items FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "quote uploads admin all" ON public.quote_uploads FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "freelancers admin all" ON public.freelancers FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "freelancers self read" ON public.freelancers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "freelancers self update" ON public.freelancers FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "freelancer assignments admin all" ON public.freelancer_assignments FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "freelancer assignments self read" ON public.freelancer_assignments FOR SELECT TO authenticated USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));
CREATE POLICY "freelancer assignments self update" ON public.freelancer_assignments FOR UPDATE TO authenticated USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

INSERT INTO storage.buckets (id, name, public) VALUES ('quote-uploads','quote-uploads',false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "quote uploads admin read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'quote-uploads' AND has_role(auth.uid(),'admin'));
CREATE POLICY "quote uploads public insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'quote-uploads');

INSERT INTO public.service_categories (slug, name, description, sort_order) VALUES
  ('websites','Websites','Onepagers, multipagers en custom platforms',1),
  ('social-media','Social Media Beheer','Volledig contentbeheer per maand',2),
  ('fotografie','Fotografie','Professionele foto shoots en bewerking',3),
  ('videografie','Videografie','Reels, bedrijfsvideos en montage',4);

WITH cat AS (SELECT id FROM public.service_categories WHERE slug='websites')
INSERT INTO public.service_packages (category_id, slug, name, subtitle, price_type, base_price, price_unit, billing_cycle, sort_order, features, highlight) VALUES
  ((SELECT id FROM cat),'onepager','De Onepager','1 pagina – snelle online aanwezigheid','fixed',1500,'eenmalig','one_time',1, '[{"label":"1 pagina","included":true},{"label":"Responsive design","included":true},{"label":"Hosting & domein optioneel","included":true}]'::jsonb, false),
  ((SELECT id FROM cat),'multipager','De Multipager','Tot 10 paginas – complete bedrijfssite','fixed',3200,'eenmalig','one_time',2, '[{"label":"Tot 10 paginas","included":true},{"label":"Responsive design","included":true},{"label":"SEO basis","included":true}]'::jsonb, true),
  ((SELECT id FROM cat),'custom','Custom Platform','Volledig op maat gebouwd','from',4500,'eenmalig','one_time',3, '[{"label":"Op maat","included":true},{"label":"Custom functionaliteiten","included":true},{"label":"Schaalbaar","included":true}]'::jsonb, false);

WITH op AS (SELECT id FROM public.service_packages WHERE slug='onepager')
INSERT INTO public.package_options (package_id, group_label, name, description, price_type, price, price_unit, selection, sort_order) VALUES
  ((SELECT id FROM op),'Onderhoud','Onderhoud Basic','Hosting + domeinnaam','monthly',30,'per maand','exclusive',1),
  ((SELECT id FROM op),'Onderhoud','Onderhoud Pro','Hosting + domein + klein onderhoud','monthly',60,'per maand','exclusive',2);

WITH op AS (SELECT id FROM public.service_packages WHERE slug='multipager')
INSERT INTO public.package_options (package_id, group_label, name, description, price_type, price, price_unit, selection, sort_order) VALUES
  ((SELECT id FROM op),'Onderhoud','Onderhoud Basic','Hosting + domeinnaam','monthly',40,'per maand','exclusive',1),
  ((SELECT id FROM op),'Onderhoud','Onderhoud Pro','Hosting + domein + klein onderhoud','monthly',80,'per maand','exclusive',2);

WITH op AS (SELECT id FROM public.service_packages WHERE slug='custom')
INSERT INTO public.package_options (package_id, group_label, name, description, price_type, price, price_unit, selection, sort_order) VALUES
  ((SELECT id FROM op),'Onderhoud','Onderhoud Basic','Hosting + domeinnaam','monthly',60,'per maand','exclusive',1),
  ((SELECT id FROM op),'Onderhoud','Onderhoud Pro','Hosting + domein + klein onderhoud','monthly',110,'per maand','exclusive',2);

WITH cat AS (SELECT id FROM public.service_categories WHERE slug='social-media')
INSERT INTO public.service_packages (category_id, slug, name, subtitle, price_type, base_price, price_unit, billing_cycle, sort_order, features, highlight) VALUES
  ((SELECT id FROM cat),'starter','Starter','Voor wie net begint','monthly',579,'per maand','monthly',1, '[{"label":"2 kanalen","included":true},{"label":"4 posts/maand","included":true},{"label":"Hergebruik stories","included":true},{"label":"Reels","included":false},{"label":"Copywriting","included":true},{"label":"Contentkalender","included":true},{"label":"Rapportering","included":true}]'::jsonb, false),
  ((SELECT id FROM cat),'groei','Groei','Bouw je community uit','monthly',979,'per maand','monthly',2, '[{"label":"3 kanalen","included":true},{"label":"6 posts/maand","included":true},{"label":"2 reels/maand","included":true},{"label":"+2 eigen stories","included":true},{"label":"Copywriting","included":true},{"label":"Contentkalender","included":true},{"label":"Rapportering","included":true}]'::jsonb, true),
  ((SELECT id FROM cat),'full-service','Full Service','Maximale impact','monthly',1479,'per maand','monthly',3, '[{"label":"4 kanalen","included":true},{"label":"8 posts/maand","included":true},{"label":"4 reels/maand","included":true},{"label":"+4 eigen stories","included":true},{"label":"Copywriting","included":true},{"label":"Contentkalender","included":true},{"label":"Rapportering","included":true}]'::jsonb, false);

WITH cat AS (SELECT id FROM public.service_categories WHERE slug='fotografie')
INSERT INTO public.service_packages (category_id, slug, name, subtitle, price_type, base_price, price_unit, billing_cycle, sort_order, features, highlight) VALUES
  ((SELECT id FROM cat),'foto-klein','Kleine shoot','1,5u shoot + 0,5u bewerking','from',215,'indicatief','one_time',1, '[{"label":"1,5 uur shoot","included":true},{"label":"0,5 uur bewerking","included":true}]'::jsonb, false),
  ((SELECT id FROM cat),'foto-groot','Grote shoot','3u shoot + 1,5u bewerking','from',450,'indicatief','one_time',2, '[{"label":"3 uur shoot","included":true},{"label":"1,5 uur bewerking","included":true}]'::jsonb, true),
  ((SELECT id FROM cat),'foto-uur','Op uurbasis','Volledig op maat','hourly',125,'per uur','hourly',3, '[{"label":"Shoot 125/uur","included":true},{"label":"Bewerking 50/uur","included":true},{"label":"Reistijd 0,40/km","included":true}]'::jsonb, false);

WITH cat AS (SELECT id FROM public.service_categories WHERE slug='videografie')
INSERT INTO public.service_packages (category_id, slug, name, subtitle, price_type, base_price, price_unit, billing_cycle, sort_order, features, highlight) VALUES
  ((SELECT id FROM cat),'social-reel','Social Reel','1u opname + 1,5u montage','from',240,'indicatief','one_time',1, '[{"label":"1 uur opname","included":true},{"label":"1,5 uur bewerking","included":true}]'::jsonb, true),
  ((SELECT id FROM cat),'bedrijfsvideo','Bedrijfsvideo','3u opname + 6u montage','from',825,'indicatief','one_time',2, '[{"label":"3 uur opname","included":true},{"label":"6 uur bewerking","included":true},{"label":"Kleurgrading & audio","included":true}]'::jsonb, false),
  ((SELECT id FROM cat),'video-uur','Op uurbasis','Volledig op maat','hourly',125,'per uur','hourly',3, '[{"label":"Opname 125/uur","included":true},{"label":"Bewerking 75/uur","included":true},{"label":"Reistijd 0,40/km","included":true}]'::jsonb, false);
