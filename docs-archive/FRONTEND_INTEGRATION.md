# 🔗 kibanCMS - Frontend Integration Guide

Este guia explica como conectar o teu projeto frontend ao kibanCMS para consumir os dados.

---

## 📋 Overview

O kibanCMS segue a filosofia **"Data-First, Design-Always"**:
- **kibanCMS (Admin)** → Gestão de conteúdo + API
- **Frontend Project** → Design único + Consumo de dados

```
┌────────────────────┐          ┌────────────────────┐
│   kibanCMS Admin   │          │  Frontend Project  │
│   (localhost:5176) │          │  (localhost:3000)  │
│                    │          │                    │
│  ✓ Manage Content  │──────────▶  ✓ Custom Design   │
│  ✓ Collections     │   API    │  ✓ React + TS      │
│  ✓ Entries         │   Data   │  ✓ Unique UX       │
│  ✓ Media           │          │  ✓ Your Brand      │
└────────────────────┘          └────────────────────┘
         │                               │
         └──────── Supabase DB ──────────┘
```

---

## 🚀 Setup: Conectar Frontend ao kibanCMS

### **Step 1: Instalar o Client SDK**

No teu projeto frontend, instala o `@kiban/client`:

```bash
# Se estiveres no monorepo
cd /path/to/your/frontend
npm install ../../KIBAN\ CMS/packages/client

# Ou publicar no npm e instalar
npm install @kiban/client
```

### **Step 2: Configurar o Client**

Cria um ficheiro `lib/kiban.ts`:

```typescript
import { KibanClient } from '@kiban/client';

export const kiban = new KibanClient({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
```

### **Step 3: Criar `.env` no Frontend**

```bash
# .env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

⚠️ **Usa as MESMAS credenciais que o Admin!**

---

## 📖 Usage Examples

### **Example 1: Blog Homepage**

```typescript
// pages/blog.tsx
import { useEntries } from '@kiban/client/react';

