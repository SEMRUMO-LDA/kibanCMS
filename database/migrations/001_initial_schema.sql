-- ============================================================
-- kibanCMS - Migration 001: Initial Schema
-- Version: 1.0.0
-- Description: Core tables, functions, RLS policies
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'editor', 'author', 'viewer'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE content_status AS ENUM ('draft', 'review', 'scheduled', 'published', 'archived'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE collection_type AS ENUM ('post', 'page', 'custom'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- FUNCTIONS (generic, no table dependencies)
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    type collection_type DEFAULT 'custom' NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]',
    settings JSONB DEFAULT '{}',
    icon TEXT,
    color TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    excerpt TEXT,
    featured_image UUID,
    status content_status DEFAULT 'draft' NOT NULL,
    published_at TIMESTAMPTZ,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    meta JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    version INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(collection_id, slug)
);

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    bucket_name TEXT DEFAULT 'media' NOT NULL,
    dimensions JSONB,
    alt_text TEXT,
    caption TEXT,
    metadata JSONB DEFAULT '{}',
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    folder_path TEXT DEFAULT '/',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS entry_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    content JSONB NOT NULL,
    excerpt TEXT,
    meta JSONB,
    revised_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    revision_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(entry_id, version)
);

-- ============================================
-- FUNCTIONS (depend on tables above)
-- ============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create revision on entry update
CREATE OR REPLACE FUNCTION create_entry_revision()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content OR
       OLD.title IS DISTINCT FROM NEW.title OR
       OLD.excerpt IS DISTINCT FROM NEW.excerpt THEN
        INSERT INTO entry_revisions (
            entry_id, version, title, content, excerpt, meta, revised_by
        ) VALUES (
            OLD.id, OLD.version, OLD.title, OLD.content, OLD.excerpt, OLD.meta, NEW.author_id
        );
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper: check user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: check if user can edit
CREATE OR REPLACE FUNCTION can_edit_content(user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id
        AND role IN ('admin', 'editor')
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);
CREATE INDEX IF NOT EXISTS idx_entries_collection_id ON entries(collection_id);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_author_id ON entries(author_id);
CREATE INDEX IF NOT EXISTS idx_entries_published_at ON entries(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_tags ON entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_mime_type ON media(mime_type);
CREATE INDEX IF NOT EXISTS idx_entry_revisions_entry_id ON entry_revisions(entry_id);

-- ============================================
-- TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_collections_updated_at ON collections;
CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_entries_updated_at ON entries;
CREATE TRIGGER update_entries_updated_at BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_updated_at ON media;
CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS create_revision_on_entry_update ON entries;
CREATE TRIGGER create_revision_on_entry_update
    BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION create_entry_revision();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;

-- Profiles
DO $$ BEGIN CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Collections
DO $$ BEGIN CREATE POLICY "Collections are viewable by authenticated users" ON collections FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Only admins can create collections" ON collections FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Only admins can update collections" ON collections FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Only admins can delete collections" ON collections FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Entries
DO $$ BEGIN CREATE POLICY "Published entries are viewable by everyone" ON entries FOR SELECT USING (status = 'published' OR auth.uid() IS NOT NULL); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create entries" ON entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own entries" ON entries FOR UPDATE TO authenticated USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Authors and admins can delete entries" ON entries FOR DELETE TO authenticated USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Media
DO $$ BEGIN CREATE POLICY "Media viewable by authenticated users" ON media FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can upload media" ON media FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own media" ON media FOR UPDATE TO authenticated USING (auth.uid() = uploaded_by OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own media" ON media FOR DELETE TO authenticated USING (auth.uid() = uploaded_by OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Entry Revisions
DO $$ BEGIN CREATE POLICY "Revisions viewable by authenticated users" ON entry_revisions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_revisions.entry_id AND (entries.author_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'editor'))))); EXCEPTION WHEN duplicate_object THEN null; END $$;