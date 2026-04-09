/**
 * kibanCMS i18n Language Switcher Widget
 *
 * Embed: <script src="https://your-cms.com/api/v1/i18n/widget.js" data-api-key="YOUR_KEY"></script>
 *
 * Options (data attributes on the script tag):
 *   data-api-key    — Required. Your kibanCMS API key.
 *   data-position   — Optional. Override position (bottom-right, bottom-left, top-right, top-left)
 *   data-style      — Optional. Override style (dropdown, flags, minimal)
 *   data-auto-redirect — Optional. "true" to reload page on language change (default: false)
 */
(function () {
  'use strict';

  // ── Find our script tag and read config ──
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var BASE_URL = scriptTag.src.replace('/api/v1/i18n/widget.js', '');
  var POSITION_OVERRIDE = scriptTag.getAttribute('data-position');
  var STYLE_OVERRIDE = scriptTag.getAttribute('data-style');
  var AUTO_REDIRECT = scriptTag.getAttribute('data-auto-redirect') === 'true';

  // ── State ──
  var languages = [];
  var defaultLang = 'pt';
  var currentLang = getCookie('kiban-lang') || getUrlParam('lang') || null;
  var config = { position: 'bottom-right', style: 'dropdown' };

  // ── Helpers ──
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;max-age=31536000;SameSite=Lax';
  }

  function getUrlParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function setUrlParam(name, value) {
    var url = new URL(window.location.href);
    url.searchParams.set(name, value);
    return url.toString();
  }

  // ── Fetch languages from CMS ──
  function fetchLanguages(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/i18n/languages');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var json = JSON.parse(xhr.responseText);
          callback(null, json.data);
        } catch (e) {
          callback(e);
        }
      } else {
        callback(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Fetch widget config ──
  function fetchWidgetConfig(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BASE_URL + '/api/v1/i18n/widget');
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var json = JSON.parse(xhr.responseText);
          callback(null, json.data);
        } catch (e) {
          callback(e);
        }
      } else {
        callback(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Flag emoji from country code ──
  function flagEmoji(code) {
    var map = {
      pt: '\uD83C\uDDF5\uD83C\uDDF9', gb: '\uD83C\uDDEC\uD83C\uDDE7',
      es: '\uD83C\uDDEA\uD83C\uDDF8', fr: '\uD83C\uDDEB\uD83C\uDDF7',
      de: '\uD83C\uDDE9\uD83C\uDDEA', it: '\uD83C\uDDEE\uD83C\uDDF9',
      nl: '\uD83C\uDDF3\uD83C\uDDF1', ru: '\uD83C\uDDF7\uD83C\uDDFA',
      cn: '\uD83C\uDDE8\uD83C\uDDF3', jp: '\uD83C\uDDEF\uD83C\uDDF5',
      kr: '\uD83C\uDDF0\uD83C\uDDF7', sa: '\uD83C\uDDF8\uD83C\uDDE6',
      in: '\uD83C\uDDEE\uD83C\uDDF3', pl: '\uD83C\uDDF5\uD83C\uDDF1',
      se: '\uD83C\uDDF8\uD83C\uDDEA', dk: '\uD83C\uDDE9\uD83C\uDDF0',
      fi: '\uD83C\uDDEB\uD83C\uDDEE', no: '\uD83C\uDDF3\uD83C\uDDF4',
      tr: '\uD83C\uDDF9\uD83C\uDDF7', cz: '\uD83C\uDDE8\uD83C\uDDFF',
      ro: '\uD83C\uDDF7\uD83C\uDDF4', ua: '\uD83C\uDDFA\uD83C\uDDE6',
      gr: '\uD83C\uDDEC\uD83C\uDDF7', th: '\uD83C\uDDF9\uD83C\uDDED',
      vn: '\uD83C\uDDFB\uD83C\uDDF3', id: '\uD83C\uDDEE\uD83C\uDDE9',
      my: '\uD83C\uDDF2\uD83C\uDDFE', il: '\uD83C\uDDEE\uD83C\uDDF1',
      hr: '\uD83C\uDDED\uD83C\uDDF7', us: '\uD83C\uDDFA\uD83C\uDDF8',
      br: '\uD83C\uDDE7\uD83C\uDDF7',
    };
    return map[code] || '\uD83C\uDFF3\uFE0F';
  }

  // ── Handle language change ──
  function onLanguageChange(langCode) {
    currentLang = langCode;
    setCookie('kiban-lang', langCode);

    // Dispatch custom event for SPA frameworks
    var event = new CustomEvent('kiban-lang-change', { detail: { lang: langCode } });
    window.dispatchEvent(event);

    if (AUTO_REDIRECT) {
      window.location.href = setUrlParam('lang', langCode);
    } else {
      // Update URL without reload
      var newUrl = setUrlParam('lang', langCode);
      window.history.replaceState(null, '', newUrl);
      updateWidgetDisplay();
    }
  }

  // ── Render widget ──
  var widgetEl = null;

  function updateWidgetDisplay() {
    if (!widgetEl) return;
    var select = widgetEl.querySelector('select');
    if (select) select.value = currentLang || defaultLang;

    var flagEl = widgetEl.querySelector('.kiban-flag');
    var active = languages.find(function (l) { return l.code === (currentLang || defaultLang); });
    if (flagEl && active) flagEl.textContent = flagEmoji(active.flag || active.code);
  }

  function renderWidget() {
    if (languages.length < 2) return; // No point showing widget with 1 language

    var pos = POSITION_OVERRIDE || config.position || 'bottom-right';
    var style = STYLE_OVERRIDE || config.style || 'dropdown';

    // Create container
    widgetEl = document.createElement('div');
    widgetEl.id = 'kiban-i18n-widget';

    // Position styles
    var posStyles = {
      'bottom-right': 'bottom:20px;right:20px;',
      'bottom-left': 'bottom:20px;left:20px;',
      'top-right': 'top:20px;right:20px;',
      'top-left': 'top:20px;left:20px;',
    };

    widgetEl.style.cssText = 'position:fixed;z-index:99999;' + (posStyles[pos] || posStyles['bottom-right']);

    var activeLang = languages.find(function (l) { return l.code === (currentLang || defaultLang); }) || languages[0];

    if (style === 'flags') {
      // Flag buttons
      var html = '<div style="display:flex;gap:6px;background:#fff;padding:8px 12px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.08);">';
      languages.forEach(function (lang) {
        var isActive = lang.code === (currentLang || defaultLang);
        html += '<button data-lang="' + lang.code + '" style="' +
          'background:none;border:' + (isActive ? '2px solid #06b6d4' : '2px solid transparent') + ';' +
          'border-radius:8px;padding:4px 8px;cursor:pointer;font-size:20px;line-height:1;' +
          'transition:all 0.15s;opacity:' + (isActive ? '1' : '0.6') + ';" ' +
          'title="' + lang.name + '">' +
          flagEmoji(lang.flag || lang.code) +
          '</button>';
      });
      html += '</div>';
      widgetEl.innerHTML = html;

      widgetEl.querySelectorAll('button[data-lang]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          onLanguageChange(btn.getAttribute('data-lang'));
          // Update active states
          widgetEl.querySelectorAll('button[data-lang]').forEach(function (b) {
            var isNowActive = b.getAttribute('data-lang') === currentLang;
            b.style.borderColor = isNowActive ? '#06b6d4' : 'transparent';
            b.style.opacity = isNowActive ? '1' : '0.6';
          });
        });
      });

    } else if (style === 'minimal') {
      // Minimal glassmorphism circle → pill toggle
      var isExpanded = false;
      var glassBase = 'background:rgba(255,255,255,0.12);' +
        'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
        'box-shadow:0 4px 24px rgba(0,0,0,0.15),inset 0 0 0 1px rgba(255,255,255,0.15);' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;letter-spacing:0.06em;' +
        'cursor:pointer;overflow:hidden;transition:all 0.35s cubic-bezier(0.4,0,0.2,1);';

      // Collapsed circle
      var circleEl = document.createElement('div');
      circleEl.className = 'kiban-circle';
      circleEl.style.cssText = glassBase +
        'width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'color:#fff;text-transform:uppercase;font-weight:600;font-size:11px;';
      circleEl.textContent = (currentLang || defaultLang).toUpperCase();

      // Expanded pill
      var pillEl = document.createElement('div');
      pillEl.className = 'kiban-pill';
      pillEl.style.cssText = glassBase +
        'display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;' +
        'opacity:0;pointer-events:none;position:absolute;bottom:0;right:0;' +
        'transform:scale(0.6);transition:all 0.35s cubic-bezier(0.4,0,0.2,1);';

      var pillHtml = '';
      languages.forEach(function (lang) {
        var isActive = lang.code === (currentLang || defaultLang);
        pillHtml += '<a href="#" data-lang="' + lang.code + '" style="' +
          'text-decoration:none;padding:8px 14px;border-radius:999px;' +
          'text-transform:uppercase;font-weight:500;transition:all 0.2s ease;white-space:nowrap;' +
          'color:' + (isActive ? '#fff' : 'rgba(255,255,255,0.5)') + ';' +
          'background:' + (isActive ? 'rgba(255,255,255,0.18)' : 'transparent') + ';">' +
          lang.code + '</a>';
      });
      pillEl.innerHTML = pillHtml;

      widgetEl.style.cssText += 'position:relative;';
      widgetEl.appendChild(circleEl);
      widgetEl.appendChild(pillEl);

      function toggleExpand() {
        isExpanded = !isExpanded;
        if (isExpanded) {
          circleEl.style.opacity = '0';
          circleEl.style.pointerEvents = 'none';
          circleEl.style.transform = 'scale(0.6)';
          pillEl.style.opacity = '1';
          pillEl.style.pointerEvents = 'auto';
          pillEl.style.transform = 'scale(1)';
        } else {
          circleEl.style.opacity = '1';
          circleEl.style.pointerEvents = 'auto';
          circleEl.style.transform = 'scale(1)';
          pillEl.style.opacity = '0';
          pillEl.style.pointerEvents = 'none';
          pillEl.style.transform = 'scale(0.6)';
        }
      }

      circleEl.addEventListener('click', toggleExpand);

      pillEl.querySelectorAll('a[data-lang]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          onLanguageChange(a.getAttribute('data-lang'));
          circleEl.textContent = currentLang.toUpperCase();
          pillEl.querySelectorAll('a[data-lang]').forEach(function (link) {
            var isNowActive = link.getAttribute('data-lang') === currentLang;
            link.style.color = isNowActive ? '#fff' : 'rgba(255,255,255,0.5)';
            link.style.background = isNowActive ? 'rgba(255,255,255,0.18)' : 'transparent';
          });
          // Collapse back to circle after selection
          setTimeout(function () { toggleExpand(); }, 200);
        });
      });

      // Close pill on click outside
      document.addEventListener('click', function (e) {
        if (isExpanded && !widgetEl.contains(e.target)) {
          toggleExpand();
        }
      });

    } else {
      // Default: dropdown
      var html = '<div style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 14px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.08);font-family:-apple-system,sans-serif;">';
      html += '<span class="kiban-flag" style="font-size:20px;line-height:1;">' + flagEmoji(activeLang.flag || activeLang.code) + '</span>';
      html += '<select style="background:none;border:none;font-size:14px;font-weight:500;color:#171717;cursor:pointer;outline:none;padding:0;font-family:inherit;-webkit-appearance:none;appearance:none;padding-right:16px;background-image:url(' + "'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%23737373\" stroke-width=\"2\"><polyline points=\"6 9 12 15 18 9\"/></svg>'" + ');background-repeat:no-repeat;background-position:right center;">';
      languages.forEach(function (lang) {
        var selected = lang.code === (currentLang || defaultLang) ? ' selected' : '';
        html += '<option value="' + lang.code + '"' + selected + '>' + lang.name + '</option>';
      });
      html += '</select></div>';
      widgetEl.innerHTML = html;

      var select = widgetEl.querySelector('select');
      select.addEventListener('change', function () {
        onLanguageChange(select.value);
        var active = languages.find(function (l) { return l.code === select.value; });
        var flagEl = widgetEl.querySelector('.kiban-flag');
        if (flagEl && active) flagEl.textContent = flagEmoji(active.flag || active.code);
      });
    }

    document.body.appendChild(widgetEl);
  }

  // ── Initialize ──
  function init() {
    fetchWidgetConfig(function (err, widgetData) {
      if (!err && widgetData) {
        config.position = widgetData.position || config.position;
        config.style = widgetData.style || config.style;
      }

      fetchLanguages(function (err, langData) {
        if (err || !langData) return;

        defaultLang = langData.default || 'pt';
        languages = langData.available || [];

        if (!currentLang) currentLang = defaultLang;

        renderWidget();
      });
    });
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ──
  window.KibanI18n = {
    getLanguage: function () { return currentLang || defaultLang; },
    setLanguage: function (code) { onLanguageChange(code); },
    getLanguages: function () { return languages; },
  };
})();
