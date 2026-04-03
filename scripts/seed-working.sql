-- ============================================================
-- SEED FUNCIONAL - Compatível com estrutura real
-- Execute no Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_blog_id UUID;
    v_pages_id UUID;
BEGIN
    -- 1. Procurar user existente
    SELECT id, email INTO v_user_id, v_user_email
    FROM profiles
    WHERE email = 'tpacheco@aorubro.pt'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SELECT id, email INTO v_user_id, v_user_email
        FROM profiles
        LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'ERRO: Nenhum user encontrado! Faça login no admin primeiro.';
        RETURN;
    END IF;

    RAISE NOTICE 'Usando user: % (%)', v_user_email, v_user_id;

    -- 2. Criar collection Blog (se não existe)
    INSERT INTO collections (
        id,
        name,
        slug,
        description,
        type,
        created_by,
        schema
    )
    SELECT
        gen_random_uuid(),
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

    -- Se já existe, pegar o ID
    IF v_blog_id IS NULL THEN
        SELECT id INTO v_blog_id FROM collections WHERE slug = 'blog';
    END IF;

    -- 3. Criar collection Pages
    INSERT INTO collections (
        id,
        name,
        slug,
        description,
        type,
        created_by,
        schema
    )
    SELECT
        gen_random_uuid(),
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

    -- 4. Criar entries usando collection_id (estrutura da migration 001)
    INSERT INTO entries (
        collection_id,  -- Usando collection_id, não collection_slug!
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
        'welcome-to-kibancms',
        '{"html": "<h1>Welcome!</h1><p>This is your first blog post in kibanCMS.</p>"}'::jsonb,
        'Getting started with kibanCMS',
        'published',
        v_user_id,
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM entries
        WHERE collection_id = v_blog_id
        AND slug = 'welcome-to-kibancms'
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
        '{"html": "<h1>Getting Started</h1><p>Learn how to use kibanCMS.</p>"}'::jsonb,
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
        '{"html": "<h1>About</h1><p>This is the about page.</p>"}'::jsonb,
        'published',
        v_user_id,
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM entries
        WHERE collection_id = v_pages_id
        AND slug = 'about'
    );

    RAISE NOTICE 'Seed completed!';
    RAISE NOTICE 'Blog collection ID: %', v_blog_id;
    RAISE NOTICE 'Pages collection ID: %', v_pages_id;
END $$;

-- 5. Verificar resultados
SELECT
    c.name as collection,
    COUNT(e.id) as entries_count
FROM collections c
LEFT JOIN entries e ON e.collection_id = c.id
GROUP BY c.name
ORDER BY c.name;

-- 6. Ver entries criados
SELECT
    c.name as collection,
    e.title,
    e.slug,
    e.status,
    e.published_at
FROM entries e
JOIN collections c ON e.collection_id = c.id
ORDER BY c.name, e.created_at;