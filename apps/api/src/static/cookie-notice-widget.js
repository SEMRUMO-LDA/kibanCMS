/**
 * kibanCMS Cookie Notice Widget
 *
 * GDPR-compliant cookie consent banner.
 * Reads configuration from the CMS and renders a customisable banner.
 *
 * Embed: <script src="https://your-cms.com/api/v1/cookie-notice/widget.js" data-api-key="YOUR_KEY"></script>
 */
(function () {
  'use strict';

  // ── Config from script tag ──
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
  var CONSENT_KEY = 'kiban_cookie_consent';
  var VISITOR_KEY = 'kiban_visitor_id';
  // Multi-tenant: shared API host needs X-Tenant to resolve the right Supabase.
  var TENANT_ID = scriptTag.getAttribute('data-tenant');

  function setAuthHeaders(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
  }

  // ── Check if already consented ──
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

  function getVisitorId() {
    var id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = 'v_' + Math.random().toString(36).substring(2, 14) + Date.now().toString(36);
      try { localStorage.setItem(VISITOR_KEY, id); } catch (e) {}
    }
    return id;
  }

  // Skip if already consented
  if (getConsent()) return;

  // ── Fetch config ──
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

  // ── Send consent to server ──
  function sendConsent(given, categories) {
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

  // ── Render Banner ──
  function renderBanner(config) {
    if (!config.enabled) return;

    // Always render as centered modal
    var overlay = document.createElement('div');
    overlay.id = 'kiban-cookie-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99998;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:kibanOverlayIn 0.3s ease;';
    document.body.appendChild(overlay);

    var banner = document.createElement('div');
    banner.id = 'kiban-cookie-notice';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'max-width:480px;width:calc(100% - 40px);' +
      'z-index:99999;background:#fff;color:#2c2c2c;' +
      'border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.15);' +
      'padding:36px 32px 28px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'animation:kibanModalIn 0.3s ease;';

    var html = '';
    html += '<style>';
    html += '@keyframes kibanOverlayIn{from{opacity:0}to{opacity:1}}';
    html += '@keyframes kibanModalIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}';
    html += '#kiban-cookie-notice *{box-sizing:border-box;margin:0;padding:0;}';
    html += '#kiban-cookie-notice button{transition:all 0.15s ease;cursor:pointer;}';
    html += '#kiban-cookie-notice button:hover{opacity:0.85;}';
    html += '</style>';

    // Title
    var title = config.title || 'Informação sobre cookies';
    html += '<h2 style="font-size:18px;font-weight:600;color:#1a1a1a;margin-bottom:16px;line-height:1.3;">' + escapeHtml(title) + '</h2>';

    // Message
    var message = config.message || 'Ao navegar neste website podem ser colocados no seu dispositivo cookies por nós ou parceiros. Estes cookies podem ser utilizados para melhorar o funcionamento do website ou para lhe oferecer uma experiência de navegação mais personalizada. Poderá aceitar ou personalizar as suas definições de cookies através dos botões disponibilizados.';
    html += '<p style="font-size:13px;line-height:1.7;color:#555;margin-bottom:24px;">' + escapeHtml(message) + '</p>';

    // Cookie categories (if granular)
    var cats = config.cookieTypes || {};
    var showCategories = cats.analytics || cats.marketing || cats.preferences;

    if (showCategories) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px;">';
      html += '<label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#999;cursor:default;">' +
        '<input type="checkbox" checked disabled style="accent-color:#2c2c2c;width:14px;height:14px;"> Necessários</label>';
      if (cats.analytics) {
        html += '<label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#555;cursor:pointer;">' +
          '<input type="checkbox" class="kiban-cat" data-cat="analytics" style="accent-color:#2c2c2c;width:14px;height:14px;"> Analíticos</label>';
      }
      if (cats.marketing) {
        html += '<label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#555;cursor:pointer;">' +
          '<input type="checkbox" class="kiban-cat" data-cat="marketing" style="accent-color:#2c2c2c;width:14px;height:14px;"> Marketing</label>';
      }
      if (cats.preferences) {
        html += '<label style="font-size:12px;display:flex;align-items:center;gap:6px;color:#555;cursor:pointer;">' +
          '<input type="checkbox" class="kiban-cat" data-cat="preferences" style="accent-color:#2c2c2c;width:14px;height:14px;"> Preferências</label>';
      }
      html += '</div>';
    }

    // Policy link
    if (config.policyUrl) {
      html += '<p style="font-size:12px;color:#888;margin-bottom:24px;line-height:1.5;">Caso deseje obter mais detalhes sobre a forma como utilizamos cookies, sugerimos que visite a nossa ' +
        '<a href="' + escapeHtml(config.policyUrl) + '" target="_blank" rel="noopener" style="color:#555;text-decoration:underline;">Política de Cookies</a>.</p>';
    }

    // Buttons
    html += '<div style="display:flex;gap:12px;justify-content:center;">';
    html += '<button id="kiban-cookie-decline" style="padding:12px 28px;background:#fff;color:#2c2c2c;border:1.5px solid #d0d0d0;border-radius:6px;font-size:13px;font-weight:500;letter-spacing:0.01em;">' +
      escapeHtml(config.declineText || 'Gerir cookies') + '</button>';
    html += '<button id="kiban-cookie-accept" style="padding:12px 28px;background:#2c2c2c;color:#fff;border:1.5px solid #2c2c2c;border-radius:6px;font-size:13px;font-weight:500;letter-spacing:0.01em;">' +
      escapeHtml(config.buttonText || 'Aceitar todos') + '</button>';
    html += '</div>';

    // Custom CSS
    if (config.customCSS) {
      html += '<style>' + config.customCSS + '</style>';
    }

    banner.innerHTML = html;
    document.body.appendChild(banner);

    // ── Event Handlers ──
    function removeBanner() {
      banner.style.opacity = '0';
      banner.style.transition = 'opacity 0.2s ease';
      setTimeout(function () {
        banner.remove();
        if (overlay) overlay.remove();
      }, 200);
    }

    function getSelectedCategories() {
      var selected = { necessary: true, analytics: false, marketing: false, preferences: false };
      var checkboxes = banner.querySelectorAll('.kiban-cat');
      checkboxes.forEach(function (cb) {
        selected[cb.getAttribute('data-cat')] = cb.checked;
      });
      return selected;
    }

    banner.querySelector('#kiban-cookie-accept').addEventListener('click', function () {
      var categories = showCategories
        ? getSelectedCategories()
        : { necessary: true, analytics: true, marketing: true, preferences: true };
      sendConsent(true, categories);
      removeBanner();
    });

    banner.querySelector('#kiban-cookie-decline').addEventListener('click', function () {
      sendConsent(false, { necessary: true, analytics: false, marketing: false, preferences: false });
      removeBanner();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Initialize ──
  function init() {
    fetchConfig(function (err, res) {
      if (err || !res || !res.data) return;
      renderBanner(res.data);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ──
  window.KibanCookieNotice = {
    hasConsent: function () { return !!getConsent(); },
    getConsent: getConsent,
    reset: function () {
      localStorage.removeItem(CONSENT_KEY);
      location.reload();
    },
  };
})();
