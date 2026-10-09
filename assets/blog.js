// Blog pages only need the mobile menu; the homepage's main.js expects homepage sections.
(() => {
  const toggle = document.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
})();
