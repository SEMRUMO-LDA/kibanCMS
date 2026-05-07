/**
 * CookieNotice — Silktide Consent Manager React wrapper.
 *
 * Dynamically loads the Silktide Consent Manager CSS + JS from CDN
 * and initialises it with the provided configuration.
 *
 * For most use-cases the embeddable widget.js is preferred (zero React dependency).
 * This component is provided for internal React-based frontends that want
 * a declarative way to mount the cookie banner.
 */

import React, { useEffect, useRef } from 'react';

export interface CookieNoticeConfig {
  theme?: 'light' | 'dark';
  position?: 'bottomRight' | 'bottomLeft' | 'bottomCenter' | 'center';
  iconPosition?: 'bottomLeft' | 'bottomRight';
  showBackdrop?: boolean;
  message?: string;
  title?: string;
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
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  apiUrl?: string;
}

// Silktide CDN assets
const SILKTIDE_CSS = 'https://cdn.jsdelivr.net/npm/@silktide/consent-manager@latest/silktide-consent-manager.css';
const SILKTIDE_JS  = 'https://cdn.jsdelivr.net/npm/@silktide/consent-manager@latest/silktide-consent-manager.js';

declare global {
  interface Window {
    silktideConsentManager?: {
      init: (config: any) => void;
      update: (config: any) => void;
      resetConsent: () => void;
      getInstance: () => any;
    };
  }
}

function loadAsset(tag: 'link' | 'script', attrs: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag) as HTMLLinkElement | HTMLScriptElement;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${attrs.href || attrs.src}`));
    document.head.appendChild(el);
  });
}

export function CookieNoticeComponent({ config = {} }: { config?: CookieNoticeConfig }) {
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    async function boot() {
      // Load Silktide CSS + JS
      await loadAsset('link', { rel: 'stylesheet', href: SILKTIDE_CSS });
      await loadAsset('script', { src: SILKTIDE_JS, async: 'true' });

      if (!window.silktideConsentManager) {
        console.warn('[KibanCMS] Silktide Consent Manager not found after load');
        return;
      }

      // Build consent types
      const cats = config.cookieTypes || {};
      const consentTypes: any[] = [
        {
          id: 'essential',
          label: 'Necessários',
          description: 'Estes cookies são essenciais para o funcionamento do website.',
          required: true,
        },
      ];

      if (cats.analytics) {
        consentTypes.push({
          id: 'analytics',
          label: 'Analíticos',
          description: 'Ajudam-nos a compreender como os visitantes interagem com o website.',
          defaultValue: false,
          gtag: 'analytics_storage',
        });
      }

      if (cats.marketing) {
        consentTypes.push({
          id: 'marketing',
          label: 'Marketing',
          description: 'Utilizados para apresentar anúncios personalizados.',
          defaultValue: false,
          gtag: ['ad_storage', 'ad_user_data', 'ad_personalization'],
        });
      }

      if (cats.preferences) {
        consentTypes.push({
          id: 'preferences',
          label: 'Preferências',
          description: 'Permitem ao website lembrar-se de escolhas feitas pelo utilizador.',
          defaultValue: false,
        });
      }

      // Title + message HTML
      const title = config.title || 'Informação sobre cookies';
      const message = config.message || 'Ao navegar neste website podem ser colocados no seu dispositivo cookies.';
      let descriptionHtml = `<p><strong>${title}</strong></p><p>${message}</p>`;
      if (config.policyUrl) {
        descriptionHtml += `<p><a href="${config.policyUrl}" target="_blank" rel="noopener">Política de Cookies</a></p>`;
      }

      // Inject CSS variable overrides
      const overrides: string[] = [];
      if (config.primaryColor)    overrides.push(`--primaryColor: ${config.primaryColor}`);
      if (config.backgroundColor) overrides.push(`--backgroundColor: ${config.backgroundColor}`);
      if (config.textColor)       overrides.push(`--textColor: ${config.textColor}`);

      if (overrides.length > 0 || config.customCSS) {
        const style = document.createElement('style');
        let css = '';
        if (overrides.length > 0) css += `#stcm-wrapper { ${overrides.join('; ')}; }\n`;
        if (config.customCSS) css += config.customCSS;
        style.textContent = css;
        document.head.appendChild(style);
      }

      // Initialise Silktide
      window.silktideConsentManager!.init({
        consentTypes,
        text: {
          prompt: {
            description: descriptionHtml,
            acceptAllButtonText: config.buttonText || 'Aceitar todos',
            rejectNonEssentialButtonText: config.declineText || 'Rejeitar não essenciais',
            preferencesButtonText: 'Preferências',
          },
          preferences: {
            title: 'Personalizar preferências',
            description: '<p>Escolha quais cookies pretende aceitar.</p>',
            saveButtonText: 'Guardar e fechar',
          },
        },
        prompt: {
          position: config.position || 'bottomRight',
        },
        icon: {
          position: config.iconPosition || 'bottomRight',
        },
        backdrop: {
          show: config.showBackdrop || false,
        },
        autoShow: true,
      });
    }

    boot().catch(err => console.error('[KibanCMS] Cookie notice init error:', err));
  }, [config]);

  // Silktide renders its own DOM — no React output needed
  return null;
}
