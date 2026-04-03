# @kiban/client

Official JavaScript/TypeScript client for **KibanCMS** - A modern headless CMS.

## Installation

```bash
npm install @kiban/client
# or
pnpm add @kiban/client
# or
yarn add @kiban/client
```

## Quick Start

### Vanilla JavaScript/TypeScript

```typescript
import { KibanClient } from '@kiban/client';

const kiban = new KibanClient({
  url: 'https://your-cms.com',
  apiKey: 'kiban_live_xxxxx'
});

// Get all collections
const collections = await kiban.getCollections();

// Get entries from a collection
const posts = await kiban.getEntries('blog', {
  status: 'published',
  limit: 10,
  sort: 'created_at',
  order: 'desc'
});

// Get a single entry by slug
const post = await kiban.getEntry('blog', 'my-first-post');

// Fluent API
const posts = await kiban
  .collection('blog')
  .find({ status: 'published' });
```

### React Hooks

```typescript
import { KibanClient } from '@kiban/client';
import { useEntries, useEntry } from '@kiban/client/react';

// Create client instance (do this once, ideally in a context)
const kiban = new KibanClient({
  url: process.env.NEXT_PUBLIC_KIBAN_URL!,
  apiKey: process.env.KIBAN_API_KEY!
});

// Use in your components
function BlogList() {
  const { data, loading, error, refetch } = useEntries(kiban, 'blog', {
    status: 'published',
    limit: 10
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {data?.map(post => (
        <li key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}

function BlogPost({ slug }: { slug: string }) {
  const { data: post, loading, error } = useEntry(kiban, 'blog', slug);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!post) return <div>Post not found</div>;

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content.body }} />
    </article>
  );
}
```

## API Reference

### `KibanClient`

#### Constructor

```typescript
new KibanClient(config: KibanClientConfig)
```

**Options:**
- `url` (required): Base URL of your KibanCMS instance
- `apiKey` (required): API key for authentication
- `timeout` (optional): Request timeout in milliseconds (default: 10000)
- `fetch` (optional): Custom fetch implementation

#### Methods

##### `getCollections()`
Get all collections.

```typescript
const collections = await kiban.getCollections();
```

##### `getCollection(slug: string)`
Get a single collection by slug.

```typescript
const collection = await kiban.getCollection('blog');
```

##### `getEntries(collectionSlug: string, options?: QueryOptions)`
Get entries from a collection.

**Options:**
- `status`: Filter by status ('draft' | 'published' | 'archived')
- `limit`: Number of results (default: 100)
- `offset`: Pagination offset (default: 0)
- `sort`: Sort field (default: 'created_at')
- `order`: Sort order ('asc' | 'desc', default: 'desc')

```typescript
const posts = await kiban.getEntries('blog', {
  status: 'published',
  limit: 10,
  sort: 'created_at',
  order: 'desc'
});
```

##### `getEntry(collectionSlug: string, entrySlug: string)`
Get a single entry by slug.

```typescript
const post = await kiban.getEntry('blog', 'my-post-slug');
```

##### `collection(slug: string)`
Fluent query builder.

```typescript
// Find entries
const posts = await kiban.collection('blog').find({ status: 'published' });

// Find one entry
const post = await kiban.collection('blog').findOne({ slug: 'my-post' });

// Count entries
const count = await kiban.collection('blog').count({ status: 'published' });
```

## React Hooks

### `useEntries(client, collectionSlug, options)`
Hook to fetch entries from a collection.

**Returns:**
- `data`: Array of entries or null
- `loading`: Boolean indicating loading state
- `error`: Error message or null
- `refetch`: Function to refetch data

### `useEntry(client, collectionSlug, entrySlug)`
Hook to fetch a single entry.

**Returns:**
- `data`: Entry object or null
- `loading`: Boolean indicating loading state
- `error`: Error message or null
- `refetch`: Function to refetch data

### `useCollections(client)`
Hook to fetch all collections.

### `useCollection(client, slug)`
Hook to fetch a single collection.

## Environment Variables

Add these to your `.env.local` file:

```bash
NEXT_PUBLIC_KIBAN_URL=https://your-cms.com
KIBAN_API_KEY=kiban_live_xxxxx
```

## TypeScript Support

This package is written in TypeScript and includes type definitions.

```typescript
import type { Entry, Collection, QueryOptions } from '@kiban/client';
```

## Error Handling

```typescript
try {
  const posts = await kiban.getEntries('blog');
} catch (error) {
  console.error('Failed to fetch posts:', error);
}
```

## Next.js Example

### App Router (Server Components)

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

### Pages Router (SSG)

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

export async function getStaticProps() {
  const kiban = new KibanClient({
    url: process.env.NEXT_PUBLIC_KIBAN_URL!,
    apiKey: process.env.KIBAN_API_KEY!
  });

  const posts = await kiban.getEntries('blog', { status: 'published' });

  return {
    props: { posts },
    revalidate: 60 // Revalidate every 60 seconds
  };
}
```

## License

MIT
