/* Instalar WorkUco como app (PWA).
   - Registra el service worker (/sw.js), que es lo que pide el navegador para ofrecer "Instalar".
   - Cartel abajo, cada tanto: "Instalar" / "Seguir desde la Web". Si la persona elige seguir en la web,
     no vuelve a aparecer por 7 días; si lo ignora, aparece de nuevo en otra visita (nunca dos veces en la misma).
   - Botones discretos [data-app-install] en la cabecera, el menú del celular y el pie, para quien la quiera bajar.
   - Donde el navegador no tiene el botón de instalar (iPhone, Instagram/Facebook, Firefox), explica cómo hacerlo.
   Ya instalada (abierta como app) no se muestra nada. */
(function () {
  'use strict';
  const LATER_KEY = 'wk-install-later';
  const DONE_KEY = 'wk-installed';
  const SESSION_KEY = 'wk-install-shown';
  const LATER_DAYS = 7;
  const DELAY_MS = 12000;
  /* páginas donde el cartel molestaría (formularios, admin, CV para imprimir) */
  const QUIET_PAGES = ['admin', 'auth', 'reset', 'cv', 'claim', 'claim-place', 'place', 'publish'];

  /* el almacenamiento puede estar bloqueado (modo privado, políticas): se toma dentro del try */
  const area = (session) => (session ? window.sessionStorage : window.localStorage);
  const store = {
    get(k, session = false) { try { return area(session).getItem(k); } catch (_) { return null; } },
    set(k, v, session = false) { try { area(session).setItem(k, v); } catch (_) {} },
  };
  const ua = navigator.userAgent || '';
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|Instagram|Line\/|TikTok|; wv\)/i.test(ua);
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua) || isIOS;
  const isAndroid = /android/i.test(ua);
  /* Chrome, Edge y Samsung Internet avisan cuándo se puede instalar (beforeinstallprompt) */
  const canPrompt = 'onbeforeinstallprompt' in window && !inApp && !isIOS;
  /* ?instalar=1: llegó desde "Abrir en Chrome" (desde Instagram/Facebook): el cartel sale enseguida */
  const params = new URLSearchParams(location.search);
  const fromIntent = params.get('instalar') === '1';
  if (fromIntent) {
    params.delete('instalar');
    try { history.replaceState(history.state, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash); } catch (_) {}
  }

  let deferred = null; // el pedido de instalación que guarda Chrome/Edge/Samsung
  let waiters = [];
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; waiters.splice(0).forEach((f) => f()); });
  /* si tocan "Instalar" antes de que el navegador avise, se espera un instante en vez de mostrar la explicación */
  function waitPrompt(ms) {
    if (deferred) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => { waiters = waiters.filter((f) => f !== done); resolve(); }, ms);
      const done = () => { clearTimeout(t); resolve(); };
      waiters.push(done);
    });
  }
  /* Android: abre la misma página en Chrome (si no está Chrome, sigue en la misma página) */
  function chromeIntent() {
    const u = new URL(location.href);
    u.searchParams.set('instalar', '1');
    u.hash = ''; // el # cortaría el enlace
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
  }
  window.addEventListener('appinstalled', () => {
    deferred = null; store.set(DONE_KEY, '1'); hideBanner(); paintButtons();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  const svg = (d, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON_DL = '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>';
  const ICON_SHARE = '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>';
  const ICON_DOTS = '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>';
  const ICON_PLUS = '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>';

  function paintButtons() {
    const show = !standalone() && store.get(DONE_KEY) !== '1';
    document.querySelectorAll('[data-app-install]').forEach((b) => { b.hidden = !show; });
  }

  /* ---------- instalar ---------- */
  async function install(from, btn) {
    /* dentro de Instagram/Facebook en Android: un toque y se abre en Chrome, donde sí se instala.
       Si ya vino de ese salto y sigue adentro (no hay Chrome), se explica en vez de repetirlo. */
    if (!deferred && inApp && isAndroid && !fromIntent) { location.href = chromeIntent(); return; }
    if (!deferred && canPrompt) {
      if (btn) { btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true'); }
      await waitPrompt(2000);
      if (btn) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); }
    }
    if (deferred) {
      const ev = deferred; deferred = null;
      try {
        ev.prompt();
        const choice = await ev.userChoice;
        if (choice && choice.outcome === 'accepted') { store.set(DONE_KEY, '1'); hideBanner(); paintButtons(); return; }
      } catch (_) {}
      if (from === 'banner') later();
      return;
    }
    hideBanner();
    showHelp();
  }

  /* ---------- cartel ---------- */
  let banner = null;
  function showBanner() {
    if (banner || standalone() || store.get(DONE_KEY) === '1') return;
    store.set(SESSION_KEY, '1', true);
    banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Instalar WorkUco');
    banner.innerHTML = `<img class="install-banner-icon" src="/icon-192.png" alt="" width="52" height="52">
      <div class="install-banner-text">
        <strong>Tené WorkUco como app</strong>
        <span>Abrila con un toque desde la pantalla de inicio, sin buscarla en el navegador. Es gratis y casi no ocupa lugar.</span>
      </div>
      <div class="install-banner-actions">
        <button class="btn btn-sm install-banner-go" type="button" data-install-go>${svg(ICON_DL, 16)} Instalar</button>
        <button class="btn btn-sm install-banner-later" type="button" data-install-later>Seguir desde la Web</button>
      </div>`;
    document.body.appendChild(banner);
    void banner.offsetWidth; // fija la posición de salida para que la entrada se anime
    banner.classList.add('is-in');
    banner.querySelector('[data-install-go]').addEventListener('click', (e) => install('banner', e.currentTarget));
    banner.querySelector('[data-install-later]').addEventListener('click', () => { later(); hideBanner(); });
  }
  function hideBanner() {
    if (!banner) return;
    const b = banner; banner = null;
    b.classList.remove('is-in');
    setTimeout(() => b.remove(), 260);
  }
  function later() { store.set(LATER_KEY, String(Date.now())); }
  function shouldAutoShow() {
    if (standalone() || store.get(DONE_KEY) === '1') return false;
    if (store.get(SESSION_KEY, true) === '1') return false;
    if (QUIET_PAGES.includes(document.body.dataset.page)) return false;
    const t = Number(store.get(LATER_KEY) || 0);
    return !t || Date.now() - t > LATER_DAYS * 864e5;
  }

  /* ---------- ayuda cuando el navegador no tiene botón de instalar ---------- */
  function steps() {
    if (inApp) {
      return {
        intro: 'Estás dentro de otra app (Instagram, Facebook…). Desde ahí no se puede instalar: primero abrí la página en tu navegador.',
        list: [[ICON_DOTS, 'Tocá los <b>tres puntitos</b> (o el botón de compartir) arriba a la derecha.'],
          [ICON_SHARE, `Elegí <b>Abrir en ${isIOS ? 'Safari' : 'Chrome'}</b> (o "Abrir en el navegador").`],
          [ICON_DL, 'Ya en el navegador, tocá <b>Instalar</b> en el cartel de WorkUco o en el menú.']],
      };
    }
    if (isIOS) {
      return {
        intro: 'En iPhone se instala desde Safari, en tres toques:',
        list: [[ICON_SHARE, 'Tocá el botón <b>Compartir</b> (el cuadradito con la flecha para arriba), abajo en Safari.'],
          [ICON_PLUS, 'Bajá y elegí <b>Agregar a inicio</b>.'],
          [ICON_DL, 'Tocá <b>Agregar</b>. WorkUco queda en tu pantalla como cualquier app.']],
      };
    }
    if (isMobile) {
      return {
        intro: 'Tu navegador lo hace desde su menú:',
        list: [[ICON_DOTS, 'Tocá los <b>tres puntitos</b> (⋮) arriba a la derecha de Chrome.'],
          [ICON_DL, 'Elegí <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.'],
          [ICON_PLUS, 'Confirmá con <b>Instalar</b>. Vas a ver el ícono de WorkUco con tus apps.']],
      };
    }
    return {
      intro: 'En la computadora se instala desde Chrome o Edge:',
      list: [[ICON_DL, 'Buscá el ícono de <b>instalar</b> a la derecha de la barra de direcciones.'],
        [ICON_DOTS, 'O abrí el menú (⋮ o …) y elegí <b>Transmitir, guardar y compartir → Instalar página como app</b> (en Edge: <b>Aplicaciones → Instalar este sitio</b>).'],
        [ICON_PLUS, 'Confirmá con <b>Instalar</b>. WorkUco se abre en su propia ventana.']],
    };
  }
  function showHelp() {
    if (document.querySelector('.install-help')) return;
    const s = steps();
    const back = document.createElement('div');
    back.className = 'modal-backdrop install-help';
    back.innerHTML = `<div class="modal install-modal" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
      <div class="modal-head"><div><h2 id="install-help-title">Instalar WorkUco</h2><p class="modal-sub">${s.intro}</p></div>
        <button class="modal-close" type="button" aria-label="Cerrar" data-install-close>${svg('<path d="M6 6l12 12M18 6 6 18"/>', 16)}</button></div>
      <ol class="install-steps">${s.list.map(([ic, t]) => `<li><span class="install-step-ic">${svg(ic, 20)}</span><span>${t}</span></li>`).join('')}</ol>
      ${isIOS || inApp ? '' : '<p class="install-note">¿Ya la instalaste? Buscá el ícono de WorkUco entre tus apps: el navegador no la ofrece dos veces.</p>'}
      <button class="btn btn-primary btn-block" type="button" data-install-close>Entendido</button>
    </div>`;
    const prev = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-install-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    back.querySelector('.modal-close').focus();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-app-install]');
    if (!b) return;
    e.preventDefault();
    const menu = document.querySelector('[data-mobile-menu]');
    if (menu && menu.contains(b)) { menu.hidden = true; const t = document.querySelector('[data-menu-toggle]'); if (t) t.setAttribute('aria-expanded', 'false'); }
    install('button', b);
  });

  function start() {
    paintButtons();
    /* llegó desde "Abrir en Chrome": el cartel sale enseguida, para instalar con un toque */
    if (fromIntent && !standalone() && store.get(DONE_KEY) !== '1') { setTimeout(showBanner, 700); return; }
    if (shouldAutoShow()) setTimeout(() => { if (shouldAutoShow() && !document.querySelector('.modal-backdrop')) showBanner(); }, DELAY_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.WKInstall = { install, showBanner, showHelp, chromeIntent };
})();
