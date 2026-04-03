import { notFound } from 'next/navigation';
import { getEntry, getEntries } from '@/lib/kiban';
import type { Metadata } from 'next';

interface Props {
  params: { slug: string };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const post = await getEntry('blog', params.slug);

    return {
      title: post.title,
      description: post.excerpt || '',
    };
  } catch {
    return {
      title: 'Post Not Found',
    };
  }
}

// Generate static paths for all posts (SSG)
export async function generateStaticParams() {
  try {
    const posts = await getEntries('blog');
    return posts.map((post) => ({
      slug: post.slug,
    }));
  } catch {
    return [];
  }
}

// Enable ISR
export const revalidate = 60;

export default async function BlogPostPage({ params }: Props) {
  let post;

  try {
    post = await getEntry('blog', params.slug);
  } catch {
    notFound();
  }

  // Only show published posts
  if (post.status !== 'published') {
    notFound();
  }

  return (
    <div>
      <a href="/blog" className="back-link">
        ← Back to Blog
      </a>

      <article>
        <header className="post-header">
          <h1>{post.title}</h1>

          <div className="blog-meta">
            <time>
              {new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>

            {post.tags.length > 0 && (
              <div className="tags">
                {post.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {post.excerpt && (
          <p className="post-excerpt">{post.excerpt}</p>
        )}

        <div
          className="post-content"
          dangerouslySetInnerHTML={{ __html: post.content.body || '' }}
        />
      </article>
    </div>
  );
}
