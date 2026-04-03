# 📱 Example Frontend Project

Complete example of a Next.js 14 blog connected to KibanCMS.

---

## 🏗️ Project Structure

```
my-blog/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Home page
│   ├── blog/
│   │   ├── page.tsx          # Blog list
│   │   └── [slug]/
│   │       └── page.tsx      # Blog post
│   └── lib/
│       └── kiban.ts          # KibanClient instance
├── .env.local
└── package.json
```

---

## 📦 Installation

```bash
npx create-next-app@latest my-blog --typescript --app --tailwind
cd my-blog
pnpm add @kiban/client
```

---

## 🔑 Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_KIBAN_URL=http://localhost:5176
KIBAN_API_KEY=kiban_live_xxxxxxxxxxxxx
```

---

## 💻 Code

### **app/lib/kiban.ts**

```typescript
import { KibanClient } from '@kiban/client';

// Singleton instance
export const kiban = new KibanClient({
  url: process.env.NEXT_PUBLIC_KIBAN_URL!,
  apiKey: process.env.KIBAN_API_KEY!,
});
```

### **app/page.tsx** (Home)

```typescript
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-5xl font-bold mb-6">
        Welcome to My Blog
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Powered by KibanCMS
      </p>
      <Link
        href="/blog"
        className="bg-cyan-500 text-white px-6 py-3 rounded-lg hover:bg-cyan-600"
      >
        View Blog Posts →
      </Link>
    </main>
  );
}
```

### **app/blog/page.tsx** (Blog List)

```typescript
import Link from 'next/link';
import { kiban } from '@/lib/kiban';

export const revalidate = 60; // ISR: revalidate every 60 seconds

export default async function BlogPage() {
  const posts = await kiban.getEntries('blog', {
    status: 'published',
    sort: 'created_at',
    order: 'desc',
  });

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Blog</h1>

      <div className="space-y-8">
        {posts.map((post) => (
          <article key={post.id} className="border-b pb-8">
            <Link href={`/blog/${post.slug}`}>
              <h2 className="text-2xl font-semibold hover:text-cyan-500 mb-2">
                {post.title}
              </h2>
            </Link>

            {post.excerpt && (
              <p className="text-gray-600 mb-4">{post.excerpt}</p>
            )}

            <div className="flex gap-4 text-sm text-gray-500">
              <time>
                {new Date(post.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>

              {post.tags.length > 0 && (
                <div className="flex gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-gray-100 px-2 py-1 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
```

### **app/blog/[slug]/page.tsx** (Blog Post)

```typescript
import { notFound } from 'next/navigation';
import { kiban } from '@/lib/kiban';
import type { Metadata } from 'next';

interface Props {
  params: { slug: string };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const post = await kiban.getEntry('blog', params.slug);

    return {
      title: post.title,
      description: post.excerpt || '',
      openGraph: {
        title: post.title,
        description: post.excerpt || '',
        type: 'article',
        publishedTime: post.published_at || undefined,
      },
    };
  } catch {
    return {
      title: 'Post Not Found',
    };
  }
}

// Generate static paths for all posts
export async function generateStaticParams() {
  const posts = await kiban.getEntries('blog', { status: 'published' });

  return posts.map((post) => ({
    slug: post.slug,
  }));
}

// Enable ISR
export const revalidate = 60;

export default async function BlogPostPage({ params }: Props) {
  let post;

  try {
    post = await kiban.getEntry('blog', params.slug);
  } catch {
    notFound();
  }

  // Only show published posts
  if (post.status !== 'published') {
    notFound();
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <article>
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">{post.title}</h1>

          <div className="flex gap-4 text-gray-600">
            <time>
              {new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>

            {post.tags.length > 0 && (
              <div className="flex gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-cyan-100 text-cyan-700 px-3 py-1 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-xl text-gray-600 mb-8 italic border-l-4 border-cyan-500 pl-4">
            {post.excerpt}
          </p>
        )}

        {/* Content */}
        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content.body }}
        />
      </article>
    </main>
  );
}
```

### **app/layout.tsx**

```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'My Blog',
    template: '%s | My Blog',
  },
  description: 'A blog powered by KibanCMS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b">
          <div className="max-w-4xl mx-auto px-4 py-4 flex gap-6">
            <Link href="/" className="font-semibold hover:text-cyan-500">
              Home
            </Link>
            <Link href="/blog" className="hover:text-cyan-500">
              Blog
            </Link>
          </div>
        </nav>

        {children}

        <footer className="border-t mt-12">
          <div className="max-w-4xl mx-auto px-4 py-6 text-center text-gray-600">
            <p>Powered by KibanCMS</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
```

---

## 🎨 Styling with Tailwind

Add to `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'), // For prose classes
  ],
};

export default config;
```

Install typography plugin:

```bash
pnpm add -D @tailwindcss/typography
```

---

## 🚀 Run the Project

```bash
pnpm dev
```

Visit:
- **Home:** http://localhost:3000
- **Blog:** http://localhost:3000/blog

---

## 🎯 Features Implemented

✅ **Static Generation (SSG)** - All pages pre-rendered at build time
✅ **Incremental Static Regeneration (ISR)** - Auto-update every 60 seconds
✅ **SEO Optimized** - Dynamic metadata per post
✅ **Type-safe** - Full TypeScript support
✅ **Responsive** - Mobile-friendly with Tailwind
✅ **Fast** - Cached at build time, instant page loads

---

## 📈 Production Build

```bash
pnpm build
pnpm start
```

This generates static HTML for all blog posts at build time!

---

## 🔄 Dynamic Routes (Alternative)

If you prefer client-side fetching instead of SSG:

```typescript
'use client'; // Client component

import { useEntries } from '@kiban/client/react';
import { kiban } from '@/lib/kiban';

export default function BlogPage() {
  const { data: posts, loading, error } = useEntries(kiban, 'blog', {
    status: 'published',
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {posts?.map((post) => (
        <article key={post.id}>
          <h2>{post.title}</h2>
        </article>
      ))}
    </div>
  );
}
```

---

## 🎓 Learn More

- **Next.js Documentation:** https://nextjs.org/docs
- **KibanCMS Documentation:** Check `FRONTEND_INTEGRATION_GUIDE.md`
- **@kiban/client API:** Check `packages/kiban-client/README.md`

---

## ✨ Next Steps

1. **Add search** - Filter posts by tags or search term
2. **Add pagination** - Use `offset` and `limit` parameters
3. **Add authors** - Join with `profiles` table for author info
4. **Add categories** - Create a new collection for categories
5. **Add comments** - Integrate with a commenting system

---

**Happy coding! 🚀**
