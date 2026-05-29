
-- Roles enum + table (separate from profiles to avoid privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  niche TEXT NOT NULL,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  posts_per_month INT NOT NULL DEFAULT 0,
  reels_per_month INT NOT NULL DEFAULT 0,
  stories_per_month INT NOT NULL DEFAULT 0,
  contract_months INT NOT NULL DEFAULT 3,
  contract_start DATE NOT NULL DEFAULT CURRENT_DATE,
  contract_end DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '3 months'),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT,
  body TEXT,
  cta TEXT,
  platform TEXT,
  content_type TEXT NOT NULL DEFAULT 'post',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  scheduled_date DATE NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Helper: client_id van huidige user
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.clients WHERE owner_user_id = auth.uid() LIMIT 1 $$;

-- RLS: profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles admin all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: user_roles (only admins manage; users can read own)
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles admin all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: clients
CREATE POLICY "clients admin all" ON public.clients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "clients owner read" ON public.clients FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

-- RLS: strategies
CREATE POLICY "strategies admin all" ON public.strategies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "strategies owner read" ON public.strategies FOR SELECT TO authenticated USING (client_id = public.current_client_id());

-- RLS: scripts
CREATE POLICY "scripts admin all" ON public.scripts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "scripts owner read" ON public.scripts FOR SELECT TO authenticated USING (client_id = public.current_client_id());

-- RLS: content_items
CREATE POLICY "content admin all" ON public.content_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "content owner read" ON public.content_items FOR SELECT TO authenticated USING (client_id = public.current_client_id());

-- RLS: events
CREATE POLICY "events admin all" ON public.events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "events owner read" ON public.events FOR SELECT TO authenticated USING (client_id = public.current_client_id());
