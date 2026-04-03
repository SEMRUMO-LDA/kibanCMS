# Database Migrations

## v1.0 (Production)
- 001_initial_schema.sql - Core tables (collections, entries, media, profiles)
- 007_api_keys.sql - API authentication
- 008_generate_api_key_for_user.sql - Helper function
- 009_webhooks.sql - Webhook system

## v2.0 (Future)
See migrations-v2-backup/ for advanced features:
- Multi-tenancy (organizations)
- AI features
- Geo location
- Content analytics
- i18n support
