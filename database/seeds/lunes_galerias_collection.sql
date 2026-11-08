-- ============================================================
-- Galerias Collection (page photo galleries)
-- Manages photo galleries per page on the LUNES website.
-- One entry = one image. The `page` field groups images by page
-- (e.g. "move", "explore", "feel", "stay", "home").
-- ============================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_galerias_id UUID;
BEGIN
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE email = 'tpacheco@aorubro.pt'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'User tpacheco@aorubro.pt not found in profiles table!';
    END IF;

    -- Skip if already created
    SELECT id INTO v_galerias_id FROM collections WHERE slug = 'galerias';
    IF v_galerias_id IS NOT NULL THEN
        RAISE NOTICE 'Collection "galerias" already exists, skipping insert.';
        RETURN;
    END IF;

    INSERT INTO collections (
        name, slug, description, type, icon, color, created_by, fields
    ) VALUES (
        'Galerias',
        'galerias',
        'Galerias de fotos por página do site LUNES',
        'custom',
        'image',
        'violet',
        v_admin_id,
        jsonb_build_array(
            jsonb_build_object(
                'id', 'page',
                'name', 'Página',
                'type', 'select',
                'required', true,
                'helpText', 'A que página pertence esta foto',
                'options', jsonb_build_array(
                    jsonb_build_object('label', 'Home',       'value', 'home'),
                    jsonb_build_object('label', 'Move',       'value', 'move'),
                    jsonb_build_object('label', 'Explore',    'value', 'explore'),
                    jsonb_build_object('label', 'Feel',       'value', 'feel'),
                    jsonb_build_object('label', 'Stay',       'value', 'stay'),
                    jsonb_build_object('label', 'Filosofia',  'value', 'filosofia'),
                    jsonb_build_object('label', 'Parceiros',  'value', 'parceiros')
                )
            ),
            jsonb_build_object(
                'id', 'image',
                'name', 'Imagem',
                'type', 'image',
                'required', true,
                'helpText', 'Foto da galeria (webp recomendado)'
            ),
            jsonb_build_object(
                'id', 'alt',
                'name', 'Texto alternativo',
                'type', 'text',
                'required', false,
                'maxLength', 200,
                'helpText', 'Descrição da imagem para acessibilidade/SEO'
            ),
            jsonb_build_object(
                'id', 'caption',
                'name', 'Legenda',
                'type', 'text',
                'required', false,
                'maxLength', 200,
                'helpText', 'Legenda visível abaixo da foto (opcional)'
            ),
            jsonb_build_object(
                'id', 'order',
                'name', 'Ordem',
                'type', 'number',
                'required', false,
                'helpText', 'Ordem de apresentação (menor = primeiro)'
            )
        )
    ) RETURNING id INTO v_galerias_id;

    -- ========================================
    -- SEED: existing brand galleries from src/data/brands.tsx
    -- ========================================

    -- MOVE
    INSERT INTO entries (collection_id, title, slug, content, status, author_id) VALUES
    (v_galerias_id, 'Move 1', 'move-1', jsonb_build_object('page','move','image','/images/move/move-featured.webp','alt','LUNES Move — destaque','order',1), 'published', v_admin_id),
    (v_galerias_id, 'Move 2', 'move-2', jsonb_build_object('page','move','image','/images/move/move-2.webp','alt','LUNES Move 2','order',2), 'published', v_admin_id),
    (v_galerias_id, 'Move 3', 'move-3', jsonb_build_object('page','move','image','/images/move/move-3.webp','alt','LUNES Move 3','order',3), 'published', v_admin_id),
    (v_galerias_id, 'Move 4', 'move-4', jsonb_build_object('page','move','image','/images/move/move-4.webp','alt','LUNES Move 4','order',4), 'published', v_admin_id),
    (v_galerias_id, 'Move 5', 'move-5', jsonb_build_object('page','move','image','/images/move/move-5.webp','alt','LUNES Move 5','order',5), 'published', v_admin_id);

    -- EXPLORE
    INSERT INTO entries (collection_id, title, slug, content, status, author_id) VALUES
    (v_galerias_id, 'Explore 1', 'explore-1', jsonb_build_object('page','explore','image','/images/tours/explore-1.webp','alt','LUNES Explore 1','order',1), 'published', v_admin_id),
    (v_galerias_id, 'Explore 2', 'explore-2', jsonb_build_object('page','explore','image','/images/tours/explore-2.webp','alt','LUNES Explore 2','order',2), 'published', v_admin_id),
    (v_galerias_id, 'Explore 3', 'explore-3', jsonb_build_object('page','explore','image','/images/tours/explore-3.webp','alt','LUNES Explore 3','order',3), 'published', v_admin_id),
    (v_galerias_id, 'Explore 4', 'explore-4', jsonb_build_object('page','explore','image','/images/tours/explore-4.webp','alt','LUNES Explore 4','order',4), 'published', v_admin_id),
    (v_galerias_id, 'Explore 5', 'explore-5', jsonb_build_object('page','explore','image','/images/tours/explore-5.webp','alt','LUNES Explore 5','order',5), 'published', v_admin_id);

    -- FEEL
    INSERT INTO entries (collection_id, title, slug, content, status, author_id) VALUES
    (v_galerias_id, 'Feel 1', 'feel-1', jsonb_build_object('page','feel','image','/images/feel/feel-1.webp','alt','LUNES Feel 1','order',1), 'published', v_admin_id),
    (v_galerias_id, 'Feel 2', 'feel-2', jsonb_build_object('page','feel','image','/images/feel/feel-2.webp','alt','LUNES Feel 2','order',2), 'published', v_admin_id),
    (v_galerias_id, 'Feel 3', 'feel-3', jsonb_build_object('page','feel','image','/images/feel/feel-3.webp','alt','LUNES Feel 3','order',3), 'published', v_admin_id),
    (v_galerias_id, 'Feel 4', 'feel-4', jsonb_build_object('page','feel','image','/images/feel/feel-4.webp','alt','LUNES Feel 4','order',4), 'published', v_admin_id),
    (v_galerias_id, 'Feel 5', 'feel-5', jsonb_build_object('page','feel','image','/images/feel/feel-5.webp','alt','LUNES Feel 5','order',5), 'published', v_admin_id),
    (v_galerias_id, 'Feel 6', 'feel-6', jsonb_build_object('page','feel','image','/images/feel/feel-6.webp','alt','LUNES Feel 6','order',6), 'published', v_admin_id),
    (v_galerias_id, 'Feel 7', 'feel-7', jsonb_build_object('page','feel','image','/images/feel/feel-7.webp','alt','LUNES Feel 7','order',7), 'published', v_admin_id),
    (v_galerias_id, 'Feel 8', 'feel-8', jsonb_build_object('page','feel','image','/images/feel/feel-8.webp','alt','LUNES Feel 8','order',8), 'published', v_admin_id);

    -- STAY
    INSERT INTO entries (collection_id, title, slug, content, status, author_id) VALUES
    (v_galerias_id, 'Stay 1', 'stay-1', jsonb_build_object('page','stay','image','/images/stay/stay-1.webp','alt','LUNES Stay 1','order',1), 'published', v_admin_id),
    (v_galerias_id, 'Stay 2', 'stay-2', jsonb_build_object('page','stay','image','/images/stay/stay-2.webp','alt','LUNES Stay 2','order',2), 'published', v_admin_id),
    (v_galerias_id, 'Stay 3', 'stay-3', jsonb_build_object('page','stay','image','/images/stay/stay-3.webp','alt','LUNES Stay 3','order',3), 'published', v_admin_id),
    (v_galerias_id, 'Stay 4', 'stay-4', jsonb_build_object('page','stay','image','/images/stay/stay-4.webp','alt','LUNES Stay 4','order',4), 'published', v_admin_id),
    (v_galerias_id, 'Stay 5', 'stay-5', jsonb_build_object('page','stay','image','/images/stay/stay-5.webp','alt','LUNES Stay 5','order',5), 'published', v_admin_id),
    (v_galerias_id, 'Stay 6', 'stay-6', jsonb_build_object('page','stay','image','/images/stay/stay-6.webp','alt','LUNES Stay 6','order',6), 'published', v_admin_id),
    (v_galerias_id, 'Stay 7', 'stay-7', jsonb_build_object('page','stay','image','/images/stay/stay-7.webp','alt','LUNES Stay 7','order',7), 'published', v_admin_id),
    (v_galerias_id, 'Stay 8', 'stay-8', jsonb_build_object('page','stay','image','/images/stay/stay-8.webp','alt','LUNES Stay 8','order',8), 'published', v_admin_id);

    RAISE NOTICE 'Galerias collection created with seed data.';
END $$;
