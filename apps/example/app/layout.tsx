import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KibanCMS Example',
  description: 'Minimal example frontend powered by KibanCMS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="container">
            <a href="/" className="logo">KibanCMS</a>
            <a href="/blog">Blog</a>
          </div>
        </nav>

        <main className="container">
          {children}
        </main>

        <footer className="footer">
          <div className="container">
            <p>Powered by <strong>KibanCMS</strong> v1.0</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
