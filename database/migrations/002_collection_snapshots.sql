-- Collection Snapshots — "git tags" for content
-- Stores a full snapshot of all entries in a collection at a point in time.
-- Used for one-click rollback after bulk edits, bad imports, etc.

CREATE TABLE IF NOT EXISTS collection_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    entry_count INTEGER NOT NULL DEFAULT 0,
    entries_data JSONB NOT NULL DEFAULT '[]',  -- full entry objects at snapshot time
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast lookup by collection
CREATE INDEX IF NOT EXISTS idx_snapshots_collection_id ON collection_snapshots(collection_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON collection_snapshots(created_at);

-- RLS policies
ALTER TABLE collection_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY snapshots_select ON collection_snapshots
    FOR SELECT USING (true);

CREATE POLICY snapshots_insert ON collection_snapshots
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY snapshots_delete ON collection_snapshots
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
    );
