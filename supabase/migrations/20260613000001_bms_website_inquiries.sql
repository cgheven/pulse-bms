-- ============================================================
-- bms_website_inquiries
-- Stores website contact/demo-request form submissions from
-- the public /pricing page. Submitted anonymously (anon role).
-- ============================================================

CREATE TABLE IF NOT EXISTS bms_website_inquiries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  president_name   text        NOT NULL,
  building_name    text        NOT NULL,
  city             text,
  num_flats        integer     NOT NULL,
  package          text        NOT NULL,  -- 'starter' | 'standard' | 'professional' | 'enterprise'
  phone            text        NOT NULL,
  whatsapp         text,                  -- nullable; leave blank if same as phone
  contact_timing   text,                  -- e.g. "9am–6pm weekdays"
  starting_date    date,
  message          text,
  status           text        NOT NULL DEFAULT 'new', -- 'new' | 'contacted' | 'converted'
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE bms_website_inquiries ENABLE ROW LEVEL SECURITY;

-- Policy 1: anonymous users may INSERT (public form submission)
CREATE POLICY "anon_insert_website_inquiries"
  ON bms_website_inquiries
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy 2: super_admin has full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "super_admin_all_website_inquiries"
  ON bms_website_inquiries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM bms_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bms_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Index for the admin list view (filter by status, ordered by newest first)
CREATE INDEX idx_bms_website_inquiries_status_created
  ON bms_website_inquiries (status, created_at DESC);
