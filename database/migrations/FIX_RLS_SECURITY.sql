-- ============================================================
-- FIX CRÍTICO DE SEGURANÇA - RLS Policies
-- Execute IMEDIATAMENTE no Supabase SQL Editor
-- ============================================================

-- 1. Corrigir policy de entries - PROBLEMA CRÍTICO
-- Antes: User autenticado vê TODOS os drafts
-- Depois: User vê apenas seus próprios drafts

DROP POLICY IF EXISTS "Published entries are viewable by everyone" ON entries;

CREATE POLICY "Published entries are public, drafts are private"
ON entries FOR SELECT
USING (
    status = 'published'
    OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
);

-- 2. Corrigir policy de collections - adicionar check de ownership
DROP POLICY IF EXISTS "Users can update their own collections" ON collections;

CREATE POLICY "Users can update their own collections or if admin"
ON collections FOR UPDATE
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- 3. Adicionar policy para media
DROP POLICY IF EXISTS "Users can view published media" ON media;

CREATE POLICY "Published media is public, others need auth"
ON media FOR SELECT
USING (
    status = 'published'
    OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- 4. Verificar policies aplicadas
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('entries', 'collections', 'media', 'profiles')
ORDER BY tablename, policyname;