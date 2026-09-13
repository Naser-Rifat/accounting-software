/* ==========================================================================
   Chamber of Rezaul Karim - shared site behaviour
   No dependencies. Every widget is optional: the script only wires up what
   the current page actually contains.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    // force reflow so the transition replays on rapid successive calls
    void toastEl.offsetWidth;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-shown'); }, 3200);
  }
  window.siteToast = toast;

  /* ------------------------------------------------------------------ */
  /* Language switching (EN is authored in the HTML, BN comes from a map) */
  /* ------------------------------------------------------------------ */
  var LANG_KEY = 'crk.lang';
  var ATTRS = [
    { attr: 'data-i18n',       apply: function (el, v) { el.textContent = v; } },
    { attr: 'data-i18n-html',  apply: function (el, v) { el.innerHTML = v; } },
    { attr: 'data-i18n-ph',    apply: function (el, v) { el.setAttribute('placeholder', v); } },
    { attr: 'data-i18n-aria',  apply: function (el, v) { el.setAttribute('aria-label', v); } },
    { attr: 'data-i18n-alt',   apply: function (el, v) { el.setAttribute('alt', v); } },
    { attr: 'data-i18n-title', apply: function (el, v) { el.setAttribute('title', v); } }
  ];

  function cacheEnglish() {
    ATTRS.forEach(function (spec) {
      $$('[' + spec.attr + ']').forEach(function (el) {
        var store = '__en_' + spec.attr;
        if (el[store] === undefined) {
          if (spec.attr === 'data-i18n') el[store] = el.textContent;
          else if (spec.attr === 'data-i18n-html') el[store] = el.innerHTML;
          else if (spec.attr === 'data-i18n-ph') el[store] = el.getAttribute('placeholder') || '';
          else if (spec.attr === 'data-i18n-aria') el[store] = el.getAttribute('aria-label') || '';
          else if (spec.attr === 'data-i18n-alt') el[store] = el.getAttribute('alt') || '';
          else el[store] = el.getAttribute('title') || '';
        }
      });
    });
  }

  function applyLang(lang, opts) {
    var dict = (window.BN_STRINGS || {});
    cacheEnglish();

    ATTRS.forEach(function (spec) {
      $$('[' + spec.attr + ']').forEach(function (el) {
        var key = el.getAttribute(spec.attr);
        var store = '__en_' + spec.attr;
        var value = (lang === 'bn' && dict[key] !== undefined) ? dict[key] : el[store];
        if (value !== undefined && value !== null) spec.apply(el, value);
      });
    });

    document.documentElement.setAttribute('lang', lang === 'bn' ? 'bn' : 'en');
    document.body.classList.toggle('lang-bn', lang === 'bn');
    $$('.lang-toggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* private mode */ }
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
    if (opts && opts.announce) {
      toast(lang === 'bn' ? 'ভাষা পরিবর্তন করা হয়েছে - বাংলা' : 'Language switched to English');
    }
  }
  window.applyLang = applyLang;
  window.currentLang = function () {
    return document.body.classList.contains('lang-bn') ? 'bn' : 'en';
  };

  function initLang() {
    var saved = 'en';
    try { saved = localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { /* ignore */ }
    cacheEnglish();
    if (saved === 'bn') applyLang('bn');
    else applyLang('en');

    $$('.lang-toggle button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.lang === window.currentLang()) return;
        applyLang(btn.dataset.lang, { announce: true });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Header + mobile navigation                                          */
  /* ------------------------------------------------------------------ */
  function initHeader() {
    var header = $('.site-header');
    if (header) {
      var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 8); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    var toggle = $('.nav-toggle');
    var scrim = $('.nav-scrim');
    var menu = $('.nav-links');
    if (!toggle || !menu) return;

    // Stowed = display:none on small screens, so the closed off-canvas panel
    // cannot create horizontal scroll. It is un-stowed a frame before opening
    // and re-stowed once the closing slide has finished.
    menu.classList.add('is-stowed');

    function setOpen(open) {
      if (open) {
        menu.classList.remove('is-stowed');
        void menu.offsetWidth; // reflow, so the slide-in actually animates
      }
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }

    menu.addEventListener('transitionend', function (e) {
      if (e.propertyName === 'transform' && !document.body.classList.contains('nav-open')) {
        menu.classList.add('is-stowed');
      }
    });
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
    $$('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Scroll reveal                                                       */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ */
  /* Animated counters                                                   */
  /* ------------------------------------------------------------------ */
  function formatNum(n, lang) {
    var s = String(n);
    if (lang === 'bn') {
      var bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
      s = s.replace(/[0-9]/g, function (d) { return bn[+d]; });
    }
    return s;
  }

  function initCounters() {
    var nodes = $$('[data-count]');
    if (!nodes.length) return;

    function run(el) {
      var target = parseInt(el.dataset.count, 10) || 0;
      var dur = 1400, start = null;
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = Math.round(target * eased);
        el.textContent = formatNum(val, window.currentLang());
        el.dataset.current = val;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (el) { io.observe(el); });

    // re-render digits in the active script when the language flips
    document.addEventListener('langchange', function (e) {
      nodes.forEach(function (el) {
        var v = el.dataset.current !== undefined ? el.dataset.current : el.dataset.count;
        el.textContent = formatNum(v, e.detail.lang);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Accordion                                                           */
  /* ------------------------------------------------------------------ */
  function initAccordions() {
    $$('.accordion').forEach(function (acc) {
      var single = acc.dataset.single === 'true';
      $$('.acc-trigger', acc).forEach(function (trigger) {
        trigger.addEventListener('click', function () {
          var item = trigger.closest('.acc-item');
          var open = trigger.getAttribute('aria-expanded') === 'true';
          if (single && !open) {
            $$('.acc-item.is-open', acc).forEach(function (other) {
              other.classList.remove('is-open');
              $('.acc-trigger', other).setAttribute('aria-expanded', 'false');
            });
          }
          item.classList.toggle('is-open', !open);
          trigger.setAttribute('aria-expanded', String(!open));
        });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Testimonial slider                                                  */
  /* ------------------------------------------------------------------ */
  function initSliders() {
    $$('.tslider').forEach(function (slider) {
      var track = $('.tslider-track', slider);
      var slides = $$('.tslide', slider);
      var dotsWrap = $('.tslider-dots', slider);
      var prev = $('[data-slider="prev"]', slider);
      var next = $('[data-slider="next"]', slider);
      if (!track || slides.length < 2) return;

      var index = 0, timer = null;

      slides.forEach(function (s, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
        dot.addEventListener('click', function () { go(i, true); });
        if (dotsWrap) dotsWrap.appendChild(dot);
      });

      function go(i, stop) {
        index = (i + slides.length) % slides.length;
        track.style.transform = 'translateX(' + (-index * 100) + '%)';
        slides.forEach(function (s, n) { s.setAttribute('aria-hidden', String(n !== index)); });
        if (dotsWrap) {
          $$('button', dotsWrap).forEach(function (d, n) {
            d.setAttribute('aria-selected', String(n === index));
          });
        }
        if (stop) clearInterval(timer);
      }

      if (prev) prev.addEventListener('click', function () { go(index - 1, true); });
      if (next) next.addEventListener('click', function () { go(index + 1, true); });

      slider.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') go(index - 1, true);
        if (e.key === 'ArrowRight') go(index + 1, true);
      });

      // touch swipe
      var startX = null;
      slider.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
      slider.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1), true);
        startX = null;
      });

      go(0);
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) {
        timer = setInterval(function () { go(index + 1); }, 7000);
        slider.addEventListener('mouseenter', function () { clearInterval(timer); });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Practice-area filter                                                */
  /* ------------------------------------------------------------------ */
  function initFilter() {
    var bar = $('.filter-bar');
    if (!bar) return;
    var cards = $$('.pa-card');
    var empty = $('.empty-state');

    $$('button', bar).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = btn.dataset.filter;
        $$('button', bar).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        var shown = 0;
        cards.forEach(function (card) {
          var match = filter === 'all' || (card.dataset.tags || '').split(' ').indexOf(filter) !== -1;
          card.classList.toggle('is-hidden', !match);
          if (match) shown++;
        });
        if (empty) empty.classList.toggle('is-shown', shown === 0);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tabbed panels (contact page offices)                                */
  /* ------------------------------------------------------------------ */
  function initTabs() {
    $$('[data-tabs]').forEach(function (group) {
      var tabs = $$('[role="tab"]', group);
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (t) {
            var on = t === tab;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
            var panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) panel.hidden = !on;
          });
        });
        tab.addEventListener('keydown', function (e) {
          var i = tabs.indexOf(tab);
          if (e.key === 'ArrowRight') { tabs[(i + 1) % tabs.length].focus(); tabs[(i + 1) % tabs.length].click(); }
          if (e.key === 'ArrowLeft')  { tabs[(i - 1 + tabs.length) % tabs.length].focus(); tabs[(i - 1 + tabs.length) % tabs.length].click(); }
        });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Chamber hours: highlight today + live open/closed badge             */
  /* Hours are Asia/Dhaka; Sun-Thu 10:00-18:00, Sat 10:00-14:00, Fri off */
  /* ------------------------------------------------------------------ */
  var HOURS = { 0: [10, 18], 1: [10, 18], 2: [10, 18], 3: [10, 18], 4: [10, 18], 5: null, 6: [10, 14] };

  function dhakaNow() {
    // Bangladesh Standard Time is a fixed UTC+6 (no daylight saving).
    var now = new Date();
    return new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (6 * 3600000));
  }

  function initHours() {
    // a page may show the badge more than once (top bar and hours table)
    var pills = $$('[data-open-status]');
    var rows = $$('[data-day]');
    if (!pills.length && !rows.length) return;

    var d = dhakaNow();
    var day = d.getDay();
    var mins = d.getHours() * 60 + d.getMinutes();

    rows.forEach(function (row) {
      row.classList.toggle('is-today', Number(row.dataset.day) === day);
    });

    if (!pills.length) return;
    var span = HOURS[day];
    var open = !!span && mins >= span[0] * 60 && mins < span[1] * 60;

    function paint() {
      var bn = window.currentLang() === 'bn';
      var label = open
        ? (bn ? 'এখন চেম্বার খোলা' : 'Chamber open now')
        : (bn ? 'এখন বন্ধ — বার্তা পাঠান' : 'Closed now — leave a message');
      pills.forEach(function (pill) {
        pill.className = 'pill ' + (open ? 'pill--open' : 'pill--closed');
        pill.innerHTML = '<span class="dot"></span><span></span>';
        pill.lastChild.textContent = label;
      });
    }
    paint();
    document.addEventListener('langchange', paint);
  }

  /* ------------------------------------------------------------------ */
  /* Back-to-top                                                         */
  /* ------------------------------------------------------------------ */
  function initBackToTop() {
    var fab = $('.fab--top');
    if (!fab) return;
    var onScroll = function () { fab.classList.toggle('is-shown', window.scrollY > 520); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    fab.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Misc                                                                */
  /* ------------------------------------------------------------------ */
  /* No photograph supplied yet? Drop the broken <img> so the monogram plate
     underneath shows instead of a broken-image icon. */
  function initPortraits() {
    $$('.portrait-photo').forEach(function (img) {
      img.addEventListener('error', function () { img.remove(); });
      if (img.complete && img.naturalWidth === 0) img.remove();
    });
  }

  function initYear() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  function initCopyButtons() {
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.dataset.copy);
        var text = target ? target.textContent.trim() : '';
        var done = function () {
          toast(window.currentLang() === 'bn' ? 'কপি হয়েছে' : 'Copied to clipboard');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
        } else {
          fallback(text, done);
        }
      });
    });
    function fallback(text, done) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }
  }

  /* keep the custom radio/checkbox chrome in sync (no :has() needed) */
  function initChoices() {
    function sync(input) {
      var form = input.form || document;
      if (input.type === 'radio' && input.name) {
        $$('input[name="' + input.name + '"]', form).forEach(function (r) {
          var lbl = r.closest('.choice');
          if (lbl) lbl.classList.toggle('is-checked', r.checked);
        });
      } else {
        var lbl = input.closest('.choice');
        if (lbl) lbl.classList.toggle('is-checked', input.checked);
      }
    }
    $$('.choice input').forEach(function (input) {
      sync(input);
      input.addEventListener('change', function () { sync(input); });
    });
  }

  /* ------------------------------------------------------------------ */
  function init() {
    initLang();
    initHeader();
    initReveal();
    initCounters();
    initAccordions();
    initSliders();
    initFilter();
    initTabs();
    initHours();
    initBackToTop();
    initPortraits();
    initYear();
    initCopyButtons();
    initChoices();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
