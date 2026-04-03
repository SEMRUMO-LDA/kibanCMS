-- ============================================================
-- LUNES Collections for kibanCMS
-- Custom collections for the Lunes Experience website
-- ============================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_tours_id UUID;
    v_testimonials_id UUID;
BEGIN
    -- Get the admin user ID
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE email = 'tpacheco@aorubro.pt'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'User tpacheco@aorubro.pt not found in profiles table!';
    END IF;

    -- ========================================
    -- COLLECTION: Lunes Tours
    -- ========================================
    INSERT INTO collections (
        name, slug, description, type, icon, color, created_by, fields
    ) VALUES (
        'Lunes Tours',
        'lunes-tours',
        'Experiências náuticas e passeios da LUNES EXPLORE',
        'custom',
        'compass',
        'cyan',
        v_admin_id,
        jsonb_build_array(
            jsonb_build_object(
                'id', 'title', 'name', 'Nome do Tour', 'type', 'text',
                'required', true, 'maxLength', 200
            ),
            jsonb_build_object(
                'id', 'description', 'name', 'Descrição', 'type', 'textarea',
                'required', true, 'maxLength', 500,
                'helpText', 'Descrição curta para os cards'
            ),
            jsonb_build_object(
                'id', 'duration', 'name', 'Duração', 'type', 'text',
                'required', true, 'helpText', 'Ex: 150 Min, 120 Min, Flexível'
            ),
            jsonb_build_object(
                'id', 'price', 'name', 'Preço', 'type', 'text',
                'required', true, 'helpText', 'Ex: 40€, 550€'
            ),
            jsonb_build_object(
                'id', 'capacity', 'name', 'Capacidade', 'type', 'text',
                'required', true, 'helpText', 'Ex: Por passageiro, Até 17 pessoas'
            ),
            jsonb_build_object(
                'id', 'rating', 'name', 'Rating', 'type', 'number',
                'required', false, 'min', 1, 'max', 5,
                'helpText', 'Classificação de 1 a 5'
            ),
            jsonb_build_object(
                'id', 'image', 'name', 'Imagem', 'type', 'image',
                'required', false, 'helpText', 'Imagem principal do tour'
            ),
            jsonb_build_object(
                'id', 'order', 'name', 'Ordem', 'type', 'number',
                'required', false, 'helpText', 'Ordem de exibição (menor = primeiro)'
            )
        )
    ) RETURNING id INTO v_tours_id;

    -- ========================================
    -- COLLECTION: Lunes Testimonials
    -- ========================================
    INSERT INTO collections (
        name, slug, description, type, icon, color, created_by, fields
    ) VALUES (
        'Lunes Testemunhos',
        'lunes-testimonials',
        'Testemunhos de clientes da LUNES Experience',
        'custom',
        'message-circle',
        'amber',
        v_admin_id,
        jsonb_build_array(
            jsonb_build_object(
                'id', 'name', 'name', 'Nome', 'type', 'text',
                'required', true, 'maxLength', 100
            ),
            jsonb_build_object(
                'id', 'role', 'name', 'Papel/Marca', 'type', 'text',
                'required', true, 'maxLength', 100,
                'helpText', 'Ex: LUNES MOVE Member, LUNES EXPLORE Guest'
            ),
            jsonb_build_object(
                'id', 'quote', 'name', 'Testemunho', 'type', 'textarea',
                'required', true, 'maxLength', 500
            ),
            jsonb_build_object(
                'id', 'image', 'name', 'Foto', 'type', 'image',
                'required', false, 'helpText', 'Foto de perfil'
            )
        )
    ) RETURNING id INTO v_testimonials_id;

    -- ========================================
    -- SEED: Tours (dados atuais do site)
    -- ========================================
    INSERT INTO entries (collection_id, title, slug, content, status, author_id) VALUES
    (
        v_tours_id,
        'Costa de Portimão à Sra. da Rocha',
        'costa-portimao',
        jsonb_build_object(
            'title', 'Costa de Portimão à Sra. da Rocha',
            'description', 'Navegamos entre grutas, falésias douradas e praias icónicas. Contamos histórias, exploramos recantos únicos e paramos para mergulho na inesquecível Praia da Marinha.',
            'duration', '150 Min',
            'price', '40€',
            'capacity', 'Por passageiro',
            'rating', 5,
            'image', '/tours-coast.jpg',
            'order', 1
        ),
        'published', v_admin_id
    ),
    (
        v_tours_id,
        'Rio Arade',
        'rio-arade',
        jsonb_build_object(
            'title', 'Rio Arade',
            'description', 'Um passeio calmo, perfeito para quem procura natureza, biodiversidade e silêncio. Aqui o tempo abranda e a ligação ao lugar acontece naturalmente.',
            'duration', '120 Min',
            'price', '40€',
            'capacity', 'Por passageiro',
            'rating', 5,
            'image', '/tours-river.jpg',
            'order', 2
        ),
        'published', v_admin_id
    ),
    (
        v_tours_id,
        'Sunrise & Sunset',
        'sunrise-sunset',
        jsonb_build_object(
            'title', 'Sunrise & Sunset',
            'description', 'Ao nascer ou ao pôr do sol, a luz transforma tudo. As cores, o mar e a atmosfera criam um momento íntimo e memorável, daqueles que se guardam.',
            'duration', '120 Min',
            'price', '40€',
            'capacity', 'Por passageiro',
            'rating', 5,
            'image', '/tours-sunset.jpg',
            'order', 3
        ),
        'published', v_admin_id
    ),
    (
        v_tours_id,
        'Passeios Privados',
        'passeios-privados',
        jsonb_build_object(
            'title', 'Passeios Privados',
            'description', 'Uma experiência feita à sua medida, no seu ritmo. Navegue com quem escolhe, descubra a costa com calma e desfrute de uma bebida de boas-vindas a bordo.',
            'duration', 'Flexível',
            'price', '550€',
            'capacity', 'Até 17 pessoas',
            'rating', 5,
            'image', '/private-tour.jpg',
            'order', 4
        ),
        'published', v_admin_id
    );

    -- ========================================
    -- SEED: Testimonials (dados atuais do site)
    -- ========================================
    INSERT INTO entries (collection_id, title, slug, content, status, author_id) VALUES
    (
        v_testimonials_id,
        'Sofia Martins',
        'sofia-martins',
        jsonb_build_object(
            'name', 'Sofia Martins',
            'role', 'LUNES MOVE Member',
            'quote', 'A LUNES não é apenas um ginásio, é onde encontro o meu equilíbrio semanal. O ambiente é acolhedor e os treinos são desafiantes mas respeitam o meu ritmo.',
            'image', 'https://i.pravatar.cc/150?u=sofia'
        ),
        'published', v_admin_id
    ),
    (
        v_testimonials_id,
        'Ricardo Silva',
        'ricardo-silva',
        jsonb_build_object(
            'name', 'Ricardo Silva',
            'role', 'LUNES EXPLORE Guest',
            'quote', 'A expedição náutica foi transformadora. Estar em alto mar, com o silêncio curado da LUNES, permitiu-me reconectar com o que realmente importa.',
            'image', 'https://i.pravatar.cc/150?u=ricardo'
        ),
        'published', v_admin_id
    ),
    (
        v_testimonials_id,
        'Ana Oliveira',
        'ana-oliveira',
        jsonb_build_object(
            'name', 'Ana Oliveira',
            'role', 'LUNES STAY Resident',
            'quote', 'Ficar no alojamento da LUNES foi como respirar pela primeira vez em meses. O design minimalista e a luz natural criam uma paz indescritível.',
            'image', 'https://i.pravatar.cc/150?u=ana'
        ),
        'published', v_admin_id
    );

    RAISE NOTICE '✅ Lunes collections created!';
    RAISE NOTICE '   - Lunes Tours (4 entries)';
    RAISE NOTICE '   - Lunes Testemunhos (3 entries)';
END $$;
