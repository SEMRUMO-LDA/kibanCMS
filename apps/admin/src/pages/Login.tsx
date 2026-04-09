import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { initSupabaseWithConfig, getSupabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useI18n } from '../lib/i18n';
import { ArrowRight } from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=1920&q=80&auto=format') center/cover no-repeat fixed;
  padding: ${spacing[8]};
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
  }

  &::after {
    display: none;
  }
`;

const FormBox = styled.div`
  width: 100%;
  max-width: 440px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: ${spacing[10]} ${spacing[8]};
  border-radius: ${borders.radius['2xl']};
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  z-index: 10;
  position: relative;
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out};
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: ${spacing[8]};

  .logo-wrapper {
    width: auto;
    height: auto;
    margin: 0 auto ${spacing[6]};
    background: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  h1 {
    display: none;
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[500]};
    margin: 0;
    line-height: ${typography.lineHeight.relaxed};
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${spacing[5]};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

const Label = styled.label`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[700]};
  letter-spacing: ${typography.letterSpacing.wide};
  text-transform: uppercase;
`;

const Input = styled.input`
  width: 100%;
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.base};
  color: ${colors.gray[900]};
  font-family: ${typography.fontFamily.sans};
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &::placeholder {
    color: ${colors.gray[400]};
  }

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.accent[500]}20;
  }

  &:disabled {
    background: ${colors.gray[50]};
    cursor: not-allowed;
  }
`;

const Button = styled.button`
  width: 100%;
  padding: ${spacing[3.5]} ${spacing[4]};
  background: ${colors.accent[500]};
  color: ${colors.white};
  border: none;
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: ${shadows.sm};

  &:hover:not(:disabled) {
    background: ${colors.accent[600]};
    transform: translateY(-1px);
    box-shadow: ${shadows.md};
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    transition: transform ${animations.duration.fast} ${animations.easing.out};
  }

  &:hover:not(:disabled) svg {
    transform: translateX(2px);
  }
`;

const ErrorMsg = styled.div`
  padding: ${spacing[3]} ${spacing[4]};
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: ${borders.radius.lg};
  color: #991b1b;
  font-size: ${typography.fontSize.sm};
  text-align: center;
  animation: ${fadeIn} ${animations.duration.fast} ${animations.easing.out};
`;

const Footer = styled.div`
  margin-top: ${spacing[6]};
  padding-top: ${spacing[6]};
  border-top: 1px solid ${colors.gray[200]};
  text-align: center;

  p {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    margin: 0;

    strong {
      color: ${colors.accent[600]};
      font-weight: ${typography.fontWeight.semibold};
    }
  }
`;

// ============================================
// COMPONENT
// ============================================

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try multi-tenant login (API tries all tenants)
      const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/v1';
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error?.message || 'Invalid email or password');
      }

      // Init Supabase with tenant config from login response
      const { tenantId, supabaseUrl, supabaseAnonKey, session } = json.data;
      const client = initSupabaseWithConfig({ tenantId, supabaseUrl, supabaseAnonKey });

      // Set the session and wait for auth state to propagate
      await client.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      // Wait for AuthProvider to pick up the session
      await new Promise<void>((resolve) => {
        const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            subscription.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => { subscription.unsubscribe(); resolve(); }, 3000);
      });

      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <FormBox>
        <Header>
          <div className="logo-wrapper">
            <img src="/logo.png" alt="kibanCMS" style={{ height: '64px', objectFit: 'contain' }} />
          </div>
          <p>{t('login.title')}</p>
        </Header>

        <Form onSubmit={handleSubmit}>
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <FormGroup>
            <Label htmlFor="email">{t('login.email')}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required disabled={loading} autoComplete="email" />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" required disabled={loading} autoComplete="current-password" />
          </FormGroup>

          <Button type="submit" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.signIn')}
            {!loading && <ArrowRight size={20} />}
          </Button>
        </Form>

        <Footer>
          <p>Powered by <strong>kibanCMS</strong> v1.4</p>
        </Footer>
      </FormBox>
    </Container>
  );
};
