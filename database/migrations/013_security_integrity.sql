-- =============================================================
-- 013 — Security & integrity hardening (holistic review, Nov 2026)
--
-- IDEMPOTENT. Included in database/UPGRADE_TENANT.sql.
--
--   1. RLS: a logged-in user no longer reads EVERY entry through the
--      Supabase API. Private collections (orders, bookings, leads,
--      subscribers, coupons…) need the editor role; collections holding
--      credentials (stripe-config, i18n-config, addons-config) the admin
--      role. Profiles: own row, or admin/editor. Deleting entries directly
--      (bypassing the Trash) is admin-only.
--      Keep the lists in sync with PRIVATE_COLLECTIONS / ADMIN_ONLY_COLLECTIONS
--      in apps/api/src/routes/entries.ts.
--   2. Deleting a user no longer cascades into content: author links
--      become NULL instead of deleting orders, bookings, leads, media,
--      revisions and snapshots that user happened to "own".
--   3. Entries in the Trash no longer block reuse of their slug.
--   4. Webhooks: moving an entry to the Trash emits entry.deleted,
--      restoring emits entry.created, edits inside the Trash and the
--      30-day purge emit nothing.
--   5. Indexes for booking capacity, redirects, newsletter / coupon /
--      Stripe-session lookups and the default admin listing.
--   6. SECURITY DEFINER helpers get a fixed search_path.
--   7. kiban_schema_status() → version 13.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Row-level security by collection tier
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
                      'automations', 'post-tour-reviews') THEN 'editor'
        ELSE 'public'
    END
    FROM collections WHERE id = cid;
$$;

CREATE OR REPLACE FUNCTION kiban_can_access_collection(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT CASE kiban_collection_tier(cid)
        WHEN 'admin'  THEN is_admin_or_super()
        WHEN 'editor' THEN is_admin_or_editor()
        ELSE true
    END;
$$;

DROP POLICY IF EXISTS "entries_select" ON entries;
CREATE POLICY "entries_select" ON entries
    FOR SELECT TO authenticated
    USING (kiban_can_access_collection(collection_id));

DROP POLICY IF EXISTS "entries_insert" ON entries;
CREATE POLICY "entries_insert" ON entries
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid() AND has_content_role() AND kiban_can_access_collection(collection_id));

DROP POLICY IF EXISTS "entries_update" ON entries;
CREATE POLICY "entries_update" ON entries
    FOR UPDATE TO authenticated
    USING ((author_id = auth.uid() OR is_admin_or_editor()) AND kiban_can_access_collection(collection_id));

-- Deleting through PostgREST skips the Trash, the audit log and the public
-- cache invalidation: the admin UI goes through the API, so this is admin-only.
DROP POLICY IF EXISTS "entries_delete" ON entries;
CREATE POLICY "entries_delete" ON entries
    FOR DELETE TO authenticated
    USING (is_admin_or_super());

-- Every user could list every colleague's email.
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR is_admin_or_editor());

-- -------------------------------------------------------------
-- 2. Author links: SET NULL instead of CASCADE
-- -------------------------------------------------------------
DO $$
DECLARE
    t RECORD;
    c TEXT;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('entries', 'author_id'),
        ('media', 'uploaded_by'),
        ('entry_revisions', 'revised_by'),
        ('collection_snapshots', 'created_by')
    ) AS v(tbl, col) LOOP
        IF to_regclass('public.' || t.tbl) IS NULL THEN CONTINUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = t.tbl AND column_name = t.col) THEN
            CONTINUE;
        END IF;
        FOR c IN
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
            WHERE con.conrelid = ('public.' || t.tbl)::regclass
              AND con.contype = 'f'
              AND a.attname = t.col
        LOOP
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t.tbl, c);
        END LOOP;
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', t.tbl, t.col);
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE SET NULL',
                       t.tbl, t.tbl || '_' || t.col || '_fkey', t.col);
    END LOOP;
END $$;

-- -------------------------------------------------------------
-- 3. Slug uniqueness only among live entries (needs 004: deleted_at)
-- -------------------------------------------------------------
DO $$
DECLARE c TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'entries' AND column_name = 'deleted_at') THEN
        FOR c IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.entries'::regclass AND contype = 'u'
        LOOP
            EXECUTE format('ALTER TABLE entries DROP CONSTRAINT %I', c);
        END LOOP;
        CREATE UNIQUE INDEX IF NOT EXISTS entries_live_slug_uq
            ON entries (collection_id, slug) WHERE deleted_at IS NULL;
    END IF;
