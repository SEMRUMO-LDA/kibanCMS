-- ============================================================
-- kibanCMS — Migration 006: Add-on System (per-tenant)
-- ============================================================
-- Cria as tabelas base do sistema de add-ons num tenant Supabase.
-- Idempotente: pode ser corrida várias vezes sem efeitos.
--
-- USAR EM:
--   - Tenants existentes que foram provisionados antes deste sistema
--     (ex: algarveexplorer, solfil, lunes — KIBAN_SETUP.sql dropava
--     estas tabelas mas nunca as recriava).
--   - Tenants novos: incluir no script de bootstrap.
--
-- INSTRUÇÕES (Supabase Dashboard):
--   1. Abre o projecto Supabase do tenant
--   2. SQL Editor → New query
--   3. Cola este ficheiro inteiro
--   4. Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS addon_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    addon_id TEXT NOT NULL UNIQUE,
    status JSONB NOT NULL DEFAULT '{"installed": true, "enabled": false}',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS addon_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    addon_id TEXT NOT NULL REFERENCES addon_registry(addon_id) ON DELETE CASCADE,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(addon_id)
);

ALTER TABLE addon_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_configs  ENABLE ROW LEVEL SECURITY;

-- Drop+recreate so re-runs always end with the latest policy definition.
DROP POLICY IF EXISTS "Admins can manage addon registry" ON addon_registry;
DROP POLICY IF EXISTS "Admins can manage addon configs"  ON addon_configs;

CREATE POLICY "Admins can manage addon registry"
ON addon_registry FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role::text IN ('super_admin', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role::text IN ('super_admin', 'admin'))
);

CREATE POLICY "Admins can manage addon configs"
ON addon_configs FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role::text IN ('super_admin', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role::text IN ('super_admin', 'admin'))
);

-- Sanity: register cookie-notice as installed so widgets/enabled finds it
-- when the admin first writes config. Harmless if already present.
INSERT INTO addon_registry (addon_id, status)
VALUES ('cookie-notice', '{"installed": true, "enabled": true}'::jsonb)
ON CONFLICT (addon_id) DO NOTHING;
