-- ============================================================
-- kibanCMS - Migration 003: Hooks, Audit Trail, Smart Media
-- Version: 3.0.0
-- Description: Webhooks, audit logging, media processing
-- REQUIRES: 001 + 002
-- ============================================================

-- ============================================
-- ENUMS
-- ============================================
DO $$ BEGIN CREATE TYPE webhook_event AS ENUM ('content.created', 'content.updated', 'content.published', 'content.archived', 'content.deleted', 'media.uploaded', 'media.processed', 'media.deleted', 'user.created', 'user.updated', 'user.login', 'user.logout', 'organization.updated', 'ai.task.completed', 'ai.task.failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE webhook_status AS ENUM ('active', 'inactive', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE webhook_method AS ENUM ('POST', 'PUT', 'PATCH'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete', 'restore', 'publish', 'unpublish', 'archive', 'unarchive', 'approve', 'reject', 'lock', 'unlock', 'share', 'unshare', 'export', 'import', 'login', 'logout', 'password_change', 'permission_change'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE audit_entity_type AS ENUM ('content_node', 'media_asset', 'taxonomy', 'user', 'organization', 'webhook', 'api_key', 'role'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE media_processing_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE media_transformation AS ENUM ('resize', 'crop', 'rotate', 'compress', 'format', 'watermark', 'blur', 'grayscale', 'thumbnail', 'webp', 'avif', 'progressive'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    method webhook_method DEFAULT 'POST',
    headers JSONB DEFAULT '{}',
    events webhook_event[] NOT NULL,
    filters JSONB DEFAULT '{}',
    retry_enabled BOOLEAN DEFAULT true,
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 30,
    secret TEXT,
    verify_ssl BOOLEAN DEFAULT true,
    status webhook_status DEFAULT 'active',
    last_triggered_at TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event webhook_event NOT NULL,
    event_id UUID,
    payload JSONB NOT NULL,
    request_headers JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body TEXT,
    attempt INTEGER DEFAULT 1,
    duration_ms INTEGER,
    error_message TEXT,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    user_role user_role,
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    action audit_action NOT NULL,
    entity_type audit_entity_type NOT NULL,
    entity_id UUID,
    entity_data JSONB,
    changes JSONB,
    previous_values JSONB,
    new_values JSONB,
    context JSONB DEFAULT '{}',
    tags TEXT[],
    severity TEXT DEFAULT 'info',
    retention_days INTEGER DEFAULT 2555,
    encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS content_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL REFERENCES content_nodes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_snapshot JSONB NOT NULL,
    translations_snapshot JSONB,
    metadata_snapshot JSONB,
    label TEXT,
    description TEXT,
    is_major BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    parent_version_id UUID REFERENCES content_versions(id),
    diff_from_parent JSONB,
    created_by UUID NOT NULL REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    published_at TIMESTAMPTZ,
    UNIQUE(node_id, version_number)
);

CREATE TABLE IF NOT EXISTS media_processing_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    transformation media_transformation NOT NULL,
    parameters JSONB NOT NULL,
    priority INTEGER DEFAULT 5,
    status media_processing_status DEFAULT 'pending',
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    file_size_before BIGINT,
    file_size_after BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS media_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    variant_key TEXT NOT NULL,
    transformation_params JSONB NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    cdn_url TEXT,
    width INTEGER,
    height INTEGER,
    quality INTEGER,
    format TEXT,
    is_progressive BOOLEAN DEFAULT false,
    has_transparency BOOLEAN DEFAULT false,
    color_space TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(original_media_id, variant_key)
);

CREATE TABLE IF NOT EXISTS media_metadata (
    media_id UUID PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
    exif JSONB,
    camera_make TEXT,
    camera_model TEXT,
    lens TEXT,
    focal_length FLOAT,
    aperture FLOAT,
    shutter_speed TEXT,
    iso INTEGER,
    taken_at TIMESTAMPTZ,
    gps_coordinates geography(POINT, 4326),
    dominant_colors JSONB,
    faces_detected INTEGER DEFAULT 0,
    faces_data JSONB,
    text_detected TEXT,
    objects_detected JSONB,
    duration_seconds FLOAT,
    fps FLOAT,
    bitrate INTEGER,
    codec TEXT,
    audio_channels INTEGER,
    audio_sample_rate INTEGER,
    auto_alt_text TEXT,
    auto_caption TEXT,
    transcription TEXT,
    is_animated BOOLEAN DEFAULT false,
    frame_count INTEGER,
    has_audio BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS cdn_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    base_url TEXT NOT NULL,
    default_transformations JSONB DEFAULT '{}',
    auto_webp BOOLEAN DEFAULT true,
    auto_avif BOOLEAN DEFAULT false,
    lazy_loading BOOLEAN DEFAULT true,
    responsive_images BOOLEAN DEFAULT true,
    quality INTEGER DEFAULT 85,
    max_width INTEGER DEFAULT 2048,
    max_height INTEGER DEFAULT 2048,
    signed_urls BOOLEAN DEFAULT false,
    url_expiry_seconds INTEGER,
    allowed_domains TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION trigger_webhook(
    p_event webhook_event,
    p_entity_id UUID,
    p_payload JSONB
)
RETURNS void AS $$
DECLARE
    webhook RECORD;
BEGIN
    FOR webhook IN
        SELECT * FROM webhook_endpoints
        WHERE status = 'active'
        AND p_event = ANY(events)
        AND organization_id = current_setting('app.organization_id', true)::UUID
    LOOP
        INSERT INTO webhook_logs (endpoint_id, event, event_id, payload)
        VALUES (webhook.id, p_event, p_entity_id, p_payload);

        PERFORM pg_notify(
            'webhook_queue',
            json_build_object(
                'endpoint_id', webhook.id,
                'event', p_event,
                'payload', p_payload
            )::text
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
    v_action audit_action;
    v_entity_type audit_entity_type;
    v_changes JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_changes := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_changes := to_jsonb(OLD);
    END IF;

    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'content_nodes' THEN 'content_node'
        WHEN 'media_assets' THEN 'media_asset'
        WHEN 'taxonomies' THEN 'taxonomy'
        WHEN 'profiles' THEN 'user'
        ELSE 'content_node'
    END;

    INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, changes, created_at)
    VALUES (
        current_setting('app.organization_id', true)::UUID,
        current_setting('app.user_id', true)::UUID,
        v_action, v_entity_type,
        COALESCE(NEW.id, OLD.id),
        v_changes, NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_content_version()
RETURNS TRIGGER AS $$
DECLARE
    v_version_number INTEGER;
BEGIN
    IF OLD.content_blocks IS DISTINCT FROM NEW.content_blocks OR
       OLD.status IS DISTINCT FROM NEW.status THEN
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
        FROM content_versions WHERE node_id = NEW.id;

        INSERT INTO content_versions (node_id, version_number, content_snapshot, is_published, created_by)
        VALUES (NEW.id, v_version_number, to_jsonb(NEW), NEW.status = 'published', NEW.updated_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION queue_media_processing()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO media_processing_queue (media_id, transformation, parameters, priority)
    VALUES (NEW.id, 'thumbnail', '{"width": 150, "height": 150, "fit": "cover"}', 10);

    IF NEW.mime_type LIKE 'image/%' AND NEW.mime_type != 'image/webp' THEN
        INSERT INTO media_processing_queue (media_id, transformation, parameters, priority)
        VALUES (NEW.id, 'webp', '{"quality": 85}', 5);
    END IF;

    IF NEW.mime_type LIKE 'image/%' THEN
        INSERT INTO media_processing_queue (media_id, transformation, parameters, priority)
        VALUES
            (NEW.id, 'resize', '{"width": 320, "suffix": "small"}', 5),
            (NEW.id, 'resize', '{"width": 768, "suffix": "medium"}', 5),
            (NEW.id, 'resize', '{"width": 1024, "suffix": "large"}', 5),
            (NEW.id, 'resize', '{"width": 1920, "suffix": "xlarge"}', 5);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_content_webhook()
RETURNS TRIGGER AS $$
DECLARE
    v_event webhook_event;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_event := 'content.created';
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != 'published' AND NEW.status = 'published' THEN
            v_event := 'content.published';
        ELSIF OLD.status != 'archived' AND NEW.status = 'archived' THEN
            v_event := 'content.archived';
        ELSE
            v_event := 'content.updated';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_event := 'content.deleted';
    END IF;

    PERFORM trigger_webhook(v_event, COALESCE(NEW.id, OLD.id), to_jsonb(COALESCE(NEW, OLD)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS audit_content_nodes ON content_nodes;
CREATE TRIGGER audit_content_nodes AFTER INSERT OR UPDATE OR DELETE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

DROP TRIGGER IF EXISTS audit_media_assets ON media_assets;
CREATE TRIGGER audit_media_assets AFTER INSERT OR UPDATE OR DELETE ON media_assets
    FOR EACH ROW EXECUTE FUNCTION log_audit_trail();

DROP TRIGGER IF EXISTS version_content_nodes ON content_nodes;
CREATE TRIGGER version_content_nodes AFTER UPDATE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION create_content_version();

DROP TRIGGER IF EXISTS process_media_upload ON media_assets;
CREATE TRIGGER process_media_upload AFTER INSERT ON media_assets
    FOR EACH ROW EXECUTE FUNCTION queue_media_processing();

DROP TRIGGER IF EXISTS webhook_content_changes ON content_nodes;
CREATE TRIGGER webhook_content_changes AFTER INSERT OR UPDATE OR DELETE ON content_nodes
    FOR EACH ROW EXECUTE FUNCTION trigger_content_webhook();

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_status ON webhook_endpoints(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_endpoint ON webhook_logs(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_versions_node ON content_versions(node_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_created ON content_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_processing_status ON media_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_media_processing_media ON media_processing_queue(media_id);
CREATE INDEX IF NOT EXISTS idx_media_variants_original ON media_variants(original_media_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can manage org webhooks" ON webhook_endpoints TO authenticated USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can view org audit logs" ON audit_logs FOR SELECT TO authenticated USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can view content versions" ON content_versions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM content_nodes WHERE content_nodes.id = content_versions.node_id AND content_nodes.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))); EXCEPTION WHEN duplicate_object THEN null; END $$;