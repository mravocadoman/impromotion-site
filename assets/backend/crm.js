// Client inquiries (CRM) on the admin page: pipeline totals, each event with the actors who could do it,
// a rough revenue estimate, status, agreed price and notes, plus a ready casting-call text.
// Assigning an actor books them for the event date; the status then confirms, closes or cancels those bookings (DB trigger).
import { sb, esc, toast } from './sb.js';

export const CRM_STATUS = { 'jauns': 'Jauns', 'sazināts': 'Sazināts', 'piedāvājums': 'Piedāvājums nosūtīts', 'apstiprināts': 'Apstiprināts', 'notika': 'Notika', 'atteikts': 'Atteikts' };
const OPEN = ['jauns', 'sazināts', 'piedāvājums', 'apstiprināts'];
const MONTHS = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];
const WHERE = { 'Korporatīvais pasākums': 'korporatīvajā pasākumā', 'Kāzas': 'kāzās', 'Dzimšanas diena': 'dzimšanas dienas svinībās', 'Improvizācijas izrāde': 'izrādē', 'Apmācības': 'apmācībās', 'Ziemassvētku ballīte': 'Ziemassvētku ballītē', 'Bērnu ballīte': 'bērnu ballītē' };
const WANT_WHO = { 'pasākuma vadītājs': 'pasākuma vadītāju', 'animatori': 'animatorus', 'slēptās lomas': 'aktierus slēptajām lomām',
  'improvizācijas izrāde': 'improvizatorus izrādei', 'komandas treniņš': 'komandas treniņa vadītāju', 'spēles un viktorīnas': 'spēļu un viktorīnu vadītāju',
  'stand-up': 'stand-up komiķi', 'tostmeistars': 'tostmeistaru', 'mūzika un dziesmas': 'mūziķus vai dziedātājus', 'dejas': 'dejotājus' };

