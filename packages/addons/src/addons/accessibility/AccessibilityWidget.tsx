/**
 * AccessibilityWidget — floating button that opens a preferences panel.
 * Applies CSS custom properties to <html> element for real visual changes.
 * Preferences persist in localStorage.
 */

import React, { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kiban_a11y_prefs';

interface A11yPreferences {
  fontSize: number;        // 0 = normal, 1 = large, 2 = extra large
  contrast: boolean;       // high contrast mode
  reducedMotion: boolean;  // disable animations
  lineSpacing: number;     // 0 = normal, 1 = wide, 2 = extra wide
  largeCursor: boolean;    // enlarged cursor
  textAlign: boolean;      // left-align everything for readability
}

interface WidgetConfig {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  features?: {
    fontSize?: boolean;
    contrast?: boolean;
    reducedMotion?: boolean;
    lineSpacing?: boolean;
    largeCursor?: boolean;
    textAlign?: boolean;
  };
  theme?: 'auto' | 'light' | 'dark';
  buttonLabel?: string;
  customCSS?: string;
}

const DEFAULT_PREFS: A11yPreferences = {
  fontSize: 0,
  contrast: false,
  reducedMotion: false,
  lineSpacing: 0,
  largeCursor: false,
  textAlign: false,
};

function loadPrefs(): A11yPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: A11yPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Apply preferences as CSS custom properties + classes on <html> */
function applyToDOM(prefs: A11yPreferences) {
  const html = document.documentElement;

  // Font size scale
  const fontScales = ['100%', '120%', '140%'];
  html.style.fontSize = fontScales[prefs.fontSize] || '100%';

  // Line spacing
  const lineHeights = ['normal', '1.8', '2.2'];
  html.style.setProperty('--a11y-line-height', lineHeights[prefs.lineSpacing] || 'normal');
  html.style.lineHeight = lineHeights[prefs.lineSpacing] || '';

  // High contrast
  if (prefs.contrast) {
    html.classList.add('a11y-high-contrast');
  } else {
    html.classList.remove('a11y-high-contrast');
  }

  // Reduced motion
  if (prefs.reducedMotion) {
    html.classList.add('a11y-reduced-motion');
  } else {
    html.classList.remove('a11y-reduced-motion');
  }

  // Large cursor
  if (prefs.largeCursor) {
    html.classList.add('a11y-large-cursor');
  } else {
    html.classList.remove('a11y-large-cursor');
  }

  // Text alignment
  if (prefs.textAlign) {
    html.classList.add('a11y-readable-text');
  } else {
    html.classList.remove('a11y-readable-text');
  }
}

/** Global CSS injected once for accessibility classes */
const A11Y_GLOBAL_CSS = `
.a11y-high-contrast {
  filter: contrast(1.4) !important;
}
.a11y-high-contrast img,
.a11y-high-contrast video {
  filter: contrast(0.7) !important;
}
.a11y-reduced-motion *,
.a11y-reduced-motion *::before,
.a11y-reduced-motion *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
.a11y-large-cursor,
.a11y-large-cursor * {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23000' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto !important;
}
.a11y-readable-text {
  text-align: left !important;
  word-spacing: 0.12em !important;
  letter-spacing: 0.02em !important;
}
`;

const FONT_LABELS = ['Normal', 'Large', 'Extra Large'];
const LINE_LABELS = ['Normal', 'Wide', 'Extra Wide'];

export function AccessibilityWidget({ config = {} }: { config?: WidgetConfig }) {
  const {
    position = 'bottom-left',
    features = {},
    theme = 'auto',
    buttonLabel = 'Accessibility settings',
    customCSS = '',
  } = config;

  const allFeatures = {
    fontSize: true, contrast: true, reducedMotion: true,
    lineSpacing: true, largeCursor: true, textAlign: false,
    ...features,
  };

  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPreferences>(loadPrefs);

  // Inject global CSS once
  useEffect(() => {
    const id = 'kiban-a11y-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = A11Y_GLOBAL_CSS;
      document.head.appendChild(style);
    }
  }, []);

  // Apply on load and on change
  useEffect(() => {
    applyToDOM(prefs);
    savePrefs(prefs);
  }, [prefs]);

  const resetAll = useCallback(() => {
    setPrefs({ ...DEFAULT_PREFS });
  }, []);

  const isDefault =
    prefs.fontSize === 0 && !prefs.contrast && !prefs.reducedMotion &&
    prefs.lineSpacing === 0 && !prefs.largeCursor && !prefs.textAlign;

  // Position styles
  const posMap: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
  };

  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const bg = isDark ? '#1a1a2e' : '#ffffff';
  const fg = isDark ? '#e0e0e0' : '#1f2937';
  const border = isDark ? '#2a2a4a' : '#e5e7eb';
  const accent = '#4f46e5';

  return (
    <>
      {customCSS && <style>{customCSS}</style>}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={buttonLabel}
        aria-expanded={open}
        className="a11y-widget-trigger"
        style={{
          position: 'fixed',
          ...posMap[position],
          zIndex: 99998,
          width: '48px', height: '48px',
          borderRadius: '50%',
          border: `2px solid ${accent}`,
          background: accent,
          color: '#fff',
          fontSize: '22px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {open ? '✕' : '♿'}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Accessibility preferences"
          className="a11y-widget"
          style={{
            position: 'fixed',
            ...posMap[position],
            [position.includes('bottom') ? 'bottom' : 'top']: '80px',
            zIndex: 99998,
            width: '300px',
            background: bg,
            color: fg,
            border: `1px solid ${border}`,
            borderRadius: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '14px',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}` }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Accessibility</h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: isDark ? '#888' : '#9ca3af' }}>
              Adjust visual preferences
            </p>
          </div>

          {/* Options */}
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Font Size */}
            {allFeatures.fontSize && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                  Font Size: {FONT_LABELS[prefs.fontSize]}
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {FONT_LABELS.map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setPrefs(p => ({ ...p, fontSize: i }))}
                      style={{
                        flex: 1, padding: '6px', border: `1px solid ${prefs.fontSize === i ? accent : border}`,
                        borderRadius: '6px', background: prefs.fontSize === i ? accent : 'transparent',
                        color: prefs.fontSize === i ? '#fff' : fg, fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      A{i > 0 ? '+'.repeat(i) : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Line Spacing */}
            {allFeatures.lineSpacing && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                  Line Spacing: {LINE_LABELS[prefs.lineSpacing]}
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {LINE_LABELS.map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setPrefs(p => ({ ...p, lineSpacing: i }))}
                      style={{
                        flex: 1, padding: '6px', border: `1px solid ${prefs.lineSpacing === i ? accent : border}`,
                        borderRadius: '6px', background: prefs.lineSpacing === i ? accent : 'transparent',
                        color: prefs.lineSpacing === i ? '#fff' : fg, fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle options */}
            {allFeatures.contrast && (
              <ToggleOption
                label="High Contrast"
                checked={prefs.contrast}
                onChange={v => setPrefs(p => ({ ...p, contrast: v }))}
                accent={accent} border={border}
              />
            )}

            {allFeatures.reducedMotion && (
              <ToggleOption
                label="Reduce Animations"
                checked={prefs.reducedMotion}
                onChange={v => setPrefs(p => ({ ...p, reducedMotion: v }))}
                accent={accent} border={border}
              />
            )}

            {allFeatures.largeCursor && (
              <ToggleOption
                label="Large Cursor"
                checked={prefs.largeCursor}
                onChange={v => setPrefs(p => ({ ...p, largeCursor: v }))}
                accent={accent} border={border}
              />
            )}

            {allFeatures.textAlign && (
              <ToggleOption
                label="Readable Alignment"
                checked={prefs.textAlign}
                onChange={v => setPrefs(p => ({ ...p, textAlign: v }))}
                accent={accent} border={border}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={resetAll}
              disabled={isDefault}
              style={{
                padding: '6px 14px', border: `1px solid ${border}`, borderRadius: '6px',
                background: 'transparent', color: isDefault ? (isDark ? '#555' : '#ccc') : fg,
                fontSize: '12px', cursor: isDefault ? 'default' : 'pointer', fontWeight: 500,
              }}
            >
              Reset All
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Reusable toggle switch */
function ToggleOption({ label, checked, onChange, accent, border }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; accent: string; border: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: '40px', height: '22px', borderRadius: '11px', border: 'none',
          background: checked ? accent : border, position: 'relative', cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: '2px', left: checked ? '20px' : '2px',
          width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </label>
  );
}
