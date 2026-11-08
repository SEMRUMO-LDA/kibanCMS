-- =============================================================
-- 008 — Security hardening + missing objects
--
-- IDEMPOTENT: safe to run more than once, on existing and new tenants.
--
-- Existing tenants: paste this file into the tenant's Supabase SQL Editor.
--   (If unsure whether 002/003/004/006/007 were applied, run them first —
--    they are all safe to re-run.)
-- New tenants: scripts/new-client.sh runs CLEAN_RESET.sql, 002–007 and
--   this file automatically.
--
-- What it fixes:
--   1. Users could make themselves super_admin (profiles RLS let them
--      update their own `role`; signup metadata could set it too).
--   2. generate_new_api_key_for_user (Settings → "Generate key") was
--      missing on fresh tenants and, where present, let anyone mint keys
--      for any profile.
--   3. bump_coupon_usage was callable with the public anon key.
--   4. Snapshots (full entry dumps, drafts included) were readable by anon.
--   5. Any logged-in user could create webhooks directly via PostgREST
--      (bypassing the API's URL checks) and stream every entry out.
--   6. Bulk actions in the admin silently skipped webhooks/revisions
--      (trigger functions ran with the user's restricted rights).
--   7. Cookie-consent records were silently dropped (table never existed).
--   8. The `media` storage bucket and its upload policies were a manual step,
--      so image uploads from the entry editor failed on new tenants.
--   9. Missing indexes for the default entries listing and webhook polling.
-- =============================================================

-- Trusted callers: the API (service_role JWT) and the SQL Editor / psql
-- (no JWT at all → auth.role() is NULL). Anonymous visitors ('anon') and
-- logged-in end users ('authenticated') are NOT trusted.
CREATE OR REPLACE FUNCTION is_trusted_caller()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT auth.role() IS NULL OR auth.role() = 'service_role';
$$;

-- -------------------------------------------------------------
-- 1. Roles: no self-promotion
-- -------------------------------------------------------------

-- End users may edit their own profile (name, avatar, onboarding flag…)
-- but never their role. Role changes go through PATCH /api/v1/users/:id,
-- which runs with the service role and enforces who can grant what.
CREATE OR REPLACE FUNCTION prevent_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_trusted_caller() THEN
        RAISE EXCEPTION 'Roles can only be changed by an admin through the CMS'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_change ON profiles;
CREATE TRIGGER profiles_prevent_role_change
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION prevent_profile_role_change();

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- New users: never take the role from user-supplied signup metadata
-- (raw_user_meta_data is controlled by whoever signs up). Invited users get
-- their role from the API right after the invite (users.ts, service role).
-- Bootstrap: the very first user of a tenant becomes super_admin, so a fresh
-- tenant is never left without an admin (this used to be done client-side
-- in Onboarding, which let any viewer promote themselves).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    _role user_role := 'viewer';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin') THEN
        _role := 'super_admin';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        _role
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- -------------------------------------------------------------
-- 2. API keys: generate_new_api_key_for_user
-- -------------------------------------------------------------
-- Called by the admin (Settings → API → Generate) and usable from the SQL
-- Editor. Returns the plain key ONCE; only its hash is stored.
--   - From the admin: only for yourself, and only admins.
--   - From the SQL Editor: for any existing profile.
CREATE OR REPLACE FUNCTION generate_new_api_key_for_user(
    user_profile_id UUID,
    key_name TEXT DEFAULT 'API Key'
)
RETURNS TABLE(api_key TEXT, key_id UUID, key_prefix TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    new_key TEXT;
    new_key_id UUID;
    new_key_prefix TEXT;
    new_created_at TIMESTAMPTZ;
BEGIN
    IF NOT is_trusted_caller() THEN
        IF auth.uid() IS NULL OR user_profile_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'You can only create API keys for your own account'
                USING ERRCODE = '42501';
        END IF;
        IF NOT is_admin_or_super() THEN
            RAISE EXCEPTION 'Only admins can create API keys'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF user_profile_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = user_profile_id) THEN
        RAISE EXCEPTION 'Profile not found (%). Check: SELECT id, email FROM profiles;', user_profile_id;
    END IF;

    new_key := 'kiban_live_' || encode(gen_random_bytes(24), 'base64');
    new_key := replace(replace(replace(new_key, '+', ''), '/', ''), '=', '');
    new_key_prefix := substring(new_key from 1 for 17) || '...';

    INSERT INTO api_keys (profile_id, name, key_hash, key_prefix)
    VALUES (
        user_profile_id,
        COALESCE(NULLIF(trim(key_name), ''), 'API Key'),
        encode(digest(new_key, 'sha256'), 'hex'),
        new_key_prefix
    )
    RETURNING api_keys.id, api_keys.created_at INTO new_key_id, new_created_at;

    RETURN QUERY SELECT new_key, new_key_id, new_key_prefix, new_created_at;
END;
$$;

-- Functions are executable by PUBLIC by default: lock it down.
REVOKE ALL ON FUNCTION generate_new_api_key_for_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_new_api_key_for_user(UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------
-- 3. Coupons: bump_coupon_usage is server-only
-- -------------------------------------------------------------
DO $$
BEGIN
    IF to_regprocedure('public.bump_coupon_usage(uuid,integer,integer)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.bump_coupon_usage(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.bump_coupon_usage(uuid, integer, integer) TO service_role;
        ALTER FUNCTION public.bump_coupon_usage(uuid, integer, integer) SET search_path = public;
    ELSE
        RAISE NOTICE 'bump_coupon_usage missing — run 003_coupon_usage_rpc.sql (coupon limits are not enforced without it).';
    END IF;
END $$;

-- -------------------------------------------------------------
-- 4. Snapshots: admins/editors only (they contain full entry dumps)
-- -------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.collection_snapshots') IS NOT NULL THEN
        DROP POLICY IF EXISTS snapshots_select ON collection_snapshots;
        CREATE POLICY snapshots_select ON collection_snapshots
            FOR SELECT TO authenticated USING (is_admin_or_editor());
    ELSE
        RAISE NOTICE 'collection_snapshots missing — run 002_collection_snapshots.sql.';
    END IF;
END $$;

-- -------------------------------------------------------------
-- 5. Webhooks: only admins may create/modify them directly
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "webhooks_insert" ON webhooks;
CREATE POLICY "webhooks_insert" ON webhooks
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid() AND is_admin_or_super());

DROP POLICY IF EXISTS "webhooks_update" ON webhooks;
CREATE POLICY "webhooks_update" ON webhooks
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid() AND is_admin_or_super())
    WITH CHECK (profile_id = auth.uid() AND is_admin_or_super());

-- -------------------------------------------------------------
-- 6. Entry triggers must work for admin bulk actions too
-- -------------------------------------------------------------
-- Without SECURITY DEFINER they run with the logged-in user's rights; RLS
-- blocks the INSERTs into webhook_deliveries / entry_revisions and the
-- error is swallowed, so bulk publish/delete fired no webhooks.
ALTER FUNCTION trigger_webhooks_on_entry_change() SECURITY DEFINER;
ALTER FUNCTION trigger_webhooks_on_entry_change() SET search_path = public, extensions;
ALTER FUNCTION create_entry_revision() SECURITY DEFINER;
ALTER FUNCTION create_entry_revision() SET search_path = public, extensions;

-- -------------------------------------------------------------
-- 7. Cookie Notice consent log (GDPR proof of consent)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addon_cookie_notice_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT NOT NULL,
    consent_given BOOLEAN NOT NULL DEFAULT false,
    categories JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    consent_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_date
    ON addon_cookie_notice_consents (consent_date DESC);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_visitor
    ON addon_cookie_notice_consents (visitor_id);

ALTER TABLE addon_cookie_notice_consents ENABLE ROW LEVEL SECURITY;
-- Inserts come from the API (service role). Admins can read the log.
DROP POLICY IF EXISTS "cookie_consents_admin_select" ON addon_cookie_notice_consents;
CREATE POLICY "cookie_consents_admin_select" ON addon_cookie_notice_consents
    FOR SELECT TO authenticated USING (is_admin_or_super());

-- -------------------------------------------------------------
-- 8. Media storage bucket + upload policies
-- -------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kiban_media_insert" ON storage.objects;
CREATE POLICY "kiban_media_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'media' AND public.has_content_role());

DROP POLICY IF EXISTS "kiban_media_update" ON storage.objects;
CREATE POLICY "kiban_media_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'media' AND public.is_admin_or_editor())
    WITH CHECK (bucket_id = 'media' AND public.is_admin_or_editor());

DROP POLICY IF EXISTS "kiban_media_delete" ON storage.objects;
CREATE POLICY "kiban_media_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'media' AND public.is_admin_or_editor());

-- -------------------------------------------------------------
-- 9. Indexes
-- -------------------------------------------------------------
-- Default entries listing: WHERE collection_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_entries_collection_created
    ON entries (collection_id, created_at DESC);
-- Webhook worker polls pending deliveries every 5s per tenant
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
    ON webhook_deliveries (created_at) WHERE delivered_at IS NULL;
-- Redundant: key_hash already has a UNIQUE index
DROP INDEX IF EXISTS idx_api_keys_key_hash;

NOTIFY pgrst, 'reload schema';
