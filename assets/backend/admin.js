// Admin page: all actors with private fields, invites, troupes and a "who is free on" date filter.
import { sb, $, esc, toast, mountLogin, currentProfile, photoUrl, SKILLS, FORMATS, STATUS } from './sb.js';
import { renderActorForm } from './actor-form.js';
import { mountCalendar } from './calendar.js';

const view = $('#view');
const modal = $('#edit-modal');
modal.querySelector('.modal__close').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

let state = { actors: [], troupes: [], invites: [], emails: {}, busyOn: new Set(), filters: { status: '', skill: '', format: '', troupe: '', date: '' } };

async function loadAll() {
  const [actors, troupes, invites, profiles] = await Promise.all([
    sb.from('actors').select('*').order('sort_order').order('full_name'),
    sb.from('troupes').select('*').order('name'),
    sb.from('invites').select('*').order('invited_at', { ascending: false }),
    sb.from('profiles').select('id, email'),
  ]);
  const err = actors.error || troupes.error || invites.error || profiles.error;
  if (err) { toast(`Neizdevās ielādēt: ${err.message}`, 'error'); return false; }
  state.actors = actors.data;
  state.troupes = troupes.data;
  state.invites = invites.data;
  state.emails = Object.fromEntries(profiles.data.map((p) => [p.id, p.email]));
  return true;
}

async function loadBusy(date) {
  state.busyOn = new Set();
  if (!date) return;
  const { data } = await sb.from('busy_dates').select('actor_id').eq('day', date);
  (data || []).forEach((r) => state.busyOn.add(r.actor_id));
}

const troupeName = (id) => state.troupes.find((t) => t.id === id)?.name || '';

function filtered() {
  const f = state.filters;
  return state.actors.filter((a) =>
    (!f.status || a.status === f.status) &&
    (!f.skill || a.skills.includes(f.skill)) &&
    (!f.format || a.formats.includes(f.format)) &&
    (!f.troupe || a.troupe_id === f.troupe) &&
    (!f.date || !state.busyOn.has(a.id)));
}

function draw() {
  const pending = state.actors.filter((a) => a.status === 'pending').length;
  const options = (list, sel) => list.map((v) => `<option ${sel === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const rows = filtered().map((a) => `
    <tr>
      <td><img class="thumb" src="${esc(photoUrl(a.photo_path)) || '/assets/img/apple-touch-icon.png'}" alt=""></td>
      <td><strong>${esc(a.full_name || '(bez vārda)')}</strong>${a.stage_name ? `<br><span class="muted small">“${esc(a.stage_name)}”</span>` : ''}</td>
      <td>${esc(troupeName(a.troupe_id))}</td>
      <td><span class="status-badge status-badge--${a.status}">${STATUS[a.status]}</span>${a.show_on_site ? '' : '<br><span class="muted small">nerāda lapā</span>'}</td>
      <td class="small">${a.skills.map(esc).join(', ')}</td>
      <td class="small">${a.user_id ? esc(state.emails[a.user_id] || '') : '<span class="muted">nav konta</span>'}${a.phone ? `<br>${esc(a.phone)}` : ''}</td>
      <td>${a.min_fee_eur != null ? `${a.min_fee_eur} €` : '<span class="muted">—</span>'}</td>
      <td class="actions"><button class="btn btn--ghost btn--sm" data-edit="${a.id}">Rediģēt</button>${a.user_id ? '' : `<button class="btn btn--ghost btn--sm" data-invite-actor="${a.id}">Uzaicināt</button>`}</td>
    </tr>`).join('');

  view.innerHTML = `
    <div class="app__intro">
      <p class="eyebrow eyebrow--yellow">Admins</p>
      <h1 class="h2">Aktieri un trupas</h1>
      ${pending ? `<p class="notice">${pending} ${pending === 1 ? 'profils gaida' : 'profili gaida'} apstiprinājumu.</p>` : ''}
    </div>

    <section class="panel">
      <div class="filters">
        <label class="field"><span>Statuss</span><select data-f="status"><option value="">Visi</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${state.filters.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Prasme</span><select data-f="skill"><option value="">Visas</option>${options(SKILLS, state.filters.skill)}</select></label>
        <label class="field"><span>Pasākums</span><select data-f="format"><option value="">Visi</option>${options(FORMATS, state.filters.format)}</select></label>
        <label class="field"><span>Trupa</span><select data-f="troupe"><option value="">Visas</option>${state.troupes.map((t) => `<option value="${t.id}" ${state.filters.troupe === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Brīvs datumā</span><input type="date" data-f="date" value="${state.filters.date}"></label>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th></th><th>Aktieris</th><th>Trupa</th><th>Statuss</th><th>Prasmes</th><th>Kontakti</th><th>Min. honorārs</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" class="muted">Neviens neatbilst filtram.</td></tr>'}</tbody>
        </table>
      </div>
      <button class="btn btn--ghost" type="button" id="new-actor">+ Jauns aktiera profils</button>
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
  mountCalendar($('#edit-cal'), a.id);
  modal.showModal();
}

view.addEventListener('change', async (e) => {
  const f = e.target.closest('[data-f]');
  if (!f) return;
  state.filters[f.dataset.f] = f.value;
  if (f.dataset.f === 'date') await loadBusy(f.value);
  draw();
});

view.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return openEditor(edit.dataset.edit);

  const inviteActor = e.target.closest('[data-invite-actor]');
  if (inviteActor) {
    const email = prompt('Aktiera e-pasts:');
    if (!email) return;
    const a = state.actors.find((x) => x.id === inviteActor.dataset.inviteActor);
    const { error } = await sb.from('invites').upsert({ email: email.trim().toLowerCase(), role: 'actor', actor_id: a.id, troupe_id: a.troupe_id });
    if (error) return toast(error.message, 'error');
    toast(`Ielūgums gatavs. Pasakiet ${a.full_name}, lai ienāk impromotion.lv/aktieriem/ ar ${email}.`);
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
  e.preventDefault();
  const fd = new FormData(e.target);
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
  if (!profile) { $('#app-nav').hidden = true; mountLogin(view, { redirectPath: '/admin/' }); return; }
  $('#app-nav').hidden = false;
  if (profile.role !== 'admin') { view.innerHTML = '<div class="panel"><h1 class="h2">Nav piekļuves</h1><p>Šī lapa ir tikai adminam. <a href="/aktieriem/">Uz savu profilu</a></p></div>'; return; }
  shown = true;
  if (await loadAll()) draw();
}

$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); shown = false; show(); });
sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' && !shown) show(); });
show();
