/**
 * CookieNotice — GDPR consent banner component.
 * Renders a customizable banner at top/bottom/center of the viewport.
 * Integrates with useCookieConsent for state management.
 */

import React, { useState } from 'react';
import { useCookieConsent, type CookieCategories } from './hooks/useCookieConsent';

export interface CookieNoticeConfig {
  theme?: 'light' | 'dark';
  position?: 'top' | 'bottom' | 'center';
  message?: string;
  buttonText?: string;
  declineText?: string;
  policyUrl?: string;
  cookieTypes?: {
    necessary?: boolean;
    analytics?: boolean;
    marketing?: boolean;
    preferences?: boolean;
  };
  customCSS?: string;
  apiUrl?: string;
}

const DEFAULT_MESSAGE = 'We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.';

export function CookieNoticeComponent({ config = {} }: { config?: CookieNoticeConfig }) {
  const {
    theme = 'dark',
    position = 'bottom',
    message = DEFAULT_MESSAGE,
    buttonText = 'Accept',
    declineText = 'Decline',
    policyUrl = '/privacy-policy',
    customCSS = '',
    apiUrl,
  } = config;

  const { visible, acceptAll, declineAll, acceptSelected } = useCookieConsent(apiUrl);
  const [showDetails, setShowDetails] = useState(false);
  const [categories, setCategories] = useState<CookieCategories>({
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  });

  if (!visible) return null;

  const isDark = theme === 'dark';

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      left: 0, right: 0, zIndex: 99999,
      ...(position === 'top' ? { top: 0 } : position === 'center' ? { top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' } : { bottom: 0 }),
    },
    banner: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
      padding: '20px 24px',
      background: isDark ? '#1a1a2e' : '#ffffff',
      color: isDark ? '#e0e0e0' : '#333333',
      borderTop: position !== 'top' ? `1px solid ${isDark ? '#2a2a4a' : '#e5e5e5'}` : 'none',
      borderBottom: position === 'top' ? `1px solid ${isDark ? '#2a2a4a' : '#e5e5e5'}` : 'none',
      boxShadow: '0 -2px 16px rgba(0,0,0,0.1)',
      ...(position === 'center' ? { borderRadius: '12px', maxWidth: '520px', width: '90%', border: `1px solid ${isDark ? '#2a2a4a' : '#e5e5e5'}` } : {}),
    },
    content: {
      maxWidth: '1200px',
      margin: '0 auto',
    },
    text: {
      margin: '0 0 16px 0',
    },
    link: {
      color: isDark ? '#7c8cf5' : '#4f46e5',
      textDecoration: 'underline',
    },
    actions: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap' as const,
      alignItems: 'center',
    },
    btnAccept: {
      padding: '10px 24px',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      background: '#4f46e5',
      color: '#ffffff',
    },
    btnDecline: {
      padding: '10px 24px',
      border: `1px solid ${isDark ? '#444' : '#ccc'}`,
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      background: 'transparent',
      color: isDark ? '#ccc' : '#555',
    },
    btnCustomize: {
      padding: '10px 16px',
      border: 'none',
      borderRadius: '8px',
      fontSize: '13px',
      cursor: 'pointer',
      background: 'transparent',
      color: isDark ? '#999' : '#777',
      textDecoration: 'underline',
    },
    details: {
      marginTop: '16px',
      paddingTop: '16px',
      borderTop: `1px solid ${isDark ? '#333' : '#eee'}`,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '10px',
    },
    checkbox: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
    },
  };

  return (
    <div style={styles.overlay} role="dialog" aria-label="Cookie consent" aria-modal={position === 'center'}>
      {customCSS && <style>{customCSS}</style>}
      <div style={styles.banner} className="cookie-notice">
        <div style={styles.content}>
          <p style={styles.text}>
            {message}{' '}
            <a href={policyUrl} style={styles.link} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </p>

          {showDetails && (
            <div style={styles.details}>
              <label style={{ ...styles.checkbox, opacity: 0.6 }}>
                <input type="checkbox" checked disabled />
                Necessary (always active)
              </label>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={categories.analytics}
                  onChange={e => setCategories(c => ({ ...c, analytics: e.target.checked }))}
                />
                Analytics
              </label>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={categories.marketing}
                  onChange={e => setCategories(c => ({ ...c, marketing: e.target.checked }))}
                />
                Marketing
              </label>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={categories.preferences}
                  onChange={e => setCategories(c => ({ ...c, preferences: e.target.checked }))}
                />
                Preferences
              </label>
            </div>
          )}

          <div style={styles.actions}>
            <button style={styles.btnAccept} onClick={showDetails ? () => acceptSelected(categories) : acceptAll}>
              {showDetails ? 'Save Preferences' : buttonText}
            </button>
            <button style={styles.btnDecline} onClick={declineAll}>
              {declineText}
            </button>
            {!showDetails && (
              <button style={styles.btnCustomize} onClick={() => setShowDetails(true)}>
                Customize
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
