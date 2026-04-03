# Archived Migrations

These migrations are **NOT safe to apply** and have been replaced.

## 003_hooks_audit_smart_media.sql
- **Problem:** References tables that don't exist (`content_nodes`, `media_assets`, `organizations`)
- **Impact:** Triggers will fail. Audit logging, media processing, content versioning won't work.
- **Replaced by:** Migration 009 (webhooks) is the working webhook implementation. Audit trail and media processing are deferred to v2.

## FIX_RLS_SECURITY.sql
- **Problem:** Uses `created_by` field on entries table, but the correct field is `author_id`. Also tries to use `status` on media table, which doesn't have that column.
- **Impact:** RLS policy silently fails, exposing all drafts to all authenticated users.
- **Replaced by:** Migration 010_security_hardening.sql contains all corrected RLS policies.
