import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../lib/supabase';

type ClusterConfig = {
  accentColor: string | null;
  includedWidgets: string[];
};

const ALL_WIDGETS: Array<{ id: string; label: string; helper: string }> = [
  { id: 'cookie-notice',   label: 'Cookies',         helper: 'Banner de consentimento (Silktide)' },
  { id: 'accessibility',   label: 'Acessibilidade',  helper: 'Painel EAA 2025' },
  { id: 'i18n',            label: 'Idioma',          helper: 'Seletor de idioma' },
  { id: 'whatsapp-widget', label: 'WhatsApp',        helper: 'Botão flutuante de chat' },
];

const DEFAULT_CONFIG: ClusterConfig = {
  accentColor: null,
  includedWidgets: ALL_WIDGETS.map(w => w.id),
};

const styles: Record<string, React.CSSProperties> = {
  page:           { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 720 },
  section:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 },
  sectionTitle:   { fontSize: 16, fontWeight: 600, margin: '0 0 4px 0', color: '#111827' },
  sectionSubtitle:{ fontSize: 13, color: '#6b7280', margin: '0 0 16px 0' },
  field:          { marginBottom: 16 },
  label:          { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 },
  colorRow:       { display: 'flex', alignItems: 'center', gap: 12 },
  colorInput:     { width: 56, height: 40, padding: 2, border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', background: '#fff' },
  hex:            { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 110, fontFamily: 'monospace' },
  clear:          { padding: '8px 12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  toggleRow:      { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 8, cursor: 'pointer' },
  toggleRowOn:    { background: '#f5f3ff', borderColor: '#c4b5fd' },
  toggleLabel:    { fontSize: 14, fontWeight: 500, color: '#111827' },
  toggleHelper:   { fontSize: 12, color: '#6b7280', marginTop: 2 },
  btnSave:        { padding: '10px 24px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSaveDisabled:{ padding: '10px 24px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'not-allowed' },
  saveBar:        { display: 'flex', alignItems: 'center', gap: 12 },
  successText:    { color: '#16a34a', fontSize: 13 },
  errorText:      { color: '#dc2626', fontSize: 13 },
  preview:        { position: 'relative', height: 200, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(135deg, #fafafa 0%, #f0f0f0 60%, #1f1f23 100%)' },
  previewTrigger: { position: 'absolute', bottom: 16, left: 16, width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(22px) saturate(1.7)', WebkitBackdropFilter: 'blur(22px) saturate(1.7)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 6px 22px rgba(0,0,0,0.22)', color: '#fff' },
  previewPanel:   { position: 'absolute', bottom: 72, left: 16, display: 'flex', flexDirection: 'column-reverse', gap: 12 },
  previewItem:    { width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(22px) saturate(1.7)', WebkitBackdropFilter: 'blur(22px) saturate(1.7)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 6px 22px rgba(0,0,0,0.22)', color: '#fff' },
};

const WIDGET_ICONS: Record<string, JSX.Element> = {
  'cookie-notice': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 12.5a9 9 0 1 1-9.9-9.4 4 4 0 0 0 5.4 5.4 4 4 0 0 0 4.5 4z" fill="currentColor" fillOpacity="0.18"/>
      <circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/><circle cx="9.5" cy="15.5" r="0.8" fill="currentColor"/>
    </svg>
  ),
  accessibility: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="6.8" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M6.5 10.5 H17.5"/><path d="M12 9 V14"/><path d="M12 14 L9 19"/><path d="M12 14 L15 19"/>
    </svg>
  ),
  i18n: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12 H22"/><path d="M12 2 a15 15 0 0 1 0 20 a15 15 0 0 1 0 -20"/>
    </svg>
  ),
  'whatsapp-widget': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .19 5.31.18 11.85a11.7 11.7 0 0 0 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.54 0 11.85-5.31 11.86-11.85a11.78 11.78 0 0 0-3.49-8.46zM12.04 21.8a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.76.99 1-3.66-.24-.38a9.83 9.83 0 0 1-1.5-5.21A9.85 9.85 0 1 1 12.04 21.8z"/>
    </svg>
  ),
};

const triggerSvg = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="13" y2="6"/><line x1="17" y1="6" x2="20" y2="6"/><circle cx="15" cy="6" r="2" fill="currentColor"/>
    <line x1="4" y1="12" x2="7" y2="12"/><line x1="11" y1="12" x2="20" y2="12"/><circle cx="9" cy="12" r="2" fill="currentColor"/>
    <line x1="4" y1="18" x2="13" y2="18"/><line x1="17" y1="18" x2="20" y2="18"/><circle cx="15" cy="18" r="2" fill="currentColor"/>
  </svg>
);

