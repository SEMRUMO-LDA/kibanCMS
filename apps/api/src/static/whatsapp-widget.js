/**
 * kibanCMS WhatsApp Chat Widget
 *
 * Floating chat button + popup that opens a WhatsApp conversation.
 * Reads config from the CMS — change settings in the admin and the
 * widget updates without redeploying the frontend.
 *
 * Embed:
 *   <script src="https://your-cms.com/api/v1/whatsapp-widget/widget.js"
 *           data-api-key="YOUR_KEY"
 *           data-tenant="optional-tenant-id"></script>
 */
(function () {
  'use strict';

  // Idempotent: don't re-init if already mounted
  if (window.__kibanWhatsAppMounted) return;

  // ── Config from script tag ──
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = null;
  for (var i = scripts.length - 1; i >= 0; i--) {
    if (scripts[i].src && scripts[i].src.indexOf('whatsapp-widget') !== -1) {
      scriptTag = scripts[i];
      break;
    }
  }
  if (!scriptTag) scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var srcUrl = new URL(scriptTag.src, window.location.href);
  var BASE_URL = srcUrl.origin;
  var TENANT_ID = scriptTag.getAttribute('data-tenant');
  var STORAGE_CONSENT = 'kiban_wa_consent';

  function setAuthHeaders(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    if (TENANT_ID) xhr.setRequestHeader('X-Tenant', TENANT_ID);
  }

  // ── Helpers ──
  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function parseHoursRange(s) {
    if (!s) return null;
    s = String(s).trim().toLowerCase();
    if (s === 'closed' || s === '') return null;
    var match = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return {
      open: parseInt(match[1], 10) * 60 + parseInt(match[2], 10),
      close: parseInt(match[3], 10) * 60 + parseInt(match[4], 10),
    };
  }

  function isWithinHours(config) {
    if (!config.use_working_hours) return true;
    var tz = config.working_hours_timezone || 'Europe/Lisbon';
    var now;
    try {
      now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    } catch (e) {
      now = new Date();
    }
    var dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var key = 'working_hours_' + dayKeys[now.getDay()];
    var range = parseHoursRange(config[key]);
    if (!range) return false;
    var minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= range.open && minutes < range.close;
  }

  function buildWhatsAppUrl(phone, message) {
    // Strip non-digits but keep + for international
    var clean = String(phone || '').replace(/[^0-9]/g, '');
    if (!clean) return null;
    var url = 'https://wa.me/' + clean;
    if (message) url += '?text=' + encodeURIComponent(message);
    return url;
  }

  // Markdown-lite for consent text: [text](url) → <a>
  function renderMarkdownLite(text) {
    var safe = escapeHtml(text);
    return safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      var safeHref = escapeHtml(href);
      return '<a href="' + safeHref + '" target="_blank" rel="noopener">' + label + '</a>';
    });
  }

  // ── Fetch config ──
  function fetchConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/whatsapp-widget/config');
    setAuthHeaders(xhr);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var res = JSON.parse(xhr.responseText);
          callback(res.data || null);
          return;
        } catch (e) {}
      }
      callback(null);
    };
    xhr.onerror = function () { callback(null); };
    xhr.send();
  }

  // ── Render ──
  function render(config) {
    if (!config || !config.enabled) return;
    if (!config.phone_number) return;

    // Device gates
    if (isMobile() && config.show_on_mobile === false) return;
    if (!isMobile() && config.show_on_desktop === false) return;

    var color = (config.button_color && /^#[0-9a-fA-F]{6}$/.test(config.button_color))
      ? config.button_color
      : '#25D366';
    var position = config.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    var withinHours = isWithinHours(config);
    var phone = config.phone_number;
    var message = config.default_message || '';
    var waUrl = buildWhatsAppUrl(phone, message);
    if (!waUrl) return;

    var initials = (config.agent_name || 'WA').trim().slice(0, 2).toUpperCase();

    var html = ''
      + '<style>'
      + '#kiban-wa-widget{position:fixed;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
      +   (position === 'bottom-right' ? 'right:20px;' : 'left:20px;') + 'bottom:20px}'
      + '#kiban-wa-btn{width:60px;height:60px;border-radius:50%;background:' + color + ';color:#fff;border:none;cursor:pointer;'
      +   'box-shadow:0 4px 16px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;position:relative}'
      + '#kiban-wa-btn:hover{transform:scale(1.06);box-shadow:0 6px 22px rgba(0,0,0,.22)}'
      + '#kiban-wa-btn svg{width:32px;height:32px}'
      + '#kiban-wa-bubble{position:absolute;top:-6px;right:-6px;background:#FF3B30;color:#fff;font-size:11px;font-weight:700;'
      +   'min-width:20px;height:20px;padding:0 6px;border-radius:10px;display:flex;align-items:center;justify-content:center;'
      +   'box-shadow:0 2px 6px rgba(0,0,0,.2)}'
      + '#kiban-wa-popup{position:absolute;bottom:74px;' + (position === 'bottom-right' ? 'right:0;' : 'left:0;')
      +   'width:340px;max-width:calc(100vw - 40px);background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.25);'
      +   'overflow:hidden;display:none;animation:kiban-wa-in .2s ease-out}'
      + '#kiban-wa-popup.open{display:block}'
      + '@keyframes kiban-wa-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}'
      + '.kiban-wa-header{background:' + color + ';color:#fff;padding:18px 20px;display:flex;align-items:center;gap:12px}'
      + '.kiban-wa-avatar{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;'
      +   'justify-content:center;font-weight:700;font-size:16px;overflow:hidden;flex-shrink:0}'
      + '.kiban-wa-avatar img{width:100%;height:100%;object-fit:cover}'
      + '.kiban-wa-meta{flex:1;min-width:0}'
      + '.kiban-wa-name{font-weight:600;font-size:15px;line-height:1.2}'
      + '.kiban-wa-role{font-size:12px;opacity:.85;margin-top:2px}'
      + '.kiban-wa-status{font-size:11px;margin-top:4px;display:flex;align-items:center;gap:5px}'
      + '.kiban-wa-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#7CFC00;display:inline-block}'
      + '.kiban-wa-status.offline::before{background:#aaa}'
      + '.kiban-wa-close{background:none;border:none;color:#fff;cursor:pointer;padding:4px;opacity:.85;font-size:20px;line-height:1}'
      + '.kiban-wa-close:hover{opacity:1}'
      + '.kiban-wa-body{padding:20px;background:#f7f7f5}'
      + '.kiban-wa-greeting{background:#fff;border-radius:0 12px 12px 12px;padding:14px 16px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
      + '.kiban-wa-greeting strong{display:block;font-size:14px;color:#222;margin-bottom:4px}'
      + '.kiban-wa-greeting p{font-size:13px;color:#555;margin:0;line-height:1.5;white-space:pre-line}'
      + '.kiban-wa-consent{display:flex;align-items:flex-start;gap:8px;padding:8px 4px;font-size:12px;color:#555;line-height:1.4}'
      + '.kiban-wa-consent input{margin-top:2px;flex-shrink:0}'
      + '.kiban-wa-consent a{color:#0a66c2;text-decoration:underline}'
      + '.kiban-wa-cta{display:block;width:100%;background:' + color + ';color:#fff;border:none;padding:14px;border-radius:10px;'
      +   'font-size:15px;font-weight:600;cursor:pointer;margin-top:10px;text-decoration:none;text-align:center;font-family:inherit}'
      + '.kiban-wa-cta:hover{filter:brightness(1.05)}'
      + '.kiban-wa-cta:disabled{opacity:.55;cursor:not-allowed}'
      + '.kiban-wa-footer{padding:10px;text-align:center;font-size:11px;color:#999;background:#fff;border-top:1px solid #eee}'
      + '.kiban-wa-footer a{color:#999;text-decoration:none}'
      + '@media (max-width:480px){#kiban-wa-popup{width:calc(100vw - 24px);' + (position === 'bottom-right' ? 'right:-10px' : 'left:-10px') + '}}'
      + '</style>'

      + '<div id="kiban-wa-widget" role="region" aria-label="WhatsApp chat">'
      + '  <div id="kiban-wa-popup" role="dialog" aria-labelledby="kiban-wa-name">'
      + '    <div class="kiban-wa-header">'
      + '      <div class="kiban-wa-avatar">'
      +          (config.agent_avatar
                  ? '<img src="' + escapeHtml(config.agent_avatar) + '" alt="">'
                  : escapeHtml(initials))
      + '      </div>'
      + '      <div class="kiban-wa-meta">'
      + '        <div class="kiban-wa-name" id="kiban-wa-name">' + escapeHtml(config.agent_name || 'WhatsApp') + '</div>'
      +          (config.agent_role ? '<div class="kiban-wa-role">' + escapeHtml(config.agent_role) + '</div>' : '')
      + '        <div class="kiban-wa-status' + (withinHours ? '' : ' offline') + '">' + (withinHours ? 'Online' : 'Offline') + '</div>'
      + '      </div>'
      + '      <button class="kiban-wa-close" aria-label="Close" id="kiban-wa-close">×</button>'
      + '    </div>'
      + '    <div class="kiban-wa-body">'
      + '      <div class="kiban-wa-greeting">'
      + '        <strong>' + escapeHtml(config.greeting_title || 'Need help?') + '</strong>'
      + '        <p>' + escapeHtml(
                  withinHours
                    ? (config.greeting_message || 'Send us a message — we\'ll reply as soon as possible.')
                    : (config.offline_message || 'We\'re offline. Leave a message and we\'ll get back to you.')
                ) + '</p>'
      + '      </div>'
      +        (config.require_consent
                ? '<label class="kiban-wa-consent"><input type="checkbox" id="kiban-wa-consent-cb"><span>'
                  + renderMarkdownLite(config.consent_text || 'I agree my data will be transferred to WhatsApp.')
                  + '</span></label>'
                : '')
      + '      <button class="kiban-wa-cta" id="kiban-wa-cta"' + (config.require_consent ? ' disabled' : '') + '>'
      +          escapeHtml(config.cta_button_text || 'Start chat on WhatsApp')
      + '      </button>'
      + '    </div>'
      + '    <div class="kiban-wa-footer">Powered by <a href="https://kibancms.app" target="_blank" rel="noopener">kibanCMS</a></div>'
      + '  </div>'
      + '  <button id="kiban-wa-btn" aria-label="Open WhatsApp chat">'
      + '    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.88 11.9L4 20l4.2-1.1a7.93 7.93 0 0 0 3.85.98h.01a7.94 7.94 0 0 0 5.54-13.56zM12.05 18.5h-.01a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.5.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.22-3.5 6.6 6.6 0 0 1-6.62 6.59zm3.62-4.94c-.2-.1-1.17-.58-1.35-.65-.18-.07-.31-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.84-.31-1.6-.99-.59-.53-.99-1.18-1.1-1.38-.12-.2-.01-.31.09-.4.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.61-1.47-.16-.39-.33-.34-.45-.34l-.39-.01a.74.74 0 0 0-.54.25c-.18.2-.7.69-.7 1.67 0 .98.71 1.93.81 2.07.1.13 1.4 2.13 3.39 2.99.47.2.84.32 1.13.42.47.15.9.13 1.24.08.38-.06 1.17-.48 1.33-.94.16-.46.16-.86.12-.94-.04-.08-.18-.13-.38-.23z"/></svg>'
      +      (config.show_bubble ? '<span id="kiban-wa-bubble" style="display:none">' + escapeHtml(config.bubble_text || '1') + '</span>' : '')
      + '  </button>'
      + '</div>';

    var container = document.createElement('div');
    container.innerHTML = html;
    while (container.firstChild) document.body.appendChild(container.firstChild);

    // Register with the universal loader so widgets in the same corner stack
    // instead of overlapping. No-op if loaded standalone.
    if (window.KibanWidgets && typeof window.KibanWidgets.register === 'function') {
      window.KibanWidgets.register('whatsapp-widget', {
        selector: '#kiban-wa-widget',
        corner:   position,
        height:   60,
      });
    }

    var widget = document.getElementById('kiban-wa-widget');
    var btn = document.getElementById('kiban-wa-btn');
    var popup = document.getElementById('kiban-wa-popup');
    var closeBtn = document.getElementById('kiban-wa-close');
    var cta = document.getElementById('kiban-wa-cta');
    var consentCb = document.getElementById('kiban-wa-consent-cb');
    var bubble = document.getElementById('kiban-wa-bubble');

    // Initially hidden — show after delay
    widget.style.display = 'none';
    var showDelay = Math.max(0, Number(config.show_after_seconds) || 0) * 1000;
    setTimeout(function () { widget.style.display = 'block'; }, showDelay);

    // Bubble notification
    if (bubble) {
      var bubbleDelay = Math.max(0, Number(config.bubble_delay_seconds) || 5) * 1000;
      setTimeout(function () { bubble.style.display = 'flex'; }, showDelay + bubbleDelay);
    }

    function openPopup() {
      popup.classList.add('open');
      if (bubble) bubble.style.display = 'none';
    }
    function closePopup() {
      popup.classList.remove('open');
    }

    btn.addEventListener('click', function () {
      if (popup.classList.contains('open')) closePopup(); else openPopup();
    });
    closeBtn.addEventListener('click', closePopup);

    if (consentCb && cta) {
      consentCb.addEventListener('change', function () {
        cta.disabled = !consentCb.checked;
      });
    }

    cta.addEventListener('click', function () {
      if (config.require_consent && consentCb && !consentCb.checked) return;

      // Tracking — push event to dataLayer for GA/GTM
      if (config.track_clicks && window.dataLayer) {
        try {
          window.dataLayer.push({
            event: 'whatsapp_widget_click',
            agent_name: config.agent_name || '',
            within_hours: withinHours,
          });
        } catch (e) {}
      }

      // Save consent so we don't ask again
      if (config.require_consent) {
        try { localStorage.setItem(STORAGE_CONSENT, '1'); } catch (e) {}
      }

      window.open(waUrl, '_blank', 'noopener');
    });

    // If consent already given previously, pre-check
    if (config.require_consent && consentCb) {
      try {
        if (localStorage.getItem(STORAGE_CONSENT) === '1') {
          consentCb.checked = true;
          cta.disabled = false;
        }
      } catch (e) {}
    }

    window.__kibanWhatsAppMounted = true;
  }

  // ── Init ──
  function init() {
    fetchConfig(function (config) {
      if (!config) return;
      render(config);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
