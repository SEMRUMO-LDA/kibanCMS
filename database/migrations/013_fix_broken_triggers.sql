-- ============================================================
-- kibanCMS - Migration 013: Fix Broken Triggers
-- Date: 2026-04-03
--
-- PROBLEM: Triggers fire on INSERT/UPDATE but reference tables
-- that don't exist (entry_revisions, webhooks, webhook_deliveries).
-- This causes every write operation to fail silently, hanging the admin.
--
-- FIX: Create missing tables, then ensure triggers are safe.
-- ============================================================

BEGIN;

-- ============================================
-- STEP 1: DIAGNOSTIC — show what's broken
-- ============================================

-- List all triggers on our tables
-- (run this SELECT separately to see current state)
-- SELECT trigger_name, event_object_table, action_statement
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public'
-- ORDER BY event_object_table, trigger_name;

-- ============================================
-- STEP 2: CREATE MISSING TABLES
-- These are referenced by triggers from migration 001/009
-- ============================================

-- entry_revisions (referenced by create_entry_revision trigger on entries)
CREATE TABLE IF NOT EXISTS entry_revisions (
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

CREATE INDEX IF NOT EXISTS idx_entry_revisions_entry_id ON entry_revisions(entry_id);

ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revisions_select" ON entry_revisions
    FOR SELECT TO authenticated USING (true);

-- webhooks (referenced by trigger_webhooks_on_entry_change trigger on entries)
CREATE TABLE IF NOT EXISTS webhooks (
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

-- webhook_deliveries (referenced by trigger_webhooks_on_entry_change)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
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

-- ============================================
-- STEP 3: ENSURE TRIGGER FUNCTIONS ARE SAFE
-- Replace functions with versions that handle
-- missing data gracefully (no exceptions).
-- ============================================

-- Safe revision creator — handles missing columns gracefully
CREATE OR REPLACE FUNCTION create_entry_revision()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create revision if content actually changed
    IF OLD.content IS DISTINCT FROM NEW.content OR
       OLD.title IS DISTINCT FROM NEW.title OR
       OLD.excerpt IS DISTINCT FROM NEW.excerpt THEN
        BEGIN
            INSERT INTO entry_revisions (
                entry_id, version, title, content, excerpt, meta, revised_by
            ) VALUES (
                OLD.id, OLD.version, OLD.title, OLD.content, OLD.excerpt, OLD.meta, NEW.author_id
            );
            NEW.version = OLD.version + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Log but don't fail the main operation
            RAISE WARNING 'Failed to create entry revision: %', SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Safe webhook trigger — handles missing tables/data gracefully
CREATE OR REPLACE FUNCTION trigger_webhooks_on_entry_change()
RETURNS TRIGGER AS $$
DECLARE
    event_type TEXT;
    webhook_rec RECORD;
    collection_slug TEXT;
BEGIN
    -- Determine event type
    IF TG_OP = 'INSERT' THEN
        event_type := 'entry.created';
    ELSIF TG_OP = 'UPDATE' THEN
        event_type := 'entry.updated';
    ELSIF TG_OP = 'DELETE' THEN
        event_type := 'entry.deleted';
    END IF;

    BEGIN
        -- Get collection slug
        SELECT slug INTO collection_slug
        FROM collections
        WHERE id = COALESCE(NEW.collection_id, OLD.collection_id);

        -- Find matching webhooks and create delivery jobs
        FOR webhook_rec IN
            SELECT * FROM webhooks
            WHERE enabled = true
            AND event_type = ANY(events)
            AND (
                collections IS NULL
                OR array_length(collections, 1) = 0
                OR collection_slug = ANY(collections)
            )
        LOOP
            INSERT INTO webhook_deliveries (
                webhook_id, event_type, payload, url
            ) VALUES (
                webhook_rec.id,
                event_type,
                jsonb_build_object(
                    'event', event_type,
                    'collection', collection_slug,
                    'entry', CASE
                        WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
                        ELSE to_jsonb(NEW)
                    END,
                    'timestamp', NOW()
                ),
                webhook_rec.url
            );
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the main operation
        RAISE WARNING 'Webhook trigger failed: %', SQLERRM;
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: ENSURE TRIGGERS EXIST (recreate if needed)
-- ============================================

-- Entry revision trigger
DROP TRIGGER IF EXISTS create_revision_on_entry_update ON entries;
CREATE TRIGGER create_revision_on_entry_update
    BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION create_entry_revision();

-- Webhook trigger
DROP TRIGGER IF EXISTS entries_webhook_trigger ON entries;
CREATE TRIGGER entries_webhook_trigger
    AFTER INSERT OR UPDATE OR DELETE ON entries
    FOR EACH ROW EXECUTE FUNCTION trigger_webhooks_on_entry_change();

-- Timestamp triggers
DROP TRIGGER IF EXISTS update_entries_updated_at ON entries;
CREATE TRIGGER update_entries_updated_at
    BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_collections_updated_at ON collections;
CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_updated_at ON media;
CREATE TRIGGER update_media_updated_at
    BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 5: WEBHOOK RLS (if tables were just created)
-- ============================================

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Drop existing webhook policies (clean slate)
DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'webhooks' AND schemaname = 'public'
    LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON webhooks'; END LOOP;
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'webhook_deliveries' AND schemaname = 'public'
    LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON webhook_deliveries'; END LOOP;
END $$;

CREATE POLICY "webhooks_select" ON webhooks
    FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "webhooks_insert" ON webhooks
    FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "webhooks_update" ON webhooks
    FOR UPDATE TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "webhooks_delete" ON webhooks
    FOR DELETE TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "deliveries_select" ON webhook_deliveries
    FOR SELECT TO authenticated
    USING (webhook_id IN (SELECT id FROM webhooks WHERE profile_id = auth.uid()));

COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT trigger_name, event_object_table, action_timing, event_manipulation
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public'
-- ORDER BY event_object_table, trigger_name;
