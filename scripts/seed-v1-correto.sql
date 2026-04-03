-- ============================================================
-- SEED v1.0 - 100% Compatível com estrutura real
-- Execute no Supabase SQL Editor AGORA
-- ============================================================

DO $$
DECLARE
    v_user_id UUID;
    v_blog_id UUID;
    v_pages_id UUID;
BEGIN
    -- 1. Procurar user existente
    SELECT id INTO v_user_id
    FROM profiles
    WHERE email = 'tpacheco@aorubro.pt'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM profiles LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum user encontrado! Faça login primeiro.';
    END IF;

    RAISE NOTICE 'Usando user ID: %', v_user_id;

    -- 2. Criar collection Blog
    INSERT INTO collections (
        name,
        slug,
        description,
        type,
        created_by,
        fields  -- CORRETO: é 'fields', não 'schema'!
    )
    SELECT
        'Blog',
        'blog',
        'Blog posts and articles',
        'post',
        v_user_id,
        '[
            {
                "id": "title",
                "name": "Title",
                "type": "text",
                "label": "Title",
                "required": true
            },
            {
                "id": "content",
                "name": "Content",
                "type": "richtext",
                "label": "Content",
                "required": true
            }
        ]'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM collections WHERE slug = 'blog')
    RETURNING id INTO v_blog_id;

    IF v_blog_id IS NULL THEN
        SELECT id INTO v_blog_id FROM collections WHERE slug = 'blog';
    END IF;

    -- 3. Criar collection Pages
    INSERT INTO collections (
        name,
        slug,
        description,
        type,
        created_by,
        fields
    )
    SELECT
        'Pages',
        'pages',
        'Static pages',
        'page',
        v_user_id,
        '[
            {
                "id": "title",
                "name": "Title",
                "type": "text",
                "label": "Page Title",
                "required": true
            },
            {
                "id": "content",
                "name": "Content",
                "type": "richtext",
                "label": "Page Content",
                "required": true
            }
        ]'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM collections WHERE slug = 'pages')
    RETURNING id INTO v_pages_id;

    IF v_pages_id IS NULL THEN
        SELECT id INTO v_pages_id FROM collections WHERE slug = 'pages';
    END IF;

    -- 4. Criar entries
    INSERT INTO entries (
        collection_id,
        title,
        slug,
        content,
        excerpt,
        status,
        author_id,
        published_at
    )
    SELECT
        v_blog_id,
        'Welcome to kibanCMS',
        'welcome',
        '{"text": "This is your first blog post in kibanCMS. The system is now working!"}'::jsonb,
        'Getting started with kibanCMS',
        'published',
        v_user_id,
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM entries
        WHERE collection_id = v_blog_id
        AND slug = 'welcome'
    );

    INSERT INTO entries (
        collection_id,
        title,
        slug,
        content,
        excerpt,
        status,
        author_id
    )
    SELECT
        v_blog_id,
        'Getting Started Guide',
        'getting-started',
        '{"text": "Learn how to use kibanCMS effectively."}'::jsonb,
        'A comprehensive guide',
        'draft',
        v_user_id
    WHERE NOT EXISTS (
        SELECT 1 FROM entries
        WHERE collection_id = v_blog_id
        AND slug = 'getting-started'
    );

    INSERT INTO entries (
        collection_id,
        title,
        slug,
        content,
        status,
        author_id,
        published_at
    )
    SELECT
        v_pages_id,
        'About Us',
        'about',
        '{"text": "This is the about page."}'::jsonb,
        'published',
        v_user_id,
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM entries
        WHERE collection_id = v_pages_id
        AND slug = 'about'
    );

    RAISE NOTICE 'Seed completed!';
END $$;

-- Verificar resultados
SELECT 'Collections criadas:' as info;
SELECT name, slug, type FROM collections;

SELECT '';
SELECT 'Entries criados:' as info;
SELECT
    c.name as collection,
    e.title,
    e.slug,
    e.status
FROM entries e
JOIN collections c ON e.collection_id = c.id
ORDER BY c.name, e.created_at;