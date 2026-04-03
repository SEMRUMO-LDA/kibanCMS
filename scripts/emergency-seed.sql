-- ============================================================
-- EMERGENCY SEED - Criar dados mínimos para funcionar
-- Execute isto no Supabase SQL Editor AGORA
-- ============================================================

-- 1. Verificar se user existe
DO $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
BEGIN
    -- Procurar qualquer user existente
    SELECT id, email INTO v_user_id, v_user_email
    FROM profiles
    WHERE email = 'tpacheco@aorubro.pt'  -- Alterar se necessário
    LIMIT 1;

    IF v_user_id IS NULL THEN
        -- Se não existe, procurar qualquer user
        SELECT id, email INTO v_user_id, v_user_email
        FROM profiles
        LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'AVISO: Nenhum user encontrado! Faça login no admin primeiro.';
        RETURN;
    END IF;

    RAISE NOTICE 'Usando user: % (%)', v_user_email, v_user_id;

    -- 2. Criar collection Blog se não existe
    INSERT INTO collections (
        id,
        name,
        slug,
        description,
        type,
        created_by,
        fields
    ) VALUES (
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
                "required": true,
                "maxLength": 200
            },
            {
                "id": "slug",
                "name": "Slug",
                "type": "text",
                "label": "Slug",
                "required": true,
                "maxLength": 200
            },
            {
                "id": "content",
                "name": "Content",
                "type": "richtext",
                "label": "Content",
                "required": true
            }
        ]'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    -- 3. Criar collection Pages
    INSERT INTO collections (
        id,
        name,
        slug,
        description,
        type,
        created_by,
        fields
    ) VALUES (
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
                "required": true,
                "maxLength": 200
            },
            {
                "id": "slug",
                "name": "Slug",
                "type": "text",
                "label": "URL Slug",
                "required": true,
                "maxLength": 200
            },
            {
                "id": "content",
                "name": "Content",
                "type": "richtext",
                "label": "Page Content",
                "required": true
            }
        ]'::jsonb
    ) ON CONFLICT (slug) DO NOTHING;

    -- 4. Criar alguns entries de exemplo
    INSERT INTO entries (
        collection_slug,
        slug,
        status,
        data,
        created_by
    ) VALUES
    (
        'blog',
        'welcome-to-kibancms',
        'published',
        '{
            "title": "Welcome to kibanCMS",
            "slug": "welcome-to-kibancms",
            "content": "# Welcome!\n\nThis is your first blog post in kibanCMS. The system is now working!"
        }'::jsonb,
        v_user_id
    ),
    (
        'blog',
        'getting-started',
        'draft',
        '{
            "title": "Getting Started Guide",
            "slug": "getting-started",
            "content": "# Getting Started\n\nLearn how to use kibanCMS effectively."
        }'::jsonb,
        v_user_id
    ),
    (
        'pages',
        'about',
        'published',
        '{
            "title": "About Us",
            "slug": "about",
            "content": "# About\n\nThis is the about page."
        }'::jsonb,
        v_user_id
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seed completed successfully!';
END $$;

-- 5. Verificar resultados
SELECT
    'Collections:' as type,
    COUNT(*) as count
FROM collections
UNION ALL
SELECT
    'Entries:' as type,
    COUNT(*) as count
FROM entries
ORDER BY type;