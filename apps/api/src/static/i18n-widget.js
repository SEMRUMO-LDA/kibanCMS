/**
 * kibanCMS i18n Auto-Translation Widget
 *
 * Drop-in script that automatically translates any website.
 * Works like WPML/TranslatePress — no code changes needed.
 *
 * Embed: <script src="https://your-cms.com/api/v1/i18n/widget.js" data-api-key="YOUR_KEY"></script>
 *
 * Options (data attributes):
 *   data-api-key       — Required. Your kibanCMS API key.
 *   data-position      — Optional. Widget position (bottom-right, bottom-left, top-right, top-left)
 *   data-style         — Optional. Widget style (dropdown, flags, minimal)
 */
(function () {
  'use strict';

  // ── Config ──
  var scripts = document.querySelectorAll('script[data-api-key]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var API_KEY = scriptTag.getAttribute('data-api-key');
  if (!API_KEY) return;

  var BASE_URL = scriptTag.src.replace('/api/v1/i18n/widget.js', '');
  var POSITION_OVERRIDE = scriptTag.getAttribute('data-position');
  var STYLE_OVERRIDE = scriptTag.getAttribute('data-style');

  // ── State ──
  var languages = [];
  var defaultLang = 'pt';
  var currentLang = getCookie('kiban-lang') || getUrlParam('lang') || null;
  var config = { position: 'bottom-right', style: 'minimal' };
  var originalTexts = new Map(); // node → original text
  var translationCache = {};    // loaded from localStorage
  var isTranslating = false;

  // ── Helpers ──
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;max-age=31536000;SameSite=Lax';
  }

  function getUrlParam(name) {
    return new URL(window.location.href).searchParams.get(name);
  }

  function getCacheKey(lang) {
    return 'kiban-i18n-' + lang + '-' + location.pathname;
  }

  function loadCache(lang) {
    try {
      var raw = localStorage.getItem(getCacheKey(lang));
      if (!raw) return null;
      var data = JSON.parse(raw);
      // Cache valid for 24h
      if (Date.now() - data.ts > 86400000) return null;
      return data.map;
    } catch (e) { return null; }
  }

  function saveCache(lang, map) {
    try {
      localStorage.setItem(getCacheKey(lang), JSON.stringify({ map: map, ts: Date.now() }));
    } catch (e) { /* quota */ }
  }

  // ── DOM Text Extraction ──
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, IFRAME: 1, SVG: 1, CODE: 1, PRE: 1, CANVAS: 1 };
  var MIN_LENGTH = 2;

  function getTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var text = node.textContent.trim();
        if (!text || text.length < MIN_LENGTH) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS[node.parentElement.tagName]) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest('#kiban-i18n-widget')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.isContentEditable) return NodeFilter.FILTER_REJECT;
        // Skip if looks like code/data
        if (/^[\d\s.,;:!?@#$%^&*()\-+=<>{}[\]|/\\]+$/.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function getTranslatableAttrs(root) {
    var results = [];
    var els = root.querySelectorAll('[placeholder],[title],[alt]');
    els.forEach(function (el) {
      if (el.closest('#kiban-i18n-widget')) return;
      ['placeholder', 'title', 'alt'].forEach(function (attr) {
        var val = el.getAttribute(attr);
        if (val && val.trim().length >= MIN_LENGTH) {
          results.push({ el: el, attr: attr, text: val.trim() });
        }
      });
    });
    return results;
  }

  // ── Translation Engine ──
  function translatePage(targetLang) {
    if (isTranslating) return;
    if (targetLang === defaultLang) {
      restoreOriginals();
      return;
    }

    // Collect all translatable text
    var textNodes = getTextNodes(document.body);
    var attrItems = getTranslatableAttrs(document.body);

    // Store originals (only first time)
    textNodes.forEach(function (node) {
      if (!originalTexts.has(node)) originalTexts.set(node, node.textContent);
    });
    attrItems.forEach(function (item) {
      var key = item.el.tagName + '|' + item.attr;
      if (!originalTexts.has(key)) originalTexts.set(key, { el: item.el, attr: item.attr, text: item.text });
    });

    // Collect unique strings
    var allTexts = [];
    var textMap = {}; // original → indices to update

    textNodes.forEach(function (node) {
      var orig = originalTexts.get(node) || node.textContent;
      var trimmed = orig.trim();
      if (!textMap[trimmed]) {
        textMap[trimmed] = { nodeIndices: [], attrIndices: [] };
        allTexts.push(trimmed);
      }
      textMap[trimmed].nodeIndices.push(node);
    });

    attrItems.forEach(function (item) {
      var orig = item.text;
      if (!textMap[orig]) {
        textMap[orig] = { nodeIndices: [], attrIndices: [] };
        allTexts.push(orig);
      }
      textMap[orig].attrIndices.push(item);
    });

    if (allTexts.length === 0) return;

    // Check cache first
    var cached = loadCache(targetLang);
    if (cached) {
      applyTranslations(allTexts, cached, textMap);
      return;
    }

    // Fetch translations from API
    isTranslating = true;

    // Batch in chunks of 200
    var BATCH = 200;
    var allTranslated = {};
    var batches = [];
    for (var i = 0; i < allTexts.length; i += BATCH) {
      batches.push(allTexts.slice(i, i + BATCH));
    }

    var completed = 0;
    batches.forEach(function (batch) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', BASE_URL + '/api/v1/i18n/translate-text');
      xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var json = JSON.parse(xhr.responseText);
            var translations = json.data.translations;
            for (var j = 0; j < batch.length; j++) {
              allTranslated[batch[j]] = translations[j];
            }
          } catch (e) { /* parse error */ }
        }
        completed++;
        if (completed === batches.length) {
          isTranslating = false;
          saveCache(targetLang, allTranslated);
          applyTranslations(allTexts, allTranslated, textMap);
        }
      };
      xhr.onerror = function () {
        completed++;
        if (completed === batches.length) isTranslating = false;
      };
      xhr.send(JSON.stringify({ texts: batch, target_lang: targetLang }));
    });
  }

  function applyTranslations(allTexts, translationMap, textMap) {
    allTexts.forEach(function (orig) {
      var translated = translationMap[orig];
      if (!translated) return;
      var entry = textMap[orig];
      if (entry.nodeIndices) {
        entry.nodeIndices.forEach(function (node) {
          // Preserve leading/trailing whitespace from original
          var origFull = originalTexts.get(node) || orig;
          var leadSpace = origFull.match(/^\s*/)[0];
          var trailSpace = origFull.match(/\s*$/)[0];
          node.textContent = leadSpace + translated + trailSpace;
        });
      }
      if (entry.attrIndices) {
        entry.attrIndices.forEach(function (item) {
          item.el.setAttribute(item.attr, translated);
        });
      }
    });
    document.documentElement.lang = currentLang || defaultLang;
  }

  function restoreOriginals() {
    originalTexts.forEach(function (value, key) {
      if (key instanceof Node) {
        key.textContent = value;
      } else if (value && value.el) {
        value.el.setAttribute(value.attr, value.text);
      }
    });
    document.documentElement.lang = defaultLang;
  }

  // ── Language Change Handler ──
  function onLanguageChange(langCode) {
    if (langCode === currentLang) return;
    currentLang = langCode;
    setCookie('kiban-lang', langCode);

    var newUrl = new URL(window.location.href);
    if (langCode === defaultLang) {
      newUrl.searchParams.delete('lang');
    } else {
      newUrl.searchParams.set('lang', langCode);
    }
    window.history.replaceState(null, '', newUrl.toString());

    // Dispatch event for SPA frameworks
    window.dispatchEvent(new CustomEvent('kiban-lang-change', { detail: { lang: langCode } }));

    translatePage(langCode);
    updateWidgetDisplay();
  }

  // ── API Fetchers ──
  function fetchJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + API_KEY);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
      } else { callback(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    xhr.send();
  }

  // ── Widget Rendering ──
  var widgetEl = null;

  function updateWidgetDisplay() {
    if (!widgetEl) return;
    var circleEl = widgetEl.querySelector('.kiban-circle');
    if (circleEl) circleEl.textContent = (currentLang || defaultLang).toUpperCase();

    var select = widgetEl.querySelector('select');
    if (select) select.value = currentLang || defaultLang;
  }

  function renderWidget() {
    if (languages.length < 2) return;

    var pos = POSITION_OVERRIDE || config.position || 'bottom-right';
    var style = STYLE_OVERRIDE || config.style || 'minimal';

    widgetEl = document.createElement('div');
    widgetEl.id = 'kiban-i18n-widget';

    var posStyles = {
      'bottom-right': 'bottom:20px;right:20px;',
      'bottom-left': 'bottom:20px;left:20px;',
      'top-right': 'top:20px;right:20px;',
      'top-left': 'top:20px;left:20px;',
    };

    widgetEl.style.cssText = 'position:fixed;z-index:99999;' + (posStyles[pos] || posStyles['bottom-right']);

    if (style === 'minimal') {
      renderMinimalWidget();
    } else if (style === 'flags') {
      renderFlagsWidget();
    } else {
      renderDropdownWidget();
    }

    document.body.appendChild(widgetEl);
  }

  function renderMinimalWidget() {
    var isExpanded = false;
    var glass = 'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.15),inset 0 0 0 1px rgba(255,255,255,0.15);' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;letter-spacing:0.06em;' +
      'cursor:pointer;';

    var circleEl = document.createElement('div');
    circleEl.className = 'kiban-circle';
    circleEl.style.cssText = glass +
      'background:rgba(255,255,255,0.12);' +
      'width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'color:#fff;text-transform:uppercase;font-weight:600;font-size:11px;' +
      'transition:opacity 0.3s ease,transform 0.3s ease;';
    circleEl.textContent = (currentLang || defaultLang).toUpperCase();

    var pillEl = document.createElement('div');
    pillEl.className = 'kiban-pill';
    pillEl.style.cssText = glass +
      'background:rgba(255,255,255,0.12);' +
      'display:none;align-items:center;gap:2px;padding:4px;border-radius:999px;';

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

    widgetEl.appendChild(circleEl);
    widgetEl.appendChild(pillEl);

    function toggle() {
      isExpanded = !isExpanded;
      if (isExpanded) {
        circleEl.style.display = 'none';
        pillEl.style.display = 'flex';
      } else {
        circleEl.style.display = 'flex';
        pillEl.style.display = 'none';
      }
    }

    circleEl.addEventListener('click', toggle);

    pillEl.querySelectorAll('a[data-lang]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        onLanguageChange(a.getAttribute('data-lang'));
        pillEl.querySelectorAll('a[data-lang]').forEach(function (link) {
          var active = link.getAttribute('data-lang') === currentLang;
          link.style.color = active ? '#fff' : 'rgba(255,255,255,0.5)';
          link.style.background = active ? 'rgba(255,255,255,0.18)' : 'transparent';
        });
        setTimeout(toggle, 200);
      });
    });

    document.addEventListener('click', function (e) {
      if (isExpanded && !widgetEl.contains(e.target)) toggle();
    });
  }

  function renderFlagsWidget() {
    var html = '<div style="display:flex;gap:6px;background:#fff;padding:8px 12px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.08);">';
    languages.forEach(function (lang) {
      var isActive = lang.code === (currentLang || defaultLang);
      html += '<button data-lang="' + lang.code + '" style="background:none;border:' + (isActive ? '2px solid #06b6d4' : '2px solid transparent') + ';border-radius:8px;padding:4px 8px;cursor:pointer;font-size:20px;line-height:1;transition:all 0.15s;opacity:' + (isActive ? '1' : '0.6') + ';" title="' + lang.name + '">' + flagEmoji(lang.flag || lang.code) + '</button>';
    });
    html += '</div>';
    widgetEl.innerHTML = html;

    widgetEl.querySelectorAll('button[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        onLanguageChange(btn.getAttribute('data-lang'));
        widgetEl.querySelectorAll('button[data-lang]').forEach(function (b) {
          var active = b.getAttribute('data-lang') === currentLang;
          b.style.borderColor = active ? '#06b6d4' : 'transparent';
          b.style.opacity = active ? '1' : '0.6';
        });
      });
    });
  }

  function renderDropdownWidget() {
    var activeLang = languages.find(function (l) { return l.code === (currentLang || defaultLang); }) || languages[0];
    var html = '<div style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 14px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid rgba(0,0,0,0.08);font-family:-apple-system,sans-serif;">';
    html += '<span class="kiban-flag" style="font-size:20px;line-height:1;">' + flagEmoji(activeLang.flag || activeLang.code) + '</span>';
    html += '<select style="background:none;border:none;font-size:14px;font-weight:500;color:#171717;cursor:pointer;outline:none;padding:0;font-family:inherit;-webkit-appearance:none;appearance:none;padding-right:16px;">';
    languages.forEach(function (lang) {
      html += '<option value="' + lang.code + '"' + (lang.code === (currentLang || defaultLang) ? ' selected' : '') + '>' + lang.name + '</option>';
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

  function flagEmoji(code) {
    var map = {
      pt: '\uD83C\uDDF5\uD83C\uDDF9', gb: '\uD83C\uDDEC\uD83C\uDDE7',
      es: '\uD83C\uDDEA\uD83C\uDDF8', fr: '\uD83C\uDDEB\uD83C\uDDF7',
      de: '\uD83C\uDDE9\uD83C\uDDEA', it: '\uD83C\uDDEE\uD83C\uDDF9',
      nl: '\uD83C\uDDF3\uD83C\uDDF1', ru: '\uD83C\uDDF7\uD83C\uDDFA',
      cn: '\uD83C\uDDE8\uD83C\uDDF3', jp: '\uD83C\uDDEF\uD83C\uDDF5',
      kr: '\uD83C\uDDF0\uD83C\uDDF7', sa: '\uD83C\uDDF8\uD83C\uDDE6',
    };
    return map[code] || '\uD83C\uDFF3\uFE0F';
  }

  // ── Initialize ──
  function init() {
    fetchJSON(BASE_URL + '/api/v1/i18n/widget', function (err, res) {
      if (!err && res && res.data) {
        config.position = res.data.position || config.position;
        config.style = res.data.style || config.style;
      }

      fetchJSON(BASE_URL + '/api/v1/i18n/languages', function (err, res) {
        if (err || !res || !res.data) return;

        defaultLang = res.data.default || 'pt';
        languages = res.data.available || [];
        if (!currentLang) currentLang = defaultLang;

        renderWidget();

        // Auto-translate if not default language
        if (currentLang && currentLang !== defaultLang) {
          translatePage(currentLang);
        }
      });
    });
  }

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
    translatePage: function (lang) { translatePage(lang || currentLang); },
  };
})();
