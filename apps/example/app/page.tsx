export default function HomePage() {
  return (
    <div className="hero">
      <h1>Hello, KibanCMS!</h1>
      <p>
        This is a minimal example frontend. Customize it to build your own unique website.
      </p>
      <a href="/blog" className="btn">
        View Blog Posts →
      </a>

      <div style={{ marginTop: '4rem', textAlign: 'left', maxWidth: '600px', margin: '4rem auto 0' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🚀 Quick Start</h2>
        <ol style={{ lineHeight: '2', color: '#6b7280', marginLeft: '1.5rem' }}>
          <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
          <li>Add your API key from Settings</li>
          <li>Run <code>npm install</code></li>
          <li>Run <code>npm run dev</code></li>
          <li>Customize and build! ✨</li>
        </ol>
      </div>
    </div>
  );
}
