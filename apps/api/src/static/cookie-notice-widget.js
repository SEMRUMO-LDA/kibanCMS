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
  // Our own tag: document.currentScript when available, else the tag whose src
  // points at this script. The last `script[data-api-key]` on the page may be
  // an unrelated embed — using it sent every request to a foreign origin.
  var scriptTag = document.currentScript && document.currentScript.getAttribute('data-api-key') ? document.currentScript : null;
  if (!scriptTag) {
    var scripts = document.querySelectorAll('script[data-api-key]');
    for (var si = scripts.length - 1; si >= 0; si--) {
      if (/\/cookie-notice\/widget\.js/.test(scripts[si].src || '')) { scriptTag = scripts[si]; break; }
    }
    if (!scriptTag) scriptTag = scripts[scripts.length - 1];
  }
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
  var CONSENT_KEY = 'kiban_cookie_consent';
  var offeredCategories = ['necessary'];
  // Consent is only reported once the stored choice was validated against
  // the CMS config (expiry, banner version) — until then nothing may load.
  var ready = false;
  var bannerEnabled = false;
  var consentVersion = '';
  var maxAgeMonths = 12;
  var VISITOR_KEY = 'kiban_visitor_id';
  var TENANT_ID = scriptTag.getAttribute('data-tenant');

  // Silktide CDN assets — Silktide ships only on GitHub, not npm. PINNED to a
  // commit with subresource integrity: an upstream change must never be able
  // to break every tenant's banner (and with it every consent-gated tag).
  // To upgrade: change the commit, download both files from the new URLs and
  // recompute `openssl dgst -sha384 -binary <file> | openssl base64 -A`.
  var SILKTIDE_COMMIT = 'e01dee803352a565d9f5eefddf427ffa46579a2a';
  var SILKTIDE_BASE = 'https://cdn.jsdelivr.net/gh/silktide/consent-manager@' + SILKTIDE_COMMIT + '/';
  var SILKTIDE_CSS = SILKTIDE_BASE + 'silktide-consent-manager.css';
  var SILKTIDE_JS  = SILKTIDE_BASE + 'silktide-consent-manager.js';
  var SILKTIDE_CSS_SRI = 'sha384-EdMq+R+YOnsbelo08wPenoTlnxbAyxI11NMIxzugx/qAsbh64KcOkqxYqq6pfvO/';
  var SILKTIDE_JS_SRI  = 'sha384-5Pt34uiIbCsvfiiZXoLi4HRf/YBXjr9c8e+gYeVo9smUaInNHYVtc8NZ8wUnXJIq';

  // ── Helpers ──────────────────────────────────────────────────────────

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    var u = String(value || '').trim();
    if (!u) return '';
    return /^(https?:)?\/\//i.test(u) || /^[\/#.?]/.test(u) ? u : '';
  }

  function setAuthHeaders(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
  }

  function getVisitorId() {
    var id = null;
    try { id = localStorage.getItem(VISITOR_KEY); } catch (e) {} // "block all cookies" throws here
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
      updated_at: new Date().toISOString(),
      version: consentVersion,
    };
    saveConsent(data);
    // Let the site react (e.g. load the Meta Pixel only after marketing consent)
    try { window.dispatchEvent(new CustomEvent('kiban-consent-change', { detail: data })); } catch (e) {}

    var xhr = new XMLHttpRequest();
    xhr.open('POST', BASE_URL + '/api/v1/cookie-notice/consent');
    setAuthHeaders(xhr);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));
  }

  // ── Fetch CMS config ────────────────────────────────────────────────

  function fetchConfig(callback) {
    // Loaded through the universal loader: the bootstrap already carries our config
    var pre = window.KibanWidgets && typeof window.KibanWidgets.getConfig === 'function' ? window.KibanWidgets.getConfig('cookie-notice') : undefined;
    if (pre !== undefined) { callback(null, { data: pre }); return; }
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

  function loadCSS(href, onLoad, integrity) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (integrity) { link.integrity = integrity; link.crossOrigin = 'anonymous'; }
    link.onload = onLoad || function () {};
    link.onerror = function () { console.warn('[KibanCMS] Failed to load Silktide CSS'); };
    document.head.appendChild(link);
  }

  function loadJS(src, onLoad, integrity) {
    var script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (integrity) { script.integrity = integrity; script.crossOrigin = 'anonymous'; }
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
    offeredCategories = ['necessary'].concat(['analytics', 'marketing', 'preferences'].filter(function (k) { return !!cats[k]; }));

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
    // Admin-entered text goes through Silktide's innerHTML: escape it, and only
    // link to http(s)/relative policy URLs (no javascript:).
    var descriptionHtml = '<p><strong>' + escapeHtml(title) + '</strong></p><p>' + escapeHtml(message) + '</p>';

    var policyUrl = safeUrl(config.policyUrl);
    if (policyUrl) {
      descriptionHtml += '<p><a href="' + escapeHtml(policyUrl) + '" target="_blank" rel="noopener">Política de Cookies</a></p>';
    }

    // Per-category choices (made in "Preferences") used to be lost: only
    // Accept all / Reject all were saved and logged. Track each category and
    // record the combined choice (debounced: Silktide fires one callback per
    // category when the visitor saves).
    var stored = (getConsent() || {}).categories || {};
    var categoryState = {
      necessary: true,
      analytics: !!stored.analytics,
      marketing: !!stored.marketing,
      preferences: !!stored.preferences,
    };
    var categoryTimer = null;
    function setCategory(id, value) {
      categoryState[id] = value;
      clearTimeout(categoryTimer);
      categoryTimer = setTimeout(function () {
        var next = {
          necessary: true,
          analytics: !!categoryState.analytics,
          marketing: !!categoryState.marketing,
          preferences: !!categoryState.preferences,
        };
        // Accept all / Reject all also fire the per-category callbacks: don't
        // log the same choice twice.
        var prev = (getConsent() || {}).categories;
        if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
        sendConsentToServer(next.analytics || next.marketing || next.preferences, next);
      }, 300);
    }
    consentTypes.forEach(function (t) {
      if (t.required) return;
      t.onAccept = function () { setCategory(t.id, true); };
      t.onReject = function () { setCategory(t.id, false); };
    });

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
        clearTimeout(categoryTimer);
        // Only categories the banner actually showed: "Accept all" on a
        // banner without a Marketing category is not informed consent for
        // marketing (and would let the Meta Pixel load).
        var accepted = { necessary: true, analytics: !!cats.analytics, marketing: !!cats.marketing, preferences: !!cats.preferences };
        categoryState = accepted;
        sendConsentToServer(true, accepted);
      },
      onRejectAll: function () {
        clearTimeout(categoryTimer);
        var rejected = { necessary: true, analytics: false, marketing: false, preferences: false };
        categoryState = rejected;
        sendConsentToServer(false, rejected);
      },
    };

    return silktideOpts;
  }

  // ── Inject CSS variable overrides ───────────────────────────────────

  function injectStyleOverrides(config) {
    var overrides = [];
    if (config.primaryColor)     overrides.push('--primaryColor: ' + config.primaryColor);
    if (config.backgroundColor)  overrides.push('--backgroundColor: ' + config.backgroundColor);
    if (config.textColor)        overrides.push('--textColor: ' + config.textColor);

    var style = document.createElement('style');
    var css = '';
    if (overrides.length > 0) {
      css += '#stcm-wrapper { ' + overrides.join('; ') + '; }\n';
    }

    // Match the floating icon to the accessibility widget (44px). Silktide
    // ships at 60px which clashes visually when both are present.
    css += '#stcm-icon { width: 44px !important; height: 44px !important; }\n';
    css += '#stcm-icon svg { width: 60% !important; height: 60% !important; }\n';
    // Render the cookie glyph in white to match the other floating widgets.
    // brightness(0) collapses every fill/stroke to black, invert(1) flips
    // it to white — works whether Silktide ships the icon as inline SVG or
    // as an <img>.
    css += '#stcm-icon svg, #stcm-icon img { filter: brightness(0) invert(1) !important; }\n';

    // Hide icon entirely when admin opted out — Silktide has no native flag.
    if (config.showIcon === false) {
      css += '#stcm-icon { display: none !important; }\n';
    }

    if (config.customCSS) {
      css += config.customCSS;
    }

    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Initialise ──────────────────────────────────────────────────────

  function initSilktide(config) {
    if (!config.enabled) return;

    // Load Silktide CSS first, THEN inject overrides — CSS rule order in
    // the DOM decides who wins between same-specificity #stcm-wrapper rules,
    // so our overrides have to be appended after the Silktide stylesheet.
    loadCSS(SILKTIDE_CSS, null, SILKTIDE_CSS_SRI);
    injectStyleOverrides(config);

    // Load Silktide JS then initialise
    loadJS(SILKTIDE_JS, function () {
      if (!window.silktideConsentManager) {
        console.warn('[KibanCMS] Silktide Consent Manager not found after load');
        return;
      }

      var opts = buildSilktideConfig(config);
      window.silktideConsentManager.init(opts);

      // Register with the loader so it can stack our icon alongside
      // accessibility/whatsapp without overlap. No-op if loaded standalone.
      if (config.showIcon !== false && window.KibanWidgets && typeof window.KibanWidgets.register === 'function') {
        window.KibanWidgets.register('cookie-notice', {
          selector: '#stcm-icon',
          corner:   config.iconPosition || 'bottomRight',
          height:   44,
          cluster: {
            label: 'Cookies',
            // Crisp inline cookie glyph — Silktide's icon is fine but renders
            // as a yellow PNG in some builds, which clashes with our white
            // fill rule. Ship our own so the cluster is consistent.
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" '
                + 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
                + 'stroke-linejoin="round" aria-hidden="true">'
                + '<path d="M21.5 12.5a9 9 0 1 1-9.9-9.4 4 4 0 0 0 5.4 5.4 4 4 0 0 0 4.5 4z" fill="currentColor" fill-opacity="0.18"/>'
                + '<circle cx="9" cy="10" r="1" fill="currentColor"/>'
                + '<circle cx="14" cy="14" r="1" fill="currentColor"/>'
                + '<circle cx="9.5" cy="15.5" r="0.8" fill="currentColor"/></svg>',
            onActivate: function () {
              // Silktide's icon click reopens the consent banner. Prefer
              // its public API when available so we don't depend on an
              // event listener firing on a hidden element.
              if (window.silktideConsentManager && typeof window.silktideConsentManager.openCookieIcon === 'function') {
                window.silktideConsentManager.openCookieIcon();
              } else if (window.silktideConsentManager && typeof window.silktideConsentManager.show === 'function') {
                window.silktideConsentManager.show();
              } else {
                var el = document.querySelector('#stcm-icon');
                if (el) el.click();
              }
            },
          },
        });
      }
    }, SILKTIDE_JS_SRI);
  }

  // Version of what the visitor was asked: the categories offered plus a
  // number the admin bumps ("ask everyone again"). A different version means
  // the old answer no longer covers what the site does.
  function computeVersion(config) {
    var cats = config.cookieTypes || {};
    var offered = ['analytics', 'marketing', 'preferences'].filter(function (k) { return !!cats[k]; });
    return String(parseInt(config.consentVersion, 10) || 1) + ':' + offered.join(',');
  }

  function clearStoredChoice() {
    try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('stcm.') === 0 || k.indexOf('silktideCookieBanner_') === 0 || k.indexOf('silktideCookieChoice_') === 0)) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  /** Asks again when the choice is older than maxAgeMonths or the banner changed. */
  function validateStoredChoice(config) {
    consentVersion = computeVersion(config);
    var m = parseInt(config.consentMaxAgeMonths, 10);
    maxAgeMonths = m > 0 ? Math.min(m, 24) : 12;
    var c = getConsent();
    if (!c) return;
    // No or invalid timestamp (records from before versioning): we cannot
    // prove when the visitor consented, so we ask again.
    var at = Date.parse(c.updated_at || '');
    var expired = !isFinite(at) || Date.now() - at > maxAgeMonths * 30.44 * 86400000;
    var changed = !!c.version && c.version !== consentVersion;
    if (expired || changed) {
      clearStoredChoice();
    } else if (!c.version) {
      // Choices saved before versioning: adopt them as the current version
      c.version = consentVersion;
      saveConsent(c);
    }
  }

  function markReady() {
    ready = true;
    try { window.dispatchEvent(new CustomEvent('kiban-consent-ready', { detail: getConsent() })); } catch (e) {}
  }

  function boot() {
    fetchConfig(function (err, res) {
      if (err || !res || !res.data) return;
      bannerEnabled = res.data.enabled !== false;
      if (bannerEnabled) validateStoredChoice(res.data);
      markReady();
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
    /** Categories this banner offers (set by the CMS). */
    getOfferedCategories: function () { return offeredCategories.slice(); },
    /** true only if the visitor explicitly accepted this category ('marketing', 'analytics', 'preferences'). */
    hasConsentFor: function (category) {
      if (category === 'necessary') return true;
      // Banner off or not validated yet → no consent (nothing may load)
      if (!ready || !bannerEnabled) return false;
      var c = getConsent();
      return !!(c && c.categories && c.categories[category] === true);
    },
    getVisitorId: getVisitorId,
    /** true once the stored choice was checked against the CMS config. */
    isReady: function () { return ready; },
    reset: function () {
      clearStoredChoice(); // ours + Silktide's keys, even if Silktide failed to load
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
