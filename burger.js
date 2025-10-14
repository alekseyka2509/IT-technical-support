document.addEventListener('DOMContentLoaded', function() {
  // Burger menu toggle (IDs used in HTML)
  const burger = document.getElementById('burger');
  const menu = document.getElementById('dropdown-menu');
  if (burger && menu) {
    burger.addEventListener('click', function() {
      menu.classList.toggle('open');
    });
  }

  // Update menu based on auth state
  (async function updateMenuAuthState() {
    const menuEl = document.getElementById('dropdown-menu');
    if (!menuEl) return;
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const profileLink = document.createElement('a');
        profileLink.href = 'profile.html';
        profileLink.innerHTML = '<button class="btn primary">Личный кабинет</button>';

        // Remove login/register buttons if present
        const loginBtnLink = Array.from(menuEl.querySelectorAll('a')).find(a => a.getAttribute('href') === 'login.html');
        const registerBtnLink = Array.from(menuEl.querySelectorAll('a')).find(a => a.getAttribute('href') === 'register.html');
        if (loginBtnLink) loginBtnLink.remove();
        if (registerBtnLink) registerBtnLink.remove();

        // Avoid duplicates
        const existingProfile = Array.from(menuEl.querySelectorAll('a')).find(a => a.getAttribute('href') === 'profile.html');
        if (!existingProfile) {
          // Insert a separator if last element before was not an <hr>
          const lastHr = menuEl.querySelector('hr');
          if (!lastHr) {
            const hr = document.createElement('hr');
            menuEl.appendChild(hr);
          }
          menuEl.appendChild(profileLink);
        }
      }
    } catch (_) {
      // ignore
    }
  })();

  // LOGIN
  if (document.title.toLowerCase().includes('login')) {
    const loginForm = document.querySelector('form.review-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const payload = Object.fromEntries(formData.entries());
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          window.location.href = 'profile.html';
        } else {
          alert('Неверный логин или пароль');
        }
      });
    }
  }

  // REGISTER
  if (document.title.toLowerCase().includes('register')) {
    const registerForm = document.querySelector('form.review-form');
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(registerForm);
        const payload = Object.fromEntries(formData.entries());
        if (payload['pass'] !== payload['double-pass']) {
          alert('Пароли не совпадают');
          return;
        }
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ FIO: payload.FIO, email: payload.email, pass: payload.pass })
        });
        if (res.ok) {
          window.location.href = 'profile.html';
        } else if (res.status === 409) {
          alert('Пользователь с таким Email уже существует');
        } else {
          alert('Ошибка регистрации');
        }
      });
    }
  }

  // REVIEWS: submit + initial load
  const reviewsList = document.querySelector('.reviews-list');
  const reviewForm = document.querySelector('form.review-form');
  const titleEl = document.querySelector('h2');
  const isReviewPage = titleEl && titleEl.textContent && titleEl.textContent.toLowerCase().includes('отзыв');

  async function loadReviews() {
    if (!reviewsList) return;
    const res = await fetch('/api/reviews');
    if (!res.ok) return;
    const data = await res.json();
    reviewsList.innerHTML = '';
    data.reviews.forEach(r => {
      const item = document.createElement('div');
      item.className = 'review-item';
      const stars = '★'.repeat(r.rating);
      item.innerHTML = `
        <p class="review-text">${r.message}</p>
        <p class="review-author"><strong>${r.name}</strong>${r.company ? ', ' + r.company : ''}</p>
        <div class="review-stars">${stars}</div>
      `;
      reviewsList.appendChild(item);
    });
  }

  if (isReviewPage && reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(reviewForm);
      const payload = Object.fromEntries(formData.entries());
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Отзыв отправлен');
        reviewForm.reset();
        loadReviews();
      } else {
        alert('Ошибка отправки отзыва');
      }
    });
    loadReviews();
  }

  // CALLBACKS
  const callbackForm = document.getElementById('callbackForm');
  if (callbackForm) {
    callbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(callbackForm);
      const payload = Object.fromEntries(formData.entries());
      const res = await fetch('/api/callbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Заявка отправлена');
        callbackForm.reset();
      } else {
        alert('Ошибка отправки заявки');
      }
    });
  }

  // PROFILE: fetch current user and guard route
  if (location.pathname.endsWith('profile.html')) {
    (async function() {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const { user } = await meRes.json();
        if (user) {
          const fioEl = document.getElementById('fio');
          const emailEl = document.getElementById('email');
          const planEl = document.getElementById('plan');
          const dateEl = document.getElementById('date');
          const phoneEl = document.getElementById('phone');
          const cityEl = document.getElementById('city');
          if (fioEl) fioEl.textContent = user.full_name || '';
          if (emailEl) emailEl.textContent = user.email || '';
          if (planEl) planEl.textContent = user.plan || '';
          if (dateEl) dateEl.textContent = (user.created_at || '').slice(0, 10);
          if (phoneEl) phoneEl.textContent = user.phone || '';
          if (cityEl) cityEl.textContent = user.city || '';
        }
      } else {
        window.location.href = 'login.html';
      }
    })();
  }
});
