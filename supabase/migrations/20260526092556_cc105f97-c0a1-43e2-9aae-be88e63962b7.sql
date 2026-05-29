
ALTER TABLE public.webdesign_change_requests
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS text_changes text,
  ADD COLUMN IF NOT EXISTS color_changes text,
  ADD COLUMN IF NOT EXISTS image_notes text,
  ADD COLUMN IF NOT EXISTS other_notes text,
  ADD COLUMN IF NOT EXISTS pages_count integer,
  ADD COLUMN IF NOT EXISTS extra_features text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('webdesign-uploads', 'webdesign-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "webdesign uploads client upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'webdesign-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.clients WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "webdesign uploads client read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'webdesign-uploads'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.clients WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "webdesign uploads admin all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'webdesign-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'webdesign-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));
