/**
 * CookieSettingsPage — Admin page for configuring the cookie notice.
 * Allows editing theme, position, messages, cookie categories, and viewing consent stats.
 */

import React, { useState, useEffect } from 'react';

interface CookieConfig {
  enabled: boolean;
  title: string;
  message: string;
  buttonText: string;
  declineText: string;
  policyUrl: string;
  cookieTypes: {
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
    preferences: boolean;
  };
  customCSS: string;
}

interface ConsentRecord {
  id: string;
  visitor_id: string;
  consent_given: boolean;
  categories: Record<string, boolean>;
  consent_date: string;
}

interface CookieSettingsProps {
  supabase: any;
  addonId?: string;
}

const DEFAULT_CONFIG: CookieConfig = {
  enabled: true,
  title: 'Informação sobre cookies',
  message: 'Ao navegar neste website podem ser colocados no seu dispositivo cookies por nós ou parceiros. Estes cookies podem ser utilizados para melhorar o funcionamento do website ou para lhe oferecer uma experiência de navegação mais personalizada. Poderá aceitar ou personalizar as suas definições de cookies através dos botões disponibilizados.',
  buttonText: 'Aceitar todos',
  declineText: 'Gerir cookies',
  policyUrl: '/privacy-policy',
  cookieTypes: { necessary: true, analytics: false, marketing: false, preferences: false },
  customCSS: '',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '720px',
  },
  section: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 16px 0',
    color: '#111827',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    background: '#fff',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    minHeight: '80px',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '14px',
  },
  btnSave: {
    padding: '10px 24px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  statCard: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center' as const,
  },
  statNumber: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  statLabel: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '4px 0 0',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
  },
};

export function CookieSettingsPage({ supabase, addonId = 'cookie-notice' }: CookieSettingsProps) {
  const [config, setConfig] = useState<CookieConfig>(DEFAULT_CONFIG);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Load config
      const { data: configData } = await supabase
        .from('addon_configs')
        .select('config')
        .eq('addon_id', addonId)
        .single();

      if (configData?.config) {
        setConfig({ ...DEFAULT_CONFIG, ...configData.config });
      }

      // Load recent consents
      const { data: consentData } = await supabase
        .from('addon_cookie_notice_consents')
        .select('*')
        .order('consent_date', { ascending: false })
        .limit(50);

      if (consentData) setConsents(consentData);
      setLoading(false);
    }
    load();
  }, [supabase, addonId]);

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from('addon_configs')
      .upsert({ addon_id: addonId, config });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalConsents = consents.length;
  const accepted = consents.filter(c => c.consent_given).length;
  const declined = totalConsents - accepted;

  if (loading) return <p>Loading cookie settings...</p>;

  return (
    <div style={styles.page}>
      {/* Stats */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Consent Overview</h3>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{totalConsents}</p>
            <p style={styles.statLabel}>Total Responses</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#16a34a' }}>{accepted}</p>
            <p style={styles.statLabel}>Accepted</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#dc2626' }}>{declined}</p>
            <p style={styles.statLabel}>Declined</p>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Definições</h3>

        <div style={styles.field}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
            />
            Mostrar aviso de cookies aos visitantes
          </label>
        </div>
      </div>

      {/* Text */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Texto & Links</h3>

        <div style={styles.field}>
          <label style={styles.label}>Título</label>
          <input
            style={styles.input}
            value={config.title}
            onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Mensagem</label>
          <textarea
            style={styles.textarea}
            value={config.message}
            onChange={e => setConfig(c => ({ ...c, message: e.target.value }))}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={styles.field}>
            <label style={styles.label}>Accept Button Text</label>
            <input
              style={styles.input}
              value={config.buttonText}
              onChange={e => setConfig(c => ({ ...c, buttonText: e.target.value }))}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Decline Button Text</label>
            <input
              style={styles.input}
              value={config.declineText}
              onChange={e => setConfig(c => ({ ...c, declineText: e.target.value }))}
            />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Privacy Policy URL</label>
          <input
            style={styles.input}
            value={config.policyUrl}
            onChange={e => setConfig(c => ({ ...c, policyUrl: e.target.value }))}
          />
        </div>
      </div>

      {/* Cookie Categories */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Cookie Categories</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }}>
          Select which cookie categories visitors can opt into.
        </p>

        <label style={{ ...styles.checkbox, opacity: 0.6 }}>
          <input type="checkbox" checked disabled />
          Necessary (always required)
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.cookieTypes.analytics}
            onChange={e => setConfig(c => ({ ...c, cookieTypes: { ...c.cookieTypes, analytics: e.target.checked } }))}
          />
          Analytics
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.cookieTypes.marketing}
            onChange={e => setConfig(c => ({ ...c, cookieTypes: { ...c.cookieTypes, marketing: e.target.checked } }))}
          />
          Marketing
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.cookieTypes.preferences}
            onChange={e => setConfig(c => ({ ...c, cookieTypes: { ...c.cookieTypes, preferences: e.target.checked } }))}
          />
          Preferences
        </label>
      </div>

      {/* Custom CSS */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Custom CSS</h3>
        <div style={styles.field}>
          <label style={styles.label}>Override banner styles</label>
          <textarea
            style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: '13px' }}
            placeholder=".cookie-notice { ... }"
            value={config.customCSS}
            onChange={e => setConfig(c => ({ ...c, customCSS: e.target.value }))}
          />
        </div>
      </div>

      {/* Save */}
      <button style={styles.btnSave} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
