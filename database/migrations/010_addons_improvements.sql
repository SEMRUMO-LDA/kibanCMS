-- =============================================================
-- 010 — Add-on improvements
--
-- IDEMPOTENT. Included in database/UPGRADE_TENANT.sql.
--
--   1. i18n_text_cache: server-side cache for the translation widget
--      (only never-seen texts are sent to the translation provider)
--   2. Forms: "Lead Status" and "Internal Notes" fields on form-submissions
--   3. SEO: "Sitemap Collections" field on seo-settings
--   4. kiban_schema_status() → version 10 (Settings → Health)
-- =============================================================

-- -------------------------------------------------------------
-- 1. Translation cache (written/read by the API with the service role)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS i18n_text_cache (
    hash TEXT PRIMARY KEY,                 -- sha256(source \0 target \0 text)
    source_lang TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_i18n_text_cache_langs ON i18n_text_cache (source_lang, target_lang);

-- RLS on, no policies: only the service role (the API) can read/write.
ALTER TABLE i18n_text_cache ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 2 + 3. Add fields to existing add-on collections (skipped if present)
-- -------------------------------------------------------------
DO $$
DECLARE
    _item RECORD;
BEGIN
    FOR _item IN
        SELECT * FROM (VALUES
            ('form-submissions', '{
              "id": "lead_status", "name": "lead_status", "label": "Lead Status", "type": "select",
              "options": [
                {"label": "New", "value": "new"},
                {"label": "Contacted", "value": "contacted"},
                {"label": "Won", "value": "won"},
                {"label": "Lost", "value": "lost"},
                {"label": "Spam", "value": "spam"}
              ],
              "helpText": "Where this lead is in your follow-up"
            }'::jsonb),
            ('form-submissions', '{
              "id": "notes", "name": "notes", "label": "Internal Notes", "type": "textarea",
              "helpText": "Only visible in the CMS"
            }'::jsonb),
            ('seo-settings', '{
              "id": "sitemap_collections", "name": "sitemap_collections", "label": "Sitemap Collections", "type": "text",
              "placeholder": "blog, tours, pages",
              "helpText": "Optional. Comma-separated collections to include. Empty = all public content collections"
            }'::jsonb)
        ) AS v(collection_slug, field)
    LOOP
        UPDATE collections
           SET fields = COALESCE(fields, '[]'::jsonb) || jsonb_build_array(_item.field)
         WHERE slug = _item.collection_slug
           AND jsonb_typeof(COALESCE(fields, '[]'::jsonb)) = 'array'
           AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(fields, '[]'::jsonb)) f
                WHERE f->>'id' = _item.field->>'id'
           );
    END LOOP;
END $$;

-- -------------------------------------------------------------
-- 4. Schema status → version 10
-- -------------------------------------------------------------
-- When adding a new migration: bump `schema_version` below AND
-- EXPECTED_SCHEMA_VERSION in apps/api/src/routes/site-health.ts.
CREATE OR REPLACE FUNCTION kiban_schema_status()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'schema_version', 10,
        'snapshots',         to_regclass('public.collection_snapshots') IS NOT NULL,
        'coupon_limits',     to_regprocedure('public.bump_coupon_usage(uuid,integer,integer)') IS NOT NULL,
        'trash',             EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_schema = 'public' AND table_name = 'entries'
                                       AND column_name = 'deleted_at'),
        'addons',            to_regclass('public.addon_configs') IS NOT NULL,
        'channel_manager',   to_regclass('public.channel_connections') IS NOT NULL,
        'api_key_rpc',       to_regprocedure('public.generate_new_api_key_for_user(uuid,text)') IS NOT NULL,
        'role_protection',   EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_prevent_role_change'),
        'cookie_consents',   to_regclass('public.addon_cookie_notice_consents') IS NOT NULL,
        'media_bucket',      EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'media'),
        'translation_cache', to_regclass('public.i18n_text_cache') IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION kiban_schema_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kiban_schema_status() TO service_role;

NOTIFY pgrst, 'reload schema';
