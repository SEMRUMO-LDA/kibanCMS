-- ============================================================
-- kibanCMS - Migration 011: Fix RLS Infinite Recursion
-- Date: 2026-04-03
--
-- PROBLEM: Policies on profiles/entries/media use
--   EXISTS (SELECT FROM profiles WHERE role IN (...))
--   which triggers the profiles RLS policy, which does the
--   same check, causing infinite recursion.
--
-- FIX: Use SECURITY DEFINER functions that bypass RLS.
-- ============================================================

BEGIN;

-- ============================================
-- 1. SECURITY DEFINER HELPER FUNCTIONS
--    These bypass RLS when called from policies.
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
-- 2. FIX PROFILES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON profiles;

CREATE POLICY "Users can view own profile or admins view all"
ON profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR is_admin_or_super()
);

-- ============================================
-- 3. FIX ENTRIES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Published entries are public, drafts restricted" ON entries;

CREATE POLICY "Published entries are public, drafts restricted"
ON entries FOR SELECT
USING (
    status = 'published'
    OR (auth.uid() IS NOT NULL AND author_id = auth.uid())
    OR is_admin_or_editor()
);

DROP POLICY IF EXISTS "Authenticated users can create entries" ON entries;

CREATE POLICY "Authenticated users can create entries"
ON entries FOR INSERT
TO authenticated
WITH CHECK (
    author_id = auth.uid()
    AND has_content_role()
);

DROP POLICY IF EXISTS "Authors update own entries, admins update all" ON entries;

CREATE POLICY "Authors update own entries, admins update all"
ON entries FOR UPDATE
TO authenticated
USING (
    author_id = auth.uid()
    OR is_admin_or_super()
);

DROP POLICY IF EXISTS "Authors delete own entries, admins delete all" ON entries;

CREATE POLICY "Authors delete own entries, admins delete all"
ON entries FOR DELETE
TO authenticated
USING (
    author_id = auth.uid()
    OR is_admin_or_super()
);

-- ============================================
-- 4. FIX MEDIA POLICIES
-- ============================================

DROP POLICY IF EXISTS "Public media visible to all, private to owner or admin" ON media;

CREATE POLICY "Public media visible to all, private to owner or admin"
ON media FOR SELECT
USING (
    is_public = true
    OR (auth.uid() IS NOT NULL AND uploaded_by = auth.uid())
    OR is_admin_or_super()
);

DROP POLICY IF EXISTS "Authenticated users can upload media" ON media;

CREATE POLICY "Authenticated users can upload media"
ON media FOR INSERT
TO authenticated
WITH CHECK (
    uploaded_by = auth.uid()
    AND is_admin_or_editor()
);

DROP POLICY IF EXISTS "Users can update their own media" ON media;

CREATE POLICY "Users can update their own media"
ON media FOR UPDATE
TO authenticated
USING (
    uploaded_by = auth.uid()
    OR is_admin_or_super()
);

DROP POLICY IF EXISTS "Users can delete their own media" ON media;

CREATE POLICY "Users can delete their own media"
ON media FOR DELETE
TO authenticated
USING (
    uploaded_by = auth.uid()
    OR is_admin_or_super()
);

-- ============================================
-- 5. FIX COLLECTIONS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Collection owners and admins can update" ON collections;

CREATE POLICY "Collection owners and admins can update"
ON collections FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR is_admin_or_super()
);

DROP POLICY IF EXISTS "Only admins can create collections" ON collections;

CREATE POLICY "Only admins can create collections"
ON collections FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_super());

DROP POLICY IF EXISTS "Only admins can delete collections" ON collections;

CREATE POLICY "Only admins can delete collections"
ON collections FOR DELETE
TO authenticated
USING (is_admin_or_super());

COMMIT;
