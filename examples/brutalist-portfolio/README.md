# Brutalist Portfolio - kibanCMS Example

Este exemplo demonstra como usar **kibanCMS** para criar um website **totalmente personalizado** com design brutalista único.

## 🎯 Filosofia: Data-First, Design-Always

O kibanCMS **NÃO** dita como o teu site deve parecer.
Ele apenas fornece os **dados limpos e estruturados**.

**TU** decides o design 100% no código React.

---

## 📁 Estrutura do Projeto

```
brutalist-portfolio/
├── src/
│   ├── components/
│   │   ├── Hero.tsx              # Componente único - Hero brutalista
│   │   ├── ProjectGrid.tsx       # Grid de projetos (design custom)
│   │   └── Footer.tsx            # Footer com tipografia brutal
│   ├── lib/
│   │   └── kiban.ts              # Configuração do kibanCMS
│   └── pages/
│       ├── index.tsx             # Homepage
│       └── project/[slug].tsx    # Página de projeto
└── kiban.config.ts               # Manifesto de componentes
```

---

## 🚀 Como Funciona

### 1. **Design no Figma** (Sem Restrições)

Desenhas o portfolio no Figma com design brutalista:
- Tipografia bold e angular
- Cores preto/branco/vermelho
- Layouts quebrados intencionalmente
- Animações pesadas

### 2. **Componentes React Únicos**

Crias componentes 100% personalizados:

```tsx
// src/components/Hero.tsx
export function BrutalistHero({ title, subtitle, cta }: HeroProps) {
  return (
    <section className="h-screen bg-black text-white relative overflow-hidden">
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="absolute top-20 left-20 rotate-[-3deg]"
      >
        <h1 className="text-[12rem] font-black leading-none tracking-tighter">
          {title}
        </h1>
      </motion.div>

      <div className="absolute bottom-20 right-20 border-4 border-red-500 p-8">
        <p className="text-2xl font-mono">{subtitle}</p>
        <button className="mt-4 bg-red-500 px-8 py-4 text-black font-bold">
          {cta}
        </button>
      </div>

      {/* Design único, sem templates */}
    </section>
  );
}
```

### 3. **Consumir Dados do kibanCMS**

Usas os hooks do `@kiban/client` para pegar os dados:

```tsx
// src/pages/index.tsx
import { useSingleton, useEntries } from '@kiban/client/react';
import { BrutalistHero } from '../components/Hero';
import { ProjectGrid } from '../components/ProjectGrid';

export default function Homepage() {
  // Pega conteúdo da homepage (singleton)
  const { data: hero } = useSingleton('homepage');

  // Pega lista de projetos (collection)
  const { data: projects } = useEntries('projects', {
    status: 'published',
    per_page: 6,
    sort: 'created_at',
    order: 'desc'
  });

  return (
    <>
      {/* Teu componente único recebe os dados do CMS */}
      <BrutalistHero
        title={hero?.data.title}
        subtitle={hero?.data.subtitle}
        cta={hero?.data.cta_text}
      />

      {/* Grid personalizado com animações custom */}
      <ProjectGrid projects={projects?.data || []} />
    </>
  );
}
```

### 4. **Manifesto de Componentes** (kiban.config.ts)

Defines quais campos cada componente precisa:

```typescript
// kiban.config.ts
import { defineConfig } from '@kiban/core';

export default defineConfig({
  collections: [
    {
      name: 'Homepage',
      slug: 'homepage',
      type: 'singleton',
      fields: [
        {
          id: 'title',
          name: 'Hero Title',
          type: 'text',
          required: true,
        },
        {
          id: 'subtitle',
          name: 'Hero Subtitle',
          type: 'text',
        },
        {
          id: 'cta_text',
          name: 'CTA Button Text',
          type: 'text',
          default: 'View Work',
        },
      ],
    },
    {
      name: 'Projects',
      slug: 'projects',
      type: 'collection',
      fields: [
        {
          id: 'title',
          name: 'Project Title',
          type: 'text',
          required: true,
        },
        {
          id: 'cover_image',
          name: 'Cover Image',
          type: 'image',
          required: true,
        },
        {
          id: 'description',
          name: 'Short Description',
          type: 'richtext',
        },
        {
          id: 'year',
          name: 'Year',
          type: 'number',
        },
        {
          id: 'tags',
          name: 'Tags',
          type: 'json', // Array de strings
        },
      ],
    },
  ],
});
```

---

## 💡 Vantagens desta Abordagem

### ✅ **100% Exclusividade**
Cada site tem código único. Não há "cheiro de template".

### ✅ **TypeScript Strict**
Os componentes recebem props tipadas baseadas no manifesto.

### ✅ **Performance Real**
Não há código morto. Apenas o que desenhaste é incluído.

### ✅ **Liberdade Total**
Usas Framer Motion, GSAP, Three.js, o que quiseres.

### ✅ **Cliente não Parte o Design**
O cliente edita texto/imagens no CMS, mas o design está seguro no código.

### ✅ **Longevidade**
Daqui a 2 anos, redesenhas só o frontend. Os dados ficam intactos.

---

## 🔄 Fluxo de Trabalho na Agência

1. **Designer:** Cria no Figma (sem restrições)
2. **Developer:** Implementa componentes React únicos
3. **Developer:** Define campos necessários no `kiban.config.ts`
4. **kibanCMS:** Gera automaticamente a UI do painel admin
5. **Cliente:** Preenche conteúdo (texto, imagens) no painel
6. **Frontend:** Renderiza com o design único que criaste

---

## 🎨 O kibanCMS NÃO é uma Jaula

É a **bateria que alimenta o teu design**.

Dados limpos → Design livre → Sites únicos
