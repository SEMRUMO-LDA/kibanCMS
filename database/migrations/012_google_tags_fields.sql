-- =============================================================
-- 012 — Google tags (GA4 / Google Ads / GTM) installed by Kiban
--
-- IDEMPOTENT. Included in database/UPGRADE_TENANT.sql. Only adds the
-- fields to the SEO add-on form (no new tables); without it the Google
-- options just don't appear in Content → SEO Settings.
-- =============================================================

DO $$
DECLARE
    _item RECORD;
BEGIN
    FOR _item IN
        SELECT * FROM (VALUES
            ('{"id": "google_ads_id", "name": "google_ads_id", "label": "Google Ads ID", "type": "text", "placeholder": "AW-123456789",
               "helpText": "Optional. Google Ads conversion ID (Google Ads → Goals → Conversions → Tag setup)"}'::jsonb),
            ('{"id": "google_autoload", "name": "google_autoload", "label": "Install Google tags automatically", "type": "boolean", "defaultValue": true,
               "helpText": "The Kiban widgets script installs Google Analytics / Ads / Tag Manager with Consent Mode v2, following the visitor''s cookie choice. Turn off if the site installs them itself."}'::jsonb),
            ('{"id": "google_consent_mode", "name": "google_consent_mode", "label": "Google Consent Mode", "type": "select",
               "options": [
                 {"label": "Basic — load Google only after consent (recommended, GDPR)", "value": "basic"},
                 {"label": "Advanced — load before consent, cookieless pings until the visitor accepts", "value": "advanced"}
               ],
               "helpText": "Advanced lets Google model conversions of visitors who refuse cookies, but sends cookieless data before consent — only if the client accepts that legal choice"}'::jsonb)
        ) AS v(field)
    LOOP
        UPDATE collections
           SET fields = COALESCE(fields, '[]'::jsonb) || jsonb_build_array(_item.field)
         WHERE slug = 'seo-settings'
           AND jsonb_typeof(COALESCE(fields, '[]'::jsonb)) = 'array'
           AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(fields, '[]'::jsonb)) f
                WHERE f->>'id' = _item.field->>'id'
           );
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