export default function BlogPage() {
  const { data: posts, loading, error } = useEntries('blog', {
    status: 'published',
    limit: 10,
    sort: { field: 'published_at', order: 'desc' },
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="blog-grid">
      {posts?.items.map((post) => (
        <article key={post.id} className="blog-card">
          <img src={post.data.featured_image} alt={post.data.title} />
          <h2>{post.data.title}</h2>
          <p>{post.data.excerpt}</p>
          <a href={`/blog/${post.data.slug}`}>Read more →</a>
        </article>
      ))}
    </div>
  );
}
```

### **Example 2: Blog Post Detail**

```typescript
// pages/blog/[slug].tsx
import { useEntry } from '@kiban/client/react';
import { useParams } from 'react-router-dom';
import Markdown from 'react-markdown';

export default function BlogPostPage() {
  const { slug } = useParams();
  const { data: post, loading } = useEntry('blog', slug!);

  if (loading) return <div>Loading post...</div>;
  if (!post) return <div>Post not found</div>;

  return (
    <article className="blog-post">
      <header>
        <h1>{post.data.title}</h1>
        <time>{new Date(post.published_at).toLocaleDateString()}</time>
      </header>

      <img src={post.data.featured_image} alt={post.data.title} />

      <div className="prose">
        <Markdown>{post.data.body}</Markdown>
      </div>
    </article>
  );
}
```

### **Example 3: Portfolio Projects**

```typescript
// pages/portfolio.tsx
import { useEntries } from '@kiban/client/react';

export default function PortfolioPage() {
  const { data: projects } = useEntries('projects', {
    status: 'published',
    filter: { featured: true },
  });

  return (
    <div className="portfolio-grid">
      {projects?.items.map((project) => (
        <div key={project.id} className="project-card">
          <img src={project.data.thumbnail} alt={project.data.title} />
          <h3>{project.data.title}</h3>
          <p className="client">{project.data.client}</p>
          <span className="year">{project.data.year}</span>
        </div>
      ))}
    </div>
  );
}
```

### **Example 4: Site Settings (Singleton)**

```typescript
// components/Header.tsx
import { useSingleton } from '@kiban/client/react';

export function Header() {
  const { data: settings } = useSingleton('settings');

  return (
    <header>
      <img src={settings?.data.logo} alt={settings?.data.site_name} />
      <h1>{settings?.data.site_name}</h1>
      <nav>
        <a href={`https://twitter.com/${settings?.data.social_twitter}`}>
          Twitter
        </a>
        <a href={`https://instagram.com/${settings?.data.social_instagram}`}>
          Instagram
        </a>
      </nav>
    </header>
  );
}
```

---

## 🎨 Design Freedom

**O segredo do kibanCMS**: Tens acesso aos dados limpos, mas o design é 100% teu!

```typescript
// ❌ NÃO FAZES ISTO (templates)
import { BlogTemplate } from '@kiban/templates'; // ← Não existe!

// ✅ FAZES ISTO (custom design)
export function MyUniqueBlogCard({ post }) {
  return (
    <div className="my-super-custom-design">
      {/* O teu design único aqui */}
      <h2 className="gradient-text">{post.data.title}</h2>
      <CustomButton>{post.data.cta}</CustomButton>
    </div>
  );
}
```

---

## 🔄 Real-time Updates

```typescript
import { useRealtimeSubscription } from '@kiban/client/react';

export function LiveBlogFeed() {
  const { data: posts } = useEntries('blog');

  useRealtimeSubscription('entries', (payload) => {
    if (payload.eventType === 'INSERT') {
      // Novo post publicado!
      console.log('New post:', payload.new);
    }
  });

  return <div>...</div>;
}
```

---

## 📦 Direct API Usage (sem React Hooks)

```typescript
import { kiban } from './lib/kiban';

// Fetch all blog posts
const posts = await kiban.getEntries('blog', {
  status: 'published',
  limit: 10,
});

// Fetch single entry by slug
const post = await kiban.getEntry('blog', 'welcome-to-kibancms');

// Fetch singleton (settings)
const settings = await kiban.getSingleton('settings');

// Fetch media files
const images = await kiban.getMedia({
  folder: '/uploads',
  type: 'image',
});
```

---

## 🏗️ Project Structure

```
your-frontend/
├── src/
│   ├── lib/
│   │   └── kiban.ts           # SDK client instance
│   ├── components/
│   │   ├── BlogCard.tsx       # Custom blog card design
│   │   ├── ProjectCard.tsx    # Custom project card
│   │   └── Header.tsx         # Header com settings
│   ├── pages/
│   │   ├── index.tsx          # Homepage
│   │   ├── blog/
│   │   │   ├── index.tsx      # Blog list
│   │   │   └── [slug].tsx     # Blog post detail
│   │   └── portfolio/
│   │       └── index.tsx      # Portfolio grid
│   └── styles/
│       └── globals.css        # O TEU design system único
└── .env                       # Supabase credentials
```

---

## 🎯 Best Practices

### **1. Type Safety**

```typescript
// Define types para o teu content
interface BlogPost {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  featured_image: string;
  published_date: string;
}

const { data: posts } = useEntries<BlogPost>('blog');
// posts[0].data.title ← Fully typed! ✨
```

### **2. Error Handling**

```typescript
const { data, loading, error, refetch } = useEntries('blog');

if (error) {
  return (
    <div className="error-state">
      <p>Failed to load posts</p>
      <button onClick={refetch}>Retry</button>
    </div>
  );
}
```

### **3. Loading States**

```typescript
if (loading) {
  return (
    <div className="skeleton-grid">
      {[1, 2, 3].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
```

### **4. Caching (React Query)**

O `@kiban/client` usa React Query internamente:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>;
```

---

## 🔐 Security

### **RLS Policies (Row Level Security)**

O Supabase já tem RLS configurado:
- ✅ Apenas entries com `status: 'published'` são públicas
- ✅ Draft/Archived são privados
- ✅ Admin users têm acesso total

### **API Keys**

```bash
# Frontend .env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx... # ← Safe para frontend (public)

# Backend .env (se precisares)
SUPABASE_SERVICE_ROLE_KEY=eyJxxx... # ← NEVER expose to frontend!
```

---

## 📚 Workflow Completo

### **1. No kibanCMS Admin**
```
1. Crias uma collection "Blog Posts"
2. Defines os fields (title, body, image, etc)
3. Crias entries (posts)
4. Publicas (status: published)
```

### **2. No Frontend**
```typescript
// Consomes os dados
const { data: posts } = useEntries('blog');

// Renderizas com o TEU design
return <MyCustomBlogGrid posts={posts} />;
```

### **3. O Resultado**
```
✨ Cada website tem design ÚNICO
✨ Mas o backend (CMS) é partilhado
✨ Data-First, Design-Always
```

---

## 🚀 Next Steps

1. **Instala o SDK** no teu frontend
2. **Configura o `.env`** com Supabase credentials
3. **Importa os hooks** e começa a consumir dados
4. **Desenha** a tua UI única
5. **Profit!** 🎉

---

## 🆘 Troubleshooting

### "Cannot connect to Supabase"
```bash
# Verifica se o .env está correcto
cat .env

# Verifica se as credenciais são as mesmas que o admin
```

### "No data returned"
```bash
# Verifica RLS policies no Supabase
# Dashboard → Authentication → Policies
# Certifica-te que entries têm status: 'published'
```

### "TypeScript errors"
```bash
# Instala os types
npm install --save-dev @types/node
```

---

**Documentação completa**: [packages/client/README.md](./packages/client/README.md)

**Exemplos**: Consulta `apps/admin/src/pages/` para ver como o próprio admin usa o Supabase.

---

🎨 **Remember**: O kibanCMS dá-te os dados. Tu dás-lhes vida com o teu design único!
