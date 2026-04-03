# 🚀 KibanCMS v1.0 - Frontend Integration Guide

Complete guide to connect your frontend applications to KibanCMS.

---

## 📋 Prerequisites

Before connecting your frontend, complete these steps:

### 1. **Run Database Migrations**

Execute in Supabase SQL Editor:
```bash
database/migrations/007_api_keys.sql
```

This creates your API key automatically.

### 2. **Get Your API Key**

1. Go to **Settings** in the admin panel (`/settings`)
2. Copy your API key (format: `kiban_live_xxxxxxxxxxxxx`)
3. Keep it secure - never commit to Git!

---

## 🎯 Installation

### Option A: Using @kiban/client SDK (Recommended)

```bash
cd packages/kiban-client
pnpm install
pnpm build

# Then in your frontend project
pnpm add file:../path/to/packages/kiban-client
```

### Option B: Direct API calls

No installation needed - just use `fetch()` with your API key.

---

## 🔑 API Endpoints

All endpoints require authentication via the `Authorization` header.

### Base URL
```
https://your-cms.com/api/v1
```

### Authentication
```http
Authorization: Bearer kiban_live_xxxxxxxxxxxxx
```

### Available Endpoints

#### **GET /collections**
Get all collections.

```bash
curl https://your-cms.com/api/v1/collections \
  -H "Authorization: Bearer kiban_live_xxxxx"
```

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "name": "Blog Posts",
      "slug": "blog",
      "description": "...",
      "type": "post"
    }
  ],
  "meta": { "count": 1 },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### **GET /collections/:slug**
Get a single collection with schema.

```bash
curl https://your-cms.com/api/v1/collections/blog \
  -H "Authorization: Bearer kiban_live_xxxxx"
```

#### **GET /entries/:collection**
Get all entries from a collection.

**Query Parameters:**
- `status` - Filter by status: `draft`, `published`, `archived`
- `limit` - Number of results (default: 100)
- `offset` - Pagination offset (default: 0)
- `sort` - Sort field (default: `created_at`)
- `order` - Sort order: `asc` or `desc` (default: `desc`)

```bash
curl "https://your-cms.com/api/v1/entries/blog?status=published&limit=10" \
  -H "Authorization: Bearer kiban_live_xxxxx"
```

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "title": "My First Post",
      "slug": "my-first-post",
      "content": { "body": "..." },
      "excerpt": "...",
      "status": "published",
      "published_at": "2024-01-01T00:00:00.000Z",
      "tags": ["react", "cms"],
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "meta": {
    "collection": { "id": "...", "name": "Blog Posts", "slug": "blog" },
    "pagination": { "limit": 10, "offset": 0, "total": 42 }
  }
}
```

#### **GET /entries/:collection/:slug**
Get a single entry by slug.

```bash
curl https://your-cms.com/api/v1/entries/blog/my-first-post \
  -H "Authorization: Bearer kiban_live_xxxxx"
```

---

## 💻 Usage Examples

### **Vanilla JavaScript/TypeScript**

```typescript
import { KibanClient } from '@kiban/client';

const kiban = new KibanClient({
  url: 'https://your-cms.com',
  apiKey: 'kiban_live_xxxxx'
});

// Get all posts
const posts = await kiban.getEntries('blog', {
  status: 'published',
  limit: 10
});

// Get single post
const post = await kiban.getEntry('blog', 'my-first-post');

// Fluent API
const posts = await kiban.collection('blog').find({ status: 'published' });
```

### **React with Hooks**

```typescript
import { KibanClient } from '@kiban/client';
import { useEntries, useEntry } from '@kiban/client/react';

const kiban = new KibanClient({
  url: process.env.NEXT_PUBLIC_KIBAN_URL!,
  apiKey: process.env.KIBAN_API_KEY!
});

function BlogList() {
  const { data: posts, loading, error } = useEntries(kiban, 'blog', {
    status: 'published'
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {posts?.map(post => (
        <li key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}

function BlogPost({ slug }: { slug: string }) {
  const { data: post, loading } = useEntry(kiban, 'blog', slug);

  if (loading) return <div>Loading...</div>;

  return (
    <article>
      <h1>{post?.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post?.content.body }} />
    </article>
  );
}
```

### **Next.js App Router (Server Components)**

```typescript
// app/blog/page.tsx
import { KibanClient } from '@kiban/client';

const kiban = new KibanClient({
  url: process.env.NEXT_PUBLIC_KIBAN_URL!,
  apiKey: process.env.KIBAN_API_KEY!
});

export default async function BlogPage() {
  const posts = await kiban.getEntries('blog', { status: 'published' });

  return (
    <div>
      <h1>Blog</h1>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </div>
  );
}
```

```typescript
// app/blog/[slug]/page.tsx
export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await kiban.getEntry('blog', params.slug);

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content.body }} />
    </article>
  );
}

