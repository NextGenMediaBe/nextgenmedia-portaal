-- Add image_paths column to store storage paths separately from signed URLs
-- This allows regenerating signed URLs when they expire
ALTER TABLE public.webdesign_change_requests
  ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}';

-- Create webdesign-uploads bucket as public (fallback bucket, if not already using contracts bucket)
-- Note: if your Supabase project doesn't allow SQL bucket creation,
-- create this manually in the Supabase dashboard: Storage → New bucket → "webdesign-uploads" (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'webdesign-uploads',
  'webdesign-uploads',
  true,
  10485760, -- 10 MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users (clients) to upload to webdesign-uploads
CREATE POLICY IF NOT EXISTS "webdesign uploads insert authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'webdesign-uploads');

-- Allow anyone to view uploaded images (bucket is public)
CREATE POLICY IF NOT EXISTS "webdesign uploads select public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'webdesign-uploads');

-- Allow admins to delete images
CREATE POLICY IF NOT EXISTS "webdesign uploads delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'webdesign-uploads'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
