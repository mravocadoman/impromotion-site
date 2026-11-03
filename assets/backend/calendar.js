// Busy-days calendar: click a day to mark it busy, click again to free it.
import { sb, esc, toast } from './sb.js';

const MONTHS = ['Janvāris', 'Februāris', 'Marts', 'Aprīlis', 'Maijs', 'Jūnijs', 'Jūlijs', 'Augusts', 'Septembris', 'Oktobris', 'Novembris', 'Decembris'];
const DAYS = ['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function mountCalendar(root, actorId, { readOnly = false, booked = [], fem = false } = {}) {
  const bookedDays = new Set(booked);
  let cursor = new Date();
  cursor.setDate(1);
  const busy = new Set();

  const load = async () => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const { data, error } = await sb.from('busy_dates').select('day').eq('actor_id', actorId).gte('day', iso(from)).lte('day', iso(to));
    if (error) { toast(`Kalendārs neielādējās: ${error.message}`, 'error'); return; }
    busy.clear();
    data.forEach((r) => busy.add(r.day));
    draw();
  };

  const draw = () => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const days = new Date(y, m + 1, 0).getDate();
    const today = iso(new Date());
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const key = iso(new Date(y, m, d));
      const past = key < today;
      const isBooked = bookedDays.has(key);
      cells += `<button type="button" class="cal__day ${busy.has(key) ? 'is-busy' : ''} ${isBooked ? 'is-booked' : ''} ${past ? 'is-past' : ''}" data-day="${key}" ${past || readOnly || isBooked ? 'disabled' : ''} ${isBooked ? 'title="Haltūra"' : ''}>${d}</button>`;
    }
    root.innerHTML = `
      <div class="cal">
        <div class="cal__head">
          <button type="button" class="btn btn--ghost btn--sm" data-nav="-1" aria-label="Iepriekšējais mēnesis">←</button>
          <strong>${esc(MONTHS[m])} ${y}</strong>
          <button type="button" class="btn btn--ghost btn--sm" data-nav="1" aria-label="Nākamais mēnesis">→</button>
        </div>
        <div class="cal__grid">${DAYS.map((d) => `<span class="cal__dow">${d}</span>`).join('')}${cells}</div>
        <p class="muted small">${readOnly ? (fem ? 'Rozā dienās aktrise ir aizņemta.' : 'Rozā dienās aktieris ir aizņemts.') : `Atzīmē dienas, kad esi ${fem ? 'aizņemta' : 'aizņemts'}. Rozā: aizņemta diena. Dzeltens: Impromotion haltūra.`}</p>
      </div>`;
  };

  root.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { cursor.setMonth(cursor.getMonth() + Number(nav.dataset.nav)); load(); return; }
    const btn = e.target.closest('[data-day]');
    if (!btn || btn.disabled || btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const day = btn.dataset.day;
    const wasBusy = busy.has(day);
    const { error } = wasBusy
      ? await sb.from('busy_dates').delete().eq('actor_id', actorId).eq('day', day)
      : await sb.from('busy_dates').insert({ actor_id: actorId, day });
    delete btn.dataset.busy;
    if (error) { toast(`Neizdevās saglabāt: ${error.message}`, 'error'); return; }
    wasBusy ? busy.delete(day) : busy.add(day);
    btn.classList.toggle('is-busy', !wasBusy);
  });

  load();
}
