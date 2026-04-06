-- ============================================================
-- kibanCMS v1.0 — CLEAN RESET
-- ============================================================
-- Este script:
--   1. Remove TODAS as tabelas v2 que nao deviam existir
--   2. Remove as tabelas v1 existentes
--   3. Recria tudo limpo com RLS correto (SECURITY DEFINER)
--   4. Cria api_keys, webhooks, entry_revisions
--   5. Configura triggers e funcoes
--   6. Define o primeiro user como super_admin
--
-- INSTRUCOES:
--   1. Abre o Supabase SQL Editor
--   2. Cola este ficheiro INTEIRO
--   3. Clica "Run"
--   4. Faz refresh no kibanCMS admin
-- ============================================================

-- ============================
-- STEP 1: APAGAR TABELAS v2 (nao usadas)
-- ============================

DROP TABLE IF EXISTS content_analytics CASCADE;
DROP TABLE IF EXISTS content_nodes CASCADE;
DROP TABLE IF EXISTS content_revisions CASCADE;
DROP TABLE IF EXISTS content_translations CASCADE;
DROP TABLE IF EXISTS content_taxonomies CASCADE;
DROP TABLE IF EXISTS content_versions CASCADE;
DROP TABLE IF EXISTS cdn_configurations CASCADE;
DROP TABLE IF EXISTS media_assets CASCADE;
DROP TABLE IF EXISTS media_metadata CASCADE;
DROP TABLE IF EXISTS media_processing_queue CASCADE;
DROP TABLE IF EXISTS media_variants CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS addon_configs CASCADE;
DROP TABLE IF EXISTS addon_registry CASCADE;
DROP TABLE IF EXISTS ai_tasks CASCADE;
DROP TABLE IF EXISTS taxonomies CASCADE;

-- ============================
-- STEP 2: APAGAR TABELAS v1 (vamos recria-las)
-- ============================

DROP TABLE IF EXISTS webhook_deliveries CASCADE;
DROP TABLE IF EXISTS webhooks CASCADE;
DROP TABLE IF EXISTS entry_revisions CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================
-- STEP 3: APAGAR FUNCOES ANTIGAS
-- ============================

DROP FUNCTION IF EXISTS is_admin_or_super() CASCADE;
DROP FUNCTION IF EXISTS is_admin_or_editor() CASCADE;
DROP FUNCTION IF EXISTS has_content_role() CASCADE;
DROP FUNCTION IF EXISTS generate_api_key() CASCADE;
DROP FUNCTION IF EXISTS hash_api_key(TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_key_prefix(TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_default_api_keys() CASCADE;
DROP FUNCTION IF EXISTS auto_create_api_key() CASCADE;
DROP FUNCTION IF EXISTS create_entry_revision() CASCADE;
DROP FUNCTION IF EXISTS trigger_webhooks_on_entry_change() CASCADE;
DROP FUNCTION IF EXISTS generate_webhook_secret() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- ============================
-- STEP 4: APAGAR TIPOS ANTIGOS
-- ============================

DROP TYPE IF EXISTS collection_type CASCADE;
DROP TYPE IF EXISTS content_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ============================
-- STEP 5: CRIAR ENUMS
-- ============================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'editor', 'author', 'viewer');
CREATE TYPE content_status AS ENUM ('draft', 'review', 'scheduled', 'published', 'archived');
CREATE TYPE collection_type AS ENUM ('post', 'page', 'custom');

-- ============================
-- STEP 6: CRIAR TABELAS CORE
-- ============================

-- Profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    onboarding_completed BOOLEAN DEFAULT false NOT NULL,
    project_manifesto JSONB DEFAULT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Collections
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    type collection_type DEFAULT 'custom' NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]',
    settings JSONB DEFAULT '{}',
    icon TEXT,
    color TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Entries
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    excerpt TEXT,
    featured_image UUID,
    status content_status DEFAULT 'draft' NOT NULL,
    published_at TIMESTAMPTZ,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    meta JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    version INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(collection_id, slug)
);

-- Media
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    bucket_name TEXT DEFAULT 'media' NOT NULL,
    dimensions JSONB,
    alt_text TEXT,
    caption TEXT,
    metadata JSONB DEFAULT '{}',
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    folder_path TEXT DEFAULT '/',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Entry Revisions
CREATE TABLE entry_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    content JSONB NOT NULL,
    excerpt TEXT,
    meta JSONB,
    revised_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    revision_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(entry_id, version)
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default API Key',
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT api_keys_name_check CHECK (length(name) <= 100)
);

