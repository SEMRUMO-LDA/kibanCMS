/**
 * AccessibilitySettingsPage — Admin page for configuring the accessibility widget.
 * Controls which features are available, widget position, and theme.
 */

import React, { useState, useEffect } from 'react';

interface A11yConfig {
  enabled: boolean;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  features: {
    fontSize: boolean;
    contrast: boolean;
    reducedMotion: boolean;
    lineSpacing: boolean;
    largeCursor: boolean;
    textAlign: boolean;
  };
  theme: 'auto' | 'light' | 'dark';
  buttonLabel: string;
  buttonColor: string;
  customCSS: string;
}

interface SettingsProps {
  supabase: any;
  addonId?: string;
}

const DEFAULT_CONFIG: A11yConfig = {
  enabled: true,
  position: 'bottom-left',
  features: {
    fontSize: true,
    contrast: true,
    reducedMotion: true,
    lineSpacing: true,
    largeCursor: true,
    textAlign: false,
  },
  theme: 'auto',
  buttonLabel: 'Accessibility settings',
  buttonColor: '#2c2c2c',
  customCSS: '',
};

const FEATURE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  fontSize: {
    label: 'Font Size Adjustment',
    description: 'Visitors can increase text size up to 140% in three steps.',
  },
  contrast: {
    label: 'High Contrast Mode',
    description: 'Increases contrast via CSS filter. Images are auto-adjusted to compensate.',
  },
  reducedMotion: {
    label: 'Reduce Animations',
    description: 'Disables all CSS animations and transitions. Respects prefers-reduced-motion.',
  },
  lineSpacing: {
    label: 'Line Spacing',
    description: 'Adjusts line-height for easier reading in three steps.',
  },
  largeCursor: {
    label: 'Large Cursor',
    description: 'Replaces the default cursor with a larger, high-visibility version.',
  },
  textAlign: {
    label: 'Readable Alignment',
    description: 'Forces left-aligned text with wider word and letter spacing.',
  },
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
    margin: '0 0 4px 0',
    color: '#111827',
  },
  sectionDesc: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '0 0 16px',
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
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    background: '#fff',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'monospace',
    minHeight: '80px',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  featureRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '12px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  featureInfo: {
    flex: 1,
  },
  featureLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#111827',
    margin: 0,
  },
  featureDesc: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '2px 0 0',
  },
  toggle: {
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    border: 'none',
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
    marginLeft: '12px',
    marginTop: '2px',
  },
  toggleDot: {
    position: 'absolute' as const,
    top: '2px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
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
  infoBox: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#166534',
    marginBottom: '20px',
  },
};

export function AccessibilitySettingsPage({ supabase, addonId = 'accessibility' }: SettingsProps) {
  const [config, setConfig] = useState<A11yConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('addon_configs')
        .select('config')
        .eq('addon_id', addonId)
        .single();

      if (data?.config) {
        setConfig({ ...DEFAULT_CONFIG, ...data.config, features: { ...DEFAULT_CONFIG.features, ...data.config.features } });
      }
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

  const toggleFeature = (key: string) => {
    setConfig(c => ({
      ...c,
      features: { ...c.features, [key]: !c.features[key as keyof typeof c.features] },
    }));
  };

  if (loading) return <p>Loading accessibility settings...</p>;

  return (
    <div style={styles.page}>

      <div style={styles.infoBox}>
        This widget helps your site comply with the <strong>European Accessibility Act (EAA)</strong> effective June 2025.
        It provides real CSS-based visual adjustments — no overlays, no hacks.
      </div>

      {/* General */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>General</h3>
        <p style={styles.sectionDesc}>Enable and position the accessibility widget on your site.</p>

        <div style={styles.field}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
            />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Show widget to visitors</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={styles.field}>
            <label style={styles.label}>Position</label>
            <select
              style={styles.select}
              value={config.position}
              onChange={e => setConfig(c => ({ ...c, position: e.target.value as A11yConfig['position'] }))}
            >
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Theme</label>
            <select
              style={styles.select}
              value={config.theme}
              onChange={e => setConfig(c => ({ ...c, theme: e.target.value as A11yConfig['theme'] }))}
            >
              <option value="auto">Auto (system)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Button Aria Label</label>
          <input
            style={styles.input}
            value={config.buttonLabel}
            onChange={e => setConfig(c => ({ ...c, buttonLabel: e.target.value }))}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Button Color</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={config.buttonColor}
              onChange={e => setConfig(c => ({ ...c, buttonColor: e.target.value }))}
              style={{
                width: '44px',
                height: '40px',
                padding: '2px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                background: '#fff',
              }}
              aria-label="Pick button color"
            />
            <input
              style={{ ...styles.input, flex: 1, fontFamily: 'monospace' }}
              value={config.buttonColor}
              onChange={e => setConfig(c => ({ ...c, buttonColor: e.target.value }))}
              placeholder="#2c2c2c"
              pattern="^#[0-9A-Fa-f]{6}$"
            />
            <button
              type="button"
              onClick={() => setConfig(c => ({ ...c, buttonColor: DEFAULT_CONFIG.buttonColor }))}
              style={{
                padding: '8px 14px',
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#6b7280',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>
            Applied as the background of the floating button. Use your brand color for visual consistency.
          </p>
        </div>
      </div>

      {/* Features */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Features</h3>
        <p style={styles.sectionDesc}>Choose which accessibility options visitors can use.</p>

        {Object.entries(FEATURE_DESCRIPTIONS).map(([key, { label, description }]) => (
          <div key={key} style={styles.featureRow}>
            <div style={styles.featureInfo}>
              <p style={styles.featureLabel}>{label}</p>
              <p style={styles.featureDesc}>{description}</p>
            </div>
            <button
              role="switch"
              aria-checked={config.features[key as keyof typeof config.features]}
              onClick={() => toggleFeature(key)}
              style={{
                ...styles.toggle,
                background: config.features[key as keyof typeof config.features] ? '#4f46e5' : '#d1d5db',
              }}
            >
              <span style={{
                ...styles.toggleDot,
                left: config.features[key as keyof typeof config.features] ? '20px' : '2px',
              }} />
            </button>
          </div>
        ))}
      </div>

      {/* Custom CSS */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Custom CSS</h3>
        <div style={styles.field}>
          <label style={styles.label}>Override widget styles</label>
          <textarea
            style={styles.textarea}
            placeholder=".a11y-widget { ... }"
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
