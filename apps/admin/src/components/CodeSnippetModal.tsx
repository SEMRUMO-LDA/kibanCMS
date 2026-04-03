import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { X, Copy, Check, AlertCircle } from 'lucide-react';
import { colors, spacing, typography, borders, shadows } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';

interface CodeSnippetModalProps {
  collectionSlug: string;
  collectionName: string;
  onClose: () => void;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${spacing[4]};
`;

const Modal = styled.div`
  background: ${colors.white};
  border-radius: ${borders.radius.xl};
  box-shadow: ${shadows['2xl']};
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  padding: ${spacing[6]};
  border-bottom: 1px solid ${colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0;
    color: ${colors.gray[900]};
  }

  button {
    background: none;
    border: none;
    padding: ${spacing[2]};
    cursor: pointer;
    color: ${colors.gray[500]};
    border-radius: ${borders.radius.md};
    transition: all 0.2s;

    &:hover {
      color: ${colors.gray[700]};
      background: ${colors.gray[100]};
    }
  }
`;

const Content = styled.div`
  padding: ${spacing[6]};
  overflow-y: auto;
  flex: 1;
`;

const Section = styled.div`
  margin-bottom: ${spacing[8]};

  &:last-child {
    margin-bottom: 0;
  }

  h3 {
    font-size: ${typography.fontSize.lg};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0 0 ${spacing[4]} 0;
    line-height: ${typography.lineHeight.relaxed};
  }
`;

const CodeBlock = styled.div`
  position: relative;
  background: ${colors.gray[900]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  margin-bottom: ${spacing[3]};

  &:last-child {
    margin-bottom: 0;
  }

  pre {
    margin: 0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: ${typography.fontSize.sm};
    line-height: ${typography.lineHeight.relaxed};
    color: ${colors.gray[100]};
    overflow-x: auto;
  }
`;

const CopyButton = styled.button`
  position: absolute;
  top: ${spacing[3]};
  right: ${spacing[3]};
  background: ${colors.gray[800]};
  border: 1px solid ${colors.gray[700]};
  border-radius: ${borders.radius.md};
  padding: ${spacing[2]} ${spacing[3]};
  cursor: pointer;
  color: ${colors.gray[300]};
  font-size: ${typography.fontSize.xs};
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all 0.2s;

  &:hover {
    background: ${colors.gray[700]};
    color: ${colors.white};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const Label = styled.div`
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.gray[500]};
  margin-bottom: ${spacing[2]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Alert = styled.div`
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[4]};

  svg {
    flex-shrink: 0;
    color: #d97706;
  }

  div {
    flex: 1;

    strong {
      display: block;
      font-weight: ${typography.fontWeight.semibold};
      color: #92400e;
      margin-bottom: ${spacing[1]};
      font-size: ${typography.fontSize.sm};
    }

    p {
      margin: 0;
      font-size: ${typography.fontSize.xs};
      color: #78350f;
      line-height: ${typography.lineHeight.relaxed};

      a {
        color: #d97706;
        text-decoration: underline;
      }
    }
  }
`;

export const CodeSnippetModal = ({ collectionSlug, collectionName, onClose }: CodeSnippetModalProps) => {
  const { profile } = useAuth();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [loadingKey, setLoadingKey] = useState(true);

  useEffect(() => {
    loadApiKey();
  }, [profile]);

  async function loadApiKey() {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('key_prefix')
        .eq('profile_id', profile.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      if (data) {
        setApiKey(data.key_prefix);
      }
    } catch (error) {
      console.error('Error loading API key:', error);
    } finally {
      setLoadingKey(false);
    }
  }

  const handleCopy = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const snippets = [
    {
      label: 'Install @kiban/client',
      code: `npm install @kiban/client
# or
pnpm add @kiban/client`,
    },
    {
      label: 'Fetch all entries',
      code: `import { KibanClient } from '@kiban/client';

const kiban = new KibanClient({
  url: '${window.location.origin}',
  apiKey: '${apiKey || 'your-api-key'}'
});

// Fetch all published entries
const entries = await kiban
  .collection('${collectionSlug}')
  .find({ status: 'published' })
  .sort({ created_at: 'desc' })
  .exec();

console.log(entries);`,
    },
    {
      label: 'Fetch single entry by slug',
      code: `// Fetch a specific entry by slug
const entry = await kiban
  .collection('${collectionSlug}')
  .findOne({ slug: 'my-entry-slug' })
  .exec();

console.log(entry);`,
    },
    {
      label: 'React Hook (useEntries)',
      code: `import { useEntries } from '@kiban/client/react';

function ${collectionName.replace(/\s+/g, '')}List() {
  const { data, loading, error } = useEntries('${collectionSlug}', {
    status: 'published',
    sort: { created_at: 'desc' },
    limit: 10
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data?.map((entry) => (
        <article key={entry.id}>
          <h2>{entry.title}</h2>
          <p>{entry.content.excerpt}</p>
        </article>
      ))}
    </div>
  );
}`,
    },
    {
      label: 'React Hook (useEntry)',
      code: `import { useEntry } from '@kiban/client/react';

function ${collectionName.replace(/\s+/g, '')}Detail({ slug }: { slug: string }) {
  const { data: entry, loading, error } = useEntry('${collectionSlug}', slug);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!entry) return <div>Not found</div>;

  return (
    <article>
      <h1>{entry.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: entry.content.body }} />
    </article>
  );
}`,
    },
    {
      label: 'Next.js App Router Example',
      code: `// app/${collectionSlug}/page.tsx
