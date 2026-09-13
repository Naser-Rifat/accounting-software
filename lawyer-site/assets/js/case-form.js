/* ==========================================================================
   Case submission - four-step form
   Client-side only: validation, draft autosave, review screen and a
   reference number. No network call is made (see the demo note on the page).
   ========================================================================== */
(function () {
  'use strict';

  var form = document.getElementById('case-form');
  if (!form) return;

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var t  = function (en, bn) { return (window.currentLang && window.currentLang() === 'bn') ? bn : en; };

  var steps        = $$('.form-step', form);
  var stepperItems = $$('#stepper li');
  var reviewList   = document.getElementById('review-list');
  var successPanel = document.getElementById('success-panel');
  var draftStatus  = document.getElementById('draft-status');
  var DRAFT_KEY    = 'crk.caseDraft';
  var current      = 1;

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RE_PHONE = /^(?:\+?\d[\d\s-]{7,17})$/;

  var RULES = {
    fullName:      function (v) { return v.trim().length >= 3; },
    phone:         function (v) { return RE_PHONE.test(v.trim()) && v.replace(/\D/g, '').length >= 8; },
    email:         function (v) { return RE_EMAIL.test(v.trim()); },
    district:      function (v) { return v.trim().length >= 2; },
    area:          function (v) { return v !== ''; },
    summary:       function (v) { return v.trim().length >= 80; },
    outcome:       function (v) { return v.trim().length >= 10; },
    deadline:      function (v) {
      if (!v) return true;
      var d = new Date(v + 'T00:00:00');
      if (isNaN(d.getTime())) return false;
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      return d >= today;
    }
  };

  var REQUIRED_GROUPS = {
    1: ['contactMethod', 'location'],
    2: ['stage'],
    3: []
  };
  REQUIRED_GROUPS[2].push('urgency');

  function container(el) {
    return el.closest('.field') || el.closest('fieldset');
  }

  function setInvalid(el, invalid) {
    var box = container(el);
    if (box) box.classList.toggle('is-invalid', invalid);
    if (el.setAttribute) el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  function validateControl(el) {
    var rule = RULES[el.name];
    if (!rule) return true;
    var ok = rule(el.value);
    setInvalid(el, !ok);
    return ok;
  }

  function validateGroup(name) {
    var inputs = $$('[name="' + name + '"]', form);
    if (!inputs.length) return true;
    var ok = inputs.some(function (i) { return i.checked; });
    var box = inputs[0].closest('fieldset');
    if (box) box.classList.toggle('is-invalid', !ok);
    return ok;
  }

  function validateStep(n) {
    var section = steps[n - 1];
    var ok = true;
    var firstBad = null;

    $$('input, select, textarea', section).forEach(function (el) {
      if (el.type === 'radio' || el.type === 'checkbox') return;
      if (!validateControl(el)) {
        ok = false;
        if (!firstBad) firstBad = el;
      }
    });

    (REQUIRED_GROUPS[n] || []).forEach(function (g) {
      if (!validateGroup(g)) {
        ok = false;
        if (!firstBad) firstBad = $('[name="' + g + '"]', section);
      }
    });

    if (n === 4) {
      var truth = $('[name="consentTruth"]', form);
      var terms = $('[name="consentTerms"]', form);
      var consentOk = truth.checked && terms.checked;
      var fs = truth.closest('fieldset');
      if (fs) fs.classList.toggle('is-invalid', !consentOk);
      if (!consentOk) { ok = false; if (!firstBad) firstBad = truth; }
    }

    if (!ok && firstBad) {
      firstBad.focus({ preventScroll: true });
      var box = container(firstBad) || firstBad;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (window.siteToast) {
        window.siteToast(t('Please check the highlighted fields.', 'চিহ্নিত ঘরগুলো একবার দেখে নিন।'));
      }
    }
    return ok;
  }

  // clear the error as soon as the visitor fixes it
  $$('input, select, textarea', form).forEach(function (el) {
    var ev = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
    el.addEventListener(ev, function () {
      var box = container(el);
      if (box && box.classList.contains('is-invalid')) {
        if (el.type === 'radio' || el.type === 'checkbox') box.classList.remove('is-invalid');
        else validateControl(el);
      }
    });
    if (el.type === 'radio' || el.type === 'checkbox') {
      el.addEventListener('change', function () {
        var box = container(el);
        if (box) box.classList.remove('is-invalid');
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Step navigation                                                     */
  /* ------------------------------------------------------------------ */
  function showStep(n) {
    current = n;
    steps.forEach(function (s, i) { s.classList.toggle('is-active', i === n - 1); });
    stepperItems.forEach(function (li, i) {
      li.classList.toggle('is-current', i === n - 1);
      li.classList.toggle('is-done', i < n - 1);
    });
    if (n === 4) buildReview();
    var card = form.closest('.form-card');
    if (card) {
      var top = card.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  $$('[data-next]', form).forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (validateStep(current)) showStep(Math.min(current + 1, steps.length));
    });
  });
  $$('[data-prev]', form).forEach(function (btn) {
    btn.addEventListener('click', function () { showStep(Math.max(current - 1, 1)); });
  });

  // Enter should advance a step, not submit early
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && current < steps.length) {
      e.preventDefault();
      if (validateStep(current)) showStep(current + 1);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Character counter                                                   */
  /* ------------------------------------------------------------------ */
  $$('[data-counter-for]').forEach(function (counter) {
    var field = document.getElementById(counter.dataset.counterFor);
    if (!field) return;
    var out = $('[data-count-value]', counter);
    var min = 80;
    var update = function () {
      var len = field.value.length;
      out.textContent = len;
      counter.classList.toggle('is-low', len > 0 && len < min);
    };
    field.addEventListener('input', update);
    update();
  });

  /* ------------------------------------------------------------------ */
  /* Review screen                                                       */
  /* ------------------------------------------------------------------ */
  var REVIEW_FIELDS = [
    'fullName', 'phone', 'email', 'district', 'contactMethod', 'location',
    'area', 'stage', 'opposing', 'caseNo', 'urgency', 'deadline',
    'summary', 'timeline', 'outcome', 'documents', 'priorLawyer'
  ];

  function labelFor(name) {
    var el = $('[name="' + name + '"]', form);
    if (!el) return name;
    if (el.type === 'radio' || el.type === 'checkbox') {
      var legend = el.closest('fieldset') ? $('.fieldset-legend', el.closest('fieldset')) : null;
      if (legend) {
        var clone = legend.cloneNode(true);
        $$('.hint, .req', clone).forEach(function (n) { n.remove(); });
        return clone.textContent.replace(/\s+/g, ' ').trim().replace(/[:*]\s*$/, '');
      }
      return name;
    }
    var lab = form.querySelector('label[for="' + el.id + '"]');
    if (lab) {
      var c = lab.cloneNode(true);
      $$('.req', c).forEach(function (n) { n.remove(); });
      return c.textContent.replace(/\s+/g, ' ').trim().replace(/[:*]\s*$/, '');
    }
    return name;
  }

  function displayValue(name) {
    var inputs = $$('[name="' + name + '"]', form);
    if (!inputs.length) return '';
    var first = inputs[0];

    if (first.type === 'radio' || first.type === 'checkbox') {
      var picked = inputs.filter(function (i) { return i.checked; }).map(function (i) {
        var title = $('.choice-title', i.closest('.choice'));
        return title ? title.textContent.trim() : i.value;
      });
      return picked.join(', ');
    }
    if (first.tagName === 'SELECT') {
      var opt = first.options[first.selectedIndex];
      return (first.value === '') ? '' : (opt ? opt.textContent.trim() : first.value);
    }
    if (first.type === 'date' && first.value) {
      var d = new Date(first.value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(window.currentLang() === 'bn' ? 'bn-BD' : 'en-GB',
          { day: 'numeric', month: 'long', year: 'numeric' });
      }
    }
    return first.value.trim();
  }

  function buildReview() {
    if (!reviewList) return;
    reviewList.innerHTML = '';
    REVIEW_FIELDS.forEach(function (name) {
      var value = displayValue(name);
      if (!value) return;
      var li = document.createElement('li');
      var k = document.createElement('span');
      k.className = 'k';
      k.textContent = labelFor(name);
      var v = document.createElement('span');
      v.className = 'v';
      v.textContent = value;
      li.appendChild(k);
      li.appendChild(v);
      reviewList.appendChild(li);
    });
    if (!reviewList.children.length) {
      var li = document.createElement('li');
      li.textContent = t('Nothing filled in yet.', 'এখনও কিছু লেখা হয়নি।');
      reviewList.appendChild(li);
    }
  }

  document.addEventListener('langchange', function () {
    if (current === 4) buildReview();
    if (draftStatus && draftStatus.dataset.saved === '1') markSaved();
  });

  /* ------------------------------------------------------------------ */
  /* Draft autosave                                                      */
  /* ------------------------------------------------------------------ */
  function collect() {
    var data = {};
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') {
        if (!data[el.name]) data[el.name] = [];
        if (el.checked) data[el.name].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
      } else {
        data[el.name] = el.value;
      }
    });
    return data;
  }

  function fill(data) {
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name || !(el.name in data)) return;
      var v = data[el.name];
      if (el.type === 'checkbox') {
        el.checked = Array.isArray(v) && v.indexOf(el.value) !== -1;
      } else if (el.type === 'radio') {
        el.checked = (v === el.value);
      } else {
        el.value = v;
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.tagName === 'TEXTAREA' || el.type === 'text') {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  function markSaved() {
    if (!draftStatus) return;
    draftStatus.dataset.saved = '1';
    var time = new Date().toLocaleTimeString(window.currentLang() === 'bn' ? 'bn-BD' : 'en-GB',
      { hour: '2-digit', minute: '2-digit' });
    draftStatus.textContent = t('Draft saved on this device at ', 'এই ডিভাইসে খসড়া সংরক্ষিত - ') + time;
  }

  // The untouched form is not a draft: selects carry default values, so compare
  // against this snapshot rather than testing for "any non-empty field".
  var PRISTINE = JSON.stringify(collect());

  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var snapshot = JSON.stringify(collect());
      try {
        if (snapshot === PRISTINE) {
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), data: collect() }));
        markSaved();
      } catch (e) { /* storage unavailable - drafts simply do not persist */ }
    }, 700);
  }
  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', scheduleSave);

  // offer to restore an earlier draft
  (function restorePrompt() {
    var notice = document.getElementById('draft-notice');
    var raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return; }
    if (!raw || !notice) return;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { return; }
    if (!saved || !saved.data) return;
    if (JSON.stringify(saved.data) === PRISTINE) {
      // nothing was actually typed - do not nag about an "unfinished draft"
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      return;
    }

    notice.hidden = false;
    document.getElementById('restore-draft').addEventListener('click', function () {
      fill(saved.data);
      notice.hidden = true;
      if (window.siteToast) window.siteToast(t('Draft restored.', 'খসড়া ফিরিয়ে আনা হয়েছে।'));
    });
    document.getElementById('discard-draft').addEventListener('click', function () {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      notice.hidden = true;
    });
  })();

  var clearBtn = document.getElementById('clear-form');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (!window.confirm(t('Clear everything you have written?', 'আপনার লেখা সব মুছে ফেলবেন?'))) return;
      form.reset();
      $$('.is-invalid', form).forEach(function (n) { n.classList.remove('is-invalid'); });
      $$('.choice.is-checked', form).forEach(function (n) { n.classList.remove('is-checked'); });
      $$('[data-counter-for]').forEach(function (c) {
        var out = $('[data-count-value]', c);
        if (out) out.textContent = '0';
        c.classList.remove('is-low');
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      if (draftStatus) {
        delete draftStatus.dataset.saved;
        draftStatus.textContent = t('Your answers are saved on this device as you type.',
          'আপনি লেখার সাথে সাথে উত্তরগুলো এই ডিভাইসে সংরক্ষিত হয়।');
      }
      showStep(1);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Submit                                                              */
  /* ------------------------------------------------------------------ */
  function reference() {
    var year = new Date().getFullYear();
    var n = Math.floor(1000 + Math.random() * 8999);
    return 'RK-' + year + '-' + n;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateStep(4)) return;

    var btn = document.getElementById('submit-btn');
    btn.disabled = true;
    var labelSpan = btn.querySelector('span');
    var original = labelSpan.textContent;
    labelSpan.textContent = t('Sending…', 'পাঠানো হচ্ছে…');

    // Demo: stands in for the POST the live site makes.
    setTimeout(function () {
      var ref = reference();
      document.getElementById('ref-number').textContent = ref;

      // carry the summary across so it stays visible - and printable - after sending
      var copy = document.getElementById('review-copy');
      if (!copy) {
        copy = document.createElement('ul');
        copy.id = 'review-copy';
        copy.className = 'review-list';
        copy.style.textAlign = 'left';
        copy.style.marginTop = '1.8rem';
        successPanel.appendChild(copy);
      }
      copy.innerHTML = reviewList.innerHTML;

      form.hidden = true;
      var stepper = document.getElementById('stepper');
      if (stepper) stepper.hidden = true;
      var notice = document.getElementById('draft-notice');
      if (notice) notice.hidden = true;
      successPanel.hidden = false;
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
      if (draftStatus) {
        delete draftStatus.dataset.saved;
        draftStatus.textContent = t('Submitted. Reference ', 'জমা হয়েছে। রেফারেন্স ') + ref;
      }
      if (clearBtn) clearBtn.hidden = true;
      btn.disabled = false;
      labelSpan.textContent = original;
    }, 900);
  });

  var printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  showStep(1);
})();
