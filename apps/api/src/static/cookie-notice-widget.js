/**
 * kibanCMS Cookie Notice Widget — Powered by Silktide Consent Manager
 *
 * GDPR-compliant cookie consent banner using Silktide Consent Manager (open-source, MIT).
 * Reads configuration from the CMS admin, dynamically loads Silktide CSS + JS from CDN,
 * initialises the banner with mapped options, and records consent to Supabase.
 *
 * Supports Google Consent Mode v2 natively via Silktide's gtag integration.
 *
 * Embed:
 *   <script src="https://your-cms.com/api/v1/cookie-notice/widget.js" data-api-key="YOUR_KEY"></script>
 *
 * Optional attributes:
 *   data-tenant="TENANT_ID"   — multi-tenant resolution
 */
(function () {
  'use strict';

  // ── Config from script tag ──────────────────────────────────────────
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
  var CONSENT_KEY = 'kiban_cookie_consent';
  var VISITOR_KEY = 'kiban_visitor_id';
  var TENANT_ID = scriptTag.getAttribute('data-tenant');

  // Silktide CDN assets — Silktide ships only on GitHub, not npm. The npm
  // path returns 404 and silently breaks the banner; the GitHub jsdelivr path
  // is the canonical one published by Silktide themselves.
  var SILKTIDE_CSS = 'https://cdn.jsdelivr.net/gh/silktide/consent-manager@main/silktide-consent-manager.css';
  var SILKTIDE_JS  = 'https://cdn.jsdelivr.net/gh/silktide/consent-manager@main/silktide-consent-manager.js';

  // ── Helpers ──────────────────────────────────────────────────────────

  function setAuthHeaders(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
  }

  function getVisitorId() {
    var id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = 'v_' + Math.random().toString(36).substring(2, 14) + Date.now().toString(36);
      try { localStorage.setItem(VISITOR_KEY, id); } catch (e) {}
    }
    return id;
  }

  function getConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function saveConsent(data) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(data)); } catch (e) {}
  }

  // ── Send consent to Supabase ────────────────────────────────────────

  function sendConsentToServer(given, categories) {
    var data = {
      visitor_id: getVisitorId(),
      consent_given: given,
      categories: categories,
    };
    saveConsent(data);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', BASE_URL + '/api/v1/cookie-notice/consent');
    setAuthHeaders(xhr);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));
  }

  // ── Fetch CMS config ────────────────────────────────────────────────

  function fetchConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/cookie-notice/config');
    setAuthHeaders(xhr);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Load external asset ─────────────────────────────────────────────

  function loadCSS(href, onLoad) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = onLoad || function () {};
    link.onerror = function () { console.warn('[KibanCMS] Failed to load Silktide CSS'); };
    document.head.appendChild(link);
  }

  function loadJS(src, onLoad) {
    var script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = onLoad || function () {};
    script.onerror = function () { console.warn('[KibanCMS] Failed to load Silktide JS'); };
    document.head.appendChild(script);
  }

  // ── Map CMS config → Silktide options ───────────────────────────────

  function mapPositionToSilktide(pos) {
    switch (pos) {
      case 'top':          return 'bottomCenter';
      case 'bottom':       return 'bottomCenter';
      case 'center':       return 'center';
      case 'bottomRight':  return 'bottomRight';
      case 'bottomLeft':   return 'bottomLeft';
      case 'bottomCenter': return 'bottomCenter';
      default:             return 'bottomRight';
    }
  }

  function buildSilktideConfig(config) {
    var cats = config.cookieTypes || {};

    // Build consent types array
    var consentTypes = [
      {
        id: 'essential',
        label: 'Necessários',
        description: 'Estes cookies são essenciais para o funcionamento do website e não podem ser desativados.',
        required: true,
      },
    ];

    if (cats.analytics) {
      consentTypes.push({
        id: 'analytics',
        label: 'Analíticos',
        description: 'Estes cookies ajudam-nos a compreender como os visitantes interagem com o website.',
        defaultValue: false,
        gtag: 'analytics_storage',
      });
    }

    if (cats.marketing) {
      consentTypes.push({
        id: 'marketing',
        label: 'Marketing',
        description: 'Estes cookies são utilizados para apresentar anúncios personalizados.',
        defaultValue: false,
        gtag: ['ad_storage', 'ad_user_data', 'ad_personalization'],
      });
    }

    if (cats.preferences) {
      consentTypes.push({
        id: 'preferences',
        label: 'Preferências',
        description: 'Estes cookies permitem ao website lembrar-se de escolhas feitas pelo utilizador.',
        defaultValue: false,
      });
    }

    // Build description HTML
    var title = config.title || 'Informação sobre cookies';
    var message = config.message || 'Ao navegar neste website podem ser colocados no seu dispositivo cookies por nós ou parceiros.';
    var descriptionHtml = '<p><strong>' + title + '</strong></p><p>' + message + '</p>';

    if (config.policyUrl) {
      descriptionHtml += '<p><a href="' + config.policyUrl + '" target="_blank" rel="noopener">Política de Cookies</a></p>';
    }

    // Build Silktide init options
    var silktideOpts = {
      consentTypes: consentTypes,
      text: {
        prompt: {
          description: descriptionHtml,
          acceptAllButtonText: config.buttonText || 'Aceitar todos',
          acceptAllButtonAccessibleLabel: 'Aceitar todos os cookies',
          rejectNonEssentialButtonText: config.declineText || 'Rejeitar não essenciais',
          rejectNonEssentialButtonAccessibleLabel: 'Rejeitar todos os cookies não essenciais',
          preferencesButtonText: 'Preferências',
          preferencesButtonAccessibleLabel: 'Gerir preferências de cookies',
        },
        preferences: {
          title: 'Personalizar preferências',
          description: '<p>Escolha quais cookies pretende aceitar.</p>',
          saveButtonText: 'Guardar e fechar',
          saveButtonAccessibleLabel: 'Guardar as suas preferências de cookies',
        },
      },
      prompt: {
        position: mapPositionToSilktide(config.position || 'bottomRight'),
      },
      icon: {
        position: config.iconPosition || 'bottomRight',
      },
      backdrop: {
        show: config.showBackdrop !== undefined ? config.showBackdrop : false,
      },
      autoShow: true,

      // ── Callbacks: sync consent to Supabase ──
      onAcceptAll: function () {
        var accepted = { necessary: true, analytics: true, marketing: true, preferences: true };
        sendConsentToServer(true, accepted);
      },
      onRejectAll: function () {
        var rejected = { necessary: true, analytics: false, marketing: false, preferences: false };
        sendConsentToServer(false, rejected);
      },
    };

    return silktideOpts;
  }

  // ── Inject CSS variable overrides ───────────────────────────────────

  function injectColorOverrides(config) {
    var overrides = [];
    if (config.primaryColor)     overrides.push('--primaryColor: ' + config.primaryColor);
    if (config.backgroundColor)  overrides.push('--backgroundColor: ' + config.backgroundColor);
    if (config.textColor)        overrides.push('--textColor: ' + config.textColor);

    if (overrides.length > 0 || config.customCSS) {
      var style = document.createElement('style');
      var css = '';
      if (overrides.length > 0) {
        css += '#stcm-wrapper { ' + overrides.join('; ') + '; }\n';
      }
      if (config.customCSS) {
        css += config.customCSS;
      }
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  // ── Initialise ──────────────────────────────────────────────────────

  function initSilktide(config) {
    if (!config.enabled) return;

    // Load Silktide CSS first, THEN inject overrides — CSS rule order in
    // the DOM decides who wins between same-specificity #stcm-wrapper rules,
    // so our overrides have to be appended after the Silktide stylesheet.
    loadCSS(SILKTIDE_CSS);
    injectColorOverrides(config);

    // Load Silktide JS then initialise
    loadJS(SILKTIDE_JS, function () {
      if (!window.silktideConsentManager) {
        console.warn('[KibanCMS] Silktide Consent Manager not found after load');
        return;
      }

      var opts = buildSilktideConfig(config);
      window.silktideConsentManager.init(opts);
    });
  }

  function boot() {
    fetchConfig(function (err, res) {
      if (err || !res || !res.data) return;
      initSilktide(res.data);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ── Public API (backwards compatible) ───────────────────────────────

  window.KibanCookieNotice = {
    hasConsent: function () { return !!getConsent(); },
    getConsent: getConsent,
    reset: function () {
      localStorage.removeItem(CONSENT_KEY);
      // Also reset Silktide's state if available
      if (window.silktideConsentManager) {
        try { window.silktideConsentManager.resetConsent(); } catch (e) {}
      }
      location.reload();
    },
    // Expose Silktide instance for advanced usage
    getSilktideInstance: function () {
      if (window.silktideConsentManager) {
        try { return window.silktideConsentManager.getInstance(); } catch (e) {}
      }
      return null;
    },
  };
})();
