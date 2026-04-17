-- Atomic coupon usage counter bump
--
-- Used by lib/coupons.ts → confirmRedemption during Stripe webhook processing.
-- The previous pattern (SELECT usage_count, then UPDATE WHERE usage_count = old)
-- did not detect 0-row updates in supabase-js, so concurrent webhooks could
-- both mark redemptions confirmed while the counter only incremented once —
-- silently breaching max_uses_total. This function returns whether the
-- increment actually took effect, via ROW_COUNT after UPDATE.
--
-- jsonb_set preserves sibling keys so concurrent admin edits to other fields
-- of the coupon entry are not lost (previous code spread the whole content blob).

CREATE OR REPLACE FUNCTION bump_coupon_usage(
  entry_id UUID,
  expected_count INTEGER,
  new_count INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_rows INTEGER;
BEGIN
  UPDATE entries
  SET content = jsonb_set(content, '{usage_count}', to_jsonb(new_count)),
      updated_at = NOW()
  WHERE id = entry_id
    AND COALESCE((content->>'usage_count')::INTEGER, 0) = expected_count;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION bump_coupon_usage(UUID, INTEGER, INTEGER)
  TO authenticated, anon, service_role;
