// Client inquiries (CRM) on the admin page: pipeline totals, each event with the actors who could do it,
// a rough revenue estimate, status, agreed price and notes, plus a ready casting-call text.
// Assigning an actor books them for the event date; the status then confirms, closes or cancels those bookings (DB trigger).
import { sb, esc, toast, isFem } from './sb.js';

export const CRM_STATUS = { 'jauns': 'Jauns', 'sazināts': 'Sazināts', 'piedāvājums': 'Piedāvājums nosūtīts', 'apstiprināts': 'Apstiprināts', 'notika': 'Notika', 'atteikts': 'Atteikts' };
const OPEN = ['jauns', 'sazināts', 'piedāvājums', 'apstiprināts'];
const MONTHS = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];
const WHERE = { 'Korporatīvais pasākums': 'korporatīvajā pasākumā', 'Kāzas': 'kāzās', 'Dzimšanas diena': 'dzimšanas dienas svinībās', 'Improvizācijas izrāde': 'izrādē', 'Apmācības': 'apmācībās', 'Ziemassvētku ballīte': 'Ziemassvētku ballītē', 'Bērnu ballīte': 'bērnu ballītē' };
const WANT_WHO = { 'pasākuma vadītājs': 'pasākuma vadītāju', 'animatori': 'animatorus', 'slēptās lomas': 'aktierus slēptajām lomām',
  'improvizācijas izrāde': 'improvizatorus izrādei', 'komandas treniņš': 'komandas treniņa vadītāju', 'spēles un viktorīnas': 'spēļu un viktorīnu vadītāju',
  'stand-up': 'stand-up komiķi', 'tostmeistars': 'tostmeistaru', 'mūzika un dziesmas': 'mūziķus vai dziedātājus', 'dejas': 'dejotājus' };

export async function loadCrm() {
  const { data, error } = await sb.from('inquiries').select('*').order('created_at', { ascending: false });
  if (error) { toast(`Pieprasījumi neielādējās: ${error.message}`, 'error'); return { inquiries: [], candidates: {}, cast: {}, clicks: [] }; }
  const open = data.filter((i) => OPEN.includes(i.status));
  const [lists, booked, clicks] = await Promise.all([
    Promise.all(open.map((i) => sb.rpc('inquiry_candidates', { p_id: i.id }))),
    sb.from('contact_clicks').select('kind, created_at').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    sb.from('bookings').select('id, inquiry_id, actor_id, status, actor_fee_eur, actors(full_name)').not('inquiry_id', 'is', null).neq('status', 'cancelled'),
  ]);
  const cast = {};
  for (const b of booked.data || []) (cast[b.inquiry_id] ||= []).push(b);
  return { inquiries: data, candidates: Object.fromEntries(open.map((i, n) => [i.id, lists[n].data || []])), cast, clicks: clicks.data || [] };
}

const peopleCount = (p) => ({ '': 1, '4–6': 5, '7+': 7 })[p ?? ''] ?? (Number(p) || 1);

// Rough money: the n cheapest free candidates as cost, the client's budget (or cost + markup) as price.
export function estimate(i, cands, markupPct, cast = []) {
  const castFees = cast.map((b) => b.actor_fee_eur);
  if (castFees.length && castFees.every((f) => f != null)) cands = cast.map((b) => ({ available: true, fee_eur: b.actor_fee_eur }));
  const fees = cands.filter((c) => c.available !== false && c.fee_eur != null).map((c) => c.fee_eur).sort((a, b) => a - b);
  const n = peopleCount(i.people);
  const cost = i.cost_eur ?? (fees.length >= n ? fees.slice(0, n).reduce((s, f) => s + f, 0) : null);
  const price = i.price_eur ?? i.budget_eur ?? (cost != null ? Math.ceil(cost * (100 + markupPct) / 100) : null);
  return { cost, price, margin: price != null && cost != null ? price - cost : null, agreed: i.price_eur != null };
}

