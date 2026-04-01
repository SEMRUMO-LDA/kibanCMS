# kibanCMS 🚀

> **Next-generation headless CMS** - AI-native, geo-enabled, enterprise-ready.
> Built with TypeScript, Supabase, and a monochrome design philosophy for 2026.

## 🎯 Key Features

- **📋 Dynamic Schema Provider** - Configure everything via manifest (no hardcoded forms)
- **🤖 AI-Powered Media** - Automatic alt text, object detection, and SEO optimization
- **🌍 PostGIS & pgvector** - Location-based content and semantic search
- **🎨 Ultra-minimal UI** - Monochrome, keyboard-first, zero friction
- **📦 Package-based** - Distribute as NPM packages with tree-shaking
- **🔒 Enterprise Security** - Row-Level Security, audit trails, webhooks

## 📁 Architecture

```
kibanCMS/
├── packages/
│   ├── @kiban/core          # Business logic (framework-agnostic)
│   ├── @kiban/ui            # React components
│   ├── @kiban/media         # Asset management & AI processing
│   ├── @kiban/hooks         # React hooks
│   └── @kiban/types         # TypeScript definitions
├── supabase/
│   └── functions/           # Edge functions for processing
└── database/
    └── migrations/          # SQL schemas with RLS
```

## 🚀 Quick Start

### 1. Setup Supabase

```bash
# Create a new Supabase project
# Go to SQL Editor and run the migration scripts in order:
database/migrations/001_initial_schema.sql
database/migrations/002_advanced_schema.sql
database/migrations/003_hooks_audit_smart_media.sql

# Create Storage bucket
# Go to Storage > New Bucket
# Name: "media"
# Public: Yes
```

### 2. Install in Your Project

```bash
# Install packages (when published)
npm install @kiban/core @kiban/ui @kiban/media

# Or for local development
npm link ./packages/core
npm link ./packages/ui
npm link ./packages/media
```

### 3. Create Your Manifest

```typescript
// kiban.manifest.ts
import type { SchemaManifest } from '@kiban/types';

export const manifest: SchemaManifest = {
  version: '1.0.0',
  name: 'My Agency CMS',
  collections: [
    {
      slug: 'posts',
      label: 'Blog Posts',
      fields: [
        {
          name: 'title',
          type: 'text',
          label: 'Title',
          required: true,
          searchable: true
        },
        {
          name: 'content',
          type: 'blocks',
          label: 'Content',
          allowedBlocks: ['paragraph', 'heading', 'image', 'quote']
        },
        {
          name: 'featured_image',
          type: 'media',
          label: 'Featured Image',
          accept: ['image/*']
        },
        {
          name: 'location',
          type: 'geo',
          label: 'Location',
          ui: { form: { width: 'half' } }
        },
        {
          name: 'published_at',
          type: 'datetime',
          label: 'Publish Date',
          defaultValue: 'now()'
        },
        {
          name: 'status',
          type: 'select',
          label: 'Status',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
            { value: 'archived', label: 'Archived' }
          ],
          defaultValue: 'draft'
        }
      ],
      features: {
        versioning: true,
        trash: true,
        preview: true
      },
      ui: {
        list: {
          defaultSort: { field: 'published_at', order: 'desc' },
          perPage: 20
        }
      }
    }
  ],
  settings: {
    defaultLocale: 'pt',
    enabledLocales: ['pt', 'en'],
    features: {
      ai: true,
      geo: true,
      media: true,
      i18n: true,
      versioning: true
    }
  }
};
```

### 4. Initialize KibanCMS

```typescript
// app.tsx
import { createKibanClient } from '@kiban/core';
import { KibanProvider } from '@kiban/ui';
import { createClient } from '@supabase/supabase-js';
import { manifest } from './kiban.manifest';

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Initialize KibanCMS
const kiban = createKibanClient({
  supabaseClient: supabase,
  manifest,
  organizationId: 'your-org-id'
});

function App() {
  return (
    <KibanProvider client={kiban} manifest={manifest}>
      <KibanAdmin />
    </KibanProvider>
  );
}
```

### 5. The Admin Interface (Auto-generated)

