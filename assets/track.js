// Meta pixel (dataset "Impromotion" in the Mārketinga Skola business). It loads only after the visitor
// agrees in the cookie bar; the choice is kept in localStorage. Forms report conversions through
// window.impTrack('Lead'), which does nothing without consent.
// Google Ads: fill ADS_ID ("AW-...") and the conversion labels from Google Ads > Goals; while ADS_ID
// is empty nothing from Google loads. Same consent as Meta.
(() => {
  const PIXEL = '2340918023375734';
  const ADS_ID = 'AW-18563708225';
  const ADS_LABELS = { Lead: 'KvtMCPnl-rQdEMHq7pNF', Contact: 'NV7lCM7QgrUdEMHq7pNF' };
  const KEY = 'imp-consent';
  const load = () => {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq('init', PIXEL);
    fbq('track', 'PageView');
    if (ADS_ID) {
      const g = document.createElement('script');
      g.async = true;
      g.src = 'https://www.googletagmanager.com/gtag/js?id=' + ADS_ID;
      document.head.append(g);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      // Consent Mode v2: this only runs after "Piekrītu", so tell Google the visitor consented.
      // Without these signals Google may drop EEA conversions.
      gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
      gtag('js', new Date());
      gtag('config', ADS_ID);
    }
  };
  window.impTrack = (event, params) => {
    if (window.fbq) fbq('track', event, params);
    if (window.gtag && ADS_LABELS[event]) gtag('event', 'conversion', { send_to: ADS_ID + '/' + ADS_LABELS[event] });
  };

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
  // "Piekrītu" is the main button, "Atteikties" stays the same size and one click away.
  bar.innerHTML = '<p>🍪 Sīkdatnes mums palīdz saprast, kura reklāma jūs atveda, lai netērētu naudu reklāmām, kas nestrādā. Ja piekrītat, izmantosim Meta un Google sīkdatnes. Bez piekrišanas tās neieslēdzam.</p>'
    + '<div><button class="btn btn--sm btn--ghost" type="button" data-c="no">Atteikties</button>'
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
