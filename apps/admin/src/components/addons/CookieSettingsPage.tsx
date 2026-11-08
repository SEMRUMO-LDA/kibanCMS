/**
 * CookieSettingsPage — Admin page for configuring the cookie notice.
 * Now powered by Silktide Consent Manager.
 * Allows editing position, colors, messages, cookie categories, and viewing consent stats.
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
  // Silktide-specific options
  position: 'bottomRight' | 'bottomLeft' | 'bottomCenter' | 'center';
  iconPosition: 'bottomLeft' | 'bottomRight';
  showIcon: boolean;
  showBackdrop: boolean;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
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
  declineText: 'Rejeitar não essenciais',
  policyUrl: '/privacy-policy',
  cookieTypes: { necessary: true, analytics: false, marketing: false, preferences: false },
  customCSS: '',
  position: 'bottomRight',
  iconPosition: 'bottomRight',
  showIcon: true,
  showBackdrop: false,
  primaryColor: '#533BE2',
  backgroundColor: '#FFFFFF',
  textColor: '#253B48',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '720px',
  },
  poweredBy: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    background: '#f0f0ff',
    border: '1px solid #ddd8ff',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#533BE2',
    marginBottom: '20px',
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
  sectionSubtitle: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '-8px 0 16px 0',
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
  colorRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px',
  },
  colorInput: {
    width: '100%',
    height: '40px',
    padding: '2px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    background: '#fff',
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
  embedBox: {
    background: '#f8f9fa',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '14px',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.6',
    color: '#374151',
    overflowX: 'auto' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
};

export function CookieSettingsPage({ supabase, addonId = 'cookie-notice' }: CookieSettingsProps) {
  const [config, setConfig] = useState<CookieConfig>(DEFAULT_CONFIG);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    const { error } = await supabase
      .from('addon_configs')
      .upsert({ addon_id: addonId, config }, { onConflict: 'addon_id' });
    setSaving(false);
    if (error) {
      setSaveError(`${error.code || 'error'}: ${error.message}${error.details ? ` (${error.details})` : ''}`);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalConsents = consents.length;
  const accepted = consents.filter(c => c.consent_given).length;
  const declined = totalConsents - accepted;

  if (loading) return <p>Loading cookie settings...</p>;

  return (
    <div style={styles.page}>
      {/* Powered by badge */}
      <div style={styles.poweredBy}>
        🍪 Powered by <a href="https://silktide.com/tools/cookie-consent/" target="_blank" rel="noopener noreferrer" style={{ color: '#533BE2', fontWeight: 600, textDecoration: 'none' }}>Silktide Consent Manager</a>
      </div>

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

      {/* Position & Display */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Posição & Apresentação</h3>
        <p style={styles.sectionSubtitle}>Opções do Silktide Consent Manager para posicionamento e comportamento visual.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={styles.field}>
            <label style={styles.label}>Posição do Banner</label>
            <select
              style={styles.select}
              value={config.position}
              onChange={e => setConfig(c => ({ ...c, position: e.target.value as CookieConfig['position'] }))}
            >
              <option value="bottomRight">Inferior Direito</option>
              <option value="bottomLeft">Inferior Esquerdo</option>
              <option value="bottomCenter">Inferior Centro</option>
              <option value="center">Centro (modal)</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Posição do Ícone</label>
            <select
              style={{ ...styles.select, opacity: config.showIcon ? 1 : 0.5 }}
              value={config.iconPosition}
              onChange={e => setConfig(c => ({ ...c, iconPosition: e.target.value as CookieConfig['iconPosition'] }))}
              disabled={!config.showIcon}
            >
              <option value="bottomRight">Inferior Direito</option>
              <option value="bottomLeft">Inferior Esquerdo</option>
            </select>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={config.showIcon}
              onChange={e => setConfig(c => ({ ...c, showIcon: e.target.checked }))}
            />
            Mostrar ícone de cookies no site (re-abrir preferências)
          </label>
        </div>

        <div style={styles.field}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={config.showBackdrop}
              onChange={e => setConfig(c => ({ ...c, showBackdrop: e.target.checked }))}
            />
            Mostrar backdrop (fundo escuro atrás do banner)
          </label>
        </div>
      </div>

      {/* Colors */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Cores</h3>
        <p style={styles.sectionSubtitle}>Personalizar as cores do Silktide Consent Manager via CSS variables.</p>

        <div style={styles.colorRow}>
          <div style={styles.field}>
            <label style={styles.label}>Cor Principal</label>
            <input
              type="color"
              style={styles.colorInput}
              value={config.primaryColor}
              onChange={e => setConfig(c => ({ ...c, primaryColor: e.target.value }))}
            />
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{config.primaryColor}</span>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Fundo</label>
            <input
              type="color"
              style={styles.colorInput}
              value={config.backgroundColor}
              onChange={e => setConfig(c => ({ ...c, backgroundColor: e.target.value }))}
            />
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{config.backgroundColor}</span>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Texto</label>
            <input
              type="color"
              style={styles.colorInput}
              value={config.textColor}
              onChange={e => setConfig(c => ({ ...c, textColor: e.target.value }))}
            />
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{config.textColor}</span>
          </div>
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
            <label style={styles.label}>Texto do Botão Aceitar</label>
            <input
              style={styles.input}
              value={config.buttonText}
              onChange={e => setConfig(c => ({ ...c, buttonText: e.target.value }))}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Texto do Botão Rejeitar</label>
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
        <h3 style={styles.sectionTitle}>Categorias de Cookies</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }}>
          Selecione quais categorias de cookies os visitantes podem aceitar. O Silktide integra automaticamente com Google Consent Mode v2.
        </p>

        <label style={{ ...styles.checkbox, opacity: 0.6 }}>
          <input type="checkbox" checked disabled />
          Necessários (sempre obrigatório)
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.cookieTypes.analytics}
            onChange={e => setConfig(c => ({ ...c, cookieTypes: { ...c.cookieTypes, analytics: e.target.checked } }))}
          />
          Analytics <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '4px' }}>→ analytics_storage (Google)</span>
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.cookieTypes.marketing}
            onChange={e => setConfig(c => ({ ...c, cookieTypes: { ...c.cookieTypes, marketing: e.target.checked } }))}
          />
          Marketing <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '4px' }}>→ ad_storage, ad_user_data, ad_personalization (Google)</span>
        </label>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.cookieTypes.preferences}
            onChange={e => setConfig(c => ({ ...c, cookieTypes: { ...c.cookieTypes, preferences: e.target.checked } }))}
          />
          Preferências
        </label>
      </div>

      {/* Custom CSS */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>CSS Personalizado</h3>
        <div style={styles.field}>
          <label style={styles.label}>Sobrescrever estilos do Silktide</label>
          <textarea
            style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: '13px' }}
            placeholder="#stcm-wrapper { --fontFamily: 'Your Font', sans-serif; }"
            value={config.customCSS}
            onChange={e => setConfig(c => ({ ...c, customCSS: e.target.value }))}
          />
          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            Variáveis disponíveis: --fontFamily, --primaryColor, --backgroundColor, --textColor, --boxShadow, --iconColor, --iconBackgroundColor
          </p>
        </div>
      </div>

      {/* Embed Code */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Código de Integração</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }}>
          Use o <strong>Widget Loader</strong> para carregar automaticamente todos os add-ons ativados (cookies, acessibilidade, WhatsApp, idiomas) com um único script:
        </p>
        <div style={styles.embedBox}>
          {`<script src="${window.location.origin}/api/v1/widgets/loader.js" data-api-key="YOUR_API_KEY"></script>`}
        </div>
        <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
          ☝️ Recomendado — injeta automaticamente apenas os widgets ativados no painel Add-ons.
        </p>
      </div>

      {/* Save */}
      <button style={styles.btnSave} onClick={handleSave} disabled={saving}>
        {saving ? 'A guardar...' : saved ? 'Guardado!' : 'Guardar Definições'}
      </button>
      {saveError && (
        <p style={{ marginTop: '12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '13px' }}>
          Falha ao guardar — {saveError}
        </p>
      )}
    </div>
  );
}