-- Webhooks
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    collections TEXT[] DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    total_deliveries INTEGER NOT NULL DEFAULT 0,
    failed_deliveries INTEGER NOT NULL DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_url CHECK (url ~ '^https?://'),
    CONSTRAINT has_events CHECK (array_length(events, 1) > 0)
);

-- Webhook Deliveries
CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    url TEXT NOT NULL,
    http_method VARCHAR(10) NOT NULL DEFAULT 'POST',
    status_code INTEGER,
    response_body TEXT,
    response_headers JSONB,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================
-- STEP 7: INDEXES
-- ============================

-- Entries
CREATE INDEX idx_entries_collection_id ON entries(collection_id);
CREATE INDEX idx_entries_author_id ON entries(author_id);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_published_at ON entries(published_at DESC);
CREATE INDEX idx_entries_collection_status ON entries(collection_id, status);

-- Media
CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_media_uploaded_created ON media(uploaded_by, created_at DESC);
CREATE INDEX idx_media_public ON media(is_public) WHERE is_public = true;

-- Collections
CREATE INDEX idx_collections_created_by ON collections(created_by);

-- Entry Revisions
CREATE INDEX idx_entry_revisions_entry_id ON entry_revisions(entry_id);

-- API Keys
CREATE INDEX idx_api_keys_profile_id ON api_keys(profile_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(revoked_at) WHERE revoked_at IS NULL;

-- Webhooks
CREATE INDEX idx_webhooks_profile ON webhooks(profile_id);
CREATE INDEX idx_webhooks_enabled ON webhooks(enabled) WHERE enabled = true;
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

-- Full-text search (se pg_trgm estiver disponivel)
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX idx_entries_title_trgm ON entries USING GIN (title gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_trgm extension not available, skipping trigram index';
END $$;

-- ============================
-- STEP 8: SECURITY DEFINER FUNCTIONS (anti-recursao RLS)
-- ============================

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

-- ============================
-- STEP 9: ENABLE RLS + POLICIES
-- ============================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- PROFILES (2 policies)
CREATE POLICY "profiles_select" ON profiles
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON profiles
    FOR UPDATE TO authenticated USING (id = auth.uid());

-- COLLECTIONS (4 policies)
CREATE POLICY "collections_select" ON collections
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "collections_insert" ON collections
    FOR INSERT TO authenticated WITH CHECK (is_admin_or_super());
CREATE POLICY "collections_update" ON collections
    FOR UPDATE TO authenticated USING (created_by = auth.uid() OR is_admin_or_super());
CREATE POLICY "collections_delete" ON collections
    FOR DELETE TO authenticated USING (is_admin_or_super());

-- ENTRIES (4 policies)
CREATE POLICY "entries_select" ON entries
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "entries_insert" ON entries
    FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND has_content_role());
CREATE POLICY "entries_update" ON entries
    FOR UPDATE TO authenticated USING (author_id = auth.uid() OR is_admin_or_editor());
CREATE POLICY "entries_delete" ON entries
    FOR DELETE TO authenticated USING (author_id = auth.uid() OR is_admin_or_super());

-- MEDIA (4 policies)
CREATE POLICY "media_select" ON media
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "media_insert" ON media
    FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND is_admin_or_editor());
CREATE POLICY "media_update" ON media
    FOR UPDATE TO authenticated USING (uploaded_by = auth.uid() OR is_admin_or_super());
CREATE POLICY "media_delete" ON media
    FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR is_admin_or_super());

-- ENTRY REVISIONS (1 policy)
CREATE POLICY "revisions_select" ON entry_revisions
    FOR SELECT TO authenticated USING (true);

-- API KEYS (4 policies — ownership)
CREATE POLICY "api_keys_select" ON api_keys
    FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "api_keys_insert" ON api_keys
    FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "api_keys_update" ON api_keys
    FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "api_keys_delete" ON api_keys
    FOR DELETE USING (profile_id = auth.uid());

-- WEBHOOKS (4 policies — ownership)
CREATE POLICY "webhooks_select" ON webhooks
    FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "webhooks_insert" ON webhooks
    FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "webhooks_update" ON webhooks
    FOR UPDATE TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "webhooks_delete" ON webhooks
    FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- WEBHOOK DELIVERIES (1 policy)
CREATE POLICY "deliveries_select" ON webhook_deliveries
    FOR SELECT TO authenticated
    USING (webhook_id IN (SELECT id FROM webhooks WHERE profile_id = auth.uid()));

