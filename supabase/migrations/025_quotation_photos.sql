-- ============================================================================
-- Migration 025: quotation_photos — add missing columns
-- ============================================================================
-- The `quotation_photos` table was originally created in migration 012 with:
--   id, client_id, quotation_id, storage_path, public_url, caption,
--   width, height, bytes, created_at
--
-- This migration adds three columns requested in the v2 site-photo feature
-- spec WITHOUT breaking the existing Flutter app or RLS policies:
--   * filename  — original filename (human-readable; storage_path is the key)
--   * mime_type — e.g. 'image/jpeg', 'image/png'
--   * sort_order — user-definable display order (default 0 = append)
--
-- All statements are idempotent (IF NOT EXISTS / safe DO blocks).

-- ── Add `filename` column ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotation_photos'
      AND column_name  = 'filename'
  ) THEN
    ALTER TABLE public.quotation_photos
      ADD COLUMN filename text NOT NULL DEFAULT '';
  END IF;
END $$;

-- ── Add `mime_type` column ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotation_photos'
      AND column_name  = 'mime_type'
  ) THEN
    ALTER TABLE public.quotation_photos
      ADD COLUMN mime_type text NOT NULL DEFAULT 'image/jpeg';
  END IF;
END $$;

-- ── Add `sort_order` column ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quotation_photos'
      AND column_name  = 'sort_order'
  ) THEN
    ALTER TABLE public.quotation_photos
      ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── Index for sort_order queries ───────────────────────────────────────────────
-- The existing composite index (client_id, quotation_id, created_at DESC) is
-- still optimal for the main read pattern. This additional index supports
-- "reorder photos" operations if the UI adds drag-to-reorder later.
CREATE INDEX IF NOT EXISTS quotation_photos_sort_order_idx
  ON public.quotation_photos (quotation_id, sort_order);

COMMENT ON TABLE public.quotation_photos IS
  'Metadata index for site photos attached to a quotation. Bytes live in the '
  'Supabase Storage bucket `site-photos` at <client_id>/<quotation_id>/<uuid>.<ext>. '
  'storage_path is the durable key; public_url is a denormalised CDN URL cached '
  'to avoid a round-trip on the photo grid. filename/mime_type added in 025.';
