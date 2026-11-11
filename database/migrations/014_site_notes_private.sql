-- =============================================================
-- 014 — Site notes are private at the database level
--
-- IDEMPOTENT. Included in database/UPGRADE_TENANT.sql.
--
-- "Editar no site" → Nota stores client feedback in the `site-notes`
-- collection. The API already keeps it out of the public API
-- (PRIVATE_COLLECTIONS in apps/api/src/routes/entries.ts); this makes the
-- row-level security match, so a logged-in viewer/author cannot read it
-- through PostgREST either.
--   1. kiban_collection_tier(): site-notes → 'editor'
--   2. kiban_schema_status() → version 14 (+ site_notes_private check)
-- Keep the lists in sync with PRIVATE_COLLECTIONS / ADMIN_ONLY_COLLECTIONS.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Collection tiers (RLS) — adds site-notes to the editor tier
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION kiban_collection_tier(cid UUID)
RETURNS TEXT
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN slug IN ('stripe-config', 'i18n-config', 'addons-config') THEN 'admin'
        WHEN slug IN ('stripe-transactions', 'forms-config', 'form-submissions',
                      'newsletter-subscribers', 'orders', 'bookings',
                      'coupons', 'coupon-redemptions', 'affiliates', 'commission-ledger',
                      'automations', 'post-tour-reviews', 'site-notes') THEN 'editor'
        ELSE 'public'
    END
    FROM collections WHERE id = cid;
$$;

-- -------------------------------------------------------------
-- 2. Schema status → version 14
-- -------------------------------------------------------------
-- When adding a new migration: bump `schema_version` below AND
-- EXPECTED_SCHEMA_VERSION in apps/api/src/routes/site-health.ts.
CREATE OR REPLACE FUNCTION kiban_schema_status()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'schema_version', 14,
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
        'translation_cache', to_regclass('public.i18n_text_cache') IS NOT NULL,
        'private_rls',       EXISTS (SELECT 1 FROM pg_policies
                                     WHERE schemaname = 'public' AND tablename = 'entries'
                                       AND policyname = 'entries_select' AND qual LIKE '%kiban_can_access_collection%'),
        'author_set_null',   EXISTS (SELECT 1 FROM pg_constraint
                                     WHERE conrelid = 'public.entries'::regclass
                                       AND conname = 'entries_author_id_fkey' AND confdeltype = 'n'),
        'live_slug_index',   to_regclass('public.entries_live_slug_uq') IS NOT NULL,
        'site_notes_private', EXISTS (SELECT 1 FROM pg_proc
                                      WHERE proname = 'kiban_collection_tier' AND prosrc LIKE '%site-notes%')
    );
$$;

REVOKE ALL ON FUNCTION kiban_schema_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kiban_schema_status() TO service_role;

NOTIFY pgrst, 'reload schema';
