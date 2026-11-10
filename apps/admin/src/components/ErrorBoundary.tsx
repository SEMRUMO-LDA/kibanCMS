import React from 'react';

interface State { error: Error | null }

/**
 * Last line of defence: a render error in one screen used to blank the whole
 * admin with no message. Shows what broke and a way back.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Admin render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Algo correu mal nesta página / Something went wrong</h2>
        <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.5 }}>
          O erro foi registado. Pode voltar ao painel ou recarregar a página. / The error was logged. Go back to the dashboard or reload.
        </p>
        <pre style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, fontSize: 12, overflowX: 'auto' }}>
          {this.state.error.message}
        </pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { window.location.href = '/'; }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Dashboard</button>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>Reload</button>
        </div>
      </div>
    );
  }
}
