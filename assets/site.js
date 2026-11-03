(() => {
    'use strict';
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('main-nav');
    function closeMenu() {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menu');
        nav.classList.remove('is-open');
        document.body.classList.remove('menu-open');
    }
    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        nav.classList.toggle('is-open', open);
        document.body.classList.toggle('menu-open', open);
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            closeMenu();
            toggle.focus();
        }
    });
    window.matchMedia('(min-width: 981px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        }), { threshold: .05, rootMargin: '0px 0px -18px 0px' });
        document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
        document.body.classList.add('motion-enhanced');
    }
})();
