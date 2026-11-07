// Meta pixel (dataset "Impromotion" in the Mārketinga Skola business). It loads only after the visitor
// agrees in the cookie bar; the choice is kept in localStorage. Forms report conversions through
// window.impTrack('Lead'), which does nothing without consent.
(() => {
  const PIXEL = '2340918023375734';
  const KEY = 'imp-consent';
  const load = () => {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq('init', PIXEL);
    fbq('track', 'PageView');
  };
  window.impTrack = (event, params) => { if (window.fbq) fbq('track', event, params); };

  // WhatsApp, call and e-mail clicks: Meta "Contact" (with consent) and our own count (always,
  // no personal data). The ?no= / utm_source tag matches what the inquiry form stores.
  const src = () => {
    const q = new URLSearchParams(location.search);
    let s = q.get('no') || q.get('utm_source') || '';
    try { if (s) sessionStorage.setItem('imp-lead-src', s.slice(0, 80)); s = sessionStorage.getItem('imp-lead-src') || s; } catch {}
    return s.slice(0, 80);
  };
  src();
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    const href = a?.getAttribute('href') || '';
    const kind = /^https:\/\/wa\.me\//.test(href) ? 'whatsapp' : href.startsWith('tel:') ? 'call' : href.startsWith('mailto:') ? 'email' : '';
    if (!kind) return;
    window.impTrack('Contact', { content_name: kind });
    fetch('https://cflnjdiwipwkcnepunpd.supabase.co/rest/v1/rpc/log_contact_click', {
      method: 'POST', keepalive: true,
      headers: { apikey: 'sb_publishable_gzvMdNypjLXuDZMlvSFRDA_JnPupN5a', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind, p_page: location.pathname + location.hash, p_source: src() || null }),
    }).catch(() => {});
  });

  let choice = null;
  try { choice = localStorage.getItem(KEY); } catch {}
  if (choice === 'yes') return load();
  if (choice === 'no') return;

  const bar = document.createElement('div');
  bar.className = 'consent';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Sīkdatnes');
  bar.innerHTML = '<p>Ja piekrītat, izmantosim Meta sīkdatnes, lai redzētu, kuras reklāmas atved apmeklētājus. Bez piekrišanas tās neizmantojam.</p>'
    + '<div><button class="btn btn--sm btn--yellow" type="button" data-c="no">Atteikties</button>'
    + '<button class="btn btn--sm btn--yellow" type="button" data-c="yes">Piekrītu</button></div>';
  bar.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (!c) return;
    try { localStorage.setItem(KEY, c); } catch {}
    bar.remove();
    if (c === 'yes') load();
  });
  document.body.append(bar);
})();
