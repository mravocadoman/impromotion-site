// Service landing pages (organising, corporate training, team building): reveals, marquee loop, add-on tickets and the brief.
// The form says what it is: data-want (CRM wants, | separated), data-label (first line of the message) and
// data-extra="Label" on any fieldset or field whose answers should lead the message.
// The brief posts to the same n8n hook as the homepage, so it lands in the CRM, e-mail and Telegram the same way.
(() => {
  document.documentElement.classList.add('js');

  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('is-in');
    io.unobserve(en.target);
    // hand transforms back to hover styles once the entrance is done
    setTimeout(() => en.target.classList.remove('reveal', 'is-in'), 1000);
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  const track = document.querySelector('.marquee__track');
  if (track) {
    const clone = document.createElement('div');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.display = 'contents';
    clone.innerHTML = track.innerHTML;
    track.append(clone);
  }

  const form = document.getElementById('brief');
  if (!form) return; // the services hub has reveals but no form
  const status = document.getElementById('brief-status');
  const guests = document.getElementById('guests');
  const guestsOut = document.getElementById('guests-out');
  const guestsMood = document.getElementById('guests-mood');
  const moods = guests.dataset.moods ? JSON.parse(guests.dataset.moods).map(([n, t]) => [n ?? Infinity, t])
    : [[20, 'intīmi'], [60, 'kārtīga balle'], [150, 'liela balle'], [300, 'pilna zāle'], [Infinity, 'stadions! 🏟️']];
  const updateGuests = () => {
    const n = Number(guests.value);
    guestsOut.textContent = n >= Number(guests.max) ? `${guests.max}+` : n;
    guestsMood.textContent = `(${moods.find(([max]) => n <= max)[1]})`;
  };
  guests.addEventListener('input', updateGuests);
  updateGuests();

  // "Pievienot +" / "Izvēlēties" on a ticket ticks that option (add-on checkbox or format radio) in the form.
  document.querySelectorAll('[data-addon]').forEach((cta) => cta.addEventListener('click', () => {
    const box = form.querySelector(`input[value="${cta.dataset.addon}"]`);
    if (box) box.checked = true;
    form.classList.remove('flash');
    void form.offsetWidth;
    form.classList.add('flash');
  }));

  const say = (text, tone) => { status.textContent = text; status.dataset.tone = tone || ''; };
  form.addEventListener('input', (e) => {
    if (!e.target.classList.contains('is-invalid')) return;
    form.querySelectorAll('[name="phone"], [name="email"]').forEach((el) => el.classList.remove('is-invalid'));
    e.target.classList.remove('is-invalid');
  });

  const LEAD_URL = 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-lead?k=imp-lv-2026';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const phone = String(data.get('phone') || '').trim();
    const email = String(data.get('email') || '').trim();
    const nameEl = form.querySelector('[name="name"]');
    const phoneEl = form.querySelector('[name="phone"]');
    const emailEl = form.querySelector('[name="email"]');
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    const bad = [];
    let why = '';
    if (!nameEl.value.trim()) { bad.push(nameEl); why = 'Ierakstiet savu vārdu.'; }
    if (!phone && !email) { bad.push(phoneEl, emailEl); why = why ? 'Ierakstiet vārdu un tālruni vai e-pastu.' : 'Norādiet tālruni vai e-pastu, lai varam ar jums sazināties.'; }
    else if (email && !emailEl.checkValidity()) { bad.push(emailEl); why ||= 'Pārbaudiet e-pasta adresi.'; }
    if (bad.length) {
      bad.forEach((el) => el.classList.add('is-invalid'));
      bad[0].focus();
      bad[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return say(why, 'error');
    }
    // Service details have no CRM columns of their own, so they lead the message.
    const extra = [...form.querySelectorAll('[data-extra]')].map((el) => {
      const name = el.name || el.querySelector('[name]')?.name;
      const val = name ? data.getAll(name).map((v) => String(v).trim()).filter(Boolean).join(', ') : '';
      return val && `${el.dataset.extra}: ${val}`;
    }).filter(Boolean).join('\n');
    const msg = String(data.get('msg') || '').trim();
    const payload = {
      name: data.get('name'),
      phone,
      email,
      type: data.get('type'),
      wants: [...(form.dataset.want || 'pasākuma organizēšana').split('|'), ...data.getAll('want')],
      date: data.get('date') ? String(data.get('date')).split('-').reverse().join('.') : '',
      guests: guestsOut.textContent,
      message: [form.dataset.label || 'PASĀKUMA ORGANIZĒŠANA', extra, msg].filter(Boolean).join('\n\n'),
      // total budget, written in "tūkst." so the CRM does not read it as a performer budget
      budget: data.get('budget') || '',
      page: location.href,
      website: data.get('website'),
      date_iso: data.get('date') || '',
      source: window.impSrc?.() || '',
    };
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    say('Sūtām…');
    try {
      // text/plain keeps this a "simple" request: no CORS preflight.
      const res = await fetch(LEAD_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      updateGuests();
      say('Paldies! Pieteikums ir saņemts, drīz sazināsimies. 🎉', 'ok');
      window.impTrack?.('Lead');
    } catch (err) {
      say('Neizdevās nosūtīt. Lūdzu, rakstiet mums WhatsApp vai uz hello@impromotion.lv.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
