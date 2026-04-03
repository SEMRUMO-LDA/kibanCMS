-- =============================================
-- KIBAN CMS - API Keys Migration
-- =============================================
-- This migration creates the API keys system for authenticating frontend requests
--
-- Features:
-- - Generate and store API keys per user/profile
-- - Track key usage and last used timestamp
-- - Revoke keys when needed
-- - Automatic key generation on profile creation
--
-- Usage:
-- Run this in Supabase SQL Editor
-- =============================================

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default API Key',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "kiban_12")
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,

  CONSTRAINT api_keys_name_check CHECK (length(name) <= 100)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_profile_id ON api_keys(profile_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked_at) WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own api keys" ON api_keys;
DROP POLICY IF EXISTS "Users can create own api keys" ON api_keys;
DROP POLICY IF EXISTS "Users can update own api keys" ON api_keys;
DROP POLICY IF EXISTS "Users can delete own api keys" ON api_keys;

-- Policy: Users can view their own API keys
CREATE POLICY "Users can view own api keys"
  ON api_keys FOR SELECT
  USING (
    profile_id = auth.uid()
  );

-- Policy: Users can create their own API keys
CREATE POLICY "Users can create own api keys"
  ON api_keys FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
  );

-- Policy: Users can update (revoke) their own API keys
CREATE POLICY "Users can update own api keys"
  ON api_keys FOR UPDATE
  USING (
    profile_id = auth.uid()
  );

-- Policy: Users can delete their own API keys
CREATE POLICY "Users can delete own api keys"
  ON api_keys FOR DELETE
  USING (
    profile_id = auth.uid()
  );

-- Function: Generate API key
-- This generates a secure random API key in format: kiban_live_xxxxxxxxxxxxxxxxxxxxxxxx
-- The key is hashed before storage for security
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS TEXT AS $$
DECLARE
  key_value TEXT;
BEGIN
  -- Generate random key: kiban_live_ + 32 random chars
  key_value := 'kiban_live_' || encode(gen_random_bytes(24), 'base64');
  -- Remove base64 chars that might cause issues
  key_value := replace(key_value, '+', '');
  key_value := replace(key_value, '/', '');
  key_value := replace(key_value, '=', '');

  RETURN key_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Hash API key for storage
CREATE OR REPLACE FUNCTION hash_api_key(key_value TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Use SHA-256 to hash the key
  RETURN encode(digest(key_value, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get key prefix for display (first 12 chars)
CREATE OR REPLACE FUNCTION get_key_prefix(key_value TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN substring(key_value from 1 for 17) || '...';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Create default API key for existing profiles
-- Run this once to create keys for all existing users
CREATE OR REPLACE FUNCTION create_default_api_keys()
RETURNS void AS $$
DECLARE
  profile_record RECORD;
  new_key TEXT;
BEGIN
  FOR profile_record IN
    SELECT id FROM profiles
    WHERE NOT EXISTS (
      SELECT 1 FROM api_keys WHERE profile_id = profiles.id
    )
  LOOP
    new_key := generate_api_key();

    INSERT INTO api_keys (profile_id, name, key_hash, key_prefix)
    VALUES (
      profile_record.id,
      'Default API Key',
      hash_api_key(new_key),
      get_key_prefix(new_key)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-create API key on profile creation
CREATE OR REPLACE FUNCTION auto_create_api_key()
RETURNS TRIGGER AS $$
DECLARE
  new_key TEXT;
BEGIN
  new_key := generate_api_key();

  INSERT INTO api_keys (profile_id, name, key_hash, key_prefix)
  VALUES (
    NEW.id,
    'Default API Key',
    hash_api_key(new_key),
    get_key_prefix(new_key)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to profiles table
DROP TRIGGER IF EXISTS trigger_auto_create_api_key ON profiles;
CREATE TRIGGER trigger_auto_create_api_key
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_api_key();

-- Create default keys for existing profiles
SELECT create_default_api_keys();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON api_keys TO authenticated;

COMMENT ON TABLE api_keys IS 'API keys for authenticating frontend applications';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key (never store plain key)';
COMMENT ON COLUMN api_keys.key_prefix IS 'First chars of key for display purposes (e.g., kiban_live_abc...)';
COMMENT ON COLUMN api_keys.last_used_at IS 'Timestamp of last API request using this key';
COMMENT ON COLUMN api_keys.revoked_at IS 'When key was revoked (NULL = active)';
