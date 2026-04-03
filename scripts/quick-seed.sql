-- ============================================================
-- Quick Seed for kibanCMS
-- Creates basic collections that work with any user
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Create Blog collection
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
    (SELECT id FROM profiles LIMIT 1), -- Use first available user
    '[
        {
            "id": "title",
            "name": "Title",
            "type": "text",
            "required": true,
            "maxLength": 200
        },
        {
            "id": "slug",
            "name": "Slug",
            "type": "text",
            "required": true,
            "maxLength": 200,
            "helpText": "URL-friendly identifier"
        },
        {
            "id": "excerpt",
            "name": "Excerpt",
            "type": "textarea",
            "required": false,
            "maxLength": 500,
            "helpText": "Short summary for previews"
        },
        {
            "id": "content",
            "name": "Content",
            "type": "richtext",
            "required": true,
            "helpText": "Main article content"
        },
        {
            "id": "featured_image",
            "name": "Featured Image",
            "type": "image",
            "required": false,
            "helpText": "Cover image"
        },
        {
            "id": "published_at",
            "name": "Published Date",
            "type": "date",
            "required": false
        }
    ]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Create Projects collection
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
    'Portfolio and case studies',
    'page',
    'briefcase',
    'purple',
    (SELECT id FROM profiles LIMIT 1), -- Use first available user
    '[
        {
            "id": "title",
            "name": "Project Title",
            "type": "text",
            "required": true,
            "maxLength": 200
        },
        {
            "id": "slug",
            "name": "Slug",
            "type": "text",
            "required": true,
            "maxLength": 200
        },
        {
            "id": "description",
            "name": "Description",
            "type": "textarea",
            "required": true,
            "maxLength": 1000
        },
        {
            "id": "client",
            "name": "Client Name",
            "type": "text",
            "required": false,
            "maxLength": 100
        },
        {
            "id": "year",
            "name": "Year",
            "type": "number",
            "required": false
        },
        {
            "id": "featured",
            "name": "Featured Project",
            "type": "boolean",
            "required": false,
            "helpText": "Show on homepage"
        }
    ]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Create Pages collection
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
    'Pages',
    'pages',
    'Static website pages',
    'page',
    'file',
    'green',
    (SELECT id FROM profiles LIMIT 1),
    '[
        {
            "id": "title",
            "name": "Page Title",
            "type": "text",
            "required": true,
            "maxLength": 200
        },
        {
            "id": "slug",
            "name": "Slug",
            "type": "text",
            "required": true,
            "maxLength": 200
        },
        {
            "id": "content",
            "name": "Content",
            "type": "richtext",
            "required": true
        }
    ]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Verify
SELECT
    name,
    slug,
    type,
    jsonb_array_length(fields) as field_count,
    created_at
FROM collections
ORDER BY created_at DESC;
