// The actor profile form, shared by the actor portal (own profile) and the admin page (any profile).
import { sb, SKILLS, FORMATS, LANGUAGES, REGIONS, SOCIALS, STATUS, photoUrl, isHttps, esc, toast, shrinkImage } from './sb.js';

const chipGroup = (name, options, selected, allowCustom) => {
  const all = [...new Set([...options, ...selected])];
  return `
    <div class="chips" data-group="${name}">
      ${all.map((o) => `<label><input type="checkbox" name="${name}" value="${esc(o)}" ${selected.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}
      ${allowCustom ? `<span class="chips__add"><input type="text" placeholder="+ cits" maxlength="40" data-add="${name}"></span>` : ''}
    </div>`;
};

export function renderActorForm(root, actor, { admin = false, troupes = [], adminNotes = '', onSaved } = {}) {
  const a = { skills: [], formats: [], languages: [], regions: [], socials: {}, ...actor };
  const draft = !admin && a.status === 'draft';
  // Tell the actor in plain words whether clients can see the profile, since "Saglabāt" alone never publishes it.
  const missing = [[a.photo_path, 'foto'], [a.short_bio, 'īss apraksts kartītei'], [a.min_fee_eur, 'minimālais honorārs'], [a.skills.length, 'ko protat']]
    .filter(([v]) => !v).map(([, label]) => label);
  const note = admin ? '' : draft
    ? `Jūsu profils vēl nav publicēts, tāpēc klienti to neredz. Kad viss gatavs, spiediet “Saglabāt un publicēt”.${missing.length ? `<br>Vēl trūkst: ${missing.join(', ')}.` : ''}`
    : !a.show_on_site && a.status !== 'hidden'
      ? 'Jūsu profils mājaslapā nav redzams, jo nav atzīmēts “Drīkst rādīt manu profilu un foto impromotion.lv mājaslapā”.'
      : a.status === 'pending'
        ? 'Jūsu profils ir publicēts sadaļā “Jaunie talanti”. Pēc pirmā kopīgā pasākuma to pārcelsim pie pārbaudītajiem profesionāļiem.'
        : '';
  root.innerHTML = `
    <form class="actor-form" novalidate>
      <div class="actor-form__top">
        <div class="photo-pick">
          <img class="photo-pick__img" src="${esc(photoUrl(a.photo_path)) || '/assets/img/apple-touch-icon.png'}" alt="">
          <label class="btn btn--ghost btn--sm">Mainīt foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-photo></label>
          <p class="muted small">Kvadrāta foto, seja centrā. Max 3 MB.</p>
        </div>
        <div class="actor-form__names">
          <label class="field"><span>Vārds, uzvārds</span><input name="full_name" value="${esc(a.full_name)}" maxlength="80" required></label>
          <label class="field"><span>Skatuves vārds</span><input name="stage_name" value="${esc(a.stage_name)}" maxlength="40" placeholder="Piemēram, Burkāns"></label>
          <p class="status-badge status-badge--${a.status}">${STATUS[a.status] || a.status}</p>
        </div>
      </div>
      ${note ? `<p class="publish-note">${note}</p>` : ''}

      <label class="field"><span>Īsi par sevi (redzams uz kartītes) <em class="count" data-count="short_bio"></em></span><textarea name="short_bio" rows="2" maxlength="200">${esc(a.short_bio)}</textarea></label>
      <label class="field"><span>Joks kartītei (parādās, kad uzbrauc ar peli; neobligāti)</span><input name="quip" value="${esc(a.quip)}" maxlength="60" placeholder="Piemēram: Domāja, ka tas ir teātra pulciņš."></label>
      <label class="field"><span>Vairāk par sevi <em class="count" data-count="bio"></em></span><textarea name="bio" rows="7" maxlength="2000">${esc(a.bio)}</textarea></label>

      <fieldset><legend>Ko jūs darāt</legend>${chipGroup('skills', SKILLS, a.skills, true)}</fieldset>
      <fieldset><legend>Kādus pasākumus vadāt</legend>${chipGroup('formats', FORMATS, a.formats, true)}</fieldset>
      <fieldset><legend>Valodas</legend>${chipGroup('languages', LANGUAGES, a.languages, true)}</fieldset>
      <fieldset><legend>Kur strādājat</legend>${chipGroup('regions', REGIONS, a.regions, false)}</fieldset>

      <fieldset><legend>Sociālie tīkli</legend>
        <div class="grid2">${SOCIALS.map((s) => `<label class="field"><span>${s}</span><input type="url" name="social_${s}" value="${esc(a.socials?.[s])}" placeholder="https://"></label>`).join('')}</div>
      </fieldset>

      <fieldset class="private"><legend>Redz tikai Impromotion</legend>
        <div class="grid2">
          <label class="field"><span>Tālrunis</span><input type="tel" name="phone" value="${esc(a.phone)}" maxlength="40"></label>
          <div class="field"><span>Minimālais honorārs, EUR</span>
            <div class="fee-row">
              <input type="number" name="min_fee_eur" value="${esc(a.min_fee_eur)}" min="0" step="5" placeholder="Piemēram, 50" aria-label="Minimālais honorārs, EUR">
              <select name="fee_unit" aria-label="Par ko"><option value="event" ${a.fee_unit !== 'hour' ? 'selected' : ''}>par pasākumu</option><option value="hour" ${a.fee_unit === 'hour' ? 'selected' : ''}>par stundu</option></select>
            </div>
          </div>
          <label class="field"><span>Cik gadus improvizējat?</span><input type="number" name="experience_years" value="${esc(a.experience_years)}" min="0" max="60"></label>
        </div>
      </fieldset>

      <fieldset><legend>Piekrišana</legend>
        <label class="check"><input type="checkbox" name="show_on_site" ${a.show_on_site ? 'checked' : ''}> Drīkst rādīt manu profilu un foto impromotion.lv mājaslapā</label>
        <label class="check"><input type="checkbox" name="allow_ads" ${a.allow_ads ? 'checked' : ''}> Drīkst izmantot manu foto maksas reklāmās</label>
      </fieldset>

      ${admin ? `
      <fieldset class="admin-only"><legend>Admins</legend>
        <div class="grid2">
          <label class="field"><span>Statuss</span><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Kolektīvs</span><select name="troupe_id"><option value="">—</option>${troupes.map((t) => `<option value="${t.id}" ${a.troupe_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Adrese (slug)</span><input name="slug" value="${esc(a.slug)}" pattern="[a-z0-9\-]+" maxlength="60"></label>
          <label class="field"><span>Līmenis (klientu filtram)</span><select name="level">${[['', '—'], ['jauns', 'Jauns talants'], ['pieredzējis', 'Pieredzējis'], ['top', 'Top profesionālis']].map(([k, v]) => `<option value="${k}" ${(a.level || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Secība (mazāks = augstāk)</span><input type="number" name="sort_order" value="${esc(a.sort_order ?? 100)}"></label>
        </div>
        <label class="field"><span>Piezīmes (aktieris neredz)</span><textarea name="admin_notes" rows="3">${esc(adminNotes)}</textarea></label>
      </fieldset>` : ''}

      <div class="actor-form__actions">
        ${draft
          ? '<button class="btn btn--yellow btn--lg" type="button" data-submit-review>Saglabāt un publicēt</button><button class="btn btn--ghost btn--lg" type="submit">Saglabāt melnrakstu</button>'
          : '<button class="btn btn--yellow btn--lg" type="submit">Saglabāt</button>'}
      </div>
    </form>`;

  const form = root.querySelector('form');
  let newPhotoPath = null;

  const updateCount = (n) => { const el = form.querySelector(`[data-count="${n}"]`); el.textContent = `${form[n].value.length}/${form[n].maxLength}`; };
  ['short_bio', 'bio'].forEach((n) => { updateCount(n); form[n].addEventListener('input', () => updateCount(n)); });

  form.querySelectorAll('[data-add]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" name="${input.dataset.add}" value="${esc(v)}" checked><span>${esc(v)}</span>`;
      input.parentElement.before(label);
      input.value = '';
    });
  });

  form.querySelector('[data-photo]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const blob = await shrinkImage(file);
    const { data: { user } } = await sb.auth.getUser();
    // Actors may only write into their own folder; the admin files unclaimed profiles under their id.
    const folder = admin ? (a.user_id || a.id) : user.id;
    const path = `${folder}/${Date.now()}.webp`;
    const { error } = await sb.storage.from('actor-photos').upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) { toast(`Foto neaugšupielādējās: ${error.message}`, 'error'); return; }
    newPhotoPath = path;
    form.querySelector('.photo-pick__img').src = photoUrl(path);
    toast('Foto augšupielādēts. Nospiediet "Saglabāt".');
  });

  const collect = () => {
    const fd = new FormData(form);
    const row = {
      full_name: fd.get('full_name').trim(),
      stage_name: fd.get('stage_name').trim() || null,
      short_bio: fd.get('short_bio').trim() || null,
      quip: fd.get('quip').trim() || null,
      bio: fd.get('bio').trim() || null,
      skills: fd.getAll('skills'),
      formats: fd.getAll('formats'),
      languages: fd.getAll('languages'),
      regions: fd.getAll('regions'),
      socials: Object.fromEntries(SOCIALS.map((s) => [s, fd.get(`social_${s}`).trim()]).filter(([, v]) => v)),
      phone: fd.get('phone').trim() || null,
      min_fee_eur: fd.get('min_fee_eur') ? Number(fd.get('min_fee_eur')) : null,
      fee_unit: fd.get('fee_unit') === 'hour' ? 'hour' : 'event',
      experience_years: fd.get('experience_years') ? Number(fd.get('experience_years')) : null,
      show_on_site: fd.has('show_on_site'),
      allow_ads: fd.has('allow_ads'),
    };
    if (newPhotoPath) row.photo_path = newPhotoPath;
    if (admin) {
      row.status = fd.get('status');
      row.troupe_id = fd.get('troupe_id') || null;
      row.slug = fd.get('slug').trim() || null;
      row.sort_order = Number(fd.get('sort_order') || 100);
      row.level = fd.get('level') || null;
    }
    return row;
  };

  const save = async (extra = {}) => {
    const row = { ...collect(), ...extra };
    if (!row.full_name) { toast('Ierakstiet vārdu un uzvārdu.', 'error'); return; }
    const badLink = Object.values(row.socials).find((u) => !isHttps(u));
    if (badLink) { toast('Sociālo tīklu saitēm jāsākas ar https://', 'error'); return; }
    if (admin) row.needs_review = false;
    const { error } = await sb.from('actors').update(row).eq('id', a.id);
    if (error) { toast(`Neizdevās saglabāt: ${error.message}`, 'error'); return; }
    if (admin) {
      const notes = new FormData(form).get('admin_notes') || '';
      const { error: noteErr } = await sb.from('actor_admin_notes').upsert({ actor_id: a.id, notes, updated_at: new Date().toISOString() });
      if (noteErr) { toast(`Piezīmes nesaglabājās: ${noteErr.message}`, 'error'); return; }
    }
    toast(draft && !extra.status ? 'Saglabāts kā melnraksts. Klienti to vēl neredz.' : 'Saglabāts.');
    onSaved?.();
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  // Publishing is the consent to show the profile: it goes live under "Jaunie talanti" until Impromotion checks it.
  form.querySelector('[data-submit-review]')?.addEventListener('click', () => save({ status: 'pending', show_on_site: true }));
}
