-- ============================================================
-- kibanCMS v1.0 - SEED DATA
-- Demo collections and entries for testing
-- ============================================================

-- Clean existing data (CAUTION: This deletes all entries and collections)
DELETE FROM entries;
DELETE FROM collections;

DO $$
DECLARE
    v_admin_id UUID;
    v_blog_id UUID;
    v_projects_id UUID;
    v_settings_id UUID;
BEGIN
    -- Get the admin user ID from profiles table
    -- IMPORTANT: Update this email to match your Supabase user email
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE email = 'tpacheco@aorubro.pt'
    LIMIT 1;

    -- If user doesn't exist, raise an error
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'User tpacheco@aorubro.pt not found in profiles table! Please update the email in this script.';
    END IF;

    RAISE NOTICE 'Creating seed data for user: %', v_admin_id;

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
                'id', 'content',
                'name', 'Content',
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
                'id', 'published_at',
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
    -- COLLECTION 3: Settings (Singleton)
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
        author_id
    ) VALUES
    (
        v_blog_id,
        'Welcome to kibanCMS',
        'welcome-to-kibancms',
        jsonb_build_object(
            'title', 'Welcome to kibanCMS',
            'slug', 'welcome-to-kibancms',
            'excerpt', 'Your new headless CMS is ready. Start creating amazing content with our intuitive editor.',
            'content', '# Welcome to kibanCMS\n\nThis is your first blog post! kibanCMS is a modern, headless CMS built with the Data-First, Design-Always philosophy.\n\n## What is kibanCMS?\n\nkibanCMS provides clean, structured data through a powerful API while giving you complete freedom to design your frontend exactly how you want.\n\n## Features\n\n- **Component-Driven**: Build with React and TypeScript\n- **Type-Safe**: Full TypeScript support\n- **Headless**: Complete frontend freedom\n- **Premium UX**: Minimalist, professional interface\n\nStart creating!',
            'featured_image', '',
            'published_at', NOW()::text
        ),
        'Your new headless CMS is ready. Start creating amazing content with our intuitive editor.',
        'published',
        v_admin_id
    ),
    (
        v_blog_id,
        'Getting Started Guide',
        'getting-started',
        jsonb_build_object(
            'title', 'Getting Started Guide',
            'slug', 'getting-started',
            'excerpt', 'Learn how to create collections, manage entries, and build your first custom frontend.',
            'content', '# Getting Started with kibanCMS\n\nFollow this guide to start building with kibanCMS.\n\n## Step 1: Create Collections\n\nDefine your content structure using collections with custom fields.\n\n## Step 2: Add Entries\n\nStart populating your collections with content.\n\n## Step 3: Consume the API\n\nUse the @kiban/client package in your React application.',
            'featured_image', '',
            'published_at', NOW()::text
        ),
        'Learn how to create collections, manage entries, and build your first custom frontend.',
        'draft',
        v_admin_id
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
        author_id
    ) VALUES
    (
        v_projects_id,
        'Algarve Explorer',
        'algarve-explorer',
        jsonb_build_object(
            'title', 'Algarve Explorer',
            'slug', 'algarve-explorer',
            'client', 'Tourism Board',
            'description', '# Algarve Explorer\n\nA premium tourism website showcasing the beauty of Algarve.\n\n## Project Overview\n\nCustom-designed experience with interactive maps, photography galleries, and booking integration.',
            'thumbnail', '',
            'year', 2026,
            'featured', true
        ),
        'A premium tourism website showcasing the beauty of Algarve.',
        'published',
        v_admin_id
    ),
    (
        v_projects_id,
        'Corporate Identity System',
        'corporate-identity',
        jsonb_build_object(
            'title', 'Corporate Identity System',
            'slug', 'corporate-identity',
            'client', 'TechCorp Inc.',
            'description', '# Corporate Identity\n\nComplete brand identity system including logo, colors, typography, and guidelines.',
            'thumbnail', '',
            'year', 2025,
            'featured', false
        ),
        'Complete brand identity system including logo, colors, typography, and guidelines.',
        'published',
        v_admin_id
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
            'site_description', 'Built with kibanCMS',
            'logo', '',
            'social_twitter', '@mywebsite',
            'social_instagram', '@mywebsite',
            'maintenance_mode', false
        ),
        'published',
        v_admin_id
    );

    RAISE NOTICE '✅ Seed data created successfully!';
    RAISE NOTICE '   - 3 collections created (Blog Posts, Projects, Settings)';
    RAISE NOTICE '   - 5 entries created';
    RAISE NOTICE '   - Ready to use!';
END $$;
