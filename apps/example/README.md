# 🌐 KibanCMS Example Frontend

**Minimal "Hello World" example** - A starting point for building your own unique frontend with KibanCMS.

> ⚠️ **This is NOT production-ready.** It's a simple example to help you get started quickly. Customize it to match your design!

---

## ✨ What's Included

- ✅ **3 pages:** Home, Blog List, Blog Post Detail
- ✅ **Next.js 14** with App Router
- ✅ **TypeScript** for type safety
- ✅ **SSG + ISR** - Static generation with automatic revalidation
- ✅ **Zero dependencies** - Pure CSS, no UI framework
- ✅ **~200 lines of code** - Easy to understand and customize

---

## 🚀 Quick Start

### **Option A: Automated Setup (Recommended)** ⚡

Run the setup script that will guide you through configuration:

```bash
# Mac/Linux
npm run setup

# Windows
npm run setup:windows
```

The script will:
1. Create `.env.local` from template
2. Ask for your API key interactively
3. Install dependencies
4. You're ready to run `npm run dev`!

### **Option B: Manual Setup** 🛠️

#### 1. **Configure Environment**

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
NEXT_PUBLIC_KIBAN_URL=http://localhost:5176
KIBAN_API_KEY=kiban_live_xxxxxxxxxxxxx
```

> 💡 Get your API key from **Settings** in the KibanCMS admin panel.

#### 2. **Install Dependencies**

```bash
npm install
# or
pnpm install
```

#### 3. **Run Development Server**

```bash
npm run dev
```

Visit http://localhost:3000

---

## 📂 Project Structure

```
apps/example/
├── app/
│   ├── layout.tsx          # Root layout with nav + footer
│   ├── page.tsx            # Home page (Hello KibanCMS!)
│   ├── globals.css         # Minimal CSS styles
│   └── blog/
│       ├── page.tsx        # Blog list (shows all posts)
│       └── [slug]/
│           └── page.tsx    # Blog post detail
├── lib/
│   └── kiban.ts            # Simple API client
├── .env.example            # Environment variables template
├── package.json
└── README.md
```

---

## 🎨 Customization Guide

### **Change the Design**

All styles are in `app/globals.css`. Customize:

- **Colors:** Search for `#06b6d4` (cyan) and replace
- **Fonts:** Change `font-family` in `body`
- **Layout:** Modify `.container` max-width
- **Add Tailwind:** `npm install tailwindcss` if you prefer

### **Add More Pages**

Create a new page:

```typescript
// app/about/page.tsx
export default function AboutPage() {
  return (
    <div>
      <h1>About Us</h1>
      <p>Your content here...</p>
    </div>
  );
}
```

### **Add More Collections**

```typescript
// app/projects/page.tsx
import { getEntries } from '@/lib/kiban';

export default async function ProjectsPage() {
  const projects = await getEntries('projects'); // Your collection slug

  return (
    <div>
      {projects.map(project => (
        <div key={project.id}>
          <h2>{project.title}</h2>
        </div>
      ))}
    </div>
  );
}
```

### **Add Search/Filter**

```typescript
// app/blog/page.tsx
'use client';

import { useState } from 'react';

export default function BlogPage({ posts }: { posts: any[] }) {
  const [search, setSearch] = useState('');

  const filtered = posts.filter(post =>
    post.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input
        type="text"
        placeholder="Search posts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.map(post => (...))}
    </div>
  );
}
```

---

## 🔧 API Client

The example includes a minimal API client in `lib/kiban.ts`:

```typescript
import { getEntries, getEntry } from '@/lib/kiban';

// Get all published posts
const posts = await getEntries('blog');

// Get a single post
const post = await getEntry('blog', 'my-post-slug');
```

**Want more features?** Use the official `@kiban/client` SDK:

```bash
npm install @kiban/client
```

```typescript
import { KibanClient } from '@kiban/client';

const kiban = new KibanClient({
  url: process.env.NEXT_PUBLIC_KIBAN_URL!,
  apiKey: process.env.KIBAN_API_KEY!,
});

const posts = await kiban.getEntries('blog', {
  status: 'published',
  limit: 10,
  sort: 'created_at',
  order: 'desc',
});
```

See `packages/kiban-client/README.md` for full documentation.

---

## 🚀 Production Build

```bash
npm run build
npm run start
```

This generates **static HTML** for all pages at build time. Super fast! ⚡

---

## 📊 Features

### **Static Site Generation (SSG)**
All pages are pre-rendered at build time for instant loading.

### **Incremental Static Regeneration (ISR)**
Pages automatically revalidate every 60 seconds without rebuilding.

### **SEO Optimized**
Dynamic metadata per page:

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getEntry('blog', params.slug);

  return {
    title: post.title,
    description: post.excerpt || '',
  };
}
```

### **Type-Safe**
Full TypeScript support with inferred types.

---

## 🎓 Learn More

- **Full API Documentation:** See `/FRONTEND_INTEGRATION_GUIDE.md` in the root
- **Complete Example:** See `/EXAMPLE_FRONTEND.md` for a more detailed version
- **SDK Documentation:** See `/packages/kiban-client/README.md`
- **Next.js Docs:** https://nextjs.org/docs

---

## 🐛 Troubleshooting

### **"Unable to load posts"**
- Check that your `.env.local` has the correct API key
- Make sure the admin CMS is running on port 5176
- Verify you have posts with `status: 'published'` in the CMS

### **"No posts found"**
- Go to the admin panel and create some blog posts
- Make sure they're published (not draft)

### **Build errors**
- Run `npm install` to ensure all dependencies are installed
- Check that `.env.local` exists

---

## ✅ Next Steps

1. **Customize the design** - Make it yours!
2. **Add more pages** - About, Contact, etc.
3. **Add images** - Upload to KibanCMS Media Library (coming soon)
4. **Deploy** - Vercel, Netlify, or any static host
5. **Share** - Show the world what you built! 🌟

---

## 📝 Notes

- This example uses **server components** (default in Next.js App Router)
- Data is fetched at **build time** and cached
- Pages revalidate every **60 seconds** (configurable)
- CSS is **intentionally minimal** - easy to replace with your own

---

## 🤝 Need Help?

- Read the full integration guide: `/FRONTEND_INTEGRATION_GUIDE.md`
- Check the API docs: click "Get Code" in any collection in the admin panel
- Review the example: `/EXAMPLE_FRONTEND.md`

---

**Built with KibanCMS v1.0** 🚀

Start customizing and make it your own!
