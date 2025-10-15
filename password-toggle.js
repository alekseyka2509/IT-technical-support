(function() {
  function createToggleButton(input) {
    if (input.__pw_toggle_bound) return;
    input.__pw_toggle_bound = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Показать пароль');
    btn.textContent = 'Показать';
    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      try { input.type = isPassword ? 'text' : 'password'; } catch (_) {}
      btn.textContent = isPassword ? 'Скрыть' : 'Показать';
      btn.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
      input.focus();
    });
    // Place button right after input
    input.insertAdjacentElement('afterend', btn);
  }

  function applyToggles(root) {
    root.querySelectorAll('input[type="password"], input[data-password="true"]').forEach(createToggleButton);
  }

  function init() {
    applyToggles(document);
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          applyToggles(node);
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


