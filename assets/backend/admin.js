// Admin page: all actors with private fields, invites, troupes and a "who is free on" date filter.
import { sb, $, esc, greet, toast, mountLogin, currentProfile, photoUrl, SKILLS, FORMATS, LANGUAGES, REGIONS, STATUS } from './sb.js';
import { renderActorForm } from './actor-form.js';
import { mountCalendar } from './calendar.js';

const view = $('#view');
const modal = $('#edit-modal');
modal.querySelector('.modal__close').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

let state = { actors: [], troupes: [], invites: [], links: [], bookings: [], applications: [], emails: {}, busyOn: new Set(),
  filters: { status: '', skill: '', format: '', troupe: '', date: '', language: '', region: '', maxFee: '', sort: 'order', group: false },
  appFilters: { status: 'new', skill: '', maxFee: '' } };

async function loadAll() {
  const today = new Date().toISOString().slice(0, 10);
  const [actors, troupes, invites, profiles, bookings, links, applications] = await Promise.all([
    sb.from('actors').select('*').order('sort_order').order('full_name'),
    sb.from('troupes').select('*').order('name'),
    sb.from('invites').select('*').order('invited_at', { ascending: false }),
    sb.from('profiles').select('id, email'),
    sb.from('bookings').select('*').gte('day', today).neq('status', 'cancelled').order('day'),
    sb.from('invite_links').select('*').order('created_at'),
    sb.from('applications').select('*').order('created_at', { ascending: false }),
  ]);
  const err = actors.error || troupes.error || invites.error || profiles.error || bookings.error || links.error || applications.error;
  if (err) { toast(`Neizdevās ielādēt: ${err.message}`, 'error'); return false; }
  state.actors = actors.data;
  state.troupes = troupes.data;
  state.invites = invites.data;
  state.bookings = bookings.data;
  state.links = links.data;
  state.applications = applications.data;
  state.emails = Object.fromEntries(profiles.data.map((p) => [p.id, p.email]));
  return true;
}

async function loadBusy(date) {
  state.busyOn = new Set();
  if (!date) return;
  const [busy, booked] = await Promise.all([
    sb.from('busy_dates').select('actor_id').eq('day', date),
    sb.from('bookings').select('actor_id').eq('day', date).neq('status', 'cancelled'),
  ]);
  [...(busy.data || []), ...(booked.data || [])].forEach((r) => state.busyOn.add(r.actor_id));
}

const troupeName = (id) => state.troupes.find((t) => t.id === id)?.name || '';

function filtered() {
  const f = state.filters;
  const list = state.actors.filter((a) =>
    (!f.status || a.status === f.status) &&
    (!f.skill || a.skills.includes(f.skill)) &&
    (!f.format || a.formats.includes(f.format)) &&
    (!f.troupe || a.troupe_id === f.troupe) &&
    (!f.language || a.languages.includes(f.language)) &&
    (!f.region || a.regions.includes(f.region) || a.regions.includes('Visa Latvija')) &&
    (!f.maxFee || (a.min_fee_eur != null && a.min_fee_eur <= Number(f.maxFee))) &&
    (!f.date || !state.busyOn.has(a.id)));
  const fee = (a) => (a.min_fee_eur == null ? Infinity : a.min_fee_eur);
  const sorters = {
    order: (x, y) => x.sort_order - y.sort_order || x.full_name.localeCompare(y.full_name, 'lv'),
    feeAsc: (x, y) => fee(x) - fee(y),
    feeDesc: (x, y) => (y.min_fee_eur ?? -1) - (x.min_fee_eur ?? -1),
    name: (x, y) => x.full_name.localeCompare(y.full_name, 'lv'),
  };
  return list.sort(sorters[f.sort] || sorters.order);
}

function filteredApplications() {
  const f = state.appFilters;
  return state.applications.filter((p) =>
    (!f.status || p.status === f.status) &&
    (!f.skill || p.skills.includes(f.skill)) &&
    (!f.maxFee || (p.min_fee_eur != null && p.min_fee_eur <= Number(f.maxFee))));
}

