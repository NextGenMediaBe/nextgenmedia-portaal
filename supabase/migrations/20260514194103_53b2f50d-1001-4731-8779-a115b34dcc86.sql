
-- Add website + archived + live_start tracking + script visual ideas
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_start_date date,
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'idle';

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS scenes jsonb,
  ADD COLUMN IF NOT EXISTS shot_ideas text,
  ADD COLUMN IF NOT EXISTS visual_idea text,
  ADD COLUMN IF NOT EXISTS concept text;

-- Allow content_items to be deleted with their script
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_script_id_fkey'
  ) THEN
    ALTER TABLE public.content_items
      ADD CONSTRAINT content_items_script_id_fkey
      FOREIGN KEY (script_id) REFERENCES public.scripts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update policies so client can read their own archived state too (already covered)
-- nothing else to change.
