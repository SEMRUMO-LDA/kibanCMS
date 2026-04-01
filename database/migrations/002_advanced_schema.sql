-- ============================================================
-- kibanCMS - Migration 002: Advanced Schema
-- Version: 2.0.0
-- Description: Multi-tenancy, i18n, AI, Geo, Block-based content
-- REQUIRES: 001_initial_schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- ENUMS (new types only - user_role and content_status already defined in 001)
-- ============================================
DO $$ BEGIN CREATE TYPE node_type AS ENUM ('page', 'post', 'product', 'directory', 'custom'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE block_type AS ENUM ('heading', 'paragraph', 'image', 'video', 'code', 'quote', 'list', 'table', 'divider', 'embed', 'callout', 'toggle', 'columns', 'tabs', 'accordion', 'gallery', 'map', 'form', 'custom'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE locale_code AS ENUM ('pt', 'en', 'es', 'fr', 'de'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE cache_strategy AS ENUM ('none', 'swr', 'immutable', 'revalidate'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- FUNCTIONS (defined before tables/indexes that use them)
-- ============================================

-- Slug generator (no unaccent dependency - uses plain regexp)
CREATE OR REPLACE FUNCTION generate_slug(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                input_text,
                '[^a-zA-Z0-9\-_]+', '-', 'gi'
            ),
            '\-+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update materialized path
CREATE OR REPLACE FUNCTION update_content_path()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path = '/' || NEW.id::text;
        NEW.depth = 0;
    ELSE
        SELECT path || '/' || NEW.id::text, depth + 1
        INTO NEW.path, NEW.depth
        FROM content_nodes
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Find similar content (semantic search via pgvector)
CREATE OR REPLACE FUNCTION find_similar_content(
    target_id UUID,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    title TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cn.id,
        ct.title,
        1 - (cn.content_embedding <=> (
            SELECT content_embedding FROM content_nodes WHERE content_nodes.id = target_id
        )) AS similarity
    FROM content_nodes cn
    JOIN content_translations ct ON cn.id = ct.node_id AND ct.is_primary = true
    WHERE cn.id != target_id
        AND cn.content_embedding IS NOT NULL
    ORDER BY similarity DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Find nearby content (geo search via PostGIS)
CREATE OR REPLACE FUNCTION find_nearby_content(
    lat FLOAT,
    lng FLOAT,
    radius_meters INTEGER DEFAULT 5000,
    max_results INTEGER DEFAULT 20
)
RETURNS TABLE(
    id UUID,
    title TEXT,
    distance_meters FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cn.id,
        ct.title,
        ST_Distance(
            cn.geo_location,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ) AS distance_meters
    FROM content_nodes cn
    JOIN content_translations ct ON cn.id = ct.node_id AND ct.is_primary = true
    WHERE ST_DWithin(
        cn.geo_location,
        ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
        radius_meters
    )
    ORDER BY distance_meters ASC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Queue AI embedding generation
CREATE OR REPLACE FUNCTION queue_embedding_generation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR OLD.content_blocks IS DISTINCT FROM NEW.content_blocks THEN
        INSERT INTO ai_tasks (
            organization_id, type, entity_type, entity_id, input
        ) VALUES (
            NEW.organization_id,
            'generate_embedding',
            'content_node',
            NEW.id,
            jsonb_build_object('content_blocks', NEW.content_blocks)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    subscription_tier TEXT DEFAULT 'free',
    ai_credits INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ensure profiles (created in v1) gets organization_id
DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Add new columns to profiles if missing
DO $$ BEGIN ALTER TABLE profiles ADD COLUMN permissions JSONB DEFAULT '[]'; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE profiles ADD COLUMN locale TEXT DEFAULT 'pt'; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'Europe/Lisbon'; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE profiles ADD COLUMN last_seen_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE TABLE IF NOT EXISTS content_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type node_type NOT NULL,
    parent_id UUID REFERENCES content_nodes(id) ON DELETE CASCADE,
    template TEXT,
    content_blocks JSONB NOT NULL DEFAULT '[]',
    content_version INTEGER DEFAULT 1,
    seo_config JSONB DEFAULT '{}',
    social_config JSONB DEFAULT '{}',
    schema_markup JSONB,
    geo_location geography(POINT, 4326),
    geo_boundary geography(POLYGON, 4326),
    geo_metadata JSONB DEFAULT '{}',
    content_embedding vector(1536),
    summary_embedding vector(1536),
    keywords TEXT[],
    entities JSONB,
    sentiment_score FLOAT,
    status content_status DEFAULT 'draft' NOT NULL,
    published_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    cache_strategy cache_strategy DEFAULT 'swr',
    cache_ttl INTEGER DEFAULT 3600,
    created_by UUID NOT NULL REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    published_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    path TEXT,
    depth INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    locale locale_code NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    excerpt TEXT,
    content_blocks JSONB NOT NULL DEFAULT '[]',
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT[],
    translated_by UUID REFERENCES profiles(id),
    translation_status TEXT DEFAULT 'draft',
    machine_translated BOOLEAN DEFAULT false,
    translation_score FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(node_id, locale)
);

CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    cdn_url TEXT,
    blurhash TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    variants JSONB DEFAULT '{}',
    alt_text TEXT,
    caption TEXT,
    transcription TEXT,
    detected_objects JSONB,
    detected_text TEXT,
    dominant_colors TEXT[],
    content_embedding vector(512),
    folder_path TEXT DEFAULT '/',
    tags TEXT[],
    is_public BOOLEAN DEFAULT false,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS taxonomies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    parent_id UUID REFERENCES taxonomies(id) ON DELETE CASCADE,
    translations JSONB NOT NULL DEFAULT '{}',
    icon TEXT,
    color TEXT,
    image_id UUID REFERENCES media_assets(id),
    seo_config JSONB DEFAULT '{}',
    path TEXT,
    depth INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS content_taxonomies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    taxonomy_id UUID NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (node_id, taxonomy_id)
);

CREATE TABLE IF NOT EXISTS content_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_blocks JSONB NOT NULL,
    translations JSONB,
    change_summary TEXT,
    changed_fields TEXT[],
    diff JSONB,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(node_id, version)
);

CREATE TABLE IF NOT EXISTS content_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    average_time_seconds INTEGER DEFAULT 0,
    bounce_rate FLOAT,
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    organic_traffic INTEGER DEFAULT 0,
    search_impressions INTEGER DEFAULT 0,
    average_position FLOAT,
    visitor_countries JSONB DEFAULT '{}',
    visitor_cities JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (node_id, date)
);

CREATE TABLE IF NOT EXISTS ai_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    input JSONB NOT NULL,
    output JSONB,
    error TEXT,
    attempts INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    ai_model TEXT,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_content_nodes_org ON content_nodes(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_nodes_type ON content_nodes(type);
CREATE INDEX IF NOT EXISTS idx_content_nodes_status ON content_nodes(status);
CREATE INDEX IF NOT EXISTS idx_content_nodes_published ON content_nodes(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_nodes_path ON content_nodes(path);
CREATE INDEX IF NOT EXISTS idx_content_nodes_parent ON content_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_content_nodes_geo ON content_nodes USING GIST(geo_location);

CREATE INDEX IF NOT EXISTS idx_translations_node ON content_translations(node_id);
CREATE INDEX IF NOT EXISTS idx_translations_locale ON content_translations(locale);
CREATE INDEX IF NOT EXISTS idx_translations_slug ON content_translations(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_unique_slug ON content_translations(node_id, locale, slug);

CREATE INDEX IF NOT EXISTS idx_media_org ON media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_mime ON media_assets(mime_type);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media_assets(folder_path);

-- Full-text search (simple, no unaccent dependency)
CREATE INDEX IF NOT EXISTS idx_content_search ON content_translations USING GIN(
    to_tsvector('portuguese'::regconfig, coalesce(title, '') || ' ' || coalesce(excerpt, ''))
);

-- ============================================
-- TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS update_content_nodes_updated_at ON content_nodes;
CREATE TRIGGER update_content_nodes_updated_at BEFORE UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_content_translations_updated_at ON content_translations;
CREATE TRIGGER update_content_translations_updated_at BEFORE UPDATE ON content_translations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_assets_updated_at ON media_assets;
CREATE TRIGGER update_media_assets_updated_at BEFORE UPDATE ON media_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_content_path_trigger ON content_nodes;
CREATE TRIGGER update_content_path_trigger BEFORE INSERT OR UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION update_content_path();

DROP TRIGGER IF EXISTS queue_content_embedding ON content_nodes;
CREATE TRIGGER queue_content_embedding AFTER INSERT OR UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION queue_embedding_generation();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view their organization" ON organizations FOR SELECT TO authenticated USING (id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Published content is public" ON content_nodes FOR SELECT USING (status = 'published' AND published_at <= NOW()); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can view draft content from their org" ON content_nodes FOR SELECT TO authenticated USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Editors can create content" ON content_nodes FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'editor', 'author'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Authors can edit their content" ON content_nodes FOR UPDATE TO authenticated USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND organization_id = content_nodes.organization_id AND role IN ('super_admin', 'admin', 'editor'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Public media is viewable" ON media_assets FOR SELECT USING (is_public = true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can view org media" ON media_assets FOR SELECT TO authenticated USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can upload to their org" ON media_assets FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'editor', 'author'))); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- INITIAL DATA
-- ============================================
INSERT INTO organizations (slug, name, settings)
VALUES ('default', 'Default Organization', '{"features": ["ai", "geo", "i18n"]}')
ON CONFLICT DO NOTHING;