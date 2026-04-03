-- ============================================================
-- kibanCMS v1.0 - COMPLETE DATABASE RESET & SEED
-- ⚠️  WARNING: This script will DELETE ALL DATA and rebuild everything
-- ============================================================
-- Instructions:
-- 1. Open Supabase SQL Editor
-- 2. Copy and paste this ENTIRE file
-- 3. Click "Run" to execute
-- 4. Refresh your kibanCMS admin interface
-- ============================================================

-- ============================
-- STEP 1: CLEAN EVERYTHING
-- ============================

-- Drop all tables (cascading will handle foreign keys)
DROP TABLE IF EXISTS entry_revisions CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop all custom types
DROP TYPE IF EXISTS collection_type CASCADE;
DROP TYPE IF EXISTS content_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ============================
-- STEP 2: CREATE ENUMS
-- ============================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'editor', 'author', 'viewer');
CREATE TYPE content_status AS ENUM ('draft', 'review', 'scheduled', 'published', 'archived');
CREATE TYPE collection_type AS ENUM ('post', 'page', 'custom');

-- ============================
-- STEP 3: CREATE TABLES
-- ============================

-- Profiles table (links to Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    onboarding_completed BOOLEAN DEFAULT false NOT NULL,
    project_manifesto JSONB DEFAULT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Collections table
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Entries table
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Media table
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- ============================
-- STEP 4: CREATE INDEXES
-- ============================

CREATE INDEX idx_entries_collection_id ON entries(collection_id);
CREATE INDEX idx_entries_author_id ON entries(author_id);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_published_at ON entries(published_at);
CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_collections_created_by ON collections(created_by);

-- ============================
-- STEP 5: RLS POLICIES
-- ============================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Collections: Authenticated users can read all collections
CREATE POLICY "Authenticated users can read collections"
  ON collections FOR SELECT
  TO authenticated
  USING (true);

-- Collections: Super admins and admins can create/update/delete
CREATE POLICY "Admins can manage collections"
  ON collections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- Entries: Authenticated users can read published entries
CREATE POLICY "Users can read published entries"
  ON entries FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'editor')
    )
  );

-- Entries: Authors can create entries
CREATE POLICY "Authors can create entries"
  ON entries FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'editor', 'author')
    )
  );

-- Entries: Authors can update their own entries, admins can update all
CREATE POLICY "Authors can update own entries"
  ON entries FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'editor')
    )
  );

-- Entries: Authors can delete their own entries, admins can delete all
CREATE POLICY "Authors can delete own entries"
  ON entries FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- Media: Authenticated users can read all media
CREATE POLICY "Authenticated users can read media"
  ON media FOR SELECT
  TO authenticated
  USING (true);

-- Media: Authenticated users can upload media
CREATE POLICY "Authenticated users can upload media"
  ON media FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- Media: Users can delete their own media, admins can delete all
CREATE POLICY "Users can delete own media"
  ON media FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- ============================
-- STEP 6: TRIGGERS
-- ============================

-- Auto-update updated_at timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entries_updated_at
    BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_updated_at
    BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================
-- STEP 7: SEED DATA
-- ============================

DO $$
DECLARE
    v_admin_id UUID;
    v_blog_id UUID;
    v_projects_id UUID;
    v_settings_id UUID;
