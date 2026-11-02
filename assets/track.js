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
