import { getEntries } from '@/lib/kiban';

export const revalidate = 60; // ISR: revalidate every 60 seconds

export default async function BlogPage() {
  let posts;

  try {
    posts = await getEntries('blog');
  } catch (error) {
    return (
      <div className="error">
        <h1>Unable to load posts</h1>
        <p>Make sure your API key is configured in .env.local</p>
        <p style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="error">
        <h1>No posts found</h1>
        <p>Create your first blog post in the KibanCMS admin panel!</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Blog</h1>

      <div className="blog-list">
        {posts.map((post) => (
          <article key={post.id} className="blog-item">
            <a href={`/blog/${post.slug}`}>
              <h2>{post.title}</h2>
            </a>

            {post.excerpt && <p>{post.excerpt}</p>}

            <div className="blog-meta">
              <time>
                {new Date(post.created_at).toLocaleDateString('en-US', {
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
          </article>
        ))}
      </div>
    </div>
  );
}
