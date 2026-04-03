-- =====================================================
-- Migration 009: Webhooks System
-- =====================================================
-- Purpose: Enable webhook notifications for content changes
-- Author: KibanCMS
-- Date: 2026-04-01
--
-- Features:
-- - Webhook endpoints configuration
-- - Event types (entry.created, entry.updated, entry.deleted, etc.)
-- - Delivery logs and retry mechanism
-- - HMAC signature for security
-- =====================================================

BEGIN;

-- =====================================================
-- 1. WEBHOOK ENDPOINTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Configuration
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(255) NOT NULL, -- For HMAC signature

  -- Events to listen to
  events TEXT[] NOT NULL DEFAULT '{}', -- ['entry.created', 'entry.updated', 'entry.deleted', 'media.uploaded']

  -- Filters
  collections TEXT[] DEFAULT '{}', -- Empty = all collections

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Stats
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  failed_deliveries INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_url CHECK (url ~ '^https?://'),
  CONSTRAINT has_events CHECK (array_length(events, 1) > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhooks_profile ON webhooks(profile_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN (events);

-- =====================================================
-- 2. WEBHOOK DELIVERIES LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Event data
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,

  -- Delivery
  url TEXT NOT NULL,
  http_method VARCHAR(10) NOT NULL DEFAULT 'POST',

  -- Response
  status_code INTEGER,
  response_body TEXT,
  response_headers JSONB,

  -- Timing
  duration_ms INTEGER,

  -- Status
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_status_code CHECK (status_code BETWEEN 100 AND 599)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success ON webhook_deliveries(success);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Webhooks policies: users can manage their own webhooks
CREATE POLICY "Users can view their own webhooks"
  ON webhooks FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can create their own webhooks"
  ON webhooks FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update their own webhooks"
  ON webhooks FOR UPDATE
  USING (profile_id = auth.uid());

CREATE POLICY "Users can delete their own webhooks"
  ON webhooks FOR DELETE
  USING (profile_id = auth.uid());

-- Webhook deliveries policies
CREATE POLICY "Users can view their webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    webhook_id IN (
      SELECT id FROM webhooks WHERE profile_id = auth.uid()
    )
  );

-- =====================================================
-- 4. FUNCTIONS
-- =====================================================

-- Function to generate webhook secret
CREATE OR REPLACE FUNCTION generate_webhook_secret()
RETURNS VARCHAR(255) AS $$
BEGIN
  RETURN 'whsec_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to trigger webhook on entry changes
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

  -- Get collection slug
  SELECT slug INTO collection_slug
  FROM collections
  WHERE id = COALESCE(NEW.collection_id, OLD.collection_id);

  -- Find matching webhooks
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
    -- Insert webhook delivery job
    INSERT INTO webhook_deliveries (
      webhook_id,
      event_type,
      payload,
      url
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS entries_webhook_trigger ON entries;

CREATE TRIGGER entries_webhook_trigger
  AFTER INSERT OR UPDATE OR DELETE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION trigger_webhooks_on_entry_change();

-- =====================================================
-- 6. UPDATE TIMESTAMPS TRIGGER
-- =====================================================
CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. COMMENTS
-- =====================================================
COMMENT ON TABLE webhooks IS 'Webhook endpoints configuration for event notifications';
COMMENT ON TABLE webhook_deliveries IS 'Log of all webhook delivery attempts';
COMMENT ON COLUMN webhooks.secret IS 'Secret key for HMAC signature (starts with whsec_)';
COMMENT ON COLUMN webhooks.events IS 'Array of event types to listen to';
COMMENT ON COLUMN webhook_deliveries.retry_count IS 'Number of retry attempts';

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- SELECT COUNT(*) FROM webhooks;
-- SELECT COUNT(*) FROM webhook_deliveries;
-- SELECT * FROM webhooks WHERE enabled = true;
