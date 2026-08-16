-- Migration 035: provision the web-console quotation photo bucket.
-- The application stores metadata in quotation_photos (migrations 012/025)
-- and uploads bytes through the authenticated server route. This migration is
-- intentionally idempotent and is never applied by the web application.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-photos',
  'site-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The Next.js route uses the service role and applies the quotation ownership
-- check before every object/metadata mutation. Keep these policies restrictive
-- so a future client-side uploader cannot write outside its tenant folder.
DROP POLICY IF EXISTS "site_photos_service_role_insert" ON storage.objects;
CREATE POLICY "site_photos_service_role_insert"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'site-photos');

DROP POLICY IF EXISTS "site_photos_service_role_update" ON storage.objects;
CREATE POLICY "site_photos_service_role_update"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'site-photos')
  WITH CHECK (bucket_id = 'site-photos');

DROP POLICY IF EXISTS "site_photos_service_role_delete" ON storage.objects;
CREATE POLICY "site_photos_service_role_delete"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'site-photos');

COMMIT;