const day = (d) => (d ? `${Number(d.slice(8, 10))}. ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');
export function castingText(i) {
  const who = i.wants.map((w) => WANT_WHO[w]).filter(Boolean);
  const tag = `call-${(i.event_date || '').replace(/-/g, '').slice(4) || 'jauns'}`;
  return `Apmaksāts darbs${i.event_date ? ` ${day(i.event_date)}` : ''}: meklējam ${who.length ? who.join(' un ') : 'improvizācijas aktierus'}`
    + `${WHERE[i.event_type] ? ` ${WHERE[i.event_type]}` : ''}${i.guests ? `, viesu būs ap ${i.guests}` : ''}.`
    + ` Ja Tevi tas interesē, izveido profilu impromotion.lv/pievienojies/?no=${tag}`;
}

const BOOKED = { tentative: 'provizoriski', confirmed: '✓ droši', done: 'notika' };
const eur = (v) => (v == null ? '?' : `${v.toLocaleString('lv-LV')} €`);
const dmy = (d) => d.split('-').reverse().join('.');
// The next step for each column, as a one-click button on the card.
const NEXT = { 'jauns': ['sazināts', '✓ Sazinājos'], 'sazināts': ['piedāvājums', 'Piedāvājums nosūtīts'], 'piedāvājums': ['apstiprināts', 'Apstiprināt'], 'apstiprināts': ['notika', 'Notika'] };
// Moves that e-mail the lineup or cancel bookings ask first (the DB trigger acts on the status).
const CONFIRM = { 'apstiprināts': 'Apstiprināt? Sastāvam aizies e-pasts ar pasākuma datiem.', 'notika': 'Atzīmēt, ka pasākums notika? Jaunie talanti no sastāva pāries pie pārbaudītajiem.', 'atteikts': 'Atzīmēt kā atteiktu? Sastāva rezervācijas tiks atceltas.' };
let markupPct = 30;
let openId = null;  // the inquiry shown in the window, kept open across reloads

const daysSince = (t) => Math.floor((Date.now() - new Date(t).getTime()) / 86400000);

export function crmPanel({ inquiries, candidates, cast = {}, clicks = [] }, markup) {
  markupPct = markup;
  const open = inquiries.filter((i) => OPEN.includes(i.status));
  const sums = open.reduce((s, i) => { const e = estimate(i, candidates[i.id] || [], markupPct, cast[i.id]); s.price += e.price || 0; s.margin += e.margin || 0; return s; }, { price: 0, margin: 0 });
  const card = (i) => {
    const e = estimate(i, candidates[i.id] || [], markupPct, cast[i.id]);
    const waiting = i.status === 'jauns' && daysSince(i.created_at) >= 1;
    const lineup = (cast[i.id] || []).length;
    const next = NEXT[i.status];
    return `<article class="kcard${waiting ? ' kcard--late' : ''}" draggable="true" data-inq="${i.id}" tabindex="0">
      <strong>${esc(i.event_date ? dmy(i.event_date) : i.date_text || 'bez datuma')} · ${esc(i.event_type || 'Pasākums')}</strong>
      <span>${esc(i.name || 'bez vārda')}${i.guests ? ` · ${i.guests} viesi` : ''}</span>
      <span class="kcard__chips">${waiting ? `<em class="kcard__late">⏰ gaida ${daysSince(i.created_at)} d.</em>` : ''}${e.price != null ? `<em>~${eur(e.price)}</em>` : ''}${lineup ? `<em>🎭 ${lineup}</em>` : ''}${i.source ? `<em>🔗 ${esc(i.source)}</em>` : ''}${i.draft_at && i.status === 'jauns' ? '<em>✉️ melnraksts</em>' : ''}</span>
      <span class="kcard__actions">${next ? `<button class="btn btn--ghost btn--sm" type="button" data-move="${i.id}" data-to="${next[0]}">${next[1]}</button>` : ''}<button class="link-btn" type="button" data-del-inq="${i.id}">dzēst</button></span>
    </article>`;
  };
  const cols = Object.entries(CRM_STATUS).map(([k, label]) => {
    const items = inquiries.filter((i) => i.status === k);
    return `<div class="kcol${OPEN.includes(k) ? '' : ' kcol--closed'}" data-col="${k}"><h3 class="kcol__title">${label} <span>${items.length}</span></h3><div class="kcol__list">${items.map(card).join('') || '<p class="muted small">Tukšs</p>'}</div></div>`;
  }).join('');
  return `<section class="panel">
      <h2 class="panel__title">Pasākumu pieprasījumi</h2>
      <p class="small">Atvērti: <strong>${open.length}</strong> · iespējamie ieņēmumi <strong>${eur(sums.price)}</strong> · aptuvenā peļņa <strong>${eur(sums.margin)}</strong>
        <span class="muted">· velc kartīti uz citu kolonnu vai spied pogu tajā; klikšķis atver detaļas</span></p>
      <p class="small">Klikšķi uz kontaktiem: ${[['whatsapp', '💬 WhatsApp'], ['call', '📞 zvani'], ['email', '✉️ e-pasts']].map(([k, l]) => {
        const all = clicks.filter((c) => c.kind === k);
        const week = all.filter((c) => daysSince(c.created_at) < 7).length;
        return `${l} <strong>${week}</strong> <span class="muted">(30 d.: ${all.length})</span>`;
      }).join(' · ')} <span class="muted">· pēdējās 7 dienās</span></p>
      <div class="kanban">${cols}</div>
    </section>`;
}

// Everything about one inquiry, shown in the admin window.
function detail(i, cands, lineup) {
  const isOpen = OPEN.includes(i.status);
  const e = estimate(i, cands, markupPct, lineup);
  const bookingOf = (actorId) => lineup.find((b) => b.actor_id === actorId);
  const free = (c) => (c.available === false ? `<span class="crm-no">✗ ${isFem(c.name) ? 'aizņemta' : 'aizņemts'}</span>` : c.available ? `<span class="crm-yes">✓ ${isFem(c.name) ? 'brīva' : 'brīvs'}</span>` : '<span class="muted">datums nav zināms</span>');
  return `<p class="eyebrow eyebrow--yellow">${esc(CRM_STATUS[i.status])}</p>
    <h2 class="h2">${esc(i.event_date ? dmy(i.event_date) : i.date_text || 'bez datuma')} · ${esc(i.event_type || 'Pasākums')}</h2>
    <p><strong>${esc(i.name || 'bez vārda')}</strong>${i.email ? ` · <a href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : ''}${i.phone ? ` · <a href="tel:${esc(i.phone)}">${esc(i.phone)}</a>` : ''} <span class="muted small">· ienāca ${esc(new Date(i.created_at).toLocaleDateString('lv-LV'))}</span></p>
    <div class="app-card__meta">
      ${i.guests ? `<span>👥 ${i.guests} viesi</span>` : ''}${i.people ? `<span>${esc(i.people)} izpild.</span>` : ''}${i.budget_label ? `<span>💶 ${esc(i.budget_label)}</span>` : ''}${i.level ? `<span>līmenis: ${esc(i.level)}</span>` : ''}
      ${i.wants.map((w) => `<span>${esc(w)}</span>`).join('')}${i.source ? `<span>🔗 ${esc(i.source)}</span>` : ''}${i.draft_at ? '<span>✉️ atbilde Gmail melnrakstos</span>' : ''}
    </div>
    ${i.shortlist ? `<p class="small">Klients izvēlējās: ${esc(i.shortlist)}</p>` : ''}
    ${i.message ? `<p class="crm-msg">${esc(i.message)}</p>` : ''}

    <h3 class="crm-h">Sastāvs</h3>
    ${lineup.length ? `<table class="crm-table"><tbody>${lineup.map((b) => `<tr><td><strong>${esc(b.actors?.full_name || '?')}</strong></td><td>${BOOKED[b.status] || b.status}</td><td>${b.actor_fee_eur != null ? `${b.actor_fee_eur} €` : ''}</td><td>${isOpen ? `<button class="btn btn--ghost btn--sm" data-assign="${i.id}" data-booking="${b.id}">Noņemt</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Vēl neviens nav pievienots.</p>'}

    ${isOpen ? `<h3 class="crm-h">Kas var derēt</h3>
    ${!i.event_date ? '<p class="notice">Ieraksti pasākuma datumu un saglabā, tad varēsi pievienot aktierus.</p>' : ''}
    ${cands.length ? `<table class="crm-table"><thead><tr><th>Aktieris</th><th>Datumā</th><th>Honorārs</th><th>Līmenis</th><th></th></tr></thead><tbody>${cands.filter((c) => !bookingOf(c.actor_id)).map((c) => `<tr>
      <td><strong>${esc(c.name)}</strong>${c.vetted ? '' : ` <span class="muted small">${isFem(c.name) ? 'jauna' : 'jauns'}</span>`}</td><td>${free(c)}</td><td>${c.fee_eur != null ? `no ${c.fee_eur} €` : '<span class="muted">?</span>'}</td><td>${esc(c.level || '')}</td>
      <td>${i.event_date ? `<button class="btn btn--yellow btn--sm" data-assign="${i.id}" data-actor="${c.actor_id}" data-fee="${c.fee_eur ?? ''}">Pievienot</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Neviens no sarakstā esošajiem neatbilst.</p>'}
    <p class="small"><strong>${e.agreed ? 'Norunāts' : 'Aptuveni'}:</strong> klientam ${eur(e.price)}, aktieriem ${eur(e.cost)}, peļņa ${eur(e.margin)}</p>` : ''}

    <form class="crm-form" data-inquiry="${i.id}">
      <label class="field"><span>Statuss</span><select name="status">${Object.entries(CRM_STATUS).map(([k, v]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Datums</span><input type="date" name="event_date" value="${i.event_date || ''}"></label>
      <label class="field"><span>Cena klientam €</span><input type="number" name="price_eur" min="0" step="10" value="${i.price_eur ?? ''}"></label>
      <label class="field"><span>Aktieriem €</span><input type="number" name="cost_eur" min="0" step="10" value="${i.cost_eur ?? ''}"></label>
      <label class="field crm-form__wide"><span>Piezīmes</span><textarea name="notes" rows="2" maxlength="4000">${esc(i.notes || '')}</textarea></label>
      <div class="row-actions" style="justify-content:flex-start">
        <button class="btn btn--yellow btn--sm" type="submit">Saglabāt</button>
        ${isOpen ? `<button class="btn btn--ghost btn--sm" type="button" data-casting="${i.id}">Kastinga teksts</button>` : ''}
        <button class="link-btn" type="button" data-del-inq="${i.id}">Dzēst pieprasījumu</button>
      </div>
    </form>`;
}

// Wires the board and the window; `reload` refetches and redraws the admin page.
export function bindCrm(view, getCrm, reload, { modal, body }) {
  const show = (id) => {
    const crm = getCrm();
    const i = crm.inquiries.find((x) => x.id === id);
    if (!i) { openId = null; return; }
    openId = id;
    body.innerHTML = detail(i, crm.candidates[id] || [], crm.cast?.[id] || []);
    if (!modal.open) modal.showModal();
  };
  modal.addEventListener('close', () => { openId = null; });
  const refresh = async () => { await reload(); if (openId && modal.open) show(openId); };

  const move = async (id, to) => {
    const crm = getCrm();
    const i = crm.inquiries.find((x) => x.id === id);
    if (!i || i.status === to) return;
    if ((crm.cast?.[id] || []).length && CONFIRM[to] && !confirm(CONFIRM[to])) return;
    const { error } = await sb.from('inquiries').update({ status: to }).eq('id', id);
    if (error) return toast(error.message, 'error');
    toast(`Pārvietots: ${CRM_STATUS[to]}.`);
    refresh();
  };

  // Deletes the inquiry and its lineup bookings (the FK only nulls them, which would leave orphan gigs in actors' calendars).
  const remove = async (id) => {
    const crm = getCrm();
    const i = crm.inquiries.find((x) => x.id === id);
    if (!i) return;
    const n = (crm.cast?.[id] || []).length;
    const what = `${i.event_date ? dmy(i.event_date) : i.date_text || 'bez datuma'} · ${i.event_type || 'Pasākums'} · ${i.name || 'bez vārda'}`;
    if (!confirm(`Dzēst pieprasījumu neatgriezeniski?\n\n${what}${n ? `\n\nKopā ar to pazudīs ${n} ${n === 1 ? 'sastāva rezervācija' : 'sastāva rezervācijas'}, un aktieri šo pasākumu savā profilā vairs neredzēs.` : ''}`)) return;
    const gone = await sb.from('bookings').delete().eq('inquiry_id', id);
    if (gone.error) return toast(gone.error.message, 'error');
    const { data, error } = await sb.from('inquiries').delete().eq('id', id).select('id');
    if (error || !data?.length) return toast(error?.message || 'Pieprasījums netika izdzēsts.', 'error');
    if (modal.open) modal.close();
    toast('Pieprasījums izdzēsts.');
    reload();
  };

  view.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-inq]');
    if (del) { e.stopPropagation(); return remove(del.dataset.delInq); }
    const btn = e.target.closest('[data-move]');
    if (btn) { e.stopPropagation(); return move(btn.dataset.move, btn.dataset.to); }
    const c = e.target.closest('.kcard');
    if (c) show(c.dataset.inq);
  });
  view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.kcard')) show(e.target.dataset.inq); });
  view.addEventListener('dragstart', (e) => { const c = e.target.closest('.kcard'); if (c) e.dataTransfer.setData('text/plain', c.dataset.inq); });
  view.addEventListener('dragover', (e) => { const col = e.target.closest('.kcol'); if (col) { e.preventDefault(); col.classList.add('is-over'); } });
  view.addEventListener('dragleave', (e) => { e.target.closest('.kcol')?.classList.remove('is-over'); });
  view.addEventListener('drop', (e) => {
    const col = e.target.closest('.kcol');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('is-over');
    move(e.dataTransfer.getData('text/plain'), col.dataset.col);
  });

  body.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-inq]');
    if (del) return remove(del.dataset.delInq);
    const add = e.target.closest('[data-assign]');
    if (add) {
      add.disabled = true;
      const i = getCrm().inquiries.find((x) => x.id === add.dataset.assign);
      const { error } = add.dataset.booking
        ? await sb.from('bookings').update({ status: 'cancelled' }).eq('id', add.dataset.booking)
        : await sb.from('bookings').insert({ actor_id: add.dataset.actor, day: i.event_date, inquiry_id: i.id, status: 'tentative',
            title: i.event_type || 'Pasākums', client: i.name || null, actor_fee_eur: add.dataset.fee ? Number(add.dataset.fee) : null });
      if (error) { add.disabled = false; return toast(error.message, 'error'); }
      toast(add.dataset.booking ? 'Aktieris noņemts no pasākuma.' : i.status === 'apstiprināts' ? 'Pievienots un apstiprināts, aktierim aizies e-pasts.' : 'Pievienots provizoriski. Kad statusu nomainīsi uz “Apstiprināts”, aktieriem aizies e-pasts.');
      return refresh();
    }
    const btn = e.target.closest('[data-casting]');
    if (!btn) return;
    const text = castingText(getCrm().inquiries.find((x) => x.id === btn.dataset.casting));
    try { await navigator.clipboard.writeText(text); toast('Kastinga teksts nokopēts. Ieliec to Facebook grupās vai aktieru čatā.'); }
    catch { prompt('Nokopē kastinga tekstu:', text); }
  });
  body.addEventListener('submit', async (e) => {
    const form = e.target.closest('.crm-form');
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    const num = (k) => (fd.get(k) ? Number(fd.get(k)) : null);
    const id = form.dataset.inquiry;
    const was = getCrm().inquiries.find((x) => x.id === id)?.status;
    const now = fd.get('status');
    if (now !== was && (getCrm().cast?.[id] || []).length && CONFIRM[now] && !confirm(CONFIRM[now])) return;
    const { error } = await sb.from('inquiries').update({ status: now, event_date: fd.get('event_date') || null, price_eur: num('price_eur'), cost_eur: num('cost_eur'), notes: fd.get('notes').trim() || null }).eq('id', id);
    if (error) return toast(error.message, 'error');
    toast('Pieprasījums saglabāts.');
    modal.close();
    reload();
  });
}
