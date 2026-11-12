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
      if (want) { want.checked = true; want.closest('details').open = true; }
      brief.classList.remove('flash');
      void brief.offsetWidth;
      brief.classList.add('flash');
    });
  });

  /* ---------- Scene machine ---------- */
  const reelData = {
    who: ['Nervozs viesmīlis', 'Gaišreģis ar sliktām ziņām', 'Jūsu finanšu direktors', 'Apmaldījies tūrists', 'Pārāk entuziastisks treneris', 'Aizdomīgs garderobists', 'Kāzu fotogrāfs bez kameras', 'Vecmāmiņa no Latgales', 'Robots-praktikants', 'Runājošs kaķis', 'Jaunais HR vadītājs', 'Pensionēts pirāts'],
    where: ['liftā starp 3. un 4. stāvu', 'IKEA labirintā', 'Jūrmalas pludmalē', 'kosmosa kuģī', 'pirtī', 'rīta sapulcē Zoom', 'veikala rindā', 'pie Jāņu ugunskura', 'uz kāzu deju grīdas', 'uz Vecrīgas bruģa', 'lidostā pēc atcelta reisa', 'biroja virtuvē'],
    what: ['mēģina pārdot ledusskapi pingvīnam', 'atklāj, ka visi ir radinieki', 'pirmo reizi dzird par Excel', 'plāno slepenu dzimšanas dienu', 'pārvērš ceturkšņa atskaiti operā', 'pareģo pasaules galu rīt 9:00', 'mācās dejot tango', 'meklē pazudušu zeķi', 'pieprasa algu kartupeļos', 'nejauši vada svešas kāzas', 'trenē viesus olimpiskajām spēlēm', 'atzīstas mīlestībā kafijas automātam'],
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
        counter.parentElement.innerHTML = '<strong>4</strong>/4. Jūs esat dzimis detektīvs! 🕵️';
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
  const bindActor = (actor) => {
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
      modal.querySelector('.modal__nick').textContent = actor.querySelector('.actor__nick')?.textContent || '';
      modal.querySelector('.modal__name').textContent = actor.querySelector('.actor__name').textContent;
      modal.querySelector('.modal__body').innerHTML = actor.querySelector('.actor__bio').innerHTML;
      modal.dataset.actor = actor.querySelector('.actor__name').textContent;
      modal.dataset.slug = actor.dataset.slug || '';
      modal.showModal();
    });
  };
  document.querySelectorAll('.actor').forEach(bindActor);
  modal.querySelector('.modal__close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "Pieteikt" on an actor or collective: note who they liked (hidden field) and go to the short form.
  const bookWith = (name) => {
    document.querySelector('#brief [name="actor"]').value = name;
    document.getElementById('brief').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  modal.querySelector('[data-book-actor]').addEventListener('click', () => { modal.close(); bookWith(modal.dataset.actor); });

  // Live profiles from the actor backend. The static cards in index.html stay as the fallback.
  const SOCIAL_LABELS = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' };
  const actorCard = (a, photo) => {
    const leads = [...a.skills, ...a.formats].filter((v, i, arr) => arr.indexOf(v) === i);
    const socials = Object.entries(a.socials || {}).filter(([, url]) => /^https:\/\/[^\s<>"]+$/i.test(url)).map(([k, url]) => `<a href="${escHtml(url)}" target="_blank" rel="noopener">${SOCIAL_LABELS[k] || escHtml(k)}</a>`).join('');
    const bio = String(a.bio || '').split(/\n\s*\n/).map((p) => `<p>${escHtml(p)}</p>`).join('');
    const troupe = a.troupe_slug && a.troupe_slug !== 'impromotion' ? `<span class="actor__troupe">${escHtml(a.troupe_name)}</span>` : '';
    return `<article class="actor" data-slug="${escHtml(a.slug || '')}" data-quip="${escHtml(a.quip || '')}" data-skills="${escHtml(a.skills.join('|'))}">
      <button class="actor__open" type="button" aria-haspopup="dialog">
        <span class="actor__photo"><img src="${escHtml(photo)}" alt="${escHtml(a.full_name)}" width="600" height="600" loading="lazy"></span>
        ${a.stage_name ? `<span class="actor__nick">“${escHtml(a.stage_name)}”</span>` : ''}
        <span class="actor__name">${escHtml(a.full_name)}</span>${troupe}${a.vetted === false ? `<span class="actor__new">${/[ae]$/i.test(String(a.full_name).split(/\s+/)[0]) ? 'Jauna' : 'Jauns'}</span>` : ''}
        <span class="actor__short">${escHtml(a.short_bio || '')}</span>
        <span class="actor__more">Iepazīties →</span>
      </button>
      <div class="actor__bio" hidden>${bio}${leads.length ? `<p class="leads"><strong>Vada:</strong> ${escHtml(leads.join(', ').toLowerCase())}</p>` : ''}${a.languages?.length ? `<p class="small"><strong>Valodas:</strong> ${escHtml(a.languages.join(', '))}</p>` : ''}${socials ? `<p class="socials">${socials}</p>` : ''}</div>
    </article>`;
  };

  (async () => {
    try {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('/assets/backend/config.js');
      if (!SUPABASE_URL.startsWith('https://')) return;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_actors`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) return;
      const actors = await res.json();
      if (!Array.isArray(actors)) return;
      const grid = document.querySelector('.actors__grid');
      // An empty list is a real answer (everyone hid their profile), not a reason to show the static cards.
      if (!actors.length) { grid.innerHTML = '<p class="muted">Aktieru saraksts drīz būs atpakaļ.</p>'; return; }
      const photo = (p) => (p && p.startsWith('/assets/') ? p
        : p && /^[0-9a-z-]+\/[\w.-]+$/i.test(p) ? `${SUPABASE_URL}/storage/v1/object/public/actor-photos/${p}`
        : '/assets/img/apple-touch-icon.png');
      // Checked pros in the main grid; self-published profiles in "Jaunie talanti" below.
      const vetted = actors.filter((a) => a.vetted !== false);
      const fresh = actors.filter((a) => a.vetted === false);
      grid.innerHTML = vetted.map((a) => actorCard(a, photo(a.photo_path))).join('');
      grid.querySelectorAll('.actor').forEach(bindActor);
      if (fresh.length) {
        const box = document.getElementById('jaunie');
        const newGrid = box.querySelector('.actors__grid');
        newGrid.innerHTML = fresh.map((a) => actorCard(a, photo(a.photo_path))).join('');
        newGrid.querySelectorAll('.actor').forEach(bindActor);
        box.hidden = false;
      }

      // Skill filter, only worth it once the team is bigger than one screen.
      const skills = [...new Set(actors.flatMap((a) => a.skills))].sort((x, y) => x.localeCompare(y, 'lv'));
      if (actors.length > 6 && skills.length > 1) {
        const bar = document.createElement('div');
        bar.className = 'actor-filter';
        bar.innerHTML = `<button type="button" class="is-on" data-skill="">Visi</button>${skills.map((s) => `<button type="button" data-skill="${escHtml(s)}">${escHtml(s)}</button>`).join('')}`;
        grid.before(bar);
        bar.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          bar.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
          grid.querySelectorAll('.actor').forEach((card) => {
            card.hidden = !!b.dataset.skill && !card.dataset.skills.split('|').includes(b.dataset.skill);
          });
        });
      }
    } catch (err) { /* keep the static cards */ }
  })();

  // Public collective profiles (improv theatres and groups we work with). Hidden until there is at least one.
  (async () => {
    try {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('/assets/backend/config.js');
      if (!SUPABASE_URL.startsWith('https://')) return;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_troupes`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) return;
      const troupes = await res.json();
      if (!Array.isArray(troupes) || !troupes.length) return;
      const safe = (u) => /^https:\/\/[^\s<>"]+$/i.test(u || '');
      const logo = (p) => (p && /^[0-9a-z-]+\/[\w.-]+$/i.test(p) ? `${SUPABASE_URL}/storage/v1/object/public/actor-photos/${p}` : '/assets/img/apple-touch-icon.png');
      const box = document.getElementById('kolektivi');
      box.querySelector('.troupes__grid').innerHTML = troupes.map((t) => {
        const links = [['Mājaslapa', t.website], ...Object.entries(t.socials || {}).map(([k, u]) => [SOCIAL_LABELS[k] || k, u])]
          .filter(([, u]) => safe(u)).map(([l, u]) => `<a href="${escHtml(u)}" target="_blank" rel="noopener">${escHtml(l)}</a>`).join('');
        const meta = [t.city, t.founded_year && `kopš ${t.founded_year}`].filter(Boolean).join(' · ');
        return `<article class="troupe-card">
          <img class="troupe-card__logo" src="${escHtml(logo(t.logo_path))}" alt="" width="96" height="96" loading="lazy">
          <div>
            <h4 class="troupe-card__name">${escHtml(t.name)}</h4>
            ${t.tagline ? `<p class="troupe-card__tag">${escHtml(t.tagline)}</p>` : ''}
            ${meta ? `<p class="small muted">${escHtml(meta)}</p>` : ''}
            ${t.description ? `<p class="troupe-card__desc">${escHtml(t.description)}</p>` : ''}
            ${t.members?.length ? `<p class="small"><strong>Aktieri:</strong> ${escHtml(t.members.join(', '))}</p>` : ''}
            ${links ? `<p class="socials">${links}</p>` : ''}
            <button class="btn btn--sm btn--yellow" type="button" data-book-troupe="${escHtml(t.name)}" data-slug="${escHtml(t.slug)}">Pieteikt pasākumu →</button>
          </div>
        </article>`;
      }).join('');
      box.hidden = false;
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-book-troupe]');
        if (!b) return;
        bookWith(`${b.dataset.bookTroupe} (kolektīvs)`);
      });
    } catch (err) { /* no collectives section */ }
  })();

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

  /* ---------- Event brief → n8n (saves the lead, e-mails Rihards, pings WhatsApp) ---------- */
  const LEAD_URL = 'https://marketingaskola.app.n8n.cloud/webhook/impromotion-lead?k=imp-lv-2026';
  // Where the visitor came from: assets/track.js keeps it for the whole visit (blog pages included).
  const form = document.getElementById('brief');
  const status = document.getElementById('brief-status');
  const guests = document.getElementById('guests');
  const guestsOut = document.getElementById('guests-out');
  const guestsMood = document.getElementById('guests-mood');
  const moods = [[20, 'intīmi'], [60, 'kārtīga balle'], [150, 'liela balle'], [300, 'pilna zāle'], [Infinity, 'stadions! 🏟️']];
  const updateGuests = () => {
    const n = Number(guests.value);
    guestsOut.textContent = n >= 400 ? '400+' : n;
    guestsMood.textContent = `(${moods.find(([max]) => n <= max)[1]})`;
  };
  guests.addEventListener('input', updateGuests);
  updateGuests();

  const say = (text, tone) => {
    status.textContent = text;
    status.dataset.tone = tone || '';
  };
  form.addEventListener('input', (e) => {
    if (!e.target.classList.contains('is-invalid')) return;
    form.querySelectorAll('[name="phone"], [name="email"]').forEach((el) => el.classList.remove('is-invalid'));
    e.target.classList.remove('is-invalid');
  });

  // Mobile dock: "Pieteikt pasākumu" + WhatsApp + call, after the hero and away from the form and the cookie bar.
  const dock = document.getElementById('cta-dock');
  if (dock) {
    let pastHero = false;
    let nearForm = false;
    const sync = () => { dock.hidden = !pastHero || nearForm || !!document.querySelector('.consent'); };
    new IntersectionObserver(([en]) => { pastHero = !en.isIntersecting; sync(); }).observe(document.getElementById('top'));
    new IntersectionObserver(([en]) => { nearForm = en.isIntersecting; sync(); }, { threshold: 0.05 }).observe(document.getElementById('kontakti'));
    new MutationObserver(sync).observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['hidden'] });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const phone = String(data.get('phone') || '').trim();
    const email = String(data.get('email') || '').trim();
    // Mark what is missing, jump to the first one, and say why in plain words.
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
    const payload = {
      name: data.get('name'),
      phone,
      email,
      type: data.get('type'),
      wants: data.getAll('want'),
      date: data.get('date') ? String(data.get('date')).split('-').reverse().join('.') : '',
      guests: guestsOut.textContent,
      message: data.get('msg'),
      actor: data.get('actor'),
      people: data.get('people'),
      budget: data.get('budget') ? form.querySelector('[name="budget"]').selectedOptions[0].textContent : '',
      level: data.get('level') ? form.querySelector('[name="level"]').selectedOptions[0].textContent : '',
      page: location.href,
      website: data.get('website'),
      // raw values for the CRM (the labels above are for the e-mail)
      date_iso: data.get('date') || '',
      budget_eur: data.get('budget') || '',
      level_key: data.get('level') || '',
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
      const r = btn.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top);
    } catch (err) {
      say('Neizdevās nosūtīt. Lūdzu, rakstiet mums WhatsApp vai uz hello@impromotion.lv.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
})();
