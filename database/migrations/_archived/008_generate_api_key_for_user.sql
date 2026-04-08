-- =============================================
-- KIBAN CMS - Generate New API Key (User-Facing)
-- =============================================
-- This function generates a NEW API key and RETURNS it
-- so the user can copy it. The plain key is never stored.
--
-- Usage in Supabase SQL Editor:
-- SELECT * FROM generate_new_api_key_for_user('5e3a6844-9c54-4500-9705-d88984cf9fca', 'My Frontend Key');
-- =============================================

CREATE OR REPLACE FUNCTION generate_new_api_key_for_user(
  user_profile_id UUID,
  key_name TEXT DEFAULT 'API Key'
)
RETURNS TABLE(
  api_key TEXT,
  key_id UUID,
  key_prefix TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  new_key TEXT;
  new_key_id UUID;
  new_key_prefix TEXT;
  new_created_at TIMESTAMPTZ;
BEGIN
  -- Generate random key: kiban_live_ + 32 random chars
  new_key := 'kiban_live_' || encode(gen_random_bytes(24), 'base64');
  new_key := replace(new_key, '+', '');
  new_key := replace(new_key, '/', '');
  new_key := replace(new_key, '=', '');

  -- Calculate prefix for display
  new_key_prefix := substring(new_key from 1 for 17) || '...';

  -- Insert into database (only hash is stored)
  INSERT INTO api_keys (profile_id, name, key_hash, key_prefix)
  VALUES (
    user_profile_id,
    key_name,
    encode(digest(new_key, 'sha256'), 'hex'),
    new_key_prefix
  )
  RETURNING id, api_keys.created_at
  INTO new_key_id, new_created_at;

  -- Return the FULL key (this is the only time you'll see it!)
  RETURN QUERY SELECT
    new_key,
    new_key_id,
    new_key_prefix,
    new_created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permission to authenticated users
GRANT EXECUTE ON FUNCTION generate_new_api_key_for_user(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION generate_new_api_key_for_user IS 'Generates a new API key and returns it. This is the ONLY time the full key is visible. Copy it immediately!';
