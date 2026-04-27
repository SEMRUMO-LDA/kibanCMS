-- ============================================================
-- Migration 004 — Soft delete / Trash for entries (v1.6)
-- ============================================================
-- Adds a `deleted_at` timestamp column to entries. Existing DELETE behaviour
-- is replaced by an UPDATE that sets deleted_at = NOW(). Listings filter to
-- deleted_at IS NULL by default. A trash page lets admins restore or
-- permanently delete. After 30 days, a worker hard-deletes.
--
-- Run this on every tenant Supabase project. Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index speeds up "exclude trash" queries (the common case)
CREATE INDEX IF NOT EXISTS idx_entries_deleted_at ON entries (deleted_at);

-- Index for the trash listing (sorted by when deleted)
CREATE INDEX IF NOT EXISTS idx_entries_deleted_at_desc
  ON entries (deleted_at DESC) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN entries.deleted_at IS
  'Soft delete timestamp. NULL = active. Non-null = in trash. After 30 days, scheduled-publisher worker hard-deletes.';
