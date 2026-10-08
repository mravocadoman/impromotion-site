// Impromotion — all the interactive bits. No dependencies.
(() => {
  const doc = document.documentElement;
  doc.classList.add('js');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Nav ---------- */
  const nav = document.getElementById('nav');
  const toggle = nav.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  const onScroll = () => nav.classList.toggle('nav--solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Hero: split headline into bouncy letters ---------- */
  const title = document.querySelector('[data-split]');
  title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
  let i = 0;
  title.querySelectorAll('.line').forEach((line) => {
    line.setAttribute('aria-hidden', 'true');
    const words = line.textContent.trim().split(' ');
    line.textContent = '';
    words.forEach((word, w) => {
      const wrap = document.createElement('span');
      wrap.style.whiteSpace = 'nowrap';
      for (const char of word) {
        const span = document.createElement('span');
        span.className = 'ch';
        span.textContent = char;
        span.style.setProperty('--i', i++);
        span.style.setProperty('--rot', Math.round(rand(-30, 30)));
        wrap.append(span);
      }
      line.append(wrap);
      if (w < words.length - 1) line.append(' ');
    });
  });

  /* ---------- Hero: spotlight follows the pointer (wanders on its own on touch) ---------- */
  const hero = document.querySelector('.hero');
  const spot = { x: innerWidth * 0.5, y: innerHeight * 0.42, tx: innerWidth * 0.5, ty: innerHeight * 0.42 };
  let userMoved = false;
  let heroVisible = true;

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    spot.tx = e.clientX - r.left;
    spot.ty = e.clientY - r.top;
    userMoved = true;
  });
  new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }).observe(hero);

  const tick = (t) => {
    if (heroVisible) {
      if (!userMoved && !reduceMotion) {
        const r = hero.getBoundingClientRect();
        spot.tx = r.width * (0.5 + Math.sin(t / 2300) * 0.3);
        spot.ty = r.height * (0.42 + Math.cos(t / 1700) * 0.18);
      }
      spot.x += (spot.tx - spot.x) * 0.09;
      spot.y += (spot.ty - spot.y) * 0.09;
      hero.style.setProperty('--x', `${spot.x.toFixed(1)}px`);
      hero.style.setProperty('--y', `${spot.y.toFixed(1)}px`);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  /* ---------- Hero: click for laughs ---------- */
  const laughs = ['HA!', 'HAHA', 'HA-HA!', '😂', '👏', 'Bravo!', 'LOL', '🤣', 'Ō!', '🎭'];
  const colors = ['#fdcb08', '#ff4f8b', '#3ee0ff', '#fff6dc'];
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    const r = hero.getBoundingClientRect();
    const count = reduceMotion ? 1 : Math.round(rand(2, 4));
    for (let n = 0; n < count; n++) {
      const el = document.createElement('span');
      el.className = 'ha';
      el.textContent = pick(laughs);
      el.style.left = `${e.clientX - r.left + rand(-30, 30)}px`;
      el.style.top = `${e.clientY - r.top + rand(-20, 20)}px`;
      el.style.setProperty('--c', pick(colors));
      el.style.setProperty('--s', `${rand(1.4, 3.2).toFixed(2)}rem`);
      el.style.setProperty('--dx', `${rand(-90, 90).toFixed(0)}px`);
      el.style.setProperty('--rot', `${rand(-25, 25).toFixed(0)}deg`);
      el.style.animationDelay = `${n * 70}ms`;
      el.addEventListener('animationend', () => el.remove());
      hero.append(el);
    }
  });

  /* ---------- Marquee: duplicate the track for a seamless loop ---------- */
  const track = document.querySelector('.marquee__track');
  const clone = document.createElement('div');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.display = 'contents';
  clone.innerHTML = track.innerHTML;
  track.append(clone);

  /* ---------- Scroll reveal (staggered within each group) ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.remove('reveal'));
  } else {
    reveals.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
      el.style.setProperty('--d', `${siblings.indexOf(el) * 90}ms`);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.classList.add('is-in');
        const delay = parseInt(el.style.getPropertyValue('--d'), 10) || 0;
        // hand transforms back to hover styles once the entrance is done
        setTimeout(() => el.classList.remove('reveal', 'is-in'), 1000 + delay);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  }

  /* ---------- Services: ticket glow + "Pieteikt" pre-fills the brief ---------- */
  document.querySelectorAll('.ticket').forEach((ticket) => {
    ticket.addEventListener('pointermove', (e) => {
      const r = ticket.getBoundingClientRect();
      ticket.style.setProperty('--mx', `${e.clientX - r.left}px`);
      ticket.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
  document.querySelectorAll('.ticket__cta').forEach((cta) => {
    cta.addEventListener('click', () => {
      const brief = document.getElementById('brief');
      const type = brief.querySelector(`[name="type"][value="${cta.dataset.type}"]`);
      const want = brief.querySelector(`[name="want"][value="${cta.dataset.want}"]`);
      if (type) type.checked = true;
      if (want) want.checked = true;
      brief.classList.remove('flash');
      void brief.offsetWidth;
      brief.classList.add('flash');
    });
  });

  /* ---------- Scene machine ---------- */
  const reelData = {
    who: ['Nervozs viesmīlis', 'Gaišreģis ar sliktām ziņām', 'Jūsu finanšu direktors', 'Apmaldījies tūrists', 'Pārāk entuziastisks treneris', 'Aizdomīgs garderobists', 'Kāzu fotogrāfs bez kameras', 'Vecmāmiņa no Latgales', 'Robots-praktikants', 'Runājošs kaķis', 'Jaunais HR vadītājs', 'Pensionēts pirāts'],
    where: ['liftā starp 3. un 4. stāvu', 'IKEA labirintā', 'Jūrmalas pludmalē', 'kosmosa kuģī', 'pirtī', 'rīta sapulcē Zoom', 'veikala rindā', 'pie Jāņu ugunskura', 'uz kāzu deju grīdas', 'uz Vecrīgas bruģa', 'lidostā pēc atcelta reisa', 'biroja virtuvē'],
    what: ['mēģina pārdot ledusskapi pingvīnam', 'atklāj, ka visi ir radinieki', 'pirmo reizi dzird par Excel', 'plāno slepenu dzimšanas dienu', 'pārvērš ceturkšņa atskaiti operā', 'pareģo pasaules galu — rīt 9:00', 'mācās dejot tango', 'meklē pazudušu zeķi', 'pieprasa algu kartupeļos', 'nejauši vada svešas kāzas', 'trenē viesus olimpiskajām spēlēm', 'atzīstas mīlestībā kafijas automātam'],
  };
  const strips = [...document.querySelectorAll('[data-reel]')];
  const current = {};
  strips.forEach((strip) => {
    const key = strip.dataset.reel;
    current[key] = reelData[key][0];
    strip.innerHTML = `<li>${current[key]}</li>`;
  });

  const spinBtn = document.getElementById('spin');
  const result = document.getElementById('slot-result');
  const wantScene = document.getElementById('want-scene');
  let lastScene = '';

  spinBtn.addEventListener('click', async () => {
    spinBtn.classList.add('is-spinning');
    result.classList.remove('pop');
    result.textContent = 'Zāle domā…';

    const spins = strips.map((strip, idx) => {
      const key = strip.dataset.reel;
      const options = reelData[key].filter((v) => v !== current[key]);
      const target = pick(options);
      const filler = Array.from({ length: 14 + idx * 6 }, () => pick(reelData[key]));
      const items = [current[key], ...filler, target];
      strip.innerHTML = items.map((t) => `<li>${t}</li>`).join('');
      current[key] = target;
      const h = strip.firstElementChild.offsetHeight;
      const distance = (items.length - 1) * h;
      if (reduceMotion) return Promise.resolve(strip);
      return strip.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${-distance}px)` }],
        { duration: 1300 + idx * 550, easing: 'cubic-bezier(.12,.75,.25,1.04)', fill: 'forwards' },
      ).finished.then(() => strip);
    });

    const done = await Promise.all(spins);
    done.forEach((strip) => {
      strip.getAnimations().forEach((a) => a.cancel());
      strip.innerHTML = `<li>${current[strip.dataset.reel]}</li>`;
    });

    lastScene = `${current.who} ${current.where} ${current.what}.`;
    result.textContent = `“${lastScene}”`;
    void result.offsetWidth;
    result.classList.add('pop');
    spinBtn.classList.remove('is-spinning');
    spinBtn.firstChild.textContent = 'Vēlreiz! ';
    wantScene.hidden = false;
  });

  wantScene.addEventListener('click', () => {
    const msg = document.querySelector('#brief [name="msg"]');
    msg.value = `Ieteikumu mašīnas aina: ${lastScene}${msg.value ? `\n\n${msg.value}` : ''}`;
  });

  /* ---------- Hidden roles: flip cards + unmask counter ---------- */
  const flips = document.querySelectorAll('.flip');
  const counter = document.getElementById('unmasked');
  const unmasked = new Set();
  let celebrated = false;
  flips.forEach((card, idx) => {
    card.addEventListener('click', () => {
      const open = card.getAttribute('aria-pressed') !== 'true';
      card.setAttribute('aria-pressed', String(open));
      if (!open) return;
      unmasked.add(idx);
      counter.textContent = unmasked.size;
      counter.classList.remove('bump');
      void counter.offsetWidth;
      counter.classList.add('bump');
      if (unmasked.size === flips.length && !celebrated) {
        celebrated = true;
        counter.parentElement.innerHTML = '<strong>4</strong>/4 — tu esi dzimis detektīvs! 🕵️';
        const r = card.getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
  });

  /* ---------- Confetti ---------- */
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  function confetti(x, y) {
    if (reduceMotion) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const pieces = Array.from({ length: 170 }, () => ({
      x, y,
      vx: rand(-9, 9),
      vy: rand(-15, -4),
      w: rand(6, 12),
      h: rand(8, 16),
      rot: rand(0, Math.PI),
      vr: rand(-0.3, 0.3),
      c: pick(colors),
    }));
    const start = performance.now();
    const frame = (now) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      pieces.forEach((p) => {
        p.vy += 0.38;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.cos(p.rot * 2));
        ctx.restore();
      });
      if (now - start < 3200) requestAnimationFrame(frame);
      else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    };
    requestAnimationFrame(frame);
  }

  /* ---------- Actors: tilt + bio modal ---------- */
  const modal = document.getElementById('actor-modal');
  document.querySelectorAll('.actor').forEach((actor) => {
    const btn = actor.querySelector('.actor__open');
    if (finePointer && !reduceMotion) {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        btn.style.setProperty('--rx', `${(px * 12).toFixed(2)}deg`);
        btn.style.setProperty('--ry', `${(-py * 12).toFixed(2)}deg`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--rx', '0deg');
        btn.style.setProperty('--ry', '0deg');
      });
    }
    btn.addEventListener('click', () => {
      const img = actor.querySelector('img');
      const photo = modal.querySelector('.modal__photo');
      photo.src = img.src;
      photo.alt = img.alt;
      modal.querySelector('.modal__nick').textContent = actor.querySelector('.actor__nick').textContent;
      modal.querySelector('.modal__name').textContent = actor.querySelector('.actor__name').textContent;
      modal.querySelector('.modal__body').innerHTML = actor.querySelector('.actor__bio').innerHTML;
      modal.showModal();
    });
  });
  modal.querySelector('.modal__close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  /* ---------- Magnetic CTA ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px) rotate(-1.5deg)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Event brief → WhatsApp / e-mail ---------- */
  const form = document.getElementById('brief');
  const guests = document.getElementById('guests');
  const guestsOut = document.getElementById('guests-out');
  const guestsMood = document.getElementById('guests-mood');
  const moods = [[20, 'intīmi'], [60, 'kārtīga balle'], [150, 'liela balle'], [300, 'pilna zāle'], [Infinity, 'stadions! 🏟️']];
  const updateGuests = () => {
    const n = Number(guests.value);
    guestsOut.textContent = n >= 400 ? '400+' : n;
    guestsMood.textContent = `— ${moods.find(([max]) => n <= max)[1]}`;
  };
  guests.addEventListener('input', updateGuests);
  updateGuests();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const wants = data.getAll('want');
    const lines = [
      'Sveiki, Impromotion! 👋',
      '',
      `Pasākuma veids: ${data.get('type')}`,
      wants.length ? `Interesē: ${wants.join(', ')}` : null,
      data.get('date') ? `Datums: ${new Date(data.get('date')).toLocaleDateString('lv-LV')}` : null,
      `Viesu skaits: ~${guestsOut.textContent}`,
      data.get('name') ? `Vārds: ${data.get('name')}` : null,
      data.get('msg') ? `\n${data.get('msg')}` : null,
    ].filter((l) => l !== null);
    const text = lines.join('\n');
    if (e.submitter?.dataset.via === 'mail') {
      const subject = `Pasākuma pieteikums — ${data.get('type')}`;
      location.href = `mailto:rihards.zeila@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    } else {
      window.open(`https://wa.me/37126673384?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
  });
})();