BEGIN
    -- Get or create profile for the authenticated user
    -- IMPORTANT: Update this email to match your Supabase auth user
    SELECT id INTO v_admin_id
    FROM auth.users
    WHERE email = 'tpacheco@aorubro.pt'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'User tpacheco@aorubro.pt not found in auth.users! Please sign up first.';
    END IF;

    -- Create profile if it doesn't exist
    INSERT INTO profiles (id, email, full_name, role, onboarding_completed)
    VALUES (v_admin_id, 'tpacheco@aorubro.pt', 'Admin User', 'super_admin', true)
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin', onboarding_completed = true;

    RAISE NOTICE 'Profile created/updated for user: %', v_admin_id;

    -- ========================================
    -- COLLECTION 1: Blog Posts
    -- ========================================
    INSERT INTO collections (
        name,
        slug,
        description,
        type,
        icon,
        color,
        created_by,
        fields
    ) VALUES (
        'Blog Posts',
        'blog',
        'Articles and news updates',
        'post',
        'file-text',
        'blue',
        v_admin_id,
        jsonb_build_array(
            jsonb_build_object(
                'id', 'title',
                'name', 'Title',
                'type', 'text',
                'required', true,
                'maxLength', 200
            ),
            jsonb_build_object(
                'id', 'slug',
                'name', 'Slug',
                'type', 'text',
                'required', true,
                'maxLength', 200,
                'helpText', 'URL-friendly identifier'
            ),
            jsonb_build_object(
                'id', 'excerpt',
                'name', 'Excerpt',
                'type', 'textarea',
                'required', false,
                'maxLength', 500,
                'helpText', 'Short summary for previews'
            ),
            jsonb_build_object(
                'id', 'body',
                'name', 'Body Content',
                'type', 'richtext',
                'required', true,
                'helpText', 'Main article content (Markdown supported)'
            ),
            jsonb_build_object(
                'id', 'featured_image',
                'name', 'Featured Image',
                'type', 'image',
                'required', false,
                'helpText', 'Cover image for the post'
            ),
            jsonb_build_object(
                'id', 'published_date',
                'name', 'Published Date',
                'type', 'date',
                'required', false,
                'helpText', 'When this post was published'
            )
        )
    ) RETURNING id INTO v_blog_id;

    -- ========================================
    -- COLLECTION 2: Projects (Portfolio)
    -- ========================================
    INSERT INTO collections (
        name,
        slug,
        description,
        type,
        icon,
        color,
        created_by,
        fields
    ) VALUES (
        'Projects',
        'projects',
        'Portfolio showcase and case studies',
        'custom',
        'briefcase',
        'purple',
        v_admin_id,
        jsonb_build_array(
            jsonb_build_object(
                'id', 'title',
                'name', 'Project Title',
                'type', 'text',
                'required', true,
                'maxLength', 200
            ),
            jsonb_build_object(
                'id', 'slug',
                'name', 'Slug',
                'type', 'text',
                'required', true,
                'maxLength', 200
            ),
            jsonb_build_object(
                'id', 'client',
                'name', 'Client Name',
                'type', 'text',
                'required', false
            ),
            jsonb_build_object(
                'id', 'description',
                'name', 'Description',
                'type', 'richtext',
                'required', true
            ),
            jsonb_build_object(
                'id', 'thumbnail',
                'name', 'Thumbnail',
                'type', 'image',
                'required', false
            ),
            jsonb_build_object(
                'id', 'year',
                'name', 'Year',
                'type', 'number',
                'required', false,
                'min', 2000,
                'max', 2100
            ),
            jsonb_build_object(
                'id', 'featured',
                'name', 'Featured Project',
                'type', 'boolean',
                'required', false,
                'helpText', 'Show on homepage'
            )
        )
    ) RETURNING id INTO v_projects_id;

    -- ========================================
    -- COLLECTION 3: Site Settings
    -- ========================================
    INSERT INTO collections (
        name,
        slug,
        description,
        type,
        icon,
        color,
        created_by,
        fields
    ) VALUES (
        'Site Settings',
        'settings',
        'Global website configuration',
        'custom',
        'settings',
        'gray',
        v_admin_id,
        jsonb_build_array(
            jsonb_build_object(
                'id', 'site_name',
                'name', 'Site Name',
                'type', 'text',
                'required', true
            ),
            jsonb_build_object(
                'id', 'site_description',
                'name', 'Site Description',
                'type', 'textarea',
                'required', false
            ),
            jsonb_build_object(
                'id', 'logo',
                'name', 'Logo',
                'type', 'image',
                'required', false
            ),
            jsonb_build_object(
                'id', 'social_twitter',
                'name', 'Twitter Handle',
                'type', 'text',
                'required', false
            ),
            jsonb_build_object(
                'id', 'social_instagram',
                'name', 'Instagram Handle',
                'type', 'text',
                'required', false
            ),
            jsonb_build_object(
                'id', 'maintenance_mode',
                'name', 'Maintenance Mode',
                'type', 'boolean',
                'required', false,
                'helpText', 'Enable to show maintenance page'
            )
        )
    ) RETURNING id INTO v_settings_id;

    -- ========================================
    -- SAMPLE ENTRIES: Blog Posts
    -- ========================================
    INSERT INTO entries (
        collection_id,
        title,
        slug,
        content,
        excerpt,
        status,
        author_id,
        published_at
    ) VALUES
    (
        v_blog_id,
        'Welcome to kibanCMS',
        'welcome-to-kibancms',
        jsonb_build_object(
            'title', 'Welcome to kibanCMS',
            'slug', 'welcome-to-kibancms',
            'excerpt', 'Your new headless CMS is ready. Start creating amazing content with our intuitive editor.',
            'body', '# Welcome to kibanCMS

This is your first blog post! kibanCMS is a modern, headless CMS built with the **Data-First, Design-Always** philosophy.

## What is kibanCMS?

kibanCMS provides clean, structured data through a powerful API while giving you complete freedom to design your frontend exactly how you want.

## Features

- **Component-Driven**: Build with React and TypeScript
- **Type-Safe**: Full TypeScript support
- **Headless**: Complete frontend freedom
- **Premium UX**: Minimalist, professional interface

Start creating amazing content today!',
            'featured_image', '',
            'published_date', NOW()::text
        ),
        'Your new headless CMS is ready. Start creating amazing content with our intuitive editor.',
        'published',
        v_admin_id,
        NOW()
    ),
    (
        v_blog_id,
        'Getting Started Guide',
        'getting-started',
        jsonb_build_object(
            'title', 'Getting Started Guide',
            'slug', 'getting-started',
            'excerpt', 'Learn how to create collections, manage entries, and build your first custom frontend.',
            'body', '# Getting Started with kibanCMS

Follow this guide to start building with kibanCMS.

## Step 1: Create Collections

Define your content structure using collections with custom fields.

## Step 2: Add Entries

Start populating your collections with content.

## Step 3: Consume the API

Use the @kiban/client package in your React application to consume your CMS data.',
            'featured_image', '',
            'published_date', NOW()::text
        ),
        'Learn how to create collections, manage entries, and build your first custom frontend.',
        'draft',
        v_admin_id,
        NULL
    );

    -- ========================================
    -- SAMPLE ENTRIES: Projects
    -- ========================================
    INSERT INTO entries (
        collection_id,
        title,
        slug,
        content,
        excerpt,
        status,
        author_id,
        published_at
    ) VALUES
    (
        v_projects_id,
        'Algarve Explorer',
        'algarve-explorer',
        jsonb_build_object(
            'title', 'Algarve Explorer',
            'slug', 'algarve-explorer',
            'client', 'Tourism Board',
            'description', '# Algarve Explorer

A premium tourism website showcasing the beauty of Algarve.

## Project Overview

Custom-designed experience with interactive maps, photography galleries, and booking integration.',
            'thumbnail', '',
            'year', 2026,
            'featured', true
        ),
        'A premium tourism website showcasing the beauty of Algarve.',
        'published',
        v_admin_id,
        NOW()
    ),
    (
        v_projects_id,
        'Corporate Identity System',
        'corporate-identity',
        jsonb_build_object(
            'title', 'Corporate Identity System',
            'slug', 'corporate-identity',
            'client', 'TechCorp Inc.',
            'description', '# Corporate Identity

Complete brand identity system including logo, colors, typography, and guidelines.',
            'thumbnail', '',
            'year', 2025,
            'featured', false
        ),
        'Complete brand identity system including logo, colors, typography, and guidelines.',
        'published',
        v_admin_id,
        NOW()
    );

    -- ========================================
    -- SAMPLE ENTRY: Site Settings
    -- ========================================
    INSERT INTO entries (
        collection_id,
        title,
        slug,
        content,
        status,
        author_id
    ) VALUES (
        v_settings_id,
        'Site Settings',
        'settings',
        jsonb_build_object(
            'site_name', 'My Website',
            'site_description', 'Built with kibanCMS - A modern headless CMS',
            'logo', '',
            'social_twitter', '@mywebsite',
            'social_instagram', '@mywebsite',
            'maintenance_mode', false
        ),
        'published',
        v_admin_id
    );

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Database reset & seed completed!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '   - 3 collections created';
    RAISE NOTICE '   - 5 entries created';
    RAISE NOTICE '   - RLS policies enabled';
    RAISE NOTICE '   - Ready to use!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '   1. Refresh your kibanCMS admin';
    RAISE NOTICE '   2. Navigate to /content';
    RAISE NOTICE '   3. Start creating!';
    RAISE NOTICE '========================================';
END $$;
