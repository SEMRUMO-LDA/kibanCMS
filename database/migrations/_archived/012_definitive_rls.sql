-- ============================================================
-- kibanCMS - Migration 012: Definitive RLS Policies
-- Date: 2026-04-03
--
-- REPLACES: 010, 011, and all previous RLS fixes.
--
-- DESIGN PRINCIPLES:
-- 1. SELECT = any authenticated user can read (admin panel requires login)
-- 2. WRITE = role-gated via SECURITY DEFINER functions (no recursion)
-- 3. Zero subqueries inside policies — simple, fast, unbreakable
-- 4. Public API uses service role key (bypasses RLS entirely)
--
-- This is the ONLY migration needed for RLS. Run it and forget.
-- ============================================================

BEGIN;

-- ============================================
-- STEP 1: SECURITY DEFINER FUNCTIONS
-- These run as the function owner (postgres),
-- bypassing RLS. Safe to call from any policy.
-- ============================================

CREATE OR REPLACE FUNCTION is_admin_or_super()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_editor()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'editor')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_content_role()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'editor', 'author')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- STEP 2: DROP ALL EXISTING POLICIES
-- Clean slate. No leftovers from previous migrations.
-- ============================================

-- profiles
DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public'
    LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON profiles'; END LOOP;
END $$;

-- collections
DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'collections' AND schemaname = 'public'
    LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON collections'; END LOOP;
END $$;

-- entries
DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'entries' AND schemaname = 'public'
    LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON entries'; END LOOP;
END $$;

-- media
DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'media' AND schemaname = 'public'
    LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON media'; END LOOP;
END $$;

-- entry_revisions (only if table exists)
DO $$ DECLARE r RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entry_revisions' AND table_schema = 'public') THEN
        FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'entry_revisions' AND schemaname = 'public'
        LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON entry_revisions'; END LOOP;
    END IF;
END $$;

-- ============================================
-- STEP 3: ENSURE RLS IS ENABLED
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
-- entry_revisions may not exist yet (created by 001 but not always applied)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entry_revisions' AND table_schema = 'public') THEN
        ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ============================================
-- STEP 4: NEW POLICIES — PROFILES
-- ============================================

-- READ: any authenticated user can read any profile
-- (needed for activity feeds, user lists, author names)
CREATE POLICY "profiles_select" ON profiles
    FOR SELECT TO authenticated USING (true);

-- UPDATE: users can only update their own profile
CREATE POLICY "profiles_update" ON profiles
    FOR UPDATE TO authenticated USING (id = auth.uid());

-- ============================================
-- STEP 5: NEW POLICIES — COLLECTIONS
-- ============================================

-- READ: any authenticated user can see all collections
CREATE POLICY "collections_select" ON collections
    FOR SELECT TO authenticated USING (true);

-- CREATE: admins only
CREATE POLICY "collections_insert" ON collections
    FOR INSERT TO authenticated WITH CHECK (is_admin_or_super());

-- UPDATE: owner or admin
CREATE POLICY "collections_update" ON collections
    FOR UPDATE TO authenticated USING (created_by = auth.uid() OR is_admin_or_super());

-- DELETE: admins only
CREATE POLICY "collections_delete" ON collections
    FOR DELETE TO authenticated USING (is_admin_or_super());

-- ============================================
-- STEP 6: NEW POLICIES — ENTRIES
-- ============================================

-- READ: authenticated users see all entries (admin panel needs drafts too)
-- Public API uses service role key — RLS doesn't apply there.
CREATE POLICY "entries_select" ON entries
    FOR SELECT TO authenticated USING (true);

-- CREATE: admin, editor, author
CREATE POLICY "entries_insert" ON entries
    FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND has_content_role());

-- UPDATE: own entries or admin/editor
CREATE POLICY "entries_update" ON entries
    FOR UPDATE TO authenticated USING (author_id = auth.uid() OR is_admin_or_editor());

-- DELETE: own entries or admin
CREATE POLICY "entries_delete" ON entries
    FOR DELETE TO authenticated USING (author_id = auth.uid() OR is_admin_or_super());

-- ============================================
-- STEP 7: NEW POLICIES — MEDIA
-- ============================================

-- READ: any authenticated user can see all media
CREATE POLICY "media_select" ON media
    FOR SELECT TO authenticated USING (true);

-- CREATE: admin, editor
CREATE POLICY "media_insert" ON media
    FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND is_admin_or_editor());

-- UPDATE: own files or admin
CREATE POLICY "media_update" ON media
    FOR UPDATE TO authenticated USING (uploaded_by = auth.uid() OR is_admin_or_super());

-- DELETE: own files or admin
CREATE POLICY "media_delete" ON media
    FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR is_admin_or_super());

-- ============================================
-- STEP 8: NEW POLICIES — ENTRY REVISIONS (if table exists)
-- ============================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entry_revisions' AND table_schema = 'public') THEN
        CREATE POLICY "revisions_select" ON entry_revisions
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

COMMIT;

-- ============================================
-- VERIFICATION: copy-paste this after running
-- ============================================
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
--
-- Expected: 15 policies total
-- profiles:    select, update (2)
-- collections: select, insert, update, delete (4)
-- entries:     select, insert, update, delete (4)
-- media:       select, insert, update, delete (4)
-- entry_revisions: select (1)
