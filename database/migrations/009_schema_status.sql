-- =============================================================
-- 009 — kiban_schema_status()
--
-- Reports which schema features this tenant's database has, so the CMS
-- "Saúde do cliente" page (Settings → Health) can say exactly what is
-- missing instead of failing later with cryptic errors.
--
-- IDEMPOTENT. Included in database/UPGRADE_TENANT.sql.
--
-- When adding a new migration: bump `schema_version` below AND
-- EXPECTED_SCHEMA_VERSION in apps/api/src/routes/site-health.ts.
-- =============================================================

CREATE OR REPLACE FUNCTION kiban_schema_status()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'schema_version', 9,
        'snapshots',       to_regclass('public.collection_snapshots') IS NOT NULL,
        'coupon_limits',   to_regprocedure('public.bump_coupon_usage(uuid,integer,integer)') IS NOT NULL,
        'trash',           EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_schema = 'public' AND table_name = 'entries'
                                     AND column_name = 'deleted_at'),
        'addons',          to_regclass('public.addon_configs') IS NOT NULL,
        'channel_manager', to_regclass('public.channel_connections') IS NOT NULL,
        'api_key_rpc',     to_regprocedure('public.generate_new_api_key_for_user(uuid,text)') IS NOT NULL,
        'role_protection', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_prevent_role_change'),
        'cookie_consents', to_regclass('public.addon_cookie_notice_consents') IS NOT NULL,
        'media_bucket',    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'media')
    );
$$;

-- Server-only (the API calls it with the service role).
REVOKE ALL ON FUNCTION kiban_schema_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kiban_schema_status() TO service_role;

NOTIFY pgrst, 'reload schema';
