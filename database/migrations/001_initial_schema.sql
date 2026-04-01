-- kibanCMS Database Schema
-- Version: 1.0.0
-- Description: Initial schema for kibanCMS with RLS policies

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE content_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE collection_type AS ENUM ('post', 'page', 'custom');

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Collections table (defines content types)
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    type collection_type DEFAULT 'custom' NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]', -- Schema definition for entries
    settings JSONB DEFAULT '{}', -- Collection-specific settings
    icon TEXT, -- Icon identifier for UI
    color TEXT, -- Hex color for UI
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Entries table (actual content)
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}', -- Flexible content storage
    excerpt TEXT,
    featured_image UUID, -- References media table
    status content_status DEFAULT 'draft' NOT NULL,
    published_at TIMESTAMPTZ,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    meta JSONB DEFAULT '{}', -- SEO and custom metadata
    tags TEXT[] DEFAULT '{}',
    version INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(collection_id, slug)
);

-- Media table (file metadata)
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL, -- Path in Supabase Storage
    bucket_name TEXT DEFAULT 'media' NOT NULL,
    dimensions JSONB, -- {width, height} for images
    alt_text TEXT,
    caption TEXT,
    metadata JSONB DEFAULT '{}', -- EXIF data, etc.
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    folder_path TEXT DEFAULT '/',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Entry revisions table (version history)
CREATE TABLE entry_revisions (
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
-- INDEXES
-- ============================================
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_collections_slug ON collections(slug);
CREATE INDEX idx_entries_collection_id ON entries(collection_id);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_author_id ON entries(author_id);
CREATE INDEX idx_entries_published_at ON entries(published_at DESC);
CREATE INDEX idx_entries_tags ON entries USING GIN(tags);
CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_media_mime_type ON media(mime_type);
CREATE INDEX idx_entry_revisions_entry_id ON entry_revisions(entry_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entries_updated_at BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

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

CREATE TRIGGER create_revision_on_entry_update
    BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION create_entry_revision();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Collections policies
CREATE POLICY "Collections are viewable by authenticated users"
    ON collections FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admins can create collections"
    ON collections FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Only admins can update collections"
    ON collections FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Only admins can delete collections"
    ON collections FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Entries policies
CREATE POLICY "Published entries are viewable by everyone"
    ON entries FOR SELECT
    USING (status = 'published' OR auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create entries"
    ON entries FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = author_id AND
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'editor')
        )
    );

CREATE POLICY "Users can update their own entries"
    ON entries FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = author_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Authors and admins can delete entries"
    ON entries FOR DELETE
    TO authenticated
    USING (
        auth.uid() = author_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Media policies
CREATE POLICY "Media viewable by authenticated users"
    ON media FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can upload media"
    ON media FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = uploaded_by AND
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'editor')
        )
    );

CREATE POLICY "Users can update their own media"
    ON media FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = uploaded_by OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can delete their own media"
    ON media FOR DELETE
    TO authenticated
    USING (
        auth.uid() = uploaded_by OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Entry revisions policies
CREATE POLICY "Revisions viewable by authenticated users"
    ON entry_revisions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM entries
            WHERE entries.id = entry_revisions.entry_id
            AND (
                entries.author_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'editor')
                )
            )
        )
    );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user can edit content
CREATE OR REPLACE FUNCTION can_edit_content(user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id
        AND role IN ('admin', 'editor')
    );
$$ LANGUAGE sql SECURITY DEFINER;