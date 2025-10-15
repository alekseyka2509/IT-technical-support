// Lightweight input masks for phone, email validation hint, and city normalization
(function() {
  function setCursorPosition(input, pos) {
    if (input.setSelectionRange) {
      input.focus();
      input.setSelectionRange(pos, pos);
    }
  }

  function formatPhone(value) {
    // Keep digits only; default to Russian format +7 (XXX) XXX-XX-XX
    const digits = value.replace(/\D/g, '');
    let res = '+7 ';
    let i = 0;
    // remove leading 7 or 8 if present
    let d = digits;
    if (d.startsWith('8')) d = d.slice(1);
    if (d.startsWith('7')) d = d.slice(1);
    if (d.length === 0) return '';
    res += '(';
    while (i < d.length && i < 3) res += d[i++];
    if (i >= 3) res += ') ';
    while (i < d.length && i < 6) res += d[i++];
    if (i >= 6) res += '-';
    while (i < d.length && i < 8) res += d[i++];
    if (i >= 8) res += '-';
    while (i < d.length && i < 10) res += d[i++];
    return res;
  }

  function onPhoneInput(e) {
    const input = e.target;
    const start = input.selectionStart || 0;
    const before = input.value;
    input.value = formatPhone(input.value);
    // naive caret restoration near the end
    setCursorPosition(input, Math.min(start + (input.value.length - before.length), input.value.length));
  }

  function validateEmailLike(e) {
    const input = e.target;
    const v = String(input.value).trim();
    if (!v) {
      input.setCustomValidity('');
      return;
    }
    // Basic RFC5322-inspired simple check
    const ok = /^(?:[a-zA-Z0-9_!#$%&'*+\/=?`{|}~^.-]+)@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(v);
    input.setCustomValidity(ok ? '' : 'Введите корректный email');
  }

  function normalizeCity(e) {
    const input = e.target;
    // Allow letters (latin/cyrillic), spaces, hyphens; collapse spaces; capitalize first letter of words
    let v = input.value.replace(/[^\p{L} \-]/gu, '');
    v = v.replace(/\s+/g, ' ').trim();
    v = v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    input.value = v;
  }

  function applyMasks(root) {
    // Phone
    root.querySelectorAll('input[type="tel"], input[data-mask="phone"], input[name*="phone" i]')
      .forEach(el => {
        if (el.__mask_phone_bound) return;
        el.__mask_phone_bound = true;
        el.placeholder = el.placeholder || '+7 (___) ___-__-__';
        el.addEventListener('input', onPhoneInput);
        el.addEventListener('focus', onPhoneInput);
        // initialize only if there is a value already
        if (el.value) el.value = formatPhone(String(el.value));
      });

    // Email
    root.querySelectorAll('input[type="email"], input[data-mask="email"], input[name="email" i]')
      .forEach(el => {
        if (el.__mask_email_bound) return;
        el.__mask_email_bound = true;
        if (!el.type || el.type.toLowerCase() !== 'email') {
          try { el.type = 'email'; } catch (_) {}
        }
        el.addEventListener('input', validateEmailLike);
        el.addEventListener('blur', validateEmailLike);
      });

    // City
    root.querySelectorAll('input[data-mask="city"], input[name="city" i]')
      .forEach(el => {
        if (el.__mask_city_bound) return;
        el.__mask_city_bound = true;
        el.addEventListener('blur', normalizeCity);
      });
  }

  function init() {
    applyMasks(document);
    // Observe for dynamically added inputs (e.g., admin page rendering)
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          applyMasks(node);
        });
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