-- ============================
-- STEP 10: UTILITY FUNCTIONS
-- ============================

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- API key generation
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS TEXT AS $$
DECLARE
    key_value TEXT;
BEGIN
    key_value := 'kiban_live_' || encode(gen_random_bytes(24), 'base64');
    key_value := replace(key_value, '+', '');
    key_value := replace(key_value, '/', '');
    key_value := replace(key_value, '=', '');
    RETURN key_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION hash_api_key(key_value TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(key_value, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_key_prefix(key_value TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN substring(key_value from 1 for 17) || '...';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create API key on profile creation
CREATE OR REPLACE FUNCTION auto_create_api_key()
RETURNS TRIGGER AS $$
DECLARE
    new_key TEXT;
BEGIN
    new_key := generate_api_key();
    INSERT INTO api_keys (profile_id, name, key_hash, key_prefix)
    VALUES (NEW.id, 'Default API Key', hash_api_key(new_key), get_key_prefix(new_key));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Entry revision on update
CREATE OR REPLACE FUNCTION create_entry_revision()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content OR
       OLD.title IS DISTINCT FROM NEW.title OR
       OLD.excerpt IS DISTINCT FROM NEW.excerpt THEN
        BEGIN
            INSERT INTO entry_revisions (entry_id, version, title, content, excerpt, meta, revised_by)
            VALUES (OLD.id, OLD.version, OLD.title, OLD.content, OLD.excerpt, OLD.meta, NEW.author_id);
            NEW.version = OLD.version + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create entry revision: %', SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Webhook trigger on entry change
CREATE OR REPLACE FUNCTION trigger_webhooks_on_entry_change()
RETURNS TRIGGER AS $$
DECLARE
    event_type TEXT;
    webhook_rec RECORD;
    collection_slug TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN event_type := 'entry.created';
    ELSIF TG_OP = 'UPDATE' THEN event_type := 'entry.updated';
    ELSIF TG_OP = 'DELETE' THEN event_type := 'entry.deleted';
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
$$ LANGUAGE plpgsql;

-- Webhook secret generator
CREATE OR REPLACE FUNCTION generate_webhook_secret()
RETURNS VARCHAR(255) AS $$
BEGIN
    RETURN 'whsec_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- ============================
-- STEP 11: TRIGGERS
-- ============================

-- Auth trigger (new user signup -> create profile)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto API key on profile creation
CREATE TRIGGER trigger_auto_create_api_key
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION auto_create_api_key();

-- updated_at triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_entries_updated_at
    BEFORE UPDATE ON entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_media_updated_at
    BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Entry revision trigger
CREATE TRIGGER create_revision_on_entry_update
    BEFORE UPDATE ON entries FOR EACH ROW EXECUTE FUNCTION create_entry_revision();

-- Webhook trigger
CREATE TRIGGER entries_webhook_trigger
    AFTER INSERT OR UPDATE OR DELETE ON entries
    FOR EACH ROW EXECUTE FUNCTION trigger_webhooks_on_entry_change();

-- ============================
-- STEP 12: GRANTS
-- ============================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON api_keys TO authenticated;

-- ============================
-- STEP 13: SETUP FIRST USER AS SUPER_ADMIN
-- ============================

DO $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
BEGIN
    -- Encontrar o primeiro user registado
    SELECT id, email INTO v_user_id, v_user_email
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '⚠️  Nenhum user encontrado em auth.users';
        RAISE NOTICE '    Regista-te primeiro no kibanCMS e depois corre este script.';
        RAISE NOTICE '';
    ELSE
        -- Criar/atualizar profile como super_admin
        INSERT INTO profiles (id, email, full_name, role, onboarding_completed)
        VALUES (v_user_id, v_user_email, 'Admin', 'super_admin', false)
        ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

        RAISE NOTICE '';
        RAISE NOTICE '========================================';
        RAISE NOTICE '✅ Database limpa e reconstruida!';
        RAISE NOTICE '========================================';
        RAISE NOTICE '   User: %', v_user_email;
        RAISE NOTICE '   Role: super_admin';
        RAISE NOTICE '   Tabelas: 8 (core v1.0)';
        RAISE NOTICE '   Policies: 24 RLS';
        RAISE NOTICE '   Tabelas v2 removidas';
        RAISE NOTICE '';
        RAISE NOTICE '   Proximo passo: abre o kibanCMS e faz onboarding';
        RAISE NOTICE '========================================';
    END IF;
END $$;

-- ============================
-- VERIFICACAO (corre separadamente)
-- ============================
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, cmd;
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
