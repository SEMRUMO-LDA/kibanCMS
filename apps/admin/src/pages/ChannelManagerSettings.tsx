/**
 * ChannelManagerSettings — admin UI for the Channel Manager add-on.
 *
 * Lists providers, connections, and the inbound webhook log. Bookings
 * received via webhook end up in the regular Bookings UI (entries table)
 * — this page is only about the integration plumbing.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Provider { id: string; displayName: string; }
interface Connection {
  id: string;
  provider: string;
  enabled: boolean;
  credentials: Record<string, string>;
  webhook_secret: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}
interface LogRow {
  id: string;
  provider: string;
  external_id: string;
  event_type: string;
  status: string;
  error: string | null;
  entry_id: string | null;
  received_at: string;
  processed_at: string | null;
}

const PROVIDER_FIELDS: Record<string, Array<{ key: string; label: string; type?: 'text' | 'password' }>> = {
  bokun: [
    { key: 'access_key', label: 'Access Key', type: 'text' },
    { key: 'secret_key', label: 'Secret Key', type: 'password' },
    { key: 'vendor_id',  label: 'Vendor ID (opcional)', type: 'text' },
  ],
};

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 960 },
  section: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#111827' },
  sectionSubtitle: { fontSize: 13, color: '#6b7280', margin: '0 0 16px' },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff' },
  btn: { padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGhost: { padding: '6px 12px', background: 'transparent', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnDanger: { padding: '6px 12px', background: 'transparent', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 500, fontSize: 12 },
  td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6' },
  alert: { padding: '10px 12px', borderRadius: 8, fontSize: 13 },
  webhookBox: { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' as const },
};

function statusBadge(status: string | null): React.CSSProperties {
  const s = (status || '').toLowerCase();
  if (s === 'ok' || s === 'processed' || s === 'received')
    return { ...styles.badge, background: '#dcfce7', color: '#166534' };
  if (s === 'duplicate')
    return { ...styles.badge, background: '#fef3c7', color: '#92400e' };
  if (s === 'error')
    return { ...styles.badge, background: '#fee2e2', color: '#991b1b' };
  return { ...styles.badge, background: '#e5e7eb', color: '#374151' };
}

export const ChannelManagerSettings = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProvider, setNewProvider] = useState('bokun');
  const [newCreds, setNewCreds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [revealedUrl, setRevealedUrl] = useState<{ id: string; url: string } | null>(null);

  async function refresh() {
    setLoading(true);
    const [p, c, l] = await Promise.all([
      api.channelListProviders(),
      api.channelListConnections(),
      api.channelListLog(50),
    ]);
    setProviders(p.data || []);
    setConnections(c.data || []);
    setLog(l.data || []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate() {
    setError(null);
    const required = PROVIDER_FIELDS[newProvider]?.filter(f => f.label && !f.label.includes('opcional'));
    for (const f of (required || [])) {
      if (!newCreds[f.key]) {
        setError(`Campo obrigatório em falta: ${f.label}`);
        return;
      }
    }
    const { data, error } = await api.channelCreateConnection(newProvider, newCreds);
    if (error) { setError(error); return; }
    // Server returns webhook_url with the secret embedded for url-token
    // providers (Bokun); for HMAC providers it returns the bare URL plus
    // webhook_secret to paste in a separate signing-secret field.
    const url = data?.webhook_url || data?.webhook_secret || '';
    if (url) setRevealedUrl({ id: data.id, url });
    setNewCreds({});
    setShowNewForm(false);
    refresh();
  }

  async function handleTest(id: string) {
    setError(null);
    const { data, error } = await api.channelTestConnection(id);
    if (error) { setError(error); return; }
    if (!data?.ok) setError(`Falhou: ${data?.error || 'erro desconhecido'}`);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar esta conexão? Os bookings já recebidos não são removidos.')) return;
    const { error } = await api.channelDeleteConnection(id);
    if (error) setError(error);
    refresh();
  }

  async function handleToggle(c: Connection) {
    const { error } = await api.channelUpdateConnection(c.id, { enabled: !c.enabled });
    if (error) setError(error);
    refresh();
  }

  if (loading) return <p style={{ padding: 20 }}>A carregar...</p>;

  return (
    <div style={styles.page}>
      <h2 style={{ marginTop: 0 }}>Channel Manager</h2>
      <p style={{ color: '#6b7280', marginTop: -8 }}>
        Recebe bookings de Channel Managers externos (Bokun, …) e regista-os automaticamente em Bookings.
      </p>

      {error && (
        <div style={{ ...styles.alert, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {revealedUrl && (
        <div style={{ ...styles.alert, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 16 }}>
          <strong>⚠️ Webhook URL — copia AGORA, o token só é mostrado desta vez.</strong>
          <div style={{ ...styles.webhookBox, marginTop: 8, background: '#fff' }}>{revealedUrl.url}</div>
          <p style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Cola este URL completo no painel do provider (Bokun → Settings → Connections → Push notifications → campo "Url"). O token no fim autentica o pedido.
            <button
              style={{ ...styles.btnGhost, marginLeft: 8 }}
              onClick={() => navigator.clipboard.writeText(revealedUrl.url)}
            >Copiar</button>
            <button
              style={{ ...styles.btnGhost, marginLeft: 8 }}
              onClick={() => setRevealedUrl(null)}
            >Já copiei</button>
          </p>
        </div>
      )}

      {/* Connections */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={styles.sectionTitle}>Conexões</h3>
          {!showNewForm && (
            <button style={styles.btn} onClick={() => setShowNewForm(true)}>+ Adicionar conexão</button>
          )}
        </div>

        {showNewForm && (
          <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginTop: 12, marginBottom: 16 }}>
            <div style={styles.field}>
              <label style={styles.label}>Provider</label>
              <select style={styles.select} value={newProvider} onChange={e => setNewProvider(e.target.value)}>
                {providers.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
            {(PROVIDER_FIELDS[newProvider] || []).map(f => (
              <div key={f.key} style={styles.field}>
                <label style={styles.label}>{f.label}</label>
                <input
                  style={styles.input}
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={newCreds[f.key] || ''}
                  onChange={e => setNewCreds(c => ({ ...c, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={styles.btn} onClick={handleCreate}>Criar conexão</button>
              <button style={styles.btnGhost} onClick={() => { setShowNewForm(false); setNewCreds({}); setError(null); }}>Cancelar</button>
            </div>
          </div>
        )}

        {connections.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>Nenhuma conexão configurada.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Último teste</th>
                <th style={styles.th}>Webhook URL</th>
                <th style={styles.th}>Acções</th>
              </tr>
            </thead>
            <tbody>
              {connections.map(c => {
                // After creation the full URL with token was shown once and is
                // not retrievable later; show only the public part here. To
                // re-issue the token, delete and recreate the connection.
                const webhookUrl = `${window.location.origin}/api/v1/channel-manager/webhook/${c.provider}/<TOKEN>`;
                return (
                  <tr key={c.id}>
                    <td style={styles.td}>
                      <strong>{providers.find(p => p.id === c.provider)?.displayName || c.provider}</strong>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {Object.entries(c.credentials).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={statusBadge(c.enabled ? 'ok' : 'paused')}>
                        {c.enabled ? 'Activa' : 'Pausada'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {c.last_sync_at ? (
                        <>
                          <span style={statusBadge(c.last_sync_status)}>{c.last_sync_status}</span>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{new Date(c.last_sync_at).toLocaleString()}</div>
                          {c.last_sync_error && (
                            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>{c.last_sync_error}</div>
                          )}
                        </>
                      ) : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={styles.td}>
                      <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{webhookUrl}</code>
                      <button
                        style={{ ...styles.btnGhost, marginLeft: 8, padding: '2px 8px' }}
                        onClick={() => navigator.clipboard.writeText(webhookUrl)}
                      >Copiar</button>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={styles.btnGhost} onClick={() => handleTest(c.id)}>Testar</button>
                        <button style={styles.btnGhost} onClick={() => handleToggle(c)}>{c.enabled ? 'Pausar' : 'Activar'}</button>
                        <button style={styles.btnDanger} onClick={() => handleDelete(c.id)}>Apagar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Log */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Webhook log (últimos 50)</h3>
        <p style={styles.sectionSubtitle}>
          Cada webhook recebido é registado aqui antes de ser processado. Bookings com sucesso aparecem em Bookings normais.
        </p>
        {log.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Sem eventos ainda.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Recebido</th>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Evento</th>
                <th style={styles.th}>External ID</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Booking</th>
              </tr>
            </thead>
            <tbody>
              {log.map(l => (
                <tr key={l.id}>
                  <td style={styles.td}>{new Date(l.received_at).toLocaleString()}</td>
                  <td style={styles.td}>{l.provider}</td>
                  <td style={styles.td}><code style={{ fontSize: 11 }}>{l.event_type}</code></td>
                  <td style={styles.td}><code style={{ fontSize: 11 }}>{l.external_id}</code></td>
                  <td style={styles.td}>
                    <span style={statusBadge(l.status)}>{l.status}</span>
                    {l.error && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>{l.error}</div>}
                  </td>
                  <td style={styles.td}>
                    {l.entry_id ? <code style={{ fontSize: 11 }}>{l.entry_id.slice(0, 8)}…</code> : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
