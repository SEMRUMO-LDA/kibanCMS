-- =============================================================
-- 011 — Meta Conversions API fields on SEO settings
--
-- IDEMPOTENT. Included in database/UPGRADE_TENANT.sql. Only adds the
-- fields to the SEO add-on form (no new tables); without it the CAPI
-- settings just don't appear in Content → SEO Settings.
-- =============================================================

DO $$
DECLARE
    _item RECORD;
BEGIN
    FOR _item IN
        SELECT * FROM (VALUES
            ('{"id": "meta_capi_enabled", "name": "meta_capi_enabled", "label": "Meta Conversions API (CAPI)", "type": "boolean",
               "helpText": "Send Lead, CompleteRegistration and Purchase from the server (needs the Pixel ID above)"}'::jsonb),
            ('{"id": "meta_capi_access_token", "name": "meta_capi_access_token", "label": "CAPI Access Token", "type": "text",
               "helpText": "Events Manager → your Pixel → Settings → Conversions API → Generate access token. Never shown to the site."}'::jsonb),
            ('{"id": "meta_capi_test_event_code", "name": "meta_capi_test_event_code", "label": "CAPI Test Event Code", "type": "text",
               "placeholder": "TEST12345", "helpText": "Optional — to validate in Events Manager → Test events. Remove when live."}'::jsonb),
            ('{"id": "meta_capi_consent_mode", "name": "meta_capi_consent_mode", "label": "CAPI Consent", "type": "select",
               "options": [
                 {"label": "Only with marketing consent (recommended, GDPR)", "value": "required"},
                 {"label": "Always send (client has another legal basis)", "value": "always"}
               ],
               "helpText": "Default: an event is only sent when the visitor accepted marketing cookies"}'::jsonb)
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
