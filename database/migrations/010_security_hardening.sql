-- ============================================================
-- kibanCMS - Migration 010: Security Hardening
-- Version: 1.1.0
-- Date: 2026-04-03
-- Description: Fix all RLS policies, add composite indexes,
--              consolidate security model
--
-- CRITICAL: Run this in Supabase SQL Editor IMMEDIATELY.
--           This fixes data exposure vulnerabilities.
-- ============================================================

BEGIN;

-- ============================================
-- 1. FIX PROFILES RLS
--    BEFORE: USING (true) — any authenticated user reads ALL profiles
--    AFTER:  Own profile OR admin can read all
-- ============================================

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;

CREATE POLICY "Users can view own profile or admins view all"
ON profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
);

-- Keep existing update policy (users can only update own)
-- Already correct: "Users can update own profile"

-- ============================================
-- 2. FIX ENTRIES RLS (SELECT)
--    BEFORE: status = 'published' OR auth.uid() IS NOT NULL
--            → ANY authenticated user sees ALL drafts
--    AFTER:  Published = public, drafts = author + admins/editors only
-- ============================================

DROP POLICY IF EXISTS "Published entries are viewable by everyone" ON entries;
DROP POLICY IF EXISTS "Published entries are public, drafts are private" ON entries;

CREATE POLICY "Published entries are public, drafts restricted"
ON entries FOR SELECT
USING (
    -- Published entries: visible to everyone (including anon for public API)
    status = 'published'
    -- Own entries: author sees all their own statuses
    OR (auth.uid() IS NOT NULL AND author_id = auth.uid())
    -- Admins/editors: see all entries regardless of status
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'editor')
    )
);

-- Fix INSERT policy (ensure correct field name)
DROP POLICY IF EXISTS "Authenticated users can create entries" ON entries;
DROP POLICY IF EXISTS "Users can create their own entries" ON entries;

CREATE POLICY "Authenticated users can create entries"
ON entries FOR INSERT
TO authenticated
WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'editor', 'author')
    )
);

-- Fix UPDATE policy
DROP POLICY IF EXISTS "Users can update their own entries" ON entries;
DROP POLICY IF EXISTS "Users can update their own entries or admins all" ON entries;

CREATE POLICY "Authors update own entries, admins update all"
ON entries FOR UPDATE
TO authenticated
USING (
    author_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- Fix DELETE policy
DROP POLICY IF EXISTS "Authors and admins can delete entries" ON entries;

CREATE POLICY "Authors delete own entries, admins delete all"
ON entries FOR DELETE
TO authenticated
USING (
    author_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- ============================================
-- 3. FIX MEDIA RLS (SELECT)
--    BEFORE: USING (true) — any authenticated user sees ALL media
--    AFTER:  Public media = everyone, private = owner + admins
-- ============================================

DROP POLICY IF EXISTS "Media viewable by authenticated users" ON media;
DROP POLICY IF EXISTS "Media is viewable by authenticated users" ON media;
DROP POLICY IF EXISTS "Published media is public, others need auth" ON media;

CREATE POLICY "Public media visible to all, private to owner or admin"
ON media FOR SELECT
USING (
    -- Public media: visible to all authenticated users
    is_public = true
    -- Own media: uploader sees all their files
    OR (auth.uid() IS NOT NULL AND uploaded_by = auth.uid())
    -- Admins: see everything
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- Keep existing INSERT/UPDATE/DELETE policies (already correct)
-- They enforce: uploaded_by = auth.uid() OR admin

-- ============================================
-- 4. FIX COLLECTIONS RLS (UPDATE)
--    Add owner check alongside admin check
-- ============================================

DROP POLICY IF EXISTS "Only admins can update collections" ON collections;
DROP POLICY IF EXISTS "Admins or owners can update collections" ON collections;

CREATE POLICY "Collection owners and admins can update"
ON collections FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- ============================================
-- 5. ENABLE pg_trgm FOR BETTER SEARCH
--    Must be created BEFORE indexes that use it
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 6. COMPOSITE INDEXES FOR PERFORMANCE
--    These target the most common query patterns
--    in the API and admin panel
-- ============================================

-- Entries: filtered by collection + status (every page load)
CREATE INDEX IF NOT EXISTS idx_entries_collection_status
ON entries(collection_id, status);

-- Entries: collection + slug lookup (single entry fetch)
-- Already covered by UNIQUE(collection_id, slug) constraint

-- Media: user's files ordered by date (media library)
CREATE INDEX IF NOT EXISTS idx_media_uploaded_created
ON media(uploaded_by, created_at DESC);

-- Media: public files filter
CREATE INDEX IF NOT EXISTS idx_media_public
ON media(is_public) WHERE is_public = true;

-- API keys: auth lookup (every API request)
-- Only if api_keys table exists (requires migration 007)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
        CREATE INDEX IF NOT EXISTS idx_api_keys_active_hash
        ON api_keys(key_hash) WHERE revoked_at IS NULL;
    END IF;
END $$;

-- Webhooks indexes: only if webhooks table exists (requires migration 009)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhooks') THEN
        CREATE INDEX IF NOT EXISTS idx_webhooks_profile_enabled
        ON webhooks(profile_id) WHERE enabled = true;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_deliveries') THEN
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_recent
        ON webhook_deliveries(webhook_id, created_at DESC);
    END IF;
END $$;

-- Entries: trigram search on title (uses pg_trgm above)
CREATE INDEX IF NOT EXISTS idx_entries_title_trgm
ON entries USING GIN(title gin_trgm_ops);

-- ============================================
-- 7. HELPER FUNCTION: check admin role
--    Used by RLS policies above (cached per-transaction)
-- ============================================

CREATE OR REPLACE FUNCTION is_admin_or_super()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMIT;

-- ============================================
-- VERIFICATION: Run after applying migration
-- ============================================
-- Check all policies are correctly applied:
--
-- SELECT tablename, policyname, cmd, permissive, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- AND tablename IN ('profiles', 'entries', 'media', 'collections')
-- ORDER BY tablename, policyname;
--
-- Expected results:
-- profiles: "Users can view own profile or admins view all" (SELECT)
-- profiles: "Users can update own profile" (UPDATE)
-- entries:  "Published entries are public, drafts restricted" (SELECT)
-- entries:  "Authenticated users can create entries" (INSERT)
-- entries:  "Authors update own entries, admins update all" (UPDATE)
-- entries:  "Authors delete own entries, admins delete all" (DELETE)
-- media:    "Public media visible to all, private to owner or admin" (SELECT)
-- media:    "Authenticated users can upload media" (INSERT)
-- media:    "Users can update their own media" (UPDATE)
-- media:    "Users can delete their own media" (DELETE)