function draw() {
  const pending = state.actors.filter((a) => a.status === 'pending' || a.needs_review).length;
  const actorName = (id) => { const a = state.actors.find((x) => x.id === id); return a ? (a.stage_name ? `${a.full_name} (${a.stage_name})` : a.full_name) : '?'; };
  const STATUS_B = { tentative: 'Provizoriski', confirmed: 'Apstiprināta', done: 'Notikusi', cancelled: 'Atcelta' };
  const bookingRows = state.bookings.map((b) => `<li><span><strong>${esc(b.day.split('-').reverse().join('.'))}</strong> ${esc(b.title)} · ${esc(actorName(b.actor_id))}${b.location ? ` · <span class="muted">${esc(b.location)}</span>` : ''}</span><span class="muted small">${STATUS_B[b.status]}${b.client_price_eur != null ? ` · ${b.client_price_eur} € / aktierim ${b.actor_fee_eur ?? '?'} €` : ''}</span><button class="link-btn" data-cancel-booking="${b.id}">atcelt</button></li>`).join('');
  const options = (list, sel) => list.map((v) => `<option ${sel === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const rowHtml = (a) => `
    <tr>
      <td><img class="thumb" src="${esc(photoUrl(a.photo_path)) || '/assets/img/apple-touch-icon.png'}" alt=""></td>
      <td><strong>${esc(a.full_name || '(bez vārda)')}</strong>${a.stage_name ? `<br><span class="muted small">“${esc(a.stage_name)}”</span>` : ''}</td>
      <td>${esc(troupeName(a.troupe_id))}</td>
      <td><span class="status-badge status-badge--${a.status}">${STATUS[a.status]}</span>${a.needs_review ? '<br><span class="status-badge status-badge--pending">izmainīts, pārskatiet</span>' : ''}${a.show_on_site ? '' : '<br><span class="muted small">nerāda lapā</span>'}</td>
      <td class="small">${a.skills.map(esc).join(', ')}</td>
      <td class="small">${a.user_id ? esc(state.emails[a.user_id] || '') : '<span class="muted">nav konta</span>'}${a.phone ? `<br>${esc(a.phone)}` : ''}</td>
      <td>${a.min_fee_eur != null ? `${a.min_fee_eur} €` : '<span class="muted">—</span>'}</td>
      <td class="actions"><div class="row-actions"><button class="btn btn--ghost btn--sm" data-edit="${a.id}">Rediģēt</button>${a.user_id ? '' : `<button class="btn btn--ghost btn--sm" data-invite-link="${a.id}">Ielūguma saite</button>`}</div></td>
    </tr>`;
  const list = filtered();
  let rows;
  if (state.filters.group) {
    const groups = new Map();
    list.forEach((a) => { const k = troupeName(a.troupe_id) || 'Bez trupas'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
    rows = [...groups.entries()].sort(([x], [y]) => x.localeCompare(y, 'lv'))
      .map(([name, members]) => `<tr><td colspan="8" class="troupe-group"><strong>${esc(name)}</strong> <span class="muted small">${members.length}</span></td></tr>${members.map(rowHtml).join('')}`).join('');
  } else rows = list.map(rowHtml).join('');

  const apps = filteredApplications();
  const newApps = state.applications.filter((p) => p.status === 'new').length;
  const troupeOptions = (p) => `<option value="">Bez trupas</option>${state.troupes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}${p.troupes && !state.troupes.some((t) => t.slug === slugify(p.troupes)) ? `<option value="new:${esc(p.troupes)}">+ Jauna trupa: ${esc(p.troupes)}</option>` : ''}`;
  const appCards = apps.map((p) => `
    <article class="app-card">
      <div class="app-card__head">
        <strong>${esc(p.full_name)}${p.stage_name ? ` <span class="muted">“${esc(p.stage_name)}”</span>` : ''}</strong>
        <span class="muted small">${esc(new Date(p.created_at).toLocaleDateString('lv-LV'))} · ${esc(p.email)}${p.phone ? ` · ${esc(p.phone)}` : ''}</span>
      </div>
      <div class="app-card__meta">
        ${p.troupes ? `<span>🎭 ${esc(p.troupes)}</span>` : ''}
        ${p.experience_years != null ? `<span>${p.experience_years} g. pieredze</span>` : ''}
        ${p.min_fee_eur != null ? `<span>💶 no ${p.min_fee_eur} €</span>` : ''}
        ${[...p.skills, ...p.formats].map((s) => `<span>${esc(s)}</span>`).join('')}
        ${p.languages.length ? `<span>🗣 ${esc(p.languages.join(', '))}</span>` : ''}
        ${p.regions.length ? `<span>📍 ${esc(p.regions.join(', '))}</span>` : ''}
      </div>
      ${p.about ? `<p class="small">${esc(p.about)}</p>` : ''}
      ${p.links ? `<p class="small">${esc(p.links).split(/\s+/).map((u) => (/^https:\/\//.test(u) ? `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>` : u)).join(' ')}</p>` : ''}
      ${p.status === 'new' ? `<div class="row-actions" style="justify-content:flex-start">
        <select data-app-troupe="${p.id}" class="field">${troupeOptions(p)}</select>
        <button class="btn btn--yellow btn--sm" data-app-accept="${p.id}">Pievienot un uzaicināt</button>
        <button class="btn btn--ghost btn--sm" data-app-reject="${p.id}">Noraidīt</button>
      </div>` : `<span class="status-badge status-badge--${p.status === 'invited' ? 'approved' : 'hidden'}">${p.status === 'invited' ? 'Uzaicināts' : 'Noraidīts'}</span>`}
    </article>`).join('');

  view.innerHTML = `
    <div class="app__intro">
      <p class="eyebrow eyebrow--yellow">Admins</p>
      <h1 class="h2">Aktieri un trupas</h1>
      ${pending ? `<p class="notice">${pending} ${pending === 1 ? 'profils gaida' : 'profili gaida'} jūsu apskati.</p>` : ''}
    </div>

    <section class="panel">
      <div class="filters">
        <label class="field"><span>Statuss</span><select data-f="status"><option value="">Visi</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${state.filters.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Prasme</span><select data-f="skill"><option value="">Visas</option>${options(SKILLS, state.filters.skill)}</select></label>
        <label class="field"><span>Pasākums</span><select data-f="format"><option value="">Visi</option>${options(FORMATS, state.filters.format)}</select></label>
        <label class="field"><span>Trupa</span><select data-f="troupe"><option value="">Visas</option>${state.troupes.map((t) => `<option value="${t.id}" ${state.filters.troupe === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Brīvs datumā</span><input type="date" data-f="date" value="${state.filters.date}"></label>
        <label class="field"><span>Valoda</span><select data-f="language"><option value="">Visas</option>${options(LANGUAGES, state.filters.language)}</select></label>
        <label class="field"><span>Reģions</span><select data-f="region"><option value="">Visi</option>${options(REGIONS.filter((r) => r !== 'Visa Latvija'), state.filters.region)}</select></label>
        <label class="field"><span>Honorārs līdz €</span><input type="number" min="0" step="50" data-f="maxFee" value="${esc(state.filters.maxFee)}" placeholder="jebkurš"></label>
        <label class="field"><span>Kārtot</span><select data-f="sort">${[['order', 'Secība'], ['feeAsc', 'Honorārs ↑'], ['feeDesc', 'Honorārs ↓'], ['name', 'Vārds']].map(([k, v]) => `<option value="${k}" ${state.filters.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="check" style="align-self:end"><input type="checkbox" data-f="group" ${state.filters.group ? 'checked' : ''}> Grupēt pa trupām</label>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th></th><th>Aktieris</th><th>Trupa</th><th>Statuss</th><th>Prasmes</th><th>Kontakti</th><th>Min. honorārs</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" class="muted">Neviens neatbilst filtram.</td></tr>'}</tbody>
        </table>
      </div>
      <button class="btn btn--ghost" type="button" id="new-actor">+ Jauns aktiera profils</button>
    </section>

    <section class="panel">
      <h2 class="panel__title">Pieteikumi${newApps ? ` <span class="notice">${newApps} jauni</span>` : ''}</h2>
      <p class="muted small">Jauni improvizatori piesakās lapā <a href="/pievienojies/">impromotion.lv/pievienojies/</a>.</p>
      <div class="filters">
        <label class="field"><span>Statuss</span><select data-af="status"><option value="">Visi</option>${[['new', 'Jauni'], ['invited', 'Uzaicināti'], ['rejected', 'Noraidīti']].map(([k, v]) => `<option value="${k}" ${state.appFilters.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Prasme</span><select data-af="skill"><option value="">Visas</option>${options(SKILLS, state.appFilters.skill)}</select></label>
        <label class="field"><span>Honorārs līdz €</span><input type="number" min="0" step="50" data-af="maxFee" value="${esc(state.appFilters.maxFee)}" placeholder="jebkurš"></label>
      </div>
      <div class="app-list">${appCards || '<p class="muted">Nav pieteikumu ar šiem filtriem.</p>'}</div>
    </section>

    <section class="panel">
      <h2 class="panel__title">Haltūras</h2>
      <form id="booking-form" class="booking-form">
        <label class="field"><span>Datums</span><input type="date" name="day" required></label>
        <label class="field"><span>Aktieris</span><select name="actor_id" required>${state.actors.map((a) => `<option value="${a.id}">${esc(actorName(a.id))}</option>`).join('')}</select></label>
        <label class="field"><span>Nosaukums</span><input name="title" required maxlength="120" placeholder="Uzņēmuma Ziemassvētku balle"></label>
        <label class="field"><span>Vieta</span><input name="location" maxlength="200"></label>
        <label class="field"><span>Klients (aktieris neredz)</span><input name="client" maxlength="200"></label>
        <label class="field"><span>Cena klientam € (aktieris neredz)</span><input type="number" name="client_price_eur" min="0" step="10"></label>
        <label class="field"><span>Honorārs aktierim €</span><input type="number" name="actor_fee_eur" min="0" step="10"></label>
        <label class="field"><span>Statuss</span><select name="status"><option value="tentative">Provizoriski</option><option value="confirmed">Apstiprināta</option></select></label>
        <label class="field booking-form__wide"><span>Informācija aktierim (laiks, kontaktpersona, programma, tabu tēmas)</span><textarea name="details" rows="3" maxlength="2000"></textarea></label>
        <button class="btn btn--yellow" type="submit">+ Pievienot haltūru</button>
      </form>
      <ul class="plain-list">${bookingRows || '<li class="muted">Nākamo haltūru nav.</li>'}</ul>
    </section>

    <div class="app__cols">
      <section class="panel">
        <h2 class="panel__title">Uzaicināt</h2>
        <p class="muted small">Pēc ielūguma aktieris ienāk <strong>impromotion.lv/aktieriem/</strong> ar savu e-pastu un pats aizpilda profilu.</p>
        <form id="invite-form" class="invite-form">
          <label class="field"><span>E-pasts</span><input type="email" name="email" required></label>
          <label class="field"><span>Trupa</span><select name="troupe_id"><option value="">—</option>${state.troupes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Loma</span><select name="role"><option value="actor">Aktieris</option><option value="admin">Admins</option></select></label>
          <button class="btn btn--yellow" type="submit">Uzaicināt</button>
        </form>
        <ul class="plain-list">${state.invites.map((i) => `<li><span>${esc(i.email)}</span><span class="muted small">${i.accepted_at ? 'pievienojies' : 'gaida'}${i.actor_id ? ' · profils piesaistīts' : ''}</span><button class="link-btn" data-del-invite="${esc(i.email)}">dzēst</button></li>`).join('')}</ul>
      </section>

      <section class="panel">
        <h2 class="panel__title">Trupas</h2>
        <ul class="plain-list">${state.troupes.map((t) => `<li><strong>${esc(t.name)}</strong><span class="muted small">${state.actors.filter((a) => a.troupe_id === t.id).length} aktieri</span></li>`).join('')}</ul>
        <form id="troupe-form" class="invite-form">
          <label class="field"><span>Nosaukums</span><input name="name" required maxlength="80"></label>
          <label class="field"><span>Mājaslapa</span><input type="url" name="website" placeholder="https://"></label>
          <button class="btn btn--ghost" type="submit">+ Pievienot trupu</button>
        </form>
      </section>
    </div>`;
}

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function openEditor(id) {
  const a = state.actors.find((x) => x.id === id);
  const { data: note } = await sb.from('actor_admin_notes').select('notes').eq('actor_id', id).maybeSingle();
  const body = $('#edit-body');
  body.innerHTML = '<div class="app__cols"><div id="edit-form"></div><aside><h2 class="panel__title">Aizņemtās dienas</h2><div id="edit-cal"></div></aside></div>';
  renderActorForm($('#edit-form'), a, {
    admin: true, troupes: state.troupes, adminNotes: note?.notes || '',
    onSaved: async () => { await loadAll(); draw(); },
  });
  mountCalendar($('#edit-cal'), a.id, { booked: state.bookings.filter((b) => b.actor_id === a.id).map((b) => b.day) });
  modal.showModal();
}

view.addEventListener('change', async (e) => {
  const af = e.target.closest('[data-af]');
  if (af) { state.appFilters[af.dataset.af] = af.value; draw(); return; }
  const f = e.target.closest('[data-f]');
  if (!f) return;
  state.filters[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value;
  if (f.dataset.f === 'date') await loadBusy(f.value);
  draw();
});

view.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return openEditor(edit.dataset.edit);

  const accept = e.target.closest('[data-app-accept]');
  if (accept) {
    const p = state.applications.find((x) => x.id === accept.dataset.appAccept);
    if (!p || accept.disabled) return;
    accept.disabled = true;
    const fail = (msg) => { accept.disabled = false; toast(msg, 'error'); };
    let troupeId = view.querySelector(`[data-app-troupe="${p.id}"]`).value || null;
    if (troupeId && troupeId.startsWith('new:')) {
      const name = troupeId.slice(4).trim();
      const existing = state.troupes.find((t) => t.slug === slugify(name));
      if (existing) troupeId = existing.id;
    }
    if (troupeId && troupeId.startsWith('new:')) {
      const name = troupeId.slice(4).trim();
      const { data: t, error: tErr } = await sb.from('troupes').insert({ name, slug: slugify(name) || `trupa-${Date.now()}` }).select().single();
      if (tErr) return fail(tErr.message);
      troupeId = t.id;
    }
    const { data: actor, error: aErr } = await sb.from('actors').insert({
      full_name: p.full_name, stage_name: p.stage_name, phone: p.phone, min_fee_eur: p.min_fee_eur, troupe_id: troupeId,
      skills: p.skills, formats: p.formats, languages: p.languages, regions: p.regions, bio: p.about, status: 'draft',
    }).select().single();
    if (aErr) return fail(aErr.message === 'banned' ? 'Šo cilvēku nevar pievienot.' : aErr.message);
    const { data: link, error: lErr } = await sb.from('invite_links').insert({ actor_id: actor.id, troupe_id: troupeId }).select().single();
    if (lErr) return fail(lErr.message);
    const { error: uErr } = await sb.from('applications').update({ status: 'invited', actor_id: actor.id }).eq('id', p.id);
    if (uErr) toast(uErr.message, 'error');
    const url = `${location.origin}/aktieriem/?invite=${link.token}`;
    const text = `${greet(p.full_name)} Paldies par pieteikumu Impromotion! 🎭 Esam izveidojuši tev aktiera profilu. Ar šo personīgo saiti vari to pārņemt un aizpildīt (nesūti tālāk): ${url}\n\nAtver saiti, ieraksti savu e-pastu (${p.email}) un atnāks saite ienākšanai, paroli nevajag. Profilā papildini aprakstu, pievieno foto, atzīmē aizņemtās dienas un pārbaudi honorāru. Kad profils gatavs, nospied "Iesniegt apstiprināšanai".`;
    try { await navigator.clipboard.writeText(text); toast(`Profils izveidots. Ielūguma teksts nokopēts: sūtiet to uz ${p.email} vai WhatsApp.`); }
    catch { prompt('Nokopējiet ielūguma tekstu:', text); }
    await loadAll(); draw();
    return;
  }
  const reject = e.target.closest('[data-app-reject]');
  if (reject) {
    if (!confirm('Noraidīt šo pieteikumu?')) return;
    const { error: rErr } = await sb.from('applications').update({ status: 'rejected' }).eq('id', reject.dataset.appReject);
    if (rErr) return toast(rErr.message, 'error');
    await loadAll(); draw();
    return;
  }

  const linkBtn = e.target.closest('[data-invite-link]');
  if (linkBtn) {
    const a = state.actors.find((x) => x.id === linkBtn.dataset.inviteLink);
    let link = state.links.find((l) => l.actor_id === a.id && !l.claimed_email);
    if (!link) {
      const { data, error } = await sb.from('invite_links').insert({ actor_id: a.id, troupe_id: a.troupe_id }).select().single();
      if (error) return toast(error.message, 'error');
      link = data;
      state.links.push(link);
    }
    const url = `${location.origin}/aktieriem/?invite=${link.token}`;
    const text = `${greet(a.full_name)} Impromotion lapā tev ir savs aktiera profils. Ar šo personīgo saiti vari to pārņemt: ${url}\n\nIeraksti savu e-pastu, atnāks saite ienākšanai (bez paroles). Profilā vari papildināt aprakstu un foto, atzīmēt, ko vadi un kurās dienās esi aizņemts, un ierakstīt savu minimālo honorāru. To redzu tikai es, klienti ne.`;
    try { await navigator.clipboard.writeText(text); toast('Ielūguma teksts ar saiti nokopēts. Iemetiet to WhatsApp.'); }
    catch { prompt('Nokopējiet ielūguma tekstu:', text); }
    return;
  }

  const cancel = e.target.closest('[data-cancel-booking]');
  if (cancel) {
    if (!confirm('Atcelt šo haltūru?')) return;
    const { error } = await sb.from('bookings').update({ status: 'cancelled' }).eq('id', cancel.dataset.cancelBooking);
    if (error) return toast(error.message, 'error');
    await loadAll(); draw();
    return;
  }

  const del = e.target.closest('[data-del-invite]');
  if (del) {
    await sb.from('invites').delete().eq('email', del.dataset.delInvite);
    await loadAll(); draw();
    return;
  }

  if (e.target.id === 'new-actor') {
    const { data, error } = await sb.from('actors').insert({ full_name: 'Jauns aktieris', status: 'draft' }).select().single();
    if (error) return toast(error.message, 'error');
    await loadAll(); draw();
    openEditor(data.id);
  }
});

view.addEventListener('submit', async (e) => {
  // The login form lives in #view too; leave it to mountLogin.
  if (!['invite-form', 'troupe-form', 'booking-form'].includes(e.target.id)) return;
  e.preventDefault();
  const fd = new FormData(e.target);
  if (e.target.id === 'booking-form') {
    const num = (k) => (fd.get(k) ? Number(fd.get(k)) : null);
    const row = { day: fd.get('day'), actor_id: fd.get('actor_id'), title: fd.get('title').trim(), location: fd.get('location').trim() || null,
      client: fd.get('client').trim() || null, client_price_eur: num('client_price_eur'), actor_fee_eur: num('actor_fee_eur'),
      status: fd.get('status'), details: fd.get('details').trim() || null };
    const clash = await sb.from('busy_dates').select('day').eq('actor_id', row.actor_id).eq('day', row.day);
    if (clash.data?.length && !confirm('Aktieris šajā dienā atzīmējis, ka ir aizņemts. Pievienot tik un tā?')) return;
    const { error } = await sb.from('bookings').insert(row);
    if (error) return toast(error.message, 'error');
    toast('Haltūra pievienota. Aktieris to redzēs savā profilā.');
  }
  if (e.target.id === 'invite-form') {
    const row = { email: fd.get('email').trim().toLowerCase(), role: fd.get('role'), troupe_id: fd.get('troupe_id') || null };
    const { error } = await sb.from('invites').upsert(row);
    if (error) return toast(error.message, 'error');
    toast('Ielūgums saglabāts. Aktieris var ienākt impromotion.lv/aktieriem/.');
  }
  if (e.target.id === 'troupe-form') {
    const name = fd.get('name').trim();
    const { error } = await sb.from('troupes').insert({ name, slug: slugify(name), website: fd.get('website') || null });
    if (error) return toast(error.message, 'error');
    toast('Trupa pievienota.');
  }
  await loadAll(); draw();
});

let shown = false;
async function show() {
  const profile = await currentProfile();
  if (!profile) { $('#app-nav').hidden = true; await mountLogin(view, { redirectPath: '/admin/' }); return; }
  $('#app-nav').hidden = false;
  if (profile.role !== 'admin') { view.innerHTML = '<div class="panel"><h1 class="h2">Nav piekļuves</h1><p>Šī lapa ir tikai adminam. <a href="/aktieriem/">Uz savu profilu</a></p></div>'; return; }
  shown = true;
  if (await loadAll()) draw();
}

$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); shown = false; show(); });
sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' && !shown) show(); });
show();
