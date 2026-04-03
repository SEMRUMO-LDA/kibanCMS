/**
 * Diagnostics Page
 * Tests every critical path: auth, RLS, database connectivity.
 * Access at /diagnostics
 */
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'running';
  detail: string;
  ms?: number;
}

export const Diagnostics = () => {
  const { session, user, profile } = useAuth();
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const addResult = (r: TestResult) => {
    setResults(prev => [...prev.filter(p => p.name !== r.name), r]);
  };

  const runTest = async (name: string, fn: () => Promise<string>) => {
    addResult({ name, status: 'running', detail: '...' });
    const start = Date.now();
    try {
      const detail = await fn();
      addResult({ name, status: 'pass', detail, ms: Date.now() - start });
    } catch (err: any) {
      addResult({ name, status: 'fail', detail: err.message || String(err), ms: Date.now() - start });
    }
  };

  const runAll = async () => {
    setResults([]);
    setRunning(true);

    // 1. Auth state
    await runTest('Auth Session', async () => {
      if (!session) throw new Error('No active session');
      const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null;
      const expiresIn = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / 1000) : 'unknown';
      return `Token expires in ${expiresIn}s | User: ${user?.email}`;
    });

    // 2. Token refresh
    await runTest('Token Refresh', async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (!data.session) throw new Error('Refresh returned no session');
      return `New token expires at ${new Date(data.session.expires_at! * 1000).toLocaleTimeString()}`;
    });

    // 3. Profile read (RLS test)
    await runTest('Profile Read (RLS)', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', user?.id)
        .single();
      if (error) throw error;
      return `Role: ${data.role} | Email: ${data.email}`;
    });

    // 4. All profiles read
    await runTest('All Profiles Read', async () => {
      const { data, error, count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return `${count} profiles visible`;
    });

    // 5. Collections read
    await runTest('Collections Read', async () => {
      const { data, error, count } = await supabase
        .from('collections')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return `${count} collections visible`;
    });

    // 6. Entries read
    await runTest('Entries Read', async () => {
      const { data, error, count } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return `${count} entries visible`;
    });

    // 7. Media read
    await runTest('Media Read', async () => {
      const { data, error, count } = await supabase
        .from('media')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return `${count} media files visible`;
    });

    // 8. Collection insert test (then rollback)
    await runTest('Collection Insert (RLS write)', async () => {
      const testSlug = `_diag_test_${Date.now()}`;
      const { data, error } = await supabase
        .from('collections')
        .insert({ name: 'Diagnostic Test', slug: testSlug, type: 'custom', fields: [] })
        .select('id')
        .single();
      if (error) throw error;
      // Clean up
      await supabase.from('collections').delete().eq('id', data.id);
      return `Insert + delete OK (role has write access)`;
    });

    // 9. Supabase project health
    await runTest('Supabase Connectivity', async () => {
      const start = Date.now();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      return `Latency: ${Date.now() - start}ms`;
    });

    setRunning(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 32, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>kibanCMS Diagnostics</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Tests auth, RLS policies, and database connectivity.
      </p>

      <button
        onClick={runAll}
        disabled={running}
        style={{
          padding: '10px 24px', background: '#0d9488', color: '#fff', border: 'none',
          borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: running ? 'wait' : 'pointer',
          marginBottom: 24, opacity: running ? 0.6 : 1,
        }}
      >
        {running ? 'Running...' : 'Run All Tests'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map(r => (
          <div
            key={r.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 8,
              background: r.status === 'pass' ? '#f0fdf4' : r.status === 'fail' ? '#fef2f2' : '#f9fafb',
              border: `1px solid ${r.status === 'pass' ? '#bbf7d0' : r.status === 'fail' ? '#fecaca' : '#e5e7eb'}`,
            }}
          >
            <span style={{ fontSize: 18 }}>
              {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '○'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: r.status === 'fail' ? '#dc2626' : '#6b7280' }}>
                {r.detail}
              </div>
            </div>
            {r.ms !== undefined && (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{r.ms}ms</span>
            )}
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: 24, padding: 16, background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
          <strong>Session info:</strong><br />
          User: {user?.email || 'none'}<br />
          Role: {profile?.role || 'unknown'}<br />
          Session: {session ? 'active' : 'none'}<br />
          Expires: {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A'}
        </div>
      )}
    </div>
  );
};
