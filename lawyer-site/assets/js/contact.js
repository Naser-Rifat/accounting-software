/* ==========================================================================
   Contact page - short enquiry form (client-side validation only)
   ========================================================================== */
(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form) return;

  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var t  = function (en, bn) { return (window.currentLang && window.currentLang() === 'bn') ? bn : en; };

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RE_PHONE = /^(?:\+?\d[\d\s-]{7,17})$/;

  var RULES = {
    cname:    function (v) { return v.trim().length >= 3; },
    cphone:   function (v) { return RE_PHONE.test(v.trim()) && v.replace(/\D/g, '').length >= 8; },
    cemail:   function (v) { return RE_EMAIL.test(v.trim()); },
    csubject: function (v) { return v !== ''; },
    cmessage: function (v) { return v.trim().length >= 20; }
  };

  function check(el) {
    var rule = RULES[el.name];
    if (!rule) return true;
    var ok = rule(el.value);
    var field = el.closest('.field');
    if (field) field.classList.toggle('is-invalid', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  $$('input, select, textarea', form).forEach(function (el) {
    var ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, function () {
      var field = el.closest('.field');
      if (field && field.classList.contains('is-invalid')) check(el);
    });
    el.addEventListener('blur', function () { if (el.value) check(el); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var ok = true, firstBad = null;
    $$('input, select, textarea', form).forEach(function (el) {
      if (!check(el)) { ok = false; if (!firstBad) firstBad = el; }
    });

    if (!ok) {
      firstBad.focus({ preventScroll: true });
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (window.siteToast) {
        window.siteToast(t('Please check the highlighted fields.', 'চিহ্নিত ঘরগুলো একবার দেখে নিন।'));
      }
      return;
    }

    var btn = document.getElementById('contact-submit');
    var label = btn.querySelector('span');
    var original = label.textContent;
    btn.disabled = true;
    label.textContent = t('Sending…', 'পাঠানো হচ্ছে…');

    // Demo: stands in for the POST the live site makes.
    setTimeout(function () {
      form.hidden = true;
      document.getElementById('contact-success').hidden = false;
      btn.disabled = false;
      label.textContent = original;
      if (window.siteToast) {
        window.siteToast(t('Message sent to the chamber.', 'চেম্বারে বার্তা পাঠানো হয়েছে।'));
      }
    }, 800);
  });

  var again = document.getElementById('contact-again');
  if (again) {
    again.addEventListener('click', function () {
      form.reset();
      $$('.is-invalid', form).forEach(function (n) { n.classList.remove('is-invalid'); });
      document.getElementById('contact-success').hidden = true;
      form.hidden = false;
      form.querySelector('input').focus();
    });
  }
})();