// Generate static paths
export async function generateStaticParams() {
  const posts = await kiban.getEntries('blog', { status: 'published' });

  return posts.map(post => ({
    slug: post.slug
  }));
}
```

### **Next.js Pages Router (SSG)**

```typescript
// pages/blog/index.tsx
import { KibanClient } from '@kiban/client';
import type { Entry } from '@kiban/client';

interface Props {
  posts: Entry[];
}

export default function BlogPage({ posts }: Props) {
  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
        </article>
      ))}
    </div>
  );
}

export async function getStaticProps() {
  const kiban = new KibanClient({
    url: process.env.NEXT_PUBLIC_KIBAN_URL!,
    apiKey: process.env.KIBAN_API_KEY!
  });

  const posts = await kiban.getEntries('blog', { status: 'published' });

  return {
    props: { posts },
    revalidate: 60 // ISR: revalidate every 60 seconds
  };
}
```

### **Direct Fetch (No SDK)**

```typescript
const response = await fetch('https://your-cms.com/api/v1/entries/blog?status=published', {
  headers: {
    'Authorization': 'Bearer kiban_live_xxxxx',
    'Content-Type': 'application/json'
  }
});

const { data: posts, meta } = await response.json();
```

---

## 🔒 Security Best Practices

### **Environment Variables**

Create `.env.local` file (never commit this!):

```bash
# Public - safe to expose to browser
NEXT_PUBLIC_KIBAN_URL=https://your-cms.com

# Private - keep secret (server-side only)
KIBAN_API_KEY=kiban_live_xxxxxxxxxxxxx
```

### **CORS Configuration**

The API automatically handles CORS. For production, restrict allowed origins in:
```
apps/admin/src/pages/api/v1/auth-middleware.ts
```

---

## 📊 Data Structure

### **Entry Object**

```typescript
{
  id: string;                  // UUID
  title: string;               // Entry title
  slug: string;                // URL-friendly slug
  content: Record<string, any>; // Custom fields (JSONB)
  excerpt: string | null;      // Short description
  status: 'draft' | 'published' | 'archived';
  published_at: string | null; // ISO 8601 timestamp
  tags: string[];              // Array of tags
  meta: Record<string, any>;   // SEO metadata
  created_at: string;          // ISO 8601 timestamp
  updated_at: string;          // ISO 8601 timestamp
}
```

### **Content Field**

The `content` field is a flexible JSONB object that stores all custom fields:

```json
{
  "content": {
    "body": "<p>HTML content...</p>",
    "author": "John Doe",
    "featured": true,
    "custom_field": "any value"
  }
}
```

---

## 🧪 Testing the API

### **Using cURL**

```bash
# Get collections
curl https://your-cms.com/api/v1/collections \
  -H "Authorization: Bearer kiban_live_xxxxx"

# Get entries
curl https://your-cms.com/api/v1/entries/blog?status=published&limit=5 \
  -H "Authorization: Bearer kiban_live_xxxxx"
```

### **Using Browser DevTools**

```javascript
const response = await fetch('http://localhost:5176/api/v1/entries/blog', {
  headers: {
    'Authorization': 'Bearer kiban_live_xxxxx'
  }
});
const data = await response.json();
console.log(data);
```

---

## 🐛 Troubleshooting

### **401 Unauthorized**
- Check if your API key is correct
- Ensure you're using `Authorization: Bearer kiban_live_xxxxx` header
- Verify the key hasn't been revoked in Settings

### **404 Collection Not Found**
- Verify the collection slug exists
- Check spelling (case-sensitive)

### **CORS Error**
- The API should handle CORS automatically
- If issues persist, check `auth-middleware.ts` CORS settings

### **Timeout Error**
- Increase timeout in client config:
  ```typescript
  new KibanClient({ url, apiKey, timeout: 30000 })
  ```

---

## 🎓 Complete Example Project

Check `packages/kiban-client/README.md` for full API documentation and more examples.

---

## ✅ Checklist

- [ ] Run `007_api_keys.sql` migration in Supabase
- [ ] Get API key from Settings page
- [ ] Add environment variables to `.env.local`
- [ ] Install `@kiban/client` package
- [ ] Test API connection
- [ ] Build your frontend! 🚀

---

**Need help?** Check the admin panel's "Get Code" button on any collection for copy-paste ready examples!