END $$;

-- -------------------------------------------------------------
-- 4. Webhook trigger aware of the Trash
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_webhooks_on_entry_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    event_type TEXT;
    webhook_rec RECORD;
    collection_slug TEXT;
    old_deleted TIMESTAMPTZ := (to_jsonb(OLD) ->> 'deleted_at')::timestamptz;
    new_deleted TIMESTAMPTZ := (to_jsonb(NEW) ->> 'deleted_at')::timestamptz;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF new_deleted IS NOT NULL THEN RETURN NEW; END IF;
        event_type := 'entry.created';
    ELSIF TG_OP = 'UPDATE' THEN
        IF old_deleted IS NULL AND new_deleted IS NOT NULL THEN
            event_type := 'entry.deleted';            -- moved to the Trash
        ELSIF old_deleted IS NOT NULL AND new_deleted IS NULL THEN
            event_type := 'entry.created';            -- restored
        ELSIF new_deleted IS NOT NULL THEN
            RETURN NEW;                               -- edits inside the Trash
        ELSE
            event_type := 'entry.updated';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF old_deleted IS NOT NULL THEN RETURN OLD; END IF; -- 30-day purge: already announced
        event_type := 'entry.deleted';
    END IF;

    BEGIN
        SELECT slug INTO collection_slug FROM collections
        WHERE id = COALESCE(NEW.collection_id, OLD.collection_id);

        FOR webhook_rec IN
            SELECT * FROM webhooks
            WHERE enabled = true AND event_type = ANY(events)
            AND (collections IS NULL OR array_length(collections, 1) = 0 OR collection_slug = ANY(collections))
        LOOP
            INSERT INTO webhook_deliveries (webhook_id, event_type, payload, url)
            VALUES (
                webhook_rec.id, event_type,
                jsonb_build_object(
                    'event', event_type,
                    'collection', collection_slug,
                    'entry', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END,
                    'timestamp', NOW()
                ),
                webhook_rec.url
            );
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Webhook trigger failed: %', SQLERRM;
    END;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- -------------------------------------------------------------
-- 5. Indexes for the hot JSONB lookups
-- -------------------------------------------------------------
-- Booking capacity on every checkout / availability call
CREATE INDEX IF NOT EXISTS idx_entries_booking_slot
    ON entries (collection_id, (content->>'resource_slug'), (content->>'date'));
-- Redirect resolution on every page load
CREATE INDEX IF NOT EXISTS idx_entries_content_from_path
    ON entries (collection_id, (content->>'from_path'));
-- Newsletter dedupe / unsubscribe
CREATE INDEX IF NOT EXISTS idx_entries_content_email
    ON entries (collection_id, (content->>'email'));
-- Coupon code lookups
CREATE INDEX IF NOT EXISTS idx_entries_content_code
    ON entries (collection_id, (content->>'code'));
-- Stripe webhook idempotency
CREATE INDEX IF NOT EXISTS idx_entries_content_stripe_session
    ON entries (collection_id, (content->>'stripe_session_id'));
-- Admin listing filtered by status
CREATE INDEX IF NOT EXISTS idx_entries_collection_status_created
    ON entries (collection_id, status, created_at DESC);

-- -------------------------------------------------------------
-- 6. search_path on the SECURITY DEFINER role helpers
-- -------------------------------------------------------------
ALTER FUNCTION is_admin_or_super() SET search_path = public;
ALTER FUNCTION is_admin_or_editor() SET search_path = public;
ALTER FUNCTION has_content_role() SET search_path = public;

-- -------------------------------------------------------------
-- 7. Schema status → version 13
-- -------------------------------------------------------------
-- When adding a new migration: bump `schema_version` below AND
-- EXPECTED_SCHEMA_VERSION in apps/api/src/routes/site-health.ts.
CREATE OR REPLACE FUNCTION kiban_schema_status()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'schema_version', 13,
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
        'live_slug_index',   to_regclass('public.entries_live_slug_uq') IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION kiban_schema_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kiban_schema_status() TO service_role;

NOTIFY pgrst, 'reload schema';