import { KibanClient } from '@kiban/client';

const kiban = new KibanClient({
  url: process.env.NEXT_PUBLIC_KIBAN_URL!,
  apiKey: process.env.KIBAN_API_KEY
});

export default async function ${collectionName.replace(/\s+/g, '')}Page() {
  const entries = await kiban
    .collection('${collectionSlug}')
    .find({ status: 'published' })
    .sort({ created_at: 'desc' })
    .exec();

  return (
    <div>
      <h1>${collectionName}</h1>
      {entries.map((entry) => (
        <article key={entry.id}>
          <h2>{entry.title}</h2>
          <p>{entry.content.excerpt}</p>
        </article>
      ))}
    </div>
  );
}`,
    },
  ];

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <div>
            <h2>Frontend Integration</h2>
            <p style={{ margin: `${spacing[1]} 0 0`, fontSize: typography.fontSize.sm, color: colors.gray[600] }}>
              {collectionName} • {collectionSlug}
            </p>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </Header>

        <Content>
          {!loadingKey && !apiKey && (
            <Alert>
              <AlertCircle size={20} />
              <div>
                <strong>API Key Required</strong>
                <p>
                  No API key found. Go to <a href="/settings">Settings</a> and run the migration <code>007_api_keys.sql</code> to generate your key.
                </p>
              </div>
            </Alert>
          )}

          <Section>
            <h3>How to use this collection in your frontend</h3>
            <p>
              Copy and paste these code snippets into your React, Next.js, or any JavaScript project.
              The @kiban/client SDK makes it easy to fetch and display your content.
            </p>
          </Section>

          {snippets.map((snippet, index) => (
            <Section key={index}>
              <Label>{snippet.label}</Label>
              <CodeBlock>
                <CopyButton onClick={() => handleCopy(snippet.code, index)}>
                  {copiedIndex === index ? (
                    <>
                      <Check /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy /> Copy
                    </>
                  )}
                </CopyButton>
                <pre>{snippet.code}</pre>
              </CodeBlock>
            </Section>
          ))}

          <Section>
            <h3>Environment Variables</h3>
            <p>Add these to your .env.local file:</p>
            <CodeBlock>
              <CopyButton onClick={() => handleCopy(`NEXT_PUBLIC_KIBAN_URL=${window.location.origin}\nKIBAN_API_KEY=${apiKey || 'your-api-key'}`, 999)}>
                {copiedIndex === 999 ? (
                  <>
                    <Check /> Copied!
                  </>
                ) : (
                  <>
                    <Copy /> Copy
                  </>
                )}
              </CopyButton>
              <pre>{`NEXT_PUBLIC_KIBAN_URL=${window.location.origin}\nKIBAN_API_KEY=${apiKey || 'your-api-key'}`}</pre>
            </CodeBlock>
          </Section>

          <Section>
            <h3>Need help?</h3>
            <p>
              Check the full documentation at{' '}
              <a
                href="https://docs.kiban.dev"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.accent[500], textDecoration: 'none' }}
              >
                docs.kiban.dev
              </a>
            </p>
          </Section>
        </Content>
      </Modal>
    </Overlay>
  );
};
