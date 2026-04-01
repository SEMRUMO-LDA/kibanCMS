-- kibanCMS Add-on System Migration
-- Version: 4.0.0

-- Add-on Registry (Stores the state of installed add-ons)
CREATE TABLE IF NOT EXISTS addon_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    addon_id TEXT NOT NULL UNIQUE,
    status JSONB NOT NULL DEFAULT '{"installed": true, "enabled": false}',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add-on Configurations (Stores versioned or specific configurations)
CREATE TABLE IF NOT EXISTS addon_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    addon_id TEXT NOT NULL REFERENCES addon_registry(addon_id) ON DELETE CASCADE,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(addon_id)
);

-- RPC Function to execute dynamic SQL (Required for auto-table creation)
-- WARNING: This function should be strictly controlled via RLS or only accessible to service_role
CREATE OR REPLACE FUNCTION execute_sql(query text)
RETURNS void AS $$
BEGIN
  EXECUTE query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE addon_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_configs ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
    CREATE POLICY "Admins can manage addon registry"
        ON addon_registry
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                AND profiles.role IN ('super_admin', 'admin')
            )
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins can manage addon configs"
        ON addon_configs
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                AND profiles.role IN ('super_admin', 'admin')
            )
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;
