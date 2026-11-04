-- ============================================================
-- kibanCMS — Migration 006: Add-on System (per-tenant)
-- ============================================================
-- Cria as tabelas base do sistema de add-ons num tenant Supabase.
-- Idempotente: pode ser corrida várias vezes sem efeitos.
--
-- USAR EM:
--   - Tenants provisionados com o CLEAN_RESET.sql antigo, que apagava
--     estas tabelas e nunca as recriava (ex: algarveexplorer, solfil,
--     lunes, marsolve). Sintoma: "PGRST205: Could not find the table
--     'public.addon_configs'" ao guardar os cookies ou outro add-on.
--   - Tenants novos nao precisam: o CLEAN_RESET.sql ja cria estas
--     tabelas (STEP 12). Correr aqui na mesma nao faz mal.
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

-- addon_configs.addon_id aponta para addon_registry (FK): sem a linha no
-- registo, gravar a configuracao de um add-on falha. Registam-se todos os
-- que o admin e a API guardam em addon_configs (paginas de definicoes,
-- ativar/desativar em Add-ons, cluster de widgets, i18n). Nao mexe nos
-- que ja existem.
INSERT INTO addon_registry (addon_id, status)
SELECT addon_id, '{"installed": true, "enabled": true}'::jsonb
FROM (VALUES
    ('cookie-notice'), ('accessibility'), ('widget-cluster'), ('i18n'),
    ('whatsapp-widget'), ('newsletter'), ('affiliates'),
    ('post-tour-reviews'), ('channel-manager')
) AS a(addon_id)
ON CONFLICT (addon_id) DO NOTHING;

-- Notificar o PostgREST para recarregar o schema cache, prevenindo o erro PGRST205
NOTIFY pgrst, 'reload schema';
