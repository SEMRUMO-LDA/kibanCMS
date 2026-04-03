import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Key, Copy, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';

const Container = styled.div`
  max-width: 1400px;
`;

const Header = styled.header`
  margin-bottom: ${spacing[8]};

  h1 {
    font-size: ${typography.fontSize['3xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

const Section = styled.section`
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.xl};
  padding: ${spacing[6]};
  margin-bottom: ${spacing[6]};
  box-shadow: ${shadows.sm};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing[6]};
  padding-bottom: ${spacing[4]};
  border-bottom: 1px solid ${colors.gray[200]};

  h2 {
    font-size: ${typography.fontSize.xl};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0;
    color: ${colors.gray[900]};
    display: flex;
    align-items: center;
    gap: ${spacing[3]};
  }
`;

const KeyCard = styled.div`
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[5]};
  margin-bottom: ${spacing[4]};

  &:last-child {
    margin-bottom: 0;
  }
`;

const KeyHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing[3]};

  h3 {
    font-size: ${typography.fontSize.base};
    font-weight: ${typography.fontWeight.semibold};
    margin: 0;
    color: ${colors.gray[900]};
  }
`;

const KeyValue = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[3]};

  code {
    flex: 1;
    font-family: ${typography.fontFamily.mono};
    font-size: ${typography.fontSize.sm};
    background: ${colors.white};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.md};
    padding: ${spacing[3]};
    color: ${colors.gray[700]};
    user-select: all;
    word-break: break-all;
  }
`;

const KeyMeta = styled.div`
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[500]};
  display: flex;
  gap: ${spacing[4]};
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  background: ${props =>
    props.variant === 'primary' ? colors.accent[500] :
    props.variant === 'danger' ? '#dc2626' :
    colors.white
  };
  color: ${props =>
    props.variant === 'primary' || props.variant === 'danger' ? colors.white : colors.gray[700]
  };
  border: 1px solid ${props =>
    props.variant === 'primary' ? colors.accent[500] :
    props.variant === 'danger' ? '#dc2626' :
    colors.gray[300]
  };
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    background: ${props =>
      props.variant === 'primary' ? colors.accent[600] :
      props.variant === 'danger' ? '#b91c1c' :
      colors.gray[50]
    };
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Alert = styled.div<{ variant?: 'info' | 'warning' }>`
  background: ${props => props.variant === 'warning' ? '#fef3c7' : '#dbeafe'};
  border: 1px solid ${props => props.variant === 'warning' ? '#fcd34d' : '#93c5fd'};
  border-radius: ${borders.radius.lg};
  padding: ${spacing[4]};
  display: flex;
  gap: ${spacing[3]};
  margin-bottom: ${spacing[4]};

  svg {
    flex-shrink: 0;
    color: ${props => props.variant === 'warning' ? '#d97706' : '#2563eb'};
  }

  div {
    flex: 1;

    strong {
      display: block;
      font-weight: ${typography.fontWeight.semibold};
      color: ${props => props.variant === 'warning' ? '#92400e' : '#1e40af'};
      margin-bottom: ${spacing[1]};
    }

    p {
      margin: 0;
      font-size: ${typography.fontSize.sm};
      color: ${props => props.variant === 'warning' ? '#78350f' : '#1e3a8a'};
      line-height: ${typography.lineHeight.relaxed};
    }
  }
`;

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const Settings = () => {
  const { profile } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadApiKeys();
  }, [profile]);

  async function loadApiKeys() {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('profile_id', profile.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(key: string, keyId: string) {
    await navigator.clipboard.writeText(key);
    setCopiedId(keyId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleVisibility(keyId: string) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <Container>
        <Header>
          <h1>Settings</h1>
          <p>Loading...</p>
        </Header>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <h1>Settings</h1>
        <p>Manage your API keys and project configuration</p>
      </Header>

      <Section>
        <SectionHeader>
          <h2>
            <Key size={24} />
            API Keys
          </h2>
        </SectionHeader>

        <Alert variant="info">
          <AlertCircle size={20} />
          <div>
            <strong>Keep your API keys secure</strong>
            <p>
              API keys allow your frontend applications to fetch content from your CMS.
              Never commit keys to public repositories or share them publicly.
            </p>
          </div>
        </Alert>

        <Alert variant="warning">
          <AlertCircle size={20} />
          <div>
            <strong>After running the migration</strong>
            <p>
              Execute the migration file <code>007_api_keys.sql</code> in Supabase SQL Editor to create your first API key.
              Then refresh this page to see your key.
            </p>
          </div>
        </Alert>

        {apiKeys.length === 0 ? (
          <KeyCard>
            <p style={{ margin: 0, color: colors.gray[600], textAlign: 'center' }}>
              No API keys found. Run the migration to create your first key.
            </p>
          </KeyCard>
        ) : (
          apiKeys.map((key) => {
            const isVisible = visibleKeys.has(key.id);
            const displayKey = isVisible ? key.key_prefix.replace('...', '_'.repeat(32)) : key.key_prefix;

            return (
              <KeyCard key={key.id}>
                <KeyHeader>
                  <h3>{key.name}</h3>
                </KeyHeader>

                <KeyValue>
                  <code>{displayKey}</code>
                  <Button onClick={() => toggleVisibility(key.id)}>
                    {isVisible ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button onClick={() => handleCopy(key.key_prefix, key.id)}>
                    {copiedId === key.id ? <Check /> : <Copy />}
                    {copiedId === key.id ? 'Copied!' : 'Copy'}
                  </Button>
                </KeyValue>

                <KeyMeta>
                  <span>Created: {formatDate(key.created_at)}</span>
                  <span>Last used: {formatDate(key.last_used_at)}</span>
                </KeyMeta>
              </KeyCard>
            );
          })
        )}
      </Section>
    </Container>
  );
};
