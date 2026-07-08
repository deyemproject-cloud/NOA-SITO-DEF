/* ============================================================
   NOA — script condiviso (isola dinamica, menu mobile, reveal,
   scroll-spy). Le pagine aggiungono i loro script specifici.
   ============================================================ */
(() => {
  /* ---------- Dynamic island: shrink + hide on scroll-down ---------- */
  const island = document.getElementById('island');
  if (island) {
    // quando l'isola si nasconde, la barra categorie (se presente) sale al suo posto
    const catNav = document.querySelector('.cat-nav');
    const setHidden = h => {
      island.classList.toggle('hidden-up', h);
      if (catNav) catNav.classList.toggle('raised', h);
    };
    let lastY = 0;
    addEventListener('scroll', () => {
      const y = scrollY;
      island.classList.toggle('shrunk', y > 60);
      if (y > 420 && y > lastY + 6) setHidden(true);
      else if (y < lastY - 4 || y < 420) setHidden(false);
      lastY = y;
    }, { passive: true });
  }

  /* ---------- Menu mobile ---------- */
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
    });
    mobileMenu.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      })
    );
  }

  /* ---------- Scroll-spy: link attivo (isola e nav categorie) ---------- */
  const spyLinks = [...document.querySelectorAll('[data-spy]')];
  const spySections = spyLinks
    .map(a => {
      const href = a.getAttribute('href');
      return href.startsWith('#') ? document.querySelector(href) : null;
    })
    .filter(Boolean);
  if (spySections.length) {
    const spyObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        spyLinks.forEach(a =>
          a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    spySections.forEach(s => spyObs.observe(s));
  }

  /* ---------- Reveal allo scroll ---------- */
  /* threshold 0 + margine: parte appena il primo pixel supera il 92% del
     viewport, così anche i blocchi alti (es. liste del listino) non restano
     invisibili a metà scroll. */
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
    });
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => {
    // già in viewport al caricamento → mostra subito, senza ritardo
    if (el.getBoundingClientRect().top < innerHeight * 0.92) el.classList.add('in');
    else revealObs.observe(el);
  });
})();
