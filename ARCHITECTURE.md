# kibanCMS Architecture

## 🎯 **Core Philosophy: Data-First, Design-Always**

kibanCMS é um **Headless CMS Component-Driven** projetado para agências que criam **websites únicos e personalizados**, não templates genéricos.

---

## 🏗️ **Arquitetura Fundacional**

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT'S WEBSITE                         │
│                  (100% Custom Design)                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ BrutalistHero│  │ FloatingGrid │  │ AnimatedMenu │    │
│  │  Component   │  │  Component   │  │  Component   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │            │
│         └──────────────────┴──────────────────┘            │
│                            │                               │
│                   @kiban/client SDK                        │
│                            │                               │
└────────────────────────────┼───────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Supabase API  │
                    │   (Headless)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  kibanCMS Admin │
                    │   (Dashboard)   │
                    └─────────────────┘
```

---

## 📦 **Componentes do Sistema**

### 1. **kibanCMS Admin** (`apps/admin/`)

Painel administrativo moderno e minimalista onde:
- Define-se a **estrutura de dados** (collections, fields)
- Cliente preenche **conteúdo** (texto, imagens, configurações)
- **NÃO controla** o design visual do frontend

**Tecnologias:**
- React + TypeScript
- Styled Components
- Supabase (Auth + Database)
- Design System Premium (design-tokens.ts)

---

### 2. **@kiban/client SDK** (`packages/client/`)

SDK TypeScript que conecta o frontend personalizado ao backend.

**Exports:**
- `KibanClient`: Cliente principal com métodos para fetch de dados
- React Hooks: `useEntries`, `useSingleton`, `useEntry`, etc.
- Types: Todos os tipos TypeScript para type safety

**Exemplo de Uso:**

```typescript
import { createKibanClient } from '@kiban/client';

const kiban = createKibanClient({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  project: {
    name: 'My Agency Site',
    slug: 'agency-site'
  }
});

// Fetch blog posts
const { data, error } = await kiban.getEntries('blog-posts', {
  status: 'published',
  per_page: 10,
  sort: 'created_at',
  order: 'desc'
});
```

---

### 3. **Frontend do Cliente** (Projeto Separado)

Cada website é um projeto React+TS **completamente independente** com:
- Componentes 100% personalizados
- Design único (Figma → Código)
- Animações customizadas (Framer Motion, GSAP)
- Qualquer biblioteca de UI

**Não é um "tema" carregado pelo CMS.**
É um **projeto frontend autônomo** que consome dados do kibanCMS via SDK.

---

## 🔄 **Fluxo de Trabalho Completo**

### **Fase 1: Design & Planeamento**

1. **Reunião com Cliente**
   - Entender requisitos do negócio
   - Definir tipos de conteúdo necessários

2. **Design no Figma**
   - Designer cria design **único e personalizado**
   - Sem limitações de templates
   - Foco total na marca e identidade do cliente

3. **Mapeamento de Dados**
   - Developer analisa o design
   - Identifica quais dados cada componente precisa
   - Planeia as collections e fields

---

### **Fase 2: Configuração do CMS**

4. **Criar Collections** (no kibanCMS Admin ou via config)

```typescript
// kiban.config.ts (future feature)
export default {
  collections: [
    {
      name: 'Homepage',
      slug: 'homepage',
      type: 'singleton',
      fields: [
        { id: 'hero_title', name: 'Hero Title', type: 'text', required: true },
        { id: 'hero_image', name: 'Hero Image', type: 'image' },
        { id: 'cta_text', name: 'CTA Text', type: 'text' },
      ]
    },
    {
      name: 'Blog Posts',
      slug: 'blog-posts',
      type: 'collection',
      fields: [
        { id: 'title', name: 'Title', type: 'text', required: true },
        { id: 'slug', name: 'URL Slug', type: 'text', required: true },
        { id: 'cover', name: 'Cover Image', type: 'image' },
        { id: 'content', name: 'Content', type: 'richtext' },
        { id: 'author', name: 'Author', type: 'relation', relation: { collection: 'authors' } },
      ]
    }
  ]
}
```

---

### **Fase 3: Desenvolvimento Frontend**

5. **Setup do Projeto**

```bash
npm create vite@latest client-website -- --template react-ts
cd client-website
npm install @kiban/client framer-motion
```

6. **Configurar kibanCMS**

```typescript
// src/lib/kiban.ts
import { createKibanClient, KibanProvider } from '@kiban/client';