```typescript
// KibanAdmin.tsx
import { DynamicRouter } from '@kiban/ui';
import { useKiban } from '@kiban/hooks';

export function KibanAdmin() {
  const { manifest, client } = useKiban();

  return (
    <DynamicRouter
      manifest={manifest}
      client={client}
    />
  );
}
```

## 🎨 Frontend Consumption (Your Website)

```typescript
// Your public-facing website
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

export function BlogPage() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    supabase
      .from('content_nodes')
      .select(`
        *,
        translations!inner(
          title,
          slug,
          content_blocks
        )
      `)
      .eq('status', 'published')
      .eq('translations.locale', 'pt')
      .order('published_at', { ascending: false })
      .then(({ data }) => setPosts(data || []));
  }, []);

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h1>{post.translations[0].title}</h1>
          {/* Render content blocks */}
          <ContentRenderer blocks={post.translations[0].content_blocks} />
        </article>
      ))}
    </div>
  );
}
```

## 🔒 Security Checklist

✅ **Row-Level Security (RLS)** - All tables have RLS enabled
✅ **Authentication Required** - Only authenticated users in `profiles` table
✅ **Organization Isolation** - Multi-tenancy with org-level data separation
✅ **Audit Trail** - All actions logged with user, timestamp, and changes
✅ **Type Safety** - Full TypeScript with strict mode

## 🧪 Testing the Setup

### 1. Create a Test User

```sql
-- Run in Supabase SQL Editor
INSERT INTO auth.users (email, encrypted_password)
VALUES ('admin@test.com', crypt('password123', gen_salt('bf')));

-- Get the user ID from auth.users, then:
INSERT INTO profiles (id, email, full_name, role, organization_id)
VALUES (
  'user-uuid-here',
  'admin@test.com',
  'Admin User',
  'admin',
  'default-org-uuid'
);
```

### 2. Test Media Upload

```typescript
import { MediaProcessingService } from '@kiban/media';

const mediaService = new MediaProcessingService({
  supabase,
  organizationId: 'your-org-id',
  userId: 'your-user-id'
});

// Upload and process
const result = await mediaService.processUpload(file, {
  enableAI: true,
  folder: '/blog/2024'
});

console.log('Blurhash:', result.blurhash);
console.log('AI Alt Text:', result.aiMetadata?.alt_text);
console.log('Responsive Variants:', result.variants);
```

### 3. Test Dynamic Forms

```typescript
import { DynamicFormGenerator } from '@kiban/ui';
import { SchemaProvider } from '@kiban/core';

const schemaProvider = new SchemaProvider(manifest);

function CreatePost() {
  const collection = schemaProvider.getCollection('posts');

  return (
    <DynamicFormGenerator
      collection={collection}
      schemaProvider={schemaProvider}
      onSubmit={async (data) => {
        await supabase.from('content_nodes').insert(data);
      }}
    />
  );
}
```

## 🚢 Deployment

### Package Publishing (Private NPM)

```bash
# Build all packages
pnpm build

# Publish to GitHub Packages
pnpm changeset
pnpm changeset version
pnpm changeset publish
```

### Environment Variables

```env
# .env.local
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_OPENAI_API_KEY=sk-xxx
VITE_GOOGLE_VISION_API_KEY=xxx
```

## 📊 Performance Optimizations

- **Lazy Loading**: All components use dynamic imports
- **Image Optimization**: Automatic WebP generation with fallbacks
- **Blurhash**: Instant placeholders for images
- **Infinite Scroll**: Virtual scrolling for large lists
- **Edge Caching**: CDN integration for media files
- **Bundle Splitting**: Each package is independently tree-shakeable

## 🎯 Roadmap

### v1.1 (Next Sprint)
- [ ] Auth UI with monochrome design
- [ ] Real-time collaborative editing
- [ ] Advanced workflow management
- [ ] A/B testing for content

### v1.2 (Q2 2024)
- [ ] Plugin marketplace
- [ ] GraphQL API
- [ ] Mobile app (React Native)
- [ ] AI content generation

## 📝 License

MIT © Kiban Agency

## 🤝 Contributing

This is a proprietary project. For bug reports or feature requests, contact: dev@kiban.pt

---

Built with ❤️ by Tiago Pachec - Pushing the boundaries of what a CMS can be.