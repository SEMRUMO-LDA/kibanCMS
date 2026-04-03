-- ============================================================
-- FIX CRÍTICO DE SEGURANÇA - RLS Policies (CORRIGIDO)
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
    OR (auth.uid() IS NOT NULL AND author_id = auth.uid())  -- CORRIGIDO: author_id em vez de created_by
);

-- 2. Corrigir policy de collections
DROP POLICY IF EXISTS "Only admins can update collections" ON collections;

CREATE POLICY "Admins or owners can update collections"
ON collections FOR UPDATE
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
);

-- 3. Policy para media (sem coluna status na tabela media)
DROP POLICY IF EXISTS "Media viewable by authenticated users" ON media;

CREATE POLICY "Media is viewable by authenticated users"
ON media FOR SELECT
TO authenticated
USING (true);  -- Todos users autenticados podem ver media

-- 4. Adicionar policy mais restritiva para INSERT em entries
DROP POLICY IF EXISTS "Authenticated users can create entries" ON entries;

CREATE POLICY "Users can create their own entries"
ON entries FOR INSERT
TO authenticated
WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'editor')
    )
);

-- 5. Policy mais restritiva para UPDATE em entries
DROP POLICY IF EXISTS "Users can update their own entries" ON entries;

CREATE POLICY "Users can update their own entries or admins all"
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

-- 6. Verificar policies aplicadas
SELECT
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('entries', 'collections', 'media', 'profiles')
ORDER BY tablename, policyname;