export const WidgetClusterSettings = () => {
  const supabase = getSupabase();
  const [config, setConfig] = useState<ClusterConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('addon_configs')
        .select('config')
        .eq('addon_id', 'widget-cluster')
        .maybeSingle();
      if (data?.config) {
        setConfig({ ...DEFAULT_CONFIG, ...data.config });
      }
      setLoading(false);
    })();
  }, [supabase]);

  const previewTint = useMemo(() => {
    if (!config.accentColor) return undefined;
    return `color-mix(in srgb, ${config.accentColor} 22%, rgba(20,20,22,0.55))`;
  }, [config.accentColor]);

  if (!supabase) return <p>Loading…</p>;
  if (loading) return <p>Loading cluster settings…</p>;

  const toggleWidget = (id: string) => {
    setConfig(c => ({
      ...c,
      includedWidgets: c.includedWidgets.includes(id)
        ? c.includedWidgets.filter(x => x !== id)
        : [...c.includedWidgets, id],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    // The addon_configs row references addon_registry (FK), so make sure
    // the registry row exists before upserting the config — needed only
    // the very first time this page is saved on a tenant.
    const reg = await supabase
      .from('addon_registry')
      .upsert(
        { addon_id: 'widget-cluster', status: { installed: true, enabled: true } },
        { onConflict: 'addon_id' }
      );
    if (reg.error) {
      setSaving(false);
      setSaveError(`registry: ${reg.error.message}`);
      return;
    }
    const { error } = await supabase
      .from('addon_configs')
      .upsert({ addon_id: 'widget-cluster', config }, { onConflict: 'addon_id' });
    setSaving(false);
    if (error) {
      setSaveError(`${error.code || 'error'}: ${error.message}${error.details ? ` (${error.details})` : ''}`);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div style={styles.page}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Cluster de Widgets</h3>
        <p style={styles.sectionSubtitle}>
          Une vários widgets flutuantes num único trigger de liquid glass para libertar
          espaço no canto do site. Escolhe que widgets entram no cluster e a cor de
          acento — o liquid glass mistura a tua cor sem perder contraste.
        </p>

        <div style={styles.field}>
          <label style={styles.label}>Accent color</label>
          <div style={styles.colorRow}>
            <input
              type="color"
              style={styles.colorInput}
              value={config.accentColor || '#0f172a'}
              onChange={e => setConfig(c => ({ ...c, accentColor: e.target.value }))}
            />
            <input
              type="text"
              style={styles.hex}
              placeholder="#000000"
              value={config.accentColor || ''}
              onChange={e => setConfig(c => ({ ...c, accentColor: e.target.value || null }))}
            />
            {config.accentColor && (
              <button style={styles.clear} onClick={() => setConfig(c => ({ ...c, accentColor: null }))}>
                Sem tint
              </button>
            )}
          </div>
          <p style={{ ...styles.toggleHelper, marginTop: 8 }}>
            Vazio = glass neutro (tom escuro materialDark, funciona em fundos claros e escuros).
            Com cor = mistura ~22% sobre o glass escuro.
          </p>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Widgets no cluster</h3>
        <p style={styles.sectionSubtitle}>
          Quando ≥2 widgets selecionados estão activos no mesmo canto, o loader
          colapsa-os num trigger único. Os não selecionados continuam visíveis
          individualmente.
        </p>
        {ALL_WIDGETS.map(w => {
          const on = config.includedWidgets.includes(w.id);
          return (
            <div
              key={w.id}
              style={{ ...styles.toggleRow, ...(on ? styles.toggleRowOn : {}) }}
              onClick={() => toggleWidget(w.id)}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleWidget(w.id); } }}
            >
              <input type="checkbox" checked={on} onChange={() => {}} />
              <div style={{ flex: 1 }}>
                <div style={styles.toggleLabel}>{w.label}</div>
                <div style={styles.toggleHelper}>{w.helper}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Pré-visualização</h3>
        <p style={styles.sectionSubtitle}>
          Glass escuro num gradiente claro→escuro para verificares contraste em ambos
          os contextos. Os ícones reflectem a tua selecção.
        </p>
        <div style={styles.preview}>
          <div style={styles.previewPanel}>
            {config.includedWidgets.map(id => (
              <div key={id} style={{ ...styles.previewItem, background: previewTint || styles.previewItem.background }}>
                {WIDGET_ICONS[id]}
              </div>
            ))}
          </div>
          <div style={{ ...styles.previewTrigger, background: previewTint || styles.previewTrigger.background }}>
            {triggerSvg}
          </div>
        </div>
      </div>

      <div style={styles.saveBar}>
        <button
          style={saving ? styles.btnSaveDisabled : styles.btnSave}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
        {saved && <span style={styles.successText}>✓ Guardado</span>}
        {saveError && <span style={styles.errorText}>{saveError}</span>}
      </div>
    </div>
  );
};