export const kiban = createKibanClient({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  project: {
    name: 'Client Website',
    slug: 'client-site'
  }
});

// src/main.tsx
import { KibanProvider } from '@kiban/client/react';
import { kiban } from './lib/kiban';

root.render(
  <KibanProvider client={kiban}>
    <App />
  </KibanProvider>
);
```

7. **Criar Componentes Únicos**

```tsx
// src/components/BrutalistHero.tsx
import { motion } from 'framer-motion';

interface BrutalistHeroProps {
  title: string;
  subtitle: string;
  image: string;
}

export function BrutalistHero({ title, subtitle, image }: BrutalistHeroProps) {
  return (
    <section className="h-screen bg-black text-white flex items-center justify-center relative overflow-hidden">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.6, 0.05, 0.01, 0.9] }}
        className="z-10"
      >
        <h1 className="text-[15vw] font-black leading-none tracking-tighter">
          {title}
        </h1>
        <p className="text-4xl font-mono text-red-500 mt-8">
          {subtitle}
        </p>
      </motion.div>

      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          filter: 'grayscale(100%)'
        }}
      />
    </section>
  );
}
```

8. **Consumir Dados do CMS**

```tsx
// src/pages/Home.tsx
import { useSingleton } from '@kiban/client/react';
import { BrutalistHero } from '../components/BrutalistHero';

export function Home() {
  const { data, loading, error } = useSingleton('homepage');

  if (loading) return <Loader />;
  if (error) return <Error message={error.message} />;

  return (
    <>
      <BrutalistHero
        title={data?.data.hero_title}
        subtitle={data?.data.hero_subtitle}
        image={data?.data.hero_image}
      />
      {/* Outros componentes únicos */}
    </>
  );
}
```

---

### **Fase 4: Entrega ao Cliente**

9. **Cliente Preenche Conteúdo**
   - Acede ao kibanCMS Admin
   - Preenche textos, carrega imagens
   - Vê preview em tempo real (future feature)

10. **Deploy**
    - Frontend: Vercel, Netlify, Cloudflare Pages
    - CMS Admin: Vercel
    - Database: Supabase (já está online)

---

## ✅ **Vantagens desta Arquitetura**

### **Para a Agência:**

✅ **Designs 100% Únicos**
- Cada projeto é código custom
- Sem limitações de templates
- Liberdade criativa total

✅ **Type Safety Total**
- TypeScript end-to-end
- Auto-complete nos componentes
- Menos bugs, mais produtividade

✅ **Reutilização Estratégica**
- Components library interna da agência
- Reutilizas padrões, não designs completos
- Cada site parece único

✅ **Manutenção Simples**
- Redesign? Apenas o frontend
- Dados permanecem intactos
- Sem migrações complexas

### **Para o Cliente:**

✅ **Exclusividade Garantida**
- Website não parece "feito com CMS X"
- Identidade visual única

✅ **Controle Simples**
- Interface limpa e intuitiva
- Apenas os campos necessários
- Não consegue "partir" o design

✅ **Performance**
- Não há bloat de features não usadas
- Código otimizado
- Lighthouse scores altos

✅ **Longevidade**
- Tecnologia moderna (React, TS)
- Fácil de manter e evoluir
- Não fica "preso" a um CMS monolítico

---

## 🚀 **Roadmap v1.0**

### **Core Essentials (MVP)**
- [x] Admin panel com auth
- [x] Collections & entries CRUD
- [x] Media library
- [x] @kiban/client SDK
- [x] React hooks
- [ ] Field types completos (richtext, relations, blocks)
- [ ] RLS policies production-ready
- [ ] Documentation completa

### **Developer Experience**
- [ ] CLI tool (`npx create-kiban-project`)
- [ ] TypeScript generator (types from schema)
- [ ] Dev server com hot reload
- [ ] Component manifest system

### **Client Experience**
- [ ] Preview mode (ver site enquanto edita)
- [ ] Drafts & publishing workflow
- [ ] Media organization (folders, tags)
- [ ] Search & filters

### **Agency Features**
- [ ] Multi-project support
- [ ] Team collaboration
- [ ] Role-based permissions
- [ ] Audit logs
- [ ] API rate limiting

---

## 🎨 **kibanCMS: A Bateria, Não a Jaula**

O kibanCMS **não dita** como o website deve ser.
Ele **alimenta** o design que **tu** criaste.

**Dados limpos → Design livre → Sites únicos**

---

*"The CMS is not the website. The CMS is the battery that powers your unique design."*
