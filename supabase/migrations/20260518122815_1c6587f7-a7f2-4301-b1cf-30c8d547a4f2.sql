
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending' AND enumtypid = 'contract_status'::regtype) THEN
    ALTER TYPE contract_status ADD VALUE 'pending';
  END IF;
END $$;
