-- kibanCMS Advanced Database Schema
-- Version: 2.0.0
-- Features: PostGIS, pgvector, i18n, Block-based content, SEO optimization

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- For accent-insensitive search

-- ============================================
-- ENUMS (Idempotent)
-- ============================================

-- user_role
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'editor', 'author', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN 
        BEGIN
            ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
            ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'author';
        EXCEPTION WHEN OTHERS THEN null; END;
END $$;

-- content_status
DO $$ BEGIN
    CREATE TYPE content_status AS ENUM ('draft', 'review', 'scheduled', 'published', 'archived');
EXCEPTION
    WHEN duplicate_object THEN 
        BEGIN
            ALTER TYPE content_status ADD VALUE IF NOT EXISTS 'review';
            ALTER TYPE content_status ADD VALUE IF NOT EXISTS 'scheduled';
        EXCEPTION WHEN OTHERS THEN null; END;
END $$;

-- node_type
DO $$ BEGIN
    CREATE TYPE node_type AS ENUM ('page', 'post', 'product', 'directory', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- block_type
DO $$ BEGIN
    CREATE TYPE block_type AS ENUM (
        'heading', 'paragraph', 'image', 'video', 'code', 'quote',
        'list', 'table', 'divider', 'embed', 'callout', 'toggle',
        'columns', 'tabs', 'accordion', 'gallery', 'map', 'form',
        'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- locale_code
DO $$ BEGIN
    CREATE TYPE locale_code AS ENUM ('pt', 'en', 'es', 'fr', 'de');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- cache_strategy
DO $$ BEGIN
    CREATE TYPE cache_strategy AS ENUM ('none', 'swr', 'immutable', 'revalidate');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- CORE TABLES
-- ============================================

-- Organizations (Multi-tenancy support)
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

-- Enhanced Profiles with organization support (Idempotent)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    permissions JSONB DEFAULT '[]', -- Fine-grained permissions
    preferences JSONB DEFAULT '{}',
    locale locale_code DEFAULT 'pt',
    timezone TEXT DEFAULT 'Europe/Lisbon',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ensure profiles has organization_id if it was created in v1
DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Content Nodes (Polymorphic content table)
CREATE TABLE IF NOT EXISTS content_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type node_type NOT NULL,
    parent_id UUID REFERENCES content_nodes(id) ON DELETE CASCADE,
    template TEXT, -- Template identifier for custom rendering

    -- Block-based content structure
    content_blocks JSONB NOT NULL DEFAULT '[]', -- AST/Block structure
    content_version INTEGER DEFAULT 1,

    -- SEO & Meta
    seo_config JSONB DEFAULT '{}', -- Complete SEO configuration
    social_config JSONB DEFAULT '{}', -- OG tags, Twitter cards
    schema_markup JSONB, -- JSON-LD structured data

    -- Geo-location
    geo_location geography(POINT, 4326), -- PostGIS point
    geo_boundary geography(POLYGON, 4326), -- Service area/delivery zone
    geo_metadata JSONB DEFAULT '{}', -- Address, place_id, etc.

    -- AI Integration
    content_embedding vector(1536), -- OpenAI ada-002 embeddings
    summary_embedding vector(1536), -- Summary for semantic search
    keywords TEXT[], -- Extracted keywords
    entities JSONB, -- Named entities extraction
    sentiment_score FLOAT, -- -1 to 1

    -- Publishing
    status content_status DEFAULT 'draft' NOT NULL,
    published_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    -- Performance
    cache_strategy cache_strategy DEFAULT 'swr',
    cache_ttl INTEGER DEFAULT 3600, -- seconds

    -- Authorship & Versioning
    created_by UUID NOT NULL REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    published_by UUID REFERENCES profiles(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Indexes for hierarchy
    path TEXT, -- Materialized path for fast queries
    depth INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0 -- Order among siblings
);

-- Internationalization table
CREATE TABLE IF NOT EXISTS content_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    locale locale_code NOT NULL,
    is_primary BOOLEAN DEFAULT false,

    -- Translated content
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    excerpt TEXT,
    content_blocks JSONB NOT NULL DEFAULT '[]',

    -- Translated SEO
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT[],

    -- Translation metadata
    translated_by UUID REFERENCES profiles(id),
    translation_status TEXT DEFAULT 'draft', -- draft, review, approved
    machine_translated BOOLEAN DEFAULT false,
    translation_score FLOAT, -- Quality score 0-1

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(node_id, locale)
);

-- Media Library with AI metadata
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- File info
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    cdn_url TEXT,
    blurhash TEXT, -- Placeholder for lazy loading

    -- Dimensions & variants
    width INTEGER,
    height INTEGER,
    duration INTEGER, -- For videos in seconds
    variants JSONB DEFAULT '{}', -- Different sizes/formats

    -- AI-extracted metadata
    alt_text TEXT,
    caption TEXT,
    transcription TEXT, -- For videos/audio
    detected_objects JSONB, -- AI vision API results
    detected_text TEXT, -- OCR results
    dominant_colors TEXT[], -- For design matching
    content_embedding vector(512), -- Visual embedding for similarity search

    -- Organization
    folder_path TEXT DEFAULT '/',
    tags TEXT[],

    -- Permissions
    is_public BOOLEAN DEFAULT false,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Taxonomies (Categories, Tags, Custom)
CREATE TABLE IF NOT EXISTS taxonomies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- category, tag, custom
    parent_id UUID REFERENCES taxonomies(id) ON DELETE CASCADE,

    -- Multilingual support
    translations JSONB NOT NULL DEFAULT '{}', -- {locale: {name, slug, description}}

    -- Visual
    icon TEXT,
    color TEXT,
    image_id UUID REFERENCES media_assets(id),

    -- SEO
    seo_config JSONB DEFAULT '{}',

    -- Hierarchy
    path TEXT,
    depth INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Content-Taxonomy relationships
CREATE TABLE IF NOT EXISTS content_taxonomies (
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    taxonomy_id UUID NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (node_id, taxonomy_id)
);

-- Content Revisions with diff tracking
CREATE TABLE IF NOT EXISTS content_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,

    -- Snapshot
    content_blocks JSONB NOT NULL,
    translations JSONB, -- All translations at this version

    -- Change tracking
    change_summary TEXT,
    changed_fields TEXT[],
    diff JSONB, -- JSON Patch format

    -- Metadata
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(node_id, version)
);