export async function loadCrm() {
  const { data, error } = await sb.from('inquiries').select('*').order('created_at', { ascending: false });
  if (error) { toast(`Pieprasījumi neielādējās: ${error.message}`, 'error'); return { inquiries: [], candidates: {}, cast: {} }; }
  const open = data.filter((i) => OPEN.includes(i.status));
  const [lists, booked] = await Promise.all([
    Promise.all(open.map((i) => sb.rpc('inquiry_candidates', { p_id: i.id }))),
    sb.from('bookings').select('id, inquiry_id, actor_id, status, actor_fee_eur, actors(full_name)').not('inquiry_id', 'is', null).neq('status', 'cancelled'),
  ]);
  const cast = {};
  for (const b of booked.data || []) (cast[b.inquiry_id] ||= []).push(b);
  return { inquiries: data, candidates: Object.fromEntries(open.map((i, n) => [i.id, lists[n].data || []])), cast };
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

export function crmPanel({ inquiries, candidates, cast = {} }, markupPct) {
  const open = inquiries.filter((i) => OPEN.includes(i.status));
  const sums = open.reduce((s, i) => { const e = estimate(i, candidates[i.id] || [], markupPct, cast[i.id]); s.price += e.price || 0; s.margin += e.margin || 0; return s; }, { price: 0, margin: 0 });
  const card = (i) => {
    const cands = candidates[i.id] || [];
    const lineup = cast[i.id] || [];
    const e = estimate(i, cands, markupPct, lineup);
    const isOpen = OPEN.includes(i.status);
    const bookingOf = (actorId) => lineup.find((b) => b.actor_id === actorId);
    return `<article class="app-card">
      <div class="app-card__head">
        <strong>${esc(i.event_date ? i.event_date.split('-').reverse().join('.') : i.date_text || 'bez datuma')} · ${esc(i.event_type || 'Pasākums')}</strong>
        <span class="muted small">${esc(i.name || '')}${i.email ? ` · ${esc(i.email)}` : ''}${i.phone ? ` · ${esc(i.phone)}` : ''} · ienāca ${esc(new Date(i.created_at).toLocaleDateString('lv-LV'))}</span>
      </div>
      <div class="app-card__meta">
        ${i.guests ? `<span>👥 ${i.guests} viesi</span>` : ''}
        ${i.people ? `<span>${esc(i.people)} izpild.</span>` : ''}
        ${i.budget_label ? `<span>💶 ${esc(i.budget_label)}</span>` : ''}
        ${i.level ? `<span>līmenis: ${esc(i.level)}</span>` : ''}
        ${i.wants.map((w) => `<span>${esc(w)}</span>`).join('')}
        ${i.source ? `<span>🔗 ${esc(i.source)}</span>` : ''}
        ${i.draft_at ? '<span>✉️ atbilde Gmail melnrakstos</span>' : ''}
      </div>
      ${i.shortlist ? `<p class="small">Klients izvēlējās: ${esc(i.shortlist)}</p>` : ''}
      ${i.message ? `<details class="small"><summary>${esc(i.message.slice(0, 140))}${i.message.length > 140 ? '…' : ''}</summary><p>${esc(i.message)}</p></details>` : ''}
      ${lineup.length ? `<p class="small"><strong>Sastāvs:</strong> ${lineup.map((b) => `${esc(b.actors?.full_name || '?')} <span class="muted">(${BOOKED[b.status] || b.status})</span>`).join(' · ')}</p>` : ''}
      ${isOpen ? `<p class="small"><strong>Var derēt:</strong> ${cands.length ? cands.map((c) => {
        const b = bookingOf(c.actor_id);
        const btn = i.event_date ? `<button class="btn btn--ghost btn--sm" type="button" data-assign="${i.id}" data-actor="${c.actor_id}" data-fee="${c.fee_eur ?? ''}" data-booking="${b?.id || ''}">${b ? 'Noņemt' : 'Pievienot'}</button>` : '';
        return `${esc(c.name)} <span class="muted">${c.available === false ? '✗ aizņemts' : c.available ? '✓ brīvs' : ''}${c.fee_eur != null ? ` · no ${c.fee_eur} €` : ''}${c.vetted ? '' : ' · jauns'}</span> ${btn}`;
      }).join(' · ') : '<span class="muted">neviens no sarakstā esošajiem</span>'}</p>
      ${i.event_date ? '' : '<p class="small muted">Lai pievienotu aktierus, ieraksti pasākuma datumu un saglabā.</p>'}
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
        </div>
      </form>
    </article>`;
  };
  return `<section class="panel">
      <h2 class="panel__title">Pasākumu pieprasījumi${open.filter((i) => i.status === 'jauns').length ? ` <span class="notice">${open.filter((i) => i.status === 'jauns').length} jauni</span>` : ''}</h2>
      <p class="small">Atvērti: <strong>${open.length}</strong> · iespējamie ieņēmumi <strong>${eur(sums.price)}</strong> · aptuvenā peļņa <strong>${eur(sums.margin)}</strong>
        <span class="muted">(pēc budžeta vai lētākajiem brīvajiem aktieriem + ${markupPct} %)</span></p>
      <div class="app-list">${inquiries.map(card).join('') || '<p class="muted">Pieprasījumu vēl nav.</p>'}</div>
    </section>`;
}

// Wires the panel's buttons and forms; `reload` redraws the admin page after a save.
export function bindCrm(view, getCrm, reload) {
  view.addEventListener('click', async (e) => {
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
      return reload();
    }
    const btn = e.target.closest('[data-casting]');
    if (!btn) return;
    const i = getCrm().inquiries.find((x) => x.id === btn.dataset.casting);
    const text = castingText(i);
    try { await navigator.clipboard.writeText(text); toast('Kastinga teksts nokopēts. Ieliec to Facebook grupās vai aktieru čatā.'); }
    catch { prompt('Nokopējiet kastinga tekstu:', text); }
  });
  view.addEventListener('submit', async (e) => {
    const form = e.target.closest('.crm-form');
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    const num = (k) => (fd.get(k) ? Number(fd.get(k)) : null);
    const { error } = await sb.from('inquiries').update({ status: fd.get('status'), event_date: fd.get('event_date') || null, price_eur: num('price_eur'), cost_eur: num('cost_eur'), notes: fd.get('notes').trim() || null }).eq('id', form.dataset.inquiry);
    if (error) return toast(error.message, 'error');
    const was = getCrm().inquiries.find((x) => x.id === form.dataset.inquiry)?.status;
    const now = fd.get('status');
    const hasCast = (getCrm().cast?.[form.dataset.inquiry] || []).length > 0;
    toast(!hasCast ? 'Pieprasījums saglabāts.' : now !== was && now === 'apstiprināts' ? 'Apstiprināts. Sastāvam aizies e-pasts ar pasākuma datiem.'
      : now !== was && now === 'notika' ? 'Pasākums atzīmēts kā noticis. Jaunie talanti no sastāva tagad ir pārbaudīto sarakstā.'
      : now !== was && now === 'atteikts' ? 'Atteikts. Sastāva rezervācijas atceltas.' : 'Pieprasījums saglabāts.');
    reload();
  });
}
