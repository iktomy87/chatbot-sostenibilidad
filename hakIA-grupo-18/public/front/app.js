/* ============================================================
   AsPym — comportamiento compartido entre páginas
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Menú desplegable ---------- */

  const menuBtn = document.getElementById('menu-toggle');
  const menuPanel = document.getElementById('menu-panel');
  const menuBackdrop = document.getElementById('menu-backdrop');

  if (menuBtn && menuPanel && menuBackdrop) {
    const closeMenu = () => {
      menuPanel.classList.remove('is-open');
      menuBackdrop.classList.remove('is-open');
      menuBtn.classList.remove('is-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      menuPanel.classList.add('is-open');
      menuBackdrop.classList.add('is-open');
      menuBtn.classList.add('is-open');
      menuBtn.setAttribute('aria-expanded', 'true');
    };

    menuBtn.addEventListener('click', () => {
      menuPanel.classList.contains('is-open') ? closeMenu() : openMenu();
    });
    menuBackdrop.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ---------- Formulario de inicio de sesión (simulado) ---------- */
  /* No hay backend conectado todavía: solo valida los campos y      */
  /* muestra el estado de éxito, como referencia para la integración. */

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const successBox = document.getElementById('login-success');
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Ingresando...';
      setTimeout(() => {
        successBox.classList.add('is-visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar sesión';
      }, 700);
    });
  }

  /* ---------- Formulario de contacto (simulado) ---------- */

  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const successBox = document.getElementById('contact-success');
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      setTimeout(() => {
        successBox.classList.add('is-visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar mensaje';
        contactForm.reset();
      }, 700);
    });
  }

});