-- Analytics & Performance
CREATE TABLE IF NOT EXISTS content_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Metrics
    views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    average_time_seconds INTEGER DEFAULT 0,
    bounce_rate FLOAT,

    -- Engagement
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,

    -- SEO Performance
    organic_traffic INTEGER DEFAULT 0,
    search_impressions INTEGER DEFAULT 0,
    average_position FLOAT,

    -- Geographic distribution
    visitor_countries JSONB DEFAULT '{}',
    visitor_cities JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (node_id, date)
);

-- AI Processing Queue
CREATE TABLE IF NOT EXISTS ai_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Task info
    type TEXT NOT NULL, -- 'generate_embedding', 'extract_entities', 'translate', etc.
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    priority INTEGER DEFAULT 5,

    -- Target
    entity_type TEXT NOT NULL, -- 'content_node', 'media_asset'
    entity_id UUID NOT NULL,

    -- Processing
    input JSONB NOT NULL,
    output JSONB,
    error TEXT,

    -- Tracking
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

-- Content Nodes
CREATE INDEX idx_content_nodes_org ON content_nodes(organization_id);
CREATE INDEX idx_content_nodes_type ON content_nodes(type);
CREATE INDEX idx_content_nodes_status ON content_nodes(status);
CREATE INDEX idx_content_nodes_published ON content_nodes(published_at DESC);
CREATE INDEX idx_content_nodes_path ON content_nodes(path);
CREATE INDEX idx_content_nodes_parent ON content_nodes(parent_id);
CREATE INDEX idx_content_nodes_geo ON content_nodes USING GIST(geo_location);
CREATE INDEX idx_content_nodes_embedding ON content_nodes USING ivfflat(content_embedding vector_cosine_ops);

-- Translations
CREATE INDEX idx_translations_node ON content_translations(node_id);
CREATE INDEX idx_translations_locale ON content_translations(locale);
CREATE INDEX idx_translations_slug ON content_translations(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_unique_slug ON content_translations(node_id, locale, slug); -- node_id already implies organization_id

-- Media
CREATE INDEX idx_media_org ON media_assets(organization_id);
CREATE INDEX idx_media_mime ON media_assets(mime_type);
CREATE INDEX idx_media_folder ON media_assets(folder_path);
CREATE INDEX idx_media_embedding ON media_assets USING ivfflat(content_embedding vector_cosine_ops);

-- Full-text search
CREATE INDEX idx_content_search ON content_translations USING GIN(
    to_tsvector('portuguese', unaccent(title) || ' ' || unaccent(excerpt))
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate slug
CREATE OR REPLACE FUNCTION generate_slug(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                unaccent(input_text),
                '[^a-z0-9\-_]+', '-', 'gi'
            ),
            '\-+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to update materialized path
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

-- Function to calculate content similarity
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
            SELECT content_embedding FROM content_nodes WHERE id = target_id
        )) AS similarity
    FROM content_nodes cn
    JOIN content_translations ct ON cn.id = ct.node_id AND ct.is_primary = true
    WHERE cn.id != target_id
        AND cn.content_embedding IS NOT NULL
    ORDER BY similarity DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Function to find nearby content
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

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE TRIGGER update_content_nodes_updated_at BEFORE UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_translations_updated_at BEFORE UPDATE ON content_translations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_assets_updated_at BEFORE UPDATE ON media_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update content path
CREATE TRIGGER update_content_path_trigger BEFORE INSERT OR UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION update_content_path();

-- Auto-generate embedding on content change
CREATE OR REPLACE FUNCTION queue_embedding_generation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR OLD.content_blocks IS DISTINCT FROM NEW.content_blocks THEN
        INSERT INTO ai_tasks (
            organization_id,
            type,
            entity_type,
            entity_id,
            input
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

CREATE TRIGGER queue_content_embedding AFTER INSERT OR UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION queue_embedding_generation();

-- ============================================
-- ROW LEVEL SECURITY (RLS) - Enhanced
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Content Nodes policies with organization isolation
CREATE POLICY "Published content is public"
    ON content_nodes FOR SELECT
    USING (status = 'published' AND published_at <= NOW());

CREATE POLICY "Users can view draft content from their org"
    ON content_nodes FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Editors can create content"
    ON content_nodes FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin', 'editor', 'author')
        )
    );

CREATE POLICY "Authors can edit their content"
    ON content_nodes FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND organization_id = content_nodes.organization_id
            AND role IN ('super_admin', 'admin', 'editor')
        )
    );

-- Media policies with organization isolation
CREATE POLICY "Public media is viewable"
    ON media_assets FOR SELECT
    USING (is_public = true);

CREATE POLICY "Users can view org media"
    ON media_assets FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can upload to their org"
    ON media_assets FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin', 'editor', 'author')
        )
    );

-- ============================================
-- INITIAL DATA
-- ============================================

-- Create default organization
INSERT INTO organizations (slug, name, settings)
VALUES ('default', 'Default Organization', '{"features": ["ai", "geo", "i18n"]}')
ON CONFLICT DO NOTHING